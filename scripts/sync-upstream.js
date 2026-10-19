import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const dataDir = path.resolve(rootDir, "src/data");
const useProbeTestFile = path.resolve(rootDir, "src/composables/useProbeTest.ts");
const storeProbeTestFile = path.resolve(rootDir, "src/stores/probeTest.ts");

// 默认配置
export const DEFAULT_REPO = "xqy2006/ModelTrace";
export const DEFAULT_BRANCH = "main";
export const FILES_TO_SYNC = [
  { remote: "data/unified_bank.json", local: "unified_bank.json", required: true },
  { remote: "data/claude_bank.json", local: "claude_bank.json", required: false },
  { remote: "data/gpt_bank.json", local: "gpt_bank.json", required: false },
];

// 终端颜色配置
export const colors = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  cyan: "\x1b[36m",
  red: "\x1b[31m",
  magenta: "\x1b[35m",
};

export function log(msg = "") {
  console.log(msg);
}

export function logInfo(msg) {
  console.log(`${colors.cyan}ℹ${colors.reset} ${msg}`);
}

export function logSuccess(msg) {
  console.log(`${colors.green}✔${colors.reset} ${msg}`);
}

export function logWarn(msg) {
  console.log(`${colors.yellow}⚠${colors.reset} ${msg}`);
}

export function logError(msg) {
  console.log(`${colors.red}✖${colors.reset} ${msg}`);
}

/**
 * 规范化文本以进行无损比较（消除 Windows CRLF / LF 及首尾空白差异）
 */
export function normalizeText(text) {
  if (typeof text !== "string") return "";
  return text.replace(/\r\n/g, "\n").trim();
}

/**
 * 对比两组模型的 ID 差异
 */
export function compareBankModels(oldModels = [], newModels = []) {
  const oldIds = new Set((oldModels || []).map((m) => (typeof m === "string" ? m : m?.id)).filter(Boolean));
  const newIds = (newModels || []).map((m) => (typeof m === "string" ? m : m?.id)).filter(Boolean);
  const newIdSet = new Set(newIds);

  const added = newIds.filter((id) => !oldIds.has(id));
  const removed = [...oldIds].filter((id) => !newIdSet.has(id));

  return {
    added,
    removed,
    isModelListEqual: added.length === 0 && removed.length === 0,
  };
}

/**
 * 校验 unified_bank.json 结构合法性
 */
export function validateBank(bankObj) {
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
 * 详细对比本地文件与远程文件内容差异
 */
export function compareBankFile(localRaw, remoteRaw, isUnifiedBank = false) {
  const remoteNorm = normalizeText(remoteRaw);
  const remoteSizeKb = (remoteRaw.length / 1024).toFixed(1);

  if (localRaw === null || localRaw === undefined) {
    return {
      status: "added",
      summary: "本地缺失该文件 (上游新增)",
      details: [`文件大小: ${remoteSizeKb} KB`],
      fileSizeKb: remoteSizeKb,
      modelsDiff: null,
    };
  }

  const localNorm = normalizeText(localRaw);
  const localSizeKb = (localRaw.length / 1024).toFixed(1);

  if (localNorm === remoteNorm) {
    return {
      status: "unchanged",
      summary: "与本地完全一致 (无需更新)",
      details: [`文件内容与大小无变化 (${remoteSizeKb} KB)`],
      fileSizeKb: remoteSizeKb,
      modelsDiff: null,
    };
  }

  // 内容有差异
  if (isUnifiedBank) {
    try {
      const localParsed = JSON.parse(localRaw);
      const remoteParsed = JSON.parse(remoteRaw);
      const modelsDiff = compareBankModels(localParsed?.models, remoteParsed?.models);
      const details = [];

      if (modelsDiff.added.length > 0) {
        details.push(`+ 新增模型 (${modelsDiff.added.length}): ${modelsDiff.added.join(", ")}`);
      }
      if (modelsDiff.removed.length > 0) {
        details.push(`- 移除模型 (${modelsDiff.removed.length}): ${modelsDiff.removed.join(", ")}`);
      }
      if (modelsDiff.isModelListEqual) {
        details.push(`模型清单保持一致 (共 ${remoteParsed?.models?.length || 0} 个)，指纹特征或校准参数已调整`);
      }
      details.push(`文件大小: 本地 ${localSizeKb} KB -> 上游 ${remoteSizeKb} KB`);

      return {
        status: "modified",
        summary: modelsDiff.isModelListEqual ? "检测到特征参数更新" : "检测到模型清单变动",
        details,
        fileSizeKb: remoteSizeKb,
        modelsDiff,
      };
    } catch {
      // JSON 解析失败则降级为普通文件差异展示
    }
  }

  return {
    status: "modified",
    summary: "检测到内容更新",
    details: [`文件大小: 本地 ${localSizeKb} KB -> 上游 ${remoteSizeKb} KB`],
    fileSizeKb: remoteSizeKb,
    modelsDiff: null,
  };
}

/**
 * 检查代码中的回退默认模型数量是否与目标数量一致
 */
export function checkFallbackDiff(targetModelCount, files = [storeProbeTestFile, useProbeTestFile]) {
  const regex = /(const\s+totalBankModelsCount\s*=\s*unifiedBank\?\.models\?\.length\s*\|\|\s*)(\d+);/;
  const diffs = [];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf-8");
    const match = content.match(regex);
    if (match && Number(match[2]) !== targetModelCount) {
      diffs.push({
        file,
        fileName: path.basename(file),
        current: Number(match[2]),
        target: targetModelCount,
      });
    }
  }
  return diffs;
}

