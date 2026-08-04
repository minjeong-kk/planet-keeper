"""물리엔진 출력으로부터 라벨(state)을 만드는 규칙.

deltaEnergy로 평형/불평형을 먼저 가르고, 평형이면 온도로 저온/지구형/고온을
나누는 5클래스다. 클래스 번호는 저온 → 고온 순서다.

    0 Energy Deficit      저온 불평형   deltaEnergy < -epsilon
    1 Cold Stable         저온 안정     평형 + 온도 낮음
    2 Earth-like Stable   지구형 안정   평형 + 온도 중간
    3 Warm Stable         고온 안정     평형 + 온도 높음
    4 Energy Surplus      고온 불평형   deltaEnergy > +epsilon

임계값은 더 이상 여기 하드코딩하지 않는다. derive_thresholds.py가 실측
데이터에서 도출해 climate_thresholds.json에 써 두고, 이 파일과
src/utils/physicsEngine.js가 그 JSON을 함께 읽는다 - Python과 JS가 같은 값을
쓰는 것을 구조적으로 보장하기 위함이다(예전에는 두 곳에 따로 적고 주석으로만
"같은 값"이라고 해 두어서 한쪽만 바뀌면 조용히 어긋났다).

이 모듈의 역할
--------------
학습 데이터의 라벨은 이제 물리엔진 쪽(run_physics_engine.mjs의 planetStateOf)에서
붙인다 - 물리 계산과 라벨이 같은 소스를 쓰게 하기 위함이다. 따라서 이 파일은
"같은 규칙의 Python 참조 구현"이며, verify_sync.py가 JS 구현과 결과가 일치하는지
검사하는 데 쓴다. 규칙을 바꿀 때는 이 파일과 physicsEngine.js의 planetStateOf를
함께 고쳐야 하고, verify_sync.py가 어긋남을 잡아 준다.
"""

import json

import numpy as np
import pandas as pd

import config

_THRESHOLDS_PATH = config.DATASETS_DIR / "climate_thresholds.json"

if not _THRESHOLDS_PATH.exists():
    raise FileNotFoundError(
        f"임계값 파일이 없습니다: {_THRESHOLDS_PATH}\n"
        f"derive_thresholds.py를 먼저 실행하세요."
    )

with open(_THRESHOLDS_PATH, encoding="utf-8") as _f:
    _THRESHOLDS = json.load(_f)

# 실측 기반 도출값 (근거는 climate_thresholds.json의 derivation 필드 참고)
EPSILON_ENERGY_BALANCE = float(_THRESHOLDS["epsilon_energy_balance"])
COLD_STABLE_MAX_K = float(_THRESHOLDS["cold_stable_max_k"])
EARTH_LIKE_MAX_K = float(_THRESHOLDS["earth_like_max_k"])

LABEL_ENERGY_DEFICIT = 0
LABEL_COLD_STABLE = 1
LABEL_EARTH_LIKE_STABLE = 2
LABEL_WARM_STABLE = 3
LABEL_ENERGY_SURPLUS = 4

LABEL_NAMES = {
    LABEL_ENERGY_DEFICIT: "Energy Deficit",
    LABEL_COLD_STABLE: "Cold Stable",
    LABEL_EARTH_LIKE_STABLE: "Earth-like Stable",
    LABEL_WARM_STABLE: "Warm Stable",
    LABEL_ENERGY_SURPLUS: "Energy Surplus",
}


