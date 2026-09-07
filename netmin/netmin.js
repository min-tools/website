// Initialise(): animate a fixed Netmin report using landing.js timing helpers.
// The demo performs no network checks or clipboard writes.
(() => {
  "use strict";

  const stage = document.querySelector("[data-nm]");
  const tools = window.MinTools;
  // No stage on this page, helpers missing, or motion unwelcome: the window stays in its finished state.
  if (!stage || !tools || tools.reduceMotion) { return; }
  const { wait, loop } = tools;

  // The status label and refresh icon accompany the report's CSS transitions.
  const status = stage.querySelector("[data-nm-status]");
  const refresh = stage.querySelector("[data-nm-refresh]");
  // setState(state): the stage's replay state, which the stylesheet turns into what is visible.
  const setState = (state) => stage.setAttribute("data-state", state);

  // play(): simulate a check, reveal the fixed report, and show the copied toast.
  const play = async () => {
    await wait(4200);
    // Running: amber status, spinning refresh button, cards hidden by the stylesheet.
    setState("running");
    status.textContent = "Running · 0.1 s";
    refresh.classList.add("spin");
    await wait(700);
    status.textContent = "Running · 0.3 s";
    await wait(600);
    // Reveal the fixed report as if the check has just completed.
    setState("done");
    status.textContent = "Complete · 0.4 s";
    refresh.classList.remove("spin");
    await wait(2600);
    // Simulate copying the report with a temporary confirmation toast.
    stage.classList.add("saved");
    await wait(2200);
    stage.classList.remove("saved");
  };

  loop(play);
})();
