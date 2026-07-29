# physics-kim.py, physics-gk2a.py 결과를 한 행으로 합쳐서
# 물리엔진 담당자한테 넘길 최종 기준값 파일을 만든다.
# 두 스크립트를 먼저 실행해서 physics_kim_dataset.csv / physics_gk2a_dataset.csv를
# 만든 뒤 이 스크립트를 실행한다.

import os
import csv

DATASETS_DIR = "../Datasets"
KIM_FILE = os.path.join(DATASETS_DIR, "physics_kim_dataset.csv")
GK2A_FILE = os.path.join(DATASETS_DIR, "physics_gk2a_dataset.csv")
OUTPUT_FILE = os.path.join(DATASETS_DIR, "physics_reference.csv")

with open(KIM_FILE, newline="", encoding="utf-8-sig") as f:
    kim_row = next(csv.DictReader(f))

with open(GK2A_FILE, newline="", encoding="utf-8-sig") as f:
    gk2a_row = next(csv.DictReader(f))

kim_vars = [c for c in kim_row if c not in ("date_range", "n_days")]
gk2a_vars = [c for c in gk2a_row if c not in ("date_range", "n_days")]

merged = {
    "kim_date_range": kim_row["date_range"],
    "kim_n_days": kim_row["n_days"],
    "gk2a_date_range": gk2a_row["date_range"],
    "gk2a_n_days": gk2a_row["n_days"],
}
for var in kim_vars:
    merged[var] = kim_row[var]
for var in gk2a_vars:
    merged[var] = gk2a_row[var]

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=list(merged.keys()))
    writer.writeheader()
    writer.writerow(merged)

print(f"CSV 저장 완료 : {OUTPUT_FILE} (물리엔진 기준값 {len(kim_vars) + len(gk2a_vars)}개 변수)")
