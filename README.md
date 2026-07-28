# planet-keeper
An educational climate game to reach planetary equilibrium through environmental control and science quizzes.

## 데이터 수집 스크립트 설치
```

python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt

```

## 알려진 한계 (Known Limitations)

데이터/모델 관련해서 미리 인지하고 있는 방법론적 한계들입니다.

- **물리엔진 기준값(`physics_reference.csv`)의 계절·지역 편향**: 최근 7일 평균으로 뽑는데, 이 7일이 특정 계절(현재는 여름)에 몰려있고, GK2A 위성 특성상 동아시아 권역 시야만 반영합니다. 즉 "지구 전체 연평균"이 아니라 "그 계절·그 지역·그 시각"의 스냅샷에 가깝습니다. 정밀한 전지구 연평균이 필요한 게 아니라 대략적인 기준점 용도로만 사용합니다.
- **ML 실측 데이터(`ml_dataset.csv`)도 최대 반년치**: KMA API가 최근 180일까지만 조회 가능해서, 사계절 전체가 아니라 그중 절반 정도만 반영됩니다.
- **CO2 데이터의 시차**: 기후변화감시소에서 받은 CO2 실측치는 2024년 말까지만 있고, KIM/GK2A 샘플은 그보다 최근 시점이라 약 1~2년 시차가 있습니다. CO2는 변화가 느린 값이라 근사치로 사용합니다.
- **이상 기후 클래스(온실폭주/스노우볼/데드플래닛)는 전부 물리엔진 합성 데이터**: 실측이 존재할 수 없는 상태라 물리엔진 공식으로 생성합니다. 즉 이 3개 클래스의 정확도는 실측 검증이 아니라 물리엔진 공식 자체의 정확도에 전적으로 의존합니다.
- **위성 상품 간 격자 매칭은 최근접 이웃 근사**: GK2A 상품마다 해상도가 달라(SAL 5500×5500 vs TPW 1833×1833) 완전히 같은 지점이 아니라 가장 가까운 픽셀을 매칭합니다.
