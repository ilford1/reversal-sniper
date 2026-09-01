# MMT Indicator Development Guide

> **Purpose:** Persistent reference for building / extending MMT (Momentum Trader Terminal)
> indicators in this workspace. Read this instead of re-scanning every `.js` file.
> Compiled from `Delta Candle Pressure.js`, `Reversal Sniper.js`, and `Tape Pulse.js`
> (the three indicators in this folder as of this writing).

---

## 1. Platform Facts

- **MMT = Momentum Trader Terminal.** Indicators are plain **JavaScript files** (`.js`),
  Pine-Script-inspired syntax, loaded into an indicator slot (copy-paste or local folder).
- **Version header:** every script starts with `//@version=2` then `indicator("Name", overlay)`.
- **Execution model:** a main `function onBar(index)` is called once per bar (and on ticks);
  `barIndex()` gives the current bar index; `Series()` objects are **indexed oldest→newest**.
- **Candle/delta model is ATAS-inspired:** `candle.Delta` = aggressive buy volume − aggressive sell volume.
- **Feeds can be missing** (OI / STAT / tape counts). Scripts must degrade gracefully —
  the terminal aborts runtime creation ("Failed to create runtime") if you subscribe to
  a missing feed, so guard with `typeof` checks.

---

## 2. SDK / API Quick Reference (observed in this repo)

### 2.1 Declaration & data

```js
//@version=2
indicator("Delta Candle Pressure", false)        // 2nd arg: overlay (false = own pane)
const candles = subscribe(data.OHLCV)            // main candle feed
```

Candle accessors used: `candles.open()`, `.high()`, `.low()`, `.close()`, `.volume()`,
`.unix()`, `.buyVolume()`, `.sellVolume()`, `.buyCount()`, `.sellCount()`.

Optional feeds (guard before subscribing):

```js
let oiSub = null
if (typeof data !== "undefined" && data && typeof data.OI !== "undefined" && data.OI)
  oiSub = subscribe(data.OI)                     // OI feed: oiSub.close()
let statSub = null
if (typeof data !== "undefined" && data && typeof data.STAT !== "undefined" && data.STAT)
  statSub = subscribe(data.STAT)                 // stats feed: statSub.sellLiq() / buyLiq()
const tapeHasCounts = (typeof candles.buyCount === "function") &&
                      (typeof candles.sellCount === "function")
```

### 2.2 Inputs (UI)

- `input.tab("Label", { key })` — tab section.
- `input.group("Label", { key, collapsible, collapsed })` — collapsible group.
- `input.select("Label", defaultIdx, { key, selectables: [...], description })` — dropdown (values are strings).
- `input.int("Label", default, { key, min, max, onlyIf })`.
- `input.float("Label", default, { key, min, max, onlyIf })`.
- `input.bool("Label", default, { key, onlyIf })`.
- `input.color("Label", "#rrggbb", { key, sameLine, onlyIf })` — `sameLine: true` packs colors on one row.
- Conditional visibility: `onlyIf: input.when("preset", "Custom")` (select value match) or
  `onlyIf: input.whenTrue("show_wick_levels")` (bool true).

### 2.3 Series (numeric history)

```js
const openSeries = Series("dcp.open")            // unique string id per series
openSeries[bar] = candles.open()                 // write at current bar
const prev = openSeries[bar - 1]                 // read any past bar
```

Common pattern: cache OHLCV + computed values every `onBar`, then let confirmation
logic address absolute bars. `unixSeries[bar] = candles.unix()` for x-coordinates.

### 2.4 Rendering

- `plotCandle("name", o, h, l, c, { bodyColor, wickColor, borderColor, showLabel, showValue, forceOverlay })`
  — MMT cannot replace native candles, so this overlays a faithful OHLC copy (`forceOverlay: true`).
- `plotHistogram("name", value, { color, showLabel, showValue })` — pane histogram.
- `plot("name", value, { color, width, style: linestyle.dashed|dotted|solid, showLabel, showValue })` — pane line.
- `Line("key", { x1, y1, x2, y2, color, width, style: linestyle.solid, forceOverlay: true, zIndex })`
  — returns a handle; update via `handle.set({ x2, y2 })`.
