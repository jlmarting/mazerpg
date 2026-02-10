import { test, expect } from '@playwright/test';

test('Verify comparison panel works', async ({ page }) => {
    await page.goto('http://localhost:5173/structor.html');

    // Load demo sheet
    await page.click('button:has-text("USAR DEMO SHEET")');

    // Open comparison panel
    await page.click('#toggleComparisonBtn');

    // Simulate mouse click on the main canvas to select a sprite
    const canvas = page.locator('#mainCanvas');
    const box = await canvas.boundingBox();
    if (box) {
        await page.mouse.click(box.x + 10, box.y + 10);
    }

    // Wait a bit for rendering
    await page.waitForTimeout(500);

    // Take screenshot of the comparison panel
    const comparisonPanel = page.locator('#comparisonPanel');
    await comparisonPanel.screenshot({ path: '/home/jules/verification/comparison_active.png' });

    // Verify canvases are not empty (this is hard via playwright but we can check if they exist)
    await expect(page.locator('#canvasFirst')).toBeVisible();
    await expect(page.locator('#canvasCurrent')).toBeVisible();
});
