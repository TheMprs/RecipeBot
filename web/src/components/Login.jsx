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
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-96">
        <h2 className="text-2xl font-bold mb-6 text-center">Login</h2>

        {error && <p className="text-red-500 mb-4 text-center text-sm">{error}</p>}

        <button
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full bg-blue-500 text-white p-3 rounded-lg hover:bg-blue-600 disabled:bg-gray-400 font-medium transition-colors flex items-center justify-center gap-2"
        >
          {loading ? 'Signing in...' : '🔐 Sign in with Google'}
        </button>

        <p className="text-center mt-4 text-xs text-gray-500">
          You'll be redirected to Google to sign in securely.
        </p>
      </div>
    </div>
  );
}