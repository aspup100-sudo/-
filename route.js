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
    if (!fixed && pts.length > 25) { // 많을 때는 모든 출발점을 다 해보지 않고, 동서남북 끝에 있는 곳에서만 시작해 봐요
      var ext = function (i, sign) { var b = 0; pts.forEach(function (p, k) { if (sign * p.ll[i] > sign * pts[b].ll[i]) b = k; }); return b; };
      starts = [ext(0, 1), ext(0, -1), ext(1, 1), ext(1, -1)].filter(function (v, i, a) { return a.indexOf(v) === i; });
    }
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
    btnClear.hidden = !all.length;
    if (!all.length) { sum.textContent = "아직 담은 곳이 없어요. 중개업소 탭에서 가고 싶은 곳의 '동선 담기'를 눌러보세요."; $("#rmapBox").hidden = true; return; }
    var pts = all.filter(function (p) { return p.ll; }), lost = all.filter(function (p) { return !p.ll; });
    if (!pts.length) {
      sum.textContent = (M && !M.done()) ? "위치를 찾는 중이에요…" : "지도를 불러오지 못해 순서를 계산할 수 없어요. 인터넷 연결을 확인해 주세요. 담은 곳은 아래에 있어요.";
      lost.forEach(function (p, i) { list.appendChild(item(i + 1, p, null)); }); $("#rmapBox").hidden = true; return;
    }
    sum.textContent = "순서를 계산하는 중…";
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
      var rg = M.region && M.region(); // 중개업소 탭에서 고른 영역도 같이 그려요
      if (rg) { var pg = new kakao.maps.Polygon({ path: rg.poly.map(function (q) { return new kakao.maps.LatLng(q[0], q[1]); }), strokeWeight: 2, strokeColor: "#B4541A", strokeOpacity: 0.8, fillColor: "#F2A65A", fillOpacity: 0.1 }); pg.setMap(rmap); drawn.push(pg); }
      var pl = new kakao.maps.Polyline({ path: line, strokeWeight: 4, strokeColor: "#0B6E5F", strokeOpacity: 0.85, strokeStyle: "solid" }); pl.setMap(rmap); drawn.push(pl);
      rmap.relayout(); rmap.setBounds(b, 30, 30, 30, 30);
    }).catch(function () { $("#rmapBox").hidden = true; });
  }

  // 한꺼번에 담기: 지도에서 영역을 그리거나, 재개발 구역 주변을 고르거나
  var note = $("#rtNote"), selZone = $("#rtZone"), btnClear = $("#rtClear");
  function tell(t) { note.textContent = t; }
  $("#rtDraw").addEventListener("click", function () {
    if (!M || !M.pickByRegion) { tell("지도를 불러오지 못해서 영역을 그릴 수 없어요."); return; }
    M.pickByRegion(function (ids) {
      var n = A.setPicks(ids, true); A.showTab("route");
      tell(ids.length ? "영역 안 " + ids.length + "곳" + (n < ids.length ? " (새로 담은 곳 " + n + ")" : "") + "을 동선에 담았어요." : "그 영역 안에는 중개업소가 없었어요.");
    });
  });
  function nearZone(z) { return A.B.filter(function (b) { var ll = M.geo(b[0]); return ll && dist(ll, z.c) <= z.r + 100; }).map(function (b) { return b[0]; }); }
  function zoneOptions() {
    if (!M || !M.zones) return; var zs = M.zones(); if (!zs.length) return;
    while (selZone.options.length > 1) selZone.remove(1);
    zs.forEach(function (z, i) { var n = nearZone(z).length; if (!n) return; var o = el("option", null, z.short + " 주변 " + n + "곳"); o.value = String(i); selZone.appendChild(o); });
    selZone.hidden = selZone.options.length < 2;
  }
  selZone.addEventListener("change", function () {
    var z = M.zones()[+selZone.value]; if (selZone.value === "" || !z) return;
    var ids = nearZone(z), n = A.setPicks(ids, true); selZone.value = "";
    tell(z.short + " 주변 " + ids.length + "곳" + (n < ids.length ? " (새로 담은 곳 " + n + ")" : "") + "을 담았어요. 구역 원에서 100m 안에 있는 곳이에요.");
  });
  btnClear.addEventListener("click", function () { var n = A.setPicks(A.picks().map(function (b) { return b[0]; }), false); tell(n + "곳을 모두 뺐어요."); });
  if (M && M.onZones) M.onZones(zoneOptions);
  if (M) M.onGeo(zoneOptions);

  // "지금 내 위치"를 고르면 바로 위치를 물어보고, 어떻게 됐는지 아래에 적어 줘요
  var hereNote = $("#rtHere");
  function askHere() {
    hereNote.hidden = false; hereNote.textContent = "내 위치를 확인하는 중이에요. 위치 사용을 묻는 창이 뜨면 '허용'을 눌러 주세요.";
    here = null; locate().then(function (ll) {
      hereNote.textContent = ll ? "내 위치를 찾았어요. 여기서부터 순서를 짜요."
        : hereErr === "이 기기에서는 위치를 쓸 수 없어요." ? hereErr
        : "위치를 못 가져왔어요. 휴대폰 위치(GPS)가 꺼져 있거나 이 사이트의 위치 권한이 막혀 있어요. 아이폰은 설정 › 개인정보 보호 및 보안 › 위치 서비스를 켜고 Safari 웹 사이트를 '앱을 사용하는 동안'으로, 안드로이드는 크롬 주소창 왼쪽 자물쇠 › 권한 › 위치를 허용으로 바꾼 뒤 다시 골라 주세요.";
      render();
    });
  }
  selStart.addEventListener("change", function () { try { localStorage.setItem("cs-rt-start-" + area.id, selStart.value); } catch (e) {} if (selStart.value === "me") askHere(); else { hereNote.hidden = true; render(); } });
  if (selStart.value === "me") askHere();
  selDwell.addEventListener("change", function () { try { localStorage.setItem("cs-rt-dwell", selDwell.value); } catch (e) {} render(); });
  // 중개업소 탭에서 영역을 골라 둔 채 동선 탭으로 오면, 그 영역 안의 중개업소를 바로 동선에 담아요 (같은 영역은 한 번만).
  var takenKey = "";
  function takeRegion() {
    var r = M && M.region && M.region(); if (!r || r.key === takenKey) return;
    takenKey = r.key; if (!r.ids.length) return;
    var n = A.setPicks(r.ids, true);
    tell("중개업소 탭에서 고른 영역 안 " + r.ids.length + "곳" + (n < r.ids.length ? " (새로 담은 곳 " + n + ")" : "") + "을 동선에 담았어요. 빼려면 각 줄의 '빼기'나 '모두 빼기'를 누르세요.");
  }
  A.onChange(function (what) { if (what === "tab:route") takeRegion(); if (what !== "") render(); });
  if (A.tab() === "route") takeRegion();
  if (M) M.onGeo(render);
  render();
})();
