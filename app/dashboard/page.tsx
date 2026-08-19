"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  Heart,
  Calendar,
  MessageSquare,
  User,
  Loader2,
} from "lucide-react";

import { SearchTab } from "@/components/search-tab";
import { FavoritesTab } from "@/components/favorites-tab";
import { BookingsTab } from "@/components/bookings-tab";
import { ChatTab } from "@/components/chat-tab";
import { ProfileTab } from "@/components/profile-tab";
import { NotificationBell } from "@/components/notification-bell";
import { RoomDetail } from "@/components/room-detail";
import { ReviewModal } from "@/components/review-modal";
import { OnboardingTutorial } from "@/components/onboarding-tutorial";
import { PushRegistry } from "@/components/push-registry";

type TabType = "search" | "favorites" | "bookings" | "chat" | "profile";

function DashboardContent() {
  const router = useRouter();
  const supabase = createClient();

  // INJEÇÃO DO HOOK DE URL
  const searchParams = useSearchParams();

  const [activeTab, setActiveTab] = useState<TabType>("search");
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [pendingReviewBooking, setPendingReviewBooking] = useState<any | null>(
    null,
  );

  useEffect(() => {
    const scanParam = searchParams.get("scan");
    const currentHash = window.location.hash.replace("#", "");

    // 1. INTERCEPTOR SÊNIOR: Verifica se é uma requisição de Scanner
    if (scanParam && currentHash !== "bookings") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + "#bookings",
      );
      setActiveTab("bookings");
    }
    // 2. Fluxo Padrão: Se não tem Hash nem requisição, vai para Busca
    else if (!window.location.hash || window.location.hash === "") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + "#search",
      );
      setActiveTab("search");
    }
    // 3. Se tiver Hash normal salvo, recupera a aba
    else {
      if (
        ["search", "favorites", "bookings", "chat", "profile"].includes(
          currentHash,
        )
      ) {
        setActiveTab(currentHash as TabType);
      }
    }

    const handlePopState = () => {
      const hash = window.location.hash.replace("#", "");

      if (!hash || hash === "") {
        if (activeTab !== "search") {
          window.history.pushState(
            null,
            "",
            window.location.pathname + window.location.search + "#search",
          );
          setActiveTab("search");
          setSelectedRoom(null);
        }
        return;
      }

      if (hash.startsWith("room/") || hash.includes("checkout")) {
        return;
      }

      if (
        ["search", "favorites", "bookings", "chat", "profile"].includes(hash)
      ) {
        setSelectedRoom(null);
        setActiveTab(hash as TabType);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeTab, searchParams]);

  const handleTabChange = (tab: TabType) => {
    if (activeTab === tab && !selectedRoom) return;

    if (tab === "search") {
      if (activeTab !== "search") {
        window.history.back();
        return;
      }
    } else {
      if (activeTab === "search") {
        window.history.pushState(
          null,
          "",
          window.location.pathname + window.location.search + "#" + tab,
        );
      } else {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + "#" + tab,
        );
      }
      setActiveTab(tab);
      setSelectedRoom(null);
    }
  };

  const handleOpenRoom = (room: any) => {
    setSelectedRoom(room);
    window.history.pushState(
      null,
      "",
      window.location.pathname + window.location.search + "#room/" + room.id,
    );
  };

  const handleCloseRoom = () => {
    if (window.location.hash.startsWith("#room/")) {
      window.history.back();
    } else {
      setSelectedRoom(null);
    }
  };

  const handleNavigateFromRoom = (tab: TabType) => {
    setSelectedRoom(null);
    setActiveTab(tab);
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search + "#" + tab,
    );
  };

  useEffect(() => {
    async function initializeDashboard() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        if (!profile?.role) {
          router.push("/onboarding");
          return;
        }

        if (profile.role === "host") {
          router.push("/host");
          return;
        }

        if (profile.role === "admin") {
          router.push("/admin/dashboard");
          return;
        }

        const hasSeenOnboarding = localStorage.getItem(
          `fusion_onboarding_${user.id}`,
        );

        if (hasSeenOnboarding) {
          const now = new Date().toISOString();
          const { data: bookings } = await supabase
            .from("bookings")
            .select(`id, room_id, start_time, end_time, status, rooms ( name )`)
            .eq("user_id", user.id)
            .in("status", ["confirmed", "completed"])
            .lt("end_time", now)
            .order("end_time", { ascending: false })
            .limit(5);

          if (bookings && bookings.length > 0) {
            for (const booking of bookings) {
              const isSkipped = localStorage.getItem(
                `fusion_review_skipped_${booking.id}`,
              );
              if (isSkipped === "true") continue;

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
        }
      } catch (error) {
        console.error("Erro ao inicializar o dashboard:", error);
      }
    }

    initializeDashboard();
  }, [supabase, router]);

  const renderTab = () => {
    switch (activeTab) {
      case "search":
        return <SearchTab onOpenRoom={handleOpenRoom} />;
      case "favorites":
        return <FavoritesTab onOpenRoom={handleOpenRoom} />;
      case "bookings":
        return (
          <BookingsTab
            onNavigateToSearch={() => handleTabChange("search")}
            onNavigateToChat={() => handleTabChange("chat")}
          />
        );
      case "chat":
        return <ChatTab />;
      case "profile":
        return <ProfileTab />;
      default:
        return <SearchTab onOpenRoom={handleOpenRoom} />;
    }
  };

  return (
    <div className="flex min-h-svh flex-col bg-slate-50">
      <OnboardingTutorial />
      <PushRegistry />

      {!selectedRoom && (
        <div className="absolute top-10 right-5 lg:top-8 lg:right-8 z-50">
          <NotificationBell />
        </div>
      )}

      {!selectedRoom && (
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
              onClick={() => handleTabChange("search")}
            />
            <DesktopNavItem
              icon={Heart}
              label="Favoritos"
              isActive={activeTab === "favorites"}
              onClick={() => handleTabChange("favorites")}
            />
            <DesktopNavItem
              icon={Calendar}
              label="Minhas Reservas"
              isActive={activeTab === "bookings"}
              onClick={() => handleTabChange("bookings")}
            />
            <DesktopNavItem
              icon={MessageSquare}
              label="Mensagens"
              isActive={activeTab === "chat"}
              onClick={() => handleTabChange("chat")}
            />
            <DesktopNavItem
              icon={User}
              label="Meu Perfil"
              isActive={activeTab === "profile"}
              onClick={() => handleTabChange("profile")}
            />
          </ul>
        </aside>
      )}

      <main
        className={`flex-1 min-w-0 ${!selectedRoom ? "lg:ml-64 pb-20 lg:pb-0" : ""}`}
      >
        {renderTab()}
      </main>

      {!selectedRoom && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex lg:hidden items-stretch justify-around border-t border-slate-200 bg-white/90 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <ul className="flex justify-between items-center w-full max-w-md mx-auto">
            <MobileNavItem
              icon={Search}
              label="Buscar"
              isActive={activeTab === "search"}
              onClick={() => handleTabChange("search")}
            />
            <MobileNavItem
              icon={Heart}
              label="Favoritos"
              isActive={activeTab === "favorites"}
              onClick={() => handleTabChange("favorites")}
            />
            <MobileNavItem
              icon={Calendar}
              label="Reservas"
              isActive={activeTab === "bookings"}
              onClick={() => handleTabChange("bookings")}
            />
            <MobileNavItem
              icon={MessageSquare}
              label="Inbox"
              isActive={activeTab === "chat"}
              onClick={() => handleTabChange("chat")}
            />
            <MobileNavItem
              icon={User}
              label="Perfil"
              isActive={activeTab === "profile"}
              onClick={() => handleTabChange("profile")}
            />
          </ul>
        </nav>
      )}

      {selectedRoom && (
        <RoomDetail
          roomId={selectedRoom.id}
          room={selectedRoom}
          onBack={handleCloseRoom}
          onNavigateToProfile={() => handleNavigateFromRoom("profile")}
          onNavigateToChat={() => handleNavigateFromRoom("chat")}
          initialModality={selectedRoom.selectedModality || "hora"}
        />
      )}

      <ReviewModal
        isOpen={!!pendingReviewBooking}
        onClose={() => setPendingReviewBooking(null)}
        bookingId={pendingReviewBooking?.id || ""}
        roomId={pendingReviewBooking?.room_id || ""}
        roomName={pendingReviewBooking?.rooms?.name || ""}
        bookingDate={pendingReviewBooking?.start_time}
        onSuccess={() => setPendingReviewBooking(null)}
      />
    </div>
  );
}

