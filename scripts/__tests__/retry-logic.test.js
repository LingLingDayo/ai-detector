import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sleep } from "../../src/utils/timer.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const constantsFile = fs.readFileSync(path.resolve(__dirname, "../../src/constants.ts"), "utf-8");

const retryCountMatch = constantsFile.match(/DEFAULT_REQUEST_RETRY_COUNT\s*=\s*(\d+)/);
const retryDelayMatch = constantsFile.match(/DEFAULT_REQUEST_RETRY_DELAY_MS\s*=\s*(\d+)/);
const DEFAULT_REQUEST_RETRY_COUNT = retryCountMatch ? parseInt(retryCountMatch[1], 10) : 0;
const DEFAULT_REQUEST_RETRY_DELAY_MS = retryDelayMatch ? parseInt(retryDelayMatch[1], 10) : 0;

test("重试配置常量符合需求（重试 3 次，间隔 5000ms）", () => {
  assert.equal(DEFAULT_REQUEST_RETRY_COUNT, 3);
  assert.equal(DEFAULT_REQUEST_RETRY_DELAY_MS, 5000);
});

test("sleep 正常延时解析", async () => {
  const start = Date.now();
  await sleep(60);
  const elapsed = Date.now() - start;
  assert.ok(elapsed >= 50, `预期耗时 >= 50ms，实际耗时: ${elapsed}ms`);
});

test("sleep 支持 AbortSignal 提前中止", async () => {
  const controller = new AbortController();
  const start = Date.now();

  setTimeout(() => {
    controller.abort();
  }, 50);

  // 计划等待 5 秒，但应在 50ms 左右因 abort 提前结束
  await sleep(5000, controller.signal);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 1000, `应在 1000ms 内提前中止，实际耗时: ${elapsed}ms`);
});

test("sleep 接收已中止的 signal 时立即返回", async () => {
  const controller = new AbortController();
  controller.abort();

  const start = Date.now();
  await sleep(5000, controller.signal);
  const elapsed = Date.now() - start;
  assert.ok(elapsed < 100, `已中止 signal 应在 100ms 内立即返回，实际耗时: ${elapsed}ms`);
});
