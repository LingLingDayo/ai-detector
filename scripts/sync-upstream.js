import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, "src/data");
const useProbeTestFile = path.resolve(rootDir, "src/composables/useProbeTest.ts");

// 默认配置
const DEFAULT_REPO = "xqy2006/ModelTrace";
const DEFAULT_BRANCH = "main";
const FILES_TO_SYNC = [
  { remote: "data/unified_bank.json", local: "unified_bank.json", required: true },
  { remote: "data/claude_bank.json", local: "claude_bank.json", required: false },
  { remote: "data/gpt_bank.json", local: "gpt_bank.json", required: false },
];

// 颜色工具
const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

function log(msg = "") {
  console.log(msg);
}

function logInfo(msg) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

function logSuccess(msg) {
  console.log(`${colors.green}✔${colors.reset} ${msg}`);
}

function logWarn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

function logError(msg) {
  console.log(`${colors.red}✖${colors.reset} ${msg}`);
}

// 解析命令行参数
const args = process.argv.slice(2);
const isDryRun = args.includes("--dry-run") || args.includes("--check") || args.includes("-c");
const isHelp = args.includes("--help") || args.includes("-h");

if (isHelp) {
  log(`
${colors.bold}${colors.cyan}ModelTrace 上游快速同步脚本${colors.reset}

${colors.bold}用法:${colors.reset}
  node scripts/sync-upstream.js [options]
  npm run sync

${colors.bold}选项:${colors.reset}
  -c, --check, --dry-run  仅检查并对比上游更新，不写入本地文件
  --repo <owner/repo>     指定上游仓库（默认: ${DEFAULT_REPO}）
  --branch <branch>       指定上游分支（默认: ${DEFAULT_BRANCH}）
  -h, --help              查看帮助信息
`);
  process.exit(0);
}

const repoArgIndex = args.indexOf("--repo");
const repo = repoArgIndex !== -1 && args[repoArgIndex + 1] ? args[repoArgIndex + 1] : DEFAULT_REPO;

const branchArgIndex = args.indexOf("--branch");
const branch = branchArgIndex !== -1 && args[branchArgIndex + 1] ? args[branchArgIndex + 1] : DEFAULT_BRANCH;

/**
 * 获取上游最新提交元数据
 */
