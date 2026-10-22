-- Development / CI only. Every fallback password is lost; people sign in with Railway again.
alter table admin_user drop constraint if exists admin_user_password_set_at_check;
alter table admin_user drop column if exists password_set_at;
alter table admin_user drop column if exists password_hash;
delete from schema_migration where version = '0008_admin_password';
