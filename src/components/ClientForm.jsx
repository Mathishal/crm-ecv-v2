import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { useCurrentProfile } from "../hooks/useCurrentProfile";
import { formatEUR, formatDate } from "../lib/format";

export default function ClientForm({ existingClient = null, onSaved, onOpenDevis, onOpenFacture }) {
  const { profile } = useCurrentProfile();
  const [name, setName] = useState(existingClient?.name || "");
  const [companyName, setCompanyName] = useState(existingClient?.company_name || "");
  const [email, setEmail] = useState(existingClient?.email || "");
  const [phone, setPhone] = useState(existingClient?.phone || "");
  const [billingAddress, setBillingAddress] = useState(existingClient?.billing_address || "");
  const [shippingAddress, setShippingAddress] = useState(existingClient?.shipping_address || "");
  const [notes, setNotes] = useState(existingClient?.notes || "");
  const [intraVatNumber, setIntraVatNumber] = useState(existingClient?.intra_vat_number || "");
  const [intraVatVerified, setIntraVatVerified] = useState(existingClient?.intra_vat_verified || false);
  const [sameAsShipping, setSameAsShipping] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);
  const [devis, setDevis] = useState([]);
  const [factures, setFactures] = useState([]);
  const [loadingHistory, setLoadingHistory] = useState(false);

  useEffect(() => {
    if (existingClient?.id) loadHistory();
  }, [existingClient?.id]);

  async function loadHistory() {
    setLoadingHistory(true);
    const [dr, fr] = await Promise.all([
      supabase.from("devis").select("*, companies(name)").eq("client_id", existingClient.id).order("created_at", { ascending: false }),
      supabase.from("factures").select("*, companies(name)").eq("client_id", existingClient.id).order("issued_at", { ascending: false }),
    ]);
    setDevis(dr.data || []);
    setFactures(fr.data || []);
    setLoadingHistory(false);
  }

  function handleVatNumberChange(value) {
    setIntraVatNumber(value);
    if (value !== existingClient?.intra_vat_number) setIntraVatVerified(false);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setErrorMsg(null);
    if (!name.trim()) return setErrorMsg("Le nom est obligatoire.");
    setSaving(true);
    try {
      const payload = {
        name: name.trim(), company_name: companyName.trim() || null,
        email: email.trim() || null, phone: phone.trim() || null,
        billing_address: billingAddress.trim() || null,
        shipping_address: (sameAsShipping ? billingAddress : shippingAddress).trim() || null,
        notes: notes.trim() || null,
        intra_vat_number: intraVatNumber.trim() || null,
        intra_vat_verified: intraVatVerified,
      };
      if (intraVatVerified && !existingClient?.intra_vat_verified) {
        payload.intra_vat_verified_at = new Date().toISOString();
        payload.intra_vat_verified_by = profile?.id || null;
      } else if (!intraVatVerified) {
        payload.intra_vat_verified_at = null;
        payload.intra_vat_verified_by = null;
      }
      if (existingClient) {
        const { error } = await supabase.from("clients").update(payload).eq("id", existingClient.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("clients").insert({ ...payload, owner_id: profile?.id });
        if (error) throw error;
      }
      onSaved?.();
    } catch (err) {
      setErrorMsg(err.message);
    } finally {
      setSaving(false);
    }
  }

  const DEVIS_LABELS = { draft:"Brouillon", sent:"Envoyé", accepted:"Accepté", refused:"Refusé", expired:"Expiré" };
  const FAC_LABELS = { draft:"Brouillon", sent:"Envoyée", paid:"Payée", overdue:"En retard", cancelled:"Annulée" };
  const S_BG = { draft:"var(--g3)", sent:"var(--bl)", accepted:"var(--gl)", paid:"var(--gl)", refused:"var(--rl)", cancelled:"var(--rl)", overdue:"var(--al)", expired:"var(--al)" };
  const S_TX = { draft:"var(--g6)", sent:"var(--b)", accepted:"var(--gm)", paid:"var(--gm)", refused:"var(--r)", cancelled:"var(--r)", overdue:"var(--a)", expired:"var(--a)" };

  return (
    <div>
      <form onSubmit={handleSubmit} style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"18px",marginBottom:"12px"}}>
        <h2 style={{fontSize:"20px",fontWeight:900,margin:"0 0 18px"}}>{existingClient ? "Modifier" : "Nouveau client"}</h2>
        {errorMsg && <div style={{background:"var(--rl)",color:"var(--r)",padding:"10px 14px",borderRadius:"8px",marginBottom:"14px",fontSize:"13px",fontWeight:600}}>{errorMsg}</div>}

        <label>Nom *<input type="text" value={name} onChange={e => setName(e.target.value)} /></label>
        <label>Entreprise<input type="text" value={companyName} onChange={e => setCompanyName(e.target.value)} /></label>
        <label>Email<input type="email" value={email} onChange={e => setEmail(e.target.value)} /></label>
        <label>Téléphone<input type="tel" value={phone} onChange={e => setPhone(e.target.value)} /></label>
        <label>Adresse de facturation<textarea value={billingAddress} onChange={e => setBillingAddress(e.target.value)} rows={2} /></label>

        <div style={{display:"flex",alignItems:"center",gap:"10px",marginBottom:"14px",cursor:"pointer"}} onClick={() => setSameAsShipping(v => !v)}>
          <div style={{width:"20px",height:"20px",borderRadius:"5px",border:"2px solid var(--gm)",background:sameAsShipping?"var(--gm)":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
            {sameAsShipping && <span style={{color:"#fff",fontSize:"13px",fontWeight:900}}>✓</span>}
          </div>
          <span style={{fontSize:"13px",fontWeight:500,color:"var(--g6)"}}>Adresse de livraison identique</span>
        </div>

        {!sameAsShipping && <label>Adresse de livraison<textarea value={shippingAddress} onChange={e => setShippingAddress(e.target.value)} rows={2} /></label>}

        <div style={{border:"1.5px solid var(--g4)",borderRadius:"12px",padding:"14px",marginBottom:"14px"}}>
          <div style={{fontSize:"11px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".4px",marginBottom:"10px"}}>TVA intracommunautaire</div>
          <label>Numéro de TVA intraco
            <input type="text" value={intraVatNumber} onChange={e => handleVatNumberChange(e.target.value)} placeholder="Ex: FR12345678900" />
          </label>
          <div style={{display:"flex",alignItems:"center",gap:"10px",cursor:"pointer"}} onClick={() => intraVatNumber.trim() && setIntraVatVerified(v => !v)}>
            <div style={{width:"20px",height:"20px",borderRadius:"5px",border:"2px solid var(--gm)",background:intraVatVerified?"var(--gm)":"#fff",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,opacity:intraVatNumber.trim()?1:0.4}}>
              {intraVatVerified && <span style={{color:"#fff",fontSize:"13px",fontWeight:900}}>✓</span>}
            </div>
            <span style={{fontSize:"13px",fontWeight:500,color:"var(--g6)"}}>Vérifié manuellement</span>
          </div>
          {intraVatNumber.trim() && !intraVatVerified && (
            <p style={{fontSize:"12px",color:"var(--a)",fontWeight:600,marginTop:"8px"}}>Non vérifié — Atlas Hongrie nécessitera un override</p>
          )}
        </div>

        <label>Notes<textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} /></label>

        <button type="submit" disabled={saving} style={{width:"100%",padding:"13px",fontSize:"15px",borderRadius:"10px"}}>
          {saving ? "Enregistrement…" : existingClient ? "Enregistrer" : "Créer le client"}
        </button>
      </form>

      {existingClient && (
        <>
          <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px",marginBottom:"12px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"12px"}}>Devis ({devis.length})</div>
            {loadingHistory ? <p style={{color:"var(--g5)",fontSize:"13px"}}>Chargement…</p> :
              devis.length === 0 ? <p style={{color:"var(--g5)",fontSize:"13px"}}>Aucun devis</p> :
              devis.map(d => (
                <div key={d.id}
                  onClick={() => onOpenDevis && onOpenDevis(d)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--g3)",cursor:onOpenDevis?"pointer":"default"}}
                >
                  <div>
                    <div style={{fontSize:"13px",fontWeight:700,color:"var(--g9)"}}>{d.number}</div>
                    <div style={{fontSize:"11px",color:"var(--g5)",marginTop:"2px"}}>{formatDate(d.created_at)} · via {d.companies?.name}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <span style={{background:S_BG[d.status],color:S_TX[d.status],fontSize:"10px",padding:"2px 8px",borderRadius:"20px",fontWeight:700}}>{DEVIS_LABELS[d.status]}</span>
                    <span style={{fontSize:"14px",fontWeight:800,color:"var(--g9)"}}>{formatEUR(d.total_ttc)}</span>
                    {onOpenDevis && <span style={{color:"var(--g5)",fontSize:"12px"}}>→</span>}
                  </div>
                </div>
              ))
            }
          </div>

          <div style={{background:"#fff",borderRadius:"16px",border:"1px solid var(--g4)",boxShadow:"var(--sh)",padding:"16px",marginBottom:"12px"}}>
            <div style={{fontSize:"11px",fontWeight:700,color:"var(--g5)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:"12px"}}>Factures ({factures.length})</div>
            {loadingHistory ? <p style={{color:"var(--g5)",fontSize:"13px"}}>Chargement…</p> :
              factures.length === 0 ? <p style={{color:"var(--g5)",fontSize:"13px"}}>Aucune facture</p> :
              factures.map(f => (
                <div key={f.id}
                  onClick={() => onOpenFacture && onOpenFacture(f)}
                  style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"10px 0",borderBottom:"1px solid var(--g3)",cursor:onOpenFacture?"pointer":"default"}}
                >
                  <div>
                    <div style={{fontSize:"13px",fontWeight:700,color:"var(--g9)"}}>{f.number}</div>
                    <div style={{fontSize:"11px",color:"var(--g5)",marginTop:"2px"}}>{formatDate(f.issued_at)} · via {f.companies?.name}</div>
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                    <span style={{background:S_BG[f.status],color:S_TX[f.status],fontSize:"10px",padding:"2px 8px",borderRadius:"20px",fontWeight:700}}>{FAC_LABELS[f.status]}</span>
                    <span style={{fontSize:"14px",fontWeight:800,color:"var(--g9)"}}>{formatEUR(f.total_ttc)}</span>
                    {onOpenFacture && <span style={{color:"var(--g5)",fontSize:"12px"}}>→</span>}
                  </div>
                </div>
              ))
            }
          </div>
        </>
      )}
    </div>
  );
}
