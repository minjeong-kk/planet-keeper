# 행성 만들기의 "지점 선택"에 쓸 지점별 실측값을 KIM에서 수집한다.
#
# 결과는 build_presets.py가 src/data/climatePoints.js 로 변환한다(지금은 목데이터).
# 변수 이름은 probe-kim-vars.py로 확인한 것들이다.
#
# ------------------------------------------------------------------
# 변수마다 날짜를 다르게 잡는 이유
# ------------------------------------------------------------------
# 처음엔 전 변수를 같은 3일(춘분 전후)에서 받으려 했는데, 그러면 기온이
# 2~3월 값만 남아 그 지점의 기후를 대표하지 못한다(서울 3월 ≈ 3°C, 연평균 ≈ 13°C).
#
#   t2m/tcld  : 태양이 필요 없다 → 조회 가능 구간(약 180일) 전체에 분산한다.
#               이것만으로 서울 오차가 -10.0°C 에서 +3.3°C 로 줄어든다.
#   dswrsfc/rss: 단파복사라 낮이어야 한다. 남극(-75.3도)은 4월을 넘기면 태양고도가
#               3도 아래로 떨어져 알베도를 못 구한다 → 2~3월로 고정.
#               지표면 반사율은 계절 변화가 작아(모래·숲·빙설) 손해가 거의 없다.
#
# 남는 한계: 조회 구간이 2~8월이라 가을·겨울이 통째로 빠진다(서울 +3.3°C).
# KIM의 180일 제한이라 피할 수 없고 README에 기록한다.
#
# ------------------------------------------------------------------
# 알베도
# ------------------------------------------------------------------
# 지면 상향단파 변수가 없어서 순단파/하향단파로 역산한다.
#
#   지표면 반사율 = 1 - Σrss / Σdswrsfc      (플럭스 가중)
#
# 일별 비율을 평균하면 안 된다 - 흐린 날은 분모가 작아 비율이 불안정해지고,
# 그런 날에 과도한 가중이 실린다. 합끼리 나눠야 밝은 날 위주로 안정적으로 잡힌다.
# dswrsfc가 아주 작은 날(새벽/극야 근처)은 0/0에 가까워지므로 아예 제외한다.
#
# 사용법:  cd data-pipeline/Scripts && python3 preset-kim.py
#          (중간에 끊겨도 다시 실행하면 캐시에 없는 것만 이어서 받는다)

import csv
import os
import time
from datetime import date, timedelta

import requests
from dotenv import load_dotenv

load_dotenv()
API_KEY = os.getenv("API_KEY") or os.getenv("authKey")

BASE_URL = "https://apihub.kma.go.kr/api/typ01/cgi-bin/url/nph-kim_nc_pt_txt2"

# src/data/climatePoints.js 와 같은 지점·좌표를 쓴다(그 파일을 교체할 데이터라서).
POINTS = [
    ("seoul", "서울", 37.5, 127.0),
    ("sahara", "사하라 사막", 23.4, 8.7),
    ("antarctica", "남극", -75.3, 0.0),
    ("pacific", "태평양 중심", 0.0, -160.0),
    ("amazon", "아마존", -3.5, -60.0),
]

# 기온·구름용: 조회 구간 전체에 12일 균등 분산.
TEMP_DATES = [
    "2026021700", "2026030500", "2026032100", "2026040700",
    "2026042300", "2026050900", "2026052500", "2026061000",
    "2026062600", "2026071300", "2026072900", "2026081400",
]
TEMP_HOURS = [0, 6, 12, 18]  # 하루 안의 변화를 고르게 담는다(경도에 무관하게)

# 알베도·기압용: 남극에 태양이 남아 있는 2~3월.
SUN_DATES = ["2026021700", "2026030500", "2026032100"]

# 이보다 약한 일사는 알베도 분모로 쓰지 않는다(0/0 방지).
MIN_DSWRSFC = 50.0

# KIM이 보관하는 기간(대략). 위 날짜는 2026-08-14 수집 시점 기준으로 고른 절대값이라,
# 시간이 지나면 조회 창을 벗어난다. 그때 그냥 돌리면 값이 안 와서 알베도가 비거나
# 여름 표본만 남는데, 경고만 보고 지나치기 쉬워 아예 실행을 막는다.
KIM_RETENTION_DAYS = 180


def check_dates_in_window():
    """날짜가 아직 조회 가능한지 확인한다. 벗어났으면 무엇을 어떻게 고쳐야 하는지 알린다."""
    today = date.today()
    stale = []
    for tmfc in sorted(set(TEMP_DATES + SUN_DATES)):
        d = date(int(tmfc[:4]), int(tmfc[4:6]), int(tmfc[6:8]))
        age = (today - d).days
        if age > KIM_RETENTION_DAYS:
            stale.append((tmfc, age))
    if not stale:
        return

    print("❌ 조회 창(약 180일)을 벗어난 날짜가 있습니다:")
    for tmfc, age in stale:
        print(f"     {tmfc}  ({age}일 전)")
    print()
    print("  TEMP_DATES / SUN_DATES 를 다시 잡아야 합니다.")
    print(f"    TEMP_DATES  {today - timedelta(days=KIM_RETENTION_DAYS - 2)} ~ {today} 사이 12일 균등 분산")
    print("    SUN_DATES   그중 가장 이른 쪽 3일 (남극에 태양이 남아 있어야 알베도를 구할 수 있음)")
    print("  날짜를 바꾸면 preset_kim_cache.csv 도 지우고 새로 받으세요(옛 날짜와 섞이면 안 됨).")
    raise SystemExit(1)

