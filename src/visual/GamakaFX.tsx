import { useFrame } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import {
  AdditiveBlending,
  BufferGeometry,
  CatmullRomCurve3,
  Float32BufferAttribute,
  Group,
  Mesh,
  MeshBasicMaterial,
  Points,
  PointsMaterial,
  TubeGeometry,
  Vector3,
} from 'three';
import type { GamakaEvent, SwaraIdx } from '../engine/types';
import { arcBetween, positionForSwara } from './layout';
import type { Palette } from './palettes';

const LIFE: Record<string, number> = {
  meend: 2.6,
  kampita: 2.0,
  andolan: 3.0,
  murki: 1.4,
  kan: 0.9,
  none: 0,
};

interface FxProps {
  g: GamakaEvent;
  palette: Palette;
}

function useAge(): React.MutableRefObject<number> {
  const age = useRef(0);
  useFrame((_, dt) => {
    age.current += dt;
  });
  return age;
}

/** Meend: a luminous ribbon arcing between the two swara nodes. */
function MeendRibbon({ g, palette }: FxProps) {
  const mesh = useRef<Mesh>(null);
  const age = useAge();

  const geometry = useMemo(() => {
    const a = positionForSwara((g.fromSwara ?? 0) as SwaraIdx);
    const b = positionForSwara((g.toSwara ?? 0) as SwaraIdx, 0, new Vector3());
    const [p0, p1, p2] = arcBetween(a, b, g.extentCents > 400 ? 0.5 : 0.3);
    const curve = new CatmullRomCurve3([p0, p1, p2], false, 'catmullrom', 0.5);
    return new TubeGeometry(curve, 48, 0.022, 8, false);
  }, [g]);

  useFrame(() => {
    if (!mesh.current) return;
    const life = LIFE.meend;
    const u = Math.min(1, age.current / life);
    const m = mesh.current.material as MeshBasicMaterial;
    // quick bloom in, slow fade out
    const env = u < 0.12 ? u / 0.12 : 1 - (u - 0.12) / 0.88;
    m.opacity = Math.max(0, env) * 0.85 * (0.5 + 0.5 * g.confidence);
    m.color.copy(palette.accent2);
    mesh.current.scale.setScalar(1 + 0.04 * Math.sin(age.current * 6));
  });

  return (
    <mesh ref={mesh} geometry={geometry} position={[0, 0, 0.03]}>
      <meshBasicMaterial
        transparent
        opacity={0}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

function particleGeometry(count: number, spread: number, seed: number): BufferGeometry {
  const pos: number[] = [];
  for (let i = 0; i < count; i++) {
    const a = ((i * 2.39996 + seed) % (Math.PI * 2));
    const r = spread * (0.35 + 0.65 * ((Math.sin(i * 12.9898 + seed) + 1) / 2));
    pos.push(Math.cos(a) * r, Math.sin(a) * r, 0);
  }
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

/** Kampita: a shimmer of particles trembling at the measured rate. */
function KampitaShimmer({ g, palette }: FxProps) {
  const pts = useRef<Points>(null);
  const age = useAge();
  const geometry = useMemo(() => particleGeometry(48, 0.3, g.tStart * 13.7), [g]);
  const center = useMemo(
    () => positionForSwara((g.centerSwara ?? 0) as SwaraIdx),
    [g],
  );

  useFrame(() => {
    if (!pts.current) return;
    const rate = g.rateHz ?? 6;
    const u = Math.min(1, age.current / LIFE.kampita);
    const m = pts.current.material as PointsMaterial;
    m.opacity = (1 - u) * 0.9;
    m.color.copy(palette.accent2);
    m.size = 0.05 + 0.02 * Math.sin(age.current * rate * Math.PI * 2);
    const tremor = 0.035 * Math.sin(age.current * rate * Math.PI * 2);
    pts.current.position.set(center.x + tremor, center.y, 0.05);
    pts.current.rotation.z = age.current * 0.6;
    pts.current.scale.setScalar(1 + 0.25 * u);
  });

  return (
    <points ref={pts} geometry={geometry}>
      <pointsMaterial
        transparent
        opacity={0}
        size={0.05}
        sizeAttenuation
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/** Andolan: a ring that breathes in and out at the measured sway rate. */
function AndolanRing({ g, palette }: FxProps) {
  const ring = useRef<Mesh>(null);
  const age = useAge();
  const center = useMemo(
    () => positionForSwara((g.centerSwara ?? 0) as SwaraIdx),
    [g],
  );

  useFrame(() => {
    if (!ring.current) return;
    const rate = g.rateHz ?? 1.5;
    const u = Math.min(1, age.current / LIFE.andolan);
    const breath = 0.5 + 0.5 * Math.sin(age.current * rate * Math.PI * 2);
    ring.current.position.set(center.x, center.y, 0.02);
    ring.current.scale.setScalar(0.6 + breath * 0.9);
    const m = ring.current.material as MeshBasicMaterial;
    m.opacity = (1 - u) * (0.25 + 0.4 * breath);
    m.color.copy(palette.accent);
  });

  return (
    <mesh ref={ring}>
      <ringGeometry args={[0.2, 0.235, 64]} />
      <meshBasicMaterial
        transparent
        opacity={0}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Murki and kan: a short spark burst / satellite flick. */
function SparkBurst({ g, palette }: FxProps) {
  const pts = useRef<Points>(null);
  const age = useAge();
  const isKan = g.type === 'kan';
  const geometry = useMemo(
    () => particleGeometry(isKan ? 10 : 34, isKan ? 0.1 : 0.22, g.tStart * 7.3),
    [g, isKan],
  );
  const center = useMemo(
    () =>
      positionForSwara(
        ((g.centerSwara ?? g.fromSwara ?? 0) as SwaraIdx),
      ),
    [g],
  );

  useFrame(() => {
    if (!pts.current) return;
    const life = isKan ? LIFE.kan : LIFE.murki;
    const u = Math.min(1, age.current / life);
    const m = pts.current.material as PointsMaterial;
    m.opacity = Math.pow(1 - u, 1.6);
    m.color.copy(palette.accent2);
    pts.current.position.set(center.x, center.y, 0.06);
    pts.current.scale.setScalar(0.4 + u * (isKan ? 1.6 : 3.2));
    pts.current.rotation.z = u * (isKan ? 1.2 : 2.4);
  });

  return (
    <points ref={pts} geometry={geometry}>
      <pointsMaterial
        transparent
        opacity={0}
        size={isKan ? 0.035 : 0.05}
        sizeAttenuation
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

interface Props {
  gamakas: GamakaEvent[];
  now: number;
  palette: Palette;
}

/** Each gamaka type gets its own visual primitive, so the type is readable. */
export function GamakaFX({ gamakas, now, palette }: Props) {
  const live = gamakas.filter((g) => {
    const life = LIFE[g.type] ?? 0;
    return life > 0 && now - g.tEnd < life;
  });

  return (
    <group>
      {live.map((g) => {
        switch (g.type) {
          case 'meend':
            return <MeendRibbon key={g.id} g={g} palette={palette} />;
          case 'kampita':
            return <KampitaShimmer key={g.id} g={g} palette={palette} />;
          case 'andolan':
            return <AndolanRing key={g.id} g={g} palette={palette} />;
          case 'murki':
          case 'kan':
            return <SparkBurst key={g.id} g={g} palette={palette} />;
          default:
            return null;
        }
      })}
    </group>
  );
}

/** Nyas bloom: a slow ripple out of the resting note. */
export function NyasBloom({
  swara,
  palette,
}: {
  swara: SwaraIdx;
  palette: Palette;
}) {
  const group = useRef<Group>(null);
  const age = useAge();
  const center = useMemo(() => positionForSwara(swara), [swara]);

  useFrame(() => {
    if (!group.current) return;
    const u = Math.min(1, age.current / 2.2);
    group.current.position.set(center.x, center.y, 0.01);
    group.current.children.forEach((child, i) => {
      const offset = i * 0.28;
      const v = Math.max(0, Math.min(1, u - offset));
      const mesh = child as Mesh;
      mesh.scale.setScalar(0.3 + v * 3.4);
      const m = mesh.material as MeshBasicMaterial;
      m.opacity = v > 0 ? (1 - v) * 0.3 : 0;
      m.color.copy(palette.accent);
    });
  });

  return (
    <group ref={group}>
      {[0, 1, 2].map((i) => (
        <mesh key={i}>
          <ringGeometry args={[0.16, 0.185, 48]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            blending={AdditiveBlending}
            depthWrite={false}
          />
        </mesh>
      ))}
    </group>
  );
}
