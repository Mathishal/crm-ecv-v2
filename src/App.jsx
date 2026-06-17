// src/App.jsx
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

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = pas encore chargé
  const [activeTab, setActiveTab] = useState("dashboard");
  // Sous-vue dans un onglet : { mode: 'list' | 'form', item: object|null }
  const [view, setView] = useState({ mode: "list", item: null });

  const { profile, isAdmin, loading: profileLoading } = useCurrentProfile();

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  function changeTab(tabKey) {
    setActiveTab(tabKey);
    setView({ mode: "list", item: null }); // reset la sous-vue à chaque changement d'onglet
  }

  function openForm(item = null) {
    setView({ mode: "form", item });
  }

  function openDetail(item) {
    setView({ mode: "detail", item });
  }

  function closeForm() {
    setView({ mode: "list", item: null });
  }

  if (session === undefined || (session && profileLoading)) {
    return <div className="app-loading">Chargement…</div>;
  }

  if (!session) {
    return <LoginPage />;
  }

  if (!profile) {
    return (
      <div className="app-loading">
        Votre compte n'est pas encore configuré. Contactez un administrateur.
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__logo">EC</div>
        <h1>CRM El Camino</h1>
        <div className="app-header__avatar">{profile.full_name?.[0]?.toUpperCase() || "?"}</div>
      </header>

      <main className="app-main">
        {activeTab === "dashboard" && <DashboardPage isAdmin={isAdmin} />}

        {activeTab === "clients" &&
          (view.mode === "list" ? (
            <ClientList onEdit={openForm} onCreateNew={() => openForm(null)} />
          ) : (
            <ClientForm existingClient={view.item} onSaved={closeForm} />
          ))}

        {activeTab === "products" &&
          (view.mode === "list" ? (
            <ProductList onEdit={openForm} onCreateNew={() => openForm(null)} />
          ) : (
            <ProductForm existingProduct={view.item} onSaved={closeForm} />
          ))}

        {activeTab === "devis" &&
          (view.mode === "list" ? (
            <DevisList onOpen={openDetail} onCreateNew={() => openForm(null)} />
          ) : view.mode === "detail" ? (
            <DocumentDetail
              documentType="devis"
              documentId={view.item.id}
              onBack={closeForm}
              onConvertToFacture={(factureId) => {
                setActiveTab("factures");
                setView({ mode: "detail", item: { id: factureId } });
              }}
            />
          ) : (
            <DocumentForm
              documentType="devis"
              existingDocument={view.item}
              onSaved={closeForm}
            />
          ))}

        {activeTab === "factures" &&
          (view.mode === "list" ? (
            <FactureList onOpen={openDetail} onCreateNew={() => openForm(null)} />
          ) : view.mode === "detail" ? (
            <DocumentDetail
              documentType="facture"
              documentId={view.item.id}
              onBack={closeForm}
            />
          ) : (
            <DocumentForm
              documentType="facture"
              existingDocument={view.item}
              onSaved={closeForm}
            />
          ))}

        {activeTab === "shipping" && <ShippingPage />}

        {activeTab === "team" && isAdmin && <TeamPage />}
        {activeTab === "companies" && isAdmin && <CompaniesPage />}
        {activeTab === "reports" && isAdmin && <CommissionsReport />}
      </main>

      <BottomNav activeTab={activeTab} onTabChange={changeTab} isAdmin={isAdmin} />
    </div>
  );
}
