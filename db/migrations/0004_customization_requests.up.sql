-- Personalization requests (what a customer typed on a model's page) and the audit actions of pages / requests. LOCAL migration: written and validated
-- here, applied to a real database only by the owner (see docs/admin/cms-hotpages-personalizacao-round.md).
create table customization_request (
  id                  text primary key check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  token_hash          text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),   -- sha256 of the reference the customer holds; the reference itself is never stored
  region              text not null check (region in ('sul', 'norte', 'centro-oeste')),
  customizer_id       text not null,
  customizer_slug     text not null,
  customizer_name     text not null,
  customizer_version  integer not null check (customizer_version >= 1),
  snapshot            jsonb not null,                                              -- the model (labels, limits) as it was when the request was made
  request_values      jsonb not null,                                              -- what the customer typed
  status              text not null default 'submitted' check (status in ('submitted', 'awaitingOrderLink', 'inReview', 'linkedToInkOrder', 'fulfilled', 'cancelled')),
  order_store         text check (order_store in ('use-sul', 'use-norte', 'use-centro')),
  order_number        text check (order_number ~ '^[A-Za-z0-9-]{3,40}$'),
  order_linked_by     text,
  order_linked_at     timestamptz,
  idempotency_key     text not null check (idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$'),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  expires_at          timestamptz not null,
  unique (region, idempotency_key),                                                 -- a double click or a retry can never create a second request
  check ((order_number is null) = (order_store is null)),
  check (status <> 'linkedToInkOrder' or order_number is not null)
);
create index customization_request_created_idx on customization_request (created_at desc);
create index customization_request_status_idx on customization_request (region, status);
-- One INK order belongs to at most one request.
create unique index customization_request_order_uidx on customization_request (order_store, order_number) where order_number is not null;

create table customization_request_event (
  id          bigserial primary key,
  request_id  text not null references customization_request (id) on delete cascade,
  at          timestamptz not null default now(),
  actor       text not null,
  action      text not null check (action in ('created', 'status', 'linked', 'replaced')),
  detail      text
);
create index customization_request_event_idx on customization_request_event (request_id, id);

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge'
));
