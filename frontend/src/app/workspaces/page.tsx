import Link from "next/link";
import { operatorApi } from "@/lib/api";
import { NewWorkspaceForm } from "@/components/new-workspace-form";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const workspaces = await operatorApi.listWorkspaces();

  return (
    <div
      style={{
        maxWidth: 860,
        margin: "0 auto",
        padding: "46px 20px 64px",
      }}
    >
      <header className="dashboard-page-head">
        <h1 className="dashboard-page-title">Workspaces</h1>
        <p className="dashboard-page-subtitle">
          Each workspace is a separate company with its own prospects, emails, and memory.
        </p>
      </header>

      <section
        className="dashboard-grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {workspaces.map((workspace) => (
          <article key={workspace.id} className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <p className="dashboard-panel-title">{workspace.name}</p>
                <p className="dashboard-panel-subtitle">{workspace.primaryIcp || workspace.description || "No ICP set"}</p>
              </div>
              <span className="dashboard-pill dark">active</span>
            </div>
            <div className="dashboard-panel-body dashboard-stack">
              <p className="dashboard-subtle">
                {workspace.description || "Signals in. Best next action out."}
              </p>
              <div>
                <Link href={`/workspaces/${workspace.id}/chat`} className="dashboard-btn dashboard-btn-dark">
                  Open
                </Link>
              </div>
            </div>
          </article>
        ))}
      </section>

      <NewWorkspaceForm />
    </div>
  );
}
