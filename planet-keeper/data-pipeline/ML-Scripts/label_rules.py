"""물리엔진(v2) 출력으로부터 라벨(state)을 만드는 규칙.

물리엔진이 더 이상 평형온도를 계산하지 않고 "현재 온도에서의 에너지수지
(deltaEnergy)"만 평가하도록 바뀌면서, 라벨도 deltaEnergy를 1차 기준으로
삼고 평형 범위 안에서만 온도로 저온/지구형/고온을 나누는 5클래스로 바뀐다.

경계값(EPSILON_ENERGY_BALANCE, COLD_STABLE_MAX_K, EARTH_LIKE_MAX_K)은 전부
예시값이다 - 물리엔진 실제 출력 범위가 나오면 재조정해야 한다.
"""

import pandas as pd

# 에너지 평형 판정 허용오차 (W/m^2 상당 단위). 물리엔진 실제 deltaEnergy
# 분포 확인 후 재조정 필요.
EPSILON_ENERGY_BALANCE = 5.0

# 평형 상태일 때 온도 구간 (K). 프로젝트 기준으로 조정 가능.
COLD_STABLE_MAX_K = 280.0
EARTH_LIKE_MAX_K = 295.0

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

    컬럼명을 인자로 받으므로, 실제 컬럼명이 예시와 달라도 호출부에서
    이름만 맞춰주면 된다.
    """
    for col in (delta_energy_col, temperature_col):
        if col not in df.columns:
            raise ValueError(f"라벨 생성에 필요한 컬럼이 없습니다: {col}")

    return df.apply(
        lambda row: assign_label(row[delta_energy_col], row[temperature_col]),
        axis=1,
    )


def demo() -> None:
    assert assign_label(-10, 288) == LABEL_ENERGY_DEFICIT
    assert assign_label(10, 288) == LABEL_ENERGY_SURPLUS
    assert assign_label(0, 270) == LABEL_COLD_STABLE
    assert assign_label(0, 288) == LABEL_EARTH_LIKE_STABLE
    assert assign_label(0, 300) == LABEL_WARM_STABLE
    # 경계값(epsilon) 정확히 걸치는 경우
    assert assign_label(5, 288) == LABEL_EARTH_LIKE_STABLE  # delta=5, 평형 경계 포함(<=)
    assert assign_label(5.1, 288) == LABEL_ENERGY_SURPLUS   # delta>5
    assert assign_label(-5, 288) == LABEL_EARTH_LIKE_STABLE
    assert assign_label(-5.1, 288) == LABEL_ENERGY_DEFICIT
    print("label_rules.py self-check 통과")


if __name__ == "__main__":
    demo()
