"""preset-kim.py가 모은 실측값을 src/data/climatePoints.js 로 변환한다.

물리 단위 → 슬라이더/게임 값 변환을 여기 한 곳에만 둔다. 프론트에도 같은 식을
복제하면 한쪽만 고쳤을 때 조용히 어긋나기 때문이다(이 저장소에서 이미 여러 번
겪은 실패 방식이다).

변환 규칙
--------
t2m          12일 × 4시각(hf 0/6/12/18)의 산술평균. 그 지점의 시작 온도(K).
cloud        tcld(0~1) 같은 표본의 평균 × 100 → 슬라이더 스케일(0~100).
surfaceAlbedo 1 - Σrss / Σdswrsfc  (플럭스 가중).
             일별 비율을 평균하면 흐린 날(분모가 작음)에 과도한 가중이 실린다.
             dswrsfc가 MIN_DSWRSFC 미만인 표본은 0/0에 가까워 제외한다.
atmThickness ps / 101325 (해수면 표준기압 대비). 고도가 반영되는 값이라
             고원 지점을 추가하면 의미가 커진다.
co2          지점별 관측이 없어 전지구 기준값(CO2_BASELINE_PPM)을 그대로 쓴다.
iceThickness/ocean
             측정 대상이 아니라 지리적 사실이라 아래 GEOGRAPHY에 직접 적는다.
             (빙하 비율을 실측 알베도에서 역산하려 하면 미지수가 여러 개라 풀리지 않는다)

사용법:
    cd data-pipeline/Analysis && python3 build_presets.py
"""

import csv
import logging
import sys
from collections import defaultdict

import config

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

CACHE_FILE = config.DATASETS_DIR / "preset_kim_cache.csv"
OUTPUT_JS = config.DATA_PIPELINE_DIR.parent / "src" / "data" / "climatePoints.js"

STANDARD_PRESSURE_PA = 101325.0
MIN_DSWRSFC = 50.0

# physicsEngine.CO2_BASELINE_PPM 과 같은 값. 지점별 CO2 관측이 없어 공통으로 쓴다.
CO2_BASELINE_PPM = 429.53

# 지리적 사실(측정 대상 아님) + 화면 표시용 메타데이터.
# imageUrl은 라이선스를 확인한 지점만 채운다(README "Assets & Licensing" 참고).
GEOGRAPHY = {
    "seoul": {
        "name": "서울", "lat": 37.5, "lng": 127.0,
        "iceThickness": 5, "ocean": 20, "imageUrl": None,
    },
    "sahara": {
        "name": "사하라 사막", "lat": 23.4, "lng": 8.7,
        "iceThickness": 0, "ocean": 0,
        # NASA ISS 우주비행사 사진(ISS061-E-98063).
        "imageUrl": "/assets/location-sahara.jpg",
    },
    "antarctica": {
        "name": "남극", "lat": -75.3, "lng": 0.0,
        "iceThickness": 95, "ocean": 5, "imageUrl": None,
    },
    "pacific": {
        "name": "태평양 중심", "lat": 0.0, "lng": -160.0,
        "iceThickness": 0, "ocean": 98, "imageUrl": None,
    },
    "amazon": {
        "name": "아마존", "lat": -3.5, "lng": -60.0,
        "iceThickness": 0, "ocean": 10,
        # NASA ISS 우주비행사 사진(ISS013-E-74843, 히우네그루/아마조니아).
        "imageUrl": "/assets/location-amazon.jpg",
    },
}

ORDER = ["seoul", "sahara", "antarctica", "pacific", "amazon"]


def load_rows():
    if not CACHE_FILE.exists():
        raise FileNotFoundError(f"수집 결과가 없습니다: {CACHE_FILE}\npreset-kim.py를 먼저 실행하세요.")
    with open(CACHE_FILE, newline="", encoding="utf-8") as f:
        return [r for r in csv.DictReader(f) if r["value"] not in ("", None)]


def summarize(rows):
    """지점별로 필요한 값을 집계한다."""
    by_point = defaultdict(lambda: {"t2m": [], "tcld": [], "ps": [], "sun": []})

    # dswrsfc/rss는 같은 (날짜, 시각)끼리 짝을 지어야 비율을 낼 수 있다.
    pairs = defaultdict(dict)
    for r in rows:
        pid, var, value = r["point_id"], r["var"], float(r["value"])
        if var in ("t2m", "tcld", "ps"):
            by_point[pid][var].append(value)
        elif var in ("dswrsfc", "rss"):
            pairs[(pid, r["tmfc"], r["hf"])][var] = value

    for (pid, tmfc, hf), v in pairs.items():
        if "dswrsfc" in v and "rss" in v:
            by_point[pid]["sun"].append((tmfc, v["dswrsfc"], v["rss"]))

    return by_point


