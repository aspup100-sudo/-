// 예산으로 매물 찾기: listings.js(재개발닷컴 구역별 유형·호가, 매일 자동 갱신)에서 내 예산에 맞는 것만 보여줘요.
// 예산은 이 기기에만 저장돼요.
(function () {
  var A = window.CS_APP, D = window.CS_ASKS, AREAS = window.CS_AREAS || { order: [] };
  var tpl = document.getElementById("askTpl"); if (!A || !D || !tpl) return;
  var slot = document.getElementById(A.area ? "askAreaSlot" : "askHomeSlot"); if (!slot) return;
  if (A.area && !((D.areas || {})[A.area.id] || []).length) return; // 호가를 넣지 않은 동에서는 이 칸을 숨겨요
  slot.appendChild(tpl.content.cloneNode(true));
  var $ = A.$, el = A.el, st = { min: "", max: "", type: "" };
  try { st = Object.assign(st, JSON.parse(localStorage.getItem("cs-budget") || "{}")); } catch (e) {}
  var iMin = $("#budMin"), iMax = $("#budMax"), sum = $("#budSum"), list = $("#budList");
  iMin.value = st.min; iMax.value = st.max;

  function won(v) { var e = Math.floor(v / 10000), m = v % 10000; return (e ? e + "억" : "") + (m ? (e ? " " : "") + m.toLocaleString("ko-KR") + "만" : ""); }
  function md(s) { var p = s.split("-"); return (+p[1]) + "/" + (+p[2]); }
  function isNew(since) { return !!since && (Date.parse(D.updated) - Date.parse(since)) / 86400000 <= 7; }
  var up = D.updated ? D.updated.split("-") : null;
  $("#askHint").textContent = "재개발닷컴에 올라온 구역 안 매물의 유형과 호가예요." + (up ? " " + (+up[1]) + "월 " + (+up[2]) + "일에 확인했고, 매일 다시 확인해요." : "");

  function render() {
    var lo = parseFloat(iMin.value), hi = parseFloat(iMax.value), has = !isNaN(lo) || !isNaN(hi);
    var min = isNaN(lo) ? 0 : Math.round(lo * 10000), max = isNaN(hi) ? Infinity : Math.round(hi * 10000);
    document.querySelectorAll("#budTypes .chip").forEach(function (c) { c.setAttribute("aria-pressed", String(c.dataset.t === st.type)); });
    list.textContent = "";
    var ids = A.area ? [A.area.id] : AREAS.order, total = 0, zonesHit = 0, empty = [];
    ids.forEach(function (aid) {
      var zs = (D.areas || {})[aid] || [], an = (AREAS[aid] || {}).name || aid, head = false;
      zs.forEach(function (z) {
        var all = z.rows.filter(function (r) { return !st.type || r[0] === st.type; });
        var hit = all.filter(function (r) { return r[1] >= min && r[1] <= max; });
        if (has && !hit.length) { if (all.length) empty.push(z.name); return; }
        if (!all.length) return;
        if (!A.area && !head) { head = true; var g = el("div", "grp"); g.appendChild(el("span", null, an)); list.appendChild(g); }
        var c = el("article", "lt ask");
        var h = el("div", "lt-head"); h.appendChild(el("h3", null, z.name)); h.appendChild(el("span", "zchip", z.kind)); c.appendChild(h);
        var show = has ? hit : all, lowest = all[0];
        c.appendChild(el("p", "stage", has ? "예산에 맞는 매물 " + hit.length + "건" : "매물 " + all.length + "건 · " + won(lowest[1]) + "부터"));
        var ul = el("ul", "facts");
        show.slice(0, has ? 40 : 6).forEach(function (r) {
          var li = el("li", isNew(r[2]) ? "new" : null, r[0] + " " + won(r[1]));
          if (isNew(r[2])) li.appendChild(el("b", null, " 새로 " + md(r[2])));
          ul.appendChild(li);
        });
        if (!has && all.length > 6) ul.appendChild(el("li", "more", "외 " + (all.length - 6) + "건"));
        c.appendChild(ul);
        var f = parseFloat(z.first), cheapest = z.rows[0];
        if (z.first && f && cheapest && (!st.type || cheapest[0] === st.type) && (!has || (cheapest[1] >= min && cheapest[1] <= max)))
          c.appendChild(el("p", "who", "가장 싼 매물(" + cheapest[0] + " " + won(cheapest[1]) + ")의 대지지분 " + z.first + " · 지분 평당 약 " + won(Math.round(cheapest[1] / f)) ));
        var a = el("a", "lk", "재개발닷컴에서 자세히 보기 ›"); a.href = "https://jaegebal.com/develops/" + z.id + "/asks"; a.target = "_blank"; a.rel = "noopener"; c.appendChild(a);
        if (!A.area) { var go = el("a", "lk", an + " 중개업소 보기 ›"); go.href = "./?area=" + aid; c.appendChild(go); }
        list.appendChild(c); total += hit.length; zonesHit++;
      });
    });
    if (!has) sum.textContent = "예산을 넣으면 맞는 매물만 골라서 보여줘요. 지금은 구역별 요약이에요.";
    else if (!total) sum.textContent = "이 예산에 맞는 매물이 지금은 없어요. 범위를 넓혀보세요.";
    else { sum.textContent = ""; sum.appendChild(el("b", null, "맞는 매물 " + total + "건")); sum.appendChild(document.createTextNode(" · 구역 " + zonesHit + "곳" + (empty.length ? " (맞는 매물이 없는 구역 " + empty.length + "곳은 숨겼어요)" : ""))); }
  }
  function save() { st.min = iMin.value; st.max = iMax.value; try { localStorage.setItem("cs-budget", JSON.stringify(st)); } catch (e) {} render(); }
  iMin.addEventListener("input", save); iMax.addEventListener("input", save);
  document.querySelectorAll("#budTypes .chip").forEach(function (c) { c.addEventListener("click", function () { st.type = c.dataset.t; save(); }); });
  render();
})();
