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

  // Yahoo Finance v8 quote endpoint (no API key needed)
  const yahooUrl = `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${encodeURIComponent(symbols)}&range=1d&interval=1d`;
  // Also fetch summary for current price
  const quoteUrl = `https://query1.finance.yahoo.com/v7/finance/quote?symbols=${encodeURIComponent(symbols)}`;

  try {
    const response = await fetch(quoteUrl, {
      headers: {
        "User-Agent": "Mozilla/5.0",
        "Accept": "application/json",
      },
    });

    if (!response.ok) {
      throw new Error(`Yahoo Finance returned ${response.status}`);
    }

    const data = await response.json();
    const quotes = data?.quoteResponse?.result || [];

    const result = {};
    for (const q of quotes) {
      result[q.symbol] = {
        symbol: q.symbol,
        price: q.regularMarketPrice ?? null,
        change: q.regularMarketChange ?? null,
        changePercent: q.regularMarketChangePercent ?? null,
        previousClose: q.regularMarketPreviousClose ?? null,
        currency: q.currency ?? "USD",
        shortName: q.shortName ?? q.symbol,
        marketState: q.marketState ?? "CLOSED",
      };
    }

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

export const config = { path: "/api/quote" };
