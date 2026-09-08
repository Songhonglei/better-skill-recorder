"""Read-only browser checks for the static project website; requires Playwright."""
import sys
from playwright.sync_api import sync_playwright

base = sys.argv[1].rstrip('/') if len(sys.argv) > 1 else 'http://127.0.0.1:8765'
with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    context = browser.new_context(permissions=['clipboard-read', 'clipboard-write'])
    page = context.new_page()
    errors = []
    page.on('pageerror', lambda e: errors.append(str(e)))
    for filename, lang in [('index.html', 'zh-CN'), ('en.html', 'en')]:
        for width in [1440, 768, 390, 320]:
            page.set_viewport_size({'width': width, 'height': 960})
            page.goto(f'{base}/{filename}', wait_until='networkidle')
            assert page.locator('html').get_attribute('lang') == lang
            assert page.evaluate('document.documentElement.scrollWidth <= innerWidth'), (filename, width)
            assert page.locator('h1').count() == 1
            assert page.locator('.notice').count() == 0
            assert page.locator('footer a[href="https://github.com/microsoft/skill-recorder"]').count() == 1
            page.locator('summary').first.click()
            assert page.locator('details').first.get_attribute('open') is not None
            page.locator('summary').first.click()
            expected = page.locator('#agent-prompt').input_value()
            assert '9df19fc7234abd7a3c677855e932ed3fb7fc0516fd49388fadb849d2abb2ee15' in expected
            assert '/releases/download/preview-v0.1.0/' in expected
            page.locator('#copy-prompt').click()
            page.wait_for_function("document.querySelector('#copy-status').textContent === document.querySelector('#copy-prompt').dataset.copied")
            assert page.evaluate('navigator.clipboard.readText()') == expected
            page.evaluate('window.scrollTo(0,0)')
            page.screenshot(path=f'/tmp/website-{lang}-{width}.png', full_page=True)
            print(f'PASS {lang} {width}px: layout, FAQ, copy, pinned download')
        page.goto(f'{base}/{filename}#agent-install', wait_until='networkidle')
        page.locator('.language').click()
        page.wait_for_load_state('networkidle')
        assert page.url.endswith('#agent-install')
        assert page.locator('html').get_attribute('lang') != lang
    page.evaluate("Object.defineProperty(navigator, 'clipboard', {value:{writeText:async()=>{throw Error('blocked')}}})")
    page.locator('#copy-prompt').click()
    page.wait_for_function("document.querySelector('#copy-status').textContent === document.querySelector('#copy-prompt').dataset.error")
    assert page.locator('#agent-prompt').evaluate('(e)=>e.selectionEnd-e.selectionStart===e.value.length')
    page.goto(base, wait_until='networkidle')
    page.keyboard.press('Tab')
    assert page.locator('.skip').evaluate('(e)=>e===document.activeElement')
    for filename in ['index.html', 'en.html']:
        page = context.new_page()
        page.clock.install()
        page.goto(f'{base}/{filename}', wait_until='networkidle')
        page.mouse.move(0, 0)
        page.clock.run_for(2600)
        assert page.locator('.hero-carousel').get_attribute('data-active') == '1'
        page.locator('.hero-carousel').hover()
        page.clock.run_for(6000)
        assert page.locator('.hero-carousel').get_attribute('data-active') == '1'
        page.mouse.move(0, 0)
        page.clock.run_for(2600)
        assert page.locator('.hero-carousel').get_attribute('data-active') == '0'
        page.locator('.carousel-toggle').click()
        page.mouse.move(0, 0)
        page.locator('.carousel-toggle').evaluate('(el)=>el.blur()')
        page.clock.run_for(6000)
        assert page.locator('.hero-carousel').get_attribute('data-active') == '0'
        page.locator('[data-go="1"]').click()
        assert page.locator('[data-slide="0"]').get_attribute('inert') is not None
        print(f'PASS {filename}: carousel timing, hover pause/resume, manual controls')
    reduced = browser.new_page(reduced_motion='reduce')
    reduced.goto(base, wait_until='networkidle')
    reduced.clock.install()
    reduced.clock.run_for(6000)
    assert reduced.locator('.hero-carousel').get_attribute('data-active') == '0'
    assert not errors, errors
    browser.close()
print('PASS language round-trip, anchor preservation, clipboard fallback and keyboard entry')
