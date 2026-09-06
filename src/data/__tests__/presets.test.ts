import { describe, it, expect } from 'vitest'
import { DESIGN_PRESETS, KUDOS_X2_PRESET } from '@/data/presets'
import { SEED_DRIVERS } from '@/data/seedDrivers'
import { layoutBandPositions } from '@/lib/acoustic/baffleLayout'
import { portLengthForTuning } from '@/engine/enclosure/vented'

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
