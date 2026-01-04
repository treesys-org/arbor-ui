import { defineConfig, loadEnv } from 'vite';
import { angular } from '@vitejs/plugin-angular';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, (process as any).cwd(), '');
  return {
    plugins: [angular()],
    base: '/arbor-ui/', // Base URL para GitHub Pages
    define: {
      'process.env.API_KEY': JSON.stringify(env.API_KEY || process.env.API_KEY)
    },
    build: {
      outDir: 'dist',
      assetsDir: 'assets',
    }
  };
});