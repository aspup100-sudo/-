// 중개업소 리뷰: 별점, 친절도, 허위매물 여부, 한 줄 후기. 한 사람(기기)이 한 곳에 하나씩 써요.
(function () {
  var A = window.CS_APP; if (!A) return;
  var el = A.el, all = {}, mine = {}, myUid = "", sync = null, open = {};
  var KIND = { good: "친절해요", soso: "보통이에요", bad: "불친절해요" };
  try { mine = JSON.parse(localStorage.getItem("changsin-my-reviews") || "{}") || {}; } catch (e) {}
  function saveMine() { try { localStorage.setItem("changsin-my-reviews", JSON.stringify(mine)); } catch (e) {} }
  function listOf(id) { return all[id] || []; }
  function isMine(r) { return myUid ? r.uid === myUid : r.uid === "local"; }
  function myOf(id) { var m = null; listOf(id).forEach(function (r) { if (isMine(r)) m = r; }); return m || mine[id] || null; }
  function rebuildLocal() { all = {}; Object.keys(mine).forEach(function (id) { all[id] = [Object.assign({ uid: "local" }, mine[id])]; }); }

  window.CS_REVIEWS = {
    count: function (id) { return listOf(id).length; },
    fakes: function (id) { return listOf(id).filter(function (r) { return r.fake; }).length; }
  };

  function stars(n) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆"; return s; }

  function summary(id) {
    var box = document.getElementById("rv-" + id); if (!box) return;
    var btn = box.querySelector(".rv-sum");
    if (!btn) {
      btn = el("button", "rv-sum"); btn.type = "button"; btn.setAttribute("aria-expanded", "false");
      btn.addEventListener("click", function () { open[id] = !open[id]; body(id); });
      box.appendChild(btn);
    }
    var rs = listOf(id), n = rs.length; btn.textContent = "";
    if (!n) { btn.appendChild(el("span", "rv-none", sync && !myUid ? "로그인하면 리뷰가 보여요" : "아직 리뷰가 없어요")); }
    else {
      var avg = rs.reduce(function (a, r) { return a + (r.stars || 0); }, 0) / n;
      var s = el("span", "rv-avg"); s.appendChild(el("span", "rv-star", "★")); s.appendChild(document.createTextNode(" " + avg.toFixed(1)));
      btn.appendChild(s); btn.appendChild(el("span", "rv-n", "리뷰 " + n + "개"));
      var g = rs.filter(function (r) { return r.kind === "good"; }).length, b = rs.filter(function (r) { return r.kind === "bad"; }).length;
      if (g) btn.appendChild(el("span", "rv-n", "친절 " + g));
      if (b) btn.appendChild(el("span", "rv-n", "불친절 " + b));
      var f = rs.filter(function (r) { return r.fake; }).length;
      if (f) btn.appendChild(el("span", "rv-fake", "허위매물 " + f + "명"));
    }
    btn.appendChild(el("span", "rv-go", open[id] ? "접기" : (myOf(id) ? "보기 · 내 리뷰 고치기" : (n ? "보기 · 쓰기" : "리뷰 쓰기"))));
    btn.setAttribute("aria-expanded", String(!!open[id]));
  }

  function body(id) {
    summary(id);
    var box = document.getElementById("rv-" + id), wrap = box.querySelector(".rv-body");
    if (!open[id]) { if (wrap) wrap.hidden = true; return; }
    if (!wrap) { wrap = el("div", "rv-body"); wrap.appendChild(el("ul", "rv-list")); wrap.appendChild(form(id)); box.appendChild(wrap); }
    wrap.hidden = false; renderList(id);
  }

  function renderList(id) {
    var box = document.getElementById("rv-" + id), ul = box && box.querySelector(".rv-list"); if (!ul) return;
    ul.textContent = "";
    listOf(id).slice().sort(function (a, b) { return (b.at || "").localeCompare(a.at || ""); }).forEach(function (r) {
      var li = el("li", "rv-item");
      var top = el("div", "rv-top");
      var st = el("span", "rv-stars", stars(r.stars || 0)); st.setAttribute("aria-label", "별 " + (r.stars || 0) + "개"); top.appendChild(st);
      if (KIND[r.kind]) top.appendChild(el("span", "rv-tag " + r.kind, KIND[r.kind]));
      if (r.fake) top.appendChild(el("span", "rv-tag fake", "허위매물 겪음"));
      li.appendChild(top);
      if ((r.text || "").trim()) li.appendChild(el("p", "rv-text", r.text));
      li.appendChild(el("p", "by", (r.by || "이름 없음") + (isMine(r) ? " (나)" : "") + " · " + A.when(r.at)));
      ul.appendChild(li);
    });
  }

  function form(id) {
    var f = el("form", "rv-form"), cur = { stars: 0, kind: "", fake: false };
    f.appendChild(el("p", "rv-h", "내 리뷰"));
    var sg = el("div", "rv-pick"); sg.setAttribute("role", "radiogroup"); sg.setAttribute("aria-label", "별점");
    var sb = [];
    for (var i = 1; i <= 5; i++) (function (n) {
      var b = el("button", "rv-s", "★"); b.type = "button"; b.setAttribute("role", "radio"); b.setAttribute("aria-label", "별 " + n + "개");
      b.addEventListener("click", function () { cur.stars = n; paint(); }); sb.push(b); sg.appendChild(b);
    })(i);
    f.appendChild(sg);
    var kg = el("div", "chips"); kg.setAttribute("role", "group"); kg.setAttribute("aria-label", "친절도"); var kb = {};
    Object.keys(KIND).forEach(function (k) {
      var b = el("button", "chip", KIND[k]); b.type = "button";
      b.addEventListener("click", function () { cur.kind = cur.kind === k ? "" : k; paint(); }); kb[k] = b; kg.appendChild(b);
    });
    f.appendChild(kg);
    var fl = el("label", "rv-check"), fc = el("input"); fc.type = "checkbox";
    fc.addEventListener("change", function () { cur.fake = fc.checked; });
    fl.appendChild(fc); fl.appendChild(el("span", null, "광고한 매물이 없거나 내용이 달랐어요 (허위매물)")); f.appendChild(fl);
    var ta = el("textarea"); ta.rows = 2; ta.maxLength = 500; ta.placeholder = "후기: 응대, 설명, 매물이 광고와 같았는지"; ta.setAttribute("aria-label", "후기");
    f.appendChild(ta);
    f.appendChild(el("p", "hint", "직접 겪은 일만 적어주세요. 상호가 그대로 보이는 글이에요."));
    var row = el("div", "rv-acts"), ok = el("button", "rv-save", "리뷰 저장"); ok.type = "submit";
    var del = el("button", "mini", "내 리뷰 지우기"); del.type = "button";
    var msg = el("span", "rv-msg"); msg.setAttribute("role", "status");
    row.appendChild(ok); row.appendChild(del); row.appendChild(msg); f.appendChild(row);

    function paint() {
      sb.forEach(function (b, i) { var on = i < cur.stars; b.classList.toggle("on", on); b.setAttribute("aria-checked", String(i + 1 === cur.stars)); });
      Object.keys(kb).forEach(function (k) { kb[k].setAttribute("aria-pressed", String(cur.kind === k)); });
      fc.checked = !!cur.fake;
    }
    function load() {
      var m = myOf(id); del.hidden = !m;
      if (m) { cur = { stars: m.stars || 0, kind: m.kind || "", fake: !!m.fake }; if (document.activeElement !== ta) ta.value = m.text || ""; }
      paint();
    }
    f._load = load; load();

    f.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!cur.stars) { msg.textContent = "별점을 골라주세요"; return; }
      A.needName(function (name) {
        var r = { stars: cur.stars, kind: cur.kind, fake: !!cur.fake, text: ta.value.trim().slice(0, 500), by: (name || "").slice(0, 20), at: new Date().toISOString() };
        mine[id] = r; saveMine();
        if (!sync) { rebuildLocal(); refresh(id); msg.textContent = "이 기기에만 저장됨"; return; }
        msg.textContent = "저장 중";
        sync.setReview(id, r).then(function () { msg.textContent = "저장됨"; }, function () { msg.textContent = "저장 실패 · 이 기기에는 남아 있어요"; });
      });
    });
    del.addEventListener("click", function () {
      delete mine[id]; saveMine(); cur = { stars: 0, kind: "", fake: false }; ta.value = "";
      if (!sync) { rebuildLocal(); refresh(id); msg.textContent = "지웠어요"; return; }
      sync.deleteReview(id).then(function () { msg.textContent = "지웠어요"; }, function () { msg.textContent = "지우지 못했어요"; });
    });
    return f;
  }

  function refresh(id) {
    summary(id);
    var box = document.getElementById("rv-" + id), f = box && box.querySelector(".rv-form");
    if (open[id]) renderList(id);
    if (f && f._load) f._load();
  }
  function refreshAll() { (A.all ? A.all() : A.B).forEach(function (b) { refresh(b[0]); }); A.refilter(); }

  rebuildLocal(); refreshAll();

  window.CS_SYNC.then(function (s) {
    if (!s || !s.subscribeReviews) return;
    sync = s;
    var unsub = null;
    function start(user) { // 로그인·로그아웃할 때마다 다시 연결해요
      if (unsub) { try { unsub(); } catch (e) {} unsub = null; }
      myUid = user ? user.uid : "";
      if (!user) { all = {}; mine = {}; saveMine(); refreshAll(); return; }
      unsub = s.subscribeReviews(function (docs) {
        var next = {}, m = {};
        docs.forEach(function (r) {
          if (!r || !r.broker) return;
          if (r.uid === myUid) m[r.broker] = { stars: r.stars, kind: r.kind, fake: r.fake, text: r.text, by: r.by, at: r.at };
          if (A.cards[r.broker]) (next[r.broker] = next[r.broker] || []).push(r);
        });
        all = next; mine = m; saveMine(); refreshAll();
      }, function () {});
    }
    if (s.auth) s.auth.onChange(start);
  });
})();
