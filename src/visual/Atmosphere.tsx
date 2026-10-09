import { useFrame, useThree } from '@react-three/fiber';
import { useMemo, useRef } from 'react';
import { Color, ShaderMaterial } from 'three';
import { atmosphereFragment, atmosphereVertex } from './shaders/atmosphere';
import type { Palette } from './palettes';

interface Props {
  palette: Palette;
  energy: number;
}

/** Full-viewport background plane whose colour and motion come from the raga. */
export function Atmosphere({ palette, energy }: Props) {
  const { viewport } = useThree();
  const matRef = useRef<ShaderMaterial>(null);

  const uniforms = useMemo(
    () => ({
      uBgA: { value: new Color('#05050c') },
      uBgB: { value: new Color('#141427') },
      uAccent: { value: new Color('#9aa6c8') },
      uTime: { value: 0 },
      uSpeed: { value: 0.35 },
      uTurb: { value: 0.3 },
      uEnergy: { value: 0 },
    }),
    [],
  );

  useFrame((_, dt) => {
    const u = uniforms;
    u.uTime.value += dt;
    u.uBgA.value.lerp(palette.bgA, 0.06);
    u.uBgB.value.lerp(palette.bgB, 0.06);
    u.uAccent.value.lerp(palette.accent, 0.06);
    u.uSpeed.value += (palette.speed - u.uSpeed.value) * 0.05;
    u.uTurb.value += (palette.turbulence - u.uTurb.value) * 0.05;
    u.uEnergy.value += (energy - u.uEnergy.value) * 0.1;
    if (matRef.current) matRef.current.needsUpdate = false;
  });

  return (
    <mesh position={[0, 0, -4]} renderOrder={-1}>
      <planeGeometry args={[viewport.width * 2.4, viewport.height * 2.4, 1, 1]} />
      <shaderMaterial
        ref={matRef}
        vertexShader={atmosphereVertex}
        fragmentShader={atmosphereFragment}
        uniforms={uniforms}
        depthWrite={false}
      />
    </mesh>
  );
}
