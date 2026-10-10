// 매일 갱신 때 브라우저(내 컴퓨터의 Claude 브라우저 창)에서 실행하는 코드 조각.
// 각 조각은 "// ---- 이름 ----" 줄로 나뉘어 있고, 조각 하나를 통째로 브라우저의 자바스크립트 실행에 넣어요.
// 긁어 온 것을 통째로 돌려주지 않고, 지금 올라가 있는 앱 데이터와 비교한 "바뀐 것"만 돌려줘서 옮겨 적을 양을 줄여요.

// ---- REGISTRY_DEFINE ----
// 실행 위치: https://land.seoul.go.kr/land/broker/brokerInfo.do
// window.csScrape(시군구코드, 법정동코드)를 정의. 한 번 부를 때 약 40초까지 페이지를 넘기며 모으고, 덜 끝났으면 다시 부르면 이어서 해요.
window.__reg = window.__reg || {};
window.csScrape = async function (sg, bj) {
  const key = sg + "-" + bj, st = (window.__reg[key] = window.__reg[key] || { pages: {}, total: null, started: false });
  const tblOf = () => [...document.querySelectorAll("table")].find(t => /등록번호\|상호\|소재지/.test([...t.querySelectorAll("th")].map(x => x.innerText.trim()).join("|")));
  const grab = () => { const t = tblOf(); if (!t) return []; return [...t.querySelectorAll("tbody tr")].map(tr => [...tr.cells].map(c => c.innerText.replace(/\s+/g, " ").trim())).filter(c => c.length >= 6 && c[0] !== "등록번호" && /\d{4}-\d{5}$|^\S+\d{3,}/.test(c[0])); };
  const firstId = () => { const g = grab(); return g.length ? g[0][0] : ""; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  if (!st.started) {
    const s1 = document.getElementById("selectSigungu"); s1.value = String(sg); s1.dispatchEvent(new Event("change", { bubbles: true })); await sleep(2500);
    const s2 = document.getElementById("selectBjdong"); s2.value = String(bj); s2.dispatchEvent(new Event("change", { bubbles: true }));
    const before = firstId(); document.getElementById("search").click();
    for (let i = 0; i < 40; i++) { await sleep(200); if (/검색결과\s*:\s*\d+항목/.test(document.body.innerText) && firstId() && (firstId() !== before || i > 15)) break; }
    const m = document.body.innerText.match(/검색결과\s*:\s*(\d+)항목\s*\((\d+)\/(\d+)\)/);
    if (!m) return { key, error: "검색 결과를 못 읽었어요" };
    st.total = +m[1]; st.last = +m[3]; st.started = true; st.pages[1] = grab();
  }
  const t0 = Date.now();
  for (let p = 2; p <= st.last && Date.now() - t0 < 38000; p++) {
    if (st.pages[p] && st.pages[p].length) continue;
    const before = firstId(); _pager.goPage(p);
    for (let i = 0; i < 40; i++) { await sleep(150); const f = firstId(); if (f && f !== before) break; }
    const g = grab(), dup = Object.values(st.pages).some(pg => pg.length && pg[0][0] === (g[0] || [])[0]);
    if (g.length && !dup) st.pages[p] = g;
  }
  const rows = Object.keys(st.pages).map(Number).sort((a, b) => a - b).flatMap(p => st.pages[p]);
  st.rows = rows.map(c => ({ reg: c[0], name: c[1], addr: c[2].replace(/^서울특별시\s+\S+구\s+/, ""), phone: c[4], open: c[5] === "영업중" }));
  return { key, total: st.total, got: new Set(rows.map(c => c[0])).size, done: new Set(rows.map(c => c[0])).size === st.total };
};
"csScrape 준비됨";

// ---- REGISTRY_DIFF ----
// 실행 위치: 위와 같은 등록부 페이지. csScrape를 세 번(11110,17400 / 11110,17500 / 11215,10300) 끝낸 뒤 실행.
// 지금 올라가 있는 앱 데이터와 비교해서 바뀐 것만 돌려줘요. suspicious가 true면 반영하지 마세요.
(async () => {
  const base = "https://aspup100-sudo.github.io/-/";
  const load = async (file, v) => { const t = await (await fetch(base + file + "?t=" + Date.now(), { cache: "no-store" })).text(); const w = {}; new Function("window", t)(w); return w[v]; };
  const SRC = {
    changsin: { file: "data.js", v: "CS_DATA", sources: [["11110-17400", true], ["11110-17500", false]] },  // 숭인동은 이미 넣은 곳만 확인하고 새로 넣지는 않아요
    guui: { file: "data-guui.js", v: "CS_GUUI", sources: [["11215-10300", true]] }
  };
  const out = {}, notes = [];
  for (const area of Object.keys(SRC)) {
    const cfg = SRC[area], regs = {}, addable = []; let ok = true;
    for (const [key, add] of cfg.sources) {
      const st = (window.__reg || {})[key];
      if (!st || !st.rows || new Set(st.rows.map(r => r.reg)).size !== st.total) { ok = false; notes.push(area + ": " + key + " 등록부를 끝까지 못 읽어서 건너뜀"); break; }
      st.rows.forEach(r => { if (r.open) { regs[r.reg] = r; if (add) addable.push(r); } });
    }
    if (!ok) continue;
    const B = (await load(cfg.file, cfg.v)).B, have = {}; B.forEach(b => { if (b[8]) have[b[8]] = b; });
    if (Object.keys(have).length < B.length * 0.9) { notes.push(area + ": 올라가 있는 데이터에 등록번호가 없어서 건너뜀"); continue; }
    const gone = B.filter(b => b[8] && !regs[b[8]] && !/^gone:/.test(b[9] || "")).map(b => b[8]);
    const back = B.filter(b => b[8] && regs[b[8]] && /^gone:/.test(b[9] || "")).map(b => b[8]);
    const add = addable.filter(r => !have[r.reg]).map(r => ({ reg: r.reg, name: r.name, addr: r.addr, phone: r.phone }));
    const suspicious = gone.length > Math.max(5, B.length * 0.15) || add.length > Math.max(8, B.length * 0.15);
    if (gone.length || back.length || add.length) out[area] = { gone, back, add };
    if (suspicious) { out[area].suspicious = true; notes.push(area + ": 한꺼번에 너무 많이 바뀌어서 의심스러움"); }
    notes.push(area + ": 지금 " + B.length + "곳, 등록부 " + Object.keys(regs).length + "곳 확인, 사라짐 " + gone.length + " · 돌아옴 " + back.length + " · 새로 " + add.length);
  }
  return JSON.stringify({ brokers: out, notes });
})();

// ---- ASKS_DIFF ----
// 실행 위치: https://jaegebal.com/ (로그인된 상태). 구역별 매물 표의 유형·호가를 다시 읽어, 올라가 있는 listings.js와 다른 것만 돌려줘요.
// loggedIn이 false거나 suspicious가 true면 반영하지 마세요. 멤버십 결제나 로그인 입력은 절대 하지 않아요.
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
  return JSON.stringify({ loggedIn, suspicious, zones: zones.length, before: oldN, now: nowN, added: addN, removed: delN, failed, asks: diff });
})();
