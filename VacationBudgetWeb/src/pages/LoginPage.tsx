import { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, Check, X } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { checkPassword, isPasswordValid, PASSWORD_RULES } from '../utils/passwordRules';

type Tab = 'login' | 'signup';

export function LoginPage() {
  const [tab,       setTab]      = useState<Tab>('login');
  const [email,     setEmail]    = useState('');
  const [password,  setPassword] = useState('');
  const [confirm,   setConfirm]  = useState('');
  const [showPw,    setShowPw]   = useState(false);
  const [showConf,  setShowConf] = useState(false);
  const [loading,   setLoading]  = useState(false);
  const [error,     setError]    = useState('');
  const [success,   setSuccess]  = useState('');
  const [pwTouched, setPwTouched] = useState(false);

  function switchTab(t: Tab) {
    setTab(t); setError(''); setSuccess('');
    setPassword(''); setConfirm(''); setPwTouched(false);
  }

  const checks = checkPassword(password);
  const pwValid = isPasswordValid(password);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(''); setSuccess('');

    if (tab === 'signup') {
      if (!pwValid) { setError('Password does not meet all requirements.'); return; }
      if (password !== confirm) { setError('Passwords do not match.'); return; }
    }

    setLoading(true);
    if (tab === 'login') {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) setError(error.message);
    } else {
      const { error } = await supabase.auth.signUp({ email, password });
      if (error) setError(error.message);
      else setSuccess('Account created! You can now sign in.');
    }
    setLoading(false);
  }

  async function handleForgotPassword() {
    if (!email) { setError('Enter your email address first.'); return; }
    await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}`,
    });
    setSuccess('Password reset link sent to your email.');
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center p-4"
      style={{ background: 'linear-gradient(145deg, #0077B6 0%, #00B4D8 50%, #2EC4B6 100%)' }}
    >
      {/* Branding */}
      <div className="text-center mb-8">
        <div className="text-7xl mb-3 drop-shadow-lg">✈️</div>
        <h1 className="text-white text-4xl font-bold tracking-tight drop-shadow">Vacation Budget</h1>
        <p className="text-white/70 mt-2 text-lg">Plan. Track. Explore.</p>
      </div>

      {/* Card */}
      <div className="w-full max-w-sm bg-white rounded-3xl shadow-2xl overflow-hidden">
        {/* Tab bar */}
        <div className="flex bg-slate-50 p-1.5 m-4 rounded-2xl">
          {(['login', 'signup'] as Tab[]).map(t => (
            <button
              key={t}
              onClick={() => switchTab(t)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                tab === t ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {t === 'login' ? 'Sign In' : 'Create Account'}
            </button>
          ))}
        </div>

        <form onSubmit={handleSubmit} className="px-6 pb-6 space-y-4">
          {/* Email */}
          <div>
            <label className="field-label">Email address</label>
            <div className="relative">
              <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="email" required autoComplete="email"
                value={email} onChange={e => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="input-base pl-9"
              />
            </div>
          </div>

          {/* Password */}
          <div>
            <label className="field-label">Password</label>
            <div className="relative">
              <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type={showPw ? 'text' : 'password'} required
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
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

            {/* Password requirements — only shown on signup after typing */}
            {tab === 'signup' && pwTouched && (
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

          {/* Confirm password — signup only */}
          {tab === 'signup' && (
            <div>
              <label className="field-label">Confirm password</label>
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
          )}

          {/* Error / success */}
          {error && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-xl p-3 text-sm text-red-600">
              <span>⚠️</span> {error}
            </div>
          )}
          {success && (
            <div className="flex items-start gap-2 bg-green-50 border border-green-200 rounded-xl p-3 text-sm text-green-700">
              <span>✅</span> {success}
            </div>
          )}

          {/* Submit */}
          <button
            type="submit" disabled={loading}
            className="w-full py-3 rounded-xl font-bold text-white text-base transition-all active:scale-95 disabled:opacity-60"
            style={{ background: 'linear-gradient(135deg, #0077B6, #00B4D8)' }}
          >
            {loading ? '...' : tab === 'login' ? 'Sign In' : 'Create Account'}
          </button>

          {/* Forgot password */}
          {tab === 'login' && (
            <button
              type="button" onClick={handleForgotPassword}
              className="w-full text-sm text-slate-400 hover:text-ocean transition-colors py-1"
            >
              Forgot password?
            </button>
          )}
        </form>
      </div>

      <p className="text-white/40 text-xs mt-6">Your data is private and encrypted</p>
    </div>
  );
}
