-- Development / CI only. Puts the 0004 shape back (statuses are mapped to their closest old name; contact data and the new history are dropped).
delete from customization_request_event where action in ('note', 'product-link');
delete from audit_log where action in ('request.note', 'request.product');
drop index if exists customization_request_open_idx;
alter table customization_request drop constraint customization_request_status_check;
update customization_request set status = case status
  when 'received' then 'submitted'
  when 'inCreation' then 'inReview'
  when 'artReady' then 'inReview'
  when 'customerContacted' then 'inReview'
  when 'closed' then 'fulfilled'
  else status end;
-- 0004 required an order for 'linkedToInkOrder' and never produced 'fulfilled' without going through review; the closest safe mapping is the untouched state.
update customization_request set status = 'submitted' where status = 'fulfilled' and order_number is null;
update customization_request set status = 'linkedToInkOrder' where status = 'fulfilled' and order_number is not null;
alter table customization_request alter column status set default 'submitted';
alter table customization_request add constraint customization_request_status_check check (status in ('submitted', 'awaitingOrderLink', 'inReview', 'linkedToInkOrder', 'fulfilled', 'cancelled'));
alter table customization_request_event drop constraint customization_request_event_action_check;
alter table customization_request_event add constraint customization_request_event_action_check check (action in ('created', 'status', 'linked', 'replaced'));
alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge'
));
alter table customization_request
  drop constraint customization_request_product_link_check,
  drop constraint customization_request_email_check,
  drop constraint customization_request_whatsapp_check,
  drop constraint customization_request_contact_check,
  drop column product_link_at, drop column product_link_by, drop column product_link,
  drop column contacted_at, drop column contact_notice_version, drop column contact_confirmed_at,
  drop column customer_email, drop column customer_whatsapp, drop column customer_name;
delete from schema_migration where version = '0005_customization_contact_workflow';
