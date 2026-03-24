import { operatorApi } from "@/lib/api";
import { SocialGenerateForm } from "@/components/social-generate-form";
import { LaneRunForm } from "@/components/lane-run-form";
import { PublishEntityButton } from "@/components/publish-entity-button";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SocialPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [calendar, assets, laneRuns] = await Promise.all([
    operatorApi.listSocialCalendar(workspaceId),
    operatorApi.listSocialAssets(workspaceId),
    operatorApi.listLaneRuns(workspaceId, "social"),
  ]);

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">Lane B · social and brand presence</p>
        <h1 className="dashboard-page-title">Social</h1>
        <p className="dashboard-page-subtitle">
          Daily and weekly presence from the same truth pack: founder posts, threads, reactions, and reply banks.
        </p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Calendar items</p>
          <p className="dashboard-stat-value">{formatNumber(calendar.length)}</p>
          <p className="dashboard-stat-meta">scheduled / queueable</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Social assets</p>
          <p className="dashboard-stat-value">{formatNumber(assets.length)}</p>
          <p className="dashboard-stat-meta">drafted variants</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Reply banks</p>
          <p className="dashboard-stat-value">
            {formatNumber(assets.filter((asset) => asset.variant === "reply_bank").length)}
          </p>
          <p className="dashboard-stat-meta">community support</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Recent runs</p>
          <p className="dashboard-stat-value">{formatNumber(laneRuns.length)}</p>
          <p className="dashboard-stat-meta">social lane executions</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Generate social lane output</p>
              <p className="dashboard-panel-subtitle">calendar + reply bank generation</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <SocialGenerateForm workspaceId={workspaceId} />
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Run social lane</p>
              <p className="dashboard-panel-subtitle">end-to-end social execution pass</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <LaneRunForm workspaceId={workspaceId} lane="social" defaultPriority="p1_brand_presence" />
          </div>
        </article>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 14 }}>
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Content calendar</p>
              <p className="dashboard-panel-subtitle">platform-specific queue</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {calendar.length === 0 ? (
              <p className="dashboard-subtle">No social calendar items yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Title</th>
                      <th>Platform</th>
                      <th>Variant</th>
                      <th>Status</th>
                      <th>Schedule</th>
                    </tr>
                  </thead>
                  <tbody>
                    {calendar.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <div className="dashboard-name">{item.title}</div>
                          <div className="dashboard-subtle">{item.hook}</div>
                        </td>
                        <td>{item.platform}</td>
                        <td>{item.variant}</td>
                        <td>
                          <span className="dashboard-pill">{item.status}</span>
                        </td>
                        <td className="dashboard-mono">{formatDateTime(item.scheduledFor)}</td>
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
              <p className="dashboard-panel-title">Social assets</p>
              <p className="dashboard-panel-subtitle">review and publish queue</p>
            </div>
          </div>
          <div className="dashboard-panel-body dashboard-stack">
            {assets.length === 0 ? (
              <p className="dashboard-subtle">No social assets generated yet.</p>
            ) : (
              assets.slice(0, 25).map((asset) => (
                <div key={asset.id} className="dashboard-panel" style={{ marginBottom: 0 }}>
                  <div className="dashboard-panel-head">
                    <div>
                      <p className="dashboard-panel-title">{asset.title}</p>
                      <p className="dashboard-panel-subtitle">
                        {asset.platform} · {asset.variant} · {asset.status}
                      </p>
                    </div>
                    <span className="dashboard-pill">{asset.status}</span>
                  </div>
                  <div className="dashboard-panel-body dashboard-stack">
                    <p style={{ margin: 0 }}>{asset.body}</p>
                    <div>
                      {asset.claimIds.map((claimId) => (
                        <span key={claimId} className="dashboard-code">
                          {claimId}
                        </span>
                      ))}
                    </div>
                    <PublishEntityButton
                      entityType={asset.touchId ? "touch" : "asset"}
                      entityId={asset.touchId || asset.assetId}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </article>
      </section>
    </div>
  );
}
