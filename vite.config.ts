import { defineConfig } from 'vite';

// The viewer reads its data files straight from data/processed.
export default defineConfig({
  base: './',
  publicDir: 'data/processed',
});
