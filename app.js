// 임장 수첩 — 화면 동작. 구역 정보는 areas.js, 중개업소 자료는 data*.js와 data/gu/*.json.
// 체크·메모·동선 담기는 이 기기(localStorage)에만 저장돼서 나만 봐요. 모두가 보는 건 리뷰(reviews.js)뿐이에요.
(function () {
  var AREAS = window.CS_AREAS || { order: [] };
  var areaId = "";
  try { areaId = new URLSearchParams(location.search).get("area") || ""; } catch (e) {}
  if (window.CS_AREA_ID) areaId = window.CS_AREA_ID; // 서울 전체 자료에서 고른 동 (boot.js가 만들어 줘요)
  var AREA = AREAS[areaId] && AREAS[areaId].data ? AREAS[areaId] : null;
  var D = AREA ? AREA.data : { ST: {}, B: [], L: [] }, ST = D.ST, B = D.B, L = D.L || [];
  var store = {}, timers = {}, filter = "all", street = "";
  var X = []; // 다른 동 중개업소 (map.js가 넣어 줘요). 지도에 그린 영역 안에 들어오거나 동선에 담은 것만 목록에 나와요.
  function all() { return X.length ? B.concat(X) : B; }
  var regionFn = null, regionOff = []; // 지도에서 그린 영역 (map.js가 넣어 줘요)
  var me = "";
  try { me = localStorage.getItem("cs-name") || ""; } catch (e) {}

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  var saveEl = $("#save");
  function setSave(state, text) { saveEl.dataset.state = state; saveEl.textContent = text; }
  function loadLocal() { try { var s = localStorage.getItem("changsin-notes"); if (s) store = JSON.parse(s) || {}; } catch (e) {} }
  function saveLocal() { try { localStorage.setItem("changsin-notes", JSON.stringify(store)); } catch (e) {} }
  function rec(id) { return store[id] || (store[id] = { status: "", memo: "", bunji: "", at: "" }); }

  var listeners = [];
  function changed(id) { listeners.forEach(function (f) { try { f(id); } catch (e) {} }); }
  function persist(id) {
    rec(id).at = new Date().toISOString();
    saveLocal(); setSave("ok", "내 메모 저장됨");
  }
  function later(id) { clearTimeout(timers[id]); timers[id] = setTimeout(function () { timers[id] = null; persist(id); }, 800); }
  // 화면을 닫거나 다른 앱으로 넘어갈 때, 아직 저장 안 된 메모를 바로 저장해요.
  function flush() { Object.keys(timers).forEach(function (id) { if (timers[id]) { clearTimeout(timers[id]); timers[id] = null; persist(id); } }); }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);

  function mapLinks(q, gu) {
    var full = (gu || (AREA ? AREA.gu : "")) + " " + q, f = document.createDocumentFragment();
    var a = el("a", null, "네이버지도"); a.href = "https://map.naver.com/p/search/" + encodeURIComponent(full); a.target = "_blank"; a.rel = "noopener";
    var k = el("a", null, "카카오맵"); k.href = "https://map.kakao.com/link/search/" + encodeURIComponent(full); k.target = "_blank"; k.rel = "noopener";
    f.appendChild(a); f.appendChild(k); return f;
  }
  function phones(s) { return String(s || "").split(/[\s,\/;]+/).map(function (x) { return x.trim(); }).filter(function (x) { return x.replace(/\D/g, "").length >= 7; }); }
  function copyBtn(text, target) {
    var b = el("button", "mini", "복사"); b.type = "button";
    b.addEventListener("click", function () {
      var done = function () { b.textContent = "복사됨"; setTimeout(function () { b.textContent = "복사"; }, 1500); };
      var fallback = function () { var r = document.createRange(); r.selectNodeContents(target); var s = getSelection(); s.removeAllRanges(); s.addRange(r); b.textContent = "선택됨"; };
      try { navigator.clipboard.writeText(text).then(done, fallback); } catch (e) { fallback(); }
    });
    return b;
  }

  var cards = {};
  function setPick(id, on) { rec(id).pick = on ? 1 : 0; paint(id); applyFilter(); persist(id); tabCount(); changed(id); }
  function card(b) {
    var id = b[0];
    var c = el("article", "bk"); c.dataset.id = id; c.dataset.street = b[5]; c.id = "card-" + id;
    var top = el("div", "bk-top"); top.appendChild(el("h3", null, b[1])); if (b[10]) top.appendChild(el("span", "badge nbb", b[10])); if (b[6]) top.appendChild(el("span", "badge", "먼저 갈 곳")); c.appendChild(top);
    var stt = /^(new|gone):(\d{4})-(\d{2})-(\d{2})$/.exec(b[9] || "");
    if (stt) { // 매일 등록부를 다시 확인해서 붙이는 표시
      var md = (+stt[3]) + "/" + (+stt[4]);
      if (stt[1] === "new") top.appendChild(el("span", "badge fresh", "새로 등록 " + md));
      else { top.appendChild(el("span", "badge gone", "등록부에서 사라짐 " + md)); c.classList.add("is-gone"); c.appendChild(el("p", "tags", "폐업했거나 다른 곳으로 옮겼을 수 있어요. 가기 전에 전화로 확인하세요.")); }
    }
    if (b[7]) c.appendChild(el("p", "tags", "올린 매물: " + b[7]));
    var ad = el("p", "row"); ad.appendChild(el("span", "v", b[2])); ad.appendChild(mapLinks(b[3], b[11])); c.appendChild(ad);
    var tl = el("p", "row");
    // 번호가 여러 개면("02-498-9200 02-464-2266") 줄을 나눠 번호마다 따로 걸 수 있게 해요
    var nums = phones(b[4]);
    if (!nums.length) tl.appendChild(el("span", "v", "등록부에 전화번호 없음"));
    c.appendChild(tl);
    nums.forEach(function (p, i) {
      var row = i ? c.appendChild(el("p", "row")) : tl;
      var n = el("span", "num", p); row.appendChild(n); row.appendChild(copyBtn(p, n));
      var t = el("a", null, "전화 걸기"); t.href = "tel:" + p.replace(/[^\d+]/g, ""); row.appendChild(t);
    });
    var acts = el("div", "acts");
    [["call", "통화함"], ["visit", "방문함"]].forEach(function (s) {
      var bt = el("button", "tg " + s[0], s[1]); bt.type = "button"; bt.setAttribute("aria-pressed", "false"); bt.dataset.s = s[0];
      bt.addEventListener("click", function () { var r = rec(id); r.status = (r.status === s[0]) ? "" : s[0]; paint(id); progress(); applyFilter(); persist(id); changed(id); });
      acts.appendChild(bt);
    });
    var pk = el("button", "tg pick", "동선 담기"); pk.type = "button"; pk.setAttribute("aria-pressed", "false");
    pk.addEventListener("click", function () { setPick(id, !rec(id).pick); });
    acts.appendChild(pk);
    c.appendChild(acts);
    var ta = el("textarea"); ta.id = "memo-" + id; ta.rows = 1; ta.placeholder = "내 메모 (나만 보여요): 번지, 가격, 들은 얘기"; ta.setAttribute("aria-label", b[1] + " 메모");
    ta.addEventListener("input", function () { rec(id).memo = ta.value; later(id); });
    ta.addEventListener("blur", applyFilter);
    c.appendChild(ta);
    var rv = el("div", "rv"); rv.id = "rv-" + id; c.appendChild(rv);
    return c;
  }
  // 다른 동 중개업소를 목록 맨 아래 "다른 동" 묶음으로 붙여요 (영역 안에 들어오거나 동선에 담았을 때만 보여요)
  function addExtra(rows) {
    if (!AREA || !rows.length) return;
    var list = $("#brokerList"), end = $("#emptyB");
    if (!X.length) { var g = el("div", "grp"); g.dataset.street = "옆동"; g.appendChild(el("span", null, "다른 동 · 지도에 그린 영역 안에 들어오거나 동선에 담은 곳")); list.insertBefore(g, end); }
    rows.forEach(function (b) { if (cards[b[0]]) return; X.push(b); var c = card(b); list.insertBefore(c, end); cards[b[0]] = c; paint(b[0]); });
    applyFilter(); tabCount();
  }
  function buildBrokers() {
    var list = $("#brokerList"), cur = "";
    B.forEach(function (b) {
      var id = b[0];
      if (b[5] !== cur) { cur = b[5]; var g = el("div", "grp"); g.dataset.street = cur; g.appendChild(el("span", null, ST[cur])); list.appendChild(g); }
      list.appendChild(card(b)); cards[id] = list.lastChild;
    });
    var e = el("p", "empty", "조건에 맞는 중개업소가 없어요."); e.id = "emptyB"; e.hidden = true; list.appendChild(e);
  }
  // 매물(후보 매물·예산으로 매물 찾기)은 잠시 꺼 두고, 모든 동에서 서울시 구역 정보와 실거래만 보여줘요.
  // 다시 보이게 하려면 true로 바꾸면 돼요 (창신·구의에 정리해 둔 매물·구역 설명이 그대로 남아 있어요).
  var SHOW_LISTINGS = false;
  function buildListings() {
    if (!SHOW_LISTINGS) return;
    var list = $("#listingList");
    L.forEach(function (x) {
      var c = el("article", "lt"); c.dataset.id = x.id;
      var h = el("div", "lt-head"); h.appendChild(el("span", "price", x.price)); h.appendChild(el("span", "zchip" + (x.unk ? " unk" : ""), x.zone)); c.appendChild(h);
      c.appendChild(el("h3", null, x.name));
      var ul = el("ul", "facts"); x.facts.forEach(function (f) { ul.appendChild(el("li", null, f)); }); c.appendChild(ul);
      c.appendChild(el("p", "who", x.who));
      if (x.caution) c.appendChild(el("p", "caution", x.caution));
      if (x.bunji) {
        var lb = el("label", "fld", "받아온 번지"); var inp = el("input"); inp.type = "text"; inp.id = "bunji-" + x.id; inp.placeholder = AREA.bunjiHint || ""; inp.autocomplete = "off"; inp.maxLength = 100;
        inp.addEventListener("input", function () { rec(x.id).bunji = inp.value; later(x.id); }); lb.appendChild(inp); c.appendChild(lb);
      }
      var ta = el("textarea"); ta.id = "memo-" + x.id; ta.rows = 1; ta.placeholder = "내 메모 (나만 보여요): 본 느낌, 깎을 수 있는 금액"; ta.setAttribute("aria-label", x.name + " 메모");
      ta.addEventListener("input", function () { rec(x.id).memo = ta.value; later(x.id); });
      c.appendChild(ta);
      list.appendChild(c); cards[x.id] = c;
    });
  }
  function buildZones() {
    var list = $("#zoneList");
    (SHOW_LISTINGS ? AREA.zones || [] : []).forEach(function (z) {
      var c = el("article", "lt zone");
      var h = el("div", "lt-head"); h.appendChild(el("h3", null, z.name)); h.appendChild(el("span", "zchip", z.kind)); c.appendChild(h);
      c.appendChild(el("p", "stage", z.stage));
      if (z.facts && z.facts.length) { var ul = el("ul", "facts"); z.facts.forEach(function (f) { ul.appendChild(el("li", null, f)); }); c.appendChild(ul); }
      if (z.note) c.appendChild(el("p", "who", z.note));
      list.appendChild(c);
    });
    if (!SHOW_LISTINGS || !(AREA.zones || []).length) cityZones(list);
    if (SHOW_LISTINGS && L.length) $("#listings").insertBefore($("#listBlk"), $("#zoneBlk")); // 정리한 매물이 있으면 매물을 먼저 보여줘요
    $("#listBlk").hidden = !SHOW_LISTINGS || (!L.length && !AREA.listHint); // 정리한 매물이 없는 동에서는 빈 제목을 숨겨요
    $("#zoneHint").textContent = SHOW_LISTINGS ? AREA.zoneHint || "" : "";
    $("#listHint").textContent = AREA.listHint || "";
    (AREA.ask || []).forEach(function (q) { $("#askList").appendChild(el("li", null, q)); });
    if (SHOW_LISTINGS && AREA.excluded && AREA.excluded.length) { $("#excludedBox").hidden = false; AREA.excluded.forEach(function (x) { $("#excludedList").appendChild(el("li", null, x)); }); }
    var up = window.CS_UPDATED, ft = AREA.foot || "";
    if (up && up.date) { var d = up.date.split("-"); ft += " 등록부를 마지막으로 다시 확인한 날: " + (+d[0]) + "년 " + (+d[1]) + "월 " + (+d[2]) + "일. 그 뒤 새로 생긴 곳과 사라진 곳은 카드에 표시돼요."; }
    $("#foot").textContent = ft;
  }
  // 정리해 둔 구역이 없는 동: 서울시 도시계획사업 자료(data/zones/<구>.json)에서 이 동에 걸친 구역을 모두 보여 줘요.
  // 자료에 아직 경계가 없는 민간 도심복합 등(data/zones/extra.json)도 같이 넣어요.
  function cityZones(list) {
    var key = AREA.dong || ((AREA.id || "").match(/^d(\d{5})-(.+)$/) || []).slice(1).join(":"); if (!key || !window.fetch) return;
    var gu = key.split(":")[0], dn = key.split(":")[1];
    var get = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw r; return r.json(); }).catch(function () { return null; }); };
    Promise.all([get("./data/zones/" + gu + ".json"), get("./data/zones/extra.json")]).then(function (res) {
      var Z = res[0], E = res[1], rows = [];
      ((Z && Z.z) || []).forEach(function (z) { if ((z.d || []).indexOf(key) >= 0) rows.push({ n: z.n, k: z.k, m2: z.m2, d: z.d, p: z.p }); });
      ((E && E.z) || []).forEach(function (z) { if (z.gu === gu && z.at.split(" ")[0] === dn) rows.push({ n: z.n, k: z.k, src: z.src, url: z.url, loose: true }); });
      var kindOf = function (k) { var t = k.map(function (x) { return x[0]; }).join(" "); return /도심|공공주택/.test(t) ? "도심공공·도심복합" : /모아타운|가로주택|자율주택|소규모/.test(t) ? "모아타운·소규모" : /재정비촉진|존치/.test(t) ? "재정비촉진" : /역세권|장기전세/.test(t) ? "역세권" : /재건축/.test(t) && !/재개발|신속/.test(t) ? "재건축" : "재개발·신통기획"; };
      var order = ["재개발·신통기획", "재정비촉진", "도심공공·도심복합", "재건축", "모아타운·소규모", "역세권"];
      rows.sort(function (a, b) { return order.indexOf(kindOf(a.k)) - order.indexOf(kindOf(b.k)) || (b.m2 || 0) - (a.m2 || 0); });
      var hint = $("#zoneHint");
      hint.textContent = rows.length ? dn + "에 걸친 재개발·재건축 구역 " + rows.length + "곳이에요. 서울시 자료(" + ((Z && Z.date) || "").replace(/^(\d{4})-(\d{2})$/, function (m, y, mo) { return y + "년 " + (+mo) + "월"; }) + ")의 사업 유형과 추진 단계예요. 지도 탭에서 경계를 볼 수 있어요." : dn + "에는 서울시 자료에 있는 재개발·재건축 구역이 없어요.";
      rows.forEach(function (z) {
        var c = el("article", "lt zone");
        var h = el("div", "lt-head"); h.appendChild(el("h3", null, z.n)); h.appendChild(el("span", "zchip", kindOf(z.k))); c.appendChild(h);
        z.k.forEach(function (x) { c.appendChild(el("p", "stage", x[0] + " · " + x[1])); });
        var facts = [];
        if (z.m2) facts.push("면적 " + z.m2.toLocaleString("ko-KR") + "㎡ (약 " + Math.round(z.m2 / 3.3058).toLocaleString("ko-KR") + "평)");
        var other = (z.d || []).filter(function (x) { return x !== key; }).map(function (x) { return x.split(":")[1]; });
        if (other.length) facts.push("옆 " + other.join("·") + "에도 걸쳐 있어요");
        if (z.loose) facts.push("서울시 경계 자료에는 아직 없어요. 출처: " + z.src);
        if (facts.length) { var ul = el("ul", "facts"); facts.forEach(function (f) { ul.appendChild(el("li", null, f)); }); c.appendChild(ul); }
        if (z.p) { // 누르면 이 구역 안 실거래가 펼쳐져요
          var bt = el("button", "lkbtn deal-btn", "이 구역 실거래 보기 ›"); bt.type = "button"; bt.setAttribute("aria-expanded", "false");
          var pane = el("div", "deals"); pane.hidden = true;
          bt.addEventListener("click", function () {
            var open = pane.hidden; pane.hidden = !open; bt.setAttribute("aria-expanded", String(open)); bt.textContent = open ? "실거래 접기 ‹" : "이 구역 실거래 보기 ›";
            if (open && !pane.dataset.done) { pane.dataset.done = "1"; showDeals(z, pane); }
          });
          c.appendChild(bt); c.appendChild(pane);
        }
        list.appendChild(c);
      });
    });
  }
  // 실거래: data/deals/<구코드>.json (서울시 부동산 실거래가 정보, tools/build-deals.py)에서 구역이 걸친 동의 거래를 꺼내,
  // 지번을 카카오로 좌표로 바꾼 뒤 구역 경계 안에 드는 것만 보여 줘요. 지번이 가려진 거래(단독·다가구 등)는 위치를 몰라 빼요.
  var dealFiles = {};
  function dealFile(g) { return dealFiles[g] || (dealFiles[g] = fetch("./data/deals/" + g + ".json").then(function (r) { if (!r.ok) throw r; return r.json(); }).catch(function () { delete dealFiles[g]; return null; })); }
  function inRings(ll, rings) { // ll = [위도, 경도], rings = [[[경도, 위도], ...]] (짝수 번 걸치면 구멍)
    var x = ll[1], y = ll[0], o = false;
    rings.forEach(function (r) { for (var i = 0, j = r.length - 1; i < r.length; j = i++) { var a = r[i], b = r[j]; if ((a[1] > y) !== (b[1] > y) && x < (b[0] - a[0]) * (y - a[1]) / (b[1] - a[1]) + a[0]) o = !o; } });
    return o;
  }
  function won(v) { var e = Math.floor(v / 10000), m = v % 10000; return (e ? e + "억" : "") + (m ? (e ? " " : "") + m.toLocaleString("ko-KR") + "만" : ""); }
  function showDeals(z, pane) {
    var M = window.CS_MAP, msg = el("p", "hint", "실거래를 불러오는 중이에요."); pane.appendChild(msg);
    var byGu = {}; (z.d || []).forEach(function (k) { var p = k.split(":"); (byGu[p[0]] = byGu[p[0]] || []).push(p[1]); });
    Promise.all(Object.keys(byGu).map(function (g) { return dealFile(g).then(function (f) { return { g: g, f: f }; }); })).then(function (got) {
      var cand = [], meta = null;
      got.forEach(function (x) { if (!x.f) return; meta = x.f; byGu[x.g].forEach(function (dn) { ((x.f.d || {})[dn] || []).forEach(function (r) { cand.push({ gu: x.f.gu, dn: dn, r: r }); }); }); });
      if (!meta) { msg.textContent = "실거래 자료를 아직 넣지 않았어요. 곧 채워 넣을게요."; return; }
      if (!M || !M.addr) { msg.textContent = "지도를 불러오지 못해서 구역 안 거래를 가르지 못했어요."; return; }
      var hidden = cand.filter(function (c) { return !c.r[7]; }).length; cand = cand.filter(function (c) { return c.r[7]; });
      var keys = {}; cand.forEach(function (c) { keys[c.gu + " " + c.dn + " " + c.r[7]] = 1; });
      var qs = Object.keys(keys), pos = {}, i = 0, done = 0;
      msg.textContent = "거래 " + cand.length + "건의 위치를 확인하는 중이에요 (0/" + qs.length + ").";
      function next() {
        if (i >= qs.length) return Promise.resolve();
        var q = qs[i++];
        return M.addr("서울 " + q).then(function (ll) { pos[q] = ll; done++; if (done % 10 === 0) msg.textContent = "거래 " + cand.length + "건의 위치를 확인하는 중이에요 (" + done + "/" + qs.length + ")."; return next(); });
      }
      Promise.all([next(), next(), next(), next()]).then(function () {
        M.save();
        var rows = cand.filter(function (c) { var ll = pos[c.gu + " " + c.dn + " " + c.r[7]]; return ll && inRings(ll, z.p); });
        rows.sort(function (a, b) { return b.r[0] < a.r[0] ? -1 : 1; });
        var dd = (meta.date || "").split("-");
        msg.textContent = rows.length ? "이 구역 안 실거래 " + rows.length + "건이에요 (" + meta.from + "년부터 " + (dd.length === 3 ? dd[0] + "년 " + (+dd[1]) + "월 " + (+dd[2]) + "일 계약" : "") + "까지)." + (hidden ? " 지번이 가려진 " + hidden + "건은 위치를 몰라 뺐어요." : "") : "이 구역 안에서 확인된 실거래가 없어요." + (hidden ? " 지번이 가려진 " + hidden + "건은 위치를 몰라 뺐어요." : "");
        var ul = el("ul", "deal-list");
        rows.forEach(function (c) {
          var r = c.r, li = el("li", "deal");
          var top = el("div", "deal-top"); top.appendChild(el("b", null, won(r[2]))); top.appendChild(el("span", "deal-t", r[1])); top.appendChild(el("span", "deal-d", r[0].slice(0, 4) + "." + r[0].slice(4, 6) + "." + r[0].slice(6, 8))); li.appendChild(top);
          var bits = [];
          if (r[3]) bits.push("건물 " + r[3] + "㎡");
          if (r[4]) bits.push("대지 " + r[4] + "㎡ (" + (r[4] / 3.3058).toFixed(1) + "평, 평당 " + won(Math.round(r[2] / (r[4] / 3.3058))) + ")");
          if (r[5]) bits.push(r[5] + "층");
          if (r[6]) bits.push(r[6] + "년 지음");
          bits.push(c.dn + " " + r[7] + (r[8] ? " " + r[8] : ""));
          li.appendChild(el("p", "deal-s", bits.join(" · ")));
          ul.appendChild(li);
        });
        pane.appendChild(ul);
        pane.appendChild(el("p", "hint", "출처: " + (meta.src || "") + ". 대지는 토지면적(공동주택은 대지권 면적)이에요."));
      });
    });
  }
  function when(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function paint(id) {
    var c = cards[id]; if (!c) return; var r = store[id] || {};
    c.dataset.status = r.status || "";
    c.querySelectorAll(".tg[data-s]").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === r.status)); });
    var pk = c.querySelector(".tg.pick"); if (pk) { pk.setAttribute("aria-pressed", String(!!r.pick)); pk.textContent = r.pick ? "동선에 담음" : "동선 담기"; }
    var ta = $("#memo-" + id); if (ta && document.activeElement !== ta && ta.value !== (r.memo || "")) ta.value = r.memo || "";
    var bj = $("#bunji-" + id); if (bj && document.activeElement !== bj && bj.value !== (r.bunji || "")) bj.value = r.bunji || "";
  }
  function paintAll() { Object.keys(cards).forEach(paint); progress(); applyFilter(); tabCount(); }
  function counts(list) {
    var v = 0, c = 0; list.forEach(function (b) { var s = (store[b[0]] || {}).status; if (s === "visit") v++; else if (s === "call") c++; });
    return { v: v, c: c };
  }
  function progress() {
    var k = counts(B), p = $("#progress"); p.textContent = "";
    p.appendChild(document.createTextNode("중개업소 " + B.length + "곳 중 방문 ")); p.appendChild(el("b", null, String(k.v)));
    p.appendChild(document.createTextNode(" · 통화 ")); p.appendChild(el("b", null, String(k.c)));
    p.appendChild(document.createTextNode(" · 남은 곳 ")); p.appendChild(el("b", null, String(B.length - k.v - k.c)));
  }
  function picks() { return all().filter(function (b) { return (store[b[0]] || {}).pick; }); }
  function tabCount() { var n = picks().length; $("#tab-route").textContent = n ? "동선 " + n : "동선"; }
  function visible(b) {
    var id = b[0], r = store[id] || {}, RV = window.CS_REVIEWS;
    if (b[10] && !(regionFn && regionFn(id)) && !r.pick) return false; // 다른 동: 영역 안이거나 동선에 담은 것만
    if (regionFn && !regionFn(id)) return false;
    if (street && b[5] !== street) return false;
    if (filter === "first" && !b[6]) return false;
    if (filter === "todo" && r.status) return false;
    if (filter === "pick" && !r.pick) return false;
    if (filter === "memo" && !(r.memo || "").trim()) return false;
    if (filter === "review" && !(RV && RV.count(id))) return false;
    if (filter === "fake" && !(RV && RV.fakes(id))) return false;
    return true;
  }
  function applyFilter() {
    if (!AREA) return;
    var shown = 0, per = {};
    all().forEach(function (b) { var ok = visible(b); cards[b[0]].hidden = !ok; if (ok) { shown++; per[b[5]] = 1; } });
    document.querySelectorAll("#brokerList .grp").forEach(function (g) { g.hidden = !per[g.dataset.street]; });
    $("#emptyB").hidden = shown > 0;
    changed("");
  }

  // 이름
  var dlg = $("#nameDlg"), nameBtn = $("#nameBtn"), nameWaiters = [];
  function showName() { nameBtn.textContent = me ? "리뷰 이름: " + me : "리뷰에 쓸 이름 정하기"; }
  function closeName() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  function openName() { $("#nameInput").value = me; if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
  nameBtn.addEventListener("click", function () { var AU = window.CS_AUTH; if (AU && AU.active) AU.openAccount(); else openName(); });
  $("#nameCancel").addEventListener("click", closeName);
  $("#nameForm").addEventListener("submit", function (e) {
    e.preventDefault();
    me = $("#nameInput").value.trim().slice(0, 20);
    try { localStorage.setItem("cs-name", me); } catch (err) {}
    showName(); closeName();
    nameWaiters.splice(0).forEach(function (f) { f(me); });
  });
  dlg.addEventListener("close", function () { nameWaiters.length = 0; }); // 이름 창을 그냥 닫으면 대기 중인 저장은 취소

  // 길 묶음 고르기 (약도의 동그라미와 길 버튼이 같이 움직여요)
  function setStreet(s, scroll) {
    street = (street === s) ? "" : s;
    document.querySelectorAll(".cl, #streets .chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o.dataset.street === street)); });
    applyFilter();
    if (street && scroll) { var first = document.querySelector('#brokerList .grp[data-street="' + street + '"]'); if (first && first.scrollIntoView) first.scrollIntoView({ block: "start", behavior: "smooth" }); }
  }
  function buildStreets() {
    var box = $("#streets"), n = {}; B.forEach(function (b) { n[b[5]] = (n[b[5]] || 0) + 1; });
    Object.keys(ST).forEach(function (k) {
      var ch = el("button", "chip", ST[k].split(" · ")[0] + " " + (n[k] || 0)); ch.type = "button"; ch.dataset.street = k; ch.setAttribute("aria-pressed", "false"); ch.title = ST[k];
      ch.addEventListener("click", function () { setStreet(k, false); }); box.appendChild(ch);
    });
  }

  var TABS = ["brokers", "listings", "route"], tab = "brokers";
  function showTab(name) {
    if (TABS.indexOf(name) < 0) name = "brokers";
    tab = name;
    TABS.forEach(function (n) { $("#" + n).hidden = n !== name; $("#tab-" + n).setAttribute("aria-selected", String(n === name)); });
    try { localStorage.setItem("cs-tab-" + areaId, name); } catch (e) {}
    changed("tab:" + name);
  }

  // 최근 본 구역 (이 기기에만 저장). h: 주소, n: 이름, s: 설명, c: 중개업소 수, v·k·p: 내 방문·통화·동선 수
  var RECENT_MAX = 8;
  function readRecent() { try { var r = JSON.parse(localStorage.getItem("cs-recent") || "null"); return Array.isArray(r) ? r : null; } catch (e) { return null; } }
  function writeRecent(r) { try { localStorage.setItem("cs-recent", JSON.stringify(r.slice(0, RECENT_MAX))); } catch (e) {} }
  function recentOf(a, href) {
    var k = counts(a.data.B), pk = a.data.B.filter(function (b) { return (store[b[0]] || {}).pick; }).length;
    return { h: href, n: a.name, s: a.sub, c: a.data.B.length, z: (a.zones || []).length, v: k.v, k: k.c, p: pk, t: new Date().toISOString() };
  }
  function hrefOf(a) { return a.dynamic ? "./?gu=" + a.id.slice(1, 6) + "&dong=" + encodeURIComponent(a.id.slice(7)) : "./?area=" + a.id; }
  function saveRecent() { // 지금 보는 구역을 맨 앞으로
    if (!AREA) return;
    var now = recentOf(AREA, hrefOf(AREA)), r = (readRecent() || []).filter(function (x) { return x && x.h !== now.h; });
    r.unshift(now); writeRecent(r);
  }
  function buildRecent() {
    var r = readRecent();
    if (!r) { // 처음: 전에 체크나 메모를 남긴 정리된 구역이 있으면 넣어 줘요
      r = [];
      AREAS.order.forEach(function (id) {
        var a = AREAS[id]; if (!a || !a.data) return;
        if (a.data.B.some(function (b) { var n = store[b[0]]; return n && (n.status || n.memo || n.pick); })) r.push(recentOf(a, hrefOf(a)));
      });
      if (r.length) writeRecent(r);
    }
    var list = $("#recentList"); list.textContent = ""; $("#recentHint").hidden = r.length > 0; $("#recentClear").hidden = r.length < 2;
    r.forEach(function (x) {
      if (!x || !x.h || !x.n) return;
      var c = el("a", "area recent"); c.href = x.h;
      var h = el("div", "area-head"); h.appendChild(el("span", "area-name", x.n)); h.appendChild(el("span", "area-go", "보기 ›"));
      // 목록에서만 빼요. 그 구역에 남긴 방문·통화·메모 기록은 그대로 남아요.
      var del = el("button", "recent-del", "×"); del.type = "button"; del.setAttribute("aria-label", x.n + " 최근 목록에서 지우기");
      del.addEventListener("click", function (e) { e.preventDefault(); e.stopPropagation(); writeRecent((readRecent() || []).filter(function (y) { return y && y.h !== x.h; })); buildRecent(); });
      h.appendChild(del); c.appendChild(h);
      if (x.s) c.appendChild(el("p", "who", x.s));
      var ul = el("ul", "facts");
      ul.appendChild(el("li", null, "중개업소 " + x.c + "곳"));
      if (x.z) ul.appendChild(el("li", null, "구역 " + x.z + "개"));
      c.appendChild(ul);
      if (x.v || x.k || x.p) c.appendChild(el("p", "by", "내 기록: 방문 " + x.v + " · 통화 " + x.k + (x.p ? " · 동선 " + x.p : "")));
      list.appendChild(c);
    });
  }

  // 첫 화면: 서울 전체에서 구 → 동 고르기
  function buildSeoul() {
    var S = window.CS_SEOUL; if (!S || !S.gu) return;
    $("#seoulBlk").hidden = false;
    var d = (S.updated || "").split("-");
    $("#seoulHint").textContent = "서울시에 등록된 중개업소 " + S.total.toLocaleString("ko-KR") + "곳이에요" + (d.length === 3 ? " (" + (+d[1]) + "월 " + (+d[2]) + "일 기준)" : "") + ". " + (window.CS_GUMAP ? "약도에서 구를 누르고" : "구를 누르고") + " 동을 고르면 그 동의 중개업소가 지도와 함께 나와요.";
    var chips = $("#guChips"), list = $("#dongList"), search = $("#dongSearch"), cur = "";
    // 구를 고르면 서울 약도 대신 그 구 화면(주소 끝 #gu=구코드)으로 넘어가요. 뒤로 가기를 누르면 서울 약도로 돌아와요.
    function guOfHash() { var m = /^#gu=(\d{5})$/.exec(location.hash || ""); return m ? m[1] : ""; }
    cur = guOfHash();
    var zoned = {}; AREAS.order.forEach(function (id) { var a = AREAS[id]; if (a && a.data && a.dong) zoned[a.dong] = id; }); // 구역 정보까지 정리한 동
    function dongLink(g, dn) {
      var a = el("a", "chip dong", dn[0] + " " + dn[1]), z = zoned[g.code + ":" + dn[0]];
      a.href = z ? "./?area=" + z : "./?gu=" + g.code + "&dong=" + encodeURIComponent(dn[0]);
      if (z) { a.classList.add("zoned"); a.title = "재개발 구역 정보와 호가가 있어요"; }
      return a;
    }
    function show() {
      var q = search.value.trim(); list.textContent = "";
      chips.querySelectorAll(".chip").forEach(function (c) { c.setAttribute("aria-pressed", String(!q && c.dataset.code === cur)); });
      document.querySelectorAll("#guMap [data-code]").forEach(function (c) { var on = !q && c.dataset.code === cur; if (c.tagName === "text") c.classList.toggle("on", on); else c.setAttribute("aria-pressed", String(on)); });
      if (q) {
        var box = el("div", "chips"), n = 0;
        S.gu.forEach(function (g) { g.dongs.forEach(function (dn) { if (dn[0].indexOf(q) >= 0 && n < 60) { var a = dongLink(g, dn); a.textContent = g.name + " " + dn[0] + " " + dn[1]; box.appendChild(a); n++; } }); });
        list.appendChild(n ? box : el("p", "empty", "그런 이름의 동이 없어요."));
        return;
      }
      var g = S.gu.filter(function (x) { return x.code === cur; })[0];
      $("#home").classList.toggle("gu-on", !!g);
      if (!g) return;
      var back = el("button", "lkbtn gu-back", "‹ 서울 약도로"); back.type = "button";
      back.addEventListener("click", function () { if (history.state && history.state.gu) history.back(); else pick(""); });
      list.appendChild(back);
      var hd = el("h2", "gu-title", g.name); list.appendChild(hd);
      list.appendChild(el("p", "hint", "중개업소 " + g.n.toLocaleString("ko-KR") + "곳 · 동을 누르면 이름과 중개업소 수가 나오고, 한 번 더 누르면 그 동으로 가요."));
      var dm = el("div", "gumap dongmap"); dm.hidden = true; list.appendChild(dm); dongMap(g, dm);
      var bx = el("div", "chips"); g.dongs.forEach(function (dn) { bx.appendChild(dongLink(g, dn)); }); list.appendChild(bx);
    }
    // 동 약도: 구를 고르면 그 구의 동 모양이 나와요. 한 번 누르면 이름과 중개업소 수가 보이고, 한 번 더 누르거나 '보기'를 누르면 그 동으로 가요.
    // 자료(data/dongmap/<구코드>.json)를 못 받으면 약도 없이 아래 동 버튼만 써요.
    var dmCache = {};
    function dongMap(g, box) {
      var got = dmCache[g.code] || (dmCache[g.code] = fetch("./data/dongmap/" + g.code + ".json").then(function (r) { if (!r.ok) throw r; return r.json(); }));
      got.then(function (M) {
        if (!box.isConnected) return;
        var NS = "http://www.w3.org/2000/svg", sv = function (t, a) { var e = document.createElementNS(NS, t); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; };
        var cnt = {}; g.dongs.forEach(function (dn) { cnt[dn[0]] = dn; });
        var svg = sv("svg", { viewBox: "0 0 " + M.w + " " + M.h, role: "group", "aria-label": g.name + " 약도에서 동 고르기" }), shapes = sv("g"), labels = sv("g", { "aria-hidden": "true" });
        var cap = el("div", "dm-cap"), capT = el("span", null, "동 모양을 누르면 이름과 중개업소 수가 나와요."), capA = el("a", "lkbtn", "보기 ›");
        capA.hidden = true; cap.appendChild(capT); cap.appendChild(capA);
        var sel = "";
        function choose(name, p) {
          var dn = cnt[name], href = dongLink(g, dn).href;
          if (sel === name) { location.href = href; return; }
          sel = name;
          shapes.querySelectorAll(".gm").forEach(function (o) { o.setAttribute("aria-pressed", String(o === p)); });
          labels.querySelectorAll("text").forEach(function (t) { t.classList.toggle("on", t.dataset.n === name); });
          capT.textContent = name + " · 중개업소 " + dn[1] + "곳"; capA.href = href; capA.hidden = false;
        }
        Object.keys(M.dong).forEach(function (name) {
          var m = M.dong[name], dn = cnt[name];
          var p = sv("path", { d: m.d, "class": dn ? "gm" : "gm none" });
          if (dn) {
            p.setAttribute("tabindex", "0"); p.setAttribute("role", "button"); p.setAttribute("aria-pressed", "false");
            p.setAttribute("aria-label", name + " 중개업소 " + dn[1] + "곳");
            p.addEventListener("click", function () { choose(name, p); });
            p.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); choose(name, p); } });
          }
          var tt = sv("title"); tt.textContent = name + (dn ? " · 중개업소 " + dn[1] + "곳" : " · 등록된 중개업소 없음"); p.appendChild(tt);
          shapes.appendChild(p);
          // 글자가 모양 안에 들어갈 만한 동만 이름을 써요. 작은 동은 눌러서 확인해요.
          var fs = Math.min(26, m.r * 2.5 / (name.length * 0.92), m.r * 1.6);
          if (fs >= 18) { var t = sv("text", { x: m.c[0], y: m.c[1], "class": "gm-l dm-l" + (dn ? "" : " none"), "data-n": name, style: "font-size:" + Math.round(fs) + "px" }); t.textContent = name; labels.appendChild(t); }
        });
        svg.appendChild(shapes); svg.appendChild(labels);
        box.appendChild(svg); box.appendChild(cap); box.hidden = false;
      }, function () {});
    }
    function pick(code) {
      cur = code; search.value = "";
      try { if (code) history.pushState({ gu: code }, "", "#gu=" + code); else history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
      show(); window.scrollTo(0, 0);
    }
    window.addEventListener("popstate", function () { cur = guOfHash(); search.value = ""; show(); window.scrollTo(0, 0); });
    S.gu.forEach(function (g) {
      var c = el("button", "chip", g.name); c.type = "button"; c.dataset.code = g.code; c.setAttribute("aria-pressed", "false");
      c.addEventListener("click", function () { pick(g.code); });
      chips.appendChild(c);
    });
    // 약도: 구 모양을 누르면 그 구의 동 목록이 아래에 나와요. 약도 자료(seoulmap.js)가 없으면 위의 버튼을 그대로 써요.
    var GM = window.CS_GUMAP;
    if (GM && GM.gu) {
      var NS = "http://www.w3.org/2000/svg", sv = function (t, a) { var e = document.createElementNS(NS, t); Object.keys(a || {}).forEach(function (k) { e.setAttribute(k, a[k]); }); return e; };
      var svg = sv("svg", { viewBox: "0 0 " + GM.w + " " + GM.h, role: "group", "aria-label": "서울 약도에서 구 고르기" }), shapes = sv("g"), labels = sv("g", { "aria-hidden": "true" });
      S.gu.forEach(function (g) {
        var m = GM.gu[g.code]; if (!m) return;
        var p = sv("path", { d: m.d, "class": "gm", "data-code": g.code, tabindex: "0", role: "button", "aria-pressed": "false", "aria-label": g.name + " 중개업소 " + g.n.toLocaleString("ko-KR") + "곳" });
        p.addEventListener("click", function () { pick(g.code); });
        p.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); pick(g.code); } });
        shapes.appendChild(p);
        var t = sv("text", { x: m.c[0], y: m.c[1], "class": "gm-l", "data-code": g.code }); t.textContent = g.name; labels.appendChild(t);
      });
      svg.appendChild(shapes); if (GM.river) svg.appendChild(sv("path", { d: GM.river, "class": "gm-river" })); svg.appendChild(labels);
      $("#guMap").appendChild(svg); $("#guMap").hidden = false; chips.hidden = true;
    }
    search.addEventListener("input", show);
    show();
  }

  // 리뷰(reviews.js)·지도(map.js)·동선(route.js)이 쓰는 연결 고리
  window.CS_APP = {
    area: AREA, B: B, cards: cards, el: el, when: when, $: $,
    name: function () { return me; },
    needName: function (then) {
      var AU = window.CS_AUTH;
      if (AU && AU.active) { var u = AU.user(); if (u) then(u.nick || u.email.split("@")[0]); else AU.requireLogin(); return; } // 회원제: 닉네임이 리뷰 이름
      if (me) { then(me); return; } nameWaiters.push(then); openName();
    },
    setName: function (n) { me = n || ""; },
    refilter: function () { applyFilter(); },
    visible: visible, picks: picks, setPick: setPick,
    all: all, addExtra: addExtra,
    setPicks: function (ids, on) { // 여러 곳을 한꺼번에 담거나 빼기
      var n = 0; ids.forEach(function (id) { if (!cards[id]) return; var r = rec(id); if (!!r.pick !== !!on) { r.pick = on ? 1 : 0; r.at = new Date().toISOString(); paint(id); n++; } });
      if (n) { saveLocal(); setSave("ok", "내 메모 저장됨"); applyFilter(); tabCount(); changed("picks"); }
      return n;
    },
    showTab: function (n) { showTab(n); },
    showListings: SHOW_LISTINGS,
    setRegion: function (fn) { regionFn = fn || null; applyFilter(); },
    onRegionOff: function (f) { regionOff.push(f); },
    status: function (id) { return (store[id] || {}).status || ""; },
    tab: function () { return tab; },
    onChange: function (f) { listeners.push(f); },
    goCard: function (id) {
      if (tab !== "brokers") showTab("brokers");
      var c = cards[id]; if (!c) return;
      if (c.hidden) { filter = "all"; street = ""; if (regionFn) { regionFn = null; regionOff.forEach(function (f) { f(); }); } document.querySelectorAll("#filters .chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o.dataset.f === "all")); }); document.querySelectorAll(".cl, #streets .chip").forEach(function (o) { o.setAttribute("aria-pressed", "false"); }); applyFilter(); }
      c.scrollIntoView({ block: "center", behavior: "smooth" }); c.classList.add("flash"); setTimeout(function () { c.classList.remove("flash"); }, 1600);
    }
  };

  // 맨 위로: 조금 내려가면 오른쪽 아래에 나타나요
  var toTop = $("#toTop"), ticking = false;
  function topBtn() { ticking = false; toTop.hidden = (window.pageYOffset || document.documentElement.scrollTop) < 500; }
  window.addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(topBtn); } }, { passive: true });
  toTop.addEventListener("click", function () {
    var calm = window.matchMedia && matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: 0, behavior: calm ? "auto" : "smooth" });
  });

  // 설치
  var deferred = null, installBtn = $("#installBtn");
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  installBtn.addEventListener("click", function () { if (!deferred) return; deferred.prompt(); deferred = null; installBtn.hidden = true; });
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $("#iosHint").hidden = false;
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });

  // 시작
  loadLocal(); showName();
  if (!AREA) {
    $("#home").hidden = false; buildSeoul(); buildRecent();
    $("#recentClear").addEventListener("click", function () { if (confirm("최근 본 구역 목록을 모두 지울까요? 남긴 방문·통화·메모 기록은 그대로 있어요.")) { writeRecent([]); buildRecent(); } });
    if (window.CS_BOOT_ERR) { $("#bootErr").hidden = false; $("#bootErr").textContent = window.CS_BOOT_ERR; }
    $("#progress").textContent = "재개발·재건축 구역별 중개업소와 리뷰";
    setSave("", "");
    return;
  }
  document.title = AREA.name + " 임장 수첩"; $("#title").textContent = AREA.name + " 임장 수첩";
  saveRecent(); // 첫 화면의 "최근 본 구역"에 올려요. 나갈 때 내 기록 수를 다시 적어요.
  window.addEventListener("pagehide", saveRecent);
  document.addEventListener("visibilitychange", function () { if (document.hidden) saveRecent(); });
  $("#homeLink").hidden = false; $("#tabs").hidden = false;
  if (AREA.svgMap) $("#svgMap").hidden = false; else $("#streets").hidden = false;
  if (!B.some(function (b) { return b[6]; })) { var fc = $('#filters .chip[data-f="first"]'); if (fc) fc.hidden = true; }
  buildBrokers(); buildListings(); buildZones(); buildStreets(); paintAll();

  document.querySelectorAll("#filters .chip").forEach(function (ch) {
    ch.addEventListener("click", function () { filter = ch.dataset.f; document.querySelectorAll("#filters .chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o === ch)); }); applyFilter(); });
  });
  document.querySelectorAll(".cl").forEach(function (g) {
    g.addEventListener("click", function () { setStreet(g.dataset.street, true); });
    g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); setStreet(g.dataset.street, true); } });
  });
  TABS.forEach(function (n) { $("#tab-" + n).addEventListener("click", function () { showTab(n); }); });
  var t0 = "brokers";
  try { t0 = location.hash ? location.hash.slice(1) : (localStorage.getItem("cs-tab-" + areaId) || (areaId === "changsin" ? localStorage.getItem("changsin-tab") : "") || "brokers"); } catch (e) {}
  showTab(t0);
  setSave("", "메모는 이 기기에만 저장");
})();
