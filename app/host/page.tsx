"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Building,
  CalendarClock,
  CalendarDays,
  MessageSquare,
  Star,
  Wallet,
  LogOut,
} from "lucide-react";

// Importações dos sub-componentes
import { HostOverview } from "@/components/host/overview-tab";
import { HostSpaceList } from "@/components/host/spaces-list-tab";
import { HostSpaceForm } from "@/components/host/space-form";
import { AvailabilityTab } from "@/components/host/availability-tab";
import { AvailabilityConfig } from "@/components/host/availability-config";
import { HostBookingsTab } from "@/components/host/bookings-tab";
import { HostChatTab } from "@/components/host/chat-tab";
import { HostReviewsTab } from "@/components/host/reviews-tab";

type HostView =
  | "overview"
  | "bookings"
  | "messages"
  | "reviews"
  | "spaces"
  | "create_space"
  | "edit_space"
  | "availability"
  | "availability_config"
  | "financial";

const navItems = [
  { id: "overview", label: "Visão Geral", icon: LayoutDashboard },
  { id: "bookings", label: "Agenda", icon: CalendarDays },
  { id: "messages", label: "Mensagens", icon: MessageSquare },
  { id: "reviews", label: "Avaliações", icon: Star },
  { id: "spaces", label: "Meus Espaços", icon: Building },
  { id: "availability", label: "Horários", icon: CalendarClock },
  { id: "financial", label: "Financeiro", icon: Wallet },
];

export default function HostPage() {
  const router = useRouter();

  const [currentView, setCurrentView] = useState<HostView>("overview");
  const [selectedSpaceId, setSelectedSpaceId] = useState<string | null>(null);

  // LOGOUT SÊNIOR COM HARD RELOAD E LIMPEZA DE CACHE
  const handleLogout = async () => {
    try {
      const supabase = createClient();

      // 1. Destrói a sessão real no banco de dados (Supabase)
      await supabase.auth.signOut();

      // 2. Limpa qualquer lixo de sessão do navegador
      sessionStorage.clear();

      // 3. HARD RELOAD: Força a página a recarregar limpando o cache do Next.js
      window.location.replace("/login");
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      {/* SIDEBAR DESKTOP */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-slate-900 shadow-xl">
        <div className="flex items-center gap-3 px-6 py-6 border-b border-slate-800">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm">
            <span className="text-primary-foreground font-black text-xl">
              F
            </span>
          </div>
          <div>
            <h1 className="text-base font-black text-white tracking-tight">
              Fusion Host
            </h1>
            <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
              Gestão de Clínicas
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-4 flex-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive =
              currentView === item.id ||
              (item.id === "spaces" &&
                (currentView === "create_space" ||
                  currentView === "edit_space")) ||
              (item.id === "availability" &&
                currentView === "availability_config");

            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as HostView)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-md"
                    : "text-slate-400 hover:bg-slate-800 hover:text-white",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-800">
          <button
            onClick={handleLogout}
            className="flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold text-slate-400 hover:text-red-400 hover:bg-red-400/10 w-full transition-colors"
          >
            <LogOut className="h-5 w-5" />
            Sair do Painel
          </button>
        </div>
      </aside>

      {/* CONTEÚDO DINÂMICO */}
      <main className="flex-1 lg:ml-64 pb-20 lg:pb-0 h-screen overflow-hidden">
        <div className="h-full overflow-y-auto">
          {/* O onNavigate DEVE ficar apenas aqui no HostOverview */}
          {currentView === "overview" && (
            <HostOverview
              onNavigate={(view) => setCurrentView(view as HostView)}
            />
          )}

          {currentView === "bookings" && <HostBookingsTab />}

          {currentView === "messages" && <HostChatTab />}

          {currentView === "reviews" && <HostReviewsTab />}

          {/* O HostSpaceList fica sem props, conforme exigido pelo componente */}
          {currentView === "spaces" && <HostSpaceList />}

          {currentView === "create_space" && (
            <HostSpaceForm onSuccess={() => setCurrentView("spaces")} />
          )}
          {currentView === "edit_space" && (
            <HostSpaceForm onSuccess={() => setCurrentView("spaces")} />
          )}

          {currentView === "availability" && (
            <AvailabilityTab
              onSelectSpace={(id) => {
                setSelectedSpaceId(id);
                setCurrentView("availability_config");
              }}
            />
          )}
          {currentView === "availability_config" && (
            <AvailabilityConfig
              spaceId={selectedSpaceId!}
              onBack={() => setCurrentView("availability")}
              onSave={() => setCurrentView("availability")}
            />
          )}

          {currentView === "financial" && (
            <div className="flex flex-col items-center justify-center py-32 text-center animate-in fade-in px-4">
              <div className="w-16 h-16 bg-slate-200 rounded-full flex items-center justify-center mb-4">
                <Wallet className="w-8 h-8 text-slate-400" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">
                Módulo Financeiro
              </h2>
              <p className="text-slate-500 font-medium max-w-sm">
                A gestão de repasses estará disponível na próxima fase.
              </p>
            </div>
          )}
        </div>
      </main>

      {/* NAVEGAÇÃO MOBILE (BOTTOM NAV) */}
      <nav className="fixed inset-x-0 bottom-0 z-50 flex lg:hidden items-stretch justify-around border-t border-slate-800 bg-slate-900 pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_40px_rgba(0,0,0,0.2)] overflow-x-auto scrollbar-hide">
        {navItems
          .filter((item) => !["financial", "availability"].includes(item.id))
          .map((item) => {
            const isActive =
              currentView === item.id ||
              (item.id === "spaces" &&
                (currentView === "create_space" ||
                  currentView === "edit_space"));

            return (
              <button
                key={item.id}
                onClick={() => setCurrentView(item.id as HostView)}
                className={cn(
                  "flex flex-col items-center justify-center gap-1.5 py-3 px-4 min-w-[70px] text-[10px] font-bold transition-all shrink-0",
                  isActive
                    ? "text-primary scale-105"
                    : "text-slate-400 hover:text-slate-200",
                )}
              >
                <item.icon
                  className={cn(
                    "h-5 w-5 transition-colors",
                    isActive && "fill-primary/20",
                  )}
                />
                {item.label}
              </button>
            );
          })}
      </nav>
    </div>
  );
}
