"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  Heart,
  Calendar,
  MessageSquare,
  User,
  Loader2,
} from "lucide-react";

// Importando os componentes das abas e complementos
import { SearchTab } from "@/components/search-tab";
import { FavoritesTab } from "@/components/favorites-tab";
import { BookingsTab } from "@/components/bookings-tab";
import { ChatTab } from "@/components/chat-tab";
import { ProfileTab } from "@/components/profile-tab";
import { NotificationBell } from "@/components/notification-bell";

// Importando a tela de detalhes, o modal de avaliação, o Tutorial e a SESSÃO ATIVA
import { RoomDetail } from "@/components/room-detail";
import { ReviewModal } from "@/components/review-modal";
import { OnboardingTutorial } from "@/components/onboarding-tutorial";
import { ActiveSession } from "@/components/active-session";

type TabType = "search" | "favorites" | "bookings" | "chat" | "profile";

export default function DashboardPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>("search");

  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [pendingReviewBooking, setPendingReviewBooking] = useState<any | null>(
    null,
  );

  // ==========================================
  // ESTADOS DA SESSÃO ATIVA (HORA CLÍNICA)
  // ==========================================
  const [activeBooking, setActiveBooking] = useState<any | null>(null);
  const [checkingSession, setCheckingSession] = useState(true);

  useEffect(() => {
    async function fetchDashboardData() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          setCheckingSession(false);
          return;
        }

        const now = new Date().toISOString();

        // 1. CHECA REVIEWS PENDENTES
        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select(`id, room_id, end_time, status, rooms ( name )`)
          .eq("user_id", user.id)
          .in("status", ["confirmed", "completed"])
          .lt("end_time", now)
          .order("end_time", { ascending: false })
          .limit(5);

        if (!bookingsError && bookings && bookings.length > 0) {
          for (const booking of bookings) {
            const { data: reviewData } = await supabase
              .from("reviews")
              .select("id")
              .eq("booking_id", booking.id)
              .maybeSingle();

            if (!reviewData) {
              setPendingReviewBooking(booking);
              break;
            }
          }
        }

        // 2. CHECA SESSÃO ATIVA (Reserva acontecendo AGORA)
        const { data: currentSession } = await supabase
          .from("bookings")
          .select(`*, rooms(name)`)
          .eq("user_id", user.id)
          .eq("status", "confirmed")
          .lte("start_time", now)
          .gt("end_time", now)
          .maybeSingle();

        if (currentSession) {
          setActiveBooking(currentSession);
        }
      } catch (error) {
        console.error("Erro ao carregar dados do dashboard:", error);
      } finally {
        setCheckingSession(false);
      }
    }

    fetchDashboardData();
  }, [supabase]);

  const renderTab = () => {
    // Sequestro de Tela: Se tiver sessão ativa, mostra SÓ O CRONÔMETRO
    if (activeBooking) {
      return (
        <ActiveSession
          booking={activeBooking}
          onSessionEnd={() => setActiveBooking(null)}
        />
      );
    }

    // Fluxo normal do Dashboard
    switch (activeTab) {
      case "search":
        return <SearchTab onOpenRoom={setSelectedRoom} />;
      case "favorites":
        return <FavoritesTab onOpenRoom={setSelectedRoom} />;
      case "bookings":
        return (
          <BookingsTab
            onNavigateToSearch={() => setActiveTab("search")}
            onNavigateToChat={() => setActiveTab("chat")}
          />
        );
      case "chat":
        return <ChatTab />;
      case "profile":
        return <ProfileTab />;
      default:
        return <SearchTab onOpenRoom={setSelectedRoom} />;
    }
  };

  // Tela de bloqueio enquanto verifica se tem reserva rolando
  if (checkingSession) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      {/* ========================================== */}
      {/* TUTORIAL DE ONBOARDING (Aparece apenas 1 vez) */}
      {/* ========================================== */}
      <OnboardingTutorial />

      {/* ========================================== */}
      {/* SINO FLUTUANTE (No canto direito sem quebrar o layout) */}
      {/* ========================================== */}
      {!selectedRoom && !activeBooking && (
        <div className="absolute top-6 right-6 lg:top-8 lg:right-8 z-50">
          <NotificationBell />
        </div>
      )}

      {/* 1. Navegação Desktop (Sidebar Lateral Fixa) */}
      {!selectedRoom && !activeBooking && (
        <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-white shadow-sm">
          <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f05e23] font-black text-xl text-white shadow-sm">
              F
            </div>
            <div>
              <h1 className="text-base font-bold text-slate-900 tracking-tight">
                Fusion Clinic
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Painel do Profissional
              </p>
            </div>
          </div>

          <ul className="flex flex-col gap-1 p-3 flex-1">
            <DesktopNavItem
              icon={Search}
              label="Explorar Salas"
              isActive={activeTab === "search"}
              onClick={() => setActiveTab("search")}
            />
            <DesktopNavItem
              icon={Heart}
              label="Favoritos"
              isActive={activeTab === "favorites"}
              onClick={() => setActiveTab("favorites")}
            />
            <DesktopNavItem
              icon={Calendar}
              label="Minhas Reservas"
              isActive={activeTab === "bookings"}
              onClick={() => setActiveTab("bookings")}
            />
            <DesktopNavItem
              icon={MessageSquare}
              label="Mensagens"
              isActive={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
            />
            <DesktopNavItem
              icon={User}
              label="Meu Perfil"
              isActive={activeTab === "profile"}
              onClick={() => setActiveTab("profile")}
            />
          </ul>
        </aside>
      )}

      {/* CONTEÚDO PRINCIPAL - min-w-0 evita o estouro de tela no PC */}
      <main
        className={`flex-1 min-w-0 ${!selectedRoom && !activeBooking ? "lg:ml-64 pb-20 lg:pb-0" : ""}`}
      >
        {renderTab()}
      </main>

      {/* 2. Barra de Navegação Inferior (Mobile) */}
      {!selectedRoom && !activeBooking && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex lg:hidden items-stretch justify-around border-t border-slate-200 bg-white/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <ul className="flex justify-between items-center w-full max-w-md mx-auto">
            <MobileNavItem
              icon={Search}
              label="Buscar"
              isActive={activeTab === "search"}
              onClick={() => setActiveTab("search")}
            />
            <MobileNavItem
              icon={Heart}
              label="Favoritos"
              isActive={activeTab === "favorites"}
              onClick={() => setActiveTab("favorites")}
            />
            <MobileNavItem
              icon={Calendar}
              label="Reservas"
              isActive={activeTab === "bookings"}
              onClick={() => setActiveTab("bookings")}
            />
            <MobileNavItem
              icon={MessageSquare}
              label="Inbox"
              isActive={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
            />
            <MobileNavItem
              icon={User}
              label="Perfil"
              isActive={activeTab === "profile"}
              onClick={() => setActiveTab("profile")}
            />
          </ul>
        </nav>
      )}

      {/* 3. Tela de Detalhes da Sala */}
      {selectedRoom && !activeBooking && (
        <RoomDetail
          roomId={selectedRoom.id}
          room={selectedRoom}
          onBack={() => setSelectedRoom(null)}
          onNavigateToProfile={() => {
            setSelectedRoom(null);
            setActiveTab("profile");
          }}
          onNavigateToChat={() => {
            setSelectedRoom(null);
            setActiveTab("chat");
          }}
          initialModality={selectedRoom.selectedModality || "hora"}
        />
      )}

      {/* 4. Modal de Avaliação (Efeito Uber ativado no término da reserva) */}
      <ReviewModal
        isOpen={!!pendingReviewBooking && !activeBooking}
        booking={pendingReviewBooking}
        onClose={() => setPendingReviewBooking(null)}
        onSuccess={() => {
          setPendingReviewBooking(null);
        }}
      />
    </div>
  );
}

