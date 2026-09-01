//@version=2
indicator("Delta Candle Pressure", false)

// Data -----------------------------------------------------------------------
// ATAS candle.Delta maps to aggressive buy volume minus aggressive sell volume.
const candles = subscribe(data.OHLCV)

// Inputs ---------------------------------------------------------------------
input.tab("Pressure", { key: "pressure_tab" })

const preset = input.select("Preset", 0, {
  key: "preset",
  selectables: ["Automatic", "Scalp 1m", "Scalp 5m", "Custom"],
  description: "Automatic reproduces the source defaults. The scalp presets reproduce its hard-coded parameter sets."
})

input.group("Custom adaptation", {
  key: "custom_adaptation",
  collapsible: true,
  collapsed: false
})

const customAdaptationPeriod = input.int("Adaptation period", 240, {
  key: "adaptation_period",
  min: 30,
  max: 2000,
  onlyIf: input.when("preset", "Custom")
})
const customSensitivity = input.int("Color sensitivity", 100, {
  key: "sensitivity",
  min: 50,
  max: 200,
  onlyIf: input.when("preset", "Custom")
})
const customDeltaPeriod = input.int("Delta period", 12, {
  key: "delta_period",
  min: 2,
  max: 200,
  onlyIf: input.when("preset", "Custom")
})
const customAdaptationSpeed = input.float("Adaptation speed", 1.0, {
  key: "adaptation_speed",
  min: 0.5,
  max: 2.0,
  onlyIf: input.when("preset", "Custom")
})
const customColorIntensity = input.int("Color intensity", 100, {
  key: "color_intensity",
  min: 25,
  max: 200,
  onlyIf: input.when("preset", "Custom")
})
const customColorGamma = input.float("Color gamma", 1.0, {
  key: "color_gamma",
  min: 0.25,
  max: 3.0,
  onlyIf: input.when("preset", "Custom")
})
const customNeutralExitRatio = input.float("Neutral exit ratio", 0.65, {
  key: "neutral_exit_ratio",
  min: 0.1,
  max: 1.0,
  onlyIf: input.when("preset", "Custom")
})
const customImpulseClimax = input.float("Minimum impulse climax", 0.75, {
  key: "impulse_climax",
  min: 0.1,
  max: 2.0,
  onlyIf: input.when("preset", "Custom")
})

input.group("Candle appearance", {
  key: "candle_appearance",
  collapsible: true,
  collapsed: false
})

const showCandles = input.bool("Show pressure candles", true, {
  key: "show_candles"
})
const bearishPeakColor = input.color("Bearish peak", "#ff8a80", {
  key: "bearish_peak"
})
const bearishMidColor = input.color("Bearish mid", "#e53935", {
  key: "bearish_mid",
  sameLine: true
})
const neutralColor = input.color("Neutral", "#a9a9a9", {
  key: "neutral_color"
})
const bullishMidColor = input.color("Bullish mid", "#1e88e5", {
  key: "bullish_mid",
  sameLine: true
})
const bullishPeakColor = input.color("Bullish peak", "#82b1ff", {
  key: "bullish_peak",
  sameLine: true
})

input.tab("Levels & alerts", { key: "levels_tab" })

const showWickLevels = input.bool("Show reversal wick levels", true, {
  key: "show_wick_levels"
})
const includeNeutralLevels = input.bool("Include significant neutral pivots", true, {
  key: "include_neutral_levels",
  onlyIf: input.whenTrue("show_wick_levels")
})
const minImpulseBars = input.int("Minimum impulse bars", 2, {
  key: "min_impulse_bars",
  min: 1,
  max: 20,
  onlyIf: input.whenTrue("show_wick_levels")
})
const wickLevelColor = input.color("Level color", "#87879ba0", {
  key: "wick_level_color",
  onlyIf: input.whenTrue("show_wick_levels")
})
const wickLevelWidth = input.int("Level width", 1, {
  key: "wick_level_width",
  min: 1,
  max: 5,
  onlyIf: input.whenTrue("show_wick_levels")
})
const enableImpulseAlerts = input.bool("Enable impulse alerts", false, {
  key: "enable_impulse_alerts"
})

const impulseAlert = alert.define("impulse.extreme", {
  title: "Delta pressure impulse extreme",
  description: "A qualifying colored delta impulse ended and its extreme was confirmed.",
  fields: [
    { key: "direction", type: "string" },
    { key: "price", type: "number" },
    { key: "peak_delta", type: "number" },
    { key: "bars", type: "number" }
  ]
})

input.tab("CVD pane", { key: "cvd_tab" })

