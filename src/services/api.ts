import type { ProbeResponse, SendProbeOptions, TauriInvokeFn } from "../types";

let tauriInvoke: TauriInvokeFn | null = null;

export function isTauriApp(): boolean {
  if (typeof window === "undefined") return false;
  return Boolean(
    (window as any).isTauri ||
    (window as any).__TAURI_INTERNALS__ ||
    (window as any).__TAURI__
  );
}

export async function initTauri(): Promise<void> {
  try {
    if (!isTauriApp()) {
      tauriInvoke = null;
      console.info("Running in standard Web environment");
      return;
    }

    const tauriApi = await import("@tauri-apps/api/core");
    const isRunningInTauri =
      typeof tauriApi.isTauri === "function"
        ? tauriApi.isTauri()
        : isTauriApp();

    if (isRunningInTauri && typeof tauriApi.invoke === "function") {
      tauriInvoke = tauriApi.invoke as TauriInvokeFn;
      console.info("Running in Tauri desktop environment");
    } else {
      tauriInvoke = null;
      console.info("Running in standard Web environment");
    }
  } catch {
    tauriInvoke = null;
    console.info("Running in standard Web environment");
  }
}

export function getTauriInvoke(): TauriInvokeFn | null {
  return tauriInvoke;
}

export async function fetchRemoteModels(
  baseUrl: string,
  apiKey: string,
  apiFormat: string
): Promise<string[]> {
  if (tauriInvoke && isTauriApp()) {
    try {
      return await tauriInvoke<string[]>("fetch_models_list", {
        baseUrl,
        apiKey,
        apiFormat,
      });
    } catch (err) {
      if (!isTauriApp()) {
        console.warn("Tauri invoke unavailable, falling back to browser fetch:", err);
      } else {
        throw err;
      }
    }
  }

  // Browser fallback
  let endpoint = baseUrl.trim().replace(/\/+$/, "");
  if (!endpoint) {
    endpoint = apiFormat === "anthropic" ? "https://api.anthropic.com" : "https://api.openai.com";
  }

  if (endpoint.endsWith("/chat/completions")) {
    endpoint = endpoint.replace(/\/chat\/completions$/, "/models");
  } else if (endpoint.endsWith("/responses")) {
    endpoint = endpoint.replace(/\/responses$/, "/models");
  } else if (endpoint.endsWith("/messages")) {
    endpoint = endpoint.replace(/\/messages$/, "/models");
  } else if (endpoint.endsWith("/v1")) {
    endpoint += "/models";
  } else {
    endpoint += "/v1/models";
  }

  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  const trimmedKey = apiKey.trim();
  if (trimmedKey) {
    headers["Authorization"] = `Bearer ${trimmedKey}`;
  }
  if (apiFormat === "anthropic") {
    if (trimmedKey) {
      headers["x-api-key"] = trimmedKey;
    }
    headers["anthropic-version"] = "2023-06-01";
  }

  let res: Response;
  try {
    res = await fetch(endpoint, { headers });
  } catch (netErr: unknown) {
    const msg = netErr instanceof Error ? netErr.message : String(netErr);
    throw new Error(`网络请求受限或跨域错误 (${msg})。在桌面客户端环境下无跨域限制。`);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`上游接口返回错误 (HTTP ${res.status}): ${errText.slice(0, 150)}`);
  }

  const data = (await res.json()) as any;
  let rawList: any[] = [];
  if (Array.isArray(data)) {
    rawList = data;
  } else if (Array.isArray(data?.data)) {
    rawList = data.data;
  } else if (Array.isArray(data?.models)) {
    rawList = data.models;
  }

  const models = rawList
    .map((item) => {
      if (typeof item === "string") return item;
      return item?.id || item?.name || "";
    })
    .filter(Boolean);

  return Array.from(new Set(models)).sort();
}

