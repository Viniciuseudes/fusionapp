// components/fusion-pass-modal.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMobileBack } from "@/hooks/use-mobile-back";
import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Shield,
  Star,
  Crown,
  Loader2,
  ArrowRight,
  Zap,
  RefreshCw,
  Unlock,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

export type PassTier = "start" | "vip" | "master";

export interface PlanOption {
  hours: number;
  price: number;
}

export interface PlanPackage {
  id: PassTier;
  title: string;
  subtitle: string;
  icon: any;
  badge: string | null;
  badgeStyle?: string;
  cardStyle: string;
  headerStyle: string;
  iconStyle: string;
  buttonStyle: string;
  optionContainerStyle: string;
  optionStyle: string;
  activeOptionStyle: string;
  benefits: string[];
  options: PlanOption[];
}

export const BASE_HOURLY_RATES: Record<PassTier, number> = {
  start: 40,
  vip: 45,
  master: 80,
};

const BASE_PACKAGE_INFO: Record<
  PassTier,
  Omit<PlanPackage, "id" | "options">
> = {
  start: {
    title: "Plano Basic",
    subtitle: "Atenda com liberdade e controle seus custos",
    icon: Shield,
    badge: "Para começar",
    badgeStyle: "bg-gray-500 text-white shadow-lg",
    cardStyle: "bg-white border-slate-200 mt-0 lg:mt-6 shadow-sm",
    headerStyle: "text-slate-900",
    iconStyle: "bg-slate-100 text-slate-600 border border-slate-200",
    buttonStyle: "bg-slate-900 hover:bg-slate-800 text-white",
    optionContainerStyle: "bg-slate-100 border-slate-200 p-1",
    optionStyle: "text-slate-500 hover:text-slate-900",
    activeOptionStyle: "bg-white text-slate-900 shadow-sm font-black",
    benefits: [
      "Cancele quando quiser",
      "Previsibilidade na agenda e no orçamento",
      "Consultórios equipados e prontos para atender",
      "Economia em cada hora de atendimento",
      "Renovação automática, sem precisar recomprar horas",
    ],
  },
  vip: {
    title: "Plano VIP",
    subtitle: "Sua agenda muda. A Fusion acompanha",
    icon: Star,
    badge: "Mais Flexibilidade",
    badgeStyle: "bg-slate-900 text-white shadow-lg",
    cardStyle:
      "bg-white border-[#BF4B24] border-2 shadow-2xl shadow-orange-500/10 relative z-10 lg:scale-105",
    headerStyle: "text-slate-900",
    iconStyle: "bg-[#BF4B24] text-white shadow-md shadow-orange-500/20",
    buttonStyle:
      "bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-xl shadow-orange-500/20",
    optionContainerStyle: "bg-orange-50 border-orange-100 p-1",
    optionStyle: "text-orange-600 hover:text-orange-900",
    activeOptionStyle: "bg-[#BF4B24] text-white shadow-md font-black",
    benefits: [
      "Cancele quando quiser",
      "Acesso às salas VIP e Basic.",
      "Economia agressiva na hora avulsa.",
      "Agendamento prioritário.",
      "Cancelamento gratuito até 12h antes.",
      "Suporte Humanizado VIP.",
    ],
  },
  master: {
    title: "Plano Premium",
    subtitle: "A experiência completa para aproveitar a elite da Fusion",
    icon: Crown,
    badge: "Experiência exclusiva",
    badgeStyle: "bg-amber-500 text-slate-950 shadow-lg",
    cardStyle: "bg-slate-950 border-slate-800 mt-0 lg:mt-6 shadow-2xl",
    headerStyle: "text-white",
    iconStyle: "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20",
    buttonStyle:
      "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black shadow-xl shadow-amber-500/20",
    optionContainerStyle: "bg-slate-900 border-slate-800 p-1",
    optionStyle: "text-slate-400 hover:text-white",
    activeOptionStyle:
      "bg-slate-800 text-amber-400 shadow-sm font-black ring-1 ring-slate-700",
    benefits: [
      "Cancele quando quiser",
      "Passe livre em TODAS as salas.",
      "Isenção total de taxas de upgrade.",
      "Status Premium no seu Perfil.",
      "Concierge Dedicado.",
    ],
  },
};

