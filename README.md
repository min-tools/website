# Min Tools website

Static website for [min.tools](https://min.tools/), with a home page and pages for each app.

## Layout

| Path | Contents |
| --- | --- |
| `index.html`, `home.css` | The home page: apps, source code, privacy, and contributions. |
| `langmin/`, `pastemin/`, `netmin/` | Each app's landing page, icons, and `support/`, `privacy/`, `terms/`, and `contribute/` pages. Pastemin and Netmin have additional stylesheets and demo scripts. |
| `landing.css`, `landing.js` | Shared landing-page styles, navigation, demos, and document dialogs. The app demo scripts use helpers exposed as `window.MinTools`. |
| `style.css` | Shared document styles for the support, privacy, terms, and contribute pages, with light and dark appearances. |
| `build_privacy.py` | Renders each app's `PRIVACY.md` into its privacy page. |
| `test_site.py` | Checks links and fragments, titles and canonical URLs, each app's pages and icons, the sitemap, and the generated privacy pages. |
| `test_landing.js` | Tests document dialogs and menu navigation with DOM stubs. |
| `test_browser.py` | Checks layouts, prices, footers, dialogs, demos, and keyboard navigation in Chromium. |
| `CNAME`, `robots.txt`, `sitemap.xml`, `.nojekyll` | GitHub Pages and search-engine files. |
| `brand/`, `logo-wide*.svg`, `favicon.*`, `apple-touch-icon.png`, `icon*.png`, `site.webmanifest` | Min Tools logos and site icons. |

Navigation and asset links use relative paths so the site can be previewed from disk or served over HTTP. The app previews use HTML and CSS and follow the system's light or dark appearance. Their shared colors are defined by the `--win-*` variables at the top of `landing.css`.

The apps link to these pages: `https://min.tools/<app>/`, `/<app>/support/`, `/<app>/privacy/`, and, for Langmin, `/langmin/terms/` and `/langmin/contribute/`. Keep those paths stable.

## Privacy policies

Each app's `PRIVACY.md` is the source of truth. With the app checkouts beside this folder (`../langmin/langmin-macos`, `../pastemin/pastemin-macos`, `../netmin/netmin-macos`), regenerate every privacy page with:

```bash
python3 build_privacy.py
```

Pass an app name to regenerate only its page. An optional second argument selects a different source file:

```bash
python3 build_privacy.py netmin ../netmin/netmin-macos/PRIVACY.md
```

Review the generated page before publishing.

## Icons and logo

Every page uses the Min Tools favicon. The root contains `favicon.ico` at 16, 32, and 48 pixels, a vector `favicon.svg`, and a 180-pixel `apple-touch-icon.png`. The web manifest references `icon-192.png` and the 512-pixel `icon.png`; `icon-128.png` is the smaller site icon.

Each app folder has its own 512-pixel `icon.png` and `icon-128.png` for app branding and social previews. These website copies are cropped and placed on a solid blue background; the app repositories' icons are unchanged.

`brand/` contains the Min Tools icon, mark, and wide and square logos in SVG and PNG formats. The logos also have dark variants. The root icons are downscaled from `brand/mintools-icon-square.png`.

`logo-wide.svg` and `logo-wide-dark.svg` have transparent backgrounds and no metadata. The home-page header switches between them to suit its background. `logo-wide-white.svg` appears in the blue GitHub buttons.

## Preview and check

Open `index.html` for a disk preview, or run `python3 -m http.server` in this folder and visit `http://localhost:8000/`. Document dialogs use iframes in disk previews and fetch the pages over HTTP.

Run `python3 test_site.py` to check local links, fragments, page metadata, required app files, and site configuration. Privacy comparisons require the sibling app checkouts; missing policies are reported as skipped tests.

Run `node --test test_landing.js` to check document dialogs and interrupted menu scrolling. These tests use DOM stubs; check layout and browser interactions in the HTTP preview too.

For browser checks, use a disposable Debian VM with Chromium, `chromium-driver`, and `python3-selenium` installed. Run `python3 test_browser.py` from the copied website. The suite starts its own temporary HTTP server, checks phone and desktop widths in light and dark mode, and saves screenshots in the temporary directory printed at startup. It also checks document dialogs, failed requests, disk previews, keyboard tabs, and navigation without JavaScript.

## Publish

GitHub Pages serves this repository at `min.tools` (see `CNAME`). App support and bug reports go to the app repositories: [langmin-macos](https://github.com/min-tools/langmin-macos), [pastemin-macos](https://github.com/min-tools/pastemin-macos), and [netmin-macos](https://github.com/min-tools/netmin-macos).
