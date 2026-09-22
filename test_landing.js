// Exercise document loading and menu jump cancellation with a minimal DOM stub.
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { test } = require("node:test");
const { runInNewContext } = require("node:vm");

const script = readFileSync(`${__dirname}/landing.js`, "utf8");

// element([selectors={}]): create a DOM stub with selector results and event hooks.
const element = (selectors = {}) => ({
  innerHTML: "",
  textContent: "",
  listeners: {},
  attributes: {},
  // add(), remove(), toggle(): accept class changes without modelling CSS.
  classList: { add() {}, remove() {}, toggle() {} },
  // querySelector(selector): return a configured node, or null for a missing one.
  querySelector(selector) { return selectors[selector] ?? null; },
  // querySelectorAll(): default to no matches, ignoring the requested selector.
  querySelectorAll() { return []; },
  // setAttribute(name, value): retain attributes for script behavior and assertions.
  setAttribute(name, value) { this.attributes[name] = value; },
  // getAttribute(name): return a stored attribute value.
  getAttribute(name) { return this.attributes[name]; },
  // hasAttribute(name): distinguish present attributes from absent ones.
  hasAttribute(name) { return name in this.attributes; },
  // addEventListener(name, handler): retain callbacks for explicit test dispatch.
  addEventListener(name, handler) { (this.listeners[name] ??= []).push(handler); },
  // removeEventListener(name, handler): detach a previously registered callback.
  // Filter callback(item): retain handlers other than the one being detached.
  removeEventListener(name, handler) { this.listeners[name] = this.listeners[name].filter((item) => item !== handler); },
  // remove(): accept removal of the parsed heading without maintaining a DOM tree.
  remove() {},
});

// harness([fail=false], [menu=false]): load the real script against page fixtures.
// fail simulates HTTP 503; menu adds a header link and a measurable scroll target.
const harness = (fail = false, menu = false) => {
  const base = "https://min.tools/langmin/";
  const body = element();
  const head = element({ ".badge": element(), b: element(), ".t > span": element() });
  const dialog = element({ ".doc-head": head, ".doc-scroll": body, ".doc-close": element() });
  // showModal(): record opening so tests can check interception of document links.
  dialog.showModal = () => { dialog.open = true; };
  // Card factory(name): provide the metadata consumed by describe() in landing.js.
  const cards = ["support", "privacy", "terms"].map((name) => {
    const card = element({ b: { textContent: name }, ".t > span": element(), ".badge": element() });
    card.dataset = { doc: `${name}/index.html` };
    return card;
  });
  // Supply the page APIs needed to create a dialog and find its document cards.
  const document = element();
  document.documentElement = element();
  document.documentElement.scrollHeight = 2400;
  // append(): accept the dialog without modelling its parent/child relationship.
  document.body = { append() {} };
  // createElement(): return the dialog fixture, ignoring the requested tag.
  document.createElement = () => dialog;
  // querySelectorAll(selector): expose document cards and no reveal/demo nodes.
  document.querySelectorAll = (selector) => selector === "a[data-doc]" ? cards : [];
  // Model scroll position synchronously; tests dispatch completion events later.
  const window = element();
  window.HTMLDialogElement = class {};
  window.scrollY = 0;
  window.innerHeight = 800;
  window.onscrollend = null;
  const scrolls = [];
  // scrollTo({top}): record the request and update the fixture's viewport position.
  window.scrollTo = ({ top }) => { scrolls.push(top); window.scrollY = top; };
  // The menu target sits at page coordinate 1000 with a 92-pixel scroll margin.
  const menuLink = element();
  menuLink.hash = "#features";
  const target = element();
  target.dataset = {};
  // getBoundingClientRect(): convert the fixed page position to viewport position.
  target.getBoundingClientRect = () => ({ top: 1000 - window.scrollY });
  const header = element();
  // querySelectorAll(): expose the sole menu link, ignoring the selector.
  header.querySelectorAll = () => [menuLink];
  // getElementById(): return the sole target, ignoring the requested ID.
  document.getElementById = () => target;
  // querySelector(selector): enable the header fixture only for menu tests.
  document.querySelector = (selector) => menu && selector === "header.site" ? header : null;
  const requests = [];
  const resolvedLinks = [];

  // Model the parsed document body while keeping URL resolution in the real script.
  class DOMParser {
    // parseFromString(): ignore the input and return a fixed Support page body.
    parseFromString() {
      const link = element();
      link.setAttribute("href", "../privacy/index.html");
      const main = element({ h1: element() });
      // querySelectorAll(): expose the body link that fetchDoc() must resolve.
      main.querySelectorAll = () => [link];
      Object.defineProperty(main, "innerHTML", {
        // get(): capture the rewritten URL when the real script reads the markup.
        get() {
          resolvedLinks.push(link.getAttribute("href"));
          return `<a href="${link.getAttribute("href")}">Privacy</a>`;
        },
      });
      return element({ "main.doc": main });
    }
  }

  // Run the unchanged landing script with predictable timing and HTTP responses.
  runInNewContext(script, {
    document, window, DOMParser, URL, setTimeout, clearTimeout,
    location: new URL(base),
    // pushState(): accept history updates; tests dispatch navigation separately.
    history: { pushState() {} },
    // requestAnimationFrame(callback): run a queued frame on the next event turn.
    requestAnimationFrame: (callback) => setImmediate(callback),
    // getComputedStyle(): return the target margin, ignoring the requested element.
    getComputedStyle: () => ({ scrollMarginTop: "92px" }),
    // matchMedia(): force reduced motion so automatic demos do not run in tests.
    matchMedia: () => ({ matches: true }),
    // fetch(url): record the request and expose the URL used to resolve body links.
    fetch: async (url) => {
      requests.push(url);
      // text(): return empty HTML because the parser fixture supplies the body.
      return { ok: !fail, status: fail ? 503 : 200, url: new URL(url, base).href, text: async () => "" };
    },
  });

  // click(path, [options={}]): dispatch a link click and finish pending fetch work.
  // Options override event fields; target and fallback also configure the link.
  const click = async (path, options = {}) => {
    const link = element();
    const url = new URL(path, base);
    Object.assign(link, { origin: url.origin, pathname: url.pathname, target: options.target ?? "" });
    // closest(selector): identify this anchor and, optionally, its fallback wrapper.
    link.closest = (selector) => selector === "a[href]" ? link
      : selector === ".doc-fallback" && options.fallback ? link : null;
    const event = {
      button: 0, target: link, defaultPrevented: false,
      // preventDefault(): record whether the script takes over navigation.
      preventDefault() { this.defaultPrevented = true; },
      ...options,
    };
    // Event targets are DOM nodes; the options' target is the link's browsing target.
    event.target = link;
    for (const handler of document.listeners.click) { handler(event); }
    await new Promise(setImmediate);
    return event;
  };
  return { click, requests, resolvedLinks, body, dialog, menuLink, window, scrolls };
};

