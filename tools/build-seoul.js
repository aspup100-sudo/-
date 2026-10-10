#!/usr/bin/env node
// 서울 전체 중개업소 데이터를 구별 파일로 만들어요.
//   node tools/build-seoul.js <seoul-brokers.json> <YYYY-MM-DD>
// 입력: 서울 열린데이터광장 "서울시 부동산 중개업소 정보"(landBizInfo)를 받은 파일
//       { rows: [[등록번호, 시스템등록번호, 상호, 주소(서울특별시 뺀 것), 전화, 구, 동, 법정동코드, 상태], ...] }
// 출력: data/gu/<구코드>.json  { gu, code, updated, dongs: { 동: [[id, 등록번호, 상호, 주소(구 뺀 것), 전화, 표시], ...] } }
//       data/gu/index.json     { updated, total, gu: [{ code, name, n, dongs: [[동, 곳수], ...] }] }
// id: 창신·구의에 이미 쓰던 id(b01, k001 …)는 그대로, 나머지는 "s"+시스템등록번호. 리뷰와 각자 메모가 이 id에 붙어요.
// 표시: ""(영업중) | "휴업" | "업무정지" | "new:날짜"(새로 등록) | "gone:날짜"(자료에서 사라짐, 30일 뒤 삭제)
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "data", "gu");
const { nameOf, phoneOf } = require("./apply-update.js");
const GONE_KEEP_DAYS = 30, NEW_TAG_DAYS = 14;
const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);

function legacyIds() {
  const map = {};
  ["data.js", "data-guui.js"].forEach(f => {
    fs.readFileSync(path.join(ROOT, f), "utf8").split("\n").forEach(ln => {
      const m = ln.match(/^\s*(\[.*\]),?\s*$/); if (!m) return;
      try { const r = JSON.parse(m[1]); if (Array.isArray(r) && r[8] && /^[a-z]\d+$/.test(r[0])) map[r[8]] = r[0]; } catch (e) {}
    });
  });
  return map;
}

function build(file, date) {
  const src = JSON.parse(fs.readFileSync(file, "utf8")), legacy = legacyIds(), log = [];
  const dongOf = {}; src.rows.forEach(r => { if (r[5] && r[6] && r[7]) dongOf[r[7]] = [r[5], r[6]]; });
  // 이전 결과(있으면)를 읽어서 새로 생긴 곳·사라진 곳을 가려요
  const prev = {}; let hadPrev = false;
  if (fs.existsSync(OUT)) fs.readdirSync(OUT).filter(f => /^\d{5}\.json$/.test(f)).forEach(f => {
    hadPrev = true; const d = JSON.parse(fs.readFileSync(path.join(OUT, f), "utf8"));
    Object.keys(d.dongs).forEach(dn => d.dongs[dn].forEach(row => { prev[row[0]] = { code: d.code, dong: dn, row }; }));
  });
  const gus = {}, seen = {}; let added = 0, back = 0;
  src.rows.forEach(r => {
    const reg = r[0], sys = r[1]; if (!sys || seen[sys]) return; seen[sys] = 1;
    let gu = r[5], dong = r[6]; const stdg = r[7] || "";
    if ((!gu || !dong) && dongOf[stdg]) { gu = dongOf[stdg][0]; dong = dongOf[stdg][1]; }
    if (!gu) gu = (r[3].match(/^(\S+구)\s/) || [])[1] || "";
    if (!dong) dong = (r[3].match(/\(([가-힣0-9]+동|[가-힣]+\d*가)[,)]/) || [])[1] || "동 미상";
    const code = stdg.slice(0, 5); if (!gu || !/^11\d{3}$/.test(code)) return;
    const id = legacy[reg] || "s" + sys, addr = r[3].replace(new RegExp("^" + gu + "\\s+"), "").replace(/\s+,/g, ",").trim();
    let mark = r[8] === "영업중" ? "" : r[8];
    const p = prev[id];
    if (hadPrev && !p) { mark = mark || "new:" + date; added++; log.push(`새로 등록: ${gu} ${dong} ${nameOf(r[2])} (${addr})`); }
    else if (p) {
      const pm = p.row[5] || "";
      if (/^gone:/.test(pm)) { back++; log.push(`다시 나타남: ${gu} ${dong} ${nameOf(r[2])}`); }
      else if (/^new:/.test(pm) && !mark && days(date, pm.slice(4)) <= NEW_TAG_DAYS) mark = pm;
    }
    const g = (gus[code] = gus[code] || { gu, code, dongs: {} });
    (g.dongs[dong] = g.dongs[dong] || []).push([id, reg, nameOf(r[2]), addr, phoneOf(r[4]), mark]);
    seen["id:" + id] = 1;
  });
  // 자료에서 사라진 곳: 표시만 붙여 두고 30일 뒤에 빼요
  let gone = 0, dropped = 0;
  Object.keys(prev).forEach(id => {
    if (seen["id:" + id]) return; const p = prev[id], pm = p.row[5] || "";
    const since = /^gone:/.test(pm) ? pm.slice(5) : date;
    if (days(date, since) > GONE_KEEP_DAYS) { dropped++; return; }
    if (!/^gone:/.test(pm)) { gone++; log.push(`자료에서 사라짐: ${p.dong} ${p.row[2]} (${p.row[3]})`); }
    const g = gus[p.code]; if (!g) return;
    const row = p.row.slice(); row[5] = "gone:" + since; (g.dongs[p.dong] = g.dongs[p.dong] || []).push(row);
  });
  fs.mkdirSync(OUT, { recursive: true });
  const index = { updated: date, source: "서울 열린데이터광장 · 서울시 부동산 중개업소 정보", total: 0, gu: [] };
  Object.keys(gus).sort((a, b) => gus[a].gu.localeCompare(gus[b].gu, "ko")).forEach(code => {
    const g = gus[code], dn = Object.keys(g.dongs).sort((a, b) => a.localeCompare(b, "ko")), dongs = {}; let n = 0;
    dn.forEach(d => { dongs[d] = g.dongs[d].sort((a, b) => a[3].localeCompare(b[3], "ko", { numeric: true }) || a[2].localeCompare(b[2], "ko")); n += dongs[d].length; });
    fs.writeFileSync(path.join(OUT, code + ".json"), JSON.stringify({ gu: g.gu, code, updated: date, dongs }).replace(/\],\[/g, "],\n[") + "\n");
    index.gu.push({ code, name: g.gu, n, dongs: dn.map(d => [d, dongs[d].length]) }); index.total += n;
  });
  fs.writeFileSync(path.join(OUT, "index.json"), JSON.stringify(index) + "\n");
  return { total: index.total, gu: index.gu.length, added, gone, back, dropped, hadPrev, log };
}

if (require.main === module) {
  const [file, date] = process.argv.slice(2);
  if (!file || !/^\d{4}-\d{2}-\d{2}$/.test(date || "")) { console.error("사용법: node tools/build-seoul.js <seoul-brokers.json> <YYYY-MM-DD>"); process.exit(1); }
  const r = build(file, date);
  console.log(`서울 ${r.gu}개 구 · ${r.total}곳` + (r.hadPrev ? ` · 새로 ${r.added} · 사라짐 ${r.gone} · 돌아옴 ${r.back} · 삭제 ${r.dropped}` : " (첫 생성)"));
  if (r.log.length) console.log(r.log.slice(0, 200).join("\n"));
}
module.exports = { build };
