import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function SuppliersPage() {
  const [suppliers, setSuppliers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState({ name:"", contact_name:"", email:"", phone:"", notes:"" });
  const [saving, setSaving] = useState(false);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const { data } = await supabase.from("suppliers").select("*").order("name");
    setSuppliers(data || []);
    setLoading(false);
  }

  function openNew() {
    setForm({ name:"", contact_name:"", email:"", phone:"", notes:"" });
    setEditing("new");
  }

  function openEdit(s) {
    setForm({ name:s.name||"", contact_name:s.contact_name||"", email:s.email||"", phone:s.phone||"", notes:s.notes||"" });
    setEditing(s.id);
  }

  async function save() {
    if (!form.name.trim()) return;
    setSaving(true);
    if (editing === "new") {
      await supabase.from("suppliers").insert(form);
    } else {
      await supabase.from("suppliers").update(form).eq("id", editing);
    }
    setSaving(false);
    setEditing(null);
    load();
  }

  async function del(id) {
    if (!window.confirm("Supprimer ce fournisseur ?")) return;
    await supabase.from("suppliers").delete().eq("id", id);
    load();
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement...</p>;

  return (
    <div>
      <div className="section-head">
        <h1>Fournisseurs</h1>
        <button onClick={openNew} style={{fontSize:"13px",padding:"9px 16px"}}>+ Ajouter</button>
      </div>

      {editing && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:100,display:"flex",alignItems:"flex-end",justifyContent:"center"}}>
          <div style={{background:"#fff",borderRadius:"16px 16px 0 0",padding:"24px 20px",width:"100%",maxWidth:"480px"}}>
            <h3 style={{fontSize:"18px",fontWeight:800,marginBottom:"20px"}}>{editing === "new" ? "Nouveau fournisseur" : "Modifier"}</h3>
            <label>Nom *<input type="text" value={form.name} onChange={e => setForm({...form,name:e.target.value})} placeholder="Ex: Happy Pousse" /></label>
            <label>Contact<input type="text" value={form.contact_name} onChange={e => setForm({...form,contact_name:e.target.value})} placeholder="Nom du contact" /></label>
            <label>Email<input type="email" value={form.email} onChange={e => setForm({...form,email:e.target.value})} /></label>
            <label>Téléphone<input type="tel" value={form.phone} onChange={e => setForm({...form,phone:e.target.value})} /></label>
            <label>Notes<textarea value={form.notes} onChange={e => setForm({...form,notes:e.target.value})} rows={2} /></label>
            <div style={{display:"flex",gap:"10px",marginTop:"6px"}}>
              <button onClick={save} disabled={saving} style={{flex:1,padding:"13px"}}>{saving ? "..." : "Enregistrer"}</button>
              <button onClick={() => setEditing(null)} style={{flex:1,padding:"13px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none"}}>Annuler</button>
            </div>
          </div>
        </div>
      )}

      {suppliers.length === 0 ? (
        <div style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>
          <div style={{fontSize:"32px",marginBottom:"12px"}}>🏭</div>
          <p>Aucun fournisseur. Ajoutez-en un pour commencer.</p>
        </div>
      ) : suppliers.map(s => (
        <div key={s.id} style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px",marginBottom:"10px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"8px"}}>
            <div style={{fontSize:"16px",fontWeight:800,color:"var(--g9)"}}>{s.name}</div>
            <div style={{display:"flex",gap:"8px"}}>
              <button onClick={() => openEdit(s)} style={{fontSize:"12px",padding:"6px 12px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none",border:"1px solid var(--g4)"}}>Modifier</button>
              <button onClick={() => del(s.id)} style={{fontSize:"12px",padding:"6px 12px",background:"var(--rl)",color:"var(--r)",boxShadow:"none"}}>Suppr.</button>
            </div>
          </div>
          {s.contact_name && <div style={{fontSize:"13px",color:"var(--g5)"}}>👤 {s.contact_name}</div>}
          {s.email && <div style={{fontSize:"13px",color:"var(--g5)"}}>✉️ {s.email}</div>}
          {s.phone && <div style={{fontSize:"13px",color:"var(--g5)"}}>📞 {s.phone}</div>}
          {s.notes && <div style={{fontSize:"12px",color:"var(--g5)",marginTop:"6px",fontStyle:"italic"}}>{s.notes}</div>}
        </div>
      ))}
    </div>
  );
}
