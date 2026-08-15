# 프리셋 수집(preset-kim.py)이 쓰는 KIM 변수가 실제로 조회되는지 확인한다.
#
# 왜 필요한가
# ----------
# KIM API는 "쓸 수 있는 변수 목록"을 알려주지 않는다. 이름을 틀리면
# `NetCDF: Variable not found` 만 돌아오고, 어떤 이름이 맞는지는 알 수 없다.
# 그래서 아래 이름들은 전부 실제 호출로 찾아낸 것이고, 이 스크립트는 그 결과를
# 기록해 두는 동시에 "지금도 유효한지" 다시 확인하는 용도다.
#
# 확인한 사실 (2026-08-14, 서울 37.5/127.0, tmfc=2026032000, hf=0)
#   t2m      277.660 K        기온(2m)
#   tcld       0.000 (0~1)    전운량        ← lcld/mcld/hcld(하층/중층/상층)도 있음
#   dswrsfc  281.255 W/m2     지면 하향단파  ← 알베도 분모
#   rss      245.770 W/m2     지면 순단파    ← 알베도 분자
#   ps    101167.000 Pa       지면기압      ← psl(해면기압)과 달리 고도가 반영됨
#
# 안 되는 이름(전부 Variable not found): tcar, tcc, tcdc, cld, tca, lcdc, psfc, sp,
#   clt, cldt, tcam, cldamt, cfrac, cf, ctot, cldtot, cloud, cldfra, ncld,
#   lcc, mcc, hcc, alb, albedo, salb, asfc, sfcalb, uswrsfc, uswrtoa
#   (지면 상향단파가 없어서 알베도는 1 - rss/dswrsfc 로 역산해야 한다)
#
# 사용법:  cd data-pipeline/Scripts && python3 probe-kim-vars.py

import os
import time

import requests
from dotenv import load_dotenv

load_dotenv()
# 저장소 .env는 authKey로 쓰고 기존 스크립트는 API_KEY를 읽는다 - 둘 다 받는다.
API_KEY = os.getenv("API_KEY") or os.getenv("authKey")

BASE_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_pt_txt2"

# 프로브 기준점. 값이 그럴듯한지 눈으로 볼 수 있게 서울을 쓴다.
LAT, LON = 37.5, 127.0
TMFC = "2026032000"

# preset-kim.py가 실제로 쓸 변수들.
REQUIRED = [
    ("t2m", "기온(2m) - 지점의 시작 온도"),
    ("tcld", "전운량(0~1) - cloudRatio"),
    ("dswrsfc", "지면 하향단파 - 알베도 분모"),
    ("rss", "지면 순단파 - 알베도 분자"),
]
OPTIONAL = [
    ("ps", "지면기압 - atmThickness를 지점별로 줄 때 사용(고원 지점 추가 시 의미가 커짐)"),
]

# 구름이 지점마다 실제로 갈리는지 확인할 좌표. 변수는 있는데 값이 항상 0이면
# 쓸모가 없으므로, 사막(무운)과 열대우림(상시 흐림)이 반대로 나오는지 본다.
CLOUD_CHECK = [("사하라", 23.4, 8.7, "사막 - 0에 가까워야"), ("아마존", -3.5, -60.0, "우림 - 1에 가까워야")]


def fetch(name, lat=LAT, lon=LON, hf=0):
    params = {
        "group": "KIMG", "nwp": "NE57", "data": "U", "name": name,
        "tmfc": TMFC, "hf": str(hf), "lat": lat, "lon": lon,
        "disp": "A", "help": "0", "authKey": API_KEY,
    }
    started = time.time()
    try:
        r = requests.get(BASE_URL, params=params, timeout=30)
    except requests.exceptions.RequestException as e:
        return None, None, time.time() - started, f"네트워크 오류({e.__class__.__name__})"

    elapsed = time.time() - started
    if r.status_code != 200:
        return None, None, elapsed, f"HTTP {r.status_code}"

    # 응답 형식: "TMFC TMEF VARN LEVEL VALUS NAME(단위)" - 5번째 토큰이 값이다.
    for line in r.text.splitlines():
        if f"{name}(" in line:
            parts = line.split()
            if len(parts) > 4:
                try:
                    unit = line.split(f"{name}(")[1].split(")")[0]
                    return float(parts[4]), unit, elapsed, None
                except (ValueError, IndexError):
                    pass
    return None, None, elapsed, "Variable not found"


def main():
    if not API_KEY:
        print("❌ .env에서 API_KEY(또는 authKey)를 찾지 못했습니다.")
        return

    print(f"기준점 서울({LAT}, {LON})  tmfc={TMFC}  hf=0\n")
    ok = True

    for label, group in (("필수", REQUIRED), ("선택", OPTIONAL)):
        print(f"[{label}]")
        for name, why in group:
            value, unit, sec, err = fetch(name)
            if err:
                print(f"  ❌ {name:<9} {err:<24}{sec:>6.2f}s  {why}")
                if label == "필수":
                    ok = False
            else:
                print(f"  ✅ {name:<9} {value:>14.3f} {unit:<8}{sec:>6.2f}s  {why}")
            time.sleep(0.5)
        print()

    # 전운량이 지점마다 실제로 다른 값을 주는지 (변수만 있고 항상 0이면 무의미)
    print("[전운량 검증] tcld가 지점 특성을 반영하는가")
    for name, lat, lon, expect in CLOUD_CHECK:
        value, _, _, err = fetch("tcld", lat, lon)
        print(f"  {name:<7} {('실패' if err else f'{value:.3f}'):>8}   {expect}")
        time.sleep(0.5)

    print()
    print("✅ 필수 변수 전부 확인됨 - preset-kim.py 진행 가능" if ok
          else "❌ 필수 변수 누락 - preset-kim.py의 수집 항목을 다시 정해야 함")


if __name__ == "__main__":
    main()
