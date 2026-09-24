-- CMS V1 — initial schema (DESIGN, not applied anywhere). PostgreSQL 15+.
-- See docs/admin/cms-v1-round2.md §5–§6. Conventions: ids are ULIDs (text) except release ids (bigint sequence, exposed as decimal
-- strings); timestamps are timestamptz; nothing here stores a secret (no INK token, no OIDC secret, no session token in clear).

create table schema_migration (
  version    text primary key,
  applied_at timestamptz not null default now()
);

-- ── People ─────────────────────────────────────────────────────────────────────────────────────────────────
create table admin_user (
  id            text primary key check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  email         text not null unique check (email = lower(email) and email ~ '^[^@[:space:]]+@[^@[:space:]]+$'),
  name          text check (char_length(name) <= 120),
  role          text not null check (role in ('owner', 'editor')),
  -- Regions an editor may touch. 'global' is deliberately not allowed: global config, tracking and permissions are owner-only (D7).
  scopes        text[] not null default '{}' check (scopes <@ array['sul', 'norte', 'centro-oeste']),
  active        boolean not null default true,
  created_at    timestamptz not null default now(),
  last_login_at timestamptz,
  check (role = 'owner' or cardinality(scopes) > 0)
);

-- Server-side sessions. Only the sha256 of the cookie token is stored: a database leak cannot be replayed as a login.
create table admin_session (
  token_hash text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  user_id    text not null references admin_user (id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null check (expires_at > created_at)
);
create index admin_session_user_idx on admin_session (user_id);
create index admin_session_expiry_idx on admin_session (expires_at);

-- ── Releases (immutable snapshots) ─────────────────────────────────────────────────────────────────────────
create sequence release_id_seq;

create table release (
  id            bigint primary key default nextval('release_id_seq'),
  parent_id     bigint references release (id),
  kind          text not null check (kind in ('seed', 'publish', 'rollback')),
  -- pending: written to Postgres, file not yet confirmed. live: promoted (it was, or is, the served release; `release_head` says which).
  status        text not null default 'pending' check (status in ('pending', 'live', 'failed')),
  bundle        jsonb not null,                       -- PublishedBundle (all scopes + resolved media table); tens of KB
  checksum      text not null check (checksum ~ '^[0-9a-f]{64}$'),
  scopes_changed text[] not null default '{}',
  note          text check (char_length(note) <= 500),
  diff          jsonb,                                -- redacted diff vs parent: field paths and old/new values, never a secret
  failed_reason text,
  created_by    text references admin_user (id),
  created_at    timestamptz not null default now(),
  promoted_at   timestamptz,
  check (status <> 'live' or promoted_at is not null),
  check (status <> 'failed' or failed_reason is not null)
);
create index release_created_idx on release (created_at desc);

-- At most ONE publish in flight. Combined with `select … for update` on release_head it serialises concurrent publishers.
create unique index release_one_pending on release ((true)) where status = 'pending';

-- A release's content never changes after it is written; only its lifecycle columns do. History is never deleted.
create function release_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'release rows are append-only';
  end if;
  if new.bundle is distinct from old.bundle or new.checksum is distinct from old.checksum or new.kind is distinct from old.kind
     or new.parent_id is distinct from old.parent_id or new.scopes_changed is distinct from old.scopes_changed then
    raise exception 'release content is immutable';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'a % release cannot change status', old.status;
  end if;
  return new;
end $$;
create trigger release_guard_trg before update or delete on release for each row execute function release_guard();

-- The head: which release is live. A single row.
create table release_head (
  singleton     boolean primary key default true check (singleton),
  release_id    bigint not null references release (id),
  file_checksum text,                                 -- checksum of the published.json last written; drift detection
  revalidated   boolean not null default false,       -- ISR cache invalidated since the head last moved?
  updated_at    timestamptz not null default now()
);

create function release_head_guard() returns trigger language plpgsql as $$
begin
  if (select status from release where id = new.release_id) <> 'live' then
    raise exception 'the head can only point to a live release';
  end if;
  return new;
end $$;
create trigger release_head_guard_trg before insert or update on release_head for each row execute function release_head_guard();

-- ── Drafts (one document per scope) ────────────────────────────────────────────────────────────────────────
create table config_draft (
  scope           text primary key check (scope in ('global', 'sul', 'norte', 'centro-oeste')),
  doc             jsonb not null,                     -- ScopeDoc
  rev             integer not null default 1 check (rev >= 1),   -- optimistic lock: `update … where scope = $1 and rev = $2`
  base_release_id bigint references release (id),
  updated_by      text references admin_user (id),
  updated_at      timestamptz not null default now()
);

-- ── Media ───────────────────────────────────────────────────────────────────────────────────────────────────
create table media_asset (
  id            text primary key check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  sha256        text not null unique check (sha256 ~ '^[0-9a-f]{64}$'),
  kind          text not null check (kind in ('upload', 'legacy-public')),
  original_key  text,                                 -- private object in R2 (uploads)
  public_path   text check (public_path ~ '^/[A-Za-z0-9_./-]+$' and public_path not like '%..%'),  -- /banners/sul/… (migration seed)
  mime          text not null check (mime in ('image/png', 'image/jpeg', 'image/webp')),
  bytes         integer not null check (bytes > 0 and bytes <= 8388608),
  width         integer not null check (width between 1 and 6000),
  height        integer not null check (height between 1 and 6000),
  avg_luminance real check (avg_luminance between 0 and 1),
  variants      jsonb not null default '[]',          -- [{ "w": 1080, "format": "webp", "key": "media/<sha256>/1080.webp" }]
  status        text not null default 'processing' check (status in ('processing', 'ready', 'rejected')),
  reject_reason text,
  created_by    text references admin_user (id),
  created_at    timestamptz not null default now(),
  deleted_at    timestamptz,
  check ((kind = 'upload' and original_key is not null) or (kind = 'legacy-public' and public_path is not null)),
  check (status <> 'rejected' or reject_reason is not null)
);

-- ── Audit (append-only) ─────────────────────────────────────────────────────────────────────────────────────
create table audit_log (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  actor  text not null,                               -- admin_user.id, or 'system' for reconciliation
  action text not null check (action in ('login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile', 'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync')),
  scope  text,
  target text,
  meta   jsonb                                        -- no secrets, no tokens, no payload bodies
);
create index audit_log_at_idx on audit_log (at desc);
create index audit_log_scope_idx on audit_log (scope, at desc);

create function audit_log_guard() returns trigger language plpgsql as $$
begin
  raise exception 'audit_log is append-only';
end $$;
create trigger audit_log_guard_trg before update or delete on audit_log for each row execute function audit_log_guard();

insert into schema_migration (version) values ('0001_init');
