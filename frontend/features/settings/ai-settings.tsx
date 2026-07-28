"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, Cpu, Lightning, SpinnerGap, WarningCircle } from "@phosphor-icons/react";
import { settingsApi, type AIProvider, type AISettingsInput } from "@/lib/api/settings";
import { useI18n } from "@/lib/i18n";
import styles from "./ai-settings.module.css";

const DEEPSEEK_BASE_URL = "https://api.deepseek.com/v1";
const DEEPSEEK_MODEL = "deepseek-v4-flash";

const errorCopy: Record<string, string> = {
  missing_api_key: "请输入 API 密钥后重试。",
  authentication_failed: "API 密钥未通过验证，请检查后重试。",
  timeout: "连接超时，请检查网络或服务地址。",
  structured_output_failed: "服务已响应，但输出不符合结构化分析要求。",
  connection_failed: "无法连接到模型服务，请检查服务地址和网络。",
};

type FormState = {
  provider: AIProvider;
  baseUrl: string;
  model: string;
  apiKey: string;
  hasApiKey: boolean;
};

export function AISettingsPanel() {
  const { t } = useI18n();
  const [form, setForm] = useState<FormState | null>(null);
  const [busy, setBusy] = useState<"loading" | "testing" | "saving" | null>("loading");
  const [status, setStatus] = useState<"untested" | "passed" | "failed">("untested");
  const [errorCode, setErrorCode] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    let active = true;
    settingsApi.readAIModel()
      .then((settings) => {
        if (!active) return;
        setForm({
          provider: settings.provider,
          baseUrl: settings.base_url ?? DEEPSEEK_BASE_URL,
          model: settings.model ?? DEEPSEEK_MODEL,
          apiKey: "",
          hasApiKey: settings.has_api_key,
        });
        setStatus(settings.last_test_status);
        setErrorCode(settings.last_error_code);
      })
      .catch(() => {
        if (!active) return;
        setForm({
          provider: "mock",
          baseUrl: DEEPSEEK_BASE_URL,
          model: DEEPSEEK_MODEL,
          apiKey: "",
          hasApiKey: false,
        });
        setStatus("failed");
        setErrorCode("settings_unavailable");
      })
      .finally(() => {
        if (active) setBusy(null);
      });
    return () => {
      active = false;
    };
  }, []);

  const payload = useMemo<AISettingsInput | null>(() => {
    if (!form) return null;
    return {
      provider: form.provider,
      base_url: form.provider === "deepseek" ? form.baseUrl.trim() : null,
      model: form.provider === "deepseek" ? form.model.trim() : null,
      api_key: form.apiKey.trim() || null,
    };
  }, [form]);

  const change = (patch: Partial<FormState>) => {
    setForm((current) => current ? { ...current, ...patch } : current);
    setStatus("untested");
    setErrorCode(null);
    setSaved(false);
  };

  const testConnection = async () => {
    if (!payload) return;
    setBusy("testing");
    setSaved(false);
    try {
      await settingsApi.testAIModel(payload);
      setStatus("passed");
      setErrorCode(null);
    } catch (error) {
      setStatus("failed");
      setErrorCode(error instanceof Error ? error.message : "connection_failed");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!payload) return;
    setBusy("saving");
    setSaved(false);
    try {
      const result = await settingsApi.saveAIModel(payload);
      setForm((current) => current ? {
        ...current,
        apiKey: "",
        hasApiKey: result.has_api_key,
      } : current);
      setStatus(result.last_test_status);
      setErrorCode(result.last_error_code);
      setSaved(true);
    } catch (error) {
      setStatus("failed");
      setErrorCode(error instanceof Error ? error.message : "save_failed");
    } finally {
      setBusy(null);
    }
  };

  if (!form) {
    return <div className={styles.page}><div className={styles.loading}>{t("正在载入设置…")}</div></div>;
  }

  const deepSeekReady = Boolean(
    form.baseUrl.trim()
    && form.model.trim()
    && (form.apiKey.trim() || form.hasApiKey),
  );
  const canTest = form.provider === "mock" || deepSeekReady;
  const canSave = status === "passed" && !busy;
  const statusText = saved
    ? t("设置已保存，新的分析任务会立即使用此连接。")
    : status === "passed"
      ? t("连接通过，结构化输出符合要求。")
      : status === "failed"
        ? t("连接未通过，请检查密钥、模型名称和网络后重试。")
        : t("保存前请先测试当前配置。");
  const errorText = errorCode ? t(errorCopy[errorCode] ?? errorCode) : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <p className={styles.eyebrow}>{t("工作区设置")}</p>
        <h1>{t("模型连接")}</h1>
        <p>{t("选择用于招标文件分析的模型。连接测试会运行一次真实的结构化输出校验，保存后无需重启。")}</p>
      </header>

      <div className={styles.card}>
        <section className={styles.section}>
          <div className={styles.sectionIntro}>
            <h2>{t("提供商")}</h2>
            <p>{t("每个工作区只启用一个分析模型。")}</p>
          </div>
          <div className={styles.providerList}>
            <button
              type="button"
              className={`${styles.provider} ${form.provider === "mock" ? styles.selected : ""}`}
              onClick={() => change({ provider: "mock" })}
            >
              <span className={styles.providerIcon}><Cpu size={17} /></span>
              <span><strong>Built-in Mock</strong><small>{t("离线、确定性，适合试用和演示")}</small></span>
              {form.provider === "mock" && <Check className={styles.check} size={15} weight="bold" />}
            </button>
            <button
              type="button"
              className={`${styles.provider} ${form.provider === "deepseek" ? styles.selected : ""}`}
              onClick={() => change({ provider: "deepseek" })}
            >
              <span className={styles.providerIcon}><Lightning size={17} /></span>
              <span><strong>DeepSeek</strong><small>{t("使用你的 API 密钥运行真实模型")}</small></span>
              {form.provider === "deepseek" && <Check className={styles.check} size={15} weight="bold" />}
            </button>
          </div>
        </section>

        {form.provider === "deepseek" && (
          <section className={styles.section}>
            <div className={styles.sectionIntro}>
              <h2>{t("连接详情")}</h2>
              <p>{t("密钥只在本机保存，读取设置时不会返回。")}</p>
            </div>
            <div className={styles.fields}>
              <div className={styles.field}>
                <label htmlFor="provider-base-url">Base URL</label>
                <input
                  id="provider-base-url"
                  value={form.baseUrl}
                  onChange={(event) => change({ baseUrl: event.target.value })}
                  spellCheck={false}
                  data-preserve-language
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="provider-model">{t("模型")}</label>
                <input
                  id="provider-model"
                  value={form.model}
                  onChange={(event) => change({ model: event.target.value })}
                  spellCheck={false}
                  data-preserve-language
                />
              </div>
              <div className={styles.field}>
                <label htmlFor="provider-api-key">API key</label>
                <input
                  id="provider-api-key"
                  type="password"
                  value={form.apiKey}
                  onChange={(event) => change({ apiKey: event.target.value })}
                  placeholder={form.hasApiKey ? t("已保存密钥；留空则继续使用") : "sk-…"}
                  autoComplete="off"
                  data-preserve-language
                />
                <p className={styles.secretHint}>
                  {form.hasApiKey ? t("当前工作区已有密钥。输入新值将替换它。") : t("该密钥不会显示在设置响应或运行记录中。")}
                </p>
              </div>
            </div>
          </section>
        )}

        <footer className={styles.footer}>
          <div className={`${styles.status} ${styles[status]}`}>
            {busy ? <SpinnerGap size={15} className="spin" /> : status === "passed" ? <Check size={15} weight="bold" /> : status === "failed" ? <WarningCircle size={15} /> : <Cpu size={15} />}
            <span>{statusText}{errorText && status === "failed" ? ` ${errorText}` : ""}</span>
          </div>
          <div className={styles.actions}>
            <button type="button" disabled={!canTest || Boolean(busy)} onClick={testConnection}>
              {busy === "testing" ? t("正在测试…") : t("测试连接")}
            </button>
            <button type="button" disabled={!canSave} onClick={save}>
              {busy === "saving" ? t("正在保存…") : t("保存设置")}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
