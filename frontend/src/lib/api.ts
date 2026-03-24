import type {
  ApprovalRow,
  CampaignBurst,
  ContentCalendarItem,
  Conversation,
  EvergreenPage,
  LaneRun,
  Opportunity,
  ProspectAccount,
  ProspectPerson,
  PublishDestination,
  PublishJob,
  SocialAsset,
  TopicCluster,
  Workspace,
  WorkspaceDashboard,
} from "@/lib/types";

export const operatorApiBaseUrl = (
  process.env.OPERATOR_API_BASE_URL ??
  process.env.NEXT_PUBLIC_OPERATOR_API_BASE_URL ??
  "http://localhost:4000"
).replace(/\/$/, "");

type JsonBody = Record<string, unknown> | Array<unknown>;

function pathWithBase(path: string) {
  return `${operatorApiBaseUrl}${path.startsWith("/") ? path : `/${path}`}`;
}

async function parseError(response: Response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { error?: string; details?: unknown };
    return parsed.error ?? text;
  } catch {
    return text || `Request failed (${response.status})`;
  }
}

async function request<T>(path: string, init?: RequestInit & { json?: JsonBody }) {
  const response = await fetch(pathWithBase(path), {
    ...init,
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
    body: init?.json ? JSON.stringify(init.json) : init?.body,
  });

  if (!response.ok) {
    throw new Error(await parseError(response));
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

async function safeRequest<T>(path: string, fallback: T) {
  try {
    return await request<T>(path);
  } catch {
    return fallback;
  }
}

export const operatorApi = {
  request,
  listWorkspaces: async () => (await request<{ workspaces: Workspace[] }>("/v2/workspaces")).workspaces,
  getWorkspaceDashboard: async (workspaceId: string) =>
    request<WorkspaceDashboard>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/dashboard`),
  listLaneRuns: async (workspaceId: string, lane: "outbound" | "social" | "seo" | "campaign") =>
    (await safeRequest<{ runs: LaneRun[] }>(
      `/v2/workspaces/${encodeURIComponent(workspaceId)}/lanes/${lane}/runs`,
      { runs: [] },
    )).runs,
  listLanes: async (workspaceId: string) =>
    (
      await safeRequest<{
        lanes: Array<{ lane: "outbound" | "social" | "seo" | "campaign"; priority: string; pendingCount: number; recentRunId?: string | null }>;
      }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/lanes`, { lanes: [] })
    ).lanes,
  listOpportunities: async (workspaceId: string) =>
    (await safeRequest<{ opportunities: Opportunity[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/opportunities`, { opportunities: [] }))
      .opportunities,
  listAccounts: async (workspaceId: string) =>
    (
      await safeRequest<{ accounts: ProspectAccount[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/prospects/accounts`, {
        accounts: [],
      })
    ).accounts,
  listPeople: async (workspaceId: string) =>
    (await safeRequest<{ people: ProspectPerson[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/prospects/people`, { people: [] })).people,
  listApprovals: async (workspaceId: string) =>
    (await safeRequest<{ approvals: ApprovalRow[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/approvals`, { approvals: [] })).approvals,
  listSocialCalendar: async (workspaceId: string) =>
    (
      await safeRequest<{ calendar: ContentCalendarItem[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/social/calendar`, {
        calendar: [],
      })
    ).calendar,
  listSocialAssets: async (workspaceId: string) =>
    (await safeRequest<{ assets: SocialAsset[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/social/assets`, { assets: [] })).assets,
  listTopicClusters: async (workspaceId: string) =>
    (
      await safeRequest<{ topicClusters: TopicCluster[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/seo/topic-clusters`, {
        topicClusters: [],
      })
    ).topicClusters,
  listSeoPages: async (workspaceId: string) =>
    (await safeRequest<{ pages: EvergreenPage[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/seo/pages`, { pages: [] })).pages,
  listCampaignBursts: async (workspaceId: string) =>
    (
      await safeRequest<{ campaignBursts: CampaignBurst[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/campaign-bursts`, {
        campaignBursts: [],
      })
    ).campaignBursts,
  listPublishDestinations: async (workspaceId: string) =>
    (
      await safeRequest<{ destinations: PublishDestination[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/publish-destinations`, {
        destinations: [],
      })
    ).destinations,
  listPublishJobs: async (workspaceId: string) =>
    (await safeRequest<{ jobs: PublishJob[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/publish-jobs`, { jobs: [] })).jobs,
  listConversations: async (workspaceId: string) =>
    (
      await safeRequest<{ conversations: Conversation[] }>(`/v2/workspaces/${encodeURIComponent(workspaceId)}/conversations`, {
        conversations: [],
      })
    ).conversations,
};
