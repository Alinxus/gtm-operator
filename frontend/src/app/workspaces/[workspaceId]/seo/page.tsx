import { operatorApi } from "@/lib/api";
import { LaneRunForm } from "@/components/lane-run-form";
import { SeoGenerateForm } from "@/components/seo-generate-form";
import { PublishEntityButton } from "@/components/publish-entity-button";
import { formatNumber } from "@/lib/utils";

export const dynamic = "force-dynamic";

export default async function SeoPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [clusters, pages, laneRuns] = await Promise.all([
    operatorApi.listTopicClusters(workspaceId),
    operatorApi.listSeoPages(workspaceId),
    operatorApi.listLaneRuns(workspaceId, "seo"),
  ]);

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <p className="dashboard-page-eyebrow">Lane C · SEO / GEO compounding</p>
        <h1 className="dashboard-page-title">SEO / GEO</h1>
        <p className="dashboard-page-subtitle">
          Problem-first evergreen planning for compare, use-case, integration, benchmark, and docs-adjacent pages.
        </p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Topic clusters</p>
          <p className="dashboard-stat-value">{formatNumber(clusters.length)}</p>
          <p className="dashboard-stat-meta">coverage plans</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Evergreen pages</p>
          <p className="dashboard-stat-value">{formatNumber(pages.length)}</p>
          <p className="dashboard-stat-meta">draft + published inventory</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Missing pages</p>
          <p className="dashboard-stat-value">
            {formatNumber(pages.filter((page) => page.state === "missing").length)}
          </p>
          <p className="dashboard-stat-meta">high-value content gaps</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Runs</p>
          <p className="dashboard-stat-value">{formatNumber(laneRuns.length)}</p>
          <p className="dashboard-stat-meta">compounding passes</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Generate SEO assets</p>
              <p className="dashboard-panel-subtitle">topic clusters + evergreen drafts</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <SeoGenerateForm workspaceId={workspaceId} />
          </div>
        </article>

        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Run SEO lane</p>
              <p className="dashboard-panel-subtitle">auto planning + generation pass</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <LaneRunForm workspaceId={workspaceId} lane="seo" defaultPriority="p2_compounding" />
          </div>
        </article>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 14 }}>
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Topic clusters</p>
              <p className="dashboard-panel-subtitle">pain-first content clusters with proof anchors</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {clusters.length === 0 ? (
              <p className="dashboard-subtle">No clusters yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Cluster</th>
                      <th>Primary pain</th>
                      <th>Keywords</th>
                      <th>Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {clusters.map((cluster) => (
                      <tr key={cluster.id}>
                        <td>
                          <div className="dashboard-name">{cluster.title}</div>
                          <div className="dashboard-subtle">{cluster.summary}</div>
                        </td>
                        <td>{cluster.primaryPain}</td>
                        <td>
                          {cluster.targetKeywords.map((keyword) => (
                            <span key={keyword} className="dashboard-pill">
                              {keyword}
                            </span>
                          ))}
                        </td>
                        <td>
                          <span className="dashboard-pill">{cluster.status}</span>
                        </td>
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
              <p className="dashboard-panel-title">Evergreen pages</p>
              <p className="dashboard-panel-subtitle">drafts and publication state</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {pages.length === 0 ? (
              <p className="dashboard-subtle">No pages yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Page</th>
                      <th>Type</th>
                      <th>State</th>
                      <th>Claims</th>
                      <th>Publish</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((page) => (
                      <tr key={page.id}>
                        <td>
                          <div className="dashboard-name">{page.title}</div>
                          <div className="dashboard-subtle">{page.slug}</div>
                        </td>
                        <td>{page.pageType}</td>
                        <td>
                          <span className="dashboard-pill">{page.state}</span>
                        </td>
                        <td>
                          {page.claimIds.slice(0, 3).map((claimId) => (
                            <span key={claimId} className="dashboard-code">
                              {claimId}
                            </span>
                          ))}
                        </td>
                        <td>
                          {page.touchId || page.assetId ? (
                            <PublishEntityButton
                              entityType={page.touchId ? "touch" : "asset"}
                              entityId={page.touchId || page.assetId || ""}
                            />
                          ) : (
                            <span className="dashboard-subtle">No entity linked</span>
                          )}
                        </td>
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
