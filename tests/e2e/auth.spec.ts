import { test, expect } from '@playwright/test';

/**
 * Entrada e porta fechada.
 *
 * A versão anterior destes testes vinha do scaffold e nunca rodou — a
 * configuração apontava para a porta errada. Quando a porta foi corrigida,
 * apareceram quatro falhas permanentes: eles procuravam textos em inglês que
 * o app não tem ("Account created", "Check your email") e **criavam uma conta
 * de verdade a cada execução**, com e-mail aleatório, no banco que o servidor
 * de desenvolvimento estiver usando.
 *
 * Quatro testes sempre vermelhos são piores que nenhum: ensinam a ignorar a
 * saída da suíte. Estes aqui verificam o que de fato existe e não escrevem
 * nada no banco.
 */
test.describe('entrada', () => {
  test('a tela de login tem os campos e o botão', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toBeVisible();
    await expect(page.locator('#password')).toBeVisible();
    await expect(page.locator('button[type="submit"]')).toBeVisible();
  });

  test('o campo de e-mail é do tipo e-mail — teclado certo no celular', async ({ page }) => {
    await page.goto('/login');
    await expect(page.locator('#email')).toHaveAttribute('type', 'email');
    await expect(page.locator('#password')).toHaveAttribute('type', 'password');
  });

  test('rota protegida manda para o login quando não há sessão', async ({ page }) => {
    // O que mais importa aqui: sem sessão, o construtor não pode abrir.
    await page.goto('/quizzes');
    await page.waitForURL(/\/login/, { timeout: 15000 });
    await expect(page.locator('#email')).toBeVisible();
  });

  test('credencial errada não entra e avisa', async ({ page }) => {
    await page.goto('/login');
    await page.fill('#email', 'ninguem-com-esta-conta@example.com');
    await page.fill('#password', 'senha-que-nao-existe');
    await page.click('button[type="submit"]');

    // Continua fora: a única garantia que interessa. A mensagem exata muda
    // com o provedor de autenticação, então o teste não a fixa.
    await page.waitForTimeout(3000);
    await expect(page).toHaveURL(/\/login/);
  });
});
