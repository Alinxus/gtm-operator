"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";

interface ApprovalDecisionFormProps {
  touchId: string;
  defaultReviewer?: string;
}

export function ApprovalDecisionForm({ touchId, defaultReviewer = "operator" }: ApprovalDecisionFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [reviewer, setReviewer] = useState(defaultReviewer);
  const [reason, setReason] = useState("");
  const [overrideReason, setOverrideReason] = useState("");
  const [message, setMessage] = useState("");

  function submit(decision: "approve" | "reject" | "override" | "revise") {
    setMessage("");
    startTransition(async () => {
      try {
        await postJson(`/v2/touches/${touchId}/${decision}`, {
          reviewer,
          reason: reason || undefined,
          overrideReason: decision === "override" ? overrideReason || undefined : undefined,
        });
        setMessage(`Decision recorded: ${decision}.`);
        setReason("");
        setOverrideReason("");
        router.refresh();
      } catch (error) {
        setMessage((error as Error).message);
      }
    });
  }

  return (
    <div className="dashboard-stack">
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Reviewer</span>
          <input className="dashboard-input" value={reviewer} onChange={(event) => setReviewer(event.target.value)} />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Reason</span>
          <input
            className="dashboard-input"
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Why this decision makes sense"
          />
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Override reason</span>
        <input
          className="dashboard-input"
          value={overrideReason}
          onChange={(event) => setOverrideReason(event.target.value)}
          placeholder="Required when using override"
        />
      </label>
      <div className="dashboard-actions">
        <button
          className="dashboard-btn dashboard-btn-dark dashboard-btn-sm"
          onClick={() => submit("approve")}
          disabled={isPending}
          type="button"
        >
          Approve
        </button>
        <button className="dashboard-btn dashboard-btn-sm" onClick={() => submit("revise")} disabled={isPending} type="button">
          Revise
        </button>
        <button className="dashboard-btn dashboard-btn-sm" onClick={() => submit("override")} disabled={isPending} type="button">
          Override
        </button>
        <button className="dashboard-btn dashboard-btn-sm" onClick={() => submit("reject")} disabled={isPending} type="button">
          Reject
        </button>
        {message ? <span className="dashboard-subtle">{message}</span> : null}
      </div>
    </div>
  );
}
