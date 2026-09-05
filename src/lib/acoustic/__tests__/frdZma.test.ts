import { describe, it, expect } from 'vitest'
import {
  parseFrdText,
  parseZmaText,
  exportFrd,
  exportZma,
  driverQuality,
} from '@/lib/acoustic/frdZma'
import type { FrequencyDataPoint, ImpedanceDataPoint } from '@/types'

describe('parseFrdText', () => {
  it('parses basic freq/SPL/phase lines', () => {
    const text = '20.0 85.2 12.5\n100.0 88.1 -4.2\n1000.0 90.0 0.0\n'
    const r = parseFrdText(text)
    expect(r.points).toHaveLength(3)
    expect(r.hasPhase).toBe(true)
    expect(r.points[0]).toEqual({ freq: 20, magnitude: 85.2, phase: 12.5 })
  })

  it('parses 2-column files without phase', () => {
    const r = parseFrdText('20 85\n100 88\n')
    expect(r.points).toHaveLength(2)
    expect(r.hasPhase).toBe(false)
    expect(r.points[0]!.phase).toBeUndefined()
  })

  it('skips comment lines (*, ;, #, //)', () => {
    const text = '* header\n; comment\n# another\n// slashes\n20 85\n'
    const r = parseFrdText(text)
    expect(r.points).toHaveLength(1)
    expect(r.skippedLines).toBe(0)
  })

  it('handles tab and semicolon separators', () => {
    const r = parseFrdText('20\t85.5\t10\n100;88;0\n')
    expect(r.points).toHaveLength(2)
    expect(r.points[1]!.magnitude).toBe(88)
  })

  it('handles European decimal commas', () => {
    const r = parseFrdText('20,5 85,3\n100,0 88,7\n')
    expect(r.points).toHaveLength(2)
    expect(r.points[0]!.freq).toBeCloseTo(20.5)
    expect(r.points[0]!.magnitude).toBeCloseTo(85.3)
  })

  it('handles single-token comma CSV lines', () => {
    const r = parseFrdText('20,85,10\n100,88,0\n')
    expect(r.points).toHaveLength(2)
    expect(r.points[0]).toEqual({ freq: 20, magnitude: 85, phase: 10 })
  })

  it('sorts unsorted input by frequency', () => {
    const r = parseFrdText('1000 90\n20 85\n100 88\n')
    expect(r.points.map((p) => p.freq)).toEqual([20, 100, 1000])
  })

  it('skips non-positive frequencies and counts them', () => {
    const r = parseFrdText('0 85\n-5 90\n100 88\n')
    expect(r.points).toHaveLength(1)
    expect(r.skippedLines).toBe(2)
  })

  it('returns empty for garbage input', () => {
    const r = parseFrdText('hello world\nnothing numeric here\n')
    expect(r.points).toHaveLength(0)
  })
})

describe('parseZmaText', () => {
  it('parses freq/ohm/phase lines', () => {
    const r = parseZmaText('20 45.2 60\n100 8.1 -12\n')
    expect(r.points).toHaveLength(2)
    expect(r.hasPhase).toBe(true)
    expect(r.points[0]!.magnitude).toBeCloseTo(45.2)
  })

  it('skips non-positive impedance magnitudes', () => {
    const r = parseZmaText('20 0 0\n100 -3 0\n200 8 0\n')
    expect(r.points).toHaveLength(1)
    expect(r.points[0]!.freq).toBe(200)
  })
})

describe('FRD/ZMA export roundtrip', () => {
  it('exportFrd → parseFrdText preserves data', () => {
    const points: FrequencyDataPoint[] = [
      { freq: 20, magnitude: 85.123, phase: 45.6 },
      { freq: 1000, magnitude: 90.001, phase: -12.3 },
    ]
    const text = exportFrd(points, 'test')
    expect(text).toContain('* test')
    const back = parseFrdText(text)
    expect(back.points).toHaveLength(2)
    expect(back.points[0]!.freq).toBeCloseTo(20, 2)
    expect(back.points[0]!.magnitude).toBeCloseTo(85.123, 2)
    expect(back.points[0]!.phase).toBeCloseTo(45.6, 1)
  })

  it('exportZma → parseZmaText preserves data', () => {
    const points: ImpedanceDataPoint[] = [
      { freq: 30, magnitude: 42.5, phase: 55 },
      { freq: 200, magnitude: 6.8 },
    ]
    const back = parseZmaText(exportZma(points))
    expect(back.points).toHaveLength(2)
    expect(back.points[0]!.magnitude).toBeCloseTo(42.5, 2)
    expect(back.points[1]!.phase).toBe(0) // missing phase exported as 0
  })
})

describe('driverQuality (SPEC §6)', () => {
  const fr = Array.from({ length: 50 }, (_, i) => ({ freq: 20 * (i + 1), magnitude: 88 }))
  const z = Array.from({ length: 50 }, (_, i) => ({ freq: 20 * (i + 1), magnitude: 8 }))

  it('flag A: on-axis + off-axis + impedance', () => {
    const q = driverQuality({
      frequencyResponse: fr,
      impedance: z,
      offAxis: [{ angle: 30, curve: fr }],
    })
    expect(q.flag).toBe('A')
  })

  it('flag B: measured on-axis only', () => {
    expect(driverQuality({ frequencyResponse: fr }).flag).toBe('B')
    expect(driverQuality({ frequencyResponse: fr, impedance: z }).flag).toBe('B')
  })

  it('flag C: datasheet only', () => {
    expect(driverQuality({}).flag).toBe('C')
    // Too few points does not count as measured
    expect(driverQuality({ frequencyResponse: fr.slice(0, 5) }).flag).toBe('C')
  })
})
