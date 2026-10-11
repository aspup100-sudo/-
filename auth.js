// 로그인·회원가입 화면과 내 계정 창. 실제 계정 처리는 sync.js(Firebase Authentication)가 해요.
// config.js의 requireLogin이 true면 로그인해야 앱이 보여요.
(function () {
  var A = window.CS_APP, cfg = window.CS_CONFIG || {}; if (!A) return;
  var $ = A.$, body = document.body;
  var configured = !!(cfg.firebase && cfg.firebase.projectId), need = configured && !!cfg.requireLogin;
  var view = $("#authView"), lf = $("#loginForm"), sf = $("#signupForm"), rf = $("#resetForm"), vf = $("#verifyForm"), wait = $("#authWait"), acct = $("#acctDlg"), btn = $("#nameBtn");
  var sync = null, user = null, pend = null; // pend: 로그인은 했지만 이메일 인증 전인 회원
  // 카카오 로그인: config.js의 kakaoLogin에 REST 키와 중계 서버 주소가 있어야 버튼이 보여요.
  var kk = cfg.kakaoLogin || {}, kkOn = configured && !!(kk.restKey && kk.worker), kkBox = $("#kakaoBox"), kkErr = $("#kkErr");
  var kkBase = location.origin + location.pathname, kkBack = null;
  function ss(k, v) { try { if (v === undefined) return sessionStorage.getItem(k); if (v === null) sessionStorage.removeItem(k); else sessionStorage.setItem(k, v); } catch (e) { return null; } }
  var kkCode = null; // 카카오에서 돌아온 경우 그 인가 코드
  (function () {
    var q; try { q = new URLSearchParams(location.search); } catch (e) { return; }
    if (!q.get("code") && !q.get("error")) return;
    var want = ss("cs-kk-state"); kkBack = ss("cs-kk-back") || ""; ss("cs-kk-state", null); ss("cs-kk-back", null);
    try { history.replaceState(null, "", kkBase + kkBack + location.hash); } catch (e) {}
    if (!kkOn) return;
    if (q.get("error")) { kkErr.textContent = q.get("error") === "access_denied" ? "카카오 로그인을 취소했어요." : "카카오 로그인이 잘 안 됐어요. 다시 해주세요."; return; }
    if (!want || q.get("state") !== want) { kkErr.textContent = "카카오 로그인이 오래돼서 끊겼어요. 다시 해주세요."; return; }
    kkCode = q.get("code");
  })();
  function seen() { try { return JSON.parse(localStorage.getItem("cs-auth-seen") || "null"); } catch (e) { return null; } }
  function setSeen(u) { try { if (u) localStorage.setItem("cs-auth-seen", JSON.stringify({ nick: u.nick })); else localStorage.removeItem("cs-auth-seen"); } catch (e) {} }
  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  function lock(on) { body.classList.toggle("locked", !!on); view.hidden = !on; if (on) window.scrollTo(0, 0); }
  function mode(m) { // wait | login | signup | reset | verify
    wait.hidden = m !== "wait"; vf.hidden = m !== "verify"; kkBox.hidden = !kkOn || (m !== "login" && m !== "signup"); lf.hidden = m !== "login"; sf.hidden = m !== "signup"; rf.hidden = m !== "reset";
    $("#authTitle").textContent = m === "signup" ? "회원가입" : m === "reset" ? "비밀번호 찾기" : m === "verify" ? "이메일 인증" : "로그인";
    var f = m === "login" ? $("#liId") : m === "signup" ? $("#suId") : m === "reset" ? $("#rsId") : null; if (f) setTimeout(function () { try { f.focus(); } catch (e) {} }, 50);
  }
  function label() { if (!configured) return; btn.textContent = user ? "내 계정: " + (user.nick || user.email) : "로그인"; }
  var ERR = {
    "auth/email-already-in-use": "이미 가입된 이메일이에요. 로그인하거나 비밀번호 찾기를 써보세요.",
    "auth/invalid-credential": "이메일이나 비밀번호가 맞지 않아요.", "auth/wrong-password": "이메일이나 비밀번호가 맞지 않아요.", "auth/user-not-found": "이메일이나 비밀번호가 맞지 않아요.",
    "auth/invalid-email": "이메일 주소를 다시 확인해 주세요.", "auth/missing-email": "이메일을 넣어주세요.", "auth/weak-password": "비밀번호가 너무 쉬워요. 8자 이상으로 해주세요.",
    "auth/too-many-requests": "시도가 너무 많았어요. 잠시 뒤에 다시 해주세요.", "auth/network-request-failed": "인터넷 연결을 확인해 주세요.",
    "auth/operation-not-allowed": "회원가입이 아직 켜져 있지 않아요. 운영자에게 알려주세요.", "auth/user-disabled": "사용이 중지된 계정이에요."
  };
  function say(el, e) { el.textContent = typeof e === "string" ? e : (ERR[e && e.code] || "잘 안 됐어요. 잠시 뒤에 다시 해주세요."); }
  function busy(form, on) { form.querySelectorAll("button, input").forEach(function (x) { x.disabled = !!on; }); }

  window.CS_AUTH = {
    active: false,
    user: function () { return user; },
    requireLogin: function () { if (!sync) return; mode(pend ? "verify" : "login"); lock(true); },
    openAccount: function () {
      if (!user) { window.CS_AUTH.requireLogin(); return; }
      if (user.email) { $("#acIdRow").innerHTML = '이메일 <b id="acId"></b>'; $("#acId").textContent = user.email; }
      else $("#acIdRow").textContent = "카카오 계정으로 로그인했어요."; $("#acNick").value = user.nick || ""; $("#acMsg").textContent = "";
      if (acct.showModal) acct.showModal(); else acct.setAttribute("open", "");
    }
  };
  function closeAcct() { if (acct.close) acct.close(); else acct.removeAttribute("open"); }

  $("#toSignup").addEventListener("click", function () { $("#suErr").textContent = ""; mode("signup"); });
  $("#toLogin").addEventListener("click", function () { $("#liErr").textContent = ""; mode("login"); });
  $("#toLogin2").addEventListener("click", function () { $("#liErr").textContent = ""; mode("login"); });
  $("#toReset").addEventListener("click", function () { $("#rsErr").textContent = ""; $("#rsOk").textContent = ""; $("#rsId").value = $("#liId").value.trim(); mode("reset"); });
  rf.addEventListener("submit", function (e) {
    e.preventDefault(); var err = $("#rsErr"), ok = $("#rsOk"); err.textContent = ""; ok.textContent = "";
    var em = $("#rsId").value.trim().toLowerCase();
    if (!EMAIL.test(em)) { say(err, "이메일 주소를 다시 확인해 주세요."); return; }
    busy(rf, true);
    sync.auth.resetPassword(em).then(function () {
      ok.textContent = "가입된 이메일이라면 메일을 보냈어요. 메일의 링크를 눌러 새 비밀번호를 정한 뒤 여기서 다시 로그인하세요. 몇 분이 지나도 안 오면 스팸함을 확인해 주세요.";
    }, function (x) { say(err, x); }).then(function () { busy(rf, false); });
  });
  $("#kakaoBtn").addEventListener("click", function () {
    var st = Math.random().toString(36).slice(2) + Date.now().toString(36);
    ss("cs-kk-state", st); ss("cs-kk-back", location.search);
    location.href = "https://kauth.kakao.com/oauth/authorize?response_type=code&client_id=" + encodeURIComponent(kk.restKey) +
      "&redirect_uri=" + encodeURIComponent(kkBase) + "&state=" + encodeURIComponent(st);
  });
  function kakaoFinish() {
    var b = $("#kakaoBtn"); b.disabled = true; kkErr.textContent = "카카오 계정을 확인하는 중이에요…";
    fetch(kk.worker, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ code: kkCode, redirectUri: kkBase }) })
      .then(function (r) { return r.json().then(function (j) { if (!r.ok || !j.token) throw j; return j; }); })
      .then(function (j) { return sync.auth.signInKakao(j.token, j.nick); })
      .then(function () { kkErr.textContent = ""; if (kkBack) location.reload(); }, function (x) { // 보던 구역이 있었으면 그 주소로 다시 열어요
        var why = x ? [x.error, x.detail, x.code].filter(Boolean).join(" ") : ""; // 원인 확인용 짧은 코드 (예: kakao-token KOE010)
        kkErr.textContent = (x && x.code === "auth/network-request-failed" ? ERR[x.code] : "카카오 로그인이 잘 안 됐어요. 잠시 뒤에 다시 해주세요.") + (why ? " (" + why + ")" : "");
        if (x) console.error("kakao login", x);
      }).then(function () { b.disabled = false; kkCode = null; });
  }
  vf.addEventListener("submit", function (e) {
    e.preventDefault(); var err = $("#vfErr"); err.textContent = ""; $("#vfOk").textContent = "";
    busy(vf, true);
    sync.auth.checkVerify().then(function (ok) {
      if (!ok) err.textContent = "아직 인증이 안 됐어요. 메일의 링크를 누른 뒤 다시 눌러 주세요.";
    }, function (x) { say(err, x); }).then(function () { busy(vf, false); });
  });
  $("#vfResend").addEventListener("click", function () {
    var err = $("#vfErr"), ok = $("#vfOk"); err.textContent = ""; ok.textContent = "";
    sync.auth.sendVerify().then(function () { ok.textContent = "인증 메일을 다시 보냈어요."; }, function (x) { say(err, x); });
  });
  $("#vfOut").addEventListener("click", function () { sync.auth.signOut(); });
  var back = $("#authBack"); back.addEventListener("click", function () { lock(false); });

  lf.addEventListener("submit", function (e) {
    e.preventDefault(); var err = $("#liErr"); err.textContent = "";
    var id = $("#liId").value.trim().toLowerCase(), pw = $("#liPw").value;
    if (!id || !pw) { say(err, "이메일과 비밀번호를 넣어주세요."); return; }
    if (!EMAIL.test(id)) { say(err, "이메일 주소를 다시 확인해 주세요."); return; }
    busy(lf, true);
    sync.auth.signIn(id, pw).then(function () { $("#liPw").value = ""; }, function (x) { say(err, x); }).then(function () { busy(lf, false); });
  });
  sf.addEventListener("submit", function (e) {
    e.preventDefault(); var err = $("#suErr"); err.textContent = "";
    var id = $("#suId").value.trim().toLowerCase(), pw = $("#suPw").value, pw2 = $("#suPw2").value, nick = $("#suNick").value.trim();
    if (!EMAIL.test(id)) { say(err, "이메일 주소를 다시 확인해 주세요. 비밀번호를 잊었을 때 이 주소로 메일을 보내요."); return; }
    if (pw.length < 8) { say(err, "비밀번호는 8자 이상이어야 해요."); return; }
    if (pw !== pw2) { say(err, "비밀번호와 비밀번호 확인이 서로 달라요."); return; }
    if (nick.length < 2 || nick.length > 12) { say(err, "닉네임은 2~12자로 해주세요."); return; }
    busy(sf, true);
    sync.auth.signUp(id, pw, nick).then(function () { $("#suPw").value = ""; $("#suPw2").value = ""; }, function (x) { say(err, x); }).then(function () { busy(sf, false); });
  });
  $("#acSave").addEventListener("click", function () {
    var nick = $("#acNick").value.trim(), msg = $("#acMsg");
    if (nick.length < 2 || nick.length > 12) { msg.textContent = "닉네임은 2~12자로 해주세요."; return; }
    sync.auth.setNick(nick).then(function () { msg.textContent = "바꿨어요. 앞으로 쓰는 리뷰에 이 이름이 붙어요."; }, function () { msg.textContent = "바꾸지 못했어요. 잠시 뒤에 다시 해주세요."; });
  });
  $("#acOut").addEventListener("click", function () { closeAcct(); sync.auth.signOut(); });
  $("#acClose").addEventListener("click", closeAcct);

  if (!configured) { lock(false); return; }        // Firebase 설정이 없으면 계정 없이 예전처럼
  label();
  if (need) { mode("wait"); lock(true); back.hidden = true; } else { lock(false); back.hidden = false; }
  // 인터넷이 느리거나 끊겨도, 전에 로그인했던 기기면 일단 열어 줘요 (리뷰만 안 보여요).
  var slow = setTimeout(function () { if (!sync && need && seen()) { lock(false); A.setName(seen().nick || ""); } }, 6000);

  window.CS_SYNC.then(function (s) {
    clearTimeout(slow);
    if (!s || !s.auth) {
      if (!need) return;
      if (seen()) { lock(false); A.setName(seen().nick || ""); btn.textContent = "오프라인"; }
      else { mode("wait"); wait.textContent = "인터넷에 연결한 뒤 다시 열어주세요. 처음에는 로그인이 필요해요."; }
      return;
    }
    sync = s; window.CS_AUTH.active = true;
    if (kkCode) kakaoFinish();
    s.auth.onChange(function (u) {
      pend = u && !u.verified ? u : null; user = pend ? null : u; label();
      if (pend) { // 이메일 인증 전: 인증 화면만 보여요
        setSeen(null); A.setName(""); $("#vfMail").textContent = u.email; $("#vfErr").textContent = ""; $("#vfOk").textContent = "";
        mode("verify"); lock(true); return;
      }
      if (u) { setSeen(u); A.setName(u.nick || (u.email || "").split("@")[0]); lock(false); }
      else { setSeen(null); A.setName(""); if (need) { mode("login"); lock(true); } }
    });
  });
})();
