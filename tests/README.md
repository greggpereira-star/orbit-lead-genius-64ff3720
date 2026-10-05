# Testes

## Unitários — `npm test`

67 testes sobre as funções puras do quiz, em menos de um segundo. É onde
estavam quase todos os defeitos desta semana, e nenhum deles era pego por
`tsc` nem pelo build.

| Arquivo | Cobre |
|---|---|
| `src/modules/quiz/engine.test.ts` | pontuação recalculada, máximo e mínimo alcançáveis, percentual com penalidade, faixas, regras de salto nos quatro modos, exibição condicional |
| `src/modules/quiz/lib/fieldMask.test.ts` | máscaras (incluindo apagar) e preço com moeda |
| `src/modules/quiz/lib/stepConversion.test.ts` | conversão por visitante, mínimo para dar nota, faixas de cor |
| `src/modules/quiz/lib/validarPublicacao.test.ts` | o que barra e o que só avisa antes de publicar |
| `src/modules/quiz/lib/analisarFunil.test.ts` | achados da análise, ordem por gravidade, e a regra de nunca afirmar sem número |
| `src/modules/quiz/lib/progressoSalvo.test.ts` | retomada, descarte por edição do quiz, por etapa inexistente e por validade |

## Ponta a ponta — `npm run test:e2e`

Exercita o player público no navegador.

**Precisa de um quiz publicado de verdade**, e isso não é preguiça de mock: o
player carrega o quiz no **servidor**, durante o SSR. Interceptando
`**/rest/v1/**` no Playwright, o número de chamadas é **zero** — não há o que
simular pelo navegador.

```bash
# 1. crie a fixture (exige SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e E2E_COMPANY_ID)
npm run e2e:fixture criar

# 2. rode — contra o ambiente publicado:
E2E_BASE_URL=https://altleadflow.com.br E2E_QUIZ_SLUG=e2e-fixture npm run test:e2e

#    ou contra o servidor local, se o .env local apontar para o mesmo Supabase:
E2E_QUIZ_SLUG=e2e-fixture npm run test:e2e

# 3. remova
npm run e2e:fixture remover
```

Sem `E2E_QUIZ_SLUG` a suíte **pula com o motivo escrito**, em vez de passar sem
ter testado nada — teste verde que não rodou é pior do que teste nenhum.

## Problemas de ambiente encontrados ao montar isto

1. **A porta do Playwright estava errada** (`5173`; o `vite dev` deste projeto
   usa `8080`). A suíte existente nunca rodou: esperava 60s e abortava.
   Corrigido.
2. **O servidor de desenvolvimento não compilava `src/styles.css`** —
   nove declarações de tema escuro ficavam soltas dentro de `@layer base`, sem
   seletor, depois do fechamento do bloco `.dark`. Corrigido; o mesmo defeito
   deixava o tema escuro sem esses tokens em produção.
3. **O `.env` local aponta para um Supabase diferente do de produção**
   (`nckxdcocmwvgevazyuac.supabase.co`, o hospedado antigo). Por isso as
   instruções acima rodam o e2e contra o ambiente publicado. **Ainda em
   aberto** — resolver exige decidir para onde o desenvolvimento local deve
   apontar.