const showCvd = input.bool("Show session CVD", true, { key: "show_cvd" })
const cvdAdaptiveColors = input.bool("Use pressure colors", false, {
  key: "cvd_adaptive_colors",
  onlyIf: input.whenTrue("show_cvd")
})
const cvdPositiveColor = input.color("Positive CVD", "#00c853", {
  key: "cvd_positive",
  onlyIf: input.whenTrue("show_cvd")
})
const cvdNegativeColor = input.color("Negative CVD", "#d50000", {
  key: "cvd_negative",
  sameLine: true,
  onlyIf: input.whenTrue("show_cvd")
})
const showVolumeBackdrop = input.bool("Show normalized volume behind CVD", true, {
  key: "show_volume_backdrop",
  onlyIf: input.whenTrue("show_cvd")
})
const volumeBackdropColor = input.color("Volume backdrop", "#7d848a4b", {
  key: "volume_backdrop_color",
  onlyIf: input.whenTrue("show_volume_backdrop")
})

// Preset-derived effective parameters ---------------------------------------
let activeLookback = 240
let activeSensitivity = 100
let deltaPeriod = 12
let adaptationSpeed = 1.0
let colorIntensity = 100
let colorGamma = 1.0
let neutralExitRatio = 0.65
let minImpulseClimax = 0.75

if (preset === "Scalp 1m") {
  activeLookback = 120
  deltaPeriod = 10
  adaptationSpeed = 1.20
  colorIntensity = 110
  colorGamma = 0.90
  neutralExitRatio = 0.55
  minImpulseClimax = 0.75
} else if (preset === "Scalp 5m") {
  activeLookback = 240
  deltaPeriod = 18
  adaptationSpeed = 1.00
  colorIntensity = 100
  colorGamma = 1.00
  neutralExitRatio = 0.65
  minImpulseClimax = 0.85
} else if (preset === "Custom") {
  activeLookback = customAdaptationPeriod
  activeSensitivity = customSensitivity
  deltaPeriod = customDeltaPeriod
  adaptationSpeed = customAdaptationSpeed
  colorIntensity = customColorIntensity
  colorGamma = customColorGamma
  neutralExitRatio = customNeutralExitRatio
  minImpulseClimax = customImpulseClimax
}

const thresholdMultiplier = 100 / activeSensitivity
const scalePercentile = 0.92
const entryFloorPercentile = 0.68
const entryCeilingPercentile = 0.88
const exitFloorPercentile = 0.45

const pressureScale = color.scale([
  [-100, bearishPeakColor],
  [-50, bearishMidColor],
  [0, neutralColor],
  [50, bullishMidColor],
  [100, bullishPeakColor]
], {
  space: color.space.rgb,
  easing: color.easing.smoothstep
})

// Numeric history. Series() is indexed oldest-to-newest by barIndex().
const openSeries = Series("dcp.open")
const highSeries = Series("dcp.high")
const lowSeries = Series("dcp.low")
const closeSeries = Series("dcp.close")
const volumeSeries = Series("dcp.volume")
const unixSeries = Series("dcp.unix")
const deltaSeries = Series("dcp.delta")
const rollingDeltaSeries = Series("dcp.rolling_delta")
const adaptiveScaleSeries = Series("dcp.adaptive_scale")
const entrySeries = Series("dcp.entry")
const exitSeries = Series("dcp.exit")
const stateSeries = Series("dcp.state")
const cvdSeries = Series("dcp.session_cvd")

// Level objects deliberately hold their Line handles. MMT has no native
// "horizontal line until touched" collection, so the port advances each line
// until the first subsequent price touch and then freezes it there.
let activeLevels = []
let levelSequence = 0
let lastAlertedImpulseStart = -1

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
  if (length < minImpulseBars) return null

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

function levelAlreadyExists(price) {
  const tolerance = Math.max(0.0000001, context.tickSize || 0.0000001)
  for (let i = 0; i < activeLevels.length; i++) {
    const level = activeLevels[i]
    if (level.active && Math.abs(level.price - price) <= tolerance) return true
  }
  return false
}

function addLevel(priceBar, price, side, confirmationBar) {
  if (levelAlreadyExists(price)) return

  const key = "wick_" + levelSequence
  levelSequence++
  const handle = Line(key, {
    x1: unixSeries[priceBar],
    y1: price,
    x2: unixSeries[confirmationBar],
    y2: price,
    color: wickLevelColor,
    width: wickLevelWidth,
    style: linestyle.solid,
    forceOverlay: true,
    zIndex: 2
  })

  activeLevels.push({
    handle,
    price,
    side,
    active: true,
    startBar: priceBar,
    confirmationBar
  })
}

