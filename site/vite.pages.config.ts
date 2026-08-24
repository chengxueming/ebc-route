import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/postcss';
import { defineConfig } from 'vite';

export default defineConfig({
  base: process.env.PAGES_BASE_PATH || '/',
  publicDir: 'public',
  build: {
    outDir: 'dist-pages',
    emptyOutDir: true,
  },
  css: { postcss: { plugins: [tailwindcss()] } },
  plugins: [react()],
});
