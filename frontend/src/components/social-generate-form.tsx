"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LanePriority } from "@/lib/types";
import { postJson } from "@/lib/client-api";

interface SocialGenerateFormProps {
  workspaceId: string;
}

export function SocialGenerateForm({ workspaceId }: SocialGenerateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [focus, setFocus] = useState("persistent memory + grounded docs");
  const [count, setCount] = useState("6");
  const [priority, setPriority] = useState<LanePriority>("p1_brand_presence");
  const [message, setMessage] = useState("");

  function runCalendar() {
    setMessage("");
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 30) {
      setMessage("Count must be an integer between 1 and 30.");
      return;
    }
    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/social/calendar/generate`, {
          count: parsedCount,
          focus,
          priority,
          trigger: "frontend_social",
        });
        setMessage("Social calendar generated.");
        router.refresh();
      } catch (error) {
        setMessage((error as Error).message);
      }
    });
  }

  function runReplies() {
    setMessage("");
    const parsedCount = Number(count);
    if (!Number.isInteger(parsedCount) || parsedCount < 1 || parsedCount > 30) {
      setMessage("Count must be an integer between 1 and 30.");
      return;
    }
    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/social/replies/generate`, {
          maxItems: parsedCount,
          trigger: "frontend_social_replies",
        });
        setMessage("Reply bank generated.");
        router.refresh();
      } catch (error) {
        setMessage((error as Error).message);
      }
    });
  }

  return (
    <div className="dashboard-form">
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Focus</span>
          <input className="dashboard-input" value={focus} onChange={(event) => setFocus(event.target.value)} />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Priority</span>
          <select
            className="dashboard-select"
            value={priority}
            onChange={(event) => setPriority(event.target.value as LanePriority)}
          >
            <option value="p0_always_on">p0_always_on</option>
            <option value="p1_brand_presence">p1_brand_presence</option>
            <option value="p2_compounding">p2_compounding</option>
            <option value="p3_burst">p3_burst</option>
          </select>
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Count</span>
        <input
          className="dashboard-input"
          type="number"
          min={1}
          max={30}
          value={count}
          onChange={(event) => setCount(event.target.value)}
        />
      </label>
      <div className="dashboard-actions">
        <button className="dashboard-btn dashboard-btn-dark" type="button" disabled={isPending} onClick={runCalendar}>
          {isPending ? "Running..." : "Generate calendar"}
        </button>
        <button className="dashboard-btn" type="button" disabled={isPending} onClick={runReplies}>
          Generate replies
        </button>
        {message ? <span className="dashboard-subtle">{message}</span> : null}
      </div>
    </div>
  );
}
