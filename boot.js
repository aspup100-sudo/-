// 시작: 주소를 보고 필요한 데이터를 먼저 받은 뒤 나머지 스크립트를 순서대로 불러요.
//   ./                       첫 화면 (서울 전체 구·동 목록 + 최근 본 구역)
//   ./?area=changsin         구역 정보까지 정리한 동 (areas.js)
//   ./?gu=11215&dong=구의동   서울 전체 자료에서 동 하나 (data/gu/<구코드>.json을 그때 받아요)
(function () {
  var q; try { q = new URLSearchParams(location.search); } catch (e) { q = { get: function () { return null; } }; }
  var gu = q.get("gu"), dong = q.get("dong"), area = q.get("area");
  var REST = ["app.js", "reviews.js", "map.js", "route.js", "asks.js", "auth.js", "mine.js"];
  function go() { REST.forEach(function (src) { var s = document.createElement("script"); s.src = "./" + src; s.async = false; document.body.appendChild(s); }); }
  function json(u) { return fetch(u).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }
  var up = window.CS_UPDATED || {};

  // 길 이름으로 묶기: "자양로18길 7" → 큰길 "자양로". 곳이 많은 큰길 8개까지 묶음으로, 나머지는 "그 밖의 길".
  function roadOf(addr) { return (addr.match(/^(\S+)/) || ["", ""])[1]; }
  function baseOf(road) { // "자양로18길" → "자양로", "상원1길"·"상원길" → "상원길", "서울숲2길" → "서울숲길"
    var b = road.replace(/\d+[가-힣]?길$/, "").replace(/\d+번길$/, "");
    if (!b) return road;
    return b === road || /(로|대로)$/.test(b) ? b : b + "길";
  }
  function queryOf(addr) { var m = addr.replace(/\s+,/g, ",").match(/^(\S+)\s+(\d+(?:-\d+)?)/); return m ? m[1] + " " + m[2] : addr; }
  function makeArea(d, dongName) {
    var rows = d.dongs[dongName] || [], cnt = {};
    rows.forEach(function (r) { var b = baseOf(roadOf(r[3])); cnt[b] = (cnt[b] || 0) + 1; });
    var top = Object.keys(cnt).sort(function (a, b) { return cnt[b] - cnt[a] || a.localeCompare(b, "ko"); }).filter(function (k, i) { return i < 8 && cnt[k] >= 2; });
    var ST = {}; top.forEach(function (k) { ST[k] = k + " · " + k + "과 그 골목"; });
    var other = rows.some(function (r) { return top.indexOf(baseOf(roadOf(r[3]))) < 0; }); if (other) ST["기타"] = "그 밖의 길 · 곳이 적은 길 모음";
    var B = rows.map(function (r) {
      var b = baseOf(roadOf(r[3])), g = top.indexOf(b) >= 0 ? b : "기타";
      var mark = /^(new|gone):/.test(r[5] || "") ? r[5] : undefined;
      var row = [r[0], r[2] + (r[5] && !mark ? " (" + r[5] + ")" : ""), r[3], queryOf(r[3]), r[4], g, 0, "", r[1]]; if (mark) row.push(mark);
      return row;
    });
    var ord = Object.keys(ST); B.sort(function (x, y) { return ord.indexOf(x[5]) - ord.indexOf(y[5]); });
    var id = "d" + d.code + "-" + dongName, dt = (d.updated || "").split("-");
    window.CS_AREAS[id] = {
      id: id, name: dongName, sub: d.gu + " " + dongName, gu: "서울 " + d.gu, dynamic: true, data: { ST: ST, B: B, L: [] },
      svgMap: false, bunjiHint: "예: " + dongName + " 123-45", starts: [], zones: [], excluded: [],
      zoneHint: "지도에는 서울시 자료의 재개발·재건축 구역 경계가 나와요. 구역별로 정리한 설명과 호가는 지금 종로구 창신동과 광진구 구의동에만 있어요.",
      listHint: "",
      ask: ["정확한 지번이 어떻게 되나요?", "재개발·재건축 구역 안인가요? 어느 구역, 어느 단계인가요?", "권리산정기준일 전에 등기된 집인가요?", "토지거래허가 대상인가요? 실거주 의무가 있나요?", "지금 임차인이 있나요? 있으면 만기가 언제인가요?", "위반건축물로 등재돼 있나요?", "대지지분이 몇 평인가요?"],
      foot: "출처: 서울 열린데이터광장 '서울시 부동산 중개업소 정보'" + (dt.length === 3 ? " (" + (+dt[0]) + "년 " + (+dt[1]) + "월 " + (+dt[2]) + "일 기준)" : "") + ". " + d.gu + " " + dongName + "에 등록된 " + B.length + "곳 전부예요. 묶음은 길 이름 기준이고, 전화번호가 없는 곳은 자료에 번호가 없는 곳이에요."
    };
    window.CS_AREA_ID = id;
  }

  // 구역 정보까지 정리한 동(창신동, 구의동)은 정리된 화면으로 열어요.
  var AR = window.CS_AREAS || { order: [] }, curated = "";
  if (gu && dong) AR.order.forEach(function (id) { if (AR[id] && AR[id].dong === gu + ":" + dong) curated = id; });
  if (curated) { window.CS_AREA_ID = curated; go(); }
  else if (gu && dong && /^\d{5}$/.test(gu)) {
    json("./data/gu/" + gu + ".json").then(function (d) { if (d.dongs[dong]) makeArea(d, dong); else window.CS_BOOT_ERR = "그 동을 찾지 못했어요."; }, function () { window.CS_BOOT_ERR = "자료를 불러오지 못했어요. 인터넷 연결을 확인해 주세요."; }).then(go);
  } else if (!area) {
    json("./data/gu/index.json").then(function (i) { window.CS_SEOUL = i; }, function () {}).then(go);
  } else go();
})();
