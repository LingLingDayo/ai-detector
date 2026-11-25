import type { SelectOption } from "../components/common";

export type UserAgentPresetKey =
  | "codex"
  | "claude"
  | "browser"
  | "opencode"
  | "gemini_cli"
  | "grok"
  | "cherry_studio"
  | "openai_sdk"
  | "custom";

export interface UserAgentPresetItem {
  key: Exclude<UserAgentPresetKey, "custom">;
  label: string;
  description: string;
  userAgent: string;
}

export const CODEX_USER_AGENT =
  "Codex Desktop/0.171.0-alpha.13 (Windows 10.0.26300; x86_64) unknown (Codex Desktop; 26.1117.41037)";
export const CLAUDE_CODE_USER_AGENT = "claude-cli/2.1.76 (external, cli)";
export const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36";
export const OPENCODE_USER_AGENT = "opencode/2.1.0";
export const GEMINI_CLI_USER_AGENT =
  "GeminiCLI/0.34.0 (win32; x64) google-api-nodejs-client/10.3.0";
export const GROK_USER_AGENT = "grok-cli/1.0.77";
export const CHERRY_STUDIO_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) CherryStudio/1.7.13 Chrome/134.0.6998.44 Electron/35.0.2 Safari/537.36";
export const OPENAI_SDK_USER_AGENT = "OpenAI/JS 4.104.0";

export const DEFAULT_USER_AGENT = CODEX_USER_AGENT;
export const DEFAULT_USER_AGENT_PRESET: UserAgentPresetKey = "codex";

export const USER_AGENT_PRESETS: readonly UserAgentPresetItem[] = [
  {
    key: "codex",
    label: "Codex",
    description: "OpenAI Codex Desktop",
    userAgent: CODEX_USER_AGENT,
  },
  {
    key: "claude",
    label: "Claude Code",
    description: "Anthropic CLI",
    userAgent: CLAUDE_CODE_USER_AGENT,
  },
  {
    key: "browser",
    label: "浏览器",
    description: "Chrome 桌面端",
    userAgent: BROWSER_USER_AGENT,
  },
  {
    key: "opencode",
    label: "OpenCode",
    description: "OpenCode CLI",
    userAgent: OPENCODE_USER_AGENT,
  },
  {
    key: "gemini_cli",
    label: "Gemini CLI",
    description: "Google Gemini CLI",
    userAgent: GEMINI_CLI_USER_AGENT,
  },
  {
    key: "grok",
    label: "Grok",
    description: "xAI Grok CLI",
    userAgent: GROK_USER_AGENT,
  },
  {
    key: "cherry_studio",
    label: "Cherry Studio",
    description: "桌面客户端",
    userAgent: CHERRY_STUDIO_USER_AGENT,
  },
  {
    key: "openai_sdk",
    label: "OpenAI SDK",
    description: "Official JS SDK",
    userAgent: OPENAI_SDK_USER_AGENT,
  },
];

const PRESET_MAP = new Map<string, UserAgentPresetItem>(
  USER_AGENT_PRESETS.map((item) => [item.key, item])
);

export const USER_AGENT_SELECT_OPTIONS: SelectOption[] = [
  ...USER_AGENT_PRESETS.map((item) => ({
    value: item.key,
    label: item.label,
    description: item.description,
  })),
  {
    value: "custom",
    label: "自定义",
    description: "手动输入标识",
  },
];

/** 校验给定值是否为有效的客户端标识预设键值 */
export function isValidUserAgentPreset(value: unknown): value is UserAgentPresetKey {
  if (typeof value !== "string") return false;
  return value === "custom" || PRESET_MAP.has(value);
}

/** 根据预设与自定义输入解析最终生效的 User-Agent 字符串 */
export function resolveUserAgent(preset: unknown, customUserAgent?: unknown): string {
  if (preset === "custom") {
    const trimmed = typeof customUserAgent === "string" ? customUserAgent.trim() : "";
    return trimmed || DEFAULT_USER_AGENT;
  }

  if (typeof preset === "string") {
    const item = PRESET_MAP.get(preset);
    if (item) return item.userAgent;
  }

  return DEFAULT_USER_AGENT;
}
