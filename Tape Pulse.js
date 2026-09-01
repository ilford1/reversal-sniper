//@version=2
indicator("Tape Pulse", false)

// ============================================================
// DATA
// ============================================================
const candles = subscribe(data.OHLCV)
const tapeHasCounts = (typeof candles.buyCount === "function") &&
                      (typeof candles.sellCount === "function")
const tapeHasVolumes = (typeof candles.buyVolume === "function") &&
                       (typeof candles.sellVolume === "function")

// ============================================================
// INPUTS — Settings tab
// ============================================================
input.tab("Settings", { key: "settings_tab" })

const preset = input.select("Preset", 0, {
  key: "preset",
  selectables: [
    "Auto (adaptive)",
    "Scalp",
    "Swing",
    "Precise (strict)",
    "Sniper (very strict)",
    "Custom"
  ],
  description: "Tunes every threshold to the recent distribution of tape activity. Scalp is fast and fires more signals; Swing is calm and waits for strong, sustained flow. Precise and Sniper apply stricter absolute event gates."
})

input.group("Custom sensitivity", {
  key: "custom_group",
  collapsible: true,
  collapsed: false
})

const customDirectionSensitivity = input.int("Direction sensitivity", 100, {
  key: "direction_sensitivity",
  min: 50,
  max: 150,
  onlyIf: input.when("preset", "Custom"),
  description: "Above 100 starts directional states faster and on weaker tape (more signals); below 100 waits for strong, sustained one-sided flow."
})

const customEventSensitivity = input.int("Event sensitivity", 100, {
  key: "event_sensitivity",
  min: 50,
  max: 150,
  onlyIf: input.when("preset", "Custom"),
  description: "Above 100 marks more absorption and exhaustion events; below 100 only the clearest events are marked."
})

// ============================================================
// INPUTS — Colors tab
// ============================================================
input.tab("Colors", { key: "colors_tab" })

const askColor = input.color("Ask color", "#74a6e2", { key: "ask_color" })
const bidColor = input.color("Bid color", "#aa3a37", { key: "bid_color", sameLine: true })
const neutralColor = input.color("Neutral", "#5c6066", { key: "neutral_color", sameLine: true })

// ============================================================
// INPUTS — Signals tab
// ============================================================
input.tab("Signals", { key: "signals_tab" })

const showEventMarkers = input.bool("Show event markers", true, { key: "show_event_markers" })
const absorptionColor = input.color("Absorption marker", "#f2f2f2", {
  key: "absorption_color",
  onlyIf: input.whenTrue("show_event_markers")
})
const exhaustionColor = input.color("Exhaustion marker", "#f2c94c", {
  key: "exhaustion_color",
  sameLine: true,
  onlyIf: input.whenTrue("show_event_markers")
})

const enableAlerts = input.bool("Enable alerts", false, { key: "enable_alerts" })

// ============================================================
// ALERTS
// ============================================================
const absorptionAlert = alert.define("pulse.absorption", {
  title: "Tape Pulse — Absorption",
  description: "Strong one-sided flow that price failed to follow (potential reversal).",
  fields: [
    { key: "direction", type: "string" },
    { key: "pulse", type: "number" },
    { key: "price", type: "number" }
  ]
})

const exhaustionAlert = alert.define("pulse.exhaustion", {
  title: "Tape Pulse — Exhaustion",
  description: "A recent climax bar followed by a collapse in activity (trend weakening).",
  fields: [
    { key: "direction", type: "string" },
    { key: "peak_pulse", type: "number" },
    { key: "price", type: "number" }
  ]
})
// ============================================================
// CONSTANTS
// ============================================================
const LIVE_WINDOW_SECONDS = 2.0
const FAST_BASELINE_HALF_LIFE_SECONDS = 2.0 * 60.0
const SLOW_BASELINE_HALF_LIFE_SECONDS = 20.0 * 60.0
const DISPLAY_SMOOTHING_BAR_RATIO = 0.5
const MAXIMUM_PULSE = 100
const DIRECTION_WEIGHT_FLOOR = 0.10
const MINIMUM_READABLE_EFFICIENCY = 0.10
const MIN_THRESHOLD_SAMPLES = 30
const HYSTERESIS_PULSE_RATIO = 0.57
const HYSTERESIS_EFFICIENCY_RATIO = 0.60
const ABSORPTION_RESPONSE_RATIO = 0.25
const EXHAUSTION_DECAY_RATIO = 0.60

