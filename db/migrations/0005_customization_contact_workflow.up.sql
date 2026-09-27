-- Manual-contact workflow for personalization requests (docs/admin/cms-hotpages-personalizacao-release-gate.md). ADDITIVE on top of 0004: the request now carries
-- the customer's contact (name + WhatsApp and/or e-mail + the confirmation), the team's contact date and an optional product link typed by hand, and the statuses
-- follow "received → in creation → art ready → customer contacted → closed". LOCAL migration: validated here, applied to a real database only by the owner.
-- Nothing is deleted: the legacy order columns and the 'linked' history stay in place for the record, but the product no longer reads or writes them.

alter table customization_request
  add column customer_name           text,
  add column customer_whatsapp       text,
  add column customer_email          text,
  add column contact_confirmed_at    timestamptz,
  add column contact_notice_version  text,
  add column contacted_at            timestamptz,
  add column product_link            text,
  add column product_link_by         text,
  add column product_link_at         timestamptz;

-- A request that has a contact has a name, at least one valid channel and the explicit confirmation. (Requests made before this migration have none.)
alter table customization_request add constraint customization_request_contact_check check (
  customer_name is null or (
    char_length(customer_name) between 2 and 80
    and (customer_whatsapp is not null or customer_email is not null)
    and contact_confirmed_at is not null
    and contact_notice_version is not null
  )
);
alter table customization_request add constraint customization_request_whatsapp_check check (customer_whatsapp is null or customer_whatsapp ~ '^\+[1-9][0-9]{7,14}$');
alter table customization_request add constraint customization_request_email_check check (customer_email is null or (char_length(customer_email) <= 254 and customer_email ~ '^[^[:space:]<>@]+@[^[:space:]<>@]+$'));
-- The product link is https on the request's OWN region's INK store, nothing else (defence in depth: the application validates it first).
alter table customization_request add constraint customization_request_product_link_check check (
  product_link is null or (
    char_length(product_link) <= 500
    and product_link !~ '[[:space:]<>"'']'
    and (
      (region = 'sul' and product_link ~ '^https://www\.usesul\.com\.br([/?]|$)')
      or (region = 'norte' and product_link ~ '^https://www\.usenorte\.com\.br([/?]|$)')
      or (region = 'centro-oeste' and product_link ~ '^https://www\.usecentro\.com\.br([/?]|$)')
    )
  )
);

-- Statuses: the old ones are renamed in place (nothing is lost; the history keeps its original wording).
alter table customization_request drop constraint customization_request_status_check;
update customization_request set status = case status
  when 'submitted' then 'received'
  when 'awaitingOrderLink' then 'received'
  when 'inReview' then 'inCreation'
  when 'linkedToInkOrder' then 'closed'
  when 'fulfilled' then 'closed'
  else status end;
alter table customization_request alter column status set default 'received';
alter table customization_request add constraint customization_request_status_check check (status in ('received', 'inCreation', 'artReady', 'customerContacted', 'closed', 'cancelled'));
create index customization_request_open_idx on customization_request (region) where status in ('received', 'inCreation', 'artReady');

alter table customization_request_event drop constraint customization_request_event_action_check;
alter table customization_request_event add constraint customization_request_event_action_check check (action in ('created', 'status', 'linked', 'replaced', 'note', 'product-link'));

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge', 'request.note', 'request.product'
));
