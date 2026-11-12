// components/admin/contracts-tab.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  FileText,
  Plus,
  Search,
  Building2,
  CalendarDays,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Trash2,
  Edit3,
  ExternalLink,
  Loader2,
  Users,
  Percent,
  Clock,
  FileCheck2,
  Wallet,
  CalendarClock,
  Layers,
  Lock,
  QrCode,
  Barcode,
  CreditCard,
  Copy,
  ArrowLeft,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
  eachDayOfInterval,
  getDay,
  differenceInDays,
  differenceInCalendarDays,
  getDaysInMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";

export interface ContractPricingTier {
  id: string;
  label?: string;
  start_date: string;
  end_date: string;
  contract_value: number;
  session_value?: number;
}

interface ContractScheduleConfig {
  daysOfWeek: number[];
  shifts: ("morning" | "afternoon" | "night" | "fullday")[];
  startHour: number;
  endHour: number;
  pricingTiers?: ContractPricingTier[];
  fine_pct?: number;
  interest_pct?: number;
  paid_dates?: Record<string, string>;
  last_paid_date?: string | null;
  invoices?: Record<string, any>;
}

interface RoomContract {
  id: string;
  room_id: string;
  host_id: string | null;
  specialist_id: string | null;
  specialist_name: string;
  specialist_document: string | null;
  specialist_email: string | null;
  specialist_phone: string | null;
  contract_type:
    "monthly_exclusive" | "fixed_shift" | "fixed_daily" | "custom_daily";
  status: "active" | "pending_signature" | "expired" | "cancelled";
  start_date: string;
  end_date: string;
  billing_cycle: "monthly" | "upfront" | "weekly";
  due_day: number;
  last_paid_competence: string | null;
  contract_value: number;
  session_value: number;
  platform_fee_pct: number;
  host_split_pct: number;
  allow_sublease: boolean;
  cohost_split_pct: number;
  schedule_config: ContractScheduleConfig;
  pdf_url: string | null;
  pdf_filename: string | null;
  notes: string | null;
  created_at: string;
  room_name?: string;
  clinic_name?: string;
}

interface ContractsTabProps {
  mode?: "admin" | "host";
  preselectedRoomId?: string;
}

const WEEK_DAYS = [
  { id: 1, label: "Seg", full: "Segunda-feira" },
  { id: 2, label: "Ter", full: "Terça-feira" },
  { id: 3, label: "Qua", full: "Quarta-feira" },
  { id: 4, label: "Qui", full: "Quinta-feira" },
  { id: 5, label: "Sex", full: "Sexta-feira" },
  { id: 6, label: "Sáb", full: "Sábado" },
  { id: 0, label: "Dom", full: "Domingo" },
];

