import type { LanguageModelProvider } from "./llm.js";
import {
  createId,
  dedupe,
  isoNow,
  type Asset,
  type Brand,
  type Campaign,
  type CampaignBurst,
  type CampaignBurstType,
  type ChannelType,
  type Claim,
  type ContentCalendarItem,
  type EvergreenPage,
  type EvergreenPageType,
  type GrowthLane,
  type LanePriority,
  type LaneRun,
  type MarketingStore,
  type MemoryProvider,
  type Opportunity,
  type PublishDestination,
  type PublishDestinationKind,
  type PublishJob,
  type Sequence,
  type Signal,
  type SocialAsset,
  type SocialPlatform,
  type SocialVariant,
  type Touch,
  type TopicCluster,
  type Workspace,
  type WorkspaceDashboard,
} from "./domain.js";
import { GtmOperator } from "./gtm-operator.js";
import { buildCritique } from "./scoring.js";
import { approvalStageForAsset, assetStatusFromCritique } from "./state-machine.js";
import { scopeToMemoryType } from "./memory.js";
import {
  buildGitHubContentPath,
  buildWebhookExportPayload,
  destinationKindForChannel,
  GitHubPublishingClient,
  WebhookPublishingClient,
} from "./publishing.js";

interface GrowthOperatorOptions {
  store: MarketingStore;
  memoryProvider: MemoryProvider;
  llmProvider?: LanguageModelProvider;
  githubToken?: string;
  githubAppId?: string;
  githubAppPrivateKey?: string;
  githubAppInstallationId?: string;
  publishUserAgent?: string;
  defaultPublishDestinations?: Array<{
    kind: PublishDestinationKind;
    name: string;
    supportedChannels: ChannelType[];
    config: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }>;
}

interface LaneAssetBlueprint {
  channel: ChannelType;
  sourceLane?: GrowthLane;
  title: string;
  body: string;
  CTA: string;
  claimIds: string[];
  metadata?: Record<string, unknown>;
  social?: {
    platform: SocialPlatform;
    variant: SocialVariant;
    hook: string;
    theme: string;
    scheduledFor?: string | null;
  };
  page?: {
    pageType: EvergreenPageType;
    slug: string;
    summary: string;
    internalLinks: string[];
  };
}

function domainFromUrl(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^www\./i, "");
  } catch {
    return null;
  }
}

function lanePriorityFor(lane: GrowthLane): LanePriority {
  switch (lane) {
    case "outbound":
      return "p0_always_on";
    case "social":
      return "p1_brand_presence";
    case "seo":
      return "p2_compounding";
    case "campaign":
    default:
      return "p3_burst";
  }
}

function laneDescription(lane: GrowthLane) {
  switch (lane) {
    case "outbound":
      return "Founder outreach, replies, follow-ups, and direct distribution.";
    case "social":
      return "Daily and weekly brand presence across founder-native social surfaces.";
    case "seo":
      return "Evergreen pages, topic clusters, compare pages, and search capture.";
    case "campaign":
    default:
      return "Burst orchestration across outbound, social, and SEO at once.";
  }
}

function laneFromChannel(channel: ChannelType): GrowthLane {
  if (channel === "social" || channel === "community" || channel === "reply") return "social";
  if (channel === "seo" || channel === "landing") return "seo";
  return "outbound";
}

function touchTypeForChannel(channel: ChannelType): Touch["touchType"] {
  switch (channel) {
    case "outbound":
      return "email";
    case "reply":
      return "public_reply";
    case "social":
      return "post";
    case "community":
      return "community_post";
    case "landing":
    case "seo":
      return "landing_variant";
    case "partnership":
      return "dm";
  }
}

function campaignTypeForLane(lane: GrowthLane): Campaign["campaignType"] {
  switch (lane) {
    case "social":
      return "founder_social";
    case "seo":
      return "content_engine";
    case "outbound":
      return "partnership_outbound";
    case "campaign":
    default:
      return "other";
  }
}

function burstCampaignType(type: CampaignBurstType): Campaign["campaignType"] {
  switch (type) {
    case "launch":
      return "launch";
    case "integration":
    case "partnership":
      return "partnership_outbound";
    case "benchmark":
      return "competitive_response";
    case "content_repurposing":
      return "content_engine";
    case "feature":
    default:
      return "other";
  }
}

function assetReadyForPublish(asset: Asset) {
  return asset.status === "approved" || asset.status === "approved_with_exceptions";
}

function touchReadyForPublish(touch: Touch) {
  return touch.status === "approved" || touch.status === "approved_with_exceptions";
}

function normalizeRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function uniqueById<T extends { id: string }>(items: T[]) {
  const seen = new Set<string>();
  const output: T[] = [];
  for (const item of items) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    output.push(item);
  }
  return output;
}

function summarizeFit(metadata: Record<string, unknown>) {
  const fit = normalizeRecord(metadata.fitAnalysis);
  const outcomeAngles = Array.isArray(fit.outcomeAngles) ? fit.outcomeAngles.map((item) => String(item)) : [];
  const primaryPain = typeof fit.primaryPainLabel === "string" ? fit.primaryPainLabel : "memory and grounding pain";
  return {
    primaryPain,
    outcome: outcomeAngles[0] ?? "less context rebuilding",
    objections: Array.isArray(fit.objections) ? fit.objections.map((item) => String(item)) : [],
  };
}

function preferredClaimIds(claims: Claim[], wanted: string[]) {
  const byId = new Map(claims.map((claim) => [claim.id, claim] as const));
  const picked = wanted.map((id) => byId.get(id)).filter((claim): claim is Claim => Boolean(claim));
  if (picked.length > 0) return picked;
  return claims.filter((claim) => claim.status === "verified").slice(0, 4);
}

function socialClaimSet(claims: Claim[]) {
  return preferredClaimIds(claims, [
    "retainedb-persistent-memory",
    "retainedb-grounded-docs",
    "retainedb-three-calls",
    "retainedb-any-llm",
    "retainedb-zero-rearchitecting",
    "retainedb-preference-recall-88",
  ]);
}

function seoClaimSet(claims: Claim[]) {
  return preferredClaimIds(claims, [
    "retainedb-persistent-memory",
    "retainedb-grounded-docs",
    "retainedb-any-llm",
    "retainedb-zero-rearchitecting",
    "retainedb-preference-recall-88",
    "retainedb-grounded-docs-zero-hallucination",
  ]);
}

function benchmarkClaimSet(claims: Claim[]) {
  return preferredClaimIds(claims, [
    "retainedb-preference-recall-88",
    "retainedb-overall-accuracy-79",
    "retainedb-grounded-docs-zero-hallucination",
    "retainedb-sub40-p95",
  ]);
}

function integrationClaimSet(claims: Claim[]) {
  return preferredClaimIds(claims, [
    "retainedb-any-llm",
    "retainedb-zero-rearchitecting",
    "retainedb-canonical-memory-api",
    "retainedb-canonical-mcp-surface",
  ]);
}

function sortOpportunities(opportunities: Opportunity[]) {
  return [...opportunities].sort((a, b) => b.score - a.score);
}

function socialStatusForTouch(touch: Touch): SocialAsset["status"] {
  if (touch.status === "approved" || touch.status === "approved_with_exceptions") return "approved";
  if (touch.status === "sent") return "published";
  return touch.status === "needs_revision" ? "draft" : "review_required";
}

function calendarStatusForTouch(touch: Touch): ContentCalendarItem["status"] {
  if (touch.status === "approved" || touch.status === "approved_with_exceptions") return "approved";
  if (touch.status === "sent") return "published";
  return "draft";
}

export class GrowthOperator extends GtmOperator {
  private readonly githubPublisher: GitHubPublishingClient;
  private readonly webhookPublisher: WebhookPublishingClient;
  private readonly defaultPublishDestinations: NonNullable<GrowthOperatorOptions["defaultPublishDestinations"]>;

  constructor(private readonly growthOptions: GrowthOperatorOptions) {
    super(growthOptions);
    this.githubPublisher = new GitHubPublishingClient({
      token: growthOptions.githubToken,
      appId: growthOptions.githubAppId,
      privateKey: growthOptions.githubAppPrivateKey,
      installationId: growthOptions.githubAppInstallationId,
      userAgent: growthOptions.publishUserAgent,
    });
    this.webhookPublisher = new WebhookPublishingClient({
      userAgent: growthOptions.publishUserAgent,
    });
    this.defaultPublishDestinations = growthOptions.defaultPublishDestinations ?? [];
  }

  getLlmProvider() {
    return this.growthOptions.llmProvider ?? null;
  }

  override async ensureDefaultWorkspace(brand: Brand) {
    const workspace = await super.ensureDefaultWorkspace(brand);
    await this.ensureDefaultPublishDestinationsForWorkspace(workspace, brand);
    return workspace;
  }

  override async getWorkspaceDashboard(workspaceId: string): Promise<WorkspaceDashboard> {
    const base = await super.getWorkspaceDashboard(workspaceId);
    const [laneRuns, touches, pages] = await Promise.all([
      this.options.store.listLaneRunsByWorkspace(workspaceId),
      this.options.store.listTouchesByWorkspace(workspaceId),
      this.options.store.listEvergreenPagesByWorkspace(workspaceId),
    ]);
    const summary = (["outbound", "social", "seo", "campaign"] as GrowthLane[]).map((lane) => {
      const recentRun = [...laneRuns].reverse().find((item) => item.lane === lane) ?? null;
      const pendingTouches = touches.filter(
        (touch) =>
          (touch.lane ?? laneFromChannel(touch.channel)) === lane &&
          (touch.status === "review_required" || touch.status === "needs_revision"),
      ).length;
      const pendingPages = lane === "seo" ? pages.filter((page) => page.state === "draft" || page.state === "stale").length : 0;
      return {
        lane,
        priority: lanePriorityFor(lane),
        pendingCount: pendingTouches + pendingPages,
        recentRunId: recentRun?.id ?? null,
      };
    });
    return {
      ...base,
      lanes: {
        summary,
      },
    };
  }