export async function sendProbe({
  baseUrl,
  apiKey,
  model,
  prompt,
  apiFormat,
  reasoningEffort = "high",
  timeoutSeconds = 150,
}: SendProbeOptions): Promise<ProbeResponse> {
  const actualTimeout = timeoutSeconds || 150;

  if (tauriInvoke && isTauriApp()) {
    return await tauriInvoke<ProbeResponse>("send_probe_request", {
      req: {
        base_url: baseUrl,
        api_key: apiKey,
        model,
        prompt,
        api_format: apiFormat,
        reasoning_effort: reasoningEffort,
        timeout_seconds: actualTimeout,
      },
    });
  }

  // Web fallback for browser preview
  let endpoint = baseUrl.replace(/\/+$/, "");
  if (!endpoint) {
    if (apiFormat === "anthropic") endpoint = "https://api.anthropic.com";
    else endpoint = "https://api.openai.com";
  }

  if (apiFormat === "anthropic") {
    endpoint += endpoint.endsWith("/messages")
      ? ""
      : endpoint.endsWith("/v1")
      ? "/messages"
      : "/v1/messages";
  } else if (apiFormat === "responses" || apiFormat === "openai_responses") {
    endpoint += endpoint.endsWith("/responses")
      ? ""
      : endpoint.endsWith("/v1")
      ? "/responses"
      : "/v1/responses";
  } else {
    endpoint += endpoint.endsWith("/chat/completions")
      ? ""
      : endpoint.endsWith("/v1")
      ? "/chat/completions"
      : "/v1/chat/completions";
  }

  const startTime = Date.now();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  interface RequestBody {
    model: string;
    messages?: Array<{ role: string; content: string }>;
    input?: Array<{
      type: string;
      role: string;
      content: Array<{ type: string; text: string }>;
    }>;
    max_tokens?: number;
    max_completion_tokens?: number;
    reasoning_effort?: string;
    reasoning?: { effort: string };
    output_config?: { effort: string };
    thinking?: { type: string; budget_tokens: number };
  }

  let bodyObj: RequestBody;

  if (apiFormat === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
    headers["Authorization"] = `Bearer ${apiKey}`;
    bodyObj = {
      model,
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    };
    if (reasoningEffort && reasoningEffort !== "none") {
      const trimmed = reasoningEffort.trim();
      const isNum = /^\d+$/.test(trimmed);
      let budget: number;
      if (isNum) {
        budget = Math.max(1024, parseInt(trimmed, 10));
      } else {
        const budgetMap: Record<string, number> = {
          minimal: 1024,
          low: 2048,
          medium: 4096,
          high: 8192,
          xhigh: 16384,
          max: 32768,
          ultra: 65536,
        };
        budget = budgetMap[trimmed] || 8192;
      }
      bodyObj.thinking = { type: "enabled", budget_tokens: budget };
      bodyObj.output_config = { effort: trimmed };
      bodyObj.max_tokens = Math.max(4096, budget + 2048);
    }
  } else if (apiFormat === "responses" || apiFormat === "openai_responses") {
    headers["Authorization"] = `Bearer ${apiKey}`;
    bodyObj = {
      model,
      input: [
        {
          type: "message",
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
    };
    if (reasoningEffort && reasoningEffort !== "none") {
      const trimmed = reasoningEffort.trim();
      bodyObj.reasoning = { effort: trimmed };
    }
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
    bodyObj = {
      model,
      messages: [{ role: "user", content: prompt }],
    };
    if (reasoningEffort && reasoningEffort !== "none") {
      const trimmed = reasoningEffort.trim();
      if (/^\d+$/.test(trimmed)) {
        bodyObj.max_completion_tokens = parseInt(trimmed, 10);
      } else {
        bodyObj.reasoning_effort = trimmed;
      }
    }
  }

  const res = await fetch(endpoint, {
    method: "POST",
    headers,
    body: JSON.stringify(bodyObj),
  });

  const durationMs = Date.now() - startTime;
  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`上游接口返回错误 (HTTP ${res.status}): ${errText.slice(0, 200)}`);
  }

  const json = (await res.json()) as any;
  let text = "";
  if (apiFormat === "anthropic") {
    text = (json.content || []).map((c: any) => c.text || "").join("");
  } else if (apiFormat === "responses" || apiFormat === "openai_responses") {
    if (typeof json.output_text === "string" && json.output_text.trim()) {
      text = json.output_text.trim();
    } else if (Array.isArray(json.output)) {
      const chunks: string[] = [];
      for (const item of json.output) {
        if (!item) continue;
        if (item.type === "reasoning" || item.type === "compaction_summary" || item.type === "function_call") continue;
        if (typeof item.text === "string" && item.text.trim()) {
          chunks.push(item.text.trim());
          continue;
        }
        if (Array.isArray(item.content)) {
          for (const part of item.content) {
            if (!part) continue;
            if (part.type === "input_text" || part.type === "thinking") continue;
            if (typeof part.text === "string" && part.text.trim()) {
              chunks.push(part.text.trim());
            }
          }
        }
      }
      text = chunks.join("");
    } else if (Array.isArray(json.content)) {
      const chunks: string[] = [];
      for (const part of json.content) {
        if (typeof part === "string" && part.trim()) {
          chunks.push(part.trim());
        } else if (part && typeof part.text === "string" && part.text.trim()) {
          if (part.type !== "thinking" && part.type !== "redacted_thinking") {
            chunks.push(part.text.trim());
          }
        }
      }
      text = chunks.join("");
    } else if (typeof json.content === "string") {
      text = json.content.trim();
    } else if (json.choices?.[0]?.message?.content) {
      text = json.choices[0].message.content;
    }
  } else {
    text = json.choices?.[0]?.message?.content || "";
  }

  return { text, raw_status: res.status, duration_ms: durationMs };
}