- `Marker("key", { x, y, shape: shape.square, size, color, zIndex: 5, forceOverlay: true })` — price-overlay marker.

### 2.5 Colors & scales

- `color.scale([[value, color], ...], { space: color.space.rgb, easing: color.easing.smoothstep })`
  — returns a callable: `pressureScale.sample(percent)` (percent in −100…100).
- `color.transp(color, alpha)` — e.g. `color.transp(color.silver, 50)`.
- Built-ins: `color.silver`, hex strings `"#aa3a37"` (8-digit hex works too, e.g. `"#87879ba0"`).

### 2.6 Alerts

```js
const impulseAlert = alert.define("impulse.extreme", {
  title: "...", description: "...",
  fields: [ { key: "direction", type: "string" }, { key: "price", type: "number" }, ... ]
})
...
impulseAlert.trigger({ direction, price, peak_delta, bars })
```

### 2.7 Context / lifecycle

- `function onBar(index)` — main entry; called on every bar update and realtime tick.
- `context.isNew` — true on new bar (guard heavy logic with `if (!context.isNew) return`).
- `context.isRealtime`, `context.isLast` — realtime & last-bar flags (for alerts).
- `context.tickSize` — tick size (fall back: `context.tickSize || 0.0000001`).
- `timeframe.change("1D")` — true when timeframe crossed a 1-day boundary (used for session reset).

---

## 3. Architecture Patterns (reuse these)

### 3.1 Preset → effective parameters
A `preset` select drives which parameter set is "active". `"Custom"` exposes hidden
inputs; other presets set hard-coded overrides. Declare `let` active params, then an
`if/else` chain over the preset string.

```js
let activeLookback = 240, deltaPeriod = 12
if (preset === "Scalp 1m") { activeLookback = 120; deltaPeriod = 10 }
else if (preset === "Custom") { activeLookback = customAdaptationPeriod; deltaPeriod = customDeltaPeriod }
```

### 3.2 Adaptive scale + hysteresis state machine (the "Delta Candle Pressure" core)
This math is ported **verbatim** into Reversal Sniper — keep both in sync if you change it.

- **Rolling delta:** sliding-window sum of per-bar delta over `deltaPeriod` bars
  (`rollingDelta[bar] = prevRolling + delta[bar] − delta[bar − deltaPeriod]`).
- **Adaptive scale:** 92nd percentile of `|rollingDelta|` over `activeLookback`
  (excluding current bar) × `thresholdMultiplier` (= `100 / sensitivity`), then smoothed
  with an **asymmetric EMA** (fast up, slow down — `0.12` vs `0.025` × speed factor).
- **Entry/exit bands:** entry = Otsu natural split of `|rollingDelta|` clamped between
  68th and 88th percentiles; exit = max(45th percentile, entry × neutralExitRatio),
  also asymmetrically smoothed. Bands are ratios of the adaptive scale, so everything
  is self-normalizing.
- **State machine (`resolveState`):** state ∈ {+1 bull impulse, 0 neutral, −1 bear impulse}.
  Hysteresis: enter an impulse when `|rollingDelta| ≥ entry`; stay while `≥ exit`;
  flip sign directly when the opposite `−entry` is crossed. This prevents whipsaw.

### 3.3 Impulse confirmation (`confirmedImpulse`) + potential extremes (`potentialExtreme`)
An impulse is "confirmed" only after it ends, but Reversal Sniper can also fire **early**
on a *potential* extreme while the impulse is still running. Three paths exist:

- **Historical / backfill** (`confirmedImpulse(bar, false)` — runs on **every** non-live
  bar update, not gated by `context.isNew`): `impulseEnd = bar − 2`, and `state[bar − 1]` must
  differ from `state[impulseEnd]` (a state flip just happened). Marker is anchored at
  the exact extreme bar so markers appear during initial load without needing a reload.
  The dedup guard (`lastAlertedImpulseStart`) ensures one signal per impulse even though
  this path may run repeatedly on the same bar.
- **Live potential extreme** (`potentialExtreme(bar)` — runs on every tick when
  `context.isRealtime && context.isLast`): **no confirmation wait at all.** While an
  impulse is active on the last closed bar, the moment the *forming* bar pushes a NEW
  extreme (higher high for a bull impulse / lower low for a bear impulse), the impulse
  is returned with `extremeBar = bar` (the forming bar). Marker is anchored at the
  current bar → prints mid-bar, no reload. This is the primary live signal.
