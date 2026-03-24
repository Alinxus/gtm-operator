"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";

interface PublishDestinationFormProps {
  workspaceId: string;
}

const githubPreset = JSON.stringify(
  {
    owner: "retaindb",
    repo: "retaindb-frontend",
    baseBranch: "main",
    contentRoot: "src/content",
    pathTemplate: "{{content_root}}/{{slug}}.mdx",
  },
  null,
  2,
);

const webhookPreset = JSON.stringify(
  {
    targetUrl: "https://example.com/webhooks/growth",
    payloadVersion: "v1",
    secret: "replace-me",
  },
  null,
  2,
);

export function PublishDestinationForm({ workspaceId }: PublishDestinationFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [kind, setKind] = useState<"github_pr" | "webhook_export">("github_pr");
  const [name, setName] = useState("Default GitHub publisher");
  const [supportedChannels, setSupportedChannels] = useState("seo,landing");
  const [configText, setConfigText] = useState(githubPreset);
  const [message, setMessage] = useState("");

  function onKindChange(nextKind: "github_pr" | "webhook_export") {
    setKind(nextKind);
    if (nextKind === "github_pr") {
      setName("Default GitHub publisher");
      setSupportedChannels("seo,landing");
      setConfigText(githubPreset);
    } else {
      setName("Default webhook export");
      setSupportedChannels("social,community,reply,outbound,partnership");
      setConfigText(webhookPreset);
    }
  }

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");
    startTransition(async () => {
      try {
        const config = JSON.parse(configText) as Record<string, unknown>;
        const channels = supportedChannels
          .split(",")
          .map((entry) => entry.trim())
          .filter(Boolean);

        await postJson(`/v2/workspaces/${workspaceId}/publish-destinations`, {
          kind,
          name,
          supportedChannels: channels,
          config,
        });

        setMessage("Destination created.");
        router.refresh();
      } catch (error) {
        if (error instanceof SyntaxError) {
          setMessage("Invalid JSON config.");
        } else {
          setMessage((error as Error).message);
        }
      }
    });
  }

  return (
    <form className="dashboard-form" onSubmit={onSubmit}>
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Destination kind</span>
          <select
            className="dashboard-select"
            value={kind}
            onChange={(event) => onKindChange(event.target.value as "github_pr" | "webhook_export")}
          >
            <option value="github_pr">github_pr</option>
            <option value="webhook_export">webhook_export</option>
          </select>
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Name</span>
          <input className="dashboard-input" value={name} onChange={(event) => setName(event.target.value)} required />
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Supported channels (comma separated)</span>
        <input
          className="dashboard-input"
          value={supportedChannels}
          onChange={(event) => setSupportedChannels(event.target.value)}
        />
      </label>
      <label className="dashboard-field">
        <span className="dashboard-label">Config JSON</span>
        <textarea className="dashboard-textarea" value={configText} onChange={(event) => setConfigText(event.target.value)} />
      </label>
      <div className="dashboard-actions">
        <button className="dashboard-btn dashboard-btn-dark" type="submit" disabled={isPending}>
          {isPending ? "Creating..." : "Create destination"}
        </button>
        {message ? <span className="dashboard-subtle">{message}</span> : null}
      </div>
    </form>
  );
}
