-- Feed IDs are additive; original provider/work/library identities stay unchanged.
alter table public.mitv_catalog_feed_cache
  drop constraint mitv_catalog_feed_cache_category_check,
  add constraint mitv_catalog_feed_cache_category_check
    check(category ~ '^browse-[a-z][a-z-]{0,47}$');
