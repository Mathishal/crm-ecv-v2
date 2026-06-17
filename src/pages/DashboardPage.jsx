import { useEffect, useState } from "react";
import { supabase } from "../lib/supabaseClient";
import { getAvailableStock } from "../lib/billingEngine";
import { formatEUR } from "../lib/format";

export default function DashboardPage({ isAdmin }) {
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState({ today: 0, week: 0, month: 0 });
  const [byCommercial, setByCommercial] = useState([]);
  const [topClients, setTopClients] = useState([]);
  const [lowStock, setLowStock] = useState([]);
  const [toShipCount, setToShipCount] = useState(0);

  useEffect(() => { load(); }, []);

  async function load() {
    setLoading(true);
    const now = new Date();
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
    const weekStart = new Date(now);
    weekStart.setDate(now.getDate() - now.getDay());
    weekStart.setHours(0,0,0,0);
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

    const [paidRes, productsRes, toShipRes] = await Promise.all([
      supabase.from("factures").select("total_ttc, paid_at, owner_id, profiles(full_name)").eq("status","paid"),
      supabase.from("products").select("*"),
      supabase.from("factures").select("id",{count:"exact",head:true}).eq("shipping_status","to_ship"),
    ]);

    const paid = paidRes.data || [];
    const sum = (d) => paid.filter(f => f.paid_at && new Date(f.paid_at) >= new Date(d)).reduce((a,f) => a + Number(f.total_ttc), 0);
    setKpis({ today: sum(todayStart), week: sum(weekStart.toISOString()), month: sum(monthStart) });

    if (isAdmin) {
      const cm = new Map();
      paid.forEach(f => {
        const k = f.owner_id || "none";
        if (!cm.has(k)) cm.set(k, { name: f.profiles?.full_name || "—", total: 0 });
        cm.get(k).total += Number(f.total_ttc);
      });
      setByCommercial([...cm.values()].sort((a,b) => b.total - a.total));
    }

    const { data: ct } = await supabase.from("factures").select("total_ttc, clients(id,name)").eq("status","paid");
    const clientMap = new Map();
    (ct||[]).forEach(f => {
      if (!f.clients) return;
      const k = f.clients.id;
      if (!clientMap.has(k)) clientMap.set(k, { name: f.clients.name, total: 0, count: 0 });
      clientMap.get(k).total += Number(f.total_ttc);
      clientMap.get(k).count++;
    });
    setTopClients([...clientMap.values()].sort((a,b) => b.total - a.total).slice(0,5));

    const products = productsRes.data || [];
    setLowStock(products.map(p => ({...p, available: getAvailableStock(p)})).filter(p => p.available <= Number(p.low_stock_threshold)).sort((a,b) => a.available - b.available));
    setToShipCount(toShipRes.count || 0);
    setLoading(false);
  }

  if (loading) return <p style={{textAlign:"center",padding:"40px",color:"var(--g5)"}}>Chargement…</p>;

  return (
    <div>
      <h1 style={{fontSize:"26px",fontWeight:900,marginBottom:"4px"}}>Tableau de bord</h1>
      <p style={{color:"var(--g5)",fontSize:"13px",marginBottom:"20px"}}>Vue d'ensemble de votre activité</p>

      <div className="kpi-grid">
        <div className="kpi-card">
          <div className="kpi-icon">📈</div>
          <div className="kpi-label">Aujourd'hui</div>
          <div className="kpi-val">{formatEUR(kpis.today)}</div>
        </div>
        <div className="kpi-card">
          <div className="kpi-icon">📊</div>
          <div className="kpi-label">Cette semaine</div>
          <div className="kpi-val">{formatEUR(kpis.week)}</div>
        </div>
      </div>

      <div className="kpi-card kpi-card--wide" style={{marginBottom:"12px"}}>
        <div className="kpi-icon">🗓</div>
        <div className="kpi-label">Ce mois</div>
        <div className="kpi-val" style={{fontSize:"28px"}}>{formatEUR(kpis.month)}</div>
      </div>

      <div className="section-card">
        <div className="section-title">🚚 À expédier</div>
        <div className="dash-big">{toShipCount}</div>
        <div className="dash-big-sub">commandes en attente</div>
      </div>

      {isAdmin && byCommercial.length > 0 && (
        <div className="section-card">
          <div className="section-title">👥 CA par commercial</div>
          {byCommercial.map((c,i) => (
            <div key={i} className="dash-row">
              <div className="dash-row__name">{c.name}</div>
              <div className="dash-row__val">{formatEUR(c.total)}</div>
            </div>
          ))}
        </div>
      )}

      {topClients.length > 0 && (
        <div className="section-card">
          <div className="section-title">🏆 Top clients</div>
          {topClients.map((c,i) => (
            <div key={i} className="dash-row">
              <div>
                <div className="dash-row__name">{c.name}</div>
                <div className="dash-row__sub">{c.count} facture{c.count > 1 ? "s" : ""}</div>
              </div>
              <div className="dash-row__val">{formatEUR(c.total)}</div>
            </div>
          ))}
        </div>
      )}

      {lowStock.length > 0 && (
        <div className="section-card">
          <div className="section-title">⚠️ Stock faible</div>
          {lowStock.map(p => (
            <div key={p.id} className="dash-row">
              <div className="dash-row__name">{p.name}</div>
              <div className="dash-row__val dash-row__val--a">{p.available.toFixed(2)} {p.sale_unit}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
