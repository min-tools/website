#!/usr/bin/env python3
"""Exercise the website in Chromium on the disposable test VM."""
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
import tempfile
from threading import Thread
import unittest

from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.support.ui import WebDriverWait

ROOT = Path(__file__).resolve().parent
SHOTS = Path(tempfile.mkdtemp(prefix='min-website-browser-', dir='/tmp'))
PRICES = {'langmin': ('19.99', '79.99'), 'netmin': ('14.99', '59.99'), 'pastemin': ('9.99', '39.99')}


class Handler(SimpleHTTPRequestHandler):
    """Serve the fixture and optionally fail only document fetch requests."""
    fail_fetch = False

    def log_message(self, format, *args):
        """log_message(format, *args): keep routine HTTP logs out of test output."""

    def do_GET(self):
        """do_GET(): inject an HTTP failure without breaking the fallback link."""
        # Fail fetches only; a normal navigation must still reach the document.
        if self.fail_fetch and self.headers.get('Sec-Fetch-Dest') == 'empty':
            self.send_error(503)
        else:
            # Serve the actual website for all other requests.
            super().do_GET()

    def end_headers(self):
        """end_headers(): keep previous test responses out of the HTTP cache."""
        self.send_header('Cache-Control', 'no-store')
        super().end_headers()


