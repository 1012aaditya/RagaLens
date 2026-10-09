import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  Color,
  Float32BufferAttribute,
  Group,
  Line,
  LineBasicMaterial,
  Mesh,
  MeshBasicMaterial,
} from 'three';
import { ALL_SWARAS, SWARA_NAMES } from '../engine/swara';
import type { Raga, SwaraIdx } from '../engine/types';
import { labelTexture } from './labels';
import { angleForSwara, radiusForOctave } from './layout';
import type { Palette } from './palettes';

interface Props {
  raga: Raga | null;
  locked: boolean;
  palette: Palette;
  /** swara currently being sung, for a subtle highlight */
  currentSwara: SwaraIdx | null;
  /** set once a pakad match fires, to spin the mandala one turn */
  spinToken: number;
  /** swaras joined by the last matched phrase */
  constellation: SwaraIdx[];
}

const R = radiusForOctave(0);

function roleOf(raga: Raga | null, s: SwaraIdx) {
  if (!raga) return 'neutral' as const;
  if (raga.vadi === s) return 'vadi' as const;
  if (raga.samvadi === s) return 'samvadi' as const;
  if (raga.nyas.includes(s)) return 'nyas' as const;
  if (raga.swaras.includes(s)) return 'in' as const;
  const rule = raga.varjyaRules.find((r) => r.swara === s);
  if (rule && rule.category !== 'dissonant') return 'conditional' as const;
  return 'out' as const;
}

const SCALE: Record<string, number> = {
  vadi: 1.95,
  samvadi: 1.55,
  nyas: 1.2,
  in: 1.0,
  conditional: 0.72,
  out: 0.5,
  neutral: 0.9,
};

const OPACITY: Record<string, number> = {
  vadi: 1,
  samvadi: 0.95,
  nyas: 0.85,
  in: 0.75,
  conditional: 0.38,
  out: 0.16,
  neutral: 0.5,
};

// three's declarative <line> clashes with the SVG intrinsic element in JSX, so
// the ring and constellation lines are built imperatively and memoised.
function lineFrom(geometry: BufferGeometry, opacity: number): Line {
  const mat = new LineBasicMaterial({
    color: new Color('#ffffff'),
    transparent: true,
    opacity,
    depthWrite: false,
  });
  return new Line(geometry, mat);
}

function ringGeometry(radius: number, segments = 180): BufferGeometry {
  const pts: number[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    pts.push(Math.sin(a) * radius, Math.cos(a) * radius, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pts, 3));
  return g;
}

