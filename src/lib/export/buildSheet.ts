// Build sheet export: cut list, drill measurements, port specs, materials.
// Generates a markdown document that can be saved as PDF.

import type { CabinetDimensions, DesignBand, Driver } from '@/types';

export interface BuildSheetData {
  projectName: string;
  cabinetType: string;
  dims: CabinetDimensions;
  internalVolume: number; // [L]
  portSpec?: {
    shape: 'round' | 'slot';
    diameter: number; // [mm] (or slot width)
    length: number; // [mm]
    count: number;
  };
  bands: { driver: Driver; band: DesignBand }[];
  bracing?: { type: string; count: number; thickness: number }[];
  damping?: { material: string; fillRatio: number };
}

export function generateBuildSheet(data: BuildSheetData): string {
  const { projectName, cabinetType, dims, internalVolume, portSpec, bands, bracing, damping } = data;
  const t = dims.wallThickness;
  const W = dims.width;
  const H = dims.height;
  const D = dims.depth;

  // Inner dimensions
  const iW = W - 2 * t;
  const iH = H - 2 * t;
  const iD = D - t; // front baffle is one wall

  // Cut list: front baffle, back, 2 sides, top, bottom
  const front = { w: W, h: H, label: 'Front baffle' };
  const back = { w: iW, h: iH, label: 'Back panel' };
  const sides = { w: D - 2 * t, h: iH, label: 'Side panel (×2)' };
  const top = { w: iW, h: D - 2 * t, label: 'Top/bottom panel (×2)' };

  let md = `# Byggeark: ${projectName}\n\n`;
  md += `## Kabinet\n\n`;
  md += `| Parameter | Værdi |\n|---|---|\n`;
  md += `| Type | ${cabinetType} |\n`;
  md += `| Udvendige mål | ${W} × ${H} × ${D} mm |\n`;
  md += `| Pladetykkelse | ${t} mm |\n`;
  md += `| Indvendige mål | ${iW} × ${iH} × ${iD} mm |\n`;
  md += `| Netto volumen | ${internalVolume.toFixed(1)} L |\n\n`;

  md += `## Skæreliste\n\n`;
  md += `| Del | Bredde (mm) | Højde/Længde (mm) | Antal |\n|---|---|---|---|\n`;
  md += `| ${front.label} | ${front.w} | ${front.h} | 1 |\n`;
  md += `| ${back.label} | ${back.w} | ${back.h} | 1 |\n`;
  md += `| ${sides.label} | ${sides.w} | ${sides.h} | 2 |\n`;
  md += `| ${top.label} | ${top.w} | ${top.h} | 2 |\n\n`;

  if (portSpec) {
    md += `## Port\n\n`;
    md += `| Parameter | Værdi |\n|---|---|\n`;
    md += `| Form | ${portSpec.shape} |\n`;
    md += `| ${portSpec.shape === 'round' ? 'Diameter' : 'Bredde'} | ${portSpec.diameter} mm |\n`;
    md += `| Længde | ${portSpec.length} mm |\n`;
    md += `| Antal | ${portSpec.count} |\n\n`;
  }

  md += `## Enheder og udskæringer\n\n`;
  md += `| Bånd | Enhed | Udskærings-Ø (mm) | Monteringsdybde (mm) |\n|---|---|---|---|\n`;
  for (const { driver, band } of bands) {
    const cutout = driver.dimensions?.cutoutDiameter ?? 0;
    const depth = driver.dimensions?.mountingDepth ?? 0;
    const role = band.role === 'low' ? 'Bas' : band.role === 'mid' ? 'Mellem' : band.role === 'mid2' ? 'Mellem 2' : 'Diskant';
    md += `| ${role} | ${driver.manufacturer} ${driver.model} | ${cutout} | ${depth} |\n`;
  }
  md += '\n';

  if (bracing && bracing.length > 0) {
    md += `## Bracing\n\n`;
    for (const b of bracing) {
      md += `- ${b.type}: ${b.count} stk, ${b.thickness} mm\n`;
    }
    md += '\n';
  }

  if (damping) {
    md += `## Dæmpning\n\n`;
    md += `- Materialetype: ${damping.material}\n`;
    md += `- Fyldningsgrad: ${(damping.fillRatio * 100).toFixed(0)}%\n\n`;
  }

  md += `## Samlingsrækkefølge\n\n`;
  md += `1. Skær alle paneler efter skærelisten\n`;
  md += `2. Fræs udskæringer til enheder i front baffle\n`;
  md += `3. Saml sider + top + bund + bagside (lim + tappet)\n`;
  md += `4. Monter bracing og dæmpning\n`;
  md += `5. Før portrør gennem udskæring\n`;
  md += `6. Monter enheder i front baffle\n`;
  md += `7. Fastgør front baffle (skruet, kan afmonteres)\n\n`;

  md += `## Volumenkontrol\n\n`;
  md += `Brutto: ${(iW * iH * iD / 1e6).toFixed(1)} L\n`;
  md += `Netto (efter driver + port + bracing): ${internalVolume.toFixed(1)} L\n`;

  return md;
}

export function downloadBuildSheet(data: BuildSheetData): void {
  const text = generateBuildSheet(data);
  const blob = new Blob([text], { type: 'text/markdown' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.projectName.replace(/\s+/g, '-')}-byggeark.md`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
