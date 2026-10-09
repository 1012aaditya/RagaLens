/*
 * The one place that turns musical quantities into scene coordinates.
 * Angle encodes pitch class (Sa at 12 o'clock, clockwise); radius encodes the
 * octave band. Everything the scene draws derives from these two functions, so
 * the picture is a projection of raga structure rather than of audio energy.
 */

import { Vector3 } from 'three';
import type { Octave, SwaraIdx } from '../engine/types';

export const OCTAVE_RADIUS: Record<number, number> = {
  [-1]: 1.55,
  0: 2.45,
  1: 3.3,
};

export function radiusForOctave(octave: Octave | number): number {
  return OCTAVE_RADIUS[Math.max(-1, Math.min(1, octave))] ?? OCTAVE_RADIUS[0];
}

/** Angle in radians for a pitch class given in cents (0..1200). */
export function angleForCents(pitchClassCents: number): number {
  return (pitchClassCents / 1200) * Math.PI * 2;
}

export function angleForSwara(swara: SwaraIdx): number {
  return angleForCents(swara * 100);
}

/** Continuous position for a cents value measured from the tonic. */
export function positionForCents(cents: number, out = new Vector3()): Vector3 {
  const octave = Math.floor(cents / 1200);
  const pc = cents - octave * 1200;
  const a = angleForCents(pc);
  const r = radiusForOctave(octave);
  return out.set(Math.sin(a) * r, Math.cos(a) * r, 0);
}

export function positionForSwara(
  swara: SwaraIdx,
  octave: Octave = 0,
  out = new Vector3(),
): Vector3 {
  const a = angleForSwara(swara);
  const r = radiusForOctave(octave);
  return out.set(Math.sin(a) * r, Math.cos(a) * r, 0);
}

/** A gentle arc between two swara nodes, used for meend ribbons. */
export function arcBetween(
  a: Vector3,
  b: Vector3,
  bulge = 0.35,
): [Vector3, Vector3, Vector3] {
  const mid = a.clone().add(b).multiplyScalar(0.5);
  const outward = mid.clone().normalize().multiplyScalar(bulge * a.distanceTo(b));
  return [a.clone(), mid.add(outward), b.clone()];
}
