// 커뮤니티: 회원끼리 질문·임장 후기·동네 소식을 나누는 게시판. 주소: ./?talk=1 (글 하나는 ./?talk=1#p=글번호)
// 글과 댓글은 Firestore rooms/<room>/posts (sync.js). 로그인한 회원만 읽고, 인증한 회원만 써요(firestore.rules).
// 첫 화면에는 "커뮤니티 새 글" 3개를 보여 줘요.
(function () {
  var A = window.CS_APP; if (!A) return;
  var $ = A.$, el = A.el;
  var on = !A.area && /[?&]talk\b/.test(location.search);
  var home = !A.area && !on && !/[?&]mine\b/.test(location.search);
  if (!on && !home) return;

  var CAT = { ask: "질문", visit: "임장 후기", news: "동네 소식", free: "자유" };
  var sync = null, myUid = "", posts = [], loaded = false, failed = "", unPosts = null;

  function ago(iso) {
    var t = new Date(iso).getTime(); if (isNaN(t)) return "";
    var s = (Date.now() - t) / 1000;
    if (s < 60) return "방금";
    if (s < 3600) return Math.floor(s / 60) + "분 전";
    if (s < 86400) return Math.floor(s / 3600) + "시간 전";
    if (s < 86400 * 7) return Math.floor(s / 86400) + "일 전";
    return A.when(iso).split(" ")[0];
  }
  function meta(p) { return (p.by || "이름 없음") + (p.uid === myUid ? " (나)" : "") + " · " + ago(p.at) + " · 댓글 " + (p.n || 0); }
  function card(p) {
    var a = el("a", "post"); a.href = "./?talk=1#p=" + encodeURIComponent(p.id);
    var top = el("div", "post-top"); top.appendChild(el("span", "pcat", CAT[p.cat] || "자유"));
    if ((p.dong || "").trim()) top.appendChild(el("span", "who", p.dong.trim()));
    a.appendChild(top);
    a.appendChild(el("h3", null, p.title || ""));
    if ((p.text || "").trim()) a.appendChild(el("p", "ptext", p.text.trim()));
    a.appendChild(el("p", "by", meta(p)));
    return a;
  }
  function errText(e) {
    if (e && e.code === "permission-denied") return "커뮤니티를 열 수 없어요. 이메일 인증을 마쳤는지 확인해 주세요. 계속 이러면 운영자에게 알려 주세요.";
    return "글을 불러오지 못했어요. 인터넷 연결을 확인해 주세요.";
  }
  function listen(then) { // 로그인할 때마다 글 목록을 다시 받아요
    window.CS_SYNC.then(function (s) {
      if (!s || !s.subscribePosts) { failed = "인터넷에 연결되면 글이 보여요."; then(); return; }
      sync = s;
      s.auth.onChange(function (u) {
        if (unPosts) { try { unPosts(); } catch (e) {} unPosts = null; }
        myUid = u ? u.uid : ""; posts = []; loaded = false; failed = "";
        if (!u) { then(); return; }
        unPosts = s.subscribePosts(function (list) { posts = list; loaded = true; failed = ""; then(); }, function (e) { failed = errText(e); then(); });
      });
    });
  }

  // 첫 화면: 새 글 3개
  if (home) {
    var hb = $("#talkHomeBlk"), hl = $("#talkHomeList");
    listen(function () {
      if (!myUid) { hb.hidden = true; return; }
      hb.hidden = false; hl.textContent = "";
      if (failed) { hl.appendChild(el("p", "hint", failed)); return; }
      if (!loaded) { hl.appendChild(el("p", "hint", "불러오는 중이에요…")); return; }
      if (!posts.length) { hl.appendChild(el("p", "hint", "아직 글이 없어요. 커뮤니티에서 첫 글을 남겨 보세요.")); return; }
      posts.slice(0, 3).forEach(function (p) { hl.appendChild(card(p)); });
    });
    return;
  }

  // 커뮤니티 화면
  document.title = "커뮤니티 · 임장 수첩"; $("#title").textContent = "커뮤니티";
  $("#progress").textContent = "임장 다니는 회원끼리 묻고 답해요";
  var view = $("#talkView"), listBox = $("#talkListBox"), postBox = $("#talkPost"), list = $("#talkList"), msg = $("#talkMsg"), fab = $("#talkWrite");
  view.hidden = false;
  var cat = "", pid = "", unCm = null, cms = [], fromList = false;

  function renderList() {
    list.textContent = "";
    msg.textContent = failed || (!myUid ? "로그인하면 글이 보여요." : !loaded ? "불러오는 중이에요…" : "");
    if (failed || !loaded) return;
    var shown = posts.filter(function (p) { return !cat || (cat === "mine" ? p.uid === myUid : p.cat === cat); });
    if (!shown.length) { list.appendChild(el("p", "empty", cat ? "이 종류의 글이 아직 없어요." : "아직 글이 없어요. 오른쪽 아래 글쓰기로 첫 글을 남겨 보세요.")); return; }
    shown.forEach(function (p) { list.appendChild(card(p)); });
  }
  document.querySelectorAll("#talkCats .chip").forEach(function (ch) {
    ch.addEventListener("click", function () {
      cat = ch.dataset.c; document.querySelectorAll("#talkCats .chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o === ch)); }); renderList();
    });
  });

  // 글 하나 보기
  function postOf(id) { for (var i = 0; i < posts.length; i++) if (posts[i].id === id) return posts[i]; return null; }
  function renderPost() {
    var box = $("#talkFull"), p = postOf(pid); box.textContent = "";
    if (!p) { box.appendChild(el("p", "empty", failed || (loaded ? "글을 찾지 못했어요. 지워졌을 수 있어요." : "불러오는 중이에요…"))); $("#talkCmForm").hidden = true; return; }
    $("#talkCmForm").hidden = false;
    var top = el("div", "post-top"); top.appendChild(el("span", "pcat", CAT[p.cat] || "자유"));
    if ((p.dong || "").trim()) top.appendChild(el("span", "who", p.dong.trim()));
    box.appendChild(top);
    box.appendChild(el("h3", null, p.title || ""));
    box.appendChild(el("p", "by", meta(p)));
    if ((p.text || "").trim()) box.appendChild(el("p", "ptext full", p.text.trim()));
    if (p.uid === myUid) {
      var del = el("button", "mini", "내 글 지우기"); del.type = "button";
      del.addEventListener("click", function () {
        if (!confirm("이 글을 지울까요? 지운 글은 되돌릴 수 없어요.")) return;
        sync.deletePost(p.id).then(function () { location.hash = ""; }, function () { alert("지우지 못했어요. 잠시 뒤에 다시 해 주세요."); });
      });
      box.appendChild(del);
    }
    $("#talkCmH").textContent = "댓글 " + (p.n || 0);
  }
  function renderCms() {
    var ul = $("#talkCms"); ul.textContent = "";
    if (!cms.length) { ul.appendChild(el("li", "hint", "첫 댓글을 남겨 보세요.")); return; }
    cms.forEach(function (c) {
      var li = el("li", "cm");
      li.appendChild(el("p", "by", (c.by || "이름 없음") + (c.uid === myUid ? " (나)" : "") + " · " + ago(c.at)));
      li.appendChild(el("p", "cm-text", c.text || ""));
      if (c.uid === myUid) {
        var d = el("button", "lkbtn cm-del", "지우기"); d.type = "button";
        d.addEventListener("click", function () { if (confirm("댓글을 지울까요?")) sync.deleteComment(pid, c.id).catch(function () { alert("지우지 못했어요."); }); });
        li.appendChild(d);
      }
      ul.appendChild(li);
    });
  }
  function watchCms() {
    if (unCm) { try { unCm(); } catch (e) {} unCm = null; }
    cms = []; renderCms();
    if (!pid || !sync || !myUid) return;
    unCm = sync.subscribeComments(pid, function (l) { cms = l; renderCms(); }, function () { cms = []; renderCms(); });
  }

  function route() {
    var m = /^#p=(.+)$/.exec(location.hash || ""), next = m ? decodeURIComponent(m[1]) : "";
    var changed = next !== pid; pid = next;
    listBox.hidden = !!pid; postBox.hidden = !pid; fab.hidden = !!pid;
    if (pid) { renderPost(); if (changed) { watchCms(); window.scrollTo(0, 0); } }
    else { fromList = true; if (unCm) { try { unCm(); } catch (e) {} unCm = null; } renderList(); }
  }
  window.addEventListener("hashchange", route);
  $("#talkBack").addEventListener("click", function () { if (fromList) history.back(); else location.hash = ""; });
  listen(function () { route(); if (pid && !unCm) watchCms(); });
  route();

  // 댓글 달기
  $("#talkCmForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var ta = $("#talkCmText"), cm = $("#talkCmMsg"), t = ta.value.trim().slice(0, 500);
    if (!t) { cm.textContent = "댓글 내용을 적어 주세요"; return; }
    A.needName(function (name) {
      if (!sync) { cm.textContent = "인터넷에 연결된 뒤 다시 해 주세요"; return; }
      cm.textContent = "올리는 중";
      sync.addComment(pid, { by: (name || "").slice(0, 20) || "회원", text: t, at: new Date().toISOString() })
        .then(function () { ta.value = ""; cm.textContent = ""; }, function () { cm.textContent = "올리지 못했어요. 잠시 뒤에 다시 해 주세요"; });
    });
  });

  // 글쓰기
  var dlg = $("#postDlg"), pcat = "ask";
  function closeDlg() { if (dlg.close) dlg.close(); else dlg.removeAttribute("open"); }
  function paintCats() { document.querySelectorAll("#postCats .chip").forEach(function (o) { o.setAttribute("aria-pressed", String(o.dataset.c === pcat)); o.setAttribute("aria-checked", String(o.dataset.c === pcat)); o.setAttribute("role", "radio"); }); }
  document.querySelectorAll("#postCats .chip").forEach(function (ch) { ch.addEventListener("click", function () { pcat = ch.dataset.c; paintCats(); }); });
  fab.hidden = false;
  fab.addEventListener("click", function () {
    A.needName(function () {
      $("#postErr").textContent = "";
      if (!$("#postDong").value) { // 최근 본 동을 미리 적어 둬요
        try { var r = JSON.parse(localStorage.getItem("cs-recent") || "null"); if (Array.isArray(r) && r[0] && r[0].n) $("#postDong").value = String(r[0].n).slice(0, 20); } catch (e) {}
      }
      if (cat && CAT[cat]) pcat = cat;
      paintCats();
      if (dlg.showModal) dlg.showModal(); else dlg.setAttribute("open", "");
      $("#postTitle").focus();
    });
  });
  $("#postCancel").addEventListener("click", closeDlg);
  $("#postForm").addEventListener("submit", function (e) {
    e.preventDefault();
    var err = $("#postErr"), title = $("#postTitle").value.trim().slice(0, 60), text = $("#postText").value.trim().slice(0, 2000);
    if (!title) { err.textContent = "제목을 적어 주세요."; return; }
    A.needName(function (name) {
      if (!sync) { err.textContent = "인터넷에 연결된 뒤 다시 해 주세요."; return; }
      var ok = $("#postOk"); ok.disabled = true; err.textContent = "";
      sync.addPost({ cat: pcat, dong: $("#postDong").value.trim().slice(0, 20), title: title, text: text, by: (name || "").slice(0, 20) || "회원", at: new Date().toISOString() })
        .then(function (id) {
          ok.disabled = false; $("#postTitle").value = ""; $("#postText").value = ""; closeDlg();
          location.hash = "#p=" + encodeURIComponent(id);
        }, function (e) {
          ok.disabled = false;
          err.textContent = e && e.code === "permission-denied" ? "올리지 못했어요. 이메일 인증을 마쳤는지 확인해 주세요." : "올리지 못했어요. 잠시 뒤에 다시 해 주세요.";
        });
    });
  });
})();
