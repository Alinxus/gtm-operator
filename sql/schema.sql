create table if not exists brands (
  id text primary key,
  slug text not null unique,
  name text not null,
  description text,
  memory_provider text not null default 'retaindb-http',
  memory_project text not null,
  voice jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists claims (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  category text not null,
  status text not null,
  text text not null,
  source_urls jsonb not null default '[]'::jsonb,
  source_excerpt text,
  required_qualifiers jsonb not null default '[]'::jsonb,
  allowed_channels jsonb not null default '[]'::jsonb,
  forbidden_variants jsonb not null default '[]'::jsonb,
  owner text,
  metadata jsonb not null default '{}'::jsonb,
  last_verified_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (brand_id, id)
);

create table if not exists campaigns (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  name text not null,
  goal text not null,
  campaign_type text not null,
  target_personas jsonb not null default '[]'::jsonb,
  channels jsonb not null default '[]'::jsonb,
  brief text not null,
  constraints jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists runs (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  campaign_id text not null references campaigns(id) on delete cascade,
  status text not null,
  approval_stage text,
  current_step text,
  summary jsonb not null default '{}'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  error text
);

create table if not exists assets (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  campaign_id text not null references campaigns(id) on delete cascade,
  run_id text not null references runs(id) on delete cascade,
  channel text not null,
  persona text not null,
  title text not null,
  body text not null,
  claim_ids jsonb not null default '[]'::jsonb,
  status text not null,
  approval_stage text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists critiques (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  campaign_id text not null references campaigns(id) on delete cascade,
  run_id text not null references runs(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  score integer not null,
  blocking_issues jsonb not null default '[]'::jsonb,
  warnings jsonb not null default '[]'::jsonb,
  notes jsonb not null default '[]'::jsonb,
  reviewer text not null default 'critic-worker',
  created_at timestamptz not null default now()
);

create table if not exists approvals (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  campaign_id text not null references campaigns(id) on delete cascade,
  run_id text not null references runs(id) on delete cascade,
  asset_id text not null references assets(id) on delete cascade,
  stage text not null,
  decision text not null,
  reason text not null,
  override_reason text,
  reviewer text not null,
  created_at timestamptz not null default now()
);

create table if not exists outcomes (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  campaign_id text not null references campaigns(id) on delete cascade,
  run_id text not null references runs(id) on delete cascade,
  asset_id text,
  channel text,
  metrics jsonb not null default '{}'::jsonb,
  feedback text,
  created_at timestamptz not null default now()
);

create table if not exists run_events (
  id bigserial primary key,
  brand_id text not null references brands(id) on delete cascade,
  run_id text not null references runs(id) on delete cascade,
  event_type text not null,
  stage text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists operator_entities (
  id text primary key,
  brand_id text not null references brands(id) on delete cascade,
  workspace_id text,
  entity_type text not null,
  parent_id text,
  status text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_claims_brand_id on claims (brand_id);
create index if not exists idx_campaigns_brand_id on campaigns (brand_id);
create index if not exists idx_runs_brand_id on runs (brand_id);
create index if not exists idx_runs_campaign_id on runs (campaign_id);
create index if not exists idx_assets_run_id on assets (run_id);
create index if not exists idx_critiques_run_id on critiques (run_id);
create index if not exists idx_approvals_run_id on approvals (run_id);
create index if not exists idx_outcomes_run_id on outcomes (run_id);
create index if not exists idx_run_events_run_id on run_events (run_id, id);
create index if not exists idx_operator_entities_brand_id on operator_entities (brand_id);
create index if not exists idx_operator_entities_workspace_id on operator_entities (workspace_id);
create index if not exists idx_operator_entities_type_workspace on operator_entities (entity_type, workspace_id);
create index if not exists idx_operator_entities_parent_id on operator_entities (parent_id);
create unique index if not exists idx_operator_workspace_slug_unique
  on operator_entities (brand_id, ((payload->>'slug')))
  where entity_type = 'workspace';
