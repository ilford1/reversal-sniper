# MMT Workspace — Auto-Loaded Context

This folder contains **MMT (Momentum Trader Terminal)** indicator scripts (JavaScript).
Before writing or modifying indicators, read **`MMT_INDICATOR_GUIDE.md`** — it documents
the full SDK surface, architecture patterns, and the two existing indicators, so you
don't need to re-scan every file.

## Quick facts

- `//@version=2` + `indicator("Name", overlay)` header; main loop is `function onBar(index)`.
- Data: `subscribe(data.OHLCV)` → `candles.open()/.high()/.low()/.close()/.volume()/.unix()/.buyVolume()/.sellVolume()/.buyCount()/.sellCount()`.
- Optional feeds (guard with `typeof` before subscribing): `data.OI` (`oiSub.close()`), `data.STAT` (`statSub.sellLiq()/.buyLiq()`).
- Inputs: `input.tab/group/select/int/float/bool/color`, conditional via `onlyIf: input.when("key","Value")` / `input.whenTrue("key")`.
- History: `Series("unique.id")`, indexed oldest→newest by `barIndex()`.
- Render: `plot()`, `plotHistogram()`, `plotCandle()`, `Line()`, `Marker()`, `color.scale().sample()`, `color.transp()`.
- Alerts: `alert.define("id", { title, fields })` + `.trigger({...})`, only when `context.isRealtime && context.isLast`.
- Context: `context.isNew/isRealtime/isLast/tickSize`, `timeframe.change("1D")` for session resets.
- Pattern: preset select → `let` active params → `if/else`; impulse state machine
  (entry/exit hysteresis bands); `confirmedImpulse(bar)` for extremes; Line-till-touch
  emulation via `activeLevels` array; confluence scoring with graceful feed degradation.

## Files

| File | Role |
|---|---|
| `Delta Candle Pressure.js` | Base indicator: adaptive pressure candles, wick levels, session CVD |
| `Reversal Sniper.js` | Signal indicator: DCP core math (frozen copy) + 7-component confluence scoring |
| `Tape Pulse.js` | Signal indicator (display name: Extreme Decay): same frozen DCP core + exhaustion scoring (density / rhythm / climax decay) |
| `OI Buildup.js` | Level indicator (display name: OI Buildup S/R): OI-weighted dynamic S/R levels from buildup zones + OI/price divergence |
| `MMT_INDICATOR_GUIDE.md` | **Full SDK + architecture reference — read this first** |
| `Reversal Sniper Guide.html` | End-user guide for Reversal Sniper |

> Keep `MMT_INDICATOR_GUIDE.md` in sync when the indicators change.
