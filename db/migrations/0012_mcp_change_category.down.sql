-- Development / CI only. The record of the category changes is dropped (what was changed at INK stays as it is).
delete from mcp_change where kind = 'category';
alter table mcp_change drop constraint mcp_change_kind_check;
alter table mcp_change add constraint mcp_change_kind_check check (kind in ('product', 'order_items', 'exchange'));
delete from schema_migration where version = '0012_mcp_change_category';
