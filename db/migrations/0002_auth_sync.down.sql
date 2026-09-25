-- Development / CI only.
drop table if exists sync_run;
alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in ('login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile', 'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync'));
alter table media_asset drop column label;
alter table media_asset drop constraint media_asset_mime_check;
alter table media_asset add constraint media_asset_mime_check check (mime in ('image/png', 'image/jpeg', 'image/webp'));
alter table admin_user drop column provider_sub;
delete from schema_migration where version = '0002_auth_sync';
