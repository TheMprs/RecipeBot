-- PENDING SQL — run once in the Supabase SQL editor, top to bottom.
-- Everything here is DB-only; no app code depends on running it in order.
-- db/cook_logs_guard.sql is a separate file, still pending too — run it as well.

-- 1) recipes.visibility: default public + NOT NULL  (roadmap, unconfirmed)
update public.recipes set visibility = 'public' where visibility is null;
alter table public.recipes
  alter column visibility set default 'public',
  alter column visibility set not null;

-- 2) recipe_categories INSERT IDOR fix (2026-07-04 finding, root cause).
--    Old policy checked only CATEGORY ownership → a user could link their own
--    category to someone else's private recipe. Now require BOTH.
--    Bot writes use the service key and bypass RLS, so they are unaffected.
drop policy if exists users_insert_recipe_categories on public.recipe_categories;
create policy users_insert_recipe_categories on public.recipe_categories
  for insert to authenticated
  with check (
    exists (select 1 from public.categories c
            where c.id = recipe_categories.category_id and c.user_id = auth.uid())
    and exists (select 1 from public.recipes r
            where r.id = recipe_categories.recipe_id and r.user_id = auth.uid())
  );

-- 3) followers: cascade FKs + no self-follow + dedupe.
--    Flagged 2026-06-23 as "do this when the feature ships" — it ships now.
alter table public.followers
  drop constraint if exists followers_follower_id_fkey,
  drop constraint if exists followers_following_id_fkey;
alter table public.followers
  add constraint followers_follower_id_fkey
    foreign key (follower_id) references public.users(id) on delete cascade,
  add constraint followers_following_id_fkey
    foreign key (following_id) references public.users(id) on delete cascade;

delete from public.followers where follower_id = following_id;
alter table public.followers
  drop constraint if exists followers_no_self,
  add constraint followers_no_self check (follower_id <> following_id);

create unique index if not exists followers_unique
  on public.followers (follower_id, following_id);

-- 4) Length CHECK constraints (2026-07-04, never run). Cheap backstop for the
--    caps the recipe form already enforces client-side.
alter table public.users
  drop constraint if exists users_bio_len,
  add constraint users_bio_len check (bio is null or char_length(bio) <= 300),
  drop constraint if exists users_display_name_len,
  add constraint users_display_name_len
    check (display_name is null or char_length(display_name) <= 60);

alter table public.recipes
  drop constraint if exists recipes_name_len,
  add constraint recipes_name_len check (char_length(name) <= 120);

-- Verify (expect: visibility not null w/ default, 2 followers FKs = CASCADE,
-- recipe_categories INSERT policy naming both tables):
--   select column_name, is_nullable, column_default from information_schema.columns
--     where table_name = 'recipes' and column_name = 'visibility';
--   select conname, confdeltype from pg_constraint where conrelid = 'public.followers'::regclass;
--   select policyname, with_check from pg_policies where tablename in ('recipe_categories','cook_logs');
