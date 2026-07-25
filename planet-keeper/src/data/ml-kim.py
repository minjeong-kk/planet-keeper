# 머신러닝 학습용 데이터 수치 모델 (GK2A 샘플 위경도와 매칭)
#
# ml-gk2a.py를 먼저 실행해서 ml_gk2a_dataset.csv(위경도 포함)를 만든 뒤 이 스크립트를 실행한다.
# 같은 위경도, 같은 TMFC로 KIM 값을 조회해서 GK2A 샘플과 1:1로 매칭한다.

import csv
import os
import re
import requests
from dotenv import load_dotenv

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

BASE_URL = "https://apihub.kma.go.kr/api/typ06/cgi-bin/url/nph-kim_nc_xy_txt2_std"

# ML용 변수 (KIM 수치모델, GK2A 샘플 좌표 기준 조회)
VARIABLES = [
    "t2m",  # 기온(2m)
    "psl"   # 해면기압
]

TMFC = "2026070100"   # ml-gk2a.py와 동일한 분석시간(UTC)

GK2A_SAMPLE_FILE = "ml_gk2a_dataset.csv"


def fetch_point(var_name, lat, lon):
    params = {
        "group": "KIMG",
        "nwp": "NE57",
        "data": "U",
        "name": var_name,
        "tmfc": TMFC,
        "lat": lat,
        "lon": lon,
        "help": "0",
        "authKey": API_KEY
    }

    # ponytail: API 문서에 lat/lon으로 임의 격자점을 조회할 수 있다고만 나와 있고
    # 응답 형식(1개 값만 오는지, map 파라미터가 별도로 필요한지)은 미검증.
    response = requests.get(BASE_URL, params=params)
    response.raise_for_status()

    numbers = re.findall(r'[-+]?\d+\.\d+e[+-]\d+', response.text)

    return float(numbers[0]) if numbers else None


with open(GK2A_SAMPLE_FILE, newline="") as f:
    gk2a_samples = list(csv.DictReader(f))

extra_columns = [c for c in gk2a_samples[0].keys() if c not in ("lat", "lon")]
total = len(gk2a_samples)

rows = []

for i, sample in enumerate(gk2a_samples):
    lat, lon = float(sample["lat"]), float(sample["lon"])

    row = {"lat": lat, "lon": lon}
    for var in VARIABLES:
        row[var] = fetch_point(var, lat, lon)
    for col in extra_columns:
        row[col] = sample[col]

    rows.append(row)

    if (i + 1) % 100 == 0:
        print(f"{i + 1}/{total} 매칭 완료")

with open("ml_dataset.csv", "w", newline="") as f:
    fieldnames = ["lat", "lon"] + VARIABLES + extra_columns
    writer = csv.DictWriter(f, fieldnames=fieldnames)
    writer.writeheader()
    writer.writerows(rows)

print(
    f"\nCSV 저장 완료 : ml_dataset.csv "
    f"(샘플 {total}개, KIM API 호출 {total * len(VARIABLES)}회)"
)