// components/fusion-pass-modal.tsx
"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
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
  QrCode,
  CreditCard,
  Copy,
  Check,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  const router = useRouter();
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

  const pendingSelectionRef = useRef<{
    tier: PassTier;
    hours: number | null;
  } | null>(null);

  const [subModal, setSubModal] = useState<{
    isOpen: boolean;
    pkg: PlanPackage | null;
    option: PlanOption | null;
  }>({ isOpen: false, pkg: null, option: null });

  // Estados de Pagamento da Assinatura (PIX ou Cartão)
  const [paymentMethod, setPaymentMethod] = useState<"PIX" | "CREDIT_CARD">(
    "PIX",
  );
  const [userProfileData, setUserProfileData] = useState<{
    cpf: string;
    cep: string;
    cc_last4: string | null;
    cc_brand: string | null;
  }>({ cpf: "", cep: "", cc_last4: null, cc_brand: null });

  const [useSavedCard, setUseSavedCard] = useState(false);
  const [saveCard, setSaveCard] = useState(true);
  const [cardName, setCardName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpiry, setCardExpiry] = useState("");
  const [cardCvv, setCardCvv] = useState("");
  const [holderCpf, setHolderCpf] = useState("");
  const [holderCep, setHolderCep] = useState("");

  // Estados do QR Code PIX da Assinatura
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [activeSubPaymentId, setActiveSubPaymentId] = useState<string | null>(
    null,
  );
  const [copiedPix, setCopiedPix] = useState(false);

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
  useMobileBack(subModal.isOpen, () => handleCloseSubModal(), "sub-modal");

  const handleCloseSubModal = () => {
    setSubModal({ isOpen: false, pkg: null, option: null });
    setPixQrCode(null);
    setPixCopyPaste(null);
    setActiveSubPaymentId(null);
  };

  // Carrega CPF, CEP e Cartão Salvo do profissional logado
  useEffect(() => {
    async function loadUserProfileForCheckout() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data: prof } = await supabase
        .from("profiles")
        .select("full_name, cpf, cep, cc_last4, cc_brand")
        .eq("id", user.id)
        .maybeSingle();

      if (prof) {
        setUserProfileData({
          cpf: prof.cpf || "",
          cep: prof.cep || "",
          cc_last4: prof.cc_last4 || null,
          cc_brand: prof.cc_brand || null,
        });
        setHolderCpf(prof.cpf || "");
        setHolderCep(prof.cep || "");
        if (prof.full_name && !cardName) {
          setCardName(prof.full_name.toUpperCase());
        }
        if (prof.cc_last4) {
          setUseSavedCard(true);
        }
      }
    }
    if (subModal.isOpen) {
      loadUserProfileForCheckout();
    }
  }, [subModal.isOpen, supabase, cardName]);

  // Polling automático quando o QR Code PIX da Assinatura está aberto na tela
  useEffect(() => {
    if (!activeSubPaymentId || !subModal.pkg || !subModal.option) return;

    const interval = setInterval(async () => {
      try {
        const params = new URLSearchParams({
          checkoutType: "package",
          paymentId: activeSubPaymentId,
          tier: subModal.pkg!.id,
          hours: String(subModal.option!.hours),
          price: String(subModal.option!.price),
          packageName: subModal.pkg!.title,
        });

        const res = await fetch(`/api/checkout?${params.toString()}`, {
          cache: "no-store",
        });
        if (res.ok) {
          const data = await res.json();
          if (data.confirmed) {
            clearInterval(interval);
            toast({
              title: "Assinatura Confirmada! 🎉",
              description: `Suas ${subModal.option!.hours} horas já estão liberadas na sua carteira.`,
            });
            handleCloseSubModal();
            if (onSubscriptionSuccess) {
              onSubscriptionSuccess();
            }
          }
        }
      } catch (e) {
        console.error("Erro no polling da assinatura:", e);
      }
    }, 4000);

    return () => clearInterval(interval);
  }, [
    activeSubPaymentId,
    subModal.pkg,
    subModal.option,
    toast,
    onSubscriptionSuccess,
  ]);

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

    setTimeout(() => executeScroll("auto"), 40);
    setTimeout(() => executeScroll("smooth"), 220);
  }, []);

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
    setPixQrCode(null);
    setPixCopyPaste(null);
    setActiveSubPaymentId(null);
    onOpenChange(false);
    setTimeout(() => {
      setSubModal({ isOpen: true, pkg, option });
    }, 150);
  };

  const handleCopyPix = async () => {
    if (!pixCopyPaste) return;
    await navigator.clipboard.writeText(pixCopyPaste);
    setCopiedPix(true);
    toast({ title: "Código PIX copiado!" });
    setTimeout(() => setCopiedPix(false), 2500);
  };

  const confirmSubscription = async () => {
    if (!subModal.pkg || !subModal.option) return;

    const cleanCpf = holderCpf.replace(/\D/g, "");
    if (!cleanCpf || (cleanCpf.length !== 11 && cleanCpf.length !== 14)) {
      toast({
        variant: "destructive",
        title: "CPF obrigatório",
        description:
          "Informe um CPF válido (11 dígitos) para emissão no Asaas.",
      });
      return;
    }

    let formattedCard: any = undefined;
    let cardDataPayload: any = undefined;

    if (paymentMethod === "CREDIT_CARD") {
      if (useSavedCard && userProfileData.cc_last4) {
        cardDataPayload = {
          useSavedCard: true,
          cpf: cleanCpf,
          cep: holderCep.replace(/\D/g, "") || "59000000",
        };
      } else {
        const cleanCardNum = cardNumber.replace(/\D/g, "");
        const [expM, expY] = cardExpiry.split("/");
        if (cleanCardNum.length < 13 || !expM || !expY || cardCvv.length < 3) {
          toast({
            variant: "destructive",
            title: "Dados do cartão incompletos",
            description:
              "Preencha o número, validade (MM/AA) e CVV do cartão de crédito.",
          });
          return;
        }

        const yearFormatted =
          expY.trim().length === 2 ? `20${expY.trim()}` : expY.trim();

        formattedCard = {
          holderName: (cardName || "TITULAR FUSION").toUpperCase(),
          number: cleanCardNum,
          expiryMonth: expM.trim(),
          expiryYear: yearFormatted,
          ccv: cardCvv.trim(),
        };

        cardDataPayload = {
          useSavedCard: false,
          saveCard,
          cpf: cleanCpf,
          cep: holderCep.replace(/\D/g, "") || "59000000",
        };
      }
    }

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
        router.push("/login");
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
          billingType: paymentMethod,
          customerCpf: cleanCpf,
          customerCep: holderCep.replace(/\D/g, ""),
          creditCard: formattedCard,
          cardData: cardDataPayload,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(
          data.error || "Falha ao processar assinatura no Asaas.",
        );
      }

      // Se for PIX, exibe o QR Code na tela e inicia o monitoramento automático
      if (paymentMethod === "PIX" && data.pixQrCode) {
        setPixQrCode(data.pixQrCode);
        setPixCopyPaste(data.pixCopyPaste);
        setActiveSubPaymentId(data.paymentId);
        toast({
          title: "QR Code PIX gerado!",
          description:
            "Escaneie ou copie o código. Suas horas serão liberadas automaticamente.",
        });
        return;
      }

      // Se foi Cartão de Crédito e já confirmou
      toast({
        title: "Assinatura Ativa! 🎉",
        description: `Suas ${subModal.option.hours} horas foram adicionadas à carteira com sucesso.`,
      });
      handleCloseSubModal();

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

      {/* ======================================================== */}
      {/* MODAL DE CHECKOUT RECORRENTE DA ASSINATURA (PIX/CARTÃO)   */}
      {/* ======================================================== */}
      <Dialog
        open={subModal.isOpen}
        onOpenChange={(open) => !open && handleCloseSubModal()}
      >
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="sm:max-w-md max-h-[94dvh] overflow-y-auto rounded-[2rem] p-0 bg-slate-50 border-0 z-[230] [&>button]:hidden"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Checkout de Assinatura Fusion Pass</DialogTitle>
            <DialogDescription>
              Escolha a forma de pagamento da sua assinatura mensal.
            </DialogDescription>
          </DialogHeader>

          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={handleCloseSubModal}
              className="w-8 h-8 bg-black/15 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white/20"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {subModal.pkg && subModal.option && (
            <div className="flex flex-col">
              <div className="p-6 pb-10 bg-[#BF4B24] text-white">
                <div className="w-11 h-11 bg-white/15 rounded-2xl flex items-center justify-center mb-3 border border-white/20">
                  <subModal.pkg.icon className="w-5 h-5 text-white" />
                </div>
                <h2 className="text-xl font-black mb-1">
                  Ativar {subModal.pkg.title} ({subModal.option.hours}h/mês)
                </h2>
                <p className="text-xs opacity-90 font-medium leading-relaxed">
                  Assinatura recorrente mensal sem fidelidade. Suas horas são
                  liberadas imediatamente após a confirmação.
                </p>
              </div>

              <div className="p-5 sm:p-6 bg-white -mt-6 rounded-t-3xl relative z-10 flex flex-col gap-5 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)]">
                {/* Resumo do Plano */}
                <div className="flex justify-between items-center bg-stone-50 p-4 rounded-2xl border border-stone-200/80">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Franquia Mensal
                    </p>
                    <p className="text-base font-bold text-slate-900">
                      {subModal.pkg.title} • {subModal.option.hours} horas
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      Valor Mensal
                    </p>
                    <p className="text-lg font-black text-[#BF4B24]">
                      R${" "}
                      {subModal.option.price.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </p>
                  </div>
                </div>

                {/* SE JÁ GEROU O PIX DA ASSINATURA, MOSTRA O QR CODE */}
                {pixQrCode ? (
                  <div className="space-y-4 text-center py-2 animate-in fade-in">
                    <div className="bg-emerald-50 border border-emerald-200/80 text-emerald-900 p-3 rounded-xl text-xs font-semibold">
                      Escaneie o QR Code abaixo ou use o PIX Copia e Cola. Assim
                      que o pagamento for confirmado, suas{" "}
                      <strong>{subModal.option.hours} horas</strong> serão
                      creditadas automaticamente!
                    </div>

                    <div className="mx-auto w-48 h-48 bg-white p-3 rounded-2xl border border-slate-200 shadow-xs flex items-center justify-center">
                      <img
                        src={`data:image/png;base64,${pixQrCode}`}
                        alt="QR Code PIX Assinatura"
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {pixCopyPaste && (
                      <div className="space-y-2">
                        <Button
                          type="button"
                          onClick={handleCopyPix}
                          className="w-full h-11 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white text-xs flex items-center justify-center gap-2"
                        >
                          {copiedPix ? (
                            <>
                              <Check className="w-4 h-4 text-emerald-400" />
                              Código PIX Copiado!
                            </>
                          ) : (
                            <>
                              <Copy className="w-4 h-4" />
                              Copiar Código PIX
                            </>
                          )}
                        </Button>
                      </div>
                    )}

                    <div className="flex items-center justify-center gap-2 text-xs text-slate-500 font-medium pt-1">
                      <Loader2 className="w-4 h-4 animate-spin text-[#BF4B24]" />
                      Aguardando confirmação automática do banco...
                    </div>
                  </div>
                ) : (
                  <>
                    {/* Escolha do Método de Pagamento: PIX vs Cartão */}
                    <div>
                      <Label className="text-xs font-bold text-slate-700 mb-2 block">
                        Forma de pagamento da assinatura
                      </Label>
                      <div className="grid grid-cols-2 gap-2.5">
                        <button
                          type="button"
                          onClick={() => setPaymentMethod("PIX")}
                          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                            paymentMethod === "PIX"
                              ? "border-[#BF4B24] bg-orange-50/50 text-slate-900 ring-1 ring-[#BF4B24]"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <QrCode className="w-4 h-4 text-[#BF4B24] shrink-0" />
                          <div>
                            <span className="text-xs font-bold block">PIX</span>
                            <span className="text-[10px] text-slate-500 block">
                              Liberação na hora
                            </span>
                          </div>
                        </button>

                        <button
                          type="button"
                          onClick={() => setPaymentMethod("CREDIT_CARD")}
                          className={`p-3 rounded-xl border text-left transition-all flex items-center gap-2.5 ${
                            paymentMethod === "CREDIT_CARD"
                              ? "border-[#BF4B24] bg-orange-50/50 text-slate-900 ring-1 ring-[#BF4B24]"
                              : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                          }`}
                        >
                          <CreditCard className="w-4 h-4 text-[#BF4B24] shrink-0" />
                          <div>
                            <span className="text-xs font-bold block">
                              Cartão
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              Recorrente mensal
                            </span>
                          </div>
                        </button>
                      </div>
                    </div>

                    {/* CPF do Assinante (Sempre visível caso não tenha no perfil, ou editável) */}
                    <div>
                      <Label className="text-xs font-bold text-slate-700">
                        CPF do titular da assinatura *
                      </Label>
                      <Input
                        placeholder="000.000.000-00"
                        value={holderCpf}
                        onChange={(e) => setHolderCpf(e.target.value)}
                        className="mt-1 h-10 rounded-xl text-sm font-semibold"
                      />
                    </div>

                    {/* Campos de Cartão de Crédito */}
                    {paymentMethod === "CREDIT_CARD" && (
                      <div className="space-y-3 bg-stone-50 p-3.5 rounded-2xl border border-stone-200/80 animate-in fade-in">
                        {userProfileData.cc_last4 && (
                          <div className="flex items-center justify-between pb-2 border-b border-stone-200">
                            <label className="flex items-center gap-2 text-xs font-bold text-slate-800 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={useSavedCard}
                                onChange={(e) =>
                                  setUseSavedCard(e.target.checked)
                                }
                                className="accent-[#BF4B24] rounded"
                              />
                              Usar cartão salvo (
                              {userProfileData.cc_brand || "Cartão"} final{" "}
                              {userProfileData.cc_last4})
                            </label>
                          </div>
                        )}

                        {!useSavedCard && (
                          <>
                            <div>
                              <Label className="text-[11px] font-bold text-slate-600">
                                Nome impresso no cartão
                              </Label>
                              <Input
                                placeholder="COMO ESTÁ NO CARTÃO"
                                value={cardName}
                                onChange={(e) =>
                                  setCardName(e.target.value.toUpperCase())
                                }
                                className="mt-1 h-9 bg-white text-xs font-semibold"
                              />
                            </div>

                            <div>
                              <Label className="text-[11px] font-bold text-slate-600">
                                Número do cartão
                              </Label>
                              <Input
                                placeholder="0000 0000 0000 0000"
                                value={cardNumber}
                                onChange={(e) => setCardNumber(e.target.value)}
                                className="mt-1 h-9 bg-white text-xs font-semibold"
                              />
                            </div>

                            <div className="grid grid-cols-3 gap-2">
                              <div>
                                <Label className="text-[11px] font-bold text-slate-600">
                                  Validade
                                </Label>
                                <Input
                                  placeholder="MM/AA"
                                  value={cardExpiry}
                                  onChange={(e) =>
                                    setCardExpiry(e.target.value)
                                  }
                                  className="mt-1 h-9 bg-white text-xs font-semibold"
                                />
                              </div>
                              <div>
                                <Label className="text-[11px] font-bold text-slate-600">
                                  CVV
                                </Label>
                                <Input
                                  placeholder="123"
                                  maxLength={4}
                                  value={cardCvv}
                                  onChange={(e) => setCardCvv(e.target.value)}
                                  className="mt-1 h-9 bg-white text-xs font-semibold"
                                />
                              </div>
                              <div>
                                <Label className="text-[11px] font-bold text-slate-600">
                                  CEP
                                </Label>
                                <Input
                                  placeholder="59000-000"
                                  value={holderCep}
                                  onChange={(e) => setHolderCep(e.target.value)}
                                  className="mt-1 h-9 bg-white text-xs font-semibold"
                                />
                              </div>
                            </div>

                            <label className="flex items-center gap-2 text-[11px] font-semibold text-slate-600 pt-1 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={saveCard}
                                onChange={(e) => setSaveCard(e.target.checked)}
                                className="accent-[#BF4B24] rounded"
                              />
                              Salvar cartão com segurança para próximas
                              renovações
                            </label>
                          </>
                        )}
                      </div>
                    )}

                    {/* Resumo de Transparência */}
                    <div className="space-y-2.5 pt-1">
                      <div className="flex items-center gap-2.5 text-xs text-slate-600">
                        <Zap className="w-4 h-4 text-emerald-600 shrink-0" />
                        <span>
                          <strong>+{subModal.option.hours} horas</strong>{" "}
                          creditadas imediatamente na sua carteira.
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-slate-600">
                        <RefreshCw className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>
                          Renovação mensal em{" "}
                          <strong>
                            {format(addMonths(new Date(), 1), "dd/MM/yyyy", {
                              locale: ptBR,
                            })}
                          </strong>
                          .
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 text-xs text-slate-600">
                        <Unlock className="w-4 h-4 text-slate-600 shrink-0" />
                        <span>
                          Cancele quando quiser direto pelo seu Perfil, sem
                          multa.
                        </span>
                      </div>
                    </div>

                    <div className="pt-1">
                      <Button
                        type="button"
                        onClick={confirmSubscription}
                        disabled={isProcessingCheckout === subModal.pkg.id}
                        className="w-full h-12 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold rounded-xl text-sm shadow-md transition-all active:scale-95 flex items-center justify-center gap-2"
                      >
                        {isProcessingCheckout === subModal.pkg.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Processando assinatura...
                          </>
                        ) : paymentMethod === "PIX" ? (
                          <>
                            Gerar PIX da Assinatura (R${" "}
                            {subModal.option.price.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}
                            )
                            <ArrowRight className="w-4 h-4" />
                          </>
                        ) : (
                          <>
                            Confirmar e Assinar no Cartão
                            <ArrowRight className="w-4 h-4" />
                          </>
                        )}
                      </Button>
                      <p className="text-center text-[10px] text-slate-400 font-medium mt-2.5 flex items-center justify-center gap-1">
                        <Lock className="w-3 h-3" /> Ambiente seguro processado
                        via Asaas
                      </p>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
