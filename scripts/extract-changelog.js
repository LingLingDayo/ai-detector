import fs from 'node:fs';
import path from 'node:path';

/**
 * 转义正则表达式中的特殊字符
 *
 * @param {string} str
 * @returns {string}
 */
function escapeRegExp(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 从 CHANGELOG.md 中提取指定版本（或最新版本）的发布日志
 *
 * @param {string} changelogContent CHANGELOG.md 的完整文本
 * @param {string} [targetTag=''] 触发的 tag 名称，例如 "v1.0.0"、"1.0.0" 或 "refs/tags/v1.0.0"
 * @returns {string} 提取出的 Release Notes Markdown 内容
 */
export function extractChangelog(changelogContent, targetTag = '') {
  if (!changelogContent || typeof changelogContent !== 'string') {
    return 'No changelog content available.';
  }

  // 统一换行符为 \n
  const content = changelogContent.replace(/\r\n/g, '\n');
  const lines = content.split('\n');

  // 匹配所有二级标题 (## ...)
  const sections = [];
  const headingRegex = /^##\s+(.+)$/;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(headingRegex);
    if (match) {
      sections.push({
        lineIndex: i,
        rawHeader: lines[i],
        title: match[1].trim(),
      });
    }
  }

  if (sections.length === 0) {
    return content.trim();
  }

  // 清洗目标 tag
  const rawTag = (targetTag || '').trim();
  const normalizedTag = rawTag.replace(/^refs\/tags\//i, '').trim();
  const cleanTag = normalizedTag.replace(/^v/i, '').trim();

  let selectedIndex = -1;

  if (cleanTag) {
    const escapedClean = escapeRegExp(cleanTag);
    const escapedNorm = escapeRegExp(normalizedTag);
    // 匹配如 "## [1.0.0]", "## [v1.0.0]", "## 1.0.0 - 2026-10-12", "## [1.0.0] - 2026-10-12"
    const versionRegex = new RegExp(
      `(^|[\\[\\s/v]|version\\s+|release\\s+)(${escapedClean}|${escapedNorm})(\\]|[\\s/-]|$)`,
      'i'
    );

    for (let i = 0; i < sections.length; i++) {
      if (versionRegex.test(sections[i].title)) {
        selectedIndex = i;
        break;
      }
    }

    // 如果指定了具体 tag 但未在 CHANGELOG 中找到匹配项，给出安全友好的提示信息
    if (selectedIndex === -1) {
      console.warn(`[WARN] 未在 CHANGELOG.md 中找到版本 "${normalizedTag}" 的对应条目`);
      return `### 版本 ${normalizedTag}\n\n*CHANGELOG.md 中暂未记录该版本的详细说明，请参考 Git 提交历史。*`;
    }
  } else {
    // 未指定 tag 时，跳过 Unreleased / 未发布等占位块，优先选取第一个正式发布的版本
    for (let i = 0; i < sections.length; i++) {
      if (!/unreleased|未发布/i.test(sections[i].title)) {
        selectedIndex = i;
        break;
      }
    }
    // 若全是 Unreleased，则兜底选第一个
    if (selectedIndex === -1) {
      selectedIndex = 0;
    }
  }

  const startLine = sections[selectedIndex].lineIndex;
  const endLine = selectedIndex + 1 < sections.length
    ? sections[selectedIndex + 1].lineIndex
    : lines.length;

  // 提取对应区块内容（排除二级标题行）
  const sectionLines = lines.slice(startLine + 1, endLine);

  // 过滤末尾可能存在的 Markdown 链接引用定义，如 `[1.0.0]: https://...`
  let filteredLines = sectionLines.filter(line => !/^\[.*?\]:\s*https?:\/\//.test(line));

  // 移除开头多余的空行和分隔线
  while (filteredLines.length > 0) {
    const first = filteredLines[0].trim();
    if (first === '' || /^(-{3,}|\*{3,}|_{3,})$/.test(first)) {
      filteredLines.shift();
    } else {
      break;
    }
  }

  // 移除尾部多余的分隔线（如 `---`, `***` 等）及空白行
  while (filteredLines.length > 0) {
    const last = filteredLines[filteredLines.length - 1].trim();
    if (last === '' || /^(-{3,}|\*{3,}|_{3,})$/.test(last)) {
      filteredLines.pop();
    } else {
      break;
    }
  }

  const result = filteredLines.join('\n').trim();
  return result || `### 版本 ${normalizedTag || 'Release'}\n\n*暂无该版本的具体更新日志。*`;
}

// CLI 执行入口
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('extract-changelog.js') ||
  process.argv[1].endsWith('extract-changelog.mjs')
);

if (isDirectRun) {
  const changelogPath = process.argv[2] || 'CHANGELOG.md';
  const outputPath = process.argv[3] || 'RELEASE_NOTES.md';
  const targetTag = process.argv[4] || process.env.GITHUB_REF_NAME || process.env.GITHUB_REF || '';

  const fullChangelogPath = path.resolve(process.cwd(), changelogPath);
  let notes = 'No changelog found.';

  if (fs.existsSync(fullChangelogPath)) {
    const rawContent = fs.readFileSync(fullChangelogPath, 'utf-8');
    notes = extractChangelog(rawContent, targetTag);
  } else {
    console.warn(`[WARN] Changelog file not found at ${fullChangelogPath}`);
  }

  // 输出到文件
  const fullOutputPath = path.resolve(process.cwd(), outputPath);
  fs.writeFileSync(fullOutputPath, notes, 'utf-8');
  console.log(`[INFO] Extracted changelog successfully written to: ${outputPath}`);
  console.log(`\n--- Release Notes Preview ---\n${notes}\n----------------------------\n`);

  // 如果在 GitHub Actions 环境中，写入 GITHUB_OUTPUT
  if (process.env.GITHUB_OUTPUT) {
    const delimiter = `EOF_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    fs.appendFileSync(
      process.env.GITHUB_OUTPUT,
      `changelog<<${delimiter}\n${notes}\n${delimiter}\n`
    );
    console.log('[INFO] Exported "changelog" output to GITHUB_OUTPUT');
  }
}
