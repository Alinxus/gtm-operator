"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";

export function NewWorkspaceForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [icp, setIcp] = useState("");
  const [error, setError] = useState("");

  function slugify(str: string) {
    return str.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    startTransition(async () => {
      try {
        const res = await postJson("/v1/brands", {
          slug: slugify(name),
          name: name.trim(),
          description: description.trim() || undefined,
          icp: icp.trim() || undefined,
        }) as { workspace?: { id: string } };
        if (res.workspace?.id) {
          router.push(`/workspaces/${res.workspace.id}/chat`);
        } else {
          router.refresh();
          setOpen(false);
        }
      } catch (err) {
        setError((err as Error).message);
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="dashboard-btn dashboard-btn-dark"
        style={{ marginTop: 8 }}
      >
        + New workspace
      </button>
    );
  }

  return (
    <article className="dashboard-panel" style={{ marginTop: 14 }}>
      <div className="dashboard-panel-head">
        <div>
          <p className="dashboard-panel-title">Set up a new workspace</p>
          <p className="dashboard-panel-subtitle">Takes 30 seconds. Works for any company.</p>
        </div>
        <button
          onClick={() => setOpen(false)}
          style={{ background: "none", border: "none", cursor: "pointer", color: "var(--faint)", fontSize: 18, lineHeight: 1 }}
        >
          ×
        </button>
      </div>
      <div className="dashboard-panel-body">
        <form className="dashboard-form" onSubmit={onSubmit}>
          <label className="dashboard-field">
            <span className="dashboard-label">Company name *</span>
            <input
              className="dashboard-input"
              placeholder="Acme Inc"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
            />
          </label>
          <label className="dashboard-field">
            <span className="dashboard-label">What you do</span>
            <input
              className="dashboard-input"
              placeholder="e.g. AI memory infrastructure for developers"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </label>
          <label className="dashboard-field">
            <span className="dashboard-label">Who you sell to</span>
            <input
              className="dashboard-input"
              placeholder="e.g. Founders of early-stage B2B SaaS companies"
              value={icp}
              onChange={(e) => setIcp(e.target.value)}
            />
          </label>
          <div className="dashboard-actions">
            <button type="submit" className="dashboard-btn dashboard-btn-dark" disabled={isPending || !name.trim()}>
              {isPending ? "Creating…" : "Create workspace"}
            </button>
            {error ? <span className="dashboard-error">{error}</span> : null}
          </div>
        </form>
      </div>
    </article>
  );
}
