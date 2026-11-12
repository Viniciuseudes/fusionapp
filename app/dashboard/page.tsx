// app/dashboard/page.tsx
"use client";

import { useState, useEffect, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  computeWalletBalancesFIFO,
  normalizeCreditTier,
} from "@/utils/wallet-ledger";
import {
  Search,
  Heart,
  Calendar,
  MessageSquare,
  User,
  Loader2,
  Building2,
  ChevronRight,
  Tag,
  Crown,
} from "lucide-react";

import { SearchTab } from "@/components/search-tab";
import { FavoritesTab } from "@/components/favorites-tab";
import { BookingsTab } from "@/components/bookings-tab";
import { ChatTab } from "@/components/chat-tab";
import { ProfileTab } from "@/components/profile-tab";
import { CohostTab } from "@/components/cohost-tab";
import { NotificationBell } from "@/components/notification-bell";
import { RoomDetail } from "@/components/room-detail";
import {
  ReviewModal,
  SKIPPED_REVIEWS_LIST_KEY,
} from "@/components/review-modal";
import { PushRegistry } from "@/components/push-registry";
import { FusionPassPromoPopup } from "@/components/fusion-pass-promo-popup";

type TabType =
  "search" | "favorites" | "bookings" | "cohost" | "chat" | "profile";

type CreditTier = "start" | "vip" | "master";

const VALID_TABS: TabType[] = [
  "search",
  "favorites",
  "bookings",
  "cohost",
  "chat",
  "profile",
];

function formatTierLabel(tier: CreditTier | null): string {
  if (tier === "master") return "Premium";
  if (tier === "vip") return "VIP";
  return "Basic";
}

function getNextUpgradeTier(tier: CreditTier | null): CreditTier {
  if (tier === "start") return "vip";
  return "master";
}

