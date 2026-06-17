import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEUR } from "../lib/format";

const FILTERS = [{value:"to_ship",label:"À expédier"},{value:"shipped",label:"Expédiées"},{value:"delivered",label:"Livrées"},{value:"all",label:"Toutes"}];

export default function ShippingPage() {
  const [filter, setFilter] = useState("to_ship");
  const [factures, setFactures] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [filter]);
  async function load() {
    setLoading(true);
    let q = supabase.from("factures").select("*, clients(name,email)").order("issued_at",{ascending:false});
    if (filter !== "all") q = q.eq("shipping_status", filter);
    const { data } = await q;
    setFactures(data || []);
    setLoading(false);
  }

  async function advance(f) {
    const next = f.shipping_status === "to_ship" ? "shipped" : "delivered";
    await supabase.from("factures").update({shipping_status:next,...(next==="shipped"?{shipped_at:new Date().toISOString()}:{})}).eq("id",f.id);
    load();
  }

  const SH_LABELS = {to_ship:{l:"À expédier",c:"ship-badge--to_ship"},shipped:{l:"Expédiée",c:"ship-badge--shipped"},delivered:{l:"Livrée",c:"ship-badge--delivered"}};

  return (
    <div>
      <div className="section-head">
        <h1>Expéditions</h1>
      </div>
      <select style={{marginBottom:"14px",borderRadius:"10px"}} value={filter} onChange={e => setFilter(e.target.value)}>
        {FILTERS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
      </select>
      {loading ? <p style={{textAlign:"center",padding:"24px",color:"var(--g5)"}}>Chargement…</p> :
        factures.length === 0 ? <p style={{textAlign:"center",padding:"24px",color:"var(--g5)"}}>Aucune expédition.</p> :
        factures.map(f => {
          const sh = SH_LABELS[f.shipping_status]||{l:f.shipping_status,c:""};
          return (
            <div key={f.id} className="sc">
              <div className="sc__top">
                <span className="sc__num">{f.number}</span>
                <span className={`ship-badge ${sh.c}`}>{sh.l}</span>
              </div>
              <div className="sc__client">{f.clients?.name}</div>
              {f.clients?.email && <div className="sc__email">{f.clients.email}</div>}
              <div className="sc__amt">Montant : {formatEUR(f.total_ttc)}</div>
              {f.shipping_status !== "delivered" && (
                <button onClick={() => advance(f)}>
                  {f.shipping_status === "to_ship" ? "📦 Marquer expédiée" : "✓ Marquer livrée"}
                </button>
              )}
            </div>
          );
        })
      }
    </div>
  );
}
