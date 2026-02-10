from playwright.sync_api import Page, expect, sync_playwright
import time

def verify_comparison(page: Page):
    page.goto("http://localhost:5173/structor.html")
    time.sleep(3)

    # Open comparison panel
    page.click('#comparisonToggle')

    # Load demo sheet
    page.click('button:has-text("USAR DEMO SHEET")')
    time.sleep(1)

    # Click on the canvas with force
    try:
        page.click('#spriteCanvas', position={"x": 50, "y": 50}, force=True)
        print("Clicked on canvas")
    except Exception as e:
        print(f"Failed to click on canvas: {e}")

    time.sleep(1)

    # Take screenshot
    page.screenshot(path="/home/jules/verification/comparison_active.png", full_page=True)
    page.locator('#comparisonContent').screenshot(path="/home/jules/verification/comparison_canvases.png")

if __name__ == "__main__":
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page()
        try:
            verify_comparison(page)
        finally:
            browser.close()
