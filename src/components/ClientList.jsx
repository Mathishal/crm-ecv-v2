import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";

export default function ClientList({ onEdit, onCreateNew }) {
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("clients").select("*, devis(count), factures(count)").order("name");
    setClients(data || []);
    setLoading(false);
  }

  const filtered = clients.filter(c => {
    const t = search.toLowerCase();
    return c.name?.toLowerCase().includes(t) || c.company_name?.toLowerCase().includes(t) || c.email?.toLowerCase().includes(t);
  });

  if (loading) return <p style={{textAlign:"center",padding:"32px",color:"var(--g5)"}}>Chargement…</p>;
  return (
    <div>
      <div className="section-head">
        <h1>Clients</h1>
        <button onClick={onCreateNew} style={{fontSize:"13px",padding:"9px 16px"}}>+ Nouveau</button>
      </div>
      <div className="gsearch">
        <span className="gsearch__icon">🔍</span>
        <input type="text" placeholder="Nom, entreprise, email…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {filtered.map(c => {
        const hasVat = !!c.intra_vat_number?.trim();
        return (
          <div key={c.id} className="client-card" onClick={() => onEdit(c)}>
            <div className="client-card__name">{c.name}</div>
            {c.company_name && <div className="client-card__co">{c.company_name}</div>}
            {c.email && <div className="client-card__email">{c.email}</div>}
            <div className="client-card__footer">
              <span className="client-card__stat">{c.devis?.[0]?.count ?? 0} devis</span>
              <span className="client-card__stat">{c.factures?.[0]?.count ?? 0} factures</span>
              {hasVat && <span className={`vat-badge ${c.intra_vat_verified ? "vat-badge--ok" : "vat-badge--warn"}`}>{c.intra_vat_verified ? "✓ TVA intraco" : "⚠ Non vérifiée"}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}
