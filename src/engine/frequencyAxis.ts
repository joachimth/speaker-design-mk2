// Frequency axis generation for the physics engine.
// All modules work on the same log-spaced frequency grid so results
// can be summed directly as complex values.

/**
 * Generate log-spaced frequencies from fMin to fMax.
 * @param fMin  Minimum frequency [Hz]
 * @param fMax  Maximum frequency [Hz]
 * @param ptsPerOctave  Points per octave (default 48 = high resolution)
 */
export function generateFrequencies(
  fMin: number = 10,
  fMax: number = 40000,
  ptsPerOctave: number = 48,
): number[] {
  const nOctaves = Math.log2(fMax / fMin);
  const nPoints = Math.ceil(nOctaves * ptsPerOctave);
  const freqs: number[] = [];
  for (let i = 0; i <= nPoints; i++) {
    const f = fMin * Math.pow(2, i / ptsPerOctave);
    if (f <= fMax) freqs.push(f);
  }
  return freqs;
}

/** Standard frequency range for full audio analysis */
export const FREQ_RANGE_20_20K = (): number[] => generateFrequencies(20, 20000, 12);

/** High-resolution frequency range for detailed analysis */
export const FREQ_RANGE_HIRES = (): number[] => generateFrequencies(10, 40000, 48);