// ============================================================
// SERIES — computed values
// ============================================================
const rawPulseSeries = Series("tp.rawPulse")
const intensitySeries = Series("tp.intensity")
const efficiencySeries = Series("tp.efficiency")
const stateSeries = Series("tp.state")
const pulseSeries = Series("tp.pulse")
const absMarkerSeries = Series("tp.absorption")

// ============================================================
// SERIES — baselines (4 pairs × fast/slow)
// ============================================================
const tradesFast = Series("tp.tradesFast")
const tradesSlow = Series("tp.tradesSlow")
const volumeFast = Series("tp.volumeFast")
const volumeSlow = Series("tp.volumeSlow")
const deltaFast = Series("tp.deltaFast")
const deltaSlow = Series("tp.deltaSlow")
const responseFast = Series("tp.responseFast")
const responseSlow = Series("tp.responseSlow")

// ============================================================
// SERIES — cached raw data
// ============================================================
const unixSeries = Series("tp.unix")
const buyVolSeries = Series("tp.buyVol")
const sellVolSeries = Series("tp.sellVol")
const buyCountSeries = Series("tp.buyCount")
const sellCountSeries = Series("tp.sellCount")

// ============================================================
// STATE
// ============================================================
let lastThresholdBar = -1
let displayHalfLifeSeconds = 0.75
let liveStateBar = -1
let liveDirectionalState = 0
let lastLiveUpdateUnix = -1
let barOpenUnix = -1
let barOpenPrice = 0
let lastAlertedAbsorptionBar = -1
let lastAlertedExhaustionPeakBar = -1

// Adaptive thresholds (updated per-bar from historical percentiles)
let adaptiveEntryPulse = 28
let adaptiveExitPulse = 16
let adaptiveEntryEfficiency = 0.20
let adaptiveExitEfficiency = 0.12
let adaptiveAbsorptionPulse = 0
let adaptiveAbsorptionIntensity = 1.35
let adaptiveAbsorptionEfficiency = 0.35
let adaptiveExhaustionPulse = 55
let adaptiveExhaustionIntensity = 1.60
// ============================================================
// HELPER: clamp
// ============================================================
function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

// ============================================================
// HELPER: boundedRatio — value / baseline, capped at 4x
// ============================================================
function boundedRatio(value, baseline) {
  if (value <= 0) return 0
  return Math.min(4, value / Math.max(0.0001, baseline))
}

// ============================================================
// HELPER: timeAdjustedAlpha — EMA alpha from half-life
// ============================================================
function timeAdjustedAlpha(elapsedSeconds, halfLifeSeconds) {
  const bounded = Math.max(0, Math.min(elapsedSeconds, 6 * 60 * 60))
  return 1 - Math.exp(-Math.LN2 * bounded / halfLifeSeconds)
}

// ============================================================
// HELPER: updateBaseline — fast/slow EMA pair
// ============================================================
function updateBaseline(fastSeries, slowSeries, bar, value, elapsedSeconds) {
  if (bar === 0) {
    fastSeries[bar] = value
    slowSeries[bar] = value
    return
  }
  const fastAlpha = timeAdjustedAlpha(elapsedSeconds, FAST_BASELINE_HALF_LIFE_SECONDS)
  const slowAlpha = timeAdjustedAlpha(elapsedSeconds, SLOW_BASELINE_HALF_LIFE_SECONDS)
  fastSeries[bar] = fastSeries[bar - 1] + fastAlpha * (value - fastSeries[bar - 1])
  slowSeries[bar] = slowSeries[bar - 1] + slowAlpha * (value - slowSeries[bar - 1])
}

