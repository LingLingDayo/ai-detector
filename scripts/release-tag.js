import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execSync } from 'node:child_process';
import { extractChangelog } from './extract-changelog.js';

function runGit(command) {
  try {
    return execSync(command, { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'pipe'] }).trim();
  } catch (err) {
    throw new Error(`Git 命令执行失败 [${command}]: ${err.stderr || err.message}`);
  }
}

function normalizeTag(versionOrTag) {
  const clean = versionOrTag.trim().replace(/^refs\/tags\//, '');
  return clean.startsWith('v') ? clean : `v${clean}`;
}

function getCleanVersion(versionOrTag) {
  return normalizeTag(versionOrTag).replace(/^v/, '');
}

function main() {
  const args = process.argv.slice(2);
  const isPush = args.includes('--push');
  const isDryRun = args.includes('--dry-run');
  const isForce = args.includes('--force');

  const versionArg = args.find(arg => !arg.startsWith('--'));

  const rootDir = process.cwd();
  const pkgPath = path.resolve(rootDir, 'package.json');
  const tauriConfPath = path.resolve(rootDir, 'src-tauri/tauri.conf.json');
  const cargoTomlPath = path.resolve(rootDir, 'src-tauri/Cargo.toml');
  const changelogPath = path.resolve(rootDir, 'CHANGELOG.md');

  if (!fs.existsSync(pkgPath)) {
    console.error('❌ 未找到 package.json 文件，请在项目根目录下执行。');
    process.exit(1);
  }

  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const currentVersion = pkg.version || '1.0.0';
  const targetTag = versionArg ? normalizeTag(versionArg) : `v${currentVersion}`;
  const cleanVersion = getCleanVersion(targetTag);

  console.log('='.repeat(50));
  console.log(`🚀 自动发版 Tag 发布辅助工具`);
  console.log(`   目标版本: ${cleanVersion}`);
  console.log(`   目标 Tag: ${targetTag}`);
  console.log('='.repeat(50));

  // 1. 检查 Git 仓库状态
  try {
    const status = runGit('git status --porcelain');
    if (status && !isForce) {
      console.warn('\n⚠️  检测到工作区存在未提交的更改:');
      console.warn(status);
      console.warn('建议先提交所有代码改动后再打 Tag，或使用 --force 参数跳过。\n');
      if (!isDryRun) {
        process.exit(1);
      }
    }
  } catch (err) {
    console.error(`❌ 获取 Git 状态失败:`, err.message);
    process.exit(1);
  }

  // 2. 检查 Tag 是否已存在
  const existingTags = runGit('git tag -l').split('\n').map(t => t.trim());
  if (existingTags.includes(targetTag)) {
    console.error(`\n❌ Git Tag "${targetTag}" 已存在！不可重复创建同名 Tag。`);
    console.log(`如需重新推送，请使用: git tag -d ${targetTag} 或指定更高版本号。`);
    process.exit(1);
  }

  // 3. 验证 CHANGELOG.md 是否记录了该版本
  if (fs.existsSync(changelogPath)) {
    const changelogContent = fs.readFileSync(changelogPath, 'utf-8');
    const releaseNotes = extractChangelog(changelogContent, targetTag);
    if (releaseNotes.includes('CHANGELOG.md 中暂未记录该版本的详细说明')) {
      console.warn(`\n⚠️  警告: CHANGELOG.md 中未找到版本 [${cleanVersion}] 的更新条目！`);
      console.warn('建议在 CHANGELOG.md 中添加该版本的更新记录后再发版。');
      if (!isForce) {
        console.log('若确认跳过 CHANGELOG 检查，请附带 --force 参数。');
        process.exit(1);
      }
    } else {
      console.log(`\n📋 成功匹配 CHANGELOG.md 更新日志:`);
      console.log(releaseNotes.split('\n').slice(0, 8).join('\n') + '\n...');
    }
  } else {
    console.warn('\n⚠️  未找到 CHANGELOG.md 文件。');
  }

  // 4. 同步各配置中的版本号 (若传入了显式版本)
  if (cleanVersion !== currentVersion) {
    console.log(`\n🔄 正在同步配置文件版本号为: ${cleanVersion}...`);

    if (!isDryRun) {
      pkg.version = cleanVersion;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
      console.log(`   ✓ package.json -> ${cleanVersion}`);

      if (fs.existsSync(tauriConfPath)) {
        const tauriConf = JSON.parse(fs.readFileSync(tauriConfPath, 'utf-8'));
        tauriConf.version = cleanVersion;
        fs.writeFileSync(tauriConfPath, JSON.stringify(tauriConf, null, 2) + '\n', 'utf-8');
        console.log(`   ✓ src-tauri/tauri.conf.json -> ${cleanVersion}`);
      }

      if (fs.existsSync(cargoTomlPath)) {
        let cargoContent = fs.readFileSync(cargoTomlPath, 'utf-8');
        cargoContent = cargoContent.replace(/^version\s*=\s*".*?"/m, `version = "${cleanVersion}"`);
        fs.writeFileSync(cargoTomlPath, cargoContent, 'utf-8');
        console.log(`   ✓ src-tauri/Cargo.toml -> ${cleanVersion}`);
      }

      // 提交版本文件更改
      runGit(`git add "${pkgPath}" "${tauriConfPath}" "${cargoTomlPath}"`);
      runGit(`git commit -m "chore: 升级版本号至 ${targetTag}"`);
      console.log(`   ✓ 已自动创建版本变更提交`);
    } else {
      console.log(`   [Dry Run] 将同步 package.json, tauri.conf.json, Cargo.toml 至 ${cleanVersion}`);
    }
  }

  // 5. 创建 Git Tag
  if (isDryRun) {
    console.log(`\n🔍 [Dry Run] 演练模式完成，未实际执行 git tag。`);
    console.log(`实际将执行: git tag -a ${targetTag} -m "Release ${targetTag}"`);
    return;
  }

  console.log(`\n🏷️  正在创建本地 Git Tag: ${targetTag}...`);
  runGit(`git tag -a ${targetTag} -m "Release ${targetTag}"`);
  console.log(`   ✓ Tag ${targetTag} 创建成功！`);

  // 6. 推送 Tag 触发自动发版
  // 获取当前配置的远程仓库名称 (优先 upstream，若无则 origin)
  let remote = 'origin';
  try {
    const remotes = runGit('git remote').split('\n').map(r => r.trim());
    if (remotes.includes('upstream')) {
      remote = 'upstream';
    } else if (remotes.includes('origin')) {
      remote = 'origin';
    } else if (remotes.length > 0) {
      remote = remotes[0];
    }
  } catch {}

  let currentBranch = 'master';
  try {
    currentBranch = runGit('git branch --show-current') || 'master';
  } catch {}

  if (isPush) {
    console.log(`\n📤 正在推送当前分支 (${currentBranch}) 到远程仓库 (${remote})...`);
    try {
      runGit(`git push ${remote} ${currentBranch}`);
      console.log(`   ✓ 分支 ${currentBranch} 推送成功！`);
    } catch (e) {
      console.warn(`   ⚠️  分支推送提示: ${e.message}`);
    }

    console.log(`\n📤 正在推送 Tag (${targetTag}) 到远程仓库 (${remote})...`);
    runGit(`git push ${remote} ${targetTag}`);
    console.log(`   ✓ Tag ${targetTag} 已成功推送到 ${remote}！`);
    console.log(`\n🎉 GitHub Actions 自动发版工作流已被触发！`);
    console.log(`可以在 GitHub 仓库的 "Actions" 标签页查看编译与发布进度。`);
  } else {
    console.log(`\n💡 本地 Tag 已准备就绪！`);
    console.log(`请确保同时推送当前分支代码与发版 Tag 到远程仓库 (${remote}):`);
    console.log(`\n   git push ${remote} ${currentBranch}`);
    console.log(`   git push ${remote} ${targetTag}\n`);
    console.log(`（提示: 下次可直接添加 --push 参数一键自动推送分支与 Tag: npm run release:tag -- --push）`);
  }
}

main();
