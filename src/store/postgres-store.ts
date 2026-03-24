import postgres from "postgres";
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
import { isoNow } from "../domain.js";

type SqlClient = ReturnType<typeof postgres>;

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

function asStringArray(value: unknown) {
  if (Array.isArray(value)) return value.map((item) => String(item));
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed.map((item) => String(item)) : [value];
    } catch {
      return [value];
    }
  }
  return [];
}

function asRecord(value: unknown) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return value as Record<string, unknown>;
  }
  if (typeof value === "string" && value.trim().length > 0) {
    try {
      const parsed = JSON.parse(value);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      return {};
    }
  }
  return {};
}

function asBrandVoice(value: unknown): Brand["voice"] {
  const record = asRecord(value);
  return {
    tone: typeof record.tone === "string" ? record.tone : "technical, direct, builder-native, proof-first",
    styleRules: asStringArray(record.styleRules),
    preferredPhrases: asStringArray(record.preferredPhrases),
    forbiddenPhrases: asStringArray(record.forbiddenPhrases),
    founderVoiceNotes: asStringArray(record.founderVoiceNotes),
  };
}

function json(value: unknown): any {
  return value ?? null;
}

function rowOrUndefined<T>(rows: T[]) {
  return rows[0];
}

async function readSchemaSql() {
  const [{ access, readFile }, { dirname, resolve }, { fileURLToPath }] = await Promise.all([
    import("node:fs/promises"),
    import("node:path"),
    import("node:url"),
  ]);
  const moduleDir = dirname(fileURLToPath(import.meta.url));
  const candidates = [
    resolve(process.cwd(), "sql", "schema.sql"),
    resolve(moduleDir, "../../sql/schema.sql"),
    resolve(moduleDir, "../sql/schema.sql"),
  ];

  for (const candidate of [...new Set(candidates)]) {
    try {
      await access(candidate);
      return await readFile(candidate, "utf8");
    } catch {
      continue;
    }
  }

  throw new Error("Unable to locate sql/schema.sql for Postgres schema initialization.");
}

