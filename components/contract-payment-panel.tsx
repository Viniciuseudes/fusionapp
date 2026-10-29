// components/contract-payment-panel.tsx
"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  FileText,
  QrCode,
  Barcode,
  CreditCard,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  ExternalLink,
  Loader2,
  Calendar,
  Sparkles,
  Lock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  getDaysInMonth,
  differenceInCalendarDays,
  parseISO,
  format,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

function parseSched(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? { ...raw } : {};
}

export function ContractPaymentPanel({ userId }: { userId?: string }) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [contracts, setContracts] = useState<any[]>([]);
  const [roomsMap, setRoomsMap] = useState<Map<string, string>>(new Map());
  const [profile, setProfile] = useState<any>(null);

  const [selectedCompetence, setSelectedCompetence] = useState<string>(() =>
    format(new Date(), "yyyy-MM"),
  );

  // Estados do Modal de Checkout do Contrato
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [activeContract, setActiveContract] = useState<any>(null);
  const [billingMethod, setBillingMethod] = useState<
    "PIX" | "BOLETO" | "CREDIT_CARD"
  >("PIX");
  const [processing, setProcessing] = useState(false);

  // Dados gerados no Asaas
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [boletoLine, setBoletoLine] = useState<string | null>(null);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);

  // Dados do Cartão / Titular
  const [customerCpf, setCustomerCpf] = useState("");
  const [customerCep, setCustomerCep] = useState("");
  const [holderName, setHolderName] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [expiryMonth, setExpiryMonth] = useState("");
  const [expiryYear, setExpiryYear] = useState("");
  const [ccv, setCcv] = useState("");

  const fetchUserContracts = useCallback(async () => {
    setLoading(true);
    try {
      let targetUid = userId;
      if (!targetUid) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        targetUid = user?.id;
      }
      if (!targetUid) {
        setLoading(false);
        return;
      }

      const [profRes, contractsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, full_name, email, cpf, cep, cc_last4, cc_brand, cc_token",
          )
          .eq("id", targetUid)
          .maybeSingle(),
        supabase
          .from("room_contracts")
          .select("*")
          .eq("specialist_id", targetUid)
          .eq("status", "active")
          .order("created_at", { ascending: false }),
      ]);

      if (profRes.data) {
        setProfile(profRes.data);
        setCustomerCpf(profRes.data.cpf || "");
        setCustomerCep(profRes.data.cep || "");
        setHolderName(profRes.data.full_name || "");
      }

      const activeList = contractsRes.data || [];
      setContracts(activeList);

      const rIds = [
        ...new Set(activeList.map((c: any) => c.room_id).filter(Boolean)),
      ];
      if (rIds.length > 0) {
        const { data: rData } = await supabase
          .from("rooms")
          .select("id, name")
          .in("id", rIds);
        setRoomsMap(
          new Map(
            (rData || []).map((r: any) => [r.id, r.name || "Consultório"]),
          ),
        );
      }
    } catch (err) {
      console.error("Erro ao carregar contratos do profissional:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, userId]);

  useEffect(() => {
    fetchUserContracts();
  }, [fetchUserContracts]);

  // Polling automático quando um QR Code PIX estiver aberto na tela
  useEffect(() => {
    if (!checkoutOpen || !paymentId || !activeContract) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/contracts/payment?contractId=${activeContract.id}&competence=${selectedCompetence}&paymentId=${paymentId}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.confirmed) {
            clearInterval(timer);
            toast({
              title: "Mensalidade Paga com Sucesso!",
              description: `A competência ${selectedCompetence} foi baixada automaticamente.`,
            });
            setCheckoutOpen(false);
            setPaymentId(null);
            fetchUserContracts();
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(timer);
  }, [
    checkoutOpen,
    paymentId,
    activeContract,
    selectedCompetence,
    toast,
    fetchUserContracts,
  ]);

  const computeInvoicePreview = (contract: any, competence: string) => {
    const sched = parseSched(contract.schedule_config);
    const baseValue =
      Number(contract.contract_value) > 0
        ? Number(contract.contract_value)
        : Number(contract.session_value || 0);

    const dueDayRaw = Math.max(1, Math.min(31, Number(contract.due_day) || 8));
    const [yearStr, monthStr] = competence.split("-");
    const maxDays = getDaysInMonth(
      new Date(Number(yearStr), Number(monthStr) - 1, 1),
    );
    const safeDay = String(Math.min(dueDayRaw, maxDays)).padStart(2, "0");
    const dueDateIso = `${competence}-${safeDay}`;

    const finePct = Number(sched.fine_pct ?? contract.fine_pct ?? 2);
    const interestPct = Number(
      sched.interest_pct ?? contract.interest_pct ?? 1,
    );

    const isPaid =
      contract.last_paid_competence === competence ||
      Boolean(sched.paid_dates && sched.paid_dates[competence]);

    const paidDateStr =
      sched.paid_dates && sched.paid_dates[competence]
        ? sched.paid_dates[competence]
        : null;

    const daysLate = Math.max(
      0,
      differenceInCalendarDays(new Date(), parseISO(`${dueDateIso}T23:59:59`)),
    );

    let fineBrl = 0;
    let interestBrl = 0;
    if (!isPaid && daysLate > 0 && baseValue > 0) {
      if (finePct > 0)
        fineBrl = Number((baseValue * (finePct / 100)).toFixed(2));
      if (interestPct > 0) {
        interestBrl = Number(
          (baseValue * (interestPct / 100 / 30) * daysLate).toFixed(2),
        );
      }
    }

    const totalBrl = Number((baseValue + fineBrl + interestBrl).toFixed(2));

    return {
      baseValue,
      dueDateIso,
      finePct,
      interestPct,
      daysLate,
      isPaid,
      paidDateStr,
      isOverdue: !isPaid && daysLate > 0,
      fineBrl,
      interestBrl,
      totalBrl,
    };
  };

  const handleOpenPaymentModal = (
    contract: any,
    method: "PIX" | "BOLETO" | "CREDIT_CARD",
  ) => {
    setActiveContract(contract);
    setBillingMethod(method);
    setPaymentId(null);
    setPixQrCode(null);
    setPixCopyPaste(null);
    setBoletoLine(null);
    setBoletoUrl(null);
    setCheckoutOpen(true);
  };

  const handleGenerateOrPay = async () => {
    if (!activeContract) return;
    setProcessing(true);

    try {
      const payload: Record<string, any> = {
        contractId: activeContract.id,
        competence: selectedCompetence,
        billingType: billingMethod,
        customerCpf,
        customerCep,
      };

      if (billingMethod === "CREDIT_CARD") {
        if (!cardNumber || !holderName || !expiryMonth || !expiryYear || !ccv) {
          throw new Error("Preencha todos os dados do cartão de crédito.");
        }
        payload.creditCard = {
          holderName,
          number: cardNumber.replace(/\D/g, ""),
          expiryMonth: expiryMonth.replace(/\D/g, ""),
          expiryYear: expiryYear.length === 2 ? `20${expiryYear}` : expiryYear,
          ccv: ccv.replace(/\D/g, ""),
        };
        payload.cardData = {
          cpf: customerCpf,
          cep: customerCep,
          saveCard: true,
        };
      }

      const res = await fetch("/api/contracts/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Erro ao gerar pagamento.");
      }

      setPaymentId(data.paymentId);

      if (billingMethod === "PIX") {
        setPixQrCode(data.pixQrCode);
        setPixCopyPaste(data.pixCopyPaste);
      } else if (billingMethod === "BOLETO") {
        setBoletoLine(data.identificationField);
        setBoletoUrl(data.bankSlipUrl || data.invoiceUrl);
        setPixQrCode(data.pixQrCode);
        setPixCopyPaste(data.pixCopyPaste);
      } else if (billingMethod === "CREDIT_CARD") {
        if (data.status === "CONFIRMED" || data.status === "RECEIVED") {
          toast({
            title: "Pagamento Aprovado!",
            description: `Sua mensalidade (${selectedCompetence}) foi quitada com sucesso.`,
          });
          setCheckoutOpen(false);
          fetchUserContracts();
        } else {
          toast({
            title: "Pagamento em processamento",
            description:
              "A operadora está validando a transação e a baixa será automática.",
          });
          setCheckoutOpen(false);
          fetchUserContracts();
        }
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Atenção",
        description: err.message,
      });
    } finally {
      setProcessing(false);
    }
  };

  if (loading || contracts.length === 0) {
    return null;
  }

  const activePreview = activeContract
    ? computeInvoicePreview(activeContract, selectedCompetence)
    : null;

  return (
    <div className="mb-8 space-y-4 font-sans">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#BF4B24]" />
            Meus Contratos & Mensalidades de Coanfitrião
          </h2>
          <p className="text-xs text-slate-500">
            Pague sua fatura mensal via PIX, Boleto ou Cartão de Crédito com
            baixa automática.
          </p>
        </div>

        <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-3 py-1.5 self-start sm:self-auto">
          <Calendar className="w-4 h-4 text-slate-400" />
          <span className="text-xs font-semibold text-slate-600">
            Competência:
          </span>
          <input
            type="month"
            value={selectedCompetence}
            onChange={(e) => setSelectedCompetence(e.target.value)}
            className="text-xs font-bold text-slate-900 bg-transparent border-0 outline-none"
          />
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4">
        {contracts.map((contract) => {
          const roomName =
            roomsMap.get(contract.room_id) || "Consultório Fusion";
          const preview = computeInvoicePreview(contract, selectedCompetence);
          const isCohost =
            contract.contract_type === "monthly_exclusive" &&
            contract.allow_sublease;

          return (
            <div
              key={contract.id}
              className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs flex flex-col lg:flex-row lg:items-center justify-between gap-6"
            >
              <div className="space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge className="bg-slate-900 text-white border-0 text-[10px] font-semibold">
                    {isCohost
                      ? `Coanfitrião Oficial (Repasse ${contract.cohost_split_pct || 80}%)`
                      : "Contrato Fixo Recorrente"}
                  </Badge>
                  {preview.isPaid ? (
                    <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs font-semibold flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Competência {selectedCompetence} Quitada
                    </Badge>
                  ) : preview.isOverdue ? (
                    <Badge className="bg-red-50 text-red-700 border-0 text-xs font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3.5 h-3.5" />
                      Vencido há {preview.daysLate} dia(s) • Multa + Juros
                      aplicados
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-50 text-amber-800 border-0 text-xs font-semibold flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Vencimento em{" "}
                      {format(parseISO(preview.dueDateIso), "dd/MM/yyyy")}
                    </Badge>
                  )}
                </div>

                <h3 className="text-base font-bold text-slate-900">
                  {roomName} — {contract.specialist_name}
                </h3>

                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 tabular-nums">
                  <span>
                    Valor Base:{" "}
                    <strong className="text-slate-800">
                      R$ {formatBRL(preview.baseValue)}
                    </strong>
                  </span>
                  <span>•</span>
                  <span>
                    Vencimento todo dia <strong>{contract.due_day || 8}</strong>
                  </span>
                  <span>•</span>
                  <span>
                    Encargos após vencimento: Multa{" "}
                    <strong>{preview.finePct}%</strong> + Juros{" "}
                    <strong>{preview.interestPct}% a.m.</strong>
                  </span>
                </div>

                {preview.isOverdue && (
                  <div className="p-3 rounded-xl bg-red-50/70 border border-red-200/80 text-xs text-red-900 space-y-1 tabular-nums max-w-xl">
                    <p className="font-bold">
                      Detalhamento de Atraso ({preview.daysLate} dia(s) após{" "}
                      {format(parseISO(preview.dueDateIso), "dd/MM/yyyy")}):
                    </p>
                    <p>
                      Valor Original: R$ {formatBRL(preview.baseValue)} + Multa
                      ({preview.finePct}%): R$ {formatBRL(preview.fineBrl)} +
                      Juros pro-rata ({preview.interestPct}% a.m.): R${" "}
                      {formatBRL(preview.interestBrl)}
                    </p>
                  </div>
                )}
              </div>

              <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-4 shrink-0 border-t lg:border-t-0 pt-4 lg:pt-0 border-slate-100">
                <div className="text-left lg:text-right tabular-nums">
                  <p className="text-[11px] font-medium text-slate-400">
                    {preview.isPaid
                      ? "Valor Pago"
                      : preview.isOverdue
                        ? "Total Atualizado c/ Multa e Juros"
                        : "Valor da Mensalidade"}
                  </p>
                  <p
                    className={`text-2xl font-bold tracking-tight ${
                      preview.isPaid
                        ? "text-emerald-700"
                        : preview.isOverdue
                          ? "text-red-700"
                          : "text-slate-900"
                    }`}
                  >
                    R$ {formatBRL(preview.totalBrl)}
                  </p>
                </div>

                {!preview.isPaid && (
                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Button
                      type="button"
                      onClick={() => handleOpenPaymentModal(contract, "PIX")}
                      className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-9 rounded-xl px-3.5"
                    >
                      <QrCode className="w-3.5 h-3.5 mr-1.5 text-[#BF4B24]" />
                      Pagar c/ PIX
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() => handleOpenPaymentModal(contract, "BOLETO")}
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-9 rounded-xl px-3.5"
                    >
                      <Barcode className="w-3.5 h-3.5 mr-1.5" />
                      Gerar Boleto
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        handleOpenPaymentModal(contract, "CREDIT_CARD")
                      }
                      className="border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-9 rounded-xl px-3.5"
                    >
                      <CreditCard className="w-3.5 h-3.5 mr-1.5" />
                      Cartão
                    </Button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* MODAL DE CHECKOUT TRANSPARENTE DO CONTRATO */}
      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Pagamento da Mensalidade ({selectedCompetence})
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escolha a forma de pagamento abaixo. A baixa do seu contrato é
              feita automaticamente.
            </DialogDescription>
          </DialogHeader>

          {activeContract && activePreview && (
            <div className="space-y-4">
              {/* Resumo do Valor + Multa/Juros */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Valor base do contrato:</span>
                  <span className="font-semibold text-slate-900">
                    R$ {formatBRL(activePreview.baseValue)}
                  </span>
                </div>

                {activePreview.isOverdue && (
                  <>
                    <div className="flex justify-between text-red-700">
                      <span>Multa por atraso ({activePreview.finePct}%):</span>
                      <span className="font-semibold">
                        + R$ {formatBRL(activePreview.fineBrl)}
                      </span>
                    </div>
                    <div className="flex justify-between text-red-700">
                      <span>
                        Juros pro-rata ({activePreview.daysLate}d •{" "}
                        {activePreview.interestPct}% a.m.):
                      </span>
                      <span className="font-semibold">
                        + R$ {formatBRL(activePreview.interestBrl)}
                      </span>
                    </div>
                  </>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-900">
                    Total a Pagar:
                  </span>
                  <span className="font-bold text-emerald-700 text-base">
                    R$ {formatBRL(activePreview.totalBrl)}
                  </span>
                </div>
              </div>

              {/* Seletor de Método */}
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl">
                {(["PIX", "BOLETO", "CREDIT_CARD"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setBillingMethod(m);
                      setPaymentId(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                      billingMethod === m
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {m === "PIX" ? "PIX" : m === "BOLETO" ? "Boleto" : "Cartão"}
                  </button>
                ))}
              </div>

              {/* CPF obrigatório caso não tenha no perfil */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">
                    CPF / CNPJ do Titular
                  </Label>
                  <Input
                    value={customerCpf}
                    onChange={(e) => setCustomerCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="mt-1 h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">
                    CEP
                  </Label>
                  <Input
                    value={customerCep}
                    onChange={(e) => setCustomerCep(e.target.value)}
                    placeholder="59000-000"
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              {/* Formulário de Cartão de Crédito */}
              {billingMethod === "CREDIT_CARD" && (
                <div className="space-y-3 pt-1">
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">
                      Nome impresso no cartão
                    </Label>
                    <Input
                      value={holderName}
                      onChange={(e) => setHolderName(e.target.value)}
                      placeholder="Como está no cartão"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div>
                    <Label className="text-[11px] font-semibold text-slate-600">
                      Número do Cartão
                    </Label>
                    <Input
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      placeholder="0000 0000 0000 0000"
                      className="mt-1 h-9 text-xs"
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-2">
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">
                        Mês (MM)
                      </Label>
                      <Input
                        value={expiryMonth}
                        onChange={(e) => setExpiryMonth(e.target.value)}
                        placeholder="08"
                        maxLength={2}
                        className="mt-1 h-9 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">
                        Ano (AAAA)
                      </Label>
                      <Input
                        value={expiryYear}
                        onChange={(e) => setExpiryYear(e.target.value)}
                        placeholder="2029"
                        maxLength={4}
                        className="mt-1 h-9 text-xs"
                      />
                    </div>
                    <div>
                      <Label className="text-[11px] font-semibold text-slate-600">
                        CVV
                      </Label>
                      <Input
                        value={ccv}
                        onChange={(e) => setCcv(e.target.value)}
                        placeholder="123"
                        maxLength={4}
                        className="mt-1 h-9 text-xs"
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Resultado PIX gerado */}
              {billingMethod === "PIX" && pixQrCode && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex flex-col items-center text-center space-y-3">
                  <img
                    src={`data:image/png;base64,${pixQrCode}`}
                    alt="QR Code PIX"
                    className="w-44 h-44 rounded-lg border border-slate-200 bg-white p-2"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (pixCopyPaste) {
                        navigator.clipboard.writeText(pixCopyPaste);
                        toast({ title: "Código PIX Copia e Cola copiado!" });
                      }
                    }}
                    className="w-full text-xs font-semibold"
                  >
                    <Copy className="w-3.5 h-3.5 mr-1.5" />
                    Copiar Código PIX Copia e Cola
                  </Button>
                  <p className="text-[11px] text-emerald-700 font-medium flex items-center gap-1.5">
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    Aguardando confirmação automática do banco...
                  </p>
                </div>
              )}

              {/* Resultado BOLETO gerado */}
              {billingMethod === "BOLETO" && paymentId && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <p className="text-xs font-bold text-slate-900">
                    Boleto Registrado Gerado com Sucesso
                  </p>
                  {boletoLine && (
                    <div className="p-2.5 bg-white rounded-lg border border-slate-200 font-mono text-[11px] break-all text-slate-700">
                      {boletoLine}
                    </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {boletoLine && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          navigator.clipboard.writeText(boletoLine);
                          toast({ title: "Linha digitável copiada!" });
                        }}
                        className="flex-1 text-xs font-semibold"
                      >
                        <Copy className="w-3.5 h-3.5 mr-1.5" />
                        Copiar Linha Digitável
                      </Button>
                    )}
                    {boletoUrl && (
                      <a
                        href={boletoUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex-1 inline-flex items-center justify-center h-9 px-3 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                      >
                        <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                        Abrir PDF do Boleto
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* Botão de Ação */}
              {!paymentId && (
                <Button
                  type="button"
                  disabled={processing}
                  onClick={handleGenerateOrPay}
                  className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs"
                >
                  {processing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando junto ao Asaas...
                    </>
                  ) : billingMethod === "PIX" ? (
                    `Gerar QR Code PIX (R$ ${formatBRL(activePreview.totalBrl)})`
                  ) : billingMethod === "BOLETO" ? (
                    `Emitir Boleto Registrado (R$ ${formatBRL(activePreview.totalBrl)})`
                  ) : (
                    `Pagar Agora no Cartão (R$ ${formatBRL(activePreview.totalBrl)})`
                  )}
                </Button>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
