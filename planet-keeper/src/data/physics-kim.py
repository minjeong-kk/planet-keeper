# 물리 엔진 데이터 기준점 수치모델

import csv
import os
import re
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

TMFC = "2026070100"   # 분석시간(UTC)


def fetch_variable(var_name):
    params = {
        "group": "KIMG",
        "nwp": "NE57",
        "data": "U",
        "name": var_name,
        "map": "F",
        "tmfc": TMFC,
        "hf": "0",
        "disp": "A",
        "help": "0",
        "level": "0",
        "authKey": API_KEY
    }

    response = requests.get(BASE_URL, params=params)
    response.raise_for_status()

    text = response.text

    # 숫자(지수표기 포함)만 추출
    numbers = re.findall(r'[-+]?\d+\.\d+e[+-]\d+', text)

    if not numbers:
        print(f"[ERROR] {var_name}: 데이터 없음")
        return None

    values = np.array(numbers, dtype=np.float64)

    mean_value = float(values.mean())

    print(f"{var_name:10s}  평균 = {mean_value:.3f}")

    return mean_value


results = {}

for var in VARIABLES:
    results[var] = fetch_variable(var)


# CSV 저장
with open("physics_dataset.csv", "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)

    writer.writerow(["datetime"] + VARIABLES)

    writer.writerow(
        [TMFC] +
        [results[v] for v in VARIABLES]
    )

print("\nCSV 저장 완료 : physics_dataset.csv")