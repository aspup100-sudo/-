// 공동 수첩 동기화 (Firebase Firestore). config.js에 firebase 설정이 없으면 꺼진 상태로 둬요.
const cfg = window.CS_CONFIG || {};
const done = window.__csSyncResolve || (() => {});
(async () => {
  if (!cfg.firebase || !cfg.firebase.projectId) { done(null); return; }
  try {
    const V = "10.12.2";
    const [{ initializeApp }, fs] = await Promise.all([
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-app.js`),
      import(`https://www.gstatic.com/firebasejs/${V}/firebase-firestore.js`)
    ]);
    const db = fs.getFirestore(initializeApp(cfg.firebase));
    const asked = new URLSearchParams(location.search).get("room") || cfg.room || "main";
    const room = (asked.match(/[A-Za-z0-9_-]{1,40}/) || ["main"])[0];
    const col = fs.collection(db, "rooms", room, "notes");
    done({
      room,
      subscribe(next, error) {
        return fs.onSnapshot(col, snap => next(snap.docs.map(d => ({ id: d.id, data: d.data() }))), error);
      },
      set(id, body) { return fs.setDoc(fs.doc(col, id), body); }
    });
  } catch (e) {
    console.error("sync unavailable", e);
    done(null);
  }
})();
