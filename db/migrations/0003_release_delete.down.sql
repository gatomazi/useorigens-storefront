-- Development / CI only.
alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in ('login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile', 'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied'));
create or replace function release_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'release rows are append-only';
  end if;
  if new.bundle is distinct from old.bundle or new.checksum is distinct from old.checksum or new.kind is distinct from old.kind
     or new.parent_id is distinct from old.parent_id or new.scopes_changed is distinct from old.scopes_changed then
    raise exception 'release content is immutable';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'a % release cannot change status', old.status;
  end if;
  return new;
end $$;
alter table config_draft drop constraint config_draft_base_release_id_fkey;
alter table config_draft add constraint config_draft_base_release_id_fkey foreign key (base_release_id) references release (id);
alter table release drop constraint release_parent_id_fkey;
alter table release add constraint release_parent_id_fkey foreign key (parent_id) references release (id);
delete from schema_migration where version = '0003_release_delete';
