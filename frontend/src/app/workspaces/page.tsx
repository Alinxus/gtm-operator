import Link from "next/link";
import { operatorApi } from "@/lib/api";

export const dynamic = "force-dynamic";

export default async function WorkspacesPage() {
  const workspaces = await operatorApi.listWorkspaces();

  return (
    <div
      style={{
        maxWidth: 1120,
        margin: "0 auto",
        padding: "46px 20px 64px",
      }}
    >
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">RetainDB Growth Operator</p>
        <h1 className="dashboard-page-title">Choose a workspace</h1>
        <p className="dashboard-page-subtitle">
          One place to run outbound, social, SEO/GEO, and campaign bursts from the same truth and memory layer.
        </p>
      </header>

      <section
        className="dashboard-grid"
        style={{
          gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
          gap: 14,
        }}
      >
        {workspaces.length === 0 ? (
          <article className="dashboard-panel">
            <div className="dashboard-panel-body">
              <div className="dashboard-empty">
                <p className="dashboard-empty-title">No workspace yet</p>
                <p className="dashboard-empty-text">
                  Seed a workspace from the backend, then this frontend will auto-discover it.
                </p>
              </div>
            </div>
          </article>
        ) : (
          workspaces.map((workspace) => (
            <article key={workspace.id} className="dashboard-panel">
              <div className="dashboard-panel-head">
                <div>
                  <p className="dashboard-panel-title">{workspace.name}</p>
                  <p className="dashboard-panel-subtitle">{workspace.primaryIcp}</p>
                </div>
                <span className="dashboard-pill dark">active</span>
              </div>
              <div className="dashboard-panel-body dashboard-stack">
                <p className="dashboard-subtle">
                  {workspace.description || "Signals in. Best next action out."}
                </p>
                <div>
                  <Link href={`/workspaces/${workspace.id}/today`} className="dashboard-btn dashboard-btn-dark">
                    Open operator
                  </Link>
                </div>
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
