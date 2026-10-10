#!/usr/bin/env python3
# 구역 카드의 실거래 자료를 만들어요. 서울시 자료가 매일 바뀌니 가끔 다시 돌려요.
#   python3 tools/build-deals.py <deals-full-날짜.json 또는 CSV> [...]
# 입력: 서울 열린데이터광장 OA-21275 "서울시 부동산 실거래가 정보". 브라우저 조각 DEALS_FULL이 저장한 json({fields, rows}) 또는 내려받은 CSV.
# 출력: data/deals/<구코드>.json  { src, date, from, gu, d: { 동: [[계약일 YYYYMMDD, 용도, 금액(만원), 건물㎡, 토지㎡, 층, 건축년도, 지번, 건물명], ...] } }
# 지번이 가려졌거나 없는 거래는 지번 칸을 비워요(위치를 몰라 구역 안팎을 못 가려요). 취소된 거래는 빼요.
import sys, os, csv, json, re, io, datetime
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..")
OUT = os.path.join(ROOT, "data", "deals")

def rows(path):
    if path.endswith(".json"):
        d = json.load(open(path, encoding="utf-8"))
        return [dict(zip(d["fields"], r)) for r in d["rows"]]
    raw = open(path, "rb").read()
    for enc in ("utf-8-sig", "cp949"):
        try: text = raw.decode(enc); break
        except UnicodeDecodeError: pass
    return csv.DictReader(io.StringIO(text))

def col(r, *names):
    for n in names:
        for k in r:
            if k and (k.strip() == n or k.strip().startswith(n) and not n.isupper()): return str(r[k] if r[k] is not None else "").strip()
    return ""

def num(s):
    s = re.sub(r"[^\d.]", "", s or "")
    return float(s) if s else 0

by, first, last = {}, 9999, ""
for p in sys.argv[1:]:
    for r in rows(p):
        if col(r, "RTRCN_DAY", "취소일", "해제"): continue
        gu = col(r, "CGG_CD", "자치구코드", "시군구코드"); gname = col(r, "CGG_NM", "자치구명", "시군구명")
        dn = col(r, "STDG_NM", "법정동명"); ymd = re.sub(r"\D", "", col(r, "CTRT_DAY", "계약일"))
        if not (gu and dn and len(ymd) == 8): continue
        b1 = re.sub(r"^0+", "", col(r, "MNO", "본번")) or ""; b2 = re.sub(r"^0+", "", col(r, "SNO", "부번")) or ""
        jb = "" if (not b1 or "*" in b1 + b2) else (b1 + ("-" + b2 if b2 else ""))
        if col(r, "LOTNO_SE_NM", "지번구분명") == "산" and jb: jb = "산 " + jb
        fl = col(r, "FLR", "층"); yr = col(r, "ARCH_YR", "건축년도")
        row = [ymd, col(r, "BLDG_USG", "건물용도"), int(num(col(r, "THING_AMT", "물건금액"))), round(num(col(r, "ARCH_AREA", "건물면적")), 2) or 0,
               round(num(col(r, "LAND_AREA", "토지면적", "대지권면적")), 2) or 0, fl, int(num(yr)) if yr else 0, jb, col(r, "BLDG_NM", "건물명")]
        g = by.setdefault(gu[:5], {"gu": gname, "d": {}})
        g["d"].setdefault(dn, []).append(row)
        first = min(first, int(ymd[:4])); last = max(last, ymd)
os.makedirs(OUT, exist_ok=True)
for code, g in by.items():
    for dn in g["d"]: g["d"][dn].sort(reverse=True)
    out = {"src": "서울 열린데이터광장 '서울시 부동산 실거래가 정보'", "date": last[:4] + "-" + last[4:6] + "-" + last[6:], "from": first, "gu": g["gu"], "d": g["d"]}
    json.dump(out, open(os.path.join(OUT, code + ".json"), "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
print("구", len(by), "곳, 거래", sum(len(v) for g in by.values() for v in g["d"].values()), "건,", first, "~", last)
