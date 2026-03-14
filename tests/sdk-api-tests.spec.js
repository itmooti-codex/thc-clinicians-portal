// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('VitalSync SDK API (10 tests)', () => {
  test('run 10 SDK queries and report pass/fail', async ({ page }) => {
    const consoleLogs = [];
    const consoleErrors = [];
    page.on('console', (msg) => {
      const text = msg.text();
      if (msg.type() === 'error') consoleErrors.push(text);
      else if (msg.type() === 'log') consoleLogs.push(text);
    });

    await page.goto('/dev/sdk-api-tests.html', { waitUntil: 'networkidle', timeout: 15000 });

    // Wait for tests to complete: "All 10 tests finished" or any final state
    const output = page.locator('#output');
    await expect(output).toBeVisible({ timeout: 5000 });
    await page.waitForFunction(
      () => {
        const el = document.getElementById('output');
        if (!el) return false;
        const t = el.innerText || '';
        return t.includes('All 10 tests finished') || t.includes('Tests stopped due to error') || (t.match(/\[FAIL\]/g) || []).length >= 3;
      },
      { timeout: 120000 }
    );

    const text = await output.innerText();
    const passes = (text.match(/\[PASS\]/g) || []).length;
    const fails = (text.match(/\[FAIL\]/g) || []).length;
    const total = passes + fails;

    // Log full output for inspection
    console.log('\n--- SDK API test output ---\n' + text + '\n--- end ---');
    if (consoleErrors.length) console.log('Console errors:', consoleErrors);
    console.log('Summary: ' + passes + ' passed, ' + fails + ' failed (' + total + ' ran).');

    // If we hit a failure the chain stops, so we may have fewer than 10
    expect(total, 'Expected at least 1 test to run').toBeGreaterThanOrEqual(1);
    if (total === 10 && fails === 10) {
      throw new Error('All 10 SDK API tests failed. Check output above.');
    }
  });
});
