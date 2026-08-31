//@version=2
indicator("Reversal Sniper", false)

// ============================================================
// INPUTS
// ============================================================

input.tab("Sniper", { key: "sniper_tab" })

const strictness = input.select("Strictness", 0, {
  key: "strictness",
  selectables: ["Balanced", "Strict", "Aggressive", "Custom"],
  description: "Balanced = moderate / Strict = fewer, higher-conviction / Aggressive = more signals. Custom exposes all thresholds."
})

input.group("Custom thresholds", {
  key: "custom_thresholds",
  collapsible: true,
  collapsed: true
})

const customMinScore = input.int("Minimum score", 3, {
  key: "min_score", min: 1, max: 7,
  onlyIf: input.when("strictness", "Custom")
})
const customTapeZ = input.float("Tape speed Z-score", 2.0, {
  key: "tape_z", min: 0.5, max: 5.0,
  onlyIf: input.when("strictness", "Custom")
})
const customOiThreshold = input.float("OI max change %", 0.5, {
  key: "oi_threshold", min: 0.1, max: 5.0,
  onlyIf: input.when("strictness", "Custom")
})
const customOiVetoPct = input.float("OI growth veto %", 5.0, {
  key: "oi_veto_pct", min: 1.0, max: 20.0,
  onlyIf: input.when("strictness", "Custom")
})
const customLiqPercentile = input.int("Liquidation percentile", 95, {
  key: "liq_percentile", min: 80, max: 100,
  onlyIf: input.when("strictness", "Custom")
})
const customImpulseLength = input.int("Min impulse length", 2, {
  key: "impulse_length", min: 1, max: 20,
  onlyIf: input.when("strictness", "Custom")
})
const customCooldown = input.int("Cooldown bars", 10, {
  key: "cooldown", min: 1, max: 100,
  onlyIf: input.when("strictness", "Custom")
})
const customLevelTolerance = input.int("Level tolerance ticks", 10, {
  key: "level_tolerance", min: 1, max: 100,
  onlyIf: input.when("strictness", "Custom")
})

input.tab("Feeds", { key: "feeds_tab" })

input.group("Flow cluster", {
  key: "flow_group",
  collapsible: true,
  collapsed: false
})

const useTape = input.bool("Tape speed spike", true, { key: "use_tape" })
const useDivergence = input.bool("Delta divergence", true, { key: "use_divergence" })
const useAbsorption = input.bool("Absorption", true, { key: "use_absorption" })

input.group("Positioning cluster", {
  key: "positioning_group",
  collapsible: true,
  collapsed: false
})

const useOi = input.bool("Open interest non-confirmation", true, { key: "use_oi" })
const useLiq = input.bool("Liquidation flush", true, { key: "use_liq" })

input.group("Bonus", {
  key: "bonus_group",
  collapsible: true,
  collapsed: false
})

const useWick = input.bool("Rejection wick", true, { key: "use_wick" })
const usePriorLevel = input.bool("Prior level confluence", true, { key: "use_prior_level" })

input.tab("Display", { key: "display_tab" })

const bullishMarkerColor = input.color("Bullish reversal", "#00c853", { key: "bullish_color" })
const bearishMarkerColor = input.color("Bearish reversal", "#d50000", { key: "bearish_color" })
const markerSize = input.int("Marker size", 6, { key: "marker_size", min: 2, max: 12 })

input.group("Pane display", {
  key: "pane_display_group",
  collapsible: true,
  collapsed: false
})

const showPaneDashboard = input.bool("Show pane dashboard", true, {
  key: "pane_show",
  description: "Master toggle for the entire dashboard in the script's own pane (delta pressure, bands, state, score, component bars)."
})
const showPressureSection = input.bool("Show pressure histogram + bands", true, {
  key: "pane_show_pressure",
  onlyIf: input.whenTrue("pane_show")
})
const showSignalSection = input.bool("Show signal status (state / score / components)", true, {
  key: "pane_show_signal",
  onlyIf: input.whenTrue("pane_show")
})
const showComponentBars = input.bool("Show component trigger bars", true, {
  key: "pane_show_components",
  onlyIf: input.whenTrue("pane_show_signal")
})

const entryBandColor = input.color("Entry band color", "#8787a0", {
  key: "pane_entry_color",
  onlyIf: input.whenTrue("pane_show_pressure")
})
const exitBandColor = input.color("Exit band color", "#5a5a70", {
  key: "pane_exit_color",
  onlyIf: input.whenTrue("pane_show_pressure")
})
const zeroLineColor = input.color("Zero line color", "#888888", {
  key: "pane_zero_color",
  onlyIf: input.whenTrue("pane_show_pressure")
})
const stateNeutralColor = input.color("State neutral color", "#5a5a70", {
  key: "pane_state_color",
  onlyIf: input.whenTrue("pane_show_signal")
})
const scoreColor = input.color("Score histogram color", "#ab47bc", {
  key: "pane_score_color",
  onlyIf: input.whenTrue("pane_show_signal")
})

input.group("Component bar colors", {
  key: "pane_component_colors_group",
  collapsible: true,
  collapsed: true
})

