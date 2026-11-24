# Stock Insight (educational)

Local web app that fetches **public** price data (via Yahoo Finance), computes common indicators (RSI, moving averages, MACD), and shows a **rule-based educational bias** — not guaranteed buy/sell timing.

## Phone only — no PC (recommended)

Analysis runs **in the phone browser**. You do **not** need your PC or home Wi‑Fi.

### One-time publish

```powershell
cd "c:\MyProject\MyWork\stock-insight"
.\publish-mobile.ps1
```

The script prints a link like **`https://YOUR_USER.github.io/stock-insight-mobile/`**. Open it on your phone in Chrome or Safari, then **Add to Home screen** for an app-like icon.

| Tip | |
|-----|---|
| Office Wi‑Fi blocks Yahoo | Try **mobile data** or symbol **`DEMO`** |
| Updates after you edit `web/` | Run `.\publish-mobile.ps1` again |

---

## Run on PC (optional dev server)

```powershell
cd "c:\MyProject\MyWork\stock-insight"
.\start.ps1
```

Then open **http://127.0.0.1:8765** on the same PC (uses Python + `yfinance`).

You can also preview the mobile build locally:

```powershell
cd web
python -m http.server 8765
```

Open **http://127.0.0.1:8765** — good for testing before publish.

---

## Symbols

- India: `RELIANCE`, `TCS` (auto `.NS` for NSE)
- US: set market to US and use `AAPL`, `MSFT`
- Offline / test UI: `DEMO`

## Limits

- Data can be delayed or wrong; always cross-check NSE/BSE and annual reports.
- No tool replaces learning fundamentals or registered advice.
- The mobile version is a **PWA website**, not a Play Store / App Store app.