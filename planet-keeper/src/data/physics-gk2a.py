# 물리엔진 데이터 기준점 - GK2A 위성산출물 (지면 흡수단파복사)

import os
import csv
import requests
import numpy as np
import xarray as xr
from dotenv import load_dotenv

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

AREA = "FD"

# 물리엔진용 변수 (GK2A 위성산출물, 평균값 기준)
PRODUCTS = [
    "SWRAD"  # 지면 흡수단파복사 (ASR)
]

BASE_URL = "https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2"

TMFC = "2026070100"   # physics-kim.py와 동일한 분석시간(UTC)
DATE = TMFC + "00"    # GK2A는 분(mm) 단위까지 포함 (YYYYMMDDHHmm)


def download_product(product):
    url = (
        f"{BASE_URL}/{product}/{AREA}/data"
        f"?date={DATE}"
        f"&authKey={API_KEY}"
    )

    filename = f"{product}_{DATE}.nc"

    r = requests.get(url)
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


results = {}

for product in PRODUCTS:
    filename = download_product(product)
    results[product] = average_product(filename, product)
    print(f"{product:10s}  평균 = {results[product]:.3f}")


# CSV 저장
with open("physics_gk2a_dataset.csv", "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)

    writer.writerow(["datetime"] + PRODUCTS)

    writer.writerow(
        [DATE] +
        [results[p] for p in PRODUCTS]
    )

print("\nCSV 저장 완료 : physics_gk2a_dataset.csv")
