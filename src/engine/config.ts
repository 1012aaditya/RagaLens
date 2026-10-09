// All tunable thresholds for the RagaLens analysis engine.
// No magic numbers anywhere else in src/engine.

export const config = {
  // --- pitch tracking ---
  sampleRate: 44100,
  frameSize: 2048,
  hop: 512,
  clarityMin: 0.85,
  silenceRms: 0.01,
  hzMin: 70,
  hzMax: 1100,
  medianTaps: 5,
  gapBridgeMs: 40,

  // --- segmentation ---
  stableStdCents: 25,
  stableBandCents: 35,
  windowMs: 60,
  minNoteMs: 80,
  nyasMs: 900,

  // --- gamaka ---
  kanMs: 120,
  murkiMinMs: 120,
  murkiMaxMs: 400,
  murkiMinExtrema: 3,
  murkiMinSwaras: 3,
  meend: { minExtent: 90, minMonotonic: 0.8, minMs: 150 },
  kampita: { rateMin: 4, rateMax: 9, extentMin: 50, extentMax: 250, minCycles: 2 },
  andolan: { rateMin: 0.8, rateMax: 3, extentMin: 20, extentMax: 70, minMs: 600 },
  oscillationScanMs: 600, // long steady notes are re-tested for andolan

  // --- recognizer ---
  ragaMemorySec: 20,
  lockP: 0.6,
  lockHoldMs: 2000,
  phraseMaxEdit: 1,
  phraseWindow: 12,
  transitionBonus: 0.6,
  directionPenalty: 1.2,
  phraseBonus: 2.5,
  gamakaBonus: 1.0,
  disallowedEps: 0.01,
  weightVadi: 3,
  weightSamvadi: 2,
  weightNyas: 1.5,
  weightAllowed: 1,
  /** swaras carrying a conventional / optional / embellishment_ok rule: part of
   *  the raga's extended vocabulary, so penalised far less than a dissonance */
  weightConditional: 0.4,

  // --- vivadi grading ---
  embellishmentMaxMs: 250,
  /** a swara brushed past for less than this is pitch-tracker transit, not an
   *  ornament, and is not graded */
  minTouchMs: 40,

  // --- transport / rendering ---
  workerPostMs: 50,
  trailFadeSec: 4,
  maxParticles: 2000,
} as const;

export type Config = typeof config;
