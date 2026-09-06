import { describe, it, expect } from 'vitest'
import { layoutBandPositions, cutoutDiameterOf } from '@/lib/acoustic/baffleLayout'
import type { DesignBand, Driver } from '@/types'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeDriver(id: string, cutoutDiameter: number): Driver {
  return {
    id,
    manufacturer: 'Test',
    model: id,
    type: 'midrange',
    tsParams: { fs: 50, re: 6, qms: 3, qes: 0.5, qts: 0.43, vas: 20, sensitivity: 88, xmax: 4, sd: 100, sdM2: 0.01, vd: 400, imp: 8, pe: 50 },
    dimensions: { overallDiameter: cutoutDiameter + 20, cutoutDiameter, mountingDepth: 60 },
    createdAt: 0,
    updatedAt: 0,
  } as unknown as Driver
}

function makeBand(driverId: string, role: DesignBand['role'], mount?: DesignBand['mount']): DesignBand {
  return {
    driverId, role,
    lowpassFreq: 0, lowpassType: 'LR4', highpassFreq: 0, highpassType: 'LR4',
    gain: 0, polarity: 0, delay: 0,
    ...(mount ? { mount } : {}),
  }
}

const WOOFER = makeDriver('w1', 180)
const MID = makeDriver('m1', 120)
const TWEETER = makeDriver('t1', 70)
const DRIVERS = [WOOFER, MID, TWEETER]

// ---------------------------------------------------------------------------
// Auto stack (regression — behavior without mount overrides)
// ---------------------------------------------------------------------------

describe('layoutBandPositions — auto stack (regression)', () => {
  it('stacks on the centerline with tweeter on top', () => {
    const bands = [makeBand('w1', 'low'), makeBand('t1', 'high')]
    const pos = layoutBandPositions(bands, DRIVERS, 300, 900)!
    expect(pos).toHaveLength(2)
    const woofer = pos.find((p) => p.bandIndex === 0)!
    const tweeter = pos.find((p) => p.bandIndex === 1)!
    expect(woofer.xMm).toBeCloseTo(150, 5)
    expect(tweeter.xMm).toBeCloseTo(150, 5)
    expect(tweeter.yMm).toBeGreaterThan(woofer.yMm)
  })

  it('returns null when the stack cannot fit', () => {
    const bands = [makeBand('w1', 'low'), makeBand('m1', 'mid'), makeBand('t1', 'high')]
    // 180+120+70 + 2*25 = 420 > 400-60
    expect(layoutBandPositions(bands, DRIVERS, 300, 400)).toBeNull()
  })

  it('returns null when no band has a driver', () => {
    expect(layoutBandPositions([makeBand('missing', 'low')], DRIVERS, 300, 900)).toBeNull()
  })
})

// ---------------------------------------------------------------------------
// Mount overrides
// ---------------------------------------------------------------------------

describe('layoutBandPositions — mount overrides', () => {
  it('fixed yMm is respected, x defaults to the centerline', () => {
    const bands = [makeBand('m1', 'mid', { placement: 'front', yMm: 535 })]
    const pos = layoutBandPositions(bands, DRIVERS, 165, 720)!
    expect(pos).toHaveLength(1)
    expect(pos[0]!.yMm).toBe(535)
    expect(pos[0]!.xMm).toBeCloseTo(82.5, 5)
  })

  it('explicit xMm is respected', () => {
    const bands = [makeBand('m1', 'mid', { placement: 'front', xMm: 60, yMm: 500 })]
    const pos = layoutBandPositions(bands, DRIVERS, 165, 720)!
    expect(pos[0]!.xMm).toBe(60)
  })

  it('side-mounted bands are excluded from the front-baffle layout', () => {
    const bands = [
      makeBand('w1', 'low', { placement: 'side', yMm: 360 }),
      makeBand('m1', 'mid', { placement: 'front', yMm: 535 }),
      makeBand('t1', 'high', { placement: 'front', yMm: 655 }),
    ]
    const pos = layoutBandPositions(bands, DRIVERS, 165, 720)!
    expect(pos).toHaveLength(2)
    expect(pos.find((p) => p.bandIndex === 0)).toBeUndefined()
    expect(pos.find((p) => p.bandIndex === 1)!.yMm).toBe(535)
    expect(pos.find((p) => p.bandIndex === 2)!.yMm).toBe(655)
  })

  it('all bands side-mounted → null (no front-baffle positions)', () => {
    const bands = [makeBand('w1', 'low', { placement: 'side', yMm: 300 })]
    expect(layoutBandPositions(bands, DRIVERS, 165, 720)).toBeNull()
  })

  it('mixed fixed + auto: auto bands stack, fixed band keeps its position', () => {
    const bands = [
      makeBand('w1', 'low'),
      makeBand('t1', 'high', { placement: 'front', yMm: 655 }),
    ]
    const pos = layoutBandPositions(bands, DRIVERS, 300, 900)!
    expect(pos).toHaveLength(2)
    expect(pos.find((p) => p.bandIndex === 1)!.yMm).toBe(655)
    const auto = pos.find((p) => p.bandIndex === 0)!
    expect(auto.xMm).toBeCloseTo(150, 5)
    expect(auto.yMm).toBeGreaterThan(0)
    expect(auto.yMm).toBeLessThan(900)
  })

  it('fixed positions survive when the auto stack cannot fit', () => {
    const bands = [
      makeBand('w1', 'low'),
      makeBand('m1', 'mid'),
      makeBand('t1', 'high', { placement: 'front', yMm: 300 }),
    ]
    // auto stack: 180+120+25 = 325 > 350-60 → auto bands get no position
    const pos = layoutBandPositions(bands, DRIVERS, 300, 350)!
    expect(pos).toHaveLength(1)
    expect(pos[0]!.bandIndex).toBe(2)
    expect(pos[0]!.yMm).toBe(300)
  })

  it('output is ordered top-to-bottom (port goes below the last cutout)', () => {
    const bands = [
      makeBand('w1', 'low'),
      makeBand('t1', 'high', { placement: 'front', yMm: 655 }),
    ]
    const pos = layoutBandPositions(bands, DRIVERS, 300, 900)!
    for (let i = 1; i < pos.length; i++) {
      expect(pos[i]!.yMm).toBeLessThanOrEqual(pos[i - 1]!.yMm)
    }
  })

  it('fixed band bypasses the fit check but keeps the real cutout diameter', () => {
    const bands = [makeBand('w1', 'low', { placement: 'front', yMm: 200 })]
    const pos = layoutBandPositions(bands, DRIVERS, 300, 250)!
    expect(pos[0]!.diameterMm).toBe(cutoutDiameterOf(WOOFER))
  })
})
