// 창신 임장 수첩 — 화면 동작. 데이터는 data.js, 공동 저장은 sync.js, 설정은 config.js.
(function () {
  var D = window.CS_DATA, ST = D.ST, B = D.B, L = D.L;
  var store = {}, sync = null, timers = {}, chains = {}, unsigned = {}, filter = "all", street = "";
  var me = "";
  try { me = localStorage.getItem("cs-name") || ""; } catch (e) {}

  var $ = function (s, r) { return (r || document).querySelector(s); };
  var el = function (t, c, x) { var e = document.createElement(t); if (c) e.className = c; if (x != null) e.textContent = x; return e; };
  var saveEl = $("#save");
  function setSave(state, text) { saveEl.dataset.state = state; saveEl.textContent = text; }
  function loadLocal() { try { var s = localStorage.getItem("changsin-notes"); if (s) store = JSON.parse(s) || {}; } catch (e) {} }
  function saveLocal() { try { localStorage.setItem("changsin-notes", JSON.stringify(store)); } catch (e) {} }
  function rec(id) { return store[id] || (store[id] = { status: "", memo: "", bunji: "", by: "", at: "" }); }

  function persist(id) {
    var r = rec(id);
    r.by = me || ""; r.at = new Date().toISOString();
    if (!me) unsigned[id] = 1; else delete unsigned[id];
    saveLocal(); paintBy(id);
    if (!sync) { setSave("", "이 기기에만 저장됨"); return; }
    var body = { status: r.status || "", memo: (r.memo || "").slice(0, 2000), bunji: (r.bunji || "").slice(0, 100), by: r.by.slice(0, 20), at: r.at };
    setSave("", "저장 중");
    chains[id] = (chains[id] || Promise.resolve())
      .then(function () { return sync.set(id, body); })
      .then(function () { setSave("ok", "모두에게 저장됨"); })
      .catch(function () { setSave("", "저장 실패 · 이 기기에는 남아 있어요"); });
  }
  function later(id) { clearTimeout(timers[id]); timers[id] = setTimeout(function () { timers[id] = null; persist(id); }, 800); }
  // 화면을 닫거나 다른 앱으로 넘어갈 때, 아직 안 보낸 메모를 바로 저장해요.
  function flush() { Object.keys(timers).forEach(function (id) { if (timers[id]) { clearTimeout(timers[id]); timers[id] = null; persist(id); } }); }
  document.addEventListener("visibilitychange", function () { if (document.visibilityState === "hidden") flush(); });
  window.addEventListener("pagehide", flush);
  function hasContent(r) { return !!(r && (r.status || (r.memo || "").trim() || (r.bunji || "").trim())); }

  function mapLinks(q) {
    var full = "서울 종로구 " + q, f = document.createDocumentFragment();
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
  function buildBrokers() {
    var list = $("#brokerList"), cur = "";
    B.forEach(function (b) {
      var id = b[0];
      if (b[5] !== cur) { cur = b[5]; var g = el("div", "grp"); g.dataset.street = cur; g.appendChild(el("span", null, ST[cur])); list.appendChild(g); }
      var c = el("article", "bk"); c.dataset.id = id; c.dataset.street = b[5];
      var top = el("div", "bk-top"); top.appendChild(el("h3", null, b[1])); if (b[6]) top.appendChild(el("span", "badge", "먼저 갈 곳")); c.appendChild(top);
      if (b[7]) c.appendChild(el("p", "tags", "올린 매물: " + b[7]));
      var ad = el("p", "row"); ad.appendChild(el("span", "v", b[2])); ad.appendChild(mapLinks(b[3])); c.appendChild(ad);
      var tl = el("p", "row");
      if (b[4]) { var n = el("span", "num", b[4]); tl.appendChild(n); tl.appendChild(copyBtn(b[4], n)); var t = el("a", null, "전화 걸기"); t.href = "tel:" + b[4].replace(/-/g, ""); tl.appendChild(t); }
      else tl.appendChild(el("span", "v", "등록부에 전화번호 없음"));
      c.appendChild(tl);
      var acts = el("div", "acts");
      [["call", "통화함"], ["visit", "방문함"]].forEach(function (s) {
        var bt = el("button", "tg " + s[0], s[1]); bt.type = "button"; bt.setAttribute("aria-pressed", "false"); bt.dataset.s = s[0];
        bt.addEventListener("click", function () { var r = rec(id); r.status = (r.status === s[0]) ? "" : s[0]; paint(id); progress(); applyFilter(); persist(id); askName(); });
        acts.appendChild(bt);
      });
      c.appendChild(acts);
      var ta = el("textarea"); ta.id = "memo-" + id; ta.rows = 1; ta.placeholder = "메모: 번지, 가격, 들은 얘기"; ta.setAttribute("aria-label", b[1] + " 메모");
      ta.addEventListener("input", function () { rec(id).memo = ta.value; later(id); });
      ta.addEventListener("blur", function () { applyFilter(); askName(); });
      c.appendChild(ta);
      var by = el("p", "by"); by.id = "by-" + id; by.hidden = true; c.appendChild(by);
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
        var lb = el("label", "fld", "받아온 번지"); var inp = el("input"); inp.type = "text"; inp.id = "bunji-" + x.id; inp.placeholder = "예: 창신동 123-45"; inp.autocomplete = "off"; inp.maxLength = 100;
        inp.addEventListener("input", function () { rec(x.id).bunji = inp.value; later(x.id); }); lb.appendChild(inp); c.appendChild(lb);
      }
      var ta = el("textarea"); ta.id = "memo-" + x.id; ta.rows = 1; ta.placeholder = "메모: 본 느낌, 깎을 수 있는 금액"; ta.setAttribute("aria-label", x.name + " 메모");
      ta.addEventListener("input", function () { rec(x.id).memo = ta.value; later(x.id); });
      ta.addEventListener("blur", askName);
      c.appendChild(ta);
      var by = el("p", "by"); by.id = "by-" + x.id; by.hidden = true; c.appendChild(by);
      list.appendChild(c); cards[x.id] = c;
    });
  }
  function when(iso) {
    var d = new Date(iso); if (isNaN(d)) return "";
    var p = function (n) { return (n < 10 ? "0" : "") + n; };
    return (d.getMonth() + 1) + "/" + d.getDate() + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }
  function paintBy(id) {
    var p = $("#by-" + id); if (!p) return; var r = store[id] || {};
    var has = r.at && (r.status || (r.memo || "").trim() || (r.bunji || "").trim());
    p.hidden = !has;
    if (has) p.textContent = "마지막 수정: " + (r.by || "이름 없음") + " · " + when(r.at);
  }
  function paint(id) {
    var c = cards[id]; if (!c) return; var r = store[id] || {};
    c.dataset.status = r.status || "";
    c.querySelectorAll(".tg").forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.s === r.status)); });
    var ta = $("#memo-" + id); if (ta && document.activeElement !== ta && ta.value !== (r.memo || "")) ta.value = r.memo || "";
    var bj = $("#bunji-" + id); if (bj && document.activeElement !== bj && bj.value !== (r.bunji || "")) bj.value = r.bunji || "";
    paintBy(id);
  }
  function paintAll() { Object.keys(cards).forEach(paint); progress(); applyFilter(); }
  function progress() {
    var v = 0, c = 0; B.forEach(function (b) { var s = (store[b[0]] || {}).status; if (s === "visit") v++; else if (s === "call") c++; });
    var p = $("#progress"); p.textContent = "";
    p.appendChild(document.createTextNode("중개업소 " + B.length + "곳 중 방문 ")); p.appendChild(el("b", null, String(v)));
    p.appendChild(document.createTextNode(" · 통화 ")); p.appendChild(el("b", null, String(c)));
    p.appendChild(document.createTextNode(" · 남은 곳 ")); p.appendChild(el("b", null, String(B.length - v - c)));
  }
  function applyFilter() {
    var shown = 0, per = {};
    B.forEach(function (b) {
      var id = b[0], r = store[id] || {}, ok = true;
      if (street && b[5] !== street) ok = false;
      if (filter === "first" && !b[6]) ok = false;
      if (filter === "todo" && r.status) ok = false;
      if (filter === "memo" && !(r.memo || "").trim()) ok = false;
      cards[id].hidden = !ok; if (ok) { shown++; per[b[5]] = 1; }
    });
    document.querySelectorAll("#brokerList .grp").forEach(function (g) { g.hidden = !per[g.dataset.street]; });
    $("#emptyB").hidden = shown > 0;
  }

  // 이름
  var dlg = $("#nameDlg"), nameBtn = $("#nameBtn"), asked = false;
  function showName() { nameBtn.textContent = me ? "내 이름: " + me : "내 이름 정하기"; }
  function openName() { $("#nameInput").value = me; if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", ""); }
  function askName() { if (!me && !asked) { asked = true; openName(); } }
  nameBtn.addEventListener("click", openName);
  $("#nameCancel").addEventListener("click", function () { dlg.close ? dlg.close() : dlg.removeAttribute("open"); });
  $("#nameForm").addEventListener("submit", function (e) {
    e.preventDefault();
    me = $("#nameInput").value.trim().slice(0, 20);
    try { localStorage.setItem("cs-name", me); } catch (err) {}
    showName(); dlg.close ? dlg.close() : dlg.removeAttribute("open");
    if (me) Object.keys(unsigned).forEach(persist); // 이름 정하기 전에 적은 것에도 이름을 붙여요.
  });

  // 걸러 보기, 약도, 탭
  document.querySelectorAll("#filters .chip").forEach(function (ch) {
    ch.addEventListener("click", function () { filter = ch.dataset.f; document.querySelectorAll("#filters .chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o === ch)); }); applyFilter(); });
  });
  document.querySelectorAll(".cl").forEach(function (g) {
    var go = function () {
      street = (street === g.dataset.street) ? "" : g.dataset.street;
      document.querySelectorAll(".cl").forEach(function (o) { o.setAttribute("aria-pressed", String(o.dataset.street === street)); });
      applyFilter();
      if (street) { var first = document.querySelector('#brokerList .grp[data-street="' + street + '"]'); if (first && first.scrollIntoView) first.scrollIntoView({ block: "start", behavior: "smooth" }); }
    };
    g.addEventListener("click", go);
    g.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
  });
  function showTab(name) {
    ["brokers", "listings"].forEach(function (n) { $("#" + n).hidden = n !== name; $("#tab-" + n).setAttribute("aria-selected", String(n === name)); });
    try { localStorage.setItem("changsin-tab", name); } catch (e) {}
  }
  $("#tab-brokers").addEventListener("click", function () { showTab("brokers"); });
  $("#tab-listings").addEventListener("click", function () { showTab("listings"); });

  // 설치
  var deferred = null, installBtn = $("#installBtn");
  window.addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; installBtn.hidden = false; });
  installBtn.addEventListener("click", function () { if (!deferred) return; deferred.prompt(); deferred = null; installBtn.hidden = true; });
  var standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone;
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !standalone) $("#iosHint").hidden = false;
  if ("serviceWorker" in navigator) window.addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });

  // 시작
  buildBrokers(); buildListings(); loadLocal(); paintAll(); showName();
  try { var t = location.hash === "#listings" ? "listings" : localStorage.getItem("changsin-tab"); if (t === "listings") showTab("listings"); } catch (e) {}
  setSave("", "불러오는 중");

  window.CS_SYNC.then(function (s) {
    if (!s) { setSave("", "이 기기에만 저장됨"); return; }
    sync = s;
    var first = true;
    sync.subscribe(function (docs) {
      if (first) { // 연결 전에 이 기기에만 적어 둔 메모를 공동 수첩으로 올려요.
        first = false; var remote = {}; docs.forEach(function (d) { remote[d.id] = 1; });
        Object.keys(store).forEach(function (id) { if (!remote[id] && cards[id] && hasContent(store[id])) persist(id); });
      }
      docs.forEach(function (d) {
        var x = d.data || {}, a = document.activeElement;
        var editing = a && (a.id === "memo-" + d.id || a.id === "bunji-" + d.id);
        if (editing || timers[d.id]) return; // 내가 적는 중인 칸은 덮어쓰지 않아요
        store[d.id] = { status: x.status || "", memo: x.memo || "", bunji: x.bunji || "", by: x.by || "", at: x.at || "" };
      });
      saveLocal(); paintAll();
      if (saveEl.dataset.state !== "ok") setSave("ok", "공동 수첩 연결됨");
    }, function () { sync = null; setSave("", "연결 끊김 · 이 기기에만 저장됨"); });
  });
})();
