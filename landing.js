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
  // Wire up whatever this page has.

})();
