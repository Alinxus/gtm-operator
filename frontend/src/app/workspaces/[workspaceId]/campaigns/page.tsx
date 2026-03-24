import { operatorApi } from "@/lib/api";
import { CampaignBurstForm } from "@/components/campaign-burst-form";
import { LaneRunForm } from "@/components/lane-run-form";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function CampaignsPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [bursts, laneRuns] = await Promise.all([
    operatorApi.listCampaignBursts(workspaceId),
    operatorApi.listLaneRuns(workspaceId, "campaign"),
  ]);

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">Campaign engine · cross-lane bursts</p>
        <h1 className="dashboard-page-title">Campaigns</h1>
        <p className="dashboard-page-subtitle">
          Launch, benchmark, integration, partnership, and feature bursts that compose outbound, social, and SEO lanes.
        </p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Bursts</p>
          <p className="dashboard-stat-value">{formatNumber(bursts.length)}</p>
          <p className="dashboard-stat-meta">campaign bundles</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Approved bursts</p>
          <p className="dashboard-stat-value">
            {formatNumber(bursts.filter((item) => item.status === "approved").length)}
          </p>
          <p className="dashboard-stat-meta">ready to distribute</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Generated entities</p>
          <p className="dashboard-stat-value">
            {formatNumber(bursts.reduce((total, item) => total + item.generatedEntityIds.length, 0))}
          </p>
          <p className="dashboard-stat-meta">assets and lane outputs</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Lane runs</p>
          <p className="dashboard-stat-value">{formatNumber(laneRuns.length)}</p>
          <p className="dashboard-stat-meta">campaign executions</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Create campaign burst</p>
              <p className="dashboard-panel-subtitle">one signal becomes a multi-lane path</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <CampaignBurstForm workspaceId={workspaceId} />
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Run campaign lane</p>
              <p className="dashboard-panel-subtitle">compose all lanes for burst execution</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <LaneRunForm workspaceId={workspaceId} lane="campaign" defaultPriority="p3_burst" />
          </div>
        </article>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 14 }}>
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Campaign bursts</p>
              <p className="dashboard-panel-subtitle">status, lane scope, and proof bundle footprint</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {bursts.length === 0 ? (
              <p className="dashboard-subtle">No bursts created yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Type</th>
                      <th>Status</th>
                      <th>Lanes</th>
                      <th>Proof claims</th>
                      <th>Generated entities</th>
                    </tr>
                  </thead>
                  <tbody>
                    {bursts.map((burst) => (
                      <tr key={burst.id}>
                        <td>
                          <div className="dashboard-name">{burst.name}</div>
                          <div className="dashboard-subtle">{burst.goal}</div>
                          <div className="dashboard-subtle">{formatDateTime((burst.metadata?.createdAt as string | undefined) ?? null)}</div>
                        </td>
                        <td>{burst.burstType}</td>
                        <td>
                          <span className="dashboard-pill">{burst.status}</span>
                        </td>
                        <td>
                          {burst.lanes.map((lane) => (
                            <span key={lane} className="dashboard-pill">
                              {lane}
                            </span>
                          ))}
                        </td>
                        <td className="dashboard-mono">{burst.proofClaimIds.length}</td>
                        <td className="dashboard-mono">{burst.generatedEntityIds.length}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Recent campaign runs</p>
              <p className="dashboard-panel-subtitle">run state and trigger context</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {laneRuns.length === 0 ? (
              <p className="dashboard-subtle">No campaign runs yet.</p>
            ) : (
              <div className="dashboard-stack">
                {laneRuns.slice(0, 8).map((run) => (
                  <div key={run.id}>
                    <div className="dashboard-inline">
                      <span className="dashboard-pill">{run.status}</span>
                      <span className="dashboard-mono">{run.priority}</span>
                    </div>
                    <p className="dashboard-name" style={{ margin: "6px 0 2px" }}>
                      {run.title}
                    </p>
                    <p className="dashboard-subtle">{run.summary}</p>
                    <p className="dashboard-subtle">Trigger: {run.trigger || "manual"}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
