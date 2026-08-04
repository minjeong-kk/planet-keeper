"""실측 데이터로 '현대 지구형 안정 평형' 표준 범위(라벨 임계값)를 도출한다.

개발계획서 (2)의 "기상청·천리안 실측 데이터로 '현대 지구형 안정 평형' 표준 범위를
정의하고" 에 해당하는 단계다. 이전에는 label_rules.py에 280K/295K가 "예시값"으로
하드코딩되어 있었고, 실측 데이터는 라벨 결정에 전혀 쓰이지 않았다.

도출 방식
---------
관측 t2m의 '폭'만 쓰고 '중심'은 계획서 기준값을 쓴다.

  - ml_dataset.csv의 t2m 평균은 지구 평균(288.15K)보다 따뜻하게 치우쳐 있다.
    KMA API 조회 기간과 GK2A 관측 영역 제약으로 여름철·저위도 표본이 많기 때문이며,
    README '알려진 한계' 2번과 6번에 이미 기록된 편향이다.
  - 따라서 관측 '평균'을 지구형 중심으로 쓰면 안 된다. 대신 관측이 신뢰성 있게
    말해주는 값(분포의 폭 = 사분위 범위)만 가져오고, 중심은 계획서의
    "현대 지구 평균 15°C" 기준값에 고정한다.

    지구형 안정 범위 = 288.15K ± (관측 t2m IQR / 2)

에너지 평형 허용오차(epsilon)는 관측량이 아니라 설계 허용오차이므로 상수로 둔다.
물리엔진 기준 상태에서 dΔE/dT ≈ 4·ASR_base/T_ref ≈ 1.08 (단위: ΔE per K)이므로
epsilon 5.0 은 "평형온도에서 약 4.6K 이내"에 해당한다.

출력
----
같은 값을 두 형식으로 쓴다 - 이렇게 해야 Python(label_rules.py)과
JS(physicsEngine.js)가 같은 값을 쓰는 것이 구조적으로 보장된다.
예전에는 두 파일에 상수를 따로 적어 두고 주석으로만 "같은 값"이라고 해 두었다.

  - data-pipeline/Datasets/climate_thresholds.json  (label_rules.py가 읽음)
  - src/data/climateThresholds.js                   (physicsEngine.js가 import)

프론트 쪽을 JSON이 아니라 생성된 JS 모듈로 두는 이유: JSON import는 Node에서
import attributes(`with { type: "json" }`)를 요구하는데, 이 파일은 브라우저(Vite)와
Node(run_physics_engine.mjs 경유) 양쪽에서 로드되므로 JS 모듈이 가장 안전하다.

사용법:
    python3 derive_thresholds.py
"""

import json
import logging
import sys

import pandas as pd

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

# 계획서 3쪽 "지구 기준 세팅값" — 현대 지구 평균 기온 15°C.
EARTH_REFERENCE_TEMP_K = 288.15

# 에너지 평형 판정 허용오차(설계값, 관측량 아님). 위 docstring의 근거 참고.
EPSILON_ENERGY_BALANCE = 5.0

OBSERVED_DATASET = config.DATASETS_DIR / "ml_dataset.csv"
JSON_FOR_PYTHON = config.DATASETS_DIR / "climate_thresholds.json"
JS_FOR_FRONTEND = (
    config.DATA_PIPELINE_DIR.parent / "src" / "data" / "climateThresholds.js"
)


def derive(observed_t2m: pd.Series) -> dict:
    q25, q75 = observed_t2m.quantile(0.25), observed_t2m.quantile(0.75)
    half_width = (q75 - q25) / 2

    return {
        "epsilon_energy_balance": EPSILON_ENERGY_BALANCE,
        "cold_stable_max_k": round(EARTH_REFERENCE_TEMP_K - half_width, 2),
        "earth_like_max_k": round(EARTH_REFERENCE_TEMP_K + half_width, 2),
        "derivation": {
            "source": OBSERVED_DATASET.name,
            "n_observations": int(len(observed_t2m)),
            "observed_t2m_min_k": round(float(observed_t2m.min()), 2),
            "observed_t2m_max_k": round(float(observed_t2m.max()), 2),
            "observed_t2m_mean_k": round(float(observed_t2m.mean()), 2),
            "observed_iqr_k": [round(float(q25), 2), round(float(q75), 2)],
            "earth_reference_temp_k": EARTH_REFERENCE_TEMP_K,
            "note": (
                "지구형 안정 범위 = 계획서 기준 15°C ± (관측 t2m IQR / 2). "
                "관측 표본이 여름철·저위도로 치우쳐 있어(README 알려진 한계 2·6번) "
                "관측 평균이 아니라 계획서 기준값을 중심으로 삼는다."
            ),
        },
    }


def write_json(path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
        f.write("\n")
    logger.info(f"임계값 저장: {path}")


def write_js_module(path, payload: dict) -> None:
    """physicsEngine.js가 import할 생성 모듈. 직접 수정하지 말 것."""
    d = payload["derivation"]
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(
        "// ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.\n"
        "// data-pipeline/ML-Scripts/derive_thresholds.py 를 실행하면 다시 생성됩니다.\n"
        "//\n"
        f"// 근거: {d['source']} 관측 {d['n_observations']}개 지점\n"
        f"//       관측 t2m {d['observed_t2m_min_k']}~{d['observed_t2m_max_k']} K "
        f"(평균 {d['observed_t2m_mean_k']} K)\n"
        f"//       IQR {d['observed_iqr_k'][0]}~{d['observed_iqr_k'][1]} K\n"
        f"//       {d['note']}\n"
        "//\n"
        "// label_rules.py가 읽는 climate_thresholds.json 과 같은 값이다.\n\n"
        "export const EPSILON_ENERGY_BALANCE = "
        f"{payload['epsilon_energy_balance']}\n"
        f"export const COLD_STABLE_MAX_K = {payload['cold_stable_max_k']}\n"
        f"export const EARTH_LIKE_MAX_K = {payload['earth_like_max_k']}\n"
        f"export const EARTH_REFERENCE_TEMP_K = {d['earth_reference_temp_k']}\n",
        encoding="utf-8",
    )
    logger.info(f"임계값 저장: {path}")


def main() -> None:
    if not OBSERVED_DATASET.exists():
        raise FileNotFoundError(f"실측 데이터셋을 찾을 수 없습니다: {OBSERVED_DATASET}")

    df = pd.read_csv(OBSERVED_DATASET)
    if "t2m" not in df.columns:
        raise ValueError("ml_dataset.csv에 t2m 컬럼이 없습니다.")

    thresholds = derive(df["t2m"].dropna())

    logger.info(
        f"관측 {thresholds['derivation']['n_observations']}개 지점 → "
        f"지구형 안정 범위 {thresholds['cold_stable_max_k']} ~ "
        f"{thresholds['earth_like_max_k']} K "
        f"(epsilon {thresholds['epsilon_energy_balance']})"
    )

    write_json(JSON_FOR_PYTHON, thresholds)
    write_js_module(JS_FOR_FRONTEND, thresholds)


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"임계값 도출 실패: {e}")
        sys.exit(1)
