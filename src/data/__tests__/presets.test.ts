import { describe, it, expect } from 'vitest'
import { DESIGN_PRESETS, KUDOS_X2_PRESET, MK3_REFERENCE_PRESET } from '@/data/presets'
import { SEED_DRIVERS } from '@/data/seedDrivers'
import { layoutBandPositions } from '@/lib/acoustic/baffleLayout'
import { portLengthForTuning } from '@/engine/enclosure/vented'
import { calcCabinetResponse } from '@/lib/acoustic/cabinetResponse'
import { generateFrequencies } from '@/lib/acoustic/thieleSmall'

describe('Built-in design presets', () => {
  it('every preset band resolves to a seeded driver', () => {
    for (const preset of DESIGN_PRESETS) {
      for (const band of preset.design.bands) {
        expect(SEED_DRIVERS.find((d) => d.id === band.driverId), `${preset.id}: ${band.driverId}`).toBeDefined()
      }
    }
  })

  it('ways matches band count and gains only attenuate (band 0 locked at 0)', () => {
    for (const preset of DESIGN_PRESETS) {
      expect(preset.design.bands).toHaveLength(preset.design.ways)
      expect(preset.design.bands[0]!.gain).toBe(0)
      for (const band of preset.design.bands) expect(band.gain).toBeLessThanOrEqual(0)
    }
  })
})

describe('Kudos X2 preset', () => {
  const d = KUDOS_X2_PRESET.design

  it('is a 3-way in the measured X2 cabinet (720×165, ported Ø70)', () => {
    expect(d.ways).toBe(3)
    expect(d.baffleWidth).toBe(165)
    expect(d.baffleHeight).toBe(720)
    expect(d.cabinetType).toBe('ported')
    expect(d.portDiameter).toBe(70)
    expect(d.numPorts).toBe(1)
  })

  it('port tuning reproduces the physical Ø70×250mm port through the app port model', () => {
    const areaM2 = Math.PI * 0.035 * 0.035
    const lenMm = portLengthForTuning(d.portFb!, d.portVb! / 1000, areaM2) * 1000
    expect(lenMm).toBeGreaterThan(225)
    expect(lenMm).toBeLessThan(275)
  })

  it('front positions land exactly at the measured heights (y from bottom)', () => {
    const positions = layoutBandPositions(d.bands, SEED_DRIVERS, d.baffleWidth, d.baffleHeight)!
    expect(positions).toHaveLength(2)
    const mid = positions.find((p) => p.bandIndex === 1)!
    const tweeter = positions.find((p) => p.bandIndex === 2)!
    // 185mm / 65mm from the top of the 720mm baffle
    expect(mid.yMm).toBe(720 - 185)
    expect(tweeter.yMm).toBe(720 - 65)
    expect(mid.xMm).toBeCloseTo(82.5, 5)
    expect(tweeter.xMm).toBeCloseTo(82.5, 5)
  })

  it('side-mounted ScanSpeak woofer is excluded from the front baffle', () => {
    expect(d.bands[0]!.mount).toEqual({ placement: 'side', yMm: 360 })
    const positions = layoutBandPositions(d.bands, SEED_DRIVERS, d.baffleWidth, d.baffleHeight)!
    expect(positions.find((p) => p.bandIndex === 0)).toBeUndefined()
  })

  it('front cutouts fit inside the baffle without overlapping', () => {
    const positions = layoutBandPositions(d.bands, SEED_DRIVERS, d.baffleWidth, d.baffleHeight)!
    for (const p of positions) {
      expect(p.yMm - p.diameterMm / 2).toBeGreaterThanOrEqual(0)
      expect(p.yMm + p.diameterMm / 2).toBeLessThanOrEqual(720)
      expect(p.xMm - p.diameterMm / 2).toBeGreaterThanOrEqual(0)
      expect(p.xMm + p.diameterMm / 2).toBeLessThanOrEqual(165)
    }
    const mid = positions.find((p) => p.bandIndex === 1)!
    const tweeter = positions.find((p) => p.bandIndex === 2)!
    // vertical clearance between mid top edge and tweeter bottom edge
    expect(tweeter.yMm - tweeter.diameterMm / 2).toBeGreaterThan(mid.yMm + mid.diameterMm / 2)
  })

  it('crossover chain is contiguous and inside driver limits', () => {
    const [low, mid, high] = d.bands
    expect(low!.lowpassFreq).toBe(mid!.highpassFreq)   // 300 Hz
    expect(mid!.lowpassFreq).toBe(high!.highpassFreq)  // 2800 Hz
    expect(mid!.lowpassFreq).toBeLessThanOrEqual(3500) // Wavecor breakup limit
    expect(high!.highpassFreq).toBeGreaterThanOrEqual(2 * 1100) // ≥2×Fs for the Vifa
  })
})

