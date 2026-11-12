// netlify/functions/proxy.js — 대시보드 전용 시세 프록시
// 사용: /api/proxy?url=<encodeURIComponent(원본 URL)>
// 허용된 호스트(Yahoo Finance, 네이버 증권)만 중계하는 제한된 프록시입니다.
// (netlify.toml 의 /api/* → /.netlify/functions/:splat 리다이렉트로 연결)

const ALLOWED_HOSTS = new Set([
  'query1.finance.yahoo.com',
  'query2.finance.yahoo.com',
  'm.stock.naver.com',
]);

// 이 출처에서 온 요청만 응답 (file:// 로컬 실행은 Origin이 "null")
const ALLOWED_ORIGINS = [
  'https://yeemmakim-dev.github.io',
  'null',
  /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
];

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const CACHE_SECONDS = 60;

// Yahoo quoteSummary는 쿠키+crumb 필요 → 함수 인스턴스 메모리에 보관
let yahooAuth = null; // { cookie, crumb, ts }

function originAllowed(origin, selfOrigin) {
  if (origin == null || origin === selfOrigin) return true; // 같은 사이트 / 직접 호출
  return ALLOWED_ORIGINS.some(o => (typeof o === 'string' ? o === origin : o.test(origin)));
}

function corsHeaders(origin) {
  return {
    'Access-Control-Allow-Origin': origin || '*',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Vary': 'Origin',
  };
}

async function getYahooAuth(force = false) {
  if (!force && yahooAuth && Date.now() - yahooAuth.ts < 6 * 3600 * 1000) return yahooAuth;
  const r1 = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': UA }, redirect: 'manual' });
  const cookies = r1.headers.getSetCookie
    ? r1.headers.getSetCookie()
    : (r1.headers.get('set-cookie') || '').split(/,(?=\s*\w+=)/);
  const cookie = cookies.map(c => c.split(';')[0].trim()).filter(Boolean).join('; ');
  const r2 = await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': UA, Cookie: cookie } });
  const crumb = (await r2.text()).trim();
  if (!r2.ok || !crumb || crumb.includes('<')) throw new Error('crumb 발급 실패');
  yahooAuth = { cookie, crumb, ts: Date.now() };
  return yahooAuth;
}

async function fetchUpstream(target) {
  const headers = { 'User-Agent': UA, Accept: 'application/json' };
  if (!target.pathname.includes('/quoteSummary/')) return fetch(target, { headers });

  for (const force of [false, true]) {
    const auth = await getYahooAuth(force);
    const u = new URL(target);
    u.searchParams.set('crumb', auth.crumb);
    const res = await fetch(u, { headers: { ...headers, Cookie: auth.cookie } });
    if (res.status !== 401 && res.status !== 403) return res;
  }
  throw new Error('Yahoo 인증 실패');
}

export default async (req) => {
  const reqUrl = new URL(req.url);
  const origin = req.headers.get('origin');
  if (!originAllowed(origin, reqUrl.origin)) return new Response('Forbidden origin', { status: 403 });
  const cors = corsHeaders(origin);
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors });
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405, headers: cors });

  let target;
  try { target = new URL(reqUrl.searchParams.get('url')); }
  catch { return new Response('url 파라미터 필요', { status: 400, headers: cors }); }
  if (target.protocol !== 'https:' || !ALLOWED_HOSTS.has(target.hostname)) {
    return new Response('허용되지 않은 호스트', { status: 403, headers: cors });
  }

  try {
    const res = await fetchUpstream(target);
    return new Response(await res.arrayBuffer(), {
      status: res.status,
      headers: {
        ...cors,
        'Content-Type': res.headers.get('Content-Type') || 'application/json',
        'Cache-Control': `public, max-age=${CACHE_SECONDS}`,
      },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 502,
      headers: { ...cors, 'Content-Type': 'application/json' },
    });
  }
};
