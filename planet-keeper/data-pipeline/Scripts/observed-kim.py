# 판정 임계값(COLD_STABLE_MAX_K / EARTH_LIKE_MAX_K)용 KIM t2m/psl 실측 수집.
#
# ------------------------------------------------------------------
# 왜 좌표를 여기서 직접 생성하는가 (예전엔 위성 좌표를 썼었다)
# ------------------------------------------------------------------
# 이 스크립트는 원래 observed-gk2a.py(천리안 GK2A, 지금은 legacy/로 옮김)가 만든
# 위경도를 앵커로 받아썼다. 그때는 GK2A 위성영상 한 장에서 여러 지점을 한 번에 뽑을 수
# 있었고, 그렇게 하면 KIM의 조회 제한(약 180일) 안에서 날짜를 많이 쓰지 않고도
# 공간적으로 흩어진 표본을 만들 수 있었다 - 그게 위성을 좌표 소스로 쓴 이유였다.
# 당시엔 이 데이터가 ML(분류 모델) 학습용이기도 했다.
#
# ML을 걷어낸 뒤에도 좌표 앵커 역할만 남아 있었는데, 위성 자체를 아예 안 쓰기
# 위해 좌표를 이 스크립트가 직접 생성하도록 바꿨다. 날짜를 여러 개로 나눠 쓰는
# 이유(날씨 편향 방지)는 그대로 유지한다 - 좌표 생성 방법만 바뀐 것이다.
#
# 부수 효과: 예전 GK2A 좌표는 위성 관측 영역(동아시아·서태평양)에 갇혀 있어
# 표본이 여름철·저위도로 치우쳤다(LIMITATIONS.md 한계 2번). 좌표를 전지구
# 무작위로 뽑으면 이 편향도 함께 줄어든다.
#
# ------------------------------------------------------------------
# 재현성
# ------------------------------------------------------------------
# random.seed로 좌표 목록을 고정한다 - 스크립트를 여러 날에 걸쳐 이어서 실행해도
# (또는 다른 사람이 다시 실행해도) 매번 같은 좌표 목록이 나와야 이미 받은 만큼을
# 건너뛰고 이어받을 수 있다. 날짜 목록은 "오늘"에서 역산하므로 실행 시점에 따라
# 달라진다 - 이건 KIM의 조회 제한 자체가 움직이는 창이라 피할 수 없다.

import csv
import math
import os
import random
import time
from datetime import date, timedelta

import requests
from dotenv import load_dotenv

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

BASE_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_pt_txt2"

VARIABLES = [
    "t2m",  # 기온(2m)
    "psl"   # 해면기압
]

DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(DATASETS_DIR, "observed_kim_dataset.csv")

# KIM API가 최근 180일까지만 조회 가능 -> 그 범위를 N_TARGET_DATES개로 균등
# 분산해서 하루 날씨에 표본이 쏠리지 않게 한다.
N_TARGET_DATES = 50
SAMPLES_PER_DATE = 30  # 30 x 50 = 1,500개 목표 (예전 GK2A 버전과 동일한 규모)
KIM_LOOKBACK_DAYS = 179  # 오늘 포함 180일 안쪽으로 여유를 둠

COORD_SEED = 20260217  # 고정 시드 - 재실행해도 같은 좌표 목록이 나와야 이어받기가 된다


def target_dates():
    # 오늘은 발행 지연으로 데이터가 없을 때가 많아 어제까지만 범위로 잡는다.
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=KIM_LOOKBACK_DAYS)
    span = (end - start).days
    return [
        (start + timedelta(days=round(i * span / (N_TARGET_DATES - 1)))).strftime("%Y%m%d") + "00"
        for i in range(N_TARGET_DATES)
    ]


