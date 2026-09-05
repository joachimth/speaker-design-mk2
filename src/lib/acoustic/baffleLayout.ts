// Deterministic driver layout on the baffle.
//
// Single source of truth for estimated driver positions — used by BOTH the
// CAD export (OpenSCAD/DXF) and the diffraction simulation, so the response
// you simulate matches the baffle you cut.
//
// Layout: vertical stack on the centerline, highest band (tweeter) at the
// top, 25 mm edge gap between cutouts, stack biased slightly above center.
// Coordinates: x from the baffle's left edge, y from the bottom edge [mm].

import type { DesignBand, Driver } from '@/types';

export interface BandPosition {
  /** Index into the bands array this position belongs to */
  bandIndex: number;
  label: string;
  diameterMm: number;
  xMm: number;
  yMm: number;
}

const ROLE_LABELS: Record<string, string> = {
  low: 'Bas',
  mid: 'Mellem',
  mid2: 'Mellem 2',
  high: 'Diskant',
};

/** Cutout diameter with the same fallback chain as the build sheet. */
export function cutoutDiameterOf(driver: Driver | undefined): number {
  const cut = driver?.dimensions?.cutoutDiameter;
  if (cut && cut > 0) return cut;
  const overall = driver?.dimensions?.overallDiameter;
  if (overall && overall > 0) return Math.round(overall * 0.85);
  const sd = driver?.tsParams?.sd;
  if (sd && sd > 0) return Math.round(2 * Math.sqrt(sd / Math.PI) * 10 * 1.15); // cm² → mm + flange
  return 100;
}

/**
 * Estimated positions for each band's driver on the baffle.
 * Returns null when no band has a driver or the stack cannot fit
 * (30 mm margin top and bottom).
 */
export function layoutBandPositions(
  bands: DesignBand[],
  drivers: Driver[],
  baffleWidthMm: number,
  baffleHeightMm: number,
): BandPosition[] | null {
  const order: Record<string, number> = { high: 0, mid2: 1, mid: 2, low: 3 };
  const withDrivers = bands
    .map((b, i) => ({ band: b, bandIndex: i, driver: drivers.find((d) => d.id === b.driverId) }))
    .filter((x) => !!x.driver)
    .sort((a, b) => (order[a.band.role] ?? 9) - (order[b.band.role] ?? 9));
  if (withDrivers.length === 0) return null;

  const GAP = 25;
  const dias = withDrivers.map(({ driver }) => cutoutDiameterOf(driver));
  const stackH = dias.reduce((s, d) => s + d, 0) + GAP * (dias.length - 1);
  if (stackH > baffleHeightMm - 60) return null;

  // Bias the stack upward: 35 % of the free space above, 65 % below
  const free = baffleHeightMm - stackH;
  let yTop = baffleHeightMm - Math.max(30, free * 0.35);

  const out: BandPosition[] = [];
  for (let i = 0; i < withDrivers.length; i++) {
    const d = dias[i]!;
    const { band, bandIndex, driver } = withDrivers[i]!;
    out.push({
      bandIndex,
      label: `${ROLE_LABELS[band.role] ?? band.role} — ${driver!.manufacturer} ${driver!.model}`,
      diameterMm: d,
      xMm: baffleWidthMm / 2,
      yMm: yTop - d / 2,
    });
    yTop -= d + GAP;
  }
  return out;
}
