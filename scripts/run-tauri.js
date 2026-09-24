import { spawn } from "node:child_process";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { copyReleaseArtifacts } from "./copy-release.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const tauriBinPath = path.resolve(rootDir, "node_modules/@tauri-apps/cli/tauri.js");

const args = process.argv.slice(2);
const isBuildCommand = args.includes("build");

const child = spawn(process.execPath, [tauriBinPath, ...args], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => {
  if (code === 0 && isBuildCommand) {
    try {
      copyReleaseArtifacts({ rootDir });
    } catch (err) {
      console.error("\x1b[31m[发布归档错误]\x1b[0m 归档产物至 release 目录失败:", err);
      process.exit(1);
    }
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("\x1b[31m[Tauri 运行错误]\x1b[0m 无法启动 Tauri CLI:", err);
  process.exit(1);
});