/**
 * 更新 fallback 默认模型数量
 */
export function updateProbeTestFallback(modelCount, files = [storeProbeTestFile, useProbeTestFile]) {
  const regex = /(const\s+totalBankModelsCount\s*=\s*unifiedBank\?\.models\?\.length\s*\|\|\s*)\d+;/;

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    const content = fs.readFileSync(file, "utf-8");
    if (regex.test(content)) {
      const updated = content.replace(regex, `$1${modelCount};`);
      if (updated !== content) {
        fs.writeFileSync(file, updated, "utf-8");
        logSuccess(`已自动同步 ${colors.cyan}${path.basename(file)}${colors.reset} 默认模型数量为 ${colors.bold}${modelCount}${colors.reset}`);
      }
    }
  }
}

/**
 * 获取上游最新提交元数据
 */
export async function fetchLatestCommit(repo = DEFAULT_REPO, branch = DEFAULT_BRANCH) {
  const url = `https://api.github.com/repos/${repo}/commits/${branch}`;
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "ModelTrace-Sync-Tool/1.0",
        Accept: "application/vnd.github.v3+json",
      },
    });
    if (!res.ok) {
      logWarn(`无法获取 GitHub 提交信息 (HTTP ${res.status})，将直接通过原始文件比对`);
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
export async function fetchRemoteFile(remotePath, repo = DEFAULT_REPO, branch = DEFAULT_BRANCH) {
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
 * 主执行函数
 */
export async function main() {
  const args = process.argv.slice(2);
  const isDryRun = args.includes("--dry-run") || args.includes("--check") || args.includes("-c");
  const isHelp = args.includes("--help") || args.includes("-h");

  if (isHelp) {
    log(`
${colors.bold}${colors.cyan}ModelTrace 上游快速同步脚本${colors.reset}

${colors.bold}用法:${colors.reset}
  node scripts/sync-upstream.js [options]
  npm run sync
  npm run sync:check

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

  log(`\n${colors.bold}${colors.magenta}=== ModelTrace 上游指纹库快速同步工具 ===${colors.reset}`);
  logInfo(`目标仓库: ${colors.bold}${repo}${colors.reset} (${colors.cyan}${branch}${colors.reset})`);
  if (isDryRun) {
    logWarn(`当前处于 ${colors.bold}Dry-run (仅检查模式)${colors.reset}，不会修改任何本地文件`);
  }
  log();

  // 1. 检查最新 Commit
  logInfo("正在检查上游最新提交版本...");
  const commit = await fetchLatestCommit(repo, branch);
  if (commit) {
    log(`  ${colors.dim}Commit SHA:${colors.reset} ${colors.green}${commit.sha}${colors.reset}`);
    log(`  ${colors.dim}提交时间:${colors.reset}   ${commit.date}`);
    log(`  ${colors.dim}提交说明:${colors.reset}   ${commit.message}`);
  }
  log();

  // 确保数据目录存在
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  // 2. 拉取并逐一比对指纹库文件
  logInfo("正在拉取与比对指纹库数据...");
  log();

  const comparisonResults = [];
  let unifiedModelCount = 0;

  for (const item of FILES_TO_SYNC) {
    const localFilePath = path.resolve(dataDir, item.local);
    logInfo(`正在比对 ${colors.cyan}${item.remote}${colors.reset} ...`);

    try {
      const rawText = await fetchRemoteFile(item.remote, repo, branch);
      const parsed = JSON.parse(rawText);

      if (item.local === "unified_bank.json") {
        validateBank(parsed);
        unifiedModelCount = parsed.models.length;
      }

      let localRaw = null;
      if (fs.existsSync(localFilePath)) {
        try {
          localRaw = fs.readFileSync(localFilePath, "utf-8");
        } catch {
          // ignore
        }
      }

      const diff = compareBankFile(localRaw, rawText, item.local === "unified_bank.json");

      if (diff.status === "unchanged") {
        logSuccess(`${colors.bold}${item.local}${colors.reset}: ${colors.green}【完全一致】${colors.reset}${colors.dim}本地已是最新版本${colors.reset}`);
        if (item.local === "unified_bank.json") {
          log(`  ${colors.dim}本地与上游均包含 ${unifiedModelCount} 个模型，特征数据完全一致 (${diff.fileSizeKb} KB)${colors.reset}`);
        } else {
          for (const line of diff.details) {
            log(`  ${colors.dim}${line}${colors.reset}`);
          }
        }
      } else if (diff.status === "modified") {
        logWarn(`${colors.bold}${item.local}${colors.reset}: ${colors.yellow}【存在更新】${diff.summary}${colors.reset}`);
        for (const line of diff.details) {
          log(`  ${colors.yellow}${line}${colors.reset}`);
        }
      } else {
        logWarn(`${colors.bold}${item.local}${colors.reset}: ${colors.cyan}【本地缺失】${diff.summary}${colors.reset}`);
        for (const line of diff.details) {
          log(`  ${colors.cyan}${line}${colors.reset}`);
        }
      }

      // 如果不是 dry-run 且文件需要写入
      if (!isDryRun) {
        if (diff.status !== "unchanged") {
          fs.writeFileSync(localFilePath, rawText, "utf-8");
          log(`  ${colors.green}✔ 已成功写入本地文件${colors.reset}`);
        } else {
          log(`  ${colors.dim}本地已是最新，跳过覆写${colors.reset}`);
        }
      }

      comparisonResults.push({
        item,
        diff,
      });
      log();
    } catch (err) {
      if (item.required) {
        logError(`拉取必需文件 ${item.remote} 失败: ${err instanceof Error ? err.message : String(err)}`);
        process.exit(1);
      } else {
        logWarn(`拉取可选文件 ${item.remote} 失败（可忽略）: ${err instanceof Error ? err.message : String(err)}`);
        log();
      }
    }
  }

  // 3. 检查与更新源码 fallback 模型计数
  const fallbackDiffs = unifiedModelCount > 0 ? checkFallbackDiff(unifiedModelCount) : [];
  if (fallbackDiffs.length > 0) {
    if (isDryRun) {
      logWarn(`源码回退配置: 检测到 ${fallbackDiffs.map((d) => d.fileName).join(", ")} 模型数量需同步 (${fallbackDiffs[0].current} -> ${unifiedModelCount})`);
    } else {
      updateProbeTestFallback(unifiedModelCount);
    }
    log();
  }

  // 4. 最终状态判定与汇总展示
  const changedFiles = comparisonResults.filter((r) => r.diff.status !== "unchanged");
  const hasChanges = changedFiles.length > 0 || fallbackDiffs.length > 0;

  if (isDryRun) {
    if (!hasChanges) {
      log(`${colors.bold}${colors.green}============================================================${colors.reset}`);
      log(`${colors.bold}${colors.green}🎉 【无需更新】本地指纹库已是最新版本！${colors.reset}`);
      log(`   所有指纹文件与上游仓库完全一致 (包含 ${colors.bold}${unifiedModelCount}${colors.reset} 个模型)，无需执行同步。`);
      log(`${colors.bold}${colors.green}============================================================${colors.reset}`);
    } else {
      log(`${colors.bold}${colors.yellow}============================================================${colors.reset}`);
      log(`${colors.bold}${colors.yellow}📢 【检测到更新】上游指纹库有新版本可用！${colors.reset}`);
      log(`   待更新项目:`);
      for (const r of changedFiles) {
        const detailStr = r.diff.details[0] ? ` (${r.diff.details[0]})` : "";
        log(`   • ${colors.cyan}${r.item.local}${colors.reset}: ${r.diff.summary}${detailStr}`);
      }
      if (fallbackDiffs.length > 0) {
        log(`   • 源码默认模型计数: 将从 ${fallbackDiffs[0].current} 同步为 ${unifiedModelCount}`);
      }
      log();
      log(`   👉 若需将最新指纹库写入本地，请运行:`);
      log(`      ${colors.bold}${colors.cyan}npm run sync${colors.reset}`);
      log(`${colors.bold}${colors.yellow}============================================================${colors.reset}`);
    }
  } else {
    if (!hasChanges) {
      log(`${colors.bold}${colors.green}============================================================${colors.reset}`);
      log(`${colors.bold}${colors.green}✔ 【已是最新】本地指纹库与上游完全一致，未进行任何覆写。${colors.reset}`);
      log(`   当前指纹库共包含 ${colors.bold}${unifiedModelCount}${colors.reset} 个模型。`);
      log(`${colors.bold}${colors.green}============================================================${colors.reset}`);
    } else {
      log(`${colors.bold}${colors.green}============================================================${colors.reset}`);
      log(`${colors.bold}${colors.green}✔ 【同步完成】已成功更新本地指纹库！${colors.reset}`);
      log(`   已更新 ${colors.bold}${changedFiles.length}${colors.reset} 个文件，当前指纹库共包含 ${colors.bold}${unifiedModelCount}${colors.reset} 个模型。`);
      log(`${colors.bold}${colors.green}============================================================${colors.reset}`);
    }
  }
  log();
}

// CLI 执行入口
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith("sync-upstream.js") ||
  process.argv[1].endsWith("sync-upstream.mjs")
);

if (isDirectRun) {
  main().catch((err) => {
    logError(`同步异常: ${err instanceof Error ? err.stack || err.message : String(err)}`);
    process.exit(1);
  });
}
