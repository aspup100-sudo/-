// 카카오 로그인 중계 서버 (Cloudflare Workers 무료 요금제용).
// 앱이 카카오에서 받은 "인가 코드"를 보내면, 카카오에 진짜 사용자인지 확인한 뒤
// Firebase에 로그인할 수 있는 "커스텀 토큰"을 만들어 돌려줘요.
// 비밀값은 코드에 적지 않고 Cloudflare의 "변수 및 비밀"에 넣어요:
//   KAKAO_REST_KEY         카카오 앱의 REST API 키
//   KAKAO_CLIENT_SECRET    (선택) 카카오 로그인 보안의 Client Secret을 켰을 때만
//   FIREBASE_CLIENT_EMAIL  Firebase 서비스 계정 JSON의 client_email
//   FIREBASE_PRIVATE_KEY   같은 JSON의 private_key (-----BEGIN PRIVATE KEY----- 부터 끝까지 그대로)
//   ALLOWED_ORIGINS        (선택) 쉼표로 구분. 비우면 https://aspup100-sudo.github.io 만 허용
const DEFAULT_ORIGINS = ["https://aspup100-sudo.github.io"];
const AUD = "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit";

export default {
  async fetch(req, env) {
    const origins = env.ALLOWED_ORIGINS ? env.ALLOWED_ORIGINS.split(",").map(s => s.trim()) : DEFAULT_ORIGINS;
    const origin = req.headers.get("Origin") || "";
    const cors = {
      "Access-Control-Allow-Origin": origins.includes(origin) ? origin : origins[0],
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Vary": "Origin"
    };
    const out = (status, body) => new Response(JSON.stringify(body), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (req.method !== "POST") return out(405, { error: "method" });
    if (!origins.includes(origin)) return out(403, { error: "origin" });

    let code, redirectUri;
    try { ({ code, redirectUri } = await req.json()); } catch (e) { return out(400, { error: "body" }); }
    if (typeof code !== "string" || !code || typeof redirectUri !== "string" || !origins.some(o => redirectUri.startsWith(o + "/"))) return out(400, { error: "input" });

    // 1) 인가 코드 → 카카오 액세스 토큰
    const form = new URLSearchParams({ grant_type: "authorization_code", client_id: env.KAKAO_REST_KEY, redirect_uri: redirectUri, code });
    if (env.KAKAO_CLIENT_SECRET) form.set("client_secret", env.KAKAO_CLIENT_SECRET);
    const tr = await fetch("https://kauth.kakao.com/oauth/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" }, body: form });
    const tok = await tr.json().catch(() => ({}));
    if (!tr.ok || !tok.access_token) return out(401, { error: "kakao-token", detail: tok.error_code || tok.error || tr.status });

    // 2) 액세스 토큰 → 카카오 회원번호와 닉네임
    const mr = await fetch("https://kapi.kakao.com/v2/user/me", { headers: { Authorization: "Bearer " + tok.access_token } });
    const me = await mr.json().catch(() => ({}));
    if (!mr.ok || !me.id) return out(401, { error: "kakao-user" });
    const nick = ((me.kakao_account && me.kakao_account.profile && me.kakao_account.profile.nickname) || (me.properties && me.properties.nickname) || "").slice(0, 12);

    // 3) Firebase 커스텀 토큰 (uid는 "kakao:회원번호")
    const uid = "kakao:" + me.id;
    try {
      const token = await customToken(env.FIREBASE_CLIENT_EMAIL, env.FIREBASE_PRIVATE_KEY, uid);
      return out(200, { token, nick });
    } catch (e) { return out(500, { error: "sign" }); }
  }
};

const b64u = buf => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uStr = s => b64u(new TextEncoder().encode(s));

async function customToken(email, pem, uid) {
  const der = Uint8Array.from(atob(String(pem).replace(/\\n/g, "\n").replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), c => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("pkcs8", der, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const now = Math.floor(Date.now() / 1000);
  const head = b64uStr(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const body = b64uStr(JSON.stringify({ iss: email, sub: email, aud: AUD, iat: now, exp: now + 3600, uid }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(head + "." + body));
  return head + "." + body + "." + b64u(sig);
}
