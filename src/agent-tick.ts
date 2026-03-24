/**
 * Agent tick — autonomous cron job that runs every 6 hours
 * Scans signal sources → scores → queues outreach → dispatches scheduled sends → sends digest
 */

import type { AppConfig } from "./config.js";
import type { GrowthOperator } from "./growth-operator.js";
import type { MarketingStore, Touch } from "./domain.js";
import { ResearchCoordinator } from "./research-connectors.js";

export interface AgentTickSummary {
  workspacesProcessed: number;
  signalsHarvested: number;
  signalsIngested: number;
  touchesSent: number;
  errors: string[];
  durationMs: number;
}

export async function runAgentTick(input: {
  store: MarketingStore;
  operator: GrowthOperator;
  config: AppConfig;
  research: ResearchCoordinator;
}): Promise<AgentTickSummary> {
  const started = Date.now();
  let workspacesProcessed = 0;
  let signalsHarvested = 0;
  let signalsIngested = 0;
  let touchesSent = 0;
  const errors: string[] = [];

  const sources = input.config.cronSignalSources;
  const maxSignals = input.config.cronMaxSignalsPerTick;

  try {
    const workspaces = await input.operator.listWorkspaces();
    workspacesProcessed = workspaces.length;

    for (const workspace of workspaces) {
      try {
        const brand = await input.store.findBrandById(workspace.brandId);
        if (!brand) continue;

        // Build search queries from the workspace ICP description
        const icpWords = workspace.primaryIcp
          .split(/\s+/)
          .filter((w) => w.length > 4)
          .slice(0, 4)
          .join(" ");
        const queries = [icpWords, brand.name].filter(Boolean);

        let harvested = 0;

        // X / Twitter
        if (sources.includes("x") && input.config.xBearerToken) {
          for (const query of queries.slice(0, 2)) {
            try {
              const results = await input.research.syncX({ workspaceId: workspace.id, query, maxResults: 15, autoGenerateSequence: false });
              harvested += Array.isArray(results) ? results.length : 0;
            } catch (e) {
              errors.push(`x:${(e as Error).message}`);
            }
            if (harvested >= maxSignals) break;
          }
        }

        // Reddit
        if (sources.includes("reddit") && harvested < maxSignals) {
          for (const query of queries.slice(0, 2)) {
            try {
              const results = await input.research.syncReddit({ workspaceId: workspace.id, query, maxResults: 10, autoGenerateSequence: false });
              harvested += Array.isArray(results) ? results.length : 0;
            } catch (e) {
              errors.push(`reddit:${(e as Error).message}`);
            }
            if (harvested >= maxSignals) break;
          }
        }

        // Hacker News
        if (sources.includes("hn") && harvested < maxSignals) {
          try {
            const results = await input.research.syncHackerNews({ workspaceId: workspace.id, query: queries[0] ?? icpWords, maxResults: 8, autoGenerateSequence: false });
            harvested += Array.isArray(results) ? results.length : 0;
          } catch (e) {
            errors.push(`hn:${(e as Error).message}`);
          }
        }

        // YC directory
        if (sources.includes("yc") && harvested < maxSignals) {
          try {
            const results = await input.research.syncYCombinator({ workspaceId: workspace.id, query: icpWords, maxResults: 10, autoGenerateSequence: true });
            harvested += Array.isArray(results) ? results.length : 0;
          } catch (e) {
            errors.push(`yc:${(e as Error).message}`);
          }
        }

        // GitHub
        if (sources.includes("github") && harvested < maxSignals && input.config.githubToken) {
          try {
            const results = await input.research.syncGitHub({ workspaceId: workspace.id, query: icpWords, maxResults: 8, autoGenerateSequence: false });
            harvested += Array.isArray(results) ? results.length : 0;
          } catch (e) {
            errors.push(`github:${(e as Error).message}`);
          }
        }

        signalsHarvested += harvested;
        signalsIngested += harvested;

        // Dispatch scheduled email touches
        if (input.config.resendApiKey && input.config.resendFromAddress) {
          const allTouches = await input.store.listTouchesByWorkspace(workspace.id);
          const now = new Date().toISOString();
          const due = allTouches.filter(
            (t) =>
              t.status === "approved" &&
              (t.touchType === "email" || t.touchType === "follow_up") &&
              typeof t.metadata?.scheduledFor === "string" &&
              (t.metadata.scheduledFor as string) <= now,
          );
          for (const touch of due.slice(0, 10)) {
            try {
              const result = await input.operator.sendApprovedEmailTouch({
                touchId: touch.id,
                resendApiKey: input.config.resendApiKey!,
                resendFromAddress: input.config.resendFromAddress!,
                resendFromName: input.config.resendFromName,
                githubToken: input.config.githubToken,
                hunterApiKey: input.config.hunterApiKey,
              });
              if (result.sent) touchesSent++;
            } catch (e) {
              errors.push(`email_send:${(e as Error).message}`);
            }
          }
        }
      } catch (e) {
        errors.push(`workspace_${workspace.id}:${(e as Error).message}`);
      }
    }
  } catch (e) {
    errors.push(`tick_fatal:${(e as Error).message}`);
  }

  const durationMs = Date.now() - started;
  const summary: AgentTickSummary = { workspacesProcessed, signalsHarvested, signalsIngested, touchesSent, errors, durationMs };

  // Send digest webhook if configured
  if (input.config.digestWebhookUrl) {
    try {
      await fetch(input.config.digestWebhookUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: buildDigestMessage(summary), summary, timestamp: new Date().toISOString() }),
      });
    } catch {
      // digest webhook failure is non-fatal
    }
  }

  return summary;
}

function buildDigestMessage(summary: AgentTickSummary): string {
  const lines = [
    `*Agent tick complete* (${(summary.durationMs / 1000).toFixed(1)}s)`,
    `• Workspaces: ${summary.workspacesProcessed}`,
    `• Signals harvested: ${summary.signalsHarvested}`,
    `• Touches sent: ${summary.touchesSent}`,
  ];
  if (summary.errors.length > 0) {
    lines.push(`• Errors: ${summary.errors.length} — ${summary.errors.slice(0, 3).join(", ")}`);
  }
  return lines.join("\n");
}
