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

async function fetchYahooChart(tickerSym) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
    tickerSym
  )}?interval=1d&range=1y&includePrePost=false`;
  const res = await fetch(url);
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
  const modules = "summaryDetail,financialData,defaultKeyStatistics,price";
  const url = `https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(
    tickerSym
  )}?modules=${modules}`;
  const res = await fetch(url);
  if (!res.ok) return {};
  const body = await res.json();
  const r = body?.quoteSummary?.result?.[0] || {};
  const fin = r.financialData || {};
  const sum = r.summaryDetail || {};
  const stat = r.defaultKeyStatistics || {};
  const price = r.price || {};
  return {
    shortName: price.shortName || price.longName,
    longName: price.longName,
    currency: price.currency,
    trailingPE: sum.trailingPE?.raw ?? stat.trailingPE?.raw,
    forwardPE: sum.forwardPE?.raw,
    profitMargins: fin.profitMargins?.raw,
    debtToEquity: fin.debtToEquity?.raw,
    fiftyTwoWeekHigh: sum.fiftyTwoWeekHigh?.raw,
    fiftyTwoWeekLow: sum.fiftyTwoWeekLow?.raw,
  };
}

export async function analyzeSymbol(symbol, market = "IN") {
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
    return out;
  }

  const tickerSym = normalizeSymbol(symbol, market);
  let chart;
  try {
    chart = await fetchYahooChart(tickerSym);
  } catch (e) {
    return {
      symbol: tickerSym,
      name: tickerSym,
      currency: market.toUpperCase() === "IN" ? "INR" : "USD",
      current_price: null,
      change_pct_1d: null,
      signals: {},
      score: 0,
      verdict: "No data",
      action_hint: `${e.message || "Fetch failed"} — try DEMO on slow networks.`,
      reasons: [],
      warnings: [...BASE_WARNINGS],
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

  if (chart.close.length < 30) {
    return {
      symbol: tickerSym,
      name,
      currency,
      current_price: null,
      change_pct_1d: null,
      signals: {},
      score: 0,
      verdict: "No data",
      action_hint: "Cannot analyze — check symbol (e.g. RELIANCE, AAPL) or try DEMO.",
      reasons: [],
      warnings: [...BASE_WARNINGS],
    };
  }

  const out = analyzeFromHist(tickerSym, name, currency, chart.close, chart.volume, info, []);
  const start = Math.max(0, chart.close.length - 120);
  out.signals.history = chart.close.slice(start).map((c, i) => ({
    date: chart.dateLabels[start + i] || `d${i}`,
    close: Math.round(c * 100) / 100,
  }));
  return out;
}