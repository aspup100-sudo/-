#!/usr/bin/env node
// 구를 골랐을 때 나오는 동(법정동) 약도를 만들어요. 한 번 만들어 두면 다시 돌릴 일은 거의 없어요.
//   node tools/build-dongmap.js <seoul_neighborhoods_geo.json>
// 입력: southkorea/seoul-maps 의 juso/2015/json/seoul_neighborhoods_geo.json
//       (출처: 도로명주소 안내(juso.go.kr) 서울시 행정구역 읍면동 위치정보 2015, 가공 Lucy Park, Apache License 2.0)
// 출력: data/dongmap/<구코드>.json  { w, h, dong: { 동이름: { d: SVG 경로, c: [글자 x, y], r: 글자 놓을 자리 크기 } } }
// 구마다 화면 폭 1000에 맞춰 줄이고, 선을 단순하게 줄여요. 정확한 경계선이 아니라 고르기 쉬운 약도예요.
const fs = require("fs"), path = require("path");
const ROOT = path.join(__dirname, ".."), OUT = path.join(ROOT, "data", "dongmap");
const W = 1000, PAD = 24, TOL = 1.6, KX = Math.cos(37.55 * Math.PI / 180);

const src = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const byGu = {};
src.features.forEach(f => {
  const p = f.properties, gu = p.EMD_CD.slice(0, 5);
  const polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  (byGu[gu] = byGu[gu] || []).push({ name: p.EMD_KOR_NM, polys });
});

// 더글러스-포이커 단순화 (닫힌 고리)
function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const keep = new Uint8Array(pts.length); keep[0] = keep[pts.length - 1] = 1;
  const st = [[0, pts.length - 1]];
  while (st.length) {
    const [a, b] = st.pop(); let md = 0, mi = -1;
    const [ax, ay] = pts[a], [bx, by] = pts[b], dx = bx - ax, dy = by - ay, L = Math.hypot(dx, dy);
    for (let i = a + 1; i < b; i++) {
      const [px, py] = pts[i];
      const d = L ? Math.abs(dy * px - dx * py + bx * ay - by * ax) / L : Math.hypot(px - ax, py - ay);
      if (d > md) { md = d; mi = i; }
    }
    if (md > tol) { keep[mi] = 1; st.push([a, mi], [mi, b]); }
  }
  return pts.filter((_, i) => keep[i]);
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy;
  let t = L ? ((px - ax) * dx + (py - ay) * dy) / L : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function inside(x, y, ring) {
  let o = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i], [xj, yj] = ring[j];
    if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) o = !o;
  }
  return o;
}
// 글자 자리: 가장 큰 조각 안에서 경계와 가장 먼 점 (격자로 찾기)
function labelAt(rings) {
  const ring = rings.reduce((a, r) => (area(r) > area(a) ? r : a));
  const xs = ring.map(p => p[0]), ys = ring.map(p => p[1]);
  const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
  let best = [(x0 + x1) / 2, (y0 + y1) / 2], br = 0; const N = 40;
  for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
    const x = x0 + (x1 - x0) * i / N, y = y0 + (y1 - y0) * j / N;
    if (!inside(x, y, ring)) continue;
    let d = Infinity;
    for (let k = 0, m = ring.length - 1; k < ring.length; m = k++) d = Math.min(d, segDist(x, y, ring[m][0], ring[m][1], ring[k][0], ring[k][1]));
    if (d > br) { br = d; best = [x, y]; }
  }
  return { c: best.map(Math.round), r: Math.round(br) };
}
function area(r) { let s = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) s += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(s / 2); }
function pathOf(ring) {
  let s = "", px = 0, py = 0;
  ring.forEach(([x, y], i) => { s += i ? "l" + (x - px) + " " + (y - py) : "M" + x + " " + y; px = x; py = y; });
  return s + "z";
}

fs.mkdirSync(OUT, { recursive: true });
Object.keys(byGu).sort().forEach(gu => {
  const ds = byGu[gu];
  let mx = Infinity, Mx = -Infinity, my = Infinity, My = -Infinity;
  ds.forEach(d => d.polys.forEach(pl => pl[0].forEach(([lo, la]) => {
    const x = lo * KX, y = -la; mx = Math.min(mx, x); Mx = Math.max(Mx, x); my = Math.min(my, y); My = Math.max(My, y);
  })));
  const s = (W - 2 * PAD) / (Mx - mx), H = Math.round((My - my) * s + 2 * PAD);
  const out = { w: W, h: H, dong: {} };
  ds.forEach(d => {
    const rings = d.polys.map(pl => pl[0].map(([lo, la]) => [Math.round((lo * KX - mx) * s + PAD), Math.round((-la - my) * s + PAD)]))
      .map(r => simplify(r.filter((p, i) => !i || p[0] !== r[i - 1][0] || p[1] !== r[i - 1][1]), TOL))
      .filter(r => r.length >= 4 && area(r) > 30);
    if (!rings.length) return;
    const lb = labelAt(rings);
    out.dong[d.name] = { d: rings.map(pathOf).join(""), c: lb.c, r: lb.r };
  });
  fs.writeFileSync(path.join(OUT, gu + ".json"), JSON.stringify(out));
});
console.log("만든 구:", Object.keys(byGu).length);

// 이웃 동: 경계가 맞닿은(40m 안) 동끼리. 동 화면 지도에 옆 동 중개업소를 흐리게 같이 보여 주는 데 써요.
// 출력: data/dongmap/neighbors.json  { "구코드:동": ["구코드:동", ...] } (다른 구 동도 들어가요)
const all = [];
src.features.forEach(f => {
  const p = f.properties, polys = f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates;
  const pts = []; polys.forEach(pl => pl[0].forEach(([lo, la]) => pts.push([lo * KX * 111320, la * 110950])));  // 대략 미터
  const xs = pts.map(q => q[0]), ys = pts.map(q => q[1]);
  all.push({ key: p.EMD_CD.slice(0, 5) + ":" + p.EMD_KOR_NM, pts, bb: [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)] });
});
const NEAR = 40, nb = {};
for (let i = 0; i < all.length; i++) for (let j = i + 1; j < all.length; j++) {
  const a = all[i], b = all[j];
  if (a.bb[0] > b.bb[2] + NEAR || b.bb[0] > a.bb[2] + NEAR || a.bb[1] > b.bb[3] + NEAR || b.bb[1] > a.bb[3] + NEAR) continue;
  let hit = false;
  for (let k = 0; k < a.pts.length && !hit; k += 2) for (let m = 0; m < b.pts.length - 1 && !hit; m++)
    if (segDist(a.pts[k][0], a.pts[k][1], b.pts[m][0], b.pts[m][1], b.pts[m + 1][0], b.pts[m + 1][1]) < NEAR) hit = true;
  if (hit && a.key !== b.key) { (nb[a.key] = nb[a.key] || []).push(b.key); (nb[b.key] = nb[b.key] || []).push(a.key); }
}
Object.keys(nb).forEach(k => nb[k] = [...new Set(nb[k])].sort());
fs.writeFileSync(path.join(OUT, "neighbors.json"), JSON.stringify(nb));
console.log("이웃 동 목록:", Object.keys(nb).length);