async function fetchLatestCommit() {
  const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ModelTrace-Sync-Tool/1.0",
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) {
      logWarn(`无法获取 GitHub 提交信息 (HTTP ${res.status})，将直接通过原始文件同步`);
      return null;
    }
    const data = await res.json();
    return {
      sha: data.sha?.slice(0, 7) || "unknown",
      fullSha: data.sha,
      date: data.commit?.author?.date || "",
      message: (data.commit?.message || "").split("\n")[0],
    };
  } catch (err) {
    logWarn(`获取提交信息失败: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

/**
 * 下载指定远程文件文本
 */
async function fetchRemoteFile(remotePath) {
  const rawUrl = `https://raw.githubusercontent.com/${repo}/${branch}/${remotePath}`;
  const res = await fetch(rawUrl, {
    headers: {
      "User-Agent": "ModelTrace-Sync-Tool/1.0",
    },
  });
  if (!res.ok) {
    throw new Error(`下载失败 HTTP ${res.status}: ${rawUrl}`);
  }
  return await res.text();
}

/**
 * 校验 unified_bank.json 结构合法性
 */
function validateBank(bankObj) {
  if (!bankObj || typeof bankObj !== "object") {
    throw new Error("指纹库内容不是有效的 JSON 对象");
  }
  if (!Array.isArray(bankObj.models) || bankObj.models.length === 0) {
    throw new Error("指纹库中未找到有效的 models 列表");
  }
  if (!bankObj.calibration || typeof bankObj.calibration !== "object") {
    throw new Error("指纹库缺少 calibration 校准数据");
  }
  if (!bankObj.robust || typeof bankObj.robust !== "object") {
    throw new Error("指纹库缺少 robust 稳健特征数据");
  }
}

/**
 * 更新 useProbeTest.ts 中的 fallback 默认数量
 */
function updateProbeTestFallback(modelCount) {
  if (!fs.existsSync(useProbeTestFile)) return;
  const content = fs.readFileSync(useProbeTestFile, "utf-8");
  const regex = /(const\s+totalBankModelsCount\s*=\s*unifiedBank\?\.models\?\.length\s*\|\|\s*)\d+;/;
  if (regex.test(content)) {
    const updated = content.replace(regex, `$1${modelCount};`);
    if (updated !== content) {
      fs.writeFileSync(useProbeTestFile, updated, "utf-8");
      logSuccess(`已自动同步 ${colors.cyan}useProbeTest.ts${colors.reset} 默认模型数量为 ${colors.bold}${modelCount}${colors.reset}`);
    }
  }
}

/**
 * 主执行函数
 */
async function main() {
  log(`\n${colors.bold}${colors.magenta}=== ModelTrace 上游指纹库快速同步工具 ===${colors.reset}`);
  logInfo(`目标仓库: ${colors.bold}${repo}${colors.reset} (${colors.cyan}${branch}${colors.reset})`);
  if (isDryRun) {
    logWarn(`当前处于 ${colors.bold}Dry-run (仅检查模式)${colors.reset}，不会修改任何本地文件`);
  }
  log();

  // 1. 检查最新 Commit
  logInfo("正在检查上游最新版本...");
  const commit = await fetchLatestCommit();
  if (commit) {
    log(`  ${colors.dim}Commit SHA:${colors.reset} ${colors.green}${commit.sha}${colors.reset}`);
    log(`  ${colors.dim}提交时间:${colors.reset}   ${commit.date}`);
    log(`  ${colors.dim}提交说明:${colors.reset}   ${commit.message}`);
  }
  log();

  // 2. 读取本地已有的 unified_bank.json 作为比对
  let localBank = null;
  const localUnifiedPath = path.resolve(dataDir, "unified_bank.json");
  if (fs.existsSync(localUnifiedPath)) {
    try {
      localBank = JSON.parse(fs.readFileSync(localUnifiedPath, "utf-8"));
    } catch {
      // 忽略
    }
  }

  // 确保数据目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 3. 下载并处理所有数据文件
  let newModelCount = 0;
  for (const item of FILES_TO_SYNC) {
    const localFilePath = path.resolve(dataDir, item.local);
    logInfo(`正在拉取 ${colors.cyan}${item.remote}${colors.reset} ...`);
    try {
      const rawText = await fetchRemoteFile(item.remote);
      const parsed = JSON.parse(rawText);

      // 如果是 unified_bank.json，进行结构校验和差异分析
      if (item.local === "unified_bank.json") {
        validateBank(parsed);
        newModelCount = parsed.models.length;

        const newModelIds = parsed.models.map((m) => m.id);
        logSuccess(`下载并校验成功 (${(rawText.length / 1024).toFixed(1)} KB，包含 ${newModelCount} 个模型)`);

        if (localBank && Array.isArray(localBank.models)) {
          const oldModelIds = new Set(localBank.models.map((m) => m.id));
          const added = newModelIds.filter((id) => !oldModelIds.has(id));
          const removed = [...oldModelIds].filter((id) => !newModelIds.includes(id));

          if (added.length > 0) {
            log(`  ${colors.green}+ 新增模型 (${added.length}):${colors.reset} ${added.join(", ")}`);
          }
          if (removed.length > 0) {
            log(`  ${colors.red}- 移除模型 (${removed.length}):${colors.reset} ${removed.join(", ")}`);
          }
          if (added.length === 0 && removed.length === 0) {
            log(`  ${colors.dim}模型清单与本地完全一致 (共 ${newModelCount} 个)${colors.reset}`);
          }
        }
      } else {
        logSuccess(`拉取完成: ${item.local} (${(rawText.length / 1024).toFixed(1)} KB)`);
      }

      // 如果不是 dry-run，写入文件
      if (!isDryRun) {
        fs.writeFileSync(localFilePath, rawText, "utf-8");
      }
    } catch (err) {
      if (item.required) {
        logError(`拉取必需文件 ${item.remote} 失败: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      } else {
        logWarn(`拉取可选文件 ${item.remote} 失败（可忽略）: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  // 4. 更新相关代码配置
  if (!isDryRun && newModelCount > 0) {
    updateProbeTestFallback(newModelCount);
  }

  log();
  if (isDryRun) {
    logSuccess("检查完成！若需写入更新，请运行: npm run sync");
  } else {
    logSuccess(`${colors.bold}同步全部完成！当前指纹库包含 ${newModelCount} 个模型。${colors.reset}\n`);
  }
}

main().catch((err) => {
  logError(`同步异常: ${err instanceof Error ? err.stack || err.message : String(err)}`);
  process.exit(1);
});
