# 물리 엔진 데이터 기준점 수치모델 (최근 7일 평균)
#
# 물리엔진 기준값은 학습 데이터가 아니라 "현재 지구는 대략 이렇다"는 기준점 하나만
# 있으면 되므로, 여러 날에 나눠 실행할 필요 없이 최근 7일치를 한 번에 돌려서
# 평균낸다 (날짜별 날씨 노이즈만 줄이는 목적, 계절 분산은 필요 없음).

import csv
import os
import re
import time
import requests
import numpy as np
from datetime import date, timedelta
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

N_DAYS = 7
START_OFFSET = 1  # 오늘(0)은 KIM 발행 지연으로 데이터가 없을 때가 많아 어제부터 시작
today = date.today()
TMFC_LIST = [
    (today - timedelta(days=i)).strftime("%Y%m%d") + "00"
    for i in range(START_OFFSET, START_OFFSET + N_DAYS)
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
        [f"{TMFC_LIST[-1]}~{TMFC_LIST[0]}", len(TMFC_LIST)] +
        [results.get(v) for v in VARIABLES]
    )

print(f"\nCSV 저장 완료 : {OUTPUT_FILE} ({N_DAYS}일 평균)")
