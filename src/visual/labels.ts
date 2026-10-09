import { CanvasTexture, LinearFilter, SRGBColorSpace } from 'three';

const cache = new Map<string, CanvasTexture>();

/**
 * Swara labels are drawn into canvas textures rather than DOM overlays so that
 * they are part of the WebGL frame and therefore survive the reel export — and
 * so the app needs no webfont and stays usable offline.
 */
export function labelTexture(text: string, color = '#ffffff'): CanvasTexture {
  const key = text + '|' + color;
  const hit = cache.get(key);
  if (hit) return hit;

  const dpr = Math.min(3, Math.max(2, Math.round(window.devicePixelRatio || 2)));
  const w = 128 * dpr;
  const h = 72 * dpr;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d') as CanvasRenderingContext2D;
  g.clearRect(0, 0, w, h);
  g.font = `600 ${40 * dpr}px ui-sans-serif, system-ui, -apple-system, Segoe UI, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = color;
  g.shadowColor = 'rgba(0,0,0,0.85)';
  g.shadowBlur = 8 * dpr;
  g.fillText(text, w / 2, h / 2);

  const tex = new CanvasTexture(c);
  tex.minFilter = LinearFilter;
  tex.magFilter = LinearFilter;
  tex.colorSpace = SRGBColorSpace;
  tex.needsUpdate = true;
  cache.set(key, tex);
  return tex;
}

export function disposeLabels(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
