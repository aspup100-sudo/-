#!/usr/bin/env node
// 매일 갱신: 브라우저에서 구한 "바뀐 것"(patch.json)을 데이터 파일에 반영해요.
//   node tools/apply-update.js patch.json
// patch 모양:
// { "date": "2026-10-11",
//   "brokers": { "changsin": { "gone": ["등록번호"], "back": ["등록번호"], "add": [{"reg","name","addr","phone"}] }, "guui": {...} },
//   "asks": { "1400": { "add": [["다세대",49000]], "del": [["단독",62000]], "first": "5.10평" }, ... } }
// brokers나 asks는 없어도 돼요 (그 부분은 건드리지 않음).
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, "..");
const AREAS = { changsin: { file: "data.js", prefix: "b" }, guui: { file: "data-guui.js", prefix: "k" } };
const GONE_KEEP_DAYS = 30, NEW_TAG_DAYS = 14;

const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / 86400000);
const queryOf = a => { const m = a.replace(/\s+,/g, ",").match(/^(\S+)\s+(\d+(?:-\d+)?)/); return m ? m[1] + " " + m[2] : a; };
const roadOf = a => (a.match(/^(\S+)/) || ["", ""])[1];
function phoneOf(p) {
  p = String(p || "").trim().replace(/[). ]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  if (!/\d/.test(p)) return "";
  if (/^\d{3,4}-\d{4}$/.test(p)) p = "02-" + p;
  return p;
}
function nameOf(n) {
  n = String(n).trim().replace(/\(0\d[\d.\-]+\)/g, "").replace(/공인중개사사무소|공인중개사무소/g, "공인");
  return n.replace(/^\((단지내|정문앞)\)(.+)$/, "$2 ($1)").trim();
}

function readRows(file) {
  const lines = fs.readFileSync(path.join(ROOT, file), "utf8").split("\n");
  const idx = [], rows = [];
  lines.forEach((ln, i) => {
    const m = ln.match(/^\s*(\[.*\]),?\s*$/); if (!m) return;
    let r; try { r = JSON.parse(m[1]); } catch (e) { return; }
    if (Array.isArray(r) && r.length >= 8 && typeof r[0] === "string" && /^[a-z]\d+$/.test(r[0])) { idx.push(i); rows.push(r); }
  });
  if (!rows.length || idx[idx.length - 1] - idx[0] !== idx.length - 1) throw new Error(file + ": 중개업소 행을 한 덩어리로 찾지 못했어요");
  return { lines, start: idx[0], end: idx[idx.length - 1], rows };
}
function writeRows(file, f, rows) {
  const indent = (f.lines[f.start].match(/^\s*/) || [""])[0];
  const out = rows.map((r, i) => indent + JSON.stringify(r) + (i < rows.length - 1 ? "," : ""));
  const lines = f.lines.slice(0, f.start).concat(out, f.lines.slice(f.end + 1));
  fs.writeFileSync(path.join(ROOT, file), lines.join("\n"));
}

