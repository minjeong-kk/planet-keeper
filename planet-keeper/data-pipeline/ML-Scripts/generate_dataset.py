"""ml_dataset.csv(실측)에 물리엔진(computeClimateV2)을 반복 실행해서
최종 학습 데이터셋(final_ml_dataset.csv)을 만든다.

실측 위치(SAL/TPW/CLA/SST/t2m/psl)마다 슬라이더 변수(빙하/바다/구름/대기두께/CO2)를
무작위로 여러 번 바꿔가며 물리엔진을 돌려서, "이 실측 위치의 실제 관측 온도가
이 가상의 행성 조건에서 에너지수지가 맞는 상태인지"를 평가한다.

물리엔진은 평형온도를 계산하지 않고, 주어진 현재 온도(currentTemperature =
그 행의 실측 t2m)에서의 ASR/OLR/deltaEnergy만 평가한다 - 그래서 deltaEnergy가
항상 0이 아니라 실제로 에너지 잉여/부족을 나타낼 수 있다.

물리 계산은 Python으로 재구현하지 않는다. src/utils/physicsEngine.js의
computeClimateV2()를 Node 브릿지(run_physics_engine.mjs)로 그대로 호출해서
쓴다 - 게임과 데이터 생성이 서로 다른 공식을 쓰게 되는 걸 막기 위함.

라벨(state)은 label_rules.py의 deltaEnergy/currentTemperature 기준 5클래스
규칙으로 함께 생성한다. 슬라이더를 넓은 범위에서 균일 샘플링하면 대부분
에너지 부족/잉여 쪽에 쏠리므로(평형 밴드가 좁아서), 실측 행당 시뮬레이션을
넉넉히 뽑은 뒤 클래스별로 최소 개수만큼 언더샘플링해서 최종 분포를 맞춘다
(중복 행 생성 없이 균등화).

사용법:
    python3 generate_dataset.py
"""

import json
import logging
import subprocess
import sys
from pathlib import Path

import numpy as np
import pandas as pd

import config
from label_rules import assign_labels

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# ml_dataset.csv에서 그대로 들고 갈 실측 컬럼 (위치별로 고정, 시뮬레이션마다 안 변함)
ML_INPUT_COLUMNS = ["SAL", "TPW", "CLA", "SST", "t2m", "psl"]

# 실측 행 하나당 만들 무작위 시뮬레이션 개수.
# ponytail: 균일 랜덤 샘플링이라 평형 밴드(클래스 1~3, 특히 클래스 1)에
# 자연스럽게 걸리는 비율이 낮다. 언더샘플링만으로 균형을 맞추려면 가장 희소한
# 클래스도 넉넉한 절대 개수가 나와야 하므로 10 -> 100으로 늘렸다. 그래도 특정
# 클래스가 너무 적으면 이 값을 더 올리거나, 슬라이더 샘플링 자체를 평형 근처로
# 편향시키는 방법(중요도 샘플링)을 고려한다.
N_SIMULATIONS_PER_ROW = 100

# computeClimateV2() 슬라이더 입력 범위. physicsEngine.js의
# mapSlidersToClimateInputs()가 실제 슬라이더(0~100)로 만들어내는 범위와
# 맞춰서, 게임에서 실제로 나올 수 있는 입력만 학습하게 한다.
CO2_BASELINE_PPM = 432
PARAM_RANGES = {
    "glacierRatio": (0.0, 1.0),
    "oceanRatio": (0.0, 1.0),
    "cloudRatio": (0.0, 1.0),
    "atmThickness": (0.4, 2.0),
    "co2Ppm": (CO2_BASELINE_PPM * 0.3, CO2_BASELINE_PPM * 3.0),
}

NODE_SCRIPT = Path(__file__).resolve().parent / "run_physics_engine.mjs"
INPUT_DATASET = config.DATASETS_DIR / "ml_dataset.csv"
OUTPUT_DATASET = config.FINAL_DATASET

# 최종 CSV 컬럼 순서
OUTPUT_COLUMNS = [
    "SAL", "TPW", "CLA", "SST", "t2m", "psl", "co2",
    "absorbedRadiation", "outgoingRadiation", "deltaEnergy",
    "greenhouseStrength", "albedo",
    "state",
]


def load_ml_dataset(csv_path: Path) -> pd.DataFrame:
    """실측 데이터셋을 읽고 필요한 컬럼이 다 있는지 검증한다."""
    if not csv_path.exists():
        raise FileNotFoundError(f"실측 데이터셋을 찾을 수 없습니다: {csv_path}")

    df = pd.read_csv(csv_path)

    missing = [c for c in ML_INPUT_COLUMNS if c not in df.columns]
    if missing:
        raise ValueError(f"ml_dataset.csv에 없는 컬럼: {missing}")

    before = len(df)
    df = df.dropna(subset=ML_INPUT_COLUMNS)
    dropped = before - len(df)
    if dropped:
        logger.info(f"결측치로 제외된 행: {dropped}개")

    return df


