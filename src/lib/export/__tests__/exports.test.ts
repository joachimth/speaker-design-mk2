import { describe, it, expect } from 'vitest'
import { generateBuildSheet } from '@/lib/export/buildSheet'
import { exportCamillaDSP } from '@/lib/export/camillaDSP'
import { exportEqAPO, eqApoSectionQs } from '@/lib/export/eqApo'
import type { DesignBand, Driver } from '@/types'

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

function makeDriver(id: string, model: string): Driver {
  return {
    id,
    manufacturer: 'Test',
    model,
    type: id.includes('woofer') ? 'woofer' : 'tweeter',
    tsParams: {
      fs: 30, re: 3.5, qms: 6, qes: 0.45, qts: 0.42, vas: 60,
      sensitivity: 88, xmax: 6, sd: 350, imp: 4,
    },
    notes: '',
    createdAt: 0,
    updatedAt: 0,
  }
}

const WOOFER = makeDriver('woofer-1', 'W300')
const TWEETER = makeDriver('tweeter-1', 'T25')

const BANDS: DesignBand[] = [
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
    gain: -3.5, polarity: 180, delay: 0.12,
    eqFilters: [
      { id: 'eq1', kind: 'peaking', freq: 5000, gain: -2, q: 3, enabled: true },
      { id: 'eq2', kind: 'low_shelf', freq: 1500, gain: -1, q: 0.7, enabled: false },
    ],
  },
]

// ---------------------------------------------------------------------------
// Byggeark
// ---------------------------------------------------------------------------

describe('generateBuildSheet', () => {
  const md = generateBuildSheet({
    projectName: 'Testhøjttaler',
    cabinetType: 'Ported (basrefleks)',
    dims: {
      width: 300, height: 500, depth: 350, wallThickness: 19,
      baffleWidth: 300, baffleHeight: 500, frontRoundoverRadius: 0,
    },
    internalVolume: 42.5,
    portSpec: { shape: 'round', diameter: 70, length: 180, count: 2 },
    bands: [
      { driver: WOOFER, band: BANDS[0]! },
      { driver: TWEETER, band: BANDS[1]! },
    ],
  })

  it('contains project name and cabinet basics', () => {
    expect(md).toContain('Byggeark: Testhøjttaler')
    expect(md).toContain('300 × 500 × 350 mm')
    expect(md).toContain('42.5 L')
    expect(md).toContain('19 mm')
  })

  it('computes inner dimensions from wall thickness', () => {
    // iW = 300 - 2*19 = 262, iH = 500 - 38 = 462, iD = 350 - 19 = 331
    expect(md).toContain('262 × 462 × 331 mm')
  })

  it('contains a cut list with all panels', () => {
    expect(md).toContain('Skæreliste')
    expect(md).toContain('Front baffle')
    expect(md).toContain('Back panel')
    expect(md).toContain('Side panel')
  })

  it('includes port spec when provided', () => {
    expect(md).toContain('70 mm')
    expect(md).toContain('180')
  })

  it('lists drivers', () => {
    expect(md).toContain('W300')
    expect(md).toContain('T25')
  })

  it('omits port section when portSpec is undefined', () => {
    const noPort = generateBuildSheet({
      projectName: 'Lukket',
      cabinetType: 'Lukket',
      dims: { width: 300, height: 500, depth: 350, wallThickness: 19, baffleWidth: 300, baffleHeight: 500, frontRoundoverRadius: 0 },
      internalVolume: 40,
      bands: [],
    })
    expect(noPort).not.toContain('## Port')
  })
})

// ---------------------------------------------------------------------------
// CamillaDSP
// ---------------------------------------------------------------------------