def target_points():
    # 위경도를 그냥 lat=uniform(-90,90)으로 뽑으면 극지방이 실제 지표면적보다
    # 과대표집된다(위도가 높을수록 위선의 실제 둘레가 줄어드니까). 구 표면에서
    # 면적 기준으로 균등하게 뽑으려면 lat = arcsin(uniform(-1,1))을 써야 한다.
    rng = random.Random(COORD_SEED)
    points = []
    for _ in range(SAMPLES_PER_DATE):
        lat = math.degrees(math.asin(rng.uniform(-1, 1)))
        lon = rng.uniform(-180, 180)
        points.append((round(lat, 4), round(lon, 4)))
    return points


def build_targets():
    """(tmfc, lat, lon) 전체 목표 목록. 날짜마다 같은 좌표 세트를 재사용한다 -
    그래야 나중에 다른 지역 대신 같은 지점의 계절 변화까지 섞여 들어가는 걸 막는다."""
    points = target_points()
    targets = []
    for tmfc in target_dates():
        for lat, lon in points:
            targets.append({"tmfc": tmfc, "lat": lat, "lon": lon})
    return targets


def fetch_point(var_name, tmfc, lat, lon):
    params = {
        "group": "KIMG",
        "nwp": "NE57",
        "data": "U",
        "name": var_name,
        "tmfc": tmfc,
        "hf": "0",
        "lat": lat,
        "lon": lon,
        "disp": "A",
        "help": "0",
        "authKey": API_KEY,
    }

    # ponytail: API 문서에 lat/lon으로 임의 격자점을 조회할 수 있다고만 나와 있고
    # 응답 형식(1개 값만 오는지, map 파라미터가 별도로 필요한지)은 미검증.
    # 429(속도 제한)만 짧게 재시도. 403(할당량 초과) 등은 그대로 올림.
    for attempt in range(3):
        response = requests.get(BASE_URL, params=params, timeout=30)

        if response.status_code == 429:
            wait = 5 * (attempt + 1)
            print(f"{var_name}: 429 Too Many Requests ({wait}s)")
            time.sleep(wait)
            continue

        response.raise_for_status()
        break
    else:
        response.raise_for_status()

    text = response.text

    # 숫자 추출
    for line in text.splitlines():
        if f"{var_name}(" in line:
            return float(line.split()[4])

    print("========== API 응답 ==========")
    print(text[:1000])
    print("=============================")
    return None


targets = build_targets()

# 이미 받은 만큼 건너뛰고, 남은 목표만 이어서 받는다. build_targets()가 매번
# 같은 목록을 만들어내는 게(고정 시드 + "오늘" 기준 날짜) 이 이어받기의 전제다.
file_exists = os.path.exists(OUTPUT_FILE)

already_done = 0
if file_exists:
    with open(OUTPUT_FILE, newline="") as f:
        already_done = sum(1 for _ in csv.DictReader(f))

new_targets = targets[already_done:]
total = len(new_targets)

if total == 0:
    print("받을 목표를 이미 다 채웠습니다 (총 %d개)." % len(targets))
else:
    fieldnames = ["tmfc", "lat", "lon"] + VARIABLES

    with open(OUTPUT_FILE, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)

        if not file_exists:
            writer.writeheader()

        done = 0
        for i, target in enumerate(new_targets):
            tmfc, lat, lon = target["tmfc"], target["lat"], target["lon"]

            row = {"tmfc": tmfc, "lat": lat, "lon": lon}
            for var in VARIABLES:
                row[var] = fetch_point(var, tmfc, lat, lon)
                time.sleep(0.3)  # 연달아 요청하면 429(속도 제한) 남

            writer.writerow(row)
            f.flush()
            done += 1

            print(f"{i + 1}/{total} 수집 완료 (tmfc={tmfc}, lat={lat:.2f}, lon={lon:.2f})")

    print(
        f"\nCSV 저장 완료 : {OUTPUT_FILE} "
        f"(이번 실행 {done}개 추가, KIM API 호출 {done * len(VARIABLES)}회)"
    )
