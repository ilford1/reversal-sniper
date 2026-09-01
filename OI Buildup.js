//@version=2
indicator("OI Buildup S/R", false)

// ============================================================
// INPUTS
// ============================================================

input.tab("Detection", { key: "oib_detection_tab" })

const preset = input.select("Preset", 0, {
  key: "oib_preset",
  selectables: ["Balanced", "Strict", "Aggressive", "Custom"],
  description: "Balanced = moderate / Strict = fewer, stronger levels / Aggressive = more, lighter levels. Custom exposes all thresholds."
})

input.group("Buildup thresholds", {
  key: "oib_custom_group",
  collapsible: true,
  collapsed: true
})

const customWindow = input.int("Buildup window (bars)", 24, {
  key: "oib_window", min: 3, max: 120,
  onlyIf: input.when("oib_preset", "Custom")
})
const customGrowthPct = input.float("Min OI growth %", 2.0, {
  key: "oib_growth", min: 0.5, max: 20.0,
  onlyIf: input.when("oib_preset", "Custom")
})
const customPurityPct = input.float("Base purity %", 60, {
  key: "oib_purity", min: 50, max: 100,
  onlyIf: input.when("oib_preset", "Custom"),
  description: "Min share of accumulation volume initiated by the dominant side (long vs short) for a valid base"
})
const customMinAccumBars = input.int("Min accumulation bars", 3, {
  key: "oib_min_accum", min: 1, max: 20,
  onlyIf: input.when("oib_preset", "Custom")
})
const customMergeTolerance = input.int("Merge tolerance (ticks)", 6, {
  key: "oib_merge", min: 1, max: 100,
  onlyIf: input.when("oib_preset", "Custom")
})
const customMaxLevels = input.int("Max levels", 6, {
  key: "oib_max_levels", min: 1, max: 20,
  onlyIf: input.when("oib_preset", "Custom")
})
const customDivWindow = input.int("Divergence swing window", 10, {
  key: "oib_div_window", min: 3, max: 50,
  onlyIf: input.when("oib_preset", "Custom")
})
const customDivOiMinPct = input.float("Divergence min OI delta %", 1.5, {
  key: "oib_div_oi_min", min: 0.5, max: 10.0,
  onlyIf: input.when("oib_preset", "Custom")
})

input.tab("Levels", { key: "oib_levels_tab" })

const supportColor = input.color("Support color", "#00c853", {
  key: "oib_sup_color", description: "Level color when price is above it"
})
const resistanceColor = input.color("Resistance color", "#d50000", {
  key: "oib_res_color", description: "Level color when price is below it"
})
const latestLevelColor = input.color("Latest level color", "#ffb300", {
  key: "oib_latest_color", description: "Thick gold line for the most recent buildup"
})
const levelWidth = input.int("Level width", 1, {
  key: "oib_level_width", min: 1, max: 5
})
const latestLevelWidth = input.int("Latest level width", 2, {
  key: "oib_latest_width", min: 1, max: 5
})
const extendLevelFwd = input.bool("Extend levels forward", true, {
  key: "oib_extend", description: "When disabled, freezes at creation bar"
})
const freezeOnTouch = input.bool("Freeze on touch", true, {
  key: "oib_freeze", description: "Level stops extending when price touches it"
})
const showLatestMarker = input.bool("Show latest buildup marker on price", true, {
  key: "oib_latest_marker"
})

input.tab("Signals", { key: "oib_signals_tab" })

input.group("Divergence", {
  key: "oib_div_group",
  collapsible: true,
  collapsed: false
})
const useDivergence = input.bool("OI/price divergence", true, {
  key: "oib_use_div"
})
const showDivMarkers = input.bool("Show divergence markers", true, {
  key: "oib_show_div_markers"
})
const bearishDivColor = input.color("Bearish divergence", "#ff5252", {
  key: "oib_bear_div"
})
const bullishDivColor = input.color("Bullish divergence", "#00e676", {
  key: "oib_bull_div"
})

input.group("Alerts", {
  key: "oib_alert_group",
  collapsible: true,
  collapsed: false
})
const enableAlerts = input.bool("Enable alerts", true, {
  key: "oib_enable_alerts"
})

