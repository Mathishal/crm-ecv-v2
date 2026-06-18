import { useEffect, useState } from "react";
import { supabase } from "./lib/supabaseClient";
import { useCurrentProfile } from "./hooks/useCurrentProfile";
import LoginPage from "./pages/LoginPage";
import BottomNav from "./components/BottomNav";
import DashboardPage from "./pages/DashboardPage";
import ClientList from "./components/ClientList";
import ClientForm from "./components/ClientForm";
import ProductList from "./components/ProductList";
import ProductForm from "./components/ProductForm";
import DevisList from "./components/DevisList";
import DocumentForm from "./components/DocumentForm";
import DocumentDetail from "./components/DocumentDetail";
import FactureList from "./components/FactureList";
import ShippingPage from "./pages/ShippingPage";
import TeamPage from "./pages/TeamPage";
import CompaniesPage from "./pages/CompaniesPage";
import CommissionsReport from "./components/CommissionsReport";
import SuppliersPage from "./pages/SuppliersPage";
import StockReceptionPage from "./pages/StockReceptionPage";
import StockMovementsPage from "./pages/StockMovementsPage";

export default function App() {
  const [session, setSession] = useState(undefined);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [view, setView] = useState({ mode: "list", item: null });
  const [menuOpen, setMenuOpen] = useState(false);
  const { profile, isAdmin, loading: profileLoading } = useCurrentProfile();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => setSession(s));
    return () => listener.subscription.unsubscribe();
  }, []);

  function changeTab(tabKey) {
    setActiveTab(tabKey);
    setView({ mode: "list", item: null });
  }

  function openForm(item = null) { setView({ mode: "form", item }); }
  function openDetail(item) { setView({ mode: "detail", item }); }
  function closeForm() { setView({ mode: "list", item: null }); }

  if (session === undefined || (session && profileLoading)) {
    return <div className="app-loading">Chargement…</div>;
  }
  if (!session) return <LoginPage />;
  if (!profile) return <div className="app-loading">Compte non configuré. Contactez un administrateur.</div>;

  return (
    <div className="app-shell">
      <header className="app-header">
        {/* Burger à gauche */}
        <button
          onClick={() => setMenuOpen(true)}
          style={{background:"none",boxShadow:"none",color:"var(--g9)",padding:"4px 6px",fontSize:"22px",lineHeight:1,display:"flex",flexDirection:"column",gap:"4px",alignItems:"center",justifyContent:"center",width:"36px",height:"36px"}}
        >
          <span style={{display:"block",width:"20px",height:"2px",background:"var(--g9)",borderRadius:"2px"}} />
          <span style={{display:"block",width:"20px",height:"2px",background:"var(--g9)",borderRadius:"2px"}} />
          <span style={{display:"block",width:"20px",height:"2px",background:"var(--g9)",borderRadius:"2px"}} />
        </button>

        <div className="app-header__logo">EC</div>
        <h1>CRM El Camino</h1>
      </header>

      <main className="app-main">
        {activeTab === "dashboard" && <DashboardPage isAdmin={isAdmin} />}

        {activeTab === "clients" && (view.mode === "list"
          ? <ClientList onEdit={openForm} onCreateNew={() => openForm(null)} />
          : <ClientForm existingClient={view.item} onSaved={closeForm}
    onOpenDevis={(d) => { setActiveTab('devis'); setView({ mode: 'detail', item: d }); }}
    onOpenFacture={(f) => { setActiveTab('factures'); setView({ mode: 'detail', item: f }); }}
  />)}

        {activeTab === "products" && (view.mode === "list"
          ? <ProductList onEdit={openForm} onCreateNew={() => openForm(null)} />
          : <ProductForm existingProduct={view.item} onSaved={closeForm} />)}

        {activeTab === "devis" && (view.mode === "list"
          ? <DevisList onOpen={openDetail} onCreateNew={() => openForm(null)} />
          : view.mode === "detail"
            ? <DocumentDetail documentType="devis" documentId={view.item.id} onBack={closeForm}
                onConvertToFacture={(fId) => { setActiveTab("factures"); setView({ mode: "detail", item: { id: fId } }); }} />
            : <DocumentForm documentType="devis" existingDocument={view.item} onSaved={closeForm} />)}

        {activeTab === "factures" && (view.mode === "list"
          ? <FactureList onOpen={openDetail} onCreateNew={() => openForm(null)} />
          : view.mode === "detail"
            ? <DocumentDetail documentType="facture" documentId={view.item.id} onBack={closeForm} />
            : <DocumentForm documentType="facture" existingDocument={view.item} onSaved={closeForm} />)}

        {activeTab === "shipping" && <ShippingPage />}
        {activeTab === "team" && isAdmin && <TeamPage />}
        {activeTab === "companies" && isAdmin && <CompaniesPage />}
        {activeTab === "reports" && <CommissionsReport onOpenFacture={(f) => { setActiveTab("factures"); setView({ mode: "detail", item: f }); }} />}
        {activeTab === "suppliers" && isAdmin && <SuppliersPage />}
        {activeTab === "stock-reception" && isAdmin && <StockReceptionPage />}
        {activeTab === "stock-movements" && <StockMovementsPage onOpenFacture={(f) => { setActiveTab("factures"); setView({ mode: "detail", item: f }); }} />}
      </main>

      <BottomNav
        activeTab={activeTab}
        onTabChange={changeTab}
        isAdmin={isAdmin}
        menuOpen={menuOpen}
        onMenuToggle={setMenuOpen}
      />
    </div>
  );
}
