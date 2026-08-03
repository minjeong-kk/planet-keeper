"""Python(학습)과 JS(게임)가 같은 규칙·같은 피처를 쓰는지 검사한다.

이 파이프라인에서 가장 조용히 깨지는 지점이 언어 경계다. 어긋나도 에러가 나지 않고
그냥 틀린 예측이 나가므로, 사람 눈으로 주석을 비교하는 대신 여기서 기계적으로 검사한다.

검사 항목
---------
1. FEATURES 일치       config.py FEATURES == climateClassifier.js FEATURE_ORDER (이름·순서)
2. 라벨 누수 없음       FEATURES에 LEAKY_COLUMNS가 섞여 있지 않은지
3. 임계값 일치         label_rules.py == src/data/climateThresholds.js
4. 라벨 규칙 일치       label_rules.assign_label == physicsEngine.planetStateOf (격자 전수 비교)
5. 데이터셋 라벨 정합   final_ml_dataset.csv의 state가 규칙으로 재현되는지
6. 배포본 일치         Models/climate_rf.onnx == public/models/climate_rf.onnx

사용법:
    python3 verify_sync.py
"""

import hashlib
import json
import logging
import re
import subprocess
import sys

import numpy as np
import pandas as pd

import config
import label_rules

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger(__name__)

SRC_DIR = config.DATA_PIPELINE_DIR.parent / "src"
CLASSIFIER_JS = SRC_DIR / "utils" / "climateClassifier.js"
THRESHOLDS_JS = SRC_DIR / "data" / "climateThresholds.js"
PHYSICS_JS = SRC_DIR / "utils" / "physicsEngine.js"

failures: list[str] = []


def check(name: str, ok: bool, detail: str = "") -> None:
    logger.info(f"{'✅' if ok else '❌'} {name}{f' — {detail}' if detail else ''}")
    if not ok:
        failures.append(f"{name}: {detail}")


def js_number(source: str, const_name: str) -> float:
    m = re.search(rf"export const {const_name}\s*=\s*([-\d.eE+]+)", source)
    if not m:
        raise ValueError(f"{const_name}을 JS에서 찾을 수 없습니다.")
    return float(m.group(1))


def node_planet_states(grid: pd.DataFrame) -> list[int]:
    """physicsEngine.planetStateOf를 Node로 실행해 라벨을 받아온다."""
    # Windows에서는 절대경로를 file:// URL로 줘야 ESM 로더가 받아준다.
    script = (
        "import { planetStateOf } from "
        f"'{PHYSICS_JS.as_uri()}';"
        "let s='';process.stdin.on('data',c=>s+=c);"
        "process.stdin.on('end',()=>{const rows=JSON.parse(s);"
        "process.stdout.write(JSON.stringify("
        "rows.map(r=>planetStateOf(r.delta_energy, r.temperature))));});"
    )
    proc = subprocess.run(
        ["node", "--input-type=module", "-e", script],
        input=grid.to_json(orient="records"),
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        raise RuntimeError(f"Node 실행 실패:\n{proc.stderr}")
    return json.loads(proc.stdout)


def main() -> None:
    classifier_src = CLASSIFIER_JS.read_text(encoding="utf-8")
    thresholds_src = THRESHOLDS_JS.read_text(encoding="utf-8")

    # 1. FEATURES 일치
    m = re.search(r"FEATURE_ORDER\s*=\s*\[(.*?)\]", classifier_src, re.S)
    js_features = re.findall(r"['\"]([^'\"]+)['\"]", m.group(1)) if m else []
    check(
        "FEATURES 이름·순서 일치",
        js_features == config.FEATURES,
        f"python={config.FEATURES} / js={js_features}",
    )

    # 2. 라벨 누수 없음
    leaked = [c for c in config.LEAKY_COLUMNS if c in config.FEATURES]
    check("FEATURES에 라벨 결정 컬럼 없음", not leaked, f"발견: {leaked}" if leaked else "")

    # 3. 임계값 일치
    pairs = [
        ("EPSILON_ENERGY_BALANCE", label_rules.EPSILON_ENERGY_BALANCE),
        ("COLD_STABLE_MAX_K", label_rules.COLD_STABLE_MAX_K),
        ("EARTH_LIKE_MAX_K", label_rules.EARTH_LIKE_MAX_K),
    ]
    mismatched = [
        f"{n}: py={v} js={js_number(thresholds_src, n)}"
        for n, v in pairs
        if abs(js_number(thresholds_src, n) - v) > 1e-9
    ]
    check("임계값 Python/JS 일치", not mismatched, "; ".join(mismatched))

    # 4. 라벨 규칙 일치 (경계 포함 격자 전수 비교)
    eps = label_rules.EPSILON_ENERGY_BALANCE
    cold, earth = label_rules.COLD_STABLE_MAX_K, label_rules.EARTH_LIKE_MAX_K
    grid = pd.DataFrame(
        [
            (de, t)
            for de in (-eps - 1, -eps, -eps / 2, 0, eps / 2, eps, eps + 1)
            for t in (cold - 1, cold, (cold + earth) / 2, earth, earth + 1, 200.0, 380.0)
        ],
        columns=["delta_energy", "temperature"],
    )
    py_states = label_rules.assign_labels(grid, "delta_energy", "temperature").tolist()
    js_states = node_planet_states(grid)
    diff = [
        f"(ΔE={r.delta_energy}, T={r.temperature}) py={p} js={j}"
        for r, p, j in zip(grid.itertuples(index=False), py_states, js_states)
        if p != j
    ]
    check(
        f"라벨 규칙 일치 ({len(grid)}개 격자점)",
        not diff,
        "; ".join(diff[:3]) if diff else "",
    )

    # 5. 데이터셋 라벨 정합
    if config.FINAL_DATASET.exists():
        df = pd.read_csv(config.FINAL_DATASET)
        recomputed = label_rules.assign_labels(df, "delta_energy", "temperature")
        match = float((recomputed == df[config.LABEL_COLUMN]).mean())
        check(
            "데이터셋 state가 규칙과 일치",
            match == 1.0,
            f"{match:.4%}",
        )
        # 누수 컬럼이 CSV에 남아 있는 건 정상(진단용). FEATURES에만 없으면 된다.
        logger.info(
            f"   데이터셋 {len(df):,}행, 클래스 분포 "
            f"{df[config.LABEL_COLUMN].value_counts().sort_index().to_dict()}"
        )
    else:
        check("데이터셋 존재", False, f"{config.FINAL_DATASET} 없음")

    # 6. 배포본 일치
    if config.MODEL_ONNX.exists() and config.PUBLIC_MODEL_ONNX.exists():
        h1 = hashlib.sha256(config.MODEL_ONNX.read_bytes()).hexdigest()
        h2 = hashlib.sha256(config.PUBLIC_MODEL_ONNX.read_bytes()).hexdigest()
        check(
            "Models/ 와 public/models/ ONNX 동일",
            h1 == h2,
            f"{h1[:12]} vs {h2[:12]}",
        )
        logger.info(
            f"   ONNX 크기 {config.MODEL_ONNX.stat().st_size / 1024:.1f} KB"
        )
    else:
        check("ONNX 파일 존재", False, "export_onnx.py를 먼저 실행하세요")

    print()
    if failures:
        logger.error(f"{len(failures)}개 항목 실패:")
        for f in failures:
            logger.error(f"  - {f}")
        sys.exit(1)
    logger.info("모든 동기화 검사 통과 ✅")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        logger.error(f"검사 실행 실패: {e}")
        sys.exit(1)
