// Initialise(): animate fixed clipboard examples in the Pastemin hero panel.
// The demo uses landing.js helpers and does not access the clipboard.
(() => {
  "use strict";

  const stage = document.querySelector("[data-pm]");
  const tools = window.MinTools;
  // No stage on this page, helpers missing, or motion unwelcome: the panel stays in its finished state.
  if (!stage || !tools || tools.reduceMotion) { return; }
  const { wait, typeInto, loop } = tools;

  // find(selector): the first match inside the stage.
  const find = (selector) => stage.querySelector(selector);
  const rows = Array.from(stage.querySelectorAll(".pm-list .row"));
  // The parts of the panel the replay changes: the search field, the list's empty state, and the detail pane.
  const ui = {
    search: find("[data-pm-search]"),
    typed: find("[data-pm-typed]"),
    empty: find(".pm-list .empty"),
    kind: find("[data-pm-kind]"),
    kindIcon: find("[data-pm-kind-icon] use"),
    title: find("[data-pm-title]"),
    body: find("[data-pm-body]"),
    pic: find("[data-pm-pic]"),
    source: find("[data-pm-source]"),
    meta: find("[data-pm-meta]")
  };

  // select(row): shows one item in the detail pane and marks its row. Each row carries its item in data attributes.
  const select = (row) => {
    // Row callback(candidate): mark only the row supplying the detail pane.
    rows.forEach((candidate) => candidate.classList.toggle("on", candidate === row));
    const { kind, title, body, source, meta } = row.dataset;
    const image = kind === "Image";
    // Fill the detail pane from this row's example data.
    ui.kind.textContent = kind;
    ui.kindIcon.setAttribute("href", image ? "#i-image" : "#i-doc");
    ui.title.textContent = title;
    ui.body.textContent = body;
    // An image item shows a picture instead of text.
    ui.body.hidden = image;
    ui.pic.hidden = !image;
    ui.source.textContent = source;
    ui.meta.textContent = meta;
  };

  // filter(query): keeps only the rows whose title or text contains the query, and selects the first of them.
  const filter = (query) => {
    const needle = query.toLowerCase();
    // Filter callback(row): match title and body, or show every row for no query.
    const shown = rows.filter((row) => {
      const hit = needle === "" || `${row.dataset.title} ${row.dataset.body}`.toLowerCase().includes(needle);
      row.hidden = !hit;
      return hit;
    });
    ui.empty.hidden = shown.length > 0;
    // Show the first match when one exists; an empty result keeps the old details.
    if (shown.length) { select(shown[0]); }
  };

  // Each scene supplies a query and a zero-based row index to preview.
  const scenes = [
    { query: "launch", pick: 1 },
    { query: "design", pick: 4 },
    { query: "min.tools", pick: 3 },
    { query: "review", pick: 2 }
  ];

  // play({query, pick}): animate a search and restoration of the chosen row.
  const play = async ({ query, pick }) => {
    await wait(2400);
    ui.search.classList.add("filled");
    await typeInto(ui.typed, query, 70);
    filter(query);
    select(rows[pick]);
    await wait(1500);
    // Simulate a restoration by showing the toast; no clipboard write occurs.
    stage.classList.add("restored");
    await wait(2200);
    // Clear the search, briefly keep the chosen row, then reset the full list.
    stage.classList.remove("restored");
    ui.typed.textContent = "";
    ui.search.classList.remove("filled");
    filter("");
    select(rows[pick]);
    await wait(1600);
    select(rows[0]);
  };

  let index = 0;
  // Replay step(): cycle through the example searches in order.
  loop(async () => {
    await play(scenes[index]);
    index = (index + 1) % scenes.length;
  });
})();
