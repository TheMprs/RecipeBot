import { User, X, Users } from 'lucide-react';
import { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { supabaseUrl, supabaseKey } from '../supabaseClient';

const PAGE = 25;

// Lists a profile's followers or the accounts it follows. Rows link to each profile.
// Loads 25 at a time; fetches the next page when the list is scrolled to the bottom.
export function FollowListModal({ profileId, mode, language, onClose, onNavigate }) {
  const isRtl = language !== 'en';
  const [users, setUsers] = useState(null); // null = initial load, [] = empty
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const [error, setError] = useState(false);
  const offsetRef = useRef(0);
  const inFlightRef = useRef(false); // guard against overlapping loads (StrictMode remount, rapid scroll)
  const followers = mode === 'followers';

  const loadPage = useCallback(async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    // Embed the user row on the *other* side of the edge via column-name FK hints.
    const filter = followers ? `following_id=eq.${profileId}` : `follower_id=eq.${profileId}`;
    const hint = followers ? 'follower_id' : 'following_id';
    const offset = offsetRef.current;
    try {
      const res = await fetch(
        `${supabaseUrl}/rest/v1/followers?${filter}&select=users!${hint}(id,username,display_name,avatar_url)&order=created_at.desc&limit=${PAGE}&offset=${offset}`,
        { headers: { 'apikey': supabaseKey, 'Authorization': `Bearer ${supabaseKey}` } }
      );
      if (!res.ok) throw new Error(res.status);
      const rows = await res.json();
      const page = rows.map(r => r.users).filter(Boolean);
      offsetRef.current = offset + rows.length;
      setHasMore(rows.length === PAGE);
      setError(false);
      setUsers(prev => (prev || []).concat(page));
    } catch {
      setHasMore(false);
      // Only surface the error banner on the first page — a failed *load-more* keeps the
      // rows already shown rather than blowing them away.
      if (offset === 0) setError(true);
      setUsers(prev => prev || []);
    } finally {
      inFlightRef.current = false;
    }
  }, [profileId, followers]);

  const retry = () => { setError(false); setUsers(null); offsetRef.current = 0; loadPage(); };

  useEffect(() => { loadPage(); }, [loadPage]);

  const onScroll = async (e) => {
    if (loadingMore || !hasMore) return;
    const el = e.currentTarget;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 80) {
      setLoadingMore(true);
      await loadPage();
      setLoadingMore(false);
    }
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-[80] backdrop-blur-sm bg-black/30" onClick={onClose} />
      <div className="fixed inset-0 z-[90] flex items-center justify-center p-4" onClick={onClose}>
        <div
          onClick={e => e.stopPropagation()}
          className="bg-white rounded-3xl shadow-xl w-full max-w-md overflow-hidden flex flex-col max-h-[80vh]"
          style={{ direction: isRtl ? 'rtl' : 'ltr' }}
        >
          {/* System band — espresso, matches settings/login modals */}
          <div className="px-6 pt-5 pb-6 band-espresso">
            <div className="flex items-center justify-end">
              <button onClick={onClose} className="text-white/85 hover:text-white hover:bg-white/15 rounded-xl p-1.5 transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="flex flex-col items-center mt-1">
              <span className="w-14 h-14 rounded-2xl bg-white/15 flex items-center justify-center mb-2.5">
                <Users className="w-7 h-7 text-white" />
              </span>
              <h2 className="text-xl font-bold text-white">
                {followers
                  ? (language === 'en' ? 'Followers' : 'עוקבים')
                  : (language === 'en' ? 'Following' : 'נעקבים')}
              </h2>
            </div>
          </div>

          <div className="overflow-y-auto p-2" onScroll={onScroll}>
            {error ? (
              <div className="text-center py-8 px-4">
                <p className="text-sm text-muted mb-3">
                  {language === 'en' ? "Couldn't load this list." : 'טעינת הרשימה נכשלה.'}
                </p>
                <button
                  onClick={retry}
                  className="text-sm font-semibold text-brand hover:text-brand-dark rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                >
                  {language === 'en' ? 'Try again' : 'נסה שוב'}
                </button>
              </div>
            ) : users === null ? (
              // Skeleton rows shaped like the real rows (avatar + two text lines)
              Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="w-full flex items-center gap-3 p-2.5 animate-pulse" style={{ direction: 'ltr' }}>
                  <span className="w-11 h-11 flex-shrink-0 rounded-full bg-cream-dark" />
                  <span className="min-w-0 flex-1">
                    <span className="block h-3.5 w-32 max-w-[60%] rounded bg-cream-dark mb-1.5" />
                    <span className="block h-3 w-20 max-w-[40%] rounded bg-cream-dark" />
                  </span>
                </div>
              ))
            ) : users.length === 0 ? (
              <p className="text-sm text-muted text-center py-8">
                {followers
                  ? (language === 'en' ? 'No followers yet.' : 'אין עוקבים עדיין.')
                  : (language === 'en' ? 'Not following anyone yet.' : 'עדיין לא עוקב אחרי אף אחד.')}
              </p>
            ) : (
              <>
                {users.map(u => (
                  <button
                    key={u.id}
                    onClick={() => { onNavigate(u); onClose(); }}
                    className="w-full flex items-center gap-3 p-2.5 rounded-2xl hover:bg-cream-dark transition-colors text-start focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
                    style={{ direction: 'ltr' }}
                  >
                    <span className="w-11 h-11 flex-shrink-0 rounded-full overflow-hidden bg-brand/10 flex items-center justify-center">
                      {u.avatar_url ? (
                        <img src={u.avatar_url} alt={u.display_name} referrerPolicy="no-referrer" className="w-full h-full object-cover"
                          onError={e => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }} />
                      ) : null}
                      <span className={`w-full h-full items-center justify-center ${u.avatar_url ? 'hidden' : 'flex'}`}>
                        <User className="w-5 h-5 text-brand" />
                      </span>
                    </span>
                    <span className="min-w-0">
                      <span className="block font-semibold text-ink truncate">{u.display_name || u.username}</span>
                      <span className="block text-xs text-muted truncate">@{u.username}</span>
                    </span>
                  </button>
                ))}
                {loadingMore && (
                  <p className="text-xs text-muted text-center py-3">{language === 'en' ? 'Loading…' : 'טוען…'}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </>,
    document.body
  );
}