const buildupAlert = alert.define("oi.buildup", {
  title: "OI Buildup Level",
  description: "A fresh OI buildup base detected — level drawn at the OI-weighted price.",
  fields: [
    { key: "side", type: "string" },
    { key: "price", type: "number" },
    { key: "oi_growth_pct", type: "number" },
    { key: "bars", type: "number" }
  ]
})

const divergenceAlert = alert.define("oi.divergence", {
  title: "OI/Price Divergence",
  description: "Price made a new swing while OI reset — momentum divergence detected.",
  fields: [
    { key: "direction", type: "string" },
    { key: "price", type: "number" },
    { key: "div_type", type: "string" }
  ]
})

const offsideAlert = alert.define("oi.offside", {
  title: "OI Buildup Offside",
  description: "Price moved far from the latest OI buildup level — the opposite side is trapped.",
  fields: [
    { key: "side", type: "string" },
    { key: "distance_pct", type: "number" },
    { key: "price", type: "number" },
    { key: "level", type: "number" }
  ]
})

input.group("Offside", {
  key: "oib_offside_group",
  collapsible: true,
  collapsed: false
})
const offsideThresholdPct = input.float("Offside alert threshold %", 1.5, {
  key: "oib_offside_thresh", min: 0.1, max: 20.0,
  description: "Fire oi.offside when price is this far (percent) from the latest buildup level"
})

input.tab("Display", { key: "oib_display_tab" })

input.group("OI pane", {
  key: "oib_pane_group",
  collapsible: true,
  collapsed: false
})
const showOiPane = input.bool("Show OI delta pane", true, {
  key: "oib_show_pane"
})
const showBuildupDetect = input.bool("Highlight fresh buildup bars", true, {
  key: "oib_show_buildup"
})
const showRawOi = input.bool("Show raw OI line", true, {
  key: "oib_show_raw"
})
const buildupActiveColor = input.color("Buildup active color", "#4caf50", {
  key: "oib_buildup_color"
})
const buildupInactiveColor = input.color("Buildup inactive color", "#2f2f38", {
  key: "oib_buildup_inactive"
})
const rawOiColor = input.color("Raw OI line", "#ffb300", {
  key: "oib_raw_oi_color"
})

input.group("Offside gauge", {
  key: "oib_offside_display_group",
  collapsible: true,
  collapsed: false
})
const showOffsideGauge = input.bool("Show offside gauge", true, {
  key: "oib_show_offside",
  description: "Distance of price from the latest buildup level; positive = shorts trapped, negative = longs trapped"
})
const showLsRatio = input.bool("Show L/S ratio line", true, {
  key: "oib_show_ls"
})
const showNetSplit = input.bool("Show net longs/shorts split", true, {
  key: "oib_show_netsplit"
})
const shortsTrappedColor = input.color("Shorts trapped color", "#00e676", {
  key: "oib_short_trapped",
  description: "Price above the level — shorts are underwater (cover fuel)"
})
const longsTrappedColor = input.color("Longs trapped color", "#ff5252", {
  key: "oib_long_trapped",
  description: "Price below the level — longs are underwater (stop fuel)"
})

// ============================================================
// PRESET-DERIVED PARAMETERS
// ============================================================

let activeWindow = 24
let activeGrowthPct = 2.0
let activePurityPct = 60
let activeMinAccumBars = 3
let activeMergeTolerance = 6
let activeMaxLevels = 6
let activeDivWindow = 10
let activeDivOiMinPct = 1.5

if (preset === "Balanced") {
  // defaults — keep as-is
} else if (preset === "Strict") {
  activeWindow = 40
  activeGrowthPct = 3.0
  activePurityPct = 70
  activeMinAccumBars = 5
  activeMergeTolerance = 4
  activeMaxLevels = 6
  activeDivWindow = 12
  activeDivOiMinPct = 2.5
} else if (preset === "Aggressive") {
  activeWindow = 12
  activeGrowthPct = 1.2
  activePurityPct = 50
  activeMinAccumBars = 2
  activeMergeTolerance = 10
  activeMaxLevels = 8
  activeDivWindow = 8
  activeDivOiMinPct = 1.0
} else if (preset === "Custom") {
  activeWindow = customWindow
  activeGrowthPct = customGrowthPct
  activePurityPct = customPurityPct
  activeMinAccumBars = customMinAccumBars
  activeMergeTolerance = customMergeTolerance
  activeMaxLevels = customMaxLevels
  activeDivWindow = customDivWindow
  activeDivOiMinPct = customDivOiMinPct
}

