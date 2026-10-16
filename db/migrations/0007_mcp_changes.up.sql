-- Confirmed changes of the MCP connector (docs/mcp/README.md §9): a preview stores its plan under a single-use confirmation code (only the
-- sha256 is kept), valid for 10 minutes and for the account that asked for it; confirming moves it pending → applying → applied/partial/
-- failed exactly once. The plan holds INK ids, prices and texts the owner typed — never buyer data. Also: the `origens.write` OAuth scope
-- and the `mcp.write` audit action (one row per confirmed change, with what was sent and what INK answered).
create table mcp_change (
  code_hash   text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  subject     text not null references admin_user (id) on delete cascade,
  client_id   text not null check (char_length(client_id) between 1 and 80),
  kind        text not null check (kind in ('product', 'order_items', 'exchange')),
  store       text not null check (store in ('use-sul', 'use-norte', 'use-centro', 'use-origens')),
  plan        jsonb not null check (jsonb_typeof(plan) = 'object'),
  status      text not null default 'pending' check (status in ('pending', 'applying', 'applied', 'partial', 'failed')),
  result      jsonb check (result is null or jsonb_typeof(result) = 'object'),
  created_at  timestamptz not null default now(),
  expires_at  timestamptz not null,
  applied_at  timestamptz,
  check ((status in ('pending', 'applying')) = (applied_at is null))
);
create index mcp_change_expires_idx on mcp_change (expires_at) where status = 'pending';

alter table mcp_oauth_code drop constraint mcp_oauth_code_scope_check;
alter table mcp_oauth_code add constraint mcp_oauth_code_scope_check check (scope <@ array['origens.read', 'origens.write', 'offline_access']::text[]);
alter table mcp_oauth_token drop constraint mcp_oauth_token_scope_check;
alter table mcp_oauth_token add constraint mcp_oauth_token_scope_check check (scope <@ array['origens.read', 'origens.write', 'offline_access']::text[]);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge', 'request.note', 'request.product',
  'mcp.authorize', 'mcp.revoke', 'mcp.write'
));
