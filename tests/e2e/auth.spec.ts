import { test, expect } from '@playwright/test';

test.describe('Enterprise Auth Flow', () => {
  const testEmail = `test-${Math.random().toString(36).substring(7)}@example.com`;
  const testPassword = 'Password123!';
  const testCompany = 'Test Enterprise';

  test('should complete signup flow and reach ready state', async ({ page }) => {
    await page.goto('/register');
    
    // Fill signup form
    await page.fill('input[name="company"]', testCompany);
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    
    // Submit
    await page.click('button[type="submit"]');
    
    // Check for success feedback (toast or redirect)
    const successMessage = page.locator('text=Account created');
    const checkEmailMessage = page.locator('text=Check your email');
    
    await expect(successMessage.or(checkEmailMessage)).toBeVisible({ timeout: 10000 });
  });

  test('should login successfully and load tenant context', async ({ page }) => {
    await page.goto('/login');
    
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');
    
    // Wait for dashboard loading state to finish
    await expect(page).toHaveURL(/.*dashboard/, { timeout: 15000 });
    
    // Verify enterprise ready state
    const dashboardTitle = page.locator('h1', { hasText: 'Dashboard' });
    await expect(dashboardTitle).toBeVisible();
    
    // Verify company name is loaded in sidebar (tenant check)
    const sidebarCompany = page.locator('[data-sidebar="header"]');
    await expect(sidebarCompany).toContainText(testCompany);
  });

  test('should handle session restoration after refresh', async ({ page }) => {
    // First login
    await page.goto('/login');
    await page.fill('input[name="email"]', testEmail);
    await page.fill('input[name="password"]', testPassword);
    await page.click('button[type="submit"]');
    await expect(page).toHaveURL(/.*dashboard/);
    
    // Reload page
    await page.reload();
    
    // Should still be on dashboard and READY
    await expect(page).toHaveURL(/.*dashboard/);
    await expect(page.locator('h1', { hasText: 'Dashboard' })).toBeVisible();
  });

  test('should block dashboard access when unauthenticated', async ({ page }) => {
    await page.goto('/dashboard');
    // Should redirect to login
    await expect(page).toHaveURL(/.*login/);
  });
});
