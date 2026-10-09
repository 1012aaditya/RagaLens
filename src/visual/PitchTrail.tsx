import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  DynamicDrawUsage,
  Float32BufferAttribute,
  Line,
  LineBasicMaterial,
  Mesh,
  Vector3,
} from 'three';
import { config } from '../engine/config';
import { useStore } from '../store';
import { positionForCents } from './layout';
import type { Palette } from './palettes';

const CAP = 1400;

interface Props {
  palette: Palette;
  /** flash colour for a direction violation, or null */
  flash: { color: string; until: number } | null;
}

/**
 * The continuous polar trail. Because angle is pitch class and radius is the
 * octave band, a meend draws itself as a spiral arc and a kampita as a tight
 * zig-zag — the ornament's shape is the ornament's picture.
 */
export function PitchTrail({ palette, flash }: Props) {
  const head = useRef<Mesh>(null);
  const tmp = useMemo(() => new Vector3(), []);
  const col = useMemo(() => new Color(), []);
  const flashCol = useMemo(() => new Color(), []);

  const { line, positions, colors } = useMemo(() => {
    const positions = new Float32Array(CAP * 3);
    const colors = new Float32Array(CAP * 3);
    const geom = new BufferGeometry();
    const posAttr = new Float32BufferAttribute(positions, 3);
    const colAttr = new Float32BufferAttribute(colors, 3);
    posAttr.setUsage(DynamicDrawUsage);
    colAttr.setUsage(DynamicDrawUsage);
    geom.setAttribute('position', posAttr);
    geom.setAttribute('color', colAttr);
    geom.setDrawRange(0, 0);
    const mat = new LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      blending: AdditiveBlending,
      depthWrite: false,
      opacity: 1,
    });
    return { line: new Line(geom, mat), positions, colors };
  }, []);

  useFrame(() => {
    const s = useStore.getState();
    const trail = s.trail;
    const geom = line.geometry;
    const posAttr = geom.getAttribute('position') as Float32BufferAttribute;
    const colAttr = geom.getAttribute('color') as Float32BufferAttribute;

    const n = Math.min(trail.length, CAP);
    const start = trail.length - n;
    const now = s.now;
    const useFlash = flash !== null && now < flash.until;
    if (useFlash && flash) flashCol.set(flash.color);

    let drawn = 0;
    let prevT = -1;
    for (let i = 0; i < n; i++) {
      const p = trail[start + i];
      // a gap in voicing collapses the trail rather than drawing a false leap
      if (prevT >= 0 && p.t - prevT > 0.12) {
        // restart the strip at this point by duplicating it with zero brightness
        positionForCents(p.cents, tmp);
        positions[drawn * 3] = tmp.x;
        positions[drawn * 3 + 1] = tmp.y;
        positions[drawn * 3 + 2] = 0.04;
        colors[drawn * 3] = 0;
        colors[drawn * 3 + 1] = 0;
        colors[drawn * 3 + 2] = 0;
        drawn++;
        if (drawn >= CAP) break;
      }
      prevT = p.t;

      positionForCents(p.cents, tmp);
      positions[drawn * 3] = tmp.x;
      positions[drawn * 3 + 1] = tmp.y;
      positions[drawn * 3 + 2] = 0.04;

      const age = now - p.t;
      const fade = Math.max(0, 1 - age / config.trailFadeSec);
      const k = fade * fade * (0.35 + 0.65 * p.conf);
      col.copy(useFlash ? flashCol : palette.accent2).multiplyScalar(k * 1.5);
      colors[drawn * 3] = col.r;
      colors[drawn * 3 + 1] = col.g;
      colors[drawn * 3 + 2] = col.b;
      drawn++;
      if (drawn >= CAP) break;
    }

    geom.setDrawRange(0, drawn);
    posAttr.needsUpdate = true;
    colAttr.needsUpdate = true;
    if (drawn > 1) geom.computeBoundingSphere();

    // the head marker sits on the live pitch
    if (head.current) {
      if (s.currentCents !== null) {
        positionForCents(s.currentCents, tmp);
        head.current.position.set(tmp.x, tmp.y, 0.06);
        head.current.visible = true;
        const m = head.current.material as LineBasicMaterial;
        m.color.copy(useFlash ? flashCol : palette.accent2);
      } else {
        head.current.visible = false;
      }
    }
  });

  return (
    <group>
      <primitive object={line} />
      <mesh ref={head} visible={false}>
        <sphereGeometry args={[0.042, 16, 16]} />
        <meshBasicMaterial
          transparent
          opacity={0.95}
          blending={AdditiveBlending}
          depthWrite={false}
        />
      </mesh>
    </group>
  );
}
