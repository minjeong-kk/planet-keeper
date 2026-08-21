# 데이터 파이프라인

실측 데이터를 수집해 물리 엔진의 판정 임계값·지점 프리셋을 도출하는 오프라인 스크립트
모음입니다. 설치·실행 명령어는 [README.md](README.md)의 "데이터 파이프라인 실행"에
있습니다 — 여기서는 스크립트별 역할, 실측 데이터가 게임에 반영되는 경로(자동 생성
파일 / 자동 반영되는 상수 / 완전히 미채택된 값)를 자세히 정리합니다.

## 실측 데이터가 게임에 쓰이는 경로

아래 세 갈래가 게임이 **자동으로** 읽는(또는 반영되는) 산출물로 이어지는 경로입니다
(스크립트를 다시 실행하면 자동으로 갱신됩니다). `physics_reference.csv`에는 GK2A가
전혀 들어가지 않습니다(KIM + CO₂만). GK2A 산출물(`physics_gk2a_dataset.csv`)은
`Scripts/legacy/`에서만 만들어지고 어디에도 자동 반영되지 않는 완전히 미채택된
값입니다. 자세한 내용은 아래 "검토했지만 미채택된 것" 참고.

```
observed-kim.py (전지구 무작위 좌표 자체 생성, 위성 없음)
        │
observed_kim_dataset.csv (KIM t2m, 1,500지점 목표)
        │
        └─ derive_thresholds.py ─→ COLD_STABLE_MAX_K / EARTH_LIKE_MAX_K
                                            │
                                            └─→ physicsEngine.planetStateOf()
                                                 (게임의 5분류 판정)

preset_kim_cache.csv (KIM 5지점, t2m·tcld·dswrsfc·rss·ps)
        │
        └─ build_presets.py ─→ climatePoints.js
                                    │
                                    ├─ values  → 슬라이더 초기값
                                    ├─ t2m     → 시작 온도
                                    └─ surfaceAlbedo → albedoOf()의 지표면 반사율

physics_kim_dataset.csv(dswrtoa) + co2_data.csv
        │
        └─ physics-merge.py ─→ physicsEngine.js의 SOLAR_CONSTANT / CO2_BASELINE_PPM 줄을
                                 정규식으로 직접 덮어씀 (파일 전체 재생성은 아님)
```

## 파일별 역할

| 파일 | 역할 | 게임에서 사용 |
|------|------|:---:|
| **Scripts/observed-kim.py** | 전지구 무작위 좌표를 자체 생성(위성 불필요)해 KIM 수치모델 `t2m`/`psl`을 조회. | ✅ |
| **Scripts/physics-kim.py** | KIM 전지구 필드 평균(복사 5변수)을 월별로 수집. | 🟡 중간 산출물 — `dswrtoa`만 physics-merge.py가 씀 |
| **Scripts/physics-merge.py** | physics-kim.py 결과와 CO₂ 실측을 합쳐 `physics_reference.csv` 생성(GK2A 없음) + `physicsEngine.js`의 `SOLAR_CONSTANT`/`CO2_BASELINE_PPM` 자동 갱신. | ✅ |
| **Scripts/probe-kim-vars.py** | KIM에 필요한 변수(`t2m`/`tcld`/`dswrsfc`/`rss`/`ps`)가 있는지 확인. API가 변수 목록을 주지 않아 이름을 찾아낸 결과를 기록해 둠. | 진단용 (산출물 없음) |
| **Scripts/preset-kim.py** | 지점 선택용 실측 수집. 기온·구름은 조회 구간 전체에 12일 분산, 단파복사는 남극에 태양이 남은 2~3월로 고정(LIMITATIONS.md 8번 ①). | ✅ |
| **Analysis/config.py** | 데이터 파이프라인 공용 경로 상수. | (스크립트 내부용) |
| **Analysis/derive_thresholds.py** | 실측 t2m 분포에서 판정 임계값을 도출해 `climate_thresholds.json`(기록용)과 `src/data/climateThresholds.js`(프론트가 import)에 저장. | ✅ (js만) |
| **Analysis/build_presets.py** | 수집 결과를 `src/data/climatePoints.js`로 변환. 물리 단위 → 슬라이더 변환을 여기 한 곳에만 둔다. | ✅ |

