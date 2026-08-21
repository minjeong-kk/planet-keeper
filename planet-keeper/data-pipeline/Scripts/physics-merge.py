# physics-kim.py 결과와 CO2 실측을 합쳐서 최종 기준값 파일을 만든다.
#
# GK2A(위성)는 이제 여기서 다루지 않는다 - SWRAD는 검토 후 미채택된 대조값이었고
# (LIMITATIONS.md 6번), 위성을 아예 안 쓰기로 하면서 physics_reference.csv에서도
# 뺐다. physics-gk2a.py/GK2A 원본 대조값은 legacy로 옮겨져 있고, 그 역사적 수치는
# LIMITATIONS.md에 고정된 텍스트로만 남아 있다.
#
# SOLAR_CONSTANT/CO2_BASELINE_PPM은 채택된 값이라 physicsEngine.js에 실제로 쓰인다.
# 예전엔 이 두 값을 CSV에서 눈으로 보고 손으로 physicsEngine.js를 고쳤는데, 그 수동
# 반영을 잊기 쉬워서 여기서 정규식으로 그 두 줄만 찾아 자동으로 덮어쓴다(파일 전체를
# 새로 생성하지 않음 - 나머지 물리 코드는 손으로 유지보수하는 영역이라 건드리지 않는다).

import os
import csv
import re

DATASETS_DIR = "../Datasets"
KIM_FILE = os.path.join(DATASETS_DIR, "physics_kim_dataset.csv")
CO2_FILE = os.path.join(DATASETS_DIR, "co2_data.csv")

OUTPUT_FILE = os.path.join(DATASETS_DIR, "physics_reference.csv")
PHYSICS_ENGINE_FILE = "../../src/utils/physicsEngine.js"

with open(KIM_FILE, newline="", encoding="utf-8-sig") as f:
    kim_row = next(csv.DictReader(f))

# CO2 평균 계산
co2_values = []

with open(CO2_FILE, newline="", encoding="utf-8-sig") as f:
    reader = csv.DictReader(f)

    for row in reader:
        co2_values.append(float(row["Atmospheric_CO2_ppm"]))

co2_mean = round(sum(co2_values) / len(co2_values), 2)


kim_vars = [c for c in kim_row if c not in ("date_range", "n_days")]

merged = {
    "kim_date_range": kim_row["date_range"],
    "kim_n_days": kim_row["n_days"],
    "co2": co2_mean,
}
for var in kim_vars:
    merged[var] = kim_row[var]

with open(OUTPUT_FILE, "w", newline="", encoding="utf-8-sig") as f:
    writer = csv.DictWriter(f, fieldnames=list(merged.keys()))
    writer.writeheader()
    writer.writerow(merged)

print(f"CO₂ 평균 : {co2_mean:.2f} ppm")
print(f"CSV 저장 완료 : {OUTPUT_FILE} (물리엔진 기준값 {len(kim_vars)}개 변수, GK2A 없음)")


def apply_constant(content, name, value):
    """physicsEngine.js에서 'export const {name} = <숫자>' 줄의 숫자만 바꾼다.
    그 줄 뒤에 붙은 주석은 그대로 둔다."""
    pattern = re.compile(rf"(export const {name} = )[\d.]+")
    if not pattern.search(content):
        raise ValueError(f"{PHYSICS_ENGINE_FILE}에서 'export const {name} = ...' 줄을 못 찾았습니다 - 변수명이 바뀌었을 수 있습니다.")
    return pattern.sub(rf"\g<1>{value}", content, count=1)


solar_constant = round(float(merged["dswrtoa"]), 2)

with open(PHYSICS_ENGINE_FILE, encoding="utf-8") as f:
    engine_src = f.read()

updated = apply_constant(engine_src, "SOLAR_CONSTANT", solar_constant)
updated = apply_constant(updated, "CO2_BASELINE_PPM", co2_mean)

if updated == engine_src:
    print(f"physicsEngine.js 변경 없음 (SOLAR_CONSTANT={solar_constant}, CO2_BASELINE_PPM={co2_mean}과 이미 같음)")
else:
    with open(PHYSICS_ENGINE_FILE, "w", encoding="utf-8") as f:
        f.write(updated)
    print(f"physicsEngine.js 갱신 완료 : SOLAR_CONSTANT={solar_constant}, CO2_BASELINE_PPM={co2_mean}")
