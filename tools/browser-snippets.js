// 매일 갱신 때 브라우저(내 컴퓨터의 Claude 브라우저 창)에서 실행하는 코드 조각.
// 각 조각은 "// ---- 이름 ----" 줄로 나뉘어 있고, 조각 하나를 통째로 브라우저의 자바스크립트 실행에 넣어요.
// 긁어 온 것을 통째로 돌려주지 않고, 지금 올라가 있는 앱 데이터와 비교한 "바뀐 것"만 돌려줘요.
// 돌려주는 envelope({ sum, patch })는 파일에 그대로 옮겨 적고, tools/apply-update.js가 sum으로 옮겨 적기 실수를 잡아요.

// ---- SEOUL_DIFF ----
// 실행 위치: http://openapi.seoul.go.kr:8088/<인증키>/json/landBizInfo/1/1/  (서울 열린데이터광장 "서울시 부동산 중개업소 정보")
// 서울 전체 중개업소를 받아서(약 20초), 올라가 있는 data/gu/*.json·data.js·data-guui.js와 다른 것만 돌려줘요.
// 결과의 info.suspicious가 true거나 info.tooBig이 true면 반영하지 마세요. 시간이 모자라 info.more가 true면 같은 조각을 한 번 더 실행해요.
(async () => {
  const K = location.pathname.split("/")[1], base = "https://aspup100-sudo.github.io/-/", t0 = Date.now();
  window.__all = window.__all || {}; let total = window.__total || null;
  const get = async s => { const r = await fetch("/" + K + "/json/landBizInfo/" + s + "/" + (s + 999) + "/"); const j = await r.json(); if (!j.landBizInfo) throw new Error("서울시 자료 응답이 이상해요: " + JSON.stringify(j).slice(0, 120)); total = window.__total = j.landBizInfo.list_total_count; return j.landBizInfo.row || []; };
  if (!window.__all[1]) window.__all[1] = await get(1);
  const starts = []; for (let s = 1001; s <= total; s += 1000) if (!window.__all[s]) starts.push(s);
  for (let i = 0; i < starts.length && Date.now() - t0 < 30000; i += 5) { const part = starts.slice(i, i + 5); const res = await Promise.all(part.map(get)); part.forEach((s, k) => { window.__all[s] = res[k]; }); }
  if (Object.keys(window.__all).length < Math.ceil(total / 1000)) return JSON.stringify({ info: { more: true, got: Object.values(window.__all).flat().length, total } });
  const api = Object.values(window.__all).flat();
  if (api.length < total * 0.98 || total < 15000) return JSON.stringify({ info: { suspicious: true, why: "받은 줄 수가 이상해요", got: api.length, total } });

  // tools/apply-update.js의 nameOf·phoneOf와 같은 규칙 (비교용)
  const nameOf = n => String(n).trim().replace(/\(0\d[\d.\-]+\)/g, "").replace(/공인중개사사무소|공인중개사무소/g, "공인").replace(/^\((단지내|정문앞)\)(.+)$/, "$2 ($1)").trim();
  const phoneOf = p => { p = String(p || "").trim().replace(/[). ]/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, ""); if (!/\d/.test(p)) return ""; if (/^\d{3,4}-\d{4}$/.test(p)) p = "02-" + p; return p; };
  const dongOf = {}; api.forEach(r => { if (r.CGG_CD && r.LGL_DONG_NM && r.STDG_CD) dongOf[r.STDG_CD] = [r.CGG_CD, r.LGL_DONG_NM]; });
  const rows = [], seenSys = {};
  api.forEach(r => {
    if (!r.SYS_REG_NO || seenSys[r.SYS_REG_NO]) return; seenSys[r.SYS_REG_NO] = 1;
    let gu = r.CGG_CD, dong = r.LGL_DONG_NM; const stdg = r.STDG_CD || "", addr0 = (r.ADDR || "").replace(/^서울특별시\s+/, "");
    if ((!gu || !dong) && dongOf[stdg]) { gu = dongOf[stdg][0]; dong = dongOf[stdg][1]; }
    if (!gu) gu = (addr0.match(/^(\S+구)\s/) || [])[1] || "";
    if (!dong) dong = (addr0.match(/\(([가-힣0-9]+동|[가-힣]+\d*가)[,)]/) || [])[1] || "동 미상";
    if (!gu || !/^11\d{3}$/.test(stdg.slice(0, 5))) return;
    rows.push({ raw: [r.REST_BRKR_INFO, r.SYS_REG_NO, r.BZMN_CONM, addr0, r.TELNO || "", gu, dong, stdg, r.STTS_SE, ""], code: stdg.slice(0, 5), gu, dong,
      name: nameOf(r.BZMN_CONM), addr: addr0.replace(new RegExp("^" + gu + "\\s+"), "").replace(/\s+,/g, ",").trim(), tel: phoneOf(r.TELNO), st: r.STTS_SE === "영업중" ? "" : r.STTS_SE });
  });

  // 올라가 있는 자료
  const j = async f => { const r = await fetch(base + f + "?t=" + Date.now(), { cache: "no-store" }); if (!r.ok) throw new Error(f + " " + r.status); return r; };
  const idx = await (await j("data/gu/index.json")).json();
  const pub = {}, idByReg = {};
  await Promise.all(idx.gu.map(async g => { const d = await (await j("data/gu/" + g.code + ".json")).json(); Object.keys(d.dongs).forEach(dn => d.dongs[dn].forEach(row => { pub[row[0]] = { code: d.code, dong: dn, row }; if (!/^s\d+$/.test(row[0])) idByReg[row[1]] = row[0]; })); }));
  const changed = [], seenId = {};
  rows.forEach(x => {
    const id = idByReg[x.raw[0]] || "s" + x.raw[1]; seenId[id] = 1; const o = pub[id];
    if (!o) { changed.push(x.raw); return; }
    const pm = o.row[5] || "", pst = /^(new|gone):/.test(pm) ? "" : pm;
    if (/^gone:/.test(pm) || o.code !== x.code || o.dong !== x.dong || o.row[2] !== x.name || o.row[3] !== x.addr || o.row[4] !== x.tel || pst !== x.st) changed.push(x.raw);
  });
  const gone = Object.keys(pub).filter(id => !seenId[id] && !/^gone:/.test(pub[id].row[5] || ""));

  // 정리해 둔 구역(창신, 구의)의 목록도 같은 자료로 확인
  const load = async (f, v) => { const w = {}; new Function("window", await (await j(f)).text())(w); return w[v]; };
  const CUR = { changsin: { file: "data.js", v: "CS_DATA", check: [["종로구", "창신동"], ["종로구", "숭인동"]], add: [["종로구", "창신동"]] }, guui: { file: "data-guui.js", v: "CS_GUUI", check: [["광진구", "구의동"]], add: [["광진구", "구의동"]] } };
  const brokers = {}, notes = [];
  for (const a of Object.keys(CUR)) {
    const c = CUR[a], B = (await load(c.file, c.v)).B, inSet = (x, set) => set.some(s => s[0] === x.gu && s[1] === x.dong);
    const here = {}; rows.forEach(x => { if (inSet(x, c.check)) here[x.raw[0]] = x; });
    const have = {}; B.forEach(b => { if (b[8]) have[b[8]] = b; });
    const g = B.filter(b => b[8] && !here[b[8]] && !/^gone:/.test(b[9] || "")).map(b => b[8]);
    const bk = B.filter(b => b[8] && here[b[8]] && /^gone:/.test(b[9] || "")).map(b => b[8]);
    const ad = rows.filter(x => inSet(x, c.add) && !have[x.raw[0]]).map(x => ({ reg: x.raw[0], name: x.raw[2], addr: x.addr, phone: x.raw[4] }));
    const sus = g.length > Math.max(5, B.length * 0.15) || ad.length > Math.max(8, B.length * 0.15);
    if (sus) notes.push(a + ": 한꺼번에 너무 많이 바뀌어서 반영하지 않음 (사라짐 " + g.length + ", 새로 " + ad.length + ")");
    else if (g.length || bk.length || ad.length) brokers[a] = Object.assign({}, g.length ? { gone: g } : {}, bk.length ? { back: bk } : {}, ad.length ? { add: ad } : {});
    notes.push(a + ": 지금 " + B.length + "곳 · 사라짐 " + g.length + " · 돌아옴 " + bk.length + " · 새로 " + ad.length);
  }

  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const info = { total: rows.length, published: Object.keys(pub).length, changed: changed.length, gone: gone.length, notes };
  if (changed.length > 1500 || gone.length > 400) { info.suspicious = true; info.why = "하루에 바뀐 양치고 너무 많아요"; return JSON.stringify({ info }); }
  const patch = { date: kst, seoul: { rows: changed, gone }, brokers }, text = JSON.stringify(patch);
  if (text.length > 60000) { info.tooBig = true; info.chars = text.length; return JSON.stringify({ info }); }
  let h = 0x811c9dc5; for (const b of new TextEncoder().encode(text)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return JSON.stringify({ info, envelope: { sum: ("0000000" + h.toString(16)).slice(-8), patch } });
})();

