"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Heart, Calendar, MessageSquare, User } from "lucide-react";

// Importando os componentes das abas e complementos
import { SearchTab } from "@/components/search-tab";
import { FavoritesTab } from "@/components/favorites-tab";
import { BookingsTab } from "@/components/bookings-tab";
import { ChatTab } from "@/components/chat-tab";
import { ProfileTab } from "@/components/profile-tab";
import { NotificationBell } from "@/components/notification-bell";

// Importando a tela de detalhes e o modal de avaliação
import { RoomDetail } from "@/components/room-detail";
import { ReviewModal } from "@/components/review-modal";

type TabType = "search" | "favorites" | "bookings" | "chat" | "profile";

export default function DashboardPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>("search");

  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [pendingReviewBooking, setPendingReviewBooking] = useState<any | null>(
    null,
  );

  useEffect(() => {
    async function checkForPendingReviews() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select(`id, room_id, end_time, status, rooms ( name )`)
          .eq("user_id", user.id)
          .eq("status", "completed")
          .order("end_time", { ascending: false })
          .limit(3);

        if (bookingsError) throw bookingsError;

        if (bookings && bookings.length > 0) {
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
      } catch (error) {
        console.error("Erro ao checar avaliações pendentes:", error);
      }
    }

    checkForPendingReviews();
  }, [supabase]);

  const renderTab = () => {
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

  return (
    <div className="min-h-screen bg-slate-50 relative flex">
      {/* ========================================== */}
      {/* SINO FLUTUANTE (Agora no canto direito sem quebrar o layout) */}
      {/* ========================================== */}
      {!selectedRoom && (
        <div className="absolute top-6 right-6 md:top-8 md:right-8 z-50">
          <NotificationBell />
        </div>
      )}

      {/* 1. Navegação Desktop (Sidebar Lateral Fixa) */}
      {!selectedRoom && (
        <aside className="hidden md:flex flex-col fixed top-0 left-0 w-64 h-screen bg-white border-r border-slate-200 z-40 py-8 px-4 shadow-[10px_0_40px_-15px_rgba(0,0,0,0.05)]">
          <div className="flex items-center gap-3 px-3 mb-10">
            <div className="w-10 h-10 bg-[#f05e23] rounded-xl flex items-center justify-center text-white font-black text-sm shadow-md shadow-orange-500/20">
              FC
            </div>
            <span className="font-black text-xl text-slate-900 tracking-tight">
              Fusion Clinic
            </span>
          </div>

          <ul className="flex flex-col gap-2">
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

      {/* CONTEÚDO PRINCIPAL */}
      <main
        className={`flex-1 h-full min-h-screen flex flex-col ${!selectedRoom ? "md:pl-64" : ""}`}
      >
        <div className="flex-1 w-full">{renderTab()}</div>
      </main>

      {/* 2. Barra de Navegação Inferior (Mobile) */}
      {!selectedRoom && (
        <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 px-6 py-3 pb-safe z-40 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] md:hidden">
          <ul className="flex justify-between items-center max-w-md mx-auto">
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

      {/* 3. Tela de Detalhes da Sala (Sobreposição full-screen) */}
      {selectedRoom && (
        <RoomDetail
          roomId={selectedRoom.id}
          room={selectedRoom}
          onBack={() => setSelectedRoom(null)}
          initialModality="hora"
        />
      )}

      {/* 4. O "EFEITO UBER": Modal de Avaliação Obrigatória / Sugerida */}
      <ReviewModal
        isOpen={!!pendingReviewBooking}
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
        className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all duration-200 ${
          isActive
            ? "bg-orange-50 text-[#f05e23]"
            : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
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
    <li>
      <button
        onClick={onClick}
        className={`flex flex-col items-center justify-center w-14 h-12 transition-all duration-200 ${
          isActive ? "text-[#f05e23]" : "text-slate-400 hover:text-slate-600"
        }`}
      >
        <div
          className={`relative flex items-center justify-center transition-transform duration-300 ${
            isActive ? "-translate-y-1" : ""
          }`}
        >
          <Icon
            className={`w-6 h-6 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`}
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
