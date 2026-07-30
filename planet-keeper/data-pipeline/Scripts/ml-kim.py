# 머신러닝 학습용 데이터 수치 모델 (GK2A 샘플 위경도와 매칭)
#
# ml-gk2a.py를 먼저 실행해서 ml_gk2a_dataset.csv(위경도 포함)를 만든 뒤 이 스크립트를 실행한다.
# 같은 위경도, 같은 tmfc로 KIM 값을 조회해서 GK2A 샘플과 1:1로 매칭한다.
#
# 날짜별로 나눠 여러 날에 걸쳐 실행하는 구조라, ml_gk2a_dataset.csv에 새로 추가된
# 행(아직 ml_dataset.csv에 없는 만큼)만 이어서 처리한다.

import csv
import os
import re
import time
import requests
from dotenv import load_dotenv

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

BASE_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_pt_txt2"

# ML용 변수 (KIM 수치모델, GK2A 샘플 좌표 기준 조회)
VARIABLES = [
    "t2m",  # 기온(2m)
    "psl"   # 해면기압
]

DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
GK2A_SAMPLE_FILE = os.path.join(DATASETS_DIR, "ml_gk2a_dataset.csv")
OUTPUT_FILE = os.path.join(DATASETS_DIR, "ml_dataset.csv")


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


with open(GK2A_SAMPLE_FILE, newline="") as f:
    gk2a_samples = list(csv.DictReader(f))

# 이미 처리된 행 수만큼 건너뛰고, 새로 추가된 행만 이어서 매칭한다.
already_done = 0
if os.path.exists(OUTPUT_FILE):
    with open(OUTPUT_FILE, newline="") as f:
        already_done = sum(1 for _ in csv.DictReader(f))

    new_samples = gk2a_samples[already_done:]
    extra_columns = [c for c in gk2a_samples[0].keys() if c not in ("tmfc", "lat", "lon")]
    total = len(new_samples)

if total == 0:
    print("새로 매칭할 샘플이 없습니다 (ml_gk2a_dataset.csv에 새 행을 추가한 뒤 다시 실행하세요).")
else:
    file_exists = os.path.exists(OUTPUT_FILE)
    fieldnames = ["tmfc", "lat", "lon"] + VARIABLES + extra_columns

    with open(OUTPUT_FILE, "a", newline="") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()

        done = 0
        for i, sample in enumerate(new_samples):
            tmfc, lat, lon = sample["tmfc"], float(sample["lat"]), float(sample["lon"])

            row = {"tmfc": tmfc, "lat": lat, "lon": lon}
            for var in VARIABLES:
                row[var] = fetch_point(var, tmfc, lat, lon)
                time.sleep(0.3)  # 연달아 요청하면 429(속도 제한) 남
            for col in extra_columns:
                row[col] = sample[col]

            writer.writerow(row)
            f.flush()
            done += 1

            print(f"{i + 1}/{total} 매칭 완료 (tmfc={tmfc}, lat={lat:.2f}, lon={lon:.2f})")

    print(
        f"\nCSV 저장 완료 : {OUTPUT_FILE} "
        f"(이번 실행 {done}개 추가, KIM API 호출 {done * len(VARIABLES)}회)"
    )