function DesktopNavItem({ icon: Icon, label, isActive, onClick }: any) {
  return (
    <li>
      <button
        onClick={onClick}
        className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-bold transition-all duration-200 ${isActive ? "bg-[#f05e23]/10 text-[#f05e23]" : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"}`}
      >
        <Icon
          className={`w-5 h-5 ${isActive ? "stroke-[2.5px]" : "stroke-2"}`}
        />{" "}
        {label}
      </button>
    </li>
  );
}

function MobileNavItem({ icon: Icon, label, isActive, onClick }: any) {
  return (
    <li className="flex-1">
      <button
        onClick={onClick}
        className={`flex w-full flex-col items-center justify-center gap-1.5 py-3 text-[10px] font-bold transition-all duration-200 ${isActive ? "text-[#f05e23] scale-105" : "text-slate-400 hover:text-slate-700"}`}
      >
        <div
          className={`relative flex items-center justify-center transition-transform duration-300 ${isActive ? "-translate-y-1" : ""}`}
        >
          <Icon
            className={`w-5 h-5 transition-colors ${isActive ? "fill-[#f05e23]/20 stroke-[2.5px]" : "stroke-2"}`}
          />
          {isActive && (
            <span className="absolute -bottom-3 w-1.5 h-1.5 bg-[#f05e23] rounded-full animate-in zoom-in" />
          )}
        </div>
        <span
          className={`text-[10px] mt-1 font-semibold transition-opacity duration-300 ${isActive ? "opacity-100" : "opacity-0 absolute"}`}
        >
          {label}
        </span>
      </button>
    </li>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="flex h-screen w-full items-center justify-center bg-slate-50">
          <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
