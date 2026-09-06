// Core type definitions for Speaker Design

// ---------------------------------------------------------------------------
// Driver
// ---------------------------------------------------------------------------

export interface ThieleSmallParams {
  fs: number;        // Free-air resonance frequency [Hz]
  re: number;        // DC resistance [Ω]
  qms: number;       // Mechanical Q
  qes: number;       // Electrical Q
  qts: number;       // Total Q (derived: qms * qes / (qms + qes))
  vas: number;       // Equivalent volume [L]
  cms?: number;      // Mechanical compliance [mm/N] (optional)
  mms?: number;      // Moving mass [g] (optional)
  bl?: number;       // Force factor [N/A] (optional)
  sensitivity: number; // Sensitivity [dB SPL @ 1W/1m]
  xmax: number;      // Maximum linear excursion [mm]
  xmaxPeak?: number; // Peak excursion [mm] (optional)
  sd: number;        // Effective piston area [cm²]
  sdM2?: number;     // Effective piston area [m²] (derived)
  vd?: number;       // Peak displacement volume [cm³] (derived: sd * xmax)
  le?: number;       // Voice coil inductance [mH] (optional)
  pe?: number;       // Power handling [W] (optional)
  imp: number;       // Nominal impedance [Ω]
}

export interface MechanicalDimensions {
  overallDiameter: number;  // [mm]
  cutoutDiameter: number;   // [mm]
  mountingDepth: number;    // [mm]
  magnetDiameter?: number;   // [mm] (optional)
  magnetDepth?: number;      // [mm] (optional)
  weight?: number;           // [g] (optional)
  flangeHeight?: number;    // [mm] (optional)
  coilFormerDiameter?: number; // [mm] (optional)
}

export type DriverType = 'woofer' | 'midrange' | 'tweeter' | 'fullrange' | 'subwoofer';

export interface FrequencyDataPoint {
  freq: number;   // [Hz]
  magnitude: number; // [dB]
  phase?: number;    // [degrees] (optional, from FRD import)
}

export interface ImpedanceDataPoint {
  freq: number;   // [Hz]
  magnitude: number; // [Ω]
  phase?: number;    // [degrees] (optional)
}

export interface OffAxisData {
  angle: number;  // [degrees]
  curve: FrequencyDataPoint[];
}

export interface ParameterSet {
  name: string;
  tsParams: ThieleSmallParams;
  notes?: string;
}

export interface Driver {
  id: string;
  manufacturer: string;
  model: string;
  type: DriverType;
  /** Active T/S parameters used for all simulations */
  tsParams: ThieleSmallParams;
  /** Named alternate parameter sets (e.g. "Datasheet", "DATS @5h", "DATS @settled") */
  parameterSets?: ParameterSet[];
  dimensions?: MechanicalDimensions;
  frequencyResponse?: FrequencyDataPoint[];
  impedance?: ImpedanceDataPoint[];
  offAxis?: OffAxisData[];
  datasheetUrl?: string;
  datasheetPdf?: ArrayBuffer; // stored in IndexedDB
  notes?: string;
  createdAt: number;
  updatedAt: number;
}

// ---------------------------------------------------------------------------
// Cabinet
// ---------------------------------------------------------------------------

export type CabinetType =
  | 'sealed'
  | 'ported'
  | 'passive_radiator'
  | 'bandpass4'
  | 'transmission_line'
  | 'horn'
  | 'open_baffle';

/** Passive radiator cabinet parameters (SPEC §4.4) */
export interface PassiveRadiatorParams {
  vb: number;      // Box volume [L]
  fp: number;      // PR free-air resonance incl. added mass [Hz]
  sdp: number;     // PR effective area [cm²]
  vap: number;     // PR equivalent compliance volume [L]
  qmp: number;     // PR mechanical Q
  xmaxPr: number;  // PR max linear excursion [mm]
}

