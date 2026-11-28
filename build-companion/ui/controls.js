const statusLine = document.querySelector("#status");
const log = document.querySelector("#log");
const cancel = document.querySelector("#cancel");
const board = document.querySelector("#board");
const buttons = [...document.querySelectorAll("[data-action]")];
function busy(state) {
  for (const button of buttons) button.disabled = state;
  board.disabled = state;
  cancel.disabled = !state;
}
window.buildTools.subscribe(update => {
  if (update.type === "output") {
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 4;
    log.textContent = (log.textContent + update.text).slice(-150000);
    if (atBottom) log.scrollTop = log.scrollHeight;
    const phases = [...update.text.matchAll(/^\[(\d+)\/(\d+)\]\s+(.+)$/gm)];
    if (phases.length) statusLine.textContent = phases.at(-1)[0];
  } else if (update.type === "finish") {
    statusLine.textContent = (update.cancelled ? "Cancelled" : update.code === 0 ? "Completed" : "Build failed") + " · Exit code " + (update.code ?? "unavailable");
    busy(false);
  }
});
for (const button of buttons) button.addEventListener("click", async () => {
  log.textContent = "";
  statusLine.textContent = "Starting " + button.textContent.toLowerCase() + "…";
  busy(true);
  try { await window.buildTools.start(button.dataset.action, board.value); }
  catch (err) { statusLine.textContent = err.message; busy(false); }
});
cancel.addEventListener("click", async () => { statusLine.textContent = "Cancelling build…"; await window.buildTools.cancel(); });
window.buildTools.source().then(source => {
  document.querySelector("#source").textContent = source;
  statusLine.textContent = "Ready";
  busy(false);
}).catch(err => { statusLine.textContent = err.message; document.querySelector("#source").textContent = "Source preparation failed."; });