def sample_slider_params(rng: np.random.Generator) -> dict:
    """computeClimateV2() 슬라이더 입력 하나를 무작위로 뽑는다."""
    return {key: float(rng.uniform(lo, hi)) for key, (lo, hi) in PARAM_RANGES.items()}


def build_simulation_plan(df: pd.DataFrame, rng: np.random.Generator) -> list[dict]:
    """실측 행마다 N_SIMULATIONS_PER_ROW개의 (실측값 + 무작위 슬라이더) 조합을 만든다.

    currentTemperature는 무작위가 아니라 그 행의 실측 t2m을 그대로 쓴다 -
    "이 실측 위치의 실제 관측 온도가 이 가상 조건에서 에너지수지가 맞는지"를
    평가하기 위함이다.
    """
    plan = []
    for _, row in df.iterrows():
        ml_inputs = {col: row[col] for col in ML_INPUT_COLUMNS}
        for _ in range(N_SIMULATIONS_PER_ROW):
            plan.append({
                **ml_inputs,
                **sample_slider_params(rng),
                "currentTemperature": row["t2m"],
            })
    return plan


def run_physics_engine(plan: list[dict]) -> list[dict]:
    """Node로 physicsEngine.js의 computeClimateV2()를 그대로 호출한다 (한 번의 프로세스로 전부 처리)."""
    if not NODE_SCRIPT.exists():
        raise FileNotFoundError(f"Node 브릿지 스크립트가 없습니다: {NODE_SCRIPT}")

    climate_input_keys = list(PARAM_RANGES) + ["currentTemperature"]
    climate_inputs = [{k: sim[k] for k in climate_input_keys} for sim in plan]

    proc = subprocess.run(
        ["node", str(NODE_SCRIPT)],
        input=json.dumps(climate_inputs),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"physicsEngine.js 실행 실패:\n{proc.stderr}")

    return json.loads(proc.stdout)


def build_output_rows(plan: list[dict], physics_results: list[dict]) -> list[dict]:
    rows = []
    for sim_inputs, physics in zip(plan, physics_results):
        rows.append({
            **{col: sim_inputs[col] for col in ML_INPUT_COLUMNS},
            "co2": sim_inputs["co2Ppm"],
            "absorbedRadiation": physics["absorbedRadiation"],
            "outgoingRadiation": physics["outgoingRadiation"],
            "deltaEnergy": physics["deltaEnergy"],
            "greenhouseStrength": physics["greenhouseStrength"],
            "albedo": physics["albedo"],
        })
    return rows


def balance_classes(df: pd.DataFrame, label_col: str, rng: np.random.Generator) -> pd.DataFrame:
    """클래스별로 가장 적은 클래스의 개수만큼 언더샘플링해서 균등하게 맞춘다.

    슬라이더를 넓은 범위에서 균일 샘플링하면 대부분 에너지 부족/잉여로 쏠려서
    평형 밴드(1~3)가 희소해진다. 중복 행을 만드는 오버샘플링 대신, 넉넉히
    생성한 뒤 각 클래스를 최소 클래스 개수로 잘라내는 방식으로 균형을 맞춘다 -
    train/test로 나눴을 때 같은 행이 양쪽에 섞이는 문제가 없다.
    """
    min_count = df[label_col].value_counts().min()
    parts = [
        group.sample(n=min_count, random_state=rng.integers(2**32 - 1))
        for _, group in df.groupby(label_col)
    ]
    balanced = pd.concat(parts)
    return balanced.sample(frac=1, random_state=rng.integers(2**32 - 1)).reset_index(drop=True)


def main() -> None:
    rng = np.random.default_rng(config.RANDOM_STATE)

    logger.info(f"실측 데이터셋 로드: {INPUT_DATASET}")
    df = load_ml_dataset(INPUT_DATASET)

    n_planned = len(df) * N_SIMULATIONS_PER_ROW
    logger.info(f"실측 {len(df)}행 x 시뮬레이션 {N_SIMULATIONS_PER_ROW}개 = {n_planned}개 생성 예정")

    plan = build_simulation_plan(df, rng)

    logger.info("physicsEngine.js(computeClimateV2) 실행 중 (Node)...")
    physics_results = run_physics_engine(plan)

    rows = build_output_rows(plan, physics_results)
    out_df = pd.DataFrame(rows)

    out_df["state"] = assign_labels(
        out_df, delta_energy_col="deltaEnergy", temperature_col="t2m"
    )

    logger.info(f"균형화 전 클래스 분포:\n{out_df['state'].value_counts().sort_index()}")

    out_df = balance_classes(out_df, label_col="state", rng=rng)
    out_df = out_df[OUTPUT_COLUMNS]

    config.DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(OUTPUT_DATASET, index=False)

    logger.info(f"CSV 저장 완료: {OUTPUT_DATASET} ({len(out_df)}행)")
    logger.info(f"균형화 후 클래스 분포:\n{out_df['state'].value_counts().sort_index()}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"데이터 생성 실패: {e}")
        sys.exit(1)