  async listLanes(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    const dashboard = await this.getWorkspaceDashboard(workspaceId);
    const summary = dashboard.lanes?.summary ?? [];
    return summary.map((item) => ({
      lane: item.lane,
      priority: item.priority,
      description: laneDescription(item.lane),
      pendingCount: item.pendingCount,
      recentRunId: item.recentRunId ?? null,
    }));
  }

  async listLaneRuns(workspaceId: string, lane?: GrowthLane) {
    await this.requireWorkspace(workspaceId);
    return lane ? this.options.store.listLaneRunsByLane(workspaceId, lane) : this.options.store.listLaneRunsByWorkspace(workspaceId);
  }

  async runLane(input: { workspaceId: string; lane: GrowthLane; priority?: LanePriority; trigger?: string; maxItems?: number; focus?: string }) {
    switch (input.lane) {
      case "outbound":
        return this.runOutboundLane(input);
      case "social":
        return this.generateSocialCalendar({
          workspaceId: input.workspaceId,
          count: input.maxItems,
          focus: input.focus,
          priority: input.priority,
          trigger: input.trigger,
        });
      case "seo":
        return this.generateSeoPages({
          workspaceId: input.workspaceId,
          count: input.maxItems,
          focus: input.focus,
          priority: input.priority,
          trigger: input.trigger,
        });
      case "campaign":
      default:
        return this.createCampaignBurst({
          workspaceId: input.workspaceId,
          burstType: "launch",
          brief: input.focus ?? "Run a multi-lane growth burst.",
          priority: input.priority,
          trigger: input.trigger,
        });
    }
  }

  async generateSocialCalendar(input: {
    workspaceId: string;
    count?: number;
    focus?: string;
    priority?: LanePriority;
    trigger?: string;
  }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const [claims, opportunities] = await Promise.all([
      this.options.store.listClaimsByBrand(brand.id),
      this.options.store.listOpportunitiesByWorkspace(workspace.id),
    ]);
    const socialClaims = socialClaimSet(claims);
    const blueprints = this.buildSocialBlueprints({
      brand,
      workspace,
      opportunities: sortOpportunities(opportunities),
      claims: socialClaims,
      count: Math.max(1, Math.min(30, input.count ?? 4)),
      focus: input.focus,
    });

    const context = await this.createLaneContext({
      workspace,
      brand,
      lane: "social",
      priority: input.priority ?? lanePriorityFor("social"),
      title: "Social Presence Queue",
      summary: "Daily and weekly brand presence outputs.",
      trigger: input.trigger ?? "social_calendar_generate",
    });

    const materialized = await this.materializeLaneAssets({
      workspace,
      brand,
      claims: socialClaims,
      lane: "social",
      sourceLane: "social",
      laneRun: context.laneRun,
      campaign: context.campaign,
      run: context.run,
      playbookType: "launch_amplification",
      title: "Social presence queue",
      summary: "Proof-first posts and community-native variants.",
      goal: "awareness",
      blueprints,
    });

    const calendarItems: ContentCalendarItem[] = [];
    const socialAssets: SocialAsset[] = [];
    for (let index = 0; index < blueprints.length; index += 1) {
      const blueprint = blueprints[index]!;
      const asset = materialized.assets[index]!;
      const touch = materialized.touches[index]!;
      const social = blueprint.social;
      if (!social) continue;
      const calendarItem = await this.options.store.createContentCalendarItem({
        id: createId("calendar"),
        workspaceId: workspace.id,
        brandId: brand.id,
        laneRunId: context.laneRun.id,
        platform: social.platform,
        variant: social.variant,
        title: asset.title,
        hook: social.hook,
        theme: social.theme,
        scheduledFor: social.scheduledFor ?? null,
        status: calendarStatusForTouch(touch),
        claimIds: asset.claimIds,
        assetIds: [asset.id],
        metadata: {
          touchId: touch.id,
          assetId: asset.id,
          lane: "social",
        },
      });
      const socialAsset = await this.options.store.createSocialAsset({
        id: createId("social_asset"),
        workspaceId: workspace.id,
        brandId: brand.id,
        laneRunId: context.laneRun.id,
        calendarItemId: calendarItem.id,
        assetId: asset.id,
        touchId: touch.id,
        platform: social.platform,
        variant: social.variant,
        title: asset.title,
        body: asset.body,
        claimIds: asset.claimIds,
        status: socialStatusForTouch(touch),
        metadata: {
          hook: social.hook,
          theme: social.theme,
        },
      });
      calendarItems.push(calendarItem);
      socialAssets.push(socialAsset);
    }

    await this.finalizeLaneRun(context.laneRun.id, {
      generatedEntityIds: [
        materialized.sequence.id,
        ...materialized.assets.map((item) => item.id),
        ...materialized.touches.map((item) => item.id),
        ...calendarItems.map((item) => item.id),
        ...socialAssets.map((item) => item.id),
      ],
      runId: context.run.id,
      campaignId: context.campaign.id,
    });

    await this.recordLaneLearning({
      brand,
      workspace,
      lane: "social",
      title: "Social queue generated",
      summary: `Generated ${socialAssets.length} social assets for brand presence.`,
      metrics: {
        assetCount: socialAssets.length,
        platformCount: dedupe(calendarItems.map((item) => item.platform)).length,
      },
      learnings: dedupe(calendarItems.map((item) => `${item.platform}:${item.theme}`)),
    });

    return {
      laneRun: await this.options.store.findLaneRunById(context.laneRun.id),
      sequence: materialized.sequence,
      calendarItems,
      socialAssets,
    };
  }

  async listSocialAssets(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    return this.options.store.listSocialAssetsByWorkspace(workspaceId);
  }

  async generateSocialReplies(input: { workspaceId: string; maxItems?: number; signalIds?: string[]; trigger?: string }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const [claims, signals, opportunities] = await Promise.all([
      this.options.store.listClaimsByBrand(brand.id),
      this.options.store.listSignalsByWorkspace(workspace.id),
      this.options.store.listOpportunitiesByWorkspace(workspace.id),
    ]);
    const selectedSignals = (input.signalIds?.length
      ? signals.filter((signal) => input.signalIds!.includes(signal.id))
      : signals.filter((signal) => ["x", "linkedin", "reddit", "hacker_news", "github"].includes(signal.source)))
      .slice(0, Math.max(1, Math.min(30, input.maxItems ?? 3)));
    const blueprintSignals =
      selectedSignals.length > 0
        ? selectedSignals
        : sortOpportunities(opportunities)
            .slice(0, 3)
            .map((opportunity) => signals.find((signal) => signal.id === opportunity.signalId))
            .filter((signal): signal is Signal => Boolean(signal));
    const socialClaims = socialClaimSet(claims);

    const blueprints: LaneAssetBlueprint[] = blueprintSignals.map((signal) => {
      const fit = summarizeFit(signal.metadata);
      const isCommunity = signal.source === "reddit" || signal.source === "hacker_news";
      const platform: SocialPlatform = isCommunity ? "community" : signal.source === "linkedin" ? "linkedin" : "x";
      const channel: ChannelType = isCommunity ? "community" : "reply";
      return {
        channel,
        sourceLane: "social",
        title: `${signal.title}: reply angle`,
        body: [
          "Your users remember. Your AI should too.",
          `The pain here is ${fit.primaryPain.toLowerCase()}.`,
          `RetainDB gives teams ${fit.outcome}.`,
          `Measured proof matters. ${socialClaims.map((claim) => claim.text).slice(0, 2).join(" ")}`,
          "If useful, I can share the proof pack.",
          `Claims: ${socialClaims.map((claim) => claim.id).join(", ")}`,
        ].join("\n\n"),
        CTA: "Share the proof pack",
        claimIds: socialClaims.map((claim) => claim.id),
        metadata: {
          signalId: signal.id,
          signalSource: signal.source,
          accountName: signal.metadata.accountName ?? null,
        },
        social: {
          platform,
          variant: "reply_bank",
          hook: fit.primaryPain,
          theme: signal.title,
          scheduledFor: null,
        },
      };
    });

    const context = await this.createLaneContext({
      workspace,
      brand,
      lane: "social",
      priority: "p0_always_on",
      title: "Reply Bank",
      summary: "Reply suggestions tied to live signals.",
      trigger: input.trigger ?? "social_replies_generate",
    });

    const materialized = await this.materializeLaneAssets({
      workspace,
      brand,
      claims: socialClaims,
      lane: "social",
      sourceLane: "social",
      laneRun: context.laneRun,
      campaign: context.campaign,
      run: context.run,
      playbookType: "founder_reply_assist",
      title: "Reply bank",
      summary: "Founder-native replies and community response drafts.",
      goal: "conversations",
      blueprints,
    });

    const socialAssets: SocialAsset[] = [];
    for (let index = 0; index < blueprints.length; index += 1) {
      const blueprint = blueprints[index]!;
      const asset = materialized.assets[index]!;
      const touch = materialized.touches[index]!;
      if (!blueprint.social) continue;
      socialAssets.push(
        await this.options.store.createSocialAsset({
          id: createId("social_asset"),
          workspaceId: workspace.id,
          brandId: brand.id,
          laneRunId: context.laneRun.id,
          calendarItemId: null,
          assetId: asset.id,
          touchId: touch.id,
          platform: blueprint.social.platform,
          variant: blueprint.social.variant,
          title: asset.title,
          body: asset.body,
          claimIds: asset.claimIds,
          status: socialStatusForTouch(touch),
          metadata: {
            hook: blueprint.social.hook,
            theme: blueprint.social.theme,
          },
        }),
      );
    }

    await this.finalizeLaneRun(context.laneRun.id, {
      generatedEntityIds: [
        materialized.sequence.id,
        ...materialized.assets.map((item) => item.id),
        ...materialized.touches.map((item) => item.id),
        ...socialAssets.map((item) => item.id),
      ],
      runId: context.run.id,
      campaignId: context.campaign.id,
    });

    return {
      laneRun: await this.options.store.findLaneRunById(context.laneRun.id),
      sequence: materialized.sequence,
      socialAssets,
    };
  }

