"use client";

import { useState, useEffect } from "react";
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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export interface CheckoutSummary {
  durationHours: number;
  creditsRequired: number;
  upgradeFeeBRL: number;
  hasEnoughCredits: boolean;
  currentBalance: number;
  canProceed: boolean;
}

interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (paymentMethod: "wallet" | "pix" | "card") => void;
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
  const [paymentMethod, setPaymentMethod] = useState<"wallet" | "pix" | "card">(
    "wallet",
  );

  // ==========================================
  // ARQUITETURA SÊNIOR: SMART MODAL HISTORY
  // Ensina o Android a fechar o modal corretamente no botão voltar
  // ==========================================
  useEffect(() => {
    if (isOpen) {
      // 1. Quando o modal abre, empurramos "/checkout" na URL (invisível)
      window.history.pushState(
        { modal: "checkout" },
        "",
        window.location.hash + "/checkout",
      );

      const handlePop = () => {
        // 2. Se o usuário apertar o botão físico do Android, disparamos o fechamento do React
        onClose();
      };

      window.addEventListener("popstate", handlePop);

      return () => {
        window.removeEventListener("popstate", handlePop);
        // 3. O SEGREDO: Se o modal foi fechado no botão "X" ou finalizou a compra,
        // mas a URL ainda tem a sujeira do "checkout", nós forçamos a limpeza da linha do tempo!
        if (window.history.state?.modal === "checkout") {
          window.history.back();
        }
      };
    }
  }, [isOpen, onClose]);

  if (!isOpen || !summary || !room) return null;

  const dateFormatted = format(selectedDate, "dd 'de' MMMM, yyyy", {
    locale: ptBR,
  });

  const totalBRL = totalBaseBRL + summary.upgradeFeeBRL;

  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-slate-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="bg-white w-full max-w-4xl rounded-2xl shadow-2xl flex flex-col overflow-hidden animate-in zoom-in-95 duration-300 max-h-[95vh]">
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
                <p className="text-xs font-bold text-[#f05e23] uppercase tracking-wider mb-1">
                  {room.specialty || "Consultório"}
                </p>
                <h4 className="font-bold text-lg text-slate-900 leading-tight">
                  {room.name}
                </h4>
              </div>
            </div>

            <div className="space-y-4 flex-1">
              <div className="flex items-start gap-3">
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

              <div className="bg-white border border-slate-200 p-4 rounded-xl shadow-sm mt-4">
                <div className="flex justify-between items-start mb-3 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="w-4 h-4 text-[#f05e23]" />
                    <p className="font-bold text-slate-900 text-sm">
                      Data e Horários
                    </p>
                  </div>
                  <button
                    onClick={onClose}
                    className="text-xs font-bold text-[#f05e23] hover:underline underline-offset-2"
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
              <div className="flex justify-between items-center pb-3 border-b border-slate-200 mb-3">
                <span className="text-sm font-medium text-slate-600">
                  Total em Créditos
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {summary.creditsRequired} CR
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium text-slate-600">
                  Equivalente em Dinheiro
                </span>
                <span className="text-sm font-bold text-slate-900">
                  R$ {totalBRL.toFixed(2).replace(".", ",")}
                </span>
              </div>
              {summary.upgradeFeeBRL > 0 && (
                <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-center">
                  <span className="text-xs font-bold text-amber-600">
                    Taxa de Upgrade Inclusa
                  </span>
                  <span className="text-xs font-bold text-amber-600">
                    + R$ {summary.upgradeFeeBRL.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              )}
            </div>

            <div className="mb-8 space-y-3">
              <p className="text-sm font-bold text-slate-900">
                Como você deseja pagar?
              </p>

              <div
                onClick={() => setPaymentMethod("wallet")}
                className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-between transition-all ${paymentMethod === "wallet" ? "bg-orange-50 border-[#f05e23]" : "bg-white border-slate-200 hover:border-slate-300"}`}
              >
                <div className="flex items-center gap-3">
                  <Wallet
                    className={`w-5 h-5 ${paymentMethod === "wallet" ? "text-[#f05e23]" : "text-slate-500"}`}
                  />
                  <div>
                    <p
                      className={`text-sm font-bold ${paymentMethod === "wallet" ? "text-[#f05e23]" : "text-slate-700"}`}
                    >
                      Usar Créditos da Carteira
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      Saldo atual: {summary.currentBalance} CR
                    </p>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "wallet" ? "border-[#f05e23]" : "border-slate-300"}`}
                >
                  {paymentMethod === "wallet" && (
                    <div className="w-2.5 h-2.5 bg-[#f05e23] rounded-full" />
                  )}
                </div>
              </div>

              <div
                onClick={() => setPaymentMethod("pix")}
                className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-between transition-all ${paymentMethod === "pix" ? "bg-orange-50 border-[#f05e23]" : "bg-white border-slate-200 hover:border-slate-300"}`}
              >
                <div className="flex items-center gap-3">
                  <QrCode
                    className={`w-5 h-5 ${paymentMethod === "pix" ? "text-[#f05e23]" : "text-slate-500"}`}
                  />
                  <div>
                    <p
                      className={`text-sm font-bold ${paymentMethod === "pix" ? "text-[#f05e23]" : "text-slate-700"}`}
                    >
                      Pix
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      Aprovação imediata
                    </p>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "pix" ? "border-[#f05e23]" : "border-slate-300"}`}
                >
                  {paymentMethod === "pix" && (
                    <div className="w-2.5 h-2.5 bg-[#f05e23] rounded-full" />
                  )}
                </div>
              </div>

              <div
                onClick={() => setPaymentMethod("card")}
                className={`p-4 rounded-xl border-2 cursor-pointer flex items-center justify-between transition-all ${paymentMethod === "card" ? "bg-orange-50 border-[#f05e23]" : "bg-white border-slate-200 hover:border-slate-300"}`}
              >
                <div className="flex items-center gap-3">
                  <CreditCard
                    className={`w-5 h-5 ${paymentMethod === "card" ? "text-[#f05e23]" : "text-slate-500"}`}
                  />
                  <div>
                    <p
                      className={`text-sm font-bold ${paymentMethod === "card" ? "text-[#f05e23]" : "text-slate-700"}`}
                    >
                      Cartão de Crédito
                    </p>
                    <p className="text-xs font-medium text-slate-500">
                      Até 3x sem juros
                    </p>
                  </div>
                </div>
                <div
                  className={`w-5 h-5 rounded-full border-2 flex items-center justify-center ${paymentMethod === "card" ? "border-[#f05e23]" : "border-slate-300"}`}
                >
                  {paymentMethod === "card" && (
                    <div className="w-2.5 h-2.5 bg-[#f05e23] rounded-full" />
                  )}
                </div>
              </div>
            </div>

            <div className="mt-auto">
              {paymentMethod === "wallet" && !summary.hasEnoughCredits ? (
                <div className="space-y-3">
                  <p className="text-xs font-bold text-red-600 text-center bg-red-50 py-2 rounded-lg">
                    Você precisa de {summary.creditsRequired} créditos para usar
                    a carteira.
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
                  onClick={() => onConfirm(paymentMethod)}
                  disabled={loading}
                  className="w-full h-14 rounded-xl font-black bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-md transition-all text-base"
                >
                  {loading ? (
                    "Processando..."
                  ) : paymentMethod === "wallet" ? (
                    <>
                      Confirmar com Carteira{" "}
                      <CheckCircle2 className="w-5 h-5 ml-2" />
                    </>
                  ) : paymentMethod === "pix" ? (
                    <>
                      Gerar Pix de R$ {totalBRL.toFixed(2).replace(".", ",")}{" "}
                      <ArrowRight className="w-5 h-5 ml-2" />
                    </>
                  ) : (
                    <>
                      Pagar R$ {totalBRL.toFixed(2).replace(".", ",")}{" "}
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
