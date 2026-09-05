// Complex number arithmetic for the physics engine.
// All transfer functions are stored as complex values (magnitude + phase),
// never as dB-only. This enables correct summation across drivers and
// crossover filters.

export interface Complex {
  re: number;
  im: number;
}

export const cplx = (re: number, im: number = 0): Complex => ({ re, im });

/** Complex from polar form (magnitude + phase in radians) */
export const fromPolar = (mag: number, phaseRad: number): Complex => ({
  re: mag * Math.cos(phaseRad),
  im: mag * Math.sin(phaseRad),
});

/** Complex magnitude |z| */
export const cmag = (z: Complex): number => Math.sqrt(z.re * z.re + z.im * z.im);

/** Complex magnitude in dB: 20*log10(|z|) */
export const cmagDb = (z: Complex): number => 20 * Math.log10(cmag(z) + 1e-30);

/** Complex phase in radians */
export const cphase = (z: Complex): number => Math.atan2(z.im, z.re);

/** Complex phase in degrees */
export const cphaseDeg = (z: Complex): number => (cphase(z) * 180) / Math.PI;

export const cadd = (a: Complex, b: Complex): Complex => ({ re: a.re + b.re, im: a.im + b.im });
export const csub = (a: Complex, b: Complex): Complex => ({ re: a.re - b.re, im: a.im - b.im });

export const cmul = (a: Complex, b: Complex): Complex => ({
  re: a.re * b.re - a.im * b.im,
  im: a.re * b.im + a.im * b.re,
});

export const cdiv = (a: Complex, b: Complex): Complex => {
  const denom = b.re * b.re + b.im * b.im;
  return {
    re: (a.re * b.re + a.im * b.im) / denom,
    im: (a.im * b.re - a.re * b.im) / denom,
  };
};

/** Complex conjugate */
export const cconj = (z: Complex): Complex => ({ re: z.re, im: -z.im });

/** Complex exponential e^(j*theta) */
export const cexp = (theta: number): Complex => ({
  re: Math.cos(theta),
  im: Math.sin(theta),
});

/** Scale by real scalar */
export const cscale = (z: Complex, s: number): Complex => ({ re: z.re * s, im: z.im * s });

/**
 * Evaluate a biquad transfer function H(z) at a given frequency.
 * H(z) = (b0 + b1*z^-1 + b2*z^-2) / (1 + a1*z^-1 + a2*z^-2)
 * where z = e^(j*w), w = 2*pi*f/fs
 */
export function biquadResponse(
  coeffs: { b0: number; b1: number; b2: number; a1: number; a2: number },
  f: number,
  fs: number,
): Complex {
  const w = (2 * Math.PI * f) / fs;
  const z1 = cexp(-w); // z^-1
  const z2 = cexp(-2 * w); // z^-2

  const numerator = cadd(
    cadd(cplx(coeffs.b0), cscale(z1, coeffs.b1)),
    cscale(z2, coeffs.b2),
  );
  const denominator = cadd(
    cplx(1),
    cadd(cscale(z1, coeffs.a1), cscale(z2, coeffs.a2)),
  );

  return cdiv(numerator, denominator);
}

/** Complex reciprocal 1/z */
export const cinv = (z: Complex): Complex => {
  const d = z.re * z.re + z.im * z.im || 1e-300;
  return { re: z.re / d, im: -z.im / d };
};

/** Complex hyperbolic cosine: cosh(x+jy) = cosh(x)cos(y) + j·sinh(x)sin(y) */
export const ccosh = (z: Complex): Complex => ({
  re: Math.cosh(z.re) * Math.cos(z.im),
  im: Math.sinh(z.re) * Math.sin(z.im),
});

/** Complex hyperbolic sine: sinh(x+jy) = sinh(x)cos(y) + j·cosh(x)sin(y) */
export const csinh = (z: Complex): Complex => ({
  re: Math.sinh(z.re) * Math.cos(z.im),
  im: Math.cosh(z.re) * Math.sin(z.im),
});

/** Parallel combination of two complex impedances: (a·b)/(a+b) */
export const cparallel = (a: Complex, b: Complex): Complex => cdiv(cmul(a, b), cadd(a, b));
