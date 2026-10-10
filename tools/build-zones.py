#!/usr/bin/env python3
# 지도에 그리는 재개발·재건축 구역 경계를 만들어요. 서울시가 자료를 새로 올리면(반기마다) 다시 돌려요.
#   python3 tools/build-zones.py <UPIS_C_UQ120.shp 가 있는 폴더> <seoul_municipalities_geo.json> [기준월 예: 2026-09]
# 입력 1: 서울 열린데이터광장 OA-22712 "서울시 도시계획사업 현황(서울플랜+) 공간정보" zip 안의 shp파일
#         (공공누리 제4유형: 출처표시·상업적 이용금지·변경금지. 경계선은 줄이거나 고치지 않고 좌표계만 바꿔요.)
# 입력 2: southkorea/seoul-maps 의 juso/2015/json/seoul_municipalities_geo.json (구 경계, 어느 구에 걸치는지 가르는 데만 써요)
# 출력: data/zones/<구코드>.json  { src, date, z: [{ id, n: 이름, k: [[사업 유형, 추진 단계], ...], m2, p: [[[경도, 위도], ...], ...] }] }
#       구 경계에 걸친 구역은 걸친 구 파일마다 들어가요.
# 필요: pip install pyshp pyproj openpyxl
import sys, os, json, glob
import shapefile, openpyxl
from pyproj import Transformer

SRC, GU = sys.argv[1], sys.argv[2]
DATE = sys.argv[3] if len(sys.argv) > 3 else "2026-09"  # 자료 기준월 (zip 이름 끝의 202609)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "zones")

# 임장에 쓸 사업만 (한 건물짜리 청년안심주택·미리내집, 넓은 지구·도시재생·리모델링 등은 뺌)
KEEP = {"BZ101", "BZ102", "BZ103", "BZ104", "BZ105", "BZ107", "BZ108",
        "BZ201", "BZ202", "BZ203", "BZ204", "BZ205",
        "BZ301", "BZ302", "BZ402", "BZ403", "BZ404", "BZ501", "BZ502"}

# 코드표(xlsx)에서 사업 유형·추진 단계 이름
code_xlsx = glob.glob(os.path.join(SRC, "*.xlsx"))[0]
wb = openpyxl.load_workbook(code_xlsx)
TYPE, STAGE = {}, {}
for row in wb.worksheets[0].iter_rows(min_row=2, values_only=True):
    if row[4]: TYPE[row[4]] = str(row[3]).strip()
for row in wb.worksheets[1].iter_rows(min_row=2, values_only=True):
    if row[2]: STAGE[row[2]] = str(row[3]).strip()

# 좌표계: Korean 1985 / Modified Central Belt (prj 파일 그대로) → WGS84 경위도
tr = Transformer.from_crs("+proj=tmerc +lat_0=38 +lon_0=127.0028902777778 +k=1 +x_0=200000 +y_0=500000 +ellps=bessel "
                          "+towgs84=-115.80,474.99,674.11,1.16,-2.31,-1.63,6.43 +units=m +no_defs", "EPSG:4326", always_xy=True)

def inside(x, y, ring):
    c = False
    for i in range(len(ring)):
        x1, y1 = ring[i - 1]; x2, y2 = ring[i]
        if (y2 > y) != (y1 > y) and x < (x1 - x2) * (y - y2) / (y1 - y2) + x2: c = not c
    return c

gus = []
for f in json.load(open(GU, encoding="utf-8"))["features"]:
    g = f["geometry"]; polys = [g["coordinates"]] if g["type"] == "Polygon" else g["coordinates"]
    gus.append((f["properties"]["SIG_CD"], [p[0] for p in polys]))

shp = glob.glob(os.path.join(SRC, "*.shp"))[0]
r = shapefile.Reader(shp[:-4], encoding="cp949")
names = [f[0] for f in r.fields[1:]]
by_gu, items = {}, []
for sr in r.iterShapeRecords():
    rec = dict(zip(names, sr.record))
    if rec["SCLAS_CL"] not in KEEP or not sr.shape.points: continue
    pts, parts = sr.shape.points, list(sr.shape.parts) + [len(sr.shape.points)]
    rings = []
    for a, b in zip(parts, parts[1:]):
        lon, lat = tr.transform([p[0] for p in pts[a:b]], [p[1] for p in pts[a:b]])
        rings.append([[round(x, 6), round(y, 6)] for x, y in zip(lon, lat)])
    item = {"id": rec["PRESENT_SN"], "n": rec["DGM_NM"].strip(), "t": TYPE.get(rec["SCLAS_CL"], ""),
            "s": STAGE.get(rec["PROPEL_CD"], ""), "m2": round(rec["DGM_AR"] or 0), "p": rings}
    # 같은 구역이 유형만 달리해 두 번 올라온 경우(예: 신속통합기획 기획완료 + 재개발 구역지정)는 하나로 합쳐요.
    # 그린 사람이 달라 경계선이 조금씩 달라서, 면적이 1% 안으로 같고 테두리 상자 가운데가 250m 안이면 같은 구역으로 봐요.
    # 경계선은 정식 사업(구역지정 등) 쪽 것을 쓰고, 이름은 "창신9구역"처럼 부르는 이름이 있으면 그걸 써요. k: [유형, 단계] 모음
    xs = [p[0] for r_ in rings for p in r_]; ys = [p[1] for r_ in rings for p in r_]; cx = (min(xs) + max(xs)) / 2; cy = (min(ys) + max(ys)) / 2
    area = rec["DGM_AR"] or rec["SHAPE_AREA"] or 0  # 고시 면적 (그린 면적은 그린 사람마다 조금씩 달라요)
    dup = next((o for o in items if abs(o["_a"] - area) <= 0.01 * max(area, 1) and abs(o["_c"][0] - cx) * 88000 < 250 and abs(o["_c"][1] - cy) * 111000 < 250), None)
    if dup:
        if [item["t"], item["s"]] not in dup["k"]: dup["k"].append([item["t"], item["s"]])
        if dup["t"] == "신속통합기획" and item["t"] != "신속통합기획": dup["p"], dup["id"], dup["t"] = item["p"], item["id"], item["t"]
        if item["n"].endswith("구역") and not dup["n"].endswith("구역"): dup["n"] = item["n"]
        continue
    item.update(k=[[item["t"], item["s"]]], _a=area, _c=(cx, cy)); items.append(item)

for item in items:
    for k in ("t", "s", "_a", "_c"): item.pop(k)
    for code, gpolys in gus:
        if any(inside(x, y, gp) for ring in item["p"] for x, y in ring[::max(1, len(ring) // 20)] for gp in gpolys):
            by_gu.setdefault(code, []).append(item)

os.makedirs(OUT, exist_ok=True)
meta = {"src": "서울 열린데이터광장 '서울시 도시계획사업 현황(서울플랜+) 공간정보' (공공누리 제4유형)", "date": DATE}
for code, items in sorted(by_gu.items()):
    with open(os.path.join(OUT, code + ".json"), "w", encoding="utf-8") as f:
        json.dump(dict(meta, z=items), f, ensure_ascii=False, separators=(",", ":"))
print("구역", sum(len(v) for v in by_gu.values()), "곳(구 경계에 걸친 곳은 겹쳐 셈) →", len(by_gu), "개 구")