const tapeBarColor = input.color("Tape", "#4fc3f7", { key: "pane_tape_color" })
const divergenceBarColor = input.color("Divergence", "#ba68c8", { key: "pane_div_color" })
const absorptionBarColor = input.color("Absorption", "#ffb74d", { key: "pane_abs_color" })
const oiBarColor = input.color("OI", "#81c784", { key: "pane_oi_color" })
const liqBarColor = input.color("Liq", "#f06292", { key: "pane_liq_color" })
const wickBarColor = input.color("Wick", "#9575cd", { key: "pane_wick_color" })
const levelBarColor = input.color("Level", "#aed581", { key: "pane_level_color" })

input.tab("Alerts", { key: "alerts_tab" })

const enableAlerts = input.bool("Enable alerts", true, { key: "enable_alerts" })

const reversalAlert = alert.define("reversal.sniper", {
  title: "Reversal Sniper",
  description: "High-confluence reversal signal at confirmed impulse extreme.",
  fields: [
    { key: "direction", type: "string" },
    { key: "price", type: "number" },
    { key: "score", type: "number" },
    { key: "max_score", type: "number" },
    { key: "components", type: "string" },
    { key: "impulse_bars", type: "number" },
    { key: "peak_delta_ratio", type: "number" }
  ]
})

// ============================================================
// PRESET-DERIVED PARAMETERS
// ============================================================

let activeMinScore = 3
let activeTapeZ = 2.0
let activeOiThreshold = 0.5
let activeOiVetoPct = 5.0
let activeLiqPercentile = 95
let activeMinImpulseLength = 2
let activeCooldown = 10
let activeLevelTolerance = 10

if (strictness === "Balanced") {
  // defaults — keep as-is
} else if (strictness === "Strict") {
  activeMinScore = 4
  activeTapeZ = 2.5
  activeOiThreshold = 0.3
  activeOiVetoPct = 3.0
  activeLiqPercentile = 97
  activeMinImpulseLength = 5
  activeCooldown = 15
  activeLevelTolerance = 5
} else if (strictness === "Aggressive") {
  activeMinScore = 2
  activeTapeZ = 1.5
  activeOiThreshold = 1.0
  activeOiVetoPct = 7.0
  activeLiqPercentile = 90
  activeCooldown = 8
  activeLevelTolerance = 15
} else if (strictness === "Custom") {
  activeMinScore = customMinScore
  activeTapeZ = customTapeZ
  activeOiThreshold = customOiThreshold
  activeOiVetoPct = customOiVetoPct
  activeLiqPercentile = customLiqPercentile
  activeMinImpulseLength = customImpulseLength
  activeCooldown = customCooldown
  activeLevelTolerance = customLevelTolerance
}

// ============================================================
// PORTED DELTA CANDLE PRESSURE CORE MATH
// ============================================================
// These functions replicate the base "Delta Candle Pressure" indicator's
// adaptive scale, hysteresis state machine, and impulse detection exactly,
// so reversal signals only fire at the same impulse extremes the base
// indicator would confirm.

const activeLookback = 240
const activeSensitivity = 100
const deltaPeriod = 12
const adaptationSpeed = 1.0
const neutralExitRatio = 0.65
const minImpulseClimax = 0.75

const thresholdMultiplier = 100 / activeSensitivity
const scalePercentile = 0.92
const entryFloorPercentile = 0.68
const entryCeilingPercentile = 0.88
const exitFloorPercentile = 0.45

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function isFiniteNumber(value) {
  // NaN fails value === value; ±Infinity fall outside the double range.
  return typeof value === "number" && value === value &&
         value < 1.7976931348623157e308 && value > -1.7976931348623157e308
}

function percentile(sortedSamples, p) {
  if (sortedSamples.length === 0) return 0
  let i = Math.ceil((sortedSamples.length - 1) * p)
  i = clamp(i, 0, sortedSamples.length - 1)
  return sortedSamples[i]
}

function otsuThreshold(sortedSamples) {
  if (sortedSamples.length < 2) {
    return sortedSamples.length === 0 ? 0 : sortedSamples[0]
  }
  let total = 0
  for (let i = 0; i < sortedSamples.length; i++) total += sortedSamples[i]
  let leftSum = 0
  let bestScore = -1
  let bestThreshold = sortedSamples[Math.floor(sortedSamples.length / 2)]
  for (let i = 1; i < sortedSamples.length; i++) {
    leftSum += sortedSamples[i - 1]
    if (sortedSamples[i] === sortedSamples[i - 1]) continue
    const leftCount = i
    const rightCount = sortedSamples.length - i
    const leftMean = leftSum / leftCount
    const rightMean = (total - leftSum) / rightCount
    const difference = leftMean - rightMean
    const score = leftCount * rightCount * difference * difference
    if (score > bestScore) {
      bestScore = score
      bestThreshold = (sortedSamples[i - 1] + sortedSamples[i]) / 2
    }
  }
  return bestThreshold
}

