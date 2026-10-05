# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: quiz-publico.spec.ts >> player público >> voltar devolve a resposta anterior já marcada
- Location: tests/e2e/quiz-publico.spec.ts:69:3

# Error details

```
Error: expect(locator).toHaveValue(expected) failed

Locator:  getByPlaceholder('(27) 99999-9999')
Expected: "(27) 99988-7766"
Received: ""
Timeout:  5000ms

Call log:
  - Expect "toHaveValue" with timeout 5000ms
  - waiting for getByPlaceholder('(27) 99999-9999')
    14 × locator resolved to <input value="" type="text" id="field-tel" maxlength="15" inputmode="numeric" placeholder="(27) 99999-9999" class="w-full px-4 py-3.5 outline-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 mb-6 text-base"/>
       - unexpected value ""

```

```yaml
- textbox "Seu telefone":
  - /placeholder: (27) 99999-9999
```

# Test source

```ts
  1   | import { test, expect, type Page } from '@playwright/test';
  2   | 
  3   | /**
  4   |  * Player público do quiz, de ponta a ponta.
  5   |  *
  6   |  * Exercita o player no navegador — navegação, máscara, pontuação, retomada —,
  7   |  * que é onde TODOS os defeitos desta semana apareceram e onde nenhum deles foi
  8   |  * pego por `tsc` nem pelo build.
  9   |  *
  10  |  * Precisa de um quiz publicado de verdade, e isso não é preguiça de mock: o
  11  |  * player carrega o quiz no SERVIDOR, durante o SSR. Nenhuma requisição ao
  12  |  * Supabase sai do navegador (verificado interceptando `**​/rest/v1/**`: zero
  13  |  * chamadas), então `page.route` não tem o que interceptar.
  14  |  *
  15  |  *   npm run e2e:fixture criar     # cria o quiz 'e2e-fixture'
  16  |  *   E2E_QUIZ_SLUG=e2e-fixture npm run test:e2e
  17  |  *   npm run e2e:fixture remover
  18  |  *
  19  |  * Sem `E2E_QUIZ_SLUG` a suíte PULA com o motivo escrito, em vez de passar sem
  20  |  * ter testado nada — um teste verde que não rodou é pior do que teste nenhum.
  21  |  */
  22  | 
  23  | const SLUG = process.env.E2E_QUIZ_SLUG;
  24  | 
  25  | test.describe('player público', () => {
  26  |   test.skip(
  27  |     !SLUG,
  28  |     'defina E2E_QUIZ_SLUG (veja `npm run e2e:fixture criar`) — o player carrega o quiz no servidor e não dá para simular pelo navegador',
  29  |   );
  30  | 
  31  |   /**
  32  |    * Esconde a sobreposição de erro do Vite.
  33  |    *
  34  |    * O servidor de desenvolvimento deste projeto não compila `src/styles.css`
  35  |    * (lightningcss: "Invalid qualified rule" na saída expandida do Tailwind).
  36  |    * É anterior a estes testes e NÃO afeta o build de produção, mas a
  37  |    * sobreposição fica por cima da página e intercepta todo clique.
  38  |    *
  39  |    * Seguro aqui porque nada nestes testes depende de estilo: as asserções são
  40  |    * sobre texto, papel, placeholder e `localStorage`.
  41  |    */
  42  |   const semOverlay = async (page: Page) => {
  43  |     await page.addStyleTag({ content: 'vite-error-overlay{display:none!important}' }).catch(() => {});
  44  |   };
  45  | 
  46  |   const abrir = async (page: Page, sufixo = '') => {
  47  |     await page.goto(`/q/${SLUG}${sufixo}`);
  48  |     await semOverlay(page);
  49  |     await expect(page.getByText('Qual seu interesse?')).toBeVisible({ timeout: 20_000 });
  50  |   };
  51  | 
  52  |   const TELEFONE = '(27) 99999-9999';
  53  | 
  54  |   test('primeira etapa não oferece voltar — não há para onde', async ({ page }) => {
  55  |     await abrir(page);
  56  |     await expect(page.getByLabel('Voltar para a etapa anterior')).toHaveCount(0);
  57  |   });
  58  | 
  59  |   test('a máscara formata enquanto digita', async ({ page }) => {
  60  |     await abrir(page);
  61  |     await page.getByText('Alto', { exact: true }).click();
  62  | 
  63  |     const campo = page.getByPlaceholder(TELEFONE);
  64  |     await expect(campo).toBeVisible();
  65  |     await campo.pressSequentially('27999887766');
  66  |     await expect(campo).toHaveValue('(27) 99988-7766');
  67  |   });
  68  | 
  69  |   test('voltar devolve a resposta anterior já marcada', async ({ page }) => {
  70  |     // Perguntar de novo em branco é pior do que não ter botão de voltar: a
  71  |     // pessoa acha que o quiz perdeu o que ela respondeu.
  72  |     await abrir(page);
  73  |     await page.getByText('Alto', { exact: true }).click();
  74  |     await page.getByPlaceholder(TELEFONE).pressSequentially('27999887766');
  75  | 
  76  |     await page.getByLabel('Voltar para a etapa anterior').click();
  77  |     await expect(page.getByRole('radio', { checked: true })).toBeVisible();
  78  | 
  79  |     await page.getByText('Alto', { exact: true }).click();
> 80  |     await expect(page.getByPlaceholder(TELEFONE)).toHaveValue('(27) 99988-7766');
      |                                                   ^ Error: expect(locator).toHaveValue(expected) failed
  81  |   });
  82  | 
  83  |   test('etapa condicional aparece para quem se aplica', async ({ page }) => {
  84  |     await abrir(page);
  85  |     await page.getByText('Alto', { exact: true }).click();
  86  |     await page.getByPlaceholder(TELEFONE).pressSequentially('27999887766');
  87  |     await page.getByRole('button', { name: 'Continuar' }).click();
  88  |     await expect(page.getByText('So para quem tem interesse alto')).toBeVisible();
  89  |   });
  90  | 
  91  |   test('e é pulada sem deixar o visitante numa tela em branco', async ({ page }) => {
  92  |     // Regressão do beco sem saída: quando a última etapa ficava toda oculta, o
  93  |     // player parava numa tela sem bloco, sem botão e sem conclusão.
  94  |     await abrir(page);
  95  |     await page.getByText('Baixo', { exact: true }).click();
  96  |     await page.getByPlaceholder(TELEFONE).pressSequentially('27999887766');
  97  |     await page.getByRole('button', { name: 'Continuar' }).click();
  98  | 
  99  |     await expect(page.getByText('So para quem tem interesse alto')).toHaveCount(0);
  100 |     // Chegou ao fim: o progresso guardado é apagado ao gravar a submissão.
  101 |     await expect
  102 |       .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lf.q.')).length), { timeout: 20_000 })
  103 |       .toBe(0);
  104 |   });
  105 | 
  106 |   test('retoma de onde parou, com a MESMA sessão', async ({ page }) => {
  107 |     await abrir(page);
  108 |     await page.getByText('Alto', { exact: true }).click();
  109 |     await expect(page.getByPlaceholder(TELEFONE)).toBeVisible();
  110 | 
  111 |     const sessao = () =>
  112 |       page.evaluate(() => {
  113 |         const k = Object.keys(localStorage).find((x) => x.startsWith('lf.q.'));
  114 |         return k ? (JSON.parse(localStorage[k]) as { sessionId: string }).sessionId : null;
  115 |       });
  116 | 
  117 |     const antes = await sessao();
  118 |     expect(antes).toBeTruthy();
  119 | 
  120 |     await page.reload();
  121 |     await semOverlay(page);
  122 | 
  123 |     // Volta direto para o telefone, não para o começo.
  124 |     await expect(page.getByPlaceholder(TELEFONE)).toBeVisible({ timeout: 20_000 });
  125 |     // Com outra sessão, quem volta vira um lead NOVO e a captura antecipada do
  126 |     // primeiro acesso fica órfã.
  127 |     expect(await sessao()).toBe(antes);
  128 |   });
  129 | 
  130 |   test('preview não retoma — quem edita quer ver do começo', async ({ page }) => {
  131 |     await abrir(page);
  132 |     await page.getByText('Alto', { exact: true }).click();
  133 |     await expect(page.getByPlaceholder(TELEFONE)).toBeVisible();
  134 | 
  135 |     await page.goto(`/q/${SLUG}?preview=1`);
  136 |     await semOverlay(page);
  137 |     await expect(page.getByText('Qual seu interesse?')).toBeVisible({ timeout: 20_000 });
  138 |   });
  139 | });
  140 | 
```