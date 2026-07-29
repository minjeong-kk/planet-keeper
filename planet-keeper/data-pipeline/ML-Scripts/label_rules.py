"""물리엔진 출력으로부터 라벨(state)을 만드는 규칙.

열수지(에너지 흡수-방출 차이) 평형 여부를 먼저 판단하고, 평형인 경우에만
기온으로 저온/지구형/고온을 나눈다. 기온으로만 라벨을 나누지 않는 이유:
t2m은 학습 피처에도 들어있어서, 라벨까지 기온에만 의존하면 클래스 0(비평형)
판별에서까지 모델이 다른 피처(CO2, 알베도 등)를 무시하고 기온만 보게 될 수
있음 - 열수지를 1차 기준으로 두면 최소한 클래스 0 판별에서는 t2m을 안 쓰고
다른 피처들을 실제로 활용하게 된다.

경계값(EPSILON_ENERGY_BALANCE, COLD_STABLE_MAX_K, EARTH_LIKE_MAX_K)은 전부
예시값이다 - 물리엔진 실제 출력 범위가 나오면 재조정해야 한다.
"""

import pandas as pd

# 에너지 평형 판정 허용오차 (W/m^2). 물리엔진 실제 ΔE 분포 확인 후 재조정 필요.
EPSILON_ENERGY_BALANCE = 5.0

# 평형 상태일 때 온도 구간 (K). 프로젝트 기준으로 조정 가능.
COLD_STABLE_MAX_K = 280.0
EARTH_LIKE_MAX_K = 295.0

LABEL_NON_EQUILIBRIUM = 0
LABEL_COLD_STABLE = 1
LABEL_EARTH_LIKE_STABLE = 2
LABEL_WARM_STABLE = 3

LABEL_NAMES = {
    LABEL_NON_EQUILIBRIUM: "Non-equilibrium",
    LABEL_COLD_STABLE: "Cold Stable",
    LABEL_EARTH_LIKE_STABLE: "Earth-like Stable",
    LABEL_WARM_STABLE: "Warm Stable",
}


def assign_label(absorbed_energy: float, emitted_energy: float, temperature_k: float) -> int:
    """행 하나에 대해 라벨(0~3)을 매긴다.

    1) |흡수 - 방출| > EPSILON  -> 비평형 (클래스 0)
    2) 평형이면 기온 구간으로 저온/지구형/고온 (클래스 1~3)
    """
    delta_e = absorbed_energy - emitted_energy

    if abs(delta_e) > EPSILON_ENERGY_BALANCE:
        return LABEL_NON_EQUILIBRIUM

    if temperature_k < COLD_STABLE_MAX_K:
        return LABEL_COLD_STABLE
    if temperature_k <= EARTH_LIKE_MAX_K:
        return LABEL_EARTH_LIKE_STABLE
    return LABEL_WARM_STABLE


def assign_labels(
    df: pd.DataFrame,
    absorbed_col: str,
    emitted_col: str,
    temperature_col: str,
) -> pd.Series:
    """DataFrame 전체에 라벨을 매겨서 Series로 반환한다.

    컬럼명을 인자로 받으므로, 물리엔진 쪽 실제 컬럼명이 이 예시와 달라도
    (예: "surface_temp" 대신 다른 이름) 호출부에서 이름만 맞춰주면 된다.
    """
    for col in (absorbed_col, emitted_col, temperature_col):
        if col not in df.columns:
            raise ValueError(f"라벨 생성에 필요한 컬럼이 없습니다: {col}")

    return df.apply(
        lambda row: assign_label(row[absorbed_col], row[emitted_col], row[temperature_col]),
        axis=1,
    )
