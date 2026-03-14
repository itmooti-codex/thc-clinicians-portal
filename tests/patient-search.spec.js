// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Patient search', () => {
  test('with mocks: initial load settles then search runs without error', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' || (text && text.includes('Patient search failed'))) {
        consoleErrors.push(text);
      }
    });

    // ?test=1 enables test mocks (no live VitalSync); initial load and search use mock data
    await page.goto('/dev/?test=1');

    // Wait for app content and initial load (mock resolves immediately)
    await expect(page.locator('#app-content')).toBeVisible({ timeout: 15000 });
    await expect(page.locator('#app-loading')).toHaveClass(/hidden/);
    await page.waitForFunction(
      () => {
        const doctorEl = document.getElementById('doctor-name');
        const loadErr = document.getElementById('patient-load-error');
        const errVisible = loadErr && !loadErr.classList.contains('hidden');
        const hasDoctor = doctorEl && doctorEl.textContent.trim().length > 0;
        return hasDoctor || errVisible;
      },
      { timeout: 10000 }
    );

    const loadErrorVisible = await page.locator('#patient-load-error').isVisible();
    if (loadErrorVisible) {
      throw new Error('Initial data load failed (patient-load-error visible). Check test mocks.');
    }

    await expect(page.locator('#patient-search')).toBeVisible();

    // Run search: type and press Enter
    await page.locator('#patient-search').fill('a');
    await page.locator('#patient-search').press('Enter');

    await page.waitForTimeout(800);

    const searchFailedToast = page.getByText('Search failed. Please try again.');
    await expect(searchFailedToast).not.toBeVisible();

    const searchErrors = consoleErrors.filter((t) => t.includes('Patient search failed') || t.includes('executeQuery'));
    expect(searchErrors, `Console had search/SDK errors: ${searchErrors.join('; ')}`).toHaveLength(0);

    const emptyMsg = page.locator('#patient-empty-msg');
    const listHasCards = page.locator('#patient-list .patient-card');
    const hasEmpty = await emptyMsg.isVisible();
    const hasCards = (await listHasCards.count()) > 0;
    expect(hasEmpty || hasCards, 'Search should show either results or "No patients found"').toBeTruthy();
  });

  test('search UI: input visible, count updates after search', async ({ page }) => {
    await page.goto('/dev/?test=1');
    await expect(page.locator('#app-content')).toBeVisible({ timeout: 10000 });
    await expect(page.locator('#patient-search')).toBeVisible();
    await expect(page.locator('#patient-search')).toHaveAttribute('placeholder', /search|name|enter/i);

    await page.locator('#patient-search').fill('test');
    await page.locator('#patient-search').press('Enter');
    await page.waitForTimeout(1000);

    const countEl = page.locator('#patient-count');
    await expect(countEl).toBeVisible();
    await expect(countEl).toContainText(/patient(s)?/i);

    await page.locator('#patient-search').fill('');
    await page.locator('#patient-search').press('Enter');
    await page.waitForTimeout(300);
    await expect(countEl).toContainText('0 patient');
  });

  test('with GraphQL: app loads and patient search completes without error', async ({ page }) => {
    const consoleErrors = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error' || (text && text.includes('Patient search failed'))) {
        consoleErrors.push(text);
      }
    });

    // No test=1 — use real GraphQL API for data
    await page.goto('/dev/', { waitUntil: 'networkidle', timeout: 15000 });

    await expect(page.locator('#app-content')).toBeVisible({ timeout: 20000 });
    await expect(page.locator('#app-loading')).toHaveClass(/hidden/, { timeout: 25000 });

    // Wait for initial load to settle (doctor name or load error)
    await page.waitForFunction(
      () => {
        const doctorEl = document.getElementById('doctor-name');
        const loadErr = document.getElementById('patient-load-error');
        const errVisible = loadErr && !loadErr.classList.contains('hidden');
        const hasDoctor = doctorEl && doctorEl.textContent.trim().length > 0;
        return hasDoctor || errVisible;
      },
      { timeout: 45000 }
    );

    const loadErrorVisible = await page.locator('#patient-load-error').isVisible();
    if (loadErrorVisible) {
      throw new Error('Initial data load failed (patient-load-error visible). GraphQL getItems may be failing.');
    }

    await expect(page.locator('#patient-search')).toBeVisible({ timeout: 5000 });

    await page.locator('#patient-search').fill('a');
    await page.locator('#patient-search').press('Enter');

    await page.waitForTimeout(3000);

    const searchFailedToast = page.getByText('Search failed. Please try again.');
    await expect(searchFailedToast).not.toBeVisible();

    const searchErrors = consoleErrors.filter((t) => t.includes('Patient search failed') || t.includes('executeQuery'));
    expect(searchErrors, `Console had search/SDK errors: ${searchErrors.join('; ')}`).toHaveLength(0);

    const emptyMsg = page.locator('#patient-empty-msg');
    const listHasCards = page.locator('#patient-list .patient-card');
    const hasEmpty = await emptyMsg.isVisible();
    const hasCards = (await listHasCards.count()) > 0;
    expect(hasEmpty || hasCards, 'Search should show either results or "No patients found"').toBeTruthy();
  });
});
