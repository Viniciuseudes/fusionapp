"use client";

import { useState, useEffect } from "react";
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
  Loader2,
  Percent,
  ArrowDownRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (
    paymentMethod: "wallet" | "pix" | "card",
    appliedCoupon?: any,
  ) => void;
  loading: boolean;
  summary: CheckoutSummary | null;
  room: any;
  selectedSlots: string[];
  selectedDate: Date;
  totalBaseBRL: number;
}

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
}: CheckoutModalProps) {
  const { toast } = useToast();
  const supabase = createClient();

  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "pix" | "card">(
    "wallet",
  );
  const [timeLeft, setTimeLeft] = useState(5 * 60);

  // Estados do Motor de Cupons
  const [couponCode, setCouponCode] = useState("");
  const [isVerifyingCoupon, setIsVerifyingCoupon] = useState(false);
  const [appliedCoupon, setAppliedCoupon] = useState<any | null>(null);
  const [couponFeedback, setCouponFeedback] = useState<{
    message: string;
    type: "error" | "success";
  } | null>(null);

  // 1. Escudo PWA (Android Back Button)
  useEffect(() => {
    if (isOpen) {
      window.history.pushState(
        { modal: "checkout" },
        "",
        window.location.hash + "/checkout",
      );
      const handlePop = () => onClose();
      window.addEventListener("popstate", handlePop);

      return () => {
        window.removeEventListener("popstate", handlePop);
        if (window.history.state?.modal === "checkout") {
          window.history.back();
        }
      };
    }
  }, [isOpen, onClose]);

  // ==========================================
  // ARQUITETURA DE CRONÔMETRO REACT 18 (SEM BUGS)
  // ==========================================

  // 2. Sempre que abrir, reseta tudo e prepara o terreno
  useEffect(() => {
    if (isOpen) {
      setTimeLeft(5 * 60);
      setAppliedCoupon(null);
      setCouponCode("");
      setCouponFeedback(null);
      setPaymentMethod("wallet");
    }
  }, [isOpen]);

  // 3. O Relógio (Apenas diminui o número, puramente)
  useEffect(() => {
    if (!isOpen) return;

    const timer = setInterval(() => {
      setTimeLeft((prev) => (prev > 0 ? prev - 1 : 0));
    }, 1000);

    return () => clearInterval(timer);
  }, [isOpen]);

  // 4. O Fiscalizador (Escuta o tempo e dispara ações colaterais de forma segura)
  useEffect(() => {
    if (isOpen && timeLeft === 0) {
      onClose();
      toast({
        title: "Tempo de compra esgotado",
        description: "Os horários foram liberados para outros usuários.",
      });
    }
  }, [isOpen, timeLeft, onClose, toast]);

  // ==========================================
  // LÓGICA DE VALIDAÇÃO DO CUPOM
  // ==========================================
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

      if (coupon.valid_until && new Date(coupon.valid_until) < new Date()) {
        throw new Error("Este cupom já expirou.");
      }

      if (coupon.max_uses && coupon.current_uses >= coupon.max_uses) {
        throw new Error("Este cupom atingiu o limite de utilizações.");
      }

      if (coupon.valid_room_ids && coupon.valid_room_ids.length > 0) {
        if (!coupon.valid_room_ids.includes(room.id)) {
          throw new Error("Este cupom não é válido para esta sala.");
        }
      }

      if (coupon.type === "bogo" && selectedSlots.length < 2) {
        throw new Error(
          "O cupom 'Leve 2' exige no mínimo 2 horas selecionadas.",
        );
      }

      setAppliedCoupon(coupon);
      setCouponFeedback({
        message: "Desconto aplicado com sucesso!",
        type: "success",
      });

      // SÊNIOR: Se aplicou cupom mas estava em "Wallet", muda pra PIX automaticamente
      if (paymentMethod === "wallet") {
        setPaymentMethod("pix");
        toast({
          title: "Pagamento Alterado",
          description:
            "Cupons são válidos apenas para pagamentos em dinheiro. Selecionamos o Pix para você.",
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

  // SÊNIOR: Troca de Pagamento Inteligente
  const handlePaymentSelect = (method: "wallet" | "pix" | "card") => {
    if (method === "wallet" && appliedCoupon) {
      removeCoupon();
      toast({
        title: "Cupom Removido",
        description:
          "Não é possível aplicar cupons em pagamentos com Créditos (Horas) da carteira.",
      });
    }
    setPaymentMethod(method);
  };

  if (!isOpen || !summary || !room) return null;

  // Lógica do Efeito Cascata
  const getTierWeight = (tier: string) => {
    const t = tier.toLowerCase();
    if (t === "master") return 3;
    if (t === "vip") return 2;
    return 1;
  };

  const roomTier = room.tier || "start";
  const usedTier = summary.usedTier || "start";
  const isCascading = getTierWeight(usedTier) > getTierWeight(roomTier);

  // RECÁLCULO SEPARANDO MUNDOS: CR vs BRL
  const finalCredits = summary.creditsRequired; // Em CR, nunca tem desconto
  const isMoneyMode = paymentMethod === "pix" || paymentMethod === "card";

  let subtotalBRL = totalBaseBRL + summary.upgradeFeeBRL;
  let finalBRL = subtotalBRL;
  let discountBRL = 0;

  if (appliedCoupon && isMoneyMode) {
    if (appliedCoupon.type === "percentage") {
      discountBRL = subtotalBRL * (appliedCoupon.discount_value / 100);
    } else if (appliedCoupon.type === "fixed") {
      discountBRL = appliedCoupon.discount_value;
    } else if (appliedCoupon.type === "bogo") {
      // Valor proporcional de 1 hora
      discountBRL = subtotalBRL / summary.durationHours;
    }

    if (discountBRL > subtotalBRL) discountBRL = subtotalBRL; // Impede valor negativo
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
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh]">
        <div className="px-6 py-2.5 flex items-center justify-center gap-2 bg-slate-100 border-b border-slate-200">
          <Clock className="w-4 h-4 text-slate-400" />
          <p className="text-xs font-bold text-slate-500 tracking-widest uppercase">
            Tempo restante para concluir:{" "}
            <span className="font-black text-sm ml-1 text-slate-700">
              {timeFormatted}
            </span>
          </p>
        </div>

        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between bg-white">
          <h2 className="text-lg font-bold text-slate-900">Revisar Reserva</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-slate-100 text-slate-500 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 overflow-y-auto">
          {/* LADO ESQUERDO: DETALHES DA SALA E CUPOM */}
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
                  <p className="text-sm text-slate-600">
                    {room.address_details?.city}
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

          {/* LADO DIREITO: RESUMO E PAGAMENTO */}
          <div className="p-6 md:p-8 flex flex-col bg-white">
            <h3 className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-6">
              Resumo de Compra
            </h3>

            {/* RESUMO DINÂMICO (Muda dependendo se é Carteira ou Dinheiro) */}
            <div className="bg-slate-50 border border-slate-100 rounded-xl p-4 mb-8">
              {!isMoneyMode ? (
                // MODO CARTEIRA (CR)
                <div className="flex justify-between items-center">
                  <span className="text-sm font-medium text-slate-600">
                    Total a Pagar
                  </span>
                  <span className="text-sm font-black text-slate-900">
                    {finalCredits} CR
                  </span>
                </div>
              ) : (
                // MODO DINHEIRO (R$)
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

            <div className="mb-8 space-y-3">
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

                {/* ALERTA DE EFEITO CASCATA */}
                {isCascading && paymentMethod === "wallet" && (
                  <div className="mt-1 bg-amber-100/50 border border-amber-200 p-2 rounded-lg flex items-start gap-2">
                    <ArrowDownRight className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                    <p className="text-[10px] font-bold text-amber-700 leading-tight">
                      Efeito Cascata: Utilizando seu saldo{" "}
                      <b className="uppercase">{usedTier}</b> para alugar esta
                      sala <b className="uppercase">{roomTier}</b>.
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
                onClick={() => handlePaymentSelect("card")}
                className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-between transition-all ${paymentMethod === "card" ? "bg-orange-50 border-[#BF4B24]" : "bg-white border-slate-200 hover:border-slate-300"}`}
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
                      Até 3x sem juros
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
            </div>

            <div className="mt-auto">
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
                  onClick={() => onConfirm(paymentMethod, appliedCoupon)}
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
                      Gerar Pix de R$ {finalBRL.toFixed(2).replace(".", ",")}{" "}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  ) : (
                    <>
                      Pagar R$ {finalBRL.toFixed(2).replace(".", ",")}{" "}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  )}
                </Button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
