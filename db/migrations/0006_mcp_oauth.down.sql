-- Development / CI only. Every MCP connection is lost (Claude asks to sign in again after the up migration).
delete from audit_log where action in ('mcp.authorize', 'mcp.revoke');
alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge', 'request.note', 'request.product'
));
drop table if exists mcp_oauth_token;
drop table if exists mcp_oauth_code;
drop table if exists mcp_oauth_client;
delete from schema_migration where version = '0006_mcp_oauth';
