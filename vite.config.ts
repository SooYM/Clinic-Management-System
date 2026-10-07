import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig(({ mode }) => ({
  define: { 'import.meta.env.VITE_DEMO_MODE': JSON.stringify(mode === 'demo' ? 'true' : 'false') },
  plugins: [react(), tailwindcss()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    watch: { ignored: ['**/.local/**', '**/.playwright-cli/**', '**/dist/**'] },
    proxy: { '/api': process.env.VITE_API_TARGET || 'http://127.0.0.1:3001' },
  },
  build: { outDir: mode === 'demo' ? 'dist-demo' : 'dist', sourcemap: false },
}));