function updateActiveLevels(bar) {
  for (let i = 0; i < activeLevels.length; i++) {
    const level = activeLevels[i]
    if (!level.active || bar < level.confirmationBar) continue

    level.handle.set({ x2: unixSeries[bar], y2: level.price })
    const touched = level.side > 0
      ? highSeries[bar] >= level.price
      : lowSeries[bar] <= level.price
    if (touched) level.active = false
  }
}

function processNeutralPivot(bar) {
  const candidateBar = bar - 2
  const confirmationBar = bar - 1
  if (candidateBar <= 0 || stateSeries[candidateBar] !== 0) return

  const earlierBar = candidateBar > 1 ? candidateBar - 2 : candidateBar - 1
  const highPivot = highSeries[candidateBar] > highSeries[candidateBar - 1] &&
    highSeries[candidateBar] > highSeries[earlierBar] &&
    highSeries[confirmationBar] < highSeries[candidateBar]
  const lowPivot = lowSeries[candidateBar] < lowSeries[candidateBar - 1] &&
    lowSeries[candidateBar] < lowSeries[earlierBar] &&
    lowSeries[confirmationBar] > lowSeries[candidateBar]
  if (!highPivot && !lowPivot) return

  const range = Math.max(context.tickSize || 0.0000001,
    highSeries[candidateBar] - lowSeries[candidateBar])
  const bodyHigh = Math.max(openSeries[candidateBar], closeSeries[candidateBar])
  const bodyLow = Math.min(openSeries[candidateBar], closeSeries[candidateBar])
  const medianRange = Math.max(0.0000001, medianCandleRange(candidateBar, 50))
  const rangeStrength = range / medianRange
  const entryGate = Math.max(0.0000001, entrySeries[candidateBar])
  const deltaStrength = Math.abs(rollingDeltaSeries[candidateBar]) / entryGate

  if (highPivot) {
    const wickStrength = (highSeries[candidateBar] - bodyHigh) / range
    const displacement = (highSeries[candidateBar] - highSeries[confirmationBar]) / medianRange
    let significance = 0
    if (deltaStrength >= 0.75) significance++
    if (displacement >= 0.40) significance++
    if (wickStrength >= 0.28 && rangeStrength >= 0.65) significance++
    if (significance >= 2) {
      addLevel(candidateBar, highSeries[candidateBar], 1, bar)
    }
  }

  if (lowPivot) {
    const wickStrength = (bodyLow - lowSeries[candidateBar]) / range
    const displacement = (lowSeries[confirmationBar] - lowSeries[candidateBar]) / medianRange
    let significance = 0
    if (deltaStrength >= 0.75) significance++
    if (displacement >= 0.40) significance++
    if (wickStrength >= 0.28 && rangeStrength >= 0.65) significance++
    if (significance >= 2) {
      addLevel(candidateBar, lowSeries[candidateBar], -1, bar)
    }
  }
}

function processImpulseLevel(bar, impulse) {
  if (!impulse) return

  const confirmationBar = bar - 1
  const movedAway = impulse.state > 0
    ? highSeries[confirmationBar] < impulse.extremePrice
    : lowSeries[confirmationBar] > impulse.extremePrice
  if (!movedAway) return

  if (impulse.start > 0) {
    const localExtreme = impulse.state > 0
      ? impulse.extremePrice > highSeries[impulse.start - 1]
      : impulse.extremePrice < lowSeries[impulse.start - 1]
    if (!localExtreme) return
  }

  addLevel(impulse.extremeBar, impulse.extremePrice,
    impulse.state > 0 ? 1 : -1, bar)
}

function trailingMaxAbs(series, bar, lookback) {
  const first = Math.max(0, bar - lookback + 1)
  let result = 1
  for (let i = first; i <= bar; i++) result = Math.max(result, Math.abs(series[i]))
  return result
}

function trailingMax(series, bar, lookback) {
  const first = Math.max(0, bar - lookback + 1)
  let result = 1
  for (let i = first; i <= bar; i++) result = Math.max(result, series[i])
  return result
}

