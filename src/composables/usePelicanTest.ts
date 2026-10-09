import { ref, type Ref } from "vue";
import { sendProbe } from "../services/api";
import type { ClientConfig } from "../types";
import { PELICAN_PROMPT_STORAGE_KEY } from "../constants";

export const DEFAULT_PELICAN_PROMPT =
  "Generate an SVG of a pelican riding a bicycle. Reply with the SVG code only.";
export const PELICAN_PROMPT = DEFAULT_PELICAN_PROMPT;

export interface PelicanTestState {
  isPelicanRunning: Ref<boolean>;
  pelicanSvg: Ref<string>;
  rawResponseText: Ref<string>;
  durationMs: Ref<number>;
  testedModel: Ref<string>;
  errorMsg: Ref<string | null>;
  hasTested: Ref<boolean>;
  hasResult: Ref<boolean>;
  pelicanPrompt: Ref<string>;
  setPelicanPrompt: (newPrompt: string) => void;
  resetPelicanPrompt: () => void;
  startPelicanTest: (config: ClientConfig) => Promise<void>;
  resetPelicanTest: () => void;
}

export function extractSvgFromText(text: string): { svg: string; hasSvg: boolean } {
  if (!text) return { svg: "", hasSvg: false };

  // 1. 优先尝试从 markdown 代码块中提取包含 <svg ... </svg> 的内容
  const codeBlockRegex = /```(?:xml|svg|html)?\s*([\s\S]*?)```/gi;
  let match: RegExpExecArray | null;
  while ((match = codeBlockRegex.exec(text)) !== null) {
    const blockContent = match[1].trim();
    const svgMatch = blockContent.match(/<svg[\s\S]*?<\/svg>/i);
    if (svgMatch) {
      return { svg: svgMatch[0].trim(), hasSvg: true };
    }
    if (blockContent.startsWith("<svg") && blockContent.includes("</svg>")) {
      return { svg: blockContent, hasSvg: true };
    }
  }

  // 2. 全文正则匹配首个完整的 <svg ... </svg>
  const directSvgMatch = text.match(/<svg[\s\S]*?<\/svg>/i);
  if (directSvgMatch) {
    return { svg: directSvgMatch[0].trim(), hasSvg: true };
  }

  // 3. 容错处理：若存在 <svg 开头但由于截断未闭合
  const openSvgIndex = text.indexOf("<svg");
  if (openSvgIndex !== -1) {
    const candidate = text.substring(openSvgIndex).trim();
    return { svg: candidate, hasSvg: true };
  }

  return { svg: "", hasSvg: false };
}

function loadInitialPelicanPrompt(): string {
  try {
    const saved = localStorage.getItem(PELICAN_PROMPT_STORAGE_KEY);
    if (saved && saved.trim()) {
      return saved;
    }
  } catch {
    // 忽略存储读取异常
  }
  return DEFAULT_PELICAN_PROMPT;
}

export function usePelicanTest(): PelicanTestState {
  const isPelicanRunning = ref(false);
  const pelicanSvg = ref("");
  const rawResponseText = ref("");
  const durationMs = ref(0);
  const testedModel = ref("");
  const errorMsg = ref<string | null>(null);
  const hasTested = ref(false);
  const hasResult = ref(false);
  const pelicanPrompt = ref(loadInitialPelicanPrompt());

  function setPelicanPrompt(newPrompt: string): void {
    const trimmed = newPrompt.trim();
    const finalPrompt = trimmed || DEFAULT_PELICAN_PROMPT;
    pelicanPrompt.value = finalPrompt;
    try {
      if (finalPrompt === DEFAULT_PELICAN_PROMPT) {
        localStorage.removeItem(PELICAN_PROMPT_STORAGE_KEY);
      } else {
        localStorage.setItem(PELICAN_PROMPT_STORAGE_KEY, finalPrompt);
      }
    } catch {
      // 忽略存储写入异常
    }
  }

  function resetPelicanPrompt(): void {
    setPelicanPrompt(DEFAULT_PELICAN_PROMPT);
  }

  async function startPelicanTest(config: ClientConfig): Promise<void> {
    if (isPelicanRunning.value) return;

    if (!config.baseUrl?.trim() || !config.apiKey?.trim()) {
      errorMsg.value = "请先填写 Base URL 和 API Key";
      hasTested.value = true;
      return;
    }
    if (!config.modelName?.trim()) {
      errorMsg.value = "请先选择或输入模型名称";
      hasTested.value = true;
      return;
    }

    isPelicanRunning.value = true;
    errorMsg.value = null;
    hasTested.value = true;
    pelicanSvg.value = "";
    rawResponseText.value = "";
    testedModel.value = config.modelName;

    const startTime = Date.now();
    const isStream = config.stream !== false;
    const timeoutSeconds = isStream ? 90 : 240;
    try {
      const promptToSend = pelicanPrompt.value.trim() || DEFAULT_PELICAN_PROMPT;
      const res = await sendProbe({
        baseUrl: config.baseUrl,
        apiKey: config.apiKey,
        model: config.modelName,
        prompt: promptToSend,
        apiFormat: config.apiFormat || "openai",
        reasoningEffort: config.reasoningEffort || "high",
        stream: isStream,
        timeoutSeconds,
      });

      rawResponseText.value = res.text || "";
      durationMs.value = res.duration_ms || Date.now() - startTime;

      const { svg, hasSvg } = extractSvgFromText(res.text || "");
      if (hasSvg) {
        pelicanSvg.value = svg;
      } else {
        errorMsg.value = "模型未返回有效的 SVG 格式代码";
      }
      hasResult.value = true;
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : typeof err === "string"
          ? err
          : "请求异常，请检查网络或配置";
      errorMsg.value = message;
      durationMs.value = Date.now() - startTime;
      hasResult.value = true;
    } finally {
      isPelicanRunning.value = false;
    }
  }

  function resetPelicanTest(): void {
    isPelicanRunning.value = false;
    pelicanSvg.value = "";
    rawResponseText.value = "";
    durationMs.value = 0;
    testedModel.value = "";
    errorMsg.value = null;
    hasTested.value = false;
    hasResult.value = false;
  }

  return {
    isPelicanRunning,
    pelicanSvg,
    rawResponseText,
    durationMs,
    testedModel,
    errorMsg,
    hasTested,
    hasResult,
    pelicanPrompt,
    setPelicanPrompt,
    resetPelicanPrompt,
    startPelicanTest,
    resetPelicanTest,
  };
}