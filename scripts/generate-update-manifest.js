import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

function readSignature(sigPath) {
  if (!fs.existsSync(sigPath)) {
    return null;
  }
  const content = fs.readFileSync(sigPath, "utf-8").trim();
  return content || null;
}

export function collectSignedArtifacts(dir) {
  if (!fs.existsSync(dir)) {
    throw new Error(`产物目录不存在: ${dir}`);
  }

  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const fileNames = entries.filter((e) => e.isFile()).map((e) => e.name);

  let nsis = null;
  let msi = null;
  let portable = null;

  for (const name of fileNames) {
    if (name.endsWith("-setup.exe")) {
      const signature = readSignature(path.join(dir, `${name}.sig`));
      if (signature) {
        nsis = { fileName: name, signature };
      }
    } else if (name.endsWith(".msi")) {
      const signature = readSignature(path.join(dir, `${name}.sig`));
      if (signature) {
        msi = { fileName: name, signature };
      }
    } else if (name === "AI-Detector.exe") {
      const signature = readSignature(path.join(dir, `${name}.sig`));
      if (signature) {
        portable = { fileName: name, signature };
      }
    }
  }

  return { nsis, msi, portable };
}

export function buildUpdateManifest({
  version,
  notes,
  pubDate = new Date().toISOString(),
  downloadBaseUrl,
  artifacts,
}) {
  if (!artifacts?.nsis) {
    throw new Error("未找到已签名的 NSIS 安装包 (*-setup.exe 与对应 .sig)");
  }

  const baseUrl = downloadBaseUrl.replace(/\/+$/, "");
  const makeEntry = (artifact) => ({
    signature: artifact.signature,
    url: `${baseUrl}/${encodeURIComponent(artifact.fileName)}`,
  });

  const nsisEntry = makeEntry(artifacts.nsis);
  const platforms = {
    "windows-x86_64": nsisEntry,
    "windows-x86_64-nsis": nsisEntry,
  };

  if (artifacts.msi) {
    platforms["windows-x86_64-msi"] = makeEntry(artifacts.msi);
  }
  if (artifacts.portable) {
    platforms["windows-x86_64-portable"] = makeEntry(artifacts.portable);
  }

  return {
    version,
    notes: (notes || "").trim(),
    pub_date: pubDate,
    platforms,
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

function main() {
  const args = parseCliArgs(process.argv.slice(2));
  const dir = path.resolve(process.cwd(), args.dir || "dist-release");
  const rawTag = (args.tag || "").trim();
  if (!rawTag) {
    console.error("❌ 缺少 --tag 参数（例如 --tag v1.3.0）");
    process.exit(1);
  }

  const normalizedTag = rawTag.startsWith("v") ? rawTag : `v${rawTag}`;
  const version = normalizedTag.replace(/^v/i, "");
  const repo = (args.repo || process.env.GITHUB_REPOSITORY || "LingLingDayo/ai-detector").trim();
  const outPath = path.resolve(process.cwd(), args.out || path.join(dir, "latest.json"));

  let notes = "";
  if (args.notes) {
    const notesPath = path.resolve(process.cwd(), args.notes);
    if (fs.existsSync(notesPath)) {
      notes = fs.readFileSync(notesPath, "utf-8");
    } else {
      console.warn(`⚠️ 未找到更新日志文件: ${notesPath}`);
    }
  }

  const artifacts = collectSignedArtifacts(dir);
  if (!artifacts.msi) {
    console.warn("⚠️ 未找到已签名的 MSI 安装包，将跳过 windows-x86_64-msi 条目");
  }
  if (!artifacts.portable) {
    console.warn("⚠️ 未找到已签名的便携版程序，将跳过 windows-x86_64-portable 条目");
  }

  let manifest;
  try {
    manifest = buildUpdateManifest({
      version,
      notes,
      downloadBaseUrl: `https://github.com/${repo}/releases/download/${normalizedTag}`,
      artifacts,
    });
  } catch (err) {
    console.error(`❌ 生成更新清单失败: ${err.message}`);
    process.exit(1);
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  console.log(`✔ 已生成更新清单: ${outPath}`);
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";
if (currentFilePath === invokedFilePath) {
  main();
}