export function normalizePassTier(raw?: string | null): PassTier {
  const t = (raw || "start").toLowerCase().trim();
  if (t.includes("master") || t.includes("premium")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

interface FusionPassModalProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  initialTier?: string | null;
  initialHours?: number | null;
  onSubscriptionSuccess?: () => void;
  onBestRatesLoaded?: (rates: Record<string, number>) => void;
}

export function FusionPassModal({
  isOpen,
  onOpenChange,
  initialTier,
  initialHours,
  onSubscriptionSuccess,
  onBestRatesLoaded,
}: FusionPassModalProps) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [dynamicPackages, setDynamicPackages] = useState<PlanPackage[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<
    Record<PassTier, number>
  >({
    start: 16,
    vip: 16,
    master: 16,
  });
  const [highlightedTier, setHighlightedTier] = useState<PassTier>("vip");
  const [activePlanIndex, setActivePlanIndex] = useState(1);

  // Guarda a seleção vinda do RoomDetail para não ser sobrescrita ao abrir o modal
  const pendingSelectionRef = useRef<{
    tier: PassTier;
    hours: number | null;
  } | null>(null);

  const [subModal, setSubModal] = useState<{
    isOpen: boolean;
    pkg: PlanPackage | null;
    option: PlanOption | null;
  }>({ isOpen: false, pkg: null, option: null });

  const [isProcessingCheckout, setIsProcessingCheckout] = useState<
    string | null
  >(null);

  const carouselRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<Record<PassTier, HTMLDivElement | null>>({
    start: null,
    vip: null,
    master: null,
  });

  useMobileBack(isOpen, () => onOpenChange(false), "pass-modal");
  useMobileBack(
    subModal.isOpen,
    () => setSubModal({ isOpen: false, pkg: null, option: null }),
    "sub-modal",
  );

  // Rola o carrossel horizontal mobile exatamente para o card do plano escolhido (Basic=0, VIP=1, Premium=2)
  const scrollToTierCard = useCallback((tier: PassTier) => {
    const tierOrder: PassTier[] = ["start", "vip", "master"];
    const targetIdx = tierOrder.indexOf(tier);
    if (targetIdx >= 0) {
      setActivePlanIndex(targetIdx);
    }
    setHighlightedTier(tier);

    const executeScroll = (behavior: ScrollBehavior) => {
      const container = carouselRef.current;
      const cardEl = cardRefs.current[tier];
      if (container && cardEl) {
        const targetLeft =
          cardEl.offsetLeft - (container.clientWidth - cardEl.clientWidth) / 2;
        container.scrollTo({
          left: Math.max(0, targetLeft),
          behavior,
        });
      }
    };

    // Executa após o Dialog montar no DOM (imediato e após a animação de abertura)
    setTimeout(() => executeScroll("auto"), 40);
    setTimeout(() => executeScroll("smooth"), 220);
  }, []);

  // Aplica a seleção de categoria (Basic, VIP ou Premium) e a franquia exata de horas (ex: 8h, 16h, 20h)
  const applyPreselection = useCallback(
    (
      rawTier?: string | null,
      rawHours?: number | null,
      pkgsList: PlanPackage[] = dynamicPackages,
    ) => {
      const normalizedTier = normalizePassTier(rawTier);
      const targetPkg = pkgsList.find((p) => p.id === normalizedTier);

      setSelectedBundles((prev) => {
        let resolvedHours =
          rawHours !== null && rawHours !== undefined && Number(rawHours) > 0
            ? Number(rawHours)
            : prev[normalizedTier] || 16;

        if (targetPkg && targetPkg.options.length > 0) {
          const exactMatch = targetPkg.options.some(
            (o) => Number(o.hours) === resolvedHours,
          );
          if (!exactMatch) {
            resolvedHours =
              targetPkg.options[1]?.hours || targetPkg.options[0].hours;
          }
        }

        return {
          ...prev,
          [normalizedTier]: resolvedHours,
        };
      });

      scrollToTierCard(normalizedTier);
    },
    [dynamicPackages, scrollToTierCard],
  );

  // Carrega os pacotes ativos do Supabase
  useEffect(() => {
    let isMounted = true;
    async function loadPackages() {
      const { data: pkgsData } = await supabase
        .from("packages")
        .select("*")
        .eq("active", true)
        .order("hours", { ascending: true });

      if (!isMounted || !pkgsData || pkgsData.length === 0) return;

      const grouped = pkgsData.reduce(
        (acc: Record<string, PlanOption[]>, curr: any) => {
          const t = normalizePassTier(curr.tier);
          if (!acc[t]) acc[t] = [];
          acc[t].push({
            hours: Number(curr.hours),
            price: Number(curr.price),
          });
          return acc;
        },
        {},
      );

      const rates: Record<string, number> = {};
      Object.keys(grouped).forEach((tier) => {
        const tierPkgs = grouped[tier];
        const targetPkg =
          tierPkgs.find((p: PlanOption) => p.hours === 20) ||
          tierPkgs[tierPkgs.length - 1];
        if (targetPkg) rates[tier] = targetPkg.price / targetPkg.hours;
      });

      if (onBestRatesLoaded) {
        onBestRatesLoaded(rates);
      }

      const mergedPackages: PlanPackage[] = (
        ["start", "vip", "master"] as const
      ).map((tier) => ({
        id: tier,
        ...BASE_PACKAGE_INFO[tier],
        options: grouped[tier] || [],
      }));

      setDynamicPackages(mergedPackages);

      // Só define o bundle inicial padrão se não houver uma pré-seleção pendente
      setSelectedBundles((prev) => ({
        start:
          prev.start ||
          grouped["start"]?.[1]?.hours ||
          grouped["start"]?.[0]?.hours ||
          16,
        vip:
          prev.vip ||
          grouped["vip"]?.[1]?.hours ||
          grouped["vip"]?.[0]?.hours ||
          16,
        master:
          prev.master ||
          grouped["master"]?.[1]?.hours ||
          grouped["master"]?.[0]?.hours ||
          16,
      }));
    }

    loadPackages();
    return () => {
      isMounted = false;
    };
  }, [supabase, onBestRatesLoaded]);

  // Escuta o evento global disparado pelo RoomDetail ("Ver pacotes e assinar")
  useEffect(() => {
    const handleOpenPassEvent = (event: Event) => {
      const customEvent = event as CustomEvent<{
        tier?: string;
        hours?: number | null;
      }>;
      const detailTier = normalizePassTier(customEvent.detail?.tier);
      const detailHours =
        customEvent.detail?.hours !== undefined &&
        customEvent.detail?.hours !== null
          ? Number(customEvent.detail.hours)
          : null;

      // Salva na ref prioritária para que o efeito de abertura use exatamente este plano e horas
      pendingSelectionRef.current = {
        tier: detailTier,
        hours: detailHours,
      };

      onOpenChange(true);
      applyPreselection(detailTier, detailHours);
    };

    window.addEventListener("fusion:open-pass", handleOpenPassEvent);
    return () => {
      window.removeEventListener("fusion:open-pass", handleOpenPassEvent);
    };
  }, [onOpenChange, applyPreselection]);

  // Quando o modal abre e os pacotes estão carregados, aplica a prioridade:
  // 1º Evento do RoomDetail (pendingSelectionRef) -> 2º sessionStorage -> 3º Props (initialTier/initialHours)
  useEffect(() => {
    if (!isOpen || dynamicPackages.length === 0) return;

    let targetTier: string | null = null;
    let targetHours: number | null = null;

    if (pendingSelectionRef.current) {
      targetTier = pendingSelectionRef.current.tier;
      targetHours = pendingSelectionRef.current.hours;
      pendingSelectionRef.current = null;
      try {
        sessionStorage.removeItem("fusion_preselect_pass");
      } catch {}
    } else {
      try {
        const raw = sessionStorage.getItem("fusion_preselect_pass");
        if (raw) {
          const parsed = JSON.parse(raw);
          targetTier = parsed?.tier || null;
          targetHours =
            parsed?.hours !== undefined && parsed?.hours !== null
              ? Number(parsed.hours)
              : null;
          sessionStorage.removeItem("fusion_preselect_pass");
        }
      } catch {}
    }

    const finalTier = targetTier || initialTier || "vip";
    const finalHours = targetHours ?? initialHours ?? null;

    applyPreselection(finalTier, finalHours, dynamicPackages);
  }, [isOpen, initialTier, initialHours, dynamicPackages, applyPreselection]);

  const handlePlanScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    if (scrollWidth <= clientWidth) return;
    const index = Math.round(
      (scrollLeft / (scrollWidth - clientWidth)) * (dynamicPackages.length - 1),
    );
    setActivePlanIndex(
      Math.max(0, Math.min(index, dynamicPackages.length - 1)),
    );
  };

  const handleBuyPackage = (pkg: PlanPackage, option: PlanOption) => {
    onOpenChange(false);
    setTimeout(() => {
      setSubModal({ isOpen: true, pkg, option });
    }, 150);
  };

  const confirmSubscription = async () => {
    if (!subModal.pkg || !subModal.option) return;
    setIsProcessingCheckout(subModal.pkg.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Faça login",
          description: "Você precisa estar logado para assinar.",
        });
        return;
      }
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutType: "package",
          packageId: subModal.pkg.id,
          hours: subModal.option.hours,
          price: subModal.option.price,
          packageName: subModal.pkg.title,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Falha ao gerar pagamento.");

      toast({
        title: "Assinatura Ativa!",
        description: "Suas horas foram adicionadas à carteira com sucesso.",
      });
      setSubModal({ isOpen: false, pkg: null, option: null });

      if (onSubscriptionSuccess) {
        onSubscriptionSuccess();
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro no Checkout",
        description: err.message,
      });
    } finally {
      setIsProcessingCheckout(null);
    }
  };

  return (
    <>
      <Dialog open={isOpen} onOpenChange={onOpenChange}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="!max-w-[1200px] w-[100vw] h-[100dvh] md:w-[95vw] md:h-[95vh] p-0 overflow-hidden bg-slate-50 border-0 md:rounded-[2rem] flex flex-col shadow-2xl z-[220] [&>button]:hidden"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Planos Fusion Pass</DialogTitle>
            <DialogDescription>
              Escolha o melhor plano de assinatura para seus atendimentos.
            </DialogDescription>
          </DialogHeader>

          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
            <button
              onClick={() => onOpenChange(false)}
              className="w-10 h-10 bg-black/15 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white/20 shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="flex-1 overflow-y-auto overflow-x-hidden relative w-full scrollbar-hide">
            <div className="bg-[#BF4B24] pt-20 md:pt-24 pb-36 px-6 md:px-12 shrink-0">
              <div className="max-w-5xl mx-auto w-full">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white max-w-2xl leading-tight">
                  Escolha seu{" "}
                  <span className="bg-white/20 px-4 py-1.5 rounded-2xl whitespace-nowrap inline-block mt-2 md:mt-0">
                    Fusion Pass+
                  </span>
                </h2>
                <h3 className="text-white/95 font-bold mt-5 text-lg md:text-xl lg:text-2xl max-w-2xl leading-relaxed">
                  Cada conquista merece um outro nível
                </h3>
                <p className="text-white/80 font-medium mt-2 text-sm md:text-base max-w-2xl leading-relaxed">
                  Da liberdade de começar ao prestígio de chegar mais longe. Um
                  plano para cada momento de sua carreira.
                </p>
              </div>
            </div>

            <div className="px-0 md:px-12 -mt-28 w-full max-w-6xl mx-auto relative z-20">
              <div
                ref={carouselRef}
                className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 lg:gap-8 overflow-x-auto md:overflow-visible snap-x snap-mandatory scrollbar-hide items-stretch w-full px-[6vw] md:px-0 pt-6 pb-6"
                onScroll={handlePlanScroll}
              >
                {dynamicPackages.map((pkg: PlanPackage) => {
                  const currentHours = selectedBundles[pkg.id];
                  const selectedOption =
                    pkg.options.find(
                      (o: PlanOption) =>
                        Number(o.hours) === Number(currentHours),
                    ) || pkg.options[0];
                  if (!selectedOption) return null;

                  const baseHourly = BASE_HOURLY_RATES[pkg.id] || 40;
                  const originalPrice = baseHourly * selectedOption.hours;
                  const savingsAmount = originalPrice - selectedOption.price;
                  const savingsPercent = Math.round(
                    (savingsAmount / originalPrice) * 100,
                  );
                  const hasDiscount = savingsAmount > 0;
                  const isHighlighted = highlightedTier === pkg.id;

                  return (
                    <div
                      key={pkg.id}
                      ref={(el) => {
                        cardRefs.current[pkg.id] = el;
                      }}
                      onClick={() => setHighlightedTier(pkg.id)}
                      className={`relative snap-center shrink-0 w-[88vw] md:w-full bg-white rounded-[2rem] p-6 lg:p-8 flex flex-col transition-all h-full ${
                        isHighlighted
                          ? "border-2 border-[#BF4B24] shadow-[0_20px_50px_rgba(191,75,36,0.18)] md:-translate-y-4 z-10"
                          : "border border-slate-200 shadow-xl mt-0 md:mt-4"
                      }`}
                    >
                      {pkg.badge && (
                        <div className="absolute -top-4 left-6 lg:left-8 z-30">
                          <span
                            className={`${
                              isHighlighted
                                ? "bg-[#BF4B24] text-white"
                                : pkg.badgeStyle || "bg-slate-900 text-white"
                            } text-[10px] lg:text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md whitespace-nowrap`}
                          >
                            {isHighlighted ? "Plano Selecionado" : pkg.badge}
                          </span>
                        </div>
                      )}

                      <h3 className="text-2xl lg:text-3xl font-black text-slate-900 mb-4 tracking-tight mt-3">
                        {pkg.title}
                      </h3>

                      {/* Botões de Franquia de Horas */}
                      <div className="mb-6">
                        <p className="text-[10px] lg:text-xs font-bold uppercase tracking-widest mb-2 text-slate-400">
                          Escolha sua franquia:
                        </p>
                        <div className="flex items-center rounded-xl p-1 bg-slate-100 border border-slate-200/60">
                          {pkg.options.map((opt: PlanOption) => {
                            const isActive =
                              Number(currentHours) === Number(opt.hours);
                            return (
                              <button
                                key={opt.hours}
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setHighlightedTier(pkg.id);
                                  setSelectedBundles((prev) => ({
                                    ...prev,
                                    [pkg.id]: Number(opt.hours),
                                  }));
                                }}
                                className={`flex-1 py-2 text-xs lg:text-sm font-bold rounded-lg transition-all truncate px-1 ${
                                  isActive
                                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/50"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                              >
                                {opt.hours}h
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Preço e Economia */}
                      <div className="mb-6 flex flex-col gap-1 border-b pb-6 border-slate-100">
                        {hasDiscount && (
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs lg:text-sm font-bold text-slate-400 line-through decoration-1">
                              R${" "}
                              {originalPrice.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                            <span className="text-[10px] lg:text-xs font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              {savingsPercent}% OFF
                            </span>
                          </div>
                        )}

                        <div className="flex items-baseline gap-1 lg:gap-1.5 flex-wrap">
                          <span className="text-sm lg:text-base font-bold text-slate-900 opacity-80">
                            R$
                          </span>
                          <span className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter shrink-0">
                            {selectedOption.price.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-sm lg:text-base font-medium text-slate-500 opacity-80">
                            /mês
                          </span>
                        </div>
                      </div>

                      {/* Benefícios */}
                      <div className="flex-1 flex flex-col bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-100/50">
                        <p className="font-bold text-slate-900 mb-4 leading-snug text-sm lg:text-base">
                          {pkg.subtitle}
                        </p>
                        <ul className="space-y-3.5 flex-1">
                          {pkg.benefits.map((benefit: string, i: number) => (
                            <li key={i} className="flex items-start gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#BF4B24] mt-1.5 shrink-0" />
                              <span className="text-xs lg:text-sm font-medium text-slate-600 leading-snug">
                                {benefit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Botão Próximo */}
                      <Button
                        type="button"
                        onClick={() => handleBuyPackage(pkg, selectedOption)}
                        className="w-full h-12 lg:h-14 rounded-xl text-sm lg:text-base font-black transition-all shrink-0 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-md"
                      >
                        Próximo
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Paginação Mobile */}
              <div className="flex justify-center items-center gap-2 mt-2 mb-8 md:hidden relative z-20">
                {dynamicPackages.map((_: PlanPackage, idx: number) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === activePlanIndex
                        ? "w-6 bg-slate-400"
                        : "w-2 bg-slate-200"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL DE REVISÃO E CONFIRMAÇÃO DO PLANO    */}
      {/* ========================================== */}
      <Dialog
        open={subModal.isOpen}
        onOpenChange={(open) =>
          !open && setSubModal({ isOpen: false, pkg: null, option: null })
        }
      >
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden bg-slate-50 border-0 z-[230] [&>button]:hidden"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Confirmação de Plano</DialogTitle>
            <DialogDescription>
              Revise as vantagens do seu novo plano.
            </DialogDescription>
          </DialogHeader>

          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={() =>
                setSubModal({ isOpen: false, pkg: null, option: null })
              }
              className="w-8 h-8 bg-black/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white/20"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {subModal.pkg && subModal.option && (
            <div className="flex flex-col">
              <div className="p-6 pb-10 bg-[#BF4B24] text-white">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/20 shadow-sm">
                  <subModal.pkg.icon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-black mb-1">Excelente escolha!</h2>
                <p className="text-sm opacity-90 font-medium leading-relaxed">
                  Você está a um passo de garantir a melhor tarifa da plataforma
                  com o {subModal.pkg.title}.
                </p>
              </div>

              <div className="p-6 bg-white -mt-6 rounded-t-3xl relative z-10 flex flex-col gap-6 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                      Plano Selecionado
                    </p>
                    <p className="text-lg font-black text-slate-900">
                      {subModal.pkg.title}{" "}
                      <span className="text-slate-500 font-bold text-sm">
                        ({subModal.option.hours}h)
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                      Mensalidade
                    </p>
                    <p className="text-xl font-black text-[#BF4B24]">
                      R${" "}
                      {subModal.option.price.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />{" "}
                    Transparência Fusion
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Liberação Imediata
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
                          As{" "}
                          <strong className="text-slate-700">
                            {subModal.option.hours} horas
                          </strong>{" "}
                          caem na sua carteira assim que você confirmar a
                          assinatura.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Renovação Automática
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
                          Próxima cobrança será em{" "}
                          <strong className="text-slate-700">
                            {format(addMonths(new Date(), 1), "dd 'de' MMMM", {
                              locale: ptBR,
                            })}
                          </strong>
                          .
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <Unlock className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Cancele quando quiser
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
                          Sem taxas escondidas. Você gerencia e cancela direto
                          pelo seu Perfil.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-2">
                  <Button
                    type="button"
                    onClick={confirmSubscription}
                    disabled={isProcessingCheckout === subModal.pkg.id}
                    className="w-full h-14 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl text-lg shadow-xl shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isProcessingCheckout === subModal.pkg.id ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        Próximo <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-[10px] text-slate-400 font-medium mt-3">
                    Pagamento seguro. Você poderá revisar os detalhes a seguir.
                  </p>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
