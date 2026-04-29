import { operatorApi } from "@/lib/api";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function OutcomesPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [dashboard, conversations] = await Promise.all([
    operatorApi.getWorkspaceDashboard(workspaceId),
    operatorApi.listConversations(workspaceId),
  ]);

  const pipelineEntries = Object.entries(dashboard.pipeline);

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <h1 className="dashboard-page-title">Outcomes</h1>
        <p className="dashboard-page-subtitle">
          Track how prospects move from first contact to paying customer.
        </p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Booked</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.outcomes.bookedCount)}</p>
          <p className="dashboard-stat-meta">conversations booked</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Paid</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.outcomes.paidCount)}</p>
          <p className="dashboard-stat-meta">won customers</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Conversations</p>
          <p className="dashboard-stat-value">{formatNumber(conversations.length)}</p>
          <p className="dashboard-stat-meta">tracked conversations</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Attributions</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.outcomes.attributions.length)}</p>
          <p className="dashboard-stat-meta">what moved the needle</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Pipeline</p>
              <p className="dashboard-panel-subtitle">How many prospects are at each stage</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <div className="dashboard-table-wrap">
              <table className="dashboard-table" style={{ minWidth: "100%" }}>
                <thead>
                  <tr>
                    <th>Stage</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {pipelineEntries.map(([stage, value]) => (
                    <tr key={stage}>
                      <td>
                        <span className="dashboard-pill">{stage}</span>
                      </td>
                      <td className="dashboard-mono">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Goals</p>
              <p className="dashboard-panel-subtitle">Your targets for bookings and customers</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {dashboard.goals.length === 0 ? (
              <p className="dashboard-subtle">No goals configured yet.</p>
            ) : (
              <div className="dashboard-stack">
                {dashboard.goals.map((goal) => (
                  <div key={goal.id}>
                    <p className="dashboard-name">{goal.name}</p>
                    <p className="dashboard-subtle">
                      {goal.currentValue} / {goal.targetValue} · {goal.targetMetric}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 14 }}>
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Conversations</p>
              <p className="dashboard-panel-subtitle">Active and past customer conversations</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {conversations.length === 0 ? (
              <p className="dashboard-subtle">No conversations logged yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Summary</th>
                      <th>Last interaction</th>
                    </tr>
                  </thead>
                  <tbody>
                    {conversations.map((conversation) => (
                      <tr key={conversation.id}>
                        <td>
                          <span className="dashboard-pill">{conversation.status}</span>
                        </td>
                        <td>{conversation.summary}</td>
                        <td className="dashboard-mono">{formatDateTime(conversation.lastInteractionAt)}</td>
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
              <p className="dashboard-panel-title">What worked</p>
              <p className="dashboard-panel-subtitle">Which channels and actions moved prospects forward</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {dashboard.outcomes.attributions.length === 0 ? (
              <p className="dashboard-subtle">No attribution records yet.</p>
            ) : (
              <div className="dashboard-stack">
                {dashboard.outcomes.attributions.slice(0, 20).map((attribution) => (
                  <div key={attribution.id}>
                    <div className="dashboard-inline">
                      <span className="dashboard-pill">{attribution.stage}</span>
                      <span className="dashboard-mono">{attribution.channel || "n/a"}</span>
                      <span className="dashboard-mono">{attribution.weight} weight</span>
                    </div>
                    <p className="dashboard-subtle">{attribution.notes}</p>
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
