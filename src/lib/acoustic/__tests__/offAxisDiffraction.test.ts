// Off-axis edge diffraction + position-aware spinorama
//
// Physics expectations (validated numerically before the thresholds were
// locked in):
// - (0,0) reduces exactly to the on-axis integral (shared cached array)
// - the delta vs on-axis vanishes at DC (both limits are −6 dB into 4π)
// - horizontal mirror symmetry for a centered source
// - placement-dependent: a top-mounted driver is vertically asymmetric
// - roundover shrinks the HF delta (edge re-radiation is attenuated)
// - spinorama: on-axis is untouched; LW/SP shift when positions are used
import { describe, it, expect } from 'vitest'
import { calcBaffleDiffraction, calcBaffleDiffractionOffAxis } from '../baffle'
import { calcSpinoramaMultiDriver } from '../directivity'

function logGrid(n = 120): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(20 * Math.pow(1000, i / (n - 1)))
  return out
}

const W = 250
const H = 900
const X = W / 2
const Y_TOP = H - 80

describe('calcBaffleDiffractionOffAxis', () => {
  const freqs = logGrid()

  it('reduces exactly to the on-axis integral at (0, 0)', () => {
    const on = calcBaffleDiffraction(W, H, X, Y_TOP, 0, freqs)
    const off = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 0, 0)
    expect(off).toBe(on) // delegated → same cached array
  })

  it('delta vs on-axis vanishes at DC', () => {
    const on = calcBaffleDiffraction(W, H, X, Y_TOP, 0, freqs)
    const off = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 30, 0)
    expect(Math.abs(off[0]! - on[0]!)).toBeLessThan(0.1)
  })

  it('is horizontally mirror-symmetric for a centered source', () => {
    const plus = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 30, 0)
    const minus = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, -30, 0)
    for (let i = 0; i < freqs.length; i++) {
      expect(Math.abs(plus[i]! - minus[i]!)).toBeLessThan(1e-9)
    }
  })

  it('differs meaningfully from on-axis in the transition region', () => {
    const on = calcBaffleDiffraction(W, H, X, Y_TOP, 0, freqs)
    const off = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 30, 0)
    let maxDelta = 0
    for (let i = 0; i < freqs.length; i++) {
      maxDelta = Math.max(maxDelta, Math.abs(off[i]! - on[i]!))
    }
    expect(maxDelta).toBeGreaterThan(1.5)
  })

  it('is placement-dependent: top-mounted driver is vertically asymmetric', () => {
    const up = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 0, 40)
    const down = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 0, -40)
    let maxAsym = 0
    for (let i = 0; i < freqs.length; i++) {
      maxAsym = Math.max(maxAsym, Math.abs(up[i]! - down[i]!))
    }
    expect(maxAsym).toBeGreaterThan(1)
  })

  it('roundover shrinks the HF delta vs a sharp edge', () => {
    const sharpOn = calcBaffleDiffraction(W, H, X, Y_TOP, 0, freqs)
    const sharpOff = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 30, 0)
    const roundOn = calcBaffleDiffraction(W, H, X, Y_TOP, 25, freqs)
    const roundOff = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 25, freqs, 30, 0)
    let hfSharp = 0
    let hfRound = 0
    let n = 0
    for (let i = 0; i < freqs.length; i++) {
      if (freqs[i]! < 3000) continue
      hfSharp += Math.abs(sharpOff[i]! - sharpOn[i]!)
      hfRound += Math.abs(roundOff[i]! - roundOn[i]!)
      n++
    }
    expect(n).toBeGreaterThan(0)
    expect(hfRound / n).toBeLessThan((hfSharp / n) * 0.5)
  })

  it('stays finite at extreme combined angles', () => {
    const out = calcBaffleDiffractionOffAxis(W, H, X, Y_TOP, 0, freqs, 80, 60)
    expect(out.every((v) => Number.isFinite(v))).toBe(true)
  })
})

describe('calcSpinoramaMultiDriver with positions', () => {
  const freqs = logGrid()
  const flat = freqs.map(() => 85)
  const noPos = [
    { curve: flat, diameter: 130 },
    { curve: flat, diameter: 25 },
  ]
  const withPos = [
    { curve: flat, diameter: 130, position: { xMm: W / 2, yMm: 300 } },
    { curve: flat, diameter: 25, position: { xMm: W / 2, yMm: 700 } },
  ]

  it('leaves the on-axis curve untouched', () => {
    const legacy = calcSpinoramaMultiDriver(noPos, freqs, W, H)
    const posAware = calcSpinoramaMultiDriver(withPos, freqs, W, H, undefined, { roundoverRadius: 0 })
    for (let i = 0; i < freqs.length; i++) {
      expect(Math.abs(posAware.onAxis[i]! - legacy.onAxis[i]!)).toBeLessThan(1e-9)
    }
  })

  it('shifts sound power and listening window vs the legacy model', () => {
    const legacy = calcSpinoramaMultiDriver(noPos, freqs, W, H)
    const posAware = calcSpinoramaMultiDriver(withPos, freqs, W, H, undefined, { roundoverRadius: 0 })
    let maxSP = 0
    let maxLW = 0
    for (let i = 0; i < freqs.length; i++) {
      maxSP = Math.max(maxSP, Math.abs(posAware.soundPower[i]! - legacy.soundPower[i]!))
      maxLW = Math.max(maxLW, Math.abs(posAware.listeningWindow[i]! - legacy.listeningWindow[i]!))
    }
    expect(maxSP).toBeGreaterThan(0.5)
    expect(maxLW).toBeGreaterThan(0.3)
  })

  it('reacts to roundover in the off-axis curves', () => {
    const sharp = calcSpinoramaMultiDriver(withPos, freqs, W, H, undefined, { roundoverRadius: 0 })
    const round = calcSpinoramaMultiDriver(withPos, freqs, W, H, undefined, { roundoverRadius: 25 })
    let maxDiff = 0
    for (let i = 0; i < freqs.length; i++) {
      maxDiff = Math.max(maxDiff, Math.abs(sharp.soundPower[i]! - round.soundPower[i]!))
    }
    expect(maxDiff).toBeGreaterThan(0.1)
  })

  it('is deterministic and finite across all curves', () => {
    const a = calcSpinoramaMultiDriver(withPos, freqs, W, H, undefined, { roundoverRadius: 0 })
    const b = calcSpinoramaMultiDriver(withPos, freqs, W, H, undefined, { roundoverRadius: 0 })
    expect(a.soundPower).toEqual(b.soundPower)
    expect(a.listeningWindow).toEqual(b.listeningWindow)
    const curves = [a.onAxis, a.listeningWindow, a.earlyReflections, a.soundPower, a.directivityIndex, a.predictedInRoom]
    for (const c of curves) {
      expect(c.every((v) => Number.isFinite(v))).toBe(true)
    }
  })

  it('mixed bands (one with, one without position) stay finite', () => {
    const mixed = [
      { curve: flat, diameter: 130, position: { xMm: W / 2, yMm: 300 } },
      { curve: flat, diameter: 25 },
    ]
    const spin = calcSpinoramaMultiDriver(mixed, freqs, W, H, undefined, { roundoverRadius: 0 })
    expect(spin.soundPower.every((v) => Number.isFinite(v))).toBe(true)
    expect(spin.directivityIndex.every((v) => Number.isFinite(v))).toBe(true)
  })
})
