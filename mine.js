// 내 임장: 여러 동에 남긴 내 메모·방문·통화·동선·리뷰를 한곳에 모아 봐요. 주소: ./?mine=1
// 기록은 이 기기의 localStorage(changsin-notes, changsin-my-reviews)에서 읽고, 어느 동의 어느 곳인지는 자료에서 찾아요.
(function () {
  var A = window.CS_APP; if (!A) return;
  var $ = A.$, el = A.el, AREAS = window.CS_AREAS || { order: [] };
  var mineOn = /[?&]mine\b/.test(location.search);
  var link = $("#mineLink"); if (link) link.hidden = mineOn;
  if (!mineOn || A.area) return;

  var view = $("#mineView"); view.hidden = false;
  document.title = "내 임장 · 임장 수첩"; $("#title").textContent = "내 임장";
  var filter = "all";
  function read(k) { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } }

  // 정리된 동(창신·구의)의 중개업소는 바로 찾고, 서울 전체 자료의 곳(s + 구코드…)은 그 구 자료를 받아서 찾아요.
  var curated = {};
  AREAS.order.forEach(function (aid) {
    var a = AREAS[aid]; if (!a || !a.data) return;
    a.data.B.forEach(function (b) { curated[b[0]] = { name: b[1], addr: b[2], where: a.sub, href: "./?area=" + aid, key: "a:" + aid }; });
  });
  var zoned = {}; AREAS.order.forEach(function (aid) { var a = AREAS[aid]; if (a && a.dong) zoned[a.dong] = aid; });
  var guFiles = {};
  function guFile(g) { return guFiles[g] || (guFiles[g] = fetch("./data/gu/" + g + ".json").then(function (r) { if (!r.ok) throw r; return r.json(); }).catch(function () { return null; })); }
  function resolve(ids) {
    var out = {}, need = {};
    ids.forEach(function (id) {
      if (curated[id]) out[id] = curated[id];
      else { var m = /^s(\d{5})/.exec(id); if (m) (need[m[1]] = need[m[1]] || []).push(id); }
    });
    return Promise.all(Object.keys(need).map(function (g) {
      return guFile(g).then(function (d) {
        if (!d || !d.dongs) return;
        var want = {}; need[g].forEach(function (id) { want[id] = 1; });
        Object.keys(d.dongs).forEach(function (dn) {
          d.dongs[dn].forEach(function (r) {
            if (!want[r[0]]) return;
            var z = zoned[g + ":" + dn];
            out[r[0]] = { name: r[2], addr: r[3], where: d.gu + " " + dn, href: z ? "./?area=" + z : "./?gu=" + g + "&dong=" + encodeURIComponent(dn), key: "d:" + g + ":" + dn };
          });
        });
      });
    })).then(function () { return out; });
  }

  function when(iso) { var d = new Date(iso); return isNaN(d) ? "" : (d.getFullYear() !== new Date().getFullYear() ? d.getFullYear() + "/" : "") + (d.getMonth() + 1) + "/" + d.getDate(); }
  function stars(n) { var s = ""; for (var i = 1; i <= 5; i++) s += i <= n ? "★" : "☆"; return s; }
  var KIND = { good: "친절해요", soso: "보통이에요", bad: "불친절해요" };
  function has(x, f) {
    if (f === "memo") return !!(x.n.memo || "").trim();
    if (f === "done") return x.n.status === "visit" || x.n.status === "call";
    if (f === "pick") return !!x.n.pick;
    if (f === "star") return !!x.n.star;
    if (f === "review") return !!x.r;
    return true;
  }

  function render() {
    var notes = read("changsin-notes"), revs = read("changsin-my-reviews"), ids = {};
    Object.keys(notes).forEach(function (id) { var n = notes[id]; if (n && ((n.memo || "").trim() || n.status || n.pick || n.star || (n.bunji || "").trim())) ids[id] = 1; });
    Object.keys(revs).forEach(function (id) { ids[id] = 1; });
    var list = $("#mineList"), sum = $("#mineSum");
    resolve(Object.keys(ids)).then(function (found) {
      var rows = [];
      Object.keys(ids).forEach(function (id) {
        var f = found[id], n = notes[id] || {};
        if (!f && n.nm) f = { name: n.nm, where: n.wh || "어느 동인지 모르는 곳", href: n.hr || "", addr: "", key: "m:" + (n.wh || "") };
        if (!f) return; // 지금 자료에 없는 곳 (예전 매물 메모 등)
        var r = revs[id] || null;
        rows.push({ id: id, f: f, n: n, r: r, t: [n.at, r && r.at].filter(Boolean).sort().pop() || "" });
      });
      var c = { star: 0, memo: 0, done: 0, pick: 0, review: 0 };
      rows.forEach(function (x) { Object.keys(c).forEach(function (k) { if (has(x, k)) c[k]++; }); });
      sum.textContent = "";
      [["다시 갈 곳", c.star], ["메모", c.memo], ["방문·통화", c.done], ["동선", c.pick], ["리뷰", c.review]].forEach(function (p, i) {
        if (i) sum.appendChild(document.createTextNode(" · "));
        sum.appendChild(document.createTextNode(p[0] + " ")); sum.appendChild(el("b", null, String(p[1])));
      });
      $("#progress").textContent = rows.length ? "여러 동에 남긴 내 기록 " + rows.length + "곳" : "아직 남긴 기록이 없어요";

      // 동별로 묶고, 최근에 기록한 동·곳이 위로 와요.
      var groups = {}, order = [];
      rows.filter(function (x) { return has(x, filter); }).sort(function (a, b) { return a.t < b.t ? 1 : a.t > b.t ? -1 : 0; }).forEach(function (x) {
        if (!groups[x.f.key]) { groups[x.f.key] = []; order.push(x.f.key); }
        groups[x.f.key].push(x);
      });
      list.textContent = "";
      if (!order.length) {
        list.appendChild(el("p", "empty", rows.length ? "이 조건에 맞는 기록이 없어요." : "중개업소 카드에 메모를 쓰거나 방문·통화를 누르면 여기에 동별로 모여요."));
        return;
      }
      order.forEach(function (k) {
        var g = groups[k], f0 = g[0].f;
        var hd = el("div", "grp mine-grp");
        hd.appendChild(el("span", null, f0.where + " · " + g.length + "곳"));
        if (f0.href) { var go = el("a", "lkbtn", "이 동 보기 ›"); go.href = f0.href; hd.appendChild(go); }
        list.appendChild(hd);
        g.forEach(function (x) { list.appendChild(item(x)); });
      });
    });
  }

  function item(x) {
    var c = el("article", "bk mine-it"); c.dataset.status = x.n.status || "";
    var top = el("div", "bk-top"); top.appendChild(el("h3", null, x.f.name));
    if (x.n.star) top.appendChild(el("span", "star-tg", "★ 다시 갈 곳")).setAttribute("data-on", "1");
    if (x.n.pick) top.appendChild(el("span", "badge", "동선에 담음"));
    c.appendChild(top);
    if (x.f.addr) c.appendChild(el("p", "who", x.f.addr));
    var st = { visit: "방문함", call: "통화함" }[x.n.status];
    var meta = [st, x.t ? when(x.t) + " 기록" : ""].filter(Boolean).join(" · ");
    if (meta) c.appendChild(el("p", "by", meta));
    if ((x.n.bunji || "").trim()) c.appendChild(el("p", "mine-memo", "번지: " + x.n.bunji.trim()));
    if ((x.n.memo || "").trim()) c.appendChild(el("p", "mine-memo", x.n.memo.trim()));
    if (x.r) {
      var rv = el("p", "mine-rv");
      rv.appendChild(el("span", "rv-star", stars(x.r.stars || 0)));
      var t = [KIND[x.r.kind], x.r.fake ? "허위매물" : "", x.r.text].filter(Boolean).join(" · ");
      rv.appendChild(document.createTextNode(" 내 리뷰" + (t ? ": " + t : "")));
      c.appendChild(rv);
    }
    if (x.f.href) { var a = el("a", "lkbtn mine-go", "카드로 가기 ›"); a.href = x.f.href + "#card-" + encodeURIComponent(x.id); c.appendChild(a); }
    return c;
  }

  document.querySelectorAll("#mineFilters .chip").forEach(function (ch) {
    ch.addEventListener("click", function () {
      filter = ch.dataset.f;
      document.querySelectorAll("#mineFilters .chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o === ch)); });
      render();
    });
  });
  // 기록 옮기기·백업: 이 기기의 메모·방문·통화·동선·최근 본 구역을 파일 하나로 내려받고, 다른 기기에서 가져와요.
  // 가져올 때는 곳마다 더 최근에 기록한 쪽을 남겨요. 그래서 두 기기 기록을 합쳐도 돼요.
  var KEYS = ["changsin-notes", "changsin-my-reviews", "cs-recent", "cs-name"];
  var ioMsg = $("#mineIoMsg");
  function say(t) { if (ioMsg) ioMsg.textContent = t; }
  function stamp() { var d = new Date(), p = function (n) { return (n < 10 ? "0" : "") + n; }; return d.getFullYear() + p(d.getMonth() + 1) + p(d.getDate()); }
  function pack() {
    var out = { app: "imjang", v: 1, at: new Date().toISOString() };
    KEYS.forEach(function (k) { try { var v = localStorage.getItem(k); if (v != null) out[k] = JSON.parse(v); } catch (e) { out[k] = localStorage.getItem(k); } });
    return out;
  }
  $("#mineExport").addEventListener("click", function () {
    var d = pack(), n = Object.keys(d["changsin-notes"] || {}).length;
    var blob = new Blob([JSON.stringify(d, null, 1)], { type: "application/json" });
    var a = el("a"); a.href = URL.createObjectURL(blob); a.download = "임장수첩-기록-" + stamp() + ".json"; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
    say("기록 " + n + "곳을 파일로 내려받았어요. 파일 앱이나 메신저 '나와의 채팅'에 두면 안전해요.");
  });
  $("#mineImportBtn").addEventListener("click", function () { $("#mineImport").click(); });
  $("#mineImport").addEventListener("change", function () {
    var f = this.files && this.files[0]; this.value = ""; if (!f) return;
    var rd = new FileReader();
    rd.onload = function () {
      var d; try { d = JSON.parse(rd.result); } catch (e) { say("임장 수첩 기록 파일이 아니에요."); return; }
      if (!d || d.app !== "imjang" || !d["changsin-notes"]) { say("임장 수첩 기록 파일이 아니에요."); return; }
      var cur = read("changsin-notes"), inc = d["changsin-notes"], added = 0, newer = 0;
      Object.keys(inc).forEach(function (id) {
        var a = cur[id], b = inc[id]; if (!b) return;
        if (!a) { cur[id] = b; added++; } else if ((b.at || "") > (a.at || "")) { cur[id] = b; newer++; }
      });
      try { localStorage.setItem("changsin-notes", JSON.stringify(cur)); } catch (e) { say("저장 공간이 모자라 가져오지 못했어요."); return; }
      if (d["changsin-my-reviews"]) { var rv = read("changsin-my-reviews"), ri = d["changsin-my-reviews"]; Object.keys(ri).forEach(function (id) { if (!rv[id] || (ri[id].at || "") > (rv[id].at || "")) rv[id] = ri[id]; }); try { localStorage.setItem("changsin-my-reviews", JSON.stringify(rv)); } catch (e) {} }
      if (Array.isArray(d["cs-recent"])) { try { var rc = JSON.parse(localStorage.getItem("cs-recent") || "[]"), seen = {}; var merged = rc.concat(d["cs-recent"]).filter(function (x) { if (!x || !x.h || seen[x.h]) return false; seen[x.h] = 1; return true; }).slice(0, 8); localStorage.setItem("cs-recent", JSON.stringify(merged)); } catch (e) {} }
      say("가져왔어요: 새로 " + added + "곳, 더 최근 기록으로 바뀐 곳 " + newer + "곳.");
      render();
    };
    rd.readAsText(f);
  });
  // 글로 복사: 메신저나 메모 앱에 붙여 넣기 좋게 동별로 정리한 글
  $("#mineCopy").addEventListener("click", function () {
    var btn = this, notes = read("changsin-notes"), ids = Object.keys(notes).filter(function (id) { var n = notes[id]; return n && ((n.memo || "").trim() || n.status || n.star); });
    if (!ids.length) { say("아직 복사할 기록이 없어요."); return; }
    resolve(ids).then(function (found) {
      var by = {}, order = [];
      ids.forEach(function (id) { var f = found[id] || { name: notes[id].nm || id, where: notes[id].wh || "", addr: "" }; var k = f.where || "어느 동인지 모르는 곳"; if (!by[k]) { by[k] = []; order.push(k); } by[k].push({ f: f, n: notes[id] }); });
      var lines = ["임장 수첩 기록 (" + when(new Date().toISOString()) + ")"];
      order.forEach(function (k) {
        lines.push("", "■ " + k);
        by[k].sort(function (a, b) { return (b.n.at || "") > (a.n.at || "") ? 1 : -1; }).forEach(function (x) {
          var tag = [x.n.star ? "★" : "", { visit: "방문", call: "통화" }[x.n.status] || ""].filter(Boolean).join(" ");
          lines.push("- " + x.f.name + (tag ? " [" + tag + "]" : "") + (x.f.addr ? " · " + x.f.addr : "") + ((x.n.memo || "").trim() ? "\n  " + x.n.memo.trim().replace(/\n/g, "\n  ") : ""));
        });
      });
      var text = lines.join("\n");
      var done = function () { btn.textContent = "복사됨"; setTimeout(function () { btn.textContent = "글로 복사"; }, 1500); say(ids.length + "곳 기록을 글로 복사했어요. 메모 앱이나 메신저에 붙여 넣으세요."); };
      try { navigator.clipboard.writeText(text).then(done, function () { say("복사하지 못했어요. 파일로 내려받기를 써 주세요."); }); } catch (e) { say("복사하지 못했어요. 파일로 내려받기를 써 주세요."); }
    });
  });
  // 로그인하면 계정에 저장된 내 리뷰를 reviews.js가 받아 와요. 받으면 다시 그려요.
  window.addEventListener("cs-my-reviews", render);
  window.addEventListener("pageshow", function (e) { if (e.persisted) render(); });
  render();
})();
