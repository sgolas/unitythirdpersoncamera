import { createContext, useContext, useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  authLoading: boolean;
  justConfirmed: boolean;
  isPasswordReset: boolean;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null, session: null, authLoading: true,
  justConfirmed: false, isPasswordReset: false,
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [justConfirmed, setJustConfirmed] = useState(false);
  const [isPasswordReset, setIsPasswordReset] = useState(false);

  useEffect(() => {
    // Detect auth type from URL (Supabase appends #type=signup or #type=recovery)
    const hash = window.location.hash;
    const params = new URLSearchParams(hash.slice(1));
    const urlType = params.get('type') ?? new URLSearchParams(window.location.search).get('type');

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setAuthLoading(false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      setSession(session);
      setAuthLoading(false);
      if (event === 'SIGNED_IN' && urlType === 'signup') {
        setJustConfirmed(true);
        // Clear the hash so it doesn't persist on refresh
        window.history.replaceState(null, '', window.location.pathname);
      }
      if (event === 'PASSWORD_RECOVERY' || urlType === 'recovery') {
        setIsPasswordReset(true);
        window.history.replaceState(null, '', window.location.pathname);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const signOut = async () => { await supabase.auth.signOut(); };

  return (
    <AuthContext.Provider value={{
      user: session?.user ?? null, session, authLoading,
      justConfirmed, isPasswordReset, signOut,
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
