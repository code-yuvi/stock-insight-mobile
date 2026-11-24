/** Client-side analysis — mirrors analysis.py for mobile / PWA (no PC server). */

export const POPULAR_IN = [
  { symbol: "RELIANCE", label: "Reliance Industries" },
  { symbol: "TCS", label: "TCS" },
  { symbol: "HDFCBANK", label: "HDFC Bank" },
  { symbol: "INFY", label: "Infosys" },
  { symbol: "ICICIBANK", label: "ICICI Bank" },
  { symbol: "SBIN", label: "SBI" },
  { symbol: "BHARTIARTL", label: "Airtel" },
  { symbol: "ITC", label: "ITC" },
  { symbol: "WIPRO", label: "Wipro" },
  { symbol: "BAJFINANCE", label: "Bajaj Finance" },
];

const BASE_WARNINGS = [
  "This tool uses public data and simple rules — not financial advice.",
  "No model can reliably tell you when to buy or sell; markets are uncertain.",
  "Verify facts from the company annual report and exchange filings before investing.",
];

export function normalizeSymbol(raw, market = "IN") {
  const s = raw.trim().toUpperCase().replace(/\s/g, "");
  if (s.includes(".")) return s;
  if (market.toUpperCase() === "US") return s;
  return `${s}.NS`;
}

function looksLikeTicker(q) {
  const s = q.trim();
  if (!s || /\s/.test(s)) return false;
  return /^[A-Za-z0-9.\-^]{1,18}$/.test(s);
}

function matchPopularLabel(query) {
  const ql = query.trim().toLowerCase();
  let fuzzy = null;
  for (const item of POPULAR_IN) {
    const lab = item.label.toLowerCase();
    const sym = item.symbol.toLowerCase();
    if (sym === ql || lab === ql) return item.symbol;
    if (lab.includes(ql) || ql.includes(lab)) fuzzy = item.symbol;
  }
  return fuzzy;
}

function filterEquityQuotes(quotes) {
  return (quotes || []).filter(
    (q) => !q.quoteType || q.quoteType === "EQUITY" || q.typeDisp === "Equity"
  );
}

function quotesForMarket(equities, market) {
  if (market.toUpperCase() === "IN") {
    const nse = equities.filter((q) => q.symbol?.endsWith(".NS") || q.exchange === "NSI");
    const bse = equities.filter((q) => q.symbol?.endsWith(".BO"));
    return [...nse, ...bse];
  }
  const us = equities.filter((q) => q.symbol && !q.symbol.includes("."));
  return us.length ? us : equities;
}

function mapQuoteRow(q, market) {
  return {
    symbol: q.symbol,
    name: q.longname || q.shortname || q.symbol,
    exchange: q.exchange || (q.symbol?.endsWith(".NS") ? "NSE" : q.symbol?.endsWith(".BO") ? "BSE" : market),
  };
}

