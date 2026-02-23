import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync } from 'fs';
import { resolve } from 'path';

function copyDataPlugin() {
  return {
    name: 'copy-data',
    closeBundle() {
      const dataDir = resolve(__dirname, '..', 'data');
      const outDir = resolve(__dirname, 'dist', 'data');
      mkdirSync(outDir, { recursive: true });
      cpSync(resolve(dataDir, 'quizzes.json'), resolve(outDir, 'quizzes.json'));
      cpSync(resolve(dataDir, 'city-groups.json'), resolve(outDir, 'city-groups.json'));
    },
  };
}

export default defineConfig({
  plugins: [react(), copyDataPlugin()],
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': 'http://localhost:3001',
      '/posters': 'http://localhost:3001',
    },
  },
});
