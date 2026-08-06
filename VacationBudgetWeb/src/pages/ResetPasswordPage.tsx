import { useState } from 'react';
import { Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkPassword, isPasswordValid, PASSWORD_RULES } from '../utils/passwordRules';

export function ResetPasswordPage() {
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [showPw,    setShowPw]    = useState(false);
  const [showConf,  setShowConf]  = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState('');
  const [done,      setDone]      = useState(false);
  const [pwTouched, setPwTouched] = useState(false);

  const checks = checkPassword(password);
  const pwValid = isPasswordValid(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (!pwValid) { setError('Password does not meet all requirements.'); return; }
    if (password !== confirm) { setError('Passwords do not match.'); return; }

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
            {/* New password */}
            <div>
              <label className="field-label">New password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showPw ? 'text' : 'password'} required
                  autoComplete="new-password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setPwTouched(true); }}
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

              {pwTouched && (
                <ul className="mt-2 space-y-1">
                  {PASSWORD_RULES.map(({ key, label }) => (
                    <li key={key} className={`flex items-center gap-1.5 text-xs ${checks[key] ? 'text-emerald-600' : 'text-slate-400'}`}>
                      {checks[key]
                        ? <Check size={12} className="shrink-0" />
                        : <X size={12} className="shrink-0" />}
                      {label}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Confirm password */}
            <div>
              <label className="field-label">Confirm new password</label>
              <div className="relative">
                <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type={showConf ? 'text' : 'password'} required
                  autoComplete="new-password"
                  value={confirm} onChange={e => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className={`input-base pl-9 pr-10 ${
                    confirm && confirm !== password ? 'border-red-300 focus:ring-red-200' : ''
                  }`}
                />
                <button
                  type="button" onClick={() => setShowConf(!showConf)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showConf ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {confirm && confirm !== password && (
                <p className="text-xs text-red-500 mt-1">Passwords do not match</p>
              )}
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
                <span>⚠️</span> {error}
              </div>
            )}

            <button
              type="submit" disabled={loading || !pwValid || password !== confirm}
              className="w-full py-3 rounded-xl font-bold text-white text-base transition-all active:scale-95 disabled:opacity-50"
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
