-- Partner applications from the "Seja parceiro" page (/<region>/seja-parceiro, src/lib/partners). Additive only: one new table and one more audit action.
-- The public action writes here; before this is applied the form answers "não foi possível enviar agora" and nothing is lost on the site.
--   * Asked: name, WhatsApp, city, profile and the explicit authorisation (its wording version). Optional: e-mail, Instagram, followers, message.
--   * Never a tax id, address, bank account or password: the commission terms are agreed in the conversation, in writing.
--   * Kept 365 days; older rows are deleted by the application, except agreed partnerships (status 'partner').
create table partner_application (
  id               text primary key check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  region           text not null check (region in ('sul', 'norte', 'centro-oeste')),
  profile          text not null check (profile in ('ambassador', 'artist', 'collab')),
  name             text not null check (char_length(name) between 2 and 80),
  whatsapp         text not null check (whatsapp ~ '^\+[1-9][0-9]{7,14}$'),
  email            text check (email is null or (char_length(email) <= 254 and email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+$')),
  city             text not null check (char_length(city) between 2 and 80),
  instagram        text check (instagram is null or instagram ~ '^[A-Za-z0-9._]{1,30}$'),
  followers        integer check (followers is null or followers between 0 and 1000000000),
  message          text check (message is null or char_length(message) between 1 and 1000),
  status           text not null default 'new' check (status in ('new', 'talking', 'partner', 'declined')),
  notice_version   text not null check (char_length(notice_version) between 1 and 40),
  idempotency_key  text not null unique check (idempotency_key ~ '^[A-Za-z0-9_-]{16,64}$'),   -- a double click or a retry can never create a second row
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
create index partner_application_created_idx on partner_application (created_at desc);
create index partner_application_new_idx on partner_application (region) where status = 'new';

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge', 'request.note', 'request.product',
  'mcp.authorize', 'mcp.revoke', 'mcp.write', 'partner.status'
));

insert into schema_migration (version) values ('0010_partner_applications') on conflict do nothing;
