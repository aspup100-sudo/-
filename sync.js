// 회원(로그인)과 모두가 보는 리뷰 저장 — Firebase Authentication + Firestore.
// 체크와 메모는 여기로 오지 않고 각자 기기에만 남아요. config.js에 firebase 설정이 없으면 꺼진 상태로 둬요.
// 이메일과 비밀번호로 가입·로그인하고, 비밀번호를 잊으면 그 이메일로 재설정 링크를 보내요.
// 카카오 로그인은 중계 서버(tools/kakao-login)가 만든 커스텀 토큰으로 해요.
const cfg = window.CS_CONFIG || {};
const done = window.__csSyncResolve || (() => {});
(async () => {
  if (!cfg.firebase || !cfg.firebase.projectId) { done(null); return; }
  try {
    const V = "10.12.2", base = `https://www.gstatic.com/firebasejs/${V}/`;
    const [{ initializeApp }, fs, au] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-firestore.js"),
      import(base + "firebase-auth.js")
    ]);
    const app = initializeApp(cfg.firebase);
    const db = fs.getFirestore(app), auth = au.getAuth(app);
    const asked = new URLSearchParams(location.search).get("room") || cfg.room || "main";
    const room = (asked.match(/[A-Za-z0-9_-]{1,40}/) || ["main"])[0];
    const rev = fs.collection(db, "rooms", room, "reviews");
    auth.languageCode = "ko"; // 재설정 메일을 한국어로
    const mail = e => String(e).trim().toLowerCase();
    // verified: 이메일 가입 회원은 메일 인증을 마쳐야 true. 카카오 회원은 이메일이 없어서 항상 true로 봐요.
    const shape = u => u ? { uid: u.uid, email: u.email || "", nick: u.displayName || "", verified: !u.email || !!u.emailVerified } : null;
    const subs = []; let known = false, cur = null;
    const emit = () => subs.forEach(f => { try { f(shape(cur)); } catch (e) {} });
    au.onAuthStateChanged(auth, u => {
      if (u && u.isAnonymous) { au.signOut(auth); return; } // 예전 방식(가입 없는 익명)으로 남은 로그인은 정리
      known = true; cur = u || null; emit();
    });
    done({
      room,
      auth: {
        onChange(f) { subs.push(f); if (known) f(shape(cur)); },
        user() { return shape(cur); },
        async signUp(email, pw, nick) {
          const c = await au.createUserWithEmailAndPassword(auth, mail(email), pw);
          await au.updateProfile(c.user, { displayName: nick });
          try { await au.sendEmailVerification(c.user); } catch (e) {} // 실패해도 인증 화면에서 다시 보낼 수 있어요
          cur = c.user; known = true; emit(); return shape(cur);
        },
        async signIn(email, pw) { const c = await au.signInWithEmailAndPassword(auth, mail(email), pw); return shape(c.user); },
        async signInKakao(token, nick) { // 중계 서버가 만든 커스텀 토큰으로 로그인. 처음이면 그때 계정이 생겨요.
          const c = await au.signInWithCustomToken(auth, token);
          if (!c.user.displayName && nick) { await au.updateProfile(c.user, { displayName: nick }); }
          cur = c.user; known = true; emit(); return shape(cur);
        },
        sendVerify() { if (!cur) return Promise.reject(new Error("signed out")); return au.sendEmailVerification(cur); },
        async checkVerify() { // 메일의 링크를 누른 뒤: 계정 정보를 다시 받고, 리뷰 규칙이 알도록 토큰도 새로 받아요
          if (!cur) return false;
          await cur.reload(); if (cur.emailVerified) await cur.getIdToken(true);
          emit(); return !!cur.emailVerified;
        },
        resetPassword(email) { return au.sendPasswordResetEmail(auth, mail(email)); },
        signOut() { return au.signOut(auth); },
        async setNick(nick) { if (!cur) throw new Error("signed out"); await au.updateProfile(cur, { displayName: nick }); emit(); }
      },
      uid() { return cur ? Promise.resolve(cur.uid) : Promise.reject(new Error("signed out")); },
      subscribeReviews(next, error) {
        return fs.onSnapshot(rev, snap => next(snap.docs.map(d => d.data())), error);
      },
      async setReview(broker, body) {
        if (!cur) throw new Error("signed out");
        return fs.setDoc(fs.doc(rev, broker + "_" + cur.uid), Object.assign({}, body, { broker, uid: cur.uid }));
      },
      async deleteReview(broker) {
        if (!cur) throw new Error("signed out");
        return fs.deleteDoc(fs.doc(rev, broker + "_" + cur.uid));
      }
    });
  } catch (e) {
    console.error("sync unavailable", e);
    window.CS_SYNC_FAILED = true; // 설정은 있는데 불러오지 못함 (오프라인 등)
    done(null);
  }
})();
