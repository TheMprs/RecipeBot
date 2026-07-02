import { supabase } from '../supabaseClient'

// The session access token, or throws — the standard guard before any
// authenticated REST call. Replaces the getSession/access_token dance.
export async function getToken() {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session?.access_token) throw new Error('Not authenticated')
  return session.access_token
}
