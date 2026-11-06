import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// O caminho base e parametrizado para publicacao em subdiretorio (ex.: GitHub Pages:
// VITE_BASE_PATH=/radar-retencao/). Sem a variavel, a aplicacao e servida na raiz.
export default defineConfig({
  base: process.env.VITE_BASE_PATH || '/',
  plugins: [react()],
  build: {
    sourcemap: false,
    chunkSizeWarningLimit: 900,
    rollupOptions: {
      output: {
        // Separa as bibliotecas pesadas em blocos proprios (cache do navegador).
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('recharts') || id.includes('d3-') || id.includes('victory-vendor')) return 'recharts';
          return 'vendor';
        },
      },
    },
  },
});
