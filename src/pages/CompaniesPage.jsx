import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function CompaniesPage() {
  const [companies, setCompanies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("companies").select("*").order("is_default", { ascending: false });
    setCompanies(data || []);
    setLoading(false);
  }

  async function save(company) {
    const { id, ...payload } = company;
    if (id) await supabase.from("companies").update(payload).eq("id", id);
    else await supabase.from("companies").insert(payload);
    setEditingId(null);
    load();
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement…</p>;

  return (
    <div>
      <div className="section-head">
        <h1>Sociétés</h1>
        <button onClick={() => setEditingId("new")} style={{fontSize:"13px",padding:"9px 16px"}}>+ Ajouter</button>
      </div>
      <p style={{color:"var(--g5)",fontSize:"13px",marginBottom:"16px"}}>Sociétés émettrices pour vos devis et factures</p>

      {companies.map(c => (
        <div key={c.id} style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"18px",marginBottom:"12px"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"12px"}}>
            <div>
              {c.logo_url && <img src={c.logo_url} alt="" style={{maxHeight:"36px",maxWidth:"120px",objectFit:"contain",borderRadius:"6px",marginBottom:"8px",display:"block"}} />}
              <div style={{fontSize:"17px",fontWeight:800,color:"var(--g9)"}}>{c.name}</div>
              {c.is_default && <span style={{background:"var(--gl)",color:"var(--gm)",fontSize:"11px",padding:"2px 9px",borderRadius:"20px",fontWeight:700,display:"inline-block",marginTop:"4px"}}>Par défaut</span>}
            </div>
            <button onClick={() => setEditingId(c.id)} style={{fontSize:"12px",padding:"7px 14px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none",border:"1px solid var(--g4)"}}>Modifier</button>
          </div>
          {(c.address_line || c.city) && (
            <div style={{fontSize:"13px",color:"var(--g5)",marginBottom:"8px",lineHeight:1.6}}>
              {c.address_line && <div>{c.address_line}</div>}
              {(c.postal_code || c.city) && <div>{[c.postal_code, c.city].filter(Boolean).join(" ")}</div>}
              {c.country_code && <div>{c.country_code === "FR" ? "France" : c.country_code === "HU" ? "Hongrie" : c.country_code}</div>}
            </div>
          )}
          {c.email && <div style={{fontSize:"13px",color:"var(--g5)",marginBottom:"4px"}}>✉️ {c.email}</div>}
          {c.vat_number && <div style={{fontSize:"13px",color:"var(--g5)",marginBottom:"4px"}}>TVA : {c.vat_number}</div>}
          {c.iban && <div style={{fontSize:"13px",color:"var(--g5)",marginBottom:"4px"}}>IBAN : {c.iban}</div>}
          {c.requires_client_intra_vat && (
            <div style={{marginTop:"10px",padding:"8px 12px",background:"var(--al)",borderRadius:"8px",fontSize:"12px",color:"var(--a)",fontWeight:600}}>
              🔒 B2B intracommunautaire uniquement
            </div>
          )}
        </div>
      ))}

      {editingId && (
        <CompanyForm
          company={editingId === "new" ? null : companies.find(c => c.id === editingId)}
          onSave={save}
          onCancel={() => setEditingId(null)}
        />
      )}
    </div>
  );
}

