// OpenSCAD + DXF export for baffle cutting (SPEC §9 — CAD)
//
// OpenSCAD: a fully parametric .scad file (outer dims, wall thickness,
// driver cutouts with positions, port hole) — every value is a variable at
// the top so the user can adjust in OpenSCAD before rendering.
//
// DXF: minimal R12 ASCII with the baffle outline (4 LINE entities) and one
// CIRCLE per cutout — imports into LibreCAD/Fusion/QCAD for CNC or manual
// transfer. Units are mm.
//
// Driver positions are a deterministic estimate (vertical stack on the
// centerline, tweeter at the top) — clearly marked as editable.

import type { DesignBand, Driver } from '@/types';
import { layoutBandPositions, cutoutDiameterOf } from '@/lib/acoustic/baffleLayout';

export { cutoutDiameterOf };

export interface BaffleDriverCutout {
  label: string;
  diameterMm: number;
  /** Center X from the baffle's left edge [mm] */
  xMm: number;
  /** Center Y from the baffle's bottom edge [mm] */
  yMm: number;
}

export interface BaffleCutSpec {
  projectName: string;
  baffleWidthMm: number;
  baffleHeightMm: number;
  wallThicknessMm: number;
  /** Outer cabinet depth [mm] (cubic estimate is fine — parametric in .scad) */
  outerDepthMm: number;
  roundoverRadiusMm: number;
  drivers: BaffleDriverCutout[];
  port?: { diameterMm: number; xMm: number; yMm: number } | null;
}

/**
 * Deterministic default layout: vertical stack on the centerline, highest
 * band (tweeter) at the top, 25 mm edge gap between cutouts, stack biased
 * slightly above center. Returns null if the stack cannot fit.
 *
 * Delegates to layoutBandPositions (lib/acoustic/baffleLayout) — the same
 * positions drive the diffraction simulation, so the simulated response
 * matches the exported baffle.
 */
export function defaultDriverLayout(
  bands: DesignBand[],
  drivers: Driver[],
  baffleWidthMm: number,
  baffleHeightMm: number,
): BaffleDriverCutout[] | null {
  const positions = layoutBandPositions(bands, drivers, baffleWidthMm, baffleHeightMm);
  if (!positions) return null;
  return positions.map((p) => ({
    label: p.label,
    diameterMm: p.diameterMm,
    xMm: p.xMm,
    yMm: p.yMm,
  }));
}

/** Port position: centered below the lowest driver if it fits, else null. */
export function defaultPortPosition(
  layout: BaffleDriverCutout[],
  portDiameterMm: number,
  baffleWidthMm: number,
): { diameterMm: number; xMm: number; yMm: number } | null {
  if (layout.length === 0) return null;
  const lowest = layout[layout.length - 1]!;
  const y = lowest.yMm - lowest.diameterMm / 2 - 25 - portDiameterMm / 2;
  if (y < portDiameterMm / 2 + 30) return null; // no room on the baffle
  return { diameterMm: portDiameterMm, xMm: baffleWidthMm / 2, yMm: y };
}

// ---------------------------------------------------------------------------
// OpenSCAD
// ---------------------------------------------------------------------------

function n(v: number): string {
  return (Math.round(v * 100) / 100).toString();
}