function brokers(area, p, date, log) {
  const cfg = AREAS[area], f = readRows(cfg.file); let rows = f.rows;
  const byReg = {}; rows.forEach(r => { if (r[8]) byReg[r[8]] = r; });
  (p.gone || []).forEach(reg => { const r = byReg[reg]; if (r && !/^gone:/.test(r[9] || "")) { r[9] = "gone:" + date; log.push(`[${area}] 등록부에서 사라짐: ${r[1]} (${r[2]})`); } });
  (p.back || []).forEach(reg => { const r = byReg[reg]; if (r && /^gone:/.test(r[9] || "")) { r.length = 9; log.push(`[${area}] 다시 등록됨: ${r[1]}`); } });
  let next = Math.max(0, ...rows.filter(r => r[0][0] === cfg.prefix).map(r => +r[0].slice(1))) + 1;
  const width = cfg.prefix === "k" ? 3 : 2;
  (p.add || []).forEach(a => {
    if (byReg[a.reg]) return;
    const addr = String(a.addr).replace(/\s+,/g, ",").trim(), road = roadOf(addr);
    const same = rows.find(r => roadOf(r[2]) === road);
    const row = [cfg.prefix + String(next++).padStart(width, "0"), nameOf(a.name), addr, queryOf(addr), phoneOf(a.phone), same ? same[5] : "Z", 0, "", a.reg, "new:" + date];
    let at = -1; rows.forEach((r, i) => { if (r[5] === row[5]) at = i; });
    if (at < 0) rows.push(row); else rows.splice(at + 1, 0, row);
    byReg[a.reg] = row; log.push(`[${area}] 새로 등록됨: ${row[1]} (${row[2]})`);
  });
  // 오래된 표시 정리
  rows = rows.filter(r => { const m = /^gone:(.+)$/.exec(r[9] || ""); if (m && days(date, m[1]) > GONE_KEEP_DAYS) { log.push(`[${area}] 목록에서 뺌(사라진 지 ${GONE_KEEP_DAYS}일 넘음): ${r[1]}`); return false; } return true; });
  rows.forEach(r => { const m = /^new:(.+)$/.exec(r[9] || ""); if (m && days(date, m[1]) > NEW_TAG_DAYS) r.length = 9; });
  writeRows(cfg.file, f, rows);
  if (rows.some(r => r[5] === "Z")) { // 새 묶음 이름이 없으면 넣어 줘요
    let s = fs.readFileSync(path.join(ROOT, cfg.file), "utf8");
    if (!/["']?Z["']?\s*:/.test(s.slice(0, s.indexOf("B:[")))) { s = s.replace(/ST:\{/, 'ST:{"Z":"새로 등록된 곳",'); fs.writeFileSync(path.join(ROOT, cfg.file), s); }
  }
}

function asks(p, date, log) {
  const file = path.join(ROOT, "listings.js"), w = {}; new Function("window", fs.readFileSync(file, "utf8"))(w);
  const D = w.CS_ASKS, zones = {}; Object.keys(D.areas).forEach(a => D.areas[a].forEach(z => { zones[z.id] = z; z.area = a; }));
  Object.keys(p).forEach(id => {
    const z = zones[id], d = p[id]; if (!z) { log.push(`(모르는 구역 ${id}는 건너뜀)`); return; }
    (d.del || []).forEach(x => { const i = z.rows.findIndex(r => r[0] === x[0] && r[1] === x[1]); if (i >= 0) { z.rows.splice(i, 1); log.push(`[${z.name}] 내려감: ${x[0]} ${won(x[1])}`); } });
    (d.add || []).forEach(x => { z.rows.push([x[0], x[1], date]); log.push(`[${z.name}] 새로 올라옴: ${x[0]} ${won(x[1])}`); });
    z.rows.sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]));
    if (d.first !== undefined) z.first = d.first;
  });
  D.updated = date;
  Object.keys(D.areas).forEach(a => D.areas[a].forEach(z => { delete z.area; }));
  fs.writeFileSync(file, HEAD + "window.CS_ASKS=" + JSON.stringify(D).replace(/\{"id"/g, '\n{"id"') + ";\n");
}
const HEAD = "// 자동으로 만들어지는 파일이에요 (tools/apply-update.js). 재개발닷컴 구역별 매물 표의 유형과 호가만 담아요.\n// rows: [유형, 호가(만원), 처음 본 날(없으면 추적 시작 전부터 있던 것)]\n";
function won(v) { const e = Math.floor(v / 10000), m = v % 10000; return (e ? e + "억" : "") + (m ? (e ? " " : "") + m.toLocaleString("ko-KR") + "만" : ""); }

// 실거래: data/deals/<구코드>.json 에 새 거래를 넣고 취소된 거래를 빼요 (브라우저 조각 DEALS_DIFF의 결과)
function deals(p, date, log) {
  const dir = path.join(ROOT, "data", "deals"); fs.mkdirSync(dir, { recursive: true });
  const codes = new Set(Object.keys(p.add || {}).concat(Object.keys(p.del || {})));
  codes.forEach(code => {
    const file = path.join(dir, code + ".json");
    let d; try { d = JSON.parse(fs.readFileSync(file, "utf8")); } catch (e) { d = { src: "서울 열린데이터광장 '서울시 부동산 실거래가 정보'", date: "", from: +date.slice(0, 4), gu: (p.add[code] || {}).gu || "", d: {} }; }
    const key = (dn, r) => [dn].concat(r).join("|");
    let nA = 0, nD = 0;
    ((p.add[code] || {}).rows || []).forEach(x => { const dn = x[0], r = x.slice(1); const list = d.d[dn] = d.d[dn] || []; if (!list.some(o => key(dn, o) === key(dn, r))) { list.push(r); nA++; } });
    (p.del[code] || []).forEach(x => { const dn = x[0], k = key(dn, x.slice(1)); const list = d.d[dn] || []; const i = list.findIndex(o => key(dn, o) === k); if (i >= 0) { list.splice(i, 1); nD++; } });
    Object.keys(d.d).forEach(dn => d.d[dn].sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : 0)));
    const last = Object.values(d.d).flat().reduce((m, r) => (r[0] > m ? r[0] : m), "");
    if (last) d.date = last.slice(0, 4) + "-" + last.slice(4, 6) + "-" + last.slice(6);
    fs.writeFileSync(file, JSON.stringify(d));
    if (nA || nD) log.push(`[실거래 ${d.gu}] 새 거래 ${nA}건, 취소 ${nD}건`);
  });
}

