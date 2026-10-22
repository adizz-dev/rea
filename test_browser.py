
from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=False)
    page = browser.new_page()

    page.goto("https://example.com")

    print("Browser started successfully")
    print("Page title:", page.title())
    print("Page URL:", page.url)

    input("Press Enter in this terminal to close the browser...")
    browser.close()
