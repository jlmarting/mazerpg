from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_refined_structor(page: Page):
    page.goto("http://localhost:5173/structor.html")
    time.sleep(3)

    # Check "Guardar Acción" button position (should be visible in sidebar)
    page.screenshot(path="/home/jules/verification/sidebar_refined.png")

    # Open comparison panel (now "HERRAMIENTAS DE AJUSTE")
    page.click('#comparisonToggle')
    time.sleep(1)

    # Click simulation tab
    page.click('div[data-tab="simulacionTab"]')
    time.sleep(2)

    # Take screenshot of simulation in tab
    page.screenshot(path="/home/jules/verification/sim_tab_active.png")

    # Go back to adjustment tab
    page.click('div[data-tab="ajusteTab"]')

    # Load demo sheet
    page.click('button:has-text("USAR DEMO SHEET")')

    # Select multiple frames to test "Previous Frame" logic
    # Select (0,0) then (32,0) then (64,0)
    canvas = page.locator('#spriteCanvas')
    canvas.click(position={"x": 16, "y": 16}, force=True) # Frame 0
    canvas.click(position={"x": 48, "y": 16}, force=True, modifiers=["Control"]) # Frame 1
    canvas.click(position={"x": 80, "y": 16}, force=True, modifiers=["Control"]) # Frame 2

    time.sleep(1)
    # At this point, activeIndex is 2 (Frame 2). Previous should be 1 (Frame 1).
    page.screenshot(path="/home/jules/verification/comparison_refined.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_refined_structor(page)
        finally:
            browser.close()