// Test callback(): check relative links after insertion, then reuse a cached page.
test("document links retain their original base and open the matching dialog", async () => {
  const site = harness();
  assert.equal((await site.click("support/index.html")).defaultPrevented, true);
  assert.equal(site.dialog.open, true);
  assert.equal(site.resolvedLinks[0], "https://min.tools/langmin/privacy/index.html");
  // Following the moved link should select Privacy, then Support should be cached.
  await site.click(site.resolvedLinks[0]);
  assert.deepEqual(site.requests, ["support/index.html", "privacy/index.html"]);
  await site.click("support/index.html");
  assert.equal(site.requests.length, 2, "previously fetched documents use the cache");
});

// Test callback(): ensure the error link navigates instead of retrying the dialog.
test("a failed fetch leaves a working link to the standalone page", async () => {
  const site = harness(true);
  await site.click("support/index.html");
  assert.match(site.body.innerHTML, /doc-fallback/);
  const event = await site.click("support/index.html", { fallback: true });
  assert.equal(event.defaultPrevented, false);
  assert.equal(site.requests.length, 1);
});

// Test callback(): preserve browser click modes without fetching dialog content.
test("modified clicks and explicit new-tab links retain normal navigation", async () => {
  const site = harness();
  for (const options of [{ metaKey: true }, { ctrlKey: true }, { shiftKey: true }, { altKey: true },
                         { button: 1 }, { target: "_blank" }, { defaultPrevented: true }]) {
    const event = await site.click("support/index.html", options);
    assert.equal(event.defaultPrevented, options.defaultPrevented ?? false);
  }
  assert.equal(site.requests.length, 0);
});

// Test callback(): cancel the final scroll correction after input or navigation.
test("manual scrolling and history navigation cancel pending menu jumps", async () => {
  for (const action of ["wheel", "popstate", "hashchange"]) {
    const site = harness(false, true);
    // preventDefault(): accept interception of this synthetic primary-button click.
    site.menuLink.listeners.click[0]({ button: 0, preventDefault() {} });
    await new Promise(setImmediate);
    assert.deepEqual(site.scrolls, [908]);
    // Move elsewhere before scrollend, then let the pending correction resume.
    site.window.scrollY = 200;
    for (const handler of site.window.listeners[action]) { handler(); }
    for (const handler of [...site.window.listeners.scrollend]) { handler(); }
    await new Promise(setImmediate);
    assert.deepEqual(site.scrolls, [908], "the page must not jump back after the reader takes over");
  }
});
