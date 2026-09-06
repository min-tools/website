// Initialise(): set up shared landing-page navigation, dialogs, and demos.
// Publish replay timing helpers as window.MinTools for the app scripts.
(() => {
  "use strict";

  const html = document.documentElement;
  // $(selector, [root=document]): return the first matching element, or null.
  const $ = (selector, root = document) => root.querySelector(selector);
  // $$(selector, [root=document]): return all matching elements as an array.
  const $$ = (selector, root = document) => Array.from(root.querySelectorAll(selector));
  const reduceMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------------------------------------------------------------
  // Timing helpers for the scripted replays.

  // wait(ms): resolves after the given number of milliseconds.
  // Promise executor(resolve): schedule completion on the timer.
  const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  // nextFrame(): resolve on the next animation frame.
  // Promise executor(resolve): schedule completion with the browser's frame queue.
  const nextFrame = () => new Promise((resolve) => requestAnimationFrame(resolve));

  // whenVisible(): wait until the tab is visible before starting a replay step.
  // Promise executor(resolve): complete now or from the visibility listener.
  const whenVisible = () => new Promise((resolve) => {
    // Already visible: nothing to wait for.
    if (!document.hidden) { resolve(); return; }
    // onChange(): stop listening and resume when the tab becomes visible.
    const onChange = () => {
      // Ignore visibility changes that leave the tab hidden.
      if (document.hidden) { return; }
      document.removeEventListener("visibilitychange", onChange);
      resolve();
    };
    document.addEventListener("visibilitychange", onChange);
  });

  // typeInto(node, text, speed): types text into a node one character at a time, at a slightly uneven pace around speed ms.
  const typeInto = async (node, text, speed) => {
    for (let count = 1; count <= text.length; count += 1) {
      node.textContent = text.slice(0, count);
      // No pause after the last character, so the caller can react at once.
      if (count < text.length) { await wait(speed + Math.random() * speed * 0.8); }
    }
  };

  // loop(step): repeat an async step, waiting between steps while the tab is hidden.
  // A step already in progress continues until it finishes.
  const loop = async (step) => {
    for (;;) {
      await whenVisible();
      await step();
    }
  };

  // App replays share these helpers and the motion preference read at startup.
  window.MinTools = Object.freeze({ reduceMotion, wait, whenVisible, typeInto, loop });

  // ---------------------------------------------------------------------------------------------------------------------
  // content-visibility can leave off-screen section sizes estimated. Request full
  // layout when idle and before in-page jumps so targets can be measured.

  // settle(): switches every section to real layout; the stylesheet reads the class.
  const settle = () => html.classList.add("settled");

  // setupSettling(): settles the page when idle, before any hash-link click, and at once when the URL already has a hash.
  const setupSettling = () => {
    // Load handler(): defer full layout until after the page's initial load.
    window.addEventListener("load", () => {
      // Let the browser choose an idle moment when it supports idle callbacks.
      if ("requestIdleCallback" in window) { requestIdleCallback(settle, { timeout: 2000 }); } else {
        // Older browsers get a short delay before laying out every section.
        setTimeout(settle, 1000);
      }
    });
    // Capture handler(event): lay out hash targets before click handlers measure them.
    document.addEventListener("click", (event) => {
      // Hash links need their targets laid out before the browser jumps to them.
      if (event.target.closest?.("a[href^='#']")) { settle(); }
    }, true);
    // A direct fragment URL needs real section sizes from the outset.
    if (location.hash.length > 1) { settle(); }
  };

  // ---------------------------------------------------------------------------------------------------------------------
  // Wire up whatever this page has.

  setupSettling();
})();
