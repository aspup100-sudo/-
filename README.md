# 창신 임장 수첩

창신동 재개발 임장용 공동 수첩입니다. 중개업소 75곳과 후보 매물 8건을 보면서 통화·방문 체크와 메모를 남기고, 휴대폰 홈 화면에 앱처럼 설치할 수 있어요.

## 파일 구성

| 파일 | 내용 | 고칠 때 |
|---|---|---|
| `index.html` | 화면 뼈대, 약도(SVG), 질문 목록, 구역 메모 | 문구나 구성 변경 |
| `styles.css` | 색, 글꼴, 간격 | 디자인 변경 (맨 위 `:root`의 색 값) |
| `data.js` | 중개업소와 매물 목록 | 매물·업소 추가, 수정 |
| `app.js` | 체크, 메모, 걸러 보기, 설치 버튼 | 기능 변경 |
| `config.js` | Firebase 설정, 수첩 방 이름 | 공동 수첩 켤 때 한 번 |
| `sync.js` | 공동 저장 (Firestore) | 보통 손댈 일 없음 |
| `firestore.rules` | Firestore 보안 규칙 | Firebase 콘솔에 붙여넣기 |
| `sw.js`, `manifest.webmanifest`, `icons/` | 설치와 오프라인 | 아이콘·앱 이름 변경 |

## 올리기 (GitHub Pages)

1. GitHub에서 빈 저장소를 만들고 이 폴더의 파일을 전부 올립니다.
2. 저장소 Settings → Pages → Source를 `Deploy from a branch`, Branch를 `main` / `(root)`로 두고 저장합니다.
3. 1~2분 뒤 `https://아이디.github.io/저장소이름/` 주소로 열립니다. 이 주소를 같이 쓸 사람에게 보내면 됩니다.

## 공동 수첩 켜기 (Firebase)

1. https://console.firebase.google.com 에서 프로젝트를 만듭니다. (애널리틱스는 꺼도 됩니다)
2. 빌드 → Firestore Database → 데이터베이스 만들기 → 위치는 `asia-northeast3 (서울)` → 프로덕션 모드.
3. Firestore의 규칙 탭에 `firestore.rules` 내용을 그대로 붙여넣고 게시합니다.
4. 프로젝트 설정 → 내 앱 → 웹 앱 추가(`</>`) → 나오는 `firebaseConfig` 값을 `config.js`의 `firebase: null` 자리에 넣습니다.

설정을 넣기 전에는 각자 기기에만 저장됩니다. 넣은 뒤 처음 열 때, 기기에만 있던 메모가 공동 수첩으로 올라갑니다.

## 알아둘 점

- 주소를 아는 사람은 누구나 보고 고칠 수 있습니다. 메모에 주민번호, 계좌, 계약자 개인정보는 적지 마세요.
- `?room=이름`을 주소 뒤에 붙이면 별도의 수첩 방이 열립니다. (예: `.../?room=family`)
- 설치: 안드로이드 크롬은 "홈 화면에 설치" 버튼, 아이폰 사파리는 공유 → 홈 화면에 추가.
- 중개업소 목록은 서울시 부동산중개업 등록부(2026-10-09 조회) 기준입니다.