DATASETS_DIR = "../Datasets"
os.makedirs(DATASETS_DIR, exist_ok=True)
CACHE_FILE = os.path.join(DATASETS_DIR, "preset_kim_cache.csv")

FIELDS = ["point_id", "kind", "tmfc", "hf", "var", "value"]


def local_noon_hf(lon):
    """그 경도의 현지 정오에 해당하는 UTC 시각. 단파복사는 이때 받아야 의미가 있다."""
    return round(12 - lon / 15) % 24


def fetch(name, lat, lon, tmfc, hf):
    params = {
        "group": "KIMG", "nwp": "NE57", "data": "U", "name": name,
        "tmfc": tmfc, "hf": str(hf), "lat": lat, "lon": lon,
        "disp": "A", "help": "0", "authKey": API_KEY,
    }
    # 429(속도 제한)와 순간적인 네트워크 오류만 짧게 재시도한다.
    # 403(할당량 초과)은 재시도해도 소용없어서 그대로 올린다.
    r = None
    last_error = None
    for attempt in range(3):
        try:
            r = requests.get(BASE_URL, params=params, timeout=30)
        except requests.exceptions.RequestException as e:
            last_error = e
            wait = 5 * (attempt + 1)
            print(f"    네트워크 오류({e.__class__.__name__}) - {wait}초 후 재시도")
            time.sleep(wait)
            continue
        if r.status_code == 429:
            wait = 5 * (attempt + 1)
            print(f"    429 Too Many Requests - {wait}초 후 재시도")
            time.sleep(wait)
            continue
        r.raise_for_status()
        break
    else:
        # 3번 다 네트워크 오류면 r이 없다 - 그대로 raise_for_status를 부르면
        # UnboundLocalError가 나서 진짜 원인이 가려진다.
        if r is None:
            raise last_error
        r.raise_for_status()

    for line in r.text.splitlines():
        if f"{name}(" in line:
            parts = line.split()
            if len(parts) > 4:
                try:
                    return float(parts[4])
                except ValueError:
                    pass
    return None


def load_cache():
    """이미 "값까지" 받은 조합. 값이 빈 행은 실패한 것이므로 완료로 치지 않는다
    - 그래야 다시 실행할 때 실패분만 재시도된다."""
    if not os.path.exists(CACHE_FILE):
        return set()
    with open(CACHE_FILE, newline="", encoding="utf-8") as f:
        return {
            (r["point_id"], r["kind"], r["tmfc"], r["hf"], r["var"])
            for r in csv.DictReader(f)
            if r["value"] not in ("", None)
        }


def plan():
    """받아야 할 (지점, 종류, 날짜, 시각, 변수) 목록을 만든다."""
    jobs = []
    for pid, _, lat, lon in POINTS:
        for tmfc in TEMP_DATES:
            for hf in TEMP_HOURS:
                for var in ("t2m", "tcld"):
                    jobs.append((pid, "temp", tmfc, str(hf), var, lat, lon))
        noon = local_noon_hf(lon)
        for tmfc in SUN_DATES:
            for var in ("dswrsfc", "rss"):
                jobs.append((pid, "sun", tmfc, str(noon), var, lat, lon))
            jobs.append((pid, "sun", tmfc, "0", "ps", lat, lon))
    return jobs


def main():
    if not API_KEY:
        print("❌ .env에서 API_KEY(또는 authKey)를 찾지 못했습니다.")
        return

    check_dates_in_window()

    print("지점별 현지 정오 UTC 시각")
    for pid, name, _, lon in POINTS:
        print(f"  {name:<10} 경도 {lon:>7.1f}  →  hf={local_noon_hf(lon)}")
    print()

    done = load_cache()
    jobs = plan()
    todo = [j for j in jobs if (j[0], j[1], j[2], j[3], j[4]) not in done]
    print(f"전체 {len(jobs)}건 / 이미 받음 {len(jobs) - len(todo)}건 / 이번에 받을 {len(todo)}건")
    if not todo:
        print("모두 수집 완료 - build_presets.py 를 실행하세요.")
        return
    print(f"예상 소요 약 {len(todo) * 1.1 / 60:.0f}분\n")

    is_new = not os.path.exists(CACHE_FILE)
    failed = 0
    with open(CACHE_FILE, "a", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=FIELDS)
        if is_new:
            writer.writeheader()

        current = None
        for i, (pid, kind, tmfc, hf, var, lat, lon) in enumerate(todo, 1):
            if (pid, tmfc) != current:
                current = (pid, tmfc)
                print(f"[{i:>4}/{len(todo)}] {pid} {tmfc}")

            value = fetch(var, lat, lon, tmfc, hf)
            if value is None:
                failed += 1
                print(f"    ⚠️ {var} hf={hf} 값 없음")
            # 한 건씩 바로 써서 flush한다 - 중간에 끊겨도 여기까지는 남는다.
            writer.writerow({
                "point_id": pid, "kind": kind, "tmfc": tmfc,
                "hf": hf, "var": var, "value": "" if value is None else value,
            })
            f.flush()
            time.sleep(0.5)  # 연달아 던지면 429가 난다

    print(f"\n저장 완료: {CACHE_FILE}")
    if failed:
        print(f"⚠️ {failed}건은 값이 비어 있습니다 - 다시 실행하면 그 건만 재시도합니다.")
    print("다음: python3 ../Analysis/build_presets.py")


if __name__ == "__main__":
    main()
