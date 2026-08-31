# Reversal Sniper

MMT (Momentum Trader Terminal) indicator scripts for detecting high-confluence
reversal zones at delta-pressure impulse extremes.

## Files

### `OI Buildup.js`

**OI Buildup S/R** — builds dynamic support/resistance levels from **where Open
Interest builds**, not from price pivots. When cumulative positive OI delta over the
trailing window crosses the growth threshold, a *buildup zone* starts; when the growth
"resets" below the exit ratio, the zone finalizes into a horizontal level at the
**OI-weighted average price**. Levels are colored support/resistance dynamically by
the current price position, the latest buildup is highlighted in gold, and OI/price
divergence (price HH with OI lower high, price LL with OI higher low) is flagged with
markers and alerts. Requires an OI feed (Binance Futures, Bybit); degrades gracefully
without it.

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