module.exports = { nameOf, phoneOf, queryOf, won, HEAD, fnv }; // build-seoul.js가 가져다 써요 (아래 실행 부분보다 먼저 내보내야 함)

// 브라우저가 돌려준 결과는 { "sum": "8자리", "patch": {...} } 봉투에 담겨 와요.
// 옮겨 적다가 한 글자라도 달라지면 sum이 안 맞아서 여기서 멈춰요.
function fnv(str) { let h = 0x811c9dc5; const b = Buffer.from(str, "utf8"); for (let i = 0; i < b.length; i++) { h ^= b[i]; h = Math.imul(h, 0x01000193) >>> 0; } return ("0000000" + h.toString(16)).slice(-8); }
function open(file) {
  const env = JSON.parse(fs.readFileSync(file, "utf8"));
  if (env && env.sum && env.patch) {
    const got = fnv(JSON.stringify(env.patch));
    if (got !== env.sum) throw new Error(`${path.basename(file)}: 옮겨 적은 내용이 원본과 달라요 (sum ${env.sum} ≠ ${got}). 브라우저 결과를 다시 그대로 옮겨 주세요.`);
    return env.patch;
  }
  return env; // 봉투 없이 직접 쓴 patch (테스트용)
}

if (require.main === module) {
  const files = process.argv.slice(2); if (!files.length) { console.error("사용법: node tools/apply-update.js <patch.json> [patch2.json …]"); process.exit(1); }
  const patch = {}; files.forEach(f => Object.assign(patch, open(f)));
  const date = patch.date, log = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "")) throw new Error("date가 필요해요 (YYYY-MM-DD)");
  if (patch.seoul) require("./build-seoul.js").applyPatch(patch.seoul, date, log);
  Object.keys(patch.brokers || {}).forEach(a => { if (AREAS[a]) brokers(a, patch.brokers[a], date, log); });
  if (patch.asks) asks(patch.asks, date, log);
  if (patch.deals) deals(patch.deals, date, log);
  // 화면에 보이는 "마지막 확인" 날짜. 같은 날 두 번째 실행이 한쪽만 확인했어도, 앞서 확인한 쪽 표시는 남겨요.
  let prev = {}; try { const w = {}; new Function("window", fs.readFileSync(path.join(ROOT, "updated.js"), "utf8"))(w); prev = w.CS_UPDATED || {}; } catch (e) {}
  const same = prev.date === date;
  fs.writeFileSync(path.join(ROOT, "updated.js"), `// 자동으로 만들어지는 파일이에요. 마지막으로 등록부와 매물을 다시 확인한 날.\nwindow.CS_UPDATED=${JSON.stringify({ date, brokers: !!(patch.brokers || patch.seoul) || (same && !!prev.brokers), asks: !!patch.asks || (same && !!prev.asks) })};\n`);
  console.log(log.length ? log.join("\n") : "바뀐 것 없음");
}
