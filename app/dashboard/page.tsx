"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Search, Heart, Calendar, MessageSquare, User } from "lucide-react";

// Importando os componentes das abas
import { SearchTab } from "@/components/search-tab";
import { FavoritesTab } from "@/components/favorites-tab";
import { BookingsTab } from "@/components/bookings-tab";
import { ChatTab } from "@/components/chat-tab";
import { ProfileTab } from "@/components/profile-tab";

// Importando a tela de detalhes e o modal de avaliação
import { RoomDetail } from "@/components/room-detail";
import { ReviewModal } from "@/components/review-modal";

type TabType = "search" | "favorites" | "bookings" | "chat" | "profile";

export default function DashboardPage() {
  const supabase = createClient();
  const [activeTab, setActiveTab] = useState<TabType>("search");

  // Controle para abrir a tela de detalhes de uma sala sobrepondo o dashboard
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);

  // Controle do "Efeito Uber" - A reserva que precisa ser avaliada
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

        // 1. Busca as últimas reservas do usuário com status 'completed'
        // (Você também pode validar se a 'end_time' é menor que a hora atual)
        const { data: bookings, error: bookingsError } = await supabase
          .from("bookings")
          .select(
            `
            id, 
            room_id, 
            end_time,
            status,
            rooms ( name )
          `,
          )
          .eq("user_id", user.id)
          .eq("status", "completed")
          .order("end_time", { ascending: false })
          .limit(3);

        if (bookingsError) throw bookingsError;

        if (bookings && bookings.length > 0) {
          // 2. Para cada reserva finalizada, checamos se já existe um review
          for (const booking of bookings) {
            const { data: reviewData } = await supabase
              .from("reviews")
              .select("id")
              .eq("booking_id", booking.id)
              .maybeSingle();

            // Se NÃO encontrar um review para essa reserva, achamos o alvo! Mostra o modal.
            if (!reviewData) {
              setPendingReviewBooking(booking);
              break; // Para o loop, pois só queremos mostrar um modal por vez
            }
          }
        }
      } catch (error) {
        console.error("Erro ao checar avaliações pendentes:", error);
      }
    }

    checkForPendingReviews();
  }, [supabase]);

  // Função para renderizar a aba ativa
  const renderTab = () => {
    switch (activeTab) {
      case "search":
        return <SearchTab onOpenRoom={setSelectedRoom} />;
      case "favorites":
        return <FavoritesTab onOpenRoom={setSelectedRoom} />;
      case "bookings":
        return <BookingsTab />;
      case "chat":
        return <ChatTab />;
      case "profile":
        return <ProfileTab />;
      default:
        return <SearchTab onOpenRoom={setSelectedRoom} />;
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 relative">
      {/* CONTEÚDO PRINCIPAL (Renderiza a aba selecionada) */}
      <main className="h-full">{renderTab()}</main>

      {/* MENUS E OVERLAYS */}

      {/* 1. Barra de Navegação Inferior (Mobile) / Lateral (Desktop) */}
      {!selectedRoom && (
        <nav className="fixed bottom-0 left-0 w-full bg-white border-t border-slate-200 px-6 py-3 pb-safe z-40 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)] md:hidden">
          <ul className="flex justify-between items-center max-w-md mx-auto">
            <NavItem
              icon={Search}
              label="Buscar"
              isActive={activeTab === "search"}
              onClick={() => setActiveTab("search")}
            />
            <NavItem
              icon={Heart}
              label="Favoritos"
              isActive={activeTab === "favorites"}
              onClick={() => setActiveTab("favorites")}
            />
            <NavItem
              icon={Calendar}
              label="Reservas"
              isActive={activeTab === "bookings"}
              onClick={() => setActiveTab("bookings")}
            />
            <NavItem
              icon={MessageSquare}
              label="Inbox"
              isActive={activeTab === "chat"}
              onClick={() => setActiveTab("chat")}
            />
            <NavItem
              icon={User}
              label="Perfil"
              isActive={activeTab === "profile"}
              onClick={() => setActiveTab("profile")}
            />
          </ul>
        </nav>
      )}

      {/* 2. Navegação Desktop (Fixa no topo ou lateral, opcional para telas grandes) */}
      {/* Aqui você pode incluir uma topbar padrão para desktop se desejar */}

      {/* 3. Tela de Detalhes da Sala (Sobreposição full-screen) */}
      {selectedRoom && (
        <RoomDetail
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
          // Quando envia o review com sucesso, limpa a pendência
          setPendingReviewBooking(null);
          // Opcional: Atualizar alguma listagem local, se necessário
        }}
      />
    </div>
  );
}

// Componente auxiliar para os botões do menu inferior
function NavItem({
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
          {/* Bolinha indicadora de aba ativa */}
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
