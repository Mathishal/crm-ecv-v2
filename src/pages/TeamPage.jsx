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
  const [editingRate, setEditingRate] = useState(null);
  const [rateValue, setRateValue] = useState("");

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.from("profiles").select("*").order("full_name");
    if (error) console.error(error);
    setProfiles(data || []);
    setLoading(false);
  }

  async function handleCreate(e) {
    e.preventDefault();
    setCreateError(null);
    setCreateSuccess(null);
    setCreating(true);
    try {
      const res = await fetch("/api/create-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const result = await res.json();
      if (result.error) throw new Error(result.error);
      setCreateSuccess("Compte créé pour " + form.email);
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
    const newActive = p.active ? false : true;
    await supabase.from("profiles").update({ active: newActive }).eq("id", p.id);
    load();
  }

  async function changeRole(p, role) {
    await supabase.from("profiles").update({ role }).eq("id", p.id);
    load();
  }

  async function saveRate(p) {
    const rate = rateValue === "" ? null : Number(rateValue);
    await supabase.from("profiles").update({ commission_rate_override: rate }).eq("id", p.id);
    setEditingRate(null);
    setRateValue("");
    load();
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement…</p>;

  return (
    <div>
      <div className="section-head">
        <h1>Commerciaux</h1>
        <button onClick={() => setShowForm(true)} style={{fontSize:"13px",padding:"9px 16px"}}>+ Ajouter</button>
      </div>

      {createSuccess && (
        <div style={{background:"var(--gl)",color:"var(--gm)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px",fontWeight:600}}>
          {createSuccess}
        </div>
      )}

      {showForm && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:"16px 16px 0 0",padding:"24px 20px",width:"100%",maxWidth:"480px"}}>
            <h3 style={{fontSize:"18px",fontWeight:800,marginBottom:"20px"}}>Ajouter un commercial</h3>
            {createError && <div style={{background:"var(--rl)",color:"var(--r)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px"}}>{createError}</div>}
            <form onSubmit={handleCreate}>
              <label>Nom complet *<input type="text" value={form.full_name} onChange={e => setForm({...form, full_name:e.target.value})} placeholder="Ex: Jean Dupont" required /></label>
              <label>Email *<input type="email" value={form.email} onChange={e => setForm({...form, email:e.target.value})} placeholder="Ex: jean@elcamino.com" required /></label>
              <label>Mot de passe *<input type="password" value={form.password} onChange={e => setForm({...form, password:e.target.value})} minLength={6} required /></label>
              <label>Role
                <select value={form.role} onChange={e => setForm({...form, role:e.target.value})}>
                  <option value="commercial">Commercial</option>
                  <option value="admin">Admin</option>
                </select>
              </label>
              <div style={{display:"flex",gap:"10px",marginTop:"6px"}}>
                <button type="submit" disabled={creating} style={{flex:1,padding:"13px",fontSize:"15px"}}>{creating ? "Création…" : "Créer"}</button>
                <button type="button" onClick={() => setShowForm(false)} style={{flex:1,padding:"13px",fontSize:"15px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none"}}>Annuler</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {profiles.map(p => (
        <div key={p.id} style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px",marginBottom:"10px",opacity:p.active ? 1 : 0.5}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
            <div>
              <div style={{fontSize:"16px",fontWeight:800,color:"var(--g9)"}}>{p.full_name}</div>
              <div style={{fontSize:"13px",color:"var(--g5)",marginTop:"2px"}}>{p.email}</div>
            </div>
            <span style={{background:p.role === "admin" ? "var(--bl)" : "var(--gl)",color:p.role === "admin" ? "var(--b)" : "var(--gm)",fontSize:"11px",padding:"3px 10px",borderRadius:"20px",fontWeight:700}}>
              {p.role === "admin" ? "Admin" : "Commercial"}
            </span>
          </div>

          {/* Commission personnalisée */}
          <div style={{background:"var(--g2)",borderRadius:"10px",padding:"12px",marginBottom:"12px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:"8px"}}>Commission</div>
            {editingRate === p.id ? (
              <div style={{display:"flex",gap:"8px",alignItems:"center"}}>
                <input
                  type="number"
                  step="0.1"
                  min="0"
                  max="100"
                  value={rateValue}
                  onChange={e => setRateValue(e.target.value)}
                  placeholder="Ex: 7"
                  style={{flex:1,margin:0}}
                  autoFocus
                />
                <span style={{fontSize:"14px",fontWeight:700,color:"var(--g6)"}}>%</span>
                <button onClick={() => saveRate(p)} style={{fontSize:"12px",padding:"7px 14px"}}>OK</button>
                <button onClick={() => { setEditingRate(null); setRateValue(""); }} style={{fontSize:"12px",padding:"7px 14px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none"}}>✕</button>
              </div>
            ) : (
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                <div>
                  {p.commission_rate_override !== null && p.commission_rate_override !== undefined ? (
                    <span style={{fontSize:"18px",fontWeight:900,color:"var(--gm)"}}>{p.commission_rate_override}%</span>
                  ) : (
                    <span style={{fontSize:"13px",color:"var(--g5)"}}>Commission par défaut (base produit)</span>
                  )}
                </div>
                <button onClick={() => { setEditingRate(p.id); setRateValue(p.commission_rate_override ?? ""); }} style={{fontSize:"12px",padding:"6px 12px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none",border:"1px solid var(--g4)"}}>
                  Modifier
                </button>
              </div>
            )}
            {p.commission_rate_override !== null && p.commission_rate_override !== undefined && (
              <p style={{fontSize:"11px",color:"var(--g5)",marginTop:"6px"}}>
                Ex: vente à 2 700€/kg = {((p.commission_rate_override / 100) * 2700).toFixed(2)}€ de commission
              </p>
            )}
          </div>

          <div style={{display:"flex",gap:"8px"}}>
            <select value={p.role} onChange={e => changeRole(p, e.target.value)} style={{flex:1,marginBottom:0}}>
              <option value="commercial">Commercial</option>
              <option value="admin">Admin</option>
            </select>
            <button onClick={() => toggleActive(p)} style={{fontSize:"12px",padding:"7px 14px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none",border:"1px solid var(--g4)"}}>
              {p.active ? "Désactiver" : "Réactiver"}
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
