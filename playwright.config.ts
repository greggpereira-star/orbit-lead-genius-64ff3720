 import { defineConfig, devices } from '@playwright/test';
 
 export default defineConfig({
   testDir: './tests/e2e',
   fullyParallel: true,
   forbidOnly: !!process.env.CI,
   retries: process.env.CI ? 2 : 0,
   workers: process.env.CI ? 1 : undefined,
   reporter: 'html',
   use: {
     // `E2E_BASE_URL` aponta a suíte para um ambiente já publicado. Serve
     // quando o Supabase do `.env` local não é o mesmo de produção — é o caso
     // hoje — ou para rodar contra homologação sem subir nada aqui.
     baseURL: process.env.E2E_BASE_URL ?? 'http://localhost:8080',
     trace: 'on-first-retry',
     screenshot: 'only-on-failure',
   },
   projects: [
     {
       name: 'chromium',
       use: { ...devices['Desktop Chrome'] },
     },
   ],
   // Com `E2E_BASE_URL` não há servidor local para subir.
   webServer: process.env.E2E_BASE_URL ? undefined : {
     command: 'npm run dev',
     // 8080, e não 5173: é a porta que o `vite dev` deste projeto usa. Com a
     // porta errada o Playwright esperava 60s e abortava — era por isso que a
     // suíte existente nunca rodava.
     url: 'http://localhost:8080',
     reuseExistingServer: !process.env.CI,
     timeout: 120_000,
   },
 });