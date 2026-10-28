-- Direct purchase of personalized shirts (docs/personalizacao-editor.md, "Compra direta"): one row per product created at INK for what a customer typed on
-- one art version. The row is both the job that makes the product (rendered on the server, created hidden at INK, followed until its photo is ready) and,
-- once made, the product every later customer with the same name reuses (unique dedupe_key). INK has no DELETE: the rows are the owner's record of them.
-- LOCAL migration: validated here, applied to a real database only by the owner. Without it the model pages keep the request flow.
create table customization_product (
  id               text primary key check (id ~ '^[0-9A-HJKMNP-TV-Z]{26}$'),
  dedupe_key       text not null unique check (dedupe_key ~ '^[0-9a-f]{64}$'),
  region           text not null check (region in ('sul', 'norte', 'centro-oeste')),
  customizer_id    text not null,
  customizer_slug  text not null,
  name             text not null check (char_length(name) between 1 and 120),
  art_label        text not null check (char_length(art_label) between 1 and 90),
  field_values     jsonb not null,
  template_id      text not null,
  light_template_id text,
  garment          text not null check (garment in ('camiseta', 'infantil')),
  product_type_id  integer not null check (product_type_id > 0),
  price            text not null check (price ~ '^\d{1,4}\.\d{2}$'),
  status           text not null default 'queued' check (status in ('queued', 'creating', 'photos', 'ready', 'failed', 'check')),
  ink_product_id   text check (ink_product_id ~ '^\d{1,20}$'),
  ink_url          text check (ink_url is null or (char_length(ink_url) <= 500 and ink_url ~ '^https://')),
  ink_image_url    text check (ink_image_url is null or (char_length(ink_image_url) <= 500 and ink_image_url ~ '^https://')),
  error            text check (error is null or char_length(error) <= 500),
  attempts         integer not null default 0 check (attempts >= 0),
  lease_until      timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  ink_created_at   timestamptz,
  ready_at         timestamptz,
  -- Once INK holds the product, the row keeps its id and link; "ready" always has the link.
  check (status in ('queued', 'creating', 'failed', 'check') or ink_product_id is not null),
  check (status <> 'ready' or ink_url is not null)
);
create index customization_product_created_idx on customization_product (created_at desc);
create index customization_product_status_idx on customization_product (region, status);

insert into schema_migration (version) values ('0011_customization_products') on conflict do nothing;
