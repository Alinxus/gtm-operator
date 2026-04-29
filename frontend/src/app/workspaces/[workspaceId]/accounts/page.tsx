import { operatorApi } from "@/lib/api";
import { formatNumber } from "@/lib/utils";
import { LaneRunForm } from "@/components/lane-run-form";

export const dynamic = "force-dynamic";

export default async function AccountsPage({
  params,
}: Readonly<{
  params: Promise<{ workspaceId: string }>;
}>) {
  const { workspaceId } = await params;
  const [accounts, people, dashboard] = await Promise.all([
    operatorApi.listAccounts(workspaceId),
    operatorApi.listPeople(workspaceId),
    operatorApi.getWorkspaceDashboard(workspaceId),
  ]);

  const peopleByAccount = new Map<string, number>();
  for (const person of people) {
    peopleByAccount.set(person.accountId, (peopleByAccount.get(person.accountId) ?? 0) + 1);
  }

  return (
    <div className="dashboard-page">
      <header className="dashboard-page-head">
        <h1 className="dashboard-page-title">Accounts</h1>
        <p className="dashboard-page-subtitle">Every company and contact you've tracked, with their stage and best pain signal.</p>
      </header>

      <section className="dashboard-stats">
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Accounts</p>
          <p className="dashboard-stat-value">{formatNumber(accounts.length)}</p>
          <p className="dashboard-stat-meta">active prospect accounts</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">People</p>
          <p className="dashboard-stat-value">{formatNumber(people.length)}</p>
          <p className="dashboard-stat-meta">known contacts</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">In queue</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.today.length)}</p>
          <p className="dashboard-stat-meta">ready opportunities</p>
        </article>
        <article className="dashboard-stat">
          <p className="dashboard-stat-label">Paid</p>
          <p className="dashboard-stat-value">{formatNumber(dashboard.outcomes.paidCount)}</p>
          <p className="dashboard-stat-meta">won accounts</p>
        </article>
      </section>

      <section className="dashboard-grid two">
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Companies</p>
              <p className="dashboard-panel-subtitle">Stage, fit score, and top pain signal for each account</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {accounts.length === 0 ? (
              <div className="dashboard-empty">
                <p className="dashboard-empty-title">No accounts yet</p>
                <p className="dashboard-empty-text">Signals and forms automatically create accounts with workspace memory.</p>
              </div>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Account</th>
                      <th>Stage</th>
                      <th>Fit</th>
                      <th>Contacts</th>
                      <th>Channels</th>
                      <th>Top pain</th>
                    </tr>
                  </thead>
                  <tbody>
                    {accounts.map((account) => (
                      <tr key={account.id}>
                        <td>
                          <div className="dashboard-name">{account.name}</div>
                          <div className="dashboard-subtle">{account.domain || account.summary}</div>
                        </td>
                        <td>
                          <span className="dashboard-pill">{account.stage}</span>
                        </td>
                        <td className="dashboard-mono">{account.fitScore}</td>
                        <td className="dashboard-mono">{peopleByAccount.get(account.id) ?? 0}</td>
                        <td>
                          {account.channels.map((channel) => (
                            <span key={channel} className="dashboard-pill">
                              {channel}
                            </span>
                          ))}
                        </td>
                        <td>
                          {(account.metadata?.strongestPain as string | undefined) || "not classified yet"}
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
              <p className="dashboard-panel-title">Refresh accounts</p>
              <p className="dashboard-panel-subtitle">Re-score and update all accounts</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            <LaneRunForm workspaceId={workspaceId} lane="outbound" defaultPriority="p0_always_on" />
          </div>
        </article>
      </section>

      <section className="dashboard-grid" style={{ marginTop: 14 }}>
        <article className="dashboard-panel">
          <div className="dashboard-panel-head">
            <div>
              <p className="dashboard-panel-title">Contacts</p>
              <p className="dashboard-panel-subtitle">Everyone you've met at these companies</p>
            </div>
          </div>
          <div className="dashboard-panel-body">
            {people.length === 0 ? (
              <p className="dashboard-subtle">No contacts captured yet.</p>
            ) : (
              <div className="dashboard-table-wrap">
                <table className="dashboard-table">
                  <thead>
                    <tr>
                      <th>Name</th>
                      <th>Role</th>
                      <th>Account</th>
                      <th>Fit</th>
                      <th>Email</th>
                      <th>Handle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((person) => {
                      const account = accounts.find((entry) => entry.id === person.accountId);
                      return (
                        <tr key={person.id}>
                          <td className="dashboard-name">{person.name}</td>
                          <td>{person.role}</td>
                          <td>{account?.name ?? "Unknown"}</td>
                          <td className="dashboard-mono">{person.personaFit}</td>
                          <td>{person.email || "n/a"}</td>
                          <td>{person.socialHandle || "n/a"}</td>
                        </tr>
                      );
                    })}
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
