"use client";

const CONFIG_KEY = "infinity_config";

export interface AppConfig {
  provider: string; // preset id or "custom"
  openaiApiKey: string;
  openaiBaseUrl: string;
  openaiModel: string;
}

export interface ModelPreset {
  id: string;
  name: string;
  icon: string;
  baseUrl: string;
  models: string[];
  defaultModel: string;
  keyPlaceholder: string;
  keyGuideUrl: string;
  keyGuideText: string;
}

export const MODEL_PRESETS: ModelPreset[] = [
  {
    id: "openai",
    name: "OpenAI",
    icon: "🟢",
    baseUrl: "https://api.openai.com/v1",
    models: ["gpt-4o", "gpt-4o-mini", "gpt-4.1", "gpt-4.1-mini", "gpt-4.1-nano", "o3-mini"],
    defaultModel: "gpt-4o",
    keyPlaceholder: "sk-...",
    keyGuideUrl: "https://platform.openai.com/api-keys",
    keyGuideText: "Get your key at OpenAI Platform → API Keys",
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    icon: "🐋",
    baseUrl: "https://api.deepseek.com",
    models: ["deepseek-v4-flash", "deepseek-v4-pro", "deepseek-chat", "deepseek-reasoner"],
    defaultModel: "deepseek-v4-flash",
    keyPlaceholder: "sk-...",
    keyGuideUrl: "https://platform.deepseek.com/api_keys",
    keyGuideText: "Get your key at DeepSeek Platform → API Keys",
  },
  {
    id: "anthropic-openrouter",
    name: "Claude (OpenRouter)",
    icon: "🔮",
    baseUrl: "https://openrouter.ai/api/v1",
    models: ["anthropic/claude-sonnet-4", "anthropic/claude-4o", "anthropic/claude-3.5-sonnet"],
    defaultModel: "anthropic/claude-sonnet-4",
    keyPlaceholder: "sk-or-...",
    keyGuideUrl: "https://openrouter.ai/keys",
    keyGuideText: "Get your key at OpenRouter → Keys",
  },
  {
    id: "gemini",
    name: "Gemini (Google)",
    icon: "💎",
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    models: ["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.0-flash"],
    defaultModel: "gemini-2.5-flash",
    keyPlaceholder: "AIza...",
    keyGuideUrl: "https://aistudio.google.com/apikey",
    keyGuideText: "Get your key at Google AI Studio → Get API Key",
  },
  {
    id: "qwen",
    name: "Qwen (Alibaba)",
    icon: "☁️",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    defaultModel: "qwen-plus",
    keyPlaceholder: "sk-...",
    keyGuideUrl: "https://help.aliyun.com/zh/model-studio/get-api-key",
    keyGuideText: "Get your key at Alibaba Cloud Bailian Console",
  },
  {
    id: "doubao",
    name: "Doubao (ByteDance)",
    icon: "🫘",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-1.5-pro-256k", "doubao-1.5-pro-32k", "doubao-1.5-lite-32k"],
    defaultModel: "doubao-1.5-pro-256k",
    keyPlaceholder: "Enter your API Key...",
    keyGuideUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    keyGuideText: "Get your key at Volcengine Ark Console",
  },
  {
    id: "glm",
    name: "GLM (Zhipu AI)",
    icon: "🧠",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-flash", "glm-4-long"],
    defaultModel: "glm-4-plus",
    keyPlaceholder: "Enter your API Key...",
    keyGuideUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    keyGuideText: "Get your key at Zhipu AI Platform → API Keys",
  },
];

const DEFAULT_CONFIG: AppConfig = {
  provider: "openai",
  openaiApiKey: "",
  openaiBaseUrl: "https://api.openai.com/v1",
  openaiModel: "gpt-4o",
};

export function getPreset(id: string): ModelPreset | undefined {
  return MODEL_PRESETS.find((p) => p.id === id);
}

export function getConfig(): AppConfig {
  if (typeof window === "undefined") return DEFAULT_CONFIG;
  try {
    const raw = localStorage.getItem(CONFIG_KEY);
    if (!raw) return DEFAULT_CONFIG;
    return { ...DEFAULT_CONFIG, ...JSON.parse(raw) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export function saveConfig(config: Partial<AppConfig>): void {
  if (typeof window === "undefined") return;
  const current = getConfig();
  const merged = { ...current, ...config };
  localStorage.setItem(CONFIG_KEY, JSON.stringify(merged));
}

export function isConfigured(): boolean {
  const config = getConfig();
  return !!config.openaiApiKey;
}

/** Get Next.js basePath for constructing URLs in client-side navigation */
export function getBasePath(): string {
  return process.env.NEXT_PUBLIC_BASE_PATH || "";
}
