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
  // The header is transparent over the hero and gains its blurred backdrop once the page scrolls.

  // setupHeader(header): toggles the header's scrolled state as the page scrolls.
  const setupHeader = (header) => {
    // onScroll(): give the header a backdrop once it leaves the top of the page.
    const onScroll = () => header.classList.toggle("scrolled", window.scrollY > 8);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
  };

  // ---------------------------------------------------------------------------------------------------------------------
  // The menu follows the page: the item for the section in view is highlighted, a click scrolls to the section under script
  // control and holds the highlight until the reader scrolls on, and an item that names a document card outlines that card.

  const SPY_LINE = 140; // A section counts as in view once its top has passed this many pixels below the viewport's top.
  const SCROLL_KEYS = ["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "];

  // topOf(element): the element's top edge in page coordinates.
  const topOf = (element) => element.getBoundingClientRect().top + window.scrollY;
  // atBottom(): whether the page is scrolled to its very end.
  const atBottom = () => window.innerHeight + window.scrollY >= html.scrollHeight - 2;

  // scrollEnded(): resolve on scrollend or a timeout, whichever happens first.
  // Promise executor(resolve): arrange event and timer completion hooks.
  const scrollEnded = () => new Promise((resolve) => {
    let timer = null;
    // done(): release both completion hooks and resume the waiting jump.
    const done = () => {
      window.removeEventListener("scrollend", done);
      clearTimeout(timer);
      resolve();
    };
    // Use the browser's completion event when supported.
    if ("onscrollend" in window) { window.addEventListener("scrollend", done); }
    // Always bound the wait, including scrolls that emit no completion event.
    timer = setTimeout(done, reduceMotion ? 50 : 1200);
  });

  // setupMenu(header): wires the header's hash links to the section spy, the scripted jumps, and the card outlines.
  const setupMenu = (header) => {
    // Map callback(link): pair each hash link with its target and optional card.
    // data-scroll uses a section heading as the card's landing position.
    // Filter callback(item): omit links whose target is absent from this page.
    const items = $$("nav a[href^='#']", header).map((link) => {
      const target = document.getElementById(link.hash.slice(1));
      const anchor = target?.dataset.scroll ? document.getElementById(target.dataset.scroll) : null;
      return { link, target: anchor ?? target, card: target?.hasAttribute("data-doc") ? target : null };
    }).filter((item) => item.target);
    // Pages without valid menu targets need no scroll tracking.
    if (!items.length) { return; }
    // Map callback(item): collect only actual cards for outline updates.
    const cards = items.map((item) => item.card).filter(Boolean);

    let locked = null;   // Held until scrolling input or history/hash navigation.
    let ticking = false; // Whether a spy pass is already queued for the next frame.
    let jumps = 0;       // Invalidates pending corrections after a jump or unlock.

    // mark(current): highlight the given menu item; null clears the highlight.
    // Item callback(item): update each link against the chosen menu item.
    const mark = (current) => items.forEach((item) => item.link.classList.toggle("on", item === current));
    // markCard(card): outline the given document card; null clears the outline.
    // Card callback(candidate): update each outline against the chosen card.
    const markCard = (card) => cards.forEach((candidate) => candidate.classList.toggle("on", candidate === card));

    // spy(): highlights the item in view, the last target whose top has passed the line. Targets that share a position
    // (Support and Privacy sit side by side) keep the first of them, and the very bottom of the page counts as the last item.
    const spy = () => {
      ticking = false;
      // A held item wins over the scroll position.
      if (locked) { return; }
      const line = window.scrollY + SPY_LINE;
      let current = null;
      let currentTop = -Infinity;
      for (const item of items) {
        const top = topOf(item.target);
        // Take the closest passed target; equal positions keep the first item.
        if (top <= line && top > currentTop) { current = item; currentTop = top; }
      }
      mark(atBottom() ? items[items.length - 1] : current);
    };
    // requestSpy(): runs the spy once per frame at most, however often scroll events arrive.
    const requestSpy = () => {
      // Reuse the pending frame instead of queuing another pass.
      if (ticking) { return; }
      ticking = true;
      requestAnimationFrame(spy);
    };
    // unlock(): release the menu lock after scrolling input or history navigation.
    const unlock = () => {
      // Nothing needs cancelling once the menu is following the page again.
      if (!locked) { return; }
      // Cancel any correction that would undo the reader's new position.
      jumps += 1;
      locked = null;
      markCard(null);
      requestSpy();
    };

    // aimAt({target}): subtract the target's CSS scroll margin from its position
    // and clamp the result to the page's scrollable range.
    const aimAt = ({ target }) => {
      const margin = parseFloat(getComputedStyle(target).scrollMarginTop) || 0;
      const max = html.scrollHeight - window.innerHeight;
      return Math.max(0, Math.min(Math.round(topOf(target) - margin), max));
    };

    // jumpTo(item): scrolls to the item's target under script control. Everything is laid out for real first, then the
    // scroll runs, then the spot is checked once more and corrected if the layout moved underneath it. A newer jump cancels
    // the correction of an older one; scrolling input and history changes cancel it too.
    const jumpTo = async (item) => {
      const jump = ++jumps;
      settle();
      await nextFrame();
      // Input, history navigation, or a newer click can cancel this pending jump.
      if (jump !== jumps) { return; }
      const top = aimAt(item);
      // Already there (Support and Privacy share a landing spot): nothing to scroll.
      if (Math.abs(window.scrollY - top) <= 2) { return; }
      window.scrollTo({ top, behavior: reduceMotion ? "auto" : "smooth" });
      await scrollEnded();
      // Leave the new position alone if this jump was cancelled while scrolling.
      if (jump !== jumps) { return; }
      const again = aimAt(item);
      // Correct layout shifts once, without starting another smooth scroll.
      if (Math.abs(window.scrollY - again) > 2) { window.scrollTo({ top: again, behavior: "auto" }); }
    };

    // A click holds the item, outlines its card, records the hash, and jumps.
    for (const item of items) {
      // Click handler(event): hold this item's highlight and start its jump.
      item.link.addEventListener("click", (event) => {
        // Let modified clicks keep the browser's usual navigation behavior.
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) { return; }
        event.preventDefault();
        locked = item;
        mark(item);
        markCard(item.card);
        // Repeated clicks on the same target should not add history entries.
        if (location.hash !== item.link.hash) { history.pushState(null, "", item.link.hash); }
        jumpTo(item);
      });
    }
    // Scrolling input releases the lock; scripted scrolling emits none of these.
    window.addEventListener("wheel", unlock, { passive: true });
    window.addEventListener("touchmove", unlock, { passive: true });
    // Key handler(event): release the lock for keys that can scroll the page.
    window.addEventListener("keydown", (event) => {
      // Release only for keys in the page-scrolling key list.
      if (SCROLL_KEYS.includes(event.key)) { unlock(); }
    });
    // Back, Forward, and other anchor links release the previous menu selection.
    window.addEventListener("popstate", unlock);
    window.addEventListener("hashchange", unlock);
    // Follow position and layout changes whenever no menu item is held.
    window.addEventListener("scroll", requestSpy, { passive: true });
    window.addEventListener("resize", requestSpy);
    window.addEventListener("load", spy);
    spy();
  };

  // ---------------------------------------------------------------------------------------------------------------------
  // Fade sections in as they scroll into view; show everything at once when the observer is missing or motion is reduced.

  // setupReveal(): observes every .reveal element and marks it once it enters the viewport.
  const setupReveal = () => {
    const reveals = $$(".reveal");
    // Without an observer, or with reduced motion, everything is simply visible.
    if (!("IntersectionObserver" in window) || reduceMotion) {
      // Element callback(element): show every section without waiting for a reveal.
      reveals.forEach((element) => element.classList.add("in"));
      return;
    }
    // Observer callback(entries): reveal each element once at the viewport edge.
    const observer = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        // Leave off-screen elements observed until they enter the reveal area.
        if (!entry.isIntersecting) { continue; }
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.05 });
    // Element callback(element): register each section for its first reveal.
    reveals.forEach((element) => observer.observe(element));
  };

  // ---------------------------------------------------------------------------------------------------------------------
  // The Langmin hero animates fixed example sessions; it makes no model requests.

  const MODEL = "GPT-5.6 Luna";
  // Each scene: the mode it selects, the request typed, the streamed result, and a follow-up with its reply. Blocks are
  // headings (h), language labels (l), paragraphs (p) with an optional lang, or speaker labels (who).
  const SCENES = [
    {
      id: "explain", title: "Explain", verb: "explain", key: "3", working: "Explaining",
      placeholder: "What would you like explained?",
      input: "What is love?",
      resultTitle: "Explain — Meaning of Love", meta: `Model: ${MODEL} · Level: A`,
      result: [
        { h: "Meaning of Love" },
        { p: "Love is a strong feeling of care, respect, and closeness. It can be for family, friends, a partner, a pet, or even a cause." }
      ],
      follow: "Explain now in Spanish?",
      reply: [{ p: "El amor es un sentimiento fuerte de cariño, respeto y cercanía. Puede ser por la familia, los amigos o una pareja.", lang: "es" }]
    },
    {
      id: "translate", title: "Translate", verb: "translate", key: "5", working: "Translating",
      placeholder: "What would you like translated?",
      input: "Good morning! The meeting moved to three o'clock, room 4B. Bring the printed draft if you can.",
      resultTitle: "Translate — Good morning!", meta: `Model: ${MODEL} · Српски, Español`,
      result: [
        { l: "Српски" },
        { p: "Добро јутро! Састанак је померен на три сата, сала 4Б. Понеси одштампани нацрт ако можеш.", lang: "sr" },
        { l: "Español" },
        { p: "¡Buenos días! La reunión se ha movido a las tres, sala 4B. Trae el borrador impreso si puedes.", lang: "es" }
      ],
      follow: "Now also in Japanese.",
      reply: [
        { l: "日本語" },
        { p: "おはようございます！会議は3時に変更になりました。場所は4B室です。できれば印刷した草稿を持ってきてください。", lang: "ja" }
      ]
    },
    {
      id: "summarize", title: "Summarize", verb: "summarize", key: "4", working: "Summarizing",
      placeholder: "What would you like summarized?",
      audio: true,
      input: "Okay, quick recap. The launch moves to the 24th because the store review took longer than planned. Mira owns the release notes, Tom takes the pricing page, and we meet again Thursday to go through the beta feedback.",
      resultTitle: "Summarize — Team sync", meta: `Model: ${MODEL} · Short`,
      result: [
        { h: "Team sync" },
        { p: "The launch is postponed to the 24th after a slow store review. Mira will write the release notes and Tom will update the pricing page; the team meets Thursday to review beta feedback." }
      ],
      follow: "List the action items.",
      reply: [
        { p: "• Mira: write the release notes" },
        { p: "• Tom: update the pricing page" },
        { p: "• Everyone: review beta feedback on Thursday" }
      ]
    },
    {
      id: "proofread", title: "Proofread", verb: "proofread", key: "1", working: "Proofreading",
      placeholder: "What would you like proofread?",
      input: "Hi Elliot, thanks for you're patience while we finalized the numbers, the report is attached.",
      resultTitle: "Proofread — Hi Elliot", meta: `Model: ${MODEL}`,
      result: [{ p: "Hi Elliot, thanks for your patience while we finalized the numbers. The report is attached." }],
      follow: "Make it warmer.",
      reply: [{ p: "Hi Elliot, thank you so much for your patience while we finalized the numbers! The report is attached, and I would love to hear what you think." }]
    }
  ];

  // setupLangminHero(stage): plays the scenes in the hero window forever.
  const setupLangminHero = (stage) => {
    // find(selector): the first match inside the stage.
    const find = (selector) => $(selector, stage);
    // The parts of the window the scenes change.
    const ui = {
      title: find("[data-hero-title]"),
      placeholder: find("[data-hero-ph]"),
      typed: find("[data-hero-typed]"),
      paneIn: find(".pane-in"),
      send: find("[data-hero-send]"),
      resultTitle: find("[data-hero-rtitle]"),
      meta: find("[data-hero-meta]"),
      working: find("[data-hero-working]"),
      body: find("[data-hero-body]"),
      field: find(".res-follow .field"),
      followTyped: find("[data-hero-ftyped]"),
      followState: find("[data-hero-fstate]"),
      verb: find("[data-hero-go]"),
      goKey: find("[data-hero-gokey]"),
      hud: find("[data-hero-hud]"),
      key: find("[data-hero-key]")
    };
    const chips = $$("[data-mode]", stage);
    // setState(state): the stage's replay state, which the stylesheet turns into what is visible.
    const setState = (state) => stage.setAttribute("data-state", state);
    // keepInView(): keeps the newest text at the bottom of the result in view.
    const keepInView = () => { ui.body.scrollTop = ui.body.scrollHeight; };

    // streamBlock(block): appends one block and reveals it a few characters or one word at a time.
    const streamBlock = async (block) => {
      // A speaker label appears at once.
      if (block.who) {
        const node = document.createElement("span");
        node.className = block.who === "You" ? "who you" : "who";
        node.textContent = block.who;
        ui.body.append(node);
        keepInView();
        await wait(120);
        return;
      }
      // Text blocks stream in: word by word when the text has spaces, two characters at a time otherwise (CJK).
      const text = block.h ?? block.l ?? block.p;
      const node = document.createElement(block.h ? "h4" : block.l ? "span" : "p");
      // Language headings use the compact label style rather than body text.
      if (block.l) { node.className = "langhead"; }
      // Preserve the language of translated text for browser text handling.
      if (block.lang) { node.lang = block.lang; }
      ui.body.append(node);
      const spaced = text.includes(" ");
      const units = spaced ? text.split(" ") : text.match(/[\s\S]{1,2}/g);
      const pace = block.h || block.l ? 80 : 36;
      for (let count = 1; count <= units.length; count += 1) {
        node.textContent = units.slice(0, count).join(spaced ? " " : "");
        keepInView();
        // Pause between chunks, but finish the last chunk without extra delay.
        if (count < units.length) { await wait(pace); }
      }
    };
    // stream(blocks): streams blocks one after another.
    const stream = async (blocks) => {
      for (const block of blocks) { await streamBlock(block); }
    };

    // reset(scene): puts the window back to its empty state, labelled for the scene about to play.
    const reset = (scene) => {
      // Clear text and transient states left by the previous session.
      setState("idle");
      ui.typed.textContent = "";
      ui.followTyped.textContent = "";
      ui.body.textContent = "";
      ui.paneIn.classList.remove("filled");
      ui.send.classList.remove("live");
      ui.field.classList.remove("filled");
      ui.followState.textContent = "Follow-up";
      ui.paneIn.removeAttribute("data-import");
      // Chip callback(chip): select the mode used by the next scene.
      chips.forEach((chip) => chip.classList.toggle("on", chip.dataset.mode === scene.id));
      // Set the scene's labels and shortcut key before its typing starts.
      ui.title.textContent = scene.title;
      ui.verb.textContent = scene.verb;
      ui.placeholder.textContent = scene.placeholder;
      ui.resultTitle.textContent = scene.resultTitle;
      ui.meta.textContent = scene.meta;
      ui.working.textContent = scene.working;
      ui.hud.textContent = scene.working;
      ui.key.textContent = scene.key;
    };

    // importRecording(): animate the drop and transcription indicators.
    // The scene supplies the transcript; no recording is processed here.
    const importRecording = async () => {
      ui.paneIn.setAttribute("data-import", "drop");
      await wait(1000);
      ui.paneIn.setAttribute("data-import", "working");
      await wait(2700);
      ui.paneIn.removeAttribute("data-import");
    };

    // play(scene): animate one SCENES entry through its reply and fade-out.
    const play = async (scene) => {
      reset(scene);
      await wait(2600);
      // The Summarize scene starts from a dropped recording rather than typed text.
      if (scene.audio) { await importRecording(); }
      // Animate the request and a press of the send shortcut.
      ui.paneIn.classList.add("filled");
      ui.send.classList.add("live");
      await typeInto(ui.typed, scene.input, scene.audio ? 4 : 24);
      await wait(550);
      ui.goKey.classList.add("press");
      await wait(320);
      ui.goKey.classList.remove("press");
      // Show a working state before revealing the scene's fixed result.
      setState("working");
      await wait(1200);
      setState("result");
      await stream(scene.result);
      await wait(1000);
      // A follow-up is typed, sent, and answered under the result.
      ui.field.classList.add("filled");
      await typeInto(ui.followTyped, scene.follow, 30);
      await wait(450);
      ui.followTyped.textContent = "";
      ui.field.classList.remove("filled");
      ui.followState.textContent = "Replying…";
      // Append the example conversation below the original result.
      await stream([{ who: "You" }, { p: scene.follow }]);
      await wait(1000);
      ui.followState.textContent = "Follow-up";
      await stream([{ who: `Langmin · ${MODEL}` }, ...scene.reply]);
      // The finished session stays up for a while, then fades before the next scene.
      await wait(5200);
      setState("leaving");
      await wait(500);
    };

    let index = 0;
    stage.classList.add("live");
    // Replay step(): advance through the scenes, wrapping after the last one.
    loop(async () => {
      await play(SCENES[index]);
      index = (index + 1) % SCENES.length;
    });
  };

  // ---------------------------------------------------------------------------------------------------------------------
  // Wire up whatever this page has.

  setupSettling();
  const header = $("header.site");
  // Pages with a shared header get its backdrop and menu tracking.
  if (header) {
    setupHeader(header);
    setupMenu(header);
  }
  setupReveal();
  const stage = $("[data-hero]");
  // The Langmin hero replays only where there is a stage and motion is welcome.
  if (stage && !reduceMotion) { setupLangminHero(stage); }
})();
