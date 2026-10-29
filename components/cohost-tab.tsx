// components/cohost-tab.tsx
"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { AvailabilityConfig } from "@/components/host/availability-config";
import {
  CalendarClock,
  Wallet,
  CalendarDays,
  Clock,
  FileText,
  ExternalLink,
  CheckCircle2,
  Lock,
  Unlock,
  Loader2,
  Building2,
  User,
  SlidersHorizontal,
  ArrowUpRight,
  History,
  CalendarCheck,
  Filter,
  Repeat,
  Info,
  QrCode,
  Barcode,
  CreditCard,
  AlertTriangle,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import {
  format,
  parseISO,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
  getDaysInMonth,
  differenceInCalendarDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const WEEKDAYS = [
  { day: 1, short: "Seg", name: "Segunda-feira" },
  { day: 2, short: "Ter", name: "Terça-feira" },
  { day: 3, short: "Qua", name: "Quarta-feira" },
  { day: 4, short: "Qui", name: "Quinta-feira" },
  { day: 5, short: "Sex", name: "Sexta-feira" },
  { day: 6, short: "Sáb", name: "Sábado" },
  { day: 0, short: "Dom", name: "Domingo" },
];

const DEFAULT_COMMERCIAL_HOURS = [
  "08h-09h",
  "09h-10h",
  "10h-11h",
  "11h-12h",
  "13h-14h",
  "14h-15h",
  "15h-16h",
  "16h-17h",
  "17h-18h",
];

type PeriodPreset =
  "current_month" | "last_month" | "last_3_months" | "all_contract" | "custom";

function calculateSlotUnits(startIso: string, endIso: string): number {
  const diffMinutes =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
  if (diffMinutes <= 0) return 1;
  if (diffMinutes >= 45 && diffMinutes <= 65) return 1;
  return Math.max(1, Math.round(diffMinutes / 55));
}

function parseScheduleObj(raw: any): Record<string, any> {
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

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function CohostTab() {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [savingQuickDays, setSavingQuickDays] = useState(false);

  const [contracts, setContracts] = useState<any[]>([]);
  const [selectedContractIdx] = useState(0);
  const [roomData, setRoomData] = useState<any | null>(null);
  const [subleaseBookings, setSubleaseBookings] = useState<any[]>([]);
  const [secondaryContracts, setSecondaryContracts] = useState<any[]>([]);
  const [userProfile, setUserProfile] = useState<any | null>(null);

  // Filtro de Período (Padrão: Este Mês)
  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>("current_month");
  const [customStartDate, setCustomStartDate] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [customEndDate, setCustomEndDate] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd"),
  );

  // Competência selecionada para pagamento da mensalidade do contrato (YYYY-MM)
  const [invoiceCompetence, setInvoiceCompetence] = useState<string>(() =>
    format(new Date(), "yyyy-MM"),
  );

  // Estados do Modal de Pagamento da Mensalidade (PIX / Boleto / Cartão)
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<"PIX" | "BOLETO" | "CREDIT_CARD">(
    "PIX",
  );
  const [payProcessing, setPayProcessing] = useState(false);
  const [generatedPaymentId, setGeneratedPaymentId] = useState<string | null>(
    null,
  );
  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [boletoLine, setBoletoLine] = useState<string | null>(null);
  const [boletoUrl, setBoletoUrl] = useState<string | null>(null);

  const [customerCpf, setCustomerCpf] = useState("");
  const [customerCep, setCustomerCep] = useState("");
  const [useSavedCard, setUseSavedCard] = useState(false);
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCcv, setCardCcv] = useState("");

  // Separação entre Reservas Futuras e Anteriores
  const [bookingListTab, setBookingListTab] = useState<"upcoming" | "past">(
    "upcoming",
  );

  // Controle para abrir o editor avançado de horários
  const [editingScheduleRoomId, setEditingScheduleRoomId] = useState<
    string | null
  >(null);

  const activeContract = contracts[selectedContractIdx] || contracts[0] || null;

  // Calcula o intervalo do filtro + trava estrita na vigência do contrato do Coanfitrião
  const dateRange = useMemo(() => {
    const now = new Date();
    let rawStart = startOfMonth(now);
    let rawEnd = endOfMonth(now);
    let label = format(now, "MMMM 'de' yyyy", { locale: ptBR });

    if (periodPreset === "last_month") {
      const lastM = subMonths(now, 1);
      rawStart = startOfMonth(lastM);
      rawEnd = endOfMonth(lastM);
      label = format(lastM, "MMMM 'de' yyyy", { locale: ptBR });
    } else if (periodPreset === "last_3_months") {
      const threeAgo = subMonths(now, 2);
      rawStart = startOfMonth(threeAgo);
      rawEnd = endOfMonth(now);
      label = "Últimos 3 meses";
    } else if (periodPreset === "all_contract" && activeContract) {
      rawStart = startOfDay(parseISO(activeContract.start_date));
      rawEnd = endOfDay(parseISO(activeContract.end_date));
      label = "Todo o contrato";
    } else if (periodPreset === "custom") {
      try {
        rawStart = startOfDay(parseISO(customStartDate));
        rawEnd = endOfDay(parseISO(customEndDate));
        label = `${format(rawStart, "dd/MM/yy")} até ${format(rawEnd, "dd/MM/yy")}`;
      } catch {}
    }

    if (activeContract?.start_date && activeContract?.end_date) {
      const contractStart = startOfDay(parseISO(activeContract.start_date));
      const contractEnd = endOfDay(parseISO(activeContract.end_date));

      const effectiveStart =
        rawStart.getTime() < contractStart.getTime() ? contractStart : rawStart;
      const effectiveEnd =
        rawEnd.getTime() > contractEnd.getTime() ? contractEnd : rawEnd;

      const wasClampedByContractStart =
        rawStart.getTime() < contractStart.getTime();

      return {
        rawStart,
        rawEnd,
        start: effectiveStart,
        end: effectiveEnd,
        contractStart,
        contractEnd,
        wasClampedByContractStart,
        label,
      };
    }

    return {
      rawStart,
      rawEnd,
      start: rawStart,
      end: rawEnd,
      contractStart: rawStart,
      contractEnd: rawEnd,
      wasClampedByContractStart: false,
      label,
    };
  }, [
    periodPreset,
    customStartDate,
    customEndDate,
    activeContract?.start_date,
    activeContract?.end_date,
  ]);

  const loadCohostData = useCallback(async () => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const todayStr = format(new Date(), "yyyy-MM-dd");

      const [profRes, activeContractsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select(
            "id, full_name, email, cpf, cep, phone, whatsapp, cc_token, cc_last4, cc_brand",
          )
          .eq("id", user.id)
          .maybeSingle(),
        supabase
          .from("room_contracts")
          .select("*")
          .eq("specialist_id", user.id)
          .eq("status", "active")
          .eq("allow_sublease", true)
          .lte("start_date", todayStr)
          .gte("end_date", todayStr)
          .order("created_at", { ascending: false }),
      ]);

      if (profRes.data) {
        setUserProfile(profRes.data);
        setCustomerCpf(profRes.data.cpf || "");
        setCustomerCep(profRes.data.cep || "");
        setCardHolder(profRes.data.full_name || "");
        setUseSavedCard(Boolean(profRes.data.cc_token));
      }

      if (activeContractsRes.error) throw activeContractsRes.error;
      const activeContracts = activeContractsRes.data || [];

      if (activeContracts.length === 0) {
        setContracts([]);
        setRoomData(null);
        setLoading(false);
        return;
      }

      setContracts(activeContracts);
      const currentContract =
        activeContracts[selectedContractIdx] || activeContracts[0];

      // 2. Busca dados da sala e os subcontratos fixos (Turnos/Diárias) da mesma sala
      const [roomRes, roomSubContractsRes] = await Promise.all([
        supabase
          .from("rooms")
          .select("*, profiles:host_id(full_name)")
          .eq("id", currentContract.room_id)
          .single(),
        supabase
          .from("room_contracts")
          .select("*")
          .eq("room_id", currentContract.room_id)
          .eq("status", "active")
          .neq("id", currentContract.id)
          .lte("start_date", currentContract.end_date)
          .gte("end_date", currentContract.start_date)
          .order("start_date", { ascending: true }),
      ]);

      if (roomRes.error) throw roomRes.error;
      const room = roomRes.data;
      setRoomData(room);

      const subContracts = roomSubContractsRes.data || [];
      setSecondaryContracts(subContracts);
      const subContractsMap = new Map<string, any>(
        subContracts.map((sc: any) => [sc.id, sc]),
      );

      // 3. Busca reservas APENAS da data de início do contrato até o fim
      const contractStartIso = startOfDay(
        parseISO(currentContract.start_date),
      ).toISOString();
      const contractEndIso = endOfDay(
        parseISO(currentContract.end_date),
      ).toISOString();

      const { data: bookingsData } = await supabase
        .from("bookings")
        .select(
          "id, user_id, start_time, end_time, status, total_cost, agreed_value_brl, contract_id, booking_origin, created_at",
        )
        .eq("room_id", currentContract.room_id)
        .in("status", ["confirmed", "in_progress", "completed"])
        .gte("start_time", contractStartIso)
        .lte("start_time", contractEndIso)
        .order("start_time", { ascending: true });

      const validSubleaseBookings = (bookingsData || []).filter((b: any) => {
        if (b.contract_id && b.contract_id === currentContract.id) {
          return false; // Ignora o bloqueio do próprio contrato do coanfitrião
        }
        return true;
      });

      const guestIds = Array.from(
        new Set(
          validSubleaseBookings.map((b: any) => b.user_id).filter(Boolean),
        ),
      );

      let guestMap = new Map<string, any>();
      if (guestIds.length > 0) {
        const { data: guests } = await supabase
          .from("profiles")
          .select("id, full_name, specialty, avatar_url")
          .in("id", guestIds);
        guestMap = new Map((guests || []).map((g: any) => [g.id, g]));
      }

      let addr = room?.address_details || {};
      if (typeof addr === "string") {
        try {
          addr = JSON.parse(addr);
        } catch {
          addr = {};
        }
      }
      const roomHourlyRate = Number(addr?.pricing?.hourly || 45);
      const cohostPctGlobal =
        Number(currentContract.cohost_split_pct || 80) / 100;

      const enrichedBookings = validSubleaseBookings.map((b: any) => {
        const guest = guestMap.get(b.user_id);
        const linkedSubContract = b.contract_id
          ? subContractsMap.get(b.contract_id)
          : null;
        const isSubContractBooking = Boolean(
          b.contract_id ||
          (b.booking_origin && String(b.booking_origin).startsWith("contract")),
        );

        const hours = calculateSlotUnits(b.start_time, b.end_time);
        const rawCost = Number(b.total_cost || 0);

        let grossBrl = 0;
        if (isSubContractBooking) {
          grossBrl =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : Number(linkedSubContract?.session_value || 0);
        } else {
          grossBrl =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : rawCost >= hours * 20
                ? rawCost
                : hours * roomHourlyRate;
        }

        const appliedCohostPct = isSubContractBooking
          ? Number(linkedSubContract?.host_split_pct ?? 80) / 100
          : cohostPctGlobal;

        const appliedPlatformPct = isSubContractBooking
          ? Number(linkedSubContract?.platform_fee_pct ?? 20) / 100
          : 1 - cohostPctGlobal;

        const cohostNetBrl = grossBrl * appliedCohostPct;
        const platformFeeBrl = grossBrl * appliedPlatformPct;

        return {
          ...b,
          hours,
          grossBrl,
          cohostNetBrl,
          platformFeeBrl,
          appliedCohostPct,
          isSubContractBooking,
          subContractType: linkedSubContract?.contract_type || null,
          guestName:
            linkedSubContract?.specialist_name ||
            guest?.full_name ||
            "Profissional Verificado",
          guestSpecialty: isSubContractBooking
            ? "Contrato Fixo (Turno/Diária)"
            : guest?.specialty || "Reserva Avulsa",
        };
      });

      setSubleaseBookings(enrichedBookings);
    } catch (err) {
      console.error("Erro ao carregar painel do Coanfitrião:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, selectedContractIdx]);

  useEffect(() => {
    loadCohostData();
  }, [loadCohostData]);

  // Polling automático quando um QR Code PIX ou Boleto com PIX estiver aberto no modal
  useEffect(() => {
    if (!isPayModalOpen || !generatedPaymentId || !activeContract) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/contracts/payment?contractId=${activeContract.id}&competence=${invoiceCompetence}&paymentId=${generatedPaymentId}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.confirmed) {
            clearInterval(timer);
            toast({
              title: "Mensalidade Confirmada!",
              description: `O pagamento da competência ${invoiceCompetence} foi confirmado e baixado automaticamente.`,
            });
            setIsPayModalOpen(false);
            setGeneratedPaymentId(null);
            loadCohostData();
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(timer);
  }, [
    isPayModalOpen,
    generatedPaymentId,
    activeContract,
    invoiceCompetence,
    toast,
    loadCohostData,
  ]);

  // Cálculo detalhado da Fatura da Competência Selecionada (Valor Base + Multa + Juros Pro-Rata)
  const invoiceDetails = useMemo(() => {
    if (!activeContract) return null;

    const sched = parseScheduleObj(activeContract.schedule_config);
    const tiers = Array.isArray(sched.pricingTiers) ? sched.pricingTiers : [];

    const dueDayRaw = Math.max(
      1,
      Math.min(31, Number(activeContract.due_day) || 8),
    );
    const [yearStr, monthStr] = invoiceCompetence.split("-");
    const maxDays = getDaysInMonth(
      new Date(Number(yearStr), Number(monthStr) - 1, 1),
    );
    const safeDay = String(Math.min(dueDayRaw, maxDays)).padStart(2, "0");
    const dueDateIso = `${invoiceCompetence}-${safeDay}`;

    // Verifica se há escalonamento de preço para esta competência
    let baseRent =
      Number(activeContract.contract_value) > 0
        ? Number(activeContract.contract_value)
        : Number(activeContract.session_value || 0);

    if (tiers.length > 0) {
      const matchedTier = tiers.find(
        (t: any) => dueDateIso >= t.start_date && dueDateIso <= t.end_date,
      );
      if (matchedTier && Number(matchedTier.contract_value) > 0) {
        baseRent = Number(matchedTier.contract_value);
      }
    }

    const finePct = Number(sched.fine_pct ?? activeContract.fine_pct ?? 2);
    const interestPct = Number(
      sched.interest_pct ?? activeContract.interest_pct ?? 1,
    );

    const isPaid =
      activeContract.last_paid_competence === invoiceCompetence ||
      Boolean(sched.paid_dates && sched.paid_dates[invoiceCompetence]);

    const paidDateStr =
      sched.paid_dates && sched.paid_dates[invoiceCompetence]
        ? sched.paid_dates[invoiceCompetence]
        : null;

    const daysLate = !isPaid
      ? Math.max(
          0,
          differenceInCalendarDays(
            new Date(),
            parseISO(`${dueDateIso}T23:59:59`),
          ),
        )
      : 0;

    let fineBrl = 0;
    let interestBrl = 0;

    if (!isPaid && daysLate > 0 && baseRent > 0) {
      if (finePct > 0) {
        fineBrl = Number((baseRent * (finePct / 100)).toFixed(2));
      }
      if (interestPct > 0) {
        interestBrl = Number(
          (baseRent * (interestPct / 100 / 30) * daysLate).toFixed(2),
        );
      }
    }

    const totalBrl = Number((baseRent + fineBrl + interestBrl).toFixed(2));

    return {
      competence: invoiceCompetence,
      dueDateIso,
      dueDayRaw,
      baseRent,
      finePct,
      interestPct,
      isPaid,
      paidDateStr,
      daysLate,
      isOverdue: !isPaid && daysLate > 0,
      fineBrl,
      interestBrl,
      totalBrl,
    };
  }, [activeContract, invoiceCompetence]);

  const handleOpenInvoicePayment = (
    method: "PIX" | "BOLETO" | "CREDIT_CARD",
  ) => {
    setPayMethod(method);
    setGeneratedPaymentId(null);
    setPixQrCode(null);
    setPixCopyPaste(null);
    setBoletoLine(null);
    setBoletoUrl(null);
    if (!customerCpf && activeContract?.specialist_document) {
      setCustomerCpf(activeContract.specialist_document);
    }
    setIsPayModalOpen(true);
  };

  const handleGenerateOrPayContract = async () => {
    if (!activeContract || !invoiceDetails) return;
    setPayProcessing(true);

    try {
      const payload: Record<string, any> = {
        contractId: activeContract.id,
        competence: invoiceCompetence,
        billingType: payMethod,
        customerCpf,
        customerCep,
      };

      if (payMethod === "CREDIT_CARD") {
        if (useSavedCard && userProfile?.cc_token) {
          payload.cardData = {
            useSavedCard: true,
            cpf: customerCpf,
            cep: customerCep,
          };
        } else {
          if (
            !cardNumber ||
            !cardHolder ||
            !cardExpMonth ||
            !cardExpYear ||
            !cardCcv
          ) {
            throw new Error("Preencha todos os dados do cartão de crédito.");
          }
          payload.creditCard = {
            holderName: cardHolder,
            number: cardNumber.replace(/\D/g, ""),
            expiryMonth: cardExpMonth.replace(/\D/g, ""),
            expiryYear:
              cardExpYear.length === 2 ? `20${cardExpYear}` : cardExpYear,
            ccv: cardCcv.replace(/\D/g, ""),
          };
          payload.cardData = {
            useSavedCard: false,
            saveCard: true,
            cpf: customerCpf,
            cep: customerCep,
          };
        }
      }

      const res = await fetch("/api/contracts/payment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Não foi possível processar a cobrança.");
      }

      setGeneratedPaymentId(data.paymentId);

      if (payMethod === "PIX") {
        setPixQrCode(data.pixQrCode);
        setPixCopyPaste(data.pixCopyPaste);
      } else if (payMethod === "BOLETO") {
        setBoletoLine(data.identificationField);
        setBoletoUrl(data.bankSlipUrl || data.invoiceUrl);
        setPixQrCode(data.pixQrCode);
        setPixCopyPaste(data.pixCopyPaste);
      } else if (payMethod === "CREDIT_CARD") {
        toast({
          title: "Mensalidade Paga com Sucesso!",
          description: `A competência ${invoiceCompetence} do seu contrato foi baixada automaticamente.`,
        });
        setIsPayModalOpen(false);
        loadCohostData();
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro no pagamento",
        description: err.message,
      });
    } finally {
      setPayProcessing(false);
    }
  };

  // Filtra as reservas no período + data de início do contrato
  const bookingsInSelectedPeriod = useMemo(() => {
    const sMs = dateRange.start.getTime();
    const eMs = dateRange.end.getTime();
    const cStartMs = dateRange.contractStart.getTime();
    const cEndMs = dateRange.contractEnd.getTime();

    if (sMs > eMs) return [];

    return subleaseBookings.filter((b) => {
      const bStart = new Date(b.start_time).getTime();
      return (
        bStart >= sMs && bStart <= eMs && bStart >= cStartMs && bStart <= cEndMs
      );
    });
  }, [subleaseBookings, dateRange]);

  // Separação entre Futuras e Anteriores
  const { upcomingBookings, pastBookings } = useMemo(() => {
    const nowMs = Date.now();
    const upcoming: any[] = [];
    const past: any[] = [];

    bookingsInSelectedPeriod.forEach((b) => {
      const bEnd = new Date(b.end_time).getTime();
      if (bEnd >= nowMs) {
        upcoming.push(b);
      } else {
        past.push(b);
      }
    });

    upcoming.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );
    past.sort(
      (a, b) =>
        new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
    );

    return { upcomingBookings: upcoming, pastBookings: past };
  }, [bookingsInSelectedPeriod]);

  // Dias da semana ocupados por subcontratos fixos
  const daysWithFixedSubcontract = useMemo(() => {
    const map = new Map<number, string[]>();
    secondaryContracts.forEach((sc) => {
      const days: number[] = sc.schedule_config?.daysOfWeek || [];
      days.forEach((d) => {
        const list = map.get(d) || [];
        list.push(sc.specialist_name);
        map.set(d, list);
      });
    });
    return map;
  }, [secondaryContracts]);

  if (editingScheduleRoomId) {
    return (
      <div className="min-h-screen bg-slate-50">
        <AvailabilityConfig
          spaceId={editingScheduleRoomId}
          onBack={() => {
            setEditingScheduleRoomId(null);
            loadCohostData();
          }}
          onSave={() => {
            setEditingScheduleRoomId(null);
            loadCohostData();
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-32 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
        <p className="text-sm font-semibold text-slate-500">
          Carregando informações da sua sala...
        </p>
      </div>
    );
  }

  if (!activeContract || !roomData) {
    return (
      <div className="max-w-2xl mx-auto p-6 py-24 text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 border border-slate-200 flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-7 h-7 text-slate-700" />
        </div>
        <h2 className="text-xl font-bold text-slate-900 mb-2">
          Nenhuma sala fixa vinculada
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          Quando você possui um contrato de sala fixa com sublocação ativa, este
          painel permite gerenciar seus horários livres e acompanhar seus
          repasses sobre os aluguéis.
        </p>
      </div>
    );
  }

  let parsedAvail = roomData.availability || {};
  if (typeof parsedAvail === "string") {
    try {
      parsedAvail = JSON.parse(parsedAvail);
    } catch {
      parsedAvail = {};
    }
  }

  const currentWeekConfig: any[] = Array.isArray(parsedAvail.weekConfig)
    ? parsedAvail.weekConfig
    : WEEKDAYS.map((wd) => ({
        day: wd.day,
        dayName: wd.name,
        enabled: false,
        rentalType: "hourly",
        availableHours: DEFAULT_COMMERCIAL_HOURS,
        selectedShifts: [],
      }));

  const handleQuickToggleDay = async (dayNumber: number) => {
    setSavingQuickDays(true);
    try {
      const updatedWeek = WEEKDAYS.map((wd) => {
        const existing = currentWeekConfig.find((c: any) => c.day === wd.day);
        const currentlyEnabled = Boolean(existing?.enabled);
        const nextEnabled =
          wd.day === dayNumber ? !currentlyEnabled : currentlyEnabled;

        return {
          day: wd.day,
          dayName: wd.name,
          enabled: nextEnabled,
          rentalType: existing?.rentalType || "hourly",
          availableHours:
            nextEnabled &&
            (!existing?.availableHours || existing.availableHours.length === 0)
              ? DEFAULT_COMMERCIAL_HOURS
              : existing?.availableHours || DEFAULT_COMMERCIAL_HOURS,
          selectedShifts: existing?.selectedShifts || [],
        };
      });

      const newAvailabilityPayload = {
        ...parsedAvail,
        weekConfig: updatedWeek,
        exceptions: Array.isArray(parsedAvail.exceptions)
          ? parsedAvail.exceptions
          : [],
      };

      const { error } = await supabase
        .from("rooms")
        .update({ availability: newAvailabilityPayload })
        .eq("id", roomData.id);

      if (error) throw error;

      setRoomData({
        ...roomData,
        availability: newAvailabilityPayload,
      });

      const targetDayObj = WEEKDAYS.find((w) => w.day === dayNumber);
      const isNowOpen = updatedWeek.find((w) => w.day === dayNumber)?.enabled;

      toast({
        title: isNowOpen
          ? `${targetDayObj?.name}: Aberta para sublocar`
          : `${targetDayObj?.name}: Reservada para seu uso`,
        description: isNowOpen
          ? "Outros profissionais já podem reservar os horários livres deste dia."
          : "Este dia foi fechado na vitrine para seu atendimento exclusivo.",
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar disponibilidade",
        description: err.message,
      });
    } finally {
      setSavingQuickDays(false);
    }
  };

  const totalGrossSubleased = bookingsInSelectedPeriod.reduce(
    (acc, b) => acc + b.grossBrl,
    0,
  );
  const totalCohostNet80 = bookingsInSelectedPeriod.reduce(
    (acc, b) => acc + b.cohostNetBrl,
    0,
  );
  const totalHoursSubleased = bookingsInSelectedPeriod.reduce(
    (acc, b) => acc + b.hours,
    0,
  );
  const monthlyFixedRent = Number(
    invoiceDetails?.baseRent || activeContract.contract_value || 0,
  );
  const rentCoveragePct =
    monthlyFixedRent > 0
      ? Math.min(100, Math.round((totalCohostNet80 / monthlyFixedRent) * 100))
      : 0;
  const cohostSplitPct = Number(activeContract.cohost_split_pct || 80);
  const openDaysCount = WEEKDAYS.filter((wd) =>
    Boolean(currentWeekConfig.find((c: any) => c.day === wd.day)?.enabled),
  ).length;

  const displayedBookings =
    bookingListTab === "upcoming" ? upcomingBookings : pastBookings;

  return (
    <div className="p-4 pt-6 lg:p-8 max-w-5xl mx-auto w-full pb-32 space-y-6 animate-in fade-in duration-200">
      {/* 1. CABEÇALHO */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div className="pr-12 md:pr-0">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-bold bg-slate-100 text-slate-800">
                <Building2 className="w-3.5 h-3.5 text-[#BF4B24]" />
                Gestão da Minha Sala
              </span>
              <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-800 border border-emerald-200/60">
                Co-Host Avulso: {cohostSplitPct}% Seu
              </span>
            </div>

            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">
              {roomData.name}
            </h1>
            <p className="text-xs sm:text-sm text-slate-500 font-medium mt-1">
              {roomData.profiles?.full_name || "Fusion Clinic"} • Vigência do
              seu contrato:{" "}
              <strong className="text-slate-700">
                {format(parseISO(activeContract.start_date), "dd/MM/yyyy")} a{" "}
                {format(parseISO(activeContract.end_date), "dd/MM/yyyy")}
              </strong>
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
            {activeContract.pdf_url && (
              <a
                href={activeContract.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 h-11 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-bold text-xs transition-colors"
              >
                <FileText className="w-4 h-4 text-slate-500" />
                Ver Contrato PDF
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            )}
            <Button
              onClick={() => setEditingScheduleRoomId(roomData.id)}
              className="h-11 px-5 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold text-sm shadow-xs"
            >
              <SlidersHorizontal className="w-4 h-4 mr-2" />
              Configurar Horários
            </Button>
          </div>
        </div>
      </div>

      {/* 2. SELETOR DE PERÍODO + AVISO DE CORTE NA DATA INICIAL */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-xs space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <div className="flex items-center gap-2 text-xs font-bold text-slate-500 uppercase tracking-wider">
              <Filter className="w-3.5 h-3.5 text-[#BF4B24]" />
              <span>Período selecionado:</span>
              <span className="text-slate-900 capitalize font-black">
                {dateRange.label}
              </span>
            </div>
            <p className="text-[11px] font-semibold text-slate-500 flex items-center gap-1 mt-0.5">
              <Info className="w-3.5 h-3.5 text-[#BF4B24] shrink-0" />
              Repasses contabilizados apenas a partir de{" "}
              <strong className="text-slate-800">
                {format(parseISO(activeContract.start_date), "dd/MM/yyyy")}
              </strong>{" "}
              (início do contrato).
            </p>
          </div>

          <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-1">
            {[
              { id: "current_month", label: "Este mês" },
              { id: "last_month", label: "Mês passado" },
              { id: "last_3_months", label: "Últimos 3 meses" },
              { id: "all_contract", label: "Todo o contrato" },
              { id: "custom", label: "Personalizado" },
            ].map((item) => {
              const active = periodPreset === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setPeriodPreset(item.id as PeriodPreset)}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-colors ${
                    active
                      ? "bg-slate-900 text-white"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {periodPreset === "custom" && (
          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3 animate-in fade-in">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">De:</span>
              <input
                type="date"
                min={activeContract.start_date}
                max={activeContract.end_date}
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50"
              />
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Até:</span>
              <input
                type="date"
                min={activeContract.start_date}
                max={activeContract.end_date}
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-bold text-slate-800 bg-slate-50"
              />
            </div>
          </div>
        )}
      </div>

      {/* 3. RESUMO FINANCEIRO E ABATIMENTO DO ALUGUEL */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="md:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div className="flex items-start justify-between gap-4">
            <div>
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Seu Ganho Líquido no Período
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <p className="text-3xl font-black text-emerald-700">
                  R${" "}
                  {totalCohostNet80.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </p>
                <span className="text-xs font-semibold text-slate-400">
                  de R${" "}
                  {totalGrossSubleased.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  bruto
                </span>
              </div>
            </div>
            <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
              <Wallet className="w-5 h-5 text-emerald-700" />
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100">
            <div className="flex items-center justify-between text-xs mb-2">
              <span className="font-semibold text-slate-600">
                Cobertura da mensalidade fixa (R${" "}
                {monthlyFixedRent.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
                )
              </span>
              <span className="font-black text-slate-900">
                {rentCoveragePct}% abatido
              </span>
            </div>
            <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                style={{ width: `${rentCoveragePct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                Horas Sublocadas
              </span>
              <Clock className="w-4 h-4 text-[#BF4B24]" />
            </div>
            <p className="text-3xl font-black text-slate-900 mt-1">
              {totalHoursSubleased}h
            </p>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Em {bookingsInSelectedPeriod.length} reserva(s) no período
            </p>
          </div>

          <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-500">
              Vencimento do fixo:
            </span>
            <span className="font-bold text-slate-900 bg-slate-100 px-2.5 py-1 rounded-md">
              Todo dia {String(activeContract.due_day || 8).padStart(2, "0")}
            </span>
          </div>
        </div>
      </div>

      {/* 3.1 FATURA MENSAL DO CONTRATO (PAGAMENTO VIA PIX, BOLETO OU CARTÃO COM MULTA/JUROS ASAAS) */}
      {invoiceDetails && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-[#BF4B24]" />
                  Mensalidade do Seu Contrato Fixo
                </h2>
                {invoiceDetails.isPaid ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs font-bold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Competência Quitada
                  </Badge>
                ) : invoiceDetails.isOverdue ? (
                  <Badge className="bg-red-50 text-red-700 border-0 text-xs font-bold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Vencida há {invoiceDetails.daysLate} dia(s)
                  </Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-800 border-0 text-xs font-bold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Vence em{" "}
                    {format(parseISO(invoiceDetails.dueDateIso), "dd/MM/yyyy")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Pague até o dia{" "}
                <strong>
                  {String(invoiceDetails.dueDayRaw).padStart(2, "0")}
                </strong>{" "}
                de cada mês sem encargos. Após o vencimento, incide multa de{" "}
                <strong>{invoiceDetails.finePct}%</strong> e juros de{" "}
                <strong>{invoiceDetails.interestPct}% a.m.</strong>
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 self-start sm:self-auto">
              <span className="text-xs font-bold text-slate-500">Mês:</span>
              <input
                type="month"
                min={activeContract.start_date.slice(0, 7)}
                max={activeContract.end_date.slice(0, 7)}
                value={invoiceCompetence}
                onChange={(e) => setInvoiceCompetence(e.target.value)}
                className="text-xs font-black text-slate-900 bg-transparent border-0 outline-none"
              />
            </div>
          </div>

          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-2 tabular-nums">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                <span>
                  Valor Base:{" "}
                  <strong className="text-slate-900">
                    R$ {formatBRL(invoiceDetails.baseRent)}
                  </strong>
                </span>
                <span>•</span>
                <span>
                  Vencimento:{" "}
                  <strong className="text-slate-900">
                    {format(parseISO(invoiceDetails.dueDateIso), "dd/MM/yyyy")}
                  </strong>
                </span>
                {invoiceDetails.isOverdue && (
                  <>
                    <span>•</span>
                    <span className="text-red-700 font-semibold">
                      Multa ({invoiceDetails.finePct}%): + R${" "}
                      {formatBRL(invoiceDetails.fineBrl)}
                    </span>
                    <span>•</span>
                    <span className="text-red-700 font-semibold">
                      Juros ({invoiceDetails.daysLate}d): + R${" "}
                      {formatBRL(invoiceDetails.interestBrl)}
                    </span>
                  </>
                )}
              </div>

              {invoiceDetails.isPaid && (
                <p className="text-xs font-semibold text-emerald-700">
                  Pagamento confirmado para a competência {invoiceCompetence}
                  {invoiceDetails.paidDateStr
                    ? ` em ${format(parseISO(invoiceDetails.paidDateStr), "dd/MM/yyyy")}`
                    : ""}
                  .
                </p>
              )}
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 shrink-0">
              <div className="text-left sm:text-right tabular-nums">
                <span className="text-[11px] font-medium text-slate-400 block">
                  {invoiceDetails.isPaid
                    ? "Total Pago"
                    : invoiceDetails.isOverdue
                      ? "Total Atualizado c/ Encargos"
                      : "Valor a Pagar"}
                </span>
                <span
                  className={`text-2xl font-black tracking-tight ${
                    invoiceDetails.isPaid
                      ? "text-emerald-700"
                      : invoiceDetails.isOverdue
                        ? "text-red-700"
                        : "text-slate-900"
                  }`}
                >
                  R$ {formatBRL(invoiceDetails.totalBrl)}
                </span>
              </div>

              {!invoiceDetails.isPaid && (
                <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                  <Button
                    type="button"
                    onClick={() => handleOpenInvoicePayment("PIX")}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs h-10 rounded-xl px-4"
                  >
                    <QrCode className="w-4 h-4 mr-1.5 text-[#BF4B24]" />
                    Pagar c/ PIX
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenInvoicePayment("BOLETO")}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs h-10 rounded-xl px-4"
                  >
                    <Barcode className="w-4 h-4 mr-1.5" />
                    Boleto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenInvoicePayment("CREDIT_CARD")}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50 font-bold text-xs h-10 rounded-xl px-4"
                  >
                    <CreditCard className="w-4 h-4 mr-1.5" />
                    Cartão
                  </Button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 4. SUBCONTRATOS FIXOS NA SALA (Usando a % negociada de cada um) */}
      {secondaryContracts.length > 0 && (
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2">
                <Repeat className="w-4 h-4 text-[#BF4B24]" />
                Contratos Fixos de Terceiros (Turnos & Diárias)
              </h2>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                Estes profissionais possuem horários fixos dentro da sua sala. O
                repasse que você ganha sobre cada contrato é definido na
                negociação.
              </p>
            </div>
            <Badge className="bg-slate-900 text-white border-0 text-xs font-bold w-fit">
              {secondaryContracts.length} subcontrato(s) fixo(s)
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {secondaryContracts.map((sc) => {
              const scDays = (sc.schedule_config?.daysOfWeek || [])
                .map((d: number) => WEEKDAYS.find((w) => w.day === d)?.short)
                .filter(Boolean)
                .join(", ");
              const startH = String(
                sc.schedule_config?.startHour ?? 8,
              ).padStart(2, "0");
              const endH = String(sc.schedule_config?.endHour ?? 20).padStart(
                2,
                "0",
              );

              const scGross = Number(sc.contract_value || 0);
              const scCohostPct = Number(sc.host_split_pct ?? 80);
              const scCohostNet = scGross * (scCohostPct / 100);

              return (
                <div
                  key={sc.id}
                  className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 flex flex-col justify-between gap-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-black text-slate-900 text-sm">
                        {sc.specialist_name}
                      </p>
                      <p className="text-xs font-semibold text-slate-500 mt-0.5">
                        {scDays} • {startH}:00 às {endH}:00
                      </p>
                    </div>
                    <Badge className="bg-slate-200 text-slate-800 border-0 text-[10px] font-bold">
                      {sc.contract_type === "fixed_shift"
                        ? "Turno Fixo"
                        : "Diária Fixa"}
                    </Badge>
                  </div>

                  <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-xs">
                    <span className="text-slate-500 font-medium">
                      Vigência: {format(parseISO(sc.start_date), "dd/MM/yy")} a{" "}
                      {format(parseISO(sc.end_date), "dd/MM/yy")}
                    </span>
                    <span className="font-black text-emerald-700">
                      Seu repasse ({scCohostPct}%): R${" "}
                      {scCohostNet.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                      /mês
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 5. CONTROLE RÁPIDO DA SEMANA (Uso Próprio vs. Sublocação) */}
      <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                Disponibilidade da Semana
              </h2>
              <Badge className="bg-slate-100 text-slate-700 border-0 text-xs font-bold">
                {openDaysCount} de 7 dias abertos
              </Badge>
            </div>
            <p className="text-xs text-slate-500 font-medium mt-0.5 max-w-lg">
              Toque em um dia para alternar entre{" "}
              <strong className="text-slate-800">Meu Uso Exclusivo</strong>{" "}
              (fechado) e{" "}
              <strong className="text-emerald-700">Aberto para Sublocar</strong>
              .
            </p>
          </div>

          <Button
            variant="outline"
            size="sm"
            onClick={() => setEditingScheduleRoomId(roomData.id)}
            className="rounded-xl font-bold border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9"
          >
            Editar horas por dia
            <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
          {WEEKDAYS.map((wd) => {
            const cfg = currentWeekConfig.find((c: any) => c.day === wd.day);
            const isOpenForSublease = Boolean(cfg?.enabled);
            const hoursCount = Array.isArray(cfg?.availableHours)
              ? cfg.availableHours.length
              : 0;
            const fixedTenantsOnDay =
              daysWithFixedSubcontract.get(wd.day) || [];

            return (
              <button
                key={wd.day}
                type="button"
                disabled={savingQuickDays}
                onClick={() => handleQuickToggleDay(wd.day)}
                className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[112px] ${
                  isOpenForSublease
                    ? "border-emerald-600/40 bg-emerald-50/40 hover:bg-emerald-50/80"
                    : "border-slate-200 bg-slate-50/70 hover:bg-slate-100/70"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-sm font-black text-slate-900">
                    {wd.short}
                  </span>
                  {isOpenForSublease ? (
                    <Unlock className="w-3.5 h-3.5 text-emerald-700" />
                  ) : (
                    <Lock className="w-3.5 h-3.5 text-slate-400" />
                  )}
                </div>

                <div className="mt-3 space-y-1">
                  {isOpenForSublease ? (
                    <>
                      <span className="inline-block text-[10px] font-bold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                        Sublocando
                      </span>
                      <p className="text-[11px] font-semibold text-emerald-800">
                        {hoursCount}h livres
                      </p>
                    </>
                  ) : (
                    <>
                      <span className="inline-block text-[10px] font-bold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                        Meu Uso
                      </span>
                      <p className="text-[11px] font-medium text-slate-500">
                        Fechado p/ mim
                      </p>
                    </>
                  )}

                  {fixedTenantsOnDay.length > 0 && (
                    <span
                      title={`Turno/Diária Fixa: ${fixedTenantsOnDay.join(", ")}`}
                      className="block text-[9px] font-bold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded truncate"
                    >
                      Fixo: {fixedTenantsOnDay[0].split(" ")[0]}
                    </span>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* 6. RESERVAS SEPARADAS: PRÓXIMAS (FUTURAS) vs ANTERIORES (REALIZADAS) */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base sm:text-lg font-black text-slate-900">
              Agenda de Sublocações da Sala
            </h3>
            <p className="text-xs text-slate-500 font-medium mt-0.5">
              Acompanhe as reservas (avulsas e subcontratos) do período
              filtrado.
            </p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setBookingListTab("upcoming")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                bookingListTab === "upcoming"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5 text-[#BF4B24]" />
              Próximas ({upcomingBookings.length})
            </button>
            <button
              type="button"
              onClick={() => setBookingListTab("past")}
              className={`flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-bold transition-all ${
                bookingListTab === "past"
                  ? "bg-white text-slate-900 shadow-xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              Anteriores ({pastBookings.length})
            </button>
          </div>
        </div>

        {displayedBookings.length === 0 ? (
          <div className="py-14 text-center px-4">
            <CalendarDays className="w-10 h-10 text-slate-200 mx-auto mb-2.5" />
            <p className="text-sm font-bold text-slate-700">
              {bookingListTab === "upcoming"
                ? "Nenhuma sublocação futura agendada neste período."
                : "Nenhuma sublocação anterior registrada neste período."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {displayedBookings.map((b) => {
              const startDt = parseISO(b.start_time);
              const endDt = parseISO(b.end_time);
              return (
                <div
                  key={b.id}
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-12 h-12 rounded-xl bg-slate-100 border border-slate-200/80 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-bold uppercase text-slate-500 leading-none">
                        {format(startDt, "MMM", { locale: ptBR })}
                      </span>
                      <span className="text-base font-black text-slate-900 leading-tight mt-0.5">
                        {format(startDt, "dd")}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-900 text-sm">
                          {format(startDt, "EEEE", { locale: ptBR })} •{" "}
                          {format(startDt, "HH:mm")} às {format(endDt, "HH:mm")}
                        </p>
                        <Badge
                          className={`border-0 text-[10px] font-bold ${
                            bookingListTab === "upcoming"
                              ? "bg-amber-50 text-amber-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {bookingListTab === "upcoming"
                            ? "Agendada"
                            : "Realizada"}
                        </Badge>
                        {b.isSubContractBooking && (
                          <Badge className="bg-slate-900 text-white border-0 text-[10px] font-bold">
                            Subcontrato Fixo
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-slate-500 font-medium mt-1 flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>{b.guestName}</span>
                        <span className="text-slate-300">•</span>
                        <span>{b.guestSpecialty}</span>
                        <span className="text-slate-300">•</span>
                        <span>{b.hours}h</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                    <span className="text-[11px] font-medium text-slate-400">
                      Bruto: R${" "}
                      {b.grossBrl.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </span>
                    <span className="text-sm sm:text-base font-black text-emerald-700">
                      + R${" "}
                      {b.cohostNetBrl.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}{" "}
                      <span className="text-[10px] font-bold text-emerald-600">
                        ({b.appliedCohostPct * 100}%)
                      </span>
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL DE CHECKOUT TRANSPARENTE DA MENSALIDADE DO COANFITRIÃO */}
      <Dialog open={isPayModalOpen} onOpenChange={setIsPayModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Pagar Mensalidade do Contrato ({invoiceCompetence})
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escolha entre PIX, Boleto Bancário ou Cartão de Crédito. A baixa
              do seu contrato é registrada automaticamente.
            </DialogDescription>
          </DialogHeader>

          {invoiceDetails && (
            <div className="space-y-4">
              {/* Resumo do Valor + Encargos de Atraso */}
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Sala Contratada:</span>
                  <span className="font-bold text-slate-900">
                    {roomData.name}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Data de Vencimento:</span>
                  <span className="font-semibold text-slate-800">
                    {format(parseISO(invoiceDetails.dueDateIso), "dd/MM/yyyy")}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Valor Base Mensal:</span>
                  <span className="font-semibold text-slate-900">
                    R$ {formatBRL(invoiceDetails.baseRent)}
                  </span>
                </div>

                {invoiceDetails.isOverdue && (
                  <>
                    <div className="flex justify-between text-red-700">
                      <span>Multa por atraso ({invoiceDetails.finePct}%):</span>
                      <span className="font-semibold">
                        + R$ {formatBRL(invoiceDetails.fineBrl)}
                      </span>
                    </div>
                    <div className="flex justify-between text-red-700">
                      <span>
                        Juros pro-rata ({invoiceDetails.daysLate}d •{" "}
                        {invoiceDetails.interestPct}% a.m.):
                      </span>
                      <span className="font-semibold">
                        + R$ {formatBRL(invoiceDetails.interestBrl)}
                      </span>
                    </div>
                  </>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-900">
                    Total a Pagar:
                  </span>
                  <span className="font-bold text-emerald-700 text-base">
                    R$ {formatBRL(invoiceDetails.totalBrl)}
                  </span>
                </div>
              </div>

              {/* Abas de Método de Pagamento */}
              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl">
                {(["PIX", "BOLETO", "CREDIT_CARD"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPayMethod(m);
                      setGeneratedPaymentId(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all ${
                      payMethod === m
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {m === "PIX" ? "PIX" : m === "BOLETO" ? "Boleto" : "Cartão"}
                  </button>
                ))}
              </div>

              {/* CPF e CEP */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">
                    CPF / CNPJ *
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

              {/* Campos de Cartão de Crédito */}
              {payMethod === "CREDIT_CARD" && (
                <div className="space-y-3 pt-1">
                  {userProfile?.cc_token && (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
                      <div>
                        <span className="font-bold text-slate-900 block">
                          Cartão Salvo ({userProfile.cc_brand || "Cartão"} ••••{" "}
                          {userProfile.cc_last4})
                        </span>
                        <span className="text-[11px] text-slate-500">
                          Pagar em 1 clique com seu cartão cadastrado
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={useSavedCard}
                        onChange={(e) => setUseSavedCard(e.target.checked)}
                        className="h-4 w-4 accent-slate-900 rounded cursor-pointer"
                      />
                    </div>
                  )}

                  {(!useSavedCard || !userProfile?.cc_token) && (
                    <>
                      <div>
                        <Label className="text-[11px] font-semibold text-slate-600">
                          Nome impresso no cartão
                        </Label>
                        <Input
                          value={cardHolder}
                          onChange={(e) => setCardHolder(e.target.value)}
                          placeholder="Nome do titular"
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
                            value={cardExpMonth}
                            onChange={(e) => setCardExpMonth(e.target.value)}
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
                            value={cardExpYear}
                            onChange={(e) => setCardExpYear(e.target.value)}
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
                            value={cardCcv}
                            onChange={(e) => setCardCcv(e.target.value)}
                            placeholder="123"
                            maxLength={4}
                            className="mt-1 h-9 text-xs"
                          />
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Exibição do QR Code PIX gerado */}
              {payMethod === "PIX" && pixQrCode && (
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
                    Aguardando confirmação automática do pagamento...
                  </p>
                </div>
              )}

              {/* Exibição do Boleto Bancário gerado */}
              {payMethod === "BOLETO" && generatedPaymentId && (
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

              {/* Botão Principal de Ação */}
              {!generatedPaymentId && (
                <Button
                  type="button"
                  disabled={payProcessing}
                  onClick={handleGenerateOrPayContract}
                  className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs"
                >
                  {payProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando junto ao Asaas...
                    </>
                  ) : payMethod === "PIX" ? (
                    `Gerar QR Code PIX (R$ ${formatBRL(invoiceDetails.totalBrl)})`
                  ) : payMethod === "BOLETO" ? (
                    `Emitir Boleto Registrado (R$ ${formatBRL(invoiceDetails.totalBrl)})`
                  ) : (
                    `Pagar Agora no Cartão (R$ ${formatBRL(invoiceDetails.totalBrl)})`
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
