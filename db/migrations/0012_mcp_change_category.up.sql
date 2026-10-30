-- The MCP connector shows or hides a collection at INK (docs/mcp/README.md §9): a confirmed change of its own kind, `category`, with the same
-- preview → approval → single-use code as the others. Only the collection's visibility (`is_available`) is ever sent, never its product list.
-- LOCAL migration: validated here, applied to a real database only by the owner. Without it a category preview cannot be stored (the tool refuses).
alter table mcp_change drop constraint mcp_change_kind_check;
alter table mcp_change add constraint mcp_change_kind_check check (kind in ('product', 'order_items', 'exchange', 'category'));

insert into schema_migration (version) values ('0012_mcp_change_category') on conflict do nothing;
