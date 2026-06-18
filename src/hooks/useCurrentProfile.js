import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export function useCurrentProfile() {
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    async function load() {
      const { data: authData } = await supabase.auth.getUser();
      if (!authData?.user) {
        if (mounted) { setProfile(null); setLoading(false); }
        return;
      }
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authData.user.id)
        .single();
      if (mounted) {
        if (!error) setProfile(data);
        setLoading(false);
      }
    }
    load();
    return () => { mounted = false; };
  }, []);

  const isAdmin = loading ? false : profile?.role === "admin";
  return { profile, loading, isAdmin };
}
