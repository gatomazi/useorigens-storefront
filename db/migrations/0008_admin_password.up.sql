-- Fallback login (e-mail + password) for when Login with Railway fails. Additive only: two nullable columns on admin_user, nothing rewritten.
--   * password_hash: scrypt, `scrypt:<32 hex salt>:<128 hex hash>`; never the password itself. Null = this person can only use Railway.
--   * password_set_at: when it was last set (shown to the owner on the People page; cleared with the password).
-- The application reads these columns only in dedicated queries, so the panel (and the Railway login) keeps working before this is applied.
-- Audit: no new actions; the password login is `login` with meta.method = 'password', a change is `user.update` with meta.password.

alter table admin_user add column password_hash text check (password_hash is null or password_hash ~ '^scrypt:[0-9a-f]{32}:[0-9a-f]{128}$');
alter table admin_user add column password_set_at timestamptz;
alter table admin_user add constraint admin_user_password_set_at_check check ((password_hash is null) = (password_set_at is null));

insert into schema_migration (version) values ('0008_admin_password') on conflict do nothing;
