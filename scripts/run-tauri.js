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
const isDebugBuild = args.includes("--debug");

const child = spawn(process.execPath, [tauriBinPath, ...args], {
  cwd: rootDir,
  stdio: "inherit",
  env: process.env,
});

child.on("close", (code) => {
  // 调试构建产物在 target/debug，归档脚本会误扫到旧的 release 产物，故跳过
  if (code === 0 && isBuildCommand && !isDebugBuild) {
    try {
      copyReleaseArtifacts({ rootDir });
    } catch (err) {
      console.error("\x1b[31m[发布归档错误]\x1b[0m 归档产物至 release 目录失败:", err);
      process.exit(1);
    }
  }
  if (code === 0 && isDebugBuild) {
    console.info("\x1b[36m[调试构建] 产物位于 src-tauri/target/debug，未归档至 release 目录。\x1b[0m");
  }
  process.exit(code ?? 0);
});

child.on("error", (err) => {
  console.error("\x1b[31m[Tauri 运行错误]\x1b[0m 无法启动 Tauri CLI:", err);
  process.exit(1);
});