def build_point(pid, agg):
    geo = GEOGRAPHY[pid]
    warnings = []

    if not agg["t2m"]:
        raise ValueError(f"{pid}: t2m 표본이 없습니다")
    t2m = sum(agg["t2m"]) / len(agg["t2m"])
    cloud = round(sum(agg["tcld"]) / len(agg["tcld"]) * 100) if agg["tcld"] else None
    if cloud is None:
        raise ValueError(f"{pid}: tcld 표본이 없습니다")

    # 알베도: 밝은 표본만 모아 합끼리 나눈다.
    usable = [(d, r) for _, d, r in agg["sun"] if d >= MIN_DSWRSFC]
    dropped = len(agg["sun"]) - len(usable)
    if dropped:
        warnings.append(f"일사 약한 표본 {dropped}건 제외(dswrsfc < {MIN_DSWRSFC})")
    if usable:
        surface_albedo = 1 - sum(r for _, r in usable) / sum(d for d, _ in usable)
    else:
        surface_albedo = None
        warnings.append("알베도 표본 없음 - surfaceAlbedo를 비웁니다(엔진이 슬라이더로 계산)")

    atm = sum(agg["ps"]) / len(agg["ps"]) / STANDARD_PRESSURE_PA if agg["ps"] else 1.0
    if not agg["ps"]:
        warnings.append("ps 표본 없음 - atmThickness 1.0")

    return {
        "id": pid,
        "name": geo["name"],
        "lat": geo["lat"],
        "lng": geo["lng"],
        "values": {
            "iceThickness": geo["iceThickness"],
            "ocean": geo["ocean"],
            "cloud": cloud,
            "atmThickness": round(atm, 3),
            "co2": CO2_BASELINE_PPM,
        },
        "t2m": round(t2m, 1),
        "surfaceAlbedo": None if surface_albedo is None else round(surface_albedo, 3),
        "imageUrl": geo["imageUrl"],
        "_samples": {"t2m": len(agg["t2m"]), "sun": len(usable)},
        "_warnings": warnings,
    }


def render_js(points, meta):
    def js(v):
        if v is None:
            return "null"
        if isinstance(v, str):
            return f'"{v}"'
        return repr(v)

    lines = [
        "// ⚠️ 자동 생성 파일 — 직접 수정하지 마세요.",
        "// data-pipeline/Analysis/build_presets.py 를 실행하면 다시 생성됩니다.",
        "//",
        "// 행성 만들기의 '특정 지점 선택'에 쓰는 지점별 실측값입니다.",
        f"// 출처: 기상청 KIM(수치예보모델) 지점 조회, 표본 {meta['dates']}",
        "//",
        "//   t2m          기온 실측 평균(K) - 그 지점의 시작 온도",
        "//   cloud        전운량 tcld(0~1) 평균 × 100",
        "//   surfaceAlbedo 1 − Σrss / Σdswrsfc (그 지점 지표면 전체의 반사율)",
        "//   atmThickness 지면기압 ps / 101325",
        "//   co2          지점별 관측이 없어 전지구 기준값 공통 적용",
        "//   iceThickness/ocean  측정값이 아니라 지리적 사실(build_presets.py의 GEOGRAPHY)",
        "//",
        "// 한계: KIM 조회 구간이 약 180일이라 가을·겨울 표본이 없습니다.",
        "// 단파복사(알베도)는 남극에 태양이 남아 있는 2~3월로 따로 고정했습니다.",
        "// 자세한 내용은 README '알려진 한계' 참고.",
        "",
        "export const CLIMATE_POINTS = [",
    ]
    for p in points:
        v = p["values"]
        lines += [
            "  {",
            f'    id: "{p["id"]}",',
            f'    name: "{p["name"]}",',
            f"    lat: {p['lat']},",
            f"    lng: {p['lng']},",
            f"    values: {{ iceThickness: {v['iceThickness']}, ocean: {v['ocean']}, "
            f"cloud: {v['cloud']}, atmThickness: {v['atmThickness']}, co2: {v['co2']} }},",
            f"    t2m: {p['t2m']},",
            f"    surfaceAlbedo: {js(p['surfaceAlbedo'])},",
            f"    imageUrl: {js(p['imageUrl'])},",
            "  },",
        ]
    lines += ["];", ""]
    return "\n".join(lines)


def main():
    rows = load_rows()
    by_point = summarize(rows)
    dates = sorted({r["tmfc"][:8] for r in rows})
    logger.info(f"수집 표본 {len(rows)}건, 지점 {len(by_point)}개, 날짜 {len(dates)}일")

    # 수집이 중간에 끊긴 캐시로 돌리면 지점이 빠진 채 파일을 덮어쓰게 된다. 이 파일이
    # 게임의 지점 목록 그 자체(유일한 생성자)라, 지도에서 마커가 조용히 사라진다.
    # 그래서 하나라도 없으면 아예 생성하지 않는다.
    missing = [pid for pid in ORDER if pid not in by_point]
    if missing:
        raise ValueError(
            f"표본이 없는 지점: {', '.join(missing)}\n"
            f"수집이 끝나지 않았습니다. preset-kim.py를 다시 실행하세요"
            f"(캐시에 있는 건 건너뛰고 없는 것만 받습니다)."
        )

    points = []
    for pid in ORDER:
        p = build_point(pid, by_point[pid])
        points.append(p)
        alb = "없음" if p["surfaceAlbedo"] is None else f"{p['surfaceAlbedo']:.3f}"
        logger.info(
            f"  {p['name']:<10} t2m {p['t2m']:>6.1f}K  구름 {p['values']['cloud']:>3}%  "
            f"알베도 {alb:>6}  대기 {p['values']['atmThickness']:.3f}  "
            f"(표본 t2m {p['_samples']['t2m']}, 일사 {p['_samples']['sun']})"
        )
        for w in p["_warnings"]:
            logger.warning(f"      {w}")

    if not points:
        raise ValueError("생성할 지점이 없습니다")

    OUTPUT_JS.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT_JS.write_text(render_js(points, {"dates": f"{dates[0]}~{dates[-1]} {len(dates)}일"}), encoding="utf-8")
    logger.info(f"생성 완료: {OUTPUT_JS}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"실패: {e}")
        sys.exit(1)