export function exportOpenScad(spec: BaffleCutSpec): string {
  const L: string[] = [];
  L.push(`// ${spec.projectName} — kabinet (genereret af Speaker Design 4 All)`);
  L.push('// Alle mål i mm. Justér variablerne og render med F6.');
  L.push('// Driver-positioner er et estimat (lodret stak på centerlinjen) — redigér frit.');
  L.push('');
  L.push(`baffle_w = ${n(spec.baffleWidthMm)};`);
  L.push(`baffle_h = ${n(spec.baffleHeightMm)};`);
  L.push(`depth    = ${n(spec.outerDepthMm)};`);
  L.push(`wall     = ${n(spec.wallThicknessMm)};`);
  L.push(`roundover = ${n(spec.roundoverRadiusMm)}; // anvendes ikke i modellen (fræses manuelt)`);
  L.push('');
  L.push('// [x fra venstre kant, y fra bund, udskærings-diameter]');
  L.push('driver_cutouts = [');
  for (const d of spec.drivers) {
    L.push(`  [${n(d.xMm)}, ${n(d.yMm)}, ${n(d.diameterMm)}], // ${d.label}`);
  }
  L.push('];');
  L.push('');
  if (spec.port) {
    L.push(`port_cutout = [${n(spec.port.xMm)}, ${n(spec.port.yMm)}, ${n(spec.port.diameterMm)}];`);
  } else {
    L.push('port_cutout = undef; // ingen port på baflen');
  }
  L.push('');
  L.push('module cabinet() {');
  L.push('  difference() {');
  L.push('    cube([baffle_w, depth, baffle_h]);');
  L.push('    translate([wall, wall, wall])');
  L.push('      cube([baffle_w - 2*wall, depth - 2*wall, baffle_h - 2*wall]);');
  L.push('    // Driver-udskæringer gennem frontbaflen (front = y=0-planet)');
  L.push('    for (c = driver_cutouts)');
  L.push('      translate([c[0], -1, c[1]])');
  L.push('        rotate([-90, 0, 0])');
  L.push('          cylinder(h = wall + 2, d = c[2], $fn = 96);');
  L.push('    if (port_cutout != undef)');
  L.push('      translate([port_cutout[0], -1, port_cutout[1]])');
  L.push('        rotate([-90, 0, 0])');
  L.push('          cylinder(h = wall + 2, d = port_cutout[2], $fn = 96);');
  L.push('  }');
  L.push('}');
  L.push('');
  L.push('cabinet();');
  L.push('');
  return L.join('\n');
}

// ---------------------------------------------------------------------------
// DXF (R12 ASCII)
// ---------------------------------------------------------------------------

function dxfLine(x1: number, y1: number, x2: number, y2: number): string[] {
  return ['0', 'LINE', '8', '0', '10', n(x1), '20', n(y1), '30', '0', '11', n(x2), '21', n(y2), '31', '0'];
}

function dxfCircle(cx: number, cy: number, r: number): string[] {
  return ['0', 'CIRCLE', '8', '0', '10', n(cx), '20', n(cy), '30', '0', '40', n(r)];
}

/**
 * Baffle front panel as DXF R12: outline rectangle + a circle per cutout.
 * Origin = baffle's lower-left corner, Y up, units mm.
 */
export function exportBaffleDxf(spec: BaffleCutSpec): string {
  const e: string[] = [];
  const W = spec.baffleWidthMm;
  const H = spec.baffleHeightMm;
  e.push(...dxfLine(0, 0, W, 0));
  e.push(...dxfLine(W, 0, W, H));
  e.push(...dxfLine(W, H, 0, H));
  e.push(...dxfLine(0, H, 0, 0));
  for (const d of spec.drivers) {
    e.push(...dxfCircle(d.xMm, d.yMm, d.diameterMm / 2));
  }
  if (spec.port) {
    e.push(...dxfCircle(spec.port.xMm, spec.port.yMm, spec.port.diameterMm / 2));
  }
  const doc = ['0', 'SECTION', '2', 'ENTITIES', ...e, '0', 'ENDSEC', '0', 'EOF'];
  return doc.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Downloads
// ---------------------------------------------------------------------------

function download(text: string, filename: string, mime: string): void {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function downloadOpenScad(spec: BaffleCutSpec): void {
  download(exportOpenScad(spec), `${spec.projectName}-kabinet.scad`, 'text/plain');
}

export function downloadBaffleDxf(spec: BaffleCutSpec): void {
  download(exportBaffleDxf(spec), `${spec.projectName}-baffel.dxf`, 'image/vnd.dxf');
}
