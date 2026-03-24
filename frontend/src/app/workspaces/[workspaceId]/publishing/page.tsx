import { operatorApi } from "@/lib/api";
import { PublishDestinationForm } from "@/components/publish-destination-form";
import { formatDateTime, formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function PublishingPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [destinations, jobs] = await Promise.all([
    operatorApi.listPublishDestinations(workspaceId),
    operatorApi.listPublishJobs(workspaceId),
  ]);

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">Publishing layer · post-approval delivery</p>
        <h1 className="dashboard-page-title">Publishing</h1>
        <p className="dashboard-page-subtitle">
          First practical sinks only: GitHub PR publishing for content and webhook export for social/outbound/community.
        </p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Destinations</p>
          <p className="dashboard-stat-value">{formatNumber(destinations.length)}</p>
          <p className="dashboard-stat-meta">publish targets</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Jobs</p>
          <p className="dashboard-stat-value">{formatNumber(jobs.length)}</p>
          <p className="dashboard-stat-meta">all publish jobs</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Failed</p>
          <p className="dashboard-stat-value">{formatNumber(jobs.filter((job) => job.status === "failed").length)}</p>
          <p className="dashboard-stat-meta">retry candidates</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Published</p>
          <p className="dashboard-stat-value">{formatNumber(jobs.filter((job) => job.status === "published").length)}</p>
          <p className="dashboard-stat-meta">completed jobs</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Add publish destination</p>
              <p className="dashboard-panel-subtitle">workspace-scoped publishing configuration</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <PublishDestinationForm workspaceId={workspaceId} />
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Configured destinations</p>
              <p className="dashboard-panel-subtitle">destination kind, channel scope, and config snapshot</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {destinations.length === 0 ? (
              <p className="dashboard-subtle">No destinations configured yet.</p>
            ) : (
              <div className="dashboard-stack">
                {destinations.map((destination) => (
                  <div key={destination.id}>
                    <div className="dashboard-inline">
                      <span className="dashboard-pill dark">{destination.kind}</span>
                      <span className="dashboard-name">{destination.name}</span>
                    </div>
                    <div style={{ marginTop: 6 }}>
                      {destination.supportedChannels.map((channel) => (
                        <span key={channel} className="dashboard-pill">
                          {channel}
                        </span>
                      ))}
                    </div>
                    <p className="dashboard-subtle" style={{ marginTop: 6 }}>
                      created {formatDateTime(destination.createdAt)}
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
              <p className="dashboard-panel-title">Publish jobs</p>
              <p className="dashboard-panel-subtitle">queue status, attempts, and errors</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {jobs.length === 0 ? (
              <p className="dashboard-subtle">No publish jobs yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Status</th>
                      <th>Kind</th>
                      <th>Entity</th>
                      <th>Lane</th>
                      <th>Attempts</th>
                      <th>Updated</th>
                      <th>Error</th>
                    </tr>
                  </thead>
                  <tbody>
                    {jobs.map((job) => (
                      <tr key={job.id}>
                        <td>
                          <span className="dashboard-pill">{job.status}</span>
                        </td>
                        <td>{job.kind}</td>
                        <td className="dashboard-mono">
                          {job.entityType}:{job.entityId}
                        </td>
                        <td>{job.lane}</td>
                        <td className="dashboard-mono">{job.attemptCount}</td>
                        <td className="dashboard-mono">{formatDateTime(job.updatedAt)}</td>
                        <td>{job.lastError || "none"}</td>
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
