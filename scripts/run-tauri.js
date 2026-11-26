import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { copyReleaseArtifacts } from "./copy-release.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const tauriBinPath = path.resolve(rootDir, "node_modules/@tauri-apps/cli/tauri.js");

const args = process.argv.slice(2);
const buildIndex = args.indexOf("build");
const isBuildCommand = buildIndex !== -1;
const isDebugBuild = args.includes("--debug");

const childEnv = { ...process.env };
const childArgs = [...args];

if (isBuildCommand && !isDebugBuild) {
  if (!childEnv.TAURI_SIGNING_PRIVATE_KEY) {
    if (process.env.CI) {
      console.error("\x1b[31m[签名错误]\x1b[0m 缺少 TAURI_SIGNING_PRIVATE_KEY，请在仓库 Secrets 中配置");
      process.exit(1);
    }

    const localKeyPath = path.join(os.homedir(), ".tauri", "ai-detector.key");
    const localPasswordPath = `${localKeyPath}.password`;

    if (fs.existsSync(localKeyPath)) {
      childEnv.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(localKeyPath, "utf-8");
      if (!childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD && fs.existsSync(localPasswordPath)) {
        childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = fs.readFileSync(localPasswordPath, "utf-8").trim();
      }
    } else {
      console.warn("\x1b[33m[签名提示]\x1b[0m 未找到签名私钥，本地构建跳过更新包签名");
      childArgs.splice(
        buildIndex + 1,
        0,
        "--config",
        JSON.stringify({ bundle: { createUpdaterArtifacts: false } })
      );
    }
  }
}

const child = spawn(process.execPath, [tauriBinPath, ...childArgs], {
  cwd: rootDir,
  stdio: "inherit",
  env: childEnv,
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
