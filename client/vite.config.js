import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { cpSync, mkdirSync, existsSync } from 'fs';
import { resolve } from 'path';

function copyDataPlugin() {
  return {
    name: 'copy-data',
    closeBundle() {
      const dataDir = resolve(__dirname, '..', 'data');
      const distDir = resolve(__dirname, 'dist');

      // Copy JSON data files
      const dataOut = resolve(distDir, 'data');
      mkdirSync(dataOut, { recursive: true });
      cpSync(resolve(dataDir, 'quizzes.json'), resolve(dataOut, 'quizzes.json'));
      cpSync(resolve(dataDir, 'city-groups.json'), resolve(dataOut, 'city-groups.json'));

      // Copy poster images
      const postersDir = resolve(dataDir, 'posters');
      if (existsSync(postersDir)) {
        cpSync(postersDir, resolve(distDir, 'posters'), { recursive: true });
      }
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
