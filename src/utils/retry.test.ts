import { describe, expect, it } from "vitest";
import { DEFAULT_REQUEST_RETRY_COUNT, DEFAULT_REQUEST_RETRY_DELAY_MS } from "../constants";
import { isTimeoutError } from "./retry";

describe("retry", () => {
  it("重试配置常量符合需求（重试 3 次，间隔 5000ms）", () => {
    expect(DEFAULT_REQUEST_RETRY_COUNT).toBe(3);
    expect(DEFAULT_REQUEST_RETRY_DELAY_MS).toBe(5000);
  });

  it("isTimeoutError 能准确识别各类超时错误", () => {
    expect(isTimeoutError(new Error("流式请求首次响应超时（90 秒内未收到上游响应）"))).toBe(true);
    expect(isTimeoutError("流式请求首次响应超时（90 秒内未收到上游响应）")).toBe(true);
    expect(isTimeoutError("流式请求首次响应超时（90 秒内未收到模型首包响应）")).toBe(true);
    expect(isTimeoutError("上游流式响应传输中断（90 秒内未收到后续数据分片）")).toBe(true);
    expect(isTimeoutError("同步请求超时（240 秒内未收到上游响应）")).toBe(true);
    expect(isTimeoutError("error sending request for url: operation timed out")).toBe(true);
    expect(isTimeoutError("Request timeout after 90000ms")).toBe(true);
    expect(isTimeoutError(new DOMException("The operation timed out.", "TimeoutError"))).toBe(true);

    // 非超时错误不应误判
    expect(isTimeoutError("仅解析到 30 个有效整数（需至少 80 个）")).toBe(false);
    expect(isTimeoutError("模型未返回有效的 SVG 或 HTML 代码")).toBe(false);
    expect(isTimeoutError("接口请求异常 (500): Internal Server Error")).toBe(false);
    expect(isTimeoutError("接口请求异常 (401): Unauthorized")).toBe(false);
    expect(isTimeoutError("无法连接上游接口: connection refused")).toBe(false);
    expect(isTimeoutError(null)).toBe(false);
    expect(isTimeoutError(undefined)).toBe(false);
  });

  it("超时错误立即终止重试流程，仅尝试 1 次并保留原超时错误", () => {
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

    expect(attemptCount, "超时后应当立即终止，尝试次数应为 1").toBe(1);
    expect(finalErrMsg, "最终错误信息应完整保留超时文案").toBe(timeoutErrMsg);
  });

  it("非超时异常保持静默重试至最大次数", () => {
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

    expect(attemptCount, `非超时错误应重试满 ${maxAttempts} 次`).toBe(maxAttempts);
    expect(finalErrMsg).toBe(serverErrMsg);
  });
});
