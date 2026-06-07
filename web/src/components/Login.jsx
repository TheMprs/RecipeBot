import { useState } from 'react';
import { supabase } from '../supabaseClient';

export default function Login({ onLoginSuccess }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const handleGoogleSignIn = async () => {
    setLoading(true);
    setError(null);

    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin,
        },
      });
      if (error) throw error;
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div 
      className="bg-white rounded-3xl shadow-2xl w-96 max-w-[90vw] p-8 sm:p-10"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="text-center mb-8">
        <h2 className="text-3xl font-bold text-[#3d3429] mb-2">Welcome Back</h2>
        <p className="text-[#7a7265] text-sm">Sign in to your recipe collection</p>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-xl">
          <p className="text-red-700 text-sm text-center">{error}</p>
        </div>
      )}

      <button
        onClick={handleGoogleSignIn}
        disabled={loading}
        className="w-full bg-gradient-to-r from-[#e67e22] to-[#cf711f] text-white p-4 rounded-2xl hover:from-[#cf711f] hover:to-[#b8621a] disabled:opacity-50 font-semibold transition-all flex items-center justify-center gap-3 mb-6 shadow-md hover:shadow-lg"
      >
        {loading ? (
          <>
            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            <span>Signing in...</span>
          </>
        ) : (
          <>
            <svg className="w-5 h-5" viewBox="0 0 24 24" fill="currentColor">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span>Sign in with Google</span>
          </>
        )}
      </button>

      <p className="text-center text-xs text-[#7a7265]">
        You'll be securely authenticated through Google
      </p>
    </div>
  );
}