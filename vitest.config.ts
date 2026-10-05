import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  test: {
    // `happy-dom` porque alguns módulos tocam `localStorage` e `crypto`; é mais
    // leve que o jsdom e basta para o que é testado aqui (nada renderiza).
    environment: 'happy-dom',
    include: ['src/**/*.test.ts'],
    // O Playwright vive em tests/e2e e tem o seu próprio runner.
    exclude: ['tests/**', 'node_modules/**'],
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
});
