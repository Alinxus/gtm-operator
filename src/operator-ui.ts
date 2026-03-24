import type { Workspace, WorkspaceDashboard } from "./domain.js";

function escapeHtml(value: string | number | null | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function renderList(items: string[], empty = "None yet.") {
  if (items.length === 0) return `<p class="muted">${escapeHtml(empty)}</p>`;
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderWorkspaceCard(workspace: Workspace) {
  return `
    <article class="card">
      <h2>${escapeHtml(workspace.name)}</h2>
      <p>${escapeHtml(workspace.description ?? "Signals in. Best next action out.")}</p>
      <p class="muted">${escapeHtml(workspace.primaryIcp)}</p>
      <a class="button" href="/app/${encodeURIComponent(workspace.id)}">Open operator</a>
    </article>
  `;
}

function layout(title: string, body: string, script = "") {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root {
        --bg: #f4efe6;
        --panel: #fffaf1;
        --panel-strong: #fff4e2;
        --ink: #171513;
        --muted: #6b6258;
        --line: #d7c7af;
        --accent: #c14d1a;
        --accent-dark: #8f2f0d;
        --success: #175c33;
        --warning: #8a5a00;
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Iowan Old Style", "Palatino Linotype", serif;
        background:
          radial-gradient(circle at top left, rgba(255, 204, 153, 0.35), transparent 30%),
          linear-gradient(180deg, #f8f2ea 0%, var(--bg) 100%);
        color: var(--ink);
      }
      a { color: var(--accent-dark); text-decoration: none; }
      a:hover { text-decoration: underline; }
      .shell {
        width: min(1220px, calc(100vw - 32px));
        margin: 0 auto;
        padding: 32px 0 48px;
      }
      .hero {
        display: grid;
        gap: 12px;
        margin-bottom: 28px;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font-size: 12px;
        color: var(--muted);
      }
      h1, h2, h3 {
        margin: 0;
        line-height: 1.05;
      }
      h1 {
        font-size: clamp(34px, 4vw, 58px);
        max-width: 12ch;
      }
      h2 {
        font-size: 24px;
        margin-bottom: 12px;
      }
      h3 {
        font-size: 18px;
        margin-bottom: 8px;
      }
      p {
        margin: 0;
        line-height: 1.5;
      }
      .lead {
        max-width: 70ch;
        font-size: 18px;
        color: var(--muted);
      }
      .grid {
        display: grid;
        gap: 16px;
      }
      .grid.cards {
        grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      }
      .grid.two {
        grid-template-columns: minmax(0, 1.15fr) minmax(320px, 0.85fr);
        align-items: start;
      }
      .card,
      .panel {
        border: 1px solid var(--line);
        background: var(--panel);
        border-radius: 22px;
        padding: 18px;
        box-shadow: 0 12px 32px rgba(64, 41, 14, 0.08);
      }
      .panel.strong { background: var(--panel-strong); }
      .metric {
        display: grid;
        gap: 8px;
      }
      .metric strong {
        font-size: 34px;
        line-height: 1;
      }
      .muted { color: var(--muted); }
      .section {
        margin-top: 20px;
      }
      .row {
        display: flex;
        justify-content: space-between;
        gap: 12px;
        align-items: flex-start;
      }
      .stack {
        display: grid;
        gap: 10px;
      }
      .table {
        width: 100%;
        border-collapse: collapse;
      }
      .table th,
      .table td {
        text-align: left;
        padding: 10px 0;
        border-bottom: 1px solid rgba(215, 199, 175, 0.8);
        vertical-align: top;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        padding: 5px 10px;
        border-radius: 999px;
        background: rgba(193, 77, 26, 0.1);
        color: var(--accent-dark);
        border: 1px solid rgba(193, 77, 26, 0.22);
        font-size: 12px;
        margin-right: 6px;
        margin-bottom: 6px;
      }
      .status-good { color: var(--success); }
      .status-warning { color: var(--warning); }
      .button,
      button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        border-radius: 999px;
        border: 1px solid var(--accent-dark);
        background: var(--accent);
        color: white;
        padding: 10px 14px;
        font: inherit;
        cursor: pointer;
      }
      button.secondary,
      .button.secondary {
        background: transparent;
        color: var(--accent-dark);
      }
      input, textarea, select {
        width: 100%;
        border-radius: 14px;
        border: 1px solid var(--line);
        background: rgba(255, 255, 255, 0.72);
        padding: 10px 12px;
        font: inherit;
      }
      textarea { min-height: 108px; resize: vertical; }
      label {
        display: grid;
        gap: 6px;
        font-size: 14px;
      }
      .form-grid {
        display: grid;
        gap: 12px;
        grid-template-columns: repeat(2, minmax(0, 1fr));
      }
      .form-grid .full { grid-column: 1 / -1; }
      .approval-card {
        border-top: 1px solid var(--line);
        padding-top: 14px;
        margin-top: 14px;
      }
      .approval-card:first-child {
        border-top: none;
        padding-top: 0;
        margin-top: 0;
      }
      .actions {
        display: flex;
        flex-wrap: wrap;
        gap: 8px;
      }
      code {
        font-family: "Cascadia Code", "SFMono-Regular", Consolas, monospace;
        font-size: 12px;
        background: rgba(23, 21, 19, 0.06);
        padding: 2px 6px;
        border-radius: 999px;
      }
      @media (max-width: 900px) {
        .grid.two,
        .form-grid {
          grid-template-columns: 1fr;
        }
      }
    </style>
  </head>
  <body>
    <main class="shell">
      ${body}
    </main>
    ${script}
  </body>
</html>`;
}

export function renderWorkspaceDirectory(workspaces: Workspace[]) {
  return layout(
    "RetainDB GTM Operator",
    `
      <section class="hero">
        <span class="eyebrow">RetainDB GTM Operator</span>
        <h1>Who matters now. What to do next.</h1>
        <p class="lead">Signals in. Best next action out. Pick a workspace and move from proof to pipeline.</p>
      </section>
      <section class="grid cards">
        ${workspaces.length > 0 ? workspaces.map(renderWorkspaceCard).join("") : `<div class="card"><p>No workspaces yet.</p></div>`}
      </section>
    `,
  );
}

export function renderWorkspaceApp(dashboard: WorkspaceDashboard) {
  const { workspace } = dashboard;
  const readyCount = dashboard.approvals.length;
  const bookedCount = dashboard.outcomes.bookedCount;
  const paidCount = dashboard.outcomes.paidCount;

  const body = `
    <section class="hero">
      <span class="eyebrow">${escapeHtml(workspace.name)}</span>
      <h1>Signals in. Best next action out.</h1>
      <p class="lead">${escapeHtml(workspace.description ?? "One place to see who matters, why they matter, and what to do next.")}</p>
    </section>

    <section class="grid cards">
      <article class="panel strong metric">
        <span class="eyebrow">Today</span>
        <strong>${dashboard.today.length}</strong>
        <p>High-signal opportunities ranked for founder-led GTM.</p>
      </article>
      <article class="panel metric">
        <span class="eyebrow">Approvals</span>
        <strong>${readyCount}</strong>
        <p>Touches waiting for a human decision before anything goes out.</p>
      </article>
      <article class="panel metric">
        <span class="eyebrow">Booked</span>
        <strong>${bookedCount}</strong>
        <p>Conversations moving from signal to real pipeline.</p>
      </article>
      <article class="panel metric">
        <span class="eyebrow">Paid</span>
        <strong>${paidCount}</strong>
        <p>Proof that the loop is closing, not just publishing.</p>
      </article>
    </section>

    <section class="section grid two">
      <article class="panel">
        <div class="row">
          <div>
            <span class="eyebrow">Today</span>
            <h2>Who to talk to next</h2>
          </div>
          <a class="button secondary" href="/v2/workspaces/${encodeURIComponent(workspace.id)}/dashboard">View JSON</a>
        </div>
        ${
          dashboard.today.length > 0
            ? `
              <table class="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Pain</th>
                    <th>Score</th>
                    <th>Why now</th>
                    <th>Next step</th>
                  </tr>
                </thead>
                <tbody>
                  ${dashboard.today
                    .map(
                      (item) => `
                        <tr>
                          <td><strong>${escapeHtml(
                            dashboard.accounts.find((account) => account.id === item.accountId)?.name ?? item.accountId,
                          )}</strong></td>
                          <td>${escapeHtml(
                            String(
                              (item.metadata as { fitAnalysis?: { primaryPainLabel?: string | null } } | undefined)?.fitAnalysis?.primaryPainLabel ??
                                "Unknown",
                            ),
                          )}</td>
                          <td>${escapeHtml(item.score)}</td>
                          <td>${escapeHtml(item.reason)}</td>
                          <td>${escapeHtml(item.nextAction)}</td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            `
            : `<p class="muted">No opportunities yet. Ingest a signal and the operator will rank it here.</p>`
        }
      </article>

      <article class="panel">
        <span class="eyebrow">Signal In</span>
        <h2>Add a new signal</h2>
        <p class="muted">Public post, docs visit, inbound form, GitHub activity, manual lead. Give the operator a real moment to work from.</p>
        <form id="signal-form" class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/signals">
          <div class="form-grid">
            <label>
              Signal source
              <select name="source">
                <option value="x">X</option>
                <option value="linkedin">LinkedIn</option>
                <option value="reddit">Reddit</option>
                <option value="hacker_news">Hacker News</option>
                <option value="github">GitHub</option>
                <option value="y_combinator">Y Combinator</option>
                <option value="docs">Docs</option>
                <option value="product">Product</option>
                <option value="form">Form</option>
                <option value="manual" selected>Manual</option>
                <option value="crm">CRM</option>
              </select>
            </label>
            <label>
              Signal title
              <input name="title" placeholder="Founder asked how to stop agent context loss" required />
            </label>
            <label class="full">
              Signal content
              <textarea name="content" placeholder="Capture the pain, proof request, or trigger in plain language." required></textarea>
            </label>
            <label>
              Account name
              <input name="account.name" placeholder="Acme AI" required />
            </label>
            <label>
              Account domain
              <input name="account.domain" placeholder="acme.ai" />
            </label>
            <label>
              Person name
              <input name="person.name" placeholder="Jane Founder" />
            </label>
            <label>
              Person role
              <input name="person.role" placeholder="Founder" />
            </label>
            <label>
              Person email
              <input name="person.email" placeholder="jane@acme.ai" />
            </label>
            <label>
              Social handle
              <input name="person.socialHandle" placeholder="@janefounder" />
            </label>
          </div>
          <button type="submit">Ingest signal</button>
        </form>
        <div class="section stack">
          <span class="eyebrow">Research Sync</span>
          <h3>Go find real signal</h3>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/website" data-csv-fields="urls">
            <label>
              Website or docs URLs
              <input name="urls" placeholder="https://docs.example.com, https://example.com/pricing" />
            </label>
            <button type="submit" class="secondary">Sync website/docs</button>
          </form>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/web-search">
            <label>
              Web search query
              <input name="query" placeholder="AI startup founders complaining about memory or context loss" />
            </label>
            <button type="submit" class="secondary">Sync web search</button>
          </form>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/github">
            <div class="form-grid">
              <label>
                GitHub query
                <input name="query" placeholder="memory context agent infra" />
              </label>
              <label>
                Repo
                <input name="repo" placeholder="owner/repo" />
              </label>
            </div>
            <button type="submit" class="secondary">Sync GitHub</button>
          </form>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/x">
            <label>
              X query
              <input name="query" placeholder="agent memory OR context loss" />
            </label>
            <button type="submit" class="secondary">Sync X</button>
          </form>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/reddit">
            <div class="form-grid">
              <label>
                Reddit query
                <input name="query" placeholder="agent memory OR grounded docs" />
              </label>
              <label>
                Subreddit
                <input name="subreddit" placeholder="LocalLLaMA" />
              </label>
            </div>
            <button type="submit" class="secondary">Sync Reddit</button>
          </form>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/hacker-news">
            <div class="form-grid">
              <label>
                Hacker News query
                <input name="query" placeholder="agent memory context docs" />
              </label>
              <label>
                Story type
                <select name="storyType">
                  <option value="ask" selected>Ask HN</option>
                  <option value="show">Show HN</option>
                  <option value="new">New</option>
                  <option value="top">Top</option>
                </select>
              </label>
            </div>
            <button type="submit" class="secondary">Sync Hacker News</button>
          </form>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/yc">
            <label>
              YC company query
              <input name="query" placeholder="ai memory developer tools" />
            </label>
            <button type="submit" class="secondary">Sync YC startups</button>
          </form>
          <form class="stack json-form" data-endpoint="/v2/workspaces/${encodeURIComponent(workspace.id)}/research/linkedin" data-csv-fields="urls">
            <label>
              LinkedIn URLs
              <input name="urls" placeholder="https://www.linkedin.com/posts/..." />
            </label>
            <button type="submit" class="secondary">Sync LinkedIn</button>
          </form>
        </div>
      </article>
    </section>

    <section class="section grid two">
      <article class="panel">
        <span class="eyebrow">Accounts</span>
        <h2>Every account remembered</h2>
        ${
          dashboard.accounts.length > 0
            ? `
              <table class="table">
                <thead>
                  <tr>
                    <th>Account</th>
                    <th>Stage</th>
                    <th>Fit</th>
                    <th>Channels</th>
                  </tr>
                </thead>
                <tbody>
                  ${dashboard.accounts
                    .map(
                      (account) => `
                        <tr>
                          <td>
                            <strong>${escapeHtml(account.name)}</strong>
                            <div class="muted">${escapeHtml(account.summary)}</div>
                            <div class="muted">${escapeHtml(String((account.metadata as { strongestPain?: string } | undefined)?.strongestPain ?? "pain not classified yet"))}</div>
                          </td>
                          <td>${escapeHtml(account.stage)}</td>
                          <td>${escapeHtml(account.fitScore)}</td>
                          <td>${account.channels.map((channel) => `<span class="pill">${escapeHtml(channel)}</span>`).join("")}</td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            `
            : `<p class="muted">No accounts yet.</p>`
        }
      </article>

      <article class="panel">
        <span class="eyebrow">Pipeline</span>
        <h2>What actually books calls</h2>
        <div class="grid cards">
          ${Object.entries(dashboard.pipeline)
            .map(
              ([stage, value]) => `
                <div class="card metric">
                  <span class="eyebrow">${escapeHtml(stage.replace(/_/g, " "))}</span>
                  <strong>${escapeHtml(value)}</strong>
                </div>
              `,
            )
            .join("")}
        </div>
        <div class="section">
          <span class="eyebrow">Goals</span>
          <h3>What we are aiming for</h3>
          ${renderList(
            dashboard.goals.map(
              (goal) => `${goal.name}: ${goal.currentValue}/${goal.targetValue} ${goal.targetMetric.replace(/_/g, " ")}`,
            ),
            "No goals configured.",
          )}
        </div>
      </article>
    </section>

    <section class="section panel">
      <span class="eyebrow">Approvals</span>
      <h2>Approval before send</h2>
      ${
        dashboard.approvals.length > 0
          ? dashboard.approvals
              .map(
                ({ touch, asset, critique, account, person, sequence }) => `
                  <article class="approval-card">
                    <div class="row">
                      <div class="stack">
                        <strong>${escapeHtml(asset.title)}</strong>
                        <div class="muted">
                          ${escapeHtml(account?.name ?? "Unknown account")}
                          ${person ? ` · ${escapeHtml(person.name)} (${escapeHtml(person.role)})` : ""}
                          ${sequence ? ` · ${escapeHtml(sequence.playbookType.replace(/_/g, " "))}` : ""}
                        </div>
                      </div>
                      <span class="pill">${escapeHtml(touch.channel)}</span>
                    </div>
                    <p>${escapeHtml(asset.body)}</p>
                    <div class="stack muted">
                      <div><strong>Claims:</strong> ${asset.claimIds.map((claimId) => `<code>${escapeHtml(claimId)}</code>`).join(" ")}</div>
                      <div><strong>Critic score:</strong> ${escapeHtml(critique?.score ?? "n/a")}</div>
                      <div><strong>Blocking issues:</strong> ${escapeHtml((critique?.blockingIssues ?? []).join(" | ") || "None")}</div>
                      <div><strong>Warnings:</strong> ${escapeHtml((critique?.warnings ?? []).join(" | ") || "None")}</div>
                    </div>
                    <form class="decision-form stack" data-touch-id="${escapeHtml(touch.id)}">
                      <div class="form-grid">
                        <label>
                          Reviewer
                          <input name="reviewer" value="operator" required />
                        </label>
                        <label>
                          Reason
                          <input name="reason" placeholder="Why this decision makes sense" />
                        </label>
                        <label class="full">
                          Override reason
                          <input name="overrideReason" placeholder="Only needed for override" />
                        </label>
                      </div>
                      <div class="actions">
                        <button type="button" data-decision="approve">Approve</button>
                        <button type="button" class="secondary" data-decision="revise">Revise</button>
                        <button type="button" class="secondary" data-decision="override">Override</button>
                        <button type="button" class="secondary" data-decision="reject">Reject</button>
                      </div>
                    </form>
                  </article>
                `,
              )
              .join("")
          : `<p class="muted">Nothing waiting for review right now.</p>`
      }
    </section>

    <section class="section panel">
      <span class="eyebrow">Outcomes</span>
      <h2>What moved</h2>
      ${
        dashboard.outcomes.conversations.length > 0
          ? `
              <table class="table">
                <thead>
                  <tr>
                    <th>Status</th>
                    <th>Summary</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  ${dashboard.outcomes.conversations
                    .map(
                      (conversation) => `
                        <tr>
                          <td class="${conversation.status === "paid" ? "status-good" : conversation.status === "booked" ? "status-warning" : ""}">${escapeHtml(conversation.status)}</td>
                          <td>${escapeHtml(conversation.summary)}</td>
                          <td>${escapeHtml(conversation.lastInteractionAt)}</td>
                        </tr>
                      `,
                    )
                    .join("")}
                </tbody>
              </table>
            `
          : `<p class="muted">No conversations logged yet.</p>`
      }
    </section>
  `;

  const script = `
    <script>
      const jsonHeaders = { "Content-Type": "application/json" };

      function compactPayload(raw) {
        const next = {};
        for (const [key, value] of Object.entries(raw)) {
          if (value === "" || value === null || value === undefined) continue;
          next[key] = value;
        }
        return next;
      }

      function nestFormData(formData) {
        const payload = {};
        for (const [key, value] of formData.entries()) {
          if (key.includes(".")) {
            const [head, tail] = key.split(".", 2);
            payload[head] = payload[head] || {};
            payload[head][tail] = value;
          } else {
            payload[key] = value;
          }
        }
        return payload;
      }

      async function postJson(url, body) {
        const response = await fetch(url, {
          method: "POST",
          headers: body ? jsonHeaders : undefined,
          body: body ? JSON.stringify(body) : undefined,
        });
        if (!response.ok) {
          const message = await response.text();
          throw new Error(message || "Request failed");
        }
        return response;
      }

      function normalizeFormPayload(form) {
        const payload = nestFormData(new FormData(form));
        const csvFields = (form.dataset.csvFields || "").split(",").map((value) => value.trim()).filter(Boolean);
        for (const field of csvFields) {
          if (typeof payload[field] === "string") {
            payload[field] = payload[field].split(",").map((item) => item.trim()).filter(Boolean);
          }
        }
        return payload;
      }

      document.querySelectorAll(".json-form").forEach((signalForm) => {
        signalForm.addEventListener("submit", async (event) => {
          event.preventDefault();
          const payload = normalizeFormPayload(signalForm);
          if (payload.person && !payload.person.name && !payload.person.role && !payload.person.email && !payload.person.socialHandle) {
            delete payload.person;
          }
          if (payload.account) payload.account = compactPayload(payload.account);
          if (payload.person) payload.person = compactPayload(payload.person);
          try {
            await postJson(signalForm.dataset.endpoint, payload);
            window.location.reload();
          } catch (error) {
            window.alert(error.message || String(error));
          }
        });
      });

      document.querySelectorAll(".decision-form").forEach((form) => {
        form.querySelectorAll("[data-decision]").forEach((button) => {
          button.addEventListener("click", async () => {
            const touchId = form.dataset.touchId;
            const decision = button.dataset.decision;
            const formData = new FormData(form);
            const payload = compactPayload({
              reviewer: formData.get("reviewer"),
              reason: formData.get("reason"),
              overrideReason: formData.get("overrideReason"),
            });
            try {
              await postJson("/v2/touches/" + encodeURIComponent(touchId) + "/" + decision, payload);
              window.location.reload();
            } catch (error) {
              window.alert(error.message || String(error));
            }
          });
        });
      });
    </script>
  `;

  return layout(`${workspace.name} | RetainDB GTM Operator`, body, script);
}
