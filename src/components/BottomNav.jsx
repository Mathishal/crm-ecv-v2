import { supabase } from "../lib/supabaseClient";

const ALL_TABS = [
  { key: "dashboard", label: "Tableau de bord", icon: "📊" },
  { key: "clients", label: "Clients", icon: "👥" },
  { key: "products", label: "Produits", icon: "📦" },
  { key: "devis", label: "Devis", icon: "📄" },
  { key: "factures", label: "Factures", icon: "🧾" },
  { key: "shipping", label: "À Expédier", icon: "🚚" },
  { key: "reports", label: "Rapports", icon: "📈" },
  { key: "team", label: "Commerciaux", icon: "👤", adminOnly: true },
  { key: "companies", label: "Sociétés", icon: "🏢", adminOnly: true },
  { key: "suppliers", label: "Fournisseurs", icon: "🏭", adminOnly: true },
  { key: "stock-reception", label: "Réception stock", icon: "📥", adminOnly: true },
  { key: "stock-movements", label: "Mouvements stock", icon: "📊" },
];

export default function BottomNav({ activeTab, onTabChange, isAdmin, profile, onMenuToggle, menuOpen }) {
  const tabs = ALL_TABS.filter(t => !t.adminOnly || isAdmin);

  async function handleLogout() {
    await supabase.auth.signOut();
  }

  function go(key) {
    onTabChange(key);
    onMenuToggle(false);
  }

  return (
    <>
      {menuOpen && (
        <div onClick={() => onMenuToggle(false)} style={{position:"fixed",inset:0,background:"rgba(0,0,0,.35)",zIndex:40,backdropFilter:"blur(2px)"}} />
      )}

      <div style={{
        position:"fixed",left:0,top:0,bottom:0,width:"280px",
        background:"#fff",zIndex:50,
        transform: menuOpen ? "translateX(0)" : "translateX(-100%)",
        transition:"transform .25s cubic-bezier(.4,0,.2,1)",
        boxShadow: menuOpen ? "4px 0 24px rgba(0,0,0,.12)" : "none",
        display:"flex",flexDirection:"column",
      }}>
        <div style={{padding:"20px 20px 16px",borderBottom:"1px solid #e2e8f0",display:"flex",alignItems:"center",gap:"12px"}}>
          <div style={{background:"#22723a",color:"#fff",fontWeight:800,borderRadius:"8px",padding:"6px 9px",fontSize:"12px"}}>EC</div>
          <div style={{flex:1}}>
            <div style={{fontSize:"15px",fontWeight:700,color:"#1a2330"}}>{profile?.full_name || "CRM El Camino"}</div>
            <div style={{fontSize:"12px",color:"#94a3b8"}}>{isAdmin ? "Administrateur" : "Commercial"}</div>
          </div>
          <button onClick={() => onMenuToggle(false)} style={{background:"none",color:"#94a3b8",boxShadow:"none",padding:"4px",fontSize:"20px",lineHeight:1}}>x</button>
        </div>

        <div style={{flex:1,overflowY:"auto",padding:"10px"}}>
          {tabs.map(tab => (
            <button
              key={tab.key}
              onClick={() => go(tab.key)}
              style={{
                width:"100%",display:"flex",alignItems:"center",gap:"14px",
                padding:"12px 14px",borderRadius:"10px",marginBottom:"2px",
                background: activeTab === tab.key ? "#edf7f0" : "none",
                color: activeTab === tab.key ? "#1b5e35" : "#475569",
                fontWeight: activeTab === tab.key ? 700 : 500,
                fontSize:"14px",boxShadow:"none",justifyContent:"flex-start",
                transition:"background .15s",
              }}
            >
              <span style={{fontSize:"20px",width:"28px",textAlign:"center"}}>{tab.icon}</span>
              {tab.label}
              {activeTab === tab.key && <span style={{marginLeft:"auto",width:"6px",height:"6px",borderRadius:"50%",background:"#22723a",flexShrink:0}} />}
            </button>
          ))}
        </div>

        <div style={{padding:"12px 10px",borderTop:"1px solid #e2e8f0"}}>
          <button onClick={handleLogout} style={{width:"100%",display:"flex",alignItems:"center",gap:"14px",padding:"12px 14px",borderRadius:"10px",background:"#fdf1f1",color:"#d63b3b",fontWeight:600,fontSize:"14px",boxShadow:"none",justifyContent:"flex-start"}}>
            <span style={{fontSize:"20px",width:"28px",textAlign:"center"}}>🚪</span>
            Deconnexion
          </button>
        </div>
      </div>
    </>
  );
}