/** 4th-order bandpass cabinet parameters (SPEC §4.5) */
export interface Bandpass4Params {
  vRear: number;        // Sealed rear chamber [L]
  vFront: number;       // Ported front chamber [L]
  fbFront: number;      // Front chamber tuning [Hz]
  portDiameter: number; // [mm]
  numPorts: number;
}

/** Horn cabinet parameters (SPEC §4.7) */
export interface HornDesignParams {
  profile: 'exponential' | 'conical' | 'tractrix' | 'hyperbolic';
  topology: 'front' | 'back';
  throatAreaCm2: number;
  mouthAreaCm2: number;
  lengthM: number;
  rearChamberLiters: number;
}

/** Transmission line geometry for the complex T-matrix model (SPEC §4.6) */
export interface TLDesignParams {
  lengthM: number;          // Total line length [m]
  areaStartCm2: number;     // Cross-section at the driver end [cm²]
  areaEndCm2: number;       // Cross-section at the terminus [cm²]
  stuffingDensity: number;  // [kg/m³] (0 = empty, 5–10 light, 15–30 heavy)
  driverOffsetFraction: number; // 0 = closed end, 0.2–0.35 typical ML-TL
}

export interface CabinetDimensions {
  width: number;    // [mm]
  height: number;   // [mm]
  depth: number;    // [mm]
  wallThickness: number; // [mm]
  baffleWidth: number;   // [mm] (usually = width)
  baffleHeight: number;  // [mm] (usually = height)
  frontRoundoverRadius: number; // [mm] (0 = sharp edges)
}

export interface SealedAlignment {
  vb: number;   // Box volume [L]
  fc: number;   // System resonance [Hz]
  qtc: number;  // System Q
  f3: number;   // -3dB frequency [Hz]
}

export interface PortedAlignment {
  vb: number;     // Box volume [L]
  fb: number;     // Tuning frequency [Hz]
  f3: number;     // -3dB frequency [Hz]
  portDiameter: number;  // [mm]
  portLength: number;    // [mm]
  numPorts: number;
}

export interface TransmissionLineAlignment {
  lineLength: number;  // [mm] (1/4 wavelength of fs)
  lineArea: number;    // [mm²] (cross-section)
  taperRatio: number;  // taper from start to end
  stuffing: number;    // stuffing density [g/L]
}

export interface Cabinet {
  type: CabinetType;
  dimensions: CabinetDimensions;
  sealed?: SealedAlignment;
  ported?: PortedAlignment;
  transmissionLine?: TransmissionLineAlignment;
  internalVolume: number; // [L] (calculated)
}

// ---------------------------------------------------------------------------
// Crossover
// ---------------------------------------------------------------------------

export type CrossoverType = 'LR4' | 'LR2' | 'LR8' | 'BW4' | 'BW2' | 'BW1' | 'first_order';

// ---------------------------------------------------------------------------
// Per-band EQ filters (low-shelf, high-shelf, PEQ)
// ---------------------------------------------------------------------------

export type EQFilterKind = 'low_shelf' | 'high_shelf' | 'peaking';

export interface EQFilter {
  id: string;
  kind: EQFilterKind;
  freq: number;    // [Hz] corner/center frequency
  gain: number;    // [dB] boost or cut
  q: number;       // quality factor (bandwidth / transition sharpness)
  enabled: boolean;
}

export interface CrossoverBand {
  id: string;
  driverId: string;
  driverRole: 'low' | 'mid' | 'high';
  highpassFreq: number;  // [Hz] (0 = no highpass)
  lowpassFreq: number;   // [Hz] (0 = no lowpass / Infinity)
  highpassType: CrossoverType;
  lowpassType: CrossoverType;
  polarity: 0 | 180;     // phase inversion
  delay: number;         // [ms] time alignment delay
  gain: number;          // [dB] level matching
  eqFilters?: EQFilter[];
}

export interface Crossover {
  bands: CrossoverBand[];
  ways: 2 | 3 | 4;
}

// ---------------------------------------------------------------------------
// Design state (serializable snapshot of SystemSimulation)
// ---------------------------------------------------------------------------

