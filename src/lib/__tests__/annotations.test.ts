import { describe, it, expect } from 'vitest'
import { designAnnotations } from '@/lib/annotations'
import type { DesignState, RoomParams } from '@/types'

const ROOM: RoomParams = {
  dimensions: { length: 5, width: 4, height: 2.4 },
  rt60: 0.4,
  speakerDistanceFromFront: 0.5,
  speakerDistanceFromSide: 0.5,
  speakerHeight: 1,
  listeningDistance: 3,
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
        lowpassFreq: 0, lowpassType: 'LR4',
        highpassFreq: 2000, highpassType: 'LR4',
        gain: 0, polarity: 0, delay: 0,
      },
    ],
    baffleWidth: 320,
    baffleHeight: 900,
    roundoverRadius: 40,
    roomParams: ROOM,
    smoothingFraction: 3,
    cabinetType: 'sealed',
    portFb: null,
    portVb: null,
    portDiameter: 60,
    numPorts: 1,
    ...overrides,
  }
}

describe('designAnnotations', () => {
  it('includes baffle step and diffraction markers based on baffle width', () => {
    const anns = designAnnotations(makeDesign(), [])
    const baffle = anns.find((a) => a.id === 'baffle-step')
    expect(baffle).toBeDefined()
    // 115 / 0.32 m ≈ 359 Hz
    expect(baffle!.freqHz).toBeCloseTo(115 / 0.32, 0)
    const diff = anns.find((a) => a.id === 'diffraction')
    expect(diff).toBeDefined()
    expect(diff!.freqHz).toBeGreaterThan(baffle!.freqHz)
  })

  it('marks the crossover point at the geometric mean of LP and HP', () => {
    const anns = designAnnotations(makeDesign(), [])
    const xo = anns.find((a) => a.id === 'xo-0')
    expect(xo).toBeDefined()
    expect(xo!.freqHz).toBeCloseTo(2000, 0)
  })

  it('adds a port tuning marker for ported designs (effFb wins over portFb)', () => {
    const anns = designAnnotations(makeDesign({ cabinetType: 'ported', portFb: 35 }), [], { effFb: 33 })
    const port = anns.find((a) => a.id === 'port-tuning')
    expect(port).toBeDefined()
    expect(port!.freqHz).toBe(33)
  })

  it('has no port marker for sealed designs', () => {
    const anns = designAnnotations(makeDesign(), [], { effFb: 33 })
    expect(anns.find((a) => a.id === 'port-tuning')).toBeUndefined()
  })

  it('marks the TL quarter-wave frequency from line length', () => {
    const anns = designAnnotations(
      makeDesign({
        cabinetType: 'transmission_line',
        tlParams: { lengthM: 2, areaStartCm2: 400, areaEndCm2: 200, stuffingDensity: 10, driverOffsetFraction: 0.2 },
      }),
      [],
    )
    const tl = anns.find((a) => a.id === 'tl-quarterwave')
    expect(tl).toBeDefined()
    expect(tl!.freqHz).toBeCloseTo(343 / 8, 1)
  })

  it('marks the dipole peak for open baffle', () => {
    const anns = designAnnotations(makeDesign({ cabinetType: 'open_baffle' }), [])
    const dipole = anns.find((a) => a.id === 'dipole-peak')
    expect(dipole).toBeDefined()
    expect(dipole!.freqHz).toBeCloseTo(343 / (2 * 0.32), 0)
  })

  it('includes F3 when provided and sorts all annotations by frequency', () => {
    const anns = designAnnotations(makeDesign(), [], { f3Hz: 45 })
    const f3 = anns.find((a) => a.id === 'f3')
    expect(f3).toBeDefined()
    expect(f3!.freqHz).toBe(45)
    for (let i = 1; i < anns.length; i++) {
      expect(anns[i]!.freqHz).toBeGreaterThanOrEqual(anns[i - 1]!.freqHz)
    }
    // F3 at 45 Hz should come first
    expect(anns[0]!.id).toBe('f3')
  })

  it('adds bandpass front-chamber tuning when configured', () => {
    const anns = designAnnotations(
      makeDesign({
        cabinetType: 'bandpass4',
        bandpassParams: { vRear: 40, vFront: 20, fbFront: 55, portDiameter: 100, numPorts: 1 },
      }),
      [],
    )
    const bp = anns.find((a) => a.id === 'bp-tuning')
    expect(bp).toBeDefined()
    expect(bp!.freqHz).toBe(55)
  })
})
