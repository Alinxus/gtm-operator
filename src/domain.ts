import { randomUUID } from "node:crypto";

export const CLAIM_STATUSES = ["verified", "inferred", "deprecated", "disputed", "forbidden"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

export const CLAIM_CATEGORIES = [
  "benchmark",
  "feature",
  "integration",
  "pricing",
  "security",
  "comparison",
  "roadmap",
  "proof",
  "voice",
  "other",
] as const;
export type ClaimCategory = (typeof CLAIM_CATEGORIES)[number];

export const CHANNEL_TYPES = [
  "seo",
  "social",
  "outbound",
  "community",
  "reply",
  "partnership",
  "landing",
] as const;
export type ChannelType = (typeof CHANNEL_TYPES)[number];

export const GROWTH_LANES = ["outbound", "social", "seo", "campaign"] as const;
export type GrowthLane = (typeof GROWTH_LANES)[number];

export const LANE_PRIORITIES = ["p0_always_on", "p1_brand_presence", "p2_compounding", "p3_burst"] as const;
export type LanePriority = (typeof LANE_PRIORITIES)[number];

export const LANE_RUN_STATUSES = ["queued", "running", "awaiting_review", "completed", "blocked", "failed"] as const;
export type LaneRunStatus = (typeof LANE_RUN_STATUSES)[number];

export const SOCIAL_PLATFORMS = ["x", "linkedin", "community"] as const;
export type SocialPlatform = (typeof SOCIAL_PLATFORMS)[number];

export const SOCIAL_VARIANTS = ["post", "thread", "quote", "reaction", "reply_bank", "community_rewrite"] as const;
export type SocialVariant = (typeof SOCIAL_VARIANTS)[number];

export const EVERGREEN_PAGE_TYPES = [
  "compare",
  "use_case",
  "integration",
  "benchmark",
  "problem_solution",
  "docs_adjacent",
  "landing",
] as const;
export type EvergreenPageType = (typeof EVERGREEN_PAGE_TYPES)[number];

export const PAGE_STATES = ["existing", "missing", "stale", "draft", "approved", "published"] as const;
export type PageState = (typeof PAGE_STATES)[number];

export const CAMPAIGN_BURST_TYPES = [
  "launch",
  "benchmark",
  "integration",
  "partnership",
  "feature",
  "content_repurposing",
] as const;
export type CampaignBurstType = (typeof CAMPAIGN_BURST_TYPES)[number];

export const PUBLICATION_STATUSES = ["queued", "ready", "publishing", "published", "failed", "needs_retry"] as const;
export type PublicationStatus = (typeof PUBLICATION_STATUSES)[number];

export const PUBLISH_DESTINATION_KINDS = ["github_pr", "webhook_export"] as const;
export type PublishDestinationKind = (typeof PUBLISH_DESTINATION_KINDS)[number];

export const CAMPAIGN_TYPES = [
  "launch",
  "content_engine",
  "founder_social",
  "partnership_outbound",
  "competitive_response",
  "other",
] as const;
export type CampaignType = (typeof CAMPAIGN_TYPES)[number];

export const RUN_STATUSES = [
  "queued",
  "grounding",
  "researching",
  "positioning",
  "drafting",
  "critiquing",
  "awaiting_human_review",
  "revision_required",
  "completed",
  "blocked",
  "failed",
] as const;
export type RunStatus = (typeof RUN_STATUSES)[number];

export const APPROVAL_STAGES = [
  "WAITING_FOR_FACT_APPROVAL",
  "WAITING_FOR_MESSAGE_APPROVAL",
  "WAITING_FOR_ASSET_APPROVAL",
  "WAITING_FOR_SEND_APPROVAL",
  "WAITING_FOR_PUBLISH_APPROVAL",
] as const;
export type ApprovalStage = (typeof APPROVAL_STAGES)[number];

export const ASSET_STATUSES = [
  "draft",
  "review_required",
  "needs_revision",
  "approved",
  "approved_with_exceptions",
  "rejected",
] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

export const APPROVAL_DECISIONS = ["approve", "reject", "override", "revise"] as const;
export type ApprovalDecision = (typeof APPROVAL_DECISIONS)[number];

export const SIGNAL_SOURCES = ["x", "linkedin", "reddit", "hacker_news", "github", "y_combinator", "docs", "product", "form", "manual", "crm"] as const;
export type SignalSource = (typeof SIGNAL_SOURCES)[number];

export const PLAYBOOK_TYPES = [
  "founder_outbound",
  "founder_reply_assist",
  "benchmark_proof_push",
  "integration_outreach",
  "community_participation",
  "launch_amplification",
  "follow_up_after_interest",
] as const;
export type PlaybookType = (typeof PLAYBOOK_TYPES)[number];

export const OPPORTUNITY_STAGES = ["signal", "touched", "replied", "booked", "qualified", "paid", "closed_lost"] as const;
export type OpportunityStage = (typeof OPPORTUNITY_STAGES)[number];

export const TOUCH_TYPES = ["email", "dm", "public_reply", "post", "landing_variant", "follow_up", "community_post"] as const;
export type TouchType = (typeof TOUCH_TYPES)[number];

export const TOUCH_STATUSES = [
  "draft",
  "review_required",
  "needs_revision",
  "approved",
  "approved_with_exceptions",
  "sent",
  "replied",
  "skipped",
] as const;
export type TouchStatus = (typeof TOUCH_STATUSES)[number];

export const SEQUENCE_STATUSES = ["draft", "review_required", "needs_revision", "approved", "in_progress", "completed"] as const;
export type SequenceStatus = (typeof SEQUENCE_STATUSES)[number];

export const GOAL_METRICS = ["booked_conversations", "paid_users", "replies"] as const;
export type GoalMetric = (typeof GOAL_METRICS)[number];

export const CONVERSATION_STATUSES = ["active", "booked", "qualified", "paid", "closed_lost"] as const;
export type ConversationStatus = (typeof CONVERSATION_STATUSES)[number];

export interface Brand {
  id: string;
  slug: string;
  name: string;
  description?: string | null;
  memoryProvider: "retaindb-http" | "mock";
  memoryProject: string;
  voice: BrandVoice;
  createdAt: string;
  updatedAt: string;
}

export interface BrandVoice {
  tone: string;
  styleRules: string[];
  preferredPhrases: string[];
  forbiddenPhrases: string[];
  founderVoiceNotes: string[];
}

export interface Claim {
  id: string;
  brandId: string;
  category: ClaimCategory;
  status: ClaimStatus;
  text: string;
  sourceUrls: string[];
  sourceExcerpt?: string | null;
  requiredQualifiers: string[];
  allowedChannels: ChannelType[];
  forbiddenVariants: string[];
  owner?: string | null;
  metadata: Record<string, unknown>;
  lastVerifiedAt?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Campaign {
  id: string;
  brandId: string;
  name: string;
  goal: string;
  campaignType: CampaignType;
  targetPersonas: string[];
  channels: ChannelType[];
  brief: string;
  constraints: string[];
  status: "draft" | "running" | "waiting_for_approval" | "completed" | "blocked";
  lane?: GrowthLane | null;
  sourceLane?: GrowthLane | null;
  campaignBurstId?: string | null;
  publishMetadata?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Run {
  id: string;
  brandId: string;
  campaignId: string;
  status: RunStatus;
  approvalStage?: ApprovalStage | null;
  currentStep?: string | null;
  summary: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  error?: string | null;
}

export interface Asset {
  id: string;
  brandId: string;
  campaignId: string;
  runId: string;
  channel: ChannelType;
  persona: string;
  title: string;
  body: string;
  claimIds: string[];
  status: AssetStatus;
  approvalStage: ApprovalStage;
  lane?: GrowthLane | null;
  sourceLane?: GrowthLane | null;
  campaignBurstId?: string | null;
  publicationStatus?: PublicationStatus | null;
  publishMetadata?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Critique {
  id: string;
  brandId: string;
  campaignId: string;
  runId: string;
  assetId: string;
  score: number;
  blockingIssues: string[];
  warnings: string[];
  notes: string[];
  reviewer: string;
  createdAt: string;
}

export interface Approval {
  id: string;
  brandId: string;
  campaignId: string;
  runId: string;
  assetId: string;
  stage: ApprovalStage;
  decision: ApprovalDecision;
  reason: string;
  overrideReason?: string | null;
  reviewer: string;
  createdAt: string;
}

export interface Outcome {
  id: string;
  brandId: string;
  campaignId: string;
  runId: string;
  assetId?: string | null;
  channel?: ChannelType | null;
  metrics: Record<string, number | string | boolean>;
  feedback?: string | null;
  createdAt: string;
}

export interface RunEvent {
  id: number;
  brandId: string;
  runId: string;
  eventType: string;
  stage?: string | null;
  payload: Record<string, unknown>;
  createdAt: string;
}

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

export interface ICPProfile {
  id: string;
  workspaceId: string;
  brandId: string;
  name: string;
  description: string;
  pains: string[];
  triggers: string[];
  disqualifiers: string[];
  channels: ChannelType[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProspectAccount {
  id: string;
  workspaceId: string;
  brandId: string;
  name: string;
  domain?: string | null;
  summary: string;
  stage: OpportunityStage;
  fitScore: number;
  channels: ChannelType[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface ProspectPerson {
  id: string;
  workspaceId: string;
  brandId: string;
  accountId: string;
  name: string;
  role: string;
  email?: string | null;
  socialHandle?: string | null;
  personaFit: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Signal {
  id: string;
  workspaceId: string;
  brandId: string;
  accountId?: string | null;
  personId?: string | null;
  lane?: GrowthLane | null;
  sourceLane?: GrowthLane | null;
  campaignBurstId?: string | null;
  source: SignalSource;
  title: string;
  content: string;
  evidenceUrls: string[];
  confidence: number;
  personaFit: number;
  freshness: number;
  buyingSignal: number;
  painMatch: number;
  proofMatch: number;
  founderImportance: number;
  channelHint?: ChannelType | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Opportunity {
  id: string;
  workspaceId: string;
  brandId: string;
  accountId?: string | null;
  personId?: string | null;
  signalId: string;
  lane?: GrowthLane | null;
  sourceLane?: GrowthLane | null;
  campaignBurstId?: string | null;
  stage: OpportunityStage;
  score: number;
  reason: string;
  recommendedPlaybook: PlaybookType;
  reachableChannels: ChannelType[];
  nextAction: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Sequence {
  id: string;
  workspaceId: string;
  brandId: string;
  accountId?: string | null;
  personId?: string | null;
  opportunityId?: string | null;
  lane?: GrowthLane | null;
  sourceLane?: GrowthLane | null;
  campaignBurstId?: string | null;
  playbookType: PlaybookType;
  status: SequenceStatus;
  title: string;
  summary: string;
  goal: string;
  touchIds: string[];
  runId: string;
  campaignId: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Touch {
  id: string;
  workspaceId: string;
  brandId: string;
  sequenceId: string;
  assetId: string;
  channel: ChannelType;
  touchType: TouchType;
  status: TouchStatus;
  title: string;
  body: string;
  CTA: string;
  claimIds: string[];
  lane?: GrowthLane | null;
  sourceLane?: GrowthLane | null;
  campaignBurstId?: string | null;
  publicationStatus?: PublicationStatus | null;
  publishMetadata?: Record<string, unknown> | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  workspaceId: string;
  brandId: string;
  accountId: string;
  personId?: string | null;
  opportunityId?: string | null;
  status: ConversationStatus;
  summary: string;
  lastInteractionAt: string;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Goal {
  id: string;
  workspaceId: string;
  brandId: string;
  name: string;
  targetMetric: GoalMetric;
  targetValue: number;
  currentValue: number;
  windowStart: string;
  windowEnd?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Attribution {
  id: string;
  workspaceId: string;
  brandId: string;
  accountId: string;
  personId?: string | null;
  opportunityId?: string | null;
  conversationId?: string | null;
  touchId?: string | null;
  outcomeId?: string | null;
  stage: OpportunityStage | "reply" | "booked" | "paid";
  channel?: ChannelType | null;
  weight: number;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface LaneRun {
  id: string;
  workspaceId: string;
  brandId: string;
  lane: GrowthLane;
  priority: LanePriority;
  status: LaneRunStatus;
  title: string;
  summary: string;
  trigger: string;
  runId?: string | null;
  campaignId?: string | null;
  generatedEntityIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
}

export interface ContentCalendarItem {
  id: string;
  workspaceId: string;
  brandId: string;
  laneRunId: string;
  platform: SocialPlatform;
  variant: SocialVariant;
  title: string;
  hook: string;
  theme: string;
  scheduledFor?: string | null;
  status: "draft" | "queued" | "approved" | "published";
  claimIds: string[];
  assetIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface SocialAsset {
  id: string;
  workspaceId: string;
  brandId: string;
  laneRunId: string;
  calendarItemId?: string | null;
  assetId: string;
  touchId?: string | null;
  platform: SocialPlatform;
  variant: SocialVariant;
  title: string;
  body: string;
  claimIds: string[];
  status: "draft" | "review_required" | "approved" | "published";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface TopicCluster {
  id: string;
  workspaceId: string;
  brandId: string;
  laneRunId: string;
  title: string;
  summary: string;
  primaryPain: string;
  targetKeywords: string[];
  pageIdeas: string[];
  internalLinks: string[];
  claimIds: string[];
  status: "draft" | "approved" | "in_progress";
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface EvergreenPage {
  id: string;
  workspaceId: string;
  brandId: string;
  laneRunId?: string | null;
  topicClusterId?: string | null;
  campaignBurstId?: string | null;
  assetId?: string | null;
  touchId?: string | null;
  pageType: EvergreenPageType;
  state: PageState;
  slug: string;
  title: string;
  summary: string;
  body: string;
  claimIds: string[];
  internalLinks: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignBurst {
  id: string;
  workspaceId: string;
  brandId: string;
  campaignId: string;
  laneRunId?: string | null;
  burstType: CampaignBurstType;
  name: string;
  goal: string;
  brief: string;
  lanes: GrowthLane[];
  status: "draft" | "review_required" | "approved" | "completed";
  proofClaimIds: string[];
  generatedEntityIds: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PerformanceSnapshot {
  id: string;
  workspaceId: string;
  brandId: string;
  lane: GrowthLane;
  title: string;
  summary: string;
  metrics: Record<string, number | string | boolean>;
  learnings: string[];
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PublishDestination {
  id: string;
  workspaceId: string;
  brandId: string;
  kind: PublishDestinationKind;
  name: string;
  supportedChannels: ChannelType[];
  config: Record<string, unknown>;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface PublishJob {
  id: string;
  workspaceId: string;
  brandId: string;
  destinationId: string;
  kind: PublishDestinationKind;
  entityType: "asset" | "touch";
  entityId: string;
  lane: GrowthLane;
  status: PublicationStatus;
  payload: Record<string, unknown>;
  lastError?: string | null;
  attemptCount: number;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string | null;
}

export interface PublishAttempt {
  id: string;
  workspaceId: string;
  brandId: string;
  publishJobId: string;
  status: PublicationStatus;
  responseStatus?: number | null;
  responseBody?: string | null;
  error?: string | null;
  metadata: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface WorkspaceDashboard {
  workspace: Workspace;
  goals: Goal[];
  today: Opportunity[];
  accounts: ProspectAccount[];
  approvals: Array<{
    touch: Touch;
    asset: Asset;
    critique?: Critique | null;
    sequence?: Sequence | null;
    account?: ProspectAccount | null;
    person?: ProspectPerson | null;
  }>;
  pipeline: Record<OpportunityStage, number>;
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

export interface ClaimSeed extends Omit<Claim, "brandId" | "createdAt" | "updatedAt"> {}

export interface TruthPack {
  brandSlug: string;
  brandName: string;
  brandDescription: string;
  publicVoice: BrandVoice;
  systemVoice: BrandVoice;
  claims: ClaimSeed[];
  brandMemory: string[];
  marketMemory: string[];
  performanceMemory: string[];
  forbiddenClaims: string[];
}

export interface PersonaInsight {
  persona: string;
  pains: string[];
  objections: string[];
  desiredOutcomes: string[];
  channels: ChannelType[];
}

export interface MarketResearch {
  personas: PersonaInsight[];
  competitorSnapshot: string[];
  marketObjections: string[];
  opportunities: string[];
  channelPriorities: ChannelType[];
  contentAngles: string[];
}

export interface MessageHouse {
  corePromise: string;
  pillars: string[];
  proofPoints: string[];
  proofClaimIds: string[];
  objectionMap: Record<string, string>;
  hookBank: string[];
  CTA: string;
}

export interface PositioningPlan {
  messageHouse: MessageHouse;
  personaMatrix: Array<{
    persona: string;
    angle: string;
    proofClaimIds: string[];
    objectionsHandled: string[];
  }>;
  narratives: string[];
}

export interface AssetDraft {
  channel: ChannelType;
  persona: string;
  title: string;
  body: string;
  claimIds: string[];
  approvalStage: ApprovalStage;
  metadata: Record<string, unknown>;
}

export interface CampaignBundle {
  run: Run;
  brand: Brand;
  campaign: Campaign;
  truthPack: {
    approvedClaims: Claim[];
    blockedClaims: Claim[];
    forbiddenClaims: string[];
    proofPoints: string[];
  };
  research: MarketResearch;
  positioning: PositioningPlan;
  assets: Array<Asset & { critique?: Critique | null; approval?: Approval | null }>;
  approvals: Approval[];
  critiques: Critique[];
  nextActions: string[];
  memoryWrites: MemoryWrite[];
}

export interface MemoryWrite {
  scope: "brand" | "campaign" | "market" | "performance" | "working";
  memoryType: "factual" | "preference" | "event" | "relationship" | "opinion" | "goal" | "instruction";
  content: string;
  tags?: string[];
  namespace?: string;
  importance?: number;
  metadata?: Record<string, unknown>;
  sessionId?: string;
  userId?: string;
}

export interface MemorySearchInput {
  query: string;
  project: string;
  memoryTypes?: Array<"factual" | "preference" | "event" | "relationship" | "opinion" | "goal" | "instruction">;
  namespace?: string;
  limit?: number;
}

export interface MemorySearchResult {
  id: string;
  content: string;
  score?: number;
  metadata?: Record<string, unknown>;
}

export interface MemoryProvider {
  add(write: MemoryWrite & { project: string }): Promise<{ id: string }>;
  search(input: MemorySearchInput): Promise<MemorySearchResult[]>;
}

export interface MarketingStore {
  ensureSchema?(): Promise<void>;
  createBrand(input: Omit<Brand, "createdAt" | "updatedAt">): Promise<Brand>;
  updateBrand(id: string, patch: Partial<Omit<Brand, "id" | "createdAt">>): Promise<Brand | undefined>;
  findBrandById(id: string): Promise<Brand | undefined>;
  findBrandBySlug(slug: string): Promise<Brand | undefined>;
  listBrands(): Promise<Brand[]>;

  upsertClaim(input: Omit<Claim, "createdAt" | "updatedAt">): Promise<Claim>;
  updateClaim(id: string, patch: Partial<Omit<Claim, "id" | "brandId" | "createdAt">>): Promise<Claim | undefined>;
  findClaimById(id: string): Promise<Claim | undefined>;
  listClaimsByBrand(brandId: string): Promise<Claim[]>;

  createCampaign(input: Omit<Campaign, "createdAt" | "updatedAt">): Promise<Campaign>;
  updateCampaign(id: string, patch: Partial<Omit<Campaign, "id" | "brandId" | "createdAt">>): Promise<Campaign | undefined>;
  findCampaignById(id: string): Promise<Campaign | undefined>;
  listCampaignsByBrand(brandId: string): Promise<Campaign[]>;

  createRun(input: Omit<Run, "createdAt" | "updatedAt">): Promise<Run>;
  updateRun(id: string, patch: Partial<Omit<Run, "id" | "brandId" | "campaignId" | "createdAt">>): Promise<Run | undefined>;
  findRunById(id: string): Promise<Run | undefined>;
  listRunsByCampaign(campaignId: string): Promise<Run[]>;

  createAsset(input: Omit<Asset, "createdAt" | "updatedAt">): Promise<Asset>;
  updateAsset(id: string, patch: Partial<Omit<Asset, "id" | "brandId" | "campaignId" | "runId" | "createdAt">>): Promise<Asset | undefined>;
  findAssetById(id: string): Promise<Asset | undefined>;
  listAssetsByRun(runId: string): Promise<Asset[]>;

  createCritique(input: Omit<Critique, "createdAt">): Promise<Critique>;
  findCritiqueByAsset(assetId: string): Promise<Critique | undefined>;
  listCritiquesByRun(runId: string): Promise<Critique[]>;

  createApproval(input: Omit<Approval, "createdAt">): Promise<Approval>;
  findApprovalByAsset(assetId: string): Promise<Approval | undefined>;
  listApprovalsByRun(runId: string): Promise<Approval[]>;

  createOutcome(input: Omit<Outcome, "createdAt">): Promise<Outcome>;
  listOutcomesByRun(runId: string): Promise<Outcome[]>;

  appendEvent(input: Omit<RunEvent, "id" | "createdAt">): Promise<RunEvent>;
  listEventsByRun(runId: string): Promise<RunEvent[]>;

  createWorkspace(input: Omit<Workspace, "createdAt" | "updatedAt">): Promise<Workspace>;
  updateWorkspace(id: string, patch: Partial<Omit<Workspace, "id" | "brandId" | "createdAt">>): Promise<Workspace | undefined>;
  findWorkspaceById(id: string): Promise<Workspace | undefined>;
  findWorkspaceBySlug(brandId: string, slug: string): Promise<Workspace | undefined>;
  listWorkspacesByBrand(brandId: string): Promise<Workspace[]>;

  createICPProfile(input: Omit<ICPProfile, "createdAt" | "updatedAt">): Promise<ICPProfile>;
  updateICPProfile(id: string, patch: Partial<Omit<ICPProfile, "id" | "workspaceId" | "brandId" | "createdAt">>): Promise<ICPProfile | undefined>;
  listICPProfilesByWorkspace(workspaceId: string): Promise<ICPProfile[]>;

  createProspectAccount(input: Omit<ProspectAccount, "createdAt" | "updatedAt">): Promise<ProspectAccount>;
  updateProspectAccount(id: string, patch: Partial<Omit<ProspectAccount, "id" | "workspaceId" | "brandId" | "createdAt">>): Promise<ProspectAccount | undefined>;
  findProspectAccountById(id: string): Promise<ProspectAccount | undefined>;
  listProspectAccountsByWorkspace(workspaceId: string): Promise<ProspectAccount[]>;

  createProspectPerson(input: Omit<ProspectPerson, "createdAt" | "updatedAt">): Promise<ProspectPerson>;
  updateProspectPerson(id: string, patch: Partial<Omit<ProspectPerson, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>): Promise<ProspectPerson | undefined>;
  findProspectPersonById(id: string): Promise<ProspectPerson | undefined>;
  listProspectPeopleByWorkspace(workspaceId: string): Promise<ProspectPerson[]>;
  listProspectPeopleByAccount(accountId: string): Promise<ProspectPerson[]>;

  createSignal(input: Omit<Signal, "createdAt" | "updatedAt">): Promise<Signal>;
  updateSignal(id: string, patch: Partial<Omit<Signal, "id" | "workspaceId" | "brandId" | "createdAt">>): Promise<Signal | undefined>;
  findSignalById(id: string): Promise<Signal | undefined>;
  listSignalsByWorkspace(workspaceId: string): Promise<Signal[]>;

  createOpportunity(input: Omit<Opportunity, "createdAt" | "updatedAt">): Promise<Opportunity>;
  updateOpportunity(id: string, patch: Partial<Omit<Opportunity, "id" | "workspaceId" | "brandId" | "accountId" | "signalId" | "createdAt">>): Promise<Opportunity | undefined>;
  findOpportunityById(id: string): Promise<Opportunity | undefined>;
  listOpportunitiesByWorkspace(workspaceId: string): Promise<Opportunity[]>;

  createSequence(input: Omit<Sequence, "createdAt" | "updatedAt">): Promise<Sequence>;
  updateSequence(id: string, patch: Partial<Omit<Sequence, "id" | "workspaceId" | "brandId" | "accountId" | "opportunityId" | "createdAt">>): Promise<Sequence | undefined>;
  findSequenceById(id: string): Promise<Sequence | undefined>;
  listSequencesByWorkspace(workspaceId: string): Promise<Sequence[]>;

  createTouch(input: Omit<Touch, "createdAt" | "updatedAt">): Promise<Touch>;
  updateTouch(id: string, patch: Partial<Omit<Touch, "id" | "workspaceId" | "brandId" | "sequenceId" | "assetId" | "createdAt">>): Promise<Touch | undefined>;
  findTouchById(id: string): Promise<Touch | undefined>;
  findTouchByAssetId(assetId: string): Promise<Touch | undefined>;
  listTouchesByWorkspace(workspaceId: string): Promise<Touch[]>;
  listTouchesBySequence(sequenceId: string): Promise<Touch[]>;

  createConversation(input: Omit<Conversation, "createdAt" | "updatedAt">): Promise<Conversation>;
  updateConversation(id: string, patch: Partial<Omit<Conversation, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>): Promise<Conversation | undefined>;
  findConversationById(id: string): Promise<Conversation | undefined>;
  listConversationsByWorkspace(workspaceId: string): Promise<Conversation[]>;

  createGoal(input: Omit<Goal, "createdAt" | "updatedAt">): Promise<Goal>;
  updateGoal(id: string, patch: Partial<Omit<Goal, "id" | "workspaceId" | "brandId" | "createdAt">>): Promise<Goal | undefined>;
  findGoalById(id: string): Promise<Goal | undefined>;
  listGoalsByWorkspace(workspaceId: string): Promise<Goal[]>;

  createAttribution(input: Omit<Attribution, "createdAt" | "updatedAt">): Promise<Attribution>;
  updateAttribution(id: string, patch: Partial<Omit<Attribution, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>): Promise<Attribution | undefined>;
  findAttributionById(id: string): Promise<Attribution | undefined>;
  listAttributionsByWorkspace(workspaceId: string): Promise<Attribution[]>;

  createLaneRun(input: Omit<LaneRun, "createdAt" | "updatedAt">): Promise<LaneRun>;
  updateLaneRun(id: string, patch: Partial<Omit<LaneRun, "id" | "workspaceId" | "brandId" | "createdAt">>): Promise<LaneRun | undefined>;
  findLaneRunById(id: string): Promise<LaneRun | undefined>;
  listLaneRunsByWorkspace(workspaceId: string): Promise<LaneRun[]>;
  listLaneRunsByLane(workspaceId: string, lane: GrowthLane): Promise<LaneRun[]>;

  createContentCalendarItem(input: Omit<ContentCalendarItem, "createdAt" | "updatedAt">): Promise<ContentCalendarItem>;
  updateContentCalendarItem(
    id: string,
    patch: Partial<Omit<ContentCalendarItem, "id" | "workspaceId" | "brandId" | "laneRunId" | "createdAt">>,
  ): Promise<ContentCalendarItem | undefined>;
  findContentCalendarItemById(id: string): Promise<ContentCalendarItem | undefined>;
  listContentCalendarItemsByWorkspace(workspaceId: string): Promise<ContentCalendarItem[]>;
  listContentCalendarItemsByLaneRun(laneRunId: string): Promise<ContentCalendarItem[]>;

  createSocialAsset(input: Omit<SocialAsset, "createdAt" | "updatedAt">): Promise<SocialAsset>;
  updateSocialAsset(id: string, patch: Partial<Omit<SocialAsset, "id" | "workspaceId" | "brandId" | "laneRunId" | "assetId" | "createdAt">>): Promise<SocialAsset | undefined>;
  findSocialAssetById(id: string): Promise<SocialAsset | undefined>;
  listSocialAssetsByWorkspace(workspaceId: string): Promise<SocialAsset[]>;
  listSocialAssetsByLaneRun(laneRunId: string): Promise<SocialAsset[]>;

  createTopicCluster(input: Omit<TopicCluster, "createdAt" | "updatedAt">): Promise<TopicCluster>;
  updateTopicCluster(id: string, patch: Partial<Omit<TopicCluster, "id" | "workspaceId" | "brandId" | "laneRunId" | "createdAt">>): Promise<TopicCluster | undefined>;
  findTopicClusterById(id: string): Promise<TopicCluster | undefined>;
  listTopicClustersByWorkspace(workspaceId: string): Promise<TopicCluster[]>;
  listTopicClustersByLaneRun(laneRunId: string): Promise<TopicCluster[]>;

  createEvergreenPage(input: Omit<EvergreenPage, "createdAt" | "updatedAt">): Promise<EvergreenPage>;
  updateEvergreenPage(
    id: string,
    patch: Partial<Omit<EvergreenPage, "id" | "workspaceId" | "brandId" | "createdAt">>,
  ): Promise<EvergreenPage | undefined>;
  findEvergreenPageById(id: string): Promise<EvergreenPage | undefined>;
  listEvergreenPagesByWorkspace(workspaceId: string): Promise<EvergreenPage[]>;
  findEvergreenPageBySlug(workspaceId: string, slug: string): Promise<EvergreenPage | undefined>;

  createCampaignBurst(input: Omit<CampaignBurst, "createdAt" | "updatedAt">): Promise<CampaignBurst>;
  updateCampaignBurst(id: string, patch: Partial<Omit<CampaignBurst, "id" | "workspaceId" | "brandId" | "campaignId" | "createdAt">>): Promise<CampaignBurst | undefined>;
  findCampaignBurstById(id: string): Promise<CampaignBurst | undefined>;
  listCampaignBurstsByWorkspace(workspaceId: string): Promise<CampaignBurst[]>;

  createPerformanceSnapshot(input: Omit<PerformanceSnapshot, "createdAt" | "updatedAt">): Promise<PerformanceSnapshot>;
  updatePerformanceSnapshot(id: string, patch: Partial<Omit<PerformanceSnapshot, "id" | "workspaceId" | "brandId" | "createdAt">>): Promise<PerformanceSnapshot | undefined>;
  findPerformanceSnapshotById(id: string): Promise<PerformanceSnapshot | undefined>;
  listPerformanceSnapshotsByWorkspace(workspaceId: string): Promise<PerformanceSnapshot[]>;

  createPublishDestination(input: Omit<PublishDestination, "createdAt" | "updatedAt">): Promise<PublishDestination>;
  updatePublishDestination(
    id: string,
    patch: Partial<Omit<PublishDestination, "id" | "workspaceId" | "brandId" | "createdAt">>,
  ): Promise<PublishDestination | undefined>;
  findPublishDestinationById(id: string): Promise<PublishDestination | undefined>;
  listPublishDestinationsByWorkspace(workspaceId: string): Promise<PublishDestination[]>;

  createPublishJob(input: Omit<PublishJob, "createdAt" | "updatedAt">): Promise<PublishJob>;
  updatePublishJob(id: string, patch: Partial<Omit<PublishJob, "id" | "workspaceId" | "brandId" | "destinationId" | "createdAt">>): Promise<PublishJob | undefined>;
  findPublishJobById(id: string): Promise<PublishJob | undefined>;
  listPublishJobsByWorkspace(workspaceId: string): Promise<PublishJob[]>;

  createPublishAttempt(input: Omit<PublishAttempt, "createdAt" | "updatedAt">): Promise<PublishAttempt>;
  updatePublishAttempt(
    id: string,
    patch: Partial<Omit<PublishAttempt, "id" | "workspaceId" | "brandId" | "publishJobId" | "createdAt">>,
  ): Promise<PublishAttempt | undefined>;
  listPublishAttemptsByJob(publishJobId: string): Promise<PublishAttempt[]>;
}

export function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

export function isoNow() {
  return new Date().toISOString();
}

export function deepClone<T>(value: T): T {
  return structuredClone(value);
}

export function dedupe<T>(values: T[]) {
  return [...new Set(values)];
}

export function approvalStageForChannel(channel: ChannelType): ApprovalStage {
  if (channel === "landing" || channel === "seo") return "WAITING_FOR_PUBLISH_APPROVAL";
  if (channel === "outbound" || channel === "reply" || channel === "partnership") return "WAITING_FOR_SEND_APPROVAL";
  return "WAITING_FOR_MESSAGE_APPROVAL";
}

export function assetStatusForCritique(blockingIssues: string[]) {
  return blockingIssues.length > 0 ? "needs_revision" : "review_required";
}