- **Live state-flip fallback** (`confirmedImpulse(bar, true)` — only runs when the
  potential path found nothing): `impulseEnd = bar − 1`, and the forming bar's
  `state[bar]` must differ — fires when the state machine exits the impulse mid-bar.
  Catches reversals at an **established** extreme (double-top/bottom) where the reversal
  bar itself does not make a new extreme.

All three scan back through contiguous same-state bars for `impulseStart`; require
`length ≥ minImpulseBars` and `peakDelta / adaptiveScale ≥ minImpulseClimax`
(the "climax" filter). Returns `{ start, end, length, state, extremeBar, extremePrice, peakDelta }`
where the extreme is the highest high (bull) / lowest low (bear) inside the impulse.

### 3.4 Line-till-touch emulation
MMT has no native "horizontal line until touch" (ATAS `LineTillTouch`), so the port
manages a `Line` handle array:

```js
let activeLevels = []                                  // { handle, price, side, active, startBar, confirmationBar }
function addLevel(priceBar, price, side, confirmationBar) {
  const handle = Line("wick_" + levelSequence++, { x1: unixSeries[priceBar], y1: price,
    x2: unixSeries[confirmationBar], y2: price, color: wickLevelColor, width: wickLevelWidth,
    style: linestyle.solid, forceOverlay: true, zIndex: 2 })
  activeLevels.push({ handle, price, side, active: true, startBar: priceBar, confirmationBar })
}
function updateActiveLevels(bar) {                     // call EVERY bar (intrabar touches too)
  for (const l of activeLevels) {
    if (!l.active || bar < l.confirmationBar) continue
    l.handle.set({ x2: unixSeries[bar], y2: l.price })
    const touched = l.side > 0 ? highSeries[bar] >= l.price : lowSeries[bar] <= l.price
    if (touched) l.active = false                      // freeze at touch, like LineTillTouch
  }
}
```

### 3.5 Confluence scoring + graceful degradation (Reversal Sniper)
Seven boolean components each contribute to a score:
`tape` (Z-score spike ≥ threshold on trade counts over a 100-bar window), `divergence`
(higher extreme with weaker peak delta), `absorption` (heavy tape into small-range bar
that closes back inside body), `oi` (OI net change ≤ threshold **and** OI peaked before
the extreme then rolled over), `liq` (liquidation flush episode in top Nth percentile
over trailing 200 bars, with a forced-flow share and directional dominance), `wick`
(rejection wick ≥ 28% of range), `level` (prior impulse extreme within N ticks).

