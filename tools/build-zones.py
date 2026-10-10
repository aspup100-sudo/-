#!/usr/bin/env python3
# 지도에 그리는 재개발·재건축 구역 경계를 만들어요. 서울시가 자료를 새로 올리면(반기마다) 다시 돌려요.
#   python3 tools/build-zones.py <UPIS_C_UQ120.shp 가 있는 폴더> <seoul_municipalities_geo.json> [기준월 예: 2026-09]
# 입력 1: 서울 열린데이터광장 OA-22712 "서울시 도시계획사업 현황(서울플랜+) 공간정보" zip 안의 shp파일
#         (공공누리 제4유형: 출처표시·상업적 이용금지·변경금지. 경계선은 줄이거나 고치지 않고 좌표계만 바꿔요.)
# 입력 2: southkorea/seoul-maps 의 juso/2015/json/seoul_municipalities_geo.json (구 경계, 어느 구에 걸치는지 가르는 데만 써요)
# 출력: data/zones/<구코드>.json  { src, date, z: [{ id, n: 이름, k: [[사업 유형, 추진 단계], ...], m2, c: 이름표 [경도, 위도], p: [[[경도, 위도], ...], ...] }] }
#       구 경계에 걸친 구역은 걸친 구 파일마다 들어가요.
# 필요: pip install pyshp pyproj openpyxl shapely
import sys, os, json, glob
import re
import shapefile, openpyxl
from shapely.geometry import shape
from shapely.ops import polylabel
from pyproj import Transformer

SRC, GU = sys.argv[1], sys.argv[2]
DATE = sys.argv[3] if len(sys.argv) > 3 else "2026-09"  # 자료 기준월 (zip 이름 끝의 202609)
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "zones")

# 임장에 쓸 사업만 (한 건물짜리 청년안심주택·미리내집, 넓은 지구·도시재생·리모델링, 집을 고쳐 쓰는 주거환경개선(관리형) 등은 뺌)
KEEP = {"BZ101", "BZ102", "BZ103", "BZ104", "BZ105", "BZ108",
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
# 같은 구역이 사업 유형만 달리해 여러 번 올라온 경우(예: 신속통합기획 기획완료 + 재개발 구역지정 + 재정비촉진구역)는 하나로 합쳐요.
# 그린 사람마다 경계가 조금씩 달라서, 고시 면적이 1% 안으로 같거나, 작은 쪽의 85% 이상이 겹치고 크기가 60% 이상 비슷하면 같은 구역으로 봐요.
# 경계선은 정식 사업(재개발·재건축) > 재정비촉진 > 소규모 > 신속통합기획 순으로 고르고, 이름은 "창신9구역"처럼 부르는 이름을 앞세워요.
RANK = {"BZ102": 0, "BZ103": 0, "BZ104": 0, "BZ105": 0, "BZ108": 0, "BZ402": 1, "BZ403": 1, "BZ404": 1, "BZ101": 3}
by_gu, items = {}, []
for sr in r.iterShapeRecords():
    rec = dict(zip(names, sr.record))
    if rec["SCLAS_CL"] not in KEEP or not sr.shape.points: continue
    st = STAGE.get(rec["PROPEL_CD"], "")
    if st == "준공": continue  # 다 지어진 곳은 임장 대상이 아니라서 빼요
    pts, parts = sr.shape.points, list(sr.shape.parts) + [len(sr.shape.points)]
    rings = []
    for a, b in zip(parts, parts[1:]):
        lon, lat = tr.transform([p[0] for p in pts[a:b]], [p[1] for p in pts[a:b]])
        rings.append([[round(x, 6), round(y, 6)] for x, y in zip(lon, lat)])
    geom = shape(sr.shape.__geo_interface__).buffer(0)  # 미터 좌표(겹침 계산용)
    item = {"id": rec["PRESENT_SN"], "n": rec["DGM_NM"].strip(), "k": [[TYPE.get(rec["SCLAS_CL"], ""), st]],
            "m2": round(rec["DGM_AR"] or 0), "p": rings, "_g": geom, "_r": RANK.get(rec["SCLAS_CL"], 2), "_a": rec["DGM_AR"] or geom.area}
    dup = None
    for o in items:
        if not o["_g"].intersects(geom): continue
        if abs(o["_a"] - item["_a"]) <= 0.01 * max(item["_a"], 1): dup = o; break
        small, big = sorted((o["_g"].area, geom.area))
        if big and small / big >= 0.6 and o["_g"].intersection(geom).area >= 0.85 * small: dup = o; break
    if not dup:
        items.append(item); continue
    for kk in item["k"]:
        if kk not in dup["k"]: dup["k"].append(kk)
    if item["_r"] < dup["_r"]: dup.update(p=item["p"], id=item["id"], _g=geom, _r=item["_r"], m2=item["m2"] or dup["m2"])
    named = lambda n: bool(re.search(r"\d+구역$|^\S+\d+(-\d+)?$", n))  # "창신9구역", "창신3"처럼 부르는 이름
    if named(item["n"]) and (not named(dup["n"]) or len(item["n"]) < len(dup["n"])): dup["n"] = item["n"]

for item in items:
    # 이름표 자리: 가장 큰 조각 안에서 경계와 가장 먼 점 (경위도로 바꿔 저장)
    g = item["_g"]; big = max(getattr(g, "geoms", [g]), key=lambda x: x.area)
    pt = polylabel(big, tolerance=2)
    lon, lat = tr.transform(pt.x, pt.y); item["c"] = [round(lon, 6), round(lat, 6)]
    for k in ("_g", "_r", "_a"): item.pop(k)
    for code, gpolys in gus:
        if any(inside(x, y, gp) for ring in item["p"] for x, y in ring[::max(1, len(ring) // 20)] for gp in gpolys):
            by_gu.setdefault(code, []).append(item)

os.makedirs(OUT, exist_ok=True)
meta = {"src": "서울 열린데이터광장 '서울시 도시계획사업 현황(서울플랜+) 공간정보' (공공누리 제4유형)", "date": DATE}
for code, items in sorted(by_gu.items()):
    with open(os.path.join(OUT, code + ".json"), "w", encoding="utf-8") as f:
        json.dump(dict(meta, z=items), f, ensure_ascii=False, separators=(",", ":"))
print("구역", sum(len(v) for v in by_gu.values()), "곳(구 경계에 걸친 곳은 겹쳐 셈) →", len(by_gu), "개 구")
