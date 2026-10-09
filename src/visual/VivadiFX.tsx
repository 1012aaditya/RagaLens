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
  Points,
  PointsMaterial,
} from 'three';
import type { SwaraIdx, VivadiEvent } from '../engine/types';
import { positionForSwara } from './layout';
import { VERDICT_COLORS, type Palette } from './palettes';

const LIFE: Record<string, number> = {
  mistake: 1.6,
  embellishment: 1.1,
  stylistic: 1.8,
  direction_violation: 1.2,
};

function useAge() {
  const age = useRef(0);
  useFrame((_, dt) => {
    age.current += dt;
  });
  return age;
}

/** Mistake: red crack shards radiating out of the offending node. */
function CrackShards({ v }: { v: VivadiEvent }) {
  const group = useRef<Group>(null);
  const age = useAge();
  const center = useMemo(() => positionForSwara(v.swara as SwaraIdx), [v]);

  const lines = useMemo(() => {
    const count = 5 + Math.round(v.severity * 5);
    const out: Line[] = [];
    for (let i = 0; i < count; i++) {
      const seed = Math.sin(i * 91.17 + v.t * 31.7);
      const a = (i / count) * Math.PI * 2 + seed * 0.4;
      const len = 0.28 + 0.5 * v.severity * (0.6 + 0.4 * ((seed + 1) / 2));
      // a shard is a short jagged two-segment line
      const mid = len * 0.55;
      const jag = seed * 0.12;
      const pts = [
        0, 0, 0,
        Math.cos(a) * mid + jag, Math.sin(a) * mid - jag, 0,
        Math.cos(a + jag * 0.6) * len, Math.sin(a + jag * 0.6) * len, 0,
      ];
      const g = new BufferGeometry();
      g.setAttribute('position', new Float32BufferAttribute(pts, 3));
      out.push(
        new Line(
          g,
          new LineBasicMaterial({
            color: new Color(VERDICT_COLORS.mistake),
            transparent: true,
            opacity: 0,
            blending: AdditiveBlending,
            depthWrite: false,
          }),
        ),
      );
    }
    return out;
  }, [v]);

  useFrame(() => {
    if (!group.current) return;
    const u = Math.min(1, age.current / LIFE.mistake);
    group.current.position.set(center.x, center.y, 0.07);
    const grow = 0.3 + Math.min(1, u * 3) * 0.7;
    group.current.scale.setScalar(grow);
    const op = Math.pow(1 - u, 1.4) * (0.5 + 0.5 * v.severity);
    for (const l of lines) (l.material as LineBasicMaterial).opacity = op;
  });

  return (
    <group ref={group}>
      {lines.map((l, i) => (
        <primitive key={i} object={l} />
      ))}
    </group>
  );
}

/** Embellishment: a gold "approved" glint. */
function GoldGlint({ v }: { v: VivadiEvent }) {
  const pts = useRef<Points>(null);
  const age = useAge();
  const center = useMemo(() => positionForSwara(v.swara as SwaraIdx), [v]);

  const geometry = useMemo(() => {
    const pos: number[] = [];
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * Math.PI * 2;
      pos.push(Math.cos(a) * 0.14, Math.sin(a) * 0.14, 0);
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    return g;
  }, []);

  useFrame(() => {
    if (!pts.current) return;
    const u = Math.min(1, age.current / LIFE.embellishment);
    pts.current.position.set(center.x, center.y, 0.08);
    pts.current.scale.setScalar(0.5 + u * 2.2);
    pts.current.rotation.z = u * 1.5;
    const m = pts.current.material as PointsMaterial;
    m.opacity = Math.sin(Math.min(1, u * 1.2) * Math.PI) * 0.95;
    m.size = 0.07 - u * 0.03;
  });

  return (
    <points ref={pts} geometry={geometry}>
      <pointsMaterial
        color={VERDICT_COLORS.embellishment}
        transparent
        opacity={0}
        size={0.07}
        sizeAttenuation
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </points>
  );
}

/** Stylistic: a violet ripple — accepted, but worth noticing. */
function VioletRipple({ v }: { v: VivadiEvent }) {
  const mesh = useRef<Mesh>(null);
  const age = useAge();
  const center = useMemo(() => positionForSwara(v.swara as SwaraIdx), [v]);

  useFrame(() => {
    if (!mesh.current) return;
    const u = Math.min(1, age.current / LIFE.stylistic);
    mesh.current.position.set(center.x, center.y, 0.05);
    mesh.current.scale.setScalar(0.4 + u * 3.0);
    const m = mesh.current.material as MeshBasicMaterial;
    m.opacity = (1 - u) * 0.55;
  });

  return (
    <mesh ref={mesh}>
      <ringGeometry args={[0.15, 0.2, 56]} />
      <meshBasicMaterial
        color={VERDICT_COLORS.stylistic}
        transparent
        opacity={0}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

/** Direction violation: an orange flare on the node (the trail also flashes). */
function OrangeFlare({ v }: { v: VivadiEvent }) {
  const mesh = useRef<Mesh>(null);
  const age = useAge();
  const center = useMemo(() => positionForSwara(v.swara as SwaraIdx), [v]);

  useFrame(() => {
    if (!mesh.current) return;
    const u = Math.min(1, age.current / LIFE.direction_violation);
    mesh.current.position.set(center.x, center.y, 0.06);
    mesh.current.scale.setScalar(1 + u * 1.6);
    const m = mesh.current.material as MeshBasicMaterial;
    m.opacity = Math.pow(1 - u, 2) * 0.7;
  });

  return (
    <mesh ref={mesh}>
      <circleGeometry args={[0.12, 32]} />
      <meshBasicMaterial
        color={VERDICT_COLORS.direction_violation}
        transparent
        opacity={0}
        blending={AdditiveBlending}
        depthWrite={false}
      />
    </mesh>
  );
}

interface Props {
  vivadis: VivadiEvent[];
  now: number;
  palette: Palette;
}

export function VivadiFX({ vivadis, now }: Props) {
  const live = vivadis.filter((v) => now - v.t < (LIFE[v.cls] ?? 1));
  return (
    <group>
      {live.map((v) => {
        switch (v.cls) {
          case 'mistake':
            return <CrackShards key={v.id} v={v} />;
          case 'embellishment':
            return <GoldGlint key={v.id} v={v} />;
          case 'stylistic':
            return <VioletRipple key={v.id} v={v} />;
          case 'direction_violation':
            return <OrangeFlare key={v.id} v={v} />;
          default:
            return null;
        }
      })}
    </group>
  );
}

export const VIVADI_LIFE = LIFE;
