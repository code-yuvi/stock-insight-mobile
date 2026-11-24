import { POPULAR_IN, analyzeSymbol, suggestStocks } from "./analysis.js";

let chartInstance = null;
let lastAnalysis = null;
let suggestTimer = null;
let suggestionItems = [];
let suggestActive = -1;
let refreshTimer = null;

function formatPrice(value, currency) {
  if (value == null) return "—";
  const sym = currency === "INR" ? "₹" : currency === "USD" ? "$" : "";
  return `${sym}${Number(value).toLocaleString(undefined, { maximumFractionDigits: 2 })}`;
}

function setVerdictClass(card, score) {
  card.classList.remove("bullish", "bearish");
  if (score >= 2) card.classList.add("bullish");
  if (score <= -2) card.classList.add("bearish");
}

function renderMetrics(signals) {
  const el = document.getElementById("metrics");
  const items = [
    ["RSI (14)", signals.rsi14],
    ["SMA 20", signals.sma20],
    ["SMA 50", signals.sma50],
    ["SMA 200", signals.sma200],
    ["MACD hist", signals.macd_hist],
    ["Vol vs 20d", signals.volume_ratio_20d != null ? `${signals.volume_ratio_20d}×` : null],
    ["P/E", signals.trailing_pe],
    ["Margin %", signals.profit_margin_pct],
  ];
  el.innerHTML = items
    .map(
      ([label, val]) =>
        `<div class="metric"><span>${label}</span><strong>${val ?? "—"}</strong></div>`
    )
    .join("");
}

function renderChart(history) {
  const ctx = document.getElementById("priceChart");
  if (chartInstance) chartInstance.destroy();
  if (!history?.length) return;
  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: history.map((h) => h.date),
      datasets: [
        {
          label: "Close",
          data: history.map((h) => h.close),
          borderColor: "#3ddea5",
          backgroundColor: "rgba(61, 222, 165, 0.08)",
          fill: true,
          tension: 0.2,
          pointRadius: 0,
          borderWidth: 2,
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        x: { ticks: { maxTicksLimit: 8, color: "#8fa3b8" }, grid: { color: "#243041" } },
        y: { ticks: { color: "#8fa3b8" }, grid: { color: "#243041" } },
      },
    },
  });
}

function escapeHtml(s) {
  const d = document.createElement("div");
  d.textContent = s;
  return d.innerHTML;
}

function renderCompanyInfo(data) {
  const c = data.company || {};
  const note = document.getElementById("searchNote");
  if (data.search_note) {
    note.textContent = data.search_note;
    note.classList.remove("hidden");
  } else {
    note.textContent = "";
    note.classList.add("hidden");
  }

  const items = [
    ["Sector", c.sector],
    ["Industry", c.industry],
    ["Exchange", c.exchange],
    ["Market cap", c.market_cap],
    ["Employees", c.employees != null ? Number(c.employees).toLocaleString() : null],
    ["52w high", data.signals?.fifty_two_week_high != null ? formatPrice(data.signals.fifty_two_week_high, data.currency) : null],
    ["52w low", data.signals?.fifty_two_week_low != null ? formatPrice(data.signals.fifty_two_week_low, data.currency) : null],
  ];
  document.getElementById("companyMetrics").innerHTML = items
    .map(([label, val]) => `<div class="metric"><span>${label}</span><strong>${val ?? "—"}</strong></div>`)
    .join("");

  const aboutEl = document.getElementById("companyAbout");
  if (c.about) {
    aboutEl.textContent = c.about;
    aboutEl.classList.remove("hidden");
  } else {
    aboutEl.textContent = "";
    aboutEl.classList.add("hidden");
  }
}