class BrowserChecks(unittest.TestCase):
    """Check rendered layout and real document/navigation interactions."""

    @classmethod
    def setUpClass(cls):
        """setUpClass(): start an isolated local server and headless browser."""
        cls.server = ThreadingHTTPServer(('127.0.0.1', 0), partial(Handler, directory=str(ROOT)))
        Thread(target=cls.server.serve_forever, daemon=True).start()
        cls.base = f'http://127.0.0.1:{cls.server.server_port}/'
        options = webdriver.ChromeOptions()
        options.binary_location = '/usr/bin/chromium'
        for argument in ('--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--disable-background-networking'):
            options.add_argument(argument)
        options.set_capability('goog:loggingPrefs', {'browser': 'ALL'})
        cls.browser = webdriver.Chrome(service=Service('/usr/bin/chromedriver'), options=options)
        cls.browser.set_page_load_timeout(20)
        cls.wait = WebDriverWait(cls.browser, 8)
        print(f'Browser screenshots: {SHOTS}', flush=True)

    @classmethod
    def tearDownClass(cls):
        """tearDownClass(): close the test browser and HTTP listener."""
        cls.browser.quit()
        cls.server.shutdown()
        cls.server.server_close()

    def media(self, width=1440, color='light', motion='reduce'):
        """media([width=1440], [color=light], [motion=reduce]): set viewport preferences."""
        self.browser.execute_cdp_cmd('Emulation.setDeviceMetricsOverride', {
            'width': width, 'height': 1000, 'deviceScaleFactor': 1, 'mobile': False})
        self.browser.execute_cdp_cmd('Emulation.setEmulatedMedia', {'features': [
            {'name': 'prefers-color-scheme', 'value': color},
            {'name': 'prefers-reduced-motion', 'value': motion}]})

    def visit(self, path):
        """visit(path): load a fixture and discard previous page logs."""
        self.browser.get_log('browser')
        self.browser.get(self.base + path)

    def click(self, selector):
        """click(selector): place the link in view and use a real browser click."""
        element = self.browser.find_element(By.CSS_SELECTOR, selector)
        self.browser.execute_script('arguments[0].scrollIntoView({block:"center",behavior:"instant"})', element)
        element.click()

    def assert_clean_console(self):
        """assert_clean_console(): reject page errors, including failed assets."""
        errors = [entry['message'] for entry in self.browser.get_log('browser') if entry['level'] == 'SEVERE']
        self.assertEqual(errors, [])

    def test_layout_prices_and_footers(self):
        """test_layout_prices_and_footers(): inspect all pages at phone and desktop widths."""
        paths = sorted(str(path.relative_to(ROOT)) for path in ROOT.rglob('*.html'))
        for color in ('light', 'dark'):
            for width in (320, 375, 768, 1440):
                self.media(width, color)
                for path in paths:
                    with self.subTest(page=path, color=color, width=width):
                        self.visit(path + '#main-content')
                        metrics = self.browser.execute_script('''
                          const footer = document.querySelector('footer.site');
                          const link = footer.querySelector('a');
                          const rect = link.getBoundingClientRect();
                          window.scrollTo({left: 10000, top: scrollY, behavior: 'instant'});
                          return {width: document.documentElement.clientWidth, scroll: scrollX,
                            footerText: footer.innerText.trim(), links: footer.querySelectorAll('a').length,
                            href: link.href, center: rect.x + rect.width / 2,
                            broken: Array.from(document.images).filter(i => i.complete && !i.naturalWidth).map(i => i.src)};
                        ''')
                        # Preserve the failed layout before reporting overflow.
                        if metrics['scroll'] > 0:
                            self.browser.save_screenshot(str(SHOTS / (path.replace('/', '-') + f'-{width}-{color}.png')))
                        self.assertEqual(metrics['scroll'], 0, metrics)
                        self.assertEqual(metrics['footerText'], '© 2026 Ilia Ross')
                        self.assertEqual(metrics['links'], 1)
                        self.assertEqual(metrics['href'], 'https://github.com/iliaross')
                        self.assertAlmostEqual(metrics['center'], metrics['width'] / 2, delta=2)
                        self.assertEqual(metrics['broken'], [])
                        # Check the agreed prices and hash navigation on app pages.
                        if path in [app + '/index.html' for app in PRICES]:
                            app = path.split('/')[0]
                            self.click('header nav a[href="#support"]')
                            self.assertFalse(self.browser.find_element(By.CSS_SELECTOR, 'dialog').get_attribute('open'))
                            self.assertTrue(self.browser.current_url.endswith('#support'))
                            # Let the menu's queued jump finish before framing Pro.
                            self.browser.execute_async_script('const done = arguments[0]; requestAnimationFrame(() => requestAnimationFrame(done));')
                            self.browser.execute_script('document.querySelector("#pro").scrollIntoView({behavior:"instant"})')
                            text = self.browser.find_element(By.ID, 'pro').text
                            for amount in PRICES[app]:
                                self.assertIn('$' + amount, text)
                            self.browser.save_screenshot(str(SHOTS / f'{app}-pro-{width}-{color}.png'))
                        self.assert_clean_console()

    def test_document_dialogs_and_links(self):
        """test_document_dialogs_and_links(): follow nested links and restore page scrolling."""
        self.media()
        for app in PRICES:
            with self.subTest(app=app):
                self.visit(app + '/#support')
                self.click('a[data-doc="support/index.html"]')
                self.wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'dialog[open] .doc-scroll h2')) > 0)
                links = self.browser.find_elements(By.CSS_SELECTOR, '.doc-scroll a')
                privacy = next(link for link in links if link.get_attribute('href') == self.base + app + '/privacy/index.html')
                self.browser.execute_script('arguments[0].scrollIntoView({block:"center",behavior:"instant"})', privacy)
                privacy.click()
                self.wait.until(lambda d: d.find_element(By.ID, 'doc-dialog-title').text == 'Privacy policy')
                self.wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.doc-scroll h2')) > 0)
                self.assertTrue(self.browser.find_element(By.TAG_NAME, 'html').get_attribute('class').find('dialog-open') >= 0)
                self.browser.find_element(By.CSS_SELECTOR, '.doc-close').send_keys(Keys.ESCAPE)
                self.wait.until(lambda d: not d.find_element(By.CSS_SELECTOR, 'dialog').get_attribute('open'))
                self.assertNotIn('dialog-open', self.browser.find_element(By.TAG_NAME, 'html').get_attribute('class'))
                self.assert_clean_console()

    def test_failed_fetch_fallback(self):
        """test_failed_fetch_fallback(): let a normal page load recover from a failed fetch."""
        self.media()
        self.visit('langmin/#support')
        Handler.fail_fetch = True
        try:
            self.click('a[data-doc="support/index.html"]')
            self.wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, '.doc-fallback a')) > 0)
            self.click('.doc-fallback a')
            self.wait.until(lambda d: d.current_url.endswith('/langmin/support/index.html'))
            self.assertEqual(self.browser.find_element(By.CSS_SELECTOR, 'main h1').text, 'Support')
        finally:
            Handler.fail_fetch = False

    def test_file_preview(self):
        """test_file_preview(): open a local-file dialog and follow its sibling link."""
        self.media()
        self.browser.get((ROOT / 'pastemin/index.html').as_uri())
        self.click('a[data-doc="support/index.html"]')
        self.wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'dialog iframe')) > 0)
        self.browser.switch_to.frame(self.browser.find_element(By.CSS_SELECTOR, 'dialog iframe'))
        self.wait.until(lambda d: len(d.find_elements(By.CSS_SELECTOR, 'main h1')) > 0)
        self.click('main a[href="../privacy/index.html"]')
        self.browser.switch_to.default_content()
        self.wait.until(lambda d: d.find_element(By.ID, 'doc-dialog-title').text == 'Privacy policy')
        self.assertIn('/privacy/', self.browser.find_element(By.CSS_SELECTOR, 'dialog iframe').get_attribute('src'))

    def test_live_demos(self):
        """test_live_demos(): let each animated hero advance without JavaScript errors."""
        self.media(motion='no-preference')
        for app, selector in (('langmin', '[data-hero]'), ('pastemin', '[data-pm]'), ('netmin', '[data-nm]')):
            with self.subTest(app=app):
                self.visit(app + '/')
                before = self.browser.find_element(By.CSS_SELECTOR, selector).get_attribute('innerHTML')
                self.wait.until(lambda d: d.find_element(By.CSS_SELECTOR, selector).get_attribute('innerHTML') != before)
                self.assert_clean_console()

    def test_mode_tabs_keyboard(self):
        """test_mode_tabs_keyboard(): move between examples with the arrow keys."""
        self.media()
        self.visit('langmin/#features')
        self.click('[role="tab"]')
        tabs = self.browser.find_elements(By.CSS_SELECTOR, '[role="tab"]')
        self.assertEqual(len(tabs), 6)
        tabs[0].send_keys(Keys.ARROW_RIGHT)
        self.assertEqual(tabs[1].get_attribute('aria-selected'), 'true')
        panel = self.browser.find_element(By.ID, tabs[1].get_attribute('aria-controls'))
        self.assertTrue(panel.is_displayed())
        tabs[1].send_keys(Keys.ARROW_LEFT)
        self.assertEqual(tabs[0].get_attribute('aria-selected'), 'true')
        self.assert_clean_console()

    def test_without_javascript(self):
        """test_without_javascript(): keep content and document links usable without scripts."""
        self.media()
        self.browser.execute_cdp_cmd('Emulation.setScriptExecutionDisabled', {'value': True})
        try:
            for app in PRICES:
                with self.subTest(app=app):
                    self.visit(app + '/#pro')
                    self.assertTrue(self.browser.find_element(By.ID, 'pro').is_displayed())
                    self.click('a[data-doc="support/index.html"]')
                    self.wait.until(lambda d: d.current_url.endswith('/' + app + '/support/index.html'))
                    self.assertEqual(self.browser.find_element(By.CSS_SELECTOR, 'main h1').text, 'Support')
        finally:
            self.browser.execute_cdp_cmd('Emulation.setScriptExecutionDisabled', {'value': False})


if __name__ == '__main__':
    unittest.main(verbosity=2)
