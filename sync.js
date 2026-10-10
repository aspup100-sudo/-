// 회원(로그인)과 모두가 보는 리뷰 저장 — Firebase Authentication + Firestore.
// 체크와 메모는 여기로 오지 않고 각자 기기에만 남아요. config.js에 firebase 설정이 없으면 꺼진 상태로 둬요.
// 아이디는 이메일이 아니라서, Firebase에는 "아이디@프로젝트 주소" 모양으로 바꿔 넣어요. 실제 메일은 오가지 않아요.
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
    const DOMAIN = cfg.firebase.authDomain || (cfg.firebase.projectId + ".firebaseapp.com");
    const mail = id => String(id).trim().toLowerCase() + "@" + DOMAIN;
    const shape = u => u ? { uid: u.uid, id: (u.email || "").split("@")[0], nick: u.displayName || "" } : null;
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
        async signUp(id, pw, nick) {
          const c = await au.createUserWithEmailAndPassword(auth, mail(id), pw);
          await au.updateProfile(c.user, { displayName: nick });
          cur = c.user; known = true; emit(); return shape(cur);
        },
        async signIn(id, pw) { const c = await au.signInWithEmailAndPassword(auth, mail(id), pw); return shape(c.user); },
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
