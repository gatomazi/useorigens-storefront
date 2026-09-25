-- CMS V1 — Round 6: production integration. Additive only (no data is rewritten).
--   * admin_user.provider_sub: the identity provider's immutable account id (`sub`, Login with Railway) is bound to the allowlisted user on
--     first login, so a later takeover of the same e-mail address by a different account is refused.
--   * media_asset: AVIF accepted as an input type; a display label.
--   * audit_log: two more actions.
--   * sync_run: one row per catalog/collections sync, also the "already running" lock (unique partial index).

alter table admin_user add column provider_sub text unique check (provider_sub is null or char_length(provider_sub) between 1 and 255);

alter table media_asset drop constraint media_asset_mime_check;
alter table media_asset add constraint media_asset_mime_check check (mime in ('image/png', 'image/jpeg', 'image/webp', 'image/avif'));
alter table media_asset add column label text check (label is null or char_length(label) <= 80);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied'
));

create table sync_run (
  id           bigint generated always as identity primary key,
  kind         text not null check (kind in ('catalog', 'collections')),
  status       text not null default 'running' check (status in ('running', 'succeeded', 'failed')),
  started_at   timestamptz not null default now(),
  finished_at  timestamptz,
  requested_by text not null,
  summary      jsonb,                                 -- counts and durations only; never a token
  error        text check (error is null or char_length(error) <= 500),
  check (status = 'running' or finished_at is not null)
);
-- At most one running sync per kind, enforced by the database, not by process memory.
create unique index sync_run_one_running on sync_run (kind) where status = 'running';
create index sync_run_started_idx on sync_run (kind, started_at desc);

insert into schema_migration (version) values ('0002_auth_sync') on conflict do nothing;