function onBar(index) {
  const bar = barIndex()

  // Cache the primary data so later confirmation logic can address absolute bars.
  openSeries[bar] = candles.open()
  highSeries[bar] = candles.high()
  lowSeries[bar] = candles.low()
  closeSeries[bar] = candles.close()
  volumeSeries[bar] = candles.volume()
  unixSeries[bar] = candles.unix()

  const delta = candles.buyVolume() - candles.sellVolume()
  deltaSeries[bar] = delta

  const previousRolling = bar === 0 ? 0 : rollingDeltaSeries[bar - 1]
  const expiredDelta = bar >= deltaPeriod ? deltaSeries[bar - deltaPeriod] : 0
  rollingDeltaSeries[bar] = previousRolling + delta - expiredDelta

  // Crypto-friendly session CVD: reset at each UTC day boundary.
  const newSession = bar === 0 || timeframe.change("1D")
  cvdSeries[bar] = newSession ? delta : cvdSeries[bar - 1] + delta

  // Exclude the current bar from every adaptive window, exactly as the source.
  const targetScale = percentileScale(bar) * thresholdMultiplier
  const previousScale = bar === 0 ? targetScale : adaptiveScaleSeries[bar - 1]
  adaptiveScaleSeries[bar] = Math.max(1, smoothScale(previousScale, targetScale))

  const targets = neutralTargets(bar, adaptiveScaleSeries[bar])
  const previousEntry = bar === 0 ? targets.entry : entrySeries[bar - 1]
  const previousExit = bar === 0 ? targets.exit : exitSeries[bar - 1]
  entrySeries[bar] = smoothThreshold(previousEntry, targets.entry)
  exitSeries[bar] = Math.min(entrySeries[bar],
    smoothThreshold(previousExit, targets.exit))

  const state = resolveState(bar, rollingDeltaSeries[bar],
    entrySeries[bar], exitSeries[bar])
  stateSeries[bar] = state

  let candleColor = neutralColor
  if (state !== 0) {
    let percent = rollingDeltaSeries[bar] * 100 / adaptiveScaleSeries[bar]
    percent = clamp(percent, -100, 100)
    percent *= colorIntensity / 100
    const shaped = Math.abs(percent) / 100
    if (shaped > 0 && colorGamma !== 1) {
      percent = Math.sign(percent) * Math.pow(shaped, colorGamma) * 100
    }
    candleColor = pressureScale.sample(clamp(percent, -100, 100))
  }

  // MMT cannot replace the terminal's native candle renderer. This overlays a
  // faithful OHLC copy; hide native candles manually if you want only this layer.
  if (showCandles) {
    plotCandle("Delta pressure candles",
      openSeries[bar], highSeries[bar], lowSeries[bar], closeSeries[bar], {
        bodyColor: candleColor,
        wickColor: candleColor,
        borderColor: candleColor,
        showLabel: false,
        showValue: false,
        forceOverlay: true
      })
  }

  // Existing levels must react to intrabar touches, not only new bars.
  updateActiveLevels(bar)

  const impulse = confirmedImpulse(bar)
  if (context.isNew) {
    if (showWickLevels) {
      if (includeNeutralLevels && bar >= 2) processNeutralPivot(bar)
      processImpulseLevel(bar, impulse)
      // A newly projected level can be touched by the current candle. ATAS's
      // LineTillTouch handles that immediately, so run the touch pass again.
      updateActiveLevels(bar)
    }

    if (enableImpulseAlerts && context.isRealtime && context.isLast && impulse &&
        impulse.start !== lastAlertedImpulseStart) {
      lastAlertedImpulseStart = impulse.start

      Marker("impulse_alert_" + impulse.start, {
        x: unixSeries[impulse.extremeBar],
        y: impulse.extremePrice,
        shape: shape.square,
        size: 6,
        color: impulse.state > 0 ? "#00c853" : "#d50000",
        zIndex: 5,
        forceOverlay: true
      })

      impulseAlert.trigger({
        direction: impulse.state > 0 ? "Bullish" : "Bearish",
        price: impulse.extremePrice,
        peak_delta: impulse.peakDelta,
        bars: impulse.length
      })
    }
  }

  // The source embeds this at the bottom of the price region. MMT's supported
  // equivalent is this script's pane, while candles/levels are force-overlaid.
  if (showCvd) {
    const paneLookback = Math.max(50, activeLookback)
    const maxAbsCvd = trailingMaxAbs(cvdSeries, bar, paneLookback)

    if (showVolumeBackdrop) {
      const maxVolume = trailingMax(volumeSeries, bar, paneLookback)
      const scaledVolume = maxVolume > 0
        ? volumeSeries[bar] / maxVolume * maxAbsCvd
        : 0
      plotHistogram("Volume backdrop", scaledVolume, {
        color: volumeBackdropColor,
        showLabel: false,
        showValue: false
      })
    }

    let cvdColor = cvdSeries[bar] >= 0 ? cvdPositiveColor : cvdNegativeColor
    if (cvdAdaptiveColors) {
      const strength = clamp(cvdSeries[bar] / maxAbsCvd, -1, 1) * 100
      cvdColor = pressureScale.sample(strength)
    }
    plotHistogram("Session CVD", cvdSeries[bar], {
      color: cvdColor,
      showLabel: true,
      showValue: true
    })
    plot("CVD zero", 0, {
      color: color.transp(color.silver, 50),
      width: 1,
      showLabel: false,
      showValue: false
    })
  }
}
