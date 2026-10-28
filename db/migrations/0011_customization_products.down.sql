-- Development / CI only. The record of the products created at INK is lost (the products themselves stay at INK: it has no DELETE).
drop table if exists customization_product;
delete from schema_migration where version = '0011_customization_products';
