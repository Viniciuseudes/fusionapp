// components/checkout-modal.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Wallet,
  X,
  CreditCard,
  CalendarIcon,
  MapPin,
  QrCode,
  ArrowRight,
  CheckCircle2,
  Clock,
  Ticket,
  Check,
  Loader2,
  Percent,
  ArrowDownRight,
  ShieldCheck,
  Lock,
  Copy,
  XCircle,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";
import { Badge } from "@/components/ui/badge";

export interface CheckoutSummary {
  durationHours: number;
  creditsRequired: number;
  upgradeFeeBRL: number;
  hasEnoughCredits: boolean;
  currentBalance: number;
  canProceed: boolean;
  lockIds?: string[];
  usedTier?: string;
}

export interface CardData {
  number: string;
  name: string;
  expiry: string;
  cvv: string;
  cpf: string;
  cep: string;
  saveCard?: boolean;
  useSavedCard?: boolean;
  isThirdParty?: boolean;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    paymentMethod: "wallet" | "pix" | "card",
    appliedCoupon?: any,
    cardData?: CardData,
  ) => void;
  loading: boolean;
  summary: CheckoutSummary | null;
  room: any;
  selectedSlots: string[];
  selectedDate: Date;
  totalBaseBRL: number;
  pixQrCode?: string | null;
  pixCopyPaste?: string | null;
  activeBookingId?: string | null;
  onSuccess?: () => void;
}

// ADICIONADO O ESTADO DE "ERROR"
type CheckoutStep = "confirm" | "pix" | "success" | "error";

const formatCardNumber = (val: string) => {
  return val
    .replace(/\D/g, "")
    .replace(/(\d{4})(?=\d)/g, "$1 ")
    .trim()
    .slice(0, 19);
};

const formatExpiry = (val: string) => {
  return val
    .replace(/\D/g, "")
    .replace(/(\d{2})(\d{1,2})/, "$1/$2")
    .slice(0, 5);
};

const formatCPF = (val: string) => {
  return val
    .replace(/\D/g, "")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d)/, "$1.$2")
    .replace(/(\d{3})(\d{1,2})/, "$1-$2")
    .slice(0, 14);
};

const formatCEP = (val: string) => {
  return val
    .replace(/\D/g, "")
    .replace(/^(\d{5})(\d)/, "$1-$2")
    .slice(0, 9);
};

