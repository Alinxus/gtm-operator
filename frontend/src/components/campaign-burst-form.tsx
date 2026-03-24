"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LanePriority } from "@/lib/types";
import { postJson } from "@/lib/client-api";

interface CampaignBurstFormProps {
  workspaceId: string;
}

export function CampaignBurstForm({ workspaceId }: CampaignBurstFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [burstType, setBurstType] = useState<
    "launch" | "benchmark" | "integration" | "partnership" | "feature" | "content_repurposing"
  >("launch");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("booked conversations");
  const [brief, setBrief] = useState("");
  const [priority, setPriority] = useState<LanePriority>("p3_burst");
  const [message, setMessage] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/campaign-bursts`, {
          burstType,
          name: name || undefined,
          goal: goal || undefined,
          brief,
          priority,
          trigger: "frontend_campaign",
        });
        setMessage("Campaign burst created.");
        setBrief("");
        router.refresh();
      } catch (error) {
        setMessage((error as Error).message);
      }
    });
  }

  return (
    <form className="dashboard-form" onSubmit={onSubmit}>
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Burst type</span>
          <select
            className="dashboard-select"
            value={burstType}
            onChange={(event) =>
              setBurstType(
                event.target.value as "launch" | "benchmark" | "integration" | "partnership" | "feature" | "content_repurposing",
              )
            }
          >
            <option value="launch">launch</option>
            <option value="benchmark">benchmark</option>
            <option value="integration">integration</option>
            <option value="partnership">partnership</option>
            <option value="feature">feature</option>
            <option value="content_repurposing">content_repurposing</option>
          </select>
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
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Name</span>
          <input
            className="dashboard-input"
            placeholder="LangGraph integration push"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Goal</span>
          <input className="dashboard-input" value={goal} onChange={(event) => setGoal(event.target.value)} />
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Brief</span>
        <textarea
          className="dashboard-textarea"
          placeholder="What happened, why now, and what conversion action we want."
          value={brief}
          onChange={(event) => setBrief(event.target.value)}
          required
        />
      </label>
      <div className="dashboard-actions">
        <button className="dashboard-btn dashboard-btn-dark" type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create burst"}
        </button>
        {message ? <span className="dashboard-subtle">{message}</span> : null}
      </div>
    </form>
  );
}
