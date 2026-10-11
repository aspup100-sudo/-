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
    // 주소(예: "서울 성북구 길음동 123-4")를 좌표로. 실거래 위치를 구역 안팎으로 가를 때 써요. 기기에 30일 기억해요.
    addr: function (q) {
      var k = "a:" + q;
      if (cache.p[k]) return Promise.resolve(cache.p[k]);
      if (cache.miss[k]) return Promise.resolve(null);
      return sdk.then(function (kakao) {
        return new Promise(function (res) {
          new kakao.maps.services.Geocoder().addressSearch(q, function (r, st) {
            if (st === kakao.maps.services.Status.OK && r[0]) { cache.p[k] = [+r[0].y, +r[0].x]; res(cache.p[k]); }
            else { if (st === kakao.maps.services.Status.ZERO_RESULT) cache.miss[k] = 1; res(null); }
          });
        });
      });
    },
    save: function () { saveCache(); },
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
  var regionPoly = null; // 지금 걸러 보고 있는 영역 (동선 탭이 이어받아요)
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
  // 구역 중심: 구역 안 번지 몇 곳의 가운데. 동선 탭의 "구역 주변 담기"와, 경계 자료가 없는 구역의 대략적인 원에 써요.
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
        zoneInfo.push({ short: z.short || z.name, kind: z.kind || "", soft: !!z.soft, upis: z.upis || "", c: c, r: r });
      });
    })).then(function () { saveCache(); zoneWaiters.forEach(function (f) { try { f(); } catch (e) {} }); });
    return zonesReady;
  }
  // 서울시 도시계획사업 자료의 실제 구역 경계 (data/zones/<구코드>.json, tools/build-zones.py로 만듦)
  var guCode = (area.dong || "").split(":")[0] || ((area.id || "").match(/^d(\d{5})-/) || [])[1] || "";
  function realKind(k) { // 색과 범례를 나누는 큰 갈래
    var t = k.map(function (x) { return x[0]; }).join(" ");
    return /도심 공공|공공주택/.test(t) ? "도심공공" : /모아타운|가로주택|자율주택|소규모/.test(t) ? "모아타운·소규모" : /재정비촉진|존치/.test(t) ? "재정비촉진"
      : /역세권|장기전세/.test(t) ? "역세권" : /재건축/.test(t) && !/재개발|신속/.test(t) ? "재건축" : "재개발·신통기획";
  }
  var KIND_COL = { "재개발·신통기획": "#0B6E5F", "재건축": "#B4541A", "모아타운·소규모": "#2460A7", "도심공공": "#7A4FB5", "재정비촉진": "#00838F", "역세권": "#6B7280" };
  function early(k) { return k.every(function (x) { return /추진중|연번|자문|입주자/.test(x[1]); }); } // 아직 초기 단계면 점선
  function ringsOf(p) { // 바깥 테두리(시계 방향)마다 안쪽 구멍을 붙여 카카오 도형 경로로
    var out = [];
    p.forEach(function (r) {
      var s = 0; for (var i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] - r[i][0]) * (r[j][1] + r[i][1]);
      var path = r.map(function (q) { return new kakao.maps.LatLng(q[1], q[0]); });
      if (s < 0 || !out.length) out.push([path]); else out[out.length - 1].push(path);
    });
    return out;
  }
  function drawZones(kakao) {
    var kinds = {}, anySoft = false, anyLoose = false, zoneLabels = [], labelsOn = map.getLevel() <= 5, mine = {};
    // 멀리서 보면 구역 이름표가 겹쳐서, 어느 정도 확대했을 때만 이름표를 보여요.
    kakao.maps.event.addListener(map, "zoom_changed", function () {
      var on = map.getLevel() <= 5; if (on === labelsOn) return; labelsOn = on;
      zoneLabels.forEach(function (o) { o.setMap(on ? map : null); });
    });
    function label(text, ll, col, loose) {
      var lab = document.createElement("span"); lab.className = "zlabel" + (loose ? " loose" : ""); lab.textContent = text; lab.style.color = col;
      var lo = new kakao.maps.CustomOverlay({ position: ll, content: lab, xAnchor: 0.5, yAnchor: 0.5, zIndex: 0, clickable: !!loose }); zoneLabels.push(lo);
      if (labelsOn) lo.setMap(map);
      return lab;
    }
    // 구역을 누르면 이름·단계를 잠깐 보여 줘요 (영역을 그리는 중에는 꼭짓점 찍기가 먼저예요)
    var tip = document.createElement("div"); tip.className = "ztip";
    var tipOv = new kakao.maps.CustomOverlay({ content: tip, xAnchor: 0.5, yAnchor: 1.15, zIndex: 3 });
    kakao.maps.event.addListener(map, "click", function () { tipOv.setMap(null); });
    function showTip(e, title, lines) {
      if (drawing || !e || !e.latLng) return;
      tip.textContent = ""; var b = document.createElement("b"); b.textContent = title; tip.appendChild(b);
      lines.forEach(function (t) { var d = document.createElement("span"); d.textContent = t; tip.appendChild(d); });
      tipOv.setPosition(e.latLng); tipOv.setMap(map);
    }
    function legend(srcNote) {
      var leg = $("#zoneLegend"); if (!Object.keys(kinds).length) return;
      leg.textContent = "";
      Object.keys(kinds).forEach(function (name) { var sp = document.createElement("span"); sp.className = "zl"; var ic = document.createElement("i"); ic.style.background = kinds[name]; sp.appendChild(ic); sp.appendChild(document.createTextNode(name)); leg.appendChild(sp); });
      // 긴 설명은 접어 두고 "지도 설명"을 누르면 펼쳐져요
      var more = document.createElement("details"); more.className = "zmore";
      var sm = document.createElement("summary"); sm.textContent = "지도 설명"; more.appendChild(sm);
      var mp = document.createElement("p"); mp.textContent = (anySoft ? "점선은 아직 추진 초기 단계(후보지 신청·연번부여 등)예요. " : "") + (anyLoose ? "'경계 미정'은 아직 경계가 정해지지 않은 후보지 전 단계 구역이라 이름만 대략적인 자리에 적었어요. " : "") + "구역을 누르면 이름과 단계가 나와요. 지도를 더 키우면 다른 동 중개업소도 연한 점으로 보여요. " + srcNote;
      more.appendChild(mp); leg.appendChild(more);
      leg.hidden = false;
    }
    var real = guCode ? fetch("./data/zones/" + guCode + ".json").then(function (r) { if (!r.ok) throw r; return r.json(); }).catch(function () { return null; }) : Promise.resolve(null);
    Promise.all([real, computeZones(kakao)]).then(function (res) {
      var Z = res[0], srcNote = "";
      (area.zones || []).forEach(function (z) { if (z.upis) mine[z.upis] = z; });
      if (Z && Z.z) {
        var dd = (Z.date || "").split("-");
        srcNote = "경계선 출처: " + Z.src + (dd.length === 2 ? ", " + dd[0] + "년 " + (+dd[1]) + "월 자료" : "") + ". 법적 효력은 없는 참고 자료예요.";
        Z.z.forEach(function (z) {
          var my = mine[z.id], kind = realKind(z.k), col = KIND_COL[kind], soft = early(z.k);
          kinds[kind] = col; if (soft) anySoft = true;
          ringsOf(z.p).forEach(function (path) {
            var poly = new kakao.maps.Polygon({ path: path, strokeWeight: 2, strokeColor: col, strokeOpacity: 0.85, strokeStyle: soft ? "shortdash" : "solid", fillColor: col, fillOpacity: my ? 0.18 : 0.1 });
            poly.setMap(map);
            kakao.maps.event.addListener(poly, "click", function (e) {
              if (onMapClick) onMapClick(e);
              showTip(e, my ? my.name : z.n, z.k.map(function (x) { return x[0] + " · " + x[1]; }).concat(z.m2 ? ["면적 " + z.m2.toLocaleString("ko-KR") + "㎡"] : []));
            });
          });
          label(my ? (my.short || my.name) : z.n.replace(/\s*(주택재개발사업|가로주택정비사업|소규모재건축정비사업|정비사업)$/, ""), new kakao.maps.LatLng(z.c[1], z.c[0]), col);
        });
      }
      // 경계 자료에 아직 없는 구역(후보지 전 단계 등)은 경계가 정해지지 않아서 선 없이 이름만 대략적인 자리에 보여요
      zoneInfo.forEach(function (z) {
        if (z.upis && Z && Z.z && Z.z.some(function (x) { return x.id === z.upis; })) return;
        anyLoose = true; label(z.short + " (경계 미정)", new kakao.maps.LatLng(z.c[0], z.c[1]), "#5B6663", true);
      });
      legend(srcNote);
      drawExtra(kakao, label, showTip, function () { anyLoose = true; kinds["도심복합(민간)"] = KIND_COL["도심공공"]; legend(srcNote); });
    });
  }
  // 서울시 자료에 아직 경계가 없는 구역 (기사로 확인한 민간 도심복합 등, data/zones/extra.json): 이름만 대략적인 자리에, 누르면 출처
  function drawExtra(kakao, label, showTip, done) {
    if (!guCode || !window.fetch) return;
    fetch("./data/zones/extra.json").then(function (r) { if (!r.ok) throw r; return r.json(); }).then(function (d) {
      var list = (d.z || []).filter(function (z) { return z.gu === guCode; }); if (!list.length) return;
      var g = new kakao.maps.services.Geocoder(), OK = kakao.maps.services.Status.OK;
      list.forEach(function (z) {
        var k = "z:" + z.at;
        (cache.p[k] ? Promise.resolve(cache.p[k]) : new Promise(function (res) {
          g.addressSearch(area.gu + " " + z.at, function (r, st) { if (st === OK && r[0]) { cache.p[k] = [+r[0].y, +r[0].x]; saveCache(); res(cache.p[k]); } else res(null); });
        })).then(function (ll) {
          if (!ll) return;
          var pos = new kakao.maps.LatLng(ll[0], ll[1]);
          var el = label(z.n + " (경계 미정)", pos, KIND_COL["도심공공"], true);
          el.classList.add("tap");
          el.addEventListener("click", function (e) {
            e.stopPropagation();
            showTip({ latLng: pos }, z.n, z.k.map(function (x) { return x[0] + " · " + x[1]; }).concat(["서울시 경계 자료에는 아직 없어서 " + z.at + " 근처에 이름만 적었어요.", "출처: " + z.src]));
          });
          done();
        });
      });
    }).catch(function () {});
  }


  function wireRegion(kakao) {
    var btn = $("#regionBtn"), undo = $("#regionUndo"), ok = $("#regionOk"), cancel = $("#regionCancel"), msg = $("#regionMsg"), box = $("#kmap");
    function clearShape() { if (shape) { shape.setMap(null); shape = null; } marks.forEach(function (m) { m.setMap(null); }); marks = []; }
    function paintShape() {
      clearShape();
      pts.forEach(function (p) { var v = document.createElement("span"); v.className = "vx"; var o = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(p[0], p[1]), content: v, xAnchor: 0.5, yAnchor: 0.5 }); o.setMap(map); marks.push(o); });
      if (pts.length >= 2) {
        shape = new kakao.maps.Polygon({ path: pathOf(pts).map(function (p) { return new kakao.maps.LatLng(p[0], p[1]); }), strokeWeight: 3, strokeColor: "#B4541A", strokeOpacity: 0.95, fillColor: "#F2A65A", fillOpacity: 0.15 });
        shape.setMap(map);
        kakao.maps.event.addListener(shape, "click", function (e) { if (onMapClick) onMapClick(e); });
      }
    }
    function ui() {
      btn.hidden = drawing; btn.textContent = active ? "영역 해제" : "영역으로 고르기";
      undo.hidden = ok.hidden = cancel.hidden = !drawing; ok.disabled = pts.length < 2; undo.disabled = !pts.length;
      box.classList.toggle("drawing", drawing);
      // 그리는 동안에는 지도를 화면 가득 키우고, 끝나면 원래 자리로 돌려요. 보던 곳은 그대로 둬요.
      var wrap = $("#kmapBox");
      if (wrap.classList.contains("fs") !== drawing) {
        var c = map.getCenter();
        wrap.classList.toggle("fs", drawing); document.documentElement.classList.toggle("map-fs", drawing);
        map.relayout(); map.setCenter(c);
        if (!drawing) wrap.scrollIntoView({ block: "nearest" });
      }
      // 그리는 동안에는 점(과 카카오가 씌운 겉상자)이 클릭을 가로채지 않게 해서, 점 위를 눌러도 꼭짓점이 찍히게 해요.
      Object.keys(dots).forEach(function (id) { var w = dots[id].el.parentNode; if (w && w.style) w.style.pointerEvents = drawing ? "none" : ""; });
      if (drawing && pendingPick && pts.length >= 2) msg.textContent = "완료를 누르면 이 안의 중개업소가 모두 동선에 담겨요.";
      else if (drawing) msg.textContent = pts.length < 2 ? "지도를 눌러 꼭짓점을 찍으세요. 2곳이면 네모, 3곳부터는 찍은 모양이에요." : (pts.length === 2 ? "네모로 잡혔어요. 더 찍으면 모양이 바뀌어요." : pts.length + "곳을 이은 모양이에요.");
      else if (active) { var n = A.all().filter(function (b) { return A.visible(b); }).length; msg.textContent = n ? "영역 안 " + n + "곳만 보는 중" : "영역 안에 보이는 중개업소가 없어요. 영역을 해제하고 다시 그려보세요."; }
      else msg.textContent = "";
    }
    function off() { active = false; drawing = false; pts = []; pendingPick = null; regionPoly = null; clearShape(); ui(); }
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
        var cb = pendingPick, ids = A.all().filter(function (b) { var ll = cache.p[b[0]]; return !!ll && inside(ll, poly); }).map(function (b) { return b[0]; });
        off(); cb(ids); return;
      }
      drawing = false; active = true; regionPoly = poly;
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
      wireQuiet(kakao);
      // 지도를 옮기거나 키우고 멈추면 화면에 걸친 다른 동 중개업소를 불러와요.
      kakao.maps.event.addListener(map, "idle", function () { clearTimeout(viewTimer); viewTimer = setTimeout(function () { if ($("#kmap").offsetWidth) loadView(kakao); }, 400); });
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
      starOn(d, id);
      if (vis) { bounds.extend(d.ov.getPosition()); sig.push(id); shown++; }
    });
    var s = sig.join(",");
    // 영역을 그리는 중이거나 영역으로 보는 중에는 지도를 다시 맞추지 않아요 (그린 테두리가 그대로 보이게).
    if (shown && s !== lastSig && !drawing && $("#kmap").offsetWidth) { lastSig = s; if (!active) { map.relayout(); map.setBounds(bounds, 24, 24, 24, 24); } }
    if (!wired) { wired = true; wireRegion(kakao); drawZones(kakao); }
    drawNb(kakao);
    var miss = A.B.filter(function (b) { return !cache.p[b[0]]; }).length;
    $("#kmapNote").textContent = "점을 누르면 그 곳으로 가요" + (geoDone && miss ? " · 위치 못 찾은 곳 " + miss : (!geoDone ? " · 위치 찾는 중" : ""));
    viewNote();
  }

  // 다른 동 중개업소: 처음엔 맞닿은 동(data/dongmap/neighbors.json)에서 이 동 중개업소와 같은 길(예: 백제고분로)에 있는 곳을,
  // 지도를 옮기거나 키우면 화면에 걸친 동(data/dongmap/bbox.json)의 중개업소를 흐린 점으로 찍어요.
  // 목록에는 "다른 동" 묶음으로 들어가서, 그린 영역 안에 들어오거나 동선에 담은 것만 보여요. 동선에 담은 곳은 기기에 기억해 둬요.
  var nbRows = [], nbIds = {}, nbDots = {}, nbTip = null, nbQ = [], nbBusy = false, doneDong = {};
  var XK = "cs-x-v1-" + area.id;
  var myKey = (area.dong || "") || (((area.id || "").match(/^d(\d{5})-(.+)$/) || []).slice(1).join(":"));
  if (myKey) doneDong[myKey] = 1;
  function roadOf(addr) { return ((addr || "").match(/^(\S+)/) || ["", ""])[1]; }
  var mine = {}; A.B.forEach(function (b) { mine[b[0]] = 1; });
  var getJ = function (u) { return fetch(u).then(function (r) { if (!r.ok) throw r; return r.json(); }); };
  var guFiles = {};
  function guFile(g) { return guFiles[g] || (guFiles[g] = getJ("./data/gu/" + g + ".json").catch(function () { delete guFiles[g]; return null; })); }
  function rowOf(x) { return [x.id, x.name, x.addr, x.addr.replace(/\s*\(.*$/, ""), x.tel, "옆동", 0, "", "", undefined, x.dong, "서울 " + x.gu]; }
  function addNb(list) { // 새로 찾은 곳을 점 목록과 중개업소 목록에 함께 넣어요
    var add = list.filter(function (x) { if (mine[x.id] || nbIds[x.id]) return false; nbIds[x.id] = 1; return true; });
    if (!add.length) return;
    nbRows = nbRows.concat(add);
    if (A.addExtra) A.addExtra(add.map(rowOf));
  }
  function savePicked() {
    var on = {}; A.picks().forEach(function (b) { on[b[0]] = 1; });
    var keep = nbRows.filter(function (x) { return on[x.id]; });
    try { if (keep.length) localStorage.setItem(XK, JSON.stringify(keep)); else localStorage.removeItem(XK); } catch (e) {}
  }
  try { addNb(JSON.parse(localStorage.getItem(XK) || "[]")); } catch (e) {}
  function loadNb() {
    if (!myKey || !window.fetch) return Promise.resolve();
    var roads = {};
    A.B.forEach(function (b) { roads[roadOf(b[2])] = 1; });
    return getJ("./data/dongmap/neighbors.json").then(function (NB) {
      var list = (NB[myKey] || []).filter(function (k) { return k !== myKey; }), byGu = {};
      list.forEach(function (k) { var g = k.split(":")[0]; (byGu[g] = byGu[g] || []).push(k.split(":")[1]); });
      return Promise.all(Object.keys(byGu).map(function (g) {
        return guFile(g).then(function (d) {
          if (!d) return;
          var got = [];
          byGu[g].forEach(function (dn) {
            (d.dongs[dn] || []).forEach(function (r) {
              if (/^gone:/.test(r[5] || "") || !roads[roadOf(r[3])]) return;
              got.push({ id: r[0], name: r[2], addr: r[3], tel: r[4], gu: d.gu, code: g, dong: dn });
            });
          });
          addNb(got);
        });
      }));
    }, function () {});
  }
  // 화면에 걸친 동의 중개업소를 모두 불러와요. 너무 넓게 보면(구 전체 등) 위치 찾는 데 오래 걸려서, 어느 정도 키웠을 때만 해요.
  var BB = null, MAXLV = 5, viewTimer = null;
  function loadView(kakao) {
    if (!map || !window.fetch) return;
    if (map.getLevel() > MAXLV) { viewNote(); return; }
    (BB ? Promise.resolve(BB) : getJ("./data/dongmap/bbox.json").then(function (d) { return BB = d; })).then(function (bb) {
      var r = map.getBounds(), sw = r.getSouthWest(), ne = r.getNorthEast(), w = sw.getLng(), s = sw.getLat(), e = ne.getLng(), n = ne.getLat();
      var want = Object.keys(bb).filter(function (k) { var q = bb[k]; return !doneDong[k] && q[0] <= e && q[2] >= w && q[1] <= n && q[3] >= s; });
      if (!want.length) return;
      want.forEach(function (k) { doneDong[k] = 1; });
      var byGu = {}; want.forEach(function (k) { var g = k.split(":")[0]; (byGu[g] = byGu[g] || []).push(k.split(":")[1]); });
      return Promise.all(Object.keys(byGu).map(function (g) {
        return guFile(g).then(function (d) {
          if (!d) { byGu[g].forEach(function (dn) { delete doneDong[g + ":" + dn]; }); return; }
          var got = [];
          byGu[g].forEach(function (dn) {
            (d.dongs[dn] || []).forEach(function (r) { if (!/^gone:/.test(r[5] || "")) got.push({ id: r[0], name: r[2], addr: r[3], tel: r[4], gu: d.gu, code: g, dong: dn }); });
          });
          addNb(got);
        });
      })).then(function () { drawNb(kakao); geocodeNb(kakao); });
    }, function () {});
  }
  function viewNote() { if (map && map.getLevel() > MAXLV && $("#kmapNote")) $("#kmapNote").textContent = "더 키우면 다른 동 곳도 보여요"; }
  function geocodeNb(kakao) { // 위치를 아직 모르는 곳을 차례로 찾아요. 지금 화면에 가까운 곳부터.
    if (nbBusy) return Promise.resolve();
    var g = new kakao.maps.services.Geocoder(), OK = kakao.maps.services.Status.OK, ZERO = kakao.maps.services.Status.ZERO_RESULT;
    nbBusy = true;
    return new Promise(function (res) {
      var live = 0, n = 0;
      function pickNext() {
        var todo = nbRows.filter(function (x) { return !cache.p[x.id] && !cache.miss[x.id] && !x.q && !x.f; });
        if (!todo.length) return null;
        if (map) { // 화면 안 동 먼저
          var bb = BB || {}, r = map.getBounds(), sw = r.getSouthWest(), ne = r.getNorthEast();
          var inView = todo.filter(function (x) { var q = bb[x.code + ":" + x.dong]; return q && q[0] <= ne.getLng() && q[2] >= sw.getLng() && q[1] <= ne.getLat() && q[3] >= sw.getLat(); });
          if (inView.length) return inView[0];
        }
        return todo[0];
      }
      function next() {
        var x = pickNext();
        if (!x) { if (!live) res(); return; }
        x.q = 1; live++;
        g.addressSearch(x.gu + " " + x.addr.replace(/\s*\(.*$/, ""), function (r, st) {
          live--; x.q = 0;
          if (st === OK && r[0]) cache.p[x.id] = [+r[0].y, +r[0].x]; else if (st === ZERO) cache.miss[x.id] = 1; else x.f = 1; // 오류는 이번에만 건너뛰어요
          if (++n % 20 === 0) { saveCache(); if (map) drawNb(kakao); }
          next();
        });
      }
      for (var k = 0; k < 4; k++) next();
    }).then(function () { nbBusy = false; saveCache(); if (map) drawNb(kakao); });
  }
  function drawNb(kakao) {
    if (!map || !nbRows.length) return;
    if (!nbTip) {
      nbTip = { el: document.createElement("div") }; nbTip.el.className = "ztip";
      nbTip.ov = new kakao.maps.CustomOverlay({ content: nbTip.el, xAnchor: 0.5, yAnchor: 1.15, zIndex: 4, clickable: true });
      kakao.maps.event.addListener(map, "click", function () { nbTip.ov.setMap(null); });
    }
    var picked = {}; A.picks().forEach(function (b) { picked[b[0]] = 1; });
    nbRows.forEach(function (x) {
      var ll = cache.p[x.id], d = nbDots[x.id];
      if (!ll) return;
      if (!d) {
        var btn = document.createElement("button"); btn.type = "button"; btn.className = "dot nb"; btn.title = x.name + " (" + x.dong + ")"; btn.setAttribute("aria-label", x.name + ", " + x.dong);
        var pos = new kakao.maps.LatLng(ll[0], ll[1]);
        btn.addEventListener("click", function (e) { e.stopPropagation(); if (!drawing) showTip(x, pos); });
        d = nbDots[x.id] = { el: btn, ov: new kakao.maps.CustomOverlay({ position: pos, content: btn, yAnchor: 0.5, xAnchor: 0.5, clickable: true, zIndex: -1 }) };
        d.ov.setMap(map);
      }
      d.el.dataset.status = A.status(x.id);
      d.el.dataset.pick = picked[x.id] ? "1" : "";
      starOn(d, x.id, -1);
    });
  }
  // 다시 갈 곳은 노란 별로, 다른 점보다 위에 그려요
  function starOn(d, id, base) { var s = A.star ? A.star(id) : false; if ((d.el.dataset.star === "1") === s) return; d.el.dataset.star = s ? "1" : ""; d.ov.setZIndex(s ? 5 : (base || 0)); }
  function showTip(x, pos) {
    var t = nbTip.el; t.textContent = "";
    var b = document.createElement("b"); b.textContent = x.name; t.appendChild(b);
    var s1 = document.createElement("span"); s1.textContent = x.dong + " · " + x.addr; t.appendChild(s1);
    if (x.tel) String(x.tel).split(/[\s,\/;]+/).filter(function (p) { return p.replace(/\D/g, "").length >= 7; }).forEach(function (p) { var tel = document.createElement("a"); tel.href = "tel:" + p.replace(/[^\d+]/g, ""); tel.textContent = p; t.appendChild(tel); }); // 번호가 여러 개면 따로따로
    var on = A.picks().some(function (p) { return p[0] === x.id; });
    var pk = document.createElement("button"); pk.type = "button"; pk.className = "tg pick"; pk.setAttribute("aria-pressed", String(on)); pk.textContent = on ? "동선에 담음" : "동선 담기";
    pk.addEventListener("click", function (e) { e.stopPropagation(); A.setPick(x.id, !on); showTip(x, pos); });
    t.appendChild(pk);
    var go = document.createElement("a"); go.href = "./?gu=" + x.code + "&dong=" + encodeURIComponent(x.dong); go.textContent = x.dong + " 중개업소 보기 ›"; t.appendChild(go);
    nbTip.ov.setPosition(pos); nbTip.ov.setMap(map);
  }
  A.onChange(function (what) { if (what === "picks" || nbIds[what]) savePicked(); });

  // 지도 글씨 줄이기: 카카오 지도는 가게·건물 이름을 끌 수 없어서, 바탕 그림을 흐리게 하고
  // 지하철역(카카오 장소 검색 SW8)과 우리 구역 이름만 또렷하게 다시 써요. 버튼으로 원래 지도로 돌아갈 수 있어요.
  var QK = "cs-quiet", stnShown = {}, stnOv = [], stnTimer = null;
  function wireQuiet(kakao) {
    var btn = $("#quietBtn"), box = $("#kmap"), on = true;
    try { on = localStorage.getItem(QK) !== "0"; } catch (e) {}
    function set(v) {
      on = v; box.classList.toggle("quiet", on);
      if (btn) { btn.setAttribute("aria-pressed", String(on)); btn.textContent = on ? "지도 글씨: 역·구역만" : "지도 글씨: 모두"; }
      stnOv.forEach(function (o) { o.setMap(on && map.getLevel() <= 6 ? map : null); });
      try { localStorage.setItem(QK, on ? "1" : "0"); } catch (e) {}
      if (on) stations(kakao);
    }
    if (btn) btn.addEventListener("click", function () { set(!on); });
    // 바탕 그림 조각(256×256 그림)에 표시를 달아 흐리게 해요. 카카오가 그림 주소를 바꿔도 크기로 알아봐요.
    function markTiles() { box.querySelectorAll("img:not(.ktile)").forEach(function (im) {
      if (im.width === 256 || im.naturalWidth === 256 || im.style.width === "256px") im.classList.add("ktile");
      else if (!im.complete && !im._kw) { im._kw = 1; im.addEventListener("load", function () { if (im.naturalWidth === 256) im.classList.add("ktile"); }); }
    }); }
    if (window.MutationObserver) new MutationObserver(function () { markTiles(); }).observe(box, { childList: true, subtree: true });
    kakao.maps.event.addListener(map, "tilesloaded", markTiles);
    kakao.maps.event.addListener(map, "idle", function () { clearTimeout(stnTimer); stnTimer = setTimeout(function () { if (on) stations(kakao); }, 500); });
    kakao.maps.event.addListener(map, "zoom_changed", function () { var v = on && map.getLevel() <= 6; stnOv.forEach(function (o) { o.setMap(v ? map : null); }); });
    set(on);
  }
  function stations(kakao) {
    if (!map || map.getLevel() > 6 || !kakao.maps.services.Places) return;
    var ps = new kakao.maps.services.Places(map), OK = kakao.maps.services.Status.OK, page = 0;
    ps.categorySearch("SW8", function (r, st, pg) {
      if (st !== OK) return;
      r.forEach(function (s) {
        var nm = (s.place_name || "").replace(/\s+/g, " ").trim(); if (!nm || stnShown[s.id]) return;
        stnShown[s.id] = 1;
        var lab = document.createElement("span"); lab.className = "stn"; lab.textContent = nm;
        var ov = new kakao.maps.CustomOverlay({ position: new kakao.maps.LatLng(+s.y, +s.x), content: lab, xAnchor: 0.5, yAnchor: 0.5, zIndex: 1 });
        ov.setMap(map); stnOv.push(ov);
      });
      if (pg && pg.hasNextPage && ++page < 3) pg.nextPage();
    }, { useMapBounds: true });
  }

  // 중개업소 탭에서 영역으로 보는 중이면 그 영역과 안에 있는 중개업소 id들 (아니면 null)
  window.CS_MAP.region = function () {
    if (!active || !regionPoly) return null;
    var poly = regionPoly;
    return { key: JSON.stringify(poly), poly: poly, ids: A.all().filter(function (b) { var ll = cache.p[b[0]]; return !!ll && inside(ll, poly); }).map(function (b) { return b[0]; }) };
  };
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
    return geocodeAll(kakao).then(function () { geoDone = true; fire(); })
      .then(loadNb).then(function () { if (map) drawNb(kakao); return geocodeNb(kakao); });
  }).catch(function () { geoDone = true; fire(); });
})();