function mapBrand(row: any): Brand {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    description: row.description,
    memoryProvider: row.memory_provider,
    memoryProject: row.memory_project,
    voice: asBrandVoice(row.voice),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapClaim(row: any): Claim {
  return {
    id: row.id,
    brandId: row.brand_id,
    category: row.category,
    status: row.status,
    text: row.text,
    sourceUrls: asStringArray(row.source_urls),
    sourceExcerpt: row.source_excerpt,
    requiredQualifiers: asStringArray(row.required_qualifiers),
    allowedChannels: asStringArray(row.allowed_channels) as Claim["allowedChannels"],
    forbiddenVariants: asStringArray(row.forbidden_variants),
    owner: row.owner,
    metadata: asRecord(row.metadata),
    lastVerifiedAt: row.last_verified_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCampaign(row: any): Campaign {
  const metadata = asRecord(row.metadata);
  return {
    id: row.id,
    brandId: row.brand_id,
    name: row.name,
    goal: row.goal,
    campaignType: row.campaign_type,
    targetPersonas: asStringArray(row.target_personas),
    channels: asStringArray(row.channels) as Campaign["channels"],
    brief: row.brief,
    constraints: asStringArray(row.constraints),
    status: row.status,
    lane: (metadata.lane as Campaign["lane"]) ?? null,
    sourceLane: (metadata.sourceLane as Campaign["sourceLane"]) ?? null,
    campaignBurstId: typeof metadata.campaignBurstId === "string" ? metadata.campaignBurstId : null,
    publishMetadata: (metadata.publishMetadata as Campaign["publishMetadata"]) ?? null,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapRun(row: any): Run {
  return {
    id: row.id,
    brandId: row.brand_id,
    campaignId: row.campaign_id,
    status: row.status,
    approvalStage: row.approval_stage,
    currentStep: row.current_step,
    summary: asRecord(row.summary),
    metadata: asRecord(row.metadata),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    error: row.error,
  };
}

function mapAsset(row: any): Asset {
  const metadata = asRecord(row.metadata);
  return {
    id: row.id,
    brandId: row.brand_id,
    campaignId: row.campaign_id,
    runId: row.run_id,
    channel: row.channel,
    persona: row.persona,
    title: row.title,
    body: row.body,
    claimIds: asStringArray(row.claim_ids),
    status: row.status,
    approvalStage: row.approval_stage,
    lane: (metadata.lane as Asset["lane"]) ?? null,
    sourceLane: (metadata.sourceLane as Asset["sourceLane"]) ?? null,
    campaignBurstId: typeof metadata.campaignBurstId === "string" ? metadata.campaignBurstId : null,
    publicationStatus: (metadata.publicationStatus as Asset["publicationStatus"]) ?? null,
    publishMetadata: (metadata.publishMetadata as Asset["publishMetadata"]) ?? null,
    metadata,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapCritique(row: any): Critique {
  return {
    id: row.id,
    brandId: row.brand_id,
    campaignId: row.campaign_id,
    runId: row.run_id,
    assetId: row.asset_id,
    score: row.score,
    blockingIssues: asStringArray(row.blocking_issues),
    warnings: asStringArray(row.warnings),
    notes: asStringArray(row.notes),
    reviewer: row.reviewer,
    createdAt: row.created_at,
  };
}

function mapApproval(row: any): Approval {
  return {
    id: row.id,
    brandId: row.brand_id,
    campaignId: row.campaign_id,
    runId: row.run_id,
    assetId: row.asset_id,
    stage: row.stage,
    decision: row.decision,
    reason: row.reason,
    overrideReason: row.override_reason,
    reviewer: row.reviewer,
    createdAt: row.created_at,
  };
}

function mapOutcome(row: any): Outcome {
  return {
    id: row.id,
    brandId: row.brand_id,
    campaignId: row.campaign_id,
    runId: row.run_id,
    assetId: row.asset_id,
    channel: row.channel,
    metrics: asRecord(row.metrics) as Outcome["metrics"],
    feedback: row.feedback,
    createdAt: row.created_at,
  };
}

function mapEvent(row: any): RunEvent {
  return {
    id: Number(row.id),
    brandId: row.brand_id,
    runId: row.run_id,
    eventType: row.event_type,
    stage: row.stage,
    payload: asRecord(row.payload),
    createdAt: row.created_at,
  };
}

function mapOperatorEntity<T extends OperatorEntity>(row: any): T {
  const payload = asRecord(row.payload);
  const entity = {
    ...payload,
    id: row.id,
    brandId: row.brand_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  } as Record<string, unknown>;

  if (row.entity_type !== "workspace" && row.workspace_id) {
    entity.workspaceId = payload.workspaceId ?? row.workspace_id;
  }

  return entity as T;
}

export class PostgresMarketingStore implements MarketingStore {
  private schemaReady?: Promise<void>;

  constructor(private readonly sql: SqlClient) {}

  static connect(connectionString: string) {
    return new PostgresMarketingStore(postgres(connectionString, { prepare: false }));
  }

  async ensureSchema() {
    if (!this.schemaReady) {
      this.schemaReady = (async () => {
        const schemaSql = await readSchemaSql();
        await this.sql.unsafe(schemaSql);
      })();
    }

    await this.schemaReady;
  }

  private async upsertOperatorEntity<T extends OperatorEntity>(input: {
    id: string;
    kind: OperatorKind;
    brandId: string;
    workspaceId?: string | null;
    parentId?: string | null;
    status?: string | null;
    payload: Record<string, unknown>;
  }) {
    const rows = await this.sql`
      insert into operator_entities (
        id, brand_id, workspace_id, entity_type, parent_id, status, payload, created_at, updated_at
      )
      values (
        ${input.id}, ${input.brandId}, ${input.workspaceId ?? null}, ${input.kind}, ${input.parentId ?? null},
        ${input.status ?? null}, ${json(input.payload)}, ${isoNow()}, ${isoNow()}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        workspace_id = excluded.workspace_id,
        entity_type = excluded.entity_type,
        parent_id = excluded.parent_id,
        status = excluded.status,
        payload = excluded.payload,
        updated_at = excluded.updated_at
      returning *;
    `;
    return mapOperatorEntity<T>(rowOrUndefined(rows));
  }

  private async findOperatorEntity<T extends OperatorEntity>(kind: OperatorKind, id: string) {
    const rows = await this.sql`
      select * from operator_entities where id = ${id} and entity_type = ${kind} limit 1
    `;
    const row = rowOrUndefined(rows);
    return row ? mapOperatorEntity<T>(row) : undefined;
  }

  private async listOperatorEntities<T extends OperatorEntity>(input: {
    kind: OperatorKind;
    brandId?: string;
    workspaceId?: string;
    parentId?: string;
  }) {
    const rows = await this.sql`
      select *
      from operator_entities
      where entity_type = ${input.kind}
        and (${input.brandId ?? null}::text is null or brand_id = ${input.brandId ?? null})
        and (${input.workspaceId ?? null}::text is null or workspace_id = ${input.workspaceId ?? null})
        and (${input.parentId ?? null}::text is null or parent_id = ${input.parentId ?? null})
      order by created_at asc
    `;
    return rows.map((row) => mapOperatorEntity<T>(row));
  }

  async createBrand(input: Omit<Brand, "createdAt" | "updatedAt">) {
    const rows = await this.sql`
      insert into brands (id, slug, name, description, memory_provider, memory_project, voice, created_at, updated_at)
      values (${input.id}, ${input.slug}, ${input.name}, ${input.description ?? null}, ${input.memoryProvider}, ${input.memoryProject}, ${json(input.voice)}, ${isoNow()}, ${isoNow()})
      on conflict (id) do update set
        slug = excluded.slug,
        name = excluded.name,
        description = excluded.description,
        memory_provider = excluded.memory_provider,
        memory_project = excluded.memory_project,
        voice = excluded.voice,
        updated_at = excluded.updated_at
      returning *;
    `;
    return mapBrand(rowOrUndefined(rows));
  }

  async updateBrand(id: string, patch: Partial<Omit<Brand, "id" | "createdAt">>) {
    const existing = await this.findBrandById(id);
    if (!existing) return undefined;
    return this.createBrand({ ...existing, ...patch, id });
  }

  async findBrandById(id: string) {
    const rows = await this.sql`select * from brands where id = ${id} limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapBrand(row) : undefined;
  }

  async findBrandBySlug(slug: string) {
    const rows = await this.sql`select * from brands where slug = ${slug} limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapBrand(row) : undefined;
  }

  async listBrands() {
    const rows = await this.sql`select * from brands order by created_at asc`;
    return rows.map(mapBrand);
  }

  async upsertClaim(input: Omit<Claim, "createdAt" | "updatedAt">) {
    const rows = await this.sql`
      insert into claims (
        id, brand_id, category, status, text, source_urls, source_excerpt,
        required_qualifiers, allowed_channels, forbidden_variants, owner, metadata,
        last_verified_at, created_at, updated_at
      )
      values (
        ${input.id}, ${input.brandId}, ${input.category}, ${input.status}, ${input.text}, ${json(input.sourceUrls)},
        ${input.sourceExcerpt ?? null}, ${json(input.requiredQualifiers)}, ${json(input.allowedChannels)}, ${json(input.forbiddenVariants)},
        ${input.owner ?? null}, ${json(input.metadata)}, ${input.lastVerifiedAt ?? null}, ${isoNow()}, ${isoNow()}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        category = excluded.category,
        status = excluded.status,
        text = excluded.text,
        source_urls = excluded.source_urls,
        source_excerpt = excluded.source_excerpt,
        required_qualifiers = excluded.required_qualifiers,
        allowed_channels = excluded.allowed_channels,
        forbidden_variants = excluded.forbidden_variants,
        owner = excluded.owner,
        metadata = excluded.metadata,
        last_verified_at = excluded.last_verified_at,
        updated_at = excluded.updated_at
      returning *;
    `;
    return mapClaim(rowOrUndefined(rows));
  }

  async updateClaim(id: string, patch: Partial<Omit<Claim, "id" | "brandId" | "createdAt">>) {
    const existing = await this.findClaimById(id);
    if (!existing) return undefined;
    return this.upsertClaim({ ...existing, ...patch, id });
  }

  async findClaimById(id: string) {
    const rows = await this.sql`select * from claims where id = ${id} limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapClaim(row) : undefined;
  }

  async listClaimsByBrand(brandId: string) {
    const rows = await this.sql`select * from claims where brand_id = ${brandId} order by created_at asc`;
    return rows.map(mapClaim);
  }

  async createCampaign(input: Omit<Campaign, "createdAt" | "updatedAt">) {
    const metadata = {
      ...(input.metadata ?? {}),
      ...(input.lane ? { lane: input.lane } : {}),
      ...(input.sourceLane ? { sourceLane: input.sourceLane } : {}),
      ...(input.campaignBurstId ? { campaignBurstId: input.campaignBurstId } : {}),
      ...(input.publishMetadata ? { publishMetadata: input.publishMetadata } : {}),
    };
    const rows = await this.sql`
      insert into campaigns (
        id, brand_id, name, goal, campaign_type, target_personas, channels, brief, constraints, status, metadata, created_at, updated_at
      )
      values (
        ${input.id}, ${input.brandId}, ${input.name}, ${input.goal}, ${input.campaignType}, ${json(input.targetPersonas)},
        ${json(input.channels)}, ${input.brief}, ${json(input.constraints)}, ${input.status}, ${json(metadata)}, ${isoNow()}, ${isoNow()}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        name = excluded.name,
        goal = excluded.goal,
        campaign_type = excluded.campaign_type,
        target_personas = excluded.target_personas,
        channels = excluded.channels,
        brief = excluded.brief,
        constraints = excluded.constraints,
        status = excluded.status,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
      returning *;
    `;
    return mapCampaign(rowOrUndefined(rows));
  }

  async updateCampaign(id: string, patch: Partial<Omit<Campaign, "id" | "brandId" | "createdAt">>) {
    const existing = await this.findCampaignById(id);
    if (!existing) return undefined;
    return this.createCampaign({ ...existing, ...patch, id });
  }

  async findCampaignById(id: string) {
    const rows = await this.sql`select * from campaigns where id = ${id} limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapCampaign(row) : undefined;
  }

  async listCampaignsByBrand(brandId: string) {
    const rows = await this.sql`select * from campaigns where brand_id = ${brandId} order by created_at asc`;
    return rows.map(mapCampaign);
  }

  async createRun(input: Omit<Run, "createdAt" | "updatedAt">) {
    const rows = await this.sql`
      insert into runs (
        id, brand_id, campaign_id, status, approval_stage, current_step, summary, metadata, created_at, updated_at, started_at, finished_at, error
      )
      values (
        ${input.id}, ${input.brandId}, ${input.campaignId}, ${input.status}, ${input.approvalStage ?? null}, ${input.currentStep ?? null},
        ${json(input.summary)}, ${json(input.metadata)}, ${isoNow()}, ${isoNow()}, ${input.startedAt ?? null}, ${input.finishedAt ?? null}, ${input.error ?? null}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        campaign_id = excluded.campaign_id,
        status = excluded.status,
        approval_stage = excluded.approval_stage,
        current_step = excluded.current_step,
        summary = excluded.summary,
        metadata = excluded.metadata,
        started_at = excluded.started_at,
        finished_at = excluded.finished_at,
        error = excluded.error,
        updated_at = excluded.updated_at
      returning *;
    `;
    return mapRun(rowOrUndefined(rows));
  }

  async updateRun(id: string, patch: Partial<Omit<Run, "id" | "brandId" | "campaignId" | "createdAt">>) {
    const existing = await this.findRunById(id);
    if (!existing) return undefined;
    return this.createRun({ ...existing, ...patch, id });
  }

  async findRunById(id: string) {
    const rows = await this.sql`select * from runs where id = ${id} limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapRun(row) : undefined;
  }

  async listRunsByCampaign(campaignId: string) {
    const rows = await this.sql`select * from runs where campaign_id = ${campaignId} order by created_at asc`;
    return rows.map(mapRun);
  }

  async createAsset(input: Omit<Asset, "createdAt" | "updatedAt">) {
    const metadata = {
      ...(input.metadata ?? {}),
      ...(input.lane ? { lane: input.lane } : {}),
      ...(input.sourceLane ? { sourceLane: input.sourceLane } : {}),
      ...(input.campaignBurstId ? { campaignBurstId: input.campaignBurstId } : {}),
      ...(input.publicationStatus ? { publicationStatus: input.publicationStatus } : {}),
      ...(input.publishMetadata ? { publishMetadata: input.publishMetadata } : {}),
    };
    const rows = await this.sql`
      insert into assets (
        id, brand_id, campaign_id, run_id, channel, persona, title, body, claim_ids, status, approval_stage, metadata, created_at, updated_at
      )
      values (
        ${input.id}, ${input.brandId}, ${input.campaignId}, ${input.runId}, ${input.channel}, ${input.persona}, ${input.title},
        ${input.body}, ${json(input.claimIds)}, ${input.status}, ${input.approvalStage}, ${json(metadata)}, ${isoNow()}, ${isoNow()}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        campaign_id = excluded.campaign_id,
        run_id = excluded.run_id,
        channel = excluded.channel,
        persona = excluded.persona,
        title = excluded.title,
        body = excluded.body,
        claim_ids = excluded.claim_ids,
        status = excluded.status,
        approval_stage = excluded.approval_stage,
        metadata = excluded.metadata,
        updated_at = excluded.updated_at
      returning *;
    `;
    return mapAsset(rowOrUndefined(rows));
  }

  async updateAsset(id: string, patch: Partial<Omit<Asset, "id" | "brandId" | "campaignId" | "runId" | "createdAt">>) {
    const existing = await this.findAssetById(id);
    if (!existing) return undefined;
    return this.createAsset({ ...existing, ...patch, id });
  }

  async findAssetById(id: string) {
    const rows = await this.sql`select * from assets where id = ${id} limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapAsset(row) : undefined;
  }

  async listAssetsByRun(runId: string) {
    const rows = await this.sql`select * from assets where run_id = ${runId} order by created_at asc`;
    return rows.map(mapAsset);
  }

  async createCritique(input: Omit<Critique, "createdAt">) {
    const rows = await this.sql`
      insert into critiques (
        id, brand_id, campaign_id, run_id, asset_id, score, blocking_issues, warnings, notes, reviewer, created_at
      )
      values (
        ${input.id}, ${input.brandId}, ${input.campaignId}, ${input.runId}, ${input.assetId}, ${input.score},
        ${json(input.blockingIssues)}, ${json(input.warnings)}, ${json(input.notes)}, ${input.reviewer}, ${isoNow()}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        campaign_id = excluded.campaign_id,
        run_id = excluded.run_id,
        asset_id = excluded.asset_id,
        score = excluded.score,
        blocking_issues = excluded.blocking_issues,
        warnings = excluded.warnings,
        notes = excluded.notes,
        reviewer = excluded.reviewer
      returning *;
    `;
    return mapCritique(rowOrUndefined(rows));
  }

  async findCritiqueByAsset(assetId: string) {
    const rows = await this.sql`select * from critiques where asset_id = ${assetId} limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapCritique(row) : undefined;
  }

  async listCritiquesByRun(runId: string) {
    const rows = await this.sql`select * from critiques where run_id = ${runId} order by created_at asc`;
    return rows.map(mapCritique);
  }

  async createApproval(input: Omit<Approval, "createdAt">) {
    const rows = await this.sql`
      insert into approvals (
        id, brand_id, campaign_id, run_id, asset_id, stage, decision, reason, override_reason, reviewer, created_at
      )
      values (
        ${input.id}, ${input.brandId}, ${input.campaignId}, ${input.runId}, ${input.assetId}, ${input.stage},
        ${input.decision}, ${input.reason}, ${input.overrideReason ?? null}, ${input.reviewer}, ${isoNow()}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        campaign_id = excluded.campaign_id,
        run_id = excluded.run_id,
        asset_id = excluded.asset_id,
        stage = excluded.stage,
        decision = excluded.decision,
        reason = excluded.reason,
        override_reason = excluded.override_reason,
        reviewer = excluded.reviewer
      returning *;
    `;
    return mapApproval(rowOrUndefined(rows));
  }

  async findApprovalByAsset(assetId: string) {
    const rows = await this.sql`select * from approvals where asset_id = ${assetId} order by created_at desc limit 1`;
    const row = rowOrUndefined(rows);
    return row ? mapApproval(row) : undefined;
  }

  async listApprovalsByRun(runId: string) {
    const rows = await this.sql`select * from approvals where run_id = ${runId} order by created_at asc`;
    return rows.map(mapApproval);
  }

  async createOutcome(input: Omit<Outcome, "createdAt">) {
    const rows = await this.sql`
      insert into outcomes (
        id, brand_id, campaign_id, run_id, asset_id, channel, metrics, feedback, created_at
      )
      values (
        ${input.id}, ${input.brandId}, ${input.campaignId}, ${input.runId}, ${input.assetId ?? null}, ${input.channel ?? null},
        ${json(input.metrics)}, ${input.feedback ?? null}, ${isoNow()}
      )
      on conflict (id) do update set
        brand_id = excluded.brand_id,
        campaign_id = excluded.campaign_id,
        run_id = excluded.run_id,
        asset_id = excluded.asset_id,
        channel = excluded.channel,
        metrics = excluded.metrics,
        feedback = excluded.feedback
      returning *;
    `;
    return mapOutcome(rowOrUndefined(rows));
  }

  async listOutcomesByRun(runId: string) {
    const rows = await this.sql`select * from outcomes where run_id = ${runId} order by created_at asc`;
    return rows.map(mapOutcome);
  }

  async appendEvent(input: Omit<RunEvent, "id" | "createdAt">) {
    const rows = await this.sql`
      insert into run_events (brand_id, run_id, event_type, stage, payload, created_at)
      values (${input.brandId}, ${input.runId}, ${input.eventType}, ${input.stage ?? null}, ${json(input.payload)}, ${isoNow()})
      returning *;
    `;
    return mapEvent(rowOrUndefined(rows));
  }

  async listEventsByRun(runId: string) {
    const rows = await this.sql`select * from run_events where run_id = ${runId} order by id asc`;
    return rows.map(mapEvent);
  }

  async createWorkspace(input: Omit<Workspace, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Workspace>({
      id: input.id,
      kind: "workspace",
      brandId: input.brandId,
      workspaceId: input.id,
      parentId: input.brandId,
      status: "active",
      payload: input,
    });
  }

  async updateWorkspace(id: string, patch: Partial<Omit<Workspace, "id" | "brandId" | "createdAt">>) {
    const existing = await this.findWorkspaceById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Workspace>({
      id,
      kind: "workspace",
      brandId: existing.brandId,
      workspaceId: existing.id,
      parentId: existing.brandId,
      status: "active",
      payload: { ...existing, ...patch },
    });
  }

  async findWorkspaceById(id: string) {
    return this.findOperatorEntity<Workspace>("workspace", id);
  }

  async findWorkspaceBySlug(brandId: string, slug: string) {
    const rows = await this.sql`
      select * from operator_entities
      where entity_type = 'workspace'
        and brand_id = ${brandId}
        and payload->>'slug' = ${slug}
      limit 1
    `;
    const row = rowOrUndefined(rows);
    return row ? mapOperatorEntity<Workspace>(row) : undefined;
  }

  async listWorkspacesByBrand(brandId: string) {
    return this.listOperatorEntities<Workspace>({ kind: "workspace", brandId });
  }

  async createICPProfile(input: Omit<ICPProfile, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<ICPProfile>({
      id: input.id,
      kind: "icp_profile",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      status: "active",
      payload: input,
    });
  }

  async updateICPProfile(id: string, patch: Partial<Omit<ICPProfile, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    const existing = await this.findOperatorEntity<ICPProfile>("icp_profile", id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<ICPProfile>({
      id,
      kind: "icp_profile",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      status: "active",
      payload: { ...existing, ...patch },
    });
  }

  async listICPProfilesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ICPProfile>({ kind: "icp_profile", workspaceId });
  }

  async createProspectAccount(input: Omit<ProspectAccount, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<ProspectAccount>({
      id: input.id,
      kind: "prospect_account",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      status: input.stage,
      payload: input,
    });
  }

  async updateProspectAccount(id: string, patch: Partial<Omit<ProspectAccount, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    const existing = await this.findProspectAccountById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<ProspectAccount>({
      id,
      kind: "prospect_account",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      status: typeof patch.stage === "string" ? patch.stage : existing.stage,
      payload: { ...existing, ...patch },
    });
  }

  async findProspectAccountById(id: string) {
    return this.findOperatorEntity<ProspectAccount>("prospect_account", id);
  }

  async listProspectAccountsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ProspectAccount>({ kind: "prospect_account", workspaceId });
  }

  async createProspectPerson(input: Omit<ProspectPerson, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<ProspectPerson>({
      id: input.id,
      kind: "prospect_person",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.accountId,
      payload: input,
    });
  }

  async updateProspectPerson(id: string, patch: Partial<Omit<ProspectPerson, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>) {
    const existing = await this.findProspectPersonById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<ProspectPerson>({
      id,
      kind: "prospect_person",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.accountId,
      payload: { ...existing, ...patch },
    });
  }

  async findProspectPersonById(id: string) {
    return this.findOperatorEntity<ProspectPerson>("prospect_person", id);
  }

  async listProspectPeopleByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ProspectPerson>({ kind: "prospect_person", workspaceId });
  }

  async listProspectPeopleByAccount(accountId: string) {
    return this.listOperatorEntities<ProspectPerson>({ kind: "prospect_person", parentId: accountId });
  }

  async createSignal(input: Omit<Signal, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Signal>({
      id: input.id,
      kind: "signal",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.accountId ?? null,
      status: "active",
      payload: input,
    });
  }

  async updateSignal(id: string, patch: Partial<Omit<Signal, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    const existing = await this.findSignalById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Signal>({
      id,
      kind: "signal",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.accountId ?? null,
      status: "active",
      payload: { ...existing, ...patch },
    });
  }

  async findSignalById(id: string) {
    return this.findOperatorEntity<Signal>("signal", id);
  }

  async listSignalsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Signal>({ kind: "signal", workspaceId });
  }

  async createOpportunity(input: Omit<Opportunity, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Opportunity>({
      id: input.id,
      kind: "opportunity",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.accountId,
      status: input.stage,
      payload: input,
    });
  }

  async updateOpportunity(id: string, patch: Partial<Omit<Opportunity, "id" | "workspaceId" | "brandId" | "accountId" | "signalId" | "createdAt">>) {
    const existing = await this.findOpportunityById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Opportunity>({
      id,
      kind: "opportunity",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.accountId,
      status: typeof patch.stage === "string" ? patch.stage : existing.stage,
      payload: { ...existing, ...patch },
    });
  }

  async findOpportunityById(id: string) {
    return this.findOperatorEntity<Opportunity>("opportunity", id);
  }

  async listOpportunitiesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Opportunity>({ kind: "opportunity", workspaceId });
  }

  async createSequence(input: Omit<Sequence, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Sequence>({
      id: input.id,
      kind: "sequence",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.opportunityId,
      status: input.status,
      payload: input,
    });
  }

  async updateSequence(id: string, patch: Partial<Omit<Sequence, "id" | "workspaceId" | "brandId" | "accountId" | "opportunityId" | "createdAt">>) {
    const existing = await this.findSequenceById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Sequence>({
      id,
      kind: "sequence",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.opportunityId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findSequenceById(id: string) {
    return this.findOperatorEntity<Sequence>("sequence", id);
  }

  async listSequencesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Sequence>({ kind: "sequence", workspaceId });
  }

  async createTouch(input: Omit<Touch, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Touch>({
      id: input.id,
      kind: "touch",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.sequenceId,
      status: input.status,
      payload: input,
    });
  }

  async updateTouch(id: string, patch: Partial<Omit<Touch, "id" | "workspaceId" | "brandId" | "sequenceId" | "assetId" | "createdAt">>) {
    const existing = await this.findTouchById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Touch>({
      id,
      kind: "touch",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.sequenceId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findTouchById(id: string) {
    return this.findOperatorEntity<Touch>("touch", id);
  }

  async findTouchByAssetId(assetId: string) {
    const rows = await this.sql`
      select * from operator_entities
      where entity_type = 'touch'
        and payload->>'assetId' = ${assetId}
      limit 1
    `;
    const row = rowOrUndefined(rows);
    return row ? mapOperatorEntity<Touch>(row) : undefined;
  }

  async listTouchesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Touch>({ kind: "touch", workspaceId });
  }

  async listTouchesBySequence(sequenceId: string) {
    return this.listOperatorEntities<Touch>({ kind: "touch", parentId: sequenceId });
  }

  async createConversation(input: Omit<Conversation, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Conversation>({
      id: input.id,
      kind: "conversation",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.accountId,
      status: input.status,
      payload: input,
    });
  }

  async updateConversation(id: string, patch: Partial<Omit<Conversation, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>) {
    const existing = await this.findConversationById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Conversation>({
      id,
      kind: "conversation",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.accountId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findConversationById(id: string) {
    return this.findOperatorEntity<Conversation>("conversation", id);
  }

  async listConversationsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Conversation>({ kind: "conversation", workspaceId });
  }

  async createGoal(input: Omit<Goal, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Goal>({
      id: input.id,
      kind: "goal",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      status: "active",
      payload: input,
    });
  }

  async updateGoal(id: string, patch: Partial<Omit<Goal, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    const existing = await this.findGoalById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Goal>({
      id,
      kind: "goal",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      status: "active",
      payload: { ...existing, ...patch },
    });
  }

  async findGoalById(id: string) {
    return this.findOperatorEntity<Goal>("goal", id);
  }

  async listGoalsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Goal>({ kind: "goal", workspaceId });
  }

  async createAttribution(input: Omit<Attribution, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<Attribution>({
      id: input.id,
      kind: "attribution",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.opportunityId ?? input.accountId,
      status: input.stage,
      payload: input,
    });
  }

  async updateAttribution(id: string, patch: Partial<Omit<Attribution, "id" | "workspaceId" | "brandId" | "accountId" | "createdAt">>) {
    const existing = await this.findAttributionById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<Attribution>({
      id,
      kind: "attribution",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.opportunityId ?? existing.accountId,
      status: typeof patch.stage === "string" ? patch.stage : existing.stage,
      payload: { ...existing, ...patch },
    });
  }

  async findAttributionById(id: string) {
    return this.findOperatorEntity<Attribution>("attribution", id);
  }

  async listAttributionsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<Attribution>({ kind: "attribution", workspaceId });
  }

  async createLaneRun(input: Omit<LaneRun, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<LaneRun>({
      id: input.id,
      kind: "lane_run",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.campaignId ?? null,
      status: input.status,
      payload: input,
    });
  }

  async updateLaneRun(id: string, patch: Partial<Omit<LaneRun, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    const existing = await this.findLaneRunById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<LaneRun>({
      id,
      kind: "lane_run",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: patch.campaignId ?? existing.campaignId ?? null,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findLaneRunById(id: string) {
    return this.findOperatorEntity<LaneRun>("lane_run", id);
  }

  async listLaneRunsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<LaneRun>({ kind: "lane_run", workspaceId });
  }

  async listLaneRunsByLane(workspaceId: string, lane: LaneRun["lane"]) {
    const rows = await this.sql`
      select *
      from operator_entities
      where entity_type = 'lane_run'
        and workspace_id = ${workspaceId}
        and payload->>'lane' = ${lane}
      order by created_at asc
    `;
    return rows.map((row) => mapOperatorEntity<LaneRun>(row));
  }

  async createContentCalendarItem(input: Omit<ContentCalendarItem, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<ContentCalendarItem>({
      id: input.id,
      kind: "content_calendar_item",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.laneRunId,
      status: input.status,
      payload: input,
    });
  }

  async updateContentCalendarItem(
    id: string,
    patch: Partial<Omit<ContentCalendarItem, "id" | "workspaceId" | "brandId" | "laneRunId" | "createdAt">>,
  ) {
    const existing = await this.findContentCalendarItemById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<ContentCalendarItem>({
      id,
      kind: "content_calendar_item",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.laneRunId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findContentCalendarItemById(id: string) {
    return this.findOperatorEntity<ContentCalendarItem>("content_calendar_item", id);
  }

  async listContentCalendarItemsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<ContentCalendarItem>({ kind: "content_calendar_item", workspaceId });
  }

  async listContentCalendarItemsByLaneRun(laneRunId: string) {
    return this.listOperatorEntities<ContentCalendarItem>({ kind: "content_calendar_item", parentId: laneRunId });
  }

  async createSocialAsset(input: Omit<SocialAsset, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<SocialAsset>({
      id: input.id,
      kind: "social_asset",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.laneRunId,
      status: input.status,
      payload: input,
    });
  }

  async updateSocialAsset(id: string, patch: Partial<Omit<SocialAsset, "id" | "workspaceId" | "brandId" | "laneRunId" | "assetId" | "createdAt">>) {
    const existing = await this.findSocialAssetById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<SocialAsset>({
      id,
      kind: "social_asset",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.laneRunId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findSocialAssetById(id: string) {
    return this.findOperatorEntity<SocialAsset>("social_asset", id);
  }

  async listSocialAssetsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<SocialAsset>({ kind: "social_asset", workspaceId });
  }

  async listSocialAssetsByLaneRun(laneRunId: string) {
    return this.listOperatorEntities<SocialAsset>({ kind: "social_asset", parentId: laneRunId });
  }

  async createTopicCluster(input: Omit<TopicCluster, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<TopicCluster>({
      id: input.id,
      kind: "topic_cluster",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.laneRunId,
      status: input.status,
      payload: input,
    });
  }

  async updateTopicCluster(id: string, patch: Partial<Omit<TopicCluster, "id" | "workspaceId" | "brandId" | "laneRunId" | "createdAt">>) {
    const existing = await this.findTopicClusterById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<TopicCluster>({
      id,
      kind: "topic_cluster",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.laneRunId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findTopicClusterById(id: string) {
    return this.findOperatorEntity<TopicCluster>("topic_cluster", id);
  }

  async listTopicClustersByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<TopicCluster>({ kind: "topic_cluster", workspaceId });
  }

  async listTopicClustersByLaneRun(laneRunId: string) {
    return this.listOperatorEntities<TopicCluster>({ kind: "topic_cluster", parentId: laneRunId });
  }

  async createEvergreenPage(input: Omit<EvergreenPage, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<EvergreenPage>({
      id: input.id,
      kind: "evergreen_page",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.topicClusterId ?? input.campaignBurstId ?? input.laneRunId ?? null,
      status: input.state,
      payload: input,
    });
  }

  async updateEvergreenPage(id: string, patch: Partial<Omit<EvergreenPage, "id" | "workspaceId" | "brandId" | "createdAt">>) {
    const existing = await this.findEvergreenPageById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<EvergreenPage>({
      id,
      kind: "evergreen_page",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: patch.topicClusterId ?? patch.campaignBurstId ?? patch.laneRunId ?? existing.topicClusterId ?? existing.campaignBurstId ?? existing.laneRunId ?? null,
      status: typeof patch.state === "string" ? patch.state : existing.state,
      payload: { ...existing, ...patch },
    });
  }

  async findEvergreenPageById(id: string) {
    return this.findOperatorEntity<EvergreenPage>("evergreen_page", id);
  }

  async listEvergreenPagesByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<EvergreenPage>({ kind: "evergreen_page", workspaceId });
  }

  async findEvergreenPageBySlug(workspaceId: string, slug: string) {
    const rows = await this.sql`
      select *
      from operator_entities
      where entity_type = 'evergreen_page'
        and workspace_id = ${workspaceId}
        and payload->>'slug' = ${slug}
      limit 1
    `;
    const row = rowOrUndefined(rows);
    return row ? mapOperatorEntity<EvergreenPage>(row) : undefined;
  }

  async createCampaignBurst(input: Omit<CampaignBurst, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<CampaignBurst>({
      id: input.id,
      kind: "campaign_burst",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.campaignId,
      status: input.status,
      payload: input,
    });
  }

  async updateCampaignBurst(
    id: string,
    patch: Partial<Omit<CampaignBurst, "id" | "workspaceId" | "brandId" | "campaignId" | "createdAt">>,
  ) {
    const existing = await this.findCampaignBurstById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<CampaignBurst>({
      id,
      kind: "campaign_burst",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.campaignId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findCampaignBurstById(id: string) {
    return this.findOperatorEntity<CampaignBurst>("campaign_burst", id);
  }

  async listCampaignBurstsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<CampaignBurst>({ kind: "campaign_burst", workspaceId });
  }

  async createPerformanceSnapshot(input: Omit<PerformanceSnapshot, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<PerformanceSnapshot>({
      id: input.id,
      kind: "performance_snapshot",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.lane,
      status: "active",
      payload: input,
    });
  }

  async updatePerformanceSnapshot(
    id: string,
    patch: Partial<Omit<PerformanceSnapshot, "id" | "workspaceId" | "brandId" | "createdAt">>,
  ) {
    const existing = await this.findPerformanceSnapshotById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<PerformanceSnapshot>({
      id,
      kind: "performance_snapshot",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: patch.lane ?? existing.lane,
      status: "active",
      payload: { ...existing, ...patch },
    });
  }

  async findPerformanceSnapshotById(id: string) {
    return this.findOperatorEntity<PerformanceSnapshot>("performance_snapshot", id);
  }

  async listPerformanceSnapshotsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<PerformanceSnapshot>({ kind: "performance_snapshot", workspaceId });
  }

  async createPublishDestination(input: Omit<PublishDestination, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<PublishDestination>({
      id: input.id,
      kind: "publish_destination",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.kind,
      status: "active",
      payload: input,
    });
  }

  async updatePublishDestination(
    id: string,
    patch: Partial<Omit<PublishDestination, "id" | "workspaceId" | "brandId" | "createdAt">>,
  ) {
    const existing = await this.findPublishDestinationById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<PublishDestination>({
      id,
      kind: "publish_destination",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: patch.kind ?? existing.kind,
      status: "active",
      payload: { ...existing, ...patch },
    });
  }

  async findPublishDestinationById(id: string) {
    return this.findOperatorEntity<PublishDestination>("publish_destination", id);
  }

  async listPublishDestinationsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<PublishDestination>({ kind: "publish_destination", workspaceId });
  }

  async createPublishJob(input: Omit<PublishJob, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<PublishJob>({
      id: input.id,
      kind: "publish_job",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.destinationId,
      status: input.status,
      payload: input,
    });
  }

  async updatePublishJob(id: string, patch: Partial<Omit<PublishJob, "id" | "workspaceId" | "brandId" | "destinationId" | "createdAt">>) {
    const existing = await this.findPublishJobById(id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<PublishJob>({
      id,
      kind: "publish_job",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.destinationId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async findPublishJobById(id: string) {
    return this.findOperatorEntity<PublishJob>("publish_job", id);
  }

  async listPublishJobsByWorkspace(workspaceId: string) {
    return this.listOperatorEntities<PublishJob>({ kind: "publish_job", workspaceId });
  }

  async createPublishAttempt(input: Omit<PublishAttempt, "createdAt" | "updatedAt">) {
    return this.upsertOperatorEntity<PublishAttempt>({
      id: input.id,
      kind: "publish_attempt",
      brandId: input.brandId,
      workspaceId: input.workspaceId,
      parentId: input.publishJobId,
      status: input.status,
      payload: input,
    });
  }

  async updatePublishAttempt(
    id: string,
    patch: Partial<Omit<PublishAttempt, "id" | "workspaceId" | "brandId" | "publishJobId" | "createdAt">>,
  ) {
    const existing = await this.findOperatorEntity<PublishAttempt>("publish_attempt", id);
    if (!existing) return undefined;
    return this.upsertOperatorEntity<PublishAttempt>({
      id,
      kind: "publish_attempt",
      brandId: existing.brandId,
      workspaceId: existing.workspaceId,
      parentId: existing.publishJobId,
      status: typeof patch.status === "string" ? patch.status : existing.status,
      payload: { ...existing, ...patch },
    });
  }

  async listPublishAttemptsByJob(publishJobId: string) {
    return this.listOperatorEntities<PublishAttempt>({ kind: "publish_attempt", parentId: publishJobId });
  }
}
