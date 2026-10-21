import { describe, expect, it } from "vitest";
import {
  parseChatNonStreamingJson,
  parseChatStreamingBody,
} from "./chatParsing";
import { buildChatRequestBody } from "./chat";
import type { SendChatOptions } from "../types";

const baseOptions: SendChatOptions = {
  baseUrl: "https://api.test.com",
  apiKey: "sk-test",
  model: "test-model",
  messages: [
    { role: "user", content: "你好" },
    { role: "assistant", content: "你好，有什么可以帮你？" },
    { role: "user", content: "介绍一下你自己" },
  ],
  apiFormat: "chat_completions",
  reasoningEffort: "high",
  stream: true,
};

describe("连接测试请求体构建", () => {
  it("Chat Completions 会话包含完整上下文与图片内容块", () => {
    const body = buildChatRequestBody(
      {
        ...baseOptions,
        messages: [
          {
            role: "user",
            content: "看看这张图",
            images: [{ mimeType: "image/png", data: "aGVsbG8=" }],
          },
        ],
      },
      true
    ) as any;

    expect(body.model).toBe("test-model");
    expect(body.stream).toBe(true);
    expect(body.stream_options).toEqual({ include_usage: true });
    expect(body.messages[0].content).toEqual([
      { type: "text", text: "看看这张图" },
      {
        type: "image_url",
        image_url: { url: "data:image/png;base64,aGVsbG8=" },
      },
    ]);
  });

  it("Anthropic 格式使用 base64 image source，并合并连续同角色消息", () => {
    const body = buildChatRequestBody(
      {
        ...baseOptions,
        apiFormat: "anthropic",
        model: "claude-sonnet-4-5",
        messages: [
          {
            role: "user",
            content: "看图",
            images: [{ mimeType: "image/jpeg", data: "aGVsbG8=" }],
          },
          { role: "user", content: "再补充一句" },
        ],
      },
      true
    ) as any;

    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content[0]).toEqual({
      type: "image",
      source: {
        type: "base64",
        media_type: "image/jpeg",
        data: "aGVsbG8=",
      },
    });
    expect(body.messages[0].content[1]).toEqual({
      type: "text",
      text: "看图\n\n再补充一句",
    });
    expect(body.thinking).toEqual({ type: "enabled", budget_tokens: 8192 });
  });

  it("Responses 格式使用 input_image", () => {
    const body = buildChatRequestBody(
      {
        ...baseOptions,
        apiFormat: "responses",
        messages: [
          {
            role: "user",
            content: "看图",
            images: [{ mimeType: "image/webp", data: "aGVsbG8=" }],
          },
        ],
      },
      false
    ) as any;

    expect(body.stream).toBeUndefined();
    expect(body.input[0].content).toEqual([
      { type: "input_text", text: "看图" },
      {
        type: "input_image",
        image_url: "data:image/webp;base64,aGVsbG8=",
      },
    ]);
  });
});

describe("连接测试响应解析", () => {
  it("解析 Chat Completions 流式文本、响应模型与 usage", () => {
    const sse = [
      'data: {"model":"relay/gpt-4o","choices":[{"delta":{"content":"你"}}]}',
      "",
      'data: {"model":"relay/gpt-4o","choices":[{"delta":{"content":"好"}}]}',
      "",
      'data: {"model":"relay/gpt-4o","choices":[],"usage":{"prompt_tokens":1200,"completion_tokens":42,"prompt_tokens_details":{"cached_tokens":900}}}',
      "",
      "data: [DONE]",
      "",
    ].join("\n");

    const state = parseChatStreamingBody(sse, "chat_completions");
    expect(state.text).toBe("你好");
    expect(state.responseModel).toBe("relay/gpt-4o");
    expect(state.usage).toEqual({
      inputTokens: 1200,
      outputTokens: 42,
      cachedTokens: 900,
      cacheWriteTokens: undefined,
    });
  });

  it("解析 Anthropic 流式模型、缓存输入与输出 token", () => {
    const sse = [
      'data: {"type":"message_start","message":{"model":"claude-sonnet-4-5","usage":{"input_tokens":100,"cache_read_input_tokens":800,"cache_creation_input_tokens":50,"output_tokens":1}}}',
      "",
      'data: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Hello"}}',
      "",
      'data: {"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"output_tokens":20}}',
      "",
    ].join("\n");

    const state = parseChatStreamingBody(sse, "anthropic");
    expect(state.text).toBe("Hello");
    expect(state.responseModel).toBe("claude-sonnet-4-5");
    expect(state.usage.inputTokens).toBe(950);
    expect(state.usage.cachedTokens).toBe(800);
    expect(state.usage.cacheWriteTokens).toBe(50);
    expect(state.usage.outputTokens).toBe(20);
  });

  it("解析 Responses 流式文本与缓存 token", () => {
    const sse = [
      'data: {"type":"response.created","response":{"model":"gpt-5.1"}}',
      "",
      'data: {"type":"response.output_text.delta","delta":"Hi"}',
      "",
      'data: {"type":"response.output_text.done","text":"Hi"}',
      "",
      'data: {"type":"response.completed","response":{"model":"gpt-5.1","usage":{"input_tokens":500,"output_tokens":10,"input_tokens_details":{"cached_tokens":400}}}}',
      "",
    ].join("\n");

    const state = parseChatStreamingBody(sse, "responses");
    expect(state.text).toBe("Hi");
    expect(state.responseModel).toBe("gpt-5.1");
    expect(state.usage).toEqual({
      inputTokens: 500,
      outputTokens: 10,
      cachedTokens: 400,
      cacheWriteTokens: undefined,
    });
  });

  it("兼容同步 JSON 响应", () => {
    const state = parseChatNonStreamingJson(
      {
        model: "upstream-model",
        choices: [{ message: { role: "assistant", content: "同步回复" } }],
        usage: { prompt_tokens: 10, completion_tokens: 5 },
      },
      "chat_completions"
    );

    expect(state.text).toBe("同步回复");
    expect(state.responseModel).toBe("upstream-model");
    expect(state.usage.inputTokens).toBe(10);
    expect(state.usage.outputTokens).toBe(5);
  });

  it("流式响应无文本时抛出错误", () => {
    expect(() =>
      parseChatStreamingBody(
        'data: {"choices":[{"delta":{"reasoning_content":"thinking"}}]}\n\n',
        "chat_completions"
      )
    ).toThrow("流式响应未包含有效文本内容");
  });
});
