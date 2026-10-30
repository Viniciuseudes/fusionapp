// components/fusion-pass-promo-popup.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  X,
  ChevronRight,
  ArrowLeft,
  Loader2,
  QrCode,
  CreditCard,
  Copy,
  ShieldCheck,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";

interface FusionPassPromoPopupProps {
  onSelectPlan?: (pkg?: any) => void;
  imageSrc?: string;
}

type TierKey = "start" | "vip" | "master";

const REFERENCE_AVULSO_RATES: Record<TierKey, number> = {
  start: 45,
  vip: 55,
  master: 80,
};

// Garante que o pop-up automático só abra 1 vez por sessão (não repete ao mudar de aba)
const POPUP_DISMISSED_KEY = "fusion_pass_promo_dismissed_session_v4";

function normalizeTier(raw?: string | null): TierKey {
  const t = String(raw || "start")
    .toLowerCase()
    .trim();
  if (t.includes("master") || t.includes("premium")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

function formatTierName(tier: TierKey): string {
  if (tier === "master") return "Premium";
  if (tier === "vip") return "VIP";
  return "Basic";
}

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function FusionPassPromoPopup({
  onSelectPlan,
  imageSrc = "/fusion-pass-popup.png",
}: FusionPassPromoPopupProps) {
  const router = useRouter();
  const { toast } = useToast();
  const [supabase] = useState(() => createClient());

  const [isOpen, setIsOpen] = useState(false);
  const [isClosing, setIsClosing] = useState(false);
  const [step, setStep] = useState<"banner" | "plans" | "checkout">("banner");

  const [packages, setPackages] = useState<any[]>([]);
  const [loadingPkgs, setLoadingPkgs] = useState(false);
  const [selectedTier, setSelectedTier] = useState<TierKey>("vip");
  const [selectedPkg, setSelectedPkg] = useState<any | null>(null);

  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [userProfile, setUserProfile] = useState<any | null>(null);

  // Estados do Checkout Integrado
  const [billingType, setBillingType] = useState<"PIX" | "CREDIT_CARD">("PIX");
  const [processingPayment, setProcessingPayment] = useState(false);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);

  const [customerCpf, setCustomerCpf] = useState("");
  const [customerCep, setCustomerCep] = useState("");
  const [useSavedCard, setUseSavedCard] = useState(false);
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [ccv, setCcv] = useState("");

  const openModal = useCallback(
    (initialStep: "banner" | "plans" = "banner") => {
      setStep(initialStep);
      setPaymentId(null);
      setPixQrCode(null);
      setPixCopyPaste(null);
      setIsClosing(false);
      setIsOpen(true);

      if (typeof document !== "undefined") {
        document.documentElement.setAttribute(
          "data-fusion-promo-active",
          "true",
        );
      }
    },
    [],
  );

  const handleClose = useCallback(() => {
    try {
      sessionStorage.setItem(POPUP_DISMISSED_KEY, "true");
    } catch {}

    setIsClosing(true);
    setTimeout(() => {
      setIsOpen(false);
      setIsClosing(false);
      setStep("banner");
      setPaymentId(null);

      // Libera avisos secundários (como instalar PWA) 8 segundos após fechar o pop-up
      setTimeout(() => {
        if (typeof document !== "undefined") {
          document.documentElement.removeAttribute("data-fusion-promo-active");
        }
      }, 8000);
    }, 200);
  }, []);

  const loadData = useCallback(async () => {
    setLoadingPkgs(true);
    try {
      const [{ data: sessionData }, { data: pkgsData }] = await Promise.all([
        supabase.auth.getSession(),
        supabase
          .from("packages")
          .select("id, tier, hours, price, active")
          .eq("active", true)
          .order("hours", { ascending: true }),
      ]);

      const sessionUser = sessionData?.session?.user || null;
      setIsAuthenticated(Boolean(sessionUser));

      if (sessionUser) {
        const { data: prof } = await supabase
          .from("profiles")
          .select(
            "id, full_name, email, cpf, cep, cc_token, cc_last4, cc_brand",
          )
          .eq("id", sessionUser.id)
          .maybeSingle();

        if (prof) {
          setUserProfile(prof);
          setCustomerCpf(prof.cpf || "");
          setCustomerCep(prof.cep || "");
          setHolderName(prof.full_name || "");
          setUseSavedCard(Boolean(prof.cc_token));
        }
      }

      if (pkgsData && pkgsData.length > 0) {
        setPackages(pkgsData);
      } else {
        setPackages([
          { id: "b8", tier: "start", hours: 8, price: 280 },
          { id: "b16", tier: "start", hours: 16, price: 534.08 },
          { id: "v8", tier: "vip", hours: 8, price: 340 },
          { id: "v16", tier: "vip", hours: 16, price: 658.08 },
          { id: "m8", tier: "master", hours: 8, price: 500 },
          { id: "m16", tier: "master", hours: 16, price: 848.96 },
        ]);
      }
    } catch {
    } finally {
      setLoadingPkgs(false);
    }
  }, [supabase]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Abertura única após 4 segundos (aguarda as salas carregarem primeiro)
  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      window.location.pathname.startsWith("/admin")
    ) {
      return;
    }

    const savedIntentRaw =
      typeof window !== "undefined"
        ? sessionStorage.getItem("fusion_selected_package_intent")
        : null;

    if (savedIntentRaw && isAuthenticated) {
      try {
        const parsedPkg = JSON.parse(savedIntentRaw);
        sessionStorage.removeItem("fusion_selected_package_intent");
        setSelectedPkg(parsedPkg);
        setSelectedTier(normalizeTier(parsedPkg.tier));
        setStep("checkout");
        setIsOpen(true);
        return;
      } catch {}
    }

    const alreadyDismissed = sessionStorage.getItem(POPUP_DISMISSED_KEY);
    let timer: NodeJS.Timeout | undefined;

    if (!alreadyDismissed) {
      document.documentElement.setAttribute("data-fusion-promo-active", "true");

      timer = setTimeout(() => {
        const checkAgain = sessionStorage.getItem(POPUP_DISMISSED_KEY);
        if (!checkAgain) {
          sessionStorage.setItem(POPUP_DISMISSED_KEY, "true");
          openModal("banner");
        }
      }, 4000);
    }

    const handleCustomOpen = (e: Event) => {
      const customEv = e as CustomEvent;
      const targetStep = customEv.detail?.step === "plans" ? "plans" : "banner";
      openModal(targetStep);
    };

    window.addEventListener("open-fusion-pass", handleCustomOpen);

    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("open-fusion-pass", handleCustomOpen);
    };
  }, [isAuthenticated, openModal]);

  // Polling automático quando o QR Code PIX da assinatura estiver aberto
  useEffect(() => {
    if (!isOpen || step !== "checkout" || !paymentId || !selectedPkg) return;

    const hours = Math.max(1, Number(selectedPkg.hours) || 8);
    const rawPrice = Number(selectedPkg.price) || 0;
    const totalPrice =
      hours > 1 && rawPrice <= 120 ? rawPrice * hours : rawPrice;
    const tier = normalizeTier(selectedPkg.tier);

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/checkout?checkoutType=package&paymentId=${paymentId}&tier=${tier}&hours=${hours}&price=${totalPrice}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.confirmed) {
            clearInterval(timer);
            toast({
              title: "Fusion Pass+ ativado com sucesso!",
              description: `+${hours}h (${formatTierName(tier)}) já estão disponíveis na sua carteira.`,
            });
            handleClose();
            window.location.reload();
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(timer);
  }, [isOpen, step, paymentId, selectedPkg, toast, handleClose]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") handleClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, handleClose]);

  const handleSelectPackageToBuy = (pkg: any) => {
    if (onSelectPlan) {
      handleClose();
      onSelectPlan(pkg);
      return;
    }

    if (!isAuthenticated) {
      try {
        sessionStorage.setItem(
          "fusion_selected_package_intent",
          JSON.stringify(pkg),
        );
      } catch {}
      handleClose();
      router.push("/login");
      return;
    }

    setSelectedPkg(pkg);
    setPaymentId(null);
    setPixQrCode(null);
    setPixCopyPaste(null);
    setStep("checkout");
  };

  const handleProcessSubscription = async () => {
    if (!selectedPkg) return;
    setProcessingPayment(true);

    try {
      const hours = Math.max(1, Number(selectedPkg.hours) || 8);
      const rawPrice = Number(selectedPkg.price) || 0;
      const totalPrice =
        hours > 1 && rawPrice <= 120 ? rawPrice * hours : rawPrice;
      const tier = normalizeTier(selectedPkg.tier);

      const payload: Record<string, any> = {
        checkoutType: "package",
        packageId: tier,
        hours,
        packageName: `Fusion Pass+ ${formatTierName(tier)}`,
        price: totalPrice,
        billingType,
        customerCpf,
        customerCep,
      };

      if (billingType === "CREDIT_CARD") {
        if (useSavedCard && userProfile?.cc_token) {
          payload.cardData = {
            useSavedCard: true,
            cpf: customerCpf,
            cep: customerCep,
          };
        } else {
          if (
            !cardNumber ||
            !holderName ||
            !expiryMonth ||
            !expiryYear ||
            !ccv
          ) {
            throw new Error("Preencha todos os dados do cartão.");
          }
          payload.creditCard = {
            holderName,
            number: cardNumber.replace(/\D/g, ""),
            expiryMonth: expiryMonth.replace(/\D/g, ""),
            expiryYear:
              expiryYear.length === 2 ? `20${expiryYear}` : expiryYear,
            ccv: ccv.replace(/\D/g, ""),
          };
          payload.cardData = {
            useSavedCard: false,
            saveCard: true,
            cpf: customerCpf,
            cep: customerCep,
          };
        }
      }

      const res = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "Não foi possível concluir a assinatura.",
        );
      }

      if (billingType === "PIX") {
        setPaymentId(data.paymentId);
        setPixQrCode(data.pixQrCode);
        setPixCopyPaste(data.pixCopyPaste);
      } else {
        toast({
          title: "Assinatura ativada com sucesso!",
          description: `+${hours}h foram adicionadas à sua carteira Fusion.`,
        });
        handleClose();
        window.location.reload();
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Atenção",
        description: err.message,
      });
    } finally {
      setProcessingPayment(false);
    }
  };

  if (!isOpen) return null;

  const tierPackages = packages.filter(
    (p) => normalizeTier(p.tier) === selectedTier,
  );

  const checkoutHours = selectedPkg
    ? Math.max(1, Number(selectedPkg.hours) || 8)
    : 8;
  const checkoutRawPrice = selectedPkg ? Number(selectedPkg.price) || 0 : 0;
  const checkoutTotalPrice =
    checkoutHours > 1 && checkoutRawPrice <= 120
      ? checkoutRawPrice * checkoutHours
      : checkoutRawPrice;
  const checkoutHourlyRate = checkoutTotalPrice / checkoutHours;

  return (
    <>
      {/* Adia o banner de instalar aplicativo enquanto o pop-up estiver aberto */}
      <style jsx global>{`
        html[data-fusion-promo-active="true"] [class*="pwa"],
        html[data-fusion-promo-active="true"] [id*="pwa"],
        html[data-fusion-promo-active="true"] [data-pwa-prompt] {
          opacity: 0 !important;
          pointer-events: none !important;
          transform: translateY(100%) !important;
        }
      `}</style>

      <div
        role="dialog"
        aria-modal="true"
        className={`fixed inset-0 z-[9999] flex items-center justify-center p-4 sm:p-6 transition-opacity duration-200 font-sans ${
          isClosing ? "opacity-0" : "opacity-100"
        }`}
      >
        {/* Fundo escurecido suave */}
        <div
          onClick={handleClose}
          className="fixed inset-0 bg-black/60 backdrop-blur-[2px] transition-opacity"
        />

        {/* Card no Tamanho Intermediário Ideal (355px no celular / 395px no desktop) */}
        <div
          className={`relative z-10 w-full ${
            step === "banner"
              ? "max-w-[355px] sm:max-w-[395px]"
              : "max-w-[380px] sm:max-w-[450px]"
          } bg-white rounded-3xl shadow-2xl overflow-hidden transition-all duration-200 ${
            isClosing ? "scale-95 opacity-0" : "scale-100 opacity-100"
          }`}
        >
          {/* Botão Fechar (X) */}
          <button
            type="button"
            onClick={handleClose}
            aria-label="Fechar"
            className="absolute top-3 right-3 z-30 w-8 h-8 rounded-full bg-black/55 hover:bg-black/80 text-white flex items-center justify-center backdrop-blur-xs shadow-md transition-transform active:scale-95 cursor-pointer"
          >
            <X className="w-4 h-4 stroke-[2.5]" />
          </button>

          {step === "banner" && (
            /* ================================================================ */
            /* ETAPA 1: EQUILÍBRIO ENTRE V1 E V2 (ARTE + PÍLULA + CTA)          */
            /* ================================================================ */
            <div className="flex flex-col">
              <div
                onClick={() => setStep("plans")}
                className="relative w-full aspect-square bg-[#9A3C1D] cursor-pointer overflow-hidden group"
              >
                <img
                  src={imageSrc}
                  alt="Fusion Pass+ com até 41% de desconto"
                  className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.02]"
                />
              </div>

              <div className="p-4 sm:p-5 bg-white space-y-3">
                <div className="flex items-center justify-center gap-3 text-[11px] font-semibold text-stone-600">
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Salas Basic, VIP e Premium
                  </span>
                  <span className="text-stone-300">•</span>
                  <span className="flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                    Melhor custo benefício
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => setStep("plans")}
                  className="w-full h-11 sm:h-12 rounded-xl bg-[#BF4B24] hover:bg-[#a63f1d] text-white font-bold text-sm flex items-center justify-center gap-1.5 shadow-sm transition-all active:scale-[0.99] cursor-pointer"
                >
                  <span>Conhecer os planos</span>
                  <ChevronRight className="w-4 h-4 stroke-[2.5]" />
                </button>

                <button
                  type="button"
                  onClick={handleClose}
                  className="w-full py-1 text-xs font-semibold text-stone-400 hover:text-stone-600 transition-colors cursor-pointer"
                >
                  Continuar navegando
                </button>
              </div>
            </div>
          )}

          {step === "plans" && (
            /* ================================================================ */
            /* ETAPA 2: VITRINE DE PLANOS (BRANDING FUSION)                     */
            /* ================================================================ */
            <div className="flex flex-col max-h-[84vh]">
              <div className="px-5 pt-4 pb-3.5 bg-[#FAF7F5] border-b border-stone-200/80">
                <button
                  type="button"
                  onClick={() => setStep("banner")}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-900 mb-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar
                </button>

                <h3 className="text-base sm:text-lg font-bold text-stone-900">
                  Planos Fusion Pass+
                </h3>
                <p className="text-xs text-stone-500">
                  Escolha a categoria de sala e o pacote de horas:
                </p>

                <div className="grid grid-cols-3 gap-1.5 bg-stone-200/70 p-1 rounded-xl mt-3">
                  {(
                    [
                      { id: "start", label: "Salas Basic" },
                      { id: "vip", label: "Salas VIP" },
                      { id: "master", label: "Salas Premium" },
                    ] as const
                  ).map((t) => {
                    const active = selectedTier === t.id;
                    return (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setSelectedTier(t.id)}
                        className={`py-2 px-2 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                          active
                            ? "bg-white text-[#BF4B24] shadow-2xs"
                            : "text-stone-600 hover:text-stone-900"
                        }`}
                      >
                        {t.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="p-4 sm:p-5 overflow-y-auto space-y-2.5 bg-white flex-1">
                <div className="flex items-center justify-between text-[11px] text-stone-500 font-medium">
                  <span>
                    {selectedTier === "master"
                      ? "Libera todas as salas (Premium, VIP e Basic)"
                      : selectedTier === "vip"
                        ? "Libera salas VIP e Basic"
                        : "Libera salas Basic"}
                  </span>
                  <span>Validade: 30 dias</span>
                </div>

                {loadingPkgs ? (
                  <div className="py-10 flex justify-center">
                    <Loader2 className="w-6 h-6 animate-spin text-[#BF4B24]" />
                  </div>
                ) : (
                  tierPackages.map((pkg, idx) => {
                    const hours = Math.max(1, Number(pkg.hours) || 1);
                    const rawPrice = Number(pkg.price) || 0;
                    const totalPrice =
                      hours > 1 && rawPrice <= 120
                        ? rawPrice * hours
                        : rawPrice;
                    const hourlyRate = totalPrice / hours;

                    const refAvulso = REFERENCE_AVULSO_RATES[selectedTier];
                    const discountPct = Math.max(
                      15,
                      Math.min(
                        41,
                        Math.round(
                          ((refAvulso - hourlyRate) / refAvulso) * 100,
                        ),
                      ),
                    );
                    const isRecommended = hours === 16 || idx === 1;

                    return (
                      <div
                        key={pkg.id || `${pkg.tier}-${hours}`}
                        onClick={() => handleSelectPackageToBuy(pkg)}
                        className={`p-3.5 sm:p-4 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                          isRecommended
                            ? "border-[#BF4B24] bg-[#FAF7F5]/60"
                            : "border-stone-200 hover:border-stone-300 bg-white"
                        }`}
                      >
                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="text-sm sm:text-base font-bold text-stone-900">
                              {hours} horas
                            </span>
                            <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md">
                              {discountPct}% OFF
                            </span>
                            {isRecommended && (
                              <span className="text-[10px] font-bold text-[#BF4B24] bg-[#BF4B24]/10 px-2 py-0.5 rounded-md">
                                Mais escolhido
                              </span>
                            )}
                          </div>

                          <div className="text-xs text-stone-500 tabular-nums">
                            <span className="line-through text-stone-400 mr-1.5">
                              R$ {formatBRL(refAvulso)}/h
                            </span>
                            por{" "}
                            <strong className="text-stone-900 font-bold">
                              R$ {formatBRL(hourlyRate)}/h
                            </strong>
                          </div>
                          <p className="text-[11px] text-stone-400 tabular-nums">
                            Total do pacote: R$ {formatBRL(totalPrice)}
                          </p>
                        </div>

                        <button
                          type="button"
                          className="px-4 py-2 rounded-xl bg-[#BF4B24] hover:bg-[#a63f1d] text-white font-bold text-xs shrink-0 transition-colors"
                        >
                          Escolher
                        </button>
                      </div>
                    );
                  })
                )}
              </div>

              <div className="px-5 py-3 bg-stone-50 border-t border-stone-200/80 flex items-center justify-between text-xs">
                <span className="text-stone-500 flex items-center gap-1.5">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  Créditos liberados na hora
                </span>
                <button
                  type="button"
                  onClick={handleClose}
                  className="font-semibold text-stone-500 hover:text-stone-800 cursor-pointer"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}

          {step === "checkout" && selectedPkg && (
            /* ================================================================ */
            /* ETAPA 3: CHECKOUT TRANSPARENTE FUSION                            */
            /* ================================================================ */
            <div className="flex flex-col max-h-[85vh]">
              <div className="px-5 pt-4 pb-3.5 bg-[#FAF7F5] border-b border-stone-200/80">
                <button
                  type="button"
                  onClick={() => {
                    setStep("plans");
                    setPaymentId(null);
                  }}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-stone-500 hover:text-stone-900 mb-1.5 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Trocar pacote
                </button>

                <div className="flex items-center justify-between pr-6">
                  <div>
                    <span className="text-[10px] font-bold uppercase text-[#BF4B24]">
                      Assinatura Fusion Pass+
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-stone-900">
                      Pacote {checkoutHours}h •{" "}
                      {formatTierName(normalizeTier(selectedPkg.tier))}
                    </h3>
                  </div>
                  <div className="text-right tabular-nums">
                    <span className="text-base font-bold text-stone-900 block">
                      R$ {formatBRL(checkoutTotalPrice)}
                    </span>
                    <span className="text-[11px] text-emerald-700 font-semibold">
                      R$ {formatBRL(checkoutHourlyRate)}/h
                    </span>
                  </div>
                </div>
              </div>

              <div className="p-5 overflow-y-auto space-y-3.5 bg-white flex-1">
                <div className="grid grid-cols-2 gap-1.5 bg-stone-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setBillingType("PIX");
                      setPaymentId(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      billingType === "PIX"
                        ? "bg-white text-[#BF4B24] shadow-2xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    <QrCode className="w-3.5 h-3.5" />
                    PIX
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setBillingType("CREDIT_CARD");
                      setPaymentId(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      billingType === "CREDIT_CARD"
                        ? "bg-white text-[#BF4B24] shadow-2xs"
                        : "text-stone-600 hover:text-stone-900"
                    }`}
                  >
                    <CreditCard className="w-3.5 h-3.5" />
                    Cartão
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-2.5">
                  <div>
                    <Label className="text-[11px] font-semibold text-stone-600">
                      CPF *
                    </Label>
                    <Input
                      value={customerCpf}
                      onChange={(e) => setCustomerCpf(e.target.value)}
                      placeholder="000.000.000-00"
                      className="mt-1 h-9 text-xs border-stone-200"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-stone-600">
                      CEP
                    </Label>
                    <Input
                      value={customerCep}
                      onChange={(e) => setCustomerCep(e.target.value)}
                      placeholder="59000-000"
                      className="mt-1 h-9 text-xs border-stone-200"
                    />
                  </div>
                </div>

                {billingType === "CREDIT_CARD" && (
                  <div className="space-y-2.5">
                    {userProfile?.cc_token && (
                      <div className="flex items-center justify-between p-2.5 rounded-xl bg-[#FAF7F5] border border-[#BF4B24]/25 text-xs">
                        <div>
                          <span className="font-bold text-stone-900 block">
                            Cartão salvo ({userProfile.cc_brand || "Cartão"}{" "}
                            •••• {userProfile.cc_last4})
                          </span>
                        </div>
                        <input
                          type="checkbox"
                          checked={useSavedCard}
                          onChange={(e) => setUseSavedCard(e.target.checked)}
                          className="h-4 w-4 accent-[#BF4B24] rounded cursor-pointer"
                        />
                      </div>
                    )}

                    {(!useSavedCard || !userProfile?.cc_token) && (
                      <div className="space-y-2">
                        <div>
                          <Label className="text-[11px] font-semibold text-stone-600">
                            Nome no cartão
                          </Label>
                          <Input
                            value={holderName}
                            onChange={(e) => setHolderName(e.target.value)}
                            placeholder="Como está no cartão"
                            className="mt-1 h-9 text-xs border-stone-200"
                          />
                        </div>
                        <div>
                          <Label className="text-[11px] font-semibold text-stone-600">
                            Número do cartão
                          </Label>
                          <Input
                            value={cardNumber}
                            onChange={(e) => setCardNumber(e.target.value)}
                            placeholder="0000 0000 0000 0000"
                            className="mt-1 h-9 text-xs border-stone-200"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-2">
                          <div>
                            <Label className="text-[11px] font-semibold text-stone-600">
                              Mês
                            </Label>
                            <Input
                              value={expiryMonth}
                              onChange={(e) => setExpiryMonth(e.target.value)}
                              placeholder="08"
                              maxLength={2}
                              className="mt-1 h-9 text-xs border-stone-200"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] font-semibold text-stone-600">
                              Ano
                            </Label>
                            <Input
                              value={expiryYear}
                              onChange={(e) => setExpiryYear(e.target.value)}
                              placeholder="2029"
                              maxLength={4}
                              className="mt-1 h-9 text-xs border-stone-200"
                            />
                          </div>
                          <div>
                            <Label className="text-[11px] font-semibold text-stone-600">
                              CVV
                            </Label>
                            <Input
                              value={ccv}
                              onChange={(e) => setCcv(e.target.value)}
                              placeholder="123"
                              maxLength={4}
                              className="mt-1 h-9 text-xs border-stone-200"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {billingType === "PIX" && pixQrCode && (
                  <div className="p-3.5 rounded-xl bg-[#FAF7F5] border border-[#BF4B24]/25 flex flex-col items-center text-center space-y-2.5">
                    <img
                      src={`data:image/png;base64,${pixQrCode}`}
                      alt="QR Code PIX"
                      className="w-36 h-36 rounded-lg border border-stone-200 bg-white p-1.5"
                    />
                    <button
                      type="button"
                      onClick={() => {
                        if (pixCopyPaste) {
                          navigator.clipboard.writeText(pixCopyPaste);
                          toast({ title: "Código PIX copiado!" });
                        }
                      }}
                      className="w-full h-9 rounded-lg bg-white border border-stone-300 hover:bg-stone-50 text-stone-800 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Copy className="w-3.5 h-3.5 text-[#BF4B24]" />
                      Copiar PIX Copia e Cola
                    </button>
                    <p className="text-[11px] text-[#BF4B24] font-semibold flex items-center gap-1.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Aguardando pagamento...
                    </p>
                  </div>
                )}

                {!paymentId && (
                  <button
                    type="button"
                    disabled={processingPayment}
                    onClick={handleProcessSubscription}
                    className="w-full h-11 rounded-xl bg-[#BF4B24] hover:bg-[#a63f1d] disabled:opacity-60 text-white font-bold text-xs sm:text-sm flex items-center justify-center gap-2 shadow-xs transition-colors cursor-pointer"
                  >
                    {processingPayment ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Processando...
                      </>
                    ) : billingType === "PIX" ? (
                      `Gerar PIX • R$ ${formatBRL(checkoutTotalPrice)}`
                    ) : (
                      `Confirmar Assinatura • R$ ${formatBRL(checkoutTotalPrice)}`
                    )}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