/**
 * Optional mounting override for a band's driver (SPEC-udvidelse, Sep 6).
 * Without it the driver is auto-placed in the vertical centerline stack.
 */
export interface BandMount {
  /**
   * 'front' (default): on the front baffle — participates in edge
   * diffraction and CAD cutouts. 'side': mounted on a side panel —
   * excluded from front-baffle layout/diffraction/CAD (falls back to the
   * generic baffle-step shelf, documented approximation).
   */
  placement: 'front' | 'side';
  /** Explicit center X on the front baffle [mm from left edge]; default centerline */
  xMm?: number;
  /** Explicit center Y [mm from bottom edge]. For side-mounted drivers this is informational (height on the side panel). */
  yMm?: number;
}

export interface DesignBand {
  driverId: string;
  role: 'low' | 'mid' | 'mid2' | 'high';
  driverCount?: number;  // number of identical drivers (e.g. 2 for push-pull)
  lowpassFreq: number;
  lowpassType: CrossoverType;
  highpassFreq: number;
  highpassType: CrossoverType;
  gain: number;
  polarity: 0 | 180;
  delay: number;
  eqFilters?: EQFilter[];  // per-band EQ (low-shelf, high-shelf, PEQ)
  /** Mounting override: fixed front-baffle position or side-mounting (default: auto stack) */
  mount?: BandMount;
}

export interface RoomParams {
  dimensions: { length: number; width: number; height: number };
  rt60: number;
  speakerDistanceFromFront: number;
  speakerDistanceFromSide: number;
  speakerHeight: number;
  listeningDistance: number;
}

export interface DesignState {
  ways: 2 | 3 | 4;
  bands: DesignBand[];
  baffleWidth: number;
  baffleHeight: number;
  roundoverRadius: number;
  roomParams: RoomParams;
  smoothingFraction: number;
  cabinetType: CabinetType;
  portFb: number | null;
  portVb: number | null;
  portDiameter: number;
  numPorts: number;
  /** Parameters for the advanced cabinet types (optional, persisted with projects) */
  prParams?: PassiveRadiatorParams;
  bandpassParams?: Bandpass4Params;
  hornParams?: HornDesignParams;
  tlParams?: TLDesignParams;
}

// ---------------------------------------------------------------------------
// Project
// ---------------------------------------------------------------------------

export interface Project {
  id: string;
  name: string;
  description?: string;
  drivers: Driver[];
  cabinet: Cabinet;
  crossover: Crossover;
  baffleStepCompensation?: number; // [dB]
  designState?: DesignState; // full SystemSimulation snapshot
  createdAt: number;
  updatedAt: number;
}

/**
 * A saved snapshot of the active design (SPEC §3 — design versioning).
 * Versions are grouped by projectKey (project id, or project name for
 * unsaved designs) and chained via parentVersion.
 */
export interface DesignVersion {
  id: string;
  projectKey: string;
  version: number;
  parentVersion: number | null;
  note: string;
  design: DesignState;
  createdAt: number;
}

// ---------------------------------------------------------------------------
// Simulation results
// ---------------------------------------------------------------------------

export interface SystemResponseResult {
  freq: number[];
  onAxis: number[];       // [dB]
  listeningWindow: number[]; // [dB]
  earlyReflections: number[]; // [dB]
  soundPower: number[];   // [dB]
  directivityIndex: number[]; // [dB]
  predictedInRoom: number[];  // [dB]
}

export interface PolarResult {
  frequencies: number[];  // [Hz]
  angles: number[];       // [degrees]
  data: number[][];       // [freq][angle] → [dB]
}

export interface BaffleStepResult {
  freq: number[];
  response: number[];     // [dB] (diffraction loss)
}

export interface SimulationResult {
  systemResponse: SystemResponseResult;
  horizontalPolar: PolarResult;
  verticalPolar: PolarResult;
  baffleStep: BaffleStepResult;
  individualDrivers: { driverId: string; freq: number[]; response: number[] }[];
}