export function CheckoutModal({
  isOpen,
  onClose,
  onConfirm,
  loading,
  summary,
  room,
  selectedSlots,
  selectedDate,
  totalBaseBRL,
  pixQrCode,
  pixCopyPaste,
  activeBookingId,
  onSuccess,
}: CheckoutModalProps) {
  const { toast } = useToast();
  const supabase = createClient();
  const router = useRouter();

  const [step, setStep] = useState<CheckoutStep>("confirm");
  const [errorMessage, setErrorMessage] = useState<string>(""); // Armazena o motivo do erro
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "pix" | "card">(
    "wallet",
  );
  const [timeLeft, setTimeLeft] = useState(5 * 60);
  const [expiresAt, setExpiresAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [showCloseConfirm, setShowCloseConfirm] = useState(false);

  const [couponCode, setCouponCode] = useState("");
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  const [cardData, setCardData] = useState<CardData>({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
    cpf: "",
    cep: "",
    saveCard: false,
    useSavedCard: false,
    isThirdParty: false,
  });
  const [savedCardInfo, setSavedCardInfo] = useState<{
    last4: string;
    brand: string;
  } | null>(null);
  const [isMyCard, setIsMyCard] = useState(true);

  const pollingRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    setCardData((prev) => ({ ...prev, isThirdParty: !isMyCard }));
  }, [isMyCard]);

  useEffect(() => {
    if (isOpen) {
      window.history.pushState(
        { modal: "checkout" },
        "",
        window.location.hash + "/checkout",
      );
      const handlePop = () => {
        if (step === "pix") {
          setShowCloseConfirm(true);
        } else {
          onClose();
        }
      };
      window.addEventListener("popstate", handlePop);

      const fetchSavedCard = async () => {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data } = await supabase
            .from("profiles")
            .select("cc_last4, cc_brand")
            .eq("id", user.id)
            .single();
          if (data?.cc_last4) {
            setSavedCardInfo({ last4: data.cc_last4, brand: data.cc_brand });
            setCardData((prev) => ({ ...prev, useSavedCard: true }));
          }
        }
      };
      fetchSavedCard();

      return () => {
        window.removeEventListener("popstate", handlePop);
        if (window.history.state?.modal === "checkout") {
          window.history.back();
        }
      };
    }
  }, [isOpen, step, onClose, supabase]);

  useEffect(() => {
    if (isOpen) {
      setStep("confirm");
      setTimeLeft(5 * 60);
      setExpiresAt(Date.now() + 5 * 60 * 1000);
      setAppliedCoupon(null);
      setCouponCode("");
      setCouponFeedback(null);
      setErrorMessage("");
      setShowCloseConfirm(false);
      setPaymentMethod("wallet");
      setIsMyCard(true);
      setCardData({
        number: "",
        name: "",
        expiry: "",
        cvv: "",
        cpf: "",
        cep: "",
        saveCard: false,
        useSavedCard: savedCardInfo !== null,
        isThirdParty: false,
      });
    }
  }, [isOpen, savedCardInfo]);

  useEffect(() => {
    if (pixQrCode && pixCopyPaste && activeBookingId) {
      setExpiresAt(Date.now() + 5 * 60 * 1000);
      setStep("pix");
    }
  }, [pixQrCode, pixCopyPaste, activeBookingId]);

  // MOTOR DE BUSCA ATIVA E RECONCILIAÇÃO
  useEffect(() => {
    if (step !== "pix" || !activeBookingId) return;

    let isChecking = false;

    const checkPaymentStatus = async () => {
      if (isChecking) return;
      isChecking = true;

      try {
        const res = await fetch(`/api/checkout?bookingId=${activeBookingId}`);
        const data = await res.json();

        if (data.confirmed || data.status === "confirmed") {
          setStep("success");
          setShowCloseConfirm(false);
          if (onSuccess) onSuccess();
        } else if (data.status === "cancelled") {
          setErrorMessage(
            "O tempo limite esgotou e sua reserva foi cancelada.",
          );
          setStep("error");
          setShowCloseConfirm(false);
        }
      } catch (err) {
        console.error("Erro ao verificar status silenciosamente", err);
      } finally {
        isChecking = false;
      }
    };

    const channel = supabase
      .channel(`booking_status_${activeBookingId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "bookings",
          filter: `id=eq.${activeBookingId}`,
        },
        (payload: any) => {
          if (payload.new && payload.new.status === "confirmed") {
            setStep("success");
            setShowCloseConfirm(false);
            if (onSuccess) onSuccess();
          } else if (payload.new && payload.new.status === "cancelled") {
            setErrorMessage("Reserva cancelada (Tempo esgotado ou recusado).");
            setStep("error");
            setShowCloseConfirm(false);
          } else {
            checkPaymentStatus();
          }
        },
      )
      .subscribe();

    const interval = setInterval(checkPaymentStatus, 3000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") checkPaymentStatus();
    };

    window.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", checkPaymentStatus);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(interval);
      window.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", checkPaymentStatus);
    };
  }, [step, activeBookingId, supabase, onClose, onSuccess]);

  useEffect(() => {
    if (!isOpen || step === "success" || step === "error" || !expiresAt) return;

    const timer = setInterval(() => {
      const now = Date.now();
      const remaining = Math.max(0, Math.floor((expiresAt - now) / 1000));
      setTimeLeft(remaining);

      if (remaining === 0) {
        setErrorMessage(
          "O código PIX expirou. Por favor, inicie a reserva novamente.",
        );
        setStep("error");
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen, step, expiresAt]);

  const handleAttemptClose = () => {
    if (step === "pix") {
      setShowCloseConfirm(true);
    } else {
      onClose();
    }
  };

  const handleApplyCoupon = async () => {
    if (!couponCode.trim()) return;
    setIsVerifyingCoupon(true);
    setCouponFeedback(null);
    setAppliedCoupon(null);

    try {
      const codeToApply = couponCode.toUpperCase().replace(/\s/g, "");

      const { data: coupon, error } = await supabase
        .from("coupons")
        .select("*")
        .eq("code", codeToApply)
        .eq("is_active", true)
        .single();

      if (error || !coupon)
        throw new Error("Cupom inválido ou não encontrado.");
      if (coupon.valid_until && new Date(coupon.valid_until) < new Date())
        throw new Error("Este cupom já expirou.");
      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses)
        throw new Error("Este cupom atingiu o limite de utilizações.");
      if (coupon.valid_room_ids && coupon.valid_room_ids.length > 0) {
        if (!coupon.valid_room_ids.includes(room.id))
          throw new Error("Este cupom não é válido para esta sala.");
      }
      if (coupon.type === "bogo" && selectedSlots.length < 2)
        throw new Error("O cupom 'Leve 2' exige no mínimo 2 horas.");

      setAppliedCoupon(coupon);
      setCouponFeedback({
        message: "Desconto aplicado com sucesso!",
        type: "success",
      });

      if (paymentMethod === "wallet") {
        setPaymentMethod("pix");
        toast({
          title: "Pagamento Alterado",
          description:
            "Cupons são válidos apenas para dinheiro. Selecionamos o Pix.",
        });
      }
    } catch (err: any) {
      setCouponFeedback({ message: err.message, type: "error" });
    } finally {
      setIsVerifyingCoupon(false);
    }
  };

  const removeCoupon = () => {
    setAppliedCoupon(null);
    setCouponCode("");
    setCouponFeedback(null);
  };

  const handlePaymentSelect = (method: "wallet" | "pix" | "card") => {
    if (method === "wallet" && appliedCoupon) {
      removeCoupon();
      toast({
        title: "Cupom Removido",
        description: "Não é possível aplicar cupons com Créditos.",
      });
    }
    setPaymentMethod(method);
  };

  // Wrapper robusto que intercepta falhas para jogar na tela de ERRO
  const handleSubmitWrapper = async () => {
    if (paymentMethod === "card" && !cardData.useSavedCard) {
      if (
        !cardData.number ||
        !cardData.name ||
        !cardData.expiry ||
        !cardData.cvv
      ) {
        return toast({
          variant: "destructive",
          title: "Dados Incompletos",
          description: "Preencha todos os dados básicos do cartão.",
        });
      }
      if (!isMyCard && (!cardData.cpf || !cardData.cep)) {
        return toast({
          variant: "destructive",
          title: "Dados Incompletos",
          description: "Informe o CPF e CEP da fatura do titular do cartão.",
        });
      }
    }

    try {
      // Chama a função onConfirm passada pela página pai (que faz o fetch real)
      // Como a função é void/assíncrona no componente pai, precisamos tratar o erro lá ou interceptá-lo.
      // Para manter a arquitetura atual sem quebrar a assinatura da função `onConfirm`,
      // instruí o componente pai (room-detail.tsx) a não fechar o modal abruptamente em caso de erro,
      // mas sim expor uma forma de alterar o state. Como o controle do estado do PIX/Sucesso vem por props,
      // usaremos a intercepção nativa do erro do `onConfirm` caso possua await.

      await onConfirm(
        paymentMethod,
        appliedCoupon,
        paymentMethod === "card" ? cardData : undefined,
      );
    } catch (err: any) {
      setErrorMessage(err.message || "Não foi possível autorizar o pagamento.");
      setStep("error");
    }
  };

  const handleRobustCopy = async (textToCopy: string | null | undefined) => {
    if (!textToCopy) return;

    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(textToCopy);
      } else {
        const textArea = document.createElement("textarea");
        textArea.value = textToCopy;
        textArea.style.position = "fixed";
        textArea.style.top = "0";
        textArea.style.left = "0";
        textArea.style.opacity = "0";
        document.body.appendChild(textArea);
        textArea.focus();
        textArea.select();

        try {
          document.execCommand("copy");
        } catch (err) {
          throw new Error("Cópia não suportada pelo navegador.");
        } finally {
          document.body.removeChild(textArea);
        }
      }

      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: "Copiado!",
        description: "Código Pix copiado para a área de transferência.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Atenção",
        description: "Copie o código manualmente.",
      });
    }
  };

  if (!isOpen || !summary || !room) return null;

  const getTierWeight = (tier: string) => {
    const t = tier.toLowerCase();
    if (t === "master") return 3;
    if (t === "vip") return 2;
    return 1;
  };

  const roomTier = room.tier || "start";
  const usedTier = summary.usedTier || "start";
  const isCascading = getTierWeight(usedTier) > getTierWeight(roomTier);
  const finalCredits = summary.creditsRequired;
  const isMoneyMode = paymentMethod === "pix" || paymentMethod === "card";

  let subtotalBRL = totalBaseBRL + summary.upgradeFeeBRL;
  let finalBRL = subtotalBRL;
  let discountBRL = 0;

  if (appliedCoupon && isMoneyMode) {
    if (appliedCoupon.type === "percentage")
      discountBRL = subtotalBRL * (appliedCoupon.discount_value / 100);
    else if (appliedCoupon.type === "fixed")
      discountBRL = appliedCoupon.discount_value;
    else if (appliedCoupon.type === "bogo")
      discountBRL = subtotalBRL / summary.durationHours;

    if (discountBRL > subtotalBRL) discountBRL = subtotalBRL;
    finalBRL = subtotalBRL - discountBRL;
  }

  const hasEnoughCreditsNow = summary.currentBalance >= finalCredits;
  const dateFormatted = format(selectedDate, "dd 'de' MMMM, yyyy", {
    locale: ptBR,
  });
  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const timeFormatted = `${minutes}:${seconds.toString().padStart(2, "0")}`;

  return (
    <>
      <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm md:p-4 animate-in fade-in duration-200">
        <div
          className={`bg-white w-full max-w-4xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[100dvh] md:max-h-[95vh] ${step === "pix" || step === "success" || step === "error" ? "h-full md:h-auto md:rounded-2xl" : "rounded-2xl"}`}
        >
          {step === "confirm" && (
            <div className="px-6 py-2.5 flex items-center justify-center gap-2 bg-slate-100 border-b border-slate-200">
              <Clock className="w-4 h-4 text-slate-400" />
              <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">
                Tempo restante:{" "}
                <span className="font-black text-sm ml-1 text-slate-700">
                  {timeFormatted}
                </span>
              </p>
            </div>
          )}

          {step === "confirm" && (
            <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
              <h2 className="text-lg font-bold text-slate-900">
                Revisar Reserva
              </h2>
              <button
                onClick={handleAttemptClose}
                className="p-2 hover:bg-slate-100 text-slate-500 rounded-full transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          )}

          {step === "confirm" && (
            <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto">
              {/* LADO ESQUERDO */}
              <div className="p-6 md:p-8 bg-slate-50 border-b md:border-b-0 md:border-r border-slate-100 flex flex-col">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">
                  Detalhes do Espaço
                </h3>

                <div className="flex gap-4 mb-8">
                  <div className="w-20 h-20 rounded-xl overflow-hidden bg-slate-200 shrink-0 border border-slate-200">
                    <img
                      src={room.image_url || "/placeholder.jpg"}
                      alt={room.name}
                      className="w-full h-full object-cover"
                    />
                  </div>
                  <div className="flex flex-col justify-center">
                    <p className="text-xs font-bold text-[#BF4B24] uppercase tracking-wider mb-1">
                      {room.specialty || "Consultório"}
                    </p>
                    <h4 className="font-bold text-lg text-slate-900 leading-tight">
                      {room.name}
                    </h4>
                  </div>
                </div>

                <div className="space-y-4 flex-1">
                  <div className="flex items-start gap-3 mb-6">
                    <MapPin className="w-5 h-5 text-slate-400 mt-0.5 shrink-0" />
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        Localização
                      </p>
                      <p className="text-sm text-slate-600 mt-0.5">
                        {room.address_details?.street || "Endereço privado"}
                      </p>
                    </div>
                  </div>

                  {/* MÓDULO DE CUPOM */}
                  <div className="bg-white border border-slate-200 p-5 rounded-xl shadow-sm mb-6">
                    <h4 className="text-xs font-bold text-slate-900 flex items-center justify-between mb-3">
                      <span className="flex items-center gap-1.5">
                        <Ticket className="w-4 h-4 text-indigo-500" /> Possui um
                        Cupom?
                      </span>
                      {!isMoneyMode && (
                        <span className="text-[9px] uppercase tracking-widest text-slate-400 font-bold bg-slate-100 px-2 py-0.5 rounded">
                          Apenas Dinheiro
                        </span>
                      )}
                    </h4>

                    {!appliedCoupon ? (
                      <>
                        <div className="flex gap-2">
                          <Input
                            placeholder="Insira o código"
                            value={couponCode}
                            onChange={(e) =>
                              setCouponCode(e.target.value.toUpperCase())
                            }
                            className="h-10 bg-slate-50 border-slate-200 rounded-lg text-sm font-bold uppercase tracking-widest"
                          />
                          <Button
                            onClick={handleApplyCoupon}
                            disabled={isVerifyingCoupon || !couponCode}
                            className="h-10 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg px-4"
                          >
                            {isVerifyingCoupon ? (
                              <Loader2 className="w-4 h-4 animate-spin" />
                            ) : (
                              "Aplicar"
                            )}
                          </Button>
                        </div>
                        {couponFeedback && (
                          <p
                            className={`text-xs font-bold mt-2 ${couponFeedback.type === "error" ? "text-red-500" : "text-emerald-500"}`}
                          >
                            {couponFeedback.message}
                          </p>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center justify-between bg-emerald-50 border border-emerald-100 p-3 rounded-lg">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center">
                            <Percent className="w-4 h-4" />
                          </div>
                          <div>
                            <p className="text-xs font-black text-emerald-800">
                              {appliedCoupon.code}
                            </p>
                            <p className="text-[10px] font-bold text-emerald-600">
                              Cupom Aplicado!
                            </p>
                          </div>
                        </div>
                        <button
                          onClick={removeCoupon}
                          className="text-xs font-bold text-red-500 hover:underline"
                        >
                          Remover
                        </button>
                      </div>
                    )}
                  </div>

                  <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm">
                    <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                      <div className="flex items-center gap-2">
                        <CalendarIcon className="w-4 h-4 text-[#BF4B24]" />
                        <p className="font-bold text-slate-900 text-sm">
                          Data e Horários
                        </p>
                      </div>
                      <button
                        onClick={onClose}
                        className="text-xs font-bold text-[#BF4B24] hover:underline underline-offset-2"
                      >
                        Alterar Horas
                      </button>
                    </div>
                    <p className="text-sm font-bold text-slate-700 mb-3">
                      {dateFormatted}
                    </p>
                    <div className="flex flex-col gap-2">
                      {selectedSlots.map((slot) => {
                        const time = slot.split("|")[1];
                        return (
                          <div
                            key={slot}
                            className="flex items-center gap-2 bg-slate-50 border border-slate-100 px-3 py-2 rounded-lg w-fit"
                          >
                            <Clock className="w-3.5 h-3.5 text-slate-400" />
                            <span className="text-sm font-medium text-slate-600">
                              {time}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                    <p className="text-xs text-slate-400 mt-4 font-medium">
                      Total: {summary.durationHours} hora(s)
                    </p>
                  </div>
                </div>
              </div>

              {/* LADO DIREITO */}
              <div className="p-6 md:p-8 flex flex-col bg-white">
                <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">
                  Resumo de Compra
                </h3>

                <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-8">
                  {!isMoneyMode ? (
                    <div className="flex justify-between items-center">
                      <span className="text-sm font-medium text-slate-600">
                        Total a Pagar
                      </span>
                      <span className="text-sm font-black text-slate-900">
                        {finalCredits} CR
                      </span>
                    </div>
                  ) : (
                    <>
                      <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3">
                        <span className="text-sm font-medium text-slate-600">
                          Subtotal da Locação
                        </span>
                        <span className="text-sm font-bold text-slate-900">
                          R$ {totalBaseBRL.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                      {summary.upgradeFeeBRL > 0 && (
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3">
                          <span className="text-xs font-bold text-amber-600">
                            Taxa de Upgrade de Nível
                          </span>
                          <span className="text-xs font-bold text-amber-600">
                            + R${" "}
                            {summary.upgradeFeeBRL.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      )}
                      {appliedCoupon && (
                        <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3 text-emerald-600">
                          <span className="text-sm font-bold flex items-center gap-1.5">
                            <Ticket className="w-4 h-4" /> Desconto (
                            {appliedCoupon.code})
                          </span>
                          <span className="text-sm font-black">
                            - R$ {discountBRL.toFixed(2).replace(".", ",")}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between items-center pt-1">
                        <span className="text-sm font-black text-slate-900">
                          Total a Pagar
                        </span>
                        <span className="text-lg font-black text-slate-900">
                          R$ {finalBRL.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="mb-8 space-y-3 flex-1 overflow-y-auto pr-1">
                  <p className="text-sm font-bold text-slate-900">
                    Como você deseja pagar?
                  </p>

                  <div
                    onClick={() => handlePaymentSelect("wallet")}
                    className={`p-4 rounded-xl border-2 cursor-pointer flex flex-col gap-2 transition-all ${paymentMethod === "wallet" ? "bg-orange-50 border-[#BF4B24]" : "bg-white border-slate-200 hover:border-slate-300"}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Wallet
                          className={`w-5 h-5 ${paymentMethod === "wallet" ? "text-[#BF4B24]" : "text-slate-500"}`}
                        />
                        <div>
                          <p
                            className={`text-sm font-bold ${paymentMethod === "wallet" ? "text-[#BF4B24]" : "text-slate-700"}`}
                          >
                            Usar Créditos da Carteira
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            Saldo atual: {summary.currentBalance} CR
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "wallet" ? "border-[#BF4B24]" : "border-slate-300"}`}
                      >
                        {paymentMethod === "wallet" && (
                          <div className="w-2.5 h-2.5 bg-[#BF4B24] rounded-full" />
                        )}
                      </div>
                    </div>
                    {isCascading && paymentMethod === "wallet" && (
                      <div className="mt-1 bg-amber-100/50 border border-amber-200 p-2 rounded-lg flex items-start gap-2">
                        <ArrowDownRight className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                        <p className="text-[10px] font-bold text-amber-700 leading-tight">
                          Efeito Cascata: Utilizando seu saldo{" "}
                          <b className="uppercase">{usedTier}</b> para alugar
                          esta sala <b className="uppercase">{roomTier}</b>.
                        </p>
                      </div>
                    )}
                  </div>

                  <div
                    onClick={() => handlePaymentSelect("pix")}
                    className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-between transition-all ${paymentMethod === "pix" ? "bg-orange-50 border-[#BF4B24]" : "bg-white border-slate-200 hover:border-slate-300"}`}
                  >
                    <div className="flex items-center gap-3">
                      <QrCode
                        className={`w-5 h-5 ${paymentMethod === "pix" ? "text-[#BF4B24]" : "text-slate-500"}`}
                      />
                      <div>
                        <p
                          className={`text-sm font-bold ${paymentMethod === "pix" ? "text-[#BF4B24]" : "text-slate-700"}`}
                        >
                          Pix
                        </p>
                        <p className="text-xs font-medium text-slate-500">
                          Aprovação imediata
                        </p>
                      </div>
                    </div>
                    <div
                      className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "pix" ? "border-[#BF4B24]" : "border-slate-300"}`}
                    >
                      {paymentMethod === "pix" && (
                        <div className="w-2.5 h-2.5 bg-[#BF4B24] rounded-full" />
                      )}
                    </div>
                  </div>

                  <div
                    className={`border-2 rounded-xl transition-all overflow-hidden ${paymentMethod === "card" ? "bg-orange-50/30 border-[#BF4B24]" : "bg-white border-slate-200 hover:border-slate-300"}`}
                  >
                    <div
                      onClick={() => handlePaymentSelect("card")}
                      className="p-4 cursor-pointer flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <CreditCard
                          className={`w-5 h-5 ${paymentMethod === "card" ? "text-[#BF4B24]" : "text-slate-500"}`}
                        />
                        <div>
                          <p
                            className={`text-sm font-bold ${paymentMethod === "card" ? "text-[#BF4B24]" : "text-slate-700"}`}
                          >
                            Cartão de Crédito
                          </p>
                          <p className="text-xs font-medium text-slate-500">
                            Pagamento 100% Seguro
                          </p>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "card" ? "border-[#BF4B24]" : "border-slate-300"}`}
                      >
                        {paymentMethod === "card" && (
                          <div className="w-2.5 h-2.5 bg-[#BF4B24] rounded-full" />
                        )}
                      </div>
                    </div>

                    {paymentMethod === "card" && (
                      <div className="px-4 pb-4 animate-in slide-in-from-top-2">
                        {savedCardInfo ? (
                          // TELA DE CARTÃO SALVO (1-Click)
                          <div className="bg-white border border-slate-200 rounded-xl p-4 flex flex-col gap-3">
                            <div
                              className="flex items-center justify-between bg-slate-50 p-3 rounded-lg border border-slate-200 cursor-pointer"
                              onClick={() =>
                                setCardData((p) => ({
                                  ...p,
                                  useSavedCard: true,
                                }))
                              }
                            >
                              <div className="flex items-center gap-3">
                                <CreditCard className="w-5 h-5 text-slate-600" />
                                <div>
                                  <p className="text-sm font-bold text-slate-900">
                                    Cartão Final {savedCardInfo.last4}
                                  </p>
                                  <p className="text-xs font-bold text-slate-500 uppercase">
                                    {savedCardInfo.brand}
                                  </p>
                                </div>
                              </div>
                              <div
                                className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${cardData.useSavedCard ? "border-[#BF4B24]" : "border-slate-300"}`}
                              >
                                {cardData.useSavedCard && (
                                  <div className="w-2 h-2 bg-[#BF4B24] rounded-full" />
                                )}
                              </div>
                            </div>

                            <button
                              onClick={() => {
                                setSavedCardInfo(null);
                                setCardData((p) => ({
                                  ...p,
                                  useSavedCard: false,
                                }));
                              }}
                              className="text-xs font-bold text-[#BF4B24] hover:underline self-start"
                            >
                              Usar outro cartão
                            </button>
                          </div>
                        ) : (
                          // TELA DE NOVO CARTÃO (MÁSCARAS ATIVAS)
                          <div className="bg-white border border-[#BF4B24]/30 rounded-xl p-4 space-y-3">
                            <div className="space-y-1">
                              <Label className="text-xs font-bold text-slate-700">
                                Número do Cartão
                              </Label>
                              <Input
                                placeholder="0000 0000 0000 0000"
                                maxLength={19}
                                value={cardData.number}
                                onChange={(e) =>
                                  setCardData({
                                    ...cardData,
                                    number: formatCardNumber(e.target.value),
                                  })
                                }
                                className="h-10 bg-slate-50 rounded-lg font-mono text-sm"
                              />
                            </div>
                            <div className="space-y-1">
                              <Label className="text-xs font-bold text-slate-700">
                                Nome do Titular
                              </Label>
                              <Input
                                placeholder="NOME IMPRESSO NO CARTÃO"
                                value={cardData.name}
                                onChange={(e) =>
                                  setCardData({
                                    ...cardData,
                                    name: e.target.value.toUpperCase(),
                                  })
                                }
                                className="h-10 bg-slate-50 rounded-lg text-sm uppercase"
                              />
                            </div>
                            <div className="grid grid-cols-2 gap-3">
                              <div className="space-y-1">
                                <Label className="text-xs font-bold text-slate-700">
                                  Validade
                                </Label>
                                <Input
                                  placeholder="MM/AA"
                                  maxLength={5}
                                  value={cardData.expiry}
                                  onChange={(e) =>
                                    setCardData({
                                      ...cardData,
                                      expiry: formatExpiry(e.target.value),
                                    })
                                  }
                                  className="h-10 bg-slate-50 rounded-lg text-center font-mono"
                                />
                              </div>
                              <div className="space-y-1">
                                <Label className="text-xs font-bold text-slate-700">
                                  CVV
                                </Label>
                                <Input
                                  type="password"
                                  placeholder="123"
                                  maxLength={4}
                                  value={cardData.cvv}
                                  onChange={(e) =>
                                    setCardData({
                                      ...cardData,
                                      cvv: e.target.value.replace(/\D/g, ""),
                                    })
                                  }
                                  className="h-10 bg-slate-50 rounded-lg text-center font-mono"
                                />
                              </div>
                            </div>

                            {/* TOGGLE DE TITULARIDADE */}
                            <div className="flex items-center gap-2 mt-4 bg-slate-50 p-3 rounded-lg border border-slate-100">
                              <input
                                type="checkbox"
                                id="isMyCard"
                                checked={isMyCard}
                                onChange={(e) => setIsMyCard(e.target.checked)}
                                className="w-4 h-4 text-[#BF4B24] rounded border-slate-300"
                              />
                              <Label
                                htmlFor="isMyCard"
                                className="text-xs font-bold text-slate-700 cursor-pointer"
                              >
                                O cartão está em meu nome
                              </Label>
                            </div>

                            {/* CAMPOS DINÂMICOS PARA CARTÃO DE TERCEIROS */}
                            {!isMyCard && (
                              <div className="grid grid-cols-2 gap-3 p-3 bg-orange-50/50 border border-orange-100 rounded-lg animate-in fade-in zoom-in-95">
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                  <Label className="text-xs font-bold text-slate-700">
                                    CPF do Titular
                                  </Label>
                                  <Input
                                    placeholder="000.000.000-00"
                                    maxLength={14}
                                    value={cardData.cpf}
                                    onChange={(e) =>
                                      setCardData({
                                        ...cardData,
                                        cpf: formatCPF(e.target.value),
                                      })
                                    }
                                    className="h-10 bg-white rounded-lg font-mono text-sm"
                                  />
                                </div>
                                <div className="space-y-1 col-span-2 sm:col-span-1">
                                  <Label className="text-xs font-bold text-slate-700">
                                    CEP da Fatura
                                  </Label>
                                  <Input
                                    placeholder="00000-000"
                                    maxLength={9}
                                    value={cardData.cep}
                                    onChange={(e) =>
                                      setCardData({
                                        ...cardData,
                                        cep: formatCEP(e.target.value),
                                      })
                                    }
                                    className="h-10 bg-white rounded-lg font-mono text-sm"
                                  />
                                </div>
                              </div>
                            )}

                            {/* OPÇÃO SALVAR CARTÃO */}
                            <div className="flex items-center gap-2 mt-2 bg-slate-50 p-3 rounded-lg border border-slate-100">
                              <input
                                type="checkbox"
                                id="saveCard"
                                checked={cardData.saveCard}
                                onChange={(e) =>
                                  setCardData({
                                    ...cardData,
                                    saveCard: e.target.checked,
                                  })
                                }
                                className="w-4 h-4 text-[#BF4B24] rounded border-slate-300"
                              />
                              <Label
                                htmlFor="saveCard"
                                className="text-xs font-bold text-slate-700 cursor-pointer"
                              >
                                Salvar cartão para compras futuras com 1 clique
                              </Label>
                            </div>

                            <div className="flex items-center gap-1.5 justify-center mt-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 py-1.5 rounded-md">
                              <ShieldCheck className="w-3 h-3" /> Processado com
                              segurança pelo Asaas (PCI Compliant)
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-auto shrink-0 pt-4">
                  {paymentMethod === "wallet" && !hasEnoughCreditsNow ? (
                    <div className="space-y-3">
                      <p className="text-xs font-bold text-red-600 text-center bg-red-50 py-2 rounded-lg">
                        Você precisa de {finalCredits} créditos para usar a
                        carteira.
                      </p>
                      <Button
                        onClick={onClose}
                        className="w-full h-12 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white shadow-md"
                      >
                        Recarregar Carteira
                      </Button>
                    </div>
                  ) : (
                    <Button
                      onClick={handleSubmitWrapper}
                      disabled={loading || timeLeft === 0}
                      className="w-full h-14 rounded-xl font-black bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-md transition-all text-base disabled:opacity-50"
                    >
                      {loading ? (
                        <Loader2 className="w-5 h-5 animate-spin" />
                      ) : paymentMethod === "wallet" ? (
                        <>
                          Confirmar Reserva{" "}
                          <CheckCircle2 className="w-5 h-5 ml-2" />
                        </>
                      ) : paymentMethod === "pix" ? (
                        <>
                          Gerar Pix de R${" "}
                          {finalBRL.toFixed(2).replace(".", ",")}{" "}
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      ) : (
                        <>
                          <Lock className="w-4 h-4 mr-2" /> Pagar R${" "}
                          {finalBRL.toFixed(2).replace(".", ",")}{" "}
                          <ArrowRight className="w-5 h-5 ml-2" />
                        </>
                      )}
                    </Button>
                  )}
                </div>
              </div>
            </div>
          )}

          {step === "pix" && pixCopyPaste && (
            <div className="flex flex-col w-full h-full bg-white relative">
              <div className="md:hidden flex flex-col items-center px-6 pt-12 pb-8 h-full justify-between">
                <button
                  onClick={handleAttemptClose}
                  className="absolute top-6 left-6 p-2 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X className="w-7 h-7" />
                </button>
                <div className="flex flex-col items-center text-center w-full mt-10">
                  <div className="w-16 h-16 bg-[#BF4B24]/10 rounded-2xl flex items-center justify-center mb-6">
                    <QrCode className="w-8 h-8 text-[#BF4B24]" />
                  </div>
                  <h2 className="text-3xl font-black text-slate-900 tracking-tight mb-3">
                    Pagar R$ {finalBRL.toFixed(2).replace(".", ",")} com Pix
                  </h2>
                  <p className="text-slate-500 font-medium text-sm mb-10 px-4 leading-relaxed">
                    Copie e cole o código abaixo para pagar com o aplicativo do
                    seu banco.
                  </p>
                  <div className="w-full relative mb-4">
                    <input
                      readOnly
                      value={pixCopyPaste}
                      className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl text-sm font-semibold text-slate-600 px-5 py-4 outline-none truncate shadow-sm text-center"
                    />
                    <div className="absolute bottom-0 left-6 right-6 h-0.5 bg-[#BF4B24] rounded-t-full shadow-[0_0_8px_#BF4B24]"></div>
                  </div>
                  <p className="text-xs font-bold text-slate-400 mb-8">
                    Vence em {timeFormatted}
                  </p>
                  <div className="flex items-center gap-2 text-xs font-bold text-amber-600 bg-amber-50 px-4 py-2.5 rounded-lg border border-amber-200">
                    <Loader2 className="w-4 h-4 animate-spin shrink-0" />
                    Aguardando confirmação do banco...
                  </div>
                </div>
                <div className="w-full mt-auto pt-8 pb-4">
                  <Button
                    onClick={() => handleRobustCopy(pixCopyPaste)}
                    className="w-full h-16 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-2xl text-lg flex items-center justify-center gap-2 shadow-xl active:scale-95 transition-all"
                  >
                    {copied ? (
                      <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                    ) : (
                      <Copy className="w-6 h-6" />
                    )}
                    {copied ? "Código Copiado!" : "Copiar código Pix"}
                  </Button>
                </div>
              </div>
              <div className="hidden md:flex p-12 flex-col items-center text-center">
                <button
                  onClick={handleAttemptClose}
                  className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
                <h2 className="text-3xl font-black text-slate-900 mb-2">
                  Pague com PIX
                </h2>
                <p className="text-slate-500 font-medium max-w-sm mb-8">
                  Escaneie o QR Code abaixo com o aplicativo do seu banco para
                  liberar a sua reserva agora mesmo.
                </p>
                <div className="bg-white p-6 rounded-3xl shadow-lg border-2 border-slate-100 mb-8 relative overflow-hidden">
                  <div className="absolute top-0 left-0 w-full h-2 bg-[#BF4B24]"></div>
                  {pixQrCode && (
                    <img
                      src={`data:image/png;base64,${pixQrCode}`}
                      alt="QR Code PIX"
                      className="w-56 h-56 object-contain"
                    />
                  )}
                </div>
                <div className="w-full max-w-md mb-8">
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2 text-left ml-1">
                    PIX Copia e Cola
                  </span>
                  <div className="flex bg-slate-50 rounded-xl border border-slate-200 overflow-hidden h-14">
                    <input
                      type="text"
                      readOnly
                      value={pixCopyPaste}
                      className="flex-1 bg-transparent text-sm font-medium text-slate-600 px-4 outline-none truncate"
                    />
                    <button
                      onClick={() => handleRobustCopy(pixCopyPaste)}
                      className="px-6 bg-slate-200 hover:bg-slate-300 transition-colors flex items-center justify-center shrink-0"
                    >
                      {copied ? (
                        <Check className="w-5 h-5 text-emerald-600" />
                      ) : (
                        <Copy className="w-5 h-5 text-slate-600" />
                      )}
                    </button>
                  </div>
                </div>
                <div className="flex items-center gap-3 text-sm font-bold text-amber-600 bg-amber-50 px-6 py-3 rounded-xl border border-amber-200 shadow-sm">
                  <Loader2 className="w-5 h-5 animate-spin shrink-0" />
                  <span>
                    Vence em {timeFormatted} - Aguardando pagamento...
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* TELA DE ERRO DEDICADA */}
          {step === "error" && (
            <div className="flex flex-col h-full bg-white relative justify-center items-center px-6 py-12 md:py-20 animate-in zoom-in-95 duration-300">
              <button
                onClick={onClose}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="w-24 h-24 bg-red-100 rounded-full flex items-center justify-center mb-6 shadow-inner">
                <XCircle className="w-12 h-12 text-red-600" />
              </div>
              <h2 className="text-3xl font-black text-slate-900 mb-3 text-center">
                Pagamento não aprovado
              </h2>

              <div className="bg-red-50 border border-red-100 p-4 rounded-xl mb-8 w-full max-w-sm">
                <div className="flex items-start gap-3">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <p className="text-sm font-medium text-red-800 leading-relaxed">
                    {errorMessage ||
                      "Houve um problema com a autorização do seu pagamento. Verifique seus dados ou contate o banco."}
                  </p>
                </div>
              </div>

              <div className="flex flex-col w-full max-w-xs gap-3">
                <Button
                  onClick={() => setStep("confirm")}
                  className="w-full h-14 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl text-lg shadow-md transition-all active:scale-95"
                >
                  Tentar outro cartão
                </Button>
                <Button
                  variant="ghost"
                  onClick={onClose}
                  className="w-full h-12 text-slate-500 font-bold rounded-xl hover:bg-slate-100"
                >
                  Cancelar reserva
                </Button>
              </div>
            </div>
          )}

          {/* RECIBO DIGITAL: SUCESSO PERSISTENTE */}
          {step === "success" && (
            <div className="flex flex-col h-full bg-white relative items-center px-6 py-10 md:py-16 animate-in zoom-in-95 duration-300 overflow-y-auto">
              <button
                onClick={onClose}
                className="absolute top-6 right-6 p-2 text-slate-400 hover:text-slate-900 transition-colors"
              >
                <X className="w-6 h-6" />
              </button>

              <div className="w-20 h-20 bg-emerald-100 rounded-full flex items-center justify-center mb-6 shadow-inner shrink-0">
                <CheckCircle2 className="w-10 h-10 text-emerald-600" />
              </div>

              <h2 className="text-2xl md:text-3xl font-black text-slate-900 mb-2 text-center">
                Tudo Certo!
              </h2>
              <p className="text-slate-500 font-medium max-w-sm mb-8 text-center leading-relaxed">
                Pagamento confirmado. O seu horário já está bloqueado no sistema
                e garantido para você.
              </p>

              {/* Recibo da Reserva */}
              <div className="w-full max-w-sm bg-slate-50 border border-slate-200 rounded-2xl p-5 mb-8 shadow-sm">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-wider mb-4">
                  Comprovante de Reserva
                </h3>

                <div className="space-y-4">
                  <div className="flex justify-between items-start pb-4 border-b border-slate-200/60">
                    <span className="text-sm font-bold text-slate-500">
                      Espaço
                    </span>
                    <span className="text-sm font-black text-slate-900 text-right max-w-[180px]">
                      {room.name}
                    </span>
                  </div>

                  <div className="flex justify-between items-start pb-4 border-b border-slate-200/60">
                    <span className="text-sm font-bold text-slate-500">
                      Data
                    </span>
                    <div className="text-right">
                      <span className="text-sm font-black text-slate-900 block">
                        {dateFormatted}
                      </span>
                      <span className="text-xs font-bold text-[#BF4B24] mt-1 block">
                        {summary.durationHours} hora(s) reservada(s)
                      </span>
                    </div>
                  </div>

                  <div className="flex justify-between items-center">
                    <span className="text-sm font-bold text-slate-500">
                      Valor Pago
                    </span>
                    <span className="text-lg font-black text-emerald-600">
                      R$ {finalBRL.toFixed(2).replace(".", ",")}
                    </span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => {
                  onClose();
                  router.push("/dashboard");
                }}
                className="w-full max-w-sm h-14 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl text-lg shadow-md transition-all active:scale-95"
              >
                Ver na minha agenda <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </div>
          )}

          {showCloseConfirm && (
            <div className="absolute inset-0 z-[400] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in">
              <div className="bg-white rounded-3xl p-6 w-full max-w-sm text-center shadow-2xl animate-in zoom-in-95">
                <h3 className="text-xl font-black text-slate-900 mb-2">
                  Cancelar pagamento?
                </h3>
                <p className="text-sm font-medium text-slate-500 mb-6">
                  Se já efetuou o pagamento no seu banco, aguarde alguns
                  segundos nesta tela. A confirmação é automática.
                </p>
                <div className="flex flex-col gap-3">
                  <Button
                    onClick={() => setShowCloseConfirm(false)}
                    className="w-full h-12 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold rounded-xl"
                  >
                    Continuar aguardando
                  </Button>
                  <Button
                    onClick={onClose}
                    variant="ghost"
                    className="w-full h-12 text-slate-500 font-bold rounded-xl hover:bg-slate-100"
                  >
                    Sim, cancelar reserva
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