> `Scripts/`는 API 수집(네트워크·인증 키 필요), `Analysis/`는 수집된 파일만으로 하는
> 오프라인 도출입니다. 스크립트 이름과 출력 파일 이름이 짝을 이룹니다
> (`observed-kim.py` → `observed_kim_dataset.csv`).
>
> `observed-kim.py`는 예전엔 `observed-gk2a.py`(천리안 위성)가 만든 좌표를 앵커로
> 받아썼습니다 — ML 학습 데이터를 모으던 시절, GK2A 위성영상 한 장에서 여러 지점을
> 한 번에 뽑아 KIM의 180일 조회 제한 안에서 날씨 편향 없이 표본을 넓히던 방법이었습니다.
> ML을 걷어낸 뒤로는 좌표 앵커 역할만 남아 있었는데, 지금은 `observed-kim.py`가 좌표를
> 직접 생성해서 위성 자체가 필요 없습니다(LIMITATIONS.md 5번). **지금 커밋된
> `climateThresholds.js`는 이미 이 새 방식(전지구 무작위 좌표, 관측 1,500지점 유효
> 1,470)으로 재수집한 값**입니다 — GK2A 지역 편향이 빠지면서 지구형 안정 범위가
> 277.22~299.08 K로 이전(281.61~294.69 K)보다 넓어졌습니다.
>
> 옛 GK2A 방식 그대로 재현·대조하고 싶을 때는 아래 "Legacy" 참고.

## Legacy: 옛 위성 좌표 방식으로 재현

GK2A(위성)를 쓰던 스크립트 세 개를 전부 `Scripts/legacy/`로 옮겼습니다 —
`observed-gk2a.py`, `observed-kim.py`(옛 버전), `physics-gk2a.py`. 그 산출물도
`Datasets/legacy/`에 있습니다. 지금 커밋된 데이터는 이미 위성 없는 새 방식으로
갱신됐으니, 이 Legacy 경로는 **옛 값을 다시 재현하거나 대조하고 싶을 때만** 씁니다.
새로 수집할 땐 위 "실측 데이터가 게임에 쓰이는 경로"의 `observed-kim.py`(위성
불필요)를 쓰면 됩니다.

```bash
cd planet-keeper/data-pipeline/Scripts/legacy   # (저장소 루트 기준)
python3 observed-gk2a.py       # 천리안 위성영상에서 좌표 앵커 30개 생성 → ../../Datasets/legacy/observed_gk2a_dataset.csv
                                # (하루 호출 상한 때문에 50일치를 채우려면 여러 날 나눠서 반복 실행)
python3 observed-kim.py        # 그 좌표로 KIM t2m/psl 조회 → ../../Datasets/legacy/observed_kim_dataset.csv

# derive_thresholds.py는 Datasets/(legacy 아님)에서 읽으므로 복사해서 넘겨준다
cp ../../Datasets/legacy/observed_kim_dataset.csv ../../Datasets/observed_kim_dataset.csv
cd ../../Analysis
python3 derive_thresholds.py   # observed_kim_dataset.csv → src/data/climateThresholds.js
```

실행 후 다시 새 방식으로 되돌리려면 `Scripts/observed-kim.py`(옛 GK2A 파일을 읽지
않고 좌표를 자체 생성)를 다시 돌려서 `Datasets/observed_kim_dataset.csv`를
덮어쓰고 `derive_thresholds.py`를 재실행하면 됩니다.

### `physicsEngine.js`에 자동 반영되는 값

`physics_kim_dataset.csv`/`physics_reference.csv` 자체는 게임(src/) 코드가 안
읽습니다. 하지만 `climatePoints.js`/`climateThresholds.js`처럼 새 파일을 만드는 대신,
`physics-merge.py`가 실행 끝에 **`src/utils/physicsEngine.js`를 열어서 딱 그 두
상수 줄만 정규식으로 바꿔 씁니다**(`apply_constant()` 함수) — 나머지 물리 코드는
손으로 유지보수하는 영역이라 건드리지 않습니다.

| 값을 확인할 파일 | 열(column) | 자동으로 바뀌는 상수 |
|---|---|---|
| `Datasets/physics_kim_dataset.csv` | `dswrtoa` | `export const SOLAR_CONSTANT = ...` |
| `Datasets/co2_data.csv` (physics-merge.py가 평균) | `Atmospheric_CO2_ppm` | `export const CO2_BASELINE_PPM = ...` |

