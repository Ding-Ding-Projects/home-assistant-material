import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  acquireProcessRecord,
  isProcessRecordAlive,
  processStartTime,
  releaseProcessRecord,
  spawnForeground,
  writeProcessRecord,
} from "./managed-process.mjs";
import { describeOutputOwner, workflowLockFile } from "./output-lock.mjs";

const cwd = fileURLToPath(new URL("../", import.meta.url));
const coordinator = {
  pid: process.pid,
  startTime: processStartTime(process.pid),
};
const owner = {
  ...coordinator,
  kind: "output",
  target: "lint:types",
  token: randomUUID(),
};

async function checkTypes() {
  const lock = acquireProcessRecord(workflowLockFile, owner);
  if (!lock.acquired) {
    throw Error(
      `Cannot run lint:types: ${describeOutputOwner(lock.existing)} already owns the build output.`
    );
  }
  let cache;
  let compiler;
  try {
    // Use the pinned package's platform selection. Its CLI can start a second
    // process, which would leave the actual compiler outside the lease.
    const compilerPackage = createRequire(
      import.meta.resolve("@typescript/native/package.json")
    );
    const { default: getCompilerPath } = await import(
      pathToFileURL(compilerPackage.resolve("#getExePath")).href
    );
    const executable = getCompilerPath();
    // The process that owns the lock is the only writer of gallery sources.
    // If it is terminated, no background generator can keep writing them.
    const { default: gulp } = await import("gulp");
    await import("../gulpfile.js");
    await gulp.task("gather-gallery-pages")();
    cache = mkdtempSync(path.join(tmpdir(), "ha-type-check-"));
    for (const [name, project] of [
      ["app", "."],
      ["scripts", ".github/scripts"],
    ]) {
      const code = await spawnForeground({
        cmd: executable,
        args: [
          "-p",
          project,
          "--incremental",
          "--tsBuildInfoFile",
          path.join(cache, `${name}.tsbuildinfo`),
        ],
        cwd,
        processGroup: true,
        onSpawn(child) {
          compiler = { pid: child.pid, startTime: processStartTime(child.pid) };
          writeProcessRecord(workflowLockFile, {
            ...owner,
            ...compiler,
            coordinator,
          });
        },
      });
      compiler = undefined;
      if (code !== 0) return code;
    }
    return 0;
  } finally {
    // If startup failed with a live child, its record and private cache remain
    // available until it exits. Another invocation can then reclaim the lock.
    if (!compiler || !isProcessRecordAlive(compiler)) {
      releaseProcessRecord(workflowLockFile, owner.token);
      if (cache) rmSync(cache, { recursive: true, force: true });
    }
  }
}

try {
  process.exitCode = await checkTypes();
} catch (error) {
  process.stderr.write(`${error.message}\n`);
  process.exitCode = 1;
}