function smoothScale(previous, target) {
  if (!(previous > 0)) return target
  const speed = clamp((240 / activeLookback) * adaptationSpeed, 0.5, 2.0)
  const alpha = target > previous ? 0.12 * speed : 0.025 * speed
  return previous + (target - previous) * alpha
}

function smoothThreshold(previous, target) {
  if (!(previous > 0)) return target
  const speed = clamp((240 / activeLookback) * adaptationSpeed, 0.5, 2.0)
  const alpha = target > previous ? 0.10 * speed : 0.03 * speed
  return previous + (target - previous) * alpha
}

function percentileScale(bar) {
  if (bar === 0) return Math.max(1, Math.abs(rollingDeltaSeries[bar]))
  const first = Math.max(0, bar - activeLookback)
  const samples = []
  for (let i = first; i < bar; i++) samples.push(Math.abs(rollingDeltaSeries[i]))
  samples.sort((a, b) => a - b)
  return Math.max(1, percentile(samples, scalePercentile))
}

function neutralTargets(bar, adaptiveScale) {
  const first = Math.max(0, bar - activeLookback)
  const count = bar - first
  if (count < 20) {
    const entry = Math.max(0.0000001, adaptiveScale * 0.55)
    return { entry, exit: entry * 0.55 }
  }
  const samples = []
  for (let i = first; i < bar; i++) samples.push(Math.abs(rollingDeltaSeries[i]))
  samples.sort((a, b) => a - b)
  const naturalSplit = otsuThreshold(samples)
  const lowerRail = percentile(samples, entryFloorPercentile)
  const upperRail = percentile(samples, entryCeilingPercentile)
  const rawEntry = Math.max(lowerRail, Math.min(upperRail, naturalSplit))
  const entry = Math.max(0.0000001, rawEntry * thresholdMultiplier)
  const lowerExitRail = percentile(samples, exitFloorPercentile)
  let rawExit = Math.max(lowerExitRail, rawEntry * neutralExitRatio)
  rawExit = Math.min(rawEntry, rawExit)
  const exit = Math.max(0.0000001, rawExit * thresholdMultiplier)
  return { entry, exit }
}


function resolveState(bar, rollingDelta, entry, exit) {
  const previousState = bar === 0 ? 0 : stateSeries[bar - 1]
  if (previousState > 0) {
    if (rollingDelta <= -entry) return -1
    return rollingDelta >= exit ? 1 : 0
  }
  if (previousState < 0) {
    if (rollingDelta >= entry) return 1
    return rollingDelta <= -exit ? -1 : 0
  }
  if (rollingDelta >= entry) return 1
  if (rollingDelta <= -entry) return -1
  return 0
}

function medianCandleRange(bar, lookback) {
  const first = Math.max(0, bar - lookback)
  const samples = []
  for (let i = first; i < bar; i++) samples.push(highSeries[i] - lowSeries[i])
  if (samples.length === 0) return Math.max(0.0000001, highSeries[bar] - lowSeries[bar])
  samples.sort((a, b) => a - b)
  return percentile(samples, 0.50)
}

function confirmedImpulse(bar, live) {
  // Historical: impulse ends at bar-2, confirmed by the closed bar bar-1.
  // Live: impulse ends at the last closed bar (bar-1), confirmed by the
  // forming bar's state — fires the moment the state machine flips mid-bar.
  if (bar < (live ? 1 : 2)) return null
  const impulseEnd = live ? bar - 1 : bar - 2
  const impulseState = stateSeries[impulseEnd]
  const confirmationState = live ? stateSeries[bar] : stateSeries[bar - 1]
  if (impulseState === 0 || confirmationState === impulseState) return null

  let impulseStart = impulseEnd
  while (impulseStart > 0 && stateSeries[impulseStart - 1] === impulseState) {
    impulseStart--
  }

  const length = impulseEnd - impulseStart + 1
  if (length < activeMinImpulseLength) return null

  let peakDelta = 0
  for (let i = impulseStart; i <= impulseEnd; i++) {
    peakDelta = Math.max(peakDelta, Math.abs(rollingDeltaSeries[i]))
  }
  const scale = Math.max(1, adaptiveScaleSeries[impulseEnd])
  if (peakDelta / scale < minImpulseClimax) return null

  let extremeBar = impulseStart
  let extremePrice = impulseState > 0 ? highSeries[impulseStart] : lowSeries[impulseStart]
  for (let i = impulseStart + 1; i <= impulseEnd; i++) {
    const candidate = impulseState > 0 ? highSeries[i] : lowSeries[i]
    if ((impulseState > 0 && candidate >= extremePrice) ||
        (impulseState < 0 && candidate <= extremePrice)) {
      extremePrice = candidate
      extremeBar = i
    }
  }

  return {
    extremeBar,
    extremePrice,
    state: impulseState,
    start: impulseStart,
    end: impulseEnd,
    length,
    peakDelta
  }
}

