-- Development / CI only. Never run against a database that holds real releases or audit history.
drop table if exists audit_log, media_asset, config_draft, release_head, admin_session cascade;
drop table if exists release cascade;
drop sequence if exists release_id_seq;
drop table if exists admin_user cascade;
drop function if exists release_guard(), release_head_guard(), audit_log_guard();
drop table if exists schema_migration;
