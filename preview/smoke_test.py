from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).parent
OUT = ROOT / 'smoke-battle.png'
VICTORY = ROOT / 'smoke-victory.png'

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1280, "height": 720})
    errors = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto('http://127.0.0.1:8765/index.html')
    page.wait_for_load_state('networkidle')
    assert page.locator('#gameCanvas').count() == 1
    assert page.locator('#startButton').is_visible()
    page.click('#startButton')
    page.wait_for_timeout(100)
    assert page.evaluate('Boolean(window.__magicCastleDebug)')
    page.evaluate('window.__magicCastleDebug.start()')
    page.screenshot(path=str(OUT))
    page.evaluate('window.__magicCastleDebug.forceLevel(2)')
    assert page.locator('#cardPanel').evaluate("el => getComputedStyle(el).display") == 'flex'
    assert page.locator('#cardGrid button').count() == 3
    page.evaluate('window.__magicCastleDebug.forceLevel(3)')
    assert page.locator('#cardGrid .dice-card').count() == 1
    page.click('#cardGrid .dice-card')
    page.wait_for_timeout(550)
    assert page.evaluate('window.__magicCastleDebug.getState().phase') == 'battle'
    page.evaluate('window.__magicCastleDebug.forceLevel(4)')
    page.click('#cardGrid button:first-child')
    assert page.locator('#cardGrid .evolution-card').count() == 1
    page.click('#cardGrid .evolution-card')
    assert page.evaluate('window.__magicCastleDebug.getState().upgraded') is True
    page.evaluate('window.__magicCastleDebug.forceBoss()')
    assert page.evaluate('window.__magicCastleDebug.getState().phase') == 'boss'
    page.evaluate('window.__magicCastleDebug.win()')
    assert page.locator('#victoryPanel').evaluate("el => getComputedStyle(el).display") == 'flex'
    page.screenshot(path=str(VICTORY))
    page.click('#restartButton')
    assert page.evaluate('window.__magicCastleDebug.getState().phase') == 'start'
    browser.close()
    if errors:
        raise AssertionError('page errors: ' + repr(errors))
print('SMOKE_OK')
