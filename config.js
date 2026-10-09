// 설정 파일.
// firebase: Firebase 콘솔의 "웹 앱 구성" 값. 이 값이 있으면 모두가 보는 리뷰가 켜져요.
//           (웹 앱용 공개 식별자라 주소에 노출돼도 괜찮아요. 접근은 firestore.rules가 막아요.)
//           null로 바꾸면 리뷰도 각자 기기에만 저장돼요. (체크와 메모는 원래 각자 기기에만 저장)
// room:     같은 room을 쓰는 사람들이 같은 리뷰를 봐요. 주소 뒤에 ?room=이름 을 붙이면 다른 리뷰 방이 열려요.
window.CS_CONFIG = {
  firebase: {
    apiKey: "AIzaSyCL3qThGAMMIcaaW9qfSASCYO3xYsxvUDk",
    authDomain: "realestate-app-2c4f4.firebaseapp.com",
    projectId: "realestate-app-2c4f4",
    storageBucket: "realestate-app-2c4f4.firebasestorage.app",
    messagingSenderId: "25384605119",
    appId: "1:25384605119:web:740e06f94db6aa9c4dfd0a"
  },
  room: "changsin",
  // 카카오 지도 JavaScript 키. 카카오 개발자 콘솔에 등록한 사이트 주소에서만 동작해요. 비우면 지도와 동선이 꺼져요.
  kakaoKey: "48af7d69f1624c954080053b5e54de9a"
};