const SHIFT_OPTIONS = [
  {
    id: "fullday",
    label: "Diária Completa (08h às 20h)",
    start: 8,
    end: 20,
  },
  { id: "morning", label: "Manhã (08h às 12h)", start: 8, end: 12 },
  { id: "afternoon", label: "Tarde (13h às 18h)", start: 13, end: 18 },
  { id: "night", label: "Noite (18h às 22h)", start: 18, end: 22 },
];

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function AdminContractsTab({
  mode = "admin",
  preselectedRoomId,
}: ContractsTabProps) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  // Controle de navegação em Tela Cheia: "list" vs "form"
  const [viewMode, setViewMode] = useState<"list" | "form">("list");

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingPdfId, setUploadingPdfId] = useState<string | null>(null);
  const [togglingPaymentId, setTogglingPaymentId] = useState<string | null>(
    null,
  );

  const [contracts, setContracts] = useState<RoomContract[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [specialists, setSpecialists] = useState<any[]>([]);

  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");

  const [editingContract, setEditingContract] = useState<RoomContract | null>(
    null,
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [specSearch, setSpecSearch] = useState("");

  const [pricingTiers, setPricingTiers] = useState<
    {
      id: string;
      start_date: string;
      end_date: string;
      contract_value: string;
      session_value: string;
    }[]
  >([]);

  // Modal de Cobrança Asaas
  const [payModalOpen, setPayModalOpen] = useState(false);
  const [payContract, setPayContract] = useState<RoomContract | null>(null);
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
  const [payCpf, setPayCpf] = useState("");
  const [payCep, setPayCep] = useState("");
  const [cardHolder, setCardHolder] = useState("");
  const [cardNumber, setCardNumber] = useState("");
  const [cardExpMonth, setCardExpMonth] = useState("");
  const [cardExpYear, setCardExpYear] = useState("");
  const [cardCcv, setCardCcv] = useState("");

  const currentCompetence = format(new Date(), "yyyy-MM");
  const currentMonthLabel = format(new Date(), "MMM/yyyy", { locale: ptBR });
  const todayIsoDate = format(new Date(), "yyyy-MM-dd");

  const [form, setForm] = useState({
    room_id: preselectedRoomId || "",
    specialist_id: "",
    specialist_name: "",
    specialist_document: "",
    specialist_email: "",
    specialist_phone: "",
    contract_type: "fixed_daily" as
      "monthly_exclusive" | "fixed_shift" | "fixed_daily" | "custom_daily",
    status: "active" as
      "active" | "pending_signature" | "expired" | "cancelled",
    start_date: format(new Date(), "yyyy-MM-dd"),
    end_date: format(
      new Date(new Date().setMonth(new Date().getMonth() + 6)),
      "yyyy-MM-dd",
    ),
    billing_cycle: "monthly" as "monthly" | "upfront" | "weekly",
    due_day: "8",
    fine_pct: "2",
    interest_pct: "1",
    contract_value: "",
    session_value: "",
    platform_fee_pct: "15",
    host_split_pct: "85",
    allow_sublease: false,
    cohost_split_pct: "80",
    daysOfWeek: [1] as number[],
    selectedShift: "fullday" as "fullday" | "morning" | "afternoon" | "night",
    startHour: 8,
    endHour: 20,
    notes: "",
  });

  useEffect(() => {
    loadInitialData();
  }, [preselectedRoomId]);

  useEffect(() => {
    if (!payModalOpen || !generatedPaymentId || !payContract) return;

    const timer = setInterval(async () => {
      try {
        const res = await fetch(
          `/api/contracts/payment?contractId=${payContract.id}&competence=${currentCompetence}&paymentId=${generatedPaymentId}`,
        );
        if (res.ok) {
          const data = await res.json();
          if (data.confirmed) {
            clearInterval(timer);
            toast({
              title: "Mensalidade Confirmada",
              description: `Baixa automática aplicada ao contrato de ${payContract.specialist_name}.`,
            });
            setPayModalOpen(false);
            setGeneratedPaymentId(null);
            loadInitialData();
          }
        }
      } catch {}
    }, 4000);

    return () => clearInterval(timer);
  }, [payModalOpen, generatedPaymentId, payContract, currentCompetence, toast]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let roomsQuery = supabase
        .from("rooms")
        .select("id, name, host_id, tier, is_active, availability")
        .order("name");

      if (mode === "host" && user) {
        const { data: myCohostContracts } = await supabase
          .from("room_contracts")
          .select("room_id")
          .eq("specialist_id", user.id)
          .eq("status", "active");

        const cohostRoomIds = (myCohostContracts || [])
          .map((c: any) => c.room_id)
          .filter(Boolean);

        if (cohostRoomIds.length > 0) {
          roomsQuery = roomsQuery.or(
            `host_id.eq.${user.id},id.in.(${cohostRoomIds.join(",")})`,
          );
        } else {
          roomsQuery = roomsQuery.eq("host_id", user.id);
        }
      }

      const { data: roomsData, error: rErr } = await roomsQuery;
      if (rErr) throw rErr;

      const safeRooms = roomsData || [];
      setRooms(safeRooms);

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, cpf, cep, email, phone, whatsapp, role")
        .order("full_name");

      const allProfiles = profilesData || [];
      setSpecialists(allProfiles);

      const profileNameMap = new Map<string, string>(
        allProfiles.map((p: any) => [p.id, p.full_name || "Sem Nome"]),
      );
      const roomsMap = new Map<string, any>(
        safeRooms.map((r: any) => [r.id, r]),
      );

      let contractsQuery = supabase
        .from("room_contracts")
        .select("*")
        .order("created_at", { ascending: false });

      if (preselectedRoomId) {
        contractsQuery = contractsQuery.eq("room_id", preselectedRoomId);
      } else if (mode === "host" && user) {
        const hostRoomIds = safeRooms.map((r: any) => r.id);
        if (hostRoomIds.length > 0) {
          contractsQuery = contractsQuery.or(
            `specialist_id.eq.${user.id},room_id.in.(${hostRoomIds.join(",")})`,
          );
        } else {
          contractsQuery = contractsQuery.eq("specialist_id", user.id);
        }
      }

      const { data: contractsData, error: cErr } = await contractsQuery;
      if (cErr) throw cErr;

      const mappedContracts: RoomContract[] = (contractsData || []).map(
        (c: any) => {
          const roomObj = roomsMap.get(c.room_id);
          const hostName = roomObj?.host_id
            ? profileNameMap.get(roomObj.host_id)
            : "Fusion Clinic";

          const fusionPct = Number(c.platform_fee_pct ?? 15);
          const hostPct =
            c.host_split_pct !== undefined && c.host_split_pct !== null
              ? Number(c.host_split_pct)
              : Math.max(0, 100 - fusionPct);

          const rawSched =
            typeof c.schedule_config === "string"
              ? (() => {
                  try {
                    return JSON.parse(c.schedule_config);
                  } catch {
                    return {};
                  }
                })()
              : c.schedule_config || {};

          return {
            ...c,
            due_day: Math.min(31, Math.max(1, Number(c.due_day || 8))),
            last_paid_competence: c.last_paid_competence || null,
            contract_value: Number(c.contract_value || 0),
            session_value: Number(c.session_value || 0),
            platform_fee_pct: fusionPct,
            host_split_pct: hostPct,
            cohost_split_pct: Number(c.cohost_split_pct ?? 80),
            room_name: roomObj?.name || "Sala Removida",
            clinic_name: hostName || "Fusion Clinic",
            schedule_config: {
              daysOfWeek: [1],
              shifts: ["fullday"],
              startHour: 8,
              endHour: 20,
              pricingTiers: [],
              fine_pct: 2,
              interest_pct: 1,
              ...rawSched,
            },
          };
        },
      );

      setContracts(mappedContracts);
    } catch (err: any) {
      console.error("Erro ao carregar contratos:", err);
      toast({
        variant: "destructive",
        title: "Erro ao carregar contratos",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const activeCohostContractByRoomId = useMemo(() => {
    const map = new Map<string, RoomContract>();
    contracts.forEach((c) => {
      if (
        c.status === "active" &&
        c.contract_type === "monthly_exclusive" &&
        c.allow_sublease
      ) {
        map.set(c.room_id, c);
      }
    });
    return map;
  }, [contracts]);

  const parentCohostForFormRoom = useMemo(() => {
    if (!form.room_id) return null;
    const cohostContract = activeCohostContractByRoomId.get(form.room_id);
    if (!cohostContract) return null;
    if (editingContract && editingContract.id === cohostContract.id) {
      return null;
    }
    return cohostContract;
  }, [form.room_id, activeCohostContractByRoomId, editingContract]);

  const getParentCohostForContract = (c: RoomContract): RoomContract | null => {
    const cohostContract = activeCohostContractByRoomId.get(c.room_id);
    if (!cohostContract || cohostContract.id === c.id) return null;
    if (
      c.start_date <= cohostContract.end_date &&
      c.end_date >= cohostContract.start_date
    ) {
      return cohostContract;
    }
    return null;
  };

  const getEffectiveContractPricing = (
    c: RoomContract,
    targetDateStr: string = todayIsoDate,
  ): {
    contractValue: number;
    sessionValue: number;
    activeTierLabel: string | null;
    totalTiers: number;
  } => {
    const tiers = c.schedule_config?.pricingTiers || [];
    if (tiers.length === 0) {
      return {
        contractValue: Number(c.contract_value || 0),
        sessionValue: Number(c.session_value || 0),
        activeTierLabel: null,
        totalTiers: 0,
      };
    }

    const matchedIdx = tiers.findIndex(
      (t) => targetDateStr >= t.start_date && targetDateStr <= t.end_date,
    );
    const chosenTier = matchedIdx >= 0 ? tiers[matchedIdx] : tiers[0];
    const occurrencesPerMonth = Math.max(
      1,
      (c.schedule_config?.daysOfWeek?.length || 1) * 4,
    );
    const cVal = Number(chosenTier.contract_value || c.contract_value || 0);
    const sVal =
      Number(chosenTier.session_value) > 0
        ? Number(chosenTier.session_value)
        : cVal / occurrencesPerMonth;

    return {
      contractValue: cVal,
      sessionValue: sVal,
      activeTierLabel:
        matchedIdx >= 0
          ? `${matchedIdx + 1}º Período (${format(parseISO(chosenTier.start_date), "dd/MM/yy")} a ${format(parseISO(chosenTier.end_date), "dd/MM/yy")})`
          : `1º Período (${format(parseISO(chosenTier.start_date), "dd/MM/yy")} a ${format(parseISO(chosenTier.end_date), "dd/MM/yy")})`,
      totalTiers: tiers.length,
    };
  };

  const calculateContractOccurrenceDates = (
    startStr: string,
    endStr: string,
    daysOfWeek: number[],
  ): Date[] => {
    try {
      const start = parseISO(startStr);
      const end = parseISO(endStr);
      if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
        return [];
      }
      if (differenceInDays(end, start) > 366) return [];

      const allDays = eachDayOfInterval({ start, end });
      return allDays.filter((d) => daysOfWeek.includes(getDay(d)));
    } catch {
      return [];
    }
  };

  const previewDates = calculateContractOccurrenceDates(
    form.start_date,
    form.end_date,
    form.daysOfWeek,
  );

  const getComputedSessionValueForAmount = (
    contractValNum: number,
    manualSessionNum?: number,
  ) => {
    if (manualSessionNum && manualSessionNum > 0) return manualSessionNum;
    if (contractValNum <= 0) return 0;

    if (form.billing_cycle === "upfront") {
      return previewDates.length > 0
        ? contractValNum / previewDates.length
        : contractValNum;
    }

    const occurrencesPerMonth = Math.max(1, form.daysOfWeek.length * 4);
    return contractValNum / occurrencesPerMonth;
  };

  const getComputedSessionValue = () => {
    return getComputedSessionValueForAmount(
      Number(form.contract_value) || 0,
      Number(form.session_value) || 0,
    );
  };

  const handleAddPricingTier = () => {
    const lastTier = pricingTiers[pricingTiers.length - 1];
    let defaultStart = form.start_date;
    const defaultEnd = form.end_date;

    if (lastTier && lastTier.end_date) {
      try {
        const nextDay = new Date(parseISO(lastTier.end_date));
        nextDay.setDate(nextDay.getDate() + 1);
        defaultStart = format(nextDay, "yyyy-MM-dd");
      } catch {}
    }

    if (pricingTiers.length === 0) {
      let midDateStr = form.start_date;
      let nextAfterMidStr = form.end_date;
      try {
        const s = parseISO(form.start_date);
        const e = parseISO(form.end_date);
        const halfDays = Math.max(1, Math.floor(differenceInDays(e, s) / 2));
        const mid = new Date(s);
        mid.setDate(mid.getDate() + halfDays);
        midDateStr = format(mid, "yyyy-MM-dd");

        const nextD = new Date(mid);
        nextD.setDate(nextD.getDate() + 1);
        nextAfterMidStr = format(nextD, "yyyy-MM-dd");
      } catch {}

      setPricingTiers([
        {
          id: `tier_${Date.now()}_1`,
          start_date: form.start_date,
          end_date: midDateStr,
          contract_value: form.contract_value || "",
          session_value: form.session_value || "",
        },
        {
          id: `tier_${Date.now()}_2`,
          start_date: nextAfterMidStr,
          end_date: form.end_date,
          contract_value: "",
          session_value: "",
        },
      ]);
      return;
    }

    setPricingTiers([
      ...pricingTiers,
      {
        id: `tier_${Date.now()}`,
        start_date: defaultStart,
        end_date: defaultEnd,
        contract_value: "",
        session_value: "",
      },
    ]);
  };

  const handleUpdatePricingTier = (
    id: string,
    field: "start_date" | "end_date" | "contract_value" | "session_value",
    value: string,
  ) => {
    setPricingTiers((prev) => {
      const updated = prev.map((t) =>
        t.id === id ? { ...t, [field]: value } : t,
      );
      if (updated.length > 0 && field === "contract_value") {
        const activeOrFirst =
          updated.find(
            (t) => todayIsoDate >= t.start_date && todayIsoDate <= t.end_date,
          ) || updated[0];
        if (activeOrFirst && activeOrFirst.contract_value) {
          setForm((f) => ({
            ...f,
            contract_value: activeOrFirst.contract_value,
            session_value: activeOrFirst.session_value || f.session_value,
          }));
        }
      }
      return updated;
    });
  };

  const handleRemovePricingTier = (id: string) => {
    setPricingTiers((prev) => prev.filter((t) => t.id !== id));
  };

  const handleFusionPctChange = (valStr: string) => {
    const num = Math.min(100, Math.max(0, Number(valStr) || 0));
    const hostComplement = Math.max(0, Number((100 - num).toFixed(2)));
    setForm({
      ...form,
      platform_fee_pct: valStr,
      host_split_pct: String(hostComplement),
    });
  };

  const handleHostPctChange = (valStr: string) => {
    const num = Math.min(100, Math.max(0, Number(valStr) || 0));
    const fusionComplement = Math.max(0, Number((100 - num).toFixed(2)));
    setForm({
      ...form,
      host_split_pct: valStr,
      platform_fee_pct: String(fusionComplement),
    });
  };

  const syncContractBookings = async (
    contract: RoomContract,
    fallbackUserId: string | null,
  ) => {
    const deleteFromIso = new Date(
      `${contract.start_date}T00:00:00`,
    ).toISOString();
    await supabase
      .from("bookings")
      .delete()
      .eq("contract_id", contract.id)
      .gte("start_time", deleteFromIso);

    if (contract.status === "cancelled" || contract.status === "expired") {
      return 0;
    }

    const cfg = contract.schedule_config || {
      daysOfWeek: [1, 2, 3, 4, 5, 6, 0],
      shifts: ["fullday"],
      startHour: 8,
      endHour: 20,
      pricingTiers: [],
    };

    const startH = Number(cfg.startHour ?? 8);
    const endH = Number(cfg.endHour ?? 20);

    if (
      contract.contract_type === "monthly_exclusive" &&
      contract.allow_sublease
    ) {
      const openSubleaseDays = Array.isArray(cfg.daysOfWeek)
        ? cfg.daysOfWeek
        : [];
      const openHoursSlots: string[] = [];
      for (let h = startH; h < endH; h++) {
        const sH = String(h).padStart(2, "0");
        const eH = String(h + 1).padStart(2, "0");
        openHoursSlots.push(`${sH}h-${eH}h`);
      }

      const { data: currentRoom } = await supabase
        .from("rooms")
        .select("availability")
        .eq("id", contract.room_id)
        .single();

      let currentAvail = currentRoom?.availability || {};
      if (typeof currentAvail === "string") {
        try {
          currentAvail = JSON.parse(currentAvail);
        } catch {
          currentAvail = {};
        }
      }

      const weekdayNames = [
        { day: 1, name: "Segunda-feira" },
        { day: 2, name: "Terça-feira" },
        { day: 3, name: "Quarta-feira" },
        { day: 4, name: "Quinta-feira" },
        { day: 5, name: "Sexta-feira" },
        { day: 6, name: "Sábado" },
        { day: 0, name: "Domingo" },
      ];

      const updatedWeekConfig = weekdayNames.map((wd) => {
        const isOpenForSublease = openSubleaseDays.includes(wd.day);
        return {
          day: wd.day,
          dayName: wd.name,
          enabled: isOpenForSublease,
          rentalType: "hourly",
          availableHours: isOpenForSublease ? openHoursSlots : [],
          selectedShifts: [],
        };
      });

      await supabase
        .from("rooms")
        .update({
          availability: {
            ...currentAvail,
            weekConfig: updatedWeekConfig,
            exceptions: Array.isArray(currentAvail?.exceptions)
              ? currentAvail.exceptions
              : [],
          },
        })
        .eq("id", contract.room_id);

      if (contract.specialist_id) {
        try {
          await supabase.from("notifications").insert({
            user_id: contract.specialist_id,
            type: "cohost_activated",
            title: "Modo Coanfitrião Ativado",
            content:
              "Sua sala fixa está ativa! Acesse a aba 'Minha Sala' no seu painel para gerenciar seus horários livres e acompanhar seus repasses.",
            link: "/dashboard#cohost",
            is_read: false,
          });
        } catch {}
      }

      return openSubleaseDays.length;
    }

    const effectiveDays =
      contract.contract_type === "monthly_exclusive" && !contract.allow_sublease
        ? [1, 2, 3, 4, 5, 6, 0]
        : cfg.daysOfWeek || [1];

    const occurrenceDates = calculateContractOccurrenceDates(
      contract.start_date,
      contract.end_date,
      effectiveDays,
    );

    if (occurrenceDates.length === 0) return 0;

    const effectiveStartH =
      contract.contract_type === "monthly_exclusive" && !contract.allow_sublease
        ? 6
        : startH;
    const effectiveEndH =
      contract.contract_type === "monthly_exclusive" && !contract.allow_sublease
        ? 23
        : endH;

    const durationHours = Math.max(1, effectiveEndH - effectiveStartH);

    const targetUserId =
      contract.specialist_id ||
      contract.host_id ||
      fallbackUserId ||
      specialists[0]?.id;

    if (!targetUserId) return 0;

    const defaultOccurrencesPerMonth = Math.max(1, effectiveDays.length * 4);
    const baseSessionVal =
      Number(contract.session_value) > 0
        ? Number(contract.session_value)
        : Number(contract.contract_value) / defaultOccurrencesPerMonth;

    const tiers = cfg.pricingTiers || [];

    const resolveSessionValueForDate = (dateObj: Date): number => {
      if (tiers.length === 0) return baseSessionVal;

      const dateStr = format(dateObj, "yyyy-MM-dd");
      const matchingTier = tiers.find(
        (t) => dateStr >= t.start_date && dateStr <= t.end_date,
      );

      if (!matchingTier) return baseSessionVal;

      if (Number(matchingTier.session_value) > 0) {
        return Number(matchingTier.session_value);
      }

      const tierContractVal = Number(matchingTier.contract_value || 0);
      if (tierContractVal <= 0) return baseSessionVal;

      if (contract.billing_cycle === "upfront") {
        const tierOccurrences = calculateContractOccurrenceDates(
          matchingTier.start_date,
          matchingTier.end_date,
          effectiveDays,
        );
        return tierOccurrences.length > 0
          ? tierContractVal / tierOccurrences.length
          : tierContractVal;
      }

      return tierContractVal / defaultOccurrencesPerMonth;
    };

    const bookingStatus =
      contract.status === "pending_signature" ? "pending_payment" : "confirmed";

    const bookingsPayload = occurrenceDates.map((dateObj) => {
      const startTime = new Date(dateObj);
      startTime.setHours(effectiveStartH, 0, 0, 0);

      const endTime = new Date(dateObj);
      endTime.setHours(effectiveEndH, 0, 0, 0);

      const dateSpecificVal = resolveSessionValueForDate(dateObj);

      return {
        user_id: targetUserId,
        room_id: contract.room_id,
        start_time: startTime.toISOString(),
        end_time: endTime.toISOString(),
        status: bookingStatus,
        total_cost: durationHours,
        contract_id: contract.id,
        booking_origin: `contract_${contract.contract_type}`,
        agreed_value_brl: Number(dateSpecificVal.toFixed(2)),
      };
    });

    for (let i = 0; i < bookingsPayload.length; i += 100) {
      const chunk = bookingsPayload.slice(i, i + 100);
      const { error } = await supabase.from("bookings").insert(chunk);
      if (error) {
        console.warn("Aviso ao inserir lote de reservas do contrato:", error);
      }
    }

    return bookingsPayload.length;
  };

  const uploadContractPdf = async (
    file: File,
    roomId: string,
  ): Promise<{ url: string; filename: string }> => {
    const cleanName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const filePath = `${roomId}/${Date.now()}_${cleanName}`;

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

    return {
      url: pubData.publicUrl,
      filename: file.name,
    };
  };

  const handleQuickPdfUpload = async (
    contract: RoomContract,
    file: File | undefined,
  ) => {
    if (!file) return;
    setUploadingPdfId(contract.id);
    try {
      const uploaded = await uploadContractPdf(file, contract.room_id);

      const newStatus =
        contract.status === "pending_signature" ? "active" : contract.status;

      const { error } = await supabase
        .from("room_contracts")
        .update({
          pdf_url: uploaded.url,
          pdf_filename: uploaded.filename,
          status: newStatus,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contract.id);

      if (error) throw error;

      toast({
        title: "Contrato PDF anexado",
        description: `Arquivo "${uploaded.filename}" salvo com sucesso.`,
      });

      loadInitialData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao anexar PDF",
        description: err.message,
      });
    } finally {
      setUploadingPdfId(null);
    }
  };

  const handleToggleMonthPaid = async (contract: RoomContract) => {
    setTogglingPaymentId(contract.id);
    try {
      const isPaidThisMonth =
        contract.last_paid_competence === currentCompetence ||
        Boolean(contract.schedule_config?.paid_dates?.[currentCompetence]);

      const newCompetence = isPaidThisMonth ? null : currentCompetence;
      const existingSched = contract.schedule_config || {
        daysOfWeek: [1],
        shifts: ["fullday"],
        startHour: 8,
        endHour: 20,
      };
      const paidDates = { ...(existingSched.paid_dates || {}) };

      if (newCompetence) {
        paidDates[currentCompetence] = todayIsoDate;
      } else {
        delete paidDates[currentCompetence];
      }

      const { error } = await supabase
        .from("room_contracts")
        .update({
          last_paid_competence: newCompetence,
          schedule_config: {
            ...existingSched,
            paid_dates: paidDates,
            last_paid_date: newCompetence ? todayIsoDate : null,
          },
          updated_at: new Date().toISOString(),
        })
        .eq("id", contract.id);

      if (error) throw error;

      toast({
        title: newCompetence
          ? `Pagamento de ${currentMonthLabel} confirmado`
          : `Baixa de ${currentMonthLabel} desfeita`,
      });

      loadInitialData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar pagamento",
        description: err.message,
      });
    } finally {
      setTogglingPaymentId(null);
    }
  };

  const openAsaasPayModal = (
    c: RoomContract,
    initialMethod: "PIX" | "BOLETO" | "CREDIT_CARD" = "PIX",
  ) => {
    setPayContract(c);
    setPayMethod(initialMethod);
    setGeneratedPaymentId(null);
    setPixQrCode(null);
    setPixCopyPaste(null);
    setBoletoLine(null);
    setBoletoUrl(null);

    const matchedProfile = specialists.find((s) => s.id === c.specialist_id);
    setPayCpf(c.specialist_document || matchedProfile?.cpf || "");
    setPayCep(matchedProfile?.cep || "");
    setCardHolder(c.specialist_name || matchedProfile?.full_name || "");
    setCardNumber("");
    setCardExpMonth("");
    setCardExpYear("");
    setCardCcv("");
    setPayModalOpen(true);
  };

  const handleExecuteAsaasContractCharge = async () => {
    if (!payContract) return;
    setPayProcessing(true);

    try {
      const payload: Record<string, any> = {
        contractId: payContract.id,
        competence: currentCompetence,
        billingType: payMethod,
        customerCpf: payCpf,
        customerCep: payCep,
      };

      if (payMethod === "CREDIT_CARD") {
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
          cpf: payCpf,
          cep: payCep,
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
        throw new Error(data.error || "Erro ao gerar cobrança no Asaas.");
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
          title: "Pagamento Processado",
          description: `A competência ${currentCompetence} foi baixada.`,
        });
        setPayModalOpen(false);
        loadInitialData();
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro na cobrança Asaas",
        description: err.message,
      });
    } finally {
      setPayProcessing(false);
    }
  };

  const openCreateFormPage = () => {
    setEditingContract(null);
    setPdfFile(null);
    setSpecSearch("");
    setPricingTiers([]);

    const defaultRoomId = preselectedRoomId || rooms[0]?.id || "";
    const roomHasActiveCohost = activeCohostContractByRoomId.has(defaultRoomId);

    setForm({
      room_id: defaultRoomId,
      specialist_id: "",
      specialist_name: "",
      specialist_document: "",
      specialist_email: "",
      specialist_phone: "",
      contract_type: "fixed_daily",
      status: "active",
      start_date: format(new Date(), "yyyy-MM-dd"),
      end_date: format(
        new Date(new Date().setMonth(new Date().getMonth() + 3)),
        "yyyy-MM-dd",
      ),
      billing_cycle: "monthly",
      due_day: "8",
      fine_pct: "2",
      interest_pct: "1",
      contract_value: "",
      session_value: "",
      platform_fee_pct: roomHasActiveCohost ? "20" : "15",
      host_split_pct: roomHasActiveCohost ? "80" : "85",
      allow_sublease: false,
      cohost_split_pct: "80",
      daysOfWeek: [1],
      selectedShift: "fullday",
      startHour: 8,
      endHour: 20,
      notes: "",
    });
    setViewMode("form");
  };

  const openEditFormPage = (c: RoomContract) => {
    setEditingContract(c);
    setPdfFile(null);
    setSpecSearch("");
    const shiftId = (c.schedule_config?.shifts?.[0] || "fullday") as
      "fullday" | "morning" | "afternoon" | "night";

    const fusionPct = Number(c.platform_fee_pct ?? 15);
    const hostPct =
      c.host_split_pct !== undefined && c.host_split_pct !== null
        ? Number(c.host_split_pct)
        : Math.max(0, 100 - fusionPct);

    const savedTiers = (c.schedule_config?.pricingTiers || []).map(
      (t, idx) => ({
        id: t.id || `tier_${idx}`,
        start_date: t.start_date || c.start_date,
        end_date: t.end_date || c.end_date,
        contract_value: String(t.contract_value || ""),
        session_value: t.session_value ? String(t.session_value) : "",
      }),
    );
    setPricingTiers(savedTiers);

    setForm({
      room_id: c.room_id,
      specialist_id: c.specialist_id || "",
      specialist_name: c.specialist_name || "",
      specialist_document: c.specialist_document || "",
      specialist_email: c.specialist_email || "",
      specialist_phone: c.specialist_phone || "",
      contract_type: c.contract_type,
      status: c.status,
      start_date: c.start_date,
      end_date: c.end_date,
      billing_cycle: c.billing_cycle || "monthly",
      due_day: String(c.due_day || 8),
      fine_pct: String(c.schedule_config?.fine_pct ?? 2),
      interest_pct: String(c.schedule_config?.interest_pct ?? 1),
      contract_value: String(c.contract_value || ""),
      session_value: String(c.session_value || ""),
      platform_fee_pct: String(fusionPct),
      host_split_pct: String(hostPct),
      allow_sublease: Boolean(c.allow_sublease),
      cohost_split_pct: String(c.cohost_split_pct ?? 80),
      daysOfWeek: c.schedule_config?.daysOfWeek || [1],
      selectedShift: shiftId,
      startHour: c.schedule_config?.startHour ?? 8,
      endHour: c.schedule_config?.endHour ?? 20,
      notes: c.notes || "",
    });
    setViewMode("form");
  };

  const handleSaveContract = async () => {
    const validTiers: ContractPricingTier[] = pricingTiers
      .filter((t) => t.start_date && t.end_date && Number(t.contract_value) > 0)
      .map((t) => {
        const cVal = Number(t.contract_value) || 0;
        const sVal = getComputedSessionValueForAmount(
          cVal,
          Number(t.session_value) || 0,
        );
        return {
          id: t.id,
          start_date: t.start_date,
          end_date: t.end_date,
          contract_value: cVal,
          session_value: Number(sVal.toFixed(2)),
        };
      });

    const activeOrFirstTier =
      validTiers.find(
        (t) => todayIsoDate >= t.start_date && todayIsoDate <= t.end_date,
      ) || validTiers[0];

    const finalContractValue = activeOrFirstTier
      ? activeOrFirstTier.contract_value
      : Number(form.contract_value) || 0;

    if (!form.room_id || !form.specialist_name || finalContractValue <= 0) {
      return toast({
        variant: "destructive",
        title: "Campos obrigatórios",
        description:
          "Selecione a sala, o especialista locatário e informe o valor do contrato.",
      });
    }

    const isSubContractUnderCohost = Boolean(parentCohostForFormRoom);

    let effectiveStartDate = form.start_date;
    let effectiveEndDate = form.end_date;
    if (validTiers.length > 0) {
      const sortedStarts = validTiers.map((t) => t.start_date).sort();
      const sortedEnds = validTiers.map((t) => t.end_date).sort();
      if (sortedStarts[0] < effectiveStartDate)
        effectiveStartDate = sortedStarts[0];
      if (sortedEnds[sortedEnds.length - 1] > effectiveEndDate)
        effectiveEndDate = sortedEnds[sortedEnds.length - 1];
    }

    const parsedDueDay = Math.min(31, Math.max(1, Number(form.due_day) || 8));
    const parsedFinePct = Math.max(0, Number(form.fine_pct ?? 2));
    const parsedInterestPct = Math.max(0, Number(form.interest_pct ?? 1));
    const parsedFusionPct = Math.min(
      100,
      Math.max(0, Number(form.platform_fee_pct) || 0),
    );
    const parsedHostPct = Math.min(
      100,
      Math.max(0, Number(form.host_split_pct) || 100 - parsedFusionPct),
    );

    setSaving(true);
    try {
      const { data: authData } = await supabase.auth.getUser();
      const currentUser = authData?.user || null;

      const selectedRoom = rooms.find((r) => r.id === form.room_id);
      const resolvedHostId = selectedRoom?.host_id || currentUser?.id || null;

      let resolvedSpecialistId = form.specialist_id || null;
      if (!resolvedSpecialistId && form.specialist_name.trim()) {
        const matchedSpec = specialists.find(
          (s) =>
            (s.full_name || "").toLowerCase().trim() ===
            form.specialist_name.toLowerCase().trim(),
        );
        if (matchedSpec) resolvedSpecialistId = matchedSpec.id;
      }

      const computedSessionVal = activeOrFirstTier?.session_value
        ? activeOrFirstTier.session_value
        : getComputedSessionValueForAmount(
            finalContractValue,
            Number(form.session_value) || 0,
          );

      let pdfUrl = editingContract?.pdf_url || null;
      let pdfFilename = editingContract?.pdf_filename || null;

      if (pdfFile) {
        try {
          const uploaded = await uploadContractPdf(pdfFile, form.room_id);
          pdfUrl = uploaded.url;
          pdfFilename = uploaded.filename;
        } catch (uploadError: any) {
          console.warn("Aviso no upload do PDF:", uploadError);
        }
      }

      const finalAllowSublease =
        !isSubContractUnderCohost && form.contract_type === "monthly_exclusive"
          ? form.allow_sublease
          : false;

      const scheduleConfig: ContractScheduleConfig = {
        ...(editingContract?.schedule_config || {}),
        daysOfWeek:
          form.contract_type === "monthly_exclusive" && !finalAllowSublease
            ? [1, 2, 3, 4, 5, 6, 0]
            : form.daysOfWeek,
        shifts: [form.selectedShift],
        startHour: Number(form.startHour),
        endHour: Number(form.endHour),
        pricingTiers: validTiers,
        fine_pct: parsedFinePct,
        interest_pct: parsedInterestPct,
      };

      const payload: Record<string, any> = {
        room_id: form.room_id,
        host_id: resolvedHostId,
        specialist_id: resolvedSpecialistId,
        specialist_name: form.specialist_name.trim(),
        specialist_document: form.specialist_document || null,
        specialist_email: form.specialist_email || null,
        specialist_phone: form.specialist_phone || null,
        contract_type: form.contract_type,
        status: form.status,
        start_date: effectiveStartDate,
        end_date: effectiveEndDate,
        billing_cycle: form.billing_cycle,
        due_day: parsedDueDay,
        contract_value: finalContractValue,
        session_value: Number(computedSessionVal.toFixed(2)),
        platform_fee_pct: parsedFusionPct,
        host_split_pct: parsedHostPct,
        allow_sublease: finalAllowSublease,
        cohost_split_pct: finalAllowSublease
          ? Number(form.cohost_split_pct) || 80
          : 0,
        schedule_config: scheduleConfig,
        pdf_url: pdfUrl,
        pdf_filename: pdfFilename,
        notes: form.notes || null,
        updated_at: new Date().toISOString(),
      };

      let savedContract: any = null;

      if (editingContract) {
        const { data, error } = await supabase
          .from("room_contracts")
          .update(payload)
          .eq("id", editingContract.id)
          .select("*")
          .single();
        if (error) throw error;
        savedContract = data;
      } else {
        const { data, error } = await supabase
          .from("room_contracts")
          .insert(payload)
          .select("*")
          .single();
        if (error) throw error;
        savedContract = data;
      }

      const generatedCount = await syncContractBookings(
        savedContract,
        resolvedHostId || currentUser?.id || null,
      );

      toast({
        title: editingContract
          ? "Contrato atualizado com sucesso"
          : "Contrato registrado e ativado",
        description: isSubContractUnderCohost
          ? `Subcontrato vinculado ao Coanfitrião (${parsedHostPct}% Coanfitrião / ${parsedFusionPct}% Fusion). ${generatedCount} datas alocadas.`
          : finalAllowSublease
            ? `Modo Coanfitrião ativo com ${generatedCount} dia(s) abertos na vitrine.`
            : `Split configurado e ${generatedCount} bloqueio(s) sincronizados na agenda.`,
      });

      setViewMode("list");
      loadInitialData();
    } catch (err: any) {
      console.error("Erro ao salvar contrato:", err);
      toast({
        variant: "destructive",
        title: "Erro ao salvar contrato",
        description:
          err.message || "Verifique as permissões da tabela no Supabase.",
      });
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteContract = async (contract: RoomContract) => {
    if (
      !confirm(
        `Tem certeza que deseja excluir o contrato de ${contract.specialist_name}?\n\nTodas as reservas futuras vinculadas a este contrato serão liberadas da agenda.`,
      )
    )
      return;

    try {
      await supabase
        .from("bookings")
        .delete()
        .eq("contract_id", contract.id)
        .gte("start_time", new Date().toISOString());

      const { error } = await supabase
        .from("room_contracts")
        .delete()
        .eq("id", contract.id);

      if (error) throw error;

      toast({
        title: "Contrato removido",
        description: "Os horários futuros da sala foram liberados.",
      });
      loadInitialData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao excluir",
        description: err.message,
      });
    }
  };

  const toggleDayOfWeek = (dayId: number) => {
    if (form.daysOfWeek.includes(dayId)) {
      if (form.daysOfWeek.length === 1 && !form.allow_sublease) return;
      setForm({
        ...form,
        daysOfWeek: form.daysOfWeek.filter((d) => d !== dayId),
      });
    } else {
      setForm({
        ...form,
        daysOfWeek: [...form.daysOfWeek, dayId].sort(),
      });
    }
  };

  const handleShiftChange = (
    shiftId: "fullday" | "morning" | "afternoon" | "night",
  ) => {
    const found = SHIFT_OPTIONS.find((s) => s.id === shiftId);
    setForm({
      ...form,
      selectedShift: shiftId,
      startHour: found ? found.start : 8,
      endHour: found ? found.end : 20,
    });
  };

  const getMonthlyPaymentState = (c: RoomContract) => {
    const dueDayNum = Math.max(1, Math.min(31, Number(c.due_day || 8)));
    const dayStr = String(dueDayNum).padStart(2, "0");
    const baseVal = getEffectiveContractPricing(c).contractValue;
    const finePct = Number(c.schedule_config?.fine_pct ?? 2);
    const interestPct = Number(c.schedule_config?.interest_pct ?? 1);

    const [yearStr, monthStr] = currentCompetence.split("-");
    const maxDays = getDaysInMonth(
      new Date(Number(yearStr), Number(monthStr) - 1, 1),
    );
    const safeDay = String(Math.min(dueDayNum, maxDays)).padStart(2, "0");
    const dueDateIso = `${currentCompetence}-${safeDay}`;

    const isPaid =
      c.last_paid_competence === currentCompetence ||
      Boolean(c.schedule_config?.paid_dates?.[currentCompetence]);

    if (c.status === "cancelled" || c.status === "expired") {
      return {
        state: "inactive",
        label: `Dia ${dayStr}`,
        daysLate: 0,
        fineBrl: 0,
        interestBrl: 0,
        totalWithChargesBrl: baseVal,
        finePct,
        interestPct,
        dueDateIso,
      };
    }

    if (isPaid) {
      return {
        state: "paid",
        label: `Pago (${currentMonthLabel})`,
        daysLate: 0,
        fineBrl: 0,
        interestBrl: 0,
        totalWithChargesBrl: baseVal,
        finePct,
        interestPct,
        dueDateIso,
      };
    }

    const daysLate = Math.max(
      0,
      differenceInCalendarDays(new Date(), parseISO(`${dueDateIso}T23:59:59`)),
    );

    if (daysLate > 0) {
      const fineBrl =
        finePct > 0 ? Number((baseVal * (finePct / 100)).toFixed(2)) : 0;
      const interestBrl =
        interestPct > 0
          ? Number((baseVal * (interestPct / 100 / 30) * daysLate).toFixed(2))
          : 0;
      const totalWithChargesBrl = Number(
        (baseVal + fineBrl + interestBrl).toFixed(2),
      );

      return {
        state: "overdue",
        label: `Vencido há ${daysLate}d (Dia ${dayStr})`,
        daysLate,
        fineBrl,
        interestBrl,
        totalWithChargesBrl,
        finePct,
        interestPct,
        dueDateIso,
      };
    }

    const currentDay = new Date().getDate();
    if (currentDay === dueDayNum) {
      return {
        state: "due_today",
        label: `Vence Hoje (Dia ${dayStr})`,
        daysLate: 0,
        fineBrl: 0,
        interestBrl: 0,
        totalWithChargesBrl: baseVal,
        finePct,
        interestPct,
        dueDateIso,
      };
    }
    return {
      state: "upcoming",
      label: `Vence dia ${dayStr}`,
      daysLate: 0,
      fineBrl: 0,
      interestBrl: 0,
      totalWithChargesBrl: baseVal,
      finePct,
      interestPct,
      dueDateIso,
    };
  };

  const filteredContracts = contracts.filter((c) => {
    const matchesType =
      typeFilter === "all" ? true : c.contract_type === typeFilter;
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "overdue"
          ? getMonthlyPaymentState(c).state === "overdue"
          : c.status === statusFilter;
    const s = search.toLowerCase();
    const matchesSearch =
      (c.specialist_name || "").toLowerCase().includes(s) ||
      (c.room_name || "").toLowerCase().includes(s) ||
      (c.clinic_name || "").toLowerCase().includes(s);
    return matchesType && matchesStatus && matchesSearch;
  });

  const activeContracts = contracts.filter((c) => c.status === "active");
  const totalContractRevenue = activeContracts.reduce(
    (acc, curr) => acc + getEffectiveContractPricing(curr).contractValue,
    0,
  );
  const totalFusionContractTake = activeContracts.reduce(
    (acc, curr) =>
      acc +
      getEffectiveContractPricing(curr).contractValue *
        (Number(curr.platform_fee_pct ?? 15) / 100),
    0,
  );
  const cohostCount = activeContracts.filter(
    (c) => c.contract_type === "monthly_exclusive" && c.allow_sublease,
  ).length;
  const overdueCount = activeContracts.filter(
    (c) => getMonthlyPaymentState(c).state === "overdue",
  ).length;

  const getContractTypeBadge = (c: RoomContract) => {
    const parentCohost = getParentCohostForContract(c);

    if (parentCohost) {
      return (
        <div className="flex flex-col gap-1">
          <Badge className="bg-slate-900 text-white border-0 w-fit font-semibold text-[11px]">
            {c.contract_type === "fixed_shift"
              ? "Subcontrato • Turno Fixo"
              : "Subcontrato • Diária Fixa"}
          </Badge>
          <span className="text-[10px] font-semibold text-emerald-700">
            Coanfitrião: {parentCohost.specialist_name.split(" ")[0]}
          </span>
        </div>
      );
    }

    switch (c.contract_type) {
      case "monthly_exclusive":
        return (
          <div className="flex flex-col gap-1">
            <Badge className="bg-slate-900 text-white border-0 w-fit font-semibold text-[11px]">
              Sala Exclusiva Mensal
            </Badge>
            {c.allow_sublease ? (
              <span className="text-[10px] font-semibold text-[#BF4B24]">
                Coanfitrião (Sublocação ativa)
              </span>
            ) : (
              <span className="text-[10px] text-slate-500">
                100% Exclusiva (Sem sublocação)
              </span>
            )}
          </div>
        );
      case "fixed_shift":
        return (
          <Badge className="bg-slate-100 text-slate-800 border-0 font-semibold text-[11px]">
            Turno Fixo Semanal
          </Badge>
        );
      case "fixed_daily":
        return (
          <Badge className="bg-slate-100 text-slate-800 border-0 font-semibold text-[11px]">
            Diária Fixa Semanal
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-0 font-semibold text-[11px]">
            Contrato de Diárias
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: RoomContract["status"]) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-0 font-semibold">
            Vigente
          </Badge>
        );
      case "pending_signature":
        return (
          <Badge className="bg-amber-50 text-amber-800 border-0 font-semibold">
            Pendente Assinatura
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-slate-100 text-slate-600 border-0 font-semibold">
            Encerrado
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-50 text-red-700 border-0 font-semibold">
            Cancelado
          </Badge>
        );
    }
  };

  const formatScheduleSummary = (c: RoomContract) => {
    const cfg = c.schedule_config;
    if (c.contract_type === "monthly_exclusive" && !c.allow_sublease) {
      return "Integral (Sala 100% reservada)";
    }
    if (!cfg || !cfg.daysOfWeek) return "Personalizado";
    const dayLabels = cfg.daysOfWeek
      .map((d) => WEEK_DAYS.find((w) => w.id === d)?.label)
      .filter(Boolean)
      .join(", ");
    const prefix =
      c.contract_type === "monthly_exclusive" && c.allow_sublease
        ? "Sublocação: "
        : "";
    return `${prefix}${dayLabels || "Configurado pelo Coanfitrião"} • ${String(cfg.startHour ?? 8).padStart(2, "0")}h às ${String(cfg.endHour ?? 20).padStart(2, "0")}h`;
  };

  const filteredSpecialists =
    specSearch.trim().length > 0
      ? specialists.filter((p) => {
          const q = specSearch.toLowerCase();
          return (
            (p.full_name || "").toLowerCase().includes(q) ||
            (p.cpf || "").includes(q) ||
            (p.email || "").toLowerCase().includes(q)
          );
        })
      : [];

  const previewContractVal =
    pricingTiers.length > 0 && Number(pricingTiers[0].contract_value) > 0
      ? Number(pricingTiers[0].contract_value)
      : Number(form.contract_value) || 0;
  const previewFusionPct = Number(form.platform_fee_pct) || 0;
  const previewHostPct = Number(form.host_split_pct) || 0;
  const previewFinePct = Number(form.fine_pct) || 0;
  const previewInterestPct = Number(form.interest_pct) || 0;

  const activePayPreview = payContract
    ? getMonthlyPaymentState(payContract)
    : null;
  const activePayBaseVal = payContract
    ? getEffectiveContractPricing(payContract).contractValue
    : 0;

  const selectedRoomObj = rooms.find((r) => r.id === form.room_id);

  // ==========================================================================
  // VISÃO EM TELA CHEIA: FORMULÁRIO DE CRIAÇÃO / EDIÇÃO DE CONTRATO
  // ==========================================================================
  if (viewMode === "form") {
    return (
      <div className="p-4 lg:p-8 max-w-7xl mx-auto w-full pb-32 font-sans animate-in fade-in duration-200">
        {/* Topo de Navegação */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-6 mb-6 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setViewMode("list")}
              className="h-10 px-3.5 rounded-xl border-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4 mr-1.5" />
              Voltar para Contratos
            </Button>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 tracking-tight">
                {editingContract
                  ? `Editar Contrato — ${editingContract.specialist_name}`
                  : "Novo Contrato de Locação de Sala"}
              </h1>
              <p className="text-xs text-slate-500 mt-0.5">
                Configure a unidade, vigência, regras de coanfitrião, divisão de
                repasses e anexe o instrumento assinado em PDF.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <Button
              type="button"
              variant="ghost"
              onClick={() => setViewMode("list")}
              className="h-10 rounded-xl font-semibold text-xs text-slate-600"
            >
              Cancelar
            </Button>
            <Button
              type="button"
              disabled={saving}
              onClick={handleSaveContract}
              className="h-10 px-5 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs cursor-pointer"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sincronizando...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Salvar Contrato e Sincronizar Agenda
                </>
              )}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* COLUNA PRINCIPAL DO FORMULÁRIO (8 COLUNAS) */}
          <div className="lg:col-span-8 space-y-6">
            {/* Aviso caso seja subcontrato dentro da sala de um Coanfitrião */}
            {parentCohostForFormRoom && (
              <div className="p-5 rounded-2xl bg-stone-100 border border-stone-200 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-900 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-[#BF4B24]" />
                    Subcontrato vinculado à sala do Coanfitrião{" "}
                    {parentCohostForFormRoom.specialist_name}
                  </span>
                  <Badge className="bg-slate-900 text-white border-0 text-[10px]">
                    Sublocação Fixa
                  </Badge>
                </div>
                <p className="text-xs text-slate-600 leading-relaxed">
                  Esta sala possui contrato mensal vigente com{" "}
                  <strong>{parentCohostForFormRoom.specialist_name}</strong> (
                  {format(
                    parseISO(parentCohostForFormRoom.start_date),
                    "dd/MM/yyyy",
                  )}{" "}
                  a{" "}
                  {format(
                    parseISO(parentCohostForFormRoom.end_date),
                    "dd/MM/yyyy",
                  )}
                  ). Este novo contrato bloqueará os dias escolhidos abaixo e
                  direcionará o repasse líquido diretamente ao coanfitrião.
                </p>
              </div>
            )}

            {/* BLOCO 1: UNIDADE E MODALIDADE */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  1. Consultório e Modalidade Contratual
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Defina a sala que será alocada e o formato jurídico da
                  locação.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Sala / Consultório *
                  </Label>
                  <select
                    value={form.room_id}
                    onChange={(e) => {
                      const nextRoomId = e.target.value;
                      const cohostOnRoom =
                        activeCohostContractByRoomId.get(nextRoomId);
                      const isSub =
                        cohostOnRoom &&
                        (!editingContract ||
                          editingContract.id !== cohostOnRoom.id);

                      setForm({
                        ...form,
                        room_id: nextRoomId,
                        contract_type:
                          isSub && form.contract_type === "monthly_exclusive"
                            ? "fixed_daily"
                            : form.contract_type,
                        allow_sublease: isSub ? false : form.allow_sublease,
                        platform_fee_pct: isSub ? "20" : form.platform_fee_pct,
                        host_split_pct: isSub ? "80" : form.host_split_pct,
                      });
                    }}
                    disabled={Boolean(preselectedRoomId)}
                    className="mt-1.5 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none"
                  >
                    <option value="">Selecione uma sala...</option>
                    {rooms.map((r) => {
                      const roomCohost = activeCohostContractByRoomId.get(r.id);
                      return (
                        <option key={r.id} value={r.id}>
                          {r.name} ({String(r.tier || "start").toUpperCase()})
                          {roomCohost
                            ? ` • Co-Host: ${roomCohost.specialist_name}`
                            : ""}
                        </option>
                      );
                    })}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Modalidade *
                  </Label>
                  <select
                    value={form.contract_type}
                    onChange={(e) => {
                      const nextType = e.target.value as any;
                      setForm({
                        ...form,
                        contract_type: nextType,
                        allow_sublease:
                          nextType === "monthly_exclusive" &&
                          !parentCohostForFormRoom
                            ? form.allow_sublease
                            : false,
                        daysOfWeek:
                          nextType === "monthly_exclusive" &&
                          !form.allow_sublease
                            ? [1, 2, 3, 4, 5, 6, 0]
                            : form.daysOfWeek,
                      });
                    }}
                    className="mt-1.5 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none"
                  >
                    {!parentCohostForFormRoom && (
                      <option value="monthly_exclusive">
                        Sala Exclusiva Mensal / Coanfitrião
                      </option>
                    )}
                    <option value="fixed_shift">
                      Turno Fixo Recorrente (Ex: Segunda Manhã)
                    </option>
                    <option value="fixed_daily">
                      Diária Fixa Recorrente (Ex: Segunda Dia Todo)
                    </option>
                    <option value="custom_daily">Diárias Personalizadas</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Status do Contrato
                  </Label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as any })
                    }
                    className="mt-1.5 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800 outline-none"
                  >
                    <option value="active">Vigente (Ativo)</option>
                    <option value="pending_signature">
                      Aguardando Assinatura
                    </option>
                    <option value="expired">Encerrado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>

              {/* Opção de Direito de Coanfitrião (Sublocação) */}
              {form.contract_type === "monthly_exclusive" &&
                !parentCohostForFormRoom && (
                  <div className="p-4 rounded-xl bg-[#FAF7F4] border border-stone-200/90 space-y-4">
                    <label className="flex items-start justify-between gap-4 cursor-pointer select-none">
                      <div>
                        <span className="text-xs font-bold text-slate-900 block">
                          Habilitar Modo Coanfitrião (Permissão para Sublocar
                          Horários Livres)
                        </span>
                        <span className="text-xs text-slate-600 mt-0.5 block">
                          Permite que o locatário disponibilize seus dias/horas
                          livres na plataforma e receba repasse sobre cada
                          reserva realizada na sala.
                        </span>
                      </div>
                      <input
                        type="checkbox"
                        checked={form.allow_sublease}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setForm({
                            ...form,
                            allow_sublease: checked,
                            cohost_split_pct: checked ? "80" : "0",
                            daysOfWeek: checked
                              ? [2, 4]
                              : [1, 2, 3, 4, 5, 6, 0],
                          });
                        }}
                        className="h-4 w-4 accent-[#BF4B24] rounded mt-0.5 cursor-pointer"
                      />
                    </label>

                    {form.allow_sublease && (
                      <div className="pt-3 border-t border-stone-200/80 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                        <div>
                          <Label className="text-xs font-semibold text-slate-700">
                            Porcentagem do Coanfitrião nas Sublocações Avulsas
                            (%)
                          </Label>
                          <div className="relative mt-1">
                            <Input
                              type="number"
                              min="0"
                              max="100"
                              value={form.cohost_split_pct}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  cohost_split_pct: e.target.value,
                                })
                              }
                              className="bg-white border-stone-200 font-bold text-slate-900 pr-8 h-9 text-xs"
                            />
                            <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2" />
                          </div>
                        </div>
                        <p className="text-[11px] text-slate-600">
                          O profissional verá esta sala na aba{" "}
                          <strong>Minha Sala</strong> e receberá{" "}
                          <strong>{form.cohost_split_pct || 80}%</strong> das
                          sublocações realizadas durante a vigência.
                        </p>
                      </div>
                    )}
                  </div>
                )}
            </div>

            {/* BLOCO 2: QUALIFICAÇÃO DO PROFISSIONAL LOCATÁRIO */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 space-y-5">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    2. Dados do Profissional Locatário
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Vincule a um especialista cadastrado na plataforma para
                    sincronizar o painel e faturas.
                  </p>
                </div>
                {form.specialist_id && (
                  <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px] font-semibold">
                    Conta Vinculada
                  </Badge>
                )}
              </div>

              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <Input
                  placeholder="Pesquisar profissional cadastrado por nome, CPF ou e-mail..."
                  value={specSearch}
                  onChange={(e) => setSpecSearch(e.target.value)}
                  className="bg-slate-50 border-slate-200 h-10 pl-9 text-xs rounded-xl"
                />
                {filteredSpecialists.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                    {filteredSpecialists.slice(0, 8).map((p) => (
                      <button
                        type="button"
                        key={p.id}
                        onClick={() => {
                          setForm({
                            ...form,
                            specialist_id: p.id,
                            specialist_name: p.full_name || "",
                            specialist_document: p.cpf || "",
                            specialist_email: p.email || "",
                            specialist_phone: p.whatsapp || p.phone || "",
                          });
                          setSpecSearch("");
                        }}
                        className="w-full text-left px-4 py-2.5 hover:bg-slate-50 border-b border-slate-100 last:border-0 flex items-center justify-between text-xs"
                      >
                        <span className="font-bold text-slate-900">
                          {p.full_name}
                        </span>
                        <span className="text-slate-500">
                          CPF: {p.cpf || "Não informado"} • {p.email}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Nome Completo *
                  </Label>
                  <Input
                    value={form.specialist_name}
                    onChange={(e) =>
                      setForm({ ...form, specialist_name: e.target.value })
                    }
                    placeholder="Nome do profissional"
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    CPF / CNPJ
                  </Label>
                  <Input
                    value={form.specialist_document}
                    onChange={(e) =>
                      setForm({ ...form, specialist_document: e.target.value })
                    }
                    placeholder="000.000.000-00"
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    WhatsApp / Telefone
                  </Label>
                  <Input
                    value={form.specialist_phone}
                    onChange={(e) =>
                      setForm({ ...form, specialist_phone: e.target.value })
                    }
                    placeholder="(84) 99999-9999"
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    E-mail
                  </Label>
                  <Input
                    value={form.specialist_email}
                    onChange={(e) =>
                      setForm({ ...form, specialist_email: e.target.value })
                    }
                    placeholder="profissional@email.com"
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* BLOCO 3: VIGÊNCIA E GRADE DE HORÁRIOS */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 space-y-5">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  3. Vigência e Alocação de Agenda
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Período de validade do contrato e dias/turnos reservados na
                  sala.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Data de Início *
                  </Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) =>
                      setForm({ ...form, start_date: e.target.value })
                    }
                    className="mt-1 h-10 text-xs font-semibold rounded-xl"
                  />
                </div>
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Data de Término *
                  </Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) =>
                      setForm({ ...form, end_date: e.target.value })
                    }
                    className="mt-1 h-10 text-xs font-semibold rounded-xl"
                  />
                </div>
              </div>

              {form.contract_type === "monthly_exclusive" &&
              !form.allow_sublease ? (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 text-xs text-slate-700 font-medium">
                  Sala 100% exclusiva sem sublocação: todos os dias e horários
                  da semana ficarão reservados para o profissional durante a
                  vigência.
                </div>
              ) : (
                <div className="space-y-4">
                  <div>
                    <Label className="text-xs font-semibold text-slate-700 mb-2 block">
                      {form.contract_type === "monthly_exclusive" &&
                      form.allow_sublease
                        ? "Dias da semana inicialmente abertos para sublocação:"
                        : "Dias da semana reservados para este contrato:"}
                    </Label>
                    <div className="flex flex-wrap gap-2">
                      {WEEK_DAYS.map((d) => {
                        const active = form.daysOfWeek.includes(d.id);
                        return (
                          <button
                            type="button"
                            key={d.id}
                            onClick={() => toggleDayOfWeek(d.id)}
                            className={`px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              active
                                ? "bg-slate-900 text-white border-slate-900"
                                : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {d.full}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Faixa de Turno
                      </Label>
                      <select
                        value={form.selectedShift}
                        onChange={(e) =>
                          handleShiftChange(e.target.value as any)
                        }
                        className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
                      >
                        {SHIFT_OPTIONS.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Hora Inicial
                      </Label>
                      <Input
                        type="number"
                        min="6"
                        max="22"
                        value={form.startHour}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            startHour: Number(e.target.value),
                          })
                        }
                        className="mt-1 h-10 text-xs font-semibold rounded-xl"
                      />
                    </div>

                    <div>
                      <Label className="text-xs font-semibold text-slate-700">
                        Hora Final
                      </Label>
                      <Input
                        type="number"
                        min="7"
                        max="23"
                        value={form.endHour}
                        onChange={(e) =>
                          setForm({
                            ...form,
                            endHour: Number(e.target.value),
                          })
                        }
                        className="mt-1 h-10 text-xs font-semibold rounded-xl"
                      />
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* BLOCO 4: CONDIÇÕES FINANCEIRAS, SPLIT E ESCALONAMENTO */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 space-y-5">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    4. Valores, Vencimento, Encargos e Divisão (Split)
                  </h2>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Configure o valor da mensalidade, dia de vencimento, multa e
                    repasses.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleAddPricingTier}
                  className="h-8 rounded-xl border-slate-200 text-slate-700 font-semibold text-xs cursor-pointer"
                >
                  <Layers className="w-3.5 h-3.5 mr-1.5 text-[#BF4B24]" />
                  {pricingTiers.length === 0
                    ? "Adicionar Escalonamento por Período"
                    : "Novo Período de Valor (+)"}
                </Button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Ciclo de Cobrança
                  </Label>
                  <select
                    value={form.billing_cycle}
                    onChange={(e) =>
                      setForm({ ...form, billing_cycle: e.target.value as any })
                    }
                    className="mt-1 w-full h-10 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
                  >
                    <option value="monthly">Mensal</option>
                    <option value="upfront">Valor Total Fechado</option>
                    <option value="weekly">Semanal</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Dia de Vencimento *
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    max="31"
                    value={form.due_day}
                    onChange={(e) =>
                      setForm({ ...form, due_day: e.target.value })
                    }
                    className="mt-1 h-10 text-xs font-bold rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Valor Mensal / Base (R$) *
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 1200.00"
                    value={form.contract_value}
                    onChange={(e) =>
                      setForm({ ...form, contract_value: e.target.value })
                    }
                    className="mt-1 h-10 text-xs font-bold rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Valor por Sessão/Diária (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={`Auto: R$ ${getComputedSessionValue().toFixed(2)}`}
                    value={form.session_value}
                    onChange={(e) =>
                      setForm({ ...form, session_value: e.target.value })
                    }
                    className="mt-1 h-10 text-xs font-semibold rounded-xl"
                  />
                </div>
              </div>

              {/* Escalonamento por períodos (se ativo) */}
              {pricingTiers.length > 0 && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-slate-800">
                      Valores Escalonados por Período
                    </span>
                    <button
                      type="button"
                      onClick={() => setPricingTiers([])}
                      className="text-xs font-semibold text-red-600 hover:underline"
                    >
                      Remover escalonamento
                    </button>
                  </div>

                  <div className="space-y-2">
                    {pricingTiers.map((tier, idx) => (
                      <div
                        key={tier.id}
                        className="grid grid-cols-1 md:grid-cols-12 gap-2.5 items-end bg-white p-3 rounded-xl border border-slate-200"
                      >
                        <div className="md:col-span-3">
                          <Label className="text-[10px] font-semibold text-slate-500">
                            {idx + 1}º Período — Início
                          </Label>
                          <Input
                            type="date"
                            value={tier.start_date}
                            onChange={(e) =>
                              handleUpdatePricingTier(
                                tier.id,
                                "start_date",
                                e.target.value,
                              )
                            }
                            className="mt-1 h-9 text-xs"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-[10px] font-semibold text-slate-500">
                            Término
                          </Label>
                          <Input
                            type="date"
                            value={tier.end_date}
                            onChange={(e) =>
                              handleUpdatePricingTier(
                                tier.id,
                                "end_date",
                                e.target.value,
                              )
                            }
                            className="mt-1 h-9 text-xs"
                          />
                        </div>
                        <div className="md:col-span-3">
                          <Label className="text-[10px] font-semibold text-slate-700">
                            Valor no Período (R$)
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={tier.contract_value}
                            onChange={(e) =>
                              handleUpdatePricingTier(
                                tier.id,
                                "contract_value",
                                e.target.value,
                              )
                            }
                            className="mt-1 h-9 text-xs font-bold"
                          />
                        </div>
                        <div className="md:col-span-2">
                          <Label className="text-[10px] font-semibold text-slate-500">
                            Valor/Sessão
                          </Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={tier.session_value}
                            onChange={(e) =>
                              handleUpdatePricingTier(
                                tier.id,
                                "session_value",
                                e.target.value,
                              )
                            }
                            className="mt-1 h-9 text-xs"
                          />
                        </div>
                        <div className="md:col-span-1 flex justify-end">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => handleRemovePricingTier(tier.id)}
                            className="h-9 w-9 text-slate-400 hover:text-red-600"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Split e Multa/Juros */}
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4 pt-2 border-t border-slate-100">
                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Taxa Fusion (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={form.platform_fee_pct}
                    onChange={(e) => handleFusionPctChange(e.target.value)}
                    className="mt-1 h-10 text-xs font-bold rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    {parentCohostForFormRoom
                      ? "Repasse Coanfitrião (%)"
                      : "Repasse Clínica (%)"}
                  </Label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    max="100"
                    value={form.host_split_pct}
                    onChange={(e) => handleHostPctChange(e.target.value)}
                    className="mt-1 h-10 text-xs font-bold rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Multa por Atraso (%)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="20"
                    value={form.fine_pct}
                    onChange={(e) =>
                      setForm({ ...form, fine_pct: e.target.value })
                    }
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>

                <div>
                  <Label className="text-xs font-semibold text-slate-700">
                    Juros ao Mês (% a.m.)
                  </Label>
                  <Input
                    type="number"
                    step="0.1"
                    min="0"
                    max="10"
                    value={form.interest_pct}
                    onChange={(e) =>
                      setForm({ ...form, interest_pct: e.target.value })
                    }
                    className="mt-1 h-10 text-xs rounded-xl"
                  />
                </div>
              </div>
            </div>

            {/* BLOCO 5: ANEXO DO CONTRATO PDF E OBSERVAÇÕES */}
            <div className="bg-white p-6 rounded-2xl border border-slate-200/90 space-y-4">
              <div className="border-b border-slate-100 pb-3">
                <h2 className="text-sm font-bold text-slate-900">
                  5. Documento Assinado (PDF) e Observações
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Anexe o contrato em PDF referente a esta sala para que fique
                  disponível no painel do profissional e da administração.
                </p>
              </div>

              <div className="p-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#BF4B24] shrink-0">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {pdfFile
                        ? `Novo arquivo selecionado: ${pdfFile.name}`
                        : editingContract?.pdf_filename
                          ? `PDF anexado: ${editingContract.pdf_filename}`
                          : "Nenhum PDF anexado a este contrato"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Formato aceito: PDF (disponibilizado automaticamente na
                      sala selecionada).
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {editingContract?.pdf_url && !pdfFile && (
                    <a
                      href={editingContract.pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-2 rounded-xl border border-slate-200 bg-white text-slate-700 text-xs font-semibold hover:bg-slate-50 inline-flex items-center gap-1.5"
                    >
                      Ver PDF Atual
                      <ExternalLink className="w-3.5 h-3.5" />
                    </a>
                  )}
                  <label className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold cursor-pointer transition-colors">
                    {editingContract?.pdf_url || pdfFile
                      ? "Substituir PDF"
                      : "Escolher Arquivo PDF"}
                    <input
                      type="file"
                      accept="application/pdf"
                      className="hidden"
                      onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                    />
                  </label>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold text-slate-700">
                  Observações Internas (Opcional)
                </Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Ex: Condição comercial negociada, reajuste ou observação específica desta sala"
                  className="mt-1 h-10 text-xs rounded-xl"
                />
              </div>
            </div>
          </div>

          {/* COLUNA LATERAL DIREITA: RESUMO EXECUTIVO FIXO (4 COLUNAS) */}
          <div className="lg:col-span-4 lg:sticky lg:top-24 space-y-4">
            <div className="bg-slate-900 text-white rounded-2xl p-6 space-y-5 shadow-lg tabular-nums">
              <div className="border-b border-slate-800 pb-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Resumo Executivo do Contrato
                </span>
                <h3 className="text-lg font-bold text-white mt-1">
                  {selectedRoomObj?.name || "Selecione uma sala"}
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Locatário:{" "}
                  <strong className="text-white">
                    {form.specialist_name || "Não informado"}
                  </strong>
                </p>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span>Vigência:</span>
                  <span className="font-semibold text-white">
                    {format(parseISO(form.start_date), "dd/MM/yy")} a{" "}
                    {format(parseISO(form.end_date), "dd/MM/yy")}
                  </span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>Vencimento Mensal:</span>
                  <span className="font-semibold text-white">
                    Todo dia {String(form.due_day || 8).padStart(2, "0")}
                  </span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>Datas Alocadas no Período:</span>
                  <span className="font-semibold text-white">
                    {form.contract_type === "monthly_exclusive" &&
                    !form.allow_sublease
                      ? "Sala 100% Exclusiva"
                      : `${previewDates.length} ocorrências`}
                  </span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>Encargos após vencimento:</span>
                  <span className="text-slate-300">
                    Multa {previewFinePct}% + {previewInterestPct}% a.m.
                  </span>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-800/90 border border-slate-700 space-y-2.5 text-xs">
                <div className="flex justify-between items-baseline">
                  <span className="text-slate-400">Valor Base:</span>
                  <span className="text-lg font-bold text-white">
                    R$ {formatBRL(previewContractVal)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-700 flex justify-between text-slate-300">
                  <span>Receita Fusion ({previewFusionPct}%):</span>
                  <span className="font-bold text-emerald-400">
                    R${" "}
                    {formatBRL((previewContractVal * previewFusionPct) / 100)}
                  </span>
                </div>

                <div className="flex justify-between text-slate-300">
                  <span>
                    {parentCohostForFormRoom
                      ? `Repasse Coanfitrião (${previewHostPct}%):`
                      : `Repasse Clínica (${previewHostPct}%):`}
                  </span>
                  <span className="font-semibold text-white">
                    R$ {formatBRL((previewContractVal * previewHostPct) / 100)}
                  </span>
                </div>

                {form.allow_sublease && (
                  <div className="pt-2 border-t border-slate-700 flex justify-between text-amber-300">
                    <span>Sublocações futuras da sala:</span>
                    <span className="font-bold">
                      {form.cohost_split_pct || 80}% Coanfitrião
                    </span>
                  </div>
                )}
              </div>

              <div className="space-y-2.5 pt-2">
                <Button
                  type="button"
                  disabled={saving}
                  onClick={handleSaveContract}
                  className="w-full h-11 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold text-xs cursor-pointer"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Salvando e Sincronizando...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      Confirmar e Ativar Contrato
                    </>
                  )}
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setViewMode("list")}
                  className="w-full h-10 rounded-xl text-slate-400 hover:text-white hover:bg-slate-800 text-xs font-semibold"
                >
                  Voltar sem salvar
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VISÃO PADRÃO: LISTAGEM EXECUTIVA DE CONTRATOS
  // ==========================================================================
  return (
    <div className="p-4 lg:p-8 w-full pb-32 font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            Contratos, Turnos Fixos & Coanfitriões
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão de salas exclusivas, turnos fixos recorrentes, cobranças
            mensais e documentos PDF por sala.
          </p>
        </div>
        <Button
          onClick={openCreateFormPage}
          className="bg-slate-900 hover:bg-slate-800 text-white font-semibold h-10 px-5 rounded-xl text-xs cursor-pointer"
        >
          <Plus className="w-4 h-4 mr-2" /> Novo Contrato de Sala
        </Button>
      </div>

      {/* KPIs DE CONTRATOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 tabular-nums">
        <div className="bg-white p-5 rounded-2xl border border-slate-200/90">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">
              Volume Contratual Ativo
            </span>
            <Wallet className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            R$ {formatBRL(totalContractRevenue)}
          </p>
          <p className="text-xs font-semibold text-emerald-700 mt-1">
            Receita Fusion: R$ {formatBRL(totalFusionContractTake)}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">
              Contratos Vigentes
            </span>
            <CalendarDays className="w-4 h-4 text-slate-400" />
          </div>
          <p className="text-2xl font-bold text-slate-900">
            {activeContracts.length}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Sincronizados na agenda das salas
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">
              Salas com Coanfitrião
            </span>
            <Building2 className="w-4 h-4 text-[#BF4B24]" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{cohostCount}</p>
          <p className="text-xs text-slate-500 mt-1">
            Sublocação habilitada na vitrine
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200/90">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-semibold text-slate-500">
              Mensalidades em Atraso ({currentMonthLabel})
            </span>
            <CalendarClock
              className={`w-4 h-4 ${
                overdueCount > 0 ? "text-red-500" : "text-emerald-600"
              }`}
            />
          </div>
          <p
            className={`text-2xl font-bold ${
              overdueCount > 0 ? "text-red-600" : "text-slate-900"
            }`}
          >
            {overdueCount}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            Cálculo automático de multa e juros
          </p>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-4 mb-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar profissional, sala ou clínica..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-9 pl-9 rounded-xl border-slate-200 text-xs w-full"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="all">Todas as Modalidades</option>
          <option value="monthly_exclusive">
            Sala Exclusiva / Coanfitrião
          </option>
          <option value="fixed_shift">Turno Fixo Semanal</option>
          <option value="fixed_daily">Diária Fixa Semanal</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
        >
          <option value="all">Todos os Status</option>
          <option value="active">Vigentes</option>
          <option value="overdue">Mensalidade Vencida no Mês</option>
          <option value="pending_signature">Aguardando Assinatura</option>
          <option value="expired">Encerrados</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      {/* TABELA DE CONTRATOS */}
      <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="py-16 text-center px-4">
            <FileText className="w-10 h-10 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-700 font-bold text-sm">
              Nenhum contrato encontrado para este filtro.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Clique em "Novo Contrato de Sala" para cadastrar uma alocação fixa
              ou habilitar um coanfitrião.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
              <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Sala & Clínica</th>
                  <th className="px-6 py-3.5">Locatário / Coanfitrião</th>
                  <th className="px-6 py-3.5">Modalidade & Alocação</th>
                  <th className="px-6 py-3.5">Vigência</th>
                  <th className="px-6 py-3.5 text-center">
                    Fatura Mensal ({currentMonthLabel})
                  </th>
                  <th className="px-6 py-3.5 text-right">
                    Valor & Divisão (Split)
                  </th>
                  <th className="px-6 py-3.5 text-center">Contrato (PDF)</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContracts.map((c) => {
                  const paymentInfo = getMonthlyPaymentState(c);
                  const effectivePricing = getEffectiveContractPricing(c);
                  const parentCohost = getParentCohostForContract(c);

                  const fusionPct = Number(c.platform_fee_pct);
                  const recipientPct = Number(c.host_split_pct);

                  const fusionAmount =
                    effectivePricing.contractValue * (fusionPct / 100);
                  const recipientAmount =
                    effectivePricing.contractValue * (recipientPct / 100);
                  const tiersList = c.schedule_config?.pricingTiers || [];

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">
                          {c.room_name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {c.clinic_name}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">
                          {c.specialist_name}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {c.specialist_document ||
                            c.specialist_phone ||
                            c.specialist_email ||
                            "Profissional Parceiro"}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        {getContractTypeBadge(c)}
                        <p className="text-[11px] text-slate-500 mt-1">
                          {formatScheduleSummary(c)}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-semibold text-slate-800">
                          {format(parseISO(c.start_date), "dd/MM/yyyy")} a{" "}
                          {format(parseISO(c.end_date), "dd/MM/yyyy")}
                        </p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          Ciclo:{" "}
                          {c.billing_cycle === "monthly"
                            ? "Mensal"
                            : c.billing_cycle === "weekly"
                              ? "Semanal"
                              : "Valor Fechado"}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1">
                          {paymentInfo.state === "paid" && (
                            <Badge className="bg-emerald-50 text-emerald-700 border-0 text-[10px] font-semibold">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {paymentInfo.label}
                            </Badge>
                          )}

                          {paymentInfo.state === "overdue" && (
                            <div className="flex flex-col items-center gap-0.5">
                              <Badge className="bg-red-50 text-red-700 border-0 text-[10px] font-semibold">
                                <AlertTriangle className="w-3 h-3 mr-1" />
                                {paymentInfo.label}
                              </Badge>
                              <span className="text-[10px] font-bold text-red-600">
                                Atualizado: R${" "}
                                {formatBRL(paymentInfo.totalWithChargesBrl)}
                              </span>
                            </div>
                          )}

                          {paymentInfo.state === "due_today" && (
                            <Badge className="bg-amber-50 text-amber-800 border-0 text-[10px] font-semibold">
                              {paymentInfo.label}
                            </Badge>
                          )}

                          {paymentInfo.state === "upcoming" && (
                            <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px] font-semibold">
                              {paymentInfo.label}
                            </Badge>
                          )}

                          {c.status !== "cancelled" &&
                            c.status !== "expired" && (
                              <div className="flex items-center gap-2 mt-1">
                                {paymentInfo.state !== "paid" && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      openAsaasPayModal(c, "BOLETO")
                                    }
                                    className="text-[10px] font-semibold bg-slate-900 text-white px-2.5 py-1 rounded-md hover:bg-slate-800 transition-colors cursor-pointer"
                                  >
                                    Emitir Cobrança
                                  </button>
                                )}
                                <button
                                  type="button"
                                  disabled={togglingPaymentId === c.id}
                                  onClick={() => handleToggleMonthPaid(c)}
                                  className={`text-[10px] font-semibold underline transition-colors cursor-pointer ${
                                    paymentInfo.state === "paid"
                                      ? "text-slate-400 hover:text-slate-600"
                                      : "text-emerald-700 hover:text-emerald-900"
                                  }`}
                                >
                                  {togglingPaymentId === c.id
                                    ? "..."
                                    : paymentInfo.state === "paid"
                                      ? "Desfazer baixa"
                                      : "Baixa manual"}
                                </button>
                              </div>
                            )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {tiersList.length > 0 && (
                            <Badge className="bg-orange-50 text-[#BF4B24] border-0 text-[9px] font-semibold">
                              {tiersList.length} períodos
                            </Badge>
                          )}
                          <p className="font-bold text-slate-900">
                            R$ {formatBRL(effectivePricing.contractValue)}
                          </p>
                        </div>

                        <div className="text-[11px] text-slate-500 mt-0.5">
                          Fusion ({fusionPct}%):{" "}
                          <strong className="text-emerald-700">
                            R$ {formatBRL(fusionAmount)}
                          </strong>{" "}
                          •{" "}
                          {parentCohost
                            ? `Co-Host (${recipientPct}%):`
                            : `Clínica (${recipientPct}%):`}{" "}
                          R$ {formatBRL(recipientAmount)}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-center">
                        {c.pdf_url ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <a
                              href={c.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-semibold transition-colors"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              PDF
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <label
                              title="Substituir PDF assinado desta sala"
                              className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-50 cursor-pointer"
                            >
                              <UploadCloud className="w-3.5 h-3.5" />
                              <input
                                type="file"
                                accept="application/pdf"
                                className="hidden"
                                onChange={(e) =>
                                  handleQuickPdfUpload(c, e.target.files?.[0])
                                }
                              />
                            </label>
                          </div>
                        ) : (
                          <label className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-dashed border-slate-300 bg-slate-50 text-slate-700 hover:bg-slate-100 text-xs font-semibold cursor-pointer transition-colors">
                            {uploadingPdfId === c.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UploadCloud className="w-3.5 h-3.5 text-[#BF4B24]" />
                            )}
                            Anexar PDF
                            <input
                              type="file"
                              accept="application/pdf"
                              className="hidden"
                              onChange={(e) =>
                                handleQuickPdfUpload(c, e.target.files?.[0])
                              }
                            />
                          </label>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        {getStatusBadge(c.status)}
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => openEditFormPage(c)}
                            className="h-8 font-semibold text-xs border-slate-200 text-slate-700 cursor-pointer"
                          >
                            <Edit3 className="w-3.5 h-3.5 mr-1" /> Editar
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => handleDeleteContract(c)}
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL DE COBRANÇA ASAAS (BOLETO / PIX / CARTÃO) */}
      <Dialog open={payModalOpen} onOpenChange={setPayModalOpen}>
        <DialogContent className="sm:max-w-lg bg-white border-slate-200 rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-lg font-bold text-slate-900">
              Cobrança Mensal ({currentMonthLabel})
            </DialogTitle>
            <DialogDescription className="text-xs text-slate-500">
              Emita o Boleto Registrado, QR Code PIX ou processe via Cartão para
              o contrato desta sala.
            </DialogDescription>
          </DialogHeader>

          {payContract && activePayPreview && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs tabular-nums">
                <div className="flex justify-between text-slate-600">
                  <span>Sala:</span>
                  <span className="font-bold text-slate-900">
                    {payContract.room_name}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Profissional:</span>
                  <span className="font-bold text-slate-900">
                    {payContract.specialist_name}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Vencimento:</span>
                  <span className="font-semibold text-slate-800">
                    {format(
                      parseISO(activePayPreview.dueDateIso),
                      "dd/MM/yyyy",
                    )}
                  </span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Valor Base:</span>
                  <span className="font-semibold text-slate-900">
                    R$ {formatBRL(activePayBaseVal)}
                  </span>
                </div>

                {activePayPreview.daysLate > 0 && (
                  <>
                    <div className="flex justify-between text-red-700">
                      <span>Multa ({activePayPreview.finePct}%):</span>
                      <span className="font-semibold">
                        + R$ {formatBRL(activePayPreview.fineBrl)}
                      </span>
                    </div>
                    <div className="flex justify-between text-red-700">
                      <span>
                        Juros ({activePayPreview.daysLate}d •{" "}
                        {activePayPreview.interestPct}% a.m.):
                      </span>
                      <span className="font-semibold">
                        + R$ {formatBRL(activePayPreview.interestBrl)}
                      </span>
                    </div>
                  </>
                )}

                <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm">
                  <span className="font-bold text-slate-900">
                    Total da Cobrança:
                  </span>
                  <span className="font-bold text-emerald-700 text-base">
                    R$ {formatBRL(activePayPreview.totalWithChargesBrl)}
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
                    CPF / CNPJ do Locatário *
                  </Label>
                  <Input
                    value={payCpf}
                    onChange={(e) => setPayCpf(e.target.value)}
                    placeholder="000.000.000-00"
                    className="mt-1 h-9 text-xs"
                  />
                </div>
                <div>
                  <Label className="text-[11px] font-semibold text-slate-600">
                    CEP
                  </Label>
                  <Input
                    value={payCep}
                    onChange={(e) => setPayCep(e.target.value)}
                    placeholder="59000-000"
                    className="mt-1 h-9 text-xs"
                  />
                </div>
              </div>

              {payMethod === "CREDIT_CARD" && (
                <div className="space-y-3 pt-1">
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
                    Boleto Registrado Emitido
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
                  onClick={handleExecuteAsaasContractCharge}
                  className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs cursor-pointer"
                >
                  {payProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Comunicando com o Asaas...
                    </>
                  ) : payMethod === "BOLETO" ? (
                    `Emitir Boleto Registrado (R$ ${formatBRL(activePayPreview.totalWithChargesBrl)})`
                  ) : payMethod === "PIX" ? (
                    `Gerar QR Code PIX (R$ ${formatBRL(activePayPreview.totalWithChargesBrl)})`
                  ) : (
                    `Cobrar no Cartão (R$ ${formatBRL(activePayPreview.totalWithChargesBrl)})`
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

export default AdminContractsTab;
