import { describe, expect, it } from "vitest";
import {
  BROWSER_USER_AGENT,
  CHERRY_STUDIO_USER_AGENT,
  CLAUDE_CODE_USER_AGENT,
  CODEX_USER_AGENT,
  DEFAULT_USER_AGENT,
  DEFAULT_USER_AGENT_PRESET,
  GEMINI_CLI_USER_AGENT,
  GROK_USER_AGENT,
  OPENAI_SDK_USER_AGENT,
  OPENCODE_USER_AGENT,
  USER_AGENT_PRESETS,
  USER_AGENT_SELECT_OPTIONS,
  isValidUserAgentPreset,
  resolveUserAgent,
} from "./userAgentPresets";

describe("userAgentPresets 客户端标识预设", () => {
  it("包含全部常见软件预设及末尾的自定义选项", () => {
    expect(DEFAULT_USER_AGENT_PRESET).toBe("codex");
    expect(DEFAULT_USER_AGENT).toBe(CODEX_USER_AGENT);

    expect(USER_AGENT_PRESETS.map((item) => item.key)).toEqual([
      "codex",
      "claude",
      "browser",
      "opencode",
      "gemini_cli",
      "grok",
      "cherry_studio",
      "openai_sdk",
    ]);

    expect(USER_AGENT_SELECT_OPTIONS.map((item) => item.value)).toEqual([
      "codex",
      "claude",
      "browser",
      "opencode",
      "gemini_cli",
      "grok",
      "cherry_studio",
      "openai_sdk",
      "custom",
    ]);
    expect(USER_AGENT_SELECT_OPTIONS[2]?.value).toBe("browser");
  });

  it("所有内置预设的 User-Agent 均符合对应客户端规范格式", () => {
    expect(CODEX_USER_AGENT).toMatch(
      /^Codex Desktop\/0\.171\.0-alpha\.13 .*Codex Desktop; 26\.1117\.41037\)$/,
    );
    expect(CLAUDE_CODE_USER_AGENT).toMatch(/^claude-cli\/\d+\.\d+\.\d+ \(external, cli\)$/);
    expect(OPENCODE_USER_AGENT).toMatch(/^opencode\/\d+\.\d+\.\d+$/);
    expect(GEMINI_CLI_USER_AGENT).toMatch(/^GeminiCLI\/\d+\.\d+\.\d+ .*google-api-nodejs-client\//);
    expect(GROK_USER_AGENT).toMatch(/^grok-cli\/\d+\.\d+\.\d+$/);
    expect(CHERRY_STUDIO_USER_AGENT).toMatch(/CherryStudio\/\d+\.\d+\.\d+ Chrome\/.+Electron\//);
    expect(BROWSER_USER_AGENT).toMatch(/^Mozilla\/5\.0 .*Chrome\/\d+\.\d+\.\d+\.\d+ Safari\//);
    expect(OPENAI_SDK_USER_AGENT).toMatch(/^OpenAI\/JS \d+\.\d+\.\d+$/);
  });

  it("isValidUserAgentPreset 正确识别有效与无效预设", () => {
    for (const option of USER_AGENT_SELECT_OPTIONS) {
      expect(isValidUserAgentPreset(option.value)).toBe(true);
    }
    expect(isValidUserAgentPreset("unknown")).toBe(false);
    expect(isValidUserAgentPreset("")).toBe(false);
    expect(isValidUserAgentPreset(123)).toBe(false);
  });

  it("resolveUserAgent 正确解析各预设、自定义值与回退逻辑", () => {
    expect(resolveUserAgent("codex")).toBe(CODEX_USER_AGENT);
    expect(resolveUserAgent("claude")).toBe(CLAUDE_CODE_USER_AGENT);
    expect(resolveUserAgent("browser")).toBe(BROWSER_USER_AGENT);
    expect(resolveUserAgent("opencode")).toBe(OPENCODE_USER_AGENT);
    expect(resolveUserAgent("gemini_cli")).toBe(GEMINI_CLI_USER_AGENT);
    expect(resolveUserAgent("grok")).toBe(GROK_USER_AGENT);
    expect(resolveUserAgent("cherry_studio")).toBe(CHERRY_STUDIO_USER_AGENT);
    expect(resolveUserAgent("openai_sdk")).toBe(OPENAI_SDK_USER_AGENT);

    expect(resolveUserAgent("custom", "  MyCustomAgent/1.2.3  ")).toBe("MyCustomAgent/1.2.3");
    expect(resolveUserAgent("custom", "   ")).toBe(DEFAULT_USER_AGENT);
    expect(resolveUserAgent("custom", "")).toBe(DEFAULT_USER_AGENT);
    expect(resolveUserAgent("custom")).toBe(DEFAULT_USER_AGENT);
    expect(resolveUserAgent("invalid_preset", "Ignored/1.0")).toBe(DEFAULT_USER_AGENT);
  });
});
