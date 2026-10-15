// Initialise(): replay an encryption in the Agemin hero window.
// The demo encrypts nothing and uses landing.js timing helpers.
(() => {
  "use strict";

  const stage = document.querySelector("[data-ag]");
  const tools = window.MinTools;
  // No stage on this page, helpers missing, or motion unwelcome: the window stays in its finished state.
  if (!stage || !tools || tools.reduceMotion) { return; }
  const { wait, loop } = tools;

  // The progress bar, its label, and the recipient rows the replay ticks.
  const progress = stage.querySelector("[data-ag-progress]");
  const progressLabel = progress.querySelector("span");
  const recipients = Array.from(stage.querySelectorAll("[data-ag-rec]"));
  // setState(state): the stage's replay state, which the stylesheet turns into what is visible.
  const setState = (state) => stage.setAttribute("data-state", state);
  // setProgress(fraction, done): fill the bar and update the byte count.
  const setProgress = (fraction, done) => {
    progress.style.setProperty("--ag-progress", `${Math.round(fraction * 100)}%`);
    progressLabel.textContent = `Encrypting ${done} of 2.4 MB`;
  };

  // play(): clear the result, tick the recipients, run the progress bar, and show the result.
  const play = async () => {
    await wait(3600);
    // Ready: the result disappears and the recipients are unticked.
    setState("ready");
    recipients.forEach((row) => row.classList.remove("on"));
    await wait(900);
    // The recipients are ticked one by one.
    for (const row of recipients) {
      row.classList.add("on");
      await wait(420);
    }
    await wait(700);
    // Running: the progress bar fills in a few steps.
    setState("running");
    setProgress(0, "0 bytes");
    await wait(200);
    setProgress(0.3, "720 KB");
    await wait(450);
    setProgress(0.68, "1.6 MB");
    await wait(450);
    setProgress(1, "2.4 MB");
    await wait(400);
    // Done: the result card returns and the toast confirms it.
    setState("done");
    stage.classList.add("saved");
    await wait(2200);
    stage.classList.remove("saved");
  };

  loop(play);
})();
