import { ref, type Ref } from "vue";
import { generateChallenges, type Challenge } from "../utils/challenge";
import {
  parseNumbers,
  analyzeGlobalOutputs,
  type UnifiedBank,
  type ProbeOutputItem,
  type GlobalAnalysisResult,
} from "../utils/fingerprint";
import rawUnifiedBank from "../data/unified_bank.json";
import { sendProbe } from "../services/api";
import type { ClientConfig, ProbeStepItem, StatusAlertInfo } from "../types";

const unifiedBank = rawUnifiedBank as unknown as UnifiedBank;

export interface UseProbeTestReturn {
  isRunning: Ref<boolean>;
  hasStarted: Ref<boolean>;
  progressPercent: Ref<number>;
  completedCount: Ref<number>;
  totalCount: number;
  statusTitle: Ref<string>;
  statusDesc: Ref<string>;
  steps: Ref<ProbeStepItem[]>;
  statusAlert: Ref<StatusAlertInfo | null>;
  analysisResult: Ref<GlobalAnalysisResult | null>;
  totalBankModelsCount: number;
  startTest: (config: ClientConfig) => Promise<void>;
  resetTest: () => void;
}

export function useProbeTest(): UseProbeTestReturn {
  const isRunning = ref(false);
  const hasStarted = ref(false);
  const progressPercent = ref(0);
  const completedCount = ref(0);
  const totalCount = 3;
  const statusTitle = ref("探测测试进行中");
  const statusDesc = ref("准备中...");
  const statusAlert = ref<StatusAlertInfo | null>(null);
  const analysisResult = ref<GlobalAnalysisResult | null>(null);

  const initialSteps: ProbeStepItem[] = [
    { id: 0, state: "pending", stateText: "等待中", statText: "-" },
    { id: 1, state: "pending", stateText: "等待中", statText: "-" },
    { id: 2, state: "pending", stateText: "等待中", statText: "-" },
  ];

  const steps = ref<ProbeStepItem[]>(JSON.parse(JSON.stringify(initialSteps)));

  const totalBankModelsCount = unifiedBank?.models?.length || 13;

  function resetTest(): void {
    isRunning.value = false;
    hasStarted.value = false;
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "探测测试进行中";
    statusDesc.value = "准备中...";
    statusAlert.value = null;
    analysisResult.value = null;
    steps.value = JSON.parse(JSON.stringify(initialSteps));
  }

  async function startTest(config: ClientConfig): Promise<void> {
    const baseUrl = config.baseUrl.trim();
    const apiKey = config.apiKey.trim();
    const model = config.modelName.trim();
    const apiFormat = config.apiFormat;
    const reasoningEffort = config.reasoningEffort;
    const timeoutSeconds = 150; // 默认锁定 150 秒

    if (!baseUrl || !apiKey) {
      alert("请填写 Base URL 和 API Key！");
      return;
    }

    if (!model) {
      alert("请填写或选择测试模型 ID！");
      return;
    }

    // Reset UI state for new test run
    isRunning.value = true;
    hasStarted.value = true;
    statusAlert.value = null;
    analysisResult.value = null;
    progressPercent.value = 0;
    completedCount.value = 0;
    statusTitle.value = "探测测试进行中";
    statusDesc.value = "正在并发发起 3 组长整数挑战探针...";
    steps.value = [
      { id: 0, state: "working", stateText: "请求中...", statText: "执行" },
      { id: 1, state: "working", stateText: "请求中...", statText: "执行" },
      { id: 2, state: "working", stateText: "请求中...", statText: "执行" },
    ];

    const challenges: Challenge[] = generateChallenges(totalCount);
    const outputs: (ProbeOutputItem | null)[] = new Array(totalCount).fill(null);
    const errors: string[] = [];

    const tasks = challenges.map(async (challenge, i) => {
      const minimum = Math.max(80, Math.ceil(challenge.expected_count * 0.55));
      let accepted = false;
      let finalResponseText = "";
      let lastParsedCount = 0;
      let lastErrMsg = "";

      // 最多尝试 2 次（初次执行 + 失败后最多静默重试 1 次）
      const maxAttempts = 2;
      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        try {
          const response = await sendProbe({
            baseUrl,
            apiKey,
            model,
            prompt: challenge.prompt,
            apiFormat,
            reasoningEffort,
            timeoutSeconds,
          });

          const parsedNumbers = parseNumbers(response.text);
          lastParsedCount = parsedNumbers.length;
          finalResponseText = response.text;

          if (parsedNumbers.length >= minimum) {
            accepted = true;
            break;
          } else {
            lastErrMsg = `仅解析到 ${parsedNumbers.length} 个有效整数（需至少 ${minimum} 个）`;
          }
        } catch (err: unknown) {
          lastErrMsg = err instanceof Error ? err.message : String(err);
          console.error(`第 ${i + 1} 题第 ${attempt} 次尝试失败:`, err);
        }
      }

      try {
        if (accepted) {
          steps.value[i] = {
            id: i,
            state: "done",
            stateText: "已采纳",
            statText: `${lastParsedCount} 个数字`,
          };
          outputs[i] = {
            text: finalResponseText,
            expected_count: challenge.expected_count,
          };
        } else if (lastParsedCount > 0) {
          steps.value[i] = {
            id: i,
            state: "error",
            stateText: "数字不足",
            statText: `${lastParsedCount}/${minimum}`,
          };
          errors.push(`第 ${i + 1} 题: ${lastErrMsg}`);
        } else {
          steps.value[i] = {
            id: i,
            state: "error",
            stateText: "失败",
            statText: "错误",
          };
          errors.push(`第 ${i + 1} 题失败: ${lastErrMsg}`);
        }
      } finally {
        completedCount.value += 1;
        progressPercent.value = Math.round((completedCount.value / totalCount) * 100);
        if (completedCount.value < totalCount) {
          statusDesc.value = `已完成 ${completedCount.value}/${totalCount} 题，正在等待剩余响应...`;
        } else {
          statusDesc.value = "3 题测试完成，正在计算模型归因...";
        }
      }
    });

    await Promise.all(tasks);

    const validOutputs = outputs.filter((item): item is ProbeOutputItem => item !== null);

    // Process evaluation and output results
    if (validOutputs.length === 0) {
      statusTitle.value = "未获得有效样本";
      statusDesc.value = "3 题测试均未能获取合规输出，请检查错误原因。";
      statusAlert.value = {
        message: errors.join("；\n") || "未获得任何可分析输出。",
        type: "error",
      };
    } else {
      statusTitle.value = "测试完成";
      statusDesc.value = `成功采纳 ${validOutputs.length}/${totalCount} 份有效输出样本`;
      try {
        analysisResult.value = analyzeGlobalOutputs(validOutputs, unifiedBank);
      } catch (analysisErr: unknown) {
        const errMsg =
          analysisErr instanceof Error ? analysisErr.message : String(analysisErr);
        statusAlert.value = {
          message: `归因计算异常: ${errMsg}`,
          type: "error",
        };
      }
    }

    isRunning.value = false;
  }

  return {
    isRunning,
    hasStarted,
    progressPercent,
    completedCount,
    totalCount,
    statusTitle,
    statusDesc,
    steps,
    statusAlert,
    analysisResult,
    totalBankModelsCount,
    startTest,
    resetTest,
  };
}
