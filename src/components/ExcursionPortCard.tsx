// Excursion & port analysis card (SPEC §4.9 + §8 "Excursion & port").
// Runs the real engine models (sealed/vented lumped circuit) and shows:
//  - cone excursion vs frequency against Xmax
//  - port air velocity against the 10 m/s (recommended) / 17 m/s (chuffing)
//    limits from SPEC §4.3
//  - displacement- and thermally-limited max SPL
// All curves react live to the chosen drive power.

import { useMemo, useState } from 'react'
import { Card, StatCard } from '@/components/common/UI'
import { ResponsivePlot } from '@/components/charts/ResponsivePlot'
import { simulateSealedBox } from '@/engine/enclosure/sealed'
import {
  simulateVentedBox,
  portPipeResonance,
  PORT_VELOCITY_RECOMMENDED,
  PORT_VELOCITY_CHUFFING,
} from '@/engine/enclosure/vented'
import { maxSplFromSimulation } from '@/engine/maxSpl'
import type { Driver, CabinetType } from '@/types'

interface Props {
  driver: Driver
  cabinetType: CabinetType
  /** Box volume [L] */
  vb: number
  /** Port tuning [Hz] (ported only) */
  fb?: number
  /** Port diameter [mm] (ported only) */
  portDiameterMm?: number
  /** Physical port length [mm] (ported only) */
  portLengthMm?: number
  numPorts?: number
}

function logFreqs(f0: number, f1: number, n: number): number[] {
  const out: number[] = []
  for (let i = 0; i < n; i++) out.push(f0 * Math.pow(f1 / f0, i / (n - 1)))
  return out
}

