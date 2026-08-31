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
const customTapeZ = input.float("Tape speed Z-score", 1.8, {
  key: "tape_z", min: 0.5, max: 5.0,
  onlyIf: input.when("strictness", "Custom")
})
const customOiZ = input.float("OI net-change Z-score", 0.5, {
  key: "oi_z", min: -2.0, max: 3.0,
  onlyIf: input.when("strictness", "Custom")
})
const customOiWaning = input.float("OI waning factor", 1.0, {
  key: "oi_waning", min: 0.9, max: 1.0,
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
const customLiqWindow = input.int("Liquidation window bars", 2, {
  key: "liq_window", min: 1, max: 5,
  onlyIf: input.when("strictness", "Custom")
})
const customLiqVolumeShare = input.float("Liquidation volume share", 0.02, {
  key: "liq_volume_share", min: 0.005, max: 0.25,
  onlyIf: input.when("strictness", "Custom")
})
const customLiqDirection = input.float("Liquidation direction min", 0.50, {
  key: "liq_direction", min: 0.35, max: 0.80,
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
const customFlipZ = input.float("Counter-side count Z-score", 1.2, {
  key: "flip_z", min: 0.5, max: 5.0,
  onlyIf: input.when("strictness", "Custom")
})
const customIsolationFactor = input.float("Spike isolation factor", 1.5, {
  key: "isolation_factor", min: 1.0, max: 5.0,
  onlyIf: input.when("strictness", "Custom")
})
const customAbsorptionCounterZ = input.float("Counter-side vol Z-score", 1.0, {
  key: "absorption_counter_z", min: 0.5, max: 5.0,
  onlyIf: input.when("strictness", "Custom")
})
const customAbsorptionVolZ = input.float("Absorption total-volume Z-score", 1.5, {
  key: "absorption_vol_z", min: 0.5, max: 5.0,
  onlyIf: input.when("strictness", "Custom")
})
const customDivWeakness = input.float("Divergence weakness factor", 0.92, {
  key: "div_weakness", min: 0.5, max: 0.99,
  onlyIf: input.when("strictness", "Custom")
})
const customDivWaning = input.float("Divergence waning factor", 0.93, {
  key: "div_waning", min: 0.5, max: 0.99,
  onlyIf: input.when("strictness", "Custom")
})
const customDivLegs = input.int("Divergence baseline legs", 2, {
  key: "div_legs", min: 1, max: 5,
  onlyIf: input.when("strictness", "Custom")
})

input.group("Core pressure", {
  key: "core_pressure_group",
  collapsible: true,
  collapsed: false
})

const corePreset = input.select("Core preset", 0, {
  key: "core_preset",
  selectables: ["Automatic", "Scalp 1m", "Scalp 5m", "Custom"],
  description: "Tunes the ported delta-pressure core (state machine, impulse detection) to the chart timeframe. Automatic keeps the original defaults (5m-leaning)."
})

const customLookback = input.int("Adaptation period", 120, {
  key: "core_lookback", min: 30, max: 2000,
  onlyIf: input.when("core_preset", "Custom")
})
const customCoreDeltaPeriod = input.int("Delta period", 12, {
  key: "core_delta_period", min: 2, max: 200,
  onlyIf: input.when("core_preset", "Custom")
})
const customAdaptationSpeed = input.float("Adaptation speed", 1.0, {
  key: "core_adapt_speed", min: 0.5, max: 3.0,
  onlyIf: input.when("core_preset", "Custom")
})
const customNeutralExitRatio = input.float("Neutral exit ratio", 0.65, {
  key: "core_neutral_exit", min: 0.3, max: 0.9,
  onlyIf: input.when("core_preset", "Custom")
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
let activeTapeZ = 1.8
let activeFlipZ = 1.2
let activeIsolationFactor = 1.5
let activeAbsorptionCounterZ = 1.0
let activeAbsorptionVolZ = 1.5
let activeDivWeakness = 0.92
let activeDivWaning = 0.93
let activeDivLegs = 2
let activeOiZ = 0.5
let activeOiWaning = 1.0
let activeOiVetoPct = 5.0
let activeLiqPercentile = 95
let activeLiqWindow = 2
let activeLiqVolumeShare = 0.02
let activeLiqDirection = 0.50
let activeMinImpulseLength = 2
let activeCooldown = 10
let activeLevelTolerance = 10

if (strictness === "Balanced") {
  // defaults — keep as-is
} else if (strictness === "Strict") {
  activeMinScore = 4
  activeTapeZ = 2.3
  activeFlipZ = 1.7
  activeIsolationFactor = 2.0
  activeAbsorptionCounterZ = 1.5
  activeAbsorptionVolZ = 2.0
  activeDivWeakness = 0.87
  activeDivWaning = 0.83
  activeDivLegs = 3
  activeOiZ = 0.0
  activeOiWaning = 0.985
  activeOiVetoPct = 3.0
  activeLiqPercentile = 97
  activeLiqWindow = 1
  activeLiqVolumeShare = 0.03
  activeLiqDirection = 0.55
  activeMinImpulseLength = 5
  activeCooldown = 15
  activeLevelTolerance = 5
} else if (strictness === "Aggressive") {
  activeMinScore = 2
  activeTapeZ = 1.4
  activeFlipZ = 0.9
  activeIsolationFactor = 1.2
  activeAbsorptionCounterZ = 0.8
  activeAbsorptionVolZ = 1.0
  activeDivWeakness = 0.96
  activeDivWaning = 0.96
  activeDivLegs = 2
  activeOiZ = 1.0
  activeOiWaning = 1.0
  activeOiVetoPct = 7.0
  activeLiqPercentile = 90
  activeLiqWindow = 3
  activeLiqVolumeShare = 0.02
  activeLiqDirection = 0.50
  activeCooldown = 8
  activeLevelTolerance = 15
} else if (strictness === "Custom") {
  activeMinScore = customMinScore
  activeTapeZ = customTapeZ
  activeFlipZ = customFlipZ
  activeIsolationFactor = customIsolationFactor
  activeAbsorptionCounterZ = customAbsorptionCounterZ
  activeAbsorptionVolZ = customAbsorptionVolZ
  activeDivWeakness = customDivWeakness
  activeDivWaning = customDivWaning
  activeDivLegs = customDivLegs
  activeOiZ = customOiZ
  activeOiWaning = customOiWaning
  activeOiVetoPct = customOiVetoPct
  activeLiqPercentile = customLiqPercentile
  activeLiqWindow = customLiqWindow
  activeLiqVolumeShare = customLiqVolumeShare
  activeLiqDirection = customLiqDirection
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

let activeLookback = 240
const activeSensitivity = 100
let deltaPeriod = 12
let adaptationSpeed = 1.0
let neutralExitRatio = 0.65
const minImpulseClimax = 0.75

const thresholdMultiplier = 100 / activeSensitivity
const scalePercentile = 0.92
const entryFloorPercentile = 0.68
const entryCeilingPercentile = 0.88
const exitFloorPercentile = 0.45

// ============================================================
// CORE PRESET-DERIVED PARAMETERS (timeframe tuning)
// ============================================================
// Mirrors the base "Delta Candle Pressure" indicator's Scalp presets so the
// ported state machine matches the chart timeframe. Automatic keeps the
// original hard-coded values (5m-leaning); Scalp 1m optimizes for minute
// charts (faster adaptation, shorter lookback, lower neutral exit so states
// persist longer through the impulse).

if (corePreset === "Automatic") {
  // defaults — keep as-is
} else if (corePreset === "Scalp 1m") {
  activeLookback = 120
  deltaPeriod = 10
  adaptationSpeed = 1.20
  neutralExitRatio = 0.55
} else if (corePreset === "Scalp 5m") {
  activeLookback = 240
  deltaPeriod = 18
  adaptationSpeed = 1.00
  neutralExitRatio = 0.65
} else if (corePreset === "Custom") {
  activeLookback = customLookback
  deltaPeriod = customCoreDeltaPeriod
  adaptationSpeed = customAdaptationSpeed
  neutralExitRatio = customNeutralExitRatio
}

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

// Closed-bar delta statistics for an impulse [start .. closedEnd]: peak intensity,
// mean conviction (energy per bar), the last bar's delta, and the peak of all
// earlier bars. Used by the divergence upgrade — always computed on COMPLETE
// bars so live detection never reads partial forming-bar data.
function impulseDeltaStats(start, closedEnd) {
  let peak = 0
  let energy = 0
  let priorPeak = 0
  for (let i = start; i <= closedEnd; i++) {
    const d = Math.abs(rollingDeltaSeries[i])
    peak = Math.max(peak, d)
    energy += d
    if (i < closedEnd) priorPeak = Math.max(priorPeak, d)
  }
  const n = closedEnd - start + 1
  return {
    peak,
    mean: energy / Math.max(1, n),
    endDelta: Math.abs(rollingDeltaSeries[closedEnd]),
    priorPeak
  }
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

  const stats = impulseDeltaStats(impulseStart, impulseEnd)
  const scale = Math.max(1, adaptiveScaleSeries[impulseEnd])
  if (stats.peak / scale < minImpulseClimax) return null

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
    peakDelta: stats.peak,
    peakScaled: stats.peak / scale,
    meanScaled: stats.mean / scale,
    endDelta: stats.endDelta,
    priorPeak: stats.priorPeak
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

  // Divergence measurements use only CLOSED bars [impulseStart .. bar-1] so the
  // forming bar's partial delta never biases the comparison. The full-range
  // peak (including the forming bar) is kept for the climax gate and alerts.
  const stats = impulseDeltaStats(impulseStart, bar - 1)
  let peakDelta = stats.peak
  peakDelta = Math.max(peakDelta, Math.abs(rollingDeltaSeries[bar]))
  const scale = Math.max(1, adaptiveScaleSeries[bar])
  if (peakDelta / scale < minImpulseClimax) return null

  return {
    extremeBar: bar,
    extremePrice: liveExtreme,
    state: impulseState,
    start: impulseStart,
    end: bar,
    length,
    peakDelta,
    peakScaled: stats.peak / scale,
    meanScaled: stats.mean / scale,
    endDelta: stats.endDelta,
    priorPeak: stats.priorPeak
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

function windowSumPercentile(series, bar, window, lookback) {
  // Returns the rank (0..1) of the sum of series over [bar-window+1 .. bar]
  // within the trailing distribution of equivalent-length window sums
  // (windows ending strictly before bar). Used by the liquidation flush:
  // a flush is an EPISODE spanning several bars, not a single-bar spike.
  if (window < 1 || !isFiniteNumber(bar) || bar < window - 1) return 0
  let currentSum = 0
  for (let i = bar - window + 1; i <= bar; i++) {
    const v = series[i]
    if (!isFiniteNumber(v)) return 0
    currentSum += v
  }
  const first = Math.max(0, bar - lookback)
  let below = 0, total = 0
  for (let end = first + window - 1; end < bar; end++) {
    let sum = 0, valid = true
    for (let i = end - window + 1; i <= end; i++) {
      const v = series[i]
      if (!isFiniteNumber(v)) { valid = false; break }
      sum += v
    }
    if (!valid) continue
    if (sum <= currentSum) below++
    total++
  }
  if (total === 0) return 0
  return below / total
}

function evaluateTape(extremeBar, impulseState) {
  if (!useTape) return false
  const trades = tradeCountSeries[extremeBar]
  if (!isFiniteNumber(trades)) return false
  const { mean, std } = rollingMeanStd(tradeCountSeries, extremeBar, 100)
  if (std <= 1) return false
  const z = (trades - mean) / std
  if (z < activeTapeZ) return false

  // ── Spike isolation ──
  // Exhaustion is a one-bar blow-off, not a plateau. If trade count has been
  // hot for several bars straight, that's sustained participation (a real
  // trend), not a reversal spike. The extreme bar must clearly beat the best
  // of the prior 3 bars. Skipped when there's no prior history yet.
  let priorMax = 0
  const first = Math.max(0, extremeBar - 3)
  for (let i = first; i < extremeBar; i++) {
    const v = tradeCountSeries[i]
    if (isFiniteNumber(v)) priorMax = Math.max(priorMax, v)
  }
  if (priorMax > 0 && trades <= priorMax * activeIsolationFactor) return false

  // ── Aggressor-side split (participation flip) ──
  // A tape burst only means exhaustion if the *counter* side of the tape
  // dominates and bursts on its own: sells outnumber buys at a bullish
  // extreme (top), buys outnumber sells at a bearish extreme (bottom).
  // The counter-side count must also spike vs its own trailing window.
  const buy = buyCountSeries[extremeBar]
  const sell = sellCountSeries[extremeBar]
  if (!isFiniteNumber(buy) || !isFiniteNumber(sell)) return false
  const counter = impulseState > 0 ? sell : buy
  const sameSide = impulseState > 0 ? buy : sell
  if (counter <= sameSide) return false
  const counterSeries = impulseState > 0 ? sellCountSeries : buyCountSeries
  const cStats = rollingMeanStd(counterSeries, extremeBar, 100)
  if (cStats.std <= 1) return false
  const counterZ = (counter - cStats.mean) / cStats.std
  if (counterZ < activeFlipZ) return false

  return true
}

function evaluateAbsorption(extremeBar, impulseState) {
  if (!useAbsorption) return false
  const vol = volumeSeries[extremeBar]
  if (!isFiniteNumber(vol)) return false

  // ── Activity floor (total volume) ──
  // Absorption is a SIZE phenomenon, so the floor is measured on total candle
  // volume — not trade count. This makes absorption independent of the
  // count-based tape spike: each now reads a different fact (size vs
  // participation frequency).
  const { mean, std } = rollingMeanStd(volumeSeries, extremeBar, 100)
  if (std <= 1) return false
  const volZ = (vol - mean) / std
  if (volZ < activeAbsorptionVolZ) return false

  // ── Counter-side volume stack-up ──
  // Tape burst alone can be many tiny prints (spoof / retail noise). Real
  // absorption requires the ABSORBING side to show up with size: for a bull
  // impulse (extreme at top) that is sell volume, for a bear impulse
  // (extreme at bottom) that is buy volume. Elevation is measured against
  // that side's own trailing distribution, so impulse-side dumping with
  // passive counter-side matching no longer qualifies as absorption.
  const counterVolSeries = impulseState > 0 ? sellVolSeries : buyVolSeries
  const counterVol = counterVolSeries[extremeBar]
  if (!isFiniteNumber(counterVol)) return false
  const cvStats = rollingMeanStd(counterVolSeries, extremeBar, 100)
  if (cvStats.std <= 1) return false
  const cvZ = (counterVol - cvStats.mean) / cvStats.std
  if (cvZ < activeAbsorptionCounterZ) return false

  // ── Delta neutrality ──
  // Absorption = flow being neutralised. If this bar's own delta is large
  // relative to its volume, that's a real directional push, not absorption.
  const barDelta = Math.abs(deltaSeries[extremeBar])
  if (!isFiniteNumber(barDelta) || vol <= 0) return false
  if (barDelta / vol > 0.25) return false

  const range = highSeries[extremeBar] - lowSeries[extremeBar]
  if (range <= 0) return false
  const medRange = medianCandleRange(extremeBar, 50)
  if (range / medRange > 0.7) return false

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
  // B — baseline: the strongest of the last N same-direction impulses.
  // Comparing against a strong recent leg (not just the immediate prior one)
  // catches progressive multi-leg fades and stops a weak prior leg from
  // making the weakness ratio trivially easy to satisfy.
  const legs = []
  for (let i = lastImpulses.length - 1; i >= 0; i--) {
    const p = lastImpulses[i]
    if (p.state === impulse.state && p.start !== impulse.start) {
      legs.push(p)
      if (legs.length >= activeDivLegs) break
    }
  }
  if (legs.length === 0) return false
  if (!isFiniteNumber(impulse.peakScaled) || !isFiniteNumber(impulse.meanScaled)) return false

  let baseExtreme = impulse.state > 0 ? -Infinity : Infinity
  let basePeakScaled = 0
  let baseMeanScaled = 0
  for (const p of legs) {
    if (impulse.state > 0) baseExtreme = Math.max(baseExtreme, p.extremePrice)
    else baseExtreme = Math.min(baseExtreme, p.extremePrice)
    if (isFiniteNumber(p.peakScaled)) basePeakScaled = Math.max(basePeakScaled, p.peakScaled)
    if (isFiniteNumber(p.meanScaled)) baseMeanScaled = Math.max(baseMeanScaled, p.meanScaled)
  }
  if (basePeakScaled <= 0 || baseMeanScaled <= 0) return false

  // C — scale-normalized weakness: BOTH peak intensity and mean conviction
  // must weaken relative to the strongest recent leg.
  const peakWeak = impulse.peakScaled < basePeakScaled * activeDivWeakness
  const meanWeak = impulse.meanScaled < baseMeanScaled * activeDivWeakness

  // E — waning: the impulse's final closed bar must be well below its own
  // prior peak, i.e. pressure is dying as price prints the new extreme.
  // Skipped for single-bar impulses where there is no earlier bar to compare.
  let waning = true
  if (impulse.priorPeak > 0) {
    waning = impulse.endDelta < impulse.priorPeak * activeDivWaning
  }

  if (impulse.state > 0) {
    // Bullish impulse: price higher high, delta lower peak & mean, waning end
    return impulse.extremePrice > baseExtreme && peakWeak && meanWeak && waning
  }
  // Bearish impulse: price lower low, delta lower peak & mean, waning end
  return impulse.extremePrice < baseExtreme && peakWeak && meanWeak && waning
}

function oiImpulsePeak(start, extremeBar) {
  // Peak open interest inside the impulse window [start .. extremeBar].
  // Both evaluateOi (fuel rollover) and oiGrowthVeto (peak-based fresh-money)
  // scan the window once. Includes the extreme bar, so on the live potential
  // path the forming bar's OI participates exactly like the historical path.
  let peakOi = -Infinity
  let peakBar = start
  for (let i = start; i <= extremeBar; i++) {
    const v = oiSeries[i]
    if (isFiniteNumber(v) && v > peakOi) {
      peakOi = v
      peakBar = i
    }
  }
  return { peakOi, peakBar }
}

function oiNetChangeStats(length, extremeBar) {
  // Distribution of net OI % change over trailing windows of the same length
  // as the impulse (windows ending strictly before extremeBar). Used to
  // normalize the impulse's own net change — adaptive to OI volatility
  // instead of a fixed % threshold. Never reads forming-bar data.
  const samples = []
  const lookback = 100
  const first = Math.max(extremeBar - lookback, length)
  for (let end = first; end < extremeBar; end++) {
    const a = oiSeries[end - length]
    const b = oiSeries[end]
    if (isFiniteNumber(a) && isFiniteNumber(b) && a > 0) {
      samples.push((b - a) / a * 100)
    }
  }
  if (samples.length < 5) return { mean: 0, std: 1 }
  const mean = samples.reduce((s, v) => s + v, 0) / samples.length
  const variance = samples.reduce((s, v) => s + (v - mean) * (v - mean), 0) / samples.length
  return { mean, std: Math.max(0.01, Math.sqrt(variance)) }
}

function evaluateOi(impulse) {
  if (!useOi || !oiSub) return false
  const startOi = oiSeries[impulse.start]
  const endOi = oiSeries[impulse.extremeBar]
  if (!isFiniteNumber(startOi) || !isFiniteNumber(endOi) || startOi === 0) return false
  // Anti-squeeze guard: only count if impulse is long enough
  if (impulse.length < 5) return false

  // Gate A — no fresh money (normalized). Net OI change over the impulse,
  // Z-scored against trailing windows of the same length. OI grew at or
  // below typical pace = no fresh fuel added in the impulse direction.
  const netOiPct = (endOi - startOi) / startOi * 100
  const { mean, std } = oiNetChangeStats(impulse.length, impulse.extremeBar)
  const netOiZ = (netOiPct - mean) / std
  if (netOiZ > activeOiZ) return false

  // Gate B — fuel exhaustion (trajectory). OI must have PEAKED before the
  // final bar and rolled over by the waning factor before the extreme —
  // money being burned, not added. Requires impulse >= 5 bars (above) so the
  // window is long enough to contain a real rollover.
  const peak = oiImpulsePeak(impulse.start, impulse.extremeBar)
  if (peak.peakBar >= impulse.extremeBar) return false
  if (endOi > peak.peakOi * activeOiWaning) return false

  return true
}

function oiGrowthVeto(impulse) {
  // Fresh-money veto: OI growing strongly across the impulse means new fuel is
  // being added in the impulse direction — direct counter-evidence to a
  // reversal. Peak-based: catches mid-impulse OI surges that later retrace
  // before the extreme (the old endpoint-only check missed those). Suppresses
  // the signal regardless of score. Shares the anti-squeeze guard with
  // evaluateOi (impulse ≥ 5 bars).
  if (!useOi || !oiSub) return false
  if (impulse.length < 5) return false
  const startOi = oiSeries[impulse.start]
  if (!isFiniteNumber(startOi) || startOi === 0) return false
  const peak = oiImpulsePeak(impulse.start, impulse.extremeBar)
  if (!isFiniteNumber(peak.peakOi) || peak.peakOi <= 0) return false
  const oiGrowthPct = (peak.peakOi - startOi) / startOi * 100
  return oiGrowthPct >= activeOiVetoPct
}

function evaluateLiq(extremeBar, impulseState) {
  if (!useLiq || !statSub) return false
  // Bullish impulse → top reversal → buyLiq (short squeeze forced buys);
  // bearish impulse → bottom reversal → sellLiq (long liquidations).
  const sideSeries = impulseState > 0 ? buyLiqSeries : sellLiqSeries
  const otherSeries = impulseState > 0 ? sellLiqSeries : buyLiqSeries

  // Gate A — flush episode (window-sum percentile). A flush spans several
  // bars, so sum the impulse-side liq over activeLiqWindow bars ending at the
  // extreme and rank that episode against trailing equivalent windows.
  if (windowSumPercentile(sideSeries, extremeBar, activeLiqWindow, 200) <
      activeLiqPercentile / 100) return false

  // Episode sums (same window)
  let liqEpisode = 0
  let otherEpisode = 0
  let volEpisode = 0
  let otherValid = true
  let volValid = true
  for (let i = extremeBar - activeLiqWindow + 1; i <= extremeBar; i++) {
    const l = sideSeries[i]
    if (!isFiniteNumber(l)) return false
    liqEpisode += l
    const o = otherSeries[i]
    if (isFiniteNumber(o)) otherEpisode += o
    else otherValid = false
    const v = volumeSeries[i]
    if (isFiniteNumber(v)) volEpisode += v
    else volValid = false
  }

  // Gate B — forced-flow share. The flush must be a meaningful share of that
  // window's total volume, not a few forced prints on a huge-volume bar.
  // Skips gracefully if volume is unavailable.
  if (volValid && volEpisode > 0 && liqEpisode / volEpisode < activeLiqVolumeShare) {
    return false
  }

  // Gate C — directional dominance. One-sided squeeze/capitulation: the
  // impulse-side liq must dominate the counter side over the same window.
  // Skips gracefully if the counter-side feed is unavailable.
  if (otherValid) {
    const totalEpisode = liqEpisode + otherEpisode
    if (totalEpisode <= 0) return false
    if (liqEpisode / totalEpisode < activeLiqDirection) return false
  }

  return true
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
const buyCountSeries = Series("rs.buy_count")
const sellCountSeries = Series("rs.sell_count")
const buyVolSeries = Series("rs.buy_vol")
const sellVolSeries = Series("rs.sell_vol")
const deltaSeries = Series("rs.delta")
const rollingDeltaSeries = Series("rs.rolling_delta")
const adaptiveScaleSeries = Series("rs.adaptive_scale")
const entrySeries = Series("rs.entry")
const exitSeries = Series("rs.exit")
const stateSeries = Series("rs.state")

const oiSeries = Series("rs.oi")
const oiChangeSeries = Series("rs.oi_change")
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
  buyCountSeries[bar] = isFiniteNumber(buyCount) ? buyCount : 0
  sellCountSeries[bar] = isFiniteNumber(sellCount) ? sellCount : 0

  // Delta
  const buyVol = candles.buyVolume()
  const sellVol = candles.sellVolume()
  const delta = (isFiniteNumber(buyVol) ? buyVol : 0) -
                (isFiniteNumber(sellVol) ? sellVol : 0)
  deltaSeries[bar] = delta
  buyVolSeries[bar] = isFiniteNumber(buyVol) ? buyVol : 0
  sellVolSeries[bar] = isFiniteNumber(sellVol) ? sellVol : 0

  // Rolling delta (sum over deltaPeriod bars)
  const previousRolling = bar === 0 ? 0 : rollingDeltaSeries[bar - 1]
  const expiredDelta = bar >= deltaPeriod ? deltaSeries[bar - deltaPeriod] : 0
  rollingDeltaSeries[bar] = previousRolling + delta - expiredDelta

  // Cache OI and liquidation data if their feeds were available
  if (oiSub && oiSeries) {
    const oi = oiSub.close()
    oiSeries[bar] = oi
    const prevOi = bar === 0 ? oi : oiSeries[bar - 1]
    oiChangeSeries[bar] = (isFiniteNumber(oi) && isFiniteNumber(prevOi) && prevOi > 0)
      ? (oi - prevOi) / prevOi * 100
      : 0
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

      // Score as a % of the maximum possible — each enabled component is an
      // independent fact, so the denominator is the honest max.
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
  const tapeOk = evaluateTape(extremeBar, impulseState)
  const absorptionOk = evaluateAbsorption(extremeBar, impulseState)
  const divergenceOk = evaluateDivergence(impulse)
  const oiOk = evaluateOi(impulse)
  const liqOk = evaluateLiq(extremeBar, impulseState)
  const wickOk = evaluateWick(extremeBar, impulseState)
  const priorLevelOk = evaluatePriorLevel(impulse.extremePrice)

  // Score
  let score = 0
  const triggered = []
  // Each enabled component reads a different fact (tape = count burst,
  // absorption = volume neutrality), so every trigger earns its own vote.
  if (tapeOk) { score++; triggered.push("tape") }
  if (absorptionOk) { score++; triggered.push("absorb") }
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

  // Honest max score: each enabled component contributes one independent vote.
  // Tape and absorption each read a different fact (count burst vs volume
  // neutrality), so they no longer share a vote.
  let maxScore = 0
  if (useTape && tapeHasCounts) maxScore++
  if (useDivergence) maxScore++
  if (useAbsorption && tapeHasCounts) maxScore++
  if (useOi && oiSub) maxScore++
  if (useLiq && statSub) maxScore++
  if (useWick) maxScore++
  if (usePriorLevel) maxScore++
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
    previousImpulseEntry.peakScaled = impulse.peakScaled
    previousImpulseEntry.meanScaled = impulse.meanScaled
    previousImpulseEntry.endDelta = impulse.endDelta
    previousImpulseEntry.priorPeak = impulse.priorPeak
    previousImpulseEntry.extremeBar = impulse.extremeBar
    previousImpulseEntry.end = impulse.end
  } else {
    lastImpulses.push({
      state: impulseState,
      extremePrice: impulse.extremePrice,
      peakDelta: impulse.peakDelta,
      peakScaled: impulse.peakScaled,
      meanScaled: impulse.meanScaled,
      endDelta: impulse.endDelta,
      priorPeak: impulse.priorPeak,
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
