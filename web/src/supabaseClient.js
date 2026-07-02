import { createClient } from '@supabase/supabase-js';

// Single home for the Supabase env config — import these instead of re-reading
// import.meta.env in every file.
export const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
export const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseKey);
