-- cook_logs INSERT hardening  (2026-07-29, code-review finding #2)
--
-- The web app clamps cooked_at to [today - 1 year, today] and only lets you log
-- against a visible recipe, but it talks to PostgREST directly with the user's
-- JWT — so a crafted REST call could POST any timestamp, or a recipe_id the
-- user cannot see. Client validation is cosmetic without this.
--
-- A CHECK constraint can't enforce the time bound (Postgres forbids non-immutable
-- now() in CHECK), so the bound lives in the INSERT policy's WITH CHECK, which
-- may use now().
--
-- Existing policies (verified 2026-07-29 via pg_policies) — only INSERT changes:
--   "Users can insert own logs"  INSERT  with_check (auth.uid() = user_id)   <- replaced below
--   "Users can delete own logs"  DELETE  using      (auth.uid() = user_id)   <- already correct, untouched
--   "Users can read own logs"    SELECT  using      (auth.uid() = user_id)   <- untouched
--
-- Run once in the Supabase SQL editor.

drop policy if exists "Users can insert own logs" on public.cook_logs;

create policy "Users can insert own logs" on public.cook_logs
  for insert to authenticated
  with check (
    -- own rows only (unchanged from the original policy)
    auth.uid() = user_id
    -- sane date bounds, mirroring the UI (small future skew tolerated)
    and cooked_at <= now() + interval '1 day'
    and cooked_at >= now() - interval '1 year'
    -- only against a recipe the user can actually see. The subquery is itself
    -- filtered by recipes' SELECT RLS (public + own), so an unreadable private
    -- recipe yields no row and the insert is rejected.
    and exists (
      select 1 from public.recipes r
      where r.id = cook_logs.recipe_id
        and (r.visibility = 'public' or r.user_id = auth.uid())
    )
  );
