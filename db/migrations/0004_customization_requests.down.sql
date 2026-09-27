-- Development / CI only.
alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in ('login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile', 'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete'));
drop table if exists customization_request_event;
drop table if exists customization_request;
delete from schema_migration where version = '0004_customization_requests';
