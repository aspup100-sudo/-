# 매일 갱신 도구

앱의 중개업소 목록(서울 전체)과 구역별 호가를 매일 다시 확인해서 고치는 데 쓰는 파일들이에요. 예약 작업(Claude)이 하루 세 번 시도하고, 그날 이미 했으면 건너뜁니다.

| 파일 | 하는 일 |
|---|---|
| `browser-snippets.js` | 내 컴퓨터의 브라우저에서 실행하는 코드 조각 2개. `SEOUL_DIFF`는 서울 열린데이터광장에서 중개업소 전체를 받아, `ASKS_DIFF`는 재개발닷컴 구역별 매물 표를 읽어, 지금 올라가 있는 데이터와 **다른 것만** 돌려줘요. |
| `apply-update.js` | 그 "다른 것"을 `data/gu/*.json`, `data.js`, `data-guui.js`, `listings.js`, `updated.js`에 반영해요. |
| `build-seoul.js` | 서울 전체 자료를 통째로 받아 `data/gu`를 처음부터 다시 만들 때 써요. 평소 갱신에는 쓰지 않아요. |

## 옮겨 적기 확인 (sum)

브라우저 조각은 결과를 `{ "sum": "8자리", "patch": {...} }` 봉투로 돌려줘요. 이 봉투를 파일에 그대로 옮겨 적으면 `apply-update.js`가 sum을 다시 계산해서, 한 글자라도 달라졌으면 반영하지 않고 멈춥니다.

```
node tools/apply-update.js seoul.json asks.json
```

## 규칙

- 자료에서 사라진 중개업소는 바로 지우지 않고 "등록부에서 사라짐" 표시를 붙여요. 30일이 지나도 돌아오지 않으면 목록에서 빠져요. (리뷰와 각자 메모가 그 중개업소 id에 붙어 있어서예요)
- 새로 등록된 곳은 14일 동안 "새로 등록" 표시를 붙여요.
- 매물은 구역별 유형과 호가만 가져와요. 새로 올라온 것은 7일 동안 "새로" 표시가 붙어요.
- 한꺼번에 너무 많이 바뀐 것으로 나오면(읽기 실패 가능성) 그날은 반영하지 않아요.
- 중개업소 id: 창신·구의에 처음 넣었던 곳은 `b01`, `g01`, `k001` 같은 예전 id를 그대로 쓰고, 나머지는 `s`+시스템등록번호예요.

## 정리해 둔 구역을 추가했을 때

- 중개업소: `browser-snippets.js`의 `CUR`와 `apply-update.js`의 `AREAS`에 구역을 추가하고, 데이터 행 9번째 칸에 등록번호를 넣어요.
- 매물: `listings.js`의 `areas`에 재개발닷컴 구역 id를 추가해요.

## 실거래 (data/deals/<구코드>.json)
- 처음 자료: 서울 열린데이터광장 OA-21275 "서울시 부동산 실거래가 정보"의 연도별 CSV(2024~2026 접수분)를 `python3 tools/build-deals.py <CSV …>` 로 만들었어요 (2026-10-10, 계약일 2026-10-08까지).
- 매일: 브라우저 조각 `DEALS_DIFF` 가 올해 접수분을 받아 새 거래와 취소된 거래만 돌려주고, `node tools/apply-update.js deals-1.json [deals-2.json …]` 로 반영해요.

## 컴퓨터 없이 매일 갱신 (GitHub Actions)
- `.github/workflows/daily.yml` 이 매일 08:51(한국 시간)에 `tools/run-snippet.js` 로 SEOUL_DIFF·DEALS_DIFF 조각을 node에서 돌리고, `apply-update.js` 로 반영해 main에 올려요.
- 서울 열린데이터광장 인증키는 저장소 Settings > Secrets and variables > Actions 의 `SEOUL_KEY` 에만 넣어요.
- 재개발닷컴 호가(ASKS_DIFF)는 로그인된 브라우저가 필요해서 여기서는 하지 않아요.

## 구역 경계 자동 확인 (GitHub Actions)
- `.github/workflows/zones.yml` 이 매주 월요일 OA-22712 파일 목록을 보고(`tools/fetch-zones.py`), 앱 자료보다 새 기준월 파일이 있으면 받아서 `build-zones.py` 로 다시 만들어 올려요.
- 손으로 넣은 구역(data/zones/extra.json)은 그대로 두니, 새 도심복합 사업지는 계속 손으로 넣어요.
