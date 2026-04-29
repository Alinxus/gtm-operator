"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { postJson } from "@/lib/client-api";

interface ProspectEmailFormProps {
  workspaceId: string;
}

export function ProspectEmailForm({ workspaceId }: ProspectEmailFormProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [role, setRole] = useState("");
  const [note, setNote] = useState("");
  const [status, setStatus] = useState<"idle" | "ok" | "error">("idle");
  const [message, setMessage] = useState("");

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setMessage("");

    // Derive company from email domain if not provided
    const emailDomain = email.includes("@") ? email.split("@")[1] : null;
    const companyName = company.trim() || (emailDomain ? emailDomain.split(".")[0] : "Unknown");

    startTransition(async () => {
      try {
        await postJson(`/v2/workspaces/${workspaceId}/signals`, {
          source: "manual",
          title: `Prospect: ${name}${companyName ? ` at ${companyName}` : ""}`,
          content: note || `${role || "Founder"}${companyName ? ` at ${companyName}` : ""}.`,
          account: {
            name: companyName,
            ...(emailDomain ? { domain: emailDomain } : {}),
          },
          person: {
            name,
            role: role || "Founder",
            email,
          },
          autoGenerateSequence: true,
        });
        setStatus("ok");
        setMessage(`Done — email sequence queued for ${name}. Check Approvals to review and send.`);
        setName("");
        setEmail("");
        setCompany("");
        setRole("");
        setNote("");
        router.refresh();
      } catch (error) {
        setStatus("error");
        setMessage((error as Error).message);
      }
    });
  }

  return (
    <form className="dashboard-form" onSubmit={onSubmit}>
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Full name *</span>
          <input
            className="dashboard-input"
            placeholder="John Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
          />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Email *</span>
          <input
            className="dashboard-input"
            type="email"
            placeholder="john@acme.ai"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
        </label>
      </div>
      <div className="dashboard-form two-col">
        <label className="dashboard-field">
          <span className="dashboard-label">Company</span>
          <input
            className="dashboard-input"
            placeholder="Acme AI  (optional)"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </label>
        <label className="dashboard-field">
          <span className="dashboard-label">Role</span>
          <input
            className="dashboard-input"
            placeholder="Founder / CTO"
            value={role}
            onChange={(e) => setRole(e.target.value)}
          />
        </label>
      </div>
      <label className="dashboard-field">
        <span className="dashboard-label">Context</span>
        <textarea
          className="dashboard-textarea"
          placeholder="e.g. Tweeted about losing LLM context. Building an AI assistant. 3-person team."
          value={note}
          onChange={(e) => setNote(e.target.value)}
          rows={3}
        />
      </label>
      <div className="dashboard-actions">
        <button type="submit" className="dashboard-btn dashboard-btn-dark" disabled={isPending}>
          {isPending ? "Generating sequence…" : "Add prospect & generate emails"}
        </button>
        {message ? (
          <span className={status === "error" ? "dashboard-error" : "dashboard-subtle"}>{message}</span>
        ) : null}
      </div>
    </form>
  );
}
