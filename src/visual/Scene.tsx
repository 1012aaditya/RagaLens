import {
  Bloom,
  ChromaticAberration,
  EffectComposer,
  Glitch,
  Vignette,
} from '@react-three/postprocessing';
import { BlendFunction, GlitchMode } from 'postprocessing';
import { useFrame } from '@react-three/fiber';
import { useMemo, useRef, useState } from 'react';
import { Vector2 } from 'three';
import { RAGA_BY_ID } from '../data/loadRagas';
import { centsToSwara } from '../engine/swara';
import type { SwaraIdx } from '../engine/types';
import { useStore } from '../store';
import { Atmosphere } from './Atmosphere';
import { GamakaFX, NyasBloom } from './GamakaFX';
import { PitchTrail } from './PitchTrail';
import { SwaraMandala } from './SwaraMandala';
import { VivadiFX } from './VivadiFX';
import {
  clonePalette,
  lerpPalette,
  NEUTRAL_PALETTE,
  paletteFor,
  VERDICT_COLORS,
  type Palette,
} from './palettes';

const LOCK_MORPH_SEC = 2;

/** Everything inside the <Canvas>. */
export function Scene() {
  const targetRagaId = useStore((s) => s.targetRagaId);
  const lockedRagaId = useStore((s) => s.lockedRagaId);
  const mode = useStore((s) => s.mode);
  const practiceRagaId = useStore((s) => s.practiceRagaId);
  const gamakas = useStore((s) => s.gamakas);
  const vivadis = useStore((s) => s.vivadis);
  const phrases = useStore((s) => s.phrases);
  const notes = useStore((s) => s.notes);
  const now = useStore((s) => s.now);
  const currentCents = useStore((s) => s.currentCents);

  const shownRagaId = mode === 'practice' ? practiceRagaId : targetRagaId;
  const raga = shownRagaId ? RAGA_BY_ID[shownRagaId] ?? null : null;
  const locked = mode === 'practice' || lockedRagaId !== null;

  // --- palette morph
  const want = useMemo(() => paletteFor(raga), [raga]);
  const morph = useRef({
    from: clonePalette(NEUTRAL_PALETTE),
    to: clonePalette(NEUTRAL_PALETTE),
    t: 1,
    key: '',
  });
  const [live] = useState<Palette>(() => clonePalette(NEUTRAL_PALETTE));
  const energy = useRef(0);

  const key = raga ? raga.id : 'neutral';
  if (morph.current.key !== key) {
    morph.current.from = clonePalette(live);
    morph.current.to = clonePalette(want);
    morph.current.t = 0;
    morph.current.key = key;
  }

  useFrame((_, dt) => {
    const m = morph.current;
    if (m.t < 1) {
      m.t = Math.min(1, m.t + dt / LOCK_MORPH_SEC);
      const e = m.t * m.t * (3 - 2 * m.t);
      lerpPalette(m.from, m.to, e, live);
    }
    const s = useStore.getState();
    const target = s.currentCents === null ? 0 : 1;
    energy.current += (target - energy.current) * Math.min(1, dt * 2.5);
  });

  // --- current swara for the node highlight
  const currentSwara: SwaraIdx | null =
    currentCents === null ? null : centsToSwara(currentCents).swara;

  // --- pakad flourish
  const lastPhrase = phrases[phrases.length - 1];
  const phraseFresh = lastPhrase && now - lastPhrase.t < 3;

  // --- vivadi-driven post effects
  const recentMistake = [...vivadis]
    .reverse()
    .find((v) => v.cls === 'mistake' && now - v.t < 0.7);
  const recentDirection = [...vivadis]
    .reverse()
    .find((v) => v.cls === 'direction_violation' && now - v.t < 0.5);

  const flash = recentDirection
    ? { color: VERDICT_COLORS.direction_violation, until: recentDirection.t + 0.5 }
    : null;

  const nyasNotes = notes.filter((n) => n.isNyas && now - n.tEnd < 2.2);

  const aberration = useMemo(() => new Vector2(0.0006, 0.0009), []);

  return (
    <>
      <Atmosphere palette={live} energy={energy.current} />

      <SwaraMandala
        raga={raga}
        locked={locked}
        palette={live}
        currentSwara={currentSwara}
        spinToken={phrases.length}
        constellation={phraseFresh ? lastPhrase.swaras : []}
      />

      <PitchTrail palette={live} flash={flash} />

      <GamakaFX gamakas={gamakas} now={now} palette={live} />
      <VivadiFX vivadis={vivadis} now={now} palette={live} />

      {nyasNotes.map((n) => (
        <NyasBloom key={n.id} swara={n.swara} palette={live} />
      ))}

      <EffectComposer>
        <Bloom
          intensity={1.15}
          luminanceThreshold={0.14}
          luminanceSmoothing={0.3}
          mipmapBlur
        />
        <ChromaticAberration
          offset={aberration}
          radialModulation={false}
          modulationOffset={0}
          blendFunction={BlendFunction.NORMAL}
        />
        {recentMistake ? (
          <Glitch
            mode={GlitchMode.SPORADIC}
            active
            delay={new Vector2(0.01, 0.1)}
            duration={new Vector2(0.08, 0.18)}
            strength={
              new Vector2(0.1 * recentMistake.severity, 0.45 * recentMistake.severity)
            }
            ratio={0.6}
          />
        ) : (
          <></>
        )}
        <Vignette offset={0.25} darkness={0.65} />
      </EffectComposer>
    </>
  );
}
