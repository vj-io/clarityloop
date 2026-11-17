"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { api, supabase } from "@/lib/client/session";
import { Field, Input, Screen } from "@/components/ui";
import { usePublicLang } from "@/components/shell/lang";
import { Btn, PublicHeader, errMsg } from "@/components/shell/Common";

const linkCls = "inline-flex min-h-12 items-center font-semibold text-pen underline underline-offset-4";

export default function LoginPage() {
  const { lang, setLang, t } = usePublicLang();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const finishing = useRef(false);

  // After sign-in (code, or the email's magic link): no profile yet -> onboarding, else inbox.
  const finish = useCallback(async () => {
    if (finishing.current) return;
    finishing.current = true;
    try {
      const r = await api("GET /api/me");
      router.replace(r.me ? "/inbox" : "/onboarding");
    } catch (e) { finishing.current = false; setErr(errMsg(e, t)); }
  }, [router, t]);

  useEffect(() => {
    const sb = supabase();
    sb.auth.getSession().then(({ data }) => { if (data.session) finish(); });
    const { data } = sb.auth.onAuthStateChange((ev, s) => { if (ev === "SIGNED_IN" && s) finish(); });
    return () => data.subscription.unsubscribe();
  }, [finish]);

  async function send(e?: React.FormEvent) {
    e?.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.signInWithOtp({
      email: email.trim(), options: { shouldCreateUser: true, emailRedirectTo: location.origin + "/login" },
    });
    setBusy(false);
    if (error) setErr(error.status === 429 ? t("err.rate_limited") : t("login.notSent"));
    else { setSent(true); setCode(""); }
  }
  async function verify(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase().auth.verifyOtp({ email: email.trim(), token: code.trim(), type: "email" });
    if (error) { setBusy(false); setErr(error.status === 429 ? t("err.rate_limited") : t("login.badCode")); return; }
    await finish();
    setBusy(false);
  }

  return (
    <>
      <PublicHeader lang={lang} setLang={setLang} t={t} />
      <Screen>
        <h1 className="font-display text-3xl font-extrabold leading-tight">{t("login.title")}</h1>
        <p className="mt-2 text-lg leading-snug">{t("login.sub")}</p>

        {!sent ? (
          <form onSubmit={send} className="mt-5 space-y-4">
            <Field label={t("login.email")} error={err}>
              <Input type="email" required autoComplete="email" inputMode="email" placeholder="ravi@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
            </Field>
            <Btn type="submit" tone="hi" disabled={busy || !email.includes("@")} className="w-full min-h-14 text-lg">{busy ? t("common.wait") : t("login.send")}</Btn>
          </form>
        ) : (
          <form onSubmit={verify} className="mt-5 space-y-4">
            <p role="status" className="doodle doodle-flat bg-ok-soft! p-3 font-semibold">{t("login.sent", { email })}</p>
            <Field label={t("login.code")} hint={t("login.codeHint")} error={err}>
              <Input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6,8}" maxLength={8} required placeholder="123456"
                value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))} className="text-center font-mono text-2xl tracking-[0.3em]" />
            </Field>
            <Btn type="submit" tone="hi" disabled={busy || code.length < 6} className="w-full min-h-14 text-lg">{busy ? t("common.wait") : t("login.verify")}</Btn>
            <div className="flex flex-wrap gap-x-5">
              <button type="button" className={linkCls} onClick={() => send()} disabled={busy}>{t("login.again")}</button>
              <button type="button" className={linkCls} onClick={() => { setSent(false); setErr(null); }}>{t("login.other")}</button>
            </div>
          </form>
        )}

        <div className="mt-8 flex flex-col gap-1 border-t-2 border-dashed border-ink pt-3">
          <Link href="/join" className={linkCls}>{t("login.worker")}</Link>
          <Link href="/judge" className={linkCls}>{t("login.judge")}</Link>
        </div>
      </Screen>
    </>
  );
}
