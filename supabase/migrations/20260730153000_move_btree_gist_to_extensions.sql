-- Keep extensions outside public so application objects and extension-owned
-- functions have a clear ownership boundary.
create schema if not exists extensions;

do $$
declare
  extension_schema text;
begin
  select n.nspname
    into extension_schema
  from pg_extension e
  join pg_namespace n on n.oid = e.extnamespace
  where e.extname = 'btree_gist';

  if extension_schema is null then
    create extension btree_gist with schema extensions;
  elsif extension_schema <> 'extensions' then
    alter extension btree_gist set schema extensions;
  end if;
end
$$;
