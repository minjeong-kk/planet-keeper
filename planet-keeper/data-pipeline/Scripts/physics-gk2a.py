# 물리엔진 데이터 기준점 - GK2A 위성산출물 (지면 흡수단파복사, 월별 1일씩 7개월 평균)
#
# 물리엔진 기준값이 특정 계절/한 주에 편향되지 않도록, 최근 연속 7일이 아니라
# 1월~7월까지 달마다 하루씩 뽑아서 평균낸다. physics-kim.py와 반드시 같은
# 날짜를 써야 물리엔진 기준값이 일관되므로, 자동 계산 대신 고정 목록을 공유한다.

import os
import csv
import time
import requests
import numpy as np
import xarray as xr
import pyproj
from dotenv import load_dotenv

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

AREA = "FD"

# 물리엔진용 변수 (GK2A 위성산출물, 평균값 기준)
PRODUCTS = [
    "SWRAD"  # 지면 흡수단파복사 (ASR)
]

BASE_URL = "https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2"

# physics-kim.py와 공유하는 고정 날짜 목록 (1월~7월, 달마다 하루씩)
TMFC_LIST = [
    "2026013100",
    "2026022800",
    "2026033100",
    "2026043000",
    "2026053100",
    "2026063000",
    "2026072800",
]

NC_CACHE_DIR = "../nc_cache"
os.makedirs(NC_CACHE_DIR, exist_ok=True)

DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
CACHE_FILE = os.path.join(DATASETS_DIR, "physics_gk2a_monthly_cache.csv")
OUTPUT_FILE = os.path.join(DATASETS_DIR, "physics_gk2a_dataset.csv")


def download_product(product, tmfc):
    date_str = tmfc + "00"  # GK2A는 분(mm) 단위까지 포함 (YYYYMMDDHHmm)

    url = (
        f"{BASE_URL}/{product}/{AREA}/data"
        f"?date={date_str}"
        f"&authKey={API_KEY}"
    )

    filename = os.path.join(NC_CACHE_DIR, f"{product}_{date_str}.nc")

    # ponytail: 429(속도 제한)나 순간적인 네트워크 오류만 짧게 재시도.
    # 403(할당량 초과) 등 실제 HTTP 에러는 재시도해봐야 소용없어서 그대로 올림.
    r = None
    for attempt in range(3):
        try:
            r = requests.get(url, timeout=60)
        except requests.exceptions.RequestException as e:
            wait = 5 * (attempt + 1)
            print(f"{product} {tmfc}: 네트워크 오류({e.__class__.__name__}), {wait}초 대기 후 재시도")
            time.sleep(wait)
            continue

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


def earth_disk_mask(ds, var_name):
    """지구 원반 안(밤이든 낮이든)인지, 원반 밖(우주 배경)인지 구분하는 마스크.
    ml-gk2a.py의 grid_latlon()과 동일한 pyproj geos 투영을 재사용한다."""
    proj = ds["gk2a_imager_projection"].attrs

    coff = proj["column_offset"]
    loff = proj["line_offset"]
    cfac = proj["column_scale_factor"]
    lfac = proj["line_scale_factor"]
    lon_0 = proj["longitude_of_projection_origin"]
    req = proj["semi_major_axis"]
    rpol = proj["semi_minor_axis"]
    h = proj["perspective_point_height"]
    sweep = proj.get("sweep_angle_axis", "y")

    ydim, xdim = ds[var_name].shape
    col, line = np.meshgrid(np.arange(xdim), np.arange(ydim))

    x_rad = np.radians((col - coff) * 65536.0 / cfac)
    y_rad = np.radians((line - loff) * 65536.0 / lfac)
    x_m = np.tan(x_rad) * h
    y_m = np.tan(y_rad) * h

    geos_crs = pyproj.CRS.from_proj4(
        f"+proj=geos +h={h} +lon_0={lon_0} +a={req} +b={rpol} +sweep={sweep} +units=m +no_defs"
    )
    transformer = pyproj.Transformer.from_crs(geos_crs, "EPSG:4326", always_xy=True)

    with np.errstate(invalid="ignore"):
        lon, lat = transformer.transform(x_m, y_m)

    return np.isfinite(lat) & np.isfinite(lon) & (np.abs(lat) <= 90)


def average_product(filename, product):
    ds = xr.open_dataset(filename)

    on_earth = earth_disk_mask(ds, PRODUCT_VARIABLE[product])
    values = ds[PRODUCT_VARIABLE[product]].values.astype(np.float64)

    # 원반 안인데 값이 결측(NaN)인 건 "밤이라 흡수단파가 0"인 경우이므로 0으로 채움.
    # 원반 밖(우주 배경)은 애초에 평균 대상에서 제외.
    # (이렇게 안 하면 밤 픽셀이 통째로 빠져서 "낮만의 평균"이 되어 실제보다 크게 부풀려짐)
    night_filled = np.where(on_earth & np.isnan(values), 0.0, values)
    mean_value = float(np.nanmean(np.where(on_earth, night_filled, np.nan)))

    ds.close()
    return mean_value


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
    writer = csv.DictWriter(f, fieldnames=["tmfc"] + PRODUCTS)
    if not cache_file_exists:
        writer.writeheader()

    for tmfc in TMFC_LIST:
        if tmfc in cache:
            print(f"=== {tmfc} (캐시에 이미 있음, 건너뜀) ===")
            continue

        print(f"=== {tmfc} ===")
        row = {"tmfc": tmfc}
        for product in PRODUCTS:
            filename = download_product(product, tmfc)
            value = average_product(filename, product)
            row[product] = value
            print(f"{product:10s}  {tmfc} 평균 = {value:.3f}")
            time.sleep(2)

        writer.writerow(row)
        f.flush()
        cache[tmfc] = row

# 캐시에 쌓인 전체 달(이번 실행 + 예전 실행 합쳐서)로 최종 평균을 낸다.
daily_means = {p: [] for p in PRODUCTS}
for tmfc, row in cache.items():
    for product in PRODUCTS:
        value = row.get(product)
        if value not in (None, ""):
            daily_means[product].append(float(value))

results = {p: float(np.mean(values)) for p, values in daily_means.items() if values}

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.writer(f)

    writer.writerow(["date_range", "n_days"] + PRODUCTS)

    writer.writerow(
        [f"{TMFC_LIST[0]}~{TMFC_LIST[-1]}", len(cache)] +
        [results.get(p) for p in PRODUCTS]
    )

print(f"\nCSV 저장 완료 : {OUTPUT_FILE} (캐시 {len(cache)}/{len(TMFC_LIST)}개월 기준 평균)")
