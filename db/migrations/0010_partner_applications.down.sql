-- Development / CI only. Every partner application is lost.
drop table if exists partner_application;
delete from audit_log where action = 'partner.status';
alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge', 'request.note', 'request.product',
  'mcp.authorize', 'mcp.revoke', 'mcp.write'
));
delete from schema_migration where version = '0010_partner_applications';