// ============================================================
// SUBSCRIPTIONS
// ============================================================

const candles = subscribe(data.OHLCV)

let oiSub = null
if (typeof data !== "undefined" && data &&
    typeof data.OI !== "undefined" && data.OI) {
  oiSub = subscribe(data.OI)
}

// ============================================================
// SERIES STORAGE
// ============================================================

const openSeries = Series("oib.open")
const highSeries = Series("oib.high")
const lowSeries = Series("oib.low")
const closeSeries = Series("oib.close")
const volumeSeries = Series("oib.volume")
const unixSeries = Series("oib.unix")
const buyVolSeries = Series("oib.buy_vol")
const sellVolSeries = Series("oib.sell_vol")
const deltaSeries = Series("oib.delta")
const oiSeries = Series("oib.oi")
const oiDeltaSeries = Series("oib.oi_delta")
const oiDeltaAbsSeries = Series("oib.oi_delta_abs")
const cumPosDeltaSeries = Series("oib.cum_pos")
const scaleSeries = Series("oib.scale")
const buildupFreshSeries = Series("oib.fresh")

// ============================================================
// STATE TRACKING
// ============================================================

// Level management (same pattern as DCP's activeLevels)
let activeLevels = []
let levelSequence = 0
let lastAlertedLevelBar = -1

// Offside alert dedup: armed once price is back near the level,
// fires once per fresh crossing of the offside threshold.
let offsideArmed = false

// Detection cooldown: one buildup = one level (until cumPos resets)
let lastDetectionBar = -1

// Divergence
let lastSwingHigh = null
let lastSwingLow = null
let lastDivergedHighBar = -1
let lastDivergedLowBar = -1

// ============================================================
// HELPER FUNCTIONS
// ============================================================

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value))
}

function isFiniteNumber(value) {
  return typeof value === "number" && value === value &&
         value < 1.7976931348623157e308 && value > -1.7976931348623157e308
}

function percentile(sortedSamples, p) {
  if (sortedSamples.length === 0) return 0
  let i = Math.ceil((sortedSamples.length - 1) * p)
  i = clamp(i, 0, sortedSamples.length - 1)
  return sortedSamples[i]
}