- **Anti-double-count:** every enabled component reads a DIFFERENT fact, so each
  contributes ONE independent vote. Tape reads participation frequency (trade-count
  burst, `Z ≥ activeTapeZ` + spike isolation + counter-side count flip); absorption
  reads SIZE and neutrality (total-volume activity floor `Z ≥ activeAbsorptionVolZ`,
  counter-side volume elevation `Z ≥ activeAbsorptionCounterZ`, |delta|/vol ≤ 0.25);
  OI reads positioning (normalized net change + fuel rollover); liq reads forced-flow
  (episode percentile + volume share + directional dominance).
  Since tape is count-based and absorption is volume-based, they no longer share a
  vote. `lastMaxScore` (also the alert's `max_score`) is the honest denominator:
  count of enabled + available components.
- **Cluster gating:** ≥1 Flow component **and** ≥1 Positioning component must pass
  (not just a high total score).
- **Fresh-money veto:** `oiGrowthVeto(impulse)` — if OI grew ≥ `activeOiVetoPct`
  (5 Balanced / 3 Strict / 7 Aggressive) at ANY point across the impulse (peak-based,
  so mid-impulse surges that later retrace are still caught), the signal is suppressed
  regardless of score: new fuel added in the impulse direction is counter-evidence to
  a reversal.
- **Degradation:** a component whose feed is unavailable is treated as disabled —
  its cluster requirement adapts (`flowClusterRequired` / `positioningClusterRequired`
  are computed from enabled+available counts).
- **Dedup + cooldown:** skip if same `impulse.start` already alerted, or if
  `bar − lastSignaledExtremeBar < activeCooldown`.
- Persist `lastScore` + `lastMaxScore` + `lastComponentFlags` so the pane dashboard
  shows the last assessment between setups.

### 3.6 Session-reset series (CVD)
```js
const newSession = bar === 0 || timeframe.change("1D")   // UTC day boundary
cvdSeries[bar] = newSession ? delta : cvdSeries[bar - 1] + delta
```
---

## 4. Indicator Inventory

### `Delta Candle Pressure.js` (base indicator)
Rolling delta candles colored by an adaptive pressure scale; wick-level projections;
session CVD pane.

- **Tabs:** Pressure (preset: Automatic / Scalp 1m / Scalp 5m / Custom + custom adaptation
  params), Candle appearance (5-stop blue→red spectrum: bearish peak / bearish mid / neutral /
  bullish mid / bullish peak), Levels & alerts (wick levels, impulse alerts),
  CVD pane.
- **Outputs:** overlaid pressure candles (`plotCandle`, `forceOverlay`), wick level
  `Line`s (advanced until touched), impulse-extreme `Marker`s, session CVD histogram +
  normalized volume backdrop + zero line in its own pane.
- **Alert:** `impulse.extreme` with `{ direction, price, peak_delta, bars }`.

### `Reversal Sniper.js` (signal indicator)
Re-uses the DCP core math (copied) + adds confluence scoring.

- **Tabs:** Sniper (strictness: Balanced / Strict / Aggressive / Custom + custom
  thresholds; core preset: Automatic / Scalp 1m / Scalp 5m / Custom + custom
  lookback/delta period/adaptation speed/neutral exit ratio), Feeds (flow:
  tape/divergence/absorption; positioning: OI/liq; bonus:
  wick/prior level), Display (marker colors/size, pane dashboard sections + colors),
  Alerts.
- **Outputs:** square markers at confirmed extremes (`forceOverlay`), full pane
  dashboard (delta pressure histogram vs entry/exit bands, state line ±100, score as
  % of the honest max (7 when all components are on), per-component 0/100 bars).
- **Realtime:** potential-extreme path — the forming bar extends the impulse's
  extreme → marker prints **immediately at the current bar**, no reload; the state-flip
  fallback catches established-level reversals mid-bar. No `bar − 2` wait live and no
  per-impulse evaluation guard (every extreme-extending tick is re-scored, so the
  marker fires the moment the score qualifies). The historical `bar − 2` path runs only
  on backfill (`context.isNew && !isLiveBar`) and anchors at the exact extreme bar.
  Dedup via `lastAlertedImpulseStart` + cooldown; fresh-money veto via `oiGrowthVeto`.
- **Alert:** `reversal.sniper` with `{ direction, price, score, max_score, components, impulse_bars, peak_delta_ratio }`.

**Relationship:** Reversal Sniper's core math is a frozen copy of Delta Candle Pressure's
(`sensitivity = 100`, plus preset-dependent `activeLookback`/`deltaPeriod`/`adaptationSpeed`/
`neutralExitRatio`/`minImpulseClimax`). It re-exports the base indicator's core presets
(Automatic / Scalp 1m / Scalp 5m / Custom) as its own "Core preset" selector. If you change
the base's math, port the change to `Reversal Sniper.js` too (or refactor into a shared module).

### `Tape Pulse.js` → Extreme Decay (signal indicator)
A second signal indicator over the same frozen DCP core: scores **exhaustion** (climax
decay) at confirmed impulse extremes, using volume density + order-flow rhythm as setups.

- **Tabs:** Pulse (strictness: Balanced / Strict / Aggressive / Custom + custom
  thresholds: min score, density percentile, rhythm streak multiplier, tape balance,
  max decay half-life, min decay slope, impulse length, cooldown, level tolerance),
  Feeds (core flow cluster: density / rhythm / decay; bonus: wick / prior level),
  Display (marker colors/size, pane dashboard sections + colors), Alerts.
- **Modules:**
  - **Density** = `volume / max(tick, high−low)`, percentile-ranked by **counting**
    over the trailing `activeLookback` window (no sort — `percentileRank`, O(L)); true
    at the impulse's max-density bar (`impulseMaxDensityPct`).
  - **Rhythm** = current delta-sign **streak** ≥ trailing-average streak × multiplier,
    OR |EMA-smoothed tape balance| ≥ threshold (`balanceSeries`, α = 0.33, only when
    `tapeHasCounts`).
  - **Decay** = anchored at `peakDeltaBar` (bar of max |rollingDelta|, added to the
    impulse object — **not** the price `extremeBar` which can lag). Min decay window
    2 bars; requires half-life ≤ max AND normalized slope ≥ min, else false.
- **Gate:** `decayOk && (densityOk || rhythmOk)` — decay (the exhaustion itself) is
  mandatory. `max_score` = enabled components only; presets: Balanced 2 / Strict 3 /
  Aggressive 2 min score.
- **Outputs:** square markers at confirmed extremes (`forceOverlay`), pane dashboard
  (pressure histogram vs entry/exit bands, density % line, streak line, state ±100,
  score histogram, Density/Rhythm/Decay/Wick/Level 0/100 component bars).
- **Alert:** `extreme.decay` with `{ direction, price, density_pct, streak, half_life,
  decay_slope, score, max_score, components }`, realtime-only with `isNew` + dedup +
  cooldown.
- **Core:** same frozen DCP math as Reversal Sniper (`activeLookback = 240`,
  `sensitivity = 100`, `deltaPeriod = 12`, `neutralExitRatio = 0.65`,
  `minImpulseClimax = 0.75`), plus `peakDeltaBar` tracking in `confirmedImpulse`.
- **Notes:** no OI/STAT subscriptions (pure tape). Presets: Balanced 85 pct / 1.5×
  streak / 0.5 balance / half-life 3 / slope 0.15; Strict 90 / 2.0× / 0.6 / 2 / 0.20;
  Aggressive 80 / 1.2× / 0.4 / 4 / 0.10.

### `OI Buildup.js` → OI Buildup S/R (level indicator)
S/R levels derived from **where Open Interest builds**, not price pivots ("use OI to
draw the horizontal lines"). Requires an OI feed (`data.OI`); degrades gracefully to
just the pane (no levels/divergence) without it.

- **Concept (from the Twitter thread):** track cumulative **positive** OI deltas over a
  trailing window. A **buildup base** forms when three things hold on a bar: (1)
  **magnitude** — `cumPos / OI ≥ growth%` (enough OI actually joined); (2) **duration** —
  the window contains ≥ `minAccumBars` genuinely OI-positive bars (kills one-bar spikes);
  (3) **directional purity** — via the **OI×Delta matrix**, the dominant initiator
  (longs adding when ΔOI>0 & delta>0, shorts adding when ΔOI>0 & delta<0) accounts for ≥
  `purity%` of accumulation volume. If neither side reaches purity the accumulation is
  choppy → **no level**. The winning class becomes the level's `baseSide`, and the
  classified deltas become the trapped-pool size (`netLongs` / `netShorts`).
- **Detection (no reset machine):** `checkBuildup(bar)` triggers on the **rising edge**
  (`growthPct` crosses `activeGrowthPct` fresh) and draws the level immediately at the
  **OI-weighted average price** (typical price weighted by per-bar positive OI delta),
  with an `activeWindow` cooldown between levels. `cumPos` is a trailing-window sum, so
  it naturally decays once OI stops building — the next episode re-crosses and draws the
  next level. No finalize/reset state needed.
- **Tabs:** Detection (preset: Balanced / Strict / Aggressive / Custom — window, min OI
  growth %, **base purity %**, **min accumulation bars**, merge tolerance, max levels,
  divergence swing window, min OI Δ%), Levels (support/resistance/latest colors, widths,
  extend/freeze, marker), Signals (divergence: OI/price swing divergence — price HH + OI
  lower high → bearish marker, price LL + OI higher low → bullish; alerts: `oi.buildup`,
  `oi.divergence`, **`oi.offside`**; offside alert threshold %), Display (OI delta pane:
  histogram colored green while a buildup is fresh, raw OI line, zero line; **Offside
  gauge** group: offside % histogram, live L/S ratio line, net longs/shorts split,
  shorts/longs-trapped colors).
- **Offside gauge (latest level only):** `offsidePct = (close − level)/level × 100` —
  price **above** the level = shorts trapped (green, cover fuel), price **below** =
  longs trapped (red, stop fuel). `oi.offside` fires once per fresh crossing of the
  offside threshold (arm below → fire above). Live L/S ratio and netLongs/netShorts
  accumulate from the mark point forward. `checkSwing(bar)` runs on new bars only
  (`cand = bar − window`, needs window forward bars), fires `fireDivergence`
  markers/alerts with `lastDiverged*Bar` dedup.
- **Outputs:** overlaid horizontal `Line`s + square markers (`forceOverlay`), OI delta
  histogram + raw OI line + zero + offside gauge in its own pane.
- **Alerts:** `oi.buildup` `{ side, price, oi_growth_pct, bars }` (fires at detection,
  side = baseSide Longs/Shorts), `oi.offside` `{ side, distance_pct, price, level }`,
  and `oi.divergence` `{ direction, price, div_type }`, all realtime-only
  (`isRealtime && isLast`) with dedup (`lastAlertedLevelBar`, `offsideArmed`,
  `lastDiverged*Bar`).
- **Presets:** Balanced window 24 / growth 2.0% / purity 60% / min 3 bars / merge 6 ticks
  / max 6 levels / div 10 bars / OI Δ 1.5%; Strict 40 / 3.0% / 70% / 5 / 4 / 6 / 12 /
  2.5%; Aggressive 12 / 1.2% / 50% / 2 / 10 / 8 / 8 / 1.0%.

---

## 5. Conventions & Gotchas

- **Unique `key`s** on every input and `Series`/`Marker`/`Line` id — they are the stable
  identifiers MMT uses to persist settings and track objects. `Marker`/`Line` keys must
  be unique per object (the code uses `"snip_" + impulse.start`, `"wick_" + levelSequence`).
- **No native candle replacement:** overlay `plotCandle` and tell users to hide native candles.
- **Feed guards:** always `typeof`-check `data.OI` / `data.STAT` / `buyCount` before subscribing/calling.
- **`isNew` gating:** heavy evaluation (impulse, scoring, levels) runs only on new bars;
  light updates (level advancement, intrabar touches) run every tick. Exception:
  Reversal Sniper's **historical path** (`confirmedImpulse(bar, false)`) runs on **every
  non-live bar update** — not gated by `context.isNew` — so markers appear during
  initial load without needing a chart reload. Dedup (`lastAlertedImpulseStart`) +
  cooldown guarantee one signal per impulse. The **live path** (`context.isRealtime &&
  context.isLast`) runs `potentialExtreme` on every tick — the forming bar pushing a new
  extreme *is* the signal, so there is **no `bar − 2` (or `bar − 1`) confirmation wait**
  in realtime; a state-flip fallback covers established extremes. Every tick that extends
  the extreme is re-scored with the freshest forming-bar data (tape count, wick, …) —
  there is deliberately **no per-impulse "already evaluated" guard**, because the
  forming bar's data is partial early in the bar; dedup is **one signal per impulse**
  (`lastAlertedImpulseStart`) + cooldown.
- **Alerts only in realtime:** wrap `alert.trigger` in `context.isRealtime && context.isLast`.
- **Alerts not duplicated:** track `lastAlertedImpulseStart` to dedupe.
- **Keep file under one indicator per file** (single `indicator()` call, single `onBar`).
- **Style:** section banner comments (`// ============ INPUTS ============`), descriptive
  camelCase names, `input.group` for related params, `input.tab` for feature areas.
- **Safe math:** guard division by zero with `Math.max(0.0000001, …)`, clamp percentages.

---

## 6. Workflow

1. Copy a script into an MMT indicator slot, or load from the local indicators folder.
2. Requires an exchange with OI / liquidation stats feeds for the Positioning cluster
   (e.g. Binance Futures, Bybit); indicator degrades gracefully without them.
3. Verify: no "Failed to create runtime" (usually a missing-feed subscription), alerts
   fire only in realtime, markers/lines render over price (`forceOverlay`).
4. When adding a feature, follow the preset + `onlyIf` input pattern and reuse the
   Series-caching + `onBar` pattern above.

> **Keep this guide updated** as the codebase grows — add new API calls, indicators, and
> pattern changes here so future sessions don't need to re-scan every file.