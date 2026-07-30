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

    # ponytail: 429(속도 제한)만 짧게 재시도. 403(할당량 초과) 등은 그대로 올림.
    for attempt in range(3):
        response = requests.get(BASE_URL, params=params)
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


daily_means = {var: [] for var in VARIABLES}

for tmfc in TMFC_LIST:
    print(f"=== {tmfc} ===")
    for var in VARIABLES:
        value = fetch_variable(var, tmfc)
        if value is not None:
            daily_means[var].append(value)
            print(f"{var:10s}  {tmfc} 평균 = {value:.3f}")
        time.sleep(1)

results = {var: float(np.mean(values)) for var, values in daily_means.items() if values}

# CSV 저장
DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(DATASETS_DIR, "physics_dataset.csv")

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)

    writer.writerow(["date_range", "n_days"] + VARIABLES)

    writer.writerow(
        [f"{TMFC_LIST[0]}~{TMFC_LIST[-1]}", len(TMFC_LIST)] +
        [results.get(v) for v in VARIABLES]
    )

print(f"\nCSV 저장 완료 : {OUTPUT_FILE} ({len(TMFC_LIST)}개월 평균)")
