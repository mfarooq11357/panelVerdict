/**
 * OpenAI-compatible chat bases. Verified against provider docs, 2026.
 * Anthropic is the exception: it does not speak this wire format.
 * keyEnv is the provider's own variable. A seat can still override it.
 */
export const PROVIDERS = {
  openai: {
    baseUrl: "https://api.openai.com/v1",
    keyEnv: "OPENAI_API_KEY",
    note: "GPT models",
  },
  groq: {
    baseUrl: "https://api.groq.com/openai/v1",
    keyEnv: "GROQ_API_KEY",
    note: "Fast Llama and others",
  },
  openrouter: {
    baseUrl: "https://openrouter.ai/api/v1",
    keyEnv: "OPENROUTER_API_KEY",
    note: "Many models, one key",
  },
  together: {
    baseUrl: "https://api.together.xyz/v1",
    keyEnv: "TOGETHER_API_KEY",
    note: "Together AI",
  },
  fireworks: {
    baseUrl: "https://api.fireworks.ai/inference/v1",
    keyEnv: "FIREWORKS_API_KEY",
    note: "Fireworks inference",
  },
  deepseek: {
    baseUrl: "https://api.deepseek.com/v1",
    keyEnv: "DEEPSEEK_API_KEY",
    note: "DeepSeek",
  },
  mistral: {
    baseUrl: "https://api.mistral.ai/v1",
    keyEnv: "MISTRAL_API_KEY",
    note: "Mistral",
  },
  xai: {
    baseUrl: "https://api.x.ai/v1",
    keyEnv: "XAI_API_KEY",
    note: "Grok",
  },
  gemini: {
    baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
    keyEnv: "GEMINI_API_KEY",
    note: "Google Gemini OpenAI-compatible endpoint",
  },
  cerebras: {
    baseUrl: "https://api.cerebras.ai/v1",
    keyEnv: "CEREBRAS_API_KEY",
    note: "Cerebras",
  },
  deepinfra: {
    baseUrl: "https://api.deepinfra.com/v1/openai",
    keyEnv: "DEEPINFRA_API_KEY",
    note: "DeepInfra",
  },
  nvidia: {
    baseUrl: "https://integrate.api.nvidia.com/v1",
    keyEnv: "NVIDIA_API_KEY",
    note: "NVIDIA NIM",
  },
  perplexity: {
    baseUrl: "https://api.perplexity.ai",
    keyEnv: "PERPLEXITY_API_KEY",
    note: "Sonar models. Chat only.",
  },
  moonshot: {
    baseUrl: "https://api.moonshot.ai/v1",
    keyEnv: "MOONSHOT_API_KEY",
    note: "Kimi",
  },
  qwen: {
    baseUrl: "https://dashscope-intl.aliyuncs.com/compatible-mode/v1",
    keyEnv: "DASHSCOPE_API_KEY",
    note: "Alibaba DashScope international",
  },
  ollama: {
    baseUrl: "http://127.0.0.1:11434/v1",
    keyEnv: "OLLAMA_API_KEY",
    note: "Local. Any non-empty key works if the server does not check one.",
  },
  lmstudio: {
    baseUrl: "http://127.0.0.1:1234/v1",
    keyEnv: "LMSTUDIO_API_KEY",
    note: "Local LM Studio",
  },
  vllm: {
    baseUrl: "http://127.0.0.1:8000/v1",
    keyEnv: "VLLM_API_KEY",
    note: "Local vLLM",
  },
  anthropic: {
    baseUrl: null,
    keyEnv: "ANTHROPIC_API_KEY",
    wire: "anthropic",
    note: "Claude Messages API. Not OpenAI-compatible.",
  },
};

export function resolveProvider(name) {
  const id = String(name || "").trim().toLowerCase();
  const found = PROVIDERS[id];
  if (!found) {
    throw new Error(`unknown provider: ${name}. Run panelverdict providers.`);
  }
  return { id, ...found };
}

export function listProviders() {
  return Object.entries(PROVIDERS)
    .map(([id, provider]) => ({ id, ...provider }))
    .sort((a, b) => a.id.localeCompare(b.id));
}
