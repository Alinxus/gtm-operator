"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";
import type { SourceType } from "@/lib/types";
import { compact } from "@/lib/utils";

const sources: SourceType[] = [
  "manual",
  "form",
  "github",
  "docs",
  "product",
  "reddit",
  "hacker_news",
  "y_combinator",
  "x",
  "linkedin",
  "crm",
];

interface SignalIngestFormProps {
  workspaceId: string;
}

export function SignalIngestForm({ workspaceId }: SignalIngestFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [source, setSource] = useState<SourceType>("manual");
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [accountName, setAccountName] = useState("");
  const [accountDomain, setAccountDomain] = useState("");
  const [personName, setPersonName] = useState("");
  const [personRole, setPersonRole] = useState("");
  const [personEmail, setPersonEmail] = useState("");
  const [socialHandle, setSocialHandle] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/signals`, {
          source,
          title,
          content,
          account: compact({
            name: accountName,
            domain: accountDomain,
          }),
          person:
            personName || personRole || personEmail || socialHandle
              ? compact({
                  name: personName,
                  role: personRole,
                  email: personEmail,
                  socialHandle,
                })
              : undefined,
          autoGenerateSequence: true,
        });
        setMessage("Signal ingested.");
        setTitle("");
        setContent("");
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
          <span className="dashboard-label">Source</span>
          <select
            className="dashboard-select"
            value={source}
            onChange={(event) => setSource(event.target.value as SourceType)}
          >
            {sources.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Account</span>
          <input
            className="dashboard-input"
            placeholder="Acme AI"
            value={accountName}
            onChange={(event) => setAccountName(event.target.value)}
            required
          />
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Signal title</span>
        <input
          className="dashboard-input"
          placeholder="Founder asks how to persist memory across sessions"
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          required
        />
      </label>
      <label className="dashboard-field">
        <span className="dashboard-label">Signal content</span>
        <textarea
          className="dashboard-textarea"
          placeholder="Capture the pain, urgency, and what outcome they need."
          value={content}
          onChange={(event) => setContent(event.target.value)}
          required
        />
      </label>
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Account domain</span>
          <input
            className="dashboard-input"
            placeholder="acme.ai"
            value={accountDomain}
            onChange={(event) => setAccountDomain(event.target.value)}
          />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Person name</span>
          <input
            className="dashboard-input"
            placeholder="Jane Founder"
            value={personName}
            onChange={(event) => setPersonName(event.target.value)}
          />
        </label>
      </div>
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Person role</span>
          <input
            className="dashboard-input"
            placeholder="Founder"
            value={personRole}
            onChange={(event) => setPersonRole(event.target.value)}
          />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Email</span>
          <input
            className="dashboard-input"
            placeholder="jane@acme.ai"
            value={personEmail}
            onChange={(event) => setPersonEmail(event.target.value)}
          />
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Social handle</span>
        <input
          className="dashboard-input"
          placeholder="@janefounder"
          value={socialHandle}
          onChange={(event) => setSocialHandle(event.target.value)}
        />
      </label>
      <div className="dashboard-actions">
        <button type="submit" className="dashboard-btn dashboard-btn-dark" disabled={isPending}>
          {isPending ? "Ingesting..." : "Ingest signal"}
        </button>
        {message ? <span className="dashboard-subtle">{message}</span> : null}
      </div>
    </form>
  );
}