  async generateTopicClusters(input: { workspaceId: string; count?: number; focus?: string; priority?: LanePriority; trigger?: string }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const [claims, opportunities, signals, pages] = await Promise.all([
      this.options.store.listClaimsByBrand(brand.id),
      this.options.store.listOpportunitiesByWorkspace(workspace.id),
      this.options.store.listSignalsByWorkspace(workspace.id),
      this.options.store.listEvergreenPagesByWorkspace(workspace.id),
    ]);

    const context = await this.createLaneContext({
      workspace,
      brand,
      lane: "seo",
      priority: input.priority ?? lanePriorityFor("seo"),
      title: "SEO topic planning",
      summary: "Topic clusters for compare, use-case, integration, and benchmark pages.",
      trigger: input.trigger ?? "seo_topic_cluster_generate",
    });

    const clusters = this.planTopicClusters({
      workspace,
      claims: seoClaimSet(claims),
      opportunities: sortOpportunities(opportunities),
      signals,
      existingPages: pages,
      count: Math.max(1, Math.min(8, input.count ?? 4)),
      focus: input.focus,
    });

    const created: TopicCluster[] = [];
    for (const cluster of clusters) {
      created.push(
        await this.options.store.createTopicCluster({
          id: createId("cluster"),
          workspaceId: workspace.id,
          brandId: brand.id,
          laneRunId: context.laneRun.id,
          title: cluster.title,
          summary: cluster.summary,
          primaryPain: cluster.primaryPain,
          targetKeywords: cluster.targetKeywords,
          pageIdeas: cluster.pageIdeas,
          internalLinks: cluster.internalLinks,
          claimIds: cluster.claimIds,
          status: "draft",
          metadata: cluster.metadata,
        }),
      );
    }

    await this.options.store.updateRun(context.run.id, {
      status: "completed",
      currentStep: "completed",
      summary: {
        workspaceId: workspace.id,
        lane: "seo",
        topicClusterCount: created.length,
      },
      finishedAt: isoNow(),
    });

    await this.finalizeLaneRun(context.laneRun.id, {
      generatedEntityIds: created.map((item) => item.id),
      runId: context.run.id,
      campaignId: context.campaign.id,
    });

    await this.recordLaneLearning({
      brand,
      workspace,
      lane: "seo",
      title: "SEO clusters planned",
      summary: `Planned ${created.length} topic clusters.`,
      metrics: {
        clusterCount: created.length,
      },
      learnings: created.map((cluster) => cluster.title),
    });

    return {
      laneRun: await this.options.store.findLaneRunById(context.laneRun.id),
      topicClusters: created,
    };
  }

  async listTopicClusters(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    return this.options.store.listTopicClustersByWorkspace(workspaceId);
  }

  async listEvergreenPages(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    return this.options.store.listEvergreenPagesByWorkspace(workspaceId);
  }

  async generateSeoPages(input: {
    workspaceId: string;
    clusterId?: string;
    pageType?: EvergreenPageType;
    count?: number;
    focus?: string;
    priority?: LanePriority;
    trigger?: string;
    campaignBurstId?: string | null;
    campaignId?: string | null;
  }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const claims = seoClaimSet(await this.options.store.listClaimsByBrand(brand.id));
    const existingClusters = await this.options.store.listTopicClustersByWorkspace(workspace.id);
    const clusters =
      input.clusterId
        ? existingClusters.filter((cluster) => cluster.id === input.clusterId)
        : existingClusters.slice(0, Math.max(1, Math.min(6, input.count ?? 3)));

    const selectedClusters =
      clusters.length > 0
        ? clusters
        : (
            await this.generateTopicClusters({
              workspaceId: workspace.id,
              count: input.count ?? 3,
              focus: input.focus,
              priority: input.priority ?? lanePriorityFor("seo"),
              trigger: "seo_page_autoplan",
            })
          ).topicClusters;

    const context = await this.createLaneContext({
      workspace,
      brand,
      lane: "seo",
      priority: input.priority ?? lanePriorityFor("seo"),
      title: "SEO page drafting",
      summary: "Draft evergreen pages from topic clusters.",
      trigger: input.trigger ?? "seo_page_generate",
      campaignId: input.campaignId ?? null,
    });

    const blueprints = this.buildSeoPageBlueprints({
      brand,
      claims,
      clusters: selectedClusters,
      pageType: input.pageType,
      campaignBurstId: input.campaignBurstId ?? null,
    });

    const materialized = await this.materializeLaneAssets({
      workspace,
      brand,
      claims,
      lane: "seo",
      sourceLane: "seo",
      laneRun: context.laneRun,
      campaign: context.campaign,
      run: context.run,
      playbookType: "benchmark_proof_push",
      title: "SEO page queue",
      summary: "Evergreen drafts for compare, use-case, benchmark, and integration pages.",
      goal: "search_capture",
      blueprints,
      campaignBurstId: input.campaignBurstId ?? null,
    });

    const pages: EvergreenPage[] = [];
    for (let index = 0; index < blueprints.length; index += 1) {
      const blueprint = blueprints[index]!;
      const asset = materialized.assets[index]!;
      const touch = materialized.touches[index]!;
      if (!blueprint.page) continue;
      const existing = await this.options.store.findEvergreenPageBySlug(workspace.id, blueprint.page.slug);
      const payload: Omit<EvergreenPage, "createdAt" | "updatedAt"> = {
        id: existing?.id ?? createId("page"),
        workspaceId: workspace.id,
        brandId: brand.id,
        laneRunId: context.laneRun.id,
        topicClusterId: selectedClusters[index]?.id ?? null,
        campaignBurstId: input.campaignBurstId ?? null,
        assetId: asset.id,
        touchId: touch.id,
        pageType: blueprint.page.pageType,
        state: touch.status === "approved" || touch.status === "approved_with_exceptions" ? "approved" : "draft",
        slug: blueprint.page.slug,
        title: asset.title,
        summary: blueprint.page.summary,
        body: asset.body,
        claimIds: asset.claimIds,
        internalLinks: blueprint.page.internalLinks,
        metadata: {
          lane: "seo",
          sourceLane: blueprint.sourceLane ?? "seo",
        },
      };
      pages.push(existing ? (await this.options.store.updateEvergreenPage(existing.id, payload)) ?? existing : await this.options.store.createEvergreenPage(payload));
    }

    await this.finalizeLaneRun(context.laneRun.id, {
      generatedEntityIds: [
        materialized.sequence.id,
        ...materialized.assets.map((item) => item.id),
        ...materialized.touches.map((item) => item.id),
        ...pages.map((item) => item.id),
      ],
      runId: context.run.id,
      campaignId: context.campaign.id,
    });

    return {
      laneRun: await this.options.store.findLaneRunById(context.laneRun.id),
      sequence: materialized.sequence,
      pages,
    };
  }

  async syncSeoInventory(input: {
    workspaceId: string;
    pages?: Array<{
      slug: string;
      title: string;
      pageType?: EvergreenPageType;
      summary?: string;
      url?: string | null;
      state?: EvergreenPage["state"];
    }>;
  }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    if (!input.pages || input.pages.length === 0) {
      return {
        pages: await this.options.store.listEvergreenPagesByWorkspace(workspace.id),
      };
    }

    const synced: EvergreenPage[] = [];
    for (const page of input.pages) {
      const existing = await this.options.store.findEvergreenPageBySlug(workspace.id, page.slug);
      const payload: Omit<EvergreenPage, "createdAt" | "updatedAt"> = {
        id: existing?.id ?? createId("page"),
        workspaceId: workspace.id,
        brandId: brand.id,
        laneRunId: existing?.laneRunId ?? null,
        topicClusterId: existing?.topicClusterId ?? null,
        campaignBurstId: existing?.campaignBurstId ?? null,
        assetId: existing?.assetId ?? null,
        touchId: existing?.touchId ?? null,
        pageType: page.pageType ?? existing?.pageType ?? "docs_adjacent",
        state: page.state ?? "existing",
        slug: page.slug,
        title: page.title,
        summary: page.summary ?? existing?.summary ?? page.title,
        body: existing?.body ?? "",
        claimIds: existing?.claimIds ?? [],
        internalLinks: existing?.internalLinks ?? [],
        metadata: {
          ...(existing?.metadata ?? {}),
          url: page.url ?? null,
          inventorySyncedAt: isoNow(),
        },
      };
      synced.push(existing ? (await this.options.store.updateEvergreenPage(existing.id, payload)) ?? existing : await this.options.store.createEvergreenPage(payload));
    }

    return { pages: synced };
  }

