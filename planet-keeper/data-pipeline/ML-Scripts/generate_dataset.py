"""물리엔진으로 학습 데이터셋(final_ml_dataset.csv)을 생성한다.

개발계획서 (2)의 구조를 그대로 따른다:
    "기상청·천리안 실측 데이터로 '현대 지구형 안정 평형' 표준 범위를 정의하고,
     물리 엔진 수식과 연동해 극단적 이상 기후 합성 데이터를 추가 생성한다."

즉 실측 데이터와 합성 데이터의 역할이 다르다.
    - 실측(ml_dataset.csv) → derive_thresholds.py가 라벨 임계값을 도출하는 데 쓴다.
    - 합성(이 스크립트)     → 게임에서 나올 수 있는 조성 × 온도를 넓게 훑어 학습 표본을 만든다.

이전 방식과의 차이
------------------
예전에는 실측 행(SAL/TPW/CLA/SST/t2m/psl)을 그대로 피처로 넣고, 물리엔진에는 그와
아무 관계없는 무작위 슬라이더를 넣었다. 그래서 한 행 안에 서로 다른 행성이 섞여
있었고(학습 데이터에서 SAL↔albedo 상관이 +0.048, 게임에서는 +0.834),
모델은 실측 피처를 노이즈로 학습했다. 지금은 한 행이 하나의 행성만 나타낸다.

온도 샘플링
-----------
현재 온도를 독립적으로 샘플링해야 5개 클래스가 모두 나온다.
    - 평형온도 근처  → 에너지가 균형이므로 온도에 따라 저온/지구형/고온 안정 (1/2/3)
    - 평형온도에서 멀면 → 에너지 불평형 (0/4)
절대 온도를 여기서 만들지 않고 "평형온도로부터의 offset"만 넘긴다. 평형온도는 조성에
의존하므로 물리엔진이 계산해야 하고, 그래야 게임에서 실제로 나타나는 궤적(평형으로
수렴하는 중의 온도)과 같은 분포가 된다.

라벨도 물리엔진 쪽(run_physics_engine.mjs의 planetStateOf)에서 계산한다 - 물리 계산과
라벨이 같은 소스를 쓰게 하기 위함이다. label_rules.py는 같은 규칙의 Python 구현이며,
두 결과가 일치하는지는 verify_sync.py가 검사한다.

사용법:
    python3 derive_thresholds.py   # 임계값 먼저 도출
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

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

NODE_SCRIPT = Path(__file__).resolve().parent / "run_physics_engine.mjs"
OUTPUT_DATASET = config.FINAL_DATASET

# 생성할 원본 표본 수. 클래스 균등화(언더샘플링) 후에는 이보다 줄어든다.
N_SAMPLES = 240_000
# Node에 한 번에 넘기는 개수. 전체를 한 덩어리 JSON으로 주고받으면 메모리가 커진다.
CHUNK_SIZE = 30_000

# 슬라이더는 게임과 동일하게 0~100 정수만 나온다(input type=range, step=1).
SLIDER_KEYS = ["iceThickness", "ocean", "cloud", "atmThickness", "co2"]

# 평형온도로부터의 offset 샘플링. 평형 밴드가 좁아서 넓은 범위만 뽑으면 안정 3종이
# 희소해지므로, 절반은 평형 근처에서 촘촘히 뽑는다(최종 분포는 언더샘플링으로 맞춘다).
NEAR_EQUILIBRIUM_FRACTION = 0.5
NEAR_EQUILIBRIUM_OFFSET_K = 10.0
WIDE_OFFSET_K = 60.0


def sample_simulations(rng: np.random.Generator, n: int) -> pd.DataFrame:
    """게임에서 나올 수 있는 (슬라이더 조합 × 현재 온도) 표본을 만든다."""
    sliders = pd.DataFrame(
        {key: rng.integers(0, 101, size=n) for key in SLIDER_KEYS}
    )

    near = rng.random(n) < NEAR_EQUILIBRIUM_FRACTION
    offset = np.where(
        near,
        rng.uniform(-NEAR_EQUILIBRIUM_OFFSET_K, NEAR_EQUILIBRIUM_OFFSET_K, size=n),
        rng.uniform(-WIDE_OFFSET_K, WIDE_OFFSET_K, size=n),
    )
    sliders["temperatureOffsetK"] = offset
    return sliders


def to_engine_inputs(sliders: pd.DataFrame) -> list[dict]:
    """브릿지에 넘길 JSON으로 변환한다.

    슬라이더 원값(0~100)을 그대로 넘긴다 - 물리 단위 변환(대기두께 배율, CO2 ppm)은
    브릿지가 mapSlidersToClimateInputs()로 처리한다. 예전에는 그 변환식이 여기에도
    복제돼 있었는데, JS 쪽을 고치면 학습 데이터가 조용히 게임과 달라지는 구조였다.
    """
    return sliders.to_dict(orient="records")


def run_physics_engine(engine_inputs: list[dict]) -> list[dict]:
    """Node로 physicsEngine.js를 그대로 호출한다(청크 단위)."""
    if not NODE_SCRIPT.exists():
        raise FileNotFoundError(f"Node 브릿지 스크립트가 없습니다: {NODE_SCRIPT}")

    results: list[dict] = []
    for start in range(0, len(engine_inputs), CHUNK_SIZE):
        chunk = engine_inputs[start : start + CHUNK_SIZE]
        proc = subprocess.run(
            ["node", str(NODE_SCRIPT)],
            input=json.dumps(chunk),
            capture_output=True,
            text=True,
        )
        if proc.returncode != 0:
            raise RuntimeError(f"physicsEngine.js 실행 실패:\n{proc.stderr}")
        results.extend(json.loads(proc.stdout))
        logger.info(f"  물리엔진 {len(results):,} / {len(engine_inputs):,}")

    return results


def balance_classes(df: pd.DataFrame, rng: np.random.Generator) -> pd.DataFrame:
    """가장 적은 클래스 개수만큼 언더샘플링해 균등하게 맞춘다.

    중복 행을 만드는 오버샘플링을 쓰지 않는 이유: 같은 행이 train/test 양쪽에
    들어가면 성능이 부풀려진다.
    """
    counts = df[config.LABEL_COLUMN].value_counts()
    min_count = int(counts.min())
    parts = [
        group.sample(n=min_count, random_state=int(rng.integers(2**32 - 1)))
        for _, group in df.groupby(config.LABEL_COLUMN)
    ]
    balanced = pd.concat(parts)
    return balanced.sample(
        frac=1, random_state=int(rng.integers(2**32 - 1))
    ).reset_index(drop=True)


def main() -> None:
    rng = np.random.default_rng(config.RANDOM_STATE)

    logger.info(f"표본 {N_SAMPLES:,}개 샘플링")
    sliders = sample_simulations(rng, N_SAMPLES)

    logger.info("physicsEngine.js 실행 중 (Node)...")
    results = run_physics_engine(to_engine_inputs(sliders))

    out_df = pd.DataFrame(results)

    missing = [c for c in config.FEATURES if c not in out_df.columns]
    if missing:
        raise ValueError(
            f"물리엔진 출력에 없는 피처: {missing}\n"
            f"config.FEATURES와 run_physics_engine.mjs의 출력 키를 맞추세요."
        )

    logger.info(
        f"균형화 전 클래스 분포:\n{out_df[config.LABEL_COLUMN].value_counts().sort_index()}"
    )
    out_df = balance_classes(out_df, rng)
    out_df = out_df[config.FEATURES + [config.LABEL_COLUMN] + config.LEAKY_COLUMNS]

    config.DATASETS_DIR.mkdir(parents=True, exist_ok=True)
    out_df.to_csv(OUTPUT_DATASET, index=False)

    logger.info(f"CSV 저장 완료: {OUTPUT_DATASET} ({len(out_df):,}행)")
    logger.info(
        f"균형화 후 클래스 분포:\n{out_df[config.LABEL_COLUMN].value_counts().sort_index()}"
    )


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"데이터 생성 실패: {e}")
        sys.exit(1)
