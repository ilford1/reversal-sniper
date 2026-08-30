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
  key: "tape_z", min: 0.5, max: 5.0, step: 0.1,
  onlyIf: input.when("strictness", "Custom")
})
const customOiThreshold = input.float("OI max change %", 0.5, {
  key: "oi_threshold", min: 0.1, max: 5.0, step: 0.1,
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
  activeLiqPercentile = 97
  activeMinImpulseLength = 5
  activeCooldown = 15
  activeLevelTolerance = 5
} else if (strictness === "Aggressive") {
  activeMinScore = 2
  activeTapeZ = 1.5
  activeOiThreshold = 1.0
  activeLiqPercentile = 90
  activeCooldown = 8
  activeLevelTolerance = 15
} else if (strictness === "Custom") {
  activeMinScore = customMinScore
  activeTapeZ = customTapeZ
  activeOiThreshold = customOiThreshold
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

function confirmedImpulse(bar) {
  if (bar < 2) return null
  const impulseEnd = bar - 2
  const impulseState = stateSeries[impulseEnd]
  const confirmationState = stateSeries[bar - 1]
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

// ============================================================
// NEW REVERSAL COMPONENT FUNCTIONS
// ============================================================

function rollingMeanStd(series, bar, lookback) {
  // Returns { mean, std } over window [bar - lookback, bar - 1], excluding current bar.
  const first = Math.max(0, bar - lookback)
  let sum = 0, sumSq = 0, count = 0
  for (let i = first; i < bar; i++) {
    const v = series[i]
    if (Number.isFinite(v)) {
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
  if (first >= bar || !Number.isFinite(value)) return 0
  let below = 0, total = 0
  for (let i = first; i < bar; i++) {
    const v = series[i]
    if (Number.isFinite(v)) {
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
  if (!Number.isFinite(trades)) return false
  const { mean, std } = rollingMeanStd(tradeCountSeries, extremeBar, 100)
  if (std <= 1) return false
  const z = (trades - mean) / std
  return z >= activeTapeZ
}

function evaluateAbsorption(extremeBar, impulseState) {
  if (!useAbsorption) return false
  const trades = tradeCountSeries[extremeBar]
  if (!Number.isFinite(trades)) return false
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
  if (!useOi || !oiSeries) return false
  const startOi = oiSeries[impulse.start]
  const endOi = oiSeries[impulse.extremeBar]
  if (!Number.isFinite(startOi) || !Number.isFinite(endOi) || startOi === 0) return false
  // Anti-squeeze guard: only count if impulse is long enough
  if (impulse.length < 5) return false

  const oiChangePct = (endOi - startOi) / startOi * 100
  // Non-confirmation: OI didn't grow meaningfully in the impulse direction.
  // For both bull and bear impulses, OI change ≤ threshold = no fresh fuel.
  return oiChangePct <= activeOiThreshold
}

function evaluateLiq(extremeBar, impulseState) {
  if (!useLiq || !sellLiqSeries) return false
  if (impulseState > 0) {
    // Bullish impulse → top reversal → buyLiq (short squeeze forced buys) spike
    const liq = buyLiqSeries[extremeBar]
    if (!Number.isFinite(liq)) return false
    return percentileRank(buyLiqSeries, liq, extremeBar, 200) >= activeLiqPercentile / 100
  } else {
    // Bearish impulse → bottom reversal → sellLiq (long liquidations) spike
    const liq = sellLiqSeries[extremeBar]
    if (!Number.isFinite(liq)) return false
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
const oiSub = useOi ? subscribe(data.OI) : null
const statSub = useLiq ? subscribe(data.STAT) : null

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

const oiSeries = useOi ? Series("rs.oi") : null
const sellLiqSeries = useLiq ? Series("rs.sell_liq") : null
const buyLiqSeries = useLiq ? Series("rs.buy_liq") : null

// ============================================================
// STATE TRACKING
// ============================================================

let priorLevels = []
let lastImpulses = []
let lastSignaledExtremeBar = -1
let lastAlertedImpulseStart = -1

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
  const buyCount = candles.buyCount()
  const sellCount = candles.sellCount()
  tradeCountSeries[bar] = (Number.isFinite(buyCount) ? buyCount : 0) +
                          (Number.isFinite(sellCount) ? sellCount : 0)

  // Delta
  const buyVol = candles.buyVolume()
  const sellVol = candles.sellVolume()
  const delta = (Number.isFinite(buyVol) ? buyVol : 0) -
                (Number.isFinite(sellVol) ? sellVol : 0)
  deltaSeries[bar] = delta

  // Rolling delta (sum over deltaPeriod bars)
  const previousRolling = bar === 0 ? 0 : rollingDeltaSeries[bar - 1]
  const expiredDelta = bar >= deltaPeriod ? deltaSeries[bar - deltaPeriod] : 0
  rollingDeltaSeries[bar] = previousRolling + delta - expiredDelta

  // Cache OI and liquidation data if available
  if (oiSeries) {
    oiSeries[bar] = oiSub.close()
  }
  if (sellLiqSeries) {
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

  // ── Signal evaluation (only on new bars) ──
  if (!context.isNew) return

  const impulse = confirmedImpulse(bar)
  if (!impulse) return


  // ============================================================
  // IMPULSE CONFIRMED → evaluate all components
  // ============================================================

  const extremeBar = impulse.extremeBar
  const impulseState = impulse.state

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
  if (tapeOk) { score++; triggered.push("tape") }
  if (absorptionOk) { score++; triggered.push("absorb") }
  if (divergenceOk) { score++; triggered.push("divergence") }
  if (oiOk) { score++; triggered.push("oi") }
  if (liqOk) { score++; triggered.push("liq") }
  if (wickOk) { score++; triggered.push("wick") }
  if (priorLevelOk) { score++; triggered.push("level") }

  // Cluster satisfaction
  const flowComponentCount = (useTape ? 1 : 0) +
                             (useDivergence ? 1 : 0) +
                             (useAbsorption ? 1 : 0)
  const flowClusterRequired = flowComponentCount > 0
  const flowClusterOk = !flowClusterRequired ||
                        (tapeOk || divergenceOk || absorptionOk)

  const positioningComponentCount = (useOi ? 1 : 0) + (useLiq ? 1 : 0)
  const positioningClusterRequired = positioningComponentCount > 0
  const positioningClusterOk = !positioningClusterRequired ||
                                (oiOk || liqOk)

  const clustersOk = flowClusterOk && positioningClusterOk

  // Dedup & cooldown
  const dedupOk = lastAlertedImpulseStart !== impulse.start
  const cooldownOk = lastSignaledExtremeBar < 0 ||
                     (bar - lastSignaledExtremeBar) >= activeCooldown

  // ── Fire signal ──
  if (clustersOk && score >= activeMinScore && dedupOk && cooldownOk) {
    lastSignaledExtremeBar = extremeBar
    lastAlertedImpulseStart = impulse.start

    const signalDirection = impulseState > 0 ? "Bearish" : "Bullish"
    const markerColor = impulseState > 0 ? bearishMarkerColor : bullishMarkerColor

    // Count enabled components for max_score
    let enabledCount = 0
    if (useTape) enabledCount++
    if (useDivergence) enabledCount++
    if (useAbsorption) enabledCount++
    if (useOi) enabledCount++
    if (useLiq) enabledCount++
    if (useWick) enabledCount++
    if (usePriorLevel) enabledCount++

    // Marker at exact extreme price
    Marker("snip_" + impulse.start, {
      x: unixSeries[extremeBar],
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
        max_score: enabledCount,
        components: triggered.join(","),
        impulse_bars: impulse.length,
        peak_delta_ratio: (impulse.peakDelta / Math.max(1, adaptiveScaleSeries[impulse.end])).toFixed(2)
      })
    }
  }

  // ── Store for future divergence and level matching ──
  lastImpulses.push({
    state: impulseState,
    extremePrice: impulse.extremePrice,
    peakDelta: impulse.peakDelta,
    extremeBar: impulse.extremeBar,
    end: impulse.end
  })
  // Keep last 10
  if (lastImpulses.length > 10) lastImpulses.shift()

  priorLevels.push({ price: impulse.extremePrice, state: impulseState })
  // Keep last 20
  if (priorLevels.length > 20) priorLevels.shift()
}
