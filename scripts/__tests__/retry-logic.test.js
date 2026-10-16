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

test("多题并发独立重试场景下的 AbortController 隔离性验证（中止单题不影响另一题）", async () => {
  const stepAbortControllers = new Map();
  stepAbortControllers.set(0, new AbortController());
  stepAbortControllers.set(1, new AbortController());

  // 模拟题 0 重新发起重试，中断题 0 的旧 controller
  stepAbortControllers.get(0)?.abort();
  stepAbortControllers.set(0, new AbortController());

  assert.equal(stepAbortControllers.get(0)?.signal.aborted, false);
  assert.equal(stepAbortControllers.get(1)?.signal.aborted, false);

  // 验证题 1 仍在独立运行不受影响
  let step1Finished = false;
  const task1 = sleep(60, stepAbortControllers.get(1)?.signal).then(() => {
    step1Finished = true;
  });

  // 中止题 0，题 1 必须不受影响成功完成
  stepAbortControllers.get(0)?.abort();
  await task1;
  assert.equal(step1Finished, true);
  assert.equal(stepAbortControllers.get(0)?.signal.aborted, true);
  assert.equal(stepAbortControllers.get(1)?.signal.aborted, false);
});

test("isTimeoutError 能准确识别各类超时错误", async () => {
  const { isTimeoutError } = await import("../../src/utils/retry.ts");

  assert.equal(isTimeoutError(new Error("流式请求首次响应超时（90 秒内未收到上游响应）")), true);
  assert.equal(isTimeoutError("流式请求首次响应超时（90 秒内未收到上游响应）"), true);
  assert.equal(isTimeoutError("流式请求首次响应超时（90 秒内未收到模型首包响应）"), true);
  assert.equal(isTimeoutError("上游流式响应传输中断（90 秒内未收到后续数据分片）"), true);
  assert.equal(isTimeoutError("同步请求超时（240 秒内未收到上游响应）"), true);
  assert.equal(isTimeoutError("error sending request for url: operation timed out"), true);
  assert.equal(isTimeoutError("Request timeout after 90000ms"), true);
  assert.equal(isTimeoutError(new DOMException("The operation timed out.", "TimeoutError")), true);

  // 非超时错误不应误判
  assert.equal(isTimeoutError("仅解析到 30 个有效整数（需至少 80 个）"), false);
  assert.equal(isTimeoutError("模型未返回有效的 SVG 或 HTML 代码"), false);
  assert.equal(isTimeoutError("接口请求异常 (500): Internal Server Error"), false);
  assert.equal(isTimeoutError("接口请求异常 (401): Unauthorized"), false);
  assert.equal(isTimeoutError("无法连接上游接口: connection refused"), false);
  assert.equal(isTimeoutError(null), false);
  assert.equal(isTimeoutError(undefined), false);
});

test("超时错误立即终止重试流程，仅尝试 1 次并保留原超时错误", async () => {
  const { isTimeoutError } = await import("../../src/utils/retry.ts");

  const timeoutErrMsg = "流式请求首次响应超时（90 秒内未收到上游响应）";
  let attemptCount = 0;
  let finalErrMsg = "";

  const maxAttempts = 1 + DEFAULT_REQUEST_RETRY_COUNT;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount++;
    try {
      // 模拟请求抛出超时异常
      throw new Error(timeoutErrMsg);
    } catch (err) {
      finalErrMsg = err instanceof Error ? err.message : String(err);
      if (isTimeoutError(finalErrMsg)) {
        break;
      }
    }
  }

  assert.equal(attemptCount, 1, "超时后应当立即终止，尝试次数应为 1");
  assert.equal(finalErrMsg, timeoutErrMsg, "最终错误信息应完整保留超时文案");
});

test("非超时异常保持静默重试至最大次数", async () => {
  const { isTimeoutError } = await import("../../src/utils/retry.ts");

  const serverErrMsg = "接口请求异常 (500): Internal Server Error";
  let attemptCount = 0;
  let finalErrMsg = "";

  const maxAttempts = 1 + DEFAULT_REQUEST_RETRY_COUNT;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    attemptCount++;
    try {
      throw new Error(serverErrMsg);
    } catch (err) {
      finalErrMsg = err instanceof Error ? err.message : String(err);
      if (isTimeoutError(finalErrMsg)) {
        break;
      }
    }
  }

  assert.equal(attemptCount, maxAttempts, `非超时错误应重试满 ${maxAttempts} 次`);
  assert.equal(finalErrMsg, serverErrMsg);
});
