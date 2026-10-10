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
  function wireRegion(kakao) {
    var btn = $("#regionBtn"), undo = $("#regionUndo"), ok = $("#regionOk"), cancel = $("#regionCancel"), msg = $("#regionMsg"), box = $("#kmap");
    function clearShape() { if (shape) { shape.setMap(null); shape = null; } marks.forEach(function (m) { m.setMap(null); }); marks = []; }
    function paintShape() {
      clearShape();
      pts.forEach(function (p) { var v = document.createElement("span"); v.className = "vx"; var o = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(p[0], p[1]), content: v, xAnchor: 0.5, yAnchor: 0.5 }); o.setMap(map); marks.push(o); });
      if (pts.length >= 2) {
        shape = new kakao.maps.Polygon({ path: pathOf(pts).map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); }), strokeWeight: 2, strokeColor: "#B4541A", strokeOpacity: 0.9, fillColor: "#B4541A", fillOpacity: 0.12 });
        shape.setMap(map);
      }
    }
    function ui() {
      btn.hidden = drawing; btn.textContent = active ? "영역 해제" : "영역으로 고르기";
      undo.hidden = ok.hidden = cancel.hidden = !drawing; ok.disabled = pts.length < 2; undo.disabled = !pts.length;
      box.classList.toggle("drawing", drawing);
      // 그리는 동안에는 점(과 카카오가 씌운 겉상자)이 클릭을 가로채지 않게 해서, 점 위를 눌러도 꼭짓점이 찍히게 해요.
      Object.keys(dots).forEach(function (id) { var w = dots[id].el.parentNode; if (w && w.style) w.style.pointerEvents = drawing ? "none" : ""; });
      if (drawing) msg.textContent = pts.length < 2 ? "지도를 눌러 꼭짓점을 찍으세요. 2곳이면 네모, 3곳부터는 찍은 모양이에요." : (pts.length === 2 ? "네모로 잡혔어요. 더 찍으면 모양이 바뀌어요." : pts.length + "곳을 이은 모양이에요.");
      else if (active) { var n = A.B.filter(function (b) { return A.visible(b); }).length; msg.textContent = n ? "영역 안 " + n + "곳만 보는 중" : "영역 안에 보이는 중개업소가 없어요. 영역을 해제하고 다시 그려보세요."; }
      else msg.textContent = "";
    }
    function off() { active = false; drawing = false; pts = []; clearShape(); ui(); }
    kakao.maps.event.addListener(map, "click", function (e) {
      if (!drawing) return;
      pts.push([e.latLng.getLat(), e.latLng.getLng()]); paintShape(); ui();
    });
    btn.addEventListener("click", function () {
      if (active) { off(); A.setRegion(null); return; }
      drawing = true; pts = []; ui();
    });
    undo.addEventListener("click", function () { pts.pop(); paintShape(); ui(); });
    cancel.addEventListener("click", off);
    ok.addEventListener("click", function () {
      if (pts.length < 2) return;
      var poly = pathOf(pts); drawing = false; active = true;
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
    if (shown && s !== lastSig && !drawing) { lastSig = s; map.relayout(); map.setBounds(bounds, 24, 24, 24, 24); }
    if (!wired) { wired = true; wireRegion(kakao); }
    var miss = A.B.filter(function (b) { return !cache.p[b[0]]; }).length;
    $("#kmapNote").textContent = "점을 누르면 그 중개업소로 가요" + (geoDone && miss ? " · 위치 못 찾은 곳 " + miss : (!geoDone ? " · 위치 찾는 중" : ""));
  }

  sdk.then(function (kakao) {
    var redraw = function () { if (A.tab() === "brokers") draw(kakao); };
    redraw();
    A.onChange(redraw);
    geoWaiters.push(redraw);
    return geocodeAll(kakao).then(function () { geoDone = true; fire(); });
  }).catch(function () { geoDone = true; fire(); });
})();
