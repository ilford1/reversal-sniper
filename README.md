# Reversal Sniper

MMT (Momentum Trader Terminal) indicator scripts for detecting high-confluence
reversal zones at delta-pressure impulse extremes.

## Files

### `OI Buildup.js`

**OI Buildup S/R** — builds dynamic support/resistance levels from **where Open
Interest builds**, not from price pivots. A **buildup base** qualifies on three
conditions: **magnitude** (cumulative positive OI delta / OI ≥ growth %), **duration**
(at least `minAccumBars` genuinely OI-positive bars), and **directional purity**
(an OI×Delta matrix classification: the dominant initiator — longs adding vs shorts
adding — must account for ≥ `purity%` of accumulation volume, or no level is drawn).

Detection is a rising edge with no reset machine: when growth freshly crosses the
threshold a level is drawn immediately at the **OI-weighted average price**. The
winning matrix class becomes the level's `baseSide`, and the classified deltas size
the trapped pool (`netLongs` / `netShorts` + L/S ratio). Levels are colored
support/resistance dynamically, the latest buildup is highlighted in gold, and an
**offside gauge** tracks the latest level's distance from price (price above = shorts
trapped, below = longs trapped) with live L/S and net-longs/shorts readouts. Alerts:
`oi.buildup`, `oi.offside`, and OI/price divergence (`oi.divergence`). Requires an OI
feed (Binance Futures, Bybit); degrades gracefully without it.

### `Reversal Sniper.js`

Flags confirmed impulse extremes (delta-pressure state flips) and scores them
against a confluence cluster:

- **Flow cluster** — tape speed Z-score spike, delta divergence, absorption
- **Positioning cluster** — open interest non-confirmation, liquidation flush
- **Bonus** — rejection wick, prior level confluence

Fires a square marker at the extreme price and an alert with the full score
breakdown. Presets: Balanced / Strict / Aggressive / Custom.

### `Delta Candle Pressure.js`

Base indicator: rolling delta candles colored by adaptive pressure scale
(Otsu natural split + percentile rails, smoothed with asymmetric EMA),
crypto-friendly session CVD, and wick-level projections until touched.

## Usage

Copy the script into an MMT indicator, or load it from the local indicators
folder. Requires an exchange with OI / liquidation stats feeds for the
positioning cluster; the indicator degrades gracefully if feeds are missing.