function potentialExtreme(bar) {
  // Live only: detects a *potential* extreme as it forms, with NO bar-2 (or
  // bar-1) confirmation wait. Requires an active impulse on the last closed
  // bar and a forming bar that pushes a NEW extreme (higher high for a bull
  // impulse, lower low for a bear impulse). Returns the same impulse shape as
  // confirmedImpulse so the shared scoring/fire logic can process it.
  if (bar < 1) return null
  const impulseState = stateSeries[bar - 1]
  if (impulseState === 0) return null

  let impulseStart = bar - 1
  while (impulseStart > 0 && stateSeries[impulseStart - 1] === impulseState) {
    impulseStart--
  }

  // Prior extreme across the closed bars [impulseStart .. bar-1]
  let priorExtreme = impulseState > 0 ? highSeries[impulseStart] : lowSeries[impulseStart]
  for (let i = impulseStart + 1; i <= bar - 1; i++) {
    const candidate = impulseState > 0 ? highSeries[i] : lowSeries[i]
    if ((impulseState > 0 && candidate >= priorExtreme) ||
        (impulseState < 0 && candidate <= priorExtreme)) {
      priorExtreme = candidate
    }
  }

  // Forming bar must set a new extreme beyond the prior one
  const liveExtreme = impulseState > 0 ? highSeries[bar] : lowSeries[bar]
  if (!isFiniteNumber(liveExtreme)) return null
  const isNewExtreme = impulseState > 0
    ? liveExtreme > priorExtreme
    : liveExtreme < priorExtreme
  if (!isNewExtreme) return null

  const length = bar - impulseStart + 1
  if (length < activeMinImpulseLength) return null

  let peakDelta = 0
  for (let i = impulseStart; i <= bar; i++) {
    peakDelta = Math.max(peakDelta, Math.abs(rollingDeltaSeries[i]))
  }
  const scale = Math.max(1, adaptiveScaleSeries[bar])
  if (peakDelta / scale < minImpulseClimax) return null

  return {
    extremeBar: bar,
    extremePrice: liveExtreme,
    state: impulseState,
    start: impulseStart,
    end: bar,
    length,
    peakDelta
  }
}

// ============================================================
// NEW REVERSAL COMPONENT FUNCTIONS
// ============================================================

function rollingMeanStd(series, bar, lookback) {
  // Returns { mean, std } over window [bar - lookback, bar - 1], excluding current bar.
  const first = Math.max(0, bar - lookback)
  let sum = 0, sumSq = 0, count = 0
  for (let i = first; i < bar; i++) {
    const v = series[i]
    if (isFiniteNumber(v)) {
      sum += v
      sumSq += v * v
      count++
    }
  }
  if (count < 5) return { mean: 0, std: 1 }
  const mean = sum / count
  const variance = Math.max(0, sumSq / count - mean * mean)
  return { mean, std: Math.max(1, Math.sqrt(variance)) }
}

function percentileRank(series, value, bar, lookback) {
  // Returns the rank (0..1) of value within the trailing window excluding bar.
  const first = Math.max(0, bar - lookback)
  if (first >= bar || !isFiniteNumber(value)) return 0
  let below = 0, total = 0
  for (let i = first; i < bar; i++) {
    const v = series[i]
    if (isFiniteNumber(v)) {
      if (v <= value) below++
      total++
    }
  }
  if (total === 0) return 0
  return below / total
}

function evaluateTape(extremeBar) {
  if (!useTape) return false
  const trades = tradeCountSeries[extremeBar]
  if (!isFiniteNumber(trades)) return false
  const { mean, std } = rollingMeanStd(tradeCountSeries, extremeBar, 100)
  if (std <= 1) return false
  const z = (trades - mean) / std
  return z >= activeTapeZ
}

function evaluateAbsorption(extremeBar, impulseState) {
  if (!useAbsorption) return false
  const trades = tradeCountSeries[extremeBar]
  if (!isFiniteNumber(trades)) return false
  const { mean, std } = rollingMeanStd(tradeCountSeries, extremeBar, 100)
  if (std <= 1) return false
  const tapeZ = (trades - mean) / std
  if (tapeZ < 1.5) return false

  const range = highSeries[extremeBar] - lowSeries[extremeBar]
  if (range <= 0) return false
  const medRange = medianCandleRange(extremeBar, 50)
  if (range / medRange > 0.6) return false

  // Close rejection against impulse direction
  const close = closeSeries[extremeBar]
  const mid = (highSeries[extremeBar] + lowSeries[extremeBar]) / 2
  if (impulseState > 0) {
    // Bullish impulse → extreme at high → expect close in lower half (rejection)
    return close <= mid
  } else {
    // Bearish impulse → extreme at low → expect close in upper half (rejection)
    return close >= mid
  }
}

function evaluateDivergence(impulse) {
  if (!useDivergence) return false
  // Find the most recent same-direction impulse
  let prev = null
  for (let i = lastImpulses.length - 1; i >= 0; i--) {
    if (lastImpulses[i].state === impulse.state) {
      prev = lastImpulses[i]
      break
    }
  }
  if (!prev) return false

  if (impulse.state > 0) {
    // Bullish impulse: price higher high, delta lower peak
    return impulse.extremePrice > prev.extremePrice &&
           impulse.peakDelta < prev.peakDelta * 0.9
  } else {
    // Bearish impulse: price lower low, delta lower peak
    return impulse.extremePrice < prev.extremePrice &&
           impulse.peakDelta < prev.peakDelta * 0.9
  }
}

