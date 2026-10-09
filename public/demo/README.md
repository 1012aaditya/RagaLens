# Demo clips

Drop short monophonic vocal clips here (`.mp3`, `.wav`, `.webm`) and load them
from the landing screen with **Load an audio file**.

Nothing is shipped in this folder: RagaLens needs no recordings to demo. The
synthetic singer (`src/audio/synthSinger.ts`) renders any of the eight ragas
from notation, so the demo works with no microphone and no sample files.

Keep clips monophonic — a single voice, ideally with only a tanpura behind it.
The pitch tracker has no source separation, so tabla or harmonium will confuse
it. See "Limitations" in the top-level README.
