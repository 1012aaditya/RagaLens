export const atmosphereVertex = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

/*
 * Slow curl-ish noise field. Colour comes from the samay palette, motion speed
 * and turbulence from the rasa, so the background is still a reading of the
 * raga rather than decoration.
 */
export const atmosphereFragment = /* glsl */ `
  precision highp float;
  varying vec2 vUv;

  uniform vec3 uBgA;
  uniform vec3 uBgB;
  uniform vec3 uAccent;
  uniform float uTime;
  uniform float uSpeed;
  uniform float uTurb;
  uniform float uEnergy;

  float hash(vec2 p) {
    return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
  }

  float noise(vec2 p) {
    vec2 i = floor(p);
    vec2 f = fract(p);
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
      mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
      u.y
    );
  }

  float fbm(vec2 p) {
    float v = 0.0;
    float a = 0.5;
    for (int i = 0; i < 5; i++) {
      v += a * noise(p);
      p = p * 2.03 + vec2(17.3, 9.1);
      a *= 0.5;
    }
    return v;
  }

  void main() {
    vec2 p = (vUv - 0.5) * vec2(2.0, 2.0);
    float r = length(p);
    float t = uTime * uSpeed;

    vec2 q = p * (1.6 + uTurb) + vec2(sin(t * 0.21), cos(t * 0.17)) * 0.6;
    float n = fbm(q + fbm(q * 1.7 + t * 0.12));

    // radial falloff keeps the mandala readable in the centre
    float vignette = smoothstep(1.35, 0.15, r);
    vec3 col = mix(uBgA, uBgB, clamp(n * 0.9 + 0.15, 0.0, 1.0));
    col = mix(col, uAccent, 0.10 * n * vignette * (0.6 + uEnergy));

    // a faint horizon band, brighter when the singer is active
    float band = exp(-pow((r - 0.78) * 4.2, 2.0));
    col += uAccent * band * 0.07 * (0.4 + uEnergy);

    col *= 0.45 + 0.55 * vignette;
    gl_FragColor = vec4(col, 1.0);
  }
`;