  async createCampaignBurst(input: {
    workspaceId: string;
    burstType: CampaignBurstType;
    name?: string;
    goal?: string;
    brief: string;
    priority?: LanePriority;
    trigger?: string;
  }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const claims = await this.options.store.listClaimsByBrand(brand.id);

    const campaign = await this.options.store.createCampaign({
      id: createId("campaign"),
      brandId: brand.id,
      name: input.name ?? `${workspace.name}: ${input.burstType.replace(/_/g, " ")}`,
      goal: input.goal ?? "Drive awareness, conversations, and proof-led follow-up.",
      campaignType: burstCampaignType(input.burstType),
      targetPersonas: [workspace.primaryIcp],
      channels: ["outbound", "social", "reply", "community", "seo", "landing"],
      brief: input.brief,
      constraints: ["Approval before publish", "Approval before send"],
      status: "draft",
      lane: "campaign",
      sourceLane: "campaign",
      campaignBurstId: null,
      publishMetadata: null,
      metadata: {
        kind: "growth_campaign_burst",
        workspaceId: workspace.id,
        burstType: input.burstType,
      },
    });

    const context = await this.createLaneContext({
      workspace,
      brand,
      lane: "campaign",
      priority: input.priority ?? lanePriorityFor("campaign"),
      title: `${input.burstType} burst`,
      summary: input.brief,
      trigger: input.trigger ?? `campaign_${input.burstType}`,
      campaignId: campaign.id,
    });

    const burst = await this.options.store.createCampaignBurst({
      id: createId("burst"),
      workspaceId: workspace.id,
      brandId: brand.id,
      campaignId: campaign.id,
      laneRunId: context.laneRun.id,
      burstType: input.burstType,
      name: campaign.name,
      goal: campaign.goal,
      brief: input.brief,
      lanes: ["outbound", "social", "seo"],
      status: "draft",
      proofClaimIds: this.claimsForBurst(input.burstType, claims).map((claim) => claim.id),
      generatedEntityIds: [],
      metadata: {
        trigger: context.laneRun.trigger,
      },
    });

    await this.options.store.updateCampaign(campaign.id, {
      campaignBurstId: burst.id,
      metadata: {
        ...campaign.metadata,
        campaignBurstId: burst.id,
      },
    });

    const burstBlueprints = this.buildCampaignBurstBlueprints({
      brand,
      workspace,
      burstType: input.burstType,
      claims,
      brief: input.brief,
      campaignBurstId: burst.id,
    });

    const materialized = await this.materializeLaneAssets({
      workspace,
      brand,
      claims: uniqueById([...benchmarkClaimSet(claims), ...socialClaimSet(claims), ...seoClaimSet(claims)]),
      lane: "campaign",
      sourceLane: "campaign",
      laneRun: context.laneRun,
      campaign,
      run: context.run,
      playbookType: input.burstType === "integration" || input.burstType === "partnership" ? "integration_outreach" : "launch_amplification",
      title: `${input.burstType} burst`,
      summary: input.brief,
      goal: campaign.goal,
      blueprints: burstBlueprints,
      campaignBurstId: burst.id,
    });

    const socialAssets: SocialAsset[] = [];
    const pages: EvergreenPage[] = [];
    for (let index = 0; index < burstBlueprints.length; index += 1) {
      const blueprint = burstBlueprints[index]!;
      const asset = materialized.assets[index]!;
      const touch = materialized.touches[index]!;
      if (blueprint.social) {
        socialAssets.push(
          await this.options.store.createSocialAsset({
            id: createId("social_asset"),
            workspaceId: workspace.id,
            brandId: brand.id,
            laneRunId: context.laneRun.id,
            calendarItemId: null,
            assetId: asset.id,
            touchId: touch.id,
            platform: blueprint.social.platform,
            variant: blueprint.social.variant,
            title: asset.title,
            body: asset.body,
            claimIds: asset.claimIds,
            status: socialStatusForTouch(touch),
            metadata: {
              hook: blueprint.social.hook,
              theme: blueprint.social.theme,
              campaignBurstId: burst.id,
            },
          }),
        );
      }
      if (blueprint.page) {
        pages.push(
          await this.options.store.createEvergreenPage({
            id: createId("page"),
            workspaceId: workspace.id,
            brandId: brand.id,
            laneRunId: context.laneRun.id,
            topicClusterId: null,
            campaignBurstId: burst.id,
            assetId: asset.id,
            touchId: touch.id,
            pageType: blueprint.page.pageType,
            state: touch.status === "approved" || touch.status === "approved_with_exceptions" ? "approved" : "draft",
            slug: blueprint.page.slug,
            title: asset.title,
            summary: blueprint.page.summary,
            body: asset.body,
            claimIds: asset.claimIds,
            internalLinks: blueprint.page.internalLinks,
            metadata: {
              lane: "campaign",
              sourceLane: blueprint.sourceLane ?? "seo",
            },
          }),
        );
      }
    }

    const generatedEntityIds = [
      materialized.sequence.id,
      ...materialized.assets.map((item) => item.id),
      ...materialized.touches.map((item) => item.id),
      ...socialAssets.map((item) => item.id),
      ...pages.map((item) => item.id),
    ];
    await this.options.store.updateCampaignBurst(burst.id, {
      generatedEntityIds,
    });
    await this.finalizeLaneRun(context.laneRun.id, {
      generatedEntityIds: [burst.id, ...generatedEntityIds],
      runId: context.run.id,
      campaignId: campaign.id,
    });

    return {
      laneRun: await this.options.store.findLaneRunById(context.laneRun.id),
      campaignBurst: await this.options.store.findCampaignBurstById(burst.id),
      sequence: materialized.sequence,
      socialAssets,
      pages,
    };
  }

  async listCampaignBursts(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    return this.options.store.listCampaignBurstsByWorkspace(workspaceId);
  }

  async getCampaignBurst(id: string) {
    const burst = await this.options.store.findCampaignBurstById(id);
    if (!burst) throw new Error(`Campaign burst not found: ${id}`);
    return burst;
  }

  async createPublishDestination(input: {
    workspaceId: string;
    kind: PublishDestinationKind;
    name: string;
    supportedChannels: ChannelType[];
    config: Record<string, unknown>;
    metadata?: Record<string, unknown>;
  }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    this.validatePublishDestination(input.kind, input.config);
    return this.options.store.createPublishDestination({
      id: createId("destination"),
      workspaceId: workspace.id,
      brandId: brand.id,
      kind: input.kind,
      name: input.name,
      supportedChannels: dedupe(input.supportedChannels),
      config: input.config,
      metadata: input.metadata ?? {},
    });
  }

  async listPublishDestinations(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    return this.options.store.listPublishDestinationsByWorkspace(workspaceId);
  }

  async publishAsset(input: { assetId: string; destinationId?: string }) {
    const asset = await this.requireAsset(input.assetId);
    if (!assetReadyForPublish(asset)) {
      throw new Error(`Asset ${asset.id} is not approved for publishing.`);
    }
    const touch = await this.options.store.findTouchByAssetId(asset.id);
    return this.executePublish({
      asset,
      touch,
      destinationId: input.destinationId,
      entityType: "asset",
    });
  }

  async publishTouch(input: { touchId: string; destinationId?: string }) {
    const touch = await this.requireTouch(input.touchId);
    if (!touchReadyForPublish(touch)) {
      throw new Error(`Touch ${touch.id} is not approved for publishing.`);
    }
    const asset = await this.requireAsset(touch.assetId);
    return this.executePublish({
      asset,
      touch,
      destinationId: input.destinationId,
      entityType: "touch",
    });
  }

  async listPublishJobs(workspaceId: string) {
    await this.requireWorkspace(workspaceId);
    return this.options.store.listPublishJobsByWorkspace(workspaceId);
  }

  private async runOutboundLane(input: { workspaceId: string; priority?: LanePriority; trigger?: string; maxItems?: number }) {
    const workspace = await this.requireWorkspace(input.workspaceId);
    const brand = await this.requireBrand(workspace.brandId);
    const [opportunities, sequences, signals] = await Promise.all([
      this.options.store.listOpportunitiesByWorkspace(workspace.id),
      this.options.store.listSequencesByWorkspace(workspace.id),
      this.options.store.listSignalsByWorkspace(workspace.id),
    ]);
    const existingOpportunityIds = new Set(sequences.map((sequence) => sequence.opportunityId).filter(Boolean));
    const top = sortOpportunities(opportunities)
      .filter((opportunity) => opportunity.stage === "signal" && !existingOpportunityIds.has(opportunity.id))
      .slice(0, Math.max(1, Math.min(6, input.maxItems ?? 3)));

    const laneRun = await this.options.store.createLaneRun({
      id: createId("lane_run"),
      workspaceId: workspace.id,
      brandId: brand.id,
      lane: "outbound",
      priority: input.priority ?? lanePriorityFor("outbound"),
      status: "running",
      title: "Outbound queue",
      summary: "Generate direct distribution sequences from the highest-signal opportunities.",
      trigger: input.trigger ?? "outbound_lane_run",
      runId: null,
      campaignId: null,
      generatedEntityIds: [],
      metadata: {},
      startedAt: isoNow(),
      finishedAt: null,
    });

    const generatedSequences: Sequence[] = [];
    const generatedIds: string[] = [];
    for (const opportunity of top) {
      const signal = signals.find((item) => item.id === opportunity.signalId);
      if (!signal || !opportunity.accountId) continue;
      const account = await this.options.store.findProspectAccountById(opportunity.accountId);
      if (!account) continue;
      const person = opportunity.personId ? await this.options.store.findProspectPersonById(opportunity.personId) : null;
      const sequence = await this.generateSequence(workspace, brand, account, person ?? null, signal, opportunity, {
        lane: "outbound",
        sourceLane: "outbound",
        laneRunId: laneRun.id,
        sequenceTitle: `${account.name}: outbound queue`,
      });
      generatedSequences.push(sequence);
      generatedIds.push(sequence.id, ...sequence.touchIds);
    }

    await this.finalizeLaneRun(laneRun.id, {
      generatedEntityIds: generatedIds,
      runId: generatedSequences[0]?.runId ?? null,
      campaignId: generatedSequences[0]?.campaignId ?? null,
      status: generatedSequences.length > 0 ? "completed" : "blocked",
    });

    return {
      laneRun: await this.options.store.findLaneRunById(laneRun.id),
      sequences: generatedSequences,
    };
  }

