import type { ProbeResponse, SendProbeOptions, TauriInvokeFn } from "../types";

let tauriInvoke: TauriInvokeFn | null = null;

export async function initTauri(): Promise<void> {
  try {
    const tauriApi = await import("@tauri-apps/api/core");
    if (tauriApi && typeof tauriApi.invoke === "function") {
      tauriInvoke = tauriApi.invoke as TauriInvokeFn;
    }
  } catch {
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
  if (tauriInvoke) {
    return await tauriInvoke<string[]>("fetch_models_list", {
      baseUrl,
      apiKey,
      apiFormat,
    });
  }

  // Browser fallback
  let endpoint = baseUrl.replace(/\/+$/, "");
  if (endpoint.endsWith("/chat/completions")) {
    endpoint = endpoint.replace(/\/chat\/completions$/, "/models");
  } else if (endpoint.endsWith("/messages")) {
    endpoint = endpoint.replace(/\/messages$/, "/models");
  } else if (endpoint.endsWith("/v1")) {
    endpoint += "/models";
  } else {
    endpoint += "/v1/models";
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
  };
  if (apiFormat === "anthropic") {
    headers["x-api-key"] = apiKey;
    headers["anthropic-version"] = "2023-06-01";
  }

  const res = await fetch(endpoint, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = (await res.json()) as { data?: Array<{ id: string }> };
  return (data.data || []).map((item) => item.id).filter(Boolean);
}

export async function sendProbe({
  baseUrl,
  apiKey,
  model,
  prompt,
  apiFormat,
  temperature,
  timeoutSeconds,
}: SendProbeOptions): Promise<ProbeResponse> {
  if (tauriInvoke) {
    return await tauriInvoke<ProbeResponse>("send_probe_request", {
      req: {
        base_url: baseUrl,
        api_key: apiKey,
        model,
        prompt,
        api_format: apiFormat,
        temperature: temperature !== null ? temperature : undefined,
        timeout_seconds: timeoutSeconds,
      },
    });
  }

  // Web fallback for browser preview
  let endpoint = baseUrl.replace(/\/+$/, "");
  if (apiFormat === "anthropic") {
    endpoint += endpoint.endsWith("/messages")
      ? ""
      : endpoint.endsWith("/v1")
      ? "/messages"
      : "/v1/messages";
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
    messages: Array<{ role: string; content: string }>;
    max_tokens?: number;
    temperature?: number;
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
  } else {
    headers["Authorization"] = `Bearer ${apiKey}`;
    bodyObj = {
      model,
      messages: [{ role: "user", content: prompt }],
    };
  }
  if (temperature !== null) bodyObj.temperature = temperature;

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

  const json = (await res.json()) as {
    content?: Array<{ type?: string; text?: string }>;
    choices?: Array<{ message?: { content?: string } }>;
  };
  let text = "";
  if (apiFormat === "anthropic") {
    text = (json.content || []).map((c) => c.text || "").join("");
  } else {
    text = json.choices?.[0]?.message?.content || "";
  }

  return { text, raw_status: res.status, duration_ms: durationMs };
}
