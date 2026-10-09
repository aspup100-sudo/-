// 동선: "동선 담기"로 고른 중개업소를 가까운 순서로 잇고, 걷는 시간을 어림해요.
(function () {
  var A = window.CS_APP, M = window.CS_MAP; if (!A || !A.area) return;
  var $ = A.$, el = A.el, area = A.area;
  var selStart = $("#rtStart"), selDwell = $("#rtDwell"), sum = $("#rtSum"), list = $("#rtList");
  var WALK = 4000 / 60, DETOUR = 1.3; // 분당 걷는 거리(m), 직선거리 보정
  (area.starts || []).forEach(function (s) { var o = el("option", null, s + "에서 출발"); o.value = "st:" + s; selStart.appendChild(o); });
  try { var sv = localStorage.getItem("cs-rt-start-" + area.id); if (sv && selStart.querySelector('option[value="' + sv + '"]') && sv !== "me") selStart.value = sv; var dv = localStorage.getItem("cs-rt-dwell"); if (dv) selDwell.value = dv; } catch (e) {}

  function dist(a, b) {
    var R = 6371000, r = Math.PI / 180, dLa = (b[0] - a[0]) * r, dLo = (b[1] - a[1]) * r;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    return 2 * R * Math.asin(Math.sqrt(h));
  }
  function len(path) { var t = 0; for (var i = 1; i < path.length; i++) t += dist(path[i - 1], path[i]); return t; }
  // 가까운 곳부터 잇고(nearest neighbor), 엇갈린 구간을 뒤집어 줄여요(2-opt). fixed가 있으면 그 점에서 출발.
  function order(pts, fixed) {
    var best = null;
    var starts = fixed ? [-1] : pts.map(function (_, i) { return i; });
    starts.forEach(function (s) {
      var left = pts.map(function (_, i) { return i; }), seq = [], cur = fixed;
      if (s >= 0) { seq.push(s); left.splice(left.indexOf(s), 1); cur = pts[s].ll; }
      while (left.length) {
        var bi = 0, bd = Infinity;
        left.forEach(function (i, k) { var d = dist(cur, pts[i].ll); if (d < bd) { bd = d; bi = k; } });
        var nx = left.splice(bi, 1)[0]; seq.push(nx); cur = pts[nx].ll;
      }
      var path = function (q) { var p = q.map(function (i) { return pts[i].ll; }); if (fixed) p.unshift(fixed); return p; };
      var L = len(path(seq)), improved = true;
      while (improved) {
        improved = false;
        for (var i = 0; i < seq.length - 1; i++) for (var j = i + 1; j < seq.length; j++) {
          var q = seq.slice(0, i).concat(seq.slice(i, j + 1).reverse(), seq.slice(j + 1)), l2 = len(path(q));
          if (l2 < L - 0.5) { seq = q; L = l2; improved = true; }
        }
      }
      if (!best || L < best.L) best = { seq: seq, L: L };
    });
    return best ? best.seq.map(function (i) { return pts[i]; }) : [];
  }
  function mins(m) { return Math.max(1, Math.round(m * DETOUR / WALK)); }
  function hm(n) { var h = Math.floor(n / 60), m = n % 60; return (h ? h + "시간" : "") + (h && m ? " " : "") + (m || !h ? m + "분" : ""); }
  function meters(m) { m = m * DETOUR; return m >= 1000 ? (m / 1000).toFixed(1) + "km" : Math.round(m / 10) * 10 + "m"; }
  window.CS_ROUTE = { order: order, dist: dist, mins: mins };

  var here = null, hereErr = "", rmap = null, drawn = [];
  function locate() {
    return new Promise(function (res) {
      if (!navigator.geolocation) { hereErr = "이 기기에서는 위치를 쓸 수 없어요."; res(null); return; }
      navigator.geolocation.getCurrentPosition(function (p) { here = [p.coords.latitude, p.coords.longitude]; hereErr = ""; res(here); },
        function () { hereErr = "위치 권한이 없어서 가장 짧은 순서로 짰어요."; res(null); }, { timeout: 8000, maximumAge: 60000 });
    });
  }
  function startPoint() {
    var v = selStart.value;
    if (v === "me") return (here ? Promise.resolve(here) : locate()).then(function (ll) { return ll ? { ll: ll, name: "내 위치" } : null; });
    if (v.indexOf("st:") === 0 && M) return M.place(v.slice(3)).then(function (ll) { return ll ? { ll: ll, name: v.slice(3) } : null; }, function () { return null; });
    return Promise.resolve(null);
  }

  function item(n, p, leg, from) {
    var li = el("li", "rt-item"); li.appendChild(el("span", "rt-n", String(n)));
    var m = el("div", "rt-main"); m.appendChild(el("b", null, p.name)); m.appendChild(el("span", "v", p.addr));
    if (leg != null) m.appendChild(el("span", "rt-leg", (from || "앞 장소") + "에서 걸어서 약 " + mins(leg) + "분 · " + meters(leg)));
    var row = el("div", "row");
    if (p.ll) { var a = el("a", null, "카카오맵 길찾기"); a.href = "https://map.kakao.com/link/to/" + encodeURIComponent(p.name) + "," + p.ll[0] + "," + p.ll[1]; a.target = "_blank"; a.rel = "noopener"; row.appendChild(a); }
    var go = el("button", "mini", "카드 보기"); go.type = "button"; go.addEventListener("click", function () { A.goCard(p.id); }); row.appendChild(go);
    var rm = el("button", "mini", "빼기"); rm.type = "button"; rm.addEventListener("click", function () { A.setPick(p.id, false); }); row.appendChild(rm);
    m.appendChild(row); li.appendChild(m); return li;
  }

  var token = 0;
  function render() {
    if (A.tab() !== "route") return;
    var my = ++token;
    var all = A.picks().map(function (b) { return { id: b[0], name: b[1], addr: b[2], ll: M ? M.geo(b[0]) : null }; });
    list.textContent = "";
    if (!all.length) { sum.textContent = "아직 담은 곳이 없어요. 중개업소 탭에서 가고 싶은 곳의 '동선 담기'를 눌러보세요."; $("#rmapBox").hidden = true; return; }
    var pts = all.filter(function (p) { return p.ll; }), lost = all.filter(function (p) { return !p.ll; });
    if (!pts.length) {
      sum.textContent = (M && !M.done()) ? "위치를 찾는 중이에요…" : "지도를 불러오지 못해 순서를 계산할 수 없어요. 인터넷 연결을 확인해 주세요. 담은 곳은 아래에 있어요.";
      lost.forEach(function (p, i) { list.appendChild(item(i + 1, p, null)); }); $("#rmapBox").hidden = true; return;
    }
    startPoint().then(function (st) {
      if (my !== token) return;
      var seq = order(pts, st ? st.ll : null), dwell = +selDwell.value || 15, walk = 0, legs = [];
      seq.forEach(function (p, i) { var prev = i ? seq[i - 1].ll : (st ? st.ll : null); var d = prev ? dist(prev, p.ll) : null; legs.push(d); if (d != null) walk += d; });
      var wm = legs.reduce(function (a, d) { return a + (d != null ? mins(d) : 0); }, 0), stay = seq.length * dwell;
      sum.textContent = "";
      sum.appendChild(el("b", null, seq.length + "곳 · 합쳐서 약 " + hm(wm + stay)));
      sum.appendChild(document.createTextNode(" (걷기 약 " + hm(wm) + " · " + meters(walk) + ", 머무는 시간 " + hm(stay) + ")"));
      if (selStart.value === "me" && !st && hereErr) sum.appendChild(el("span", "rt-warn", " " + hereErr));
      if (selStart.value.indexOf("st:") === 0 && !st) sum.appendChild(el("span", "rt-warn", " 역 위치를 못 찾아서 가장 짧은 순서로 짰어요."));
      if (lost.length) sum.appendChild(el("span", "rt-warn", " 위치를 못 찾은 " + lost.length + "곳은 맨 아래에 따로 뒀어요."));
      list.textContent = "";
      seq.forEach(function (p, i) { list.appendChild(item(i + 1, p, legs[i], i ? null : (st ? st.name : null))); });
      lost.forEach(function (p) { var li = item("?", p, null); li.classList.add("lost"); list.appendChild(li); });
      drawMap(seq, st);
    });
  }
  function drawMap(seq, st) {
    if (!M) return;
    M.sdk.then(function (kakao) {
      var box = $("#rmapBox"); box.hidden = false;
      if (!rmap) rmap = new kakao.maps.Map($("#rmap"), { center: new kakao.maps.LatLng(seq[0].ll[0], seq[0].ll[1]), level: 4 });
      drawn.forEach(function (o) { o.setMap(null); }); drawn = [];
      var b = new kakao.maps.LatLngBounds(), line = [];
      if (st) { var sp = new kakao.maps.LatLng(st.ll[0], st.ll[1]); line.push(sp); b.extend(sp); var s = document.createElement("span"); s.className = "pin start"; s.textContent = "출발"; var so = new kakao.maps.CustomOverlay({ position: sp, content: s, yAnchor: 0.5 }); so.setMap(rmap); drawn.push(so); }
      seq.forEach(function (p, i) {
        var ll = new kakao.maps.LatLng(p.ll[0], p.ll[1]); line.push(ll); b.extend(ll);
        var n = document.createElement("span"); n.className = "pin"; n.textContent = String(i + 1); n.title = p.name;
        var o = new kakao.maps.CustomOverlay({ position: ll, content: n, yAnchor: 0.5 }); o.setMap(rmap); drawn.push(o);
      });
      var pl = new kakao.maps.Polyline({ path: line, strokeWeight: 4, strokeColor: "#0B6E5F", strokeOpacity: 0.85, strokeStyle: "solid" }); pl.setMap(rmap); drawn.push(pl);
      rmap.relayout(); rmap.setBounds(b, 30, 30, 30, 30);
    }).catch(function () { $("#rmapBox").hidden = true; });
  }

  selStart.addEventListener("change", function () { try { localStorage.setItem("cs-rt-start-" + area.id, selStart.value); } catch (e) {} render(); });
  selDwell.addEventListener("change", function () { try { localStorage.setItem("cs-rt-dwell", selDwell.value); } catch (e) {} render(); });
  A.onChange(function (what) { if (what !== "") render(); });
  if (M) M.onGeo(render);
  render();
})();