이 두 상수는 ΔE(에너지 평형 판정)를 계산하는 핵심 값이라 실제로 게임에 반영됩니다.
`physics-merge.py`를 실행할 때마다 최신 값으로 덮어써지므로, 사람이 CSV를 열어
옮겨 적을 필요는 없습니다 — 값을 확인만 하고 싶다면 `Datasets/physics_reference.csv`의
`dswrtoa`/`co2` 열을 보면 됩니다.

### 학습 화면의 숫자는 손으로 옮기지 않습니다

문제은행(`quizBank.js`)·용어집(`climateConcepts.js`)·개념 도감(`conceptPages.js`)은
"S = 296.4 W/m²", "기준 CO₂ 429.53ppm", "알베도 0.27 이라 흡수 216 W/m²",
"지구형 구간 277.22 ~ 299.08K" 같은 숫자를 문장 안에서 인용합니다. 이 숫자를 손으로
적어 두면 위 자동 반영(그리고 `derive_thresholds.py`/`build_presets.py`의 재생성)
뒤에 **그 문구만 조용히 낡습니다** — 화면에는 새 값으로 계산한 ΔE가 뜨는데 문제
힌트는 옛 숫자로 설명하는, 학생이 검산해 보면 틀리는 상태가 됩니다.

그래서 세 파일은 숫자를 직접 적지 않고 `src/data/referenceValues.js`가 물리엔진과
`climatePoints.js`에서 **유도한 값을 템플릿 리터럴로 끼워 씁니다.** 재수집해도 문구가
함께 따라가므로 사람이 손볼 곳이 없습니다.

새 문제나 도감 지면을 쓸 때도 이 원칙을 지킵니다.

| 쓰려는 숫자 | 어떻게 |
|---|---|
| 유입 단파복사 S, 그 S로 계산한 W/m² | `referenceValues.js`의 `S` / `asr(a)` / `reflected(a)` |
| 기준 CO₂ 농도, 그 2배 | `CO2` / `CO2_X2` |
| 알베도·온실효과 기준값 | `A_BASE` / `G_BASE` / `EMISS_BASE` / `A_ICE20` 등 |
| 판정 임계값·평형 허용오차 | `COLD_MAX` / `EARTH_MAX` / `EPS` |
| 지점 실측 반사율 | `climatePoints.js`에서 직접 읽기(도감의 `pointAlbedo`) |
| **실제 지구 관측값**(지표 복사 391, OLR 240, 알베도 0.30, 금성 0.77 등) | **그대로 적는다** — 엔진 값이 아니므로 엔진을 따라 움직이면 오히려 틀린다 |

마지막 줄이 중요합니다. 이 엔진은 기준 조성이 288.15 K에서 평형이 되도록 유효 σ를
보정하고, S가 실제 지구(340 W/m²)보다 작아서 **절대 플럭스가 실제의 약 0.87배**입니다
(LIMITATIONS.md 1번). 비율인 g = 0.386은 관측에서 그대로 옮겨오지만 W/m² 절대량은
옮겨오지 않으므로, 두 계열을 한 카드에 섞어 적으면 안 됩니다.

관련 파일:

- `Datasets/physics_kim_dataset.csv` — `dswrtoa` 열이 위 표의 대상
- `Datasets/physics_kim_monthly_cache.csv` — 위 파일의 월별 캐시
- `Datasets/co2_data.csv` — `physics-merge.py`가 평균 내는 원본
- `Datasets/physics_reference.csv` — 두 값을 합친 기록(대조표용, 이 파일 자체는 안 읽음)

**검토했지만 완전히 미채택된 것 (자동 반영 없음):**

- `Datasets/legacy/physics_gk2a_dataset.csv` — GK2A `SWRAD` 평균. ML 분류 모델을
  걷어내면서 계산 경로에서 빠졌고, 이제 `physics-merge.py`가 GK2A를 아예 다루지
  않아 `physics_reference.csv`에도 들어가지 않습니다(LIMITATIONS.md 6·7번 참고).
  이 파일과 `physics-gk2a.py`는 `Scripts/legacy/`/`Datasets/legacy/`로 옮겨졌습니다.
- `Datasets/legacy/physics_gk2a_monthly_cache.csv` — 위 파일의 월별 캐시
- `Datasets/climate_thresholds.json` — `climateThresholds.js`와 같은 값의 기록용 사본
  (프론트는 `.js` 파일만 import함)
