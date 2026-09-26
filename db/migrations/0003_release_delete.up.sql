-- The owner may clean up the release history. A release can be deleted unless it is the LIVE head or in flight; everything that pointed at it
-- (a later release's parent, a draft's base) simply loses that pointer. A release's content still never changes after it is written.
alter table release drop constraint release_parent_id_fkey;
alter table release add constraint release_parent_id_fkey foreign key (parent_id) references release (id) on delete set null;
alter table config_draft drop constraint config_draft_base_release_id_fkey;
alter table config_draft add constraint config_draft_base_release_id_fkey foreign key (base_release_id) references release (id) on delete set null;

create or replace function release_guard() returns trigger language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    if old.status = 'pending' then
      raise exception 'a release in flight cannot be deleted';
    end if;
    if exists (select 1 from release_head where release_id = old.id) then
      raise exception 'the live release cannot be deleted';
    end if;
    return old;
  end if;
  -- `parent_id` may only be cleared (the ON DELETE SET NULL of a deleted parent); nothing else about the content may change.
  if new.bundle is distinct from old.bundle or new.checksum is distinct from old.checksum or new.kind is distinct from old.kind
     or new.scopes_changed is distinct from old.scopes_changed or (new.parent_id is distinct from old.parent_id and new.parent_id is not null) then
    raise exception 'release content is immutable';
  end if;
  if old.status <> 'pending' and new.status is distinct from old.status then
    raise exception 'a % release cannot change status', old.status;
  end if;
  return new;
end $$;

alter table audit_log drop constraint audit_log_action_check;
alter table audit_log add constraint audit_log_action_check check (action in (
  'login', 'logout', 'draft.save', 'draft.discard', 'publish', 'rollback', 'publish.failed', 'reconcile',
  'media.upload', 'media.delete', 'user.create', 'user.update', 'user.deactivate', 'catalog.sync', 'collections.sync', 'access.denied', 'release.delete'
));
