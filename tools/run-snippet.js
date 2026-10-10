#!/usr/bin/env node
// 브라우저 조각(SEOUL_DIFF, DEALS_DIFF)을 브라우저 없이 node로 돌려요. GitHub Actions 매일 갱신(.github/workflows/daily.yml)에서 써요.
//   SEOUL_KEY=<서울 열린데이터광장 인증키> node tools/run-snippet.js <조각 이름> <결과 폴더>
// 조각이 "/<키>/json/…"로 부르는 것은 서울 열린데이터광장으로, 앱 주소(https://aspup100-sudo.github.io/-/…)로 부르는 것은 이 저장소 파일로 보내요.
// info.more면 다시, info.left가 0보다 크면 다음 묶음을 받아요. envelope는 <결과 폴더>/<이름>-1.json, -2.json … 으로 저장하고, 받은 파일 목록을 마지막 줄에 찍어요.
// info.suspicious나 info.tooBig이면 아무 파일도 남기지 않고 끝내요(종료 코드 0, 이유는 출력).
const fs = require("fs"), path = require("path");
const [name, outDir] = process.argv.slice(2), KEY = process.env.SEOUL_KEY, ROOT = path.join(__dirname, "..");
if (!name || !outDir || !KEY) { console.error("사용법: SEOUL_KEY=… node tools/run-snippet.js <조각 이름> <결과 폴더>"); process.exit(1); }
const src = fs.readFileSync(path.join(__dirname, "browser-snippets.js"), "utf8");
const parts = src.split(/^\/\/ ---- (\w+) ----$/m), code = parts[parts.indexOf(name) + 1];
if (parts.indexOf(name) < 0) { console.error("조각을 못 찾았어요: " + name); process.exit(1); }
const BASE = "https://aspup100-sudo.github.io/-/", API = process.env.SEOUL_API || "http://openapi.seoul.go.kr:8088";
const realFetch = global.fetch;
global.window = global;
global.location = { pathname: "/" + KEY + "/json/x/1/1/" };
global.fetch = async (u, o) => {
  u = String(u);
  if (u.startsWith(BASE)) { const f = path.join(ROOT, u.slice(BASE.length).split("?")[0]); const ok = fs.existsSync(f); const t = ok ? fs.readFileSync(f, "utf8") : ""; return { ok, status: ok ? 200 : 404, text: async () => t, json: async () => JSON.parse(t) }; }
  if (u.startsWith("/")) u = API + u;
  for (let i = 0; ; i++) { try { const r = await realFetch(u, o); if (r.ok || i >= 3) return r; } catch (e) { if (i >= 3) throw e; } await new Promise(r => setTimeout(r, 2000 * (i + 1))); }
};
(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const saved = [];
  for (let run = 0; run < 60; run++) {
    const out = JSON.parse(await (0, eval)(code));
    const info = out.info || {};
    console.log(name, JSON.stringify(info));
    if (info.suspicious || info.tooBig) { saved.forEach(f => fs.unlinkSync(f)); console.log(name + ": 이상해서 반영하지 않아요"); saved.length = 0; break; }
    if (out.envelope) { const f = path.join(outDir, name.toLowerCase() + "-" + (saved.length + 1) + ".json"); fs.writeFileSync(f, JSON.stringify(out.envelope)); saved.push(f); }
    if (info.more || info.left > 0) continue;
    break;
  }
  console.log("FILES " + saved.join(" "));
})().catch(e => { console.error(name + " 실패: " + e.message); console.log("FILES "); process.exit(2); });
