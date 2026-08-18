import { useEffect, useState } from "react";
import type { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

export type AppRole = "user" | "moderator" | "admin" | "auditor" | "counselor" | "data_scientist";

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<AppRole[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
      setUser(s?.user ?? null);
      setLoading(false);
      if (s?.user) {
        setTimeout(() => {
          void supabase
            .from("user_roles")
            .select("role")
            .eq("user_id", s.user.id)
            .then(({ data }) => setRoles((data ?? []).map((r) => r.role as AppRole)));
        }, 0);
      } else {
        setRoles([]);
      }
    });

    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
      if (data.session?.user) {
        void supabase
          .from("user_roles")
          .select("role")
          .eq("user_id", data.session.user.id)
          .then(({ data: r }) => setRoles((r ?? []).map((x) => x.role as AppRole)));
      }
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  const has = (...r: AppRole[]) => r.some((x) => roles.includes(x));

  return {
    session,
    user,
    roles,
    loading,
    has,
    isStaff: has("moderator", "admin", "counselor"),
    isAdmin: has("admin"),
    signOut: () => supabase.auth.signOut(),
  };
}