  private async createLaneContext(input: {
    workspace: Workspace;
    brand: Brand;
    lane: GrowthLane;
    priority: LanePriority;
    title: string;
    summary: string;
    trigger: string;
    campaignId?: string | null;
  }) {
    const existingCampaign = input.campaignId ? await this.options.store.findCampaignById(input.campaignId) : null;
    const campaign = existingCampaign ?? (await this.ensureLaneCampaign(input.workspace, input.brand, input.lane, input.title, input.summary));

    const run = await this.options.store.createRun({
      id: createId("run"),
      brandId: input.brand.id,
      campaignId: campaign.id,
      status: "drafting",
      approvalStage: "WAITING_FOR_MESSAGE_APPROVAL",
      currentStep: "drafting",
      summary: {
        workspaceId: input.workspace.id,
        lane: input.lane,
        trigger: input.trigger,
      },
      metadata: {
        growthOperator: true,
        lane: input.lane,
        priority: input.priority,
        workspaceId: input.workspace.id,
      },
      startedAt: isoNow(),
      finishedAt: null,
      error: null,
    });

    const laneRun = await this.options.store.createLaneRun({
      id: createId("lane_run"),
      workspaceId: input.workspace.id,
      brandId: input.brand.id,
      lane: input.lane,
      priority: input.priority,
      status: "running",
      title: input.title,
      summary: input.summary,
      trigger: input.trigger,
      runId: run.id,
      campaignId: campaign.id,
      generatedEntityIds: [],
      metadata: {},
      startedAt: isoNow(),
      finishedAt: null,
    });

    return { campaign, run, laneRun };
  }

  private async ensureLaneCampaign(workspace: Workspace, brand: Brand, lane: GrowthLane, title: string, summary: string) {
    const campaigns = await this.options.store.listCampaignsByBrand(brand.id);
    const existing = campaigns.find(
      (campaign) => campaign.metadata.kind === "growth_lane" && campaign.metadata.workspaceId === workspace.id && campaign.metadata.lane === lane,
    );
    if (existing) return existing;

    return this.options.store.createCampaign({
      id: createId("campaign"),
      brandId: brand.id,
      name: `${workspace.name}: ${title}`,
      goal: summary,
      campaignType: campaignTypeForLane(lane),
      targetPersonas: [workspace.primaryIcp],
      channels:
        lane === "outbound"
          ? ["outbound", "reply", "partnership", "landing"]
          : lane === "social"
            ? ["social", "reply", "community"]
            : lane === "seo"
              ? ["seo", "landing"]
              : ["outbound", "social", "reply", "community", "seo", "landing"],
      brief: summary,
      constraints: ["Approval before external action", "Claim-grounded outputs only"],
      status: "draft",
      lane,
      sourceLane: lane,
      campaignBurstId: null,
      publishMetadata: null,
      metadata: {
        kind: "growth_lane",
        workspaceId: workspace.id,
        lane,
      },
    });
  }

  private async materializeLaneAssets(input: {
    workspace: Workspace;
    brand: Brand;
    claims: Claim[];
    lane: GrowthLane;
    sourceLane: GrowthLane;
    laneRun: LaneRun;
    campaign: Campaign;
    run: { id: string };
    playbookType: Sequence["playbookType"];
    title: string;
    summary: string;
    goal: string;
    blueprints: LaneAssetBlueprint[];
    campaignBurstId?: string | null;
  }) {
    const sequence = await this.options.store.createSequence({
      id: createId("sequence"),
      workspaceId: input.workspace.id,
      brandId: input.brand.id,
      accountId: null,
      personId: null,
      opportunityId: null,
      lane: input.lane,
      sourceLane: input.sourceLane,
      campaignBurstId: input.campaignBurstId ?? null,
      playbookType: input.playbookType,
      status: "review_required",
      title: input.title,
      summary: input.summary,
      goal: input.goal,
      touchIds: [],
      runId: input.run.id,
      campaignId: input.campaign.id,
      metadata: {
        laneRunId: input.laneRun.id,
      },
    });

    const assets: Asset[] = [];
    const touches: Touch[] = [];
    for (const blueprint of input.blueprints) {
      const asset = await this.options.store.createAsset({
        id: createId("asset"),
        brandId: input.brand.id,
        campaignId: input.campaign.id,
        runId: input.run.id,
        channel: blueprint.channel,
        persona: input.workspace.primaryIcp,
        title: blueprint.title,
        body: blueprint.body,
        claimIds: blueprint.claimIds,
        status: "draft",
        approvalStage: approvalStageForAsset(blueprint.channel),
        lane: input.lane,
        sourceLane: blueprint.sourceLane ?? input.sourceLane,
        campaignBurstId: input.campaignBurstId ?? null,
        publicationStatus: null,
        publishMetadata: null,
        metadata: {
          ...(blueprint.metadata ?? {}),
          laneRunId: input.laneRun.id,
          workspaceId: input.workspace.id,
          CTA: blueprint.CTA,
          appliedQualifiers: input.claims.flatMap((claim) => claim.requiredQualifiers.map((item) => item.toLowerCase())),
          playbookType: input.playbookType,
        },
      });
      const critique = buildCritique({
        brand: input.brand,
        asset,
        claims: input.claims,
        peerAssets: assets,
      });
      await this.options.store.createCritique(critique);
      const nextAssetStatus = assetStatusFromCritique(critique);
      const updatedAsset =
        (await this.options.store.updateAsset(asset.id, {
          status: nextAssetStatus,
          metadata: {
            ...asset.metadata,
            critiqueId: critique.id,
            critiqueScore: critique.score,
            blockingIssues: critique.blockingIssues,
            warnings: critique.warnings,
          },
        })) ?? asset;
      assets.push(updatedAsset);

      const touch = await this.options.store.createTouch({
        id: createId("touch"),
        workspaceId: input.workspace.id,
        brandId: input.brand.id,
        sequenceId: sequence.id,
        assetId: asset.id,
        channel: blueprint.channel,
        touchType: touchTypeForChannel(blueprint.channel),
        status: nextAssetStatus === "needs_revision" ? "needs_revision" : "review_required",
        title: blueprint.title,
        body: blueprint.body,
        CTA: blueprint.CTA,
        claimIds: blueprint.claimIds,
        lane: input.lane,
        sourceLane: blueprint.sourceLane ?? input.sourceLane,
        campaignBurstId: input.campaignBurstId ?? null,
        publicationStatus: null,
        publishMetadata: null,
        metadata: {
          ...(blueprint.metadata ?? {}),
          laneRunId: input.laneRun.id,
        },
      });
      touches.push(touch);
    }

    const updatedSequence =
      (await this.options.store.updateSequence(sequence.id, {
      touchIds: touches.map((item) => item.id),
      status: touches.some((touch) => touch.status === "needs_revision") ? "needs_revision" : "review_required",
      })) ?? sequence;
    await this.options.store.updateRun(input.run.id, {
      status: "awaiting_human_review",
      approvalStage: "WAITING_FOR_MESSAGE_APPROVAL",
      currentStep: "awaiting_human_review",
      summary: {
        workspaceId: input.workspace.id,
        lane: input.lane,
        touchCount: touches.length,
      },
    });

    return { sequence: updatedSequence, assets, touches };
  }

