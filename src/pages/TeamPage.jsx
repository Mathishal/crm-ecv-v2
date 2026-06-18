import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function TeamPage() {
  const [profiles, setProfiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({ full_name: "", email: "", password: "", role: "commercial" });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState(null);
  const [createSuccess, setCreateSuccess] = useState(null);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("profiles").select("*, clients(count), devis(count), factures(count)").order("full_name");
    setProfiles(data || []);
    setLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setCreating(true);
    try {
      const res = await fetch("/api/create-user.cjs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setCreateSuccess(`✓ Compte créé pour ${form.email}`);
      setForm({ full_name: "", email: "", password: "", role: "commercial" });
      setShowForm(false);
      load();
    } catch (err) {
      setCreateError(err.message);
    } finally {
      setCreating(false);
    }
  }

  async function toggleActive(p) {
    await supabase.from("profiles").update({ active: !p.active }).eq("id", p.id);
    load();
  }

  async function changeRole(p, role) {
    await supabase.from("profiles").update({ role }).eq("id", p.id);
    load();
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement…</p>;

  return (
    <div>
      <div className="section-head">
        <h1>Commerciaux</h1>
        <button onClick={() => setShowForm(true)} style={{fontSize:"13px",padding:"9px 16px"}}>+ Ajouter</button>
      </div>

      {createSuccess && <div style={{background:"var(--gl)",color:"var(--gm)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px",fontWeight:600}}>{createSuccess}</div>}

      {/* Modal création */}
      {showForm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:"16px 16px 0 0",padding:"24px 20px",width:"100%",maxWidth:"480px"}}>
            <h3 style={{fontSize:"18px",fontWeight:800,marginBottom:"20px"}}>Ajouter un commercial</h3>
            {createError && <div style={{background:"var(--rl)",color:"var(--r)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px",fontWeight:600}}>{createError}</div>}
            <form onSubmit={handleCreate}>
              <label>Nom complet *
                <input type="text" value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} placeholder="Ex: Jean Dupont" required />
              </label>
              <label>Email *
                <input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} placeholder="Ex: jean@elcamino.com" required />
              </label>
              <label>Mot de passe *
                <input type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} minLength={8} required />
              </label>
              <label>Rôle *
                <select value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
                  <option value="commercial">Commercial</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <div style={{display:"flex",gap:"10px",marginTop:"6px"}}>
                <button type="submit" disabled={creating} style={{flex:1,padding:"13px",fontSize:"15px"}}>
                  {creating ? "Création…" : "Créer"}
                </button>
                <button type="button" onClick={() => setShowForm(false)} style={{flex:1,padding:"13px",fontSize:"15px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none"}}>
                  Annuler
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {profiles.map(p => (
        <div key={p.id} className="tc" style={{opacity:p.active?1:.5}}>
          <div className="tc__name">{p.full_name}</div>
          <div className="tc__email">{p.email}</div>
          <select value={p.role} onChange={e => changeRole(p, e.target.value)} style={{marginBottom:"10px"}}>
            <option value="commercial">Commercial</option>
            <option value="admin">Admin</option>
          </select>
          <div className="tc__stats">
            <span>{p.clients?.[0]?.count ?? 0} clients</span>
            <span>{p.devis?.[0]?.count ?? 0} devis</span>
            <span>{p.factures?.[0]?.count ?? 0} factures</span>
          </div>
          <button onClick={() => toggleActive(p)} style={{fontSize:"12px",padding:"6px 14px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none",border:"1px solid var(--g4)"}}>
            {p.active ? "Désactiver" : "Réactiver"}
          </button>
        </div>
      ))}
    </div>
  );
}
