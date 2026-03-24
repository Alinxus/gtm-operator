import { operatorApi } from "@/lib/api";
import { ApprovalDecisionForm } from "@/components/approval-decision-form";
import { PublishEntityButton } from "@/components/publish-entity-button";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [approvals, dashboard] = await Promise.all([
    operatorApi.listApprovals(workspaceId),
    operatorApi.getWorkspaceDashboard(workspaceId),
  ]);

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">Control layer · approval queue</p>
        <h1 className="dashboard-page-title">Approvals</h1>
        <p className="dashboard-page-subtitle">
          Critic rejection blocks by default. Human override is allowed with explicit reason and audit trail.
        </p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Pending</p>
          <p className="dashboard-stat-value">{formatNumber(approvals.length)}</p>
          <p className="dashboard-stat-meta">touches waiting for decision</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Revision needed</p>
          <p className="dashboard-stat-value">
            {formatNumber(approvals.filter((entry) => (entry.critique?.blockingIssues?.length ?? 0) > 0).length)}
          </p>
          <p className="dashboard-stat-meta">critic-blocked items</p>
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

      <section className="dashboard-grid">
        {approvals.length === 0 ? (
          <article className="dashboard-panel">
            <div className="dashboard-panel-body">
              <div className="dashboard-empty">
                <p className="dashboard-empty-title">Nothing waiting for approval</p>
                <p className="dashboard-empty-text">Run any lane and this queue auto-fills with review-ready assets.</p>
              </div>
            </div>
          </article>
        ) : (
          approvals.map(({ touch, asset, critique, account, person, sequence }) => (
            <article key={touch.id} className="dashboard-panel">
              <div className="dashboard-panel-head">
                <div>
                  <p className="dashboard-panel-title">{asset.title}</p>
                  <p className="dashboard-panel-subtitle">
                    {account?.name ?? "Unknown account"}
                    {person ? ` · ${person.name} (${person.role})` : ""}
                    {sequence ? ` · ${sequence.playbookType.replaceAll("_", " ")}` : ""}
                  </p>
                </div>
                <span className="dashboard-pill dark">{touch.channel}</span>
              </div>
              <div className="dashboard-panel-body dashboard-stack">
                <p style={{ margin: 0 }}>{asset.body}</p>

                <div>
                  <p className="dashboard-label">Claims</p>
                  <div>
                    {asset.claimIds.length === 0 ? (
                      <span className="dashboard-subtle">No claims attached.</span>
                    ) : (
                      asset.claimIds.map((claimId) => (
                        <span key={claimId} className="dashboard-code">
                          {claimId}
                        </span>
                      ))
                    )}
                  </div>
                </div>

                <div className="dashboard-form two-col">
                  <div className="dashboard-field">
                    <span className="dashboard-label">Critic score</span>
                    <span className="dashboard-mono">{critique?.score ?? "n/a"}</span>
                  </div>
                  <div className="dashboard-field">
                    <span className="dashboard-label">Blocking issues</span>
                    <span className="dashboard-subtle">
                      {critique?.blockingIssues?.length ? critique.blockingIssues.join(" | ") : "None"}
                    </span>
                  </div>
                </div>

                <div className="dashboard-form two-col">
                  <div className="dashboard-field">
                    <span className="dashboard-label">Warnings</span>
                    <span className="dashboard-subtle">{critique?.warnings?.length ? critique.warnings.join(" | ") : "None"}</span>
                  </div>
                  <div className="dashboard-field">
                    <span className="dashboard-label">Publish (post-approval)</span>
                    <PublishEntityButton entityType="touch" entityId={touch.id} />
                  </div>
                </div>

                <ApprovalDecisionForm touchId={touch.id} />
              </div>
            </article>
          ))
        )}
      </section>
    </div>
  );
}
