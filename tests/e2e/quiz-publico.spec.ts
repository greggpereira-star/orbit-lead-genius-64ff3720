import { test, expect, type Page } from '@playwright/test';

/**
 * Player público do quiz, de ponta a ponta.
 *
 * Exercita o player no navegador — navegação, máscara, pontuação, retomada —,
 * que é onde TODOS os defeitos desta semana apareceram e onde nenhum deles foi
 * pego por `tsc` nem pelo build.
 *
 * Precisa de um quiz publicado de verdade, e isso não é preguiça de mock: o
 * player carrega o quiz no SERVIDOR, durante o SSR. Nenhuma requisição ao
 * Supabase sai do navegador (verificado interceptando `**​/rest/v1/**`: zero
 * chamadas), então `page.route` não tem o que interceptar.
 *
 *   npm run e2e:fixture criar     # cria o quiz 'e2e-fixture'
 *   E2E_QUIZ_SLUG=e2e-fixture npm run test:e2e
 *   npm run e2e:fixture remover
 *
 * Sem `E2E_QUIZ_SLUG` a suíte PULA com o motivo escrito, em vez de passar sem
 * ter testado nada — um teste verde que não rodou é pior do que teste nenhum.
 */

const SLUG = process.env.E2E_QUIZ_SLUG;

test.describe('player público', () => {
  test.skip(
    !SLUG,
    'defina E2E_QUIZ_SLUG (veja `npm run e2e:fixture criar`) — o player carrega o quiz no servidor e não dá para simular pelo navegador',
  );

  const abrir = async (page: Page, sufixo = '') => {
    await page.goto(`/q/${SLUG}${sufixo}`);
    await expect(page.getByText('Qual seu interesse?')).toBeVisible({ timeout: 20_000 });
  };

  const TELEFONE = '(27) 99999-9999';

  test('primeira etapa não oferece voltar — não há para onde', async ({ page }) => {
    await abrir(page);
    await expect(page.getByLabel('Voltar para a etapa anterior')).toHaveCount(0);
  });

  test('a máscara formata enquanto digita', async ({ page }) => {
    await abrir(page);
    await page.getByText('Alto', { exact: true }).click();

    const campo = page.getByPlaceholder(TELEFONE);
    await expect(campo).toBeVisible();
    await campo.pressSequentially('27999887766');
    await expect(campo).toHaveValue('(27) 99988-7766');
  });

  test('voltar devolve a resposta anterior já marcada', async ({ page }) => {
    // Perguntar de novo em branco é pior do que não ter botão de voltar: a
    // pessoa acha que o quiz perdeu o que ela respondeu.
    await abrir(page);
    await page.getByText('Alto', { exact: true }).click();
    await page.getByPlaceholder(TELEFONE).pressSequentially('27999887766');

    await page.getByLabel('Voltar para a etapa anterior').click();
    await expect(page.getByRole('radio', { checked: true })).toBeVisible();

    await page.getByText('Alto', { exact: true }).click();
    await expect(page.getByPlaceholder(TELEFONE)).toHaveValue('(27) 99988-7766');
  });

  test('etapa condicional aparece para quem se aplica', async ({ page }) => {
    await abrir(page);
    await page.getByText('Alto', { exact: true }).click();
    await page.getByPlaceholder(TELEFONE).pressSequentially('27999887766');
    await page.getByRole('button', { name: 'Continuar' }).click();
    await expect(page.getByText('So para quem tem interesse alto')).toBeVisible();
  });

  test('e é pulada sem deixar o visitante numa tela em branco', async ({ page }) => {
    // Regressão do beco sem saída: quando a última etapa ficava toda oculta, o
    // player parava numa tela sem bloco, sem botão e sem conclusão.
    await abrir(page);
    await page.getByText('Baixo', { exact: true }).click();
    await page.getByPlaceholder(TELEFONE).pressSequentially('27999887766');
    await page.getByRole('button', { name: 'Continuar' }).click();

    await expect(page.getByText('So para quem tem interesse alto')).toHaveCount(0);
    // Chegou ao fim: o progresso guardado é apagado ao gravar a submissão.
    await expect
      .poll(() => page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('lf.q.')).length), { timeout: 20_000 })
      .toBe(0);
  });

  test('retoma de onde parou, com a MESMA sessão', async ({ page }) => {
    await abrir(page);
    await page.getByText('Alto', { exact: true }).click();
    await expect(page.getByPlaceholder(TELEFONE)).toBeVisible();

    const sessao = () =>
      page.evaluate(() => {
        const k = Object.keys(localStorage).find((x) => x.startsWith('lf.q.'));
        return k ? (JSON.parse(localStorage[k]) as { sessionId: string }).sessionId : null;
      });

    const antes = await sessao();
    expect(antes).toBeTruthy();

    await page.reload();

    // Volta direto para o telefone, não para o começo.
    await expect(page.getByPlaceholder(TELEFONE)).toBeVisible({ timeout: 20_000 });
    // Com outra sessão, quem volta vira um lead NOVO e a captura antecipada do
    // primeiro acesso fica órfã.
    expect(await sessao()).toBe(antes);
  });

  test('preview não retoma — quem edita quer ver do começo', async ({ page }) => {
    await abrir(page);
    await page.getByText('Alto', { exact: true }).click();
    await expect(page.getByPlaceholder(TELEFONE)).toBeVisible();

    await page.goto(`/q/${SLUG}?preview=1`);
    await expect(page.getByText('Qual seu interesse?')).toBeVisible({ timeout: 20_000 });
  });
});
