// Tests for OpenSCAD/DXF baffle export

import { describe, it, expect } from 'vitest';
import {
  cutoutDiameterOf,
  defaultDriverLayout,
  defaultPortPosition,
  exportOpenScad,
  exportBaffleDxf,
  type BaffleCutSpec,
} from '../openscadDxf';
import type { DesignBand, Driver } from '@/types';

function driver(id: string, type: Driver['type'], patch: Partial<Driver> = {}): Driver {
  return {
    id,
    manufacturer: 'Test',
    model: id.toUpperCase(),
    type,
    tsParams: { fs: 30, re: 6, qms: 3, qes: 0.5, qts: 0.4, vas: 50, sensitivity: 88, xmax: 5, sd: 0, imp: 8 },
    createdAt: 0,
    updatedAt: 0,
    ...patch,
  };
}

function band(driverId: string, role: DesignBand['role']): DesignBand {
  return {
    driverId,
    role,
    lowpassFreq: 0,
    lowpassType: 'LR4',
    highpassFreq: 0,
    highpassType: 'LR4',
    gain: 0,
    polarity: 0,
    delay: 0,
  };
}

const WOOFER = driver('woofer', 'woofer', {
  dimensions: { overallDiameter: 180, cutoutDiameter: 146, mountingDepth: 80 },
});
const TWEETER = driver('tweeter', 'tweeter', {
  dimensions: { overallDiameter: 104, cutoutDiameter: 72, mountingDepth: 30 },
});

describe('cutoutDiameterOf', () => {
  it('prefers the real cutout diameter', () => {
    expect(cutoutDiameterOf(WOOFER)).toBe(146);
  });

  it('falls back to 85 % of overall diameter', () => {
    const d = driver('x', 'woofer', { dimensions: { overallDiameter: 200, cutoutDiameter: 0, mountingDepth: 0 } });
    expect(cutoutDiameterOf(d)).toBe(170);
  });

  it('falls back to Sd-derived size, then 100 mm', () => {
    const d = driver('y', 'woofer', {
      tsParams: { fs: 30, re: 6, qms: 3, qes: 0.5, qts: 0.4, vas: 50, sensitivity: 88, xmax: 5, sd: 220, imp: 8 },
    });
    // 2·sqrt(220/π)·10·1.15 ≈ 192 mm
    expect(cutoutDiameterOf(d)).toBeGreaterThan(150);
    expect(cutoutDiameterOf(d)).toBeLessThan(230);
    expect(cutoutDiameterOf(undefined)).toBe(100);
  });
});

describe('defaultDriverLayout', () => {
  const bands = [band('woofer', 'low'), band('tweeter', 'high')];
  const drivers = [WOOFER, TWEETER];

  it('stacks tweeter above woofer on the centerline', () => {
    const layout = defaultDriverLayout(bands, drivers, 320, 900);
    expect(layout).not.toBeNull();
    expect(layout!.length).toBe(2);
    const [top, bottom] = layout!;
    expect(top!.label).toContain('Diskant');
    expect(bottom!.label).toContain('Bas');
    expect(top!.yMm).toBeGreaterThan(bottom!.yMm);
    expect(top!.xMm).toBe(160);
    expect(bottom!.xMm).toBe(160);
  });

  it('keeps cutouts inside the baffle without overlap', () => {
    const layout = defaultDriverLayout(bands, drivers, 320, 900)!;
    for (const c of layout) {
      expect(c.yMm - c.diameterMm / 2).toBeGreaterThan(0);
      expect(c.yMm + c.diameterMm / 2).toBeLessThan(900);
    }
    const [a, b] = layout;
    const centerDist = Math.abs(a!.yMm - b!.yMm);
    expect(centerDist).toBeGreaterThanOrEqual(a!.diameterMm / 2 + b!.diameterMm / 2 + 24.9);
  });

  it('returns null when the stack cannot fit', () => {
    expect(defaultDriverLayout(bands, drivers, 320, 200)).toBeNull();
  });

  it('returns null with no matching drivers', () => {
    expect(defaultDriverLayout([band('missing', 'low')], drivers, 320, 900)).toBeNull();
  });
});

