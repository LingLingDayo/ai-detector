import { SlidersHorizontal } from "@lucide/vue";
import type { SettingsPage } from "./types";

export const generalPage: SettingsPage = {
  id: "general",
  label: "通用",
  icon: SlidersHorizontal,
  sections: [
    {
      id: "testBehavior",
      title: "测试行为",
      description: "控制启动后的默认测试页与全局请求策略，修改后立即生效并自动保存。",
      fields: [
        {
          key: "defaultTestMode",
          type: "segmented",
          label: "默认测试模式",
          description: "启动应用后默认进入的测试标签页",
          defaultValue: "probe",
          options: [
            { value: "probe", label: "模型" },
            { value: "pelican", label: "鹈鹕" },
            { value: "candy", label: "糖果" },
            { value: "connection", label: "连接" },
          ],
        },
        {
          key: "streamTimeoutSeconds",
          type: "number",
          label: "流式请求超时",
          description: "流式请求等待上游首包响应的最长时间",
          defaultValue: 120,
          min: 10,
          max: 600,
          step: 10,
          unit: "秒",
        },
        {
          key: "syncTimeoutSeconds",
          type: "number",
          label: "非流式请求超时",
          description: "关闭流式后单次请求等待完整响应的最长时间",
          defaultValue: 240,
          min: 10,
          max: 900,
          step: 10,
          unit: "秒",
        },
        {
          key: "requestRetryCount",
          type: "segmented",
          label: "失败自动重试次数",
          description: "模型/糖果测试单题请求失败后的静默重试次数，超时错误不重试",
          defaultValue: "3",
          options: [
            { value: "0", label: "0 次" },
            { value: "1", label: "1 次" },
            { value: "2", label: "2 次" },
            { value: "3", label: "3 次" },
          ],
        },
      ],
    },
    {
      id: "history",
      title: "历史记录",
      description: "管理模型、鹈鹕、糖果与连接测试的本地历史归档。",
      fields: [
        {
          key: "historyEnabled",
          type: "toggle",
          label: "保存历史记录",
          description: "关闭后新完成的测试不再写入历史，已有记录保持不变",
          defaultValue: true,
        },
        {
          key: "historyMaxCount",
          type: "segmented",
          label: "单类历史上限",
          description: "每类测试独立计算，超出后自动移除最旧记录",
          defaultValue: "100",
          options: [
            { value: "50", label: "50" },
            { value: "100", label: "100" },
            { value: "200", label: "200" },
            { value: "0", label: "不限" },
          ],
          disabled: (ctx) => ctx.values.historyEnabled === false,
        },
      ],
    },
    {
      id: "connection",
      title: "连接测试",
      fields: [
        {
          key: "defaultConnectionMode",
          type: "segmented",
          label: "默认连接测试模式",
          description: "对话模式支持多轮上下文，精简模式发送单轮 Hi 快速测活",
          defaultValue: "chat",
          options: [
            { value: "chat", label: "对话" },
            { value: "quick", label: "精简" },
          ],
        },
      ],
    },
  ],
};
