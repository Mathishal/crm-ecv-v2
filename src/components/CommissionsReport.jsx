import { useEffect, useMemo, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { formatEUR, formatDate } from "../lib/format";

export default function CommissionsReport() {
  const [commissions, setCommissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);

  useEffect(() => { load(); }, []);
  async function load() {
    setLoading(true);
    const { data } = await supabase.from("commissions").select("*, profiles(full_name,email), factures(number,total_ttc,issued_at)").order("created_at",{ascending:false});
    setCommissions(data || []);
    setLoading(false);
  }

  const byCommercial = useMemo(() => {
    const groups = new Map();
    for (const c of commissions) {
      if (!groups.has(c.commercial_id)) groups.set(c.commercial_id, { id: c.commercial_id, name: c.profiles?.full_name||"?", email: c.profiles?.email||"", items: [] });
      groups.get(c.commercial_id).items.push(c);
    }
    return [...groups.values()];
  }, [commissions]);

  async function markPaid(id) { await supabase.from("commissions").update({paid:true,paid_at:new Date().toISOString().split("T")[0]}).eq("id",id); load(); }
  async function markUnpaid(id) { await supabase.from("commissions").update({paid:false,paid_at:null}).eq("id",id); load(); }
  async function markSelectedPaid() {
    if (!selectedIds.size) return;
    await supabase.from("commissions").update({paid:true,paid_at:new Date().toISOString().split("T")[0]}).in("id",[...selectedIds]);
    setSelectedIds(new Set()); load();
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement…</p>;

  return (
    <div>
      <h1 style={{marginBottom:"4px"}}>Rapports</h1>
      <p style={{color:"var(--g5)",fontSize:"13px",marginBottom:"20px"}}>Commissions par commercial</p>

      {byCommercial.map(group => {
        const due = group.items.filter(i=>!i.paid).reduce((a,i)=>a+Number(i.amount),0);
        const paid = group.items.filter(i=>i.paid).reduce((a,i)=>a+Number(i.amount),0);
        const expanded = expandedId === group.id;
        return (
          <div key={group.id} className="cg">
            <div className="cg__name">{group.name}</div>
            <div className="cg__email">{group.email}</div>
            <div className="cg__total">{formatEUR(due + paid)}</div>
            <div className="cg__bd">
              <span className="cg__paid">Payé : {formatEUR(paid)}</span>
              <span className="cg__due">Dû : {formatEUR(due)}</span>
            </div>
            <div className="cg__acts">
              <button className="btn-ghost" style={{fontSize:"12px",padding:"7px 14px"}} onClick={() => setExpandedId(expanded ? null : group.id)}>
                {expanded ? "Masquer" : "Voir détails"}
              </button>
              {due > 0 && (
                <button style={{fontSize:"12px",padding:"7px 14px"}} onClick={() => {
                  const ids = group.items.filter(i=>!i.paid).map(i=>i.id);
                  setSelectedIds(new Set(ids));
                }}>
                  Sélectionner dues ({formatEUR(due)})
                </button>
              )}
            </div>
            {expanded && (
              <div style={{marginTop:"12px"}}>
                {group.items.map(item => (
                  <div key={item.id} className="cl">
                    <input type="checkbox" checked={selectedIds.has(item.id)} disabled={item.paid} onChange={() => {
                      const n = new Set(selectedIds);
                      n.has(item.id) ? n.delete(item.id) : n.add(item.id);
                      setSelectedIds(n);
                    }} style={{width:"auto",margin:0}} />
                    <div className="cl__info">
                      <div className="cl__num">{item.factures?.number}</div>
                      <div className="cl__date">{formatDate(item.factures?.issued_at)}</div>
                    </div>
                    <div className="cl__amt">{formatEUR(item.amount)}</div>
                    {item.paid ? (
                      <div className="cl__ok">✓ {formatDate(item.paid_at)}
                        <button onClick={() => markUnpaid(item.id)}>Annuler</button>
                      </div>
                    ) : (
                      <button style={{fontSize:"12px",padding:"6px 12px"}} onClick={() => markPaid(item.id)}>Payer</button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}

      {selectedIds.size > 0 && (
        <div className="bulk">
          <span>{selectedIds.size} commission(s) sélectionnée(s)</span>
          <div style={{display:"flex",gap:"8px"}}>
            <button onClick={markSelectedPaid}>Marquer payées</button>
            <button className="btn-ghost" onClick={() => setSelectedIds(new Set())}>Annuler</button>
          </div>
        </div>
      )}
    </div>
  );
}
