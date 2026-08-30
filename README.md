# Reversal Sniper

MMT (Momentum Trader Terminal) indicator scripts for detecting high-confluence
reversal zones at delta-pressure impulse extremes.

## Files

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