/** The 12-node radial wheel: angle is pitch class, Sa at 12 o'clock. */
export function SwaraMandala({
  raga,
  locked,
  palette,
  currentSwara,
  spinToken,
  constellation,
}: Props) {
  const group = useRef<Group>(null);
  const nodes = useRef<(Mesh | null)[]>([]);
  const halos = useRef<(Mesh | null)[]>([]);
  const spin = useRef({ from: 0, target: 0, token: -1 });

  const rings = useMemo(
    () => [ringGeometry(radiusForOctave(-1)), ringGeometry(R), ringGeometry(radiusForOctave(1))],
    [],
  );

  const layout = useMemo(
    () =>
      ALL_SWARAS.map((s) => {
        const a = angleForSwara(s);
        return { s, x: Math.sin(a) * R, y: Math.cos(a) * R };
      }),
    [],
  );

  const ringLines = useMemo(
    () => rings.map((g, i) => lineFrom(g, i === 1 ? 0.22 : 0.08)),
    [rings],
  );

  const constellationGeom = useMemo(() => {
    if (constellation.length < 2) return null;
    const pts: number[] = [];
    for (const s of constellation) {
      const a = angleForSwara(s);
      pts.push(Math.sin(a) * R, Math.cos(a) * R, 0.02);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pts, 3));
    return g;
  }, [constellation]);

  const constellationLine = useMemo(
    () => (constellationGeom ? lineFrom(constellationGeom, 0.75) : null),
    [constellationGeom],
  );

  const tmp = useMemo(() => new Color(), []);

  useFrame((state, dt) => {
    const t = state.clock.elapsedTime;

    // one full rotation when a pakad is recognised
    if (spin.current.token !== spinToken) {
      spin.current.token = spinToken;
      if (spinToken > 0) spin.current.target += Math.PI * 2;
    }
    if (group.current) {
      const cur = group.current.rotation.z;
      group.current.rotation.z = cur + (spin.current.target - cur) * Math.min(1, dt * 2.2);
    }

    for (const l of ringLines) {
      (l.material as LineBasicMaterial).color.lerp(palette.accent, Math.min(1, dt * 3));
    }
    if (constellationLine) {
      (constellationLine.material as LineBasicMaterial).color.lerp(
        palette.accent2,
        Math.min(1, dt * 6),
      );
    }

    for (let i = 0; i < layout.length; i++) {
      const s = layout[i].s;
      const role = roleOf(raga, s);
      const mesh = nodes.current[i];
      const halo = halos.current[i];
      if (!mesh) continue;

      const pulse =
        role === 'vadi' ? 0.14 * Math.sin(t * 1.5) :
        role === 'samvadi' ? 0.09 * Math.sin(t * 1.5 + 1.2) : 0;
      const active = currentSwara === s ? 0.5 : 0;
      const target = SCALE[role] * (1 + pulse + active);
      const cs = mesh.scale.x;
      const next = cs + (target - cs) * Math.min(1, dt * 8);
      mesh.scale.setScalar(next);

      const mat = mesh.material as MeshBasicMaterial;
      tmp.copy(
        role === 'vadi' || role === 'samvadi' ? palette.accent :
        role === 'out' || role === 'conditional' ? palette.bgB : palette.accent2,
      );
      if (currentSwara === s) tmp.lerp(palette.accent2, 0.6);
      mat.color.lerp(tmp, Math.min(1, dt * 6));
      const targetOpacity = OPACITY[role] * (locked ? 1 : 0.8) + active * 0.4;
      mat.opacity += (targetOpacity - mat.opacity) * Math.min(1, dt * 6);

      if (halo) {
        const hm = halo.material as MeshBasicMaterial;
        const want =
          (role === 'vadi' ? 0.26 : role === 'samvadi' ? 0.18 : role === 'nyas' ? 0.1 : 0.04) +
          active * 0.5;
        hm.opacity += (want - hm.opacity) * Math.min(1, dt * 5);
        hm.color.lerp(palette.accent, Math.min(1, dt * 4));
        const hs = 2.6 + (currentSwara === s ? 1.4 : 0) + pulse * 2;
        halo.scale.setScalar(halo.scale.x + (hs - halo.scale.x) * Math.min(1, dt * 6));
      }
    }
  });

  return (
    <group ref={group}>
      {ringLines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}

      {constellationLine && <primitive object={constellationLine} />}

      {layout.map(({ s, x, y }, i) => (
        <group key={s} position={[x, y, 0]}>
          <mesh
            ref={(m) => {
              halos.current[i] = m;
            }}
            scale={2.6}
          >
            <circleGeometry args={[0.075, 32]} />
            <meshBasicMaterial
              transparent
              opacity={0.05}
              blending={AdditiveBlending}
              depthWrite={false}
            />
          </mesh>
          <mesh
            ref={(m) => {
              nodes.current[i] = m;
            }}
          >
            <sphereGeometry args={[0.075, 20, 20]} />
            <meshBasicMaterial transparent opacity={0.6} />
          </mesh>
          <sprite position={[x * 0.17, y * 0.17, 0.05]} scale={[0.42, 0.24, 1]}>
            <spriteMaterial
              map={labelTexture(SWARA_NAMES[s], '#ffffff')}
              transparent
              opacity={raga && !raga.swaras.includes(s) ? 0.22 : 0.8}
              depthWrite={false}
            />
          </sprite>
        </group>
      ))}
    </group>
  );
}


