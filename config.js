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
  // true면 로그인(회원가입)해야 앱이 보여요. false면 구경은 누구나 하고 리뷰만 회원이 보고 써요.
  // 지금은 true: 로그인해야 앱이 열려요. 가입에 문제가 생겨 급히 풀어야 하면 false로 바꿔요.
  // (false로 바꿀 때는 firestore.rules의 리뷰 read 규칙도 "if true"로 바꿔야 로그인 안 한 사람이 리뷰를 볼 수 있어요)
  requireLogin: true,
  // 카카오 지도 JavaScript 키. 카카오 개발자 콘솔에 등록한 사이트 주소에서만 동작해요. 비우면 지도와 동선이 꺼져요.
  kakaoKey: "228aeed5441b5aa1165cdc79ea1b9a59",
  // 카카오 로그인. restKey는 카카오 앱의 REST API 키, worker는 중계 서버 주소(tools/kakao-login 안내 참고).
  // 둘 중 하나라도 비어 있으면 "카카오로 시작하기" 버튼이 숨어 있어요.
  kakaoLogin: { restKey: "", worker: "" }
};
