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

  function mapLinks(q) {
    var full = (AREA ? AREA.gu + " " : "") + q, f = document.createDocumentFragment();
    var a = el("a", null, "네이버지도"); a.href = "https://map.naver.com/p/search/" + encodeURIComponent(full); a.target = "_blank"; a.rel = "noopener";
    var k = el("a", null, "카카오맵"); k.href = "https://map.kakao.com/link/search/" + encodeURIComponent(full); k.target = "_blank"; k.rel = "noopener";
    f.appendChild(a); f.appendChild(k); return f;
  }
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
  function buildBrokers() {
    var list = $("#brokerList"), cur = "";
    B.forEach(function (b) {
      var id = b[0];
      if (b[5] !== cur) { cur = b[5]; var g = el("div", "grp"); g.dataset.street = cur; g.appendChild(el("span", null, ST[cur])); list.appendChild(g); }
      var c = el("article", "bk"); c.dataset.id = id; c.dataset.street = b[5]; c.id = "card-" + id;
      var top = el("div", "bk-top"); top.appendChild(el("h3", null, b[1])); if (b[6]) top.appendChild(el("span", "badge", "먼저 갈 곳")); c.appendChild(top);
      var stt = /^(new|gone):(\d{4})-(\d{2})-(\d{2})$/.exec(b[9] || "");
      if (stt) { // 매일 등록부를 다시 확인해서 붙이는 표시
        var md = (+stt[3]) + "/" + (+stt[4]);
        if (stt[1] === "new") top.appendChild(el("span", "badge fresh", "새로 등록 " + md));
        else { top.appendChild(el("span", "badge gone", "등록부에서 사라짐 " + md)); c.classList.add("is-gone"); c.appendChild(el("p", "tags", "폐업했거나 다른 곳으로 옮겼을 수 있어요. 가기 전에 전화로 확인하세요.")); }
      }
      if (b[7]) c.appendChild(el("p", "tags", "올린 매물: " + b[7]));
      var ad = el("p", "row"); ad.appendChild(el("span", "v", b[2])); ad.appendChild(mapLinks(b[3])); c.appendChild(ad);
      var tl = el("p", "row");
      if (b[4]) { var n = el("span", "num", b[4]); tl.appendChild(n); tl.appendChild(copyBtn(b[4], n)); var t = el("a", null, "전화 걸기"); t.href = "tel:" + b[4].replace(/-/g, ""); tl.appendChild(t); }
      else tl.appendChild(el("span", "v", "등록부에 전화번호 없음"));
      c.appendChild(tl);
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
      list.appendChild(c); cards[id] = c;
    });
    var e = el("p", "empty", "조건에 맞는 중개업소가 없어요."); e.id = "emptyB"; e.hidden = true; list.appendChild(e);
  }
  function buildListings() {
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
    (AREA.zones || []).forEach(function (z) {
      var c = el("article", "lt zone");
      var h = el("div", "lt-head"); h.appendChild(el("h3", null, z.name)); h.appendChild(el("span", "zchip", z.kind)); c.appendChild(h);
      c.appendChild(el("p", "stage", z.stage));
      if (z.facts && z.facts.length) { var ul = el("ul", "facts"); z.facts.forEach(function (f) { ul.appendChild(el("li", null, f)); }); c.appendChild(ul); }
      if (z.note) c.appendChild(el("p", "who", z.note));
      list.appendChild(c);
    });
    if (L.length) $("#listings").insertBefore($("#listBlk"), $("#zoneBlk")); // 정리한 매물이 있으면 매물을 먼저 보여줘요
    $("#listBlk").hidden = !L.length && !AREA.listHint; // 정리한 매물이 없는 동에서는 빈 제목을 숨겨요
    $("#zoneHint").textContent = AREA.zoneHint || "";
    $("#listHint").textContent = AREA.listHint || "";
    (AREA.ask || []).forEach(function (q) { $("#askList").appendChild(el("li", null, q)); });
    if (AREA.excluded && AREA.excluded.length) { $("#excludedBox").hidden = false; AREA.excluded.forEach(function (x) { $("#excludedList").appendChild(el("li", null, x)); }); }
    var up = window.CS_UPDATED, ft = AREA.foot || "";
    if (up && up.date) { var d = up.date.split("-"); ft += " 등록부를 마지막으로 다시 확인한 날: " + (+d[0]) + "년 " + (+d[1]) + "월 " + (+d[2]) + "일. 그 뒤 새로 생긴 곳과 사라진 곳은 카드에 표시돼요."; }
    $("#foot").textContent = ft;
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
  function picks() { return B.filter(function (b) { return (store[b[0]] || {}).pick; }); }
  function tabCount() { var n = picks().length; $("#tab-route").textContent = n ? "동선 " + n : "동선"; }
  function visible(b) {
    var id = b[0], r = store[id] || {}, RV = window.CS_REVIEWS;
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
    B.forEach(function (b) { var ok = visible(b); cards[b[0]].hidden = !ok; if (ok) { shown++; per[b[5]] = 1; } });
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
    var list = $("#recentList"); list.textContent = ""; $("#recentHint").hidden = r.length > 0;
    r.forEach(function (x) {
      if (!x || !x.h || !x.n) return;
      var c = el("a", "area recent"); c.href = x.h;
      var h = el("div", "area-head"); h.appendChild(el("span", "area-name", x.n)); h.appendChild(el("span", "area-go", "보기 ›")); c.appendChild(h);
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
    $("#seoulHint").textContent = "서울시에 등록된 중개업소 " + S.total.toLocaleString("ko-KR") + "곳이에요" + (d.length === 3 ? " (" + (+d[1]) + "월 " + (+d[2]) + "일 기준)" : "") + ". 구를 누르고 동을 고르면 그 동의 중개업소가 지도와 함께 나와요.";
    var chips = $("#guChips"), list = $("#dongList"), search = $("#dongSearch"), cur = "";
    try { cur = localStorage.getItem("cs-gu") || ""; } catch (e) {}
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
      if (q) {
        var box = el("div", "chips"), n = 0;
        S.gu.forEach(function (g) { g.dongs.forEach(function (dn) { if (dn[0].indexOf(q) >= 0 && n < 60) { var a = dongLink(g, dn); a.textContent = g.name + " " + dn[0] + " " + dn[1]; box.appendChild(a); n++; } }); });
        list.appendChild(n ? box : el("p", "empty", "그런 이름의 동이 없어요."));
        return;
      }
      var g = S.gu.filter(function (x) { return x.code === cur; })[0]; if (!g) return;
      var grp = el("div", "grp"); grp.appendChild(el("span", null, g.name + " · 중개업소 " + g.n.toLocaleString("ko-KR") + "곳")); list.appendChild(grp);
      var bx = el("div", "chips"); g.dongs.forEach(function (dn) { bx.appendChild(dongLink(g, dn)); }); list.appendChild(bx);
    }
    S.gu.forEach(function (g) {
      var c = el("button", "chip", g.name); c.type = "button"; c.dataset.code = g.code; c.setAttribute("aria-pressed", "false");
      c.addEventListener("click", function () { cur = cur === g.code ? "" : g.code; search.value = ""; try { localStorage.setItem("cs-gu", cur); } catch (e) {} show(); });
      chips.appendChild(c);
    });
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
    setPicks: function (ids, on) { // 여러 곳을 한꺼번에 담거나 빼기
      var n = 0; ids.forEach(function (id) { if (!cards[id]) return; var r = rec(id); if (!!r.pick !== !!on) { r.pick = on ? 1 : 0; r.at = new Date().toISOString(); paint(id); n++; } });
      if (n) { saveLocal(); setSave("ok", "내 메모 저장됨"); applyFilter(); tabCount(); changed("picks"); }
      return n;
    },
    showTab: function (n) { showTab(n); },
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