function evaluateOi(impulse) {
  if (!useOi || !oiSub) return false
  const startOi = oiSeries[impulse.start]
  const endOi = oiSeries[impulse.extremeBar]
  if (!isFiniteNumber(startOi) || !isFiniteNumber(endOi) || startOi === 0) return false
  // Anti-squeeze guard: only count if impulse is long enough
  if (impulse.length < 5) return false

  const oiChangePct = (endOi - startOi) / startOi * 100
  // Non-confirmation: OI didn't grow meaningfully in the impulse direction.
  // For both bull and bear impulses, OI change ≤ threshold = no fresh fuel.
  return oiChangePct <= activeOiThreshold
}

function oiGrowthVeto(impulse) {
  // Fresh-money veto: OI growing strongly across the impulse means new fuel is
  // being added in the impulse direction — direct counter-evidence to a
  // reversal. Suppresses the signal regardless of score. Shares the anti-
  // squeeze guard with evaluateOi (impulse ≥ 5 bars).
  if (!useOi || !oiSub) return false
  if (impulse.length < 5) return false
  const startOi = oiSeries[impulse.start]
  const endOi = oiSeries[impulse.extremeBar]
  if (!isFiniteNumber(startOi) || !isFiniteNumber(endOi) || startOi === 0) return false
  const oiChangePct = (endOi - startOi) / startOi * 100
  return oiChangePct >= activeOiVetoPct
}

function evaluateLiq(extremeBar, impulseState) {
  if (!useLiq || !statSub) return false
  if (impulseState > 0) {
    // Bullish impulse → top reversal → buyLiq (short squeeze forced buys) spike
    const liq = buyLiqSeries[extremeBar]
    if (!isFiniteNumber(liq)) return false
    return percentileRank(buyLiqSeries, liq, extremeBar, 200) >= activeLiqPercentile / 100
  } else {
    // Bearish impulse → bottom reversal → sellLiq (long liquidations) spike
    const liq = sellLiqSeries[extremeBar]
    if (!isFiniteNumber(liq)) return false
    return percentileRank(sellLiqSeries, liq, extremeBar, 200) >= activeLiqPercentile / 100
  }
}

function evaluateWick(extremeBar, impulseState) {
  if (!useWick) return false
  const range = highSeries[extremeBar] - lowSeries[extremeBar]
  if (range <= 0) return false
  const bodyHigh = Math.max(openSeries[extremeBar], closeSeries[extremeBar])
  const bodyLow = Math.min(openSeries[extremeBar], closeSeries[extremeBar])

  if (impulseState > 0) {
    // Bullish extreme at high → upper wick = rejection
    const wickStrength = (highSeries[extremeBar] - bodyHigh) / range
    return wickStrength >= 0.28
  } else {
    // Bearish extreme at low → lower wick = rejection
    const wickStrength = (bodyLow - lowSeries[extremeBar]) / range
    return wickStrength >= 0.28
  }
}

function evaluatePriorLevel(price) {
  if (!usePriorLevel) return false
  const tolerance = Math.max(0.0000001, context.tickSize || 0.0000001) * activeLevelTolerance
  for (let i = 0; i < priorLevels.length; i++) {
    if (Math.abs(priorLevels[i].price - price) <= tolerance) return true
  }
  return false
}
// ============================================================
// SUBSCRIPTIONS
// ============================================================

const candles = subscribe(data.OHLCV)

// OI / STAT feeds are optional: only subscribe when the terminal exposes the
// constants. When they are missing, the positioning components simply never
// trigger instead of aborting runtime creation ("Failed to create runtime").
let oiSub = null
if (typeof data !== "undefined" && data &&
    typeof data.OI !== "undefined" && data.OI) {
  oiSub = subscribe(data.OI)
}

let statSub = null
if (typeof data !== "undefined" && data &&
    typeof data.STAT !== "undefined" && data.STAT) {
  statSub = subscribe(data.STAT)
}

// Tape trade-count accessors are optional as well; checked once so onBar can
// never throw on a missing method.
const tapeHasCounts = (typeof candles.buyCount === "function") &&
                      (typeof candles.sellCount === "function")

// ============================================================
// SERIES STORAGE
// ============================================================

const openSeries = Series("rs.open")
const highSeries = Series("rs.high")
const lowSeries = Series("rs.low")
const closeSeries = Series("rs.close")
const volumeSeries = Series("rs.volume")
const unixSeries = Series("rs.unix")
const tradeCountSeries = Series("rs.trades")
const deltaSeries = Series("rs.delta")
const rollingDeltaSeries = Series("rs.rolling_delta")
const adaptiveScaleSeries = Series("rs.adaptive_scale")
const entrySeries = Series("rs.entry")
const exitSeries = Series("rs.exit")
const stateSeries = Series("rs.state")

const oiSeries = Series("rs.oi")
const sellLiqSeries = Series("rs.sell_liq")
const buyLiqSeries = Series("rs.buy_liq")

