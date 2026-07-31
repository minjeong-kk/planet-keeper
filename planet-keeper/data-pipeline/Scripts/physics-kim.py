# 물리 엔진 데이터 기준점 수치모델 (월별 1일씩, 7개월 평균)
#
# 물리엔진 기준값이 특정 계절/한 주에 편향되지 않도록, 최근 연속 7일이 아니라
# 1월~7월까지 달마다 하루씩 뽑아서 평균낸다. physics-gk2a.py와 반드시 같은
# 날짜를 써야 물리엔진 기준값이 일관되므로, 자동 계산 대신 고정 목록을 공유한다.

import csv
import os
import re
import time
import requests
import numpy as np
from dotenv import load_dotenv

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

BASE_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_xy_txt2"

# 물리엔진용 변수 (KIM 수치모델, 평균값 기준)
VARIABLES = [
    "dswrtoa",  # TOA 하향단파복사
    "rss",      # 순단파복사
    "dlwrsfc",  # 지면 하향장파복사
    "rls",      # 지면 상향장파복사
    "ulwrtoa"   # TOA 상향장파복사
]

# physics-gk2a.py와 공유하는 고정 날짜 목록 (1월~7월, 달마다 하루씩)
TMFC_LIST = [
    "2026013100",
    "2026022800",
    "2026033100",
    "2026043000",
    "2026053100",
    "2026063000",
    "2026072800",
]

DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
CACHE_FILE = os.path.join(DATASETS_DIR, "physics_kim_monthly_cache.csv")
OUTPUT_FILE = os.path.join(DATASETS_DIR, "physics_kim_dataset.csv")


def fetch_variable(var_name, tmfc):
    params = {
        "group": "KIMG",
        "nwp": "NE57",
        "data": "U",
        "name": var_name,
        "map": "F",
        "tmfc": tmfc,
        "hf": "0",
        "disp": "A",
        "help": "0",
        "level": "0",
        "authKey": API_KEY
    }

    # ponytail: 429(속도 제한)나 순간적인 네트워크 오류만 짧게 재시도.
    # 403(할당량 초과) 등 실제 HTTP 에러는 재시도해봐야 소용없어서 그대로 올림.
    response = None
    for attempt in range(3):
        try:
            response = requests.get(BASE_URL, params=params, timeout=30)
        except requests.exceptions.RequestException as e:
            wait = 5 * (attempt + 1)
            print(f"{var_name} {tmfc}: 네트워크 오류({e.__class__.__name__}), {wait}초 대기 후 재시도")
            time.sleep(wait)
            continue

        if response.status_code == 429:
            wait = 5 * (attempt + 1)
            print(f"{var_name} {tmfc}: 429 Too Many Requests, {wait}초 대기 후 재시도")
            time.sleep(wait)
            continue
        response.raise_for_status()
        break
    else:
        response.raise_for_status()

    numbers = re.findall(r'[-+]?\d+\.\d+e[+-]\d+', response.text)

    if not numbers:
        print(f"[ERROR] {var_name} {tmfc}: 데이터 없음")
        return None

    return float(np.array(numbers, dtype=np.float64).mean())


def load_cache():
    if not os.path.exists(CACHE_FILE):
        return {}
    with open(CACHE_FILE, newline="") as f:
        return {row["tmfc"]: row for row in csv.DictReader(f)}


# 이미 받아둔 달은 캐시에서 그대로 쓰고, 아직 없는 달만 새로 받는다.
# (달 하나 다 받을 때마다 바로 저장하므로, 중간에 에러가 나도 그 전까지는 안 날아감)
cache = load_cache()
cache_file_exists = os.path.exists(CACHE_FILE)

with open(CACHE_FILE, "a", newline="") as f:
    writer = csv.DictWriter(f, fieldnames=["tmfc"] + VARIABLES)
    if not cache_file_exists:
        writer.writeheader()

    for tmfc in TMFC_LIST:
        if tmfc in cache:
            print(f"=== {tmfc} (캐시에 이미 있음, 건너뜀) ===")
            continue

        print(f"=== {tmfc} ===")
        row = {"tmfc": tmfc}
        for var in VARIABLES:
            value = fetch_variable(var, tmfc)
            row[var] = value
            if value is not None:
                print(f"{var:10s}  {tmfc} 평균 = {value:.3f}")
            time.sleep(1)

        writer.writerow(row)
        f.flush()
        cache[tmfc] = row

# 캐시에 쌓인 전체 달(이번 실행 + 예전 실행 합쳐서)로 최종 평균을 낸다.
daily_means = {var: [] for var in VARIABLES}
for tmfc, row in cache.items():
    for var in VARIABLES:
        value = row.get(var)
        if value not in (None, ""):
            daily_means[var].append(float(value))

results = {var: float(np.mean(values)) for var, values in daily_means.items() if values}

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)

    writer.writerow(["date_range", "n_days"] + VARIABLES)

    writer.writerow(
        [f"{TMFC_LIST[0]}~{TMFC_LIST[-1]}", len(cache)] +
        [results.get(v) for v in VARIABLES]
    )

print(f"\nCSV 저장 완료 : {OUTPUT_FILE} (캐시 {len(cache)}/{len(TMFC_LIST)}개월 기준 평균)")
