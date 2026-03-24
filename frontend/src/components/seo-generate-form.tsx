"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { LanePriority } from "@/lib/types";
import { postJson } from "@/lib/client-api";

interface SeoGenerateFormProps {
  workspaceId: string;
}

export function SeoGenerateForm({ workspaceId }: SeoGenerateFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [focus, setFocus] = useState("AI memory pain and grounded docs");
  const [count, setCount] = useState("4");
  const [priority, setPriority] = useState<LanePriority>("p2_compounding");
  const [pageType, setPageType] = useState<
    "compare" | "use_case" | "integration" | "benchmark" | "problem_solution" | "docs_adjacent" | "landing"
  >("problem_solution");
  const [message, setMessage] = useState("");

  function runClusters() {
    setMessage("");
    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/seo/topic-clusters/generate`, {
          count: Number(count),
          focus,
          priority,
          trigger: "frontend_seo",
        });
        setMessage("Topic clusters generated.");
        router.refresh();
      } catch (error) {
        setMessage((error as Error).message);
      }
    });
  }

  function runPages() {
    setMessage("");
    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/seo/pages/generate`, {
          count: Number(count),
          pageType,
          focus,
          priority,
          trigger: "frontend_seo_pages",
        });
        setMessage("SEO pages generated.");
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
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Count</span>
          <input
            className="dashboard-input"
            type="number"
            min={1}
            max={12}
            value={count}
            onChange={(event) => setCount(event.target.value)}
          />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Page type</span>
          <select
            className="dashboard-select"
            value={pageType}
            onChange={(event) =>
              setPageType(
                event.target.value as "compare" | "use_case" | "integration" | "benchmark" | "problem_solution" | "docs_adjacent" | "landing",
              )
            }
          >
            <option value="problem_solution">problem_solution</option>
            <option value="compare">compare</option>
            <option value="use_case">use_case</option>
            <option value="integration">integration</option>
            <option value="benchmark">benchmark</option>
            <option value="docs_adjacent">docs_adjacent</option>
            <option value="landing">landing</option>
          </select>
        </label>
      </div>
      <div className="dashboard-actions">
        <button className="dashboard-btn dashboard-btn-dark" type="button" disabled={isPending} onClick={runClusters}>
          {isPending ? "Running..." : "Generate clusters"}
        </button>
        <button className="dashboard-btn" type="button" disabled={isPending} onClick={runPages}>
          Generate pages
        </button>
        {message ? <span className="dashboard-subtle">{message}</span> : null}
      </div>
    </div>
  );
}
