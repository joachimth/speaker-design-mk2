import { describe, it, expect } from 'vitest'
import { exportHypexText, exportAdauText, to523Hex } from '@/lib/export/hypexAdau'
import type { DesignState, Driver, RoomParams } from '@/types'

const ROOM: RoomParams = {
  dimensions: { length: 5, width: 4, height: 2.4 },
  rt60: 0.4,
  speakerDistanceFromFront: 0.5,
  speakerDistanceFromSide: 0.5,
  speakerHeight: 1,
  listeningDistance: 3,
}

const WOOFER: Driver = {
  id: 'woofer-1',
  manufacturer: 'Test',
  model: 'W300',
  type: 'woofer',
  tsParams: { fs: 30, re: 3.5, qms: 6, qes: 0.45, qts: 0.42, vas: 60, sensitivity: 88, xmax: 6, sd: 350, imp: 4 },
  notes: '',
  createdAt: 0,
  updatedAt: 0,
}

const TWEETER: Driver = {
  id: 'tweeter-1',
  manufacturer: 'Test',
  model: 'T25',
  type: 'tweeter',
  tsParams: { fs: 900, re: 4.8, qms: 1.8, qes: 0.9, qts: 0.6, vas: 0.02, sensitivity: 91, xmax: 0.5, sd: 8, imp: 6 },
  notes: '',
  createdAt: 0,
  updatedAt: 0,
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
        gain: -3, polarity: 180, delay: 0.05,
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

describe('to523Hex', () => {
  it('encodes 1.0 as 0x00800000', () => {
    expect(to523Hex(1.0)).toBe('0x00800000')
  })

  it('encodes -1.0 as 0xFF800000 (two\'s complement)', () => {
    expect(to523Hex(-1.0)).toBe('0xFF800000')
  })

  it('encodes 0 as 0x00000000', () => {
    expect(to523Hex(0)).toBe('0x00000000')
  })

  it('encodes 0.5 as 0x00400000', () => {
    expect(to523Hex(0.5)).toBe('0x00400000')
  })

  it('clamps out-of-range values to the 5.23 limits', () => {
    expect(to523Hex(100)).toBe('0x07FFFFFF')
    expect(to523Hex(-100)).toBe('0xF8000000')
  })
})

describe('exportHypexText', () => {
  const text = exportHypexText(makeDesign(), [WOOFER, TWEETER], 'testprojekt')

  it('names the project and sample rate in the header', () => {
    expect(text).toContain('testprojekt')
    expect(text).toContain('48000')
  })

  it('has one channel section per role with the driver name', () => {
    expect(text).toContain('Kanal: Bas — Test W300')
    expect(text).toContain('Kanal: Diskant — Test T25')
  })

  it('decomposes LR4 into two biquads per filter', () => {
    // Woofer channel: only a lowpass (LR4 = 2 biquads)
    const wooferSection = text.split('## Kanal: Diskant')[0]!
    expect(wooferSection).toContain('biquad1:')
    expect(wooferSection).toContain('biquad2:')
    expect(wooferSection).not.toContain('biquad3:')
  })

  it('lists gain, polarity and delay per channel', () => {
    expect(text).toContain('Gain: -3.0 dB')
    expect(text).toContain('Inverteret (180°)')
    expect(text).toContain('0.050 ms')
    expect(text).toMatch(/2\.4 samples/) // 0.05 ms at 48 kHz
  })

  it('states the coefficient convention explicitly', () => {
    expect(text).toContain('tilbagekoblingsform')
    expect(text).toContain('a1·y[n-1]')
  })
})

describe('exportAdauText', () => {
  const text = exportAdauText(makeDesign(), [WOOFER, TWEETER], 'testprojekt')

  it('prints coefficients as float + 5.23 hex', () => {
    expect(text).toContain('B0 = ')
    expect(text).toMatch(/0x[0-9A-F]{8}/)
  })

  it('folds polarity into the linear gain multiplier', () => {
    // Tweeter: -3 dB inverted → -0.7079...
    expect(text).toMatch(/Gain \(lineær, inkl\. polaritet\): -0\.70/)
  })

  it('gives unity gain for the reference (woofer) channel', () => {
    expect(text).toContain('1.00000000 = 0x00800000')
  })

  it('converts delay to whole samples', () => {
    expect(text).toMatch(/= 2 samples/) // round(0.05ms · 48kHz) = 2
  })
})