function percentileRank(series, value, bar, lookback) {
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

function oiWeightedAvgPrice(startBar, endBar) {
  // Where did the bulk of the OI buildup actually happen? Weight each bar's
  // typical price by its positive OI delta — "use OI to draw the lines".
  let weightedSum = 0
  let weightTotal = 0
  for (let i = startBar; i <= endBar; i++) {
    const d = oiDeltaSeries[i]
    if (isFiniteNumber(d) && d > 0) {
      const typ = (highSeries[i] + lowSeries[i] + closeSeries[i]) / 3
      weightedSum += typ * d
      weightTotal += d
    }
  }
  if (weightTotal <= 0) {
    // Fall back to the close at the zone end
    return closeSeries[endBar]
  }
  return weightedSum / weightTotal
}

// ============================================================
// LEVEL MANAGEMENT
// ============================================================

function levelAlreadyExists(price) {
  const tolerance = Math.max(0.0000001, context.tickSize || 0.0000001) * activeMergeTolerance
  for (let i = 0; i < activeLevels.length; i++) {
    const lvl = activeLevels[i]
    if (lvl.active && Math.abs(lvl.price - price) <= tolerance) return true
  }
  return false
}

function addLevel(priceBar, price, strength, endBar, baseInfo) {
  if (levelAlreadyExists(price)) return false

  // Clamp level count — drop oldest active levels
  while (activeLevels.length >= activeMaxLevels) {
    let oldestIdx = -1
    let oldestBar = Infinity
    for (let i = 0; i < activeLevels.length; i++) {
      if (activeLevels[i].startBar < oldestBar) {
        oldestBar = activeLevels[i].startBar
        oldestIdx = i
      }
    }
    if (oldestIdx >= 0) {
      activeLevels.splice(oldestIdx, 1)
    }
  }

  const key = "oib_" + levelSequence
  levelSequence++
  const side = price <= closeSeries[endBar] ? 1 : -1
  const color = side > 0 ? supportColor : resistanceColor
  const w = clamp(levelWidth + Math.floor(strength * 2), 1, 5)

  const handle = Line(key, {
    x1: unixSeries[priceBar],
    y1: price,
    x2: unixSeries[endBar],
    y2: price,
    color: color,
    width: w,
    style: linestyle.solid,
    forceOverlay: true,
    zIndex: 3
  })

  const info = baseInfo || {}
  activeLevels.push({
    handle,
    price,
    side,
    strength,
    startBar: priceBar,
    endBar,
    active: true,
    isLatest: true,
    // Buildup character snapshot (OI x Delta matrix at detection)
    oiGrowthPct: info.oiGrowthPct || 0,
    baseSide: info.baseSide || "Longs",   // dominant initiator of the buildup
    purity: info.purity || 0,             // dominant-side share of accumulation volume
    lsRatio: info.lsRatio || 1,           // L/S ratio over accumulation bars
    netLongs: info.netLongs || 0,         // accumulated long-initiated delta
    netShorts: info.netShorts || 0,       // accumulated short-initiated delta
    accumBars: info.accumBars || 0,
    // Live participation from the mark point forward
    liveBuyVol: 0,
    liveSellVol: 0,
    liveNetLongs: 0,
    liveNetShorts: 0,
    // Offside state
    offsidePct: 0,
    maxOffsideAbs: 0
  })

  // All other levels are no longer the latest
  for (let i = 0; i < activeLevels.length - 1; i++) {
    activeLevels[i].isLatest = false
  }

  // Marker at the latest level on price
  if (showLatestMarker) {
    Marker("oib_latest_" + key, {
      x: unixSeries[endBar],
      y: price,
      shape: shape.square,
      size: latestLevelWidth,
      color: latestLevelColor,
      zIndex: 6,
      forceOverlay: true
    })
  }

  return true
}

function getLatestLevel() {
  for (let i = activeLevels.length - 1; i >= 0; i--) {
    if (activeLevels[i].active && activeLevels[i].isLatest) return activeLevels[i]
  }
  return null
}

function updateActiveLevels(bar) {
  for (let i = 0; i < activeLevels.length; i++) {
    const lvl = activeLevels[i]
    if (!lvl.active) continue

    // Determine side (support = price above, resistance = price below)
    lvl.side = closeSeries[bar] >= lvl.price ? 1 : -1

    // Extend the line to the current bar
    if (extendLevelFwd) {
      lvl.handle.set({ x2: unixSeries[bar], y2: lvl.price })
    }

    // Color: latest level gets gold, others get side-based color
    if (lvl.isLatest) {
      lvl.handle.set({ color: latestLevelColor })
    } else {
      lvl.handle.set({ color: lvl.side > 0 ? supportColor : resistanceColor })
    }

    // Touch detection: freeze when price reaches the level
    if (freezeOnTouch) {
      const touched = lvl.side > 0
        ? lowSeries[bar] <= lvl.price
        : highSeries[bar] >= lvl.price
      if (touched) lvl.active = false
    }
  }
}

// ============================================================
// BUILDUP DETECTION
// ============================================================
// Core concept from the thread: track where Open Interest *builds*.
// No reset/finalize machine — when cumulative positive OI delta over
// the trailing window *freshly crosses* the growth threshold, a level
// is drawn immediately at the OI-weighted price. The OI x Delta matrix
// then sizes the base: how much of the accumulation was long-initiated
// vs short-initiated (netLongs / netShorts + L/S ratio).

function computeBase(startBar, endBar) {
  // OI x Delta matrix over the accumulation window:
  //   dOI > 0 & delta > 0  -> longs adding
  //   dOI > 0 & delta < 0  -> shorts adding
  // (covering/liquidating bars have dOI < 0 and are excluded — they
  //  are not buildup.)
  let buyVol = 0
  let sellVol = 0
  let longVol = 0
  let shortVol = 0
  let netLongs = 0
  let netShorts = 0
  let accumBars = 0

  for (let i = startBar; i <= endBar; i++) {
    const dOi = oiDeltaSeries[i]
    if (!isFiniteNumber(dOi) || dOi <= 0) continue // only genuine OI-positive bars
    accumBars++

    const bv = buyVolSeries[i]
    const sv = sellVolSeries[i]
    const d = deltaSeries[i]

    if (isFiniteNumber(bv)) buyVol += bv
    if (isFiniteNumber(sv)) sellVol += sv

    if (isFiniteNumber(d)) {
      const vol = (isFiniteNumber(bv) && isFiniteNumber(sv)) ? bv + sv : 0
      if (d > 0) {
        longVol += vol
        netLongs += d
      } else if (d < 0) {
        shortVol += vol
        netShorts += -d
      }
    }
  }

  const totalVol = longVol + shortVol
  const purity = totalVol > 0 ? Math.max(longVol, shortVol) / totalVol : 0
  const baseSide = longVol >= shortVol ? "Longs" : "Shorts"
  const lsRatio = sellVol > 0 ? buyVol / sellVol : (buyVol > 0 ? 10 : 1)

  return {
    buyVol,
    sellVol,
    longVol,
    shortVol,
    netLongs,
    netShorts,
    accumBars,
    purity,
    baseSide,
    lsRatio
  }
}

function checkBuildup(bar) {
  if (!oiSub) return

  const cum = cumPosDeltaSeries[bar]
  const oi = oiSeries[bar]
  if (!isFiniteNumber(oi) || oi <= 0 || !isFiniteNumber(cum)) return

  const growthPct = cum / oi * 100
  const prevOi = bar > 0 ? oiSeries[bar - 1] : 0
  const prevCum = bar > 0 ? cumPosDeltaSeries[bar - 1] : 0
  const prevGrowthPct = (isFiniteNumber(prevOi) && prevOi > 0 && isFiniteNumber(prevCum))
    ? prevCum / prevOi * 100
    : 0

  // Fresh crossing only (rising edge). cumPos is a trailing-window sum,
  // so once OI stops building it naturally decays below the threshold —
  // the next episode re-crosses and triggers a new level.
  const freshCross = growthPct >= activeGrowthPct && prevGrowthPct < activeGrowthPct
  if (!freshCross) return

  // Cooldown: keep at least one window between levels of one episode
  if (bar - lastDetectionBar < activeWindow) return

  // Zone = trailing window where OI built
  const startBar = Math.max(0, bar - activeWindow + 1)
  const price = oiWeightedAvgPrice(startBar, bar)
  if (!isFiniteNumber(price)) return

  // Base definition: enough duration + matrix-dominant direction.
  const base = computeBase(startBar, bar)
  if (base.accumBars < activeMinAccumBars) return
  if (base.purity < activePurityPct / 100) return

  const strength = clamp(growthPct / activeGrowthPct, 0.5, 3.0)
  const created = addLevel(bar, price, strength, bar, {
    oiGrowthPct: growthPct,
    baseSide: base.baseSide,
    purity: base.purity,
    lsRatio: base.lsRatio,
    netLongs: base.netLongs,
    netShorts: base.netShorts,
    accumBars: base.accumBars
  })

  if (created) {
    lastDetectionBar = bar
    if (enableAlerts && context.isRealtime && context.isLast &&
        bar !== lastAlertedLevelBar) {
      lastAlertedLevelBar = bar
      buildupAlert.trigger({
        side: base.baseSide,
        price: price,
        oi_growth_pct: growthPct,
        bars: base.accumBars
      })
    }
  }
}

// ============================================================
// OI / PRICE DIVERGENCE ("OI resets while price makes higher lows")
// ============================================================

function fireDivergence(confirmBar, swingBar, kind, price) {
  if (showDivMarkers) {
    Marker("oib_div_" + kind + "_" + swingBar, {
      x: unixSeries[swingBar],
      y: price,
      shape: shape.square,
      size: 5,
      color: kind === "bearish" ? bearishDivColor : bullishDivColor,
      zIndex: 6,
      forceOverlay: true
    })
  }
  if (enableAlerts && context.isRealtime && context.isLast) {
    divergenceAlert.trigger({
      direction: kind === "bearish" ? "Bearish" : "Bullish",
      price: price,
      div_type: kind === "bearish" ? "price HH / OI lower high" : "price LL / OI higher low"
    })
  }
}

function checkSwing(bar) {
  if (!useDivergence || !oiSub) return
  const w = activeDivWindow
  if (bar < w) return

  // Candidate swing bar confirmed w bars ago (needs w forward bars).
  const cand = bar - w
  const h = highSeries[cand]
  const l = lowSeries[cand]
  const oiAt = oiSeries[cand]
  if (!isFiniteNumber(oiAt) || oiAt <= 0) return

  let isHigh = true
  let isLow = true
  for (let i = cand - w; i <= cand + w; i++) {
    if (i === cand || i < 0) continue
    if (highSeries[i] >= h) isHigh = false
    if (lowSeries[i] <= l) isLow = false
    if (!isHigh && !isLow) break
  }

  if (isHigh) {
    if (lastSwingHigh && lastSwingHigh.bar < cand) {
      const priceHigher = h > lastSwingHigh.price
      const oiReset = oiAt < lastSwingHigh.oi * (1 - activeDivOiMinPct / 100)
      if (priceHigher && oiReset && lastSwingHigh.bar !== lastDivergedHighBar) {
        lastDivergedHighBar = lastSwingHigh.bar
        fireDivergence(bar, cand, "bearish", h)
      }
    }
    lastSwingHigh = { bar: cand, price: h, oi: oiAt }
  }

  if (isLow) {
    if (lastSwingLow && lastSwingLow.bar < cand) {
      const priceLower = l < lastSwingLow.price
      const oiAccum = oiAt > lastSwingLow.oi * (1 + activeDivOiMinPct / 100)
      if (priceLower && oiAccum && lastSwingLow.bar !== lastDivergedLowBar) {
        lastDivergedLowBar = lastSwingLow.bar
        fireDivergence(bar, cand, "bullish", l)
      }
    }
    lastSwingLow = { bar: cand, price: l, oi: oiAt }
  }
}

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
  // Tape (buy/sell volume + delta), guarded like DCP / Reversal Sniper
  const buyVol = candles.buyVolume()
  const sellVol = candles.sellVolume()
  buyVolSeries[bar] = isFiniteNumber(buyVol) ? buyVol : 0
  sellVolSeries[bar] = isFiniteNumber(sellVol) ? sellVol : 0
  deltaSeries[bar] = buyVolSeries[bar] - sellVolSeries[bar]

  // ── OI + per-bar OI delta ──
  let oi = 0
  if (oiSub) {
    oi = oiSub.close()
  }
  oiSeries[bar] = oi

  let oiDelta = 0
  if (oiSub && isFiniteNumber(oi) && oi > 0) {
    const prevOi = bar === 0 ? oi : oiSeries[bar - 1]
    if (isFiniteNumber(prevOi) && prevOi > 0) {
      oiDelta = oi - prevOi
    }
  }
  oiDeltaSeries[bar] = oiDelta
  oiDeltaAbsSeries[bar] = Math.abs(oiDelta)

  // ── Trailing-window cumulative POSITIVE OI delta ──
  const first = Math.max(0, bar - activeWindow + 1)
  let cumPos = 0
  for (let i = first; i <= bar; i++) {
    const d = oiDeltaSeries[i]
    if (isFiniteNumber(d) && d > 0) cumPos += d
  }
  cumPosDeltaSeries[bar] = cumPos

  // ── Adaptive scale (90th percentile of |OI delta|, trailing) ──
  const lookback = Math.max(50, activeWindow * 5)
  const samples = []
  for (let i = Math.max(0, bar - lookback); i < bar; i++) {
    const d = oiDeltaAbsSeries[i]
    if (isFiniteNumber(d) && d > 0) samples.push(d)
  }
  samples.sort((a, b) => a - b)
  scaleSeries[bar] = Math.max(0.0000001, percentile(samples, 0.90))

  // ── Pane scale for the raw OI line (trailing max of OI) ──
  let oiMax = 1
  for (let i = Math.max(0, bar - lookback); i <= bar; i++) {
    const v = oiSeries[i]
    if (isFiniteNumber(v) && v > oiMax) oiMax = v
  }

  // ── Buildup detection (rising edge — draws level immediately) ──
  if (oiSub) checkBuildup(bar)

  // ── Fresh-buildup flag (colors the pane) ──
  buildupFreshSeries[bar] = 0
  if (oiSub && isFiniteNumber(oi) && oi > 0 && isFiniteNumber(cumPos)) {
    if (cumPos / oi * 100 >= activeGrowthPct) {
      buildupFreshSeries[bar] = 1
    }
  }

  // ── Advance / recolor existing levels every tick (intrabar touches) ──
  updateActiveLevels(bar)

  // ── Latest-level live participation (new bars only) ──
  const latest = getLatestLevel()
  if (context.isNew && latest) {
    const bv = buyVolSeries[bar]
    const sv = sellVolSeries[bar]
    if (isFiniteNumber(bv)) latest.liveBuyVol += bv
    if (isFiniteNumber(sv)) latest.liveSellVol += sv
    const d = deltaSeries[bar]
    if (isFiniteNumber(d)) {
      if (d > 0) latest.liveNetLongs += d
      else if (d < 0) latest.liveNetShorts += -d
    }
  }

  // ── Offside (every tick, latest level only) ──
  if (latest) {
    latest.offsidePct = (closeSeries[bar] - latest.price) / Math.max(0.0000001, latest.price) * 100
    latest.maxOffsideAbs = Math.max(latest.maxOffsideAbs, Math.abs(latest.offsidePct))
  }

  // ── Offside alert: arm below threshold, fire on crossing (realtime only) ──
  if (enableAlerts && context.isRealtime && context.isLast) {
    if (latest) {
      const abs = Math.abs(latest.offsidePct)
      if (abs < offsideThresholdPct) {
        offsideArmed = true
      } else if (offsideArmed && abs >= offsideThresholdPct) {
        offsideArmed = false
        offsideAlert.trigger({
          side: latest.offsidePct > 0 ? "Shorts" : "Longs",
          distance_pct: latest.offsidePct,
          price: closeSeries[bar],
          level: latest.price
        })
      }
    } else {
      offsideArmed = false
    }
  }

  // ── OI/price divergence on new bars only ──
  if (context.isNew) {
    checkSwing(bar)
  }

  // ── Pane dashboard ──
  if (showOiPane) {
    const scaleRef = scaleSeries[bar]
    const deltaPct = scaleRef > 0 ? oiDelta / scaleRef * 100 : 0

    let histColor = buildupInactiveColor
    if (showBuildupDetect && buildupFreshSeries[bar] === 1) {
      histColor = buildupActiveColor
    }
    plotHistogram("OI delta", deltaPct, {
      color: histColor,
      showLabel: true,
      showValue: true
    })

    if (showRawOi && oiSub) {
      const rawPct = oiMax > 1 ? oi / oiMax * 100 : 0
      plot("Raw OI", rawPct, {
        color: rawOiColor,
        width: 1,
        style: linestyle.solid,
        showLabel: true,
        showValue: false
      })
    }

    // ── Offside gauge: +price above level (shorts trapped) / − below (longs trapped) ──
    if (showOffsideGauge && latest) {
      const off = clamp(latest.offsidePct, -20, 20)
      plotHistogram("Offside", off, {
        color: off >= 0 ? shortsTrappedColor : longsTrappedColor,
        showLabel: true,
        showValue: true
      })
    }

    // ── Live L/S ratio line (latest level, from the mark forward) ──
    if (showLsRatio && latest) {
      const ls = latest.liveSellVol > 0
        ? clamp(latest.liveBuyVol / latest.liveSellVol, 0, 5)
        : (latest.liveBuyVol > 0 ? 5 : 1)
      plot("L/S ratio", ls, {
        color: latest.baseSide === "Longs" ? supportColor : resistanceColor,
        width: 1,
        style: linestyle.solid,
        showLabel: true,
        showValue: true
      })
    }

    // ── Net longs/shorts split (matrix-classified, live) ──
    if (showNetSplit && latest) {
      const total = latest.liveNetLongs + latest.liveNetShorts
      const longPct = total > 0 ? latest.liveNetLongs / total * 100 : 0
      const shortPct = total > 0 ? latest.liveNetShorts / total * 100 : 0
      plotHistogram("Net longs", longPct, {
        color: supportColor,
        showLabel: false,
        showValue: false
      })
      plotHistogram("Net shorts", -shortPct, {
        color: resistanceColor,
        showLabel: false,
        showValue: false
      })
    }

    plot("OI zero", 0, {
      color: color.transp(color.silver, 50),
      width: 1,
      showLabel: false,
      showValue: false
    })
  }
}
