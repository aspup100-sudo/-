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


// ---- DEALS_FULL ----
// 처음 한 번만(사용자가 다운로드 폴더 저장을 허락함, 2026-10-10). 실행 위치: http://openapi.seoul.go.kr:8088/<인증키>/json/tbLnOpendataRtmsV/1/1/
// 2024년부터 접수된 서울 부동산 실거래를 모두 받아, 줄마다 값만 담은 deals-full-날짜.json 하나를 다운로드 폴더에 저장해요.
// 그 파일은 tools/build-deals.py 로 data/deals/*.json 을 만드는 데 써요.
// 시간이 모자라 info.more가 true면 같은 조각을 다시 실행해요(받은 것은 브라우저가 기억해요). 다 받으면 info.saved에 파일 이름이 나와요.
(async () => {
  const K = location.pathname.split("/")[1], t0 = Date.now(), FROM = 2024, NOW = new Date().getFullYear();
  window.__deal = window.__deal || {}; window.__dealTot = window.__dealTot || {};
  const get = async (y, s) => { const r = await fetch("/" + K + "/json/tbLnOpendataRtmsV/" + s + "/" + (s + 999) + "/" + y); const j = await r.json(); const b = j.tbLnOpendataRtmsV; if (!b) throw new Error("응답이 이상해요: " + JSON.stringify(j).slice(0, 150)); window.__dealTot[y] = b.list_total_count; return b.row || []; };
  for (let y = FROM; y <= NOW && Date.now() - t0 < 40000; y++) {
    if (!window.__dealTot[y]) window.__deal[y + ":1"] = await get(y, 1);
    const starts = []; for (let s = 1001; s <= window.__dealTot[y]; s += 1000) if (!window.__deal[y + ":" + s]) starts.push(s);
    for (let i = 0; i < starts.length && Date.now() - t0 < 40000; i += 8) { const part = starts.slice(i, i + 8); const res = await Promise.all(part.map(s => get(y, s))); part.forEach((s, k) => { window.__deal[y + ":" + s] = res[k]; }); }
  }
  let need = 0; for (let y = FROM; y <= NOW; y++) need += window.__dealTot[y] ? Math.ceil(window.__dealTot[y] / 1000) : 1;
  if (Object.keys(window.__deal).length < need) return JSON.stringify({ info: { more: true, pages: Object.keys(window.__deal).length, need } });
  const all = Object.values(window.__deal).flat(), fields = Object.keys(all[0] || {});
  const out = { from: FROM, got: new Date().toISOString(), total: window.__dealTot, fields, rows: all.map(r => fields.map(f => r[f])) };
  const name = "deals-full-" + new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10) + ".json";
  const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([JSON.stringify(out)], { type: "application/json" })); a.download = name; document.body.appendChild(a); a.click();
  return JSON.stringify({ info: { saved: name, rows: all.length, total: window.__dealTot, fields } });
})();
