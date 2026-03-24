"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GrowthLane, LanePriority } from "@/lib/types";
import { postJson } from "@/lib/client-api";

interface LaneRunFormProps {
  workspaceId: string;
  lane: GrowthLane;
  defaultPriority?: LanePriority;
}

const priorities: LanePriority[] = ["p0_always_on", "p1_brand_presence", "p2_compounding", "p3_burst"];

export function LaneRunForm({ workspaceId, lane, defaultPriority = "p0_always_on" }: LaneRunFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [priority, setPriority] = useState<LanePriority>(defaultPriority);
  const [focus, setFocus] = useState("");
  const [maxItems, setMaxItems] = useState("6");
  const [message, setMessage] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/lanes/${lane}/run`, {
          priority,
          focus: focus || undefined,
          maxItems: Number(maxItems) || undefined,
          trigger: "frontend_manual",
        });
        setMessage("Lane run queued.");
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
          <span className="dashboard-label">Priority</span>
          <select
            className="dashboard-select"
            value={priority}
            onChange={(event) => setPriority(event.target.value as LanePriority)}
          >
            {priorities.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Max items</span>
          <input
            className="dashboard-input"
            type="number"
            min={1}
            max={12}
            value={maxItems}
            onChange={(event) => setMaxItems(event.target.value)}
          />
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Focus</span>
        <input
          className="dashboard-input"
          placeholder="memory pain in AI founders"
          value={focus}
          onChange={(event) => setFocus(event.target.value)}
        />
      </label>
      <div className="dashboard-actions">
        <button type="submit" className="dashboard-btn dashboard-btn-dark" disabled={isPending}>
          {isPending ? "Running..." : `Run ${lane} lane`}
        </button>
        {message ? <span className="dashboard-subtle">{message}</span> : null}
      </div>
    </form>
  );
}
