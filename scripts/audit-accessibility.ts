// Auditoria Simples de Contraste para CI (WCAG 2.1)
// Sem dependências externas complexas para garantir estabilidade no CI

const TOKENS = {
  dark: {
    bg: '#0B0F17',
    foreground: '#F8FAFC',
    primary: '#2563EB',
    secondary_fg: '#CBD5E1',
    muted_fg: '#94A3B8'
  },
  light: {
    bg: '#FFFFFF',
    foreground: '#0F172A',
    primary: '#2563EB',
    secondary_fg: '#334155',
    muted_fg: '#64748B'
  }
};

function getLuminance(hex: string) {
  const rgb = hex.replace(/^#/, '').match(/.{2}/g)!.map(x => {
    const s = parseInt(x, 16) / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

function getContrastRatio(hex1: string, hex2: string) {
  const l1 = getLuminance(hex1);
  const l2 = getLuminance(hex2);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

async function audit() {
  console.log('🚀 [CI] Iniciando Auditoria de Acessibilidade (WCAG 2.1)...');
  let failures = 0;

  const checks = [
    { name: 'Dark: Foreground on BG', fg: TOKENS.dark.foreground, bg: TOKENS.dark.bg, min: 7 },
    { name: 'Dark: Secondary on BG', fg: TOKENS.dark.secondary_fg, bg: TOKENS.dark.bg, min: 4.5 },
    { name: 'Dark: Muted on BG', fg: TOKENS.dark.muted_fg, bg: TOKENS.dark.bg, min: 4.5 },
    { name: 'Light: Foreground on BG', fg: TOKENS.light.foreground, bg: TOKENS.light.bg, min: 7 },
    { name: 'Light: Secondary on BG', fg: TOKENS.light.secondary_fg, bg: TOKENS.light.bg, min: 4.5 },
  ];

  for (const c of checks) {
    const ratio = getContrastRatio(c.fg, c.bg);
    if (ratio >= c.min) {
      console.log(`✅ PASS: ${c.name.padEnd(25)} | Ratio: ${ratio.toFixed(2)}:1`);
    } else {
      console.error(`❌ FAIL: ${c.name.padEnd(25)} | Ratio: ${ratio.toFixed(2)}:1 (Min: ${c.min}:1)`);
      failures++;
    }
  }

  if (failures > 0) {
    process.exit(1);
  } else {
    console.log('\n✨ [SUCCESS] Acessibilidade validada.');
  }
}

audit();
