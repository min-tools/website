// Initialise(): replay a shortcut recording in the Keymin hero window.
// The demo uses landing.js helpers and listens for no real key presses.
(() => {
  "use strict";

  const stage = document.querySelector("[data-km]");
  const tools = window.MinTools;
  // No stage on this page, helpers missing, or motion unwelcome: the window stays in its saved state.
  if (!stage || !tools || tools.reduceMotion) { return; }
  const { wait, loop } = tools;

  // find(selector): the first match inside the stage.
  const find = (selector) => stage.querySelector(selector);
  // The editor's caps, the floating keys beside the window, and the modifier chips they light up.
  const caps = Array.from(stage.querySelectorAll("[data-km-caps] i"));
  const keys = Array.from(stage.querySelectorAll("[data-km-keys] .keycap"));
  const mods = Array.from(stage.querySelectorAll("[data-km-mods] .mod"));
  const ui = {
    capsBox: find("[data-km-caps]"),
    status: find("[data-km-status]"),
    recordLabel: find("[data-km-rec-label]")
  };
  // setState(state): the stage's replay state, which the stylesheet turns into what is visible.
  const setState = (state) => stage.setAttribute("data-state", state);

  // press(index): show one recorded key in the editor, beside the window, and in its modifier chip.
  const press = (index) => {
    caps[index].classList.add("on");
    keys[index].classList.add("on");
    const modifier = mods.find((chip) => chip.dataset.mod === caps[index].dataset.mod);
    // The key itself has no chip; only modifiers do.
    if (modifier) { modifier.classList.add("on"); }
    ui.capsBox.classList.remove("empty");
  };

  // play(): clear the shortcut, record it key by key, then save and show the toast.
  const play = async () => {
    await wait(3600);
    // Recording: the caps and chips empty out and the record button turns red.
    setState("recording");
    ui.recordLabel.textContent = "Recording…";
    caps.forEach((cap) => cap.classList.remove("on"));
    keys.forEach((key) => key.classList.remove("on"));
    mods.forEach((chip) => chip.classList.remove("on"));
    ui.capsBox.classList.add("empty");
    await wait(1100);
    // The keys arrive one at a time: Option, Shift, then S.
    for (let index = 0; index < caps.length; index += 1) {
      press(index);
      await wait(index === caps.length - 1 ? 800 : 520);
    }
    // The recording is in; the file has unsaved changes.
    setState("unsaved");
    ui.recordLabel.textContent = "Record Shortcut";
    ui.status.textContent = "Unsaved";
    await wait(1900);
    // Save: the status returns to green and the toast confirms it.
    setState("saved");
    ui.status.textContent = "Saved";
    stage.classList.add("saved");
    await wait(2200);
    stage.classList.remove("saved");
    keys.forEach((key) => key.classList.remove("on"));
  };

  loop(play);
})();
