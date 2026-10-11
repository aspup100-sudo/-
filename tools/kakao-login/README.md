# 카카오 로그인 연결 안내

임장 수첩은 서버 없는 정적 사이트라, 카카오 로그인을 Firebase 계정으로 바꿔 주는 작은 중계 서버가 하나 필요해요.
Cloudflare Workers 무료 요금제(카드 등록 없음, 하루 10만 번 요청)에 `worker.js`를 올려서 씁니다.

흐름: 앱의 "카카오로 시작하기" → 카카오 동의 화면 → 앱으로 돌아옴(인가 코드) → 중계 서버가 카카오에 확인하고 Firebase 토큰을 만들어 줌 → 앱이 그 토큰으로 로그인.
카카오 회원은 Firebase에 `kakao:회원번호` 아이디로 처음 로그인할 때 자동으로 만들어져요. 이메일·비밀번호는 없어요.

## 1. 카카오 개발자 콘솔 (지도 키를 만든 그 앱)

1. 앱 → **앱 키**에서 **REST API 키**를 복사해 둡니다.
2. **카카오 로그인** → 활성화 설정 **ON**.
3. **카카오 로그인 → Redirect URI**에 `https://aspup100-sudo.github.io/-/` 를 추가합니다. (끝의 `/`까지 똑같이)
4. **동의항목**에서 **닉네임**을 "필수 동의"로 켭니다. (전화번호·실명 같은 항목은 사업자 비즈 앱만 받을 수 있어요)
5. (선택) **보안 → Client Secret**을 켰다면 그 값도 복사해 둡니다.

## 2. Firebase 콘솔

1. 프로젝트 설정 → **서비스 계정** → **새 비공개 키 생성** → JSON 파일이 내려받아져요.
   이 파일은 관리자 열쇠라서 저장소·채팅에 올리지 말고, 아래 Cloudflare 비밀값에만 넣어요.
2. **Firestore → 규칙**에 저장소의 `firestore.rules` 내용을 붙여넣고 게시합니다. (카카오 회원도 리뷰를 쓸 수 있게 바뀌었어요)

## 3. Cloudflare Workers (무료)

1. dash.cloudflare.com 에서 무료 가입 → **Workers & Pages → 만들기 → Worker** → 이름 예: `imjang-kakao` → 배포.
2. **코드 편집**에서 기본 코드를 지우고 `worker.js` 내용을 그대로 붙여넣고 배포.
3. **설정 → 변수 및 비밀**에 "비밀(Secret)"로 추가:
   - `KAKAO_REST_KEY` = 1-1의 REST API 키
   - `FIREBASE_CLIENT_EMAIL` = JSON의 `client_email`
   - `FIREBASE_PRIVATE_KEY` = JSON의 `private_key` (따옴표 안의 값 전체)
   - `KAKAO_CLIENT_SECRET` = (Client Secret을 켰을 때만)
4. 워커 주소(예: `https://imjang-kakao.아이디.workers.dev`)를 복사합니다.

## 4. 앱에 넣기

`config.js`의 `kakaoLogin`에 넣으면 로그인 화면에 노란 버튼이 생겨요.

```js
kakaoLogin: { restKey: "REST API 키", worker: "https://imjang-kakao.아이디.workers.dev" }
```

## 본인인증(휴대폰)에 대해

- 카카오 로그인만으로는 전화번호·실명을 받을 수 없어요(사업자 비즈 앱 심사 필요).
- Firebase 휴대폰 문자 인증은 종량제(Blaze, 카드 등록) 요금제에서만 돼요.
- PASS 같은 휴대폰 본인인증은 PG/인증 대행사와 사업자 계약이 필요하고 건당 요금이 붙어요.
