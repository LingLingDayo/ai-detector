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
    const timeoutSeconds = 60; // 默认锁定 60 秒

    if (!baseUrl || !apiKey) {
      alert("请填写 Base URL 和 API Key！");
      return;
    }

    if (!model) {
      alert("请填写或选择待测模型 ID！");
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
    statusDesc.value = "正在初始化 3 组长整数挑战探针...";
    steps.value = [
      { id: 0, state: "pending", stateText: "等待中", statText: "-" },
      { id: 1, state: "pending", stateText: "等待中", statText: "-" },
      { id: 2, state: "pending", stateText: "等待中", statText: "-" },
    ];

    const challenges: Challenge[] = generateChallenges(totalCount);
    const outputs: ProbeOutputItem[] = [];
    const errors: string[] = [];

    for (let i = 0; i < challenges.length; i++) {
      const challenge = challenges[i];

      // Update current step to working
      steps.value[i] = {
        id: i,
        state: "working",
        stateText: "请求中...",
        statText: "执行",
      };

      statusDesc.value = `正在执行第 ${i + 1}/${totalCount} 题，等待模型完整序列...`;

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
        const minimum = Math.max(80, Math.ceil(challenge.expected_count * 0.55));
        const accepted = parsedNumbers.length >= minimum;

        if (accepted) {
          steps.value[i] = {
            id: i,
            state: "done",
            stateText: "已采纳",
            statText: `${parsedNumbers.length} 个数字`,
          };
          outputs.push({
            text: response.text,
            expected_count: challenge.expected_count,
          });
        } else {
          steps.value[i] = {
            id: i,
            state: "error",
            stateText: "数字不足",
            statText: `${parsedNumbers.length}/${minimum}`,
          };
          errors.push(
            `第 ${i + 1} 题: 仅解析到 ${parsedNumbers.length} 个有效整数（需至少 ${minimum} 个）`
          );
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`第 ${i + 1} 题请求失败:`, err);
        steps.value[i] = {
          id: i,
          state: "error",
          stateText: "失败",
          statText: "错误",
        };
        errors.push(`第 ${i + 1} 题失败: ${errMsg}`);
      }

      const finished = i + 1;
      completedCount.value = finished;
      progressPercent.value = Math.round((finished / totalCount) * 100);

      statusDesc.value =
        finished < totalCount
          ? `第 ${finished} 题已完成，进入下一题...`
          : "3 题测试完成，正在计算模型归因...";
    }

    // Process evaluation and output results
    if (outputs.length === 0) {
      statusTitle.value = "未获得有效样本";
      statusDesc.value = "3 题测试均未能获取合规输出，请检查错误原因。";
      statusAlert.value = {
        message: errors.join("；\n") || "未获得任何可分析输出。",
        type: "error",
      };
    } else {
      statusTitle.value = "测试完成";
      statusDesc.value = `成功采纳 ${outputs.length}/${totalCount} 份有效输出样本`;
      try {
        analysisResult.value = analyzeGlobalOutputs(outputs, unifiedBank);
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