/** Type-ahead suggestions while typing (names + symbols). */
export async function suggestStocks(query, market = "IN") {
  const q = query.trim();
  if (!q) return [];

  const ql = q.toLowerCase();
  const local = POPULAR_IN.filter(
    (item) =>
      item.label.toLowerCase().includes(ql) ||
      item.symbol.toLowerCase().startsWith(ql) ||
      ql.startsWith(item.symbol.toLowerCase().slice(0, 3))
  ).map((item) => ({
    ...mapQuoteRow(
      { symbol: normalizeSymbol(item.symbol, market), longname: item.label, exchange: "NSE" },
      market
    ),
    source: "popular",
  }));

  if (q.length < 2) return local.slice(0, 8);

  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    q
  )}&quotesCount=14&newsCount=0&enableFuzzyQuery=true`;
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return local.slice(0, 10);
    const equities = quotesForMarket(filterEquityQuotes((await res.json()).quotes), market);
    const remote = equities.slice(0, 10).map((row) => ({ ...mapQuoteRow(row, market), source: "live" }));

    const seen = new Set();
    const merged = [];
    for (const item of [...local, ...remote]) {
      if (!item.symbol || seen.has(item.symbol)) continue;
      seen.add(item.symbol);
      merged.push(item);
    }
    return merged.slice(0, 10);
  } catch {
    return local.slice(0, 10);
  }
}

async function searchYahooSymbol(query, market) {
  const url = `https://query2.finance.yahoo.com/v1/finance/search?q=${encodeURIComponent(
    query
  )}&quotesCount=12&newsCount=0&enableFuzzyQuery=true`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return null;
  const equities = quotesForMarket(filterEquityQuotes((await res.json()).quotes), market);
  const hit = equities[0];
  return hit ? mapQuoteRow(hit, market) : null;
}

export function formatQuoteTime(unixSec, timeZone = "Asia/Kolkata") {
  if (!unixSec) return null;
  try {
    return new Intl.DateTimeFormat("en-IN", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(unixSec * 1000));
  } catch {
    return new Date(unixSec * 1000).toLocaleString();
  }
}

/** Turn a company name or ticker into a Yahoo symbol. */
export async function resolveToTicker(query, market = "IN") {
  const raw = query.trim();
  if (!raw) return null;
  if (raw.toUpperCase() === "DEMO") return { symbol: "DEMO", name: "Demo Industries (synthetic)" };
  const popular = matchPopularLabel(raw);
  if (popular) return { symbol: normalizeSymbol(popular, market), name: null, matchedBy: "watchlist" };
  if (looksLikeTicker(raw)) return { symbol: normalizeSymbol(raw, market), name: null, matchedBy: "ticker" };
  const found = await searchYahooSymbol(raw, market);
  if (!found) return null;
  return { ...found, matchedBy: "search" };
}

function formatMarketCap(value, currency) {
  if (value == null || Number.isNaN(value)) return null;
  const abs = Math.abs(value);
  let unit = "";
  let n = value;
  if (abs >= 1e12) {
    n = value / 1e12;
    unit = "T";
  } else if (abs >= 1e9) {
    n = value / 1e9;
    unit = "B";
  } else if (abs >= 1e6) {
    n = value / 1e6;
    unit = "M";
  }
  const prefix = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  return `${prefix}${n.toFixed(2)}${unit}`;
}

function buildCompanyBlock(info, priceMeta = {}) {
  const profile = info.profile || {};
  const aboutRaw = profile.longBusinessSummary || "";
  const about =
    aboutRaw.length > 420 ? `${aboutRaw.slice(0, 417).trim()}…` : aboutRaw.trim() || null;
  return {
    sector: profile.sector || info.sector || null,
    industry: profile.industry || info.industry || null,
    exchange: priceMeta.exchangeName || info.exchange || null,
    market_cap: formatMarketCap(info.marketCap, info.currency),
    market_cap_raw: info.marketCap ?? null,
    website: profile.website || info.website || null,
    employees: profile.fullTimeEmployees ?? info.fullTimeEmployees ?? null,
    about,
  };
}

function rollingMean(arr, window) {
  const out = [];
  for (let i = 0; i < arr.length; i++) {
    if (i < window - 1) {
      out.push(NaN);
      continue;
    }
    let sum = 0;
    for (let j = i - window + 1; j <= i; j++) sum += arr[j];
    out.push(sum / window);
  }
  return out;
}

function ewmMean(values, alpha, minPeriods) {
  const out = new Array(values.length).fill(NaN);
  let prev = null;
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    const x = values[i];
    if (x == null || Number.isNaN(x)) continue;
    count++;
    if (prev == null) prev = x;
    else prev = alpha * x + (1 - alpha) * prev;
    if (count >= minPeriods) out[i] = prev;
  }
  return out;
}

function rsi(close, period = 14) {
  const delta = close.map((v, i) => (i === 0 ? 0 : v - close[i - 1]));
  const gain = delta.map((d) => (d > 0 ? d : 0));
  const loss = delta.map((d) => (d < 0 ? -d : 0));
  const alpha = 1 / period;
  const avgGain = ewmMean(gain, alpha, period);
  const avgLoss = ewmMean(loss, alpha, period);
  return close.map((_, i) => {
    const ag = avgGain[i];
    const al = avgLoss[i];
    if (ag == null || al == null || (al === 0 && ag === 0)) return NaN;
    const rs = al === 0 ? Infinity : ag / al;
    return 100 - 100 / (1 + rs);
  });
}

function emaSeries(values, span) {
  const alpha = 2 / (span + 1);
  const out = [];
  let prev = null;
  for (const v of values) {
    if (v == null || Number.isNaN(v)) {
      out.push(NaN);
      continue;
    }
    prev = prev == null ? v : alpha * v + (1 - alpha) * prev;
    out.push(prev);
  }
  return out;
}

function macd(close) {
  if (close.length < 35) return { macd: null, signal: null, hist: null };
  const ema12 = emaSeries(close, 12);
  const ema26 = emaSeries(close, 26);
  const macdLine = close.map((_, i) => ema12[i] - ema26[i]);
  const signal = emaSeries(
    macdLine.map((v) => (Number.isNaN(v) ? null : v)),
    9
  );
  const last = close.length - 1;
  const m = macdLine[last];
  const s = signal[last];
  if (m == null || s == null || Number.isNaN(m) || Number.isNaN(s)) {
    return { macd: null, signal: null, hist: null };
  }
  return { macd: m, signal: s, hist: m - s };
}

function verdictFromScore(score) {
  if (score >= 4) {
    return [
      "Bullish bias (rules)",
      "Educational view: conditions lean positive — still validate fundamentals and your risk tolerance before buying.",
    ];
  }
  if (score >= 2) {
    return [
      "Slightly bullish",
      "Educational view: mild positive skew — consider staggered entry (SIP-style) rather than lump sum.",
    ];
  }
  if (score <= -4) {
    return [
      "Bearish bias (rules)",
      "Educational view: conditions lean negative — selling pressure possible; avoid panic; review thesis if you hold.",
    ];
  }
  if (score <= -2) {
    return [
      "Slightly bearish",
      "Educational view: mild negative skew — new buyers often wait for clarity or use smaller tranches.",
    ];
  }
  return [
    "Neutral / mixed",
    "Educational view: no strong rule-based edge — prioritize business quality and valuation over timing.",
  ];
}

function mulberry32(seed) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function demoHistory() {
  const days = 220;
  const rand = mulberry32(42);
  const close = [];
  let price = 1000;
  const volume = [];
  const dates = [];
  const end = new Date();
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(end);
    d.setDate(d.getDate() - i);
    if (d.getDay() === 0 || d.getDay() === 6) continue;
    const step = rand() * 0.024 - 0.011;
    price *= Math.exp(0.0005 + step);
    close.push(price);
    volume.push(800000 + Math.floor(rand() * 1200000));
    dates.push(d.toISOString().slice(0, 10));
  }
  return { close, volume, dates };
}

function analyzeFromHist(tickerSym, name, currency, close, volume, info, extraWarnings = []) {
  const warnings = [...BASE_WARNINGS, ...extraWarnings];
  const price = close[close.length - 1];
  const prev = close.length > 1 ? close[close.length - 2] : price;
  const change1d = prev ? ((price - prev) / prev) * 100 : 0;

  const sma20Arr = rollingMean(close, 20);
  const sma50Arr = rollingMean(close, 50);
  const sma200Arr = rollingMean(close, 200);
  const sma20 = sma20Arr[sma20Arr.length - 1];
  const sma50 = close.length >= 50 ? sma50Arr[sma50Arr.length - 1] : null;
  const sma200 = close.length >= 200 ? sma200Arr[sma200Arr.length - 1] : null;
  const rsiArr = rsi(close);
  const rsiVal = rsiArr[rsiArr.length - 1];
  const { macd: macdVal, signal: macdSig, hist: macdHist } = macd(close);

  const volAvgArr = rollingMean(volume, 20);
  const volAvg = volAvgArr[volAvgArr.length - 1];
  const volLast = volume[volume.length - 1];
  const volRatio = volAvg ? volLast / volAvg : 1;

  const pe = info.trailingPE ?? info.forwardPE ?? null;
  const profitMargins = info.profitMargins ?? null;
  const debtToEquity = info.debtToEquity ?? null;
  const fiftyTwoHigh = info.fiftyTwoWeekHigh ?? null;
  const fiftyTwoLow = info.fiftyTwoWeekLow ?? null;

  let score = 0;
  const reasons = [];

  if (sma50 != null && !Number.isNaN(sma50)) {
    if (price > sma50) {
      score += 1;
      reasons.push("Price is above 50-day average (short-term uptrend).");
    } else {
      score -= 1;
      reasons.push("Price is below 50-day average (short-term weakness).");
    }
  }

  if (sma200 != null && !Number.isNaN(sma200)) {
    if (price > sma200) {
      score += 1;
      reasons.push("Price is above 200-day average (long-term uptrend).");
    } else {
      score -= 1;
      reasons.push("Price is below 200-day average (long-term downtrend).");
    }
  }

  if (sma50 != null && sma200 != null && !Number.isNaN(sma50) && !Number.isNaN(sma200)) {
    if (sma50 > sma200) {
      score += 1;
      reasons.push("50-day average above 200-day (golden cross zone — bullish bias).");
    } else {
      score -= 1;
      reasons.push("50-day average below 200-day (death cross zone — bearish bias).");
    }
  }

  if (rsiVal != null && !Number.isNaN(rsiVal)) {
    if (rsiVal < 30) {
      score += 2;
      reasons.push(`RSI ≈ ${rsiVal.toFixed(1)} (oversold — some traders look for rebounds; can stay low).`);
    } else if (rsiVal > 70) {
      score -= 2;
      reasons.push(`RSI ≈ ${rsiVal.toFixed(1)} (overbought — elevated pullback risk).`);
    } else {
      reasons.push(`RSI ≈ ${rsiVal.toFixed(1)} (neutral momentum).`);
    }
  }

  if (macdHist != null) {
    if (macdHist > 0) {
      score += 1;
      reasons.push("MACD histogram positive (momentum turning up).");
    } else {
      score -= 1;
      reasons.push("MACD histogram negative (momentum turning down).");
    }
  }

  if (volRatio > 1.3) {
    reasons.push(`Volume ~${volRatio.toFixed(1)}× recent average (higher participation).`);
  } else if (volRatio < 0.7) {
    reasons.push(`Volume ~${volRatio.toFixed(1)}× recent average (quiet session).`);
  }

  if (pe != null) {
    if (pe < 0) {
      score -= 1;
      reasons.push(`P/E ≈ ${pe.toFixed(1)} (loss-making or distorted earnings).`);
    } else if (pe < 25) {
      score += 1;
      reasons.push(`Trailing P/E ≈ ${pe.toFixed(1)} (moderate vs typical large-cap range).`);
    } else if (pe > 45) {
      score -= 1;
      reasons.push(`Trailing P/E ≈ ${pe.toFixed(1)} (rich valuation — growth must justify).`);
    } else {
      reasons.push(`Trailing P/E ≈ ${pe.toFixed(1)}.`);
    }
  }

  if (profitMargins != null) {
    const pm = profitMargins * 100;
    if (pm > 15) {
      score += 1;
      reasons.push(`Profit margin ≈ ${pm.toFixed(1)}% (healthy).`);
    } else if (pm < 0) {
      score -= 1;
      reasons.push(`Profit margin ≈ ${pm.toFixed(1)}% (negative).`);
    }
  }

  if (fiftyTwoHigh && fiftyTwoLow && fiftyTwoHigh > fiftyTwoLow) {
    const pos = (price - fiftyTwoLow) / (fiftyTwoHigh - fiftyTwoLow);
    if (pos > 0.85) {
      score -= 1;
      reasons.push("Price in upper part of 52-week range (less margin of safety).");
    } else if (pos < 0.25) {
      score += 1;
      reasons.push("Price in lower part of 52-week range (closer to yearly lows).");
    }
    reasons.push(`52-week range position ≈ ${(pos * 100).toFixed(0)}%.`);
  }

  const [verdict, actionHint] = verdictFromScore(score);

  const history = [];
  const start = Math.max(0, close.length - 120);
  for (let i = start; i < close.length; i++) {
    history.push({ date: `day-${i}`, close: Math.round(close[i] * 100) / 100 });
  }

  const signals = {
    price: Math.round(price * 100) / 100,
    sma20: Math.round(sma20 * 100) / 100,
    sma50: sma50 != null && !Number.isNaN(sma50) ? Math.round(sma50 * 100) / 100 : null,
    sma200: sma200 != null && !Number.isNaN(sma200) ? Math.round(sma200 * 100) / 100 : null,
    rsi14: Math.round(rsiVal * 100) / 100,
    macd: macdVal != null ? Math.round(macdVal * 10000) / 10000 : null,
    macd_signal: macdSig != null ? Math.round(macdSig * 10000) / 10000 : null,
    macd_hist: macdHist != null ? Math.round(macdHist * 10000) / 10000 : null,
    volume_ratio_20d: Math.round(volRatio * 100) / 100,
    trailing_pe: pe != null ? Math.round(pe * 100) / 100 : null,
    profit_margin_pct: profitMargins != null ? Math.round(profitMargins * 10000) / 100 : null,
    debt_to_equity: debtToEquity,
    fifty_two_week_high: fiftyTwoHigh,
    fifty_two_week_low: fiftyTwoLow,
    history,
  };

  return {
    symbol: tickerSym,
    name,
    currency,
    current_price: signals.price,
    change_pct_1d: Math.round(change1d * 100) / 100,
    signals,
    score,
    verdict,
    action_hint: actionHint,
    reasons,
    warnings,
  };
}

function applyLivePrices(close, volume, dateLabels, meta) {
  const live = meta.regularMarketPrice ?? meta.previousClose;
  if (live == null || !close.length) return { close, volume, dateLabels };

  const c = close.slice();
  const v = volume.slice();
  const d = dateLabels.slice();
  const marketDay = meta.regularMarketTime
    ? new Date(meta.regularMarketTime * 1000).toISOString().slice(0, 10)
    : null;
  const lastBar = d[d.length - 1];

  if (marketDay && lastBar === marketDay) {
    c[c.length - 1] = live;
  } else if (marketDay && lastBar && lastBar < marketDay) {
    c.push(live);
    v.push(meta.regularMarketVolume ?? v[v.length - 1] ?? 0);
    d.push(marketDay);
  } else {
    c[c.length - 1] = live;
  }
  return { close: c, volume: v, dateLabels: d };
}

function overlayLiveOnResult(out, meta, currency) {
  const live = meta.regularMarketPrice;
  const prev = meta.chartPreviousClose ?? meta.previousClose;
  if (live == null) return out;

  out.current_price = Math.round(live * 100) / 100;
  if (prev) out.change_pct_1d = Math.round(((live - prev) / prev) * 10000) / 100;
  if (out.signals) out.signals.price = out.current_price;

  const state = meta.marketState || meta.currentTradingPeriod || "—";
  const when = formatQuoteTime(meta.regularMarketTime, meta.exchangeTimezoneName || "Asia/Kolkata");
  out.quote = {
    market_state: typeof state === "string" ? state : "LIVE",
    updated_at: when,
    delayed: !!meta.dataGranularity && meta.dataGranularity !== "1m",
    source: "Yahoo Finance (live quote)",
  };
  return out;
}

async function fetchYahooChart(tickerSym) {
  const bust = Date.now();
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    tickerSym
  )}?interval=1d&range=1y&includePrePost=true&events=div%7Csplits&_=${bust}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) throw new Error("Could not reach Yahoo Finance — try DEMO or mobile data.");
  const body = await res.json();
  const result = body?.chart?.result?.[0];
  if (!result) throw new Error("No chart data returned.");
  const meta = result.meta || {};
  const quote = result.indicators?.quote?.[0] || {};
  const timestamps = result.timestamp || [];
  const closes = quote.close || [];
  const volumes = quote.volume || [];
  const close = [];
  const volume = [];
  const dateLabels = [];
  for (let i = 0; i < timestamps.length; i++) {
    const c = closes[i];
    if (c == null) continue;
    close.push(c);
    volume.push(volumes[i] ?? 0);
    dateLabels.push(new Date(timestamps[i] * 1000).toISOString().slice(0, 10));
  }
  return { meta, close, volume, dateLabels };
}

async function fetchYahooSummary(tickerSym) {
  const modules =
    "summaryDetail,financialData,defaultKeyStatistics,price,summaryProfile,assetProfile";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    tickerSym
  )}?modules=${modules}`;
  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) return {};
  const body = await res.json();
  const r = body?.quoteSummary?.result?.[0] || {};
  const fin = r.financialData || {};
  const sum = r.summaryDetail || {};
  const stat = r.defaultKeyStatistics || {};
  const price = r.price || {};
  const profile = { ...(r.summaryProfile || {}), ...(r.assetProfile || {}) };
  const currency = price.currency || profile.currency;
  const marketCap = price.marketCap?.raw ?? sum.marketCap?.raw ?? stat.marketCap?.raw;
  return {
    shortName: price.shortName || price.longName,
    longName: price.longName || price.shortName,
    currency,
    exchange: price.exchangeName || profile.exchange,
    trailingPE: sum.trailingPE?.raw ?? stat.trailingPE?.raw,
    forwardPE: sum.forwardPE?.raw,
    profitMargins: fin.profitMargins?.raw,
    debtToEquity: fin.debtToEquity?.raw,
    fiftyTwoWeekHigh: sum.fiftyTwoWeekHigh?.raw,
    fiftyTwoWeekLow: sum.fiftyTwoWeekLow?.raw,
    marketCap,
    profile,
    sector: profile.sector,
    industry: profile.industry,
    website: profile.website,
    fullTimeEmployees: profile.fullTimeEmployees,
  };
}

