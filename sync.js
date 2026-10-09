// 모두가 보는 리뷰 저장 (Firebase Firestore). 체크와 메모는 여기로 오지 않고 각자 기기에만 남아요.
// config.js에 firebase 설정이 없으면 꺼진 상태로 둬요.
const cfg = window.CS_CONFIG || {};
const done = window.__csSyncResolve || (() => {});
(async () => {
  if (!cfg.firebase || !cfg.firebase.projectId) { done(null); return; }
  try {
    const V = "10.12.2", base = `https://www.gstatic.com/firebasejs/${V}/`;
    const [{ initializeApp }, fs] = await Promise.all([
      import(base + "firebase-app.js"),
      import(base + "firebase-firestore.js")
    ]);
    const app = initializeApp(cfg.firebase);
    const db = fs.getFirestore(app);
    const asked = new URLSearchParams(location.search).get("room") || cfg.room || "main";
    const room = (asked.match(/[A-Za-z0-9_-]{1,40}/) || ["main"])[0];
    const rev = fs.collection(db, "rooms", room, "reviews");
    // 리뷰는 쓴 사람만 고치거나 지울 수 있게, 가입 없는 익명 로그인으로 기기를 구분해요.
    let uidP = null;
    const uid = () => uidP || (uidP = import(base + "firebase-auth.js")
      .then(a => a.signInAnonymously(a.getAuth(app)))
      .then(c => c.user.uid)
      .catch(e => { uidP = null; throw e; }));
    done({
      room,
      uid,
      subscribeReviews(next, error) {
        return fs.onSnapshot(rev, snap => next(snap.docs.map(d => d.data())), error);
      },
      async setReview(broker, body) {
        const u = await uid();
        return fs.setDoc(fs.doc(rev, broker + "_" + u), Object.assign({}, body, { broker, uid: u }));
      },
      async deleteReview(broker) {
        const u = await uid();
        return fs.deleteDoc(fs.doc(rev, broker + "_" + u));
      }
    });
  } catch (e) {
    console.error("sync unavailable", e);
    done(null);
  }
})();