describe('Mk3 Reference preset', () => {
  const d = MK3_REFERENCE_PRESET.design

  it('is a 3-way in the cabinet.scad cabinet (300×1180, sealed 75L, R19)', () => {
    expect(d.ways).toBe(3)
    expect(d.baffleWidth).toBe(300)
    expect(d.baffleHeight).toBe(1180)
    expect(d.roundoverRadius).toBe(19)
    expect(d.cabinetType).toBe('sealed')
    expect(d.portVb).toBe(75)
  })

  it('woofer band is 2× push-push, side-mounted at woofer_z = 520mm', () => {
    const low = d.bands[0]!
    expect(low.driverId).toBe('seed-grs-12sw-4he')
    expect(low.driverCount).toBe(2)
    expect(low.mount).toEqual({ placement: 'side', yMm: 520 })
    const positions = layoutBandPositions(d.bands, SEED_DRIVERS, d.baffleWidth, d.baffleHeight)!
    expect(positions.find((p) => p.bandIndex === 0)).toBeUndefined()
  })

  it('mid sits at mid_z = 1065mm with the tweeter 164mm BELOW it (tw_z = 901mm)', () => {
    const positions = layoutBandPositions(d.bands, SEED_DRIVERS, d.baffleWidth, d.baffleHeight)!
    expect(positions).toHaveLength(2)
    const mid = positions.find((p) => p.bandIndex === 1)!
    const tweeter = positions.find((p) => p.bandIndex === 2)!
    expect(mid.yMm).toBe(1065)
    expect(tweeter.yMm).toBe(1065 - 164)
    expect(mid.yMm).toBeGreaterThan(tweeter.yMm) // mid ABOVE tweeter (mk3 signature)
    expect(mid.xMm).toBeCloseTo(150, 5)
    expect(tweeter.xMm).toBeCloseTo(150, 5)
  })

  it('front cutouts fit inside the baffle without overlapping', () => {
    const positions = layoutBandPositions(d.bands, SEED_DRIVERS, d.baffleWidth, d.baffleHeight)!
    for (const p of positions) {
      expect(p.yMm - p.diameterMm / 2).toBeGreaterThanOrEqual(0)
      expect(p.yMm + p.diameterMm / 2).toBeLessThanOrEqual(1180)
      expect(p.xMm - p.diameterMm / 2).toBeGreaterThanOrEqual(0)
      expect(p.xMm + p.diameterMm / 2).toBeLessThanOrEqual(300)
    }
    const mid = positions.find((p) => p.bandIndex === 1)!
    const tweeter = positions.find((p) => p.bandIndex === 2)!
    // tweeter below mid: tweeter top edge must clear mid bottom edge
    expect(tweeter.yMm + tweeter.diameterMm / 2).toBeLessThan(mid.yMm - mid.diameterMm / 2)
  })

  it('crossover chain is contiguous (200 BW4 / 1100 LR4) with repo DSP gains', () => {
    const [low, mid, high] = d.bands
    expect(low!.lowpassFreq).toBe(200)
    expect(low!.lowpassType).toBe('BW4')
    expect(low!.lowpassFreq).toBe(mid!.highpassFreq)
    expect(mid!.lowpassFreq).toBe(1100)
    expect(mid!.lowpassFreq).toBe(high!.highpassFreq)
    expect(high!.highpassType).toBe('LR4')
    expect(low!.gain).toBe(0)
    expect(mid!.gain).toBe(-4)
    expect(high!.gain).toBe(-9)
  })

  it('sealed 75L with Vas×2 reproduces the repo alignment (Fc ≈ 39 Hz, Qtc ≈ 0.76)', () => {
    const grs = SEED_DRIVERS.find((x) => x.id === 'seed-grs-12sw-4he')!
    const eff = { ...grs, tsParams: { ...grs.tsParams!, vas: grs.tsParams!.vas * 2 } }
    const freqs = generateFrequencies(10, 500, 12)
    const result = calcCabinetResponse(eff, 'sealed', freqs, 300, 0.707, { vb: d.portVb! })
    expect(result.params.vb).toBe(75)
    expect(result.params.fc!).toBeGreaterThan(37)
    expect(result.params.fc!).toBeLessThan(41)
    expect(result.params.qtc!).toBeGreaterThan(0.73)
    expect(result.params.qtc!).toBeLessThan(0.79)
  })
})