function emptyResult(tickerSym, name, currency, action_hint) {
  return {
    symbol: tickerSym,
    name: name || tickerSym,
    currency,
    current_price: null,
    change_pct_1d: null,
    signals: {},
    score: 0,
    verdict: "No data",
    action_hint,
    reasons: [],
    warnings: [...BASE_WARNINGS],
    company: {},
    search_note: null,
  };
}

export async function analyzeSymbol(symbol, market = "IN", opts = {}) {
  if (symbol.trim().toUpperCase() === "DEMO") {
    const { close, volume } = demoHistory();
    const max = Math.max(...close);
    const min = Math.min(...close);
    const out = analyzeFromHist(
      "DEMO.NS",
      "Demo Industries (synthetic)",
      "INR",
      close,
      volume,
      {
        trailingPE: 22.5,
        profitMargins: 0.12,
        fiftyTwoWeekHigh: max,
        fiftyTwoWeekLow: min,
      },
      ["Using synthetic demo data — not a real company."]
    );
    out.signals.history = close.slice(-120).map((c, i) => ({
      date: `d${i}`,
      close: Math.round(c * 100) / 100,
    }));
    out.company = {
      sector: "Technology (demo)",
      industry: "Software",
      exchange: "NSE (synthetic)",
      market_cap: "—",
      about: "Synthetic data for learning the screen layout. Use a real name like Infosys for live facts.",
    };
    out.search_note = null;
    return out;
  }

  let resolved;
  let tickerSym;
  if (opts.tickerSym) {
    tickerSym = opts.tickerSym;
    resolved = { name: opts.name || null, matchedBy: "picker" };
  } else {
    resolved = await resolveToTicker(symbol, market);
    if (!resolved) {
      return emptyResult(
        symbol,
        symbol,
        market.toUpperCase() === "IN" ? "INR" : "USD",
        `No listed stock found for “${symbol.trim()}”. Try full name (e.g. Tata Consultancy) or NSE code (TCS).`
      );
    }
    tickerSym = resolved.symbol === "DEMO" ? "DEMO.NS" : resolved.symbol;
  }

  const searchNote =
    resolved.matchedBy === "search"
      ? `Matched “${symbol.trim()}” → ${tickerSym}`
      : resolved.matchedBy === "picker" && resolved.name
        ? `${resolved.name} (${tickerSym})`
        : null;

  let chart;
  try {
    chart = await fetchYahooChart(tickerSym);
  } catch (e) {
    return {
      ...emptyResult(
        tickerSym,
        resolved.name || tickerSym,
        market.toUpperCase() === "IN" ? "INR" : "USD",
        `${e.message || "Fetch failed"} — try DEMO or mobile data.`
      ),
      search_note: searchNote,
    };
  }

  let info = {};
  try {
    info = await fetchYahooSummary(tickerSym);
  } catch {
    info = {};
  }

  const name = info.shortName || info.longName || chart.meta.shortName || tickerSym;
  const currency =
    info.currency || chart.meta.currency || (market.toUpperCase() === "IN" ? "INR" : "USD");

  const merged = applyLivePrices(chart.close, chart.volume, chart.dateLabels, chart.meta);
  if (merged.close.length < 30) {
    return {
      ...emptyResult(
        tickerSym,
        name,
        currency,
        "Not enough price history — try another name or symbol."
      ),
      search_note: searchNote,
    };
  }

  const out = analyzeFromHist(tickerSym, name, currency, merged.close, merged.volume, info, []);
  const start = Math.max(0, merged.close.length - 120);
  out.signals.history = merged.close.slice(start).map((c, i) => ({
    date: merged.dateLabels[start + i] || `d${i}`,
    close: Math.round(c * 100) / 100,
  }));
  overlayLiveOnResult(out, chart.meta, currency);
  out.company = buildCompanyBlock(info, {
    exchangeName: info.exchange || chart.meta?.exchangeName,
  });
  out.search_note = searchNote;
  out.ticker_sym = tickerSym;
  return out;
}