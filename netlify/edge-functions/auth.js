// netlify/edge-functions/auth.js
// Protects the entire site with a username + password

const USERNAME = "me";
const PASSWORD = "finance2025"; // 원하는 비밀번호로 바꾸세요

export default async function auth(req) {
  const authHeader = req.headers.get("authorization");

  if (authHeader) {
    const base64 = authHeader.replace("Basic ", "");
    const decoded = atob(base64);
    const [user, pass] = decoded.split(":");

    if (user === USERNAME && pass === PASSWORD) {
      return; // ✅ 인증 성공 → 페이지 정상 표시
    }
  }

  // 🔒 인증 실패 → 비밀번호 입력 요청
  return new Response("Unauthorized", {
    status: 401,
    headers: {
      "WWW-Authenticate": 'Basic realm="Finance HQ"',
    },
  });
}

export const config = {
  path: "/*", // 모든 경로에 적용
  // 시세 프록시는 GitHub Pages/로컬 파일에서도 불러야 하므로 제외 (함수 자체에서 출처·호스트 제한)
  excludedPath: ["/api/proxy", "/.netlify/functions/proxy"],
};