// ============================================================
// HELPER: getPriorBaseline — adaptive blend of fast/slow
// ============================================================
function getPriorBaseline(fastSeries, slowSeries, bar, fallback) {
  if (bar <= 0) return Math.max(0.0001, fallback)

  const fastVal = fastSeries[bar - 1]
  const slowVal = slowSeries[bar - 1]

  const fastSlowRatio = fastVal / Math.max(0.0001, slowVal)
  const adaptiveFastWeight = 0.15 + 0.50 * clamp(fastSlowRatio - 0.5, 0, 1)
  const fastWeight = clamp(adaptiveFastWeight, 0.15, 0.65)
  const slowWeight = 1 - fastWeight
  const blended = fastVal * fastWeight + slowVal * slowWeight
  return Math.max(0.0001, blended)
}

// ============================================================
// HELPER: percentile — sorted samples at p (0..1)
// ============================================================
function percentile(sortedSamples, p) {
  if (sortedSamples.length === 0) return 0
  let i = Math.ceil((sortedSamples.length - 1) * p)
  i = clamp(i, 0, sortedSamples.length - 1)
  return sortedSamples[i]
}

// ============================================================
// HELPER: interpolateColor — hex ARGB lerp
// ============================================================
function interpolateColor(from, to, amount) {
  amount = clamp(amount, 0, 1)
  const inverse = 1 - amount

  const parseHex = function (hex) {
    hex = hex.replace("#", "")
    if (hex.length === 3) hex = hex.split("").map(function (c) { return c + c }).join("")
    if (hex.length === 6) hex = "ff" + hex
    return {
      r: parseInt(hex.substring(2, 4), 16),
      g: parseInt(hex.substring(4, 6), 16),
      b: parseInt(hex.substring(6, 8), 16),
      a: parseInt(hex.substring(0, 2), 16)
    }
  }

  const fc = parseHex(from)
  const tc = parseHex(to)

  const r = Math.round(fc.r * inverse + tc.r * amount)
  const g = Math.round(fc.g * inverse + tc.g * amount)
  const b = Math.round(fc.b * inverse + tc.b * amount)
  const a = Math.round(fc.a * inverse + tc.a * amount)

  const toHex = function (n) {
    return Math.max(0, Math.min(255, n)).toString(16).padStart(2, "0")
  }
  return "#" + toHex(a) + toHex(r) + toHex(g) + toHex(b)
}

// ============================================================
// HELPER: getPulseColor — interpolate neutral toward ask/bid
// ============================================================
function getPulseColor(pulse, state) {
  const magnitude = Math.min(1, Math.abs(pulse) / MAXIMUM_PULSE)
  if (state === 0) return neutralColor
  const target = state > 0 ? askColor : bidColor
  const blend = 0.25 + magnitude * 0.75
  return interpolateColor(neutralColor, target, blend)
}

// ============================================================
// HELPER: getDirectionalState — hysteresis state machine
// ============================================================
function getDirectionalState(previousState, pulse, efficiency) {
  if (previousState > 0) {
    if (pulse <= -adaptiveEntryPulse && efficiency >= adaptiveEntryEfficiency) return -1
    if (pulse < adaptiveExitPulse || efficiency < adaptiveExitEfficiency) return 0
    return 1
  }
  if (previousState < 0) {
    if (pulse >= adaptiveEntryPulse && efficiency >= adaptiveEntryEfficiency) return 1
    if (pulse > -adaptiveExitPulse || efficiency < adaptiveExitEfficiency) return 0
    return -1
  }
  if (pulse >= adaptiveEntryPulse && efficiency >= adaptiveEntryEfficiency) return 1
  if (pulse <= -adaptiveEntryPulse && efficiency >= adaptiveEntryEfficiency) return -1
  return 0
}

// ============================================================
// HELPER: getPreviousDirectionalState — handles live state
// ============================================================
function getPreviousDirectionalState(bar, liveUpdate) {
  if (liveUpdate) {
    if (liveStateBar === bar) return liveDirectionalState
    return stateSeries[bar] || 0
  }
  return bar > 0 ? (stateSeries[bar - 1] || 0) : 0
}

