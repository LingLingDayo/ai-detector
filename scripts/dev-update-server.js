import { spawnSync } from "node:child_process";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { extractChangelog } from "./extract-changelog.js";
import { buildUpdateManifest } from "./generate-update-manifest.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");

export function createMockPayloadFile(filePath, sizeBytes) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const header = Buffer.from("AI-DETECTOR-DEV-UPDATE-PAYLOAD\n", "utf-8");
  const total = Math.max(header.length, Math.floor(sizeBytes));
  const buf = Buffer.alloc(total, 0x5a);
  header.copy(buf, 0);
  fs.writeFileSync(filePath, buf);
}

export function signArtifactWithLocalKey(filePath, version, options = {}) {
  const tauriBinPath =
    options.tauriBinPath || path.resolve(rootDir, "node_modules/@tauri-apps/cli/tauri.js");
  const childEnv = { ...process.env };

  if (!childEnv.TAURI_SIGNING_PRIVATE_KEY) {
    const localKeyPath =
      options.keyPath || path.join(os.homedir(), ".tauri", "ai-detector.key");
    const localPasswordPath = `${localKeyPath}.password`;
    if (!fs.existsSync(localKeyPath)) {
      throw new Error(
        `未找到签名私钥 (${localKeyPath})，请先生成密钥或设置 TAURI_SIGNING_PRIVATE_KEY 环境变量`
      );
    }
    childEnv.TAURI_SIGNING_PRIVATE_KEY = fs.readFileSync(localKeyPath, "utf-8");
    if (!childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD && fs.existsSync(localPasswordPath)) {
      childEnv.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = fs
        .readFileSync(localPasswordPath, "utf-8")
        .trim();
    }
  }

  const res = spawnSync(
    process.execPath,
    [tauriBinPath, "signer", "sign", filePath, "--app-version", version],
    {
      cwd: rootDir,
      env: childEnv,
      encoding: "utf-8",
      stdio: "pipe",
    }
  );

  if (res.status !== 0) {
    throw new Error(`签名失败 (${path.basename(filePath)}): ${res.stderr || res.stdout || "unknown"}`);
  }

  const sigPath = `${filePath}.sig`;
  if (!fs.existsSync(sigPath)) {
    throw new Error(`未生成签名文件: ${sigPath}`);
  }
  return fs.readFileSync(sigPath, "utf-8").trim();
}