function DashboardContent() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const searchParams = useSearchParams();

  const scanParam =
    searchParams.get("scan") ||
    searchParams.get("room") ||
    searchParams.get("door");

  const [isDoorScanSession, setIsDoorScanSession] = useState<boolean>(() => {
    if (scanParam) return true;
    if (typeof window !== "undefined") {
      const sp = new URLSearchParams(window.location.search);
      if (sp.get("scan") || sp.get("room") || sp.get("door")) {
        sessionStorage.setItem("fusion_door_scan_session", "1");
        return true;
      }
      return sessionStorage.getItem("fusion_door_scan_session") === "1";
    }
    return false;
  });

  useEffect(() => {
    if (scanParam && !isDoorScanSession) {
      setIsDoorScanSession(true);
      if (typeof window !== "undefined") {
        sessionStorage.setItem("fusion_door_scan_session", "1");
      }
    }
  }, [scanParam, isDoorScanSession]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isDoorScanSession) {
      document.body.setAttribute("data-door-scan-lock", "true");
    } else {
      document.body.removeAttribute("data-door-scan-lock");
    }
    return () => {
      document.body.removeAttribute("data-door-scan-lock");
    };
  }, [isDoorScanSession]);

  const [activeTab, setActiveTab] = useState<TabType>(() =>
    scanParam || isDoorScanSession ? "bookings" : "search",
  );
  const [selectedRoom, setSelectedRoom] = useState<any | null>(null);
  const [pendingReviewBooking, setPendingReviewBooking] = useState<any | null>(
    null,
  );
  const [isReviewCheckDone, setIsReviewCheckDone] = useState(false);
  const [isCohost, setIsCohost] = useState(false);
  const [logoError, setLogoError] = useState(false);

  const [specialistInfo, setSpecialistInfo] = useState<{
    fullName: string;
    avatarUrl: string | null;
    specialty: string | null;
  }>({
    fullName: "Meu Perfil",
    avatarUrl: null,
    specialty: null,
  });

  const [walletState, setWalletState] = useState<{
    isSubscriber: boolean;
    activeTier: CreditTier | null;
    totalCredits: number;
    startCredits: number;
    vipCredits: number;
    masterCredits: number;
  }>({
    isSubscriber: false,
    activeTier: null,
    totalCredits: 0,
    startCredits: 0,
    vipCredits: 0,
    masterCredits: 0,
  });

  useEffect(() => {
    const currentHash = window.location.hash.replace("#", "");

    if ((scanParam || isDoorScanSession) && currentHash !== "bookings") {
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + "#bookings",
      );
      setActiveTab("bookings");
    } else if (!window.location.hash || window.location.hash === "") {
      const initialTab = isDoorScanSession ? "bookings" : "search";
      window.history.replaceState(
        null,
        "",
        window.location.pathname + window.location.search + "#" + initialTab,
      );
      setActiveTab(initialTab);
    } else {
      if (VALID_TABS.includes(currentHash as TabType)) {
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

      if (VALID_TABS.includes(hash as TabType)) {
        setSelectedRoom(null);
        setActiveTab(hash as TabType);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [activeTab, scanParam, isDoorScanSession]);

  const handleTabChange = (tab: TabType) => {
    if (tab !== "bookings" && isDoorScanSession) {
      setIsDoorScanSession(false);
      if (typeof window !== "undefined") {
        sessionStorage.removeItem("fusion_door_scan_session");
      }
    }

    if (activeTab === tab && !selectedRoom) return;

    if (tab === "search") {
      if (activeTab !== "search") {
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search + "#search",
        );
        setActiveTab("search");
        setSelectedRoom(null);
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

  const handleOpenFusionPassShowcase = (preferredTier?: CreditTier) => {
    if (typeof window !== "undefined") {
      const targetTier =
        preferredTier ||
        (walletState.isSubscriber
          ? getNextUpgradeTier(walletState.activeTier)
          : "vip");

      window.dispatchEvent(
        new CustomEvent("open-fusion-pass", {
          detail: {
            step: "plans",
            tier: targetTier,
            isUpgrade: walletState.isSubscriber,
          },
        }),
      );
    }
  };

  useEffect(() => {
    async function initializeDashboard() {
      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();

        if (userErr || !user) {
          await supabase.auth.signOut().catch(() => {});
          router.replace("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role, full_name, avatar_url, specialty")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.role) {
          router.replace("/onboarding");
          return;
        }

        if (profile.role === "host") {
          router.replace("/host");
          return;
        }

        if (profile.role === "admin") {
          router.replace("/admin/dashboard");
          return;
        }

        setSpecialistInfo({
          fullName: profile.full_name || "Profissional",
          avatarUrl: profile.avatar_url || null,
          specialty: profile.specialty || null,
        });

        if (user.email) {
          await supabase
            .from("room_contracts")
            .update({ specialist_id: user.id })
            .ilike("specialist_email", user.email)
            .is("specialist_id", null);
        }

        const [cohostRes, walletTxsRes, subsRes] = await Promise.all([
          supabase
            .from("room_contracts")
            .select("id, room_id")
            .eq("specialist_id", user.id)
            .in("status", ["active", "pending_signature"])
            .limit(1),
          supabase
            .from("wallet_transactions")
            .select("amount, tier, type, description, created_at, expires_at")
            .eq("user_id", user.id)
            .order("created_at", { ascending: true }),
          supabase
            .from("subscriptions")
            .select("id, tier, hours, status")
            .eq("user_id", user.id)
            .eq("status", "active"),
        ]);

        if (cohostRes.data && cohostRes.data.length > 0) {
          setIsCohost(true);
        }

        const txs = walletTxsRes.data || [];
        const activeSubs = subsRes.data || [];
        const fifo: any = computeWalletBalancesFIFO(txs);

        const startCredits = Math.max(
          0,
          Number(fifo?.start ?? fifo?.basic ?? 0),
        );
        const vipCredits = Math.max(0, Number(fifo?.vip ?? 0));
        const masterCredits = Math.max(
          0,
          Number(fifo?.master ?? fifo?.premium ?? 0),
        );
        const totalCredits = Number(
          (startCredits + vipCredits + masterCredits).toFixed(1),
        );

        const hasActiveSub = activeSubs.length > 0;
        const isSubscriber = totalCredits > 0 || hasActiveSub;

        let detectedTier: CreditTier | null = null;
        if (masterCredits > 0) {
          detectedTier = "master";
        } else if (vipCredits > 0) {
          detectedTier = "vip";
        } else if (startCredits > 0) {
          detectedTier = "start";
        } else if (hasActiveSub) {
          detectedTier = normalizeCreditTier(
            activeSubs[0]?.tier || "start",
          ) as CreditTier;
        }

        setWalletState({
          isSubscriber,
          activeTier: detectedTier,
          totalCredits,
          startCredits,
          vipCredits,
          masterCredits,
        });

        const isScanActiveNow =
          isDoorScanSession ||
          (typeof window !== "undefined" &&
            (new URLSearchParams(window.location.search).has("scan") ||
              sessionStorage.getItem("fusion_door_scan_session") === "1"));

        if (!isScanActiveNow) {
          const now = new Date().toISOString();

          const [bookingsRes, userReviewsRes] = await Promise.all([
            supabase
              .from("bookings")
              .select(
                `id, room_id, start_time, end_time, status, contract_id, rooms ( name )`,
              )
              .eq("user_id", user.id)
              .is("contract_id", null)
              .in("status", ["confirmed", "completed"])
              .lt("end_time", now)
              .order("end_time", { ascending: false })
              .limit(15),
            supabase
              .from("reviews")
              .select("id, booking_id, room_id")
              .eq("guest_id", user.id),
          ]);

          const pastBookings = bookingsRes.data || [];
          const existingReviews = userReviewsRes.data || [];

          const reviewedBookingIds = new Set<string>(
            existingReviews.map((r: any) => r.booking_id).filter(Boolean),
          );

          // Conjunto unificado de IDs e sessões já puladas (LocalStorage + User Metadata do Supabase)
          const skippedSet = new Set<string>(
            Array.isArray(user.user_metadata?.skipped_review_ids)
              ? user.user_metadata.skipped_review_ids
              : [],
          );

          try {
            const rawLocalList = localStorage.getItem(SKIPPED_REVIEWS_LIST_KEY);
            if (rawLocalList) {
              const parsedLocal = JSON.parse(rawLocalList);
              if (Array.isArray(parsedLocal)) {
                parsedLocal.forEach((k) => skippedSet.add(k));
              }
            }
          } catch {}

          // Agrupa reservas de múltiplas horas da mesma sala e mesmo dia em uma única sessão
          const sessionsMap = new Map<string, any[]>();
          pastBookings.forEach((b: any) => {
            const dayKey = `${b.room_id}_${String(b.start_time || "").slice(0, 10)}`;
            const group = sessionsMap.get(dayKey) || [];
            group.push(b);
            sessionsMap.set(dayKey, group);
          });

          for (const [dayKey, groupBookings] of sessionsMap.entries()) {
            const isSessionHandled =
              skippedSet.has(dayKey) ||
              localStorage.getItem(
                `fusion_review_skipped_session_${dayKey}`,
              ) === "true" ||
              groupBookings.some(
                (b: any) =>
                  reviewedBookingIds.has(b.id) ||
                  skippedSet.has(b.id) ||
                  localStorage.getItem(`fusion_review_skipped_${b.id}`) ===
                    "true",
              );

            if (isSessionHandled) continue;

            // Encontrou a sessão mais recente ainda não avaliada nem pulada
            const primaryBooking = groupBookings[groupBookings.length - 1];
            setPendingReviewBooking({
              ...primaryBooking,
              siblingBookingIds: groupBookings.map((b: any) => b.id),
            });
            break;
          }
        }
      } catch (error) {
        console.error("Erro ao inicializar o dashboard:", error);
      } finally {
        setIsReviewCheckDone(true);
      }
    }

    initializeDashboard();
  }, [supabase, router, isDoorScanSession]);

  const renderTab = () => {
    switch (activeTab) {
      case "search":
        return (
          <SearchTab
            onOpenRoom={handleOpenRoom}
            onNavigateToProfile={() => handleTabChange("profile")}
            isDashboard={true}
          />
        );
      case "favorites":
        return <FavoritesTab onOpenRoom={handleOpenRoom} />;
      case "bookings":
        return (
          <BookingsTab
            onNavigateToSearch={() => handleTabChange("search")}
            onNavigateToChat={() => handleTabChange("chat")}
          />
        );
      case "cohost":
        return <CohostTab />;
      case "chat":
        return <ChatTab />;
      case "profile":
        return <ProfileTab />;
      default:
        return (
          <SearchTab
            onOpenRoom={handleOpenRoom}
            onNavigateToProfile={() => handleTabChange("profile")}
            isDashboard={true}
          />
        );
    }
  };

  const firstName = specialistInfo.fullName.split(" ")[0] || "Perfil";
  const currentTierName = formatTierLabel(walletState.activeTier);
  const nextUpgradeTier = getNextUpgradeTier(walletState.activeTier);
  const nextUpgradeTierName = formatTierLabel(nextUpgradeTier);

  return (
    <div className="flex min-h-svh flex-col bg-[#FAF7F4] font-sans">
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (min-width: 1024px) {
              .fusion-logged-hero-bridge {
                margin-top: -4.25rem !important;
                position: relative !important;
                z-index: 30 !important;
              }
              .fusion-logged-hero-bridge > div > div:first-child,
              .fusion-logged-hero-bridge > div > header:first-child,
              .fusion-logged-hero-bridge > div:first-child > div:first-child {
                background: transparent !important;
                background-color: transparent !important;
                background-image: none !important;
                padding-top: 0 !important;
                padding-bottom: 1.25rem !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }
            }
            body[data-door-scan-lock="true"] [role="dialog"]:not([data-door-allowed="true"]),
            body[data-door-scan-lock="true"] [data-radix-portal]:not(:has([data-door-allowed="true"])) {
              display: none !important;
              opacity: 0 !important;
              pointer-events: none !important;
            }
          `,
        }}
      />

      {/* O Pop-up do Fusion Pass+ fica suspenso enquanto a verificação de avaliação roda ou se o modal de avaliação estiver aberto */}
      {!isDoorScanSession && (
        <>
          <FusionPassPromoPopup
            isSubscriber={walletState.isSubscriber}
            currentTier={walletState.activeTier}
            suspendAutoOpen={
              !isReviewCheckDone || Boolean(pendingReviewBooking)
            }
          />
          <PushRegistry />
        </>
      )}

      {/* 1. TOP BAR DINÂMICA */}
      {!selectedRoom && !isDoorScanSession && (
        <div className="bg-[#0C0A09] text-white px-3.5 lg:px-10 py-2 lg:py-2.5 z-50">
          <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-2.5 lg:gap-4">
            {walletState.isSubscriber ? (
              <>
                <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                  <span className="inline-flex items-center gap-1 bg-gradient-to-r from-[#BF4B24] to-[#EAB308] text-white text-[9px] lg:text-[10px] font-extrabold uppercase tracking-wider px-2 lg:px-2.5 py-0.5 rounded-full shrink-0">
                    <Crown className="w-2.5 h-2.5 lg:w-3 lg:h-3 stroke-[2.5]" />
                    <span>PASS+ {currentTierName.toUpperCase()}</span>
                  </span>
                  <p className="text-[11px] lg:text-xs font-bold text-[#FBBF24] truncate">
                    {walletState.totalCredits}h disponíveis na carteira
                    <span className="hidden md:inline text-stone-300 font-medium">
                      {" "}
                      •{" "}
                      {walletState.activeTier === "master"
                        ? "Acesso total liberado em todas as salas Basic, VIP e Premium"
                        : `Faça upgrade para o Pass+ ${nextUpgradeTierName} e libere salas superiores com mais desconto`}
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenFusionPassShowcase(nextUpgradeTier)}
                  className="px-2.5 lg:px-4 py-1 rounded-full border border-amber-400/80 hover:border-amber-300 hover:bg-amber-400/15 text-[#FBBF24] font-bold text-[11px] lg:text-xs shrink-0 flex items-center gap-0.5 lg:gap-1 transition-all active:scale-95 cursor-pointer"
                >
                  <span>
                    {walletState.activeTier === "master"
                      ? "+Horas"
                      : `Upgrade ${nextUpgradeTierName}`}
                  </span>
                  <ChevronRight className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                </button>
              </>
            ) : (
              <>
                <div className="flex items-center gap-2 lg:gap-3 min-w-0">
                  <span className="inline-flex items-center gap-1 bg-[#EAB308] text-stone-950 text-[9px] lg:text-[10px] font-extrabold uppercase tracking-wider px-2 lg:px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                    <Tag className="w-2.5 h-2.5 lg:w-3 lg:h-3 stroke-[2.5]" />
                    <span>PASS+</span>
                  </span>
                  <p className="text-[11px] lg:text-xs font-bold text-[#FBBF24] truncate">
                    Horas com até 41% de desconto
                    <span className="hidden md:inline text-stone-300 font-medium">
                      {" "}
                      • Sem fidelidade • Use em qualquer unidade ou transfira
                      horas
                    </span>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenFusionPassShowcase("vip")}
                  className="px-3 lg:px-4 py-1 rounded-full border border-amber-400/80 hover:border-amber-300 hover:bg-amber-400/15 text-[#FBBF24] font-bold text-[11px] lg:text-xs shrink-0 flex items-center gap-0.5 lg:gap-1 transition-all active:scale-95 cursor-pointer"
                >
                  <span>Ver Planos</span>
                  <ChevronRight className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
                </button>
              </>
            )}
          </div>
        </div>
      )}

      {/* 2. HEADER DESKTOP */}
      {!selectedRoom && (
        <header className="hidden lg:block sticky top-0 z-40 bg-white border-b border-stone-200/70">
          <div className="max-w-[1360px] mx-auto px-6 xl:px-8 h-20 flex items-center justify-between gap-4">
            <button
              type="button"
              onClick={() => handleTabChange("search")}
              className="flex items-center shrink-0 cursor-pointer focus:outline-none"
            >
              {!logoError ? (
                <img
                  src="/logo-fusion-orange.png"
                  alt="Fusion Clinic"
                  onError={() => setLogoError(true)}
                  className="h-9 xl:h-10 w-auto object-contain"
                />
              ) : (
                <span className="text-xl font-black text-stone-900 tracking-tight">
                  Fusion<span className="text-[#BF4B24]">.</span>
                </span>
              )}
            </button>

            <nav className="flex items-center gap-5 xl:gap-7 min-w-0">
              <DesktopNavLink
                label="Explorar Salas"
                isActive={activeTab === "search"}
                onClick={() => handleTabChange("search")}
              />
              <button
                type="button"
                onClick={() => handleOpenFusionPassShowcase(nextUpgradeTier)}
                className="py-2.5 text-[14px] xl:text-[15px] font-medium text-stone-700 hover:text-stone-900 whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                <span>
                  {walletState.isSubscriber
                    ? walletState.activeTier === "master"
                      ? "Recarregar Pass+"
                      : "Upgrade Pass+"
                    : "Planos Pass+"}
                </span>
                <span className="text-[10px] xl:text-[11px] font-bold text-white bg-gradient-to-r from-[#EA580C] to-[#F59E0B] px-2 py-0.5 rounded-full shadow-2xs">
                  {walletState.isSubscriber
                    ? `${walletState.totalCredits}h ativas`
                    : "Até -41%"}
                </span>
              </button>
              <DesktopNavLink
                label="Favoritos"
                isActive={activeTab === "favorites"}
                onClick={() => handleTabChange("favorites")}
              />
              <DesktopNavLink
                label="Reservas"
                isActive={activeTab === "bookings"}
                onClick={() => handleTabChange("bookings")}
              />
              {isCohost && (
                <DesktopNavLink
                  label="Minha Sala"
                  isActive={activeTab === "cohost"}
                  onClick={() => handleTabChange("cohost")}
                />
              )}
              <DesktopNavLink
                label="Mensagens"
                isActive={activeTab === "chat"}
                onClick={() => handleTabChange("chat")}
              />
            </nav>

            <div className="flex items-center gap-3 shrink-0">
              <div className="relative flex items-center">
                <NotificationBell />
              </div>
              <button
                type="button"
                onClick={() => handleTabChange("profile")}
                className={`flex items-center gap-2.5 pl-3.5 pr-1.5 py-1.5 rounded-full border transition-all cursor-pointer shrink-0 ${
                  walletState.isSubscriber
                    ? "border-[#BF4B24]/45 bg-gradient-to-r from-[#FAF7F5] to-orange-50/60 shadow-2xs"
                    : activeTab === "profile"
                      ? "border-[#BF4B24] bg-[#FAF7F5]"
                      : "border-stone-200 bg-white hover:border-stone-300 shadow-2xs"
                }`}
              >
                <div className="text-right">
                  <span className="text-xs font-bold text-stone-900 whitespace-nowrap block leading-none">
                    Dr(a). {firstName}
                  </span>
                  {walletState.isSubscriber ? (
                    <span className="text-[10px] font-extrabold text-[#BF4B24] whitespace-nowrap flex items-center justify-end gap-1 mt-0.5">
                      <Crown className="w-2.5 h-2.5 fill-[#BF4B24] shrink-0" />
                      <span>
                        {currentTierName} • {walletState.totalCredits}h
                      </span>
                    </span>
                  ) : (
                    <span className="text-[10px] font-medium text-stone-400 whitespace-nowrap block mt-0.5">
                      Minha Conta
                    </span>
                  )}
                </div>
                <div className="relative w-8 h-8 rounded-full bg-gradient-to-r from-[#C24116] to-[#DE5D2E] text-white flex items-center justify-center overflow-hidden font-bold text-xs shrink-0 ring-2 ring-white">
                  {specialistInfo.avatarUrl ? (
                    <img
                      src={specialistInfo.avatarUrl}
                      alt={specialistInfo.fullName}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    firstName.charAt(0).toUpperCase()
                  )}
                </div>
              </button>
            </div>
          </div>
        </header>
      )}

      {/* 3. HERO BANNER DESKTOP */}
      {!selectedRoom && activeTab === "search" && (
        <section className="hidden lg:block relative w-full min-h-[430px] xl:min-h-[460px] overflow-hidden bg-[#B83B10]">
          <div className="absolute inset-y-0 right-0 w-[65%] z-0">
            <img
              src="/hero.png"
              alt="Consultório Fusion Clinic"
              className="w-full h-full object-cover object-[center_70%]"
            />
            <div
              className="absolute inset-0"
              style={{
                background:
                  "linear-gradient(90deg, #B83B10 0%, #B83B10 12%, rgba(184,59,16,0.90) 28%, rgba(184,59,16,0.22) 52%, rgba(184,59,16,0) 72%)",
              }}
            />
          </div>

          <div
            className="absolute inset-x-0 bottom-0 h-28 z-10 pointer-events-none"
            style={{
              background:
                "linear-gradient(180deg, rgba(184,59,16,0) 0%, rgba(250,247,244,0.65) 65%, #FAF7F4 100%)",
            }}
          />

          <div className="relative z-20 max-w-[1360px] mx-auto px-10 pt-16 pb-32 flex items-end justify-between gap-8">
            <div className="max-w-[590px] space-y-4 text-white">
              <h1 className="text-[42px] xl:text-[50px] font-extrabold tracking-tight text-white leading-[1.1]">
                Olá, Dr(a). {firstName}.<br />
                <span className="font-serif italic font-normal text-white">
                  Estrutura pronta para você.
                </span>
              </h1>
              <p className="text-[15px] xl:text-base text-white/95 font-normal leading-relaxed max-w-[510px]">
                {walletState.isSubscriber
                  ? `Você possui ${walletState.totalCredits}h ativas na sua Carteira Fusion Pass+ (${currentTierName}). Escolha o consultório abaixo para reservar com seus créditos.`
                  : "Escolha seu próximo consultório por hora, turno ou ative um pacote Fusion Pass+ para economizar até 41% em cada atendimento."}
              </p>
            </div>
            {!walletState.isSubscriber && (
              <div className="shrink-0">
                <button
                  type="button"
                  onClick={() => handleOpenFusionPassShowcase("vip")}
                  className="group relative flex items-center gap-3.5 bg-stone-950/90 hover:bg-stone-950 backdrop-blur-md text-white p-2.5 pr-5 rounded-2xl border border-white/15 shadow-[0_16px_40px_rgba(0,0,0,0.28)] transition-all duration-300 hover:-translate-y-0.5 cursor-pointer text-left"
                >
                  <div className="relative overflow-hidden bg-[#FACC15] text-stone-950 rounded-xl px-3 py-2 text-center shrink-0 shadow-xs">
                    <span className="text-[9px] font-extrabold uppercase tracking-wider block leading-none">
                      PASS+
                    </span>
                    <span className="text-xl font-black tracking-tighter leading-none block mt-0.5">
                      -41%
                    </span>
                    <span className="text-[9px] font-black uppercase tracking-wider block leading-none mt-0.5">
                      NA HORA
                    </span>
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 text-[11px] text-stone-300 font-medium">
                      <span>Hora avulsa</span>
                      <span className="line-through text-stone-400">R$ 45</span>
                      <span className="text-[#FACC15] font-bold">
                        → a partir de R$ 26/h
                      </span>
                    </div>
                    <p className="text-xs font-bold text-white mt-0.5">
                      Recarregue sua carteira pagando menos
                    </p>
                    <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-[#FACC15] group-hover:underline">
                      <span>Ver pacotes com desconto</span>
                      <ChevronRight className="w-3.5 h-3.5 stroke-[2.5] transition-transform group-hover:translate-x-0.5" />
                    </span>
                  </div>
                </button>
              </div>
            )}
          </div>
        </section>
      )}

      {/* 4. CONTEÚDO PRINCIPAL */}
      <main
        className={`relative flex-1 min-w-0 w-full ${
          !selectedRoom ? "pb-20 lg:pb-12" : ""
        }`}
      >
        {!selectedRoom && !isDoorScanSession && (
          <div className="lg:hidden absolute top-3.5 right-4 z-40">
            <NotificationBell />
          </div>
        )}

        <div
          className={
            activeTab === "search" && !selectedRoom
              ? "fusion-logged-hero-bridge"
              : ""
          }
        >
          {renderTab()}
        </div>
      </main>

      {/* 5. BARRA INFERIOR MOBILE */}
      {!selectedRoom && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex lg:hidden items-stretch justify-around border-t border-stone-200/90 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_25px_rgba(28,25,23,0.06)]">
          <ul className="flex justify-between items-stretch w-full max-w-md mx-auto px-1">
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
            {isCohost && (
              <MobileNavItem
                icon={Building2}
                label="Minha Sala"
                isActive={activeTab === "cohost"}
                onClick={() => handleTabChange("cohost")}
              />
            )}
            <MobileNavItem
              icon={MessageSquare}
              label="Mensagens"
              isActive={activeTab === "chat"}
              onClick={() => handleTabChange("chat")}
            />
            <MobileNavItem
              icon={walletState.isSubscriber ? Crown : User}
              label={
                walletState.isSubscriber
                  ? `Pass+ (${walletState.totalCredits}h)`
                  : "Perfil"
              }
              isActive={activeTab === "profile"}
              isSubscriber={walletState.isSubscriber}
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

      {!isDoorScanSession && (
        <ReviewModal
          isOpen={!!pendingReviewBooking}
          onClose={() => setPendingReviewBooking(null)}
          bookingId={pendingReviewBooking?.id || ""}
          siblingBookingIds={pendingReviewBooking?.siblingBookingIds || []}
          roomId={pendingReviewBooking?.room_id || ""}
          roomName={pendingReviewBooking?.rooms?.name || ""}
          bookingDate={pendingReviewBooking?.start_time}
          onSuccess={() => setPendingReviewBooking(null)}
        />
      )}
    </div>
  );
}

function DesktopNavLink({ label, badge, isActive, onClick }: any) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`relative py-2.5 text-[14px] xl:text-[15px] font-medium whitespace-nowrap flex items-center gap-1.5 transition-colors cursor-pointer ${
        isActive
          ? "text-stone-900 font-semibold"
          : "text-stone-700 hover:text-stone-900"
      }`}
    >
      <span>{label}</span>
      {badge && (
        <span className="text-[10px] font-bold bg-[#FAF7F5] text-[#BF4B24] border border-[#BF4B24]/25 px-1.5 py-0.5 rounded-md">
          {badge}
        </span>
      )}
      {isActive && (
        <span className="absolute bottom-0 inset-x-0 h-[3px] bg-[#C84B20] rounded-full" />
      )}
    </button>
  );
}

function MobileNavItem({
  icon: Icon,
  label,
  isActive,
  isSubscriber,
  onClick,
}: any) {
  return (
    <li className="flex-1">
      <button
        type="button"
        onClick={onClick}
        className={`relative flex w-full flex-col items-center justify-center gap-1 py-2.5 transition-colors cursor-pointer ${
          isActive
            ? "text-[#BF4B24]"
            : "text-stone-400 hover:text-stone-700 active:scale-95"
        }`}
      >
        {isActive && (
          <span className="absolute top-0 w-6 h-[2.5px] bg-[#BF4B24] rounded-full" />
        )}
        <div className="relative flex items-center justify-center">
          <Icon
            className={`w-5 h-5 transition-transform ${
              isActive
                ? "stroke-[2.4px] scale-105"
                : isSubscriber
                  ? "stroke-[2px] text-[#BF4B24]/80"
                  : "stroke-[1.9px]"
            }`}
          />
        </div>
        <span
          className={`text-[10px] leading-none tracking-tight truncate max-w-[64px] ${
            isActive
              ? "font-bold text-[#BF4B24]"
              : isSubscriber
                ? "font-semibold text-stone-700"
                : "font-medium text-stone-500"
          }`}
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
        <div className="flex h-screen w-full items-center justify-center bg-[#FAF7F5]">
          <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
