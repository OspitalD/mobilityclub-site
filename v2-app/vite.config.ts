import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// La page est servie à /v2/ depuis les fichiers compilés dans ../v2 (versionnés).
// Les médias (/assets/...) restent ceux du site, servis à la racine.
export default defineConfig({
  base: '/v2/',
  plugins: [react()],
  build: { outDir: '../v2', emptyOutDir: true, assetsDir: 'app' },
  server: { port: 5191 },
});
