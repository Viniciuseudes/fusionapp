"use client";

import { useState } from "react";
import { SearchTab } from "@/components/search-tab";
import { BookingsTab } from "@/components/bookings-tab";
import { ChatTab } from "@/components/chat-tab";
import { ProfileTab } from "@/components/profile-tab";
import { RoomDetail } from "@/components/room-detail";
import {
  Search,
  CalendarDays,
  MessageSquare,
  UserRound,
  Heart,
} from "lucide-react";

export default function DashboardPage() {
  const [activeTab, setActiveTab] = useState("search");
  const [selectedRoomId, setSelectedRoomId] = useState<string | null>(null);

  // Array de navegação para facilitar a renderização nas duas barras
  const navItems = [
    { id: "search", label: "Buscar Salas", icon: Search },
    { id: "favorites", label: "Favoritos", icon: Heart },
    { id: "bookings", label: "Reservas", icon: CalendarDays },
    { id: "chat", label: "Mensagens", icon: MessageSquare },
    { id: "profile", label: "Perfil", icon: UserRound },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden">
      {/* =========================================
          SIDEBAR - DESKTOP (Invisível no celular)
          ========================================= */}
      <aside className="hidden md:flex flex-col w-64 bg-white border-r border-slate-200 shrink-0 z-10 shadow-sm">
        <div className="p-6 flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#f05e23] text-white font-bold text-xl shadow-md">
            F
          </div>
          <div>
            <h1 className="font-black text-slate-900 text-lg leading-tight">
              Fusion Clinic
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Encontre seu espaço
            </p>
          </div>
        </div>

        <nav className="flex-1 px-4 space-y-2 mt-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all ${
                  isActive
                    ? "bg-[#f05e23]/10 text-[#f05e23]"
                    : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${isActive ? "text-[#f05e23]" : "text-slate-400"}`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* =========================================
          ÁREA PRINCIPAL DE CONTEÚDO
          ========================================= */}
      <main className="flex-1 relative overflow-y-auto pb-20 md:pb-0">
        {activeTab === "search" && (
          <SearchTab onOpenRoom={(room) => setSelectedRoomId(room.id)} />
        )}
        {activeTab === "favorites" && (
          <div className="flex items-center justify-center h-full text-slate-500 font-medium">
            Seus espaços favoritos aparecerão aqui.
          </div>
        )}
        {activeTab === "bookings" && <BookingsTab />}
        {activeTab === "chat" && <ChatTab />}
        {activeTab === "profile" && <ProfileTab />}
      </main>

      {/* =========================================
          BOTTOM NAV - MOBILE (Invisível no PC)
          ========================================= */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 flex items-center justify-around p-3 pb-safe z-40">
        {navItems
          .filter((i) => i.id !== "favorites")
          .map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`flex flex-col items-center gap-1 transition-colors ${
                  isActive
                    ? "text-[#f05e23]"
                    : "text-slate-400 hover:text-slate-600"
                }`}
              >
                <Icon className="w-6 h-6" />
                <span className="text-[10px] font-bold">
                  {item.label.split(" ")[0]}
                </span>
              </button>
            );
          })}
      </div>

      {/* =========================================
          OVERLAY DE DETALHES DA SALA (Abre por cima)
          ========================================= */}
      {selectedRoomId && (
        <div className="fixed inset-0 z-50 bg-white">
          <RoomDetail
            roomId={selectedRoomId}
            onBack={() => setSelectedRoomId(null)}
          />
        </div>
      )}
    </div>
  );
}
