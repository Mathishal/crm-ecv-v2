import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  const { email, password, full_name, role } = req.body;
  if (!email || !password || !full_name) return res.status(400).json({ error: "Champs manquants" });
  try {
    const { data: { user }, error } = await supabaseAdmin.auth.admin.createUser({
      email, password, email_confirm: true,
    });
    if (error) throw error;
    const { error: profileError } = await supabaseAdmin.from("profiles").insert({
      id: user.id, full_name, email, role: role || "commercial", active: true,
    });
    if (profileError) throw profileError;
    res.status(200).json({ success: true });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
}
