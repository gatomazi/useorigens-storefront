-- Development / CI only. Pending and applied MCP changes and their audit rows are lost; grants with origens.write are revoked first
-- (the narrowed scope constraint could not hold them).
delete from audit_log where action = 'mcp.write';
alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete',
  'page.create', 'page.archive', 'customizer.save', 'request.status', 'request.link', 'request.purge', 'request.note', 'request.product',
  'mcp.authorize', 'mcp.revoke'
));
delete from mcp_oauth_token where 'origens.write' = any (scope);
delete from mcp_oauth_code where 'origens.write' = any (scope);
alter table mcp_oauth_token drop constraint mcp_oauth_token_scope_check;
alter table mcp_oauth_token add constraint mcp_oauth_token_scope_check check (scope <@ array['origens.read', 'offline_access']::text[]);
alter table mcp_oauth_code drop constraint mcp_oauth_code_scope_check;
alter table mcp_oauth_code add constraint mcp_oauth_code_scope_check check (scope <@ array['origens.read', 'offline_access']::text[]);
drop table if exists mcp_change;
delete from schema_migration where version = '0007_mcp_changes';
