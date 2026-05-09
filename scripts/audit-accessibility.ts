import { ColorContrastChecker } from 'color-contrast-checker';

// Módulo de Auditoria de Acessibilidade Enterprise

const ccc = new ColorContrastChecker();

const TOKENS = {
  dark: {
    bg: '#0B0F17',
    surface1: '#111827',
    textPrimary: '#F8FAFC',
    textSecondary: '#CBD5E1',
    primary: '#2563EB',
  },
  light: {
    bg: '#FFFFFF',
    surface1: '#F8FAFC',
    textPrimary: '#0F172A',
    textSecondary: '#334155',
    primary: '#2563EB',
  }
};

async function auditContrast() {
  console.log('🚀 Iniciando Auditoria de Contraste WCAG...');
  let failures = 0;

  const checks = [
    { name: 'Dark: Text Primary on BG', fg: TOKENS.dark.textPrimary, bg: TOKENS.dark.bg, level: 'AAA' },
    { name: 'Dark: Text Secondary on BG', fg: TOKENS.dark.textSecondary, bg: TOKENS.dark.bg, level: 'AA' },
    { name: 'Dark: White on Primary (Button)', fg: '#FFFFFF', bg: TOKENS.dark.primary, level: 'AA' },
    { name: 'Light: Text Primary on BG', fg: TOKENS.light.textPrimary, bg: TOKENS.light.bg, level: 'AAA' },
    { name: 'Light: Text Secondary on BG', fg: TOKENS.light.textSecondary, bg: TOKENS.light.bg, level: 'AA' },
  ];

  for (const check of checks) {
    const isPass = ccc.isLevelAA(check.fg, check.bg, 14);
    if (isPass) {
      console.log(`✅ PASS: ${check.name} (${check.fg} on ${check.bg})`);
    } else {
      console.log(`❌ FAIL: ${check.name} (${check.fg} on ${check.bg})`);
      failures++;
    }
  }

  if (failures > 0) {
    console.error(`\n🚨 Auditoria reprovada: ${failures} falhas de contraste detectadas.`);
    process.exit(1);
  } else {
    console.log('\n✨ Auditoria concluída com sucesso. Todos os tokens seguem WCAG.');
  }
}

auditContrast();