// ============================================================
// STATE TRACKING
// ============================================================

let priorLevels = []
let lastImpulses = []
let lastSignaledExtremeBar = -1
let lastAlertedImpulseStart = -1

// Most recent impulse evaluation, persisted so the pane's signal status
// section can show the last score / component triggers on every bar.
let lastScore = 0
let lastMaxScore = 7
let lastComponentFlags = { tape: 0, divergence: 0, absorption: 0, oi: 0, liq: 0, wick: 0, level: 0 }

// ============================================================
// MAIN: onBar
// ============================================================

function onBar(index) {
  const bar = barIndex()

  // ── Cache primary data (every update) ──
  openSeries[bar] = candles.open()
  highSeries[bar] = candles.high()
  lowSeries[bar] = candles.low()
  closeSeries[bar] = candles.close()
  volumeSeries[bar] = candles.volume()
  unixSeries[bar] = candles.unix()

  // Trade counts (tape speed)
  let buyCount = 0
  let sellCount = 0
  if (tapeHasCounts) {
    buyCount = candles.buyCount()
    sellCount = candles.sellCount()
  }
  tradeCountSeries[bar] = (isFiniteNumber(buyCount) ? buyCount : 0) +
                          (isFiniteNumber(sellCount) ? sellCount : 0)

  // Delta
  const buyVol = candles.buyVolume()
  const sellVol = candles.sellVolume()
  const delta = (isFiniteNumber(buyVol) ? buyVol : 0) -
                (isFiniteNumber(sellVol) ? sellVol : 0)
  deltaSeries[bar] = delta

  // Rolling delta (sum over deltaPeriod bars)
  const previousRolling = bar === 0 ? 0 : rollingDeltaSeries[bar - 1]
  const expiredDelta = bar >= deltaPeriod ? deltaSeries[bar - deltaPeriod] : 0
  rollingDeltaSeries[bar] = previousRolling + delta - expiredDelta

  // Cache OI and liquidation data if their feeds were available
  if (oiSub && oiSeries) {
    oiSeries[bar] = oiSub.close()
  }
  if (statSub && sellLiqSeries) {
    sellLiqSeries[bar] = statSub.sellLiq()
    buyLiqSeries[bar] = statSub.buyLiq()
  }

  // ── Adaptive scale & thresholds (ported from DCP) ──
  const targetScale = percentileScale(bar) * thresholdMultiplier
  const previousScale = bar === 0 ? targetScale : adaptiveScaleSeries[bar - 1]
  adaptiveScaleSeries[bar] = Math.max(1, smoothScale(previousScale, targetScale))

  const targets = neutralTargets(bar, adaptiveScaleSeries[bar])
  const previousEntry = bar === 0 ? targets.entry : entrySeries[bar - 1]
  const previousExit = bar === 0 ? targets.exit : exitSeries[bar - 1]
  entrySeries[bar] = smoothThreshold(previousEntry, targets.entry)
  exitSeries[bar] = Math.min(entrySeries[bar],
    smoothThreshold(previousExit, targets.exit))

  // ── State machine ──
  const state = resolveState(bar, rollingDeltaSeries[bar],
    entrySeries[bar], exitSeries[bar])
  stateSeries[bar] = state

  // ============================================================
  // PANE DASHBOARD - live delta pressure vs hysteresis bands
  // ============================================================
  // The script's own pane would otherwise stay empty (all output is
  // force-overlaid markers on price). Mirror the base indicator's approach:
  // draw rolling delta as a percentage of the adaptive scale, colored by the
  // current state, with the entry/exit threshold bands the state machine uses.
  // All sections and colors are configurable from Inputs > Display > Pane display.
  if (showPaneDashboard) {
    const scaleRef = Math.max(1, adaptiveScaleSeries[bar])
    const entryPct = entrySeries[bar] / scaleRef * 100
    const exitPct = exitSeries[bar] / scaleRef * 100

    if (showPressureSection) {
      const pressurePct = rollingDeltaSeries[bar] / scaleRef * 100

      let pressureColor = "#2f2f38"
      if (state > 0) pressureColor = bullishMarkerColor
      else if (state < 0) pressureColor = bearishMarkerColor

      plotHistogram("Delta pressure", pressurePct, {
        color: pressureColor,
        showLabel: true,
        showValue: true
      })
      plot("Entry", entryPct, {
        color: entryBandColor,
        style: linestyle.dashed,
        width: 1,
        showLabel: true,
        showValue: false
      })
      plot("Exit", exitPct, {
        color: exitBandColor,
        style: linestyle.dotted,
        width: 1,
        showLabel: true,
        showValue: false
      })
      plot("Zero", 0, {
        color: color.transp(zeroLineColor, 60),
        width: 1,
        showLabel: false,
        showValue: false
      })
    }

    // ------------------------------------------------------------
    // SIGNAL & COMPONENT STATUS - current state, last score, and
    // per-component trigger bars (0/100). The score/component values
    // persist from the most recent impulse evaluation (see above) so
    // the pane keeps showing the last assessment between setups.
    // ------------------------------------------------------------
    if (showSignalSection) {
      let stateLineColor = stateNeutralColor
      if (state > 0) stateLineColor = bullishMarkerColor
      else if (state < 0) stateLineColor = bearishMarkerColor

      plot("State", stateSeries[bar] * 100, {
        color: stateLineColor,
        width: 2,
        showLabel: true,
        showValue: true
      })

      // Score as a % of the maximum possible (honest max — tape + absorption
      // share one vote), 0-100.
      plotHistogram("Score", lastScore / Math.max(1, lastMaxScore) * 100, {
        color: scoreColor,
        showLabel: true,
        showValue: true
      })

      if (showComponentBars) {
        plot("Tape", lastComponentFlags.tape * 100, { color: tapeBarColor, width: 1, showLabel: true, showValue: false })
        plot("Divergence", lastComponentFlags.divergence * 100, { color: divergenceBarColor, width: 1, showLabel: true, showValue: false })
        plot("Absorption", lastComponentFlags.absorption * 100, { color: absorptionBarColor, width: 1, showLabel: true, showValue: false })
        plot("OI", lastComponentFlags.oi * 100, { color: oiBarColor, width: 1, showLabel: true, showValue: false })
        plot("Liq", lastComponentFlags.liq * 100, { color: liqBarColor, width: 1, showLabel: true, showValue: false })
        plot("Wick", lastComponentFlags.wick * 100, { color: wickBarColor, width: 1, showLabel: true, showValue: false })
        plot("Level", lastComponentFlags.level * 100, { color: levelBarColor, width: 1, showLabel: true, showValue: false })
      }
    }
  }

  // ── Signal evaluation ──
  // Historical / backfill (context.isNew on a non-live bar): confirmed impulse
  // with end = bar-2; marker anchored at the exact extreme bar so reload places
  // markers at the true reversal levels.
  // Live (context.isRealtime && context.isLast): evaluated on every tick, with
  // NO bar-2 confirmation wait:
  //   1) potentialExtreme — the forming bar extends the impulse's extreme, so
  //      print the marker immediately (early, at the potential reversal zone).
  //   2) confirmedImpulse(live) — the impulse just ended mid-bar (state flip)
  //      without a fresh extreme; catches reversals at an established level.
  // Both anchor at the current bar → render instantly, no reload.
  const isLiveBar = context.isRealtime && context.isLast

  if (!context.isNew && !isLiveBar) return

  if (context.isNew && !isLiveBar) {
    const impulse = confirmedImpulse(bar, false)
    if (impulse) evaluateImpulse(bar, impulse, false)
  }

  if (isLiveBar) {
    const potential = potentialExtreme(bar)
    if (potential) evaluateImpulse(bar, potential, true)
    else {
      const impulse = confirmedImpulse(bar, true)
      if (impulse) evaluateImpulse(bar, impulse, true)
    }
  }
}