function renderResult(data) {
  document.getElementById("result").classList.remove("hidden");
  document.getElementById("batch").classList.add("hidden");

  document.getElementById("resName").textContent = data.name;
  document.getElementById("resSymbol").textContent = data.symbol;
  document.getElementById("resPrice").textContent = formatPrice(data.current_price, data.currency);

  const qt = document.getElementById("resQuoteTime");
  const q = data.quote;
  if (q?.updated_at) {
    qt.textContent = `Live quote · ${q.market_state} · ${q.updated_at}`;
    qt.classList.remove("hidden");
  } else if (data.symbol?.includes("DEMO")) {
    qt.textContent = "Demo data (not live)";
    qt.classList.remove("hidden");
  } else {
    qt.textContent = "";
    qt.classList.add("hidden");
  }

  const ch = document.getElementById("resChange");
  const pct = data.change_pct_1d;
  if (pct != null) {
    ch.textContent = `${pct >= 0 ? "+" : ""}${pct}% (1d)`;
    ch.className = "change " + (pct >= 0 ? "up" : "down");
  } else {
    ch.textContent = "";
  }

  document.getElementById("resVerdict").textContent = data.verdict;
  document.getElementById("resAction").textContent = data.action_hint;
  document.getElementById("resScore").textContent = data.score;
  setVerdictClass(document.getElementById("verdictCard"), data.score);

  renderCompanyInfo(data);
  renderMetrics(data.signals || {});
  renderChart(data.signals.history);

  document.getElementById("reasons").innerHTML = (data.reasons || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");
  document.getElementById("warnings").innerHTML = (data.warnings || [])
    .map((w) => `<li>${escapeHtml(w)}</li>`)
    .join("");
}

function hideSuggestions() {
  const list = document.getElementById("suggestions");
  list.classList.add("hidden");
  list.innerHTML = "";
  suggestionItems = [];
  suggestActive = -1;
  document.getElementById("symbol").setAttribute("aria-expanded", "false");
}

function renderSuggestions(items) {
  const list = document.getElementById("suggestions");
  const input = document.getElementById("symbol");
  suggestionItems = items;
  if (!items.length) {
    hideSuggestions();
    return;
  }
  list.innerHTML = items
    .map(
      (item, i) =>
        `<li role="option" data-idx="${i}" class="suggestion-item${i === suggestActive ? " active" : ""}">
          <strong>${escapeHtml(item.name)}</strong>
          <span>${escapeHtml(item.symbol)} · ${escapeHtml(item.exchange || "")}</span>
        </li>`
    )
    .join("");
  list.classList.remove("hidden");
  input.setAttribute("aria-expanded", "true");
  list.querySelectorAll(".suggestion-item").forEach((el) => {
    el.addEventListener("mousedown", (e) => {
      e.preventDefault();
      pickSuggestion(Number(el.dataset.idx));
    });
  });
}

function pickSuggestion(idx) {
  const item = suggestionItems[idx];
  if (!item) return;
  hideSuggestions();
  document.getElementById("symbol").value = item.name;
  runAnalyze(item.name, { tickerSym: item.symbol, name: item.name });
}

async function runAnalyze(symbol, opts = {}) {
  const market = document.getElementById("market").value;
  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.textContent = "Loading…";
  hideSuggestions();
  try {
    const data = await analyzeSymbol(symbol, market, opts);
    renderResult(data);
    lastAnalysis = {
      query: symbol,
      market,
      tickerSym: data.ticker_sym || opts.tickerSym || null,
      name: data.name || opts.name || null,
    };
  } catch (e) {
    alert(e.message || "Analysis failed");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze";
  }
}

async function analyze(symbol, opts = {}) {
  await runAnalyze(symbol, opts);
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(() => {
    if (lastAnalysis) refreshLive();
  }, 90000);
}

async function refreshLive() {
  if (!lastAnalysis) return;
  const btn = document.getElementById("refreshBtn");
  btn.disabled = true;
  btn.textContent = "Refreshing…";
  try {
    const { query, market, tickerSym, name } = lastAnalysis;
    const data = await analyzeSymbol(query, market, tickerSym ? { tickerSym, name } : {});
    renderResult(data);
    lastAnalysis.tickerSym = data.ticker_sym || tickerSym;
  } finally {
    btn.disabled = false;
    btn.textContent = "Refresh price";
  }
}

function setupAutocomplete() {
  const input = document.getElementById("symbol");
  const list = document.getElementById("suggestions");

  input.addEventListener("input", () => {
    clearTimeout(suggestTimer);
    const q = input.value;
    if (!q.trim()) {
      hideSuggestions();
      return;
    }
    suggestTimer = setTimeout(async () => {
      const market = document.getElementById("market").value;
      const items = await suggestStocks(q, market);
      suggestActive = -1;
      renderSuggestions(items);
    }, 200);
  });

  input.addEventListener("keydown", (e) => {
    if (list.classList.contains("hidden")) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      suggestActive = Math.min(suggestActive + 1, suggestionItems.length - 1);
      renderSuggestions(suggestionItems);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      suggestActive = Math.max(suggestActive - 1, 0);
      renderSuggestions(suggestionItems);
    } else if (e.key === "Enter" && suggestActive >= 0) {
      e.preventDefault();
      pickSuggestion(suggestActive);
    } else if (e.key === "Escape") {
      hideSuggestions();
    }
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".search-wrap")) hideSuggestions();
  });

  document.getElementById("market").addEventListener("change", () => {
    const q = input.value.trim();
    if (q.length >= 1) {
      suggestStocks(q, document.getElementById("market").value).then(renderSuggestions);
    }
  });
}

