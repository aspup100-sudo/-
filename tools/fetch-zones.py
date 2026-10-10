#!/usr/bin/env python3
# 서울 열린데이터광장 OA-22712 "서울시 도시계획사업 현황(서울플랜+) 공간정보"에 새 파일이 올라왔는지 보고, 있으면 내려받아 풀어요.
# GitHub Actions(.github/workflows/zones.yml)에서 매주 써요.
#   python3 tools/fetch-zones.py <풀 폴더> [--force]
# 출력 마지막 줄: "NEW <shp 폴더> <기준월 YYYY-MM>" 또는 "SAME <기준월>"
import sys, os, re, json, io, zipfile, urllib.request, urllib.parse, html
PAGE = "https://data.seoul.go.kr/dataList/OA-22712/S/1/datasetView.do"
DL = "https://datafile.seoul.go.kr/bigfile/iot/inf/nio_download.do?&useCache=false"
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
out, force = sys.argv[1], "--force" in sys.argv
UA = {"User-Agent": "Mozilla/5.0"}
page = urllib.request.urlopen(urllib.request.Request(PAGE, headers=UA), timeout=60).read().decode("utf-8", "replace")
# 파일 목록: 이름(…_YYYYMM.zip)과 downloadFile('번호')
files = []
for m in re.finditer(r"downloadFile\('(\d+)'\)", page):
    near = page[max(0, m.start() - 1500):m.start() + 1500]
    names = re.findall(r"([^<>\"']*UQ120[^<>\"']*?_(\d{6})\.zip)", near)
    if names:
        nm, ym = min(names, key=lambda x: abs(near.find(x[0]) - 1500))
        files.append((ym, m.group(1), html.unescape(nm).strip()))
if not files: sys.exit("파일 목록을 못 찾았어요 (페이지 모양이 바뀐 듯해요)")
ym, seq, name = max(files)
newest = ym[:4] + "-" + ym[4:]
have = json.load(open(os.path.join(ROOT, "data", "zones", "11110.json"), encoding="utf-8")).get("date", "")
print("파일:", sorted(set(files)), "/ 앱 자료 기준월:", have)
if newest <= have and not force:
    print("SAME", have); sys.exit(0)
# 내려받기 폼(frmFile)의 숨은 값들을 그대로 보내고 seq만 바꿔요
form = re.search(r"<form[^>]*name=[\"']frmFile[\"'][^>]*>(.*?)</form>", page, re.S | re.I)
if not form: sys.exit("내려받기 폼(frmFile)을 못 찾았어요")
data = {}
for inp in re.finditer(r"<input[^>]*>", form.group(1), re.I):
    t = inp.group(0); n = re.search(r"name=[\"']([^\"']+)", t); v = re.search(r"value=[\"']([^\"']*)", t)
    if n: data[n.group(1)] = html.unescape(v.group(1)) if v else ""
data["seq"] = seq
print("폼:", {k: v for k, v in data.items()})
req = urllib.request.Request(DL, data=urllib.parse.urlencode(data).encode(), headers=dict(UA, Referer=PAGE))
blob = urllib.request.urlopen(req, timeout=300).read()
if blob[:2] != b"PK": sys.exit("zip이 아니에요: " + blob[:200].decode("utf-8", "replace"))
os.makedirs(out, exist_ok=True)
# 폴더 구조와 상관없이 파일을 한 폴더에 모아요 (build-zones.py가 shp와 코드표 xlsx를 같은 폴더에서 찾아요)
z = zipfile.ZipFile(io.BytesIO(blob)); names = []
for i in z.infolist():
    if i.is_dir(): continue
    fn = i.filename
    if not (i.flag_bits & 0x800):
        try: fn = fn.encode("cp437").decode("cp949")
        except Exception: pass
    fn = os.path.basename(fn.replace("\\", "/")); names.append(fn)
    open(os.path.join(out, fn), "wb").write(z.read(i))
print("zip 안:", names)
if not any(n.upper().startswith("UPIS_C_UQ120") and n.lower().endswith(".shp") for n in names): sys.exit("zip 안에 UPIS_C_UQ120 shp가 없어요")
if not any(n.lower().endswith(".xlsx") for n in names): sys.exit("zip 안에 코드표 xlsx가 없어요")
shp = [out]
print("받음:", name, len(blob), "바이트")
print("NEW", shp[0], newest)
