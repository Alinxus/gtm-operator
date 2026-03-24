import type {
  Approval,
  Asset,
  Attribution,
  Brand,
  CampaignBurst,
  Campaign,
  Claim,
  ContentCalendarItem,
  Conversation,
  Critique,
  EvergreenPage,
  Goal,
  ICPProfile,
  LaneRun,
  MarketingStore,
  Opportunity,
  Outcome,
  PerformanceSnapshot,
  PublishAttempt,
  PublishDestination,
  PublishJob,
  ProspectAccount,
  ProspectPerson,
  Run,
  RunEvent,
  Sequence,
  Signal,
  SocialAsset,
  Touch,
  TopicCluster,
  Workspace,
} from "../domain.js";
import { deepClone, isoNow } from "../domain.js";

function clone<T>(value: T): T {
  return deepClone(value);
}

function sortByCreatedAtAsc<T extends { createdAt: string }>(items: T[]) {
  return [...items].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

type OperatorEntity =
  | Workspace
  | ICPProfile
  | ProspectAccount
  | ProspectPerson
  | Signal
  | Opportunity
  | Sequence
  | Touch
  | Conversation
  | Goal
  | Attribution
  | LaneRun
  | ContentCalendarItem
  | SocialAsset
  | TopicCluster
  | EvergreenPage
  | CampaignBurst
  | PerformanceSnapshot
  | PublishDestination
  | PublishJob
  | PublishAttempt;

type OperatorKind =
  | "workspace"
  | "icp_profile"
  | "prospect_account"
  | "prospect_person"
  | "signal"
  | "opportunity"
  | "sequence"
  | "touch"
  | "conversation"
  | "goal"
  | "attribution"
  | "lane_run"
  | "content_calendar_item"
  | "social_asset"
  | "topic_cluster"
  | "evergreen_page"
  | "campaign_burst"
  | "performance_snapshot"
  | "publish_destination"
  | "publish_job"
  | "publish_attempt";

export class InMemoryMarketingStore implements MarketingStore {
  private readonly brands = new Map<string, Brand>();
  private readonly claims = new Map<string, Claim>();
  private readonly campaigns = new Map<string, Campaign>();
  private readonly runs = new Map<string, Run>();
  private readonly assets = new Map<string, Asset>();
  private readonly critiques = new Map<string, Critique>();
  private readonly approvals = new Map<string, Approval>();
  private readonly outcomes = new Map<string, Outcome>();
  private readonly events = new Map<string, RunEvent[]>();
  private readonly operatorEntities = new Map<OperatorKind, Map<string, OperatorEntity>>();
  private eventId = 1;

  private bucket<T extends OperatorEntity>(kind: OperatorKind) {
    const current = this.operatorEntities.get(kind) ?? new Map<string, OperatorEntity>();
    this.operatorEntities.set(kind, current);
    return current as Map<string, T>;
  }

  private createOperatorEntity<T extends OperatorEntity>(kind: OperatorKind, input: Omit<T, "createdAt" | "updatedAt">) {
    const entity = { ...input, createdAt: isoNow(), updatedAt: isoNow() } as T;
    this.bucket<T>(kind).set(entity.id, clone(entity));
    return clone(entity);
  }

  private updateOperatorEntity<T extends OperatorEntity>(
    kind: OperatorKind,
    id: string,
    patch: Partial<Omit<T, "id" | "createdAt">>,
  ) {
    const bucket = this.bucket<T>(kind);
    const existing = bucket.get(id);
    if (!existing) return undefined;
    const entity = { ...existing, ...patch, updatedAt: isoNow() } as T;
    bucket.set(id, clone(entity));
    return clone(entity);
  }

  private findOperatorEntity<T extends OperatorEntity>(kind: OperatorKind, id: string) {
    return clone(this.bucket<T>(kind).get(id));
  }

  private listOperatorEntities<T extends OperatorEntity>(kind: OperatorKind, predicate: (entity: T) => boolean) {
    return clone(sortByCreatedAtAsc([...this.bucket<T>(kind).values()].filter(predicate)));
  }

  async createBrand(input: Omit<Brand, "createdAt" | "updatedAt">) {
    const brand: Brand = { ...input, createdAt: isoNow(), updatedAt: isoNow() };
    this.brands.set(brand.id, clone(brand));
    return clone(brand);
  }

  async updateBrand(id: string, patch: Partial<Omit<Brand, "id" | "createdAt">>) {
    const brand = this.brands.get(id);
    if (!brand) return undefined;
    const next: Brand = { ...brand, ...patch, updatedAt: isoNow() };
    this.brands.set(id, clone(next));
    return clone(next);
  }

  async findBrandById(id: string) {
    return clone(this.brands.get(id));
  }

  async findBrandBySlug(slug: string) {
    return clone([...this.brands.values()].find((brand) => brand.slug === slug));
  }

  async listBrands() {
    return clone([...this.brands.values()]);
  }

  async upsertClaim(input: Omit<Claim, "createdAt" | "updatedAt">) {
    const existing = this.claims.get(input.id);
    const claim: Claim = {
      ...input,
      createdAt: existing?.createdAt ?? isoNow(),
      updatedAt: isoNow(),
    };
    this.claims.set(claim.id, clone(claim));
    return clone(claim);
  }

  async updateClaim(id: string, patch: Partial<Omit<Claim, "id" | "brandId" | "createdAt">>) {
    const claim = this.claims.get(id);
    if (!claim) return undefined;
    const next: Claim = { ...claim, ...patch, updatedAt: isoNow() };
    this.claims.set(id, clone(next));
    return clone(next);
  }

  async findClaimById(id: string) {
    return clone(this.claims.get(id));
  }

  async listClaimsByBrand(brandId: string) {
    return clone(sortByCreatedAtAsc([...this.claims.values()].filter((claim) => claim.brandId === brandId)));
  }

  async createCampaign(input: Omit<Campaign, "createdAt" | "updatedAt">) {
    const campaign: Campaign = { ...input, createdAt: isoNow(), updatedAt: isoNow() };
    this.campaigns.set(campaign.id, clone(campaign));
    return clone(campaign);
  }

  async updateCampaign(id: string, patch: Partial<Omit<Campaign, "id" | "brandId" | "createdAt">>) {
    const campaign = this.campaigns.get(id);
    if (!campaign) return undefined;
    const next: Campaign = { ...campaign, ...patch, updatedAt: isoNow() };
    this.campaigns.set(id, clone(next));
    return clone(next);
  }

  async findCampaignById(id: string) {
    return clone(this.campaigns.get(id));
  }

  async listCampaignsByBrand(brandId: string) {
    return clone(sortByCreatedAtAsc([...this.campaigns.values()].filter((campaign) => campaign.brandId === brandId)));
  }

  async createRun(input: Omit<Run, "createdAt" | "updatedAt">) {
    const run: Run = { ...input, createdAt: isoNow(), updatedAt: isoNow() };
    this.runs.set(run.id, clone(run));
    return clone(run);
  }

  async updateRun(id: string, patch: Partial<Omit<Run, "id" | "brandId" | "campaignId" | "createdAt">>) {
    const run = this.runs.get(id);
    if (!run) return undefined;
    const next: Run = { ...run, ...patch, updatedAt: isoNow() };
    this.runs.set(id, clone(next));
    return clone(next);
  }

  async findRunById(id: string) {
    return clone(this.runs.get(id));
  }

  async listRunsByCampaign(campaignId: string) {
    return clone(sortByCreatedAtAsc([...this.runs.values()].filter((run) => run.campaignId === campaignId)));
  }

  async createAsset(input: Omit<Asset, "createdAt" | "updatedAt">) {
    const asset: Asset = { ...input, createdAt: isoNow(), updatedAt: isoNow() };
    this.assets.set(asset.id, clone(asset));
    return clone(asset);
  }

  async updateAsset(id: string, patch: Partial<Omit<Asset, "id" | "brandId" | "campaignId" | "runId" | "createdAt">>) {
    const asset = this.assets.get(id);
    if (!asset) return undefined;
    const next: Asset = { ...asset, ...patch, updatedAt: isoNow() };
    this.assets.set(id, clone(next));
    return clone(next);
  }

  async findAssetById(id: string) {
    return clone(this.assets.get(id));
  }

  async listAssetsByRun(runId: string) {
    return clone(sortByCreatedAtAsc([...this.assets.values()].filter((asset) => asset.runId === runId)));
  }

  async createCritique(input: Omit<Critique, "createdAt">) {
    const critique: Critique = { ...input, createdAt: isoNow() };
    this.critiques.set(critique.id, clone(critique));
    return clone(critique);
  }

  async findCritiqueByAsset(assetId: string) {
    return clone([...this.critiques.values()].find((critique) => critique.assetId === assetId));
  }

  async listCritiquesByRun(runId: string) {
    return clone(sortByCreatedAtAsc([...this.critiques.values()].filter((critique) => critique.runId === runId)));
  }

  async createApproval(input: Omit<Approval, "createdAt">) {
    const approval: Approval = { ...input, createdAt: isoNow() };
    this.approvals.set(approval.id, clone(approval));
    return clone(approval);
  }

  async findApprovalByAsset(assetId: string) {
    return clone([...this.approvals.values()].filter((approval) => approval.assetId === assetId).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]);
  }

  async listApprovalsByRun(runId: string) {
    return clone(sortByCreatedAtAsc([...this.approvals.values()].filter((approval) => approval.runId === runId)));
  }

  async createOutcome(input: Omit<Outcome, "createdAt">) {
    const outcome: Outcome = { ...input, createdAt: isoNow() };
    this.outcomes.set(outcome.id, clone(outcome));
    return clone(outcome);
  }

  async listOutcomesByRun(runId: string) {
    return clone(sortByCreatedAtAsc([...this.outcomes.values()].filter((outcome) => outcome.runId === runId)));
  }

  async appendEvent(input: Omit<RunEvent, "id" | "createdAt">) {
    const event: RunEvent = {
      ...input,
      id: this.eventId++,
      createdAt: isoNow(),
    };
    const bucket = this.events.get(input.runId) ?? [];
    bucket.push(clone(event));
    this.events.set(input.runId, bucket);
    return clone(event);
  }

  async listEventsByRun(runId: string) {
    return clone(sortByCreatedAtAsc((this.events.get(runId) ?? []).slice()));
  }

  async createWorkspace(input: Omit<Workspace, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Workspace>("workspace", input);
  }

  async updateWorkspace(id: string, patch: Partial<Omit<Workspace, "id" | "brandId" | "createdAt">>) {
    return this.updateOperatorEntity<Workspace>("workspace", id, patch);
  }

  async findWorkspaceById(id: string) {
    return this.findOperatorEntity<Workspace>("workspace", id);
  }

  async findWorkspaceBySlug(brandId: string, slug: string) {
    return clone([...this.bucket<Workspace>("workspace").values()].find((workspace) => workspace.brandId === brandId && workspace.slug === slug));
  }

  async listWorkspacesByBrand(brandId: string) {
    return this.listOperatorEntities<Workspace>("workspace", (workspace) => workspace.brandId === brandId);
  }

  async createICPProfile(input: Omit<ICPProfile, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<ICPProfile>("icp_profile", input);
  }

  async updateICPProfile(id: string, patch: Partial<Omit<ICPProfile, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    return this.updateOperatorEntity<ICPProfile>("icp_profile", id, patch);
  }

  async listICPProfilesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ICPProfile>("icp_profile", (profile) => profile.workspaceId === workspaceId);
  }

  async createProspectAccount(input: Omit<ProspectAccount, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<ProspectAccount>("prospect_account", input);
  }

  async updateProspectAccount(id: string, patch: Partial<Omit<ProspectAccount, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    return this.updateOperatorEntity<ProspectAccount>("prospect_account", id, patch);
  }

  async findProspectAccountById(id: string) {
    return this.findOperatorEntity<ProspectAccount>("prospect_account", id);
  }

  async listProspectAccountsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ProspectAccount>("prospect_account", (account) => account.workspaceId === workspaceId);
  }

  async createProspectPerson(input: Omit<ProspectPerson, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<ProspectPerson>("prospect_person", input);
  }

  async updateProspectPerson(id: string, patch: Partial<Omit<ProspectPerson, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>) {
    return this.updateOperatorEntity<ProspectPerson>("prospect_person", id, patch);
  }

  async findProspectPersonById(id: string) {
    return this.findOperatorEntity<ProspectPerson>("prospect_person", id);
  }

  async listProspectPeopleByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ProspectPerson>("prospect_person", (person) => person.workspaceId === workspaceId);
  }

  async listProspectPeopleByAccount(accountId: string) {
    return this.listOperatorEntities<ProspectPerson>("prospect_person", (person) => person.accountId === accountId);
  }

  async createSignal(input: Omit<Signal, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Signal>("signal", input);
  }

  async updateSignal(id: string, patch: Partial<Omit<Signal, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    return this.updateOperatorEntity<Signal>("signal", id, patch);
  }

  async findSignalById(id: string) {
    return this.findOperatorEntity<Signal>("signal", id);
  }

  async listSignalsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Signal>("signal", (signal) => signal.workspaceId === workspaceId);
  }

  async createOpportunity(input: Omit<Opportunity, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Opportunity>("opportunity", input);
  }

  async updateOpportunity(id: string, patch: Partial<Omit<Opportunity, "id" | "workspaceId" | "brandId" | "accountId" | "signalId" | "createdAt">>) {
    return this.updateOperatorEntity<Opportunity>("opportunity", id, patch);
  }

  async findOpportunityById(id: string) {
    return this.findOperatorEntity<Opportunity>("opportunity", id);
  }

  async listOpportunitiesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Opportunity>("opportunity", (opportunity) => opportunity.workspaceId === workspaceId);
  }

  async createSequence(input: Omit<Sequence, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Sequence>("sequence", input);
  }

  async updateSequence(id: string, patch: Partial<Omit<Sequence, "id" | "workspaceId" | "brandId" | "accountId" | "opportunityId" | "createdAt">>) {
    return this.updateOperatorEntity<Sequence>("sequence", id, patch);
  }

  async findSequenceById(id: string) {
    return this.findOperatorEntity<Sequence>("sequence", id);
  }

  async listSequencesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Sequence>("sequence", (sequence) => sequence.workspaceId === workspaceId);
  }

  async createTouch(input: Omit<Touch, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Touch>("touch", input);
  }

  async updateTouch(id: string, patch: Partial<Omit<Touch, "id" | "workspaceId" | "brandId" | "sequenceId" | "assetId" | "createdAt">>) {
    return this.updateOperatorEntity<Touch>("touch", id, patch);
  }

  async findTouchById(id: string) {
    return this.findOperatorEntity<Touch>("touch", id);
  }

  async findTouchByAssetId(assetId: string) {
    return clone([...this.bucket<Touch>("touch").values()].find((touch) => touch.assetId === assetId));
  }

  async listTouchesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Touch>("touch", (touch) => touch.workspaceId === workspaceId);
  }

  async listTouchesBySequence(sequenceId: string) {
    return this.listOperatorEntities<Touch>("touch", (touch) => touch.sequenceId === sequenceId);
  }

  async createConversation(input: Omit<Conversation, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Conversation>("conversation", input);
  }

  async updateConversation(id: string, patch: Partial<Omit<Conversation, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>) {
    return this.updateOperatorEntity<Conversation>("conversation", id, patch);
  }

  async findConversationById(id: string) {
    return this.findOperatorEntity<Conversation>("conversation", id);
  }

  async listConversationsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Conversation>("conversation", (conversation) => conversation.workspaceId === workspaceId);
  }

  async createGoal(input: Omit<Goal, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Goal>("goal", input);
  }

  async updateGoal(id: string, patch: Partial<Omit<Goal, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    return this.updateOperatorEntity<Goal>("goal", id, patch);
  }

  async findGoalById(id: string) {
    return this.findOperatorEntity<Goal>("goal", id);
  }

  async listGoalsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Goal>("goal", (goal) => goal.workspaceId === workspaceId);
  }

  async createAttribution(input: Omit<Attribution, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<Attribution>("attribution", input);
  }

  async updateAttribution(id: string, patch: Partial<Omit<Attribution, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>) {
    return this.updateOperatorEntity<Attribution>("attribution", id, patch);
  }

  async findAttributionById(id: string) {
    return this.findOperatorEntity<Attribution>("attribution", id);
  }

  async listAttributionsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Attribution>("attribution", (attribution) => attribution.workspaceId === workspaceId);
  }

  async createLaneRun(input: Omit<LaneRun, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<LaneRun>("lane_run", input);
  }

  async updateLaneRun(id: string, patch: Partial<Omit<LaneRun, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    return this.updateOperatorEntity<LaneRun>("lane_run", id, patch);
  }

  async findLaneRunById(id: string) {
    return this.findOperatorEntity<LaneRun>("lane_run", id);
  }

  async listLaneRunsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<LaneRun>("lane_run", (laneRun) => laneRun.workspaceId === workspaceId);
  }

  async listLaneRunsByLane(workspaceId: string, lane: LaneRun["lane"]) {
    return this.listOperatorEntities<LaneRun>("lane_run", (laneRun) => laneRun.workspaceId === workspaceId && laneRun.lane === lane);
  }

  async createContentCalendarItem(input: Omit<ContentCalendarItem, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<ContentCalendarItem>("content_calendar_item", input);
  }

  async updateContentCalendarItem(
    id: string,
    patch: Partial<Omit<ContentCalendarItem, "id" | "workspaceId" | "brandId" | "laneRunId" | "createdAt">>,
  ) {
    return this.updateOperatorEntity<ContentCalendarItem>("content_calendar_item", id, patch);
  }

  async findContentCalendarItemById(id: string) {
    return this.findOperatorEntity<ContentCalendarItem>("content_calendar_item", id);
  }

  async listContentCalendarItemsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ContentCalendarItem>("content_calendar_item", (item) => item.workspaceId === workspaceId);
  }

  async listContentCalendarItemsByLaneRun(laneRunId: string) {
    return this.listOperatorEntities<ContentCalendarItem>("content_calendar_item", (item) => item.laneRunId === laneRunId);
  }

  async createSocialAsset(input: Omit<SocialAsset, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<SocialAsset>("social_asset", input);
  }

  async updateSocialAsset(id: string, patch: Partial<Omit<SocialAsset, "id" | "workspaceId" | "brandId" | "laneRunId" | "assetId" | "createdAt">>) {
    return this.updateOperatorEntity<SocialAsset>("social_asset", id, patch);
  }

  async findSocialAssetById(id: string) {
    return this.findOperatorEntity<SocialAsset>("social_asset", id);
  }

  async listSocialAssetsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<SocialAsset>("social_asset", (asset) => asset.workspaceId === workspaceId);
  }

  async listSocialAssetsByLaneRun(laneRunId: string) {
    return this.listOperatorEntities<SocialAsset>("social_asset", (asset) => asset.laneRunId === laneRunId);
  }

  async createTopicCluster(input: Omit<TopicCluster, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<TopicCluster>("topic_cluster", input);
  }

  async updateTopicCluster(id: string, patch: Partial<Omit<TopicCluster, "id" | "workspaceId" | "brandId" | "laneRunId" | "createdAt">>) {
    return this.updateOperatorEntity<TopicCluster>("topic_cluster", id, patch);
  }

  async findTopicClusterById(id: string) {
    return this.findOperatorEntity<TopicCluster>("topic_cluster", id);
  }

  async listTopicClustersByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<TopicCluster>("topic_cluster", (cluster) => cluster.workspaceId === workspaceId);
  }

  async listTopicClustersByLaneRun(laneRunId: string) {
    return this.listOperatorEntities<TopicCluster>("topic_cluster", (cluster) => cluster.laneRunId === laneRunId);
  }

  async createEvergreenPage(input: Omit<EvergreenPage, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<EvergreenPage>("evergreen_page", input);
  }

  async updateEvergreenPage(id: string, patch: Partial<Omit<EvergreenPage, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    return this.updateOperatorEntity<EvergreenPage>("evergreen_page", id, patch);
  }

  async findEvergreenPageById(id: string) {
    return this.findOperatorEntity<EvergreenPage>("evergreen_page", id);
  }

  async listEvergreenPagesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<EvergreenPage>("evergreen_page", (page) => page.workspaceId === workspaceId);
  }

  async findEvergreenPageBySlug(workspaceId: string, slug: string) {
    return clone(
      [...this.bucket<EvergreenPage>("evergreen_page").values()].find((page) => page.workspaceId === workspaceId && page.slug === slug),
    );
  }

  async createCampaignBurst(input: Omit<CampaignBurst, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<CampaignBurst>("campaign_burst", input);
  }

  async updateCampaignBurst(
    id: string,
    patch: Partial<Omit<CampaignBurst, "id" | "workspaceId" | "brandId" | "campaignId" | "createdAt">>,
  ) {
    return this.updateOperatorEntity<CampaignBurst>("campaign_burst", id, patch);
  }

  async findCampaignBurstById(id: string) {
    return this.findOperatorEntity<CampaignBurst>("campaign_burst", id);
  }

  async listCampaignBurstsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<CampaignBurst>("campaign_burst", (burst) => burst.workspaceId === workspaceId);
  }

  async createPerformanceSnapshot(input: Omit<PerformanceSnapshot, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<PerformanceSnapshot>("performance_snapshot", input);
  }

  async updatePerformanceSnapshot(
    id: string,
    patch: Partial<Omit<PerformanceSnapshot, "id" | "workspaceId" | "brandId" | "createdAt">>,
  ) {
    return this.updateOperatorEntity<PerformanceSnapshot>("performance_snapshot", id, patch);
  }

  async findPerformanceSnapshotById(id: string) {
    return this.findOperatorEntity<PerformanceSnapshot>("performance_snapshot", id);
  }

  async listPerformanceSnapshotsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<PerformanceSnapshot>("performance_snapshot", (snapshot) => snapshot.workspaceId === workspaceId);
  }

  async createPublishDestination(input: Omit<PublishDestination, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<PublishDestination>("publish_destination", input);
  }

  async updatePublishDestination(
    id: string,
    patch: Partial<Omit<PublishDestination, "id" | "workspaceId" | "brandId" | "createdAt">>,
  ) {
    return this.updateOperatorEntity<PublishDestination>("publish_destination", id, patch);
  }

  async findPublishDestinationById(id: string) {
    return this.findOperatorEntity<PublishDestination>("publish_destination", id);
  }

  async listPublishDestinationsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<PublishDestination>("publish_destination", (destination) => destination.workspaceId === workspaceId);
  }

  async createPublishJob(input: Omit<PublishJob, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<PublishJob>("publish_job", input);
  }

  async updatePublishJob(id: string, patch: Partial<Omit<PublishJob, "id" | "workspaceId" | "brandId" | "destinationId" | "createdAt">>) {
    return this.updateOperatorEntity<PublishJob>("publish_job", id, patch);
  }

  async findPublishJobById(id: string) {
    return this.findOperatorEntity<PublishJob>("publish_job", id);
  }

  async listPublishJobsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<PublishJob>("publish_job", (job) => job.workspaceId === workspaceId);
  }

  async createPublishAttempt(input: Omit<PublishAttempt, "createdAt" | "updatedAt">) {
    return this.createOperatorEntity<PublishAttempt>("publish_attempt", input);
  }

  async updatePublishAttempt(
    id: string,
    patch: Partial<Omit<PublishAttempt, "id" | "workspaceId" | "brandId" | "publishJobId" | "createdAt">>,
  ) {
    return this.updateOperatorEntity<PublishAttempt>("publish_attempt", id, patch);
  }

  async listPublishAttemptsByJob(publishJobId: string) {
    return this.listOperatorEntities<PublishAttempt>("publish_attempt", (attempt) => attempt.publishJobId === publishJobId);
  }

  async ensureSchema() {
    return;
  }
}
