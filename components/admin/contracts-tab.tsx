"use client";

import { useState, useEffect } from "react";
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
  Sparkles,
  Percent,
  Clock,
  FileCheck2,
  Wallet,
  CalendarClock,
  Layers,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
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
  daysOfWeek: number[]; // 0=Dom, 1=Seg, ..., 6=Sab
  shifts: ("morning" | "afternoon" | "night" | "fullday")[];
  startHour: number;
  endHour: number;
  pricingTiers?: ContractPricingTier[];
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

export function AdminContractsTab({
  mode = "admin",
  preselectedRoomId,
}: ContractsTabProps) {
  const supabase = createClient();
  const { toast } = useToast();

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

  // Modal Criar / Editar Contrato
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingContract, setEditingContract] = useState<RoomContract | null>(
    null,
  );
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [specSearch, setSpecSearch] = useState("");

  // Faixas escalonadas de valor por período
  const [pricingTiers, setPricingTiers] = useState<
    {
      id: string;
      start_date: string;
      end_date: string;
      contract_value: string;
      session_value: string;
    }[]
  >([]);

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
    contract_value: "",
    session_value: "",
    platform_fee_pct: "15",
    host_split_pct: "85",
    allow_sublease: false,
    cohost_split_pct: "70",
    daysOfWeek: [1] as number[],
    selectedShift: "fullday" as "fullday" | "morning" | "afternoon" | "night",
    startHour: 8,
    endHour: 20,
    notes: "",
  });

  useEffect(() => {
    loadInitialData();
  }, [preselectedRoomId]);

  const loadInitialData = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      let roomsQuery = supabase
        .from("rooms")
        .select("id, name, host_id, tier, is_active")
        .order("name");

      if (mode === "host" && user) {
        roomsQuery = roomsQuery.eq("host_id", user.id);
      }

      const { data: roomsData, error: rErr } = await roomsQuery;
      if (rErr) throw rErr;

      const safeRooms = roomsData || [];
      setRooms(safeRooms);

      const { data: profilesData } = await supabase
        .from("profiles")
        .select("id, full_name, cpf, email, phone, whatsapp, role")
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
          contractsQuery = contractsQuery.in("room_id", hostRoomIds);
        } else {
          setContracts([]);
          setLoading(false);
          return;
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

          return {
            ...c,
            due_day: Math.min(31, Math.max(1, Number(c.due_day || 8))),
            last_paid_competence: c.last_paid_competence || null,
            contract_value: Number(c.contract_value || 0),
            session_value: Number(c.session_value || 0),
            platform_fee_pct: fusionPct,
            host_split_pct: hostPct,
            cohost_split_pct: Number(c.cohost_split_pct ?? 0),
            room_name: roomObj?.name || "Sala Removida",
            clinic_name: hostName || "Fusion Clinic",
            schedule_config: c.schedule_config || {
              daysOfWeek: [1],
              shifts: ["fullday"],
              startHour: 8,
              endHour: 20,
              pricingTiers: [],
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

  // Retorna o valor vigente do contrato na data de hoje (considerando faixas escalonadas se houver)
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

  // Gerenciamento das Faixas de Preço por Período no Modal
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

  // Sincronização automática das porcentagens Fusion (%) <-> Anfitrião (%)
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

  // --- ENGINE DE MATERIALIZAÇÃO NA AGENDA COM SUPORTE A FAIXAS DE VALOR POR PERÍODO ---
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
      daysOfWeek: [1],
      shifts: ["fullday"],
      startHour: 8,
      endHour: 20,
      pricingTiers: [],
    };

    if (!cfg.daysOfWeek || cfg.daysOfWeek.length === 0) return 0;

    const occurrenceDates = calculateContractOccurrenceDates(
      contract.start_date,
      contract.end_date,
      cfg.daysOfWeek,
    );

    if (occurrenceDates.length === 0) return 0;

    const startH = Number(cfg.startHour ?? 8);
    const endH = Number(cfg.endHour ?? 20);
    const durationHours = Math.max(1, endH - startH);

    const targetUserId =
      contract.specialist_id ||
      contract.host_id ||
      fallbackUserId ||
      specialists[0]?.id;

    if (!targetUserId) return 0;

    const defaultOccurrencesPerMonth = Math.max(1, cfg.daysOfWeek.length * 4);
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
          cfg.daysOfWeek,
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
      startTime.setHours(startH, 0, 0, 0);

      const endTime = new Date(dateObj);
      endTime.setHours(endH, 0, 0, 0);

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
        title: "Contrato PDF anexado com sucesso!",
        description: `Arquivo "${uploaded.filename}" salvo no cofre digital.`,
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
        contract.last_paid_competence === currentCompetence;
      const newCompetence = isPaidThisMonth ? null : currentCompetence;

      const { error } = await supabase
        .from("room_contracts")
        .update({
          last_paid_competence: newCompetence,
          updated_at: new Date().toISOString(),
        })
        .eq("id", contract.id);

      if (error) throw error;

      toast({
        title: newCompetence
          ? `Pagamento de ${currentMonthLabel} confirmado!`
          : `Baixa de ${currentMonthLabel} desfeita.`,
        description: newCompetence
          ? `O contrato de ${contract.specialist_name} foi marcado como pago neste mês.`
          : "O contrato voltou para o status de aguardando pagamento no mês.",
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

  const openCreateModal = () => {
    setEditingContract(null);
    setPdfFile(null);
    setSpecSearch("");
    setPricingTiers([]);
    setForm({
      room_id: preselectedRoomId || rooms[0]?.id || "",
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
      contract_value: "",
      session_value: "",
      platform_fee_pct: "15",
      host_split_pct: "85",
      allow_sublease: false,
      cohost_split_pct: "70",
      daysOfWeek: [1],
      selectedShift: "fullday",
      startHour: 8,
      endHour: 20,
      notes: "",
    });
    setIsModalOpen(true);
  };

  const openEditModal = (c: RoomContract) => {
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
      contract_value: String(c.contract_value || ""),
      session_value: String(c.session_value || ""),
      platform_fee_pct: String(fusionPct),
      host_split_pct: String(hostPct),
      allow_sublease: Boolean(c.allow_sublease),
      cohost_split_pct: String(c.cohost_split_pct ?? 70),
      daysOfWeek: c.schedule_config?.daysOfWeek || [1],
      selectedShift: shiftId,
      startHour: c.schedule_config?.startHour ?? 8,
      endHour: c.schedule_config?.endHour ?? 20,
      notes: c.notes || "",
    });
    setIsModalOpen(true);
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
          "Selecione a sala, o especialista locatário e informe o valor do contrato (ou das faixas de período).",
      });
    }

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
          toast({
            variant: "destructive",
            title: "Aviso no upload do PDF",
            description:
              "O contrato será salvo, mas verifique se o bucket 'contracts' foi criado no Supabase Storage.",
          });
        }
      }

      const scheduleConfig: ContractScheduleConfig = {
        daysOfWeek: form.daysOfWeek,
        shifts: [form.selectedShift],
        startHour: Number(form.startHour),
        endHour: Number(form.endHour),
        pricingTiers: validTiers,
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
        allow_sublease:
          form.contract_type === "monthly_exclusive"
            ? form.allow_sublease
            : false,
        cohost_split_pct:
          form.contract_type === "monthly_exclusive" && form.allow_sublease
            ? Number(form.cohost_split_pct) || 0
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
          ? "Contrato atualizado com sucesso!"
          : "Contrato registrado e ativado!",
        description:
          validTiers.length > 0
            ? `${validTiers.length} períodos de preço configurados e ${generatedCount} reserva(s) lançada(s) com os valores de cada período.`
            : `Split configurado (${parsedFusionPct}% Fusion / ${parsedHostPct}% Anfitrião) e ${generatedCount} reserva(s) lançada(s) na agenda.`,
      });

      setIsModalOpen(false);
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
      if (form.daysOfWeek.length === 1) return;
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
    const dayStr = String(c.due_day || 8).padStart(2, "0");
    if (c.status === "cancelled" || c.status === "expired") {
      return {
        state: "inactive",
        label: `Dia limite: ${dayStr}`,
      };
    }

    if (c.last_paid_competence === currentCompetence) {
      return {
        state: "paid",
        label: `Pago (${currentMonthLabel})`,
      };
    }

    const currentDay = new Date().getDate();
    if (currentDay > (c.due_day || 8)) {
      return {
        state: "overdue",
        label: `Em atraso (Venceu dia ${dayStr})`,
      };
    }
    if (currentDay === (c.due_day || 8)) {
      return {
        state: "due_today",
        label: `Vence Hoje (Dia ${dayStr})`,
      };
    }
    return {
      state: "upcoming",
      label: `Pagar até dia ${dayStr}`,
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

  // KPIs Executivos de Contratos
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

  const getContractTypeBadge = (
    type: RoomContract["contract_type"],
    allowSublease: boolean,
  ) => {
    switch (type) {
      case "monthly_exclusive":
        return (
          <div className="flex flex-col gap-1">
            <Badge className="bg-purple-100 text-purple-800 border-0 w-fit font-bold">
              Fixo Mensal (Sala Exclusiva)
            </Badge>
            {allowSublease && (
              <Badge className="bg-amber-100 text-amber-800 border-0 w-fit text-[10px] font-black">
                <Sparkles className="w-3 h-3 mr-1" /> Co-Anfitrião (Sublocação
                Ativa)
              </Badge>
            )}
          </div>
        );
      case "fixed_shift":
        return (
          <Badge className="bg-blue-100 text-blue-800 border-0 font-bold">
            Turno Fixo Recorrente
          </Badge>
        );
      case "fixed_daily":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold">
            Diária Fixa Semanal
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-700 border-0 font-bold">
            Contrato de Diárias
          </Badge>
        );
    }
  };

  const getStatusBadge = (status: RoomContract["status"]) => {
    switch (status) {
      case "active":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold">
            Vigente
          </Badge>
        );
      case "pending_signature":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-0 font-bold">
            Aguardando Assinatura
          </Badge>
        );
      case "expired":
        return (
          <Badge className="bg-slate-200 text-slate-700 border-0 font-bold">
            Encerrado
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-800 border-0 font-bold">
            Cancelado
          </Badge>
        );
    }
  };

  const formatScheduleSummary = (cfg: ContractScheduleConfig) => {
    if (!cfg || !cfg.daysOfWeek) return "Personalizado";
    const dayLabels = cfg.daysOfWeek
      .map((d) => WEEK_DAYS.find((w) => w.id === d)?.label)
      .filter(Boolean)
      .join(", ");
    return `${dayLabels} • ${String(cfg.startHour ?? 8).padStart(2, "0")}:00 às ${String(cfg.endHour ?? 20).padStart(2, "0")}:00`;
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

  return (
    <div className="p-4 lg:p-8 w-full pb-32 font-sans">
      {/* HEADER */}
      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="w-7 h-7 text-[#BF4B24] shrink-0" />
            Gestão de Contratos, Turnos Fixos & Co-Anfitriões
          </h1>
          <p className="text-xs md:text-sm text-slate-500 font-medium mt-1">
            Controle de salas fixas mensais, valores escalonados por período,
            porcentagens personalizadas (Fusion vs Anfitrião) e PDFs.
          </p>
        </div>
        <Button
          onClick={openCreateModal}
          className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black h-12 px-6 rounded-xl shadow-md w-full sm:w-auto"
        >
          <Plus className="w-5 h-5 mr-2" /> Novo Contrato de Sala
        </Button>
      </div>

      {/* KPIs DE CONTRATOS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Volume Contratual Vigente
            </span>
            <Wallet className="w-5 h-5 text-emerald-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            R${" "}
            {totalContractRevenue.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
          <p className="text-[11px] font-bold text-[#BF4B24] mt-1">
            Take Fusion Contratos: R${" "}
            {totalFusionContractTake.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Contratos Vigentes
            </span>
            <CalendarDays className="w-5 h-5 text-[#BF4B24]" />
          </div>
          <p className="text-2xl font-black text-slate-900">
            {activeContracts.length}
          </p>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Sincronizados automaticamente na agenda
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Salas com Co-Anfitrião
            </span>
            <Sparkles className="w-5 h-5 text-purple-600" />
          </div>
          <p className="text-2xl font-black text-slate-900">{cohostCount}</p>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Aluguel fixo + split sobre sublocações
          </p>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-bold text-slate-400 uppercase">
              Mensalidades Vencidas ({currentMonthLabel})
            </span>
            <CalendarClock
              className={`w-5 h-5 ${overdueCount > 0 ? "text-red-500" : "text-emerald-500"}`}
            />
          </div>
          <p
            className={`text-2xl font-black ${overdueCount > 0 ? "text-red-600" : "text-slate-900"}`}
          >
            {overdueCount}
          </p>
          <p className="text-[11px] font-medium text-slate-400 mt-1">
            Contratos que passaram do dia limite no mês
          </p>
        </div>
      </div>

      {/* BARRA DE FILTROS */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs p-4 mb-6 flex flex-col sm:flex-row flex-wrap items-stretch sm:items-center justify-between gap-3">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <Input
            placeholder="Buscar especialista, sala ou clínica..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-10 pl-9 rounded-xl border-slate-200 w-full"
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
        >
          <option value="all">Todas as Modalidades</option>
          <option value="monthly_exclusive">Fixo Mensal / Co-Anfitrião</option>
          <option value="fixed_shift">Turno Fixo Semanal</option>
          <option value="fixed_daily">Diária Fixa Semanal</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none"
        >
          <option value="all">Todos os Status</option>
          <option value="active">Vigentes</option>
          <option value="overdue">Pagamento em Atraso no Mês</option>
          <option value="pending_signature">Aguardando Assinatura</option>
          <option value="expired">Encerrados</option>
          <option value="cancelled">Cancelados</option>
        </select>
      </div>

      {/* TABELA DE CONTRATOS */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-xs overflow-hidden">
        {loading ? (
          <div className="py-20 flex justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
          </div>
        ) : filteredContracts.length === 0 ? (
          <div className="py-16 text-center px-4">
            <FileText className="w-12 h-12 text-slate-200 mx-auto mb-3" />
            <p className="text-slate-600 font-bold">
              Nenhum contrato cadastrado para este filtro.
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Cadastre contratos mensais, turnos fixos ou diárias recorrentes
              para bloquear a agenda e contabilizar a ocupação da sala.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4">Sala & Clínica</th>
                  <th className="px-6 py-4">Locatário / Co-Anfitrião</th>
                  <th className="px-6 py-4">Modalidade & Alocação</th>
                  <th className="px-6 py-4">Vigência</th>
                  <th className="px-6 py-4 text-center">
                    Data Limite de Pagamento
                  </th>
                  <th className="px-6 py-4 text-right">
                    Valor & Divisão (Fusion / Anfitrião)
                  </th>
                  <th className="px-6 py-4 text-center">Contrato (PDF)</th>
                  <th className="px-6 py-4 text-center">Status</th>
                  <th className="px-6 py-4 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredContracts.map((c) => {
                  const paymentInfo = getMonthlyPaymentState(c);
                  const effectivePricing = getEffectiveContractPricing(c);
                  const fusionAmount =
                    effectivePricing.contractValue *
                    (Number(c.platform_fee_pct) / 100);
                  const hostAmount =
                    effectivePricing.contractValue *
                    (Number(c.host_split_pct) / 100);
                  const tiersList = c.schedule_config?.pricingTiers || [];

                  return (
                    <tr
                      key={c.id}
                      className="hover:bg-orange-50/20 transition-colors"
                    >
                      <td className="px-6 py-4">
                        <p className="font-black text-slate-900 flex items-center gap-1.5">
                          <Building2 className="w-4 h-4 text-slate-400" />
                          {c.room_name}
                        </p>
                        <p className="text-[11px] font-bold text-slate-400 ml-5">
                          {c.clinic_name}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-bold text-[#BF4B24]">
                          {c.specialist_name}
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">
                          {c.specialist_document ||
                            c.specialist_phone ||
                            c.specialist_email ||
                            "Especialista Parceiro"}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        {getContractTypeBadge(
                          c.contract_type,
                          c.allow_sublease,
                        )}
                        <p className="text-[11px] font-bold text-slate-600 mt-1 flex items-center gap-1">
                          <Clock className="w-3 h-3 text-slate-400" />
                          {formatScheduleSummary(c.schedule_config)}
                        </p>
                      </td>

                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-700">
                          {format(parseISO(c.start_date), "dd/MM/yyyy")} até{" "}
                          {format(parseISO(c.end_date), "dd/MM/yyyy")}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                          Ciclo:{" "}
                          {c.billing_cycle === "monthly"
                            ? "Mensal"
                            : c.billing_cycle === "weekly"
                              ? "Semanal"
                              : "Valor Fechado"}
                        </p>
                      </td>

                      <td className="px-6 py-4 text-center">
                        <div className="flex flex-col items-center gap-1.5">
                          <span className="text-xs font-black text-slate-800 flex items-center gap-1">
                            <CalendarClock className="w-3.5 h-3.5 text-[#BF4B24]" />
                            Até todo dia{" "}
                            {String(c.due_day || 8).padStart(2, "0")}
                          </span>

                          {paymentInfo.state === "paid" && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] font-black">
                              <CheckCircle2 className="w-3 h-3 mr-1" />
                              {paymentInfo.label}
                            </Badge>
                          )}

                          {paymentInfo.state === "overdue" && (
                            <Badge className="bg-red-100 text-red-800 border-0 text-[10px] font-black">
                              <AlertTriangle className="w-3 h-3 mr-1" />
                              {paymentInfo.label}
                            </Badge>
                          )}

                          {paymentInfo.state === "due_today" && (
                            <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-black">
                              <Clock className="w-3 h-3 mr-1" />
                              {paymentInfo.label}
                            </Badge>
                          )}

                          {paymentInfo.state === "upcoming" && (
                            <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px] font-bold">
                              {paymentInfo.label}
                            </Badge>
                          )}

                          {c.status !== "cancelled" &&
                            c.status !== "expired" && (
                              <button
                                type="button"
                                disabled={togglingPaymentId === c.id}
                                onClick={() => handleToggleMonthPaid(c)}
                                className={`text-[10px] font-bold underline transition-colors ${
                                  paymentInfo.state === "paid"
                                    ? "text-slate-400 hover:text-slate-600"
                                    : "text-emerald-700 hover:text-emerald-900"
                                }`}
                              >
                                {togglingPaymentId === c.id
                                  ? "Atualizando..."
                                  : paymentInfo.state === "paid"
                                    ? "Desfazer baixa do mês"
                                    : `Dar baixa (${currentMonthLabel})`}
                              </button>
                            )}
                        </div>
                      </td>

                      <td className="px-6 py-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {tiersList.length > 0 && (
                            <Badge className="bg-orange-100 text-[#BF4B24] border-0 text-[9px] font-black">
                              <Layers className="w-3 h-3 mr-1" />
                              Escalonado ({tiersList.length} períodos)
                            </Badge>
                          )}
                          <p className="font-black text-slate-900">
                            R${" "}
                            {effectivePricing.contractValue.toLocaleString(
                              "pt-BR",
                              {
                                minimumFractionDigits: 2,
                              },
                            )}
                          </p>
                        </div>

                        {tiersList.length > 0 && (
                          <div className="mt-1 space-y-0.5 text-[10px] text-[#BF4B24] font-bold">
                            {tiersList.map((t, i) => (
                              <p key={t.id || i}>
                                {i + 1}º:{" "}
                                {format(parseISO(t.start_date), "dd/MM/yy")} a{" "}
                                {format(parseISO(t.end_date), "dd/MM/yy")} → R${" "}
                                {Number(t.contract_value).toLocaleString(
                                  "pt-BR",
                                  { minimumFractionDigits: 2 },
                                )}
                              </p>
                            ))}
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 mt-0.5">
                          <span className="text-[10px] font-bold text-[#BF4B24]">
                            Fusion ({c.platform_fee_pct}%): R${" "}
                            {fusionAmount.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-slate-300">•</span>
                          <span className="text-[10px] font-bold text-emerald-700">
                            Anfitrião ({c.host_split_pct}%): R${" "}
                            {hostAmount.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                              maximumFractionDigits: 2,
                            })}
                          </span>
                        </div>
                        {c.allow_sublease && (
                          <p className="text-[10px] font-black text-purple-700 mt-0.5">
                            Sublocação Co-Anfitrião: {c.cohost_split_pct}%
                          </p>
                        )}
                      </td>

                      <td className="px-6 py-4 text-center">
                        {c.pdf_url ? (
                          <div className="flex items-center justify-center gap-1.5">
                            <a
                              href={c.pdf_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs font-bold transition-colors"
                            >
                              <FileCheck2 className="w-3.5 h-3.5" />
                              Abrir PDF
                              <ExternalLink className="w-3 h-3" />
                            </a>
                            <label
                              title="Substituir PDF assinado"
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
                          <label className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-dashed border-amber-400 bg-amber-50/60 text-amber-800 hover:bg-amber-100 text-xs font-bold cursor-pointer transition-colors">
                            {uploadingPdfId === c.id ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <UploadCloud className="w-3.5 h-3.5" />
                            )}
                            Anexar PDF Assinado
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
                            onClick={() => openEditModal(c)}
                            className="h-8 font-bold border-slate-200 text-slate-700"
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

      {/* MODAL COMPLETO CRIAR / EDITAR CONTRATO */}
      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-3xl max-h-[92vh] overflow-y-auto bg-white">
          <DialogHeader>
            <DialogTitle className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
              <FileText className="w-5 h-5 text-[#BF4B24]" />
              {editingContract
                ? "Editar Contrato de Locação"
                : "Novo Contrato de Sala & Alocação na Agenda"}
            </DialogTitle>
            <DialogDescription>
              Configure a modalidade contratual, faixas de valor por período (se
              houver reajuste ou desconto inicial), porcentagens da Fusion e do
              Anfitrião e o PDF assinado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 py-2">
            {/* 1. SALA E MODALIDADE */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs font-bold uppercase text-slate-500">
                  Sala do Contrato *
                </Label>
                <select
                  value={form.room_id}
                  onChange={(e) =>
                    setForm({ ...form, room_id: e.target.value })
                  }
                  disabled={Boolean(preselectedRoomId)}
                  className="mt-1 w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none"
                >
                  <option value="">Selecione uma sala...</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({String(r.tier || "start").toUpperCase()})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold uppercase text-slate-500">
                  Modalidade de Contrato *
                </Label>
                <select
                  value={form.contract_type}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      contract_type: e.target.value as any,
                    })
                  }
                  className="mt-1 w-full h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-800 outline-none"
                >
                  <option value="monthly_exclusive">
                    Contrato Fixo Mensal (Sala Exclusiva / Co-Anfitrião)
                  </option>
                  <option value="fixed_shift">
                    Contrato de Turno Fixo (Ex: Toda Segunda pela Manhã)
                  </option>
                  <option value="fixed_daily">
                    Contrato de Diária Fixa (Ex: Toda Segunda o Dia Todo)
                  </option>
                  <option value="custom_daily">
                    Contrato de Diárias Personalizadas
                  </option>
                </select>
              </div>
            </div>

            {/* 2. ESPECIALISTA LOCATÁRIO */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <div className="flex items-center justify-between">
                <Label className="text-xs font-black uppercase text-slate-600 flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-[#BF4B24]" />
                  Profissional Locatário (Ou Co-Anfitrião da Sala)
                </Label>
                {form.specialist_id && (
                  <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px]">
                    Vinculado ao Perfil da Plataforma
                  </Badge>
                )}
              </div>

              <div className="relative">
                <Input
                  placeholder="Buscar profissional já cadastrado pelo nome ou CPF (opcional)..."
                  value={specSearch}
                  onChange={(e) => setSpecSearch(e.target.value)}
                  className="bg-white border-slate-200 h-10 text-sm"
                />
                {filteredSpecialists.length > 0 && (
                  <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-44 overflow-y-auto">
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
                        className="w-full text-left px-4 py-2.5 hover:bg-orange-50 border-b border-slate-100 last:border-0 flex items-center justify-between"
                      >
                        <span className="font-bold text-sm text-slate-800">
                          {p.full_name}
                        </span>
                        <span className="text-xs text-slate-400">
                          CPF: {p.cpf || "N/A"}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    Nome Completo do Locatário *
                  </Label>
                  <Input
                    value={form.specialist_name}
                    onChange={(e) =>
                      setForm({ ...form, specialist_name: e.target.value })
                    }
                    placeholder="Ex: Dra. Aniely Barreto"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    CPF / CNPJ
                  </Label>
                  <Input
                    value={form.specialist_document}
                    onChange={(e) =>
                      setForm({ ...form, specialist_document: e.target.value })
                    }
                    placeholder="000.000.000-00"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    WhatsApp / Telefone
                  </Label>
                  <Input
                    value={form.specialist_phone}
                    onChange={(e) =>
                      setForm({ ...form, specialist_phone: e.target.value })
                    }
                    placeholder="(84) 99999-9999"
                    className="mt-1 bg-white"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    E-mail
                  </Label>
                  <Input
                    value={form.specialist_email}
                    onChange={(e) =>
                      setForm({ ...form, specialist_email: e.target.value })
                    }
                    placeholder="especialista@email.com"
                    className="mt-1 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* 3. REGRA DE CO-ANFITRIÃO / SUBLOCAÇÃO */}
            {form.contract_type === "monthly_exclusive" && (
              <div className="p-5 rounded-2xl border-2 border-purple-200 bg-purple-50/40 space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <h4 className="font-black text-purple-950 flex items-center gap-2 text-sm">
                      <Sparkles className="w-4 h-4 text-purple-600" />
                      Direito de Realocação / Sublocação (Modo Co-Anfitrião)
                    </h4>
                    <p className="text-xs text-purple-800/80 font-medium mt-1">
                      Permite que o locatário da sala fixa disponibilize seus
                      horários ociosos na plataforma e receba uma porcentagem
                      sobre os agendamentos avulsos realizados na sala.
                    </p>
                  </div>
                  <input
                    type="checkbox"
                    checked={form.allow_sublease}
                    onChange={(e) =>
                      setForm({ ...form, allow_sublease: e.target.checked })
                    }
                    className="h-5 w-5 accent-purple-600 rounded cursor-pointer mt-1"
                  />
                </div>

                {form.allow_sublease && (
                  <div className="pt-2 border-t border-purple-200/60 grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div>
                      <Label className="text-xs font-bold text-purple-900">
                        Repasse do Co-Anfitrião nas Sublocações (%)
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
                          className="bg-white border-purple-200 font-black text-purple-900 pr-8"
                        />
                        <Percent className="w-4 h-4 text-purple-500 absolute right-3 top-1/2 -translate-y-1/2" />
                      </div>
                    </div>
                    <div className="text-xs text-purple-900 bg-white/80 p-3 rounded-xl border border-purple-100 font-medium">
                      Nos horários vagos alugados de forma avulsa, a Fusion
                      retém 20% e o Co-Anfitrião recebe{" "}
                      <strong>{form.cohost_split_pct || 0}%</strong> do líquido.
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* 4. VIGÊNCIA, DIAS DA SEMANA E TURNOS BLOQUEADOS NA AGENDA */}
            <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-4">
              <Label className="text-xs font-black uppercase text-slate-600 flex items-center gap-1.5">
                <CalendarDays className="w-4 h-4 text-[#BF4B24]" />
                Vigência Geral e Alocação Automática na Agenda
              </Label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    Data Inicial *
                  </Label>
                  <Input
                    type="date"
                    value={form.start_date}
                    onChange={(e) =>
                      setForm({ ...form, start_date: e.target.value })
                    }
                    className="mt-1 bg-white font-bold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    Data Final *
                  </Label>
                  <Input
                    type="date"
                    value={form.end_date}
                    onChange={(e) =>
                      setForm({ ...form, end_date: e.target.value })
                    }
                    className="mt-1 bg-white font-bold"
                  />
                </div>
                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    Status do Contrato
                  </Label>
                  <select
                    value={form.status}
                    onChange={(e) =>
                      setForm({ ...form, status: e.target.value as any })
                    }
                    className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
                  >
                    <option value="active">
                      Vigente (Bloquear Agenda e Contabilizar)
                    </option>
                    <option value="pending_signature">
                      Aguardando Assinatura (Pré-Reserva)
                    </option>
                    <option value="expired">Encerrado</option>
                    <option value="cancelled">Cancelado</option>
                  </select>
                </div>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600 mb-2 block">
                  Dias da Semana Reservados para este Contrato
                </Label>
                <div className="flex flex-wrap gap-2">
                  {WEEK_DAYS.map((d) => {
                    const active = form.daysOfWeek.includes(d.id);
                    return (
                      <button
                        type="button"
                        key={d.id}
                        onClick={() => toggleDayOfWeek(d.id)}
                        className={`px-3.5 py-2 rounded-xl text-xs font-black border transition-all ${
                          active
                            ? "bg-[#BF4B24] text-white border-[#BF4B24] shadow-xs"
                            : "bg-white text-slate-600 border-slate-200 hover:border-orange-300"
                        }`}
                      >
                        {d.full}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="md:col-span-1">
                  <Label className="text-xs font-bold text-slate-600">
                    Turno Padrão
                  </Label>
                  <select
                    value={form.selectedShift}
                    onChange={(e) => handleShiftChange(e.target.value as any)}
                    className="mt-1 w-full h-10 rounded-md border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
                  >
                    {SHIFT_OPTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    Hora de Entrada
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
                    className="mt-1 bg-white font-bold"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-600">
                    Hora de Saída
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
                    className="mt-1 bg-white font-bold"
                  />
                </div>
              </div>

              <div className="bg-orange-50/80 border border-orange-200 rounded-xl p-3 flex items-center justify-between text-xs">
                <span className="font-bold text-orange-950">
                  Total de diárias/turnos que serão lançados na agenda no
                  período:
                </span>
                <Badge className="bg-[#BF4B24] text-white border-0 font-black">
                  {previewDates.length} agendamento(s) de contrato
                </Badge>
              </div>
            </div>

            {/* 5. VALORES FINANCEIROS, ESCALONAMENTO POR PERÍODO E SPLIT */}
            <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <Label className="text-xs font-black uppercase tracking-wider text-orange-400 flex items-center gap-1.5">
                  <Wallet className="w-4 h-4" />
                  Configuração Financeira & Valores por Período
                </Label>
                <Button
                  type="button"
                  size="sm"
                  onClick={handleAddPricingTier}
                  className="h-8 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black text-xs rounded-lg"
                >
                  <Layers className="w-3.5 h-3.5 mr-1.5" />
                  {pricingTiers.length === 0
                    ? "Configurar Valores Diferentes por Período (+)"
                    : "Adicionar Outro Período de Valor (+)"}
                </Button>
              </div>

              {/* CAMPOS PADRÃO */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-3">
                <div>
                  <Label className="text-xs font-bold text-slate-300">
                    Ciclo de Faturamento
                  </Label>
                  <select
                    value={form.billing_cycle}
                    onChange={(e) =>
                      setForm({ ...form, billing_cycle: e.target.value as any })
                    }
                    className="mt-1 w-full h-10 rounded-md border border-slate-700 bg-slate-800 px-3 text-sm font-bold text-white"
                  >
                    <option value="monthly">Valor Mensal (Recorrente)</option>
                    <option value="upfront">Valor Total do Contrato</option>
                    <option value="weekly">Valor Semanal</option>
                  </select>
                </div>

                <div>
                  <Label className="text-xs font-bold text-orange-300">
                    Dia Limite Pagamento *
                  </Label>
                  <div className="relative mt-1">
                    <Input
                      type="number"
                      min="1"
                      max="31"
                      placeholder="Ex: 8"
                      value={form.due_day}
                      onChange={(e) =>
                        setForm({ ...form, due_day: e.target.value })
                      }
                      className="font-black bg-slate-800 border-slate-700 text-white"
                    />
                    <span className="text-[10px] font-bold text-slate-400 absolute right-3 top-1/2 -translate-y-1/2">
                      do mês
                    </span>
                  </div>
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-300">
                    {pricingTiers.length > 0
                      ? "Valor Base Referência (R$)"
                      : "Valor do Contrato (R$) *"}
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="Ex: 1200.00"
                    value={form.contract_value}
                    onChange={(e) =>
                      setForm({ ...form, contract_value: e.target.value })
                    }
                    className="mt-1 font-black bg-slate-800 border-slate-700 text-white"
                  />
                </div>

                <div>
                  <Label className="text-xs font-bold text-slate-300">
                    Valor por Diária/Turno (R$)
                  </Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder={`Auto: R$ ${getComputedSessionValue().toFixed(2)}`}
                    value={form.session_value}
                    onChange={(e) =>
                      setForm({ ...form, session_value: e.target.value })
                    }
                    className="mt-1 font-bold bg-slate-800 border-slate-700 text-emerald-400"
                  />
                </div>
              </div>

              {/* TABELA DE FAIXAS DE PREÇO POR PERÍODO */}
              {pricingTiers.length > 0 && (
                <div className="p-3.5 rounded-xl bg-slate-800/80 border border-orange-500/30 space-y-3">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-black text-orange-300 flex items-center gap-1.5">
                      <Layers className="w-4 h-4" />
                      Escalonamento de Valores por Período (Cada reserva na
                      agenda usará o valor da sua respectiva data)
                    </p>
                    <button
                      type="button"
                      onClick={() => setPricingTiers([])}
                      className="text-[11px] font-bold text-slate-400 hover:text-red-400 underline"
                    >
                      Remover escalonamento
                    </button>
                  </div>

                  <div className="space-y-2.5">
                    {pricingTiers.map((tier, idx) => {
                      const autoSession = getComputedSessionValueForAmount(
                        Number(tier.contract_value) || 0,
                        Number(tier.session_value) || 0,
                      );
                      return (
                        <div
                          key={tier.id}
                          className="grid grid-cols-1 md:grid-cols-12 gap-2 items-end bg-slate-900/90 p-3 rounded-xl border border-slate-700"
                        >
                          <div className="md:col-span-3">
                            <Label className="text-[10px] font-bold text-orange-300 uppercase">
                              {idx + 1}º Período: Início
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
                              className="mt-1 h-9 bg-slate-800 border-slate-700 text-white text-xs font-bold"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <Label className="text-[10px] font-bold text-orange-300 uppercase">
                              Até a Data
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
                              className="mt-1 h-9 bg-slate-800 border-slate-700 text-white text-xs font-bold"
                            />
                          </div>

                          <div className="md:col-span-3">
                            <Label className="text-[10px] font-bold text-white uppercase">
                              Valor neste Período (R$) *
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder="Ex: 1000.00"
                              value={tier.contract_value}
                              onChange={(e) =>
                                handleUpdatePricingTier(
                                  tier.id,
                                  "contract_value",
                                  e.target.value,
                                )
                              }
                              className="mt-1 h-9 bg-slate-800 border-orange-500/50 text-white text-xs font-black"
                            />
                          </div>

                          <div className="md:col-span-2">
                            <Label className="text-[10px] font-bold text-emerald-400 uppercase">
                              Valor/Diária (R$)
                            </Label>
                            <Input
                              type="number"
                              step="0.01"
                              placeholder={`Auto: ${autoSession.toFixed(2)}`}
                              value={tier.session_value}
                              onChange={(e) =>
                                handleUpdatePricingTier(
                                  tier.id,
                                  "session_value",
                                  e.target.value,
                                )
                              }
                              className="mt-1 h-9 bg-slate-800 border-slate-700 text-emerald-300 text-xs font-bold"
                            />
                          </div>

                          <div className="md:col-span-1 flex justify-end">
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              onClick={() => handleRemovePricingTier(tier.id)}
                              className="h-9 w-9 text-slate-400 hover:text-red-400 hover:bg-red-500/10"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* CAMPOS DE PORCENTAGEM DA FUSION E DO ANFITRIÃO */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3 border-t border-slate-800">
                <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700">
                  <Label className="text-xs font-black text-orange-400 uppercase flex items-center justify-between">
                    <span>Porcentagem da Fusion (%)</span>
                    <span className="text-white">
                      R${" "}
                      {((previewContractVal * previewFusionPct) / 100).toFixed(
                        2,
                      )}
                    </span>
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={form.platform_fee_pct}
                      onChange={(e) => handleFusionPctChange(e.target.value)}
                      className="bg-slate-900 border-orange-500/40 font-black text-white pr-8"
                    />
                    <Percent className="w-4 h-4 text-orange-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>

                <div className="bg-slate-800/90 p-3.5 rounded-xl border border-slate-700">
                  <Label className="text-xs font-black text-emerald-400 uppercase flex items-center justify-between">
                    <span>Porcentagem do Anfitrião (%)</span>
                    <span className="text-white">
                      R${" "}
                      {((previewContractVal * previewHostPct) / 100).toFixed(2)}
                    </span>
                  </Label>
                  <div className="relative mt-2">
                    <Input
                      type="number"
                      step="0.5"
                      min="0"
                      max="100"
                      value={form.host_split_pct}
                      onChange={(e) => handleHostPctChange(e.target.value)}
                      className="bg-slate-900 border-emerald-500/40 font-black text-white pr-8"
                    />
                    <Percent className="w-4 h-4 text-emerald-400 absolute right-3 top-1/2 -translate-y-1/2" />
                  </div>
                </div>
              </div>
            </div>

            {/* 6. ANEXO DO CONTRATO ASSINADO (PDF) + OBSERVAÇÕES */}
            <div className="space-y-4">
              <div className="p-4 rounded-2xl border-2 border-dashed border-slate-200 bg-slate-50/60 flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-[#BF4B24] shrink-0">
                    <UploadCloud className="w-5 h-5" />
                  </div>
                  <div>
                    <p className="text-sm font-black text-slate-900">
                      Anexar Contrato Assinado (PDF)
                    </p>
                    <p className="text-xs text-slate-500">
                      {pdfFile
                        ? `Selecionado: ${pdfFile.name}`
                        : editingContract?.pdf_filename
                          ? `Arquivo atual: ${editingContract.pdf_filename}`
                          : "Salve o PDF assinado pelas duas partes para consulta do Admin e do Anfitrião."}
                    </p>
                  </div>
                </div>
                <label className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0 transition-colors">
                  Escolher Arquivo PDF
                  <input
                    type="file"
                    accept="application/pdf"
                    className="hidden"
                    onChange={(e) => setPdfFile(e.target.files?.[0] || null)}
                  />
                </label>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-600">
                  Observações Internas do Contrato (Opcional)
                </Label>
                <Input
                  value={form.notes}
                  onChange={(e) => setForm({ ...form, notes: e.target.value })}
                  placeholder="Ex: Reajuste acordado após o 3º mês / Cláusula específica"
                  className="mt-1 bg-white"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="mt-4 gap-2">
            <Button
              variant="ghost"
              onClick={() => setIsModalOpen(false)}
              className="font-bold text-slate-500"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleSaveContract}
              disabled={saving}
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black px-6 rounded-xl"
            >
              {saving ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Sincronizando Contrato e Períodos...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4 mr-2" />
                  Salvar Contrato e Gerar Agendamentos
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default AdminContractsTab;
