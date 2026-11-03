import { sendProbe } from "./api";
import { evaluateCandyResponse } from "../utils/candyChallenge";
import type { CandyChallenge } from "../types";
import {
  DEFAULT_REQUEST_RETRY_COUNT,
  DEFAULT_REQUEST_RETRY_DELAY_MS,
} from "../constants";
import { sleep } from "../utils/timer";
import { isTimeoutError } from "../utils/retry";

export interface SingleCandyRunResult {
  hasResponse: boolean;
  isCorrect: boolean;
  extractedAnswer: number | null;
  finalResponseText: string;
  durationMs: number;
  lastErrMsg: string;
}

export interface ExecuteSingleCandyOptions {
  index: number;
  challenge: CandyChallenge;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiFormat?: string;
  reasoningEffort?: string;
  stream: boolean;
  timeoutSeconds: number;
  /** 请求失败后的静默重试次数，缺省使用全局默认值 */
  retryCount?: number;
  signal?: AbortSignal;
  onStreamProgress?: (text: string) => void;
  isCancelled?: () => boolean;
}

export async function executeSingleCandy(
  params: ExecuteSingleCandyOptions
): Promise<SingleCandyRunResult | null> {
  const {
    index,
    challenge,
    baseUrl,
    apiKey,
    model,
    apiFormat,
    reasoningEffort,
    stream,
    timeoutSeconds,
    retryCount,
    signal,
    onStreamProgress,
    isCancelled,
  } = params;

  let hasResponse = false;
  let isCorrect = false;
  let extractedAnswer: number | null = null;
  let finalResponseText = "";
  let durationMs = 0;
  let lastErrMsg = "";

  // 仅针对接口请求异常或空响应进行重试；若模型返回了非空文本但算错答案，直接记录其真实错误答案，不重复刷题
  const maxAttempts = 1 + Math.max(0, retryCount ?? DEFAULT_REQUEST_RETRY_COUNT);
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted || isCancelled?.()) {
      return null;
    }

    try {
      const response = await sendProbe({
        baseUrl,
        apiKey,
        model,
        prompt: challenge.prompt,
        apiFormat: apiFormat || "chat_completions",
        reasoningEffort,
        stream,
        timeoutSeconds,
        signal,
        onStreamProgress,
      });

      if (signal?.aborted || isCancelled?.()) {
        return null;
      }

      const text = (response.text || "").trim();
      durationMs = response.duration_ms || 0;

      if (text.length > 0) {
        hasResponse = true;
        finalResponseText = response.text;
        const evalRes = await evaluateCandyResponse(response.text, challenge.expectedAnswer);
        extractedAnswer = evalRes.extractedAnswer;
        isCorrect = evalRes.isCorrect;
        if (!isCorrect) {
          lastErrMsg =
            extractedAnswer !== null
              ? `模型回答 ${extractedAnswer}，正确答案应为 ${challenge.expectedAnswer}`
              : `未能从模型回答中识别出明确数字答案（正确答案为 ${challenge.expectedAnswer}）`;
        }
        break;
      } else {
        lastErrMsg = "上游返回了空文本内容";
      }
    } catch (err: unknown) {
      if (signal?.aborted || isCancelled?.()) {
        return null;
      }
      lastErrMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = isTimeoutError(lastErrMsg);
      console.warn(
        `糖果测试第 ${index + 1} 题第 ${attempt} 次请求失败（${lastErrMsg}）` +
          (!isTimeout && attempt < maxAttempts
            ? `，将在 ${DEFAULT_REQUEST_RETRY_DELAY_MS / 1000} 秒后重试...`
            : "")
      );
      if (isTimeout) {
        break;
      }
    }

    if (attempt < maxAttempts) {
      await sleep(DEFAULT_REQUEST_RETRY_DELAY_MS, signal);
      if (signal?.aborted || isCancelled?.()) {
        return null;
      }
    }
  }

  if (signal?.aborted || isCancelled?.()) {
    return null;
  }

  return {
    hasResponse,
    isCorrect,
    extractedAnswer,
    finalResponseText,
    durationMs,
    lastErrMsg,
  };
}