  private buildSocialBlueprints(input: {
    brand: Brand;
    workspace: Workspace;
    opportunities: Opportunity[];
    claims: Claim[];
    count: number;
    focus?: string;
  }) {
    const top = input.opportunities[0];
    const fit = top ? summarizeFit(top.metadata) : { primaryPain: "memory and grounding pain", outcome: "less context rebuilding", objections: [] };
    const claimIds = input.claims.map((claim) => claim.id);
    const proofLine = input.claims.map((claim) => claim.text).slice(0, 2).join(" ");
    const baseThemes = [
      {
        platform: "x" as const,
        variant: "post" as const,
        theme: input.focus ?? fit.primaryPain,
        hook: "Your users remember. Your AI should too.",
        title: "Founder post: persistent memory",
        body: [
          "Your users remember. Your AI should too.",
          `${input.brand.name} gives AI teams persistent memory and grounded docs without a rewrite.`,
          proofLine,
          "Read the docs or book a call.",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n\n"),
      },
      {
        platform: "x" as const,
        variant: "thread" as const,
        theme: "benchmark proof",
        hook: "Numbers you can hold us to.",
        title: "Founder thread: proof first",
        body: [
          "Numbers you can hold us to.",
          "1. Your AI forgets everything.",
          `2. ${input.brand.name} fixes that with persistent memory and grounded docs.`,
          `3. ${proofLine}`,
          "4. Three calls. Works with any LLM. Zero rearchitecting.",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n\n"),
      },
      {
        platform: "linkedin" as const,
        variant: "post" as const,
        theme: "builder takeaway",
        hook: `Most AI teams do not need more prompt glue. They need ${fit.outcome}.`,
        title: "LinkedIn: builder-native proof post",
        body: [
          `Most AI teams do not need more prompt glue. They need ${fit.outcome}.`,
          `The visible pain is ${fit.primaryPain.toLowerCase()}.`,
          `${input.brand.name} is built for that: persistent memory, grounded docs, and no platform rewrite.`,
          proofLine,
          "If you are shipping AI now, this is worth a close look.",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n\n"),
      },
      {
        platform: "community" as const,
        variant: "community_rewrite" as const,
        theme: "community explanation",
        hook: fit.primaryPain,
        title: "Community-native explanation",
        body: [
          `Short version: the pain is ${fit.primaryPain.toLowerCase()}.`,
          `${input.brand.name} gives teams persistent memory across sessions and answers from grounded docs.`,
          proofLine,
          "Happy to share the proof pack if useful.",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n\n"),
      },
    ];

    const start = new Date();
    return Array.from({ length: Math.max(1, input.count) }).map((_, index) => {
      const theme = baseThemes[index % baseThemes.length]!;
      const angleIndex = Math.floor(index / baseThemes.length);
      const scheduledFor = new Date(start);
      scheduledFor.setDate(start.getDate() + index);
      const focusLine = input.focus ? `Focus: ${input.focus}.` : "";
      const enrichedBody = angleIndex === 0 ? theme.body : [theme.body, focusLine, `Angle ${angleIndex + 1}: ${fit.primaryPain}.`].filter(Boolean).join("\n\n");
      const enrichedTitle = angleIndex === 0 ? theme.title : `${theme.title} · ${angleIndex + 1}`;
      const enrichedHook = angleIndex === 0 ? theme.hook : `${theme.hook} (${angleIndex + 1})`;

      return {
        channel: (theme.platform === "community" ? "community" : "social") as ChannelType,
      sourceLane: "social" as const,
      title: enrichedTitle,
      body: enrichedBody,
      CTA: index % 2 === 0 ? "Read the docs" : "Book a call",
      claimIds,
      metadata: {
        theme: theme.theme,
        hook: enrichedHook,
      },
      social: {
        platform: theme.platform,
        variant: theme.variant,
        theme: theme.theme,
        hook: enrichedHook,
        scheduledFor: scheduledFor.toISOString(),
      },
      };
    }) as LaneAssetBlueprint[];
  }

  private planTopicClusters(input: {
    workspace: Workspace;
    claims: Claim[];
    opportunities: Opportunity[];
    signals: Signal[];
    existingPages: EvergreenPage[];
    count: number;
    focus?: string;
  }) {
    const signalFits = input.signals.map((signal) => summarizeFit(signal.metadata));
    const opportunityFits = input.opportunities.map((opportunity) => summarizeFit(opportunity.metadata));
    const pains = dedupe([
      input.focus ?? "",
      ...signalFits.map((fit) => fit.primaryPain),
      ...opportunityFits.map((fit) => fit.primaryPain),
      "Persistent memory for AI agents",
      "Grounded docs for AI teams",
      "User preference memory in production",
      "Zero rearchitecting AI memory stack",
    ]).filter(Boolean);

    return pains.slice(0, input.count).map((pain, index) => {
      const existingSlugs = new Set(input.existingPages.map((page) => page.slug));
      return {
        title: `${pain} for builders`,
        summary: `Problem-first cluster around ${pain.toLowerCase()} with BOFU and comparison angles.`,
        primaryPain: pain,
        targetKeywords: [pain.toLowerCase(), `${pain.toLowerCase()} ai`, `retaindb ${pain.toLowerCase()}`],
        pageIdeas: [`${pain} guide`, `${pain} vs prompt patching`, `${pain} use case page`],
        internalLinks: Array.from(existingSlugs).slice(0, 4),
        claimIds: input.claims.map((claim) => claim.id).slice(0, 4),
        metadata: {
          priority: index,
          freshness: existingSlugs.size > 0 ? "refresh" : "new",
        },
      };
    });
  }

  private buildSeoPageBlueprints(input: {
    brand: Brand;
    claims: Claim[];
    clusters: TopicCluster[];
    pageType?: EvergreenPageType;
    campaignBurstId?: string | null;
  }) {
    const claimIds = input.claims.map((claim) => claim.id);
    const proofLine = input.claims.map((claim) => claim.text).slice(0, 2).join(" ");
    return input.clusters.map((cluster, index) => {
      const pageType = input.pageType ?? (index % 3 === 0 ? "compare" : index % 3 === 1 ? "use_case" : "integration");
      const slug =
        pageType === "compare"
          ? `${cluster.primaryPain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-vs-prompt-patching`
          : pageType === "integration"
            ? `${cluster.primaryPain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-integration`
            : `${cluster.primaryPain.toLowerCase().replace(/[^a-z0-9]+/g, "-")}-guide`;
      return {
        channel: pageType === "compare" || pageType === "use_case" || pageType === "integration" ? "seo" : "landing",
        sourceLane: "seo" as const,
        title:
          pageType === "compare"
            ? `${cluster.primaryPain}: RetainDB vs prompt patching`
            : pageType === "integration"
              ? `${cluster.primaryPain}: integration guide`
              : `${cluster.primaryPain}: problem-first guide`,
        body: [
          `# ${cluster.title}`,
          "",
          "## The problem",
          `${cluster.primaryPain} is visible when AI products have to rebuild context, lose user state, or guess from stale docs.`,
          "",
          "## What changes with RetainDB",
          `${input.brand.name} gives teams persistent memory, grounded docs, and a cleaner path to production behavior without a rewrite.`,
          "",
          "## Proof",
          proofLine,
          "",
          "## Why teams switch",
          "Less prompt glue. Better continuity. Cleaner proof path.",
          "",
          "## CTA",
          "Book a call or read the docs.",
          "",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n"),
        CTA: "Book a call",
        claimIds,
        metadata: {
          slug,
          topicClusterId: cluster.id,
          campaignBurstId: input.campaignBurstId ?? null,
        },
        page: {
          pageType,
          slug,
          summary: cluster.summary,
          internalLinks: cluster.internalLinks,
        },
      } satisfies LaneAssetBlueprint;
    });
  }

  private claimsForBurst(type: CampaignBurstType, claims: Claim[]) {
    if (type === "benchmark") return benchmarkClaimSet(claims);
    if (type === "integration" || type === "partnership") return integrationClaimSet(claims);
    return uniqueById([...socialClaimSet(claims), ...seoClaimSet(claims)]);
  }

  private buildCampaignBurstBlueprints(input: {
    brand: Brand;
    workspace: Workspace;
    burstType: CampaignBurstType;
    claims: Claim[];
    brief: string;
    campaignBurstId: string;
  }) {
    const claimSet = this.claimsForBurst(input.burstType, input.claims);
    const claimIds = claimSet.map((claim) => claim.id);
    const proofLine = claimSet.map((claim) => claim.text).slice(0, 2).join(" ");
    const burstLabel = input.burstType.replace(/_/g, " ");

    return [
      {
        channel: "outbound" as const,
        sourceLane: "outbound" as const,
        title: `${input.brand.name}: ${burstLabel} proof email`,
        body: [
          "Short note.",
          input.brief,
          `${input.brand.name} helps AI teams remember more and guess less.`,
          proofLine,
          "If useful, I can send the proof pack or book a quick call.",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n\n"),
        CTA: "Book a call",
        claimIds,
        metadata: {
          campaignBurstId: input.campaignBurstId,
        },
      },
      {
        channel: "social" as const,
        sourceLane: "social" as const,
        title: `${burstLabel}: founder thread`,
        body: [
          `This week’s theme: ${burstLabel}.`,
          "Your users remember. Your AI should too.",
          `${input.brand.name} gives teams persistent memory, grounded docs, and measured proof.`,
          proofLine,
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n\n"),
        CTA: "Read the docs",
        claimIds,
        metadata: {
          campaignBurstId: input.campaignBurstId,
        },
        social: {
          platform: "x" as const,
          variant: "thread" as const,
          hook: burstLabel,
          theme: input.brief,
          scheduledFor: null,
        },
      },
      {
        channel: "reply" as const,
        sourceLane: "social" as const,
        title: `${burstLabel}: reply bank`,
        body: [
          "Quick reply angle.",
          `${input.brief}`,
          `${input.brand.name} is built for this pain.`,
          proofLine,
          "Happy to send the proof pack.",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n\n"),
        CTA: "Send the proof pack",
        claimIds,
        metadata: {
          campaignBurstId: input.campaignBurstId,
        },
        social: {
          platform: "x" as const,
          variant: "reply_bank" as const,
          hook: burstLabel,
          theme: "reply bank",
          scheduledFor: null,
        },
      },
      {
        channel: "seo" as const,
        sourceLane: "seo" as const,
        title: `${input.brand.name}: ${burstLabel} landing page`,
        body: [
          `# ${input.brand.name}: ${burstLabel}`,
          "",
          "## The problem",
          input.brief,
          "",
          "## Why RetainDB",
          `${input.brand.name} gives AI teams persistent memory, grounded docs, and proof that travels across channels.`,
          "",
          "## Numbers you can hold us to",
          proofLine,
          "",
          "## CTA",
          "Book a call.",
          "",
          `Claims: ${claimIds.join(", ")}`,
        ].join("\n"),
        CTA: "Book a call",
        claimIds,
        metadata: {
          campaignBurstId: input.campaignBurstId,
          slug: `${input.burstType}-burst-${input.workspace.slug}`,
        },
        page: {
          pageType: "landing" as const,
          slug: `${input.burstType}-burst-${input.workspace.slug}`,
          summary: input.brief,
          internalLinks: [],
        },
      },
    ] satisfies LaneAssetBlueprint[];
  }

  private async finalizeLaneRun(
    laneRunId: string,
    input: {
      generatedEntityIds: string[];
      runId?: string | null;
      campaignId?: string | null;
      status?: LaneRun["status"];
    },
  ) {
    await this.options.store.updateLaneRun(laneRunId, {
      generatedEntityIds: dedupe(input.generatedEntityIds),
      runId: input.runId ?? null,
      campaignId: input.campaignId ?? null,
      status: input.status ?? "completed",
      finishedAt: isoNow(),
    });
  }

  private async recordLaneLearning(input: {
    brand: Brand;
    workspace: Workspace;
    lane: GrowthLane;
    title: string;
    summary: string;
    metrics: Record<string, number | string | boolean>;
    learnings: string[];
  }) {
    await this.options.store.createPerformanceSnapshot({
      id: createId("snapshot"),
      workspaceId: input.workspace.id,
      brandId: input.brand.id,
      lane: input.lane,
      title: input.title,
      summary: input.summary,
      metrics: input.metrics,
      learnings: input.learnings,
      metadata: {},
    });

    await this.options.memoryProvider.add({
      project: input.brand.memoryProject,
      scope: input.lane === "campaign" ? "campaign" : "performance",
      memoryType: scopeToMemoryType(input.lane === "campaign" ? "campaign" : "performance"),
      content: `${input.title}: ${input.summary}`,
      namespace: `workspace:${input.workspace.id}:lane:${input.lane}`,
      tags: [input.brand.slug, input.workspace.id, input.lane],
      importance: 0.7,
      metadata: {
        lane: input.lane,
        metrics: input.metrics,
        learnings: input.learnings,
      },
    });
  }

  private validatePublishDestination(kind: PublishDestinationKind, config: Record<string, unknown>) {
    if (kind === "github_pr") {
      if (typeof config.owner !== "string" || typeof config.repo !== "string") {
        throw new Error("GitHub PR destination requires owner and repo.");
      }
      return;
    }
    if (kind === "webhook_export" && typeof config.targetUrl !== "string") {
      throw new Error("Webhook export destination requires targetUrl.");
    }
  }

  private async ensureDefaultPublishDestinationsForWorkspace(workspace: Workspace, brand: Brand) {
    if (this.defaultPublishDestinations.length === 0) return;
    const existing = await this.options.store.listPublishDestinationsByWorkspace(workspace.id);
    const existingNames = new Set(existing.map((destination) => destination.name));
    for (const destination of this.defaultPublishDestinations) {
      if (existingNames.has(destination.name)) continue;
      await this.options.store.createPublishDestination({
        id: createId("destination"),
        workspaceId: workspace.id,
        brandId: brand.id,
        kind: destination.kind,
        name: destination.name,
        supportedChannels: destination.supportedChannels,
        config: destination.config,
        metadata: destination.metadata ?? { default: true },
      });
    }
  }

  private async resolvePublishContext(asset: Asset) {
    const run = await this.requireRun(asset.runId);
    const summaryWorkspaceId =
      typeof run.summary.workspaceId === "string"
        ? run.summary.workspaceId
        : typeof run.metadata.workspaceId === "string"
          ? run.metadata.workspaceId
          : typeof asset.metadata.workspaceId === "string"
            ? asset.metadata.workspaceId
            : null;
    if (!summaryWorkspaceId) {
      throw new Error(`Could not resolve workspace for asset ${asset.id}.`);
    }
    const workspace = await this.requireWorkspace(summaryWorkspaceId);
    const brand = await this.requireBrand(asset.brandId);
    return { workspace, brand };
  }

  private async choosePublishDestination(workspaceId: string, channel: ChannelType, destinationId?: string) {
    if (destinationId) {
      const destination = await this.options.store.findPublishDestinationById(destinationId);
      if (!destination) throw new Error(`Publish destination not found: ${destinationId}`);
      if (!destination.supportedChannels.includes(channel)) {
        throw new Error(`Publish destination ${destination.name} does not support channel ${channel}.`);
      }
      return destination;
    }

    const destinations = await this.options.store.listPublishDestinationsByWorkspace(workspaceId);
    const preferredKind = destinationKindForChannel(channel);
    const compatible = destinations.filter((destination) => destination.supportedChannels.includes(channel));
    const preferred = compatible.find((destination) => destination.kind === preferredKind);
    if (preferred) return preferred;
    if (compatible[0]) return compatible[0];
    throw new Error(`No publish destination configured for channel ${channel}.`);
  }

  private async executePublish(input: {
    asset: Asset;
    touch?: Touch | null;
    destinationId?: string;
    entityType: PublishJob["entityType"];
  }) {
    const { workspace, brand } = await this.resolvePublishContext(input.asset);
    const destination = await this.choosePublishDestination(workspace.id, input.asset.channel, input.destinationId);
    const lane = input.asset.lane ?? laneFromChannel(input.asset.channel);
    const publishJob = await this.options.store.createPublishJob({
      id: createId("publish_job"),
      workspaceId: workspace.id,
      brandId: brand.id,
      destinationId: destination.id,
      kind: destination.kind,
      entityType: input.entityType,
      entityId: input.entityType === "touch" ? input.touch?.id ?? input.asset.id : input.asset.id,
      lane,
      status: "publishing",
      payload:
        destination.kind === "github_pr"
          ? {
              path: buildGitHubContentPath({ destination, brand, workspace, asset: input.asset, touch: input.touch }),
            }
          : buildWebhookExportPayload({ destination, brand, workspace, asset: input.asset, touch: input.touch }),
      lastError: null,
      attemptCount: 0,
      metadata: {},
      publishedAt: null,
    });
    const publishAttempt = await this.options.store.createPublishAttempt({
      id: createId("publish_attempt"),
      workspaceId: workspace.id,
      brandId: brand.id,
      publishJobId: publishJob.id,
      status: "publishing",
      responseStatus: null,
      responseBody: null,
      error: null,
      metadata: {},
    });

    try {
      const result =
        destination.kind === "github_pr"
          ? await this.githubPublisher.publish({ destination, brand, workspace, asset: input.asset, touch: input.touch })
          : await this.webhookPublisher.publish({ destination, brand, workspace, asset: input.asset, touch: input.touch });

      const updatedJob =
        (await this.options.store.updatePublishJob(publishJob.id, {
          status: "published",
          attemptCount: publishJob.attemptCount + 1,
          publishedAt: isoNow(),
          metadata: {
            ...publishJob.metadata,
            ...result.metadata,
            remoteUrl: result.remoteUrl ?? null,
            externalId: result.externalId ?? null,
          },
        })) ?? publishJob;
      await this.options.store.updatePublishAttempt(publishAttempt.id, {
        status: "published",
        responseStatus: 200,
        responseBody: JSON.stringify(result),
        metadata: result.metadata,
      });

      await this.options.store.updateAsset(input.asset.id, {
        publicationStatus: "published",
        publishMetadata: {
          destinationId: destination.id,
          destinationKind: destination.kind,
          remoteUrl: result.remoteUrl ?? null,
          externalId: result.externalId ?? null,
          publishedAt: isoNow(),
        },
        metadata: {
          ...input.asset.metadata,
          publicationStatus: "published",
          publishMetadata: {
            destinationId: destination.id,
            destinationKind: destination.kind,
            remoteUrl: result.remoteUrl ?? null,
            externalId: result.externalId ?? null,
            publishedAt: isoNow(),
          },
        },
      });

      if (input.touch) {
        await this.options.store.updateTouch(input.touch.id, {
          publicationStatus: "published",
          publishMetadata: {
            destinationId: destination.id,
            destinationKind: destination.kind,
            remoteUrl: result.remoteUrl ?? null,
            externalId: result.externalId ?? null,
          },
          metadata: {
            ...input.touch.metadata,
            publicationStatus: "published",
            publishMetadata: {
              destinationId: destination.id,
              destinationKind: destination.kind,
              remoteUrl: result.remoteUrl ?? null,
              externalId: result.externalId ?? null,
            },
          },
        });
        if (destination.kind === "webhook_export" && touchReadyForPublish(input.touch)) {
          await this.markTouchSent(input.touch.id);
        }
      }

      await this.options.memoryProvider.add({
        project: brand.memoryProject,
        scope: "performance",
        memoryType: scopeToMemoryType("performance"),
        content: `Published ${input.entityType} ${publishJob.entityId} to ${destination.kind}.`,
        namespace: `workspace:${workspace.id}:publishing`,
        tags: [brand.slug, workspace.id, destination.kind, lane],
        importance: 0.6,
        metadata: {
          jobId: publishJob.id,
          remoteUrl: result.remoteUrl ?? null,
          externalId: result.externalId ?? null,
        },
      });

      return {
        job: updatedJob,
        attempts: await this.options.store.listPublishAttemptsByJob(publishJob.id),
      };
    } catch (error) {
      const message = (error as Error).message;
      await this.options.store.updatePublishJob(publishJob.id, {
        status: "failed",
        attemptCount: publishJob.attemptCount + 1,
        lastError: message,
        metadata: {
          ...publishJob.metadata,
          lastError: message,
        },
      });
      await this.options.store.updatePublishAttempt(publishAttempt.id, {
        status: "failed",
        responseStatus: null,
        responseBody: null,
        error: message,
        metadata: {
          error: message,
        },
      });
      throw error;
    }
  }

  // ---------------------------------------------------------------------------
  // Email send + sequence execution
  // ---------------------------------------------------------------------------

  async sendApprovedEmailTouch(input: {
    touchId: string;
    resendApiKey: string;
    resendFromAddress: string;
    resendFromName: string;
    githubToken?: string;
    hunterApiKey?: string;
  }): Promise<{ sent: boolean; reason: string; messageId?: string }> {
    const touch = await this.requireTouch(input.touchId);
    if (touch.status !== "approved") {
      return { sent: false, reason: `touch_not_approved (status: ${touch.status})` };
    }
    if (touch.touchType !== "email" && touch.touchType !== "follow_up") {
      return { sent: false, reason: `wrong_touch_type (${touch.touchType})` };
    }

    const sequence = await this.options.store.findSequenceById(touch.sequenceId);
    const opportunityId = sequence?.opportunityId ?? null;
    const opportunity = opportunityId ? await this.options.store.findOpportunityById(opportunityId) : null;
    const personId = opportunity?.personId ?? null;
    const accountId = opportunity?.accountId ?? null;

    let recipientEmail: string | null = null;
    let recipientName: string | null = null;

    if (personId) {
      const person = await this.options.store.findProspectPersonById(personId);
      recipientEmail = (person?.email as string | null | undefined) ?? (person?.metadata?.foundEmail as string | null | undefined) ?? null;
      recipientName = person?.name ?? null;

      // Try to find email if missing
      if (!recipientEmail && accountId) {
        const account = await this.options.store.findProspectAccountById(accountId);
        if (account) {
          const { EmailFinder } = await import("./email-finder.js");
          const finder = new EmailFinder({ githubToken: input.githubToken, hunterApiKey: input.hunterApiKey });
          const nameParts = (person?.name ?? "").trim().split(/\s+/);
          const found = await finder.findEmail({
            fullName: person?.name ?? null,
            domain: account.domain ?? (account.metadata?.website ? domainFromUrl(String(account.metadata.website)) : null) ?? null,
            githubUsername: (person?.metadata?.githubUsername as string | null | undefined) ?? null,
            githubOrg: (account.metadata?.githubOrg as string | null | undefined) ?? null,
          });
          if (found) {
            recipientEmail = found.email;
            if (person) {
              await this.options.store.updateProspectPerson(person.id, {
                metadata: { ...person.metadata, foundEmail: found.email, emailFindMethod: found.method },
              });
            }
          }
        }
      }
    }

    // Fall back to email stored directly on touch metadata
    if (!recipientEmail) {
      recipientEmail = (touch.metadata?.recipientEmail as string | null | undefined) ?? null;
    }

    if (!recipientEmail) {
      return { sent: false, reason: "no_email_found" };
    }

    const { ResendEmailClient, markdownToEmailHtml } = await import("./sending.js");
    const client = new ResendEmailClient({
      apiKey: input.resendApiKey,
      fromAddress: input.resendFromAddress,
      fromName: input.resendFromName,
    });

    const subject = touch.title || "Following up";
    const text = touch.body;
    const html = markdownToEmailHtml(text);

    const result = await client.send({
      to: recipientEmail,
      subject,
      text,
      html,
      tags: {
        touch_id: touch.id,
        sequence_id: touch.sequenceId,
        ...(opportunityId ? { opportunity_id: opportunityId } : {}),
      },
    });

    await this.options.store.updateTouch(touch.id, {
      status: "sent",
      metadata: {
        ...touch.metadata,
        sentAt: new Date().toISOString(),
        resendMessageId: result.id,
        recipientEmail,
        recipientName,
      },
    });

    if (opportunity) {
      await this.options.store.updateOpportunity(opportunity.id, { stage: "touched" });
    }

    // Schedule follow-up touches in the sequence
    await this.scheduleSequenceFollowUps(touch.sequenceId);

    return { sent: true, reason: "ok", messageId: result.id };
  }

  // ---------------------------------------------------------------------------
  // X / Twitter send
  // ---------------------------------------------------------------------------

  async sendApprovedXTouch(input: {
    touchId: string;
    xAccessToken: string;
    oauthClientId?: string;
    oauthClientSecret?: string;
  }): Promise<{ sent: boolean; reason: string; postUrl?: string; dmId?: string }> {
    const touch = await this.requireTouch(input.touchId);
    if (touch.status !== "approved") {
      return { sent: false, reason: `touch_not_approved (status: ${touch.status})` };
    }
    if (touch.touchType !== "post" && touch.touchType !== "dm" && touch.touchType !== "public_reply") {
      return { sent: false, reason: `wrong_touch_type (${touch.touchType})` };
    }

    const { XPublishingClient, formatXThread } = await import("./social-publishers.js");
    const client = new XPublishingClient({ accessToken: input.xAccessToken, oauthClientId: input.oauthClientId, oauthClientSecret: input.oauthClientSecret });

    if (touch.touchType === "dm") {
      // Need to resolve recipient X user ID from person's social handle
      const seq = await this.options.store.findSequenceById(touch.sequenceId);
      const opp = seq?.opportunityId ? await this.options.store.findOpportunityById(seq.opportunityId) : null;
      const person = opp?.personId ? await this.options.store.findProspectPersonById(opp.personId) : null;
      const handle = person?.socialHandle ?? (touch.metadata?.recipientHandle as string | undefined);
      if (!handle) return { sent: false, reason: "no_social_handle" };

      const recipientId = await client.resolveUserId(handle);
      if (!recipientId) return { sent: false, reason: "x_user_not_found" };

      const dm = await client.sendDm({ recipientId, text: touch.body });
      await this.options.store.updateTouch(touch.id, {
        status: "sent",
        metadata: { ...touch.metadata, sentAt: new Date().toISOString(), xDmId: dm.id, recipientHandle: handle },
      });
      return { sent: true, reason: "ok", dmId: dm.id };
    }

    // Post or reply
    const isThread = touch.metadata?.isThread === true || touch.body.length > 270;
    let postUrl: string;

    if (isThread) {
      const tweets = formatXThread(touch.body);
      const result = await client.postThread(tweets);
      postUrl = result.firstUrl;
      await this.options.store.updateTouch(touch.id, {
        status: "sent",
        metadata: { ...touch.metadata, sentAt: new Date().toISOString(), xPostIds: result.ids, xPostUrl: postUrl },
      });
    } else {
      const replyToId = touch.metadata?.replyToTweetId as string | undefined;
      const result = await client.postTweet({ text: touch.body, replyToTweetId: replyToId });
      postUrl = result.url;
      await this.options.store.updateTouch(touch.id, {
        status: "sent",
        metadata: { ...touch.metadata, sentAt: new Date().toISOString(), xPostId: result.id, xPostUrl: postUrl },
      });
    }

    return { sent: true, reason: "ok", postUrl };
  }

  // ---------------------------------------------------------------------------
  // Reddit send
  // ---------------------------------------------------------------------------

  async sendApprovedRedditTouch(input: {
    touchId: string;
    redditBearerToken: string;
    userAgent?: string;
    redditClientId?: string;
    redditClientSecret?: string;
  }): Promise<{ sent: boolean; reason: string; postUrl?: string }> {
    const touch = await this.requireTouch(input.touchId);
    if (touch.status !== "approved") {
      return { sent: false, reason: `touch_not_approved (status: ${touch.status})` };
    }
    if (touch.touchType !== "community_post" && touch.touchType !== "public_reply") {
      return { sent: false, reason: `wrong_touch_type (${touch.touchType})` };
    }

    const { RedditPublishingClient } = await import("./social-publishers.js");
    const client = new RedditPublishingClient({
      bearerToken: input.redditBearerToken,
      userAgent: input.userAgent ?? "distribution-agent/1.0",
      clientId: input.redditClientId,
      clientSecret: input.redditClientSecret,
    });

    let postUrl: string;

    if (touch.touchType === "public_reply") {
      const parentFullname = touch.metadata?.redditParentFullname as string | undefined;
      if (!parentFullname) return { sent: false, reason: "no_reddit_parent_fullname" };
      const result = await client.postComment({ parentFullname, text: touch.body });
      postUrl = result.url;
      await this.options.store.updateTouch(touch.id, {
        status: "sent",
        metadata: { ...touch.metadata, sentAt: new Date().toISOString(), redditCommentId: result.id, redditPostUrl: postUrl },
      });
    } else {
      const subreddit = (touch.metadata?.subreddit as string | undefined) ?? "entrepreneur";
      const result = await client.submitPost({ subreddit, title: touch.title, text: touch.body });
      postUrl = result.url;
      await this.options.store.updateTouch(touch.id, {
        status: "sent",
        metadata: { ...touch.metadata, sentAt: new Date().toISOString(), redditPostId: result.id, redditPostUrl: postUrl },
      });
    }

    return { sent: true, reason: "ok", postUrl };
  }

  async scheduleSequenceFollowUps(sequenceId: string): Promise<void> {
    const touches = await this.options.store.listTouchesBySequence(sequenceId);
    const sentTouch = touches.find((t) => t.status === "sent");
    if (!sentTouch) return;

    const sentAt = new Date((sentTouch.metadata?.sentAt as string | undefined) ?? new Date().toISOString());
    const followUps = touches.filter((t) => t.status === "approved" && t.id !== sentTouch.id);

    const offsets = [3, 9, 16]; // days after first send
    for (let i = 0; i < followUps.length; i++) {
      const touch = followUps[i];
      if (!touch) continue;
      const scheduledFor = new Date(sentAt.getTime() + (offsets[i] ?? i * 5 + 3) * 86400 * 1000).toISOString();
      await this.options.store.updateTouch(touch.id, {
        metadata: { ...touch.metadata, scheduledFor },
      });
    }
  }
}

export { GrowthOperator as RetainDbGrowthOperator };