// ---- ASKS_DIFF ----
// 실행 위치: https://jaegebal.com/ (로그인된 상태). 구역별 매물 표의 유형·호가를 다시 읽어, 올라가 있는 listings.js와 다른 것만 돌려줘요.
// 결과의 info.loggedIn이 false거나 info.suspicious가 true면 반영하지 마세요. 멤버십 결제나 로그인 입력은 절대 하지 않아요.
// 결과의 envelope 값을 파일(asks.json)에 글자 그대로 옮겨 적어요.
(async () => {
  const base = "https://aspup100-sudo.github.io/-/";
  const t = await (await fetch(base + "listings.js?t=" + Date.now(), { cache: "no-store" })).text(); const w = {}; new Function("window", t)(w);
  const zones = []; Object.keys(w.CS_ASKS.areas).forEach(a => w.CS_ASKS.areas[a].forEach(z => zones.push(z)));
  const price = s => { const m = String(s).trim().match(/^(?:(\d+(?:\.\d+)?)억)?\s*(?:([\d,]+)만)?$/); return m && (m[1] || m[2]) ? Math.round(parseFloat(m[1] || 0) * 10000) + parseInt((m[2] || "0").replace(/,/g, ""), 10) : null; };
  const loggedIn = !!document.querySelector('a[href^="/my/"]');
  const diff = {}, failed = []; let oldN = 0, delN = 0, addN = 0, nowN = 0;
  await Promise.all(zones.map(async z => {
    try {
      const r = await fetch("/develops/" + z.id + "/asks", { credentials: "include" }); if (!r.ok) throw new Error("HTTP " + r.status);
      const d = new DOMParser().parseFromString(await r.text(), "text/html");
      const tb = [...d.querySelectorAll("table")].find(x => /매매가/.test(x.textContent) && /유형/.test(x.textContent));
      let rows = [], first = "";
      if (tb) {
        const cells = [...tb.querySelectorAll("tbody tr")].map(tr => [...tr.cells].map(c => c.textContent.replace(/\s+/g, " ").trim()));
        rows = cells.map(c => [c[0], price(c[1])]); if (rows.some(x => !x[0] || x[1] == null)) throw new Error("표를 못 읽음");
        if (cells[0] && cells[0][4] && !/멤버십/.test(cells[0][4])) first = cells[0][4];
      } else if (!/매물\s*0\s*개/.test(d.body.textContent.replace(/\s+/g, " "))) throw new Error("매물 표가 없음");
      const key = x => x[0] + "|" + x[1], left = {}; z.rows.forEach(x => { left[key(x)] = (left[key(x)] || 0) + 1; });
      const add = []; rows.forEach(x => { if (left[key(x)]) left[key(x)]--; else add.push(x); });
      const del = []; Object.keys(left).forEach(k => { for (let i = 0; i < left[k]; i++) { const p = k.split("|"); del.push([p[0], +p[1]]); } });
      oldN += z.rows.length; nowN += rows.length; delN += del.length; addN += add.length;
      if (add.length || del.length || (first || "") !== (z.first || "")) diff[z.id] = Object.assign({}, add.length ? { add } : {}, del.length ? { del } : {}, (first || "") !== (z.first || "") ? { first } : {});
    } catch (e) { failed.push(z.id + " " + z.name + ": " + e.message); }
  }));
  const suspicious = !loggedIn || failed.length > zones.length / 3 || (oldN > 20 && delN > oldN * 0.5);
  const kst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
  const patch = { date: kst, asks: diff }, text = JSON.stringify(patch);
  let h = 0x811c9dc5; for (const b of new TextEncoder().encode(text)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  const sum = ("0000000" + h.toString(16)).slice(-8);
  // "info"는 보고용, "envelope"는 파일로 그대로 옮겨 적을 내용 (sum으로 옮겨 적기 실수를 잡아요)
  return JSON.stringify({ info: { loggedIn, suspicious, zones: zones.length, before: oldN, now: nowN, added: addN, removed: delN, failed }, envelope: { sum, patch } });
})();


// ---- DEALS_DIFF ----
// 실행 위치: http://openapi.seoul.go.kr:8088/<인증키>/json/tbLnOpendataRtmsV/1/1/  (서울 열린데이터광장 "서울시 부동산 실거래가 정보")
// 올해 접수된 서울 실거래를 받아(1~2월에는 작년 것도), 올라가 있는 data/deals/*.json과 비교해 새 거래와 취소된 거래만 돌려줘요.
// 시간이 모자라 info.more가 true면 같은 조각을 다시 실행해요. 새 거래가 많으면 400건씩 나눠 주니, info.left가 0보다 크면 다시 실행해서 다음 묶음을 받아요.
// 결과의 info.suspicious나 info.tooBig이 true면 반영하지 마세요. envelope는 묶음마다 deals-1.json, deals-2.json … 에 글자 그대로 옮겨 적어요.
(async () => {
  const K = location.pathname.split("/")[1], t0 = Date.now(), base = "https://aspup100-sudo.github.io/-/";
  const kst = new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10), Y = +kst.slice(0, 4), years = +kst.slice(5, 7) <= 2 ? [Y - 1, Y] : [Y];
  const S = window.__dd = window.__dd || { pages: {}, tot: {} };
  const get = async (y, s) => { const r = await fetch("/" + K + "/json/tbLnOpendataRtmsV/" + s + "/" + (s + 999) + "/" + y); const j = await r.json(); const b = j.tbLnOpendataRtmsV; if (!b) throw new Error("응답이 이상해요: " + JSON.stringify(j).slice(0, 150)); S.tot[y] = b.list_total_count; return b.row || []; };
  if (!S.out) {
    for (const y of years) {
      if (Date.now() - t0 > 40000) break;
      if (!S.tot[y]) S.pages[y + ":1"] = await get(y, 1);
      const starts = []; for (let s = 1001; s <= S.tot[y]; s += 1000) if (!S.pages[y + ":" + s]) starts.push(s);
      for (let i = 0; i < starts.length && Date.now() - t0 < 40000; i += 8) { const part = starts.slice(i, i + 8); const res = await Promise.all(part.map(s => get(y, s))); part.forEach((s, k) => { S.pages[y + ":" + s] = res[k]; }); }
    }
    let need = 0; years.forEach(y => { need += S.tot[y] ? Math.ceil(S.tot[y] / 1000) : 1; });
    if (Object.keys(S.pages).length < need) return JSON.stringify({ info: { more: true, pages: Object.keys(S.pages).length, need } });
    // tools/build-deals.py와 같은 규칙으로 한 줄을 만들어요: [계약일, 용도, 금액(만원), 건물㎡, 토지㎡, 층, 건축년도, 지번, 건물명]
    const str = v => (v == null ? "" : String(v)).trim(), num = v => parseFloat(str(v).replace(/[^\d.]/g, "")) || 0, r2 = v => Math.round(num(v) * 100) / 100;
    const conv = r => {
      const gu = str(r.CGG_CD).slice(0, 5), dn = str(r.STDG_NM), ymd = str(r.CTRT_DAY).replace(/\D/g, "");
      if (!gu.startsWith("11") || !dn || ymd.length !== 8) return null;
      const b1 = str(r.MNO).replace(/^0+/, ""), b2 = str(r.SNO).replace(/^0+/, "");
      let jb = !b1 || (b1 + b2).includes("*") ? "" : b1 + (b2 ? "-" + b2 : ""); if (str(r.LOTNO_SE_NM) === "산" && jb) jb = "산 " + jb;
      return { gu, gname: str(r.CGG_NM), dn, cancel: !!str(r.RTRCN_DAY), row: [ymd, str(r.BLDG_USG), Math.floor(num(r.THING_AMT)), r2(r.ARCH_AREA), r2(r.LAND_AREA), str(r.FLR), Math.floor(num(r.ARCH_YR)), jb, str(r.BLDG_NM)] };
    };
    const all = Object.values(S.pages).flat(), first = all[0] || {};
    const fields = ["CGG_CD", "CGG_NM", "STDG_NM", "MNO", "SNO", "CTRT_DAY", "THING_AMT", "ARCH_AREA", "FLR", "RTRCN_DAY", "BLDG_USG"];
    const missing = fields.filter(f => !(f in first));
    if (missing.length) return JSON.stringify({ info: { suspicious: true, why: "열 이름이 예상과 달라요", missing, fields: Object.keys(first) } });
    const key = (dn, r) => [dn, r[0], r[2], r[5], r[7], r[8]].join("|");
    const rows = all.map(conv).filter(Boolean), codes = [...new Set(rows.map(x => x.gu))];
    const have = {}, gname = {}; let haveN = 0;
    await Promise.all(codes.map(async c => { const r = await fetch(base + "data/deals/" + c + ".json?t=" + Date.now(), { cache: "no-store" }); const d = r.ok ? await r.json() : { d: {} }; const m = have[c] = new Map(); Object.keys(d.d).forEach(dn => d.d[dn].forEach(o => { m.set(key(dn, o), [dn].concat(o)); haveN++; })); }));
    // 같은 거래가 취소됐다가 다시 신고되는 일이 많아서, 살아 있는 신고가 하나라도 있으면 취소로 보지 않아요.
    const live = new Set(rows.filter(x => !x.cancel).map(x => x.gu + "|" + key(x.dn, x.row)));
    const add = [], del = {}, seen = new Set();
    rows.forEach(x => { const k = key(x.dn, x.row), gk = x.gu + "|" + k; gname[x.gu] = x.gname;
      if (seen.has(gk)) return; seen.add(gk);
      if (x.cancel) { const o = !live.has(gk) && have[x.gu].get(k); if (o) (del[x.gu] = del[x.gu] || []).push(o); return; }
      if (!have[x.gu].has(k)) add.push({ gu: x.gu, r: [x.dn].concat(x.row) }); });
    const delN = Object.values(del).reduce((n, v) => n + v.length, 0);
    S.out = { add, del, gname, i: 0, info: { apiRows: all.length, total: S.tot, appRows: haveN, newDeals: add.length, cancelled: delN, suspicious: haveN < 100000 || all.length < 1000, tooBig: add.length > 6000 || delN > 2000 } };
  }
  const O = S.out, part = O.add.slice(O.i, O.i + 400), d = { add: {}, del: O.i === 0 ? O.del : {} };
  part.forEach(x => { const a = d.add[x.gu] = d.add[x.gu] || { gu: O.gname[x.gu], rows: [] }; a.rows.push(x.r); });
  O.i += part.length;
  const info = Object.assign({}, O.info, { chunk: Math.ceil(O.i / 400) || 1, left: O.add.length - O.i });
  if (!part.length && !Object.keys(d.del).length) return JSON.stringify({ info: Object.assign(info, { nothing: true }) });
  const patch = { date: kst, deals: d }, text = JSON.stringify(patch);
  let h = 0x811c9dc5; for (const b of new TextEncoder().encode(text)) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  return JSON.stringify({ info, envelope: { sum: ("0000000" + h.toString(16)).slice(-8), patch } });
})();
