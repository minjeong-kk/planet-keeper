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
        "data": "U",          # t2m, psl은 단일면
        "name": var_name,
        "tmfc": tmfc,
        "hf": "0",            # 분석시각
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
            print(line)          # 디버깅용
            return float(line.split()[4])

    print(text)
    return None



print(fetch_point("t2m", "2026020300", -52, 100))
print(fetch_point("t2m", "2026020300", 35, 140))
print(fetch_point("t2m", "2026020300", 0, 128))