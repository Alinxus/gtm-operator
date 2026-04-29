"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";

interface SendEmailButtonProps {
  touchId: string;
  alreadyApproved?: boolean;
}

export function SendEmailButton({ touchId, alreadyApproved = false }: SendEmailButtonProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<{ sent: boolean; reason: string } | null>(null);

  async function handleSend() {
    startTransition(async () => {
      try {
        // Approve first if not already approved
        if (!alreadyApproved) {
          await postJson(`/v2/touches/${touchId}/approve`, { reviewer: "alameen" });
        }
        const res = await postJson(`/v2/touches/${touchId}/send-email`, {});
        setResult(res as { sent: boolean; reason: string });
        router.refresh();
      } catch (error) {
        setResult({ sent: false, reason: (error as Error).message });
      }
    });
  }

  if (result) {
    return (
      <span className={result.sent ? "dashboard-subtle" : "dashboard-error"}>
        {result.sent ? "Sent ✓" : `Failed: ${result.reason}`}
      </span>
    );
  }

  return (
    <button
      className="dashboard-btn dashboard-btn-dark dashboard-btn-sm"
      onClick={handleSend}
      disabled={isPending}
      type="button"
    >
      {isPending ? "Sending…" : alreadyApproved ? "Send email" : "Approve & send"}
    </button>
  );
}