// ============================================================
// HELPER: ensureThresholds — adaptive percentile thresholds
// ============================================================
function ensureThresholds(bar, params) {
  if (lastThresholdBar === bar) return
  lastThresholdBar = bar

  const first = Math.max(0, bar - params.lookback)
  const count = bar - first
  if (count < MIN_THRESHOLD_SAMPLES) return

  const pulseSamples = []
  const intensitySamples = []
  const efficiencySamples = []

  for (let i = first; i < bar; i++) {
    pulseSamples.push(Math.abs(rawPulseSeries[i] || 0))
    intensitySamples.push(intensitySeries[i] || 0)
    efficiencySamples.push(efficiencySeries[i] || 0)
  }

  pulseSamples.sort(function (a, b) { return a - b })
  intensitySamples.sort(function (a, b) { return a - b })
  efficiencySamples.sort(function (a, b) { return a - b })

  adaptiveEntryPulse = Math.max(8, percentile(pulseSamples, params.directionEntryPercentile))
  adaptiveExitPulse = Math.max(4, adaptiveEntryPulse * params.hysteresisPulseRatio)
  adaptiveExhaustionPulse = Math.max(params.exhaustPulseFloor, percentile(pulseSamples, params.exhaustPercentile))
  adaptiveAbsorptionPulse = Math.max(params.eventPulseFloor, adaptiveEntryPulse * 0.70)
  adaptiveAbsorptionIntensity = Math.max(params.eventIntensityFloor, percentile(intensitySamples, params.eventPercentile))
  adaptiveExhaustionIntensity = Math.max(params.exhaustIntensityFloor,
    percentile(intensitySamples, Math.min(0.97, params.eventPercentile + 0.15)))

  const eff = percentile(efficiencySamples, 0.40)
  adaptiveEntryEfficiency = Math.max(0.12, Math.min(0.40, eff))
  adaptiveExitEfficiency = Math.max(0.06, adaptiveEntryEfficiency * params.hysteresisEfficiencyRatio)
  adaptiveAbsorptionEfficiency = Math.max(0.20, Math.min(0.60, percentile(efficiencySamples, params.eventEfficiencyPercentile)))
}

// ============================================================
// HELPER: applyPreset — resolve preset parameters
// ============================================================
function applyPreset() {
  var params = {
    lookback: 240,
    directionEntryPercentile: 0.75,
    eventPercentile: 0.70,
    exhaustPercentile: 0.88,
    hysteresisPulseRatio: 0.57,
    hysteresisEfficiencyRatio: 0.60,
    eventPulseFloor: 0,
    eventIntensityFloor: 0.50,
    eventEfficiencyPercentile: 0.60,
    exhaustPulseFloor: 12,
    exhaustIntensityFloor: 0.75
  }

  if (preset === "Scalp") {
    params.lookback = 120
    params.directionEntryPercentile = 0.65
    params.eventPercentile = 0.60
    params.exhaustPercentile = 0.84
    params.hysteresisPulseRatio = 0.70
    params.hysteresisEfficiencyRatio = 0.70
  } else if (preset === "Swing") {
    params.lookback = 500
    params.directionEntryPercentile = 0.85
    params.eventPercentile = 0.80
    params.exhaustPercentile = 0.92
    params.hysteresisPulseRatio = 0.50
    params.hysteresisEfficiencyRatio = 0.55
  } else if (preset === "Precise (strict)") {
    params.lookback = 750
    params.directionEntryPercentile = 0.92
    params.eventPercentile = 0.88
    params.exhaustPercentile = 0.96
    params.hysteresisPulseRatio = 0.45
    params.hysteresisEfficiencyRatio = 0.50
    params.eventPulseFloor = 30
    params.eventIntensityFloor = 1.10
    params.eventEfficiencyPercentile = 0.75
    params.exhaustPulseFloor = 40
    params.exhaustIntensityFloor = 1.20
  } else if (preset === "Sniper (very strict)") {
    params.lookback = 1000
    params.directionEntryPercentile = 0.96
    params.eventPercentile = 0.94
    params.exhaustPercentile = 0.98
    params.hysteresisPulseRatio = 0.40
    params.hysteresisEfficiencyRatio = 0.45
    params.eventPulseFloor = 45
    params.eventIntensityFloor = 1.35
    params.eventEfficiencyPercentile = 0.85
    params.exhaustPulseFloor = 55
    params.exhaustIntensityFloor = 1.60
  } else if (preset === "Custom") {
    params.directionEntryPercentile = 0.85 - 0.20 * (customDirectionSensitivity - 50) / 100
    params.eventPercentile = 0.80 - 0.20 * (customEventSensitivity - 50) / 100
    params.exhaustPercentile = Math.min(0.97, params.eventPercentile + 0.16)
    params.hysteresisPulseRatio = 0.57
    params.hysteresisEfficiencyRatio = 0.60
    params.eventPulseFloor = 0
    params.eventIntensityFloor = 0.50
    params.eventEfficiencyPercentile = 0.60
    params.exhaustPulseFloor = 12
    params.exhaustIntensityFloor = 0.75
  }
  // else Auto (adaptive) — already set as defaults

  return params
}

