import { sendProbe } from "./api";
import { parseNumbers } from "../utils/fingerprint";
import type { Challenge } from "../utils/challenge";
import {
  DEFAULT_REQUEST_RETRY_COUNT,
  DEFAULT_REQUEST_RETRY_DELAY_MS,
} from "../constants";
import { sleep } from "../utils/timer";
import { isTimeoutError } from "../utils/retry";

export interface SingleProbeResult {
  accepted: boolean;
  finalResponseText: string;
  parsedNumbers: number[];
  lastErrMsg: string;
  minimum: number;
}

export interface ExecuteSingleProbeOptions {
  index: number;
  challenge: Challenge;
  baseUrl: string;
  apiKey: string;
  model: string;
  apiFormat?: string;
  reasoningEffort?: string;
  stream: boolean;
  timeoutSeconds: number;
  signal?: AbortSignal;
  /**
   * 检查请求是否已被废弃或取消（如切换了 sessionId 或分配了新的 ticket）
   */
  isCancelled?: () => boolean;
}

export async function executeSingleProbe(
  params: ExecuteSingleProbeOptions
): Promise<SingleProbeResult | null> {
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
    signal,
    isCancelled,
  } = params;

  const minimum = Math.max(80, Math.ceil(challenge.expected_count * 0.55));
  let accepted = false;
  let finalResponseText = "";
  let lastParsedNumbers: number[] = [];
  let lastErrMsg = "";

  // 最多尝试: 1 次初次执行 + 失败后最多静默重试 3 次，每次间隔 5 秒
  const maxAttempts = 1 + DEFAULT_REQUEST_RETRY_COUNT;
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
        apiFormat: apiFormat || "openai",
        reasoningEffort,
        stream,
        timeoutSeconds,
        signal,
      });

      if (signal?.aborted || isCancelled?.()) {
        return null;
      }

      const parsedNumbers = parseNumbers(response.text);
      lastParsedNumbers = parsedNumbers;
      finalResponseText = response.text;

      if (parsedNumbers.length >= minimum) {
        accepted = true;
        break;
      } else {
        lastErrMsg = `仅解析到 ${parsedNumbers.length} 个有效整数（需至少 ${minimum} 个）`;
        console.warn(
          `第 ${index + 1} 题第 ${attempt} 次尝试未达标（${lastErrMsg}）` +
            (attempt < maxAttempts ? `，将在 ${DEFAULT_REQUEST_RETRY_DELAY_MS / 1000} 秒后静默重试...` : "")
        );
      }
    } catch (err: unknown) {
      if (signal?.aborted || isCancelled?.()) {
        return null;
      }
      lastErrMsg = err instanceof Error ? err.message : String(err);
      const isTimeout = isTimeoutError(lastErrMsg);
      console.warn(
        `第 ${index + 1} 题第 ${attempt} 次尝试请求失败（${lastErrMsg}）` +
          (!isTimeout && attempt < maxAttempts ? `，将在 ${DEFAULT_REQUEST_RETRY_DELAY_MS / 1000} 秒后静默重试...` : "")
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
    accepted,
    finalResponseText,
    parsedNumbers: lastParsedNumbers,
    lastErrMsg,
    minimum,
  };
}
