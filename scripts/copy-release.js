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

  const chineseProductName = "ModelTrace模型检测工具";
  const bundleDir = options.bundleDir || path.resolve(rootDir, "src-tauri/target/release/bundle");
  const releaseBinDir = options.releaseBinDir || path.resolve(rootDir, "src-tauri/target/release");

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const candidateFileMap = new Map();

  // 1. 扫描 bundle 目录安装包（如果生成了的话）
  if (fs.existsSync(bundleDir)) {
    const allBundleFiles = getAllFiles(bundleDir);
    const validExtensions = new Set([".exe", ".msi", ".deb", ".appimage", ".dmg", ".pkg", ".zip", ".tar.gz"]);

    for (const filePath of allBundleFiles) {
      const ext = path.extname(filePath).toLowerCase();
      const filename = path.basename(filePath);

      if (validExtensions.has(ext)) {
        candidateFileMap.set(filename, filePath);
      }
    }
  }

  // 2. 检查 target/release 目录下的可执行文件
  const possibleBinaries = [
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
      candidateFileMap.set(binName, binPath);
      break;
    }
  }

  // 3. 生成中文名称直接可执行程序
  if (foundBinPath) {
    const ext = path.extname(foundBinName) || (process.platform === "win32" ? ".exe" : "");
    const chineseBinName = `${chineseProductName}${ext}`;
    candidateFileMap.set(chineseBinName, foundBinPath);
  }

  if (candidateFileMap.size === 0) {
    console.warn(`\x1b[33m[发布归档] 未在 release 产物目录中找到生成的可执行文件。\x1b[0m`);
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