export function ExcursionPortCard({
  driver,
  cabinetType,
  vb,
  portDiameterMm = 70,
  portLengthMm = 150,
  numPorts = 1,
}: Props) {
  const [powerW, setPowerW] = useState(20)

  const ts = driver.tsParams
  const voltage = Math.sqrt(powerW * (ts.imp || 8))

  const result = useMemo(() => {
    if (!ts || vb <= 0) return null
    const freqs = logFreqs(10, 2000, 220)
    try {
      if (cabinetType === 'ported') {
        const portArea = Math.PI * Math.pow(portDiameterMm / 2 / 10, 2) // cm² per port
        const sim = simulateVentedBox(ts, vb, portArea, portLengthMm, freqs, {
          voltage,
          portCount: numPorts,
        })
        return { freqs, sim, isPorted: true as const }
      }
      const sim = simulateSealedBox(ts, vb, freqs, { voltage })
      return { freqs, sim, isPorted: false as const }
    } catch {
      return null
    }
  }, [ts, vb, cabinetType, portDiameterMm, portLengthMm, numPorts, voltage])

  const maxSpl = useMemo(() => {
    if (!result) return null
    return maxSplFromSimulation(result.freqs, result.sim.spl, result.sim.excursionMm, ts)
  }, [result, ts])

  if (!result || (cabinetType !== 'sealed' && cabinetType !== 'ported')) return null

  const { freqs, sim } = result
  const xmax = ts.xmax

  // Peak values in the relevant band (20–200 Hz)
  let peakExc = 0
  let peakExcF = 0
  let peakVel = 0
  let peakVelF = 0
  for (let i = 0; i < freqs.length; i++) {
    const f = freqs[i]!
    if (f < 15 || f > 400) continue
    if (sim.excursionMm[i]! > peakExc) {
      peakExc = sim.excursionMm[i]!
      peakExcF = f
    }
    if (result.isPorted && result.sim.portVelocity[i]! > peakVel) {
      peakVel = result.sim.portVelocity[i]!
      peakVelF = f
    }
  }

  const overXmax = peakExc > xmax
  const pipeRes = result.isPorted ? portPipeResonance(portLengthMm / 1e3) : 0

  const excursionSeries = [
    { x: freqs, y: sim.excursionMm, name: 'Excursion', color: '#3b82f6' },
    { x: [freqs[0]!, freqs[freqs.length - 1]!], y: [xmax, xmax], name: `Xmax ${xmax} mm`, color: '#ef4444', dash: true },
  ]

  const velocitySeries = result.isPorted
    ? [
        { x: freqs, y: result.sim.portVelocity, name: 'Porthastighed', color: '#8b5cf6' },
        { x: [freqs[0]!, freqs[freqs.length - 1]!], y: [PORT_VELOCITY_RECOMMENDED, PORT_VELOCITY_RECOMMENDED], name: '10 m/s anbefalet', color: '#f59e0b', dash: true },
        { x: [freqs[0]!, freqs[freqs.length - 1]!], y: [PORT_VELOCITY_CHUFFING, PORT_VELOCITY_CHUFFING], name: '17 m/s chuffing', color: '#ef4444', dash: true },
      ]
    : []

  return (
    <Card>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
        <h3 className="text-lg font-semibold text-gray-800 dark:text-gray-200">
          Excursion & port
        </h3>
        <label className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
          Effekt: <span className="font-mono w-14 text-right">{powerW} W</span>
          <input
            type="range"
            min={1}
            max={Math.min(ts.pe ?? 100, 300)}
            value={powerW}
            onChange={(e) => setPowerW(Number(e.target.value))}
            className="w-36"
            aria-label="Tilført effekt i watt"
          />
          <span className="text-xs text-gray-400">({voltage.toFixed(1)} V)</span>
        </label>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
        <StatCard
          label="Maks. excursion"
          value={peakExc.toFixed(1)}
          unit={`mm @ ${peakExcF.toFixed(0)} Hz`}
        />
        {result.isPorted && (
          <StatCard
            label="Maks. porthastighed"
            value={peakVel.toFixed(1)}
            unit={`m/s @ ${peakVelF.toFixed(0)} Hz`}
          />
        )}
        {result.isPorted && (
          <StatCard label="Portrør-resonans" value={pipeRes.toFixed(0)} unit="Hz" />
        )}
        {maxSpl && (
          <StatCard label="Termisk maks. SPL" value={maxSpl.thermalLimited.toFixed(0)} unit="dB" />
        )}
      </div>

      {/* Actionable warnings (SPEC §7.4) */}
      <div className="space-y-2 mb-4">
        {overXmax && (
          <div className="text-sm px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            ⚠ Excursion {peakExc.toFixed(1)} mm overstiger Xmax ({xmax} mm) ved {peakExcF.toFixed(0)} Hz og {powerW} W.
            {result.isPorted
              ? ' Overvej subsonisk højpasfilter under Fb eller lavere effekt.'
              : ' Overvej mindre effekt eller større kabinet.'}
          </div>
        )}
        {result.isPorted && peakVel > PORT_VELOCITY_CHUFFING && (
          <div className="text-sm px-3 py-2 rounded-md bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300">
            ⚠ Porthastighed {peakVel.toFixed(0)} m/s &gt; 17 m/s — hørbar chuffing sandsynlig.
            Brug større portareal (fx {Math.ceil(portDiameterMm * 1.3)} mm diameter) eller flere porte.
          </div>
        )}
        {result.isPorted && peakVel > PORT_VELOCITY_RECOMMENDED && peakVel <= PORT_VELOCITY_CHUFFING && (
          <div className="text-sm px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
            Porthastighed {peakVel.toFixed(0)} m/s &gt; 10 m/s anbefalet grænse — flarede porte eller lidt større areal giver margin.
          </div>
        )}
        {result.isPorted && pipeRes < 1200 && (
          <div className="text-sm px-3 py-2 rounded-md bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300">
            Portrør-resonans ved ≈{pipeRes.toFixed(0)} Hz kan ligge i passbåndet — placér porten væk fra midterområdet eller dæmp den.
          </div>
        )}
      </div>

      <div className="mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Membran-excursion [mm]</div>
      <ResponsivePlot data={excursionSeries} yLabel="mm" />

      {result.isPorted && (
        <>
          <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">Portlufthastighed [m/s]</div>
          <ResponsivePlot data={velocitySeries} yLabel="m/s" />
        </>
      )}

      {maxSpl && (
        <>
          <div className="mt-4 mb-2 text-sm font-medium text-gray-600 dark:text-gray-400">
            Maks. SPL (displacement- vs. termisk begrænset) [dB @ 1 m]
          </div>
          <ResponsivePlot
            data={[
              { x: freqs, y: maxSpl.displacementLimited, name: 'Displacement-grænse', color: '#3b82f6' },
              { x: [freqs[0]!, freqs[freqs.length - 1]!], y: [maxSpl.thermalLimited, maxSpl.thermalLimited], name: 'Termisk grænse', color: '#ef4444', dash: true },
              { x: freqs, y: maxSpl.maxSpl, name: 'System maks. SPL', color: '#10b981' },
            ]}
            yLabel="dB"
          />
        </>
      )}

      <p className="mt-3 text-xs text-gray-400">
        Beregnet med fuld lumped-element model (kompleks kredsløbsløsning) — samme motor som golden-testene.
      </p>
    </Card>
  )
}
