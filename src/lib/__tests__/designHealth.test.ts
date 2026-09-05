import { describe, it, expect } from 'vitest'
import { evaluateDesign, STATUS_LABELS } from '@/lib/designHealth'
import type { DesignState, Driver, RoomParams } from '@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const ROOM: RoomParams = {
  dimensions: { length: 5, width: 4, height: 2.4 },
  rt60: 0.4,
  speakerDistanceFromFront: 0.5,
  speakerDistanceFromSide: 0.5,
  speakerHeight: 1,
  listeningDistance: 3,
}

function makeWoofer(overrides: Partial<Driver> = {}): Driver {
  return {
    id: 'woofer-1',
    manufacturer: 'Test',
    model: 'W300',
    type: 'woofer',
    tsParams: {
      fs: 30, re: 3.5, qms: 6, qes: 0.45, qts: 0.42, vas: 60,
      sensitivity: 88, xmax: 6, sd: 350, imp: 4, pe: 150,
    },
    notes: '',
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  }
}

function makeTweeter(): Driver {
  return {
    id: 'tweeter-1',
    manufacturer: 'Test',
    model: 'T25',
    type: 'tweeter',
    tsParams: {
      fs: 900, re: 4.8, qms: 1.8, qes: 0.9, qts: 0.6, vas: 0.02,
      sensitivity: 91, xmax: 0.5, sd: 8, imp: 6,
    },
    notes: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

function makeDesign(overrides: Partial<DesignState> = {}): DesignState {
  return {
    ways: 2,
    bands: [
      {
        driverId: 'woofer-1', role: 'low',
        lowpassFreq: 2000, lowpassType: 'LR4',
        highpassFreq: 0, highpassType: 'LR4',
        gain: 0, polarity: 0, delay: 0,
      },
      {
        driverId: 'tweeter-1', role: 'high',
        lowpassFreq: 20000, lowpassType: 'LR4',
        highpassFreq: 2000, highpassType: 'LR4',
        gain: 0, polarity: 0, delay: 0,
      },
    ],
    baffleWidth: 250,
    baffleHeight: 400,
    roundoverRadius: 0,
    roomParams: ROOM,
    smoothingFraction: 0,
    cabinetType: 'sealed',
    portFb: null,
    portVb: 55,
    portDiameter: 70,
    numPorts: 1,
    ...overrides,
  }
}

const DRIVERS = [makeWoofer(), makeTweeter()]

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

describe('evaluateDesign — status', () => {
  it('missing driver on a band → not_viable with error warning', () => {
    const design = makeDesign()
    design.bands[0]!.driverId = 'nonexistent'
    const h = evaluateDesign(design, DRIVERS)
    expect(h.status).toBe('not_viable')
    expect(h.statusLabel).toBe(STATUS_LABELS.not_viable)
    expect(h.warnings.some((w) => w.id === 'missing-driver-0' && w.severity === 'error')).toBe(true)
  })

  it('sane sealed box → not not_viable, has cabinet summary', () => {
    const h = evaluateDesign(makeDesign(), DRIVERS, { powerW: 20 })
    expect(h.status).not.toBe('not_viable')
    expect(h.metrics.cabinetSummary).toContain('lukket')
    expect(h.metrics.bassDriverName).toContain('W300')
  })

  it('statusReason is the first issue title when warnings exist', () => {
    const design = makeDesign()
    design.bands[0]!.driverId = 'nonexistent'
    const h = evaluateDesign(design, DRIVERS)
    expect(h.statusReason).toBe(h.warnings.find((w) => w.severity === 'error')!.title)
  })
})

// ---------------------------------------------------------------------------
// Cabinet-specific warnings + apply actions
// ---------------------------------------------------------------------------

describe('evaluateDesign — sealed', () => {
  it('small box → high Qtc warning with Anvend action (setPort vb)', () => {
    const h = evaluateDesign(makeDesign({ portVb: 5 }), DRIVERS)
    const w = h.warnings.find((x) => x.id === 'sealed-qtc-high')
    expect(w).toBeDefined()
    expect(w!.apply).toBeDefined()
    expect(w!.apply!.action.kind).toBe('setPort')
    const patch = (w!.apply!.action as { kind: 'setPort'; patch: { vb?: number } }).patch
    expect(patch.vb).toBeGreaterThan(5)
    expect(h.status).toBe('attention')
  })
})

describe('evaluateDesign — ported', () => {
  it('tiny port at high power → port-velocity warning with larger diameter suggestion', () => {
    const h = evaluateDesign(
      makeDesign({ cabinetType: 'ported', portVb: 60, portFb: 30, portDiameter: 35, numPorts: 1 }),
      DRIVERS,
      { powerW: 100 },
    )
    const w = h.warnings.find((x) => x.id === 'port-velocity')
    expect(w).toBeDefined()
    expect(w!.severity).toBe('warning')
    const patch = (w!.apply!.action as { kind: 'setPort'; patch: { diameter?: number } }).patch
    expect(patch.diameter).toBeGreaterThan(35)
    expect(patch.diameter! % 5).toBe(0)
  })

  it('generous port at low power → no port-velocity warning', () => {
    const h = evaluateDesign(
      makeDesign({ cabinetType: 'ported', portVb: 60, portFb: 28, portDiameter: 100, numPorts: 2 }),
      DRIVERS,
      { powerW: 5 },
    )
    expect(h.warnings.find((x) => x.id === 'port-velocity')).toBeUndefined()
    expect(h.metrics.cabinetSummary).toContain('ported')
  })
})

describe('evaluateDesign — transmission line', () => {
  it('unstuffed TL → tl-stuffing warning with Anvend 10 kg/m³', () => {
    const h = evaluateDesign(
      makeDesign({
        cabinetType: 'transmission_line',
        tlParams: {
          lengthM: 2.4, areaStartCm2: 400, areaEndCm2: 300,
          stuffingDensity: 0, driverOffsetFraction: 0,
        },
      }),
      DRIVERS,
    )
    const w = h.warnings.find((x) => x.id === 'tl-stuffing')
    expect(w).toBeDefined()
    const action = w!.apply!.action as { kind: 'updateDesign'; patch: { tlParams?: { stuffingDensity: number } } }
    expect(action.kind).toBe('updateDesign')
    expect(action.patch.tlParams!.stuffingDensity).toBe(10)
  })

  it('unconfigured TL → info about configuration', () => {
    const h = evaluateDesign(makeDesign({ cabinetType: 'transmission_line' }), DRIVERS)
    expect(h.warnings.some((w) => w.id === 'tl-unconfigured')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Crossover sanity + data quality
// ---------------------------------------------------------------------------

describe('evaluateDesign — crossover and quality checks', () => {
  it('gap between ways → xo-gap info', () => {
    const design = makeDesign()
    design.bands[0]!.lowpassFreq = 800
    design.bands[1]!.highpassFreq = 2500
    const h = evaluateDesign(design, DRIVERS)
    expect(h.warnings.some((w) => w.id === 'xo-gap-0')).toBe(true)
  })

  it('overlap between ways → xo-overlap info', () => {
    const design = makeDesign()
    design.bands[0]!.lowpassFreq = 3000
    design.bands[1]!.highpassFreq = 1200
    const h = evaluateDesign(design, DRIVERS)
    expect(h.warnings.some((w) => w.id === 'xo-overlap-0')).toBe(true)
  })

  it('matched XO frequencies → no gap/overlap warnings', () => {
    const h = evaluateDesign(makeDesign(), DRIVERS)
    expect(h.warnings.some((w) => w.id.startsWith('xo-'))).toBe(false)
  })

  it('datasheet-only drivers → quality C info warnings', () => {
    const h = evaluateDesign(makeDesign(), DRIVERS)
    expect(h.warnings.some((w) => w.id === 'quality-0' && w.severity === 'info')).toBe(true)
  })

  it('driver with measured response → no quality warning for that band', () => {
    const fr = Array.from({ length: 50 }, (_, i) => ({ freq: 20 * (i + 1), magnitude: 88 }))
    const measured = [makeWoofer({ frequencyResponse: fr }), makeTweeter()]
    const h = evaluateDesign(makeDesign(), measured)
    expect(h.warnings.some((w) => w.id === 'quality-0')).toBe(false)
    expect(h.warnings.some((w) => w.id === 'quality-1')).toBe(true)
  })
})

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

describe('evaluateDesign — metrics', () => {
  it('computes F3, max SPL and score for sealed box', () => {
    const h = evaluateDesign(makeDesign(), DRIVERS, { powerW: 20 })
    expect(h.metrics.f3Hz).not.toBeNull()
    expect(h.metrics.f3Hz!).toBeGreaterThan(20)
    expect(h.metrics.f3Hz!).toBeLessThan(200)
    expect(h.metrics.maxSplDb).not.toBeNull()
    expect(h.metrics.maxSplDb!).toBeGreaterThan(80)
    expect(h.metrics.score).not.toBeNull()
    expect(h.metrics.score!).toBeGreaterThan(0)
    expect(h.metrics.score!).toBeLessThanOrEqual(100)
    expect(h.metrics.powerW).toBe(20)
  })

  it('score is null for advanced cabinet types (only sealed/ported scored)', () => {
    const h = evaluateDesign(
      makeDesign({
        cabinetType: 'transmission_line',
        tlParams: { lengthM: 2.4, areaStartCm2: 400, areaEndCm2: 300, stuffingDensity: 10, driverOffsetFraction: 0 },
      }),
      DRIVERS,
    )
    expect(h.metrics.score).toBeNull()
  })

  it('larger sealed box gives deeper bass (lower F3)', () => {
    const small = evaluateDesign(makeDesign({ portVb: 15 }), DRIVERS)
    const large = evaluateDesign(makeDesign({ portVb: 120 }), DRIVERS)
    expect(large.metrics.f3Hz!).toBeLessThanOrEqual(small.metrics.f3Hz!)
  })
})