// ============================================================
// CORE: setPulse — intensity, rawPulse, display, state, markers
// ============================================================
function setPulse(bar, tradesPerSecond, volumePerSecond, deltaPerSecond,
                  tradeBaseline, volumeBaseline, deltaBaseline,
                  priceChangeTicksPerSecond, priceResponseBaseline,
                  elapsedSeconds, liveUpdate) {

  var tradeRatio = boundedRatio(tradesPerSecond, tradeBaseline)
  var volumeRatio = boundedRatio(volumePerSecond, volumeBaseline)
  var deltaRatio = boundedRatio(Math.abs(deltaPerSecond), deltaBaseline)
  var activityIntensity = tradeRatio * 0.25 + volumeRatio * 0.35 + deltaRatio * 0.40

  var previousIntensity = bar > 0 ? (intensitySeries[bar - 1] || activityIntensity) : activityIntensity
  var acceleration = previousIntensity > 0
    ? clamp(activityIntensity / previousIntensity, 0.50, 2.00)
    : 1

  intensitySeries[bar] = activityIntensity

  var directionalEfficiency = volumePerSecond > 0
    ? Math.min(1, Math.abs(deltaPerSecond) / volumePerSecond)
    : 0
  efficiencySeries[bar] = directionalEfficiency

  var tradeConfidence = Math.min(1, tradesPerSecond / 5)
  var minReadableEfficiency = MINIMUM_READABLE_EFFICIENCY + 0.40 * (1 - tradeConfidence)

  var rawPulse
  if (directionalEfficiency < minReadableEfficiency || deltaPerSecond === 0) {
    rawPulse = 0
  } else {
    var directionalWeight = DIRECTION_WEIGHT_FLOOR + (1 - DIRECTION_WEIGHT_FLOOR) * directionalEfficiency
    var magnitude = Math.min(MAXIMUM_PULSE, 25 * activityIntensity * directionalWeight * acceleration)
    rawPulse = (deltaPerSecond > 0 ? 1 : -1) * magnitude
  }
  rawPulseSeries[bar] = rawPulse

  // Display smoothing (cosmetic EMA, half-life scaled to bar period)
  var smoothingAlpha = timeAdjustedAlpha(elapsedSeconds, displayHalfLifeSeconds)
  var previousSmoothed = liveUpdate
    ? (pulseSeries[bar] || rawPulse)
    : (bar > 0 ? (pulseSeries[bar - 1] || rawPulse) : rawPulse)
  var pulse = previousSmoothed + smoothingAlpha * (rawPulse - previousSmoothed)

  var previousState = getPreviousDirectionalState(bar, liveUpdate)
  var directionalState = getDirectionalState(previousState, rawPulse, directionalEfficiency)
  stateSeries[bar] = directionalState

  if (liveUpdate) {
    liveStateBar = bar
    liveDirectionalState = directionalState
  }

  pulseSeries[bar] = pulse

  // ── Absorption: strong one-sided flow, price fails to follow ──
  var directionalPriceResponsePerSecond = (deltaPerSecond > 0 ? 1 : -1) * priceChangeTicksPerSecond
  var absorption = Math.abs(rawPulse) >= adaptiveAbsorptionPulse
    && activityIntensity >= adaptiveAbsorptionIntensity
    && directionalEfficiency >= adaptiveAbsorptionEfficiency
    && directionalPriceResponsePerSecond <= priceResponseBaseline * ABSORPTION_RESPONSE_RATIO

  absMarkerSeries[bar] = absorption ? rawPulse : 0

  // ── Exhaustion: climax bar followed by collapse in activity ──
  var exhaustion = false
  var exhaustionPeakBar = -1
  var exhaustionPeakPulse = 0

  if (bar > 0) {
    var lookbackStart = Math.max(0, bar - 3)
    var peakIntensity = activityIntensity
    var peakPulse = 0
    var peakBar = bar
    for (var i = bar - 1; i >= lookbackStart; i--) {
      var ip = intensitySeries[i] || 0
      if (ip > peakIntensity) {
        peakIntensity = ip
        peakPulse = rawPulseSeries[i] || 0
        peakBar = i
      }
    }

    exhaustion = peakBar < bar
      && Math.abs(peakPulse) >= adaptiveExhaustionPulse
      && peakIntensity >= adaptiveExhaustionIntensity
      && activityIntensity <= peakIntensity * EXHAUSTION_DECAY_RATIO

    if (exhaustion) {
      exhaustionPeakBar = peakBar
      exhaustionPeakPulse = peakPulse
    }
  }

  return {
    rawPulse: rawPulse,
    pulse: pulse,
    directionalState: directionalState,
    absorption: absorption,
    exhaustion: exhaustion,
    exhaustionPeakBar: exhaustionPeakBar,
    exhaustionPeakPulse: exhaustionPeakPulse
  }
}

