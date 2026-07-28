# 머신러닝 학습용 데이터 - GK2A 위성산출물 (위경도 포함, KIM 매칭용 anchor)

import os
import csv
import sys
import time
import requests
import numpy as np
import xarray as xr
from datetime import date, timedelta
from dotenv import load_dotenv
from scipy.spatial import cKDTree

load_dotenv()  # .env 파일 읽기
API_KEY = os.getenv("API_KEY")

AREA = "FD"

# ML용 변수 (GK2A 위성산출물, 격자 샘플 기준)
PRODUCTS = [
    "SAL",  # 지표면 반사도 (BSA)
    "TPW",  # TPW (가강수량)
    "CLA",  # 구름량 (CA)
    "SST"   # (선택) SST
]

BASE_URL = "https://apihub.kma.go.kr/api/typ05/api/GK2A/LE2"

DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
OUTPUT_FILE = os.path.join(DATASETS_DIR, "ml_gk2a_dataset.csv")

# KIM API가 최근 180일까지만 조회 가능 -> 그 범위를 N_TARGET_DATES개로 균등 분산.
N_TARGET_DATES = 30
KIM_LOOKBACK_DAYS = 179  # 오늘 포함 180일 안쪽으로 여유를 둠


def target_dates():
    # 오늘은 발행 지연으로 데이터가 없을 때가 많아 어제까지만 범위로 잡는다.
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=KIM_LOOKBACK_DAYS)
    span = (end - start).days
    return [
        (start + timedelta(days=round(i * span / (N_TARGET_DATES - 1)))).strftime("%Y%m%d") + "00"
        for i in range(N_TARGET_DATES)
    ]


def already_fetched_dates():
    if not os.path.exists(OUTPUT_FILE):
        return set()
    with open(OUTPUT_FILE, newline="") as f:
        return {row["tmfc"] for row in csv.DictReader(f)}


def next_tmfc():
    done = already_fetched_dates()
    for candidate in target_dates():
        if candidate not in done:
            return candidate
    return None  # 계획된 30일 전부 완료


# 인자로 날짜를 직접 줄 수도 있고(예: python3 ml-gk2a.py 2026060100),
# 안 주면 180일 범위 안에서 아직 안 받은 다음 날짜를 자동으로 고른다.
# 단, 하루 호출 상한은 "실제 오늘"을 기준으로 걸리므로 실행 자체는 여전히 하루 1번씩만.
if len(sys.argv) > 1:
    TMFC = sys.argv[1]
else:
    TMFC = next_tmfc()
    if TMFC is None:
        print(f"계획된 {N_TARGET_DATES}개 날짜를 이미 다 받았습니다. 더 필요하면 N_TARGET_DATES를 늘리세요.")
        sys.exit(0)

DATE = TMFC + "00"    # GK2A는 분(mm) 단위까지 포함 (YYYYMMDDHHmm)

# 하루당 샘플 개수 (ml-kim.py와 동일). 하루 개수를 줄이고 날짜 종류를 늘려서
# 계절/날씨 편차를 줄이는 쪽으로 (150x10일 대신 50x30일 등).
SAMPLE_SIZE = 50


NC_CACHE_DIR = "../nc_cache"
os.makedirs(NC_CACHE_DIR, exist_ok=True)


def download_product(product):
    url = (
        f"{BASE_URL}/{product}/{AREA}/data"
        f"?date={DATE}"
        f"&authKey={API_KEY}"
    )

    filename = os.path.join(NC_CACHE_DIR, f"{product}_{DATE}.nc")

    # ponytail: 429(속도 제한)만 짧게 재시도. 403(할당량 초과) 등은 그대로 올림.
    for attempt in range(3):
        r = requests.get(url)
        if r.status_code == 429:
            wait = 5 * (attempt + 1)
            print(f"{product}: 429 Too Many Requests, {wait}초 대기 후 재시도")
            time.sleep(wait)
            continue
        r.raise_for_status()
        break
    else:
        r.raise_for_status()

    with open(filename, "wb") as f:
        f.write(r.content)

    return filename


# 각 상품 파일에서 실제로 쓸 변수명 (실제 .nc 파일 구조로 확인함, 상품마다 부가
# 변수가 여러 개 섞여 있어 "첫 번째 것"을 쓰면 안 됨)
PRODUCT_VARIABLE = {
    "SAL": "BSA",   # Black-Sky Albedo = 지표면 반사도
    "TPW": "TPW",   # Total Precipitable Water = 가강수량
    "CLA": "CA",    # Cloud Amount = 구름량
    "SST": "SST",   # Sea Surface Temperature = 해수면온도
}


def grid_values(filename, product):
    ds = xr.open_dataset(filename)
    values = ds[PRODUCT_VARIABLE[product]].values.astype(np.float32).ravel()
    ds.close()
    return values