def assign_label(delta_energy: float, temperature_k: float) -> int:
    """행 하나에 대해 라벨(0~4)을 매긴다.

    1) deltaEnergy < -EPSILON       -> 에너지 부족 (클래스 0)
    2) deltaEnergy > +EPSILON       -> 에너지 잉여 (클래스 4)
    3) |deltaEnergy| <= EPSILON(평형) -> 온도 구간으로 저온/지구형/고온 (클래스 1~3)
    """
    if delta_energy < -EPSILON_ENERGY_BALANCE:
        return LABEL_ENERGY_DEFICIT

    if delta_energy > EPSILON_ENERGY_BALANCE:
        return LABEL_ENERGY_SURPLUS

    if temperature_k < COLD_STABLE_MAX_K:
        return LABEL_COLD_STABLE
    if temperature_k <= EARTH_LIKE_MAX_K:
        return LABEL_EARTH_LIKE_STABLE
    return LABEL_WARM_STABLE


def assign_labels(df: pd.DataFrame, delta_energy_col: str, temperature_col: str) -> pd.Series:
    """DataFrame 전체에 라벨을 매겨서 Series로 반환한다.

    컬럼명을 인자로 받으므로, 실제 컬럼명이 달라도 호출부에서 이름만 맞춰주면 된다.
    행 단위 apply 대신 벡터화해서 처리한다(수십만 행에서 수십 배 빠름).
    """
    for col in (delta_energy_col, temperature_col):
        if col not in df.columns:
            raise ValueError(f"라벨 생성에 필요한 컬럼이 없습니다: {col}")

    delta_energy = df[delta_energy_col]
    temperature = df[temperature_col]

    return pd.Series(
        np.select(
            [
                delta_energy < -EPSILON_ENERGY_BALANCE,
                delta_energy > EPSILON_ENERGY_BALANCE,
                temperature < COLD_STABLE_MAX_K,
                temperature <= EARTH_LIKE_MAX_K,
            ],
            [
                LABEL_ENERGY_DEFICIT,
                LABEL_ENERGY_SURPLUS,
                LABEL_COLD_STABLE,
                LABEL_EARTH_LIKE_STABLE,
            ],
            default=LABEL_WARM_STABLE,
        ),
        index=df.index,
        dtype="int64",
    )


def demo() -> None:
    """임계값이 바뀌어도 유효한 self-check (도출값을 기준으로 상대 검사)."""
    eps, cold_max, earth_max = EPSILON_ENERGY_BALANCE, COLD_STABLE_MAX_K, EARTH_LIKE_MAX_K
    mid = (cold_max + earth_max) / 2

    # 1차 기준: deltaEnergy로 평형/불평형
    assert assign_label(-eps - 0.1, mid) == LABEL_ENERGY_DEFICIT
    assert assign_label(eps + 0.1, mid) == LABEL_ENERGY_SURPLUS
    # 경계는 평형에 포함(<=)
    assert assign_label(-eps, mid) == LABEL_EARTH_LIKE_STABLE
    assert assign_label(eps, mid) == LABEL_EARTH_LIKE_STABLE

    # 2차 기준: 평형일 때 온도 구간
    assert assign_label(0, cold_max - 0.1) == LABEL_COLD_STABLE
    assert assign_label(0, cold_max) == LABEL_EARTH_LIKE_STABLE
    assert assign_label(0, earth_max) == LABEL_EARTH_LIKE_STABLE
    assert assign_label(0, earth_max + 0.1) == LABEL_WARM_STABLE

    # 벡터화 경로가 스칼라 경로와 같은 답을 내는지 확인
    grid = pd.DataFrame(
        [
            (de, t)
            for de in (-eps - 1, -eps, 0, eps, eps + 1)
            for t in (cold_max - 1, cold_max, mid, earth_max, earth_max + 1)
        ],
        columns=["deltaEnergy", "temperature"],
    )
    vectorized = assign_labels(grid, "deltaEnergy", "temperature")
    scalar = grid.apply(lambda r: assign_label(r.deltaEnergy, r.temperature), axis=1)
    assert vectorized.equals(scalar.astype("int64")), "벡터화 결과가 스칼라와 다릅니다"

    print(
        f"label_rules.py self-check 통과 "
        f"(epsilon {eps}, 지구형 {cold_max}~{earth_max} K)"
    )


if __name__ == "__main__":
    demo()
