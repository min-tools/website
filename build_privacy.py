#!/usr/bin/env python3
"""Render each app's PRIVACY.md into <app>/privacy/index.html.

The app's root policy is the source for the website; rerun this script after
policy changes to update the page. With no arguments every app is rendered
from its sibling checkout (../<app>/<app>-macos/PRIVACY.md). Name an app to
render only it, and add a path to read the policy from somewhere else:

    python3 build_privacy.py
    python3 build_privacy.py netmin
    python3 build_privacy.py langmin ../langmin/langmin-macos/PRIVACY.md
"""

import html
import re
import sys
from pathlib import Path

SITE = Path(__file__).resolve().parent

# Per-app metadata used in the generated page and its navigation.
PRODUCTS = {
    "langmin": {
        "name": "Langmin",
        "repo": "https://github.com/min-tools/langmin-macos",
        "description": "What Langmin handles on your Mac, what goes to the AI provider you choose, and the controls you have.",
    },
    "pastemin": {
        "name": "Pastemin",
        "repo": "https://github.com/min-tools/pastemin-macos",
        "description": "What Pastemin stores on your Mac, what never leaves it, and the controls you have.",
    },
    "netmin": {
        "name": "Netmin",
        "repo": "https://github.com/min-tools/netmin-macos",
        "description": "What Netmin keeps on your Mac, which services a check contacts, and the controls you have.",
    },
}

# The header goes through str.format with the product metadata, so literal
# braces in its embedded script must be doubled.
HEADER = """<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Privacy Policy · {name}</title>
<link rel="canonical" href="https://min.tools/{slug}/privacy/">
<meta name="description" content="{description}">
<link rel="icon" href="../../favicon.ico" sizes="32x32">
<link rel="icon" href="../../favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="../../apple-touch-icon.png">
<link rel="manifest" href="../../site.webmanifest">
<link rel="stylesheet" href="../../style.css">
<script>
// When framed in the landing-page dialog, hide the standalone page chrome.
// Direct disk previews use this frame because fetching local files is restricted.
if (window.self !== window.top) {{
  document.documentElement.classList.add("embed");
  // report(): send the body height so the parent can size the frame to its content.
  var report = function () {{ window.parent.postMessage({{ height: Math.ceil(document.body.getBoundingClientRect().height) }}, "*"); }};
  window.addEventListener("load", report);
  window.addEventListener("resize", report);
  // Click handler(event): route document links through the parent dialog.
  document.addEventListener("click", function (event) {{
    var link = event.target.closest("a[href]");
    // Leave clicks outside links alone.
    if (!link) {{ return; }}
    var doc = /(^|[/])(support|privacy|terms)[/]index[.]html$/.exec(link.getAttribute("href"));
    // Ask the parent to load a sibling document and update its dialog header.
    if (doc) {{ event.preventDefault(); window.parent.postMessage({{ doc: doc[2] }}, "*"); }} else {{
      // Other destinations should open outside the small document frame.
      link.target = "_top";
    }}
  }});
}}
</script>
</head>
<body>
<header class="site">
  <a class="brand" href="../index.html"><img src="../icon-128.png" alt="" width="128" height="128">{name}</a>
  <nav><a href="../support/index.html">Support</a><a href="../privacy/index.html">Privacy</a><a href="../terms/index.html">Terms</a><a href="{repo}">GitHub</a></nav>
</header>
<main class="doc">
"""

FOOTER = """</main>
<footer class="site">
  <a href="https://github.com/iliaross">© 2026 Ilia Ross</a>
</footer>
</body>
</html>
"""


def inline(text):
    """inline(text): render supported inline markup from trusted policy text.

    Supports links, bold, code, and bare email addresses, not arbitrary Markdown.
    """
    # Escape text before introducing the supported HTML elements.
    text = html.escape(text, quote=False)
    text = re.sub(r"\[([^\]]+)\]\(([^)]+)\)", r'<a href="\2">\1</a>', text)
    text = re.sub(r"\*\*([^*]+)\*\*", r"<strong>\1</strong>", text)
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    # Preserve complete links and tags so email labels do not become nested links.
    text = re.sub(
        r'(<a\b[^>]*>.*?</a>|<[^>]*>)|(?<![\w/@])([\w.+-]+@[\w-]+(?:\.[\w-]+)+)(?![\w\"])',
        # Replacement callback(match): keep existing HTML or link a bare address.
        lambda match: match[1] or f'<a href="mailto:{match[2]}">{match[2]}</a>',
        text,
    )
    return text


def render(markdown):
    """render(markdown): render the block syntax used in the app policies.

    Supports three heading levels, paragraphs, dash lists, and a muted date line.
    """
    out, paragraph, items = [], [], []

    def flush():
        """flush(): closes the paragraph or list being collected, if any."""
        nonlocal paragraph, items
        # Join wrapped paragraph lines before applying inline markup.
        if paragraph:
            out.append("<p>" + inline(" ".join(paragraph)) + "</p>")
            paragraph = []
        # Emit all collected list items as one list.
        if items:
            out.append("<ul>" + "".join("<li>" + inline(i) + "</li>" for i in items) + "</ul>")
            items = []

    for line in markdown.splitlines():
        stripped = line.strip()
        # A blank line ends whatever is being collected.
        if not stripped:
            flush(); continue
        # A top-level heading names the policy.
        if stripped.startswith("# "):
            flush(); out.append("<h1>" + inline(stripped[2:]) + "</h1>")
        # Second-level headings separate policy sections.
        elif stripped.startswith("## "):
            flush(); out.append("<h2>" + inline(stripped[3:]) + "</h2>")
        # Third-level headings group details within a section.
        elif stripped.startswith("### "):
            flush(); out.append("<h3>" + inline(stripped[4:]) + "</h3>")
        # A list item ends a paragraph and joins the current list.
        elif stripped.startswith("- "):
            # Finish preceding prose before starting the list.
            if paragraph: flush()
            items.append(stripped[2:])
        # The date line is its own muted paragraph.
        elif stripped.lower().startswith("effective and last updated"):
            flush(); out.append('<p class="meta">' + inline(stripped) + "</p>")
        # Anything else ends a list and continues the paragraph.
        else:
            # Close a preceding list before collecting prose again.
            if items: flush()
            paragraph.append(stripped)
    # The final block does not require a trailing blank line.
    flush()
    return "\n".join(out)


def page(slug, markdown):
    """page(slug, markdown): wrap policy Markdown for the given PRODUCTS key."""
    product = dict(PRODUCTS[slug], slug=slug)
    return HEADER.format(**product) + render(markdown) + "\n" + FOOTER


def default_source(slug):
    """default_source(slug): locate the root policy in the app's sibling checkout."""
    return SITE.parent / slug / f"{slug}-macos" / "PRIVACY.md"


# Generate only when invoked directly, so validation can reuse the renderer without writes.
if __name__ == "__main__":
    # With no arguments render every app; otherwise only the named one, from an optional path.
    slugs = sys.argv[1:2] if len(sys.argv) > 1 else list(PRODUCTS)
    # Reject unknown apps before reading a policy or creating a destination.
    if slugs[0] not in PRODUCTS:
        sys.exit(f"unknown app {slugs[0]!r}; expected one of {', '.join(PRODUCTS)}")
    for slug in slugs:
        # An explicit source overrides the sibling checkout for the chosen app.
        source = Path(sys.argv[2]) if len(sys.argv) > 2 else default_source(slug)
        target = SITE / slug / "privacy" / "index.html"
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(page(slug, source.read_text(encoding="utf-8")), encoding="utf-8")
        print(f"wrote {target} from {source}")