describe('exportCamillaDSP', () => {
  const yaml = exportCamillaDSP(BANDS, 2, 48000)

  it('has devices/filters/mixers/pipeline sections', () => {
    expect(yaml).toContain('devices:')
    expect(yaml).toContain('samplerate: 48000')
    expect(yaml).toContain('filters:')
    expect(yaml).toContain('mixers:')
    expect(yaml).toContain('pipeline:')
  })

  it('exports biquads for both channels', () => {
    expect(yaml).toContain('bass_biquad_1')
    expect(yaml).toContain('treble_biquad_1')
    // LR4 = 2 cascaded sections; woofer has only LP (2), tweeter HP (2) + LP skipped at 20000... 20000 < 20000 is false
    expect(yaml).toContain('bass_biquad_2')
    expect(yaml).toContain('treble_biquad_2')
    expect(yaml).toContain('type: Biquad')
  })

  it('emits gain with polarity inversion for the tweeter', () => {
    expect(yaml).toContain('treble_gain')
    expect(yaml).toContain('gain: -3.5')
    expect(yaml).toContain('inverted: true')
  })

  it('emits delay in seconds', () => {
    expect(yaml).toContain('treble_delay')
    expect(yaml).toContain('delay: 0.000120')
  })

  it('only enabled EQ filters contribute biquads', () => {
    const withEq = exportCamillaDSP(BANDS, 2, 48000)
    const noEq = exportCamillaDSP(
      [BANDS[0]!, { ...BANDS[1]!, eqFilters: [] }], 2, 48000,
    )
    const countBiquads = (s: string) => (s.match(/type: Biquad/g) ?? []).length
    // Enabled PEQ adds exactly 1 biquad; the disabled low-shelf adds none
    expect(countBiquads(withEq)).toBe(countBiquads(noEq) + 1)
  })

  it('respects sample rate parameter', () => {
    expect(exportCamillaDSP(BANDS, 2, 96000)).toContain('samplerate: 96000')
  })
})

// ---------------------------------------------------------------------------
// Equalizer APO
// ---------------------------------------------------------------------------

describe('eqApoSectionQs', () => {
  it('maps crossover types to cascaded section Qs', () => {
    expect(eqApoSectionQs('BW2')).toEqual([Math.SQRT1_2])
    expect(eqApoSectionQs('LR2')).toEqual([0.5])
    expect(eqApoSectionQs('BW4')).toEqual([0.5412, 1.3066])
    expect(eqApoSectionQs('LR4')).toEqual([Math.SQRT1_2, Math.SQRT1_2])
    expect(eqApoSectionQs('LR8')).toHaveLength(4)
    expect(eqApoSectionQs('first_order')).toBeNull()
    expect(eqApoSectionQs('BW1')).toBeNull()
  })
})

describe('exportEqAPO', () => {
  const txt = exportEqAPO(BANDS, 2, [WOOFER, TWEETER], 'testprojekt')

  it('contains a header and one section per way', () => {
    expect(txt).toContain('testprojekt')
    expect(txt).toContain('Vej 1: BASS — Test W300')
    expect(txt).toContain('Vej 2: TREBLE — Test T25')
  })

  it('LR4 lowpass on the woofer → two cascaded LPQ sections at Q 0.7071', () => {
    const lpq = txt.match(/Filter \d+: ON LPQ Fc 2000\.0 Hz Q 0\.7071/g) ?? []
    expect(lpq).toHaveLength(2)
  })

  it('LR4 highpass on the tweeter → two cascaded HPQ sections', () => {
    const hpq = txt.match(/Filter \d+: ON HPQ Fc 2000\.0 Hz Q 0\.7071/g) ?? []
    expect(hpq).toHaveLength(2)
  })

  it('woofer band (i=0) gets no highpass, tweeter (last band) no lowpass at 20 kHz', () => {
    // Woofer: no HPQ lines before the tweeter section
    const wooferSection = txt.split('Vej 2')[0]!
    expect(wooferSection).not.toContain('HPQ')
    // Tweeter LP at 20000 is treated as passthrough
    expect(txt).not.toContain('LPQ Fc 20000')
  })

  it('polarity 180 → Copy inversion, negative gain → Preamp, delay → Delay', () => {
    expect(txt).toContain('Copy: L=-1*L')
    expect(txt).toContain('Preamp: -3.5 dB')
    expect(txt).toContain('Delay: 0.12 ms')
  })

  it('only enabled EQ filters are exported', () => {
    expect(txt).toContain('ON PK Fc 5000.0 Hz Gain -2.0 dB Q 3.00')
    expect(txt).not.toContain('LS Fc 1500')
  })

  it('first_order crossover → explanatory comment instead of filter lines', () => {
    const bands1st: DesignBand[] = [
      { ...BANDS[0]!, lowpassType: 'first_order' },
      BANDS[1]!,
    ]
    const out = exportEqAPO(bands1st, 2, [WOOFER, TWEETER], 'x')
    expect(out).toContain('kan ikke laves som LPQ/HPQ')
    expect(out).not.toContain('LPQ Fc 2000')
  })

  it('zero gain and zero delay emit no Preamp/Delay lines for the woofer', () => {
    const wooferSection = txt.split('Vej 2')[0]!
    expect(wooferSection).not.toContain('Preamp:')
    expect(wooferSection).not.toContain('Delay:')
  })
})
