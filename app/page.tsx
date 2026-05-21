"use client";

import { useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
// AQUI ESTAVA O ERRO! Agora estamos importando a Room direto da SearchTab
import { SearchTab, type Room } from "@/components/search-tab";
import { RoomDetail } from "@/components/room-detail";
import { Search, Heart, CalendarDays, LogIn, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";

const navItems = [
  { id: "buscar" as const, label: "Buscar Salas", icon: Search },
  { id: "favoritos" as const, label: "Favoritos", icon: Heart },
  { id: "reservas" as const, label: "Reservas", icon: CalendarDays },
  { id: "entrar" as const, label: "Entrar", icon: LogIn },
];

type TabId = (typeof navItems)[number]["id"];

export default function AppPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<TabId>("buscar");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  const handleOpenRoom = useCallback((room: Room) => {
    setSelectedRoom(room);
  }, []);

  const handleCloseRoom = useCallback(() => {
    setSelectedRoom(null);
  }, []);

  const handleTabClick = (id: TabId) => {
    if (id !== "buscar") {
      router.push("/login");
    } else {
      setActiveTab(id);
      setSelectedRoom(null);
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      {/* Desktop Sidebar (Limpa e usando cores do Tema) */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-slate-200 bg-white shadow-sm">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-slate-100">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary shadow-sm">
            <span className="text-primary-foreground font-black text-xl">
              F
            </span>
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight">
              Fusion Clinic
            </h1>
            <p className="text-xs text-slate-500 font-medium">
              Encontre seu espaço
            </p>
          </div>
        </div>

        <nav className="flex flex-col gap-1 p-3 flex-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-bold transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-slate-500 hover:bg-slate-100 hover:text-slate-900",
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            );
          })}
        </nav>

        {/* CALL TO ACTION LOGAR NO DESKTOP */}
        <div className="p-4 border-t border-slate-100 space-y-3 bg-slate-50/50">
          <p className="text-xs text-slate-500 font-medium text-center">
            Faça login para reservar salas e ganhar cashback.
          </p>
          <Button
            onClick={() => router.push("/login")}
            className="w-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
          >
            Entrar no Painel
          </Button>
          <Button
            onClick={() => router.push("/login")}
            variant="outline"
            className="w-full text-primary border-primary/20 hover:bg-primary/5 font-bold"
          >
            <UserPlus className="w-4 h-4 mr-2" /> Criar Conta
          </Button>
        </div>
      </aside>

      {/* Main Content (Sem o cabeçalho branco duplicado!) */}
      <main
        className={cn("flex-1 lg:ml-64", selectedRoom ? "" : "pb-20 lg:pb-0")}
      >
        {selectedRoom ? (
          <RoomDetail room={selectedRoom} onBack={handleCloseRoom} />
        ) : (
          <>
            {activeTab === "buscar" && (
              <SearchTab onOpenRoom={handleOpenRoom} />
            )}
          </>
        )}
      </main>

      {/* Mobile Bottom Nav (Usando a cor Primary) */}
      {!selectedRoom && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex lg:hidden items-stretch justify-around border-t border-slate-200 bg-white/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => handleTabClick(item.id)}
                className={cn(
                  "flex flex-1 flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-bold transition-all",
                  isActive
                    ? "text-primary scale-105"
                    : "text-slate-400 hover:text-slate-700",
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
      )}
    </div>
  );
}
