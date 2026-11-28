const { app, BrowserWindow, ipcMain, shell } = require("electron");
const { spawn, spawnSync } = require("node:child_process");
const fs = require("node:fs");
const path = require("node:path");
const { restore } = require("./source.cjs");

const boards = new Set(["ova", "rpi5-64", "rpi4-64", "rpi3-64"]);
const actions = { build: ["build.bat", "/s"], run: ["build.bat", "--run", "/s"], installer: ["build-installer.bat", "/s"] };
let window, source, active, cancelling = false, closing = false;
const hasSource = dir => ["build.bat", "build-installer.bat", "versions.json", "core", "operating-system"].every(file => fs.existsSync(path.join(dir, file)));
function findSource(start) {
  for (let dir = path.resolve(start); ; dir = path.dirname(dir)) {
    if (hasSource(dir)) return dir;
    if (dir === path.dirname(dir)) return undefined;
  }
}
function post(event) { if (window && !window.isDestroyed()) window.webContents.send("build-event", event); }
async function getSource() {
  const index = process.argv.indexOf("--repo");
  if (index >= 0) {
    if (!process.argv[index + 1] || !hasSource(path.resolve(process.argv[index + 1]))) throw new Error("The selected source folder has no product build entrypoints.");
    return path.resolve(process.argv[index + 1]);
  }
  const beside = findSource(process.env.PORTABLE_EXECUTABLE_DIR || (app.isPackaged ? path.dirname(process.execPath) : __dirname));
  if (beside) return beside;
  if (spawnSync("git", ["--version"], {windowsHide: true}).status !== 0) {
    const script = path.join(process.resourcesPath, "prerequisites.ps1");
    const installed = spawnSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", script, "-Package", "git"], {windowsHide: true});
    if (installed.status !== 0) throw new Error("Git installation did not finish. Reopen the build application to retry.");
    process.env.PATH = path.join(process.env.ProgramFiles, "Git", "cmd") + ";" + process.env.PATH;
  }
  return restore(path.join(process.resourcesPath, "source"), path.join(app.getPath("userData"), "source"));
}
function cancel() {
  if (!active || cancelling || !active.pid) return;
  cancelling = true;
  const child = active;
  const killer = spawn("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], {windowsHide: true});
  killer.once("error", err => post({ type: "output", text: err.message + "\n" }));
  killer.once("close", code => {
    if (code && active === child) {
      cancelling = false;
      closing = false;
      post({ type: "output", text: "Cancellation did not finish. The build is still active.\n" });
    }
  });
}
function start(action, board) {
  if (active || !source || !Object.hasOwn(actions, action) || !boards.has(board)) throw new Error("Build action is unavailable.");
  const [entry, ...args] = actions[action];
  if (action === "installer") args.push(board);
  // The command contains only fixed filenames and allowlisted values. The checkout
  // path is passed as cwd, never interpolated into a command processor expression.
  const child = spawn("cmd.exe", ["/d", "/c", entry, ...args], {cwd: source, windowsHide: true, stdio: ["ignore", "pipe", "pipe"]});
  active = child;
  cancelling = false;
  for (const stream of [child.stdout, child.stderr]) {
    stream.setEncoding("utf8");
    stream.on("data", text => post({type: "output", text}));
  }
  child.once("error", err => post({type: "output", text: err.message + "\n"}));
  child.once("close", async code => {
    active = undefined;
    post({type: "finish", code, cancelled: cancelling});
    if (closing) { window.destroy(); return; }
    if (!cancelling && code === 0 && action === "run") {
      try { await shell.openExternal("http://localhost:8123/"); } catch { post({type: "output", text: "Open http://localhost:8123/ in your browser.\n"}); }
    }
  });
}
app.whenReady().then(async () => {
  window = new BrowserWindow({width: 850, height: 640, minWidth: 420, minHeight: 440, backgroundColor: "#f2f6f4", webPreferences: {
    preload: path.join(__dirname, "preload.cjs"), contextIsolation: true, sandbox: true, nodeIntegration: false
  }});
  window.removeMenu();
  const trusted = event => {
    if (event.senderFrame !== window.webContents.mainFrame) throw new Error("Unknown build window");
  };
  ipcMain.handle("source", async event => { trusted(event); return source ||= await getSource(); });
  ipcMain.handle("build", (event, action, board) => { trusted(event); start(action, board); });
  ipcMain.handle("cancel", event => { trusted(event); cancel(); });
  window.webContents.setWindowOpenHandler(() => ({action: "deny"}));
  window.webContents.on("will-navigate", event => event.preventDefault());
  window.on("close", event => { if (active) { event.preventDefault(); closing = true; cancel(); } });
  await window.loadFile(path.join(__dirname, "ui", "index.html"));
});
app.on("window-all-closed", () => app.quit());