def grid_latlon(filename, product):
    """GK2A는 lat/lon을 직접 안 주고 정지궤도 투영 정보(x/y 픽셀 좌표)만 준다.
    gk2a_imager_projection의 실제 파라미터로 위경도를 계산한다.
    (CGMS LRIT/HRIT 표준 지오스테이셔너리 투영 역변환 공식, GK2A/Himawari 공통)
    """
    ds = xr.open_dataset(filename)
    proj = ds["gk2a_imager_projection"].attrs

    coff = proj["column_offset"]                              # 영상 중심 컬럼(픽셀) 위치
    loff = proj["line_offset"]                                 # 영상 중심 라인(픽셀) 위치
    cfac = proj["column_scale_factor"]                          # 컬럼 -> 라디안 변환 계수
    lfac = proj["line_scale_factor"]                            # 라인 -> 라디안 변환 계수
    lon_0 = np.radians(proj["longitude_of_projection_origin"])  # 위성이 바라보는 기준 경도(라디안)
    req = proj["semi_major_axis"]                               # 지구 적도 반지름(m)
    rpol = proj["semi_minor_axis"]                              # 지구 극 반지름(m)
    h = proj["perspective_point_height"] + req                  # 지구 중심 ~ 위성까지 거리(m)

    ydim, xdim = ds[PRODUCT_VARIABLE[product]].shape
    col, line = np.meshgrid(np.arange(xdim), np.arange(ydim))   # 픽셀 index 격자 (컬럼, 라인)

    x = (col - coff) / cfac   # 위성 시야각 x성분(라디안) - 동서 스캔각
    y = (line - loff) / lfac  # 위성 시야각 y성분(라디안) - 남북 스캔각

    cos_x, sin_x = np.cos(x), np.sin(x)
    cos_y, sin_y = np.cos(y), np.sin(y)
    ecc = (req / rpol) ** 2   # 지구 타원체 이심률 보정항 (적도/극 반지름 비의 제곱)

    # sd: 위성 시선과 지구 타원체 표면의 교점까지 거리(제곱) - 지구 밖을 보는
    # 픽셀(우주 배경)은 이 값이 음수가 되어 이후 NaN으로 마스킹됨
    sd = (h * cos_x * cos_y) ** 2 - (cos_y ** 2 + ecc * sin_y ** 2) * (h ** 2 - req ** 2)

    with np.errstate(invalid="ignore"):
        sd_sqrt = np.sqrt(np.where(sd >= 0, sd, np.nan))
        sn = (h * cos_x * cos_y - sd_sqrt) / (cos_y ** 2 + ecc * sin_y ** 2)  # 위성->지표 교점까지 거리

        s1 = h - sn * cos_x * cos_y   # 지구 중심 기준 지표 교점의 위성 방향 성분(m)
        s2 = sn * sin_x * cos_y       # 지구 중심 기준 지표 교점의 동서 성분(m)
        s3 = -sn * sin_y              # 지구 중심 기준 지표 교점의 남북(자전축) 성분(m)
        sxy = np.sqrt(s1 ** 2 + s2 ** 2)  # 적도면에 투영한 거리(m)

        lon = np.degrees(np.arctan2(s2, s1) + lon_0)     # 최종 경도(도)
        lat = np.degrees(np.arctan(ecc * s3 / sxy))       # 최종 위도(도)

    ds.close()
    return lat.astype(np.float32).ravel(), lon.astype(np.float32).ravel()


# 상품마다 실제 해상도가 다름(예: SAL 5500x5500, TPW 1833x1833) -> 인덱스로
# 그냥 맞추면 안 되고, 상품별로 자기 파일의 투영 정보로 직접 위경도를 계산한 뒤
# 위경도 기준 최근접 픽셀을 찾아야 한다.
REFERENCE_PRODUCT = "SAL"  # 가장 고해상도 상품을 기준 좌표로 사용

data = {}
latlon = {}

for product in PRODUCTS:
    print(f"Downloading {product}...")
    filename = download_product(product)
    time.sleep(2)  # 연달아 요청하면 429(속도 제한) 나서 상품 사이 텀을 둠

    data[product] = grid_values(filename, product)
    latlon[product] = grid_latlon(filename, product)

print("Download Complete")

ref_lat, ref_lon = latlon[REFERENCE_PRODUCT]
ref_valid = ~np.isnan(ref_lat) & ~np.isnan(ref_lon) & ~np.isnan(data[REFERENCE_PRODUCT])
ref_valid_indices = np.where(ref_valid)[0]

# 기준 상품(SAL)에서 무작위로 좌표를 뽑고, 나머지 상품은 그 좌표에 가장 가까운
# 자기 격자의 픽셀 값을 가져온다.
sample_indices = np.random.choice(ref_valid_indices, SAMPLE_SIZE, replace=False)
sample_lat = ref_lat[sample_indices]
sample_lon = ref_lon[sample_indices]

product_values = {REFERENCE_PRODUCT: data[REFERENCE_PRODUCT][sample_indices]}

for product in PRODUCTS:
    if product == REFERENCE_PRODUCT:
        continue

    lat_p, lon_p = latlon[product]
    valid_p = ~np.isnan(lat_p) & ~np.isnan(lon_p) & ~np.isnan(data[product])
    valid_p_indices = np.where(valid_p)[0]

    tree = cKDTree(np.column_stack([lat_p[valid_p_indices], lon_p[valid_p_indices]]))
    _, nearest = tree.query(np.column_stack([sample_lat, sample_lon]))

    product_values[product] = data[product][valid_p_indices[nearest]]

# 날짜별로 나눠 여러 번 실행하는 구조라, 실행할 때마다 덮어쓰지 않고 이어붙인다.
file_exists = os.path.exists(OUTPUT_FILE)

with open(OUTPUT_FILE, "a", newline="") as f:

    writer = csv.writer(f)

    if not file_exists:
        writer.writerow(["tmfc", "lat", "lon"] + PRODUCTS)

    for i in range(SAMPLE_SIZE):

        writer.writerow(
            [TMFC, float(sample_lat[i]), float(sample_lon[i])] +
            [float(product_values[p][i]) for p in PRODUCTS]
        )

print(f"ML Dataset(GK2A) 저장 완료 (tmfc={TMFC}, {SAMPLE_SIZE}개 추가)")
