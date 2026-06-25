import { useState } from 'react';
import { Lock, Eye, EyeOff } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function ResetPasswordPage() {
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    if (error) setError(error.message);
    else setDone(true);
    setLoading(false);
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(145deg, #0077B6 0%, #00B4D8 50%, #2EC4B6 100%)' }}
    >
      <div className="text-center mb-8">
        <div className="text-7xl mb-3 drop-shadow-lg">🔒</div>
        <h1 className="text-white text-3xl font-bold tracking-tight drop-shadow">Reset Password</h1>
        <p className="text-white/70 mt-2">Choose a new password for your account</p>
      </div>

      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl p-6">
        {done ? (
          <div className="text-center py-4 space-y-4">
            <div className="text-5xl">✅</div>
            <p className="font-semibold text-slate-700">Password updated!</p>
            <p className="text-sm text-slate-500">You're now signed in with your new password.</p>
            <button
              onClick={() => window.location.replace('/')}
              className="w-full py-3 rounded-xl font-bold text-white"
              style={{ background: 'linear-gradient(135deg, #0077B6, #00B4D8)' }}
            >
              Go to App
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="field-label">New Password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'} required minLength={6}
                  autoComplete="new-password"
                  value={password} onChange={e => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="input-base pl-9 pr-10"
                />
                <button
                  type="button" onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="text-xs text-slate-400 mt-1">Minimum 6 characters</p>
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit" disabled={loading}
              className="w-full py-3 rounded-xl font-bold text-white text-base transition-all active:scale-95 disabled:opacity-60"
              style={{ background: 'linear-gradient(135deg, #0077B6, #00B4D8)' }}
            >
              {loading ? '...' : 'Update Password'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
