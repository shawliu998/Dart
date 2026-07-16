"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, KeyRound, LoaderCircle, LockKeyhole, ShieldCheck } from "lucide-react";
import { login, saveSession, startDemoSession } from "@/lib/api/auth";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("admin@demo.local");
  const [password, setPassword] = useState("demo1234");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setLoading(true);
    try { const user = await login(email, password); saveSession(user); router.push("/projects"); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "登录失败"); }
    finally { setLoading(false); }
  }
  function enterDemo() { saveSession(startDemoSession()); router.push("/projects"); }

  return <div className="login-page">
    <div className="login-brand"><span><ShieldCheck size={26} /></span><div><strong>标证通 BidEvidence</strong><small>招投标合规与交付工作台</small></div></div>
    <div className="login-layout"><section className="login-story"><span className="login-kicker">企业证据优先</span><h1>让每一项投标响应<br />都有可核验的依据。</h1><p>将招标文件转换为要求、证据、责任人和风险状态相互关联的合规矩阵。</p><ul><li><Check size={14} />结论回到原文、页码和材料 Claim</li><li><Check size={14} />低置信度自动进入人工复核</li><li><Check size={14} />模型运行与人工纠正完整留痕</li></ul></section>
      <section className="login-card"><div><span className="login-lock"><LockKeyhole size={18} /></span><h2>登录工作台</h2><p>使用企业账号继续，或明确进入本地演示会话。</p></div><form onSubmit={submit}><label><span>邮箱</span><input type="email" autoComplete="username" value={email} onChange={(event) => setEmail(event.target.value)} required /></label><label><span>密码</span><input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>{error && <p className="login-error" role="alert">{error}</p>}<button className="button primary login-submit" type="submit" disabled={loading}>{loading ? <><LoaderCircle className="spin" size={15} />验证会话</> : <><KeyRound size={15} />登录并进入项目</>}</button></form><div className="demo-credential"><strong>本地演示模式</strong><p>不会调用认证 API，也不会伪装真实登录；会话仅保存在当前浏览器。</p><button className="button small full-width" type="button" onClick={enterDemo}>进入本地演示</button></div><small className="login-security">演示账号：admin@demo.local / demo1234</small></section>
    </div>
  </div>;
}