export function prepareDevUpdateFixtures({
  workDir,
  version,
  sizeBytes,
  port,
  changelogPath = path.resolve(rootDir, "CHANGELOG.md"),
  signFn = signArtifactWithLocalKey,
}) {
  fs.mkdirSync(workDir, { recursive: true });

  const nsisName = `AI-Detector_${version}_x64-setup.exe`;
  const portableName = "AI-Detector.exe";
  const nsisPath = path.join(workDir, nsisName);
  const portablePath = path.join(workDir, portableName);

  createMockPayloadFile(nsisPath, sizeBytes);
  createMockPayloadFile(portablePath, sizeBytes);

  const nsisSig = signFn(nsisPath, version);
  const portableSig = signFn(portablePath, version);

  let notes = "feat: 本地开发测试更新包";
  if (changelogPath && fs.existsSync(changelogPath)) {
    notes = extractChangelog(fs.readFileSync(changelogPath, "utf-8"), "");
  }

  const manifest = buildUpdateManifest({
    version,
    notes,
    downloadBaseUrl: `http://127.0.0.1:${port}`,
    artifacts: {
      nsis: { fileName: nsisName, signature: nsisSig },
      msi: null,
      portable: { fileName: portableName, signature: portableSig },
    },
  });

  fs.writeFileSync(
    path.join(workDir, "latest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
    "utf-8"
  );

  const files = new Map([
    [nsisName, nsisPath],
    [portableName, portablePath],
  ]);

  return { manifest, files };
}

function sendRateLimitedFile(req, res, filePath, rateKbps) {
  const stat = fs.statSync(filePath);
  res.writeHead(200, {
    "Content-Type": "application/octet-stream",
    "Content-Length": stat.size,
  });

  if (rateKbps <= 0) {
    fs.createReadStream(filePath).pipe(res);
    return;
  }

  const chunkSize = 64 * 1024;
  const intervalMs = Math.max(10, Math.round((chunkSize / 1024 / rateKbps) * 1000));
  const buffer = fs.readFileSync(filePath);
  let offset = 0;
  let timer = null;
  let closed = false;

  const cleanup = () => {
    closed = true;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };

  req.on("close", cleanup);
  res.on("close", cleanup);

  const pump = () => {
    if (closed) return;
    if (offset >= buffer.length) {
      res.end();
      return;
    }
    const end = Math.min(offset + chunkSize, buffer.length);
    const slice = buffer.subarray(offset, end);
    offset = end;
    res.write(slice);
    timer = setTimeout(pump, intervalMs);
  };

  pump();
}

export async function startDevUpdateServer({
  workDir,
  port = 4199,
  version = "9.9.9",
  sizeMb = 6,
  rateKbps = 2048,
  changelogPath = path.resolve(rootDir, "CHANGELOG.md"),
  signFn = signArtifactWithLocalKey,
}) {
  let manifestJson = "{}";
  let fileMap = new Map();

  const server = http.createServer((req, res) => {
    const reqUrl = new URL(req.url || "/", "http://127.0.0.1");
    const pathname = decodeURIComponent(reqUrl.pathname);

    if (req.method === "GET" && pathname === "/latest.json") {
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(manifestJson);
      return;
    }

    const fileName = pathname.replace(/^\/+/, "");
    const targetFile = fileMap.get(fileName);
    if (req.method === "GET" && targetFile && fs.existsSync(targetFile)) {
      sendRateLimitedFile(req, res, targetFile, rateKbps);
      return;
    }

    res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Not Found");
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, "127.0.0.1", resolve);
  });

  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  const sizeBytes = Math.max(1024, Math.round(sizeMb * 1024 * 1024));

  try {
    const fixtures = prepareDevUpdateFixtures({
      workDir,
      version,
      sizeBytes,
      port: actualPort,
      changelogPath,
      signFn,
    });
    manifestJson = JSON.stringify(fixtures.manifest, null, 2) + "\n";
    fileMap = fixtures.files;
  } catch (err) {
    await new Promise((resolve) => server.close(resolve));
    throw err;
  }

  return {
    server,
    port: actualPort,
    endpoint: `http://127.0.0.1:${actualPort}/latest.json`,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

function parseCliArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (token.startsWith("--")) {
      const key = token.slice(2);
      const val = argv[i + 1];
      if (val !== undefined && !val.startsWith("--")) {
        args[key] = val;
        i++;
      } else {
        args[key] = "true";
      }
    }
  }
  return args;
}

async function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const port = Number(args.port ?? 4199);
  const version = (args.version || "9.9.9").replace(/^v/i, "");
  const sizeMb = Number(args["size-mb"] ?? 6);
  const rateKbps = Number(args["rate-kbps"] ?? 2048);
  const workDir = path.resolve(rootDir, ".temp/dev-update-server");

  const instance = await startDevUpdateServer({
    workDir,
    port,
    version,
    sizeMb,
    rateKbps,
  });

  console.log("=".repeat(56));
  console.log("🚀 本地开发更新测试服务器已启动");
  console.log(`   更新清单地址: ${instance.endpoint}`);
  console.log(`   模拟版本号  : v${version}`);
  console.log(`   测试包大小  : ${sizeMb} MB`);
  console.log(`   下载限速    : ${rateKbps > 0 ? `${rateKbps} KB/s` : "不限速"}`);
  console.log("=".repeat(56));
  console.log("💡 联调方式：");
  console.log("   1. 在应用「设置 → 关于 → 开发调试」中点击「真实拉取」");
  console.log(`   2. 或设置环境变量 AI_DETECTOR_DEV_UPDATE_ENDPOINT=${instance.endpoint}`);
  console.log("按 Ctrl+C 停止服务。\n");

  const shutdown = async () => {
    await instance.close();
    process.exit(0);
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFilePath === invokedFilePath) {
  main().catch((err) => {
    console.error("❌ 启动本地更新测试服务器失败:", err);
    process.exit(1);
  });
}
