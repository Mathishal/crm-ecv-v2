import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEUR, formatDate } from "../lib/format";

const S = { draft:{l:"Brouillon",c:"badge--draft"}, sent:{l:"Envoyée",c:"badge--sent"}, paid:{l:"Payée",c:"badge--paid"}, overdue:{l:"En retard",c:"badge--overdue"}, cancelled:{l:"Annulée",c:"badge--cancelled"} };
const SH = { to_ship:{l:"À expédier",c:"ship-badge--to_ship"}, shipped:{l:"Expédiée",c:"ship-badge--shipped"}, delivered:{l:"Livrée",c:"ship-badge--delivered"} };

export default function FactureList({ onOpen, onCreateNew }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [filter]);
  async function load() {
    setLoading(true);
    let q = supabase.from("factures").select("*, clients(name,company_name), companies(name)").order("issued_at",{ascending:false});
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setItems(data || []);
    setLoading(false);
  }

  const filtered = items.filter(f => {
    const t = search.toLowerCase();
    return !t || f.number?.toLowerCase().includes(t) || f.clients?.name?.toLowerCase().includes(t);
  });

  async function markPaid(id, e) { e.stopPropagation(); await supabase.from("factures").update({status:"paid",paid_at:new Date().toISOString().split("T")[0]}).eq("id",id); load(); }
  async function markShipped(id, e) { e.stopPropagation(); await supabase.from("factures").update({shipping_status:"shipped",shipped_at:new Date().toISOString()}).eq("id",id); load(); }

  return (
    <div>
      <div className="section-head">
        <h1>Factures</h1>
        <button onClick={onCreateNew} style={{fontSize:"13px",padding:"9px 16px"}}>+ Nouvelle</button>
      </div>
      <div className="gsearch">
        <span className="gsearch__icon">🔍</span>
        <input type="text" placeholder="N° facture, client…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <select style={{marginBottom:"12px",borderRadius:"10px"}} value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Tous les statuts</option>
        {Object.entries(S).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
      </select>
      {loading ? <p style={{textAlign:"center",padding:"24px",color:"var(--g5)"}}>Chargement…</p> :
        filtered.length === 0 ? <p style={{textAlign:"center",padding:"24px",color:"var(--g5)"}}>Aucune facture.</p> :
        filtered.map(f => {
          const s = S[f.status]||{l:f.status,c:""}; const sh = SH[f.shipping_status]||{l:f.shipping_status,c:""};
          return (
            <div key={f.id} className="doc-card" onClick={() => onOpen(f)}>
              <div className="doc-card__top">
                <span className="doc-card__num">{f.number}</span>
                <div style={{display:"flex",gap:"6px"}}>
                  <span className={`ship-badge ${sh.c}`}>{sh.l}</span>
                  <span className={`badge ${s.c}`}>{s.l}</span>
                </div>
              </div>
              <div className="doc-card__client">{f.clients?.name}</div>
              {f.clients?.company_name && <div className="doc-card__co">{f.clients.company_name}</div>}
              <div className="doc-card__meta">
                <span className="doc-card__issuer">via {f.companies?.name}</span>
              </div>
              {f.paid_at && <div className="doc-card__paid">✓ Payée le {formatDate(f.paid_at)}</div>}
              <div className="doc-card__footer">
                <span className="doc-card__date">{formatDate(f.issued_at)}</span>
                <span className="doc-card__total">{formatEUR(f.total_ttc)}</span>
              </div>
              <div className="doc-card__actions">
                {f.shipping_status === "to_ship" && <button onClick={e=>markShipped(f.id,e)} style={{background:"var(--b)"}}>📦 Expédiée</button>}
                {f.status !== "paid" && f.status !== "cancelled" && <button onClick={e=>markPaid(f.id,e)} style={{background:"#16a34a"}}>✓ Payée</button>}
              </div>
            </div>
          );
        })
      }
    </div>
  );
}