function loadWatchlist() {
  const box = document.getElementById("watchlist");
  box.innerHTML = POPULAR_IN.map(
    (s) => `<button type="button" class="chip" data-symbol="${s.symbol}">${s.label}</button>`
  ).join("");
  box.querySelectorAll(".chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      document.getElementById("symbol").value = chip.dataset.symbol;
      analyze(chip.dataset.symbol);
    });
  });
}

async function scanWatchlist() {
  const btn = document.getElementById("scanBtn");
  btn.disabled = true;
  btn.textContent = "Scanning…";
  const panel = document.getElementById("batch");
  panel.classList.remove("hidden");
  const rows = [];
  try {
    for (const s of POPULAR_IN) {
      const r = await analyzeSymbol(s.symbol, "IN");
      if (r.current_price != null) rows.push(r);
    }
    rows.sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
    document.getElementById("batchTable").innerHTML = `
      <table>
        <thead><tr><th>Symbol</th><th>Price</th><th>Score</th><th>View</th></tr></thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td><button type="button" class="chip link" data-sym="${r.symbol.split(".")[0]}">${r.symbol}</button></td>
                <td>${formatPrice(r.current_price, r.currency)}</td>
                <td>${r.score}</td>
                <td>${escapeHtml(r.verdict)}</td>
              </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <p class="muted">Sorted by rule score — not a recommendation list.</p>
    `;
    document.querySelectorAll("#batchTable .link").forEach((b) => {
      b.addEventListener("click", () => {
        document.getElementById("symbol").value = b.dataset.sym;
        analyze(b.dataset.sym);
      });
    });
  } finally {
    btn.disabled = false;
    btn.textContent = "Scan watchlist";
  }
}

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js").catch(() => {});
}

document.getElementById("analyzeBtn").addEventListener("click", () => {
  const sym = document.getElementById("symbol").value.trim();
  if (sym) analyze(sym);
});

document.getElementById("symbol").addEventListener("keydown", (e) => {
  if (e.key === "Enter" && suggestActive < 0) {
    const sym = e.target.value.trim();
    if (sym) analyze(sym);
  }
});

document.getElementById("refreshBtn").addEventListener("click", () => refreshLive());
document.getElementById("scanBtn").addEventListener("click", scanWatchlist);

setupAutocomplete();
loadWatchlist();