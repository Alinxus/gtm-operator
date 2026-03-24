export type GrowthLane = "outbound" | "social" | "seo" | "campaign";
export type LanePriority = "p0_always_on" | "p1_brand_presence" | "p2_compounding" | "p3_burst";
export type SourceType =
  | "x"
  | "linkedin"
  | "reddit"
  | "hacker_news"
  | "github"
  | "y_combinator"
  | "docs"
  | "product"
  | "form"
  | "manual"
  | "crm";

export interface Workspace {
  id: string;
  brandId: string;
  slug: string;
  name: string;
  description?: string | null;
  primaryIcp: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  accountId?: string | null;
  personId?: string | null;
  signalId: string;
  lane?: GrowthLane | null;
  stage: string;
  score: number;
  reason: string;
  recommendedPlaybook: string;
  reachableChannels: string[];
  nextAction: string;
  metadata: Record<string, unknown>;
}

export interface ProspectAccount {
  id: string;
  name: string;
  domain?: string | null;
  summary: string;
  stage: string;
  fitScore: number;
  channels: string[];
  metadata: Record<string, unknown>;
}

export interface ProspectPerson {
  id: string;
  accountId: string;
  name: string;
  role: string;
  email?: string | null;
  socialHandle?: string | null;
  personaFit: number;
  metadata: Record<string, unknown>;
}

export interface Goal {
  id: string;
  name: string;
  targetMetric: string;
  targetValue: number;
  currentValue: number;
}

export interface PipelineSummary {
  signal: number;
  touched: number;
  replied: number;
  booked: number;
  qualified: number;
  paid: number;
  closed_lost: number;
}

export interface Conversation {
  id: string;
  accountId: string;
  personId?: string | null;
  status: "active" | "booked" | "qualified" | "paid" | "closed_lost";
  summary: string;
  lastInteractionAt: string;
  metadata: Record<string, unknown>;
}

export interface Attribution {
  id: string;
  accountId: string;
  stage: string;
  channel?: string | null;
  notes: string;
  weight: number;
}

export interface AssetSummary {
  id: string;
  title: string;
  body: string;
  channel: string;
  claimIds: string[];
}

export interface Touch {
  id: string;
  sequenceId: string;
  assetId: string;
  channel: string;
  touchType: string;
  status: string;
  title: string;
  body: string;
  CTA: string;
  claimIds: string[];
  lane?: GrowthLane | null;
  publicationStatus?: string | null;
  publishMetadata?: Record<string, unknown> | null;
}

export interface Critique {
  id: string;
  score: number;
  blockingIssues: string[];
  warnings: string[];
  notes: string[];
}

export interface Sequence {
  id: string;
  playbookType: string;
  title: string;
  status: string;
}

export interface ApprovalRow {
  touch: Touch;
  asset: AssetSummary;
  critique?: Critique | null;
  sequence?: Sequence | null;
  account?: ProspectAccount | null;
  person?: ProspectPerson | null;
}

export interface WorkspaceDashboard {
  workspace: Workspace;
  goals: Goal[];
  today: Opportunity[];
  accounts: ProspectAccount[];
  approvals: ApprovalRow[];
  pipeline: PipelineSummary;
  outcomes: {
    conversations: Conversation[];
    attributions: Attribution[];
    bookedCount: number;
    paidCount: number;
  };
  lanes?: {
    summary: Array<{
      lane: GrowthLane;
      priority: LanePriority;
      pendingCount: number;
      recentRunId?: string | null;
    }>;
  };
}

export interface LaneRun {
  id: string;
  lane: GrowthLane;
  priority: LanePriority;
  status: string;
  title: string;
  summary: string;
  trigger: string;
  generatedEntityIds: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ContentCalendarItem {
  id: string;
  platform: "x" | "linkedin" | "community";
  variant: "post" | "thread" | "quote" | "reaction" | "reply_bank" | "community_rewrite";
  title: string;
  hook: string;
  theme: string;
  status: "draft" | "queued" | "approved" | "published";
  claimIds: string[];
  assetIds: string[];
  scheduledFor?: string | null;
}

export interface SocialAsset {
  id: string;
  laneRunId: string;
  calendarItemId?: string | null;
  assetId: string;
  touchId?: string | null;
  platform: "x" | "linkedin" | "community";
  variant: "post" | "thread" | "quote" | "reaction" | "reply_bank" | "community_rewrite";
  title: string;
  body: string;
  claimIds: string[];
  status: "draft" | "review_required" | "approved" | "published";
  metadata: Record<string, unknown>;
}

export interface TopicCluster {
  id: string;
  title: string;
  summary: string;
  primaryPain: string;
  targetKeywords: string[];
  pageIdeas: string[];
  internalLinks: string[];
  claimIds: string[];
  status: "draft" | "approved" | "in_progress";
}

export interface EvergreenPage {
  id: string;
  laneRunId?: string | null;
  topicClusterId?: string | null;
  campaignBurstId?: string | null;
  assetId?: string | null;
  touchId?: string | null;
  pageType: "compare" | "use_case" | "integration" | "benchmark" | "problem_solution" | "docs_adjacent" | "landing";
  state: "existing" | "missing" | "stale" | "draft" | "approved" | "published";
  slug: string;
  title: string;
  summary: string;
  body: string;
  claimIds: string[];
  internalLinks: string[];
  metadata: Record<string, unknown>;
}

export interface CampaignBurst {
  id: string;
  laneRunId?: string | null;
  burstType: "launch" | "benchmark" | "integration" | "partnership" | "feature" | "content_repurposing";
  name: string;
  goal: string;
  brief: string;
  lanes: GrowthLane[];
  status: "draft" | "review_required" | "approved" | "completed";
  proofClaimIds: string[];
  generatedEntityIds: string[];
  metadata: Record<string, unknown>;
}

export interface PublishDestination {
  id: string;
  kind: "github_pr" | "webhook_export";
  name: string;
  supportedChannels: string[];
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
}

export interface PublishJob {
  id: string;
  destinationId: string;
  kind: "github_pr" | "webhook_export";
  entityType: "asset" | "touch";
  entityId: string;
  lane: GrowthLane;
  status: "queued" | "ready" | "publishing" | "published" | "failed" | "needs_retry";
  payload: Record<string, unknown>;
  lastError?: string | null;
  attemptCount: number;
  publishedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiEnvelope<T> {
  [key: string]: T;
}
