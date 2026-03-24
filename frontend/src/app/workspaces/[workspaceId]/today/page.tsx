import { operatorApi } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { LaneRunForm } from "@/components/lane-run-form";
import { SignalIngestForm } from "@/components/signal-ingest-form";

export const dynamic = "force-dynamic";

export default async function TodayPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [dashboard, opportunities, laneRuns] = await Promise.all([
    operatorApi.getWorkspaceDashboard(workspaceId),
    operatorApi.listOpportunities(workspaceId),
    operatorApi.listLaneRuns(workspaceId, "outbound"),
  ]);

  const accountById = new Map(dashboard.accounts.map((account) => [account.id, account]));

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">Lane A · outbound / direct distribution</p>
        <h1 className="dashboard-page-title">Today</h1>
        <p className="dashboard-page-subtitle">Who matters now, why they matter, and what to do next.</p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Queue</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.today.length)}</p>
          <p className="dashboard-stat-meta">ranked opportunities</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Approvals</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.approvals.length)}</p>
          <p className="dashboard-stat-meta">awaiting review</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Booked</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.outcomes.bookedCount)}</p>
          <p className="dashboard-stat-meta">conversation target</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Paid</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.outcomes.paidCount)}</p>
          <p className="dashboard-stat-meta">downstream conversion</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Priority queue</p>
              <p className="dashboard-panel-subtitle">score-ranked by pain fit, signal strength, and reachability</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {dashboard.today.length === 0 ? (
              <div className="dashboard-empty">
                <p className="dashboard-empty-title">No opportunities yet</p>
                <p className="dashboard-empty-text">Ingest one signal and the operator will rank who to talk to next.</p>
              </div>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Pain</th>
                      <th>Score</th>
                      <th>Why now</th>
                      <th>Next action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dashboard.today.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="dashboard-name">{accountById.get(item.accountId ?? "")?.name ?? "Unknown"}</div>
                          <div className="dashboard-subtle">{item.recommendedPlaybook.replaceAll("_", " ")}</div>
                        </td>
                        <td>
                          {(item.metadata?.fitAnalysis as { primaryPainLabel?: string | null } | undefined)?.primaryPainLabel ??
                            "unclassified"}
                        </td>
                        <td className="dashboard-mono">{item.score}</td>
                        <td>{item.reason}</td>
                        <td>{item.nextAction}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </article>

        <div className="dashboard-stack">
          <article className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <p className="dashboard-panel-title">Run outbound lane</p>
                <p className="dashboard-panel-subtitle">p0 always-on pipeline execution</p>
              </div>
            </div>
            <div className="dashboard-panel-body">
              <LaneRunForm workspaceId={workspaceId} lane="outbound" defaultPriority="p0_always_on" />
            </div>
          </article>

          <article className="dashboard-panel">
            <div className="dashboard-panel-head">
              <div>
                <p className="dashboard-panel-title">Latest outbound runs</p>
                <p className="dashboard-panel-subtitle">execution history</p>
              </div>
            </div>
            <div className="dashboard-panel-body">
              {laneRuns.length === 0 ? (
                <p className="dashboard-subtle">No outbound runs yet.</p>
              ) : (
                <div className="dashboard-stack">
                  {laneRuns.slice(0, 5).map((run) => (
                    <div key={run.id}>
                      <span className="dashboard-pill">{run.status}</span>
                      <span className="dashboard-mono">{run.priority}</span>
                      <p className="dashboard-subtle">{run.summary}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </article>
        </div>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 14 }}>
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Signal in</p>
              <p className="dashboard-panel-subtitle">capture a real pain moment and auto-generate outreach path</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <SignalIngestForm workspaceId={workspaceId} />
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">All opportunities</p>
              <p className="dashboard-panel-subtitle">full workspace backlog</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {opportunities.length === 0 ? (
              <p className="dashboard-subtle">No opportunities yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Stage</th>
                      <th>Score</th>
                      <th>Reason</th>
                      <th>Playbook</th>
                    </tr>
                  </thead>
                  <tbody>
                    {opportunities.slice(0, 20).map((item) => (
                      <tr key={item.id}>
                        <td>
                          <span className="dashboard-pill">{item.stage}</span>
                        </td>
                        <td className="dashboard-mono">{item.score}</td>
                        <td>{item.reason}</td>
                        <td>{item.recommendedPlaybook.replaceAll("_", " ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
