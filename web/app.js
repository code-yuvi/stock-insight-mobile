import { POPULAR_IN, analyzeSymbol } from "./analysis.js";

let chartInstance = null;

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

function renderResult(data) {
  document.getElementById("result").classList.remove("hidden");
  document.getElementById("batch").classList.add("hidden");

  document.getElementById("resName").textContent = data.name;
  document.getElementById("resSymbol").textContent = data.symbol;
  document.getElementById("resPrice").textContent = formatPrice(data.current_price, data.currency);

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

  renderMetrics(data.signals);
  renderChart(data.signals.history);

  document.getElementById("reasons").innerHTML = (data.reasons || [])
    .map((r) => `<li>${escapeHtml(r)}</li>`)
    .join("");
  document.getElementById("warnings").innerHTML = (data.warnings || [])
    .map((w) => `<li>${escapeHtml(w)}</li>`)
    .join("");
}

async function analyze(symbol) {
  const market = document.getElementById("market").value;
  const btn = document.getElementById("analyzeBtn");
  btn.disabled = true;
  btn.textContent = "Loading…";
  try {
    const data = await analyzeSymbol(symbol, market);
    renderResult(data);
  } catch (e) {
    alert(e.message || "Analysis failed");
  } finally {
    btn.disabled = false;
    btn.textContent = "Analyze";
  }
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
  if (e.key === "Enter") {
    const sym = e.target.value.trim();
    if (sym) analyze(sym);
  }
});

document.getElementById("scanBtn").addEventListener("click", scanWatchlist);

loadWatchlist();