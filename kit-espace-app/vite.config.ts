import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// L'espace est servi à /kit-app-sexy/espace/ depuis les fichiers compilés dans ../kit-app-sexy/espace
// (versionnés). Les médias publics (/kit-app-sexy/media/...) restent ceux du site.
// Le proxy réécrit l'Origin : la Function refuse (403 bad_origin) toute écriture dont l'Origin
// diffère de l'URL de la requête, et Vite (4931) n'est pas netlify dev (4930).
export default defineConfig({
  base: '/kit-app-sexy/espace/',
  plugins: [react()],
  build: { outDir: '../kit-app-sexy/espace', emptyOutDir: true, assetsDir: 'app' },
  server: {
    port: 4931,
    proxy: {
      '/api': {
        target: 'http://localhost:4930',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (req) => req.setHeader('Origin', 'http://localhost:4930'));
        },
      },
    },
  },
});
