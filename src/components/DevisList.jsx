import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEUR, formatDate } from "../lib/format";

const S = { draft:{l:"Brouillon",c:"badge--draft"}, sent:{l:"Envoyé",c:"badge--sent"}, accepted:{l:"Accepté",c:"badge--accepted"}, refused:{l:"Refusé",c:"badge--refused"}, expired:{l:"Expiré",c:"badge--expired"} };

export default function DevisList({ onOpen, onCreateNew }) {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, [filter]);
  async function load() {
    setLoading(true);
    let q = supabase.from("devis").select("*, clients(name,company_name), companies(name)").order("created_at",{ascending:false});
    if (filter !== "all") q = q.eq("status", filter);
    const { data } = await q;
    setItems(data || []);
    setLoading(false);
  }

  const filtered = items.filter(d => {
    const t = search.toLowerCase();
    return !t || d.number?.toLowerCase().includes(t) || d.clients?.name?.toLowerCase().includes(t);
  });

  return (
    <div>
      <div className="section-head">
        <h1>Devis</h1>
        <button onClick={onCreateNew} style={{fontSize:"13px",padding:"9px 16px"}}>+ Nouveau</button>
      </div>
      <div className="gsearch">
        <span className="gsearch__icon">🔍</span>
        <input type="text" placeholder="N° devis, client…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      <select style={{marginBottom:"12px",borderRadius:"10px"}} value={filter} onChange={e => setFilter(e.target.value)}>
        <option value="all">Tous les statuts</option>
        {Object.entries(S).map(([k,v]) => <option key={k} value={k}>{v.l}</option>)}
      </select>
      {loading ? <p style={{textAlign:"center",padding:"24px",color:"var(--g5)"}}>Chargement…</p> :
        filtered.length === 0 ? <p style={{textAlign:"center",padding:"24px",color:"var(--g5)"}}>Aucun devis.</p> :
        filtered.map(d => {
          const s = S[d.status]||{l:d.status,c:""};
          return (
            <div key={d.id} className="doc-card" onClick={() => onOpen(d)}>
              <div className="doc-card__top">
                <span className="doc-card__num">{d.number}</span>
                <span className={`badge ${s.c}`}>{s.l}</span>
              </div>
              <div className="doc-card__client">{d.clients?.name}</div>
              {d.clients?.company_name && <div className="doc-card__co">{d.clients.company_name}</div>}
              <div className="doc-card__meta">
                <span className="doc-card__issuer">via {d.companies?.name}</span>
              </div>
              <div className="doc-card__footer">
                <span className="doc-card__date">{formatDate(d.created_at)}</span>
                <span className="doc-card__total">{formatEUR(d.total_ttc)}</span>
              </div>
            </div>
          );
        })
      }
    </div>
  );
}
