// 카카오 지도: 중개업소 주소를 좌표로 바꿔 지도에 점으로 찍어요. 좌표는 기기에 30일 동안만 기억해 둬요.
// config.js에 kakaoKey가 없거나 지도를 못 불러오면 조용히 꺼지고, 약도·길 버튼만 남아요.
(function () {
  var A = window.CS_APP; if (!A || !A.area) return;
  var key = (window.CS_CONFIG || {}).kakaoKey, area = A.area, $ = A.$;
  var CK = "cs-geo-v1-" + area.id, TTL = 30 * 24 * 3600 * 1000;
  var cache = { t: Date.now(), p: {}, miss: {} };
  try { var c = JSON.parse(localStorage.getItem(CK) || "null"); if (c && c.p && Date.now() - c.t < TTL) cache = c; } catch (e) {}
  function saveCache() { try { localStorage.setItem(CK, JSON.stringify(cache)); } catch (e) {} }
  var geoWaiters = [], geoDone = false;

  var sdk = new Promise(function (res, rej) {
    if (!key) { rej(new Error("no key")); return; }
    var s = document.createElement("script");
    s.src = "https://dapi.kakao.com/v2/maps/sdk.js?appkey=" + encodeURIComponent(key) + "&libraries=services&autoload=false";
    s.onload = function () { try { window.kakao.maps.load(function () { res(window.kakao); }); } catch (e) { rej(e); } };
    s.onerror = function () { rej(new Error("sdk blocked")); };
    document.head.appendChild(s);
  });

  window.CS_MAP = {
    sdk: sdk,
    geo: function (id) { return cache.p[id] || null; },
    done: function () { return geoDone; },
    onGeo: function (f) { geoWaiters.push(f); },
    // 역 이름 같은 장소를 좌표로 (동선 출발점용)
    place: function (name) {
      var k = "st:" + name;
      if (cache.p[k]) return Promise.resolve(cache.p[k]);
      return sdk.then(function (kakao) {
        return new Promise(function (res) {
          new kakao.maps.services.Places().keywordSearch(area.gu + " " + name, function (r, st) {
            if (st === kakao.maps.services.Status.OK && r[0]) { cache.p[k] = [+r[0].y, +r[0].x]; saveCache(); res(cache.p[k]); } else res(null);
          });
        });
      });
    }
  };
  function fire() { geoWaiters.forEach(function (f) { try { f(); } catch (e) {} }); }

  function geocodeAll(kakao) {
    var g = new kakao.maps.services.Geocoder(), OK = kakao.maps.services.Status.OK, ZERO = kakao.maps.services.Status.ZERO_RESULT;
    var todo = A.B.filter(function (b) { return !cache.p[b[0]] && !cache.miss[b[0]]; }), i = 0, live = 0, n = 0;
    return new Promise(function (res) {
      if (!todo.length) { res(); return; }
      function next() {
        if (i >= todo.length) { if (!live) res(); return; }
        var b = todo[i++]; live++;
        g.addressSearch(area.gu + " " + b[3], function (r, st) {
          live--;
          if (st === OK && r[0]) cache.p[b[0]] = [+r[0].y, +r[0].x]; else if (st === ZERO) cache.miss[b[0]] = 1;
          if (++n % 25 === 0) { saveCache(); fire(); }
          next();
        });
      }
      for (var k = 0; k < 6; k++) next();
    }).then(saveCache);
  }

  var map = null, dots = {}, lastSig = "";

  // 영역으로 고르기: 지도를 눌러 꼭짓점을 찍으면 그 안의 중개업소만 목록에 남아요. 2곳이면 네모, 3곳부터는 찍은 모양.
  var wired = false, drawing = false, pts = [], shape = null, marks = [], active = false;
  var pendingPick = null, startDraw = null; // 동선 탭의 "영역 그려 한꺼번에 담기"가 쓰는 것
  function pathOf(p) { return p.length === 2 ? [[p[0][0], p[0][1]], [p[0][0], p[1][1]], [p[1][0], p[1][1]], [p[1][0], p[0][1]]] : p; }
  function inside(pt, poly) {
    var c = false;
    for (var i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      var a = poly[i], b = poly[j];
      if ((a[0] > pt[0]) !== (b[0] > pt[0]) && pt[1] < (b[1] - a[1]) * (pt[0] - a[0]) / (b[0] - a[0]) + a[1]) c = !c;
    }
    return c;
  }
  window.CS_MAP.inside = inside; window.CS_MAP.pathOf = pathOf;
  // 구역 표시: 정확한 경계선 자료가 없어서, 구역 안 번지 몇 곳의 가운데에 구역 면적만 한 옅은 원을 그려요.
  var onMapClick = null;
  function zoneColor(kind) { return /도심/.test(kind) ? "#7A4FB5" : /모아타운/.test(kind) ? "#2460A7" : "#0B6E5F"; }
  var zoneInfo = [], zoneWaiters = [], zonesReady = null;
  window.CS_MAP.zones = function () { return zoneInfo; };
  window.CS_MAP.onZones = function (f) { zoneWaiters.push(f); if (zoneInfo.length) f(); };
  function computeZones(kakao) { // 지도가 안 떠 있어도 구역 중심은 미리 구해 둬요 (동선 탭에서 구역 주변 담기에 써요)
    if (zonesReady) return zonesReady;
    var list = [];
    (area.zones || []).forEach(function (z) {
      if (z.parts) z.parts.forEach(function (p) { list.push({ short: p.short, kind: p.kind || z.kind.split("·")[0], soft: true, m2: p.m2, at: p.at }); });
      else if (z.at && z.m2) list.push(z);
    });
    var g = new kakao.maps.services.Geocoder(), OK = kakao.maps.services.Status.OK;
    function one(addr) {
      var k = "z:" + addr; if (cache.p[k]) return Promise.resolve(cache.p[k]);
      return new Promise(function (res) { g.addressSearch(area.gu + " " + addr, function (r, st) { if (st === OK && r[0]) { cache.p[k] = [+r[0].y, +r[0].x]; res(cache.p[k]); } else res(null); }); });
    }
    zonesReady = Promise.all(list.map(function (z) {
      return Promise.all(z.at.map(one)).then(function (pts) {
        pts = pts.filter(Boolean); if (!pts.length) return;
        var med = function (i) { var v = pts.map(function (p) { return p[i]; }).sort(function (a, b) { return a - b; }); return v[Math.floor(v.length / 2)]; };
        var m = [med(0), med(1)], r = Math.sqrt(z.m2 / Math.PI);
        var near = pts.filter(function (p) { return Math.abs(p[0] - m[0]) * 111000 < Math.max(350, 2.5 * r) && Math.abs(p[1] - m[1]) * 88000 < Math.max(350, 2.5 * r); });
        if (!near.length) near = pts;
        var c = [near.reduce(function (a, p) { return a + p[0]; }, 0) / near.length, near.reduce(function (a, p) { return a + p[1]; }, 0) / near.length];
        zoneInfo.push({ short: z.short || z.name, kind: z.kind || "", soft: !!z.soft, c: c, r: r });
      });
    })).then(function () { saveCache(); zoneWaiters.forEach(function (f) { try { f(); } catch (e) {} }); });
    return zonesReady;
  }
  function drawZones(kakao) {
    var kinds = {}, anySoft = false, zoneLabels = [], labelsOn = map.getLevel() <= 6;
    // 멀리서 보면 구역 이름표가 겹쳐서, 어느 정도 확대했을 때만 이름표를 보여요.
    kakao.maps.event.addListener(map, "zoom_changed", function () {
      var on = map.getLevel() <= 6; if (on === labelsOn) return; labelsOn = on;
      zoneLabels.forEach(function (o) { o.setMap(on ? map : null); });
    });
    computeZones(kakao).then(function () {
      zoneInfo.forEach(function (z) {
        var col = zoneColor(z.kind), ll = new kakao.maps.LatLng(z.c[0], z.c[1]);
        var circle = new kakao.maps.Circle({ center: ll, radius: z.r, strokeWeight: 2, strokeColor: col, strokeOpacity: 0.75, strokeStyle: z.soft ? "shortdash" : "solid", fillColor: col, fillOpacity: 0.13 });
        circle.setMap(map);
        kakao.maps.event.addListener(circle, "click", function (e) { if (onMapClick) onMapClick(e); });
        var lab = document.createElement("span"); lab.className = "zlabel"; lab.textContent = z.short; lab.style.color = col;
        var lo = new kakao.maps.CustomOverlay({ position: ll, content: lab, xAnchor: 0.5, yAnchor: 0.5, zIndex: 0 }); zoneLabels.push(lo);
        if (labelsOn) lo.setMap(map);
        kinds[col] = /도심/.test(z.kind) ? "도심공공" : /모아타운/.test(z.kind) ? "모아타운" : "신통기획 재개발"; if (z.soft) anySoft = true;
      });
      var leg = $("#zoneLegend"); if (!Object.keys(kinds).length) return;
      leg.textContent = "";
      Object.keys(kinds).forEach(function (col) { var sp = document.createElement("span"); sp.className = "zl"; var ic = document.createElement("i"); ic.style.background = col; sp.appendChild(ic); sp.appendChild(document.createTextNode(kinds[col])); leg.appendChild(sp); });
      leg.appendChild(document.createTextNode((anySoft ? "점선은 후보지로 뽑히기 전 단계. " : "") + "원은 구역의 대략적인 위치와 크기예요. 실제 경계선이 아니에요."));
      leg.hidden = false;
    });
  }

  function wireRegion(kakao) {
    var btn = $("#regionBtn"), undo = $("#regionUndo"), ok = $("#regionOk"), cancel = $("#regionCancel"), msg = $("#regionMsg"), box = $("#kmap");
    function clearShape() { if (shape) { shape.setMap(null); shape = null; } marks.forEach(function (m) { m.setMap(null); }); marks = []; }
    function paintShape() {
      clearShape();
      pts.forEach(function (p) { var v = document.createElement("span"); v.className = "vx"; var o = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(p[0], p[1]), content: v, xAnchor: 0.5, yAnchor: 0.5 }); o.setMap(map); marks.push(o); });
      if (pts.length >= 2) {
        shape = new kakao.maps.Polygon({ path: pathOf(pts).map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); }), strokeWeight: 3, strokeColor: "#B4541A", strokeOpacity: 0.95, fillColor: "#F2A65A", fillOpacity: 0.3 });
        shape.setMap(map);
        kakao.maps.event.addListener(shape, "click", function (e) { if (onMapClick) onMapClick(e); });
      }
    }
    function ui() {
      btn.hidden = drawing; btn.textContent = active ? "영역 해제" : "영역으로 고르기";
      undo.hidden = ok.hidden = cancel.hidden = !drawing; ok.disabled = pts.length < 2; undo.disabled = !pts.length;
      box.classList.toggle("drawing", drawing);
      // 그리는 동안에는 점(과 카카오가 씌운 겉상자)이 클릭을 가로채지 않게 해서, 점 위를 눌러도 꼭짓점이 찍히게 해요.
      Object.keys(dots).forEach(function (id) { var w = dots[id].el.parentNode; if (w && w.style) w.style.pointerEvents = drawing ? "none" : ""; });
      if (drawing && pendingPick && pts.length >= 2) msg.textContent = "완료를 누르면 이 안의 중개업소가 모두 동선에 담겨요.";
      else if (drawing) msg.textContent = pts.length < 2 ? "지도를 눌러 꼭짓점을 찍으세요. 2곳이면 네모, 3곳부터는 찍은 모양이에요." : (pts.length === 2 ? "네모로 잡혔어요. 더 찍으면 모양이 바뀌어요." : pts.length + "곳을 이은 모양이에요.");
      else if (active) { var n = A.B.filter(function (b) { return A.visible(b); }).length; msg.textContent = n ? "영역 안 " + n + "곳만 보는 중" : "영역 안에 보이는 중개업소가 없어요. 영역을 해제하고 다시 그려보세요."; }
      else msg.textContent = "";
    }
    function off() { active = false; drawing = false; pts = []; pendingPick = null; clearShape(); ui(); }
    startDraw = function () { if (active) { off(); A.setRegion(null); } drawing = true; pts = []; lastKey = ""; ui(); };
    var lastAt = 0, lastKey = "";
    onMapClick = function (e) { // 지도, 구역 원, 그리던 도형 어디를 눌러도 꼭짓점이 찍히게 (같은 클릭이 두 번 들어오면 한 번만)
      if (!drawing || !e || !e.latLng) return;
      var p = [e.latLng.getLat(), e.latLng.getLng()], k = p[0].toFixed(7) + "," + p[1].toFixed(7), now = Date.now();
      if (k === lastKey && now - lastAt < 400) return; lastKey = k; lastAt = now;
      pts.push(p); paintShape(); ui();
    };
    kakao.maps.event.addListener(map, "click", onMapClick);
    btn.addEventListener("click", function () {
      if (active) { off(); A.setRegion(null); return; }
      drawing = true; pts = []; ui();
    });
    undo.addEventListener("click", function () { pts.pop(); lastKey = ""; paintShape(); ui(); });
    cancel.addEventListener("click", off);
    ok.addEventListener("click", function () {
      if (pts.length < 2) return;
      var poly = pathOf(pts);
      if (pendingPick) { // 걸러 보기 대신, 안에 있는 곳을 돌려주고 끝
        var cb = pendingPick, ids = A.B.filter(function (b) { var ll = cache.p[b[0]]; return !!ll && inside(ll, poly); }).map(function (b) { return b[0]; });
        off(); cb(ids); return;
      }
      drawing = false; active = true;
      marks.forEach(function (m) { m.setMap(null); }); marks = [];
      A.setRegion(function (id) { var ll = cache.p[id]; return !!ll && inside(ll, poly); });
      ui();
    });
    A.onRegionOff(off);
    A.onChange(function (what) { if (what === "" && active && !drawing) ui(); });
    ui();
  }
  function draw(kakao) {
    var box = $("#kmapBox");
    if (!map) {
      box.hidden = false; $("#svgMap").hidden = true; $("#streets").hidden = false;
      map = new kakao.maps.Map($("#kmap"), { center: new kakao.maps.LatLng(37.5665, 126.978), level: 5 });
      try { map.addControl(new kakao.maps.ZoomControl(), kakao.maps.ControlPosition.RIGHT); } catch (e) {}
      // 로그인 확인 중처럼 화면이 가려진 채로 지도가 만들어지면 크기가 0이라 엉뚱한 곳(전국)이 보여요.
      // 지도 칸 크기가 바뀌면 다시 맞추고, 가려져 있다가 처음 보이면 중개업소가 다 보이게 다시 맞춰요.
      if (window.ResizeObserver) {
        var el = $("#kmap"), wasZero = !el.offsetWidth;
        new ResizeObserver(function () {
          if (!el.offsetWidth) { wasZero = true; return; }
          map.relayout();
          if (wasZero) { wasZero = false; lastSig = ""; draw(kakao); }
        }).observe(el);
      }
    }
    var bounds = new kakao.maps.LatLngBounds(), sig = [], shown = 0;
    var picked = {}; A.picks().forEach(function (x) { picked[x[0]] = 1; });
    A.B.forEach(function (b) {
      var id = b[0], ll = cache.p[id], d = dots[id];
      if (!ll) return;
      if (!d) {
        var btn = document.createElement("button"); btn.type = "button"; btn.className = "dot"; btn.title = b[1]; btn.setAttribute("aria-label", b[1]);
        btn.addEventListener("click", function () { A.goCard(id); });
        d = dots[id] = { el: btn, ov: new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(ll[0], ll[1]), content: btn, yAnchor: 0.5, xAnchor: 0.5, clickable: true }), on: false };
      }
      var vis = A.visible(b);
      if (vis !== d.on) { d.ov.setMap(vis ? map : null); d.on = vis; }
      d.el.dataset.status = A.status(id);
      d.el.dataset.pick = picked[id] ? "1" : "";
      if (vis) { bounds.extend(d.ov.getPosition()); sig.push(id); shown++; }
    });
    var s = sig.join(",");
    // 영역을 그리는 중이거나 영역으로 보는 중에는 지도를 다시 맞추지 않아요 (그린 테두리가 그대로 보이게).
    if (shown && s !== lastSig && !drawing && $("#kmap").offsetWidth) { lastSig = s; if (!active) { map.relayout(); map.setBounds(bounds, 24, 24, 24, 24); } }
    if (!wired) { wired = true; wireRegion(kakao); drawZones(kakao); }
    var miss = A.B.filter(function (b) { return !cache.p[b[0]]; }).length;
    $("#kmapNote").textContent = "점을 누르면 그 중개업소로 가요" + (geoDone && miss ? " · 위치 못 찾은 곳 " + miss : (!geoDone ? " · 위치 찾는 중" : ""));
  }

  window.CS_MAP.pickByRegion = function (cb) { // 지도 탭으로 가서 영역을 그리게 하고, 완료하면 안에 있는 중개업소 id들을 cb로 넘겨요
    sdk.then(function () {
      A.showTab("brokers");
      if (!startDraw) return;
      startDraw(); pendingPick = cb;
      var box = $("#kmapBox"); if (box && box.scrollIntoView) { window.scrollTo(0, 0); }
      $("#regionMsg").textContent = "지도를 눌러 꼭짓점을 찍으세요. 완료를 누르면 그 안의 중개업소가 모두 동선에 담겨요.";
    });
  };
  sdk.then(function (kakao) {
    computeZones(kakao);
    var redraw = function () { if (A.tab() === "brokers") draw(kakao); };
    redraw();
    A.onChange(redraw);
    geoWaiters.push(redraw);
    return geocodeAll(kakao).then(function () { geoDone = true; fire(); });
  }).catch(function () { geoDone = true; fire(); });
})();
