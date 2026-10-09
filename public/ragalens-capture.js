/*
 * RagaLens capture worklet.
 *
 * Slices the input into overlapping analysis frames (frameSize 2048, hop 512)
 * and posts copies to the main thread, which forwards them to the analysis
 * worker. No analysis happens here — the audio render thread must never block,
 * so this is a circular buffer plus one 2048-sample copy per hop.
 *
 * This file is plain JavaScript and lives in public/ on purpose: an
 * AudioWorklet module is fetched by URL at runtime, and Vite's `?url` import
 * would ship an untranspiled .ts file in a production build.
 */

const FRAME_SIZE = 2048;
const HOP = 512;

class CaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.ring = new Float32Array(FRAME_SIZE);
    this.write = 0;
    this.total = 0;
    this.sinceHop = 0;
    this.started = currentTime;
  }

  process(inputs) {
    const input = inputs[0];
    const ch = input && input[0];
    if (!ch) return true;

    for (let i = 0; i < ch.length; i++) {
      this.ring[this.write] = ch[i];
      this.write = (this.write + 1) % FRAME_SIZE;
      this.total++;
      this.sinceHop++;

      if (this.total >= FRAME_SIZE && this.sinceHop >= HOP) {
        this.sinceHop = 0;
        const frame = new Float32Array(FRAME_SIZE);
        // unwrap the circular buffer, oldest sample first
        const head = FRAME_SIZE - this.write;
        frame.set(this.ring.subarray(this.write), 0);
        frame.set(this.ring.subarray(0, this.write), head);
        this.port.postMessage(
          { t: currentTime - this.started, samples: frame, sampleRate },
          [frame.buffer],
        );
      }
    }
    return true;
  }
}

registerProcessor('ragalens-capture', CaptureProcessor);
