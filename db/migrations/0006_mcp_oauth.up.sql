-- OAuth 2.1 for the MCP connector (docs/mcp/README.md): clients registered by Claude (DCR), one-time authorization codes and the tokens
-- issued from them. Codes and tokens are stored ONLY as sha256; the values themselves leave the server once, in the HTTP response.
create table mcp_oauth_client (
  client_id      text primary key check (client_id ~ '^mcp_[A-Za-z0-9_-]{22,64}$'),
  client_name    text check (client_name is null or char_length(client_name) between 1 and 100),
  redirect_uris  jsonb not null check (jsonb_typeof(redirect_uris) = 'array' and jsonb_array_length(redirect_uris) between 1 and 10),
  created_at     timestamptz not null default now(),
  last_used_at   timestamptz
);

create table mcp_oauth_code (
  code_hash       text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id       text not null references mcp_oauth_client (client_id) on delete cascade,
  redirect_uri    text not null check (char_length(redirect_uri) between 1 and 500),
  code_challenge  text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),   -- PKCE S256 only
  scope           text[] not null check (scope <@ array['origens.read', 'offline_access']::text[]),
  resource        text not null check (char_length(resource) between 1 and 300),
  subject         text not null references admin_user (id) on delete cascade,
  family_id       text not null check (family_id ~ '^[A-Za-z0-9_-]{22,64}$'),     -- the tokens issued from this code share it
  expires_at      timestamptz not null,
  used_at         timestamptz,
  created_at      timestamptz not null default now()
);
create index mcp_oauth_code_expires_idx on mcp_oauth_code (expires_at);

create table mcp_oauth_token (
  token_hash  text primary key check (token_hash ~ '^[0-9a-f]{64}$'),
  kind        text not null check (kind in ('access', 'refresh')),
  family_id   text not null check (family_id ~ '^[A-Za-z0-9_-]{22,64}$'),        -- one authorization and every rotation after it
  client_id   text not null references mcp_oauth_client (client_id) on delete cascade,
  subject     text not null references admin_user (id) on delete cascade,
  scope       text[] not null check (scope <@ array['origens.read', 'offline_access']::text[]),
  resource    text not null check (char_length(resource) between 1 and 300),
  expires_at  timestamptz not null,
  revoked_at  timestamptz,
  created_at  timestamptz not null default now()
);
create index mcp_oauth_token_family_idx on mcp_oauth_token (family_id);
create index mcp_oauth_token_expires_idx on mcp_oauth_token (expires_at);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge', 'request.note', 'request.product',
  'mcp.authorize', 'mcp.revoke'
));
