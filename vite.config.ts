import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  worker: { format: 'es' },
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // three + postprocessing dominate the bundle; splitting them lets the
        // browser cache the renderer separately from the app code
        manualChunks: {
          three: ['three'],
        },
      },
    },
  },
});
