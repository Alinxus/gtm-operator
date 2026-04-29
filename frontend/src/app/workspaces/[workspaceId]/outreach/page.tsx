import { operatorApi } from "@/lib/api";
import { ProspectEmailForm } from "@/components/prospect-email-form";
import { SendEmailButton } from "@/components/send-email-button";

export const dynamic = "force-dynamic";

export default async function OutreachPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const approvals = await operatorApi.listApprovals(workspaceId);

  // Email touches only — pending review or already approved
  const emailQueue = approvals.filter(
    ({ touch }) =>
      touch.channel === "outbound" &&
      (touch.touchType === "email" || touch.touchType === "follow_up") &&
      (touch.status === "review_required" || touch.status === "needs_revision" || touch.status === "approved"),
  );

  const pendingCount = emailQueue.filter(({ touch }) => touch.status === "review_required" || touch.status === "needs_revision").length;
  const approvedCount = emailQueue.filter(({ touch }) => touch.status === "approved").length;

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">Lane A · cold outreach</p>
        <h1 className="dashboard-page-title">Outreach</h1>
        <p className="dashboard-page-subtitle">
          Add a prospect. The AI writes a personalised sequence. You approve and send.
        </p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">In queue</p>
          <p className="dashboard-stat-value">{emailQueue.length}</p>
          <p className="dashboard-stat-meta">email touches</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Pending review</p>
          <p className="dashboard-stat-value">{pendingCount}</p>
          <p className="dashboard-stat-meta">need approval</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Ready to send</p>
          <p className="dashboard-stat-value">{approvedCount}</p>
          <p className="dashboard-stat-meta">approved touches</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        {/* Add prospect form */}
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Add a prospect</p>
              <p className="dashboard-panel-subtitle">
                Name + email is enough. The AI writes a sequence matched to their pain.
              </p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <ProspectEmailForm workspaceId={workspaceId} />
          </div>
        </article>

        {/* Email queue */}
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Email queue</p>
              <p className="dashboard-panel-subtitle">Review, approve, and send from here</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {emailQueue.length === 0 ? (
              <div className="dashboard-empty">
                <p className="dashboard-empty-title">No emails queued yet</p>
                <p className="dashboard-empty-text">
                  Add a prospect on the left and the sequence will appear here within seconds.
                </p>
              </div>
            ) : (
              <div className="dashboard-stack">
                {emailQueue.map(({ touch, asset, account, person, critique }) => (
                  <div key={touch.id} className="dashboard-panel" style={{ margin: 0 }}>
                    <div className="dashboard-panel-head" style={{ paddingBottom: 8 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p className="dashboard-panel-title" style={{ fontSize: 13 }}>
                          {asset.title || touch.title}
                        </p>
                        <p className="dashboard-panel-subtitle" style={{ fontSize: 12 }}>
                          {person?.name ?? "Unknown"}
                          {account ? ` · ${account.name}` : ""}
                          {person?.email ? ` · ${person.email}` : ""}
                        </p>
                      </div>
                      <span className="dashboard-pill">{touch.status === "review_required" ? "pending review" : touch.status.replace(/_/g, " ")}</span>
                    </div>

                    <div className="dashboard-panel-body dashboard-stack" style={{ gap: 8 }}>
                      <p style={{ margin: 0, fontSize: 13, lineHeight: 1.5, whiteSpace: "pre-wrap" }}>
                        {asset.body}
                      </p>

                      {critique?.blockingIssues?.length ? (
                        <p className="dashboard-subtle" style={{ fontSize: 12 }}>
                          ⚠ {critique.blockingIssues.join(" · ")}
                        </p>
                      ) : null}

                      <div className="dashboard-actions">
                        <SendEmailButton
                          touchId={touch.id}
                          alreadyApproved={touch.status === "approved"}
                        />
                      </div>
                    </div>
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
