# 물리엔진 데이터 기준점 - GK2A 위성산출물 (지면 흡수단파복사, 최근 7일 평균)
#
# 물리엔진 기준값은 학습 데이터가 아니라 "현재 지구는 대략 이렇다"는 기준점 하나만
# 있으면 되므로, 여러 날에 나눠 실행할 필요 없이 최근 7일치를 한 번에 돌려서
# 평균낸다 (날짜별 날씨 노이즈만 줄이는 목적, 계절 분산은 필요 없음).

import os
import csv
import time
import requests
import numpy as np
import xarray as xr
from datetime import date, timedelta
from dotenv import load_dotenv

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

AREA = "FD"

# 물리엔진용 변수 (GK2A 위성산출물, 평균값 기준)
PRODUCTS = [
    "SWRAD"  # 지면 흡수단파복사 (ASR)
]

BASE_URL = "https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2"

N_DAYS = 7
today = date.today()
TMFC_LIST = [(today - timedelta(days=i)).strftime("%Y%m%d") + "00" for i in range(N_DAYS)]


NC_CACHE_DIR = "../nc_cache"
os.makedirs(NC_CACHE_DIR, exist_ok=True)


def download_product(product, tmfc):
    date_str = tmfc + "00"  # GK2A는 분(mm) 단위까지 포함 (YYYYMMDDHHmm)

    url = (
        f"{BASE_URL}/{product}/{AREA}/data"
        f"?date={date_str}"
        f"&authKey={API_KEY}"
    )

    filename = os.path.join(NC_CACHE_DIR, f"{product}_{date_str}.nc")

    # ponytail: 429(속도 제한)만 짧게 재시도. 403(할당량 초과) 등은 그대로 올림.
    for attempt in range(3):
        r = requests.get(url)
        if r.status_code == 429:
            wait = 5 * (attempt + 1)
            print(f"{product} {tmfc}: 429 Too Many Requests, {wait}초 대기 후 재시도")
            time.sleep(wait)
            continue
        r.raise_for_status()
        break
    else:
        r.raise_for_status()

    with open(filename, "wb") as f:
        f.write(r.content)

    return filename


# 각 상품 파일에서 실제로 쓸 변수명 (실제 .nc 파일 구조로 확인함)
PRODUCT_VARIABLE = {
    "SWRAD": "ASR",  # Absorbed Shortwave Radiation = 지면 흡수단파복사
}


def average_product(filename, product):
    ds = xr.open_dataset(filename)
    mean_value = float(ds[PRODUCT_VARIABLE[product]].mean(skipna=True))
    ds.close()
    return mean_value


daily_means = {p: [] for p in PRODUCTS}

for tmfc in TMFC_LIST:
    print(f"=== {tmfc} ===")
    for product in PRODUCTS:
        filename = download_product(product, tmfc)
        value = average_product(filename, product)
        daily_means[product].append(value)
        print(f"{product:10s}  {tmfc} 평균 = {value:.3f}")
        time.sleep(2)

results = {p: float(np.mean(values)) for p, values in daily_means.items() if values}

# CSV 저장
DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(DATASETS_DIR, "physics_gk2a_dataset.csv")

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)

    writer.writerow(["date_range", "n_days"] + PRODUCTS)

    writer.writerow(
        [f"{TMFC_LIST[-1]}~{TMFC_LIST[0]}", len(TMFC_LIST)] +
        [results.get(p) for p in PRODUCTS]
    )

print(f"\nCSV 저장 완료 : {OUTPUT_FILE} ({N_DAYS}일 평균)")
