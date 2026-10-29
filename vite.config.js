import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite + Vitest configuration.
// `test` block configures Vitest to use jsdom so we can render React
// components in tests, and loads a setup file for jest-dom matchers.
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup.js',
    include: ['tests/**/*.test.{js,jsx}'],
  },
});
