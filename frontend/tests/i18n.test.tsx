import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LocaleProvider, useI18n } from "@/lib/i18n";

function LocaleFixture() {
  const { locale, setLocale, t } = useI18n();
  return (
    <div>
      <strong data-testid="locale">{locale}</strong>
      <span>{t("工作台")}</span>
      <span data-testid="legacy-label">合规审阅</span>
      <span data-testid="business-source" data-preserve-language>招标原文</span>
      <input aria-label="搜索要求" placeholder="搜索要求" />
      <button type="button" onClick={() => setLocale("en")}>English</button>
      <button type="button" onClick={() => setLocale("zh")}>中文</button>
    </div>
  );
}

describe("LocaleProvider", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.lang = "en";
  });

  afterEach(() => {
    window.localStorage.clear();
  });

  it("defaults to English while preserving marked Chinese business content", async () => {
    render(<LocaleProvider><LocaleFixture /></LocaleProvider>);

    expect(screen.getByText("Workspace")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByTestId("legacy-label")).toHaveTextContent("Compliance review"));
    expect(screen.getByTestId("business-source")).toHaveTextContent("招标原文");
    expect(screen.getByRole("textbox", { name: "Search requirements" })).toHaveAttribute("placeholder", "Search requirements");
    expect(document.documentElement).toHaveAttribute("lang", "en");
  });

  it("switches to Chinese and persists the preference", async () => {
    render(<LocaleProvider><LocaleFixture /></LocaleProvider>);
    fireEvent.click(screen.getByRole("button", { name: "中文" }));

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("zh"));
    expect(screen.getByText("工作台")).toBeInTheDocument();
    expect(screen.getByTestId("legacy-label")).toHaveTextContent("合规审阅");
    expect(window.localStorage.getItem("bidevidence.locale")).toBe("zh");
    expect(document.documentElement).toHaveAttribute("lang", "zh-CN");
  });

  it("restores the saved language on the next mount", async () => {
    window.localStorage.setItem("bidevidence.locale", "zh");
    render(<LocaleProvider><LocaleFixture /></LocaleProvider>);

    await waitFor(() => expect(screen.getByTestId("locale")).toHaveTextContent("zh"));
    expect(screen.getByText("工作台")).toBeInTheDocument();
  });
});
