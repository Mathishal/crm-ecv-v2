const { createClient } = require("@supabase/supabase-js");

module.exports = async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).end();

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  const { email, password, full_name, role } = req.body;
  if (!email || !password || !full_name) {
    return res.status(400).json({ error: "Champs manquants" });
  }

  try {
    const { data, error } = await supabaseAdmin.auth.admin.createUser({
      email: email.trim(),
      password: password,
      email_confirm: true,
    });
    if (error) throw error;

    const { error: profileError } = await supabaseAdmin
      .from("profiles")
      .insert({
        id: data.user.id,
        full_name: full_name.trim(),
        email: email.trim(),
        role: role || "commercial",
        active: true,
      });
    if (profileError) throw profileError;

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error("create-user error:", err.message);
    return res.status(400).json({ error: err.message });
  }
};
