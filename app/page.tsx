// app/page.tsx
"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { cn } from "@/lib/utils";
import { SearchTab, type Room } from "@/components/search-tab";
import { RoomDetail } from "@/components/room-detail";
import { FusionPassPromoPopup } from "@/components/fusion-pass-promo-popup";
import {
  Search,
  Heart,
  CalendarDays,
  LogIn,
  Loader2,
  ChevronRight,
  ShieldCheck,
  Clock,
  Building2,
  Tag,
  Percent,
} from "lucide-react";

const navItems = [
  { id: "buscar" as const, label: "Buscar", icon: Search },
  { id: "pass" as const, label: "Pass+ (-41%)", icon: Tag, isPromo: true },
  { id: "favoritos" as const, label: "Favoritos", icon: Heart },
  { id: "reservas" as const, label: "Reservas", icon: CalendarDays },
  { id: "entrar" as const, label: "Entrar", icon: LogIn },
];

type TabId = (typeof navItems)[number]["id"];

export default function AppPage() {
  const router = useRouter();
  const [supabase] = useState(() => createClient());

  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [activeTab, setActiveTab] = useState<TabId>("buscar");
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    let isMounted = true;

    async function checkAuth() {
      try {
        const {
          data: { session },
        } = await supabase.auth.getSession();

        if (!session?.user) {
          if (isMounted) setIsCheckingAuth(false);
          return;
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          await supabase.auth.signOut().catch(() => {});
          if (isMounted) setIsCheckingAuth(false);
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .maybeSingle();

        if (!profile?.role) {
          if (isMounted) setIsCheckingAuth(false);
          return;
        }

        if (profile.role === "host") {
          router.replace("/host");
        } else if (profile.role === "admin") {
          router.replace("/admin/dashboard");
        } else {
          router.replace("/dashboard");
        }
      } catch (error) {
        if (isMounted) setIsCheckingAuth(false);
      }
    }

    checkAuth();

    return () => {
      isMounted = false;
    };
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

  const handleOpenFusionPassShowcase = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("open-fusion-pass", { detail: { step: "plans" } }),
      );
    }
  }, []);

  const handleTabClick = (id: TabId) => {
    if (id === "pass") {
      handleOpenFusionPassShowcase();
      return;
    }
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
      <div className="flex h-screen w-full items-center justify-center bg-[#FAF7F5]">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="flex min-h-svh flex-col bg-[#FAF7F4] font-sans">
      {/* Ponte de alinhamento exclusiva para o Desktop (lg:) */}
      <style
        dangerouslySetInnerHTML={{
          __html: `
            @media (min-width: 1024px) {
              .fusion-desktop-hero-bridge {
                margin-top: -4.25rem !important;
                position: relative !important;
                z-index: 30 !important;
              }
              .fusion-desktop-hero-bridge > div > div:first-child,
              .fusion-desktop-hero-bridge > div > header:first-child,
              .fusion-desktop-hero-bridge > div:first-child > div:first-child {
                background: transparent !important;
                background-color: transparent !important;
                background-image: none !important;
                padding-top: 0 !important;
                padding-bottom: 1.25rem !important;
                box-shadow: none !important;
                border-radius: 0 !important;
              }
            }
          `,
        }}
      />

      {/* Pop-up do Fusion Pass+ (4s após carregar as salas, 1x por sessão) */}
      <FusionPassPromoPopup />

      {/* ==================================================================== */}
      {/* 1. TOP PROMO BAR PRETA (RESPONSIVA NO MOBILE E INTACTA NO DESKTOP)   */}
      {/* ==================================================================== */}
      {!selectedRoom && (
        <div className="bg-[#0C0A09] text-white px-3.5 lg:px-10 py-2 lg:py-2.5 z-50">
          <div className="max-w-[1360px] mx-auto flex items-center justify-between gap-2.5 lg:gap-4">
            <div className="flex items-center gap-2 lg:gap-3 min-w-0">
              <span className="inline-flex items-center gap-1 lg:gap-1.5 bg-[#EAB308] text-stone-950 text-[9px] lg:text-[10px] font-extrabold uppercase tracking-wider px-2 lg:px-2.5 py-0.5 rounded-full shrink-0 shadow-2xs">
                <Tag className="w-2.5 h-2.5 lg:w-3 lg:h-3 stroke-[2.5]" />
                <span className="hidden sm:inline">FUSION PASS+</span>
                <span className="sm:hidden">PASS+</span>
              </span>
              <p className="text-[11px] lg:text-xs font-bold text-[#FBBF24] truncate">
                <span className="sm:hidden">Horas com até 41% de desconto</span>
                <span className="hidden sm:inline">
                  Compre suas horas com até 41% de desconto
                </span>
                <span className="hidden md:inline">
                  {" "}
                  • Sem fidelidade • Use em qualquer unidade ou transfira horas
                </span>
              </p>
            </div>

            <button
              type="button"
              onClick={handleOpenFusionPassShowcase}
              className="px-3 lg:px-4 py-1 rounded-full border border-amber-400/80 hover:border-amber-300 hover:bg-amber-400/15 text-[#FBBF24] font-bold text-[11px] lg:text-xs shrink-0 flex items-center gap-0.5 lg:gap-1 transition-all active:scale-95 cursor-pointer"
            >
              <span>Ver Planos</span>
              <ChevronRight className="w-3 h-3 lg:w-3.5 lg:h-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. HEADER DESKTOP BRANCO (100% INTACTO)                              */}
      {/* ==================================================================== */}
      {!selectedRoom && (
        <header className="hidden lg:block sticky top-0 z-40 bg-white border-b border-stone-200/70">
          <div className="max-w-[1360px] mx-auto px-10 h-20 flex items-center justify-between gap-8">
            <button
              type="button"
              onClick={() => handleTabClick("buscar")}
              className="flex items-center shrink-0 cursor-pointer focus:outline-none"
            >
              {!logoError ? (
                <img
                  src="/logo-fusion-orange.png"
                  alt="Fusion Clinic"
                  onError={() => setLogoError(true)}
                  className="h-10 w-auto object-contain"
                />
              ) : (
                <span className="text-xl font-black text-stone-900 tracking-tight">
                  Fusion<span className="text-[#BF4B24]">.</span>
                </span>
              )}
            </button>

            <nav className="flex items-center gap-9">
              <button
                type="button"
                onClick={() => handleTabClick("buscar")}
                className={cn(
                  "relative py-2.5 text-[15px] font-semibold whitespace-nowrap transition-colors cursor-pointer",
                  activeTab === "buscar"
                    ? "text-stone-900"
                    : "text-stone-500 hover:text-stone-900",
                )}
              >
                Explorar Salas
                {activeTab === "buscar" && (
                  <span className="absolute bottom-0 inset-x-0 h-[3px] bg-[#C84B20] rounded-full" />
                )}
              </button>

              <button
                type="button"
                onClick={handleOpenFusionPassShowcase}
                className="py-2.5 text-[15px] font-medium text-stone-700 hover:text-stone-900 whitespace-nowrap flex items-center gap-2 transition-colors cursor-pointer"
              >
                <span>Planos Pass+</span>
                <span className="text-[11px] font-bold text-white bg-gradient-to-r from-[#EA580C] to-[#F59E0B] px-2.5 py-0.5 rounded-full shadow-2xs">
                  Até -41%
                </span>
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("favoritos")}
                className="py-2.5 text-[15px] font-medium text-stone-700 hover:text-stone-900 whitespace-nowrap transition-colors cursor-pointer"
              >
                Favoritos
              </button>

              <button
                type="button"
                onClick={() => handleTabClick("reservas")}
                className="py-2.5 text-[15px] font-medium text-stone-700 hover:text-stone-900 whitespace-nowrap transition-colors cursor-pointer"
              >
                Reservas
              </button>
            </nav>

            <div className="flex items-center gap-6 shrink-0">
              <button
                type="button"
                onClick={() => router.push("/login")}
                className="text-[15px] font-medium text-stone-800 hover:text-[#BF4B24] whitespace-nowrap transition-colors cursor-pointer"
              >
                Entrar
              </button>

              <button
                type="button"
                onClick={() => router.push("/login")}
                className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#C24116] to-[#DE5D2E] hover:from-[#A83812] hover:to-[#C84B20] text-white text-[15px] font-semibold whitespace-nowrap shadow-[0_6px_20px_rgba(191,75,36,0.3)] transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
              >
                Criar conta
              </button>
            </div>
          </div>
        </header>
      )}

      {/* ==================================================================== */}
      {/* 3. HERO BANNER DESKTOP (100% INTACTO)                                */}
      {/* ==================================================================== */}
      {!selectedRoom && activeTab === "buscar" && (
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
              <h1 className="text-[44px] xl:text-[52px] font-extrabold tracking-tight text-white leading-[1.1]">
                Consultórios prontos,{" "}
                <span className="font-serif italic font-normal text-white">
                  esperando por você.
                </span>
              </h1>

              <p className="text-[15px] xl:text-base text-white/95 font-normal leading-relaxed max-w-[510px]">
                Encontre o espaço ideal para atender seus pacientes. Reserve por
                hora, turno ou pacote, sem precisar manter um consultório
                próprio.
              </p>
            </div>

            <div className="shrink-0">
              <button
                type="button"
                onClick={handleOpenFusionPassShowcase}
                className="group relative w-[215px] rounded-[22px] bg-[#FAF7F4]/92 hover:bg-white backdrop-blur-md border border-white/85 p-4 text-left shadow-[0_14px_34px_rgba(28,25,23,0.14)] transition-all duration-300 hover:-translate-y-1 cursor-pointer"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider text-[#BF4B24]">
                    <span className="w-1.5 h-1.5 rounded-full bg-[#BF4B24] animate-pulse" />
                    Fusion Pass+
                  </span>
                  <span className="w-6 h-6 rounded-full bg-[#BF4B24]/12 text-[#BF4B24] flex items-center justify-center">
                    <Percent className="w-3 h-3 stroke-[2.5]" />
                  </span>
                </div>

                <div className="flex items-baseline gap-1.5">
                  <span className="text-2xl font-black tracking-tight text-stone-900 leading-none">
                    Até 41%
                  </span>
                  <span className="text-xs font-extrabold uppercase text-[#BF4B24]">
                    OFF
                  </span>
                </div>
                <p className="text-[11px] font-medium text-stone-500 mt-0.5">
                  no valor da hora clínica
                </p>

                <div className="mt-2.5 px-2.5 py-1.5 rounded-xl bg-white border border-stone-200/80 flex items-center justify-between text-[11px]">
                  <span className="text-stone-400 line-through">R$ 45/h</span>
                  <span className="font-bold text-stone-800">
                    por <strong className="text-[#BF4B24]">R$ 26/h</strong>
                  </span>
                </div>

                <span className="mt-2.5 inline-flex items-center gap-1 text-xs font-bold text-[#BF4B24] group-hover:translate-x-0.5 transition-transform">
                  <span>Simular desconto</span>
                  <ChevronRight className="w-3.5 h-3.5 stroke-[2.5]" />
                </span>
              </button>
            </div>
          </div>
        </section>
      )}

      {/* ==================================================================== */}
      {/* 4. CONTEÚDO PRINCIPAL                                                */}
      {/* ==================================================================== */}
      <main
        className={cn("flex-1 w-full", selectedRoom ? "" : "pb-6 lg:pb-16")}
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
              <div className="w-full fusion-desktop-hero-bridge">
                <SearchTab onOpenRoom={handleOpenRoom} />
              </div>
            )}
          </>
        )}
      </main>

      {/* ==================================================================== */}
      {/* 5. RODAPÉ INSTITUCIONAL E JURÍDICO (RESPONSIVO + GOOGLE OAUTH READY) */}
      {/* ==================================================================== */}
      {!selectedRoom && (
        <footer className="bg-white border-t border-stone-200/80 pb-24 lg:pb-0">
          <div className="max-w-[1360px] mx-auto px-5 lg:px-10 py-8 lg:py-10">
            {/* Destaques operacionais (exibidos no Desktop) */}
            <div className="hidden lg:grid grid-cols-4 gap-8 pb-8 border-b border-stone-100">
              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                  <Clock className="w-4 h-4 text-[#BF4B24]" />
                  <span>Reserva Instantânea</span>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Agenda em tempo real com liberação automática de senha na
                  fechadura digital.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                  <Tag className="w-4 h-4 text-[#BF4B24]" />
                  <span>Economia com Fusion Pass+</span>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Reduza seu custo por hora em até 41%, sem fidelidade e com 30
                  dias para usar.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                  <Building2 className="w-4 h-4 text-[#BF4B24]" />
                  <span>Pronto para Atender</span>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Recepção, Wi-Fi de alta velocidade, climatização, limpeza e
                  café inclusos.
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center gap-2 text-stone-900 font-bold text-sm">
                  <ShieldCheck className="w-4 h-4 text-[#BF4B24]" />
                  <span>Sem Custos Fixos</span>
                </div>
                <p className="text-xs text-stone-500 leading-relaxed">
                  Reserve apenas pelas horas ou turnos que precisar, sem fiador
                  ou burocracia.
                </p>
              </div>
            </div>

            {/* Barra inferior com Copyright, CNPJ e Links Legais */}
            <div className="lg:pt-6 flex flex-col lg:flex-row items-center justify-between gap-4 text-xs text-stone-400">
              <div className="text-center lg:text-left space-y-0.5">
                <p>
                  © {new Date().getFullYear()} Fusion Clinic Soluções em Saúde
                  Ltda • CNPJ: 49.351.127/0001-44. Todos os direitos reservados.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 font-medium text-stone-500">
                <Link
                  href="/termos"
                  className="hover:text-[#BF4B24] transition-colors"
                >
                  Termos de Uso
                </Link>
                <Link
                  href="/privacidade"
                  className="hover:text-[#BF4B24] transition-colors"
                >
                  Política de Privacidade
                </Link>
                <Link
                  href="/cookies"
                  className="hover:text-[#BF4B24] transition-colors"
                >
                  Política de Cookies
                </Link>

                <span className="hidden sm:inline text-stone-300">•</span>

                <button
                  type="button"
                  onClick={handleOpenFusionPassShowcase}
                  className="hover:text-stone-900 cursor-pointer"
                >
                  Planos Pass+
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="hover:text-stone-900 cursor-pointer"
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => router.push("/login")}
                  className="hover:text-stone-900 cursor-pointer"
                >
                  Criar conta
                </button>
              </div>
            </div>
          </div>
        </footer>
      )}

      {/* ==================================================================== */}
      {/* 6. BARRA INFERIOR MOBILE ESTILO AIRBNB / BOOKING                     */}
      {/* ==================================================================== */}
      {!selectedRoom && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex lg:hidden items-stretch justify-around border-t border-stone-200/90 bg-white/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_25px_rgba(28,25,23,0.06)]">
          <div className="flex justify-between items-stretch w-full max-w-md mx-auto px-1">
            {navItems.map((item) => {
              const isActive = activeTab === item.id;
              const isPromo = Boolean((item as any).isPromo);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleTabClick(item.id)}
                  className={cn(
                    "relative flex flex-1 flex-col items-center justify-center gap-1 py-2.5 transition-colors cursor-pointer active:scale-95",
                    isActive
                      ? "text-[#BF4B24]"
                      : isPromo
                        ? "text-[#BF4B24]/90 hover:text-[#BF4B24]"
                        : "text-stone-400 hover:text-stone-700",
                  )}
                >
                  {isActive && (
                    <span className="absolute top-0 w-6 h-[2.5px] bg-[#BF4B24] rounded-full" />
                  )}

                  <item.icon
                    className={cn(
                      "h-5 w-5 transition-transform",
                      isActive
                        ? "stroke-[2.4px] scale-105"
                        : isPromo
                          ? "stroke-[2.2px]"
                          : "stroke-[1.9px]",
                    )}
                  />

                  <span
                    className={cn(
                      "text-[10px] leading-none tracking-tight truncate max-w-[68px]",
                      isActive
                        ? "font-bold text-[#BF4B24]"
                        : isPromo
                          ? "font-bold text-[#BF4B24]"
                          : "font-medium text-stone-500",
                    )}
                  />
                </button>
              );
            })}
          </div>
        </nav>
      )}
    </div>
  );
}
