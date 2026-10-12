// 아래 메뉴: 홈 · 커뮤니티 · 지도 · 내 임장 · 내 정보. 지금 보는 화면에 맞는 칸에 표시해요.
//   지도: 동 화면에서는 그 동의 지도(중개업소 탭)로, 다른 화면에서는 최근 본 동의 지도로 가요. 본 동이 없으면 첫 화면의 서울 약도로.
(function () {
  var A = window.CS_APP; if (!A) return;
  var $ = A.$, nav = $("#bnav"); if (!nav) return;
  var q = location.search, cur = A.area ? "map" : /[?&]talk\b/.test(q) ? "talk" : /[?&]mine\b/.test(q) ? "mine" : "home";
  document.body.classList.add("has-bnav");
  nav.querySelectorAll("[data-n]").forEach(function (a) { if (a.dataset.n === cur) a.setAttribute("aria-current", "page"); });

  var mapA = $("#bnavMap");
  if (A.area) {
    mapA.href = location.pathname + location.search + "#map";
    mapA.addEventListener("click", function (e) { e.preventDefault(); A.showMap(); });
  } else {
    try {
      var r = JSON.parse(localStorage.getItem("cs-recent") || "null");
      if (Array.isArray(r) && r[0] && r[0].h) mapA.href = r[0].h + "#map";
    } catch (e) {}
    if (cur === "home" && /#seoul$/.test(mapA.getAttribute("href"))) mapA.addEventListener("click", function (e) {
      e.preventDefault(); var b = $("#seoulBlk"); if (b && !b.hidden) b.scrollIntoView({ block: "start", behavior: "smooth" });
    });
  }
  // 내 정보: 로그인한 계정 창(닉네임·로그아웃)을 열어요
  $("#bnavMe").addEventListener("click", function () { $("#nameBtn").click(); });
})();
