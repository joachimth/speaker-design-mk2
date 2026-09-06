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
 *
 * Per-band `mount` overrides (DesignBand.mount):
 *   - placement 'side': excluded entirely — the driver is not on the front
 *     baffle, so it gets no position (callers fall back to the generic
 *     baffle-step shelf and it is omitted from CAD cutouts).
 *   - explicit yMm (front): fixed position, x defaults to the centerline.
 *     Fixed bands bypass the auto-stack fit check (real, measured cabinets
 *     are trusted as given).
 *   - otherwise: auto vertical stack as before (only auto bands count
 *     toward the stack fit check).
 *
 * Returns null when no band ends up with a front-baffle position.
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
    .filter((x) => x.band.mount?.placement !== 'side');
  if (withDrivers.length === 0) return null;

  const labelOf = (band: DesignBand, driver: Driver) =>
    `${ROLE_LABELS[band.role] ?? band.role} — ${driver.manufacturer} ${driver.model}`;

  const fixed = withDrivers.filter((x) => x.band.mount?.yMm != null);
  const auto = withDrivers
    .filter((x) => x.band.mount?.yMm == null)
    .sort((a, b) => (order[a.band.role] ?? 9) - (order[b.band.role] ?? 9));

  const out: BandPosition[] = fixed.map(({ band, bandIndex, driver }) => ({
    bandIndex,
    label: labelOf(band, driver!),
    diameterMm: cutoutDiameterOf(driver),
    xMm: band.mount?.xMm ?? baffleWidthMm / 2,
    yMm: band.mount!.yMm!,
  }));

  if (auto.length > 0) {
    const GAP = 25;
    const dias = auto.map(({ driver }) => cutoutDiameterOf(driver));
    const stackH = dias.reduce((s, d) => s + d, 0) + GAP * (dias.length - 1);
    if (stackH <= baffleHeightMm - 60) {
      // Bias the stack upward: 35 % of the free space above, 65 % below
      const free = baffleHeightMm - stackH;
      let yTop = baffleHeightMm - Math.max(30, free * 0.35);
      for (let i = 0; i < auto.length; i++) {
        const d = dias[i]!;
        const { band, bandIndex, driver } = auto[i]!;
        out.push({
          bandIndex,
          label: labelOf(band, driver!),
          diameterMm: d,
          xMm: baffleWidthMm / 2,
          yMm: yTop - d / 2,
        });
        yTop -= d + GAP;
      }
    }
    // Auto stack that cannot fit: those bands get no position (shelf
    // fallback per band) while fixed positions are kept.
  }

  if (out.length === 0) return null;
  // Contract: ordered top-to-bottom (y descending) — defaultPortPosition
  // places the port below the LAST (lowest) cutout.
  return out.sort((a, b) => b.yMm - a.yMm);
}