// ============================================================
// IMPULSE / POTENTIAL EXTREME → evaluate all components
// ============================================================
// Shared by the historical confirmed path (end = bar-2, backfill only) and the
// live potential-extreme path (forming bar extends the impulse's extreme).
// `live` only changes the marker anchor so the live print appears immediately
// at the current bar.

function evaluateImpulse(bar, impulse, live) {
  const extremeBar = impulse.extremeBar
  const impulseState = impulse.state

  // NOTE: no "evaluated once per (start, extremeBar)" guard here on purpose.
  // In the live potential path the forming bar keeps extending its extreme,
  // and its tape count / wick / absorption data is only partial at first — so
  // every tick that extends the extreme must be re-scored with the freshest
  // data. Dedup + cooldown below already guarantee one signal per impulse.

  // Evaluate each component
  const tapeOk = evaluateTape(extremeBar)
  const absorptionOk = evaluateAbsorption(extremeBar, impulseState)
  const divergenceOk = evaluateDivergence(impulse)
  const oiOk = evaluateOi(impulse)
  const liqOk = evaluateLiq(extremeBar, impulseState)
  const wickOk = evaluateWick(extremeBar, impulseState)
  const priorLevelOk = evaluatePriorLevel(impulse.extremePrice)

  // Score
  let score = 0
  const triggered = []
  // Anti-double-count: tape and absorption read the SAME trade-count burst
  // (absorption requires tape Z ≥ 1.5 from the same 100-bar window), so they
  // share ONE vote — tape wins the label when both fire. Every point in the
  // score is now an independent fact; the component bars still show the raw
  // triggers.
  if (tapeOk) { score++; triggered.push("tape") }
  else if (absorptionOk) { score++; triggered.push("absorb") }
  if (divergenceOk) { score++; triggered.push("divergence") }
  if (oiOk) { score++; triggered.push("oi") }
  if (liqOk) { score++; triggered.push("liq") }
  if (wickOk) { score++; triggered.push("wick") }
  if (priorLevelOk) { score++; triggered.push("level") }

  // Persist the most recent evaluation for the pane's signal-status section
  // (runs even when the score stays below threshold).
  lastScore = score
  lastComponentFlags.tape = tapeOk ? 1 : 0
  lastComponentFlags.divergence = divergenceOk ? 1 : 0
  lastComponentFlags.absorption = absorptionOk ? 1 : 0
  lastComponentFlags.oi = oiOk ? 1 : 0
  lastComponentFlags.liq = liqOk ? 1 : 0
  lastComponentFlags.wick = wickOk ? 1 : 0
  lastComponentFlags.level = priorLevelOk ? 1 : 0

  // Cluster satisfaction — components whose data feed is unavailable are
  // treated as disabled, so the cluster requirements degrade gracefully
  // instead of blocking all signals.
  const flowComponentCount = (useTape && tapeHasCounts ? 1 : 0) +
                             (useDivergence ? 1 : 0) +
                             (useAbsorption && tapeHasCounts ? 1 : 0)
  const flowClusterRequired = flowComponentCount > 0
  const flowClusterOk = !flowClusterRequired ||
                        (tapeOk || divergenceOk || absorptionOk)

  const positioningComponentCount = (useOi && !!oiSub ? 1 : 0) +
                                    (useLiq && !!statSub ? 1 : 0)
  const positioningClusterRequired = positioningComponentCount > 0
  const positioningClusterOk = !positioningClusterRequired ||
                                (oiOk || liqOk)

  const clustersOk = flowClusterOk && positioningClusterOk

  // Honest max score: tape + absorption share one vote, so the denominator
  // drops by one when both are enabled and available.
  let maxScore = 0
  if (useTape && tapeHasCounts) maxScore++
  if (useDivergence) maxScore++
  if (useAbsorption && tapeHasCounts) maxScore++
  if (useOi && oiSub) maxScore++
  if (useLiq && statSub) maxScore++
  if (useWick) maxScore++
  if (usePriorLevel) maxScore++
  if (useTape && tapeHasCounts && useAbsorption && tapeHasCounts) maxScore--
  lastMaxScore = maxScore

  // Dedup & cooldown — one signal per impulse (the live potential path can
  // re-find the same impulse on every tick, and the historical path can find it
  // again on the next new bar).
  const dedupOk = lastAlertedImpulseStart !== impulse.start
  const cooldownOk = lastSignaledExtremeBar < 0 ||
                     (bar - lastSignaledExtremeBar) >= activeCooldown

  // Fresh-money veto: OI growing ≥ the veto % across the impulse suppresses
  // the signal regardless of score — new fuel in the impulse direction argues
  // against an imminent reversal.
  const vetoed = oiGrowthVeto(impulse)

  // ── Fire signal ──
  if (clustersOk && score >= activeMinScore && dedupOk && cooldownOk && !vetoed) {
    lastSignaledExtremeBar = extremeBar
    lastAlertedImpulseStart = impulse.start

    const signalDirection = impulseState > 0 ? "Bearish" : "Bullish"
    const markerColor = impulseState > 0 ? bearishMarkerColor : bullishMarkerColor

    // Marker at exact extreme price. Live path anchors at the current bar so
    // it renders immediately; historical path anchors at the extreme bar.
    Marker("snip_" + impulse.start + "_" + impulse.extremeBar, {
      x: live ? unixSeries[bar] : unixSeries[extremeBar],
      y: impulse.extremePrice,
      shape: shape.square,
      size: markerSize,
      color: markerColor,
      zIndex: 5,
      forceOverlay: true
    })

    // Alert
    if (enableAlerts && context.isRealtime && context.isLast) {
      reversalAlert.trigger({
        direction: signalDirection,
        price: impulse.extremePrice,
        score: score,
        max_score: maxScore,
        components: triggered.join(","),
        impulse_bars: impulse.length,
        peak_delta_ratio: Math.round(impulse.peakDelta / Math.max(1, adaptiveScaleSeries[impulse.end]) * 100) / 100
      })
    }
  }

  // ── Store for future divergence and level matching ──
  // Deduped against the last stored entry so the live and historical paths
  // finding the same impulse (or its extension) don't double-append.
  const previousImpulseEntry = lastImpulses[lastImpulses.length - 1]
  if (previousImpulseEntry && previousImpulseEntry.start === impulse.start) {
    previousImpulseEntry.extremePrice = impulse.extremePrice
    previousImpulseEntry.peakDelta = impulse.peakDelta
    previousImpulseEntry.extremeBar = impulse.extremeBar
    previousImpulseEntry.end = impulse.end
  } else {
    lastImpulses.push({
      state: impulseState,
      extremePrice: impulse.extremePrice,
      peakDelta: impulse.peakDelta,
      extremeBar: impulse.extremeBar,
      end: impulse.end
    })
    // Keep last 10
    if (lastImpulses.length > 10) lastImpulses.shift()
  }

  const previousLevelEntry = priorLevels[priorLevels.length - 1]
  if (!previousLevelEntry ||
      previousLevelEntry.price !== impulse.extremePrice ||
      previousLevelEntry.state !== impulseState) {
    priorLevels.push({ price: impulse.extremePrice, state: impulseState })
    // Keep last 20
    if (priorLevels.length > 20) priorLevels.shift()
  }
}
