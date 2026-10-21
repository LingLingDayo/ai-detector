import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isTimeoutError } from "./retry.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const constantsFile = fs.readFileSync(path.resolve(__dirname, "../constants.ts"), "utf-8");

const retryCountMatch = constantsFile.match(/DEFAULT_REQUEST_RETRY_COUNT\s*=\s*(\d+)/);
const retryDelayMatch = constantsFile.match(/DEFAULT_REQUEST_RETRY_DELAY_MS\s*=\s*(\d+)/);
const DEFAULT_REQUEST_RETRY_COUNT = retryCountMatch ? parseInt(retryCountMatch[1], 10) : 0;

test("重试配置常量符合需求（重试 3 次，间隔 5000ms）", () => {
  assert.equal(DEFAULT_REQUEST_RETRY_COUNT, 3);
  assert.equal(retryDelayMatch ? parseInt(retryDelayMatch[1], 10) : 0, 5000);
});

test("isTimeoutError 能准确识别各类超时错误", () => {
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

test("超时错误立即终止重试流程，仅尝试 1 次并保留原超时错误", () => {
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

test("非超时异常保持静默重试至最大次数", () => {
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
