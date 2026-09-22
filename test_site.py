#!/usr/bin/env python3
"""Validate the static site as deployed at https://min.tools/, without a web server."""
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import unquote, urlsplit
import unittest
import xml.etree.ElementTree as ET
from build_privacy import PRODUCTS, default_source, inline, page

ROOT = Path(__file__).resolve().parent
BASE = 'https://min.tools/'


class Page(HTMLParser):
    """Page(path): collect metadata and link errors without external requests."""

    def __init__(self, path):
        """__init__(path): read one page and collect its metadata and link errors."""
        super().__init__()
        # Keep parse results separate from the current anchor/title state.
        self.links, self.ids, self.canonical, self.title = [], set(), None, None
        self.duplicate_ids, self.nested_links = [], []
        self._in_link = False
        self._in_title = False
        self.feed(path.read_text())

    def handle_starttag(self, tag, attributes):
        """handle_starttag(tag, attributes): records ids, href and src links, and the canonical link."""
        attrs = dict(attributes)
        # Duplicate ids make fragments and scripted controls ambiguous.
        if 'id' in attrs:
            # Record repeats while retaining the unique IDs for fragment checks.
            if attrs['id'] in self.ids:
                self.duplicate_ids.append(attrs['id'])
            self.ids.add(attrs['id'])
        # A link cannot contain another link; browsers split malformed anchors.
        if tag == 'a':
            # An unclosed anchor would be split by a browser's HTML parser.
            if self._in_link:
                self.nested_links.append(self.getpos())
            self._in_link = True
        # Record both navigation and asset references.
        for name in ('href', 'src'):
            # Tags without this reference attribute contribute no link.
            if name in attrs:
                self.links.append(attrs[name])
        # Keep the declared public URL for comparison with the file's path.
        if tag == 'link' and attrs.get('rel') == 'canonical':
            self.canonical = attrs.get('href')
        self._in_title = tag == 'title'

    def handle_endtag(self, tag):
        """handle_endtag(tag): stop collecting text or links at their closing tag."""
        # Text after the title must not become part of the page name.
        if tag == 'title':
            self._in_title = False
        # The next anchor can start independently after this one closes.
        elif tag == 'a':
            self._in_link = False

    def handle_data(self, data):
        """handle_data(data): collects the title's text while inside the title element."""
        # Ignore body text and script contents when collecting the title.
        if self._in_title:
            self.title = (self.title or '') + data


def pages():
    """pages(): every HTML file in the site, in a stable order."""
    return sorted(ROOT.rglob('*.html'))


class SiteTests(unittest.TestCase):
    """Checks pages and assets without deploying or changing DNS."""

    def test_every_page_has_a_title_and_canonical(self):
        """test_every_page_has_a_title_and_canonical(): check page identity."""
        for file in pages():
            page_ = Page(file)
            relative = file.relative_to(ROOT).as_posix().removesuffix('index.html')
            self.assertEqual(page_.canonical, BASE + relative, str(file))
            self.assertTrue(page_.title and page_.title.strip(), str(file))

    def test_ids_and_links_are_unambiguous(self):
        """test_ids_and_links_are_unambiguous(): reject duplicate IDs and nested links."""
        for file in pages():
            parsed = Page(file)
            self.assertFalse(parsed.duplicate_ids, f'{file}: {parsed.duplicate_ids}')
            self.assertFalse(parsed.nested_links, f'{file}: {parsed.nested_links}')

    def test_local_links_resolve(self):
        """test_local_links_resolve(): check local files and fragments for disk previews."""
        for file in pages():
            for link in Page(file).links:
                url = urlsplit(link)
                # Absolute links back to this site must resolve in the checkout too.
                internal = url.scheme == 'https' and url.netloc == 'min.tools'
                # External URLs are outside this static checkout check.
                if (url.scheme or url.netloc) and not internal:
                    continue
                path = unquote(url.path)
                # Map this site's public URLs back to the checkout root.
                if internal:
                    target = ROOT / path.lstrip('/')
                else:
                    # Relative links keep disk previews usable.
                    self.assertFalse(path.startswith('/'), f'{file}: {link}')
                    target = file.parent / path if path else file
                # Static hosting resolves directory links through index.html.
                if target.is_dir():
                    target /= 'index.html'
                self.assertTrue(target.is_file(), f'{file}: {link}')
                # A fragment must name an id on the target page.
                if url.fragment and target.suffix == '.html':
                    self.assertIn(unquote(url.fragment), Page(target).ids, f'{file}: {link}')

    def test_every_app_has_its_pages(self):
        """test_every_app_has_its_pages(): check each app's pages and icons exist."""
        for slug in PRODUCTS:
            for name in ('index.html', 'support/index.html', 'privacy/index.html', 'terms/index.html', 'contribute/index.html',
                         'icon.png', 'icon-128.png'):
                self.assertTrue((ROOT / slug / name).is_file(), f'{slug}/{name}')

    def test_sitemap_lists_every_page_once(self):
        """test_sitemap_lists_every_page_once(): check page coverage and domain settings."""
        # Every HTML page must appear once at its canonical directory URL.
        entries = [e.text for e in ET.parse(ROOT / 'sitemap.xml').findall('.//{*}loc')]
        expected = {BASE + f.relative_to(ROOT).as_posix().removesuffix('index.html') for f in pages()}
        self.assertEqual(set(entries), expected)
        self.assertEqual(len(entries), len(expected))
        # Hosting and crawler configuration must use the same domain.
        self.assertEqual((ROOT / 'CNAME').read_text().strip(), 'min.tools')
        self.assertIn('Sitemap: https://min.tools/sitemap.xml', (ROOT / 'robots.txt').read_text())

    def test_privacy_pages_match_the_apps(self):
        """test_privacy_pages_match_the_apps(): compare pages with current app policies."""
        for slug in PRODUCTS:
            # Report every app's result even if another policy is missing or stale.
            with self.subTest(app=slug):
                source = default_source(slug)
                # A standalone website checkout cannot verify an absent policy.
                if not source.exists():
                    self.skipTest(f'Sibling {slug} checkout required to compare the policy')
                self.assertEqual((ROOT / slug / 'privacy/index.html').read_text(), page(slug, source.read_text()), slug)

    def test_email_links_are_not_nested(self):
        """test_email_links_are_not_nested(): check bare and explicitly linked addresses."""
        address = 'privacy@example.com'
        linked = f'<a href="mailto:{address}">{address}</a>'
        self.assertEqual(inline(address), linked)
        self.assertEqual(inline(f'[{address}](mailto:{address})'), linked)
        self.assertEqual(inline(f'[Email us](mailto:{address})'),
                         f'<a href="mailto:{address}">Email us</a>')


# Run the suite only when invoked directly; imports can reuse the page parser.
if __name__ == '__main__':
    unittest.main()
