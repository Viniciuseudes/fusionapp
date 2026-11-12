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
  UploadCloud,
  FileCheck2,
  ShieldCheck,
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
  eachMonthOfInterval,
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

function getRoomCoverImage(room: any): string | null {
  if (!room) return null;
  if (typeof room.image_url === "string" && room.image_url.trim() !== "") {
    return room.image_url;
  }
  let addr = room.address_details;
  if (typeof addr === "string") {
    try {
      addr = JSON.parse(addr);
    } catch {
      addr = null;
    }
  }
  if (Array.isArray(addr?.gallery) && addr.gallery.length > 0) {
    return addr.gallery[0];
  }
  return null;
}

function getContractModalityMeta(contract: any) {
  const isCohost = Boolean(
    contract?.contract_type === "monthly_exclusive" && contract?.allow_sublease,
  );
  const cType = String(contract?.contract_type || "");

  if (isCohost) {
    const splitPct = Number(contract?.cohost_split_pct || 80);
    return {
      isCohost: true,
      badgeLabel: `Coanfitrião (${splitPct}% Repasse)`,
      shortTitle: "Sala Exclusiva • Modo Coanfitrião",
      badgeClass: "bg-emerald-50 text-emerald-800 border-emerald-200",
    };
  }

  if (cType === "monthly_exclusive") {
    return {
      isCohost: false,
      badgeLabel: "Sala Exclusiva Fixa",
      shortTitle: "Contrato Mensal • Uso Exclusivo",
      badgeClass: "bg-slate-900 text-white border-slate-900",
    };
  }

  if (cType === "fixed_shift") {
    return {
      isCohost: false,
      badgeLabel: "Turno Fixo Semanal",
      shortTitle: "Contrato de Turno Fixo",
      badgeClass: "bg-stone-100 text-stone-800 border-stone-200",
    };
  }

  return {
    isCohost: false,
    badgeLabel: "Diária Fixa Semanal",
    shortTitle: "Contrato de Diária Fixa",
    badgeClass: "bg-stone-100 text-stone-800 border-stone-200",
  };
}

