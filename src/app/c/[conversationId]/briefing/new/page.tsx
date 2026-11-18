"use client";
// Safety briefing (supervisor, crew channel): pick 2-5 points from the crew's safety list, optional place and
// note, preview per worker language, send. Each worker says the points back in their own pair chat.
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { AppHeader } from "@/components/shell/AppHeader";
import { useRequireMe } from "@/components/shell/guard";
import { Spinner } from "@/components/ui";
import { BriefingForm } from "@/components/chat/briefing";
import { api } from "@/lib/client/session";
import type { CrewDTO } from "@/lib/types";

export default function NewBriefingPage() {
  const { conversationId } = useParams<{ conversationId: string }>();
  const { me, t } = useRequireMe();
  const router = useRouter();
  const [crew, setCrew] = useState<CrewDTO | null>(null);
  const [loadErr, setLoadErr] = useState(false);

  useEffect(() => {
    if (!me) return;
    if (me.role !== "supervisor") { router.replace(`/c/${conversationId}`); return; }
    api("GET /api/crew").then((c) => setCrew(c.crew)).catch(() => setLoadErr(true));
  }, [me, conversationId, router]);

  const back = `/c/${conversationId}`;
  return (
    <>
      <AppHeader title={t("s.form.title")} back={back} />
      {!me || (!crew && !loadErr) ? <div className="p-6"><Spinner label={t("c.loading")} /></div>
        : !crew ? <p className="p-6 font-semibold text-bad">{t("c.loadFailed")}</p>
        : <BriefingForm crew={crew} conversationId={conversationId} me={me} t={t} />}
    </>
  );
}
