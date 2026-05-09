# Design System & Accessibility Guidelines

## 1. Design Tokens (OKLCH)

A plataforma utiliza o sistema **OKLCH** para garantir percepção de cor uniforme.

| Token | Light Mode (HEX) | Dark Mode (HEX) | WCAG |
|-------|------------------|-----------------|------|
| `--background` | #FFFFFF | #0B0F17 | AAA |
| `--foreground` | #0F172A | #F8FAFC | AAA |
| `--primary` | #2563EB | #2563EB | AA |
| `--muted-foreground` | #64748B | #94A3B8 | AA |

## 2. Component States

### Buttons
- **Normal**: `bg-primary text-primary-foreground`
- **Hover**: Contrast increase (Luminance shift)
- **Focus**: `ring-2 ring-primary` (Obrigatório para navegação por teclado)
- **Disabled**: `opacity-50 pointer-events-none`

### Inputs
- **Border**: `border-input`
- **Focus**: `border-primary ring-2 ring-primary`
- **Contrast**: Placeholders devem manter ratio mínimo de 3:1.

## 3. Data Visualization

- **Tooltips**: Devem utilizar `bg-card` com bordas definidas. Textos dentro de tooltips devem ser `font-bold`.
- **Contrast**: Linhas de grid (`CartesianGrid`) utilizam `var(--border)` para visibilidade sem ruído excessivo.
- **Charts**: Cores de séries devem ser distintas e possuir contraste contra o fundo do card.

## 4. Auditoria Automática (CI)

Execute `bun audit:a11y` para verificar regressões antes de cada commit.
