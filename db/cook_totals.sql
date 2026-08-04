-- Lifetime per-recipe prep totals  (2026-08-04)
--
-- The web app now fetches cook_logs rows only for the last 12 months — that is as
-- far back as the history panel, the heatmap and the drawer can reach, so hauling
-- every row over the wire to display a year of them is waste that grows forever.
--
-- Two numbers still have to be lifetime, though: the ×N badge on a recipe card and
-- the most-prepped podium. Those come from here — one aggregated row per recipe
-- instead of one row per prep.
--
-- Why a function and not `select=recipe_id,count()`: PostgREST aggregate functions
-- are disabled on this project (verified 2026-08-04, PGRST123 "Use of aggregate
-- functions is not allowed"). Supabase turns them off by default because an
-- unbounded aggregate over a large table is a cheap way to burn CPU. A function
-- is the sanctioned way to get one specific aggregate without opening all of them.
--
-- SECURITY INVOKER, so cook_logs' own RLS still applies and this can't become a
-- way to read someone else's history; the auth.uid() filter is the same bound
-- stated explicitly, so the intent survives a policy change.
--
-- Until this is run, the app falls back to counting the 12-month window — nothing
-- breaks, but a user with older history sees smaller numbers than they should.
--
-- Run once in the Supabase SQL editor.

create or replace function public.cook_totals()
returns table (recipe_id uuid, prep_count bigint, last_cooked timestamptz)
language sql
stable
security invoker
set search_path = public
as $$
  select cl.recipe_id, count(*), max(cl.cooked_at)
  from public.cook_logs cl
  where cl.user_id = auth.uid()
  group by cl.recipe_id
$$;

grant execute on function public.cook_totals() to authenticated;

-- Verify (as a logged-in user, from the SQL editor's "run as" or the app):
--   select * from public.cook_totals();
