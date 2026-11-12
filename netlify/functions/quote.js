// netlify/functions/quote.js
// Fetches real-time stock quotes from Yahoo Finance
// Called by the frontend as: /.netlify/functions/quote?symbols=VOO,QQQ,IBIT

export default async (req) => {
  const url = new URL(req.url);
  const symbols = url.searchParams.get("symbols");

  if (!symbols) {
    return new Response(JSON.stringify({ error: "No symbols provided" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  // Yahoo v7 quote API는 이제 crumb 없이 401 → 종목별 v8 chart API 사용
  const list = symbols.split(",").map(s => s.trim()).filter(Boolean).slice(0, 50);

  try {
    const result = {};
    await Promise.all(list.map(async (sym) => {
      const res = await fetch(
        `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(sym)}?range=2d&interval=1d`,
        { headers: { "User-Agent": "Mozilla/5.0", "Accept": "application/json" } }
      );
      if (!res.ok) return;
      const meta = (await res.json())?.chart?.result?.[0]?.meta;
      if (!meta || meta.regularMarketPrice == null) return;
      const price = meta.regularMarketPrice;
      const prev = meta.chartPreviousClose ?? meta.previousClose ?? null;
      const change = prev ? price - prev : null;
      result[sym] = {
        symbol: sym,
        price,
        change,
        changePercent: prev ? (change / prev) * 100 : null,
        previousClose: prev,
        currency: meta.currency ?? "USD",
        shortName: meta.shortName ?? sym,
        marketState: meta.marketState ?? "CLOSED",
      };
    }));
    if (!Object.keys(result).length) throw new Error("Yahoo Finance 시세 조회 실패");

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        // Cache for 5 minutes to avoid hammering Yahoo
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
};

// 경로: netlify.toml 의 /api/* → /.netlify/functions/:splat 리다이렉트로 /api/quote
