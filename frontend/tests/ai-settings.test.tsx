import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";

import { AISettingsPanel } from "@/features/settings/ai-settings";
import { LocaleProvider } from "@/lib/i18n";
import { settingsApi, type AISettings } from "@/lib/api/settings";


const mockSettings: AISettings = {
  provider: "mock",
  base_url: "https://api.deepseek.com/v1",
  model: "deepseek-v4-flash",
  has_api_key: false,
  capability_profile: { adapter: "mock", offline: true },
  last_test_status: "untested",
  last_tested_at: null,
  last_error_code: null,
};


function renderSettings() {
  return render(
    <LocaleProvider>
      <AISettingsPanel />
    </LocaleProvider>,
  );
}


describe("AISettingsPanel", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(settingsApi, "readAIModel").mockResolvedValue(mockSettings);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("requires the current configuration to pass before saving", async () => {
    const user = userEvent.setup();
    const testAIModel = vi.spyOn(settingsApi, "testAIModel").mockResolvedValue({
      status: "passed",
      provider: "mock",
      model: "mock-requirement-extractor-v1",
      error_code: null,
    });
    const saveAIModel = vi.spyOn(settingsApi, "saveAIModel").mockResolvedValue({
      ...mockSettings,
      last_test_status: "passed",
    });

    renderSettings();

    expect(await screen.findByRole("heading", { name: "Model connection" })).toBeInTheDocument();
    const saveButton = screen.getByRole("button", { name: "Save settings" });
    expect(saveButton).toBeDisabled();

    await user.click(screen.getByRole("button", { name: "Test connection" }));
    await waitFor(() => expect(testAIModel).toHaveBeenCalledWith({
      provider: "mock",
      base_url: null,
      model: null,
      api_key: null,
    }));
    expect(saveButton).toBeEnabled();

    await user.click(saveButton);
    await waitFor(() => expect(saveAIModel).toHaveBeenCalledOnce());
    expect(await screen.findByText(/Settings saved/)).toBeInTheDocument();
  });

  it("shows the DeepSeek fields and keeps save disabled after editing", async () => {
    const user = userEvent.setup();
    renderSettings();

    await screen.findByRole("heading", { name: "Model connection" });
    await user.click(screen.getByRole("button", { name: /DeepSeek/ }));

    expect(screen.getByLabelText("Base URL")).toHaveValue("https://api.deepseek.com/v1");
    expect(screen.getByLabelText("Model")).toHaveValue("deepseek-v4-flash");
    expect(screen.getByLabelText("API key")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Test connection" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Save settings" })).toBeDisabled();
  });
});
