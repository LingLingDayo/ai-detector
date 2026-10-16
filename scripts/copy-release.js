import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

export function formatFileSize(bytes) {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(2)} ${units[i]}`;
}

export function getAllFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...getAllFiles(fullPath));
    } else if (entry.isFile()) {
      files.push(fullPath);
    }
  }

  return files;
}

export function copyReleaseArtifacts(options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const targetDir = options.targetDir || path.resolve(rootDir, "release");

  let version = options.version;
  if (!version) {
    try {
      const pkgPath = path.resolve(rootDir, "package.json");
      if (fs.existsSync(pkgPath)) {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
        version = pkg.version;
      }
    } catch {
      version = "";
    }
  }

  let productName = options.productName;
  if (!productName) {
    try {
      const tauriConfPath = path.resolve(rootDir, "src-tauri/tauri.conf.json");
      if (fs.existsSync(tauriConfPath)) {
        const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, "utf-8"));
        productName = tauriConf.productName;
      }
    } catch {
      productName = "AI模型检测器";
    }
  }
  if (!productName) {
    productName = "AI模型检测器";
  }

  const chineseProductName = "AI模型检测器";
  const standardEnglishName = "AI-Detector";
  const bundleDir = options.bundleDir || path.resolve(rootDir, "src-tauri/target/release/bundle");
  const releaseBinDir = options.releaseBinDir || path.resolve(rootDir, "src-tauri/target/release");

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const candidateFileMap = new Map();

  // 1. 扫描 bundle 目录安装包（NSIS / MSI 等）
  const possibleBundleDirs = [
    bundleDir,
    path.resolve(rootDir, "src-tauri/target/release/bundle"),
    path.resolve(rootDir, "target/release/bundle"),
  ];

  for (const dir of possibleBundleDirs) {
    if (fs.existsSync(dir)) {
      const allBundleFiles = getAllFiles(dir);
      const validExtensions = new Set([".exe", ".msi", ".deb", ".appimage", ".dmg", ".pkg"]);

      for (const filePath of allBundleFiles) {
        const ext = path.extname(filePath).toLowerCase();
        let filename = path.basename(filePath);

        // 仅收集安装包文件（排除非安装包以及旧版本残留）
        if (validExtensions.has(ext)) {
          // 兜底将中文产品名替换为规范英文名
          filename = filename.replace(/AI模型检测器/g, standardEnglishName);
          if (version) {
            if (filename.includes(version)) {
              candidateFileMap.set(filename, filePath);
            }
          } else {
            candidateFileMap.set(filename, filePath);
          }
        }
      }
      break;
    }
  }

  // 2. 检查 target/release 目录下的可执行文件
  const possibleBinaries = [
    "ai-detector.exe",
    "ai-detector",
    "AI-Detector.exe",
    "AI-Detector",
    "AI Detector.exe",
    "AI Detector",
    `${chineseProductName}.exe`,
    chineseProductName,
    `${productName}.exe`,
    productName,
    "modeltrace-ai-detector.exe",
    "modeltrace-ai-detector",
    "ModelTrace-AI-Detector.exe",
    "ModelTrace-AI-Detector",
    "ModelTrace AI Detector.exe",
    "ModelTrace AI Detector",
    "modeltrace-tool.exe",
    "modeltrace-tool",
    "ModelTrace.exe",
    "ModelTrace",
  ];

  let foundBinName = null;
  let foundBinPath = null;

  for (const binName of possibleBinaries) {
    const binPath = path.join(releaseBinDir, binName);
    if (fs.existsSync(binPath) && fs.statSync(binPath).isFile()) {
      foundBinName = binName;
      foundBinPath = binPath;
      break;
    }
  }

  // 3. 规范化独立可执行程序归档名称（仅保留标准英文名称）
  if (foundBinPath) {
    const ext = path.extname(foundBinName) || (process.platform === "win32" ? ".exe" : "");
    // 规范英文包名（例如 AI-Detector.exe）
    const standardBinName = `${standardEnglishName}${ext}`;
    candidateFileMap.set(standardBinName, foundBinPath);
  }

  if (candidateFileMap.size === 0) {
    console.warn(`\x1b[33m[发布归档] 未在 release 产物目录中找到生成的可执行文件或安装包。\x1b[0m`);
    return { success: false, copiedFiles: [] };
  }

  console.log(`\x1b[36m正在将构建产物归档至 release 目录: ${targetDir}...\x1b[0m`);

  const copiedFiles = [];

  for (const [filename, srcPath] of candidateFileMap.entries()) {
    const destPath = path.join(targetDir, filename);

    try {
      fs.copyFileSync(srcPath, destPath);
      const stats = fs.statSync(destPath);
      copiedFiles.push({
        name: filename,
        src: srcPath,
        dest: destPath,
        size: stats.size,
      });

      console.log(`  \x1b[32m✔ 已归档: ${filename} (${formatFileSize(stats.size)})\x1b[0m`);
    } catch (err) {
      if (err.code === "EBUSY" || err.code === "EPERM") {
        console.warn(`  \x1b[33m⚠ 文件被占用（可能正在运行），跳过覆盖: ${filename}\x1b[0m`);
      } else {
        throw err;
      }
    }
  }

  console.log(`\x1b[32m✔ [发布归档完成] 成功生成 ${copiedFiles.length} 个文件至 release 目录。\x1b[0m\n`);
  return { success: true, copiedFiles };
}

const currentFilePath = fileURLToPath(import.meta.url);
const invokedFilePath = process.argv[1] ? path.resolve(process.argv[1]) : "";

if (currentFilePath === invokedFilePath) {
  copyReleaseArtifacts();
}