describe('defaultPortPosition', () => {
  it('places the port below the lowest driver when there is room', () => {
    const layout = defaultDriverLayout([band('woofer', 'low'), band('tweeter', 'high')], [WOOFER, TWEETER], 320, 900)!;
    const port = defaultPortPosition(layout, 60, 320);
    expect(port).not.toBeNull();
    const lowest = layout[layout.length - 1]!;
    expect(port!.yMm).toBeLessThan(lowest.yMm - lowest.diameterMm / 2);
    expect(port!.yMm).toBeGreaterThan(60);
    expect(port!.xMm).toBe(160);
  });

  it('returns null when there is no room on the baffle', () => {
    const layout = [{ label: 'Bas', diameterMm: 200, xMm: 160, yMm: 130 }];
    expect(defaultPortPosition(layout, 100, 320)).toBeNull();
  });
});

function spec(withPort: boolean): BaffleCutSpec {
  return {
    projectName: 'testbox',
    baffleWidthMm: 320,
    baffleHeightMm: 900,
    wallThicknessMm: 19,
    outerDepthMm: 310,
    roundoverRadiusMm: 40,
    drivers: [
      { label: 'Diskant — Test TWEETER', diameterMm: 72, xMm: 160, yMm: 700 },
      { label: 'Bas — Test WOOFER', diameterMm: 146, xMm: 160, yMm: 560 },
    ],
    port: withPort ? { diameterMm: 60, xMm: 160, yMm: 300 } : null,
  };
}

describe('exportOpenScad', () => {
  it('emits parametric variables and a valid difference() model', () => {
    const scad = exportOpenScad(spec(true));
    expect(scad).toContain('baffle_w = 320;');
    expect(scad).toContain('baffle_h = 900;');
    expect(scad).toContain('wall     = 19;');
    expect(scad).toContain('driver_cutouts = [');
    expect(scad).toContain('[160, 700, 72], // Diskant — Test TWEETER');
    expect(scad).toContain('port_cutout = [160, 300, 60];');
    expect(scad).toContain('difference()');
    expect(scad).toContain('cylinder(h = wall + 2, d = c[2], $fn = 96);');
    expect(scad).toContain('cabinet();');
  });

  it('marks the port as undef when absent', () => {
    const scad = exportOpenScad(spec(false));
    expect(scad).toContain('port_cutout = undef;');
  });
});

describe('exportBaffleDxf', () => {
  it('has ENTITIES section, outline and one circle per cutout', () => {
    const dxf = exportBaffleDxf(spec(true));
    expect(dxf.startsWith('0\nSECTION\n2\nENTITIES\n')).toBe(true);
    expect(dxf.trimEnd().endsWith('0\nEOF')).toBe(true);
    expect((dxf.match(/\nLINE\n/g) ?? []).length).toBe(4);
    expect((dxf.match(/\nCIRCLE\n/g) ?? []).length).toBe(3); // 2 drivers + port
    // Radius group code 40 carries diameter/2
    expect(dxf).toContain('40\n36');  // tweeter 72/2
    expect(dxf).toContain('40\n73'); // woofer 146/2
    expect(dxf).toContain('40\n30');  // port 60/2
  });

  it('omits the port circle when absent', () => {
    const dxf = exportBaffleDxf(spec(false));
    expect((dxf.match(/\nCIRCLE\n/g) ?? []).length).toBe(2);
  });

  it('outline spans exactly the baffle rectangle', () => {
    const dxf = exportBaffleDxf(spec(false));
    expect(dxf).toContain('10\n0\n20\n0');
    expect(dxf).toContain('11\n320\n21\n900');
  });
});
