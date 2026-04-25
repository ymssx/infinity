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
    keyGuideText: "前往 OpenAI Platform → API Keys 创建",
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
    keyGuideText: "前往 DeepSeek 开放平台 → API Keys 创建",
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
    keyGuideText: "前往 OpenRouter → Keys 创建（支持 Claude/Gemini 等多种模型）",
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
    keyGuideText: "前往 Google AI Studio → Get API Key 创建",
  },
  {
    id: "qwen",
    name: "通义千问 (阿里云)",
    icon: "☁️",
    baseUrl: "https://dashscope.aliyuncs.com/compatible-mode/v1",
    models: ["qwen-max", "qwen-plus", "qwen-turbo"],
    defaultModel: "qwen-plus",
    keyPlaceholder: "sk-...",
    keyGuideUrl: "https://help.aliyun.com/zh/model-studio/get-api-key",
    keyGuideText: "前往阿里云百炼控制台 → API-KEY 管理创建",
  },
  {
    id: "doubao",
    name: "豆包 (字节跳动)",
    icon: "🫘",
    baseUrl: "https://ark.cn-beijing.volces.com/api/v3",
    models: ["doubao-1.5-pro-256k", "doubao-1.5-pro-32k", "doubao-1.5-lite-32k"],
    defaultModel: "doubao-1.5-pro-256k",
    keyPlaceholder: "输入你的 API Key...",
    keyGuideUrl: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
    keyGuideText: "前往火山引擎方舟控制台 → API Key 管理创建",
  },
  {
    id: "glm",
    name: "智谱 GLM",
    icon: "🧠",
    baseUrl: "https://open.bigmodel.cn/api/paas/v4",
    models: ["glm-4-plus", "glm-4-flash", "glm-4-long"],
    defaultModel: "glm-4-plus",
    keyPlaceholder: "输入你的 API Key...",
    keyGuideUrl: "https://open.bigmodel.cn/usercenter/apikeys",
    keyGuideText: "前往智谱 AI 开放平台 → API Keys 创建",
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
