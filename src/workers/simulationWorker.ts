// Web Worker for heavy acoustic simulation
//
// Offloads frequency response computation from the main thread.
// The worker receives serialized driver data + design params, computes
// the per-band processed curves and summed response, and returns them.
//
// This avoids blocking the UI during re-renders when sliders/inputs change.

import { generateFrequencies } from '../lib/acoustic/thieleSmall'
import { processBand, complexSum, type ProcessedBand } from '../lib/acoustic/simulateBands'
import { effectiveAcousticDepth } from '../lib/acoustic/autoDesign'
import { calcBaffleStep, calcBaffleStepCompensation, calcBaffleDiffraction } from '../lib/acoustic/baffle'
import { layoutBandPositions } from '../lib/acoustic/baffleLayout'
import type { Driver, FrequencyDataPoint, DesignBand } from '../types'

export interface SimWorkerInput {
  bands: DesignBand[]
  drivers: Driver[]
  ways: number
  baffleWidth: number
  baffleHeight: number
  cabinetType: string
  portFb: number
  portVb: number
  portDiameter: number
  numPorts: number
  roundoverRadius?: number
}

export interface SimWorkerOutput {
  processedBands: {
    band: DesignBand
    driverId: string
    curve: FrequencyDataPoint[]
    hasRealResponse: boolean
    /** Estimated baffle position (CAD layout); null when the stack doesn't fit */
    position: { xMm: number; yMm: number } | null
    /** Own sub-baffle dims [mm] (split front baffle) for the spinorama delta */
    baffleWMm?: number
    baffleHMm?: number
    /** Mechanical acoustic-center depth [mm] used in the complex sum */
    depthMm?: number
  }[]
  summedResponse: FrequencyDataPoint[]
  freqs: number[]
}

self.onmessage = (e: MessageEvent<SimWorkerInput>) => {
  const { bands, drivers, ways, baffleWidth, baffleHeight, cabinetType, portFb, portVb, portDiameter, numPorts, roundoverRadius } = e.data

  const freqs = generateFrequencies(20, 20000, 12)

  // Baffle step + compensation (shared model — derive from actual loss)
  const baffleStepResult = calcBaffleStep(baffleWidth, baffleHeight, freqs)
  const fStep = 343000 / (2 * baffleWidth)
  const fStep3x = fStep * 3
  const baffleCompDb = Math.abs(baffleStepResult.response[0] ?? 6)
  const baffleComp = calcBaffleStepCompensation(fStep, baffleCompDb, freqs)

  const activeBands = bands.slice(0, ways)

  // Position-aware edge diffraction (same layout as CAD export)
  const positions = layoutBandPositions(activeBands, drivers, baffleWidth, baffleHeight)

  const processedBands: ProcessedBand[] = []
  const bandPositions: ({ xMm: number; yMm: number; baffleWMm?: number; baffleHMm?: number } | null)[] = []

  for (let bi = 0; bi < activeBands.length; bi++) {
    const band = activeBands[bi]!
    const driver = drivers.find((d) => d.id === band.driverId)
    const own = band.mount?.placement !== 'side'
      && band.mount?.baffleWMm && band.mount.baffleWMm > 0
      && band.mount?.baffleHMm && band.mount.baffleHMm > 0
      ? { w: band.mount.baffleWMm, h: band.mount.baffleHMm }
      : null
    const pos = positions?.find((p) => p.bandIndex === bi)
    const diffractionDb = own
      ? calcBaffleDiffraction(own.w, own.h, own.w / 2, own.h / 2, roundoverRadius ?? 0, freqs)
      : pos
        ? calcBaffleDiffraction(baffleWidth, baffleHeight, pos.xMm, pos.yMm, roundoverRadius ?? 0, freqs)
        : undefined
    const result = processBand(
      band, driver, freqs,
      baffleStepResult, baffleComp,
      fStep, fStep3x,
      cabinetType, portFb, portVb, portDiameter, numPorts,
      baffleWidth,
      diffractionDb,
    )
    if (!result) continue
    processedBands.push({
      band,
      driverId: band.driverId,
      curve: result.curve,
      hasRealResponse: result.hasRealResponse,
      filters: result.filters,
      depthMm: (driver ? effectiveAcousticDepth(driver, band.mount) : null) ?? 0,
    })
    bandPositions.push(own
      ? { xMm: own.w / 2, yMm: own.h / 2, baffleWMm: own.w, baffleHMm: own.h }
      : pos ? { xMm: pos.xMm, yMm: pos.yMm } : null)
  }

  // Complex voltage summation (shared implementation)
  const summedResponse = complexSum(processedBands, freqs)

  const output: SimWorkerOutput = {
    processedBands: processedBands.map((pb, i) => ({
      band: pb.band,
      driverId: pb.driverId,
      curve: pb.curve,
      hasRealResponse: pb.hasRealResponse,
      position: bandPositions[i] ? { xMm: bandPositions[i]!.xMm, yMm: bandPositions[i]!.yMm } : null,
      baffleWMm: bandPositions[i]?.baffleWMm,
      baffleHMm: bandPositions[i]?.baffleHMm,
      depthMm: pb.depthMm,
    })),
    summedResponse,
    freqs,
  }

  ;(self as unknown as Worker).postMessage(output)
}