function formatContractScheduleDescription(contract: any): string {
  if (!contract) return "";
  if (
    contract.contract_type === "monthly_exclusive" &&
    !contract.allow_sublease
  ) {
    return "Acesso integral à sala durante toda a vigência";
  }

  const sched = parseScheduleObj(contract.schedule_config);
  const daysArr: number[] = Array.isArray(sched.daysOfWeek)
    ? sched.daysOfWeek.map(Number)
    : [];
  const dayNames = daysArr
    .map((d) => WEEKDAYS.find((w) => w.day === d)?.short)
    .filter(Boolean)
    .join(", ");

  const startH = String(sched.startHour ?? 8).padStart(2, "0");
  const endH = String(sched.endHour ?? 20).padStart(2, "0");

  if (contract.allow_sublease) {
    return `Sublocação ativa (${startH}h às ${endH}h)`;
  }

  return `${dayNames || "Dias fixos"} • ${startH}:00 às ${endH}:00`;
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
  const [uploadingPdf, setUploadingPdf] = useState(false);

  const [contracts, setContracts] = useState<any[]>([]);
  const [roomsById, setRoomsById] = useState<Record<string, any>>({});
  const [selectedContractId, setSelectedContractId] = useState<string>("");

  // Reservas de terceiros (quando Coanfitrião)
  const [subleaseBookings, setSubleaseBookings] = useState<any[]>([]);
  const [secondaryContracts, setSecondaryContracts] = useState<any[]>([]);

  // Sessões garantidas do próprio profissional (quando Turno Fixo / Diária Fixa / Sala Fixa)
  const [ownContractBookings, setOwnContractBookings] = useState<any[]>([]);

  const [userProfile, setUserProfile] = useState<any | null>(null);

  const [periodPreset, setPeriodPreset] =
    useState<PeriodPreset>("current_month");
  const [customStartDate, setCustomStartDate] = useState(
    format(startOfMonth(new Date()), "yyyy-MM-dd"),
  );
  const [customEndDate, setCustomEndDate] = useState(
    format(endOfMonth(new Date()), "yyyy-MM-dd"),
  );

  const [invoiceCompetence, setInvoiceCompetence] = useState<string>(() =>
    format(new Date(), "yyyy-MM"),
  );

  // Estados do Modal de Pagamento da Mensalidade (PIX / Boleto / Cartão)
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [payMethod, setPayMethod] = useState<"PIX" | "BOLETO" | "CREDIT_CARD">(
    "BOLETO",
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

  const [bookingListTab, setBookingListTab] = useState<"upcoming" | "past">(
    "upcoming",
  );

  const [editingScheduleRoomId, setEditingScheduleRoomId] = useState<
    string | null
  >(null);

  const activeContract = useMemo(() => {
    if (contracts.length === 0) return null;
    return (
      contracts.find((c) => c.id === selectedContractId) || contracts[0] || null
    );
  }, [contracts, selectedContractId]);

  const roomData = useMemo(() => {
    if (!activeContract) return null;
    return roomsById[activeContract.room_id] || null;
  }, [activeContract, roomsById]);

  const activeModalityMeta = useMemo(
    () => getContractModalityMeta(activeContract),
    [activeContract],
  );

  const isCohostMode = activeModalityMeta.isCohost;

  // Ajusta a competência selecionada caso o contrato selecionado comece no futuro ou já tenha encerrado
  useEffect(() => {
    if (!activeContract) return;
    const currentComp = format(new Date(), "yyyy-MM");
    const startComp = String(activeContract.start_date || "").slice(0, 7);
    const endComp = String(activeContract.end_date || "").slice(0, 7);

    if (startComp && currentComp < startComp) {
      setInvoiceCompetence(startComp);
    } else if (endComp && currentComp > endComp) {
      setInvoiceCompetence(endComp);
    } else {
      setInvoiceCompetence(currentComp);
    }
  }, [activeContract]);

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

      return {
        rawStart,
        rawEnd,
        start: effectiveStart,
        end: effectiveEnd,
        contractStart,
        contractEnd,
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
      label,
    };
  }, [
    periodPreset,
    customStartDate,
    customEndDate,
    activeContract?.start_date,
    activeContract?.end_date,
  ]);

  // 1. Carrega TODOS os contratos do especialista (Coanfitrião, Sala Fixa Exclusiva, Turno Fixo e Diária Fixa)
  const loadAllUserContractsAndRooms = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: profData } = await supabase
        .from("profiles")
        .select(
          "id, full_name, email, cpf, cep, phone, whatsapp, cc_token, cc_last4, cc_brand",
        )
        .eq("id", user.id)
        .maybeSingle();

      if (profData) {
        setUserProfile(profData);
        setCustomerCpf(profData.cpf || "");
        setCustomerCep(profData.cep || "");
        setCardHolder(profData.full_name || "");
        setUseSavedCard(Boolean(profData.cc_token));
      }

      let contractsQuery = supabase
        .from("room_contracts")
        .select("*")
        .in("status", ["active", "pending_signature"])
        .order("created_at", { ascending: false });

      if (user.email) {
        contractsQuery = contractsQuery.or(
          `specialist_id.eq.${user.id},specialist_email.ilike.${user.email}`,
        );
      } else {
        contractsQuery = contractsQuery.eq("specialist_id", user.id);
      }

      const { data: userContracts, error: cErr } = await contractsQuery;
      if (cErr) throw cErr;

      const validContracts = userContracts || [];

      if (validContracts.length === 0) {
        setContracts([]);
        setRoomsById({});
        setLoading(false);
        return;
      }

      const roomIds = Array.from(
        new Set(validContracts.map((c: any) => c.room_id).filter(Boolean)),
      );

      const { data: roomsData } = await supabase
        .from("rooms")
        .select("*, profiles:host_id(full_name)")
        .in("id", roomIds);

      const rMap: Record<string, any> = {};
      (roomsData || []).forEach((r: any) => {
        rMap[r.id] = r;
      });

      setRoomsById(rMap);
      setContracts(validContracts);
      setSelectedContractId((prev) =>
        prev && validContracts.some((c: any) => c.id === prev)
          ? prev
          : validContracts[0].id,
      );
    } catch (err) {
      console.error("Erro ao carregar contratos do profissional:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  // 2. Carrega os dados operacionais da sala/contrato selecionado
  const loadSelectedContractOperationalData = useCallback(async () => {
    if (!activeContract || !roomData) return;

    try {
      const contractStartIso = startOfDay(
        parseISO(activeContract.start_date),
      ).toISOString();
      const contractEndIso = endOfDay(
        parseISO(activeContract.end_date),
      ).toISOString();

      const [roomSubContractsRes, bookingsRes] = await Promise.all([
        supabase
          .from("room_contracts")
          .select("*")
          .eq("room_id", activeContract.room_id)
          .eq("status", "active")
          .neq("id", activeContract.id)
          .lte("start_date", activeContract.end_date)
          .gte("end_date", activeContract.start_date)
          .order("start_date", { ascending: true }),
        supabase
          .from("bookings")
          .select(
            "id, user_id, start_time, end_time, status, total_cost, agreed_value_brl, contract_id, booking_origin, created_at",
          )
          .eq("room_id", activeContract.room_id)
          .in("status", [
            "confirmed",
            "in_progress",
            "completed",
            "pending_payment",
          ])
          .gte("start_time", contractStartIso)
          .lte("start_time", contractEndIso)
          .order("start_time", { ascending: true }),
      ]);

      const allRoomBookings = bookingsRes.data || [];

      // A) Separa as sessões garantidas do próprio contrato (para Turno Fixo / Diária Fixa / Sala Exclusiva)
      const myContractSessions = allRoomBookings
        .filter((b: any) => b.contract_id === activeContract.id)
        .map((b: any) => ({
          ...b,
          hours: calculateSlotUnits(b.start_time, b.end_time),
        }));
      setOwnContractBookings(myContractSessions);

      // B) Se for Modo Coanfitrião, processa as sublocações de terceiros
      const subContracts = roomSubContractsRes.data || [];
      setSecondaryContracts(subContracts);
      const subContractsMap = new Map<string, any>(
        subContracts.map((sc: any) => [sc.id, sc]),
      );

      const validSubleaseBookings = allRoomBookings.filter((b: any) => {
        if (b.status === "pending_payment") return false;
        if (b.contract_id && b.contract_id === activeContract.id) {
          return false;
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

      let addr = roomData?.address_details || {};
      if (typeof addr === "string") {
        try {
          addr = JSON.parse(addr);
        } catch {
          addr = {};
        }
      }
      const roomHourlyRate = Number(addr?.pricing?.hourly || 45);
      const cohostPctGlobal =
        Number(activeContract.cohost_split_pct || 80) / 100;

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
      console.error("Erro ao carregar dados operacionais do contrato:", err);
    }
  }, [supabase, activeContract, roomData]);

  useEffect(() => {
    loadAllUserContractsAndRooms();
  }, [loadAllUserContractsAndRooms]);

  useEffect(() => {
    loadSelectedContractOperationalData();
  }, [loadSelectedContractOperationalData]);

  // Polling automático de confirmação de pagamento da mensalidade no Asaas
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
              title: "Pagamento Confirmado",
              description: `A fatura da competência ${invoiceCompetence} (${roomData?.name || "Contrato"}) foi quitada automaticamente.`,
            });
            setIsPayModalOpen(false);
            setGeneratedPaymentId(null);
            loadAllUserContractsAndRooms();
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(timer);
  }, [
    isPayModalOpen,
    generatedPaymentId,
    activeContract,
    roomData?.name,
    invoiceCompetence,
    toast,
    loadAllUserContractsAndRooms,
  ]);

  // Calcula os detalhes de fatura de qualquer contrato para uma competência (YYYY-MM)
  const computeContractInvoiceForCompetence = useCallback(
    (contractObj: any, comp: string) => {
      if (!contractObj || !comp) return null;

      const sched = parseScheduleObj(contractObj.schedule_config);
      const tiers = Array.isArray(sched.pricingTiers) ? sched.pricingTiers : [];

      const dueDayRaw = Math.max(
        1,
        Math.min(31, Number(contractObj.due_day) || 8),
      );
      const [yearStr, monthStr] = comp.split("-");
      const maxDays = getDaysInMonth(
        new Date(Number(yearStr), Number(monthStr) - 1, 1),
      );
      const safeDay = String(Math.min(dueDayRaw, maxDays)).padStart(2, "0");
      const dueDateIso = `${comp}-${safeDay}`;

      let baseRent =
        Number(contractObj.contract_value) > 0
          ? Number(contractObj.contract_value)
          : Number(contractObj.session_value || 0);

      if (tiers.length > 0) {
        const matchedTier = tiers.find(
          (t: any) => dueDateIso >= t.start_date && dueDateIso <= t.end_date,
        );
        if (matchedTier && Number(matchedTier.contract_value) > 0) {
          baseRent = Number(matchedTier.contract_value);
        }
      }

      const finePct = Number(sched.fine_pct ?? contractObj.fine_pct ?? 2);
      const interestPct = Number(
        sched.interest_pct ?? contractObj.interest_pct ?? 1,
      );

      const isPaid =
        contractObj.last_paid_competence === comp ||
        Boolean(sched.paid_dates && sched.paid_dates[comp]);

      const paidDateStr =
        sched.paid_dates && sched.paid_dates[comp]
          ? sched.paid_dates[comp]
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
        competence: comp,
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
    },
    [],
  );

  const invoiceDetails = useMemo(
    () =>
      computeContractInvoiceForCompetence(activeContract, invoiceCompetence),
    [activeContract, invoiceCompetence, computeContractInvoiceForCompetence],
  );

  // Gera a linha do tempo de todas as competências (meses) do contrato ativo
  const contractMonthsTimeline = useMemo(() => {
    if (!activeContract?.start_date || !activeContract?.end_date) return [];
    try {
      const s = startOfMonth(parseISO(activeContract.start_date));
      const e = startOfMonth(parseISO(activeContract.end_date));
      if (isNaN(s.getTime()) || isNaN(e.getTime()) || e < s) return [];

      const months = eachMonthOfInterval({ start: s, end: e }).slice(0, 24);
      return months.map((mDate) => {
        const comp = format(mDate, "yyyy-MM");
        const label = format(mDate, "MMM/yy", { locale: ptBR });
        const inv = computeContractInvoiceForCompetence(activeContract, comp);
        return {
          comp,
          label,
          inv,
        };
      });
    } catch {
      return [];
    }
  }, [activeContract, computeContractInvoiceForCompetence]);

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
          title: "Fatura Quitada com Sucesso",
          description: `A competência ${invoiceCompetence} (${roomData?.name || ""}) foi paga e baixada.`,
        });
        setIsPayModalOpen(false);
        loadAllUserContractsAndRooms();
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

  const handleUploadContractPdf = async (file: File | undefined) => {
    if (!file || !activeContract) return;
    setUploadingPdf(true);
    try {
      const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
      const filePath = `${activeContract.room_id}/${Date.now()}_${cleanName}`;

      const { error: uploadErr } = await supabase.storage
        .from("contracts")
        .upload(filePath, file, {
          cacheControl: "3600",
          upsert: true,
          contentType: file.type || "application/pdf",
        });

      if (uploadErr) throw uploadErr;

      const { data: pubData } = supabase.storage
        .from("contracts")
        .getPublicUrl(filePath);

      const { error: updateErr } = await supabase
        .from("room_contracts")
        .update({
          pdf_url: pubData.publicUrl,
          pdf_filename: file.name,
          updated_at: new Date().toISOString(),
        })
        .eq("id", activeContract.id);

      if (updateErr) throw updateErr;

      setContracts((prev) =>
        prev.map((c) =>
          c.id === activeContract.id
            ? { ...c, pdf_url: pubData.publicUrl, pdf_filename: file.name }
            : c,
        ),
      );

      toast({
        title: "Contrato PDF anexado",
        description: `O documento do contrato de ${roomData?.name || ""} foi salvo.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao anexar documento",
        description: err.message,
      });
    } finally {
      setUploadingPdf(false);
    }
  };

  // Filtra sublocações no período (Modo Coanfitrião)
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

  const { upcomingBookings, pastBookings } = useMemo(() => {
    const nowMs = Date.now();
    const sourceList = isCohostMode
      ? bookingsInSelectedPeriod
      : ownContractBookings;

    const upcoming: any[] = [];
    const past: any[] = [];

    sourceList.forEach((b) => {
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
  }, [isCohostMode, bookingsInSelectedPeriod, ownContractBookings]);

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
            loadAllUserContractsAndRooms();
          }}
          onSave={() => {
            setEditingScheduleRoomId(null);
            loadAllUserContractsAndRooms();
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
          Carregando suas salas e contratos...
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
          Nenhuma sala ou contrato fixo vinculado
        </h2>
        <p className="text-sm text-slate-500 max-w-md mx-auto leading-relaxed">
          Quando você possui um contrato de Sala Exclusiva, Modo Coanfitrião,
          Turno Fixo ou Diária Fixa, este painel reúne seus boletos, contratos
          em PDF, horários e repasses em um só lugar.
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
    if (!isCohostMode) return;
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

      setRoomsById((prev) => ({
        ...prev,
        [roomData.id]: {
          ...roomData,
          availability: newAvailabilityPayload,
        },
      }));

      const targetDayObj = WEEKDAYS.find((w) => w.day === dayNumber);
      const isNowOpen = updatedWeek.find((w) => w.day === dayNumber)?.enabled;

      toast({
        title: isNowOpen
          ? `${targetDayObj?.name}: Aberta para sublocar`
          : `${targetDayObj?.name}: Reservada para seu uso`,
        description: isNowOpen
          ? `Outros profissionais já podem reservar os horários livres de ${roomData.name}.`
          : `Este dia foi fechado em ${roomData.name} para seu atendimento exclusivo.`,
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
    <div className="p-4 pt-6 lg:p-8 max-w-5xl mx-auto w-full pb-32 space-y-6 animate-in fade-in duration-200 font-sans">
      {/* ================================================================== */}
      {/* 1. VITRINE SELETORA: MINHAS SALAS E CONTRATOS FIXOS (COM FOTOS)    */}
      {/* ================================================================== */}
      <div className="space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-2">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#BF4B24]">
              Minhas Salas & Contratos Fixos
            </span>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {contracts.length > 1
                ? `Seus Espaços Contratados (${contracts.length})`
                : "Meu Espaço Contratado"}
            </h1>
            <p className="text-xs text-slate-500 mt-0.5">
              Toque em uma sala abaixo para acessar o boleto do mês, o contrato
              em PDF, seus horários fixos ou seus repasses de coanfitrião.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {contracts.map((contractItem) => {
            const rObj = roomsById[contractItem.room_id];
            if (!rObj) return null;

            const isSelected = contractItem.id === activeContract.id;
            const coverImg = getRoomCoverImage(rObj);
            const currentMonthComp = format(new Date(), "yyyy-MM");
            const itemInvoice = computeContractInvoiceForCompetence(
              contractItem,
              currentMonthComp,
            );
            const modalityMeta = getContractModalityMeta(contractItem);
            const scheduleDesc =
              formatContractScheduleDescription(contractItem);

            return (
              <button
                key={contractItem.id}
                type="button"
                onClick={() => setSelectedContractId(contractItem.id)}
                className={`group text-left rounded-2xl border overflow-hidden transition-all flex flex-col justify-between cursor-pointer ${
                  isSelected
                    ? "bg-white border-[#BF4B24] ring-2 ring-[#BF4B24]/20 shadow-md"
                    : "bg-white border-slate-200/90 opacity-85 hover:opacity-100 hover:border-slate-300"
                }`}
              >
                <div>
                  <div className="relative h-36 w-full bg-stone-100 overflow-hidden">
                    {coverImg ? (
                      <img
                        src={coverImg}
                        alt={rObj.name}
                        className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        <Building2 className="w-10 h-10" />
                      </div>
                    )}

                    <div className="absolute top-2.5 left-2.5">
                      <span
                        className={`px-2.5 py-1 rounded-lg text-[10px] font-bold shadow-xs backdrop-blur-xs ${
                          isSelected
                            ? "bg-[#BF4B24] text-white"
                            : "bg-slate-900/85 text-white"
                        }`}
                      >
                        {modalityMeta.badgeLabel}
                      </span>
                    </div>

                    {itemInvoice && (
                      <div className="absolute bottom-2.5 right-2.5">
                        {itemInvoice.isPaid ? (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-600 text-white text-[10px] font-bold shadow-xs">
                            Mês Quitado
                          </span>
                        ) : itemInvoice.isOverdue ? (
                          <span className="px-2 py-0.5 rounded-md bg-red-600 text-white text-[10px] font-bold shadow-xs">
                            Fatura em Aberto
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-md bg-white/95 text-slate-800 text-[10px] font-bold shadow-xs">
                            Vence dia{" "}
                            {String(itemInvoice.dueDayRaw).padStart(2, "0")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>

                  <div className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="text-sm font-bold text-slate-900 truncate">
                        {rObj.name}
                      </h3>
                    </div>

                    <p className="text-[11px] font-medium text-slate-500 mt-0.5 truncate">
                      {rObj.profiles?.full_name || "Fusion Clinic"}
                    </p>

                    <p className="text-xs font-semibold text-slate-700 mt-2 flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5 text-[#BF4B24] shrink-0" />
                      <span className="truncate">{scheduleDesc}</span>
                    </p>

                    <p className="text-[11px] text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">
                      {rObj.description ||
                        "Espaço clínico pronto para atendimento com estrutura completa."}
                    </p>
                  </div>
                </div>

                <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between text-xs tabular-nums">
                  <div>
                    <span className="text-[10px] text-slate-400 block">
                      Valor do Contrato
                    </span>
                    <strong className="text-slate-900 font-bold">
                      R${" "}
                      {formatBRL(
                        itemInvoice?.baseRent ||
                          contractItem.contract_value ||
                          0,
                      )}
                      {contractItem.billing_cycle === "monthly" ? "/mês" : ""}
                    </strong>
                  </div>

                  <span
                    className={`text-[11px] font-bold ${
                      isSelected ? "text-[#BF4B24]" : "text-slate-500"
                    }`}
                  >
                    {isSelected ? "Visualizando" : "Ver boletos e detalhes"}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* ================================================================== */}
      {/* 2. CABEÇALHO E COFRE DO CONTRATO PDF DA SALA SELECIONADA           */}
      {/* ================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 mb-1.5">
              <span
                className={`inline-flex items-center px-2.5 py-0.5 rounded-md text-[11px] font-bold border ${activeModalityMeta.badgeClass}`}
              >
                {activeModalityMeta.shortTitle}
              </span>
              {activeContract.status === "pending_signature" && (
                <Badge className="bg-amber-50 text-amber-800 border border-amber-200 text-[11px] font-semibold">
                  Aguardando Assinatura
                </Badge>
              )}
            </div>

            <h2 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
              {roomData.name}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              {roomData.profiles?.full_name || "Fusion Clinic"} • Vigência:{" "}
              <strong className="text-slate-700">
                {format(parseISO(activeContract.start_date), "dd/MM/yyyy")} a{" "}
                {format(parseISO(activeContract.end_date), "dd/MM/yyyy")}
              </strong>{" "}
              • {formatContractScheduleDescription(activeContract)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            {activeContract.pdf_url ? (
              <a
                href={activeContract.pdf_url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center gap-2 px-4 h-10 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors"
              >
                <FileCheck2 className="w-4 h-4 text-emerald-600" />
                Baixar Contrato PDF
                <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
              </a>
            ) : (
              <label className="inline-flex items-center justify-center gap-2 px-4 h-10 rounded-xl border border-dashed border-slate-300 bg-slate-50 hover:bg-slate-100 text-slate-700 font-semibold text-xs cursor-pointer transition-colors">
                {uploadingPdf ? (
                  <Loader2 className="w-4 h-4 animate-spin text-[#BF4B24]" />
                ) : (
                  <UploadCloud className="w-4 h-4 text-[#BF4B24]" />
                )}
                Anexar Contrato Assinado (PDF)
                <input
                  type="file"
                  accept="application/pdf"
                  className="hidden"
                  onChange={(e) => handleUploadContractPdf(e.target.files?.[0])}
                />
              </label>
            )}

            {isCohostMode && (
              <Button
                onClick={() => setEditingScheduleRoomId(roomData.id)}
                className="h-10 px-4 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs cursor-pointer"
              >
                <SlidersHorizontal className="w-4 h-4 mr-2" />
                Configurar Horários da Sala
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* 3. CENTRAL DE FATURAS E BOLETOS DO CONTRATO (PARA TODOS OS TIPOS)  */}
      {/* ================================================================== */}
      {invoiceDetails && (
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 sm:p-6 shadow-2xs space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CalendarClock className="w-5 h-5 text-[#BF4B24]" />
                  Faturas e Boletos do Contrato — {roomData.name}
                </h2>
                {invoiceDetails.isPaid ? (
                  <Badge className="bg-emerald-50 text-emerald-700 border-0 text-xs font-semibold flex items-center gap-1">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Competência Quitada
                  </Badge>
                ) : invoiceDetails.isOverdue ? (
                  <Badge className="bg-red-50 text-red-700 border-0 text-xs font-semibold flex items-center gap-1">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    Vencida há {invoiceDetails.daysLate} dia(s)
                  </Badge>
                ) : (
                  <Badge className="bg-amber-50 text-amber-800 border-0 text-xs font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Vence em{" "}
                    {format(parseISO(invoiceDetails.dueDateIso), "dd/MM/yyyy")}
                  </Badge>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Vencimento todo dia{" "}
                <strong>
                  {String(invoiceDetails.dueDayRaw).padStart(2, "0")}
                </strong>
                . Selecione o mês abaixo para emitir seu boleto registrado, QR
                Code PIX ou pagar com cartão.
              </p>
            </div>

            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-1.5 self-start sm:self-auto">
              <span className="text-xs font-semibold text-slate-500">
                Competência:
              </span>
              <input
                type="month"
                min={activeContract.start_date.slice(0, 7)}
                max={activeContract.end_date.slice(0, 7)}
                value={invoiceCompetence}
                onChange={(e) => setInvoiceCompetence(e.target.value)}
                className="text-xs font-bold text-slate-900 bg-transparent border-0 outline-none"
              />
            </div>
          </div>

          {/* Linha do Tempo Rápida das Competências (Meses do Contrato) */}
          {contractMonthsTimeline.length > 0 && (
            <div>
              <span className="text-[11px] font-semibold text-slate-500 block mb-2">
                Parcelas / Meses de Vigência deste Contrato:
              </span>
              <div className="flex items-center gap-2 overflow-x-auto pb-1.5 no-scrollbar tabular-nums">
                {contractMonthsTimeline.map((mItem) => {
                  const isSelectedComp = mItem.comp === invoiceCompetence;
                  const inv = mItem.inv;
                  return (
                    <button
                      key={mItem.comp}
                      type="button"
                      onClick={() => setInvoiceCompetence(mItem.comp)}
                      className={`px-3 py-2 rounded-xl border text-left transition-all shrink-0 cursor-pointer min-w-[115px] ${
                        isSelectedComp
                          ? "bg-slate-900 text-white border-slate-900 shadow-2xs"
                          : inv?.isPaid
                            ? "bg-emerald-50/60 text-emerald-900 border-emerald-200 hover:bg-emerald-50"
                            : inv?.isOverdue
                              ? "bg-red-50/70 text-red-900 border-red-200 hover:bg-red-50"
                              : "bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1.5">
                        <span className="text-xs font-bold capitalize">
                          {mItem.label}
                        </span>
                        <span
                          className={`w-2 h-2 rounded-full ${
                            inv?.isPaid
                              ? "bg-emerald-500"
                              : inv?.isOverdue
                                ? "bg-red-500"
                                : "bg-amber-400"
                          }`}
                        />
                      </div>
                      <span
                        className={`text-[10px] font-semibold block mt-0.5 ${
                          isSelectedComp ? "text-slate-300" : "opacity-80"
                        }`}
                      >
                        {inv?.isPaid
                          ? "Quitado"
                          : inv?.isOverdue
                            ? "Em atraso"
                            : `R$ ${formatBRL(inv?.baseRent || 0)}`}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Detalhe e Botões de Pagamento do Mês Selecionado */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5 pt-2 border-t border-slate-100">
            <div className="space-y-1.5 tabular-nums">
              <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-600">
                <span>
                  Valor Contratual ({roomData.name}):{" "}
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
                  Fatura da competência {invoiceCompetence} quitada
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
                      ? "Total Atualizado"
                      : "Valor da Fatura"}
                </span>
                <span
                  className={`text-2xl font-bold tracking-tight ${
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
                    onClick={() => handleOpenInvoicePayment("BOLETO")}
                    className="bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs h-10 rounded-xl px-4 cursor-pointer"
                  >
                    <Barcode className="w-4 h-4 mr-1.5" />
                    Emitir Boleto
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenInvoicePayment("PIX")}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-10 rounded-xl px-4 cursor-pointer"
                  >
                    <QrCode className="w-4 h-4 mr-1.5 text-[#BF4B24]" />
                    Pagar c/ PIX
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleOpenInvoicePayment("CREDIT_CARD")}
                    className="border-slate-200 text-slate-700 hover:bg-slate-50 font-semibold text-xs h-10 rounded-xl px-4 cursor-pointer"
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

      {/* ================================================================== */}
      {/* 4. BLOCOS EXCLUSIVOS DO MODO COANFITRIÃO (RENDIMENTO E VITRINE)    */}
      {/* ================================================================== */}
      {isCohostMode ? (
        <>
          {/* Seletor de Período para Rendimentos de Sublocação */}
          <div className="bg-white rounded-2xl border border-slate-200/90 p-4 shadow-2xs space-y-3">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <Filter className="w-3.5 h-3.5 text-[#BF4B24]" />
                  <span>Rendimento de sublocações em {roomData.name}:</span>
                  <span className="text-slate-900 capitalize font-bold">
                    {dateRange.label}
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                  <Info className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  Repasses contabilizados a partir de{" "}
                  <strong className="text-slate-700">
                    {format(parseISO(activeContract.start_date), "dd/MM/yyyy")}
                  </strong>
                  .
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
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
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
              <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    De:
                  </span>
                  <input
                    type="date"
                    min={activeContract.start_date}
                    max={activeContract.end_date}
                    value={customStartDate}
                    onChange={(e) => setCustomStartDate(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50"
                  />
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-500">
                    Até:
                  </span>
                  <input
                    type="date"
                    min={activeContract.start_date}
                    max={activeContract.end_date}
                    value={customEndDate}
                    onChange={(e) => setCustomEndDate(e.target.value)}
                    className="h-9 px-3 rounded-lg border border-slate-200 text-xs font-semibold text-slate-800 bg-slate-50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Cards de Rendimento de Sublocação */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 tabular-nums">
            <div className="md:col-span-2 bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <span className="text-xs font-semibold text-slate-500">
                    Seu Ganho Líquido de Sublocação ({roomData.name})
                  </span>
                  <div className="flex items-baseline gap-2 mt-1">
                    <p className="text-3xl font-bold text-emerald-700">
                      R$ {formatBRL(totalCohostNet80)}
                    </p>
                    <span className="text-xs text-slate-400">
                      de R$ {formatBRL(totalGrossSubleased)} bruto sublocado
                    </span>
                  </div>
                </div>
                <div className="w-10 h-10 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center shrink-0">
                  <Wallet className="w-5 h-5 text-emerald-700" />
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100">
                <div className="flex items-center justify-between text-xs mb-2">
                  <span className="font-medium text-slate-600">
                    Abatimento sobre a mensalidade desta sala (R${" "}
                    {formatBRL(monthlyFixedRent)})
                  </span>
                  <span className="font-bold text-slate-900">
                    {rentCoveragePct}% coberto pelas sublocações
                  </span>
                </div>
                <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-600 rounded-full transition-all duration-500"
                    style={{ width: `${rentCoveragePct}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-semibold text-slate-500">
                    Horas Sublocadas
                  </span>
                  <Clock className="w-4 h-4 text-[#BF4B24]" />
                </div>
                <p className="text-3xl font-bold text-slate-900 mt-1">
                  {totalHoursSubleased}h
                </p>
                <p className="text-xs text-slate-500 mt-0.5">
                  Em {bookingsInSelectedPeriod.length} reserva(s) no período
                </p>
              </div>

              <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500">Seu repasse avulso:</span>
                <span className="font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md">
                  {cohostSplitPct}% Líquido
                </span>
              </div>
            </div>
          </div>

          {/* Subcontratos Fixos de Terceiros na Sala */}
          {secondaryContracts.length > 0 && (
            <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Repeat className="w-4 h-4 text-[#BF4B24]" />
                    Subcontratos Fixos em {roomData.name}
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Profissionais com turnos ou diárias fixas recorrentes dentro
                    desta sala.
                  </p>
                </div>
                <Badge className="bg-slate-900 text-white border-0 text-xs font-semibold w-fit">
                  {secondaryContracts.length} subcontrato(s)
                </Badge>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 tabular-nums">
                {secondaryContracts.map((sc) => {
                  const scDays = (sc.schedule_config?.daysOfWeek || [])
                    .map(
                      (d: number) => WEEKDAYS.find((w) => w.day === d)?.short,
                    )
                    .filter(Boolean)
                    .join(", ");
                  const startH = String(
                    sc.schedule_config?.startHour ?? 8,
                  ).padStart(2, "0");
                  const endH = String(
                    sc.schedule_config?.endHour ?? 20,
                  ).padStart(2, "0");

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
                          <p className="font-bold text-slate-900 text-sm">
                            {sc.specialist_name}
                          </p>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {scDays} • {startH}:00 às {endH}:00
                          </p>
                        </div>
                        <Badge className="bg-slate-200 text-slate-800 border-0 text-[10px] font-semibold">
                          {sc.contract_type === "fixed_shift"
                            ? "Turno Fixo"
                            : "Diária Fixa"}
                        </Badge>
                      </div>

                      <div className="pt-2.5 border-t border-slate-200/80 flex items-center justify-between text-xs">
                        <span className="text-slate-500">
                          {format(parseISO(sc.start_date), "dd/MM/yy")} a{" "}
                          {format(parseISO(sc.end_date), "dd/MM/yy")}
                        </span>
                        <span className="font-bold text-emerald-700">
                          Seu repasse ({scCohostPct}%): R${" "}
                          {formatBRL(scCohostNet)}/mês
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Controle de Disponibilidade da Semana (Apenas Coanfitrião) */}
          <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-5">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-base font-bold text-slate-900">
                    Disponibilidade para Sublocação — {roomData.name}
                  </h2>
                  <Badge className="bg-slate-100 text-slate-700 border-0 text-xs font-semibold">
                    {openDaysCount} de 7 dias abertos
                  </Badge>
                </div>
                <p className="text-xs text-slate-500 mt-0.5 max-w-lg">
                  Clique em um dia para alternar entre{" "}
                  <strong className="text-slate-800">Meu Uso Exclusivo</strong>{" "}
                  e{" "}
                  <strong className="text-emerald-700">
                    Aberto para Sublocar
                  </strong>
                  .
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => setEditingScheduleRoomId(roomData.id)}
                className="rounded-xl font-semibold border-slate-200 text-slate-700 hover:bg-slate-50 shrink-0 h-9 text-xs cursor-pointer"
              >
                Editar horas por dia
                <ArrowUpRight className="w-3.5 h-3.5 ml-1" />
              </Button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-7 gap-2.5">
              {WEEKDAYS.map((wd) => {
                const cfg = currentWeekConfig.find(
                  (c: any) => c.day === wd.day,
                );
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
                    className={`p-3.5 rounded-xl border text-left transition-all flex flex-col justify-between min-h-[108px] cursor-pointer ${
                      isOpenForSublease
                        ? "border-emerald-600/40 bg-emerald-50/40 hover:bg-emerald-50/80"
                        : "border-slate-200 bg-slate-50/70 hover:bg-slate-100/70"
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <span className="text-sm font-bold text-slate-900">
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
                          <span className="inline-block text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded">
                            Sublocando
                          </span>
                          <p className="text-[11px] font-semibold text-emerald-800">
                            {hoursCount}h livres
                          </p>
                        </>
                      ) : (
                        <>
                          <span className="inline-block text-[10px] font-semibold bg-slate-200 text-slate-700 px-2 py-0.5 rounded">
                            Meu Uso
                          </span>
                          <p className="text-[11px] text-slate-500">Fechado</p>
                        </>
                      )}

                      {fixedTenantsOnDay.length > 0 && (
                        <span
                          title={`Turno/Diária Fixa: ${fixedTenantsOnDay.join(", ")}`}
                          className="block text-[9px] font-semibold bg-amber-100 text-amber-900 px-1.5 py-0.5 rounded truncate"
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
        </>
      ) : (
        /* ================================================================== */
        /* 4B. BLOCO PARA CONTRATO FIXO SEM SUBLOCAÇÃO / TURNO / DIÁRIA FIXA  */
        /* ================================================================== */
        <div className="bg-white p-5 sm:p-6 rounded-2xl border border-slate-200/90 shadow-2xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-stone-100 border border-stone-200 flex items-center justify-center text-[#BF4B24] shrink-0">
                <ShieldCheck className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  Resumo da Sua Alocação Fixa — {roomData.name}
                </h2>
                <p className="text-xs text-slate-500">
                  Este contrato garante reserva automática na agenda da sala sem
                  gerar sublocações a terceiros.
                </p>
              </div>
            </div>

            <Badge className="bg-slate-900 text-white border-0 text-xs font-semibold w-fit">
              Uso Próprio Garantido
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs tabular-nums">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[11px] text-slate-500 block">
                Modalidade Contratada
              </span>
              <strong className="text-sm font-bold text-slate-900 mt-0.5 block">
                {activeModalityMeta.shortTitle}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[11px] text-slate-500 block">
                Dias e Horários Reservados
              </span>
              <strong className="text-sm font-bold text-slate-900 mt-0.5 block">
                {formatContractScheduleDescription(activeContract)}
              </strong>
            </div>

            <div className="p-4 rounded-xl bg-slate-50 border border-slate-200/80">
              <span className="text-[11px] text-slate-500 block">
                Datas Alocadas na Agenda
              </span>
              <strong className="text-sm font-bold text-emerald-700 mt-0.5 block">
                {ownContractBookings.length > 0
                  ? `${ownContractBookings.length} sessões garantidas`
                  : "Sala 100% reservada p/ você"}
              </strong>
            </div>
          </div>
        </div>
      )}

      {/* ================================================================== */}
      {/* 5. LISTA DE RESERVAS (SUBLOCAÇÕES SE CO-HOST | PRÓPRIAS SE FIXO)   */}
      {/* ================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-5 sm:p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              {isCohostMode
                ? `Sublocações de Terceiros em ${roomData.name}`
                : `Suas Datas Garantidas em ${roomData.name}`}
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              {isCohostMode
                ? "Reservas realizadas por outros profissionais nos seus horários livres."
                : "Datas e turnos bloqueados exclusivamente para o seu atendimento neste contrato."}
            </p>
          </div>

          <div className="flex bg-slate-100 p-1 rounded-xl shrink-0">
            <button
              type="button"
              onClick={() => setBookingListTab("upcoming")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                bookingListTab === "upcoming"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <CalendarCheck className="w-3.5 h-3.5 text-[#BF4B24]" />
              Próximas ({upcomingBookings.length})
            </button>
            <button
              type="button"
              onClick={() => setBookingListTab("past")}
              className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                bookingListTab === "past"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              <History className="w-3.5 h-3.5 text-slate-500" />
              Realizadas ({pastBookings.length})
            </button>
          </div>
        </div>

        {displayedBookings.length === 0 ? (
          <div className="py-14 text-center px-4">
            <CalendarDays className="w-9 h-9 text-slate-200 mx-auto mb-2" />
            <p className="text-xs font-semibold text-slate-600">
              {isCohostMode
                ? bookingListTab === "upcoming"
                  ? `Nenhuma sublocação futura agendada em ${roomData.name}.`
                  : `Nenhuma sublocação anterior registrada em ${roomData.name} neste período.`
                : activeContract.contract_type === "monthly_exclusive"
                  ? `Sua sala (${roomData.name}) está 100% bloqueada para seu uso exclusivo durante toda a vigência.`
                  : "Nenhuma sessão listada nesta aba."}
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 tabular-nums">
            {displayedBookings.map((b) => {
              const startDt = parseISO(b.start_time);
              const endDt = parseISO(b.end_time);
              return (
                <div
                  key={b.id}
                  className="p-4 sm:px-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4 hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start sm:items-center gap-3.5">
                    <div className="w-11 h-11 rounded-xl bg-slate-100 border border-slate-200/80 flex flex-col items-center justify-center shrink-0">
                      <span className="text-[10px] font-semibold uppercase text-slate-500 leading-none">
                        {format(startDt, "MMM", { locale: ptBR })}
                      </span>
                      <span className="text-sm font-bold text-slate-900 leading-tight mt-0.5">
                        {format(startDt, "dd")}
                      </span>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-bold text-slate-900 text-xs sm:text-sm capitalize">
                          {format(startDt, "EEEE, dd/MM/yyyy", {
                            locale: ptBR,
                          })}{" "}
                          • {format(startDt, "HH:mm")} às{" "}
                          {format(endDt, "HH:mm")}
                        </p>
                        <Badge
                          className={`border-0 text-[10px] font-semibold ${
                            bookingListTab === "upcoming"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {bookingListTab === "upcoming"
                            ? "Reservado"
                            : "Concluído"}
                        </Badge>
                      </div>

                      {isCohostMode ? (
                        <p className="text-xs text-slate-500 mt-1 flex items-center gap-1.5">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{b.guestName}</span>
                          <span className="text-slate-300">•</span>
                          <span>{b.guestSpecialty}</span>
                          <span className="text-slate-300">•</span>
                          <span>{b.hours}h</span>
                        </p>
                      ) : (
                        <p className="text-xs text-slate-500 mt-1">
                          {roomData.name} • Turno de {b.hours}h garantido pelo
                          seu contrato
                        </p>
                      )}
                    </div>
                  </div>

                  {isCohostMode ? (
                    <div className="flex sm:flex-col items-center sm:items-end justify-between border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                      <span className="text-[11px] text-slate-400">
                        Bruto: R$ {formatBRL(b.grossBrl)}
                      </span>
                      <span className="text-sm font-bold text-emerald-700">
                        + R$ {formatBRL(b.cohostNetBrl)}{" "}
                        <span className="text-[10px] font-semibold text-emerald-600">
                          ({Math.round(b.appliedCohostPct * 100)}%)
                        </span>
                      </span>
                    </div>
                  ) : (
                    <div className="text-right">
                      <Badge className="bg-stone-100 text-stone-800 border-0 text-[11px] font-semibold">
                        Horário Exclusivo Seu
                      </Badge>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ================================================================== */}
      {/* MODAL DE PAGAMENTO DA FATURA DO CONTRATO (BOLETO / PIX / CARTÃO)   */}
      {/* ================================================================== */}
      <Dialog open={isPayModalOpen} onOpenChange={setIsPayModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Fatura de {roomData.name} ({invoiceCompetence})
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Escolha entre Boleto Bancário, PIX ou Cartão de Crédito para
              quitar a competência deste contrato.
            </DialogDescription>
          </DialogHeader>

          {invoiceDetails && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Sala / Contrato:</span>
                  <span className="font-bold text-slate-900">
                    {roomData.name} ({activeModalityMeta.badgeLabel})
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Vencimento:</span>
                  <span className="font-semibold text-slate-800">
                    {format(parseISO(invoiceDetails.dueDateIso), "dd/MM/yyyy")}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Valor Base:</span>
                  <span className="font-semibold text-slate-900">
                    R$ {formatBRL(invoiceDetails.baseRent)}
                  </span>
                </div>

                {invoiceDetails.isOverdue && (
                  <>
                    <div className="flex justify-between text-red-700">
                      <span>Multa ({invoiceDetails.finePct}%):</span>
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

              <div className="grid grid-cols-3 gap-2 bg-slate-100 p-1 rounded-xl">
                {(["BOLETO", "PIX", "CREDIT_CARD"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setPayMethod(m);
                      setGeneratedPaymentId(null);
                    }}
                    className={`py-2 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                      payMethod === m
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {m === "BOLETO" ? "Boleto" : m === "PIX" ? "PIX" : "Cartão"}
                  </button>
                ))}
              </div>

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
                </div>
              )}

              {payMethod === "BOLETO" && generatedPaymentId && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <p className="text-xs font-bold text-slate-900">
                    Boleto Emitido — {roomData.name}
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

              {!generatedPaymentId && (
                <Button
                  type="button"
                  disabled={payProcessing}
                  onClick={handleGenerateOrPayContract}
                  className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer"
                >
                  {payProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Processando cobrança...
                    </>
                  ) : payMethod === "BOLETO" ? (
                    `Emitir Boleto Registrado (R$ ${formatBRL(invoiceDetails.totalBrl)})`
                  ) : payMethod === "PIX" ? (
                    `Gerar QR Code PIX (R$ ${formatBRL(invoiceDetails.totalBrl)})`
                  ) : (
                    `Pagar no Cartão (R$ ${formatBRL(invoiceDetails.totalBrl)})`
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