// Componente auxiliar para os botões do menu lateral (Desktop)
function DesktopNavItem({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: any;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${
          isActive
            ? "bg-[#f05e23]/10 text-[#f05e23]"
            : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
        }`}
      >
        <Icon
          className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`}
        />
        {label}
      </button>
    </li>
  );
}

// Componente auxiliar para os botões do menu inferior (Mobile)
function MobileNavItem({
  icon: Icon,
  label,
  isActive,
  onClick,
}: {
  icon: any;
  label: string;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <li className="flex-1">
      <button
        onClick={onClick}
        className={`flex w-full flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-bold transition-all duration-200 ${
          isActive
            ? "text-[#f05e23] scale-105"
            : "text-slate-400 hover:text-slate-700"
        }`}
      >
        <div
          className={`relative flex items-center justify-center transition-transform duration-300 ${
            isActive ? "-translate-y-1" : ""
          }`}
        >
          <Icon
            className={`w-5 h-5 transition-colors ${
              isActive ? "fill-[#f05e23]/20 stroke-[2.5px]" : "stroke-2"
            }`}
          />
          {isActive && (
            <span className="absolute -bottom-3 w-1.5 h-1.5 bg-[#f05e23] rounded-full animate-in zoom-in" />
          )}
        </div>
        <span
          className={`text-[10px] mt-1 font-semibold transition-opacity duration-300 ${
            isActive ? "opacity-100" : "opacity-0 absolute"
          }`}
        >
          {label}
        </span>
      </button>
    </li>
  );
}
