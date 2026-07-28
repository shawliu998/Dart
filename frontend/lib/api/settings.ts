import { apiRequest } from "@/lib/api/client";

export type AIProvider = "mock" | "deepseek";

export type AISettings = {
  provider: AIProvider;
  base_url: string | null;
  model: string | null;
  has_api_key: boolean;
  capability_profile: Record<string, unknown>;
  last_test_status: "untested" | "passed" | "failed";
  last_tested_at: string | null;
  last_error_code: string | null;
};

export type AISettingsInput = {
  provider: AIProvider;
  base_url?: string | null;
  model?: string | null;
  api_key?: string | null;
  clear_api_key?: boolean;
};

export type AIConnectionTestResult = {
  status: "passed" | "failed";
  provider: AIProvider;
  model: string;
  error_code: string | null;
};

export const settingsApi = {
  readAIModel: () => apiRequest<AISettings>("/api/settings/ai-model"),
  testAIModel: (input: AISettingsInput) =>
    apiRequest<AIConnectionTestResult>("/api/settings/ai-model/test", {
      method: "POST",
      body: JSON.stringify(input),
    }),
  saveAIModel: (input: AISettingsInput) =>
    apiRequest<AISettings>("/api/settings/ai-model", {
      method: "PATCH",
      body: JSON.stringify(input),
    }),
};
