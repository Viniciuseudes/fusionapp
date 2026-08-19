"use client";

import { useState, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { SearchTab, type Room } from "@/components/search-tab";
import { RoomDetail } from "@/components/room-detail";
import {
  Search,
  Heart,
  CalendarDays,
  LogIn,
  UserPlus,
  Loader2,
} from "lucide-react";
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
  const supabase = createClient();

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("buscar");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);

  useEffect(() => {
    async function checkAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (session?.user) {
          const { data: profile } = await supabase
            .from("profiles")
            .select("role")
            .eq("id", session.user.id)
            .single();

          if (profile?.role === "host") {
            router.replace("/host");
          } else if (profile?.role === "admin") {
            router.replace("/admin/dashboard");
          } else {
            router.replace("/dashboard");
          }
        } else {
          setIsCheckingAuth(false);
        }
      } catch (error) {
        setIsCheckingAuth(false);
      }
    }
    checkAuth();
  }, [router, supabase]);

  useEffect(() => {
    if (isCheckingAuth) return;

    if (!window.location.hash || window.location.hash === "") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + "#buscar",
      );
      setActiveTab("buscar");
    } else {
      const hash = window.location.hash.replace("#", "");
      if (hash === "buscar") {
        setActiveTab("buscar");
      }
    }

    const handlePopState = () => {
      const hash = window.location.hash.replace("#", "");

      if (!hash || hash === "") {
        if (activeTab !== "buscar") {
          window.history.pushState(
            null,
            "",
            window.location.pathname + "#buscar",
          );
          setActiveTab("buscar");
          setSelectedRoom(null);
        }
        return;
      }

      if (hash.startsWith("room/")) {
        return;
      }

      if (hash === "buscar") {
        setSelectedRoom(null);
        setActiveTab("buscar");
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeTab, isCheckingAuth]);

  const handleOpenRoom = useCallback((room: Room) => {
    setSelectedRoom(room);
    window.history.pushState(
      null,
      "",
      window.location.pathname + "#room/" + room.id,
    );
  }, []);

  const handleCloseRoom = useCallback(() => {
    if (window.location.hash.startsWith("#room/")) {
      window.history.back();
    } else {
      setSelectedRoom(null);
    }
  }, []);

  const handleTabClick = (id: TabId) => {
    if (id !== "buscar") {
      router.push("/login");
    } else {
      if (activeTab === "buscar" && !selectedRoom) return;
      setActiveTab("buscar");
      setSelectedRoom(null);
      window.history.pushState(null, "", window.location.pathname + "#buscar");
    }
  };

  if (isCheckingAuth) {
    return (
      <div className="flex h-screen w-full items-center justify-center bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
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

      <main
        className={cn("flex-1 lg:ml-64", selectedRoom ? "" : "pb-20 lg:pb-0")}
      >
        {selectedRoom ? (
          <RoomDetail
            roomId={selectedRoom.id}
            room={selectedRoom}
            onBack={handleCloseRoom}
            onNavigateToChat={() => router.push("/login")}
            initialModality={selectedRoom.selectedModality || "hora"}
          />
        ) : (
          <>
            {activeTab === "buscar" && (
              <SearchTab onOpenRoom={handleOpenRoom} />
            )}
          </>
        )}
      </main>

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