// ============================================================
// MAIN: onBar
// ============================================================
function onBar(index) {
  var bar = barIndex()

  // Cache current bar data
  unixSeries[bar] = candles.unix()
  buyVolSeries[bar] = tapeHasVolumes ? (candles.buyVolume() || 0) : 0
  sellVolSeries[bar] = tapeHasVolumes ? (candles.sellVolume() || 0) : 0
  buyCountSeries[bar] = tapeHasCounts ? (candles.buyCount() || 0) : 0
  sellCountSeries[bar] = tapeHasCounts ? (candles.sellCount() || 0) : 0

  // Track bar open for live-path rate computation
  if (context.isNew) {
    barOpenUnix = unixSeries[bar]
    barOpenPrice = candles.open()
    lastLiveUpdateUnix = -1
    liveStateBar = -1
    liveDirectionalState = 0
  }

  var isRealtime = context.isRealtime && context.isLast
  var tickSize = context.tickSize || 0.0000001
  var params = applyPreset()

  if (isRealtime) {
    // ═══════════════════════════════════════════════════════
    // LIVE PATH — forming bar, running totals on every tick
    // ═══════════════════════════════════════════════════════
    var currentUnix = unixSeries[bar]
    var seconds = Math.max(0.25, currentUnix - barOpenUnix)

    var buyVol = buyVolSeries[bar]
    var sellVol = sellVolSeries[bar]
    var buyCount = buyCountSeries[bar]
    var sellCount = sellCountSeries[bar]
    var totalCount = buyCount + sellCount
    var totalVolume = buyVol + sellVol
    var delta = buyVol - sellVol
    var currentPrice = candles.close()

    var tradesPerSecond = totalCount / seconds
    var volumePerSecond = totalVolume / seconds
    var deltaPerSecond = delta / seconds
    var priceChangeTicksPerSecond = (currentPrice - barOpenPrice) / tickSize / seconds

    var tradeBaseline = getPriorBaseline(tradesFast, tradesSlow, bar, tradesPerSecond)
    var volumeBaseline = getPriorBaseline(volumeFast, volumeSlow, bar, volumePerSecond)
    var deltaBaseline = getPriorBaseline(deltaFast, deltaSlow, bar, Math.abs(deltaPerSecond))
    var responseBaseline = getPriorBaseline(responseFast, responseSlow, bar, Math.abs(priceChangeTicksPerSecond))

    // Bar-period for display half-life
    var barPeriodSeconds = Math.max(0.75, currentUnix - (bar > 0 ? unixSeries[bar - 1] : currentUnix))
    displayHalfLifeSeconds = Math.max(0.75, barPeriodSeconds * DISPLAY_SMOOTHING_BAR_RATIO)

    // Reset markers for this bar (they will be set by setPulse)
    absMarkerSeries[bar] = 0

    // Thresholds reused from bar open (guard: lastThresholdBar === bar → no-op)
    ensureThresholds(bar, params)

    var elapsedSeconds = lastLiveUpdateUnix === -1
      ? displayHalfLifeSeconds
      : Math.max(0.01, currentUnix - lastLiveUpdateUnix)
    lastLiveUpdateUnix = currentUnix

    var result = setPulse(bar, tradesPerSecond, volumePerSecond, deltaPerSecond,
      tradeBaseline, volumeBaseline, deltaBaseline, priceChangeTicksPerSecond, responseBaseline,
      elapsedSeconds, true)

    // Update baselines continuously
    updateBaseline(tradesFast, tradesSlow, bar, tradesPerSecond, elapsedSeconds)
    updateBaseline(volumeFast, volumeSlow, bar, volumePerSecond, elapsedSeconds)
    updateBaseline(deltaFast, deltaSlow, bar, Math.abs(deltaPerSecond), elapsedSeconds)
    updateBaseline(responseFast, responseSlow, bar, Math.abs(priceChangeTicksPerSecond), elapsedSeconds)
    // ── Live markers (dedup per bar/peak) ──
    if (showEventMarkers) {
      if (result.absorption && lastAlertedAbsorptionBar !== bar) {
        lastAlertedAbsorptionBar = bar
        Marker("tp_abs_" + bar, {
          x: unixSeries[bar],
          y: result.rawPulse,
          shape: shape.square,
          size: 1,
          color: absorptionColor,
          zIndex: 5,
          forceOverlay: false
        })
      }
      if (result.exhaustion && result.exhaustionPeakBar >= 0 &&
          lastAlertedExhaustionPeakBar !== result.exhaustionPeakBar) {
        lastAlertedExhaustionPeakBar = result.exhaustionPeakBar
        Marker("tp_exh_" + result.exhaustionPeakBar, {
          x: unixSeries[result.exhaustionPeakBar],
          y: result.exhaustionPeakPulse,
          shape: shape.square,
          size: 1,
          color: exhaustionColor,
          zIndex: 5,
          forceOverlay: false
        })
      }
    }

    // ── Live alerts (realtime-only, deduped) ──
    if (enableAlerts) {
      if (result.absorption && lastAlertedAbsorptionBar !== bar) {
        absorptionAlert.trigger({
          direction: result.rawPulse > 0 ? "bullish" : "bearish",
          pulse: Math.round(result.rawPulse),
          price: currentPrice
        })
      }
      if (result.exhaustion && result.exhaustionPeakBar >= 0 &&
          lastAlertedExhaustionPeakBar !== result.exhaustionPeakBar) {
        exhaustionAlert.trigger({
          direction: result.exhaustionPeakPulse > 0 ? "bullish" : "bearish",
          peak_pulse: Math.round(result.exhaustionPeakPulse),
          price: currentPrice
        })
      }
    }

  } else {
    // ═══════════════════════════════════════════════════════
    // HISTORICAL PATH — finalized bar
    // ═══════════════════════════════════════════════════════
    var seconds = Math.max(0.25, unixSeries[bar] - (bar > 0 ? unixSeries[bar - 1] : 0))

    var buyVol = buyVolSeries[bar]
    var sellVol = sellVolSeries[bar]
    var buyCount = buyCountSeries[bar]
    var sellCount = sellCountSeries[bar]
    var totalCount = buyCount + sellCount
    var totalVolume = buyVol + sellVol
    var delta = buyVol - sellVol
    var barClose = candles.close()
    var barOpen = candles.open()

    var tradesPerSecond = totalCount / seconds
    var volumePerSecond = totalVolume / seconds
    var deltaPerSecond = delta / seconds
    var priceChangeTicksPerSecond = (barClose - barOpen) / tickSize / seconds

    var tradeBaseline = getPriorBaseline(tradesFast, tradesSlow, bar, tradesPerSecond)
    var volumeBaseline = getPriorBaseline(volumeFast, volumeSlow, bar, volumePerSecond)
    var deltaBaseline = getPriorBaseline(deltaFast, deltaSlow, bar, Math.abs(deltaPerSecond))
    var responseBaseline = getPriorBaseline(responseFast, responseSlow, bar, Math.abs(priceChangeTicksPerSecond))

    var elapsedSeconds = bar > 0
      ? Math.max(0.05, unixSeries[bar] - unixSeries[bar - 1])
      : 0

    // Bar-period for display half-life
    var barPeriodSeconds = Math.max(0.75,
      unixSeries[bar] - (bar > 0 ? unixSeries[bar - 1] : unixSeries[bar]))
    displayHalfLifeSeconds = Math.max(0.75, barPeriodSeconds * DISPLAY_SMOOTHING_BAR_RATIO)

    // Reset markers for this bar
    absMarkerSeries[bar] = 0

    ensureThresholds(bar, params)

    var result = setPulse(bar, tradesPerSecond, volumePerSecond, deltaPerSecond,
      tradeBaseline, volumeBaseline, deltaBaseline, priceChangeTicksPerSecond, responseBaseline,
      elapsedSeconds, false)

    updateBaseline(tradesFast, tradesSlow, bar, tradesPerSecond, elapsedSeconds)
    updateBaseline(volumeFast, volumeSlow, bar, volumePerSecond, elapsedSeconds)
    updateBaseline(deltaFast, deltaSlow, bar, Math.abs(deltaPerSecond), elapsedSeconds)
    updateBaseline(responseFast, responseSlow, bar, Math.abs(priceChangeTicksPerSecond), elapsedSeconds)

    // ── Historical markers (retroactive on peak bar) ──
    if (showEventMarkers) {
      if (result.absorption && lastAlertedAbsorptionBar !== bar) {
        lastAlertedAbsorptionBar = bar
        Marker("tp_abs_" + bar, {
          x: unixSeries[bar],
          y: result.rawPulse,
          shape: shape.square,
          size: 1,
          color: absorptionColor,
          zIndex: 5,
          forceOverlay: false
        })
      }
      if (result.exhaustion && result.exhaustionPeakBar >= 0 &&
          lastAlertedExhaustionPeakBar !== result.exhaustionPeakBar) {
        lastAlertedExhaustionPeakBar = result.exhaustionPeakBar
        Marker("tp_exh_" + result.exhaustionPeakBar, {
          x: unixSeries[result.exhaustionPeakBar],
          y: result.exhaustionPeakPulse,
          shape: shape.square,
          size: 1,
          color: exhaustionColor,
          zIndex: 5,
          forceOverlay: false
        })
      }
    }
  }

  // ═══════════════════════════════════════════════════════
  // RENDERING (common to both paths)
  // ═══════════════════════════════════════════════════════
  var pulse = pulseSeries[bar] || 0
  var state = stateSeries[bar] || 0
  var color = getPulseColor(pulse, state)

  plotHistogram("Pulse", pulse, {
    color: color,
    showLabel: true
  })

  plot("Zero", 0, {
    color: "#8c9196",
    width: 1,
    showLabel: false
  })
}

// ============================================================
// END
// ============================================================