function CompanyForm({ company, onSave, onCancel }) {
  const [form, setForm] = useState(company || { name:"",country_code:"FR",is_default:false,logo_url:"",address_line:"",postal_code:"",city:"",vat_number:"",siren_or_reg_number:"",email:"",phone:"",iban:"",bic:"",bank_name:"",requires_client_intra_vat:false,legal_footer_text:"" });
  const [uploading, setUploading] = useState(false);

  const u = (k, v) => setForm(f => ({...f, [k]: v}));

  async function handleLogo(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const path = `${form.id||"new"}-${Date.now()}.${file.name.split(".").pop()}`;
      const { error } = await supabase.storage.from("company-logos").upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from("company-logos").getPublicUrl(path);
      u("logo_url", data.publicUrl);
    } catch(e) { console.error(e); }
    finally { setUploading(false); }
  }

  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,.4)",zIndex:100,overflowY:"auto",padding:"20px 16px"}}>
      <div style={{background:"#fff",borderRadius:"16px",padding:"20px",maxWidth:"500px",margin:"0 auto"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"20px"}}>
          <h2 style={{fontSize:"18px",fontWeight:800}}>{company ? "Modifier" : "Nouvelle société"}</h2>
          <button onClick={onCancel} style={{background:"none",color:"var(--g5)",boxShadow:"none",fontSize:"20px",padding:"4px"}}>✕</button>
        </div>

        <label>Logo<br/>
          <input type="file" accept="image/*" onChange={handleLogo} disabled={uploading} style={{marginTop:"6px"}} />
          {uploading && <p style={{fontSize:"12px",color:"var(--g5)"}}>Upload…</p>}
          {form.logo_url && <img src={form.logo_url} alt="" style={{maxHeight:"40px",marginTop:"8px",display:"block",borderRadius:"6px"}} />}
        </label>

        <label>Nom *<input type="text" value={form.name} onChange={e => u("name", e.target.value)} /></label>
        <label>Pays (FR, HU…)<input type="text" value={form.country_code} onChange={e => u("country_code", e.target.value.toUpperCase())} maxLength={2} /></label>
        <label>Adresse<input type="text" value={form.address_line||""} onChange={e => u("address_line", e.target.value)} /></label>
        <div style={{display:"grid",gridTemplateColumns:"1fr 2fr",gap:"8px"}}>
          <label>Code postal<input type="text" value={form.postal_code||""} onChange={e => u("postal_code", e.target.value)} /></label>
          <label>Ville<input type="text" value={form.city||""} onChange={e => u("city", e.target.value)} /></label>
        </div>
        <label>Email<input type="email" value={form.email||""} onChange={e => u("email", e.target.value)} /></label>
        <label>Téléphone<input type="tel" value={form.phone||""} onChange={e => u("phone", e.target.value)} /></label>
        <label>N° TVA<input type="text" value={form.vat_number||""} onChange={e => u("vat_number", e.target.value)} /></label>
        <label>SIREN / Reg<input type="text" value={form.siren_or_reg_number||""} onChange={e => u("siren_or_reg_number", e.target.value)} /></label>

        <div style={{background:"var(--g3)",borderRadius:"10px",padding:"12px",marginBottom:"16px"}}>
          <div style={{fontSize:"12px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:"10px"}}>Coordonnées bancaires</div>
          <label>Banque<input type="text" value={form.bank_name||""} onChange={e => u("bank_name", e.target.value)} /></label>
          <label>IBAN<input type="text" value={form.iban||""} onChange={e => u("iban", e.target.value)} /></label>
          <label>BIC<input type="text" value={form.bic||""} onChange={e => u("bic", e.target.value)} /></label>
        </div>

        <label style={{display:"flex",alignItems:"center",gap:"10px",textTransform:"none",letterSpacing:0,cursor:"pointer",marginBottom:"16px"}}>
          <input type="checkbox" checked={form.requires_client_intra_vat} onChange={e => u("requires_client_intra_vat", e.target.checked)} style={{width:"auto",margin:0}} />
          <span style={{fontSize:"14px",fontWeight:500,color:"var(--g6)"}}>Nécessite TVA intraco client (B2B EU)</span>
        </label>
        <label style={{display:"flex",alignItems:"center",gap:"10px",textTransform:"none",letterSpacing:0,cursor:"pointer",marginBottom:"16px"}}>
          <input type="checkbox" checked={form.is_default} onChange={e => u("is_default", e.target.checked)} style={{width:"auto",margin:0}} />
          <span style={{fontSize:"14px",fontWeight:500,color:"var(--g6)"}}>Société par défaut</span>
        </label>
        <label>Mentions légales (pied de page)<textarea value={form.legal_footer_text||""} onChange={e => u("legal_footer_text", e.target.value)} rows={3} /></label>

        <div style={{display:"flex",gap:"10px",marginTop:"6px"}}>
          <button onClick={() => onSave(form)} style={{flex:1,padding:"12px"}}>Enregistrer</button>
          <button onClick={onCancel} style={{flex:1,padding:"12px",background:"var(--g3)",color:"var(--g6)",boxShadow:"none"}}>Annuler</button>
        </div>
      </div>
    </div>
  );
}
