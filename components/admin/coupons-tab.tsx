// components/admin/coupons-tab.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  format,
  parseISO,
  subDays,
  eachDayOfInterval,
  getDay,
  getHours,
} from "date-fns";
import {
  Ticket,
  Plus,
  Percent,
  Banknote,
  Gift,
  Users,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  Trash2,
  ArrowLeft,
  Search,
  UserCheck,
  Building2,
  Clock,
  Calendar as CalendarIcon,
  Power,
  Pencil,
  Copy,
  SlidersHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

const WEEKDAYS_LIST = [
  { id: 1, short: "Seg", full: "Segunda-feira" },
  { id: 2, short: "Ter", full: "Terça-feira" },
  { id: 3, short: "Qua", full: "Quarta-feira" },
  { id: 4, short: "Qui", full: "Quinta-feira" },
  { id: 5, short: "Sex", full: "Sexta-feira" },
  { id: 6, short: "Sáb", full: "Sábado" },
  { id: 0, short: "Dom", full: "Domingo" },
];

const ALL_SLOTS_LIST = [
  { hour: 8, short: "08h", label: "08:00 - 08:50", shift: "morning" },
  { hour: 9, short: "09h", label: "09:00 - 09:50", shift: "morning" },
  { hour: 10, short: "10h", label: "10:00 - 10:50", shift: "morning" },
  { hour: 11, short: "11h", label: "11:00 - 11:50", shift: "morning" },
  { hour: 12, short: "12h", label: "12:00 - 12:50", shift: "afternoon" },
  { hour: 13, short: "13h", label: "13:00 - 13:50", shift: "afternoon" },
  { hour: 14, short: "14h", label: "14:00 - 14:50", shift: "afternoon" },
  { hour: 15, short: "15h", label: "15:00 - 15:50", shift: "afternoon" },
  { hour: 16, short: "16h", label: "16:00 - 16:50", shift: "afternoon" },
  { hour: 17, short: "17h", label: "17:00 - 17:50", shift: "afternoon" },
  { hour: 18, short: "18h", label: "18:00 - 18:50", shift: "night" },
  { hour: 19, short: "19h", label: "19:00 - 19:50", shift: "night" },
  { hour: 20, short: "20h", label: "20:00 - 20:50", shift: "night" },
  { hour: 21, short: "21h", label: "21:00 - 21:50", shift: "night" },
];

export type DayHoursMap = Record<string, number[]>;

export interface CouponScheduleRules {
  is_campaign: boolean;
  enabled: boolean;
  show_on_calendar: boolean;
  auto_apply: boolean;
  campaign_name?: string;
  start_date?: string | null;
  day_hours: DayHoursMap;
  days_of_week: number[];
  allowed_hours: number[];
}

function createDefaultDayHours(): DayHoursMap {
  return {
    "1": [8, 9, 10, 11],
    "2": [8, 9, 10, 11],
    "3": [8, 9, 10, 11],
    "4": [8, 9, 10, 11],
    "5": [8, 9, 10, 11],
    "6": [],
    "0": [],
  };
}

export function extractCouponRules(coupon: any): CouponScheduleRules {
  let parsed: any = coupon?.schedule_rules;
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      parsed = null;
    }
  }

  const showCal =
    typeof coupon?.show_on_calendar === "boolean"
      ? coupon.show_on_calendar
      : Boolean(parsed?.show_on_calendar);

  const isCampaign =
    Boolean(parsed?.is_campaign) ||
    Boolean(parsed?.enabled) ||
    Boolean(showCal);

  const autoApp =
    typeof coupon?.auto_apply === "boolean"
      ? coupon.auto_apply
      : parsed?.auto_apply !== undefined
        ? Boolean(parsed.auto_apply)
        : true;

  const dayHours: DayHoursMap = {
    "0": [],
    "1": [],
    "2": [],
    "3": [],
    "4": [],
    "5": [],
    "6": [],
  };

  if (parsed?.day_hours && typeof parsed.day_hours === "object") {
    Object.keys(dayHours).forEach((dKey) => {
      const rawArr = parsed.day_hours[dKey];
      if (Array.isArray(rawArr)) {
        dayHours[dKey] = Array.from(
          new Set(rawArr.map(Number).filter((n: number) => !isNaN(n))),
        ).sort((a, b) => a - b);
      }
    });
  } else if (
    Array.isArray(parsed?.days_of_week) &&
    Array.isArray(parsed?.allowed_hours)
  ) {
    const legacyHours = parsed.allowed_hours
      .map(Number)
      .filter((n: number) => !isNaN(n))
      .sort((a: number, b: number) => a - b);
    parsed.days_of_week.forEach((d: any) => {
      const k = String(Number(d));
      if (dayHours[k] !== undefined) {
        dayHours[k] = [...legacyHours];
      }
    });
  }

  const activeDays = Object.entries(dayHours)
    .filter(([, hrs]) => hrs.length > 0)
    .map(([k]) => Number(k))
    .sort((a, b) => a - b);

  const unionHours = Array.from(new Set(Object.values(dayHours).flat())).sort(
    (a, b) => a - b,
  );

  return {
    is_campaign: isCampaign,
    enabled: Boolean(parsed?.enabled || isCampaign),
    show_on_calendar: showCal,
    auto_apply: autoApp,
    campaign_name:
      coupon?.campaign_name || parsed?.campaign_name || coupon?.code || "",
    start_date: parsed?.start_date || null,
    day_hours: dayHours,
    days_of_week: activeDays,
    allowed_hours: unionHours,
  };
}

export function AdminCouponsTab() {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [detectingColdHours, setDetectingColdHours] = useState(false);

  // Navegação principal separada: "coupons" vs "campaigns"
  const [activeSection, setActiveSection] = useState<"coupons" | "campaigns">(
    "coupons",
  );
  const [view, setView] = useState<
    "list" | "create_coupon" | "create_campaign" | "details"
  >("list");

  const [allRecords, setAllRecords] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomSearch, setRoomSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);

  const [selectedRecord, setSelectedRecord] = useState<any | null>(null);
  const [recordUses, setRecordUses] = useState<any[]>([]);

  const [isAllRooms, setIsAllRooms] = useState(true);
  const [formData, setFormData] = useState({
    code: "",
    campaign_name: "",
    type: "percentage",
    discount_value: "",
    max_uses: "",
    start_date: "",
    valid_until: "",
    affiliate_id: "",
    valid_room_ids: [] as string[],
    show_on_calendar: true,
    auto_apply: true,
    day_hours: createDefaultDayHours(),
  });

  const [profSearch, setProfSearch] = useState("");
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState<any | null>(null);

  useEffect(() => {
    fetchRecords();
    loadRooms();
  }, []);

  const fetchRecords = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select(
        `
        *,
        profiles:affiliate_id (id, full_name, email)
      `,
      )
      .order("created_at", { ascending: false });

    if (!error) setAllRecords(data || []);
    setLoading(false);
  };

  const loadRooms = async () => {
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, tier, availability, profiles:host_id(full_name)")
      .eq("is_active", true)
      .order("name");

    if (!error) setRooms(data || []);
  };

  const loadProfessionals = async (searchStr: string) => {
    if (searchStr.length < 3) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .ilike("full_name", `%${searchStr}%`)
      .limit(5);
    setProfessionals(data || []);
  };

  const loadRecordUses = async (id: string) => {
    setActionLoading(true);
    const { data, error } = await supabase
      .from("coupon_uses")
      .select(
        `
        *,
        profiles:user_id (full_name, email)
      `,
      )
      .eq("coupon_id", id)
      .order("used_at", { ascending: false });

    if (!error) setRecordUses(data || []);
    setActionLoading(false);
  };

  // Separa os registros em Cupons Tradicionais vs Campanhas de Horário
  const { couponsList, campaignsList, summaryStats } = useMemo(() => {
    const cList: any[] = [];
    const campList: any[] = [];
    let couponUsesTotal = 0;
    let campaignUsesTotal = 0;

    allRecords.forEach((item) => {
      const rules = extractCouponRules(item);
      const uses = Number(item.current_uses || 0);
      if (rules.is_campaign) {
        campList.push(item);
        campaignUsesTotal += uses;
      } else {
        cList.push(item);
        couponUsesTotal += uses;
      }
    });

    return {
      couponsList: cList,
      campaignsList: campList,
      summaryStats: {
        activeCoupons: cList.filter((c) => c.is_active).length,
        couponUsesTotal,
        activeCampaigns: campList.filter((c) => c.is_active).length,
        visibleCalendarCampaigns: campList.filter(
          (c) => c.is_active && extractCouponRules(c).show_on_calendar,
        ).length,
        campaignUsesTotal,
      },
    };
  }, [allRecords]);

  const resetForm = () => {
    setEditingId(null);
    setIsAllRooms(true);
    setRoomSearch("");
    setSelectedAffiliate(null);
    setFormData({
      code: "",
      campaign_name: "",
      type: "percentage",
      discount_value: "",
      max_uses: "",
      start_date: "",
      valid_until: "",
      affiliate_id: "",
      valid_room_ids: [],
      show_on_calendar: true,
      auto_apply: true,
      day_hours: createDefaultDayHours(),
    });
  };

  const handleOpenEdit = (item: any) => {
    const rules = extractCouponRules(item);
    const hasRooms =
      Array.isArray(item.valid_room_ids) && item.valid_room_ids.length > 0;

    const totalSavedSlots = Object.values(rules.day_hours).reduce(
      (acc, arr) => acc + arr.length,
      0,
    );

    setEditingId(item.id);
    setIsAllRooms(!hasRooms);
    setSelectedAffiliate(item.profiles || null);

    setFormData({
      code: item.code || "",
      campaign_name: rules.campaign_name || "",
      type: item.type || "percentage",
      discount_value: String(item.discount_value ?? ""),
      max_uses: item.max_uses ? String(item.max_uses) : "",
      start_date: rules.start_date ? String(rules.start_date).slice(0, 10) : "",
      valid_until: item.valid_until
        ? String(item.valid_until).slice(0, 10)
        : "",
      affiliate_id: item.affiliate_id || "",
      valid_room_ids: hasRooms ? item.valid_room_ids : [],
      show_on_calendar: rules.show_on_calendar,
      auto_apply: rules.auto_apply,
      day_hours:
        totalSavedSlots > 0 ? rules.day_hours : createDefaultDayHours(),
    });

    setView(rules.is_campaign ? "create_campaign" : "create_coupon");
  };

  // Manipuladores da Grade Semanal (Exclusivo para Campanhas)
  const handleToggleDayHourCell = (dow: number, hour: number) => {
    const key = String(dow);
    setFormData((prev) => {
      const currentArr = prev.day_hours[key] || [];
      const exists = currentArr.includes(hour);
      const nextArr = exists
        ? currentArr.filter((h) => h !== hour)
        : [...currentArr, hour].sort((a, b) => a - b);

      return {
        ...prev,
        day_hours: {
          ...prev.day_hours,
          [key]: nextArr,
        },
      };
    });
  };

  const handleApplyDayPreset = (
    dow: number,
    preset: "morning" | "afternoon" | "night" | "all" | "clear",
  ) => {
    const key = String(dow);
    setFormData((prev) => {
      if (preset === "clear") {
        return {
          ...prev,
          day_hours: { ...prev.day_hours, [key]: [] },
        };
      }
      if (preset === "all") {
        return {
          ...prev,
          day_hours: {
            ...prev.day_hours,
            [key]: ALL_SLOTS_LIST.map((s) => s.hour),
          },
        };
      }

      const targetShiftHours = ALL_SLOTS_LIST.filter(
        (s) => s.shift === preset,
      ).map((s) => s.hour);
      const currentArr = prev.day_hours[key] || [];
      const allPresent = targetShiftHours.every((h) => currentArr.includes(h));

      const nextArr = allPresent
        ? currentArr.filter((h) => !targetShiftHours.includes(h))
        : Array.from(new Set([...currentArr, ...targetShiftHours])).sort(
            (a, b) => a - b,
          );

      return {
        ...prev,
        day_hours: { ...prev.day_hours, [key]: nextArr },
      };
    });
  };

  const handleCopyDayToWeekdays = (sourceDow: number) => {
    const sourceHours = formData.day_hours[String(sourceDow)] || [];
    setFormData((prev) => ({
      ...prev,
      day_hours: {
        ...prev.day_hours,
        "1": [...sourceHours],
        "2": [...sourceHours],
        "3": [...sourceHours],
        "4": [...sourceHours],
        "5": [...sourceHours],
      },
    }));
    toast({
      title: "Horários copiados para Segunda a Sexta",
      description: `${sourceHours.length} horário(s) aplicados nos dias úteis.`,
    });
  };

  const totalSelectedMatrixSlots = useMemo(() => {
    return Object.values(formData.day_hours).reduce(
      (acc, arr) => acc + (Array.isArray(arr) ? arr.length : 0),
      0,
    );
  }, [formData.day_hours]);

  // Sugestão de horários com baixa procura (descontando contratos fixos)
  const handleAutoSelectLowOccupancyHours = async () => {
    setDetectingColdHours(true);
    try {
      const targetRooms = isAllRooms
        ? rooms
        : rooms.filter((r) => formData.valid_room_ids.includes(r.id));

      if (targetRooms.length === 0) {
        toast({
          variant: "destructive",
          title: "Selecione ao menos uma sala",
          description:
            "Escolha as salas participantes antes de sugerir os horários.",
        });
        setDetectingColdHours(false);
        return;
      }

      const targetRoomIds = targetRooms.map((r) => r.id);
      const now = new Date();
      const start30d = subDays(now, 30);

      const [bookingsRes, contractsRes] = await Promise.all([
        supabase
          .from("bookings")
          .select("room_id, start_time, end_time, status")
          .in("room_id", targetRoomIds)
          .gte("start_time", start30d.toISOString())
          .in("status", ["confirmed", "completed", "in_progress"]),
        supabase
          .from("room_contracts")
          .select("*")
          .in("room_id", targetRoomIds)
          .eq("status", "active"),
      ]);

      const recentBookings = bookingsRes.data || [];
      const activeContracts = contractsRes.data || [];

      const daysInterval = eachDayOfInterval({ start: start30d, end: now });
      const dowOccurrences: Record<number, number> = {
        0: 0,
        1: 0,
        2: 0,
        3: 0,
        4: 0,
        5: 0,
        6: 0,
      };
      daysInterval.forEach((d) => {
        dowOccurrences[getDay(d)] = (dowOccurrences[getDay(d)] || 0) + 1;
      });

      const occupiedMatrix: Record<number, Record<number, number>> = {};
      [0, 1, 2, 3, 4, 5, 6].forEach((d) => {
        occupiedMatrix[d] = {};
        ALL_SLOTS_LIST.forEach((s) => {
          occupiedMatrix[d][s.hour] = 0;
        });
      });

      recentBookings.forEach((b: any) => {
        if (!b.start_time) return;
        const startD = parseISO(b.start_time);
        const dow = getDay(startD);
        const startH = getHours(startD);
        const endD = b.end_time ? parseISO(b.end_time) : null;
        const endH =
          endD && getHours(endD) > startH ? getHours(endD) : startH + 1;

        for (let h = startH; h < endH; h++) {
          if (occupiedMatrix[dow] && occupiedMatrix[dow][h] !== undefined) {
            occupiedMatrix[dow][h] += 1;
          }
        }
      });

      activeContracts.forEach((c: any) => {
        const cType = String(c.contract_type || "").toLowerCase();
        let sched = c.schedule_config;
        if (typeof sched === "string") {
          try {
            sched = JSON.parse(sched);
          } catch {
            sched = null;
          }
        }

        const contractDays: number[] = Array.isArray(sched?.days)
          ? sched.days.map(Number)
          : Array.isArray(sched?.weekdays)
            ? sched.weekdays.map(Number)
            : [1, 2, 3, 4, 5];

        if (cType.includes("monthly_exclusive")) {
          [1, 2, 3, 4, 5, 6].forEach((d) => {
            ALL_SLOTS_LIST.forEach((s) => {
              occupiedMatrix[d][s.hour] += dowOccurrences[d] || 4;
            });
          });
          return;
        }

        const shifts = Array.isArray(sched?.shifts)
          ? sched.shifts
          : typeof sched?.shift === "string"
            ? [sched.shift]
            : [];

        contractDays.forEach((d) => {
          if (!occupiedMatrix[d]) return;
          const weight = dowOccurrences[d] || 4;

          if (Array.isArray(sched?.hours)) {
            sched.hours.forEach((hRaw: any) => {
              const h = parseInt(String(hRaw).split(/[:h-]/)[0], 10);
              if (!isNaN(h) && occupiedMatrix[d][h] !== undefined) {
                occupiedMatrix[d][h] += weight;
              }
            });
          }

          shifts.forEach((sh: string) => {
            const s = sh.toLowerCase();
            if (s.includes("morn") || s.includes("manh")) {
              [8, 9, 10, 11].forEach((h) => (occupiedMatrix[d][h] += weight));
            }
            if (s.includes("after") || s.includes("tard")) {
              [12, 13, 14, 15, 16, 17].forEach(
                (h) => (occupiedMatrix[d][h] += weight),
              );
            }
            if (s.includes("night") || s.includes("noit")) {
              [18, 19, 20, 21].forEach((h) => (occupiedMatrix[d][h] += weight));
            }
          });
        });
      });

      const mappedDayHours: DayHoursMap = {
        "0": [],
        "1": [],
        "2": [],
        "3": [],
        "4": [],
        "5": [],
        "6": [],
      };

      let totalFound = 0;

      [1, 2, 3, 4, 5].forEach((dow) => {
        const maxCapForDaySlot = Math.max(
          1,
          targetRooms.length * (dowOccurrences[dow] || 4),
        );
        const lowOccHours: number[] = [];

        ALL_SLOTS_LIST.forEach((slot) => {
          const used = occupiedMatrix[dow][slot.hour] || 0;
          const occPct = (used / maxCapForDaySlot) * 100;
          if (occPct < 35) {
            lowOccHours.push(slot.hour);
            totalFound += 1;
          }
        });

        mappedDayHours[String(dow)] = lowOccHours;
      });

      setFormData((prev) => ({
        ...prev,
        day_hours: mappedDayHours,
      }));

      toast({
        title: "Horários sugeridos preenchidos",
        description: `Foram selecionados ${totalFound} horários com ocupação abaixo de 35% nos últimos 30 dias.`,
      });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao analisar agenda",
        description: err.message,
      });
    } finally {
      setDetectingColdHours(false);
    }
  };

  // Salvar Cupom Tradicional
  const handleSaveCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code) {
      return toast({
        variant: "destructive",
        title: "Informe o código do cupom.",
      });
    }
    if (!isAllRooms && formData.valid_room_ids.length === 0) {
      return toast({
        variant: "destructive",
        title: "Selecione ao menos uma sala.",
      });
    }

    setActionLoading(true);
    try {
      const payload: any = {
        code: formData.code.toUpperCase().replace(/\s/g, ""),
        campaign_name: null,
        type: formData.type,
        discount_value:
          formData.type === "bogo" ? 0 : Number(formData.discount_value),
        max_uses: formData.max_uses ? Number(formData.max_uses) : null,
        valid_until: formData.valid_until
          ? new Date(`${formData.valid_until}T23:59:59`).toISOString()
          : null,
        affiliate_id: selectedAffiliate ? selectedAffiliate.id : null,
        valid_room_ids: isAllRooms ? null : formData.valid_room_ids,
        show_on_calendar: false,
        auto_apply: false,
        schedule_rules: {
          is_campaign: false,
          enabled: false,
          show_on_calendar: false,
          auto_apply: false,
        },
      };

      if (!editingId) {
        payload.is_active = true;
      }

      const query = editingId
        ? supabase.from("coupons").update(payload).eq("id", editingId)
        : supabase.from("coupons").insert(payload);

      const { error } = await query;
      if (error) throw error;

      toast({
        title: editingId
          ? "Cupom atualizado com sucesso"
          : "Cupom criado com sucesso",
      });

      resetForm();
      setActiveSection("coupons");
      setView("list");
      fetchRecords();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar cupom",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Salvar Campanha de Horários
  const handleSaveCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.campaign_name.trim()) {
      return toast({
        variant: "destructive",
        title: "Informe o nome da campanha.",
      });
    }
    if (!isAllRooms && formData.valid_room_ids.length === 0) {
      return toast({
        variant: "destructive",
        title: "Selecione ao menos uma sala participante.",
      });
    }
    if (totalSelectedMatrixSlots === 0) {
      return toast({
        variant: "destructive",
        title: "Selecione ao menos um horário na grade da semana.",
      });
    }

    setActionLoading(true);
    try {
      const generatedCode =
        formData.code.trim().toUpperCase().replace(/\s/g, "") ||
        `CAMP_${formData.campaign_name
          .trim()
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
          .slice(0, 10)}_${Math.floor(10 + Math.random() * 89)}`;

      const activeDays = Object.entries(formData.day_hours)
        .filter(([, hrs]) => Array.isArray(hrs) && hrs.length > 0)
        .map(([k]) => Number(k))
        .sort((a, b) => a - b);

      const unionHours = Array.from(
        new Set(Object.values(formData.day_hours).flat()),
      ).sort((a, b) => a - b);

      const scheduleRulesObj: CouponScheduleRules = {
        is_campaign: true,
        enabled: true,
        show_on_calendar: formData.show_on_calendar,
        auto_apply: formData.auto_apply,
        campaign_name: formData.campaign_name.trim(),
        start_date: formData.start_date || null,
        day_hours: formData.day_hours,
        days_of_week: activeDays,
        allowed_hours: unionHours,
      };

      const payload: any = {
        code: generatedCode,
        campaign_name: formData.campaign_name.trim(),
        type: formData.type,
        discount_value: Number(formData.discount_value),
        max_uses: formData.max_uses ? Number(formData.max_uses) : null,
        valid_until: formData.valid_until
          ? new Date(`${formData.valid_until}T23:59:59`).toISOString()
          : null,
        affiliate_id: null,
        valid_room_ids: isAllRooms ? null : formData.valid_room_ids,
        show_on_calendar: formData.show_on_calendar,
        auto_apply: formData.auto_apply,
        schedule_rules: scheduleRulesObj,
      };

      if (!editingId) {
        payload.is_active = true;
      }

      const query = editingId
        ? supabase.from("coupons").update(payload).eq("id", editingId)
        : supabase.from("coupons").insert(payload);

      const { error } = await query;
      if (error) throw error;

      toast({
        title: editingId
          ? "Campanha de horário atualizada"
          : "Campanha de horário publicada",
      });

      resetForm();
      setActiveSection("campaigns");
      setView("list");
      fetchRecords();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar campanha",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleToggleRoom = (roomId: string) => {
    setFormData((prev) => {
      const isSelected = prev.valid_room_ids.includes(roomId);
      if (isSelected) {
        return {
          ...prev,
          valid_room_ids: prev.valid_room_ids.filter((id) => id !== roomId),
        };
      } else {
        return { ...prev, valid_room_ids: [...prev.valid_room_ids, roomId] };
      }
    });
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("coupons")
      .update({ is_active: !currentStatus })
      .eq("id", id);
    if (!error) {
      toast({
        title: !currentStatus ? "Ativado com sucesso" : "Pausado com sucesso",
      });
      fetchRecords();
    }
  };

  const handleToggleCalendarDisplay = async (campaign: any) => {
    const currentRules = extractCouponRules(campaign);
    const nextShow = !currentRules.show_on_calendar;

    const updatedRules: CouponScheduleRules = {
      ...currentRules,
      is_campaign: true,
      show_on_calendar: nextShow,
    };

    const { error } = await supabase
      .from("coupons")
      .update({
        show_on_calendar: nextShow,
        schedule_rules: updatedRules,
      })
      .eq("id", campaign.id);

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro ao atualizar exibição no calendário",
        description: error.message,
      });
      return;
    }

    toast({
      title: nextShow
        ? "Campanha exibida no calendário das salas"
        : "Campanha ocultada do calendário",
    });

    fetchRecords();
  };

  const handleToggleAllCalendarCampaigns = async (enableAll: boolean) => {
    setActionLoading(true);
    try {
      const updates = campaignsList.map((c) => {
        const rules = extractCouponRules(c);
        return supabase
          .from("coupons")
          .update({
            show_on_calendar: enableAll,
            schedule_rules: {
              ...rules,
              is_campaign: true,
              show_on_calendar: enableAll,
            },
          })
          .eq("id", c.id);
      });
      await Promise.all(updates);
      toast({
        title: enableAll
          ? "Todas as campanhas foram ativadas no calendário"
          : "Todas as campanhas foram ocultadas do calendário",
      });
      fetchRecords();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id: string, label: string) => {
    if (!confirm(`Deseja excluir ${label} permanentemente?`)) return;
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (!error) {
      toast({ title: "Registro excluído" });
      fetchRecords();
    }
  };

  const openDetails = (record: any) => {
    setSelectedRecord(record);
    loadRecordUses(record.id);
    setView("details");
  };

  const getTypeDisplay = (type: string, value: number) => {
    if (type === "percentage")
      return (
        <Badge className="bg-slate-100 text-slate-800 border-0 font-bold">
          <Percent className="w-3 h-3 mr-1 text-[#BF4B24]" /> {value}% OFF
        </Badge>
      );
    if (type === "fixed")
      return (
        <Badge className="bg-emerald-50 text-emerald-700 border-0 font-bold">
          <Banknote className="w-3 h-3 mr-1" /> R$ {value} OFF
        </Badge>
      );
    if (type === "bogo")
      return (
        <Badge className="bg-stone-100 text-stone-800 border-0 font-bold">
          <Gift className="w-3 h-3 mr-1 text-[#BF4B24]" /> Compre 1 Leve 2
        </Badge>
      );
    return null;
  };

  const filteredRooms = rooms.filter((room) => {
    const searchLower = roomSearch.toLowerCase();
    const matchName = room.name?.toLowerCase().includes(searchLower);
    const matchHost = room.profiles?.full_name
      ?.toLowerCase()
      .includes(searchLower);
    return matchName || matchHost;
  });

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
      </div>
    );

  // ==========================================================================
  // FORMULÁRIO A: CRIAR / EDITAR CUPOM TRADICIONAL (CÓDIGO & AFILIADOS)
  // ==========================================================================
  if (view === "create_coupon") {
    return (
      <div className="p-6 lg:p-8 max-w-4xl mx-auto animate-in fade-in pb-32">
        <Button
          variant="ghost"
          onClick={() => {
            resetForm();
            setView("list");
          }}
          className="mb-6 text-slate-500 font-semibold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Cupons
        </Button>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-2xs">
          <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-5">
            <div className="w-11 h-11 rounded-xl bg-slate-100 flex items-center justify-center">
              <Ticket className="w-5 h-5 text-slate-800" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {editingId
                  ? `Editar Cupom (${formData.code})`
                  : "Novo Cupom de Desconto"}
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Código promocional para ser digitado no checkout ou vinculado a
                um parceiro afiliado.
              </p>
            </div>
          </div>

          <form onSubmit={handleSaveCoupon} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Código do Cupom
                </Label>
                <Input
                  required
                  placeholder="Ex: BEMVINDO20"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase().replace(/\s/g, ""),
                    })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl font-bold text-base tracking-wider uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Tipo de Desconto
                </Label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 outline-none font-semibold text-sm text-slate-700"
                >
                  <option value="percentage">Porcentagem (%)</option>
                  <option value="fixed">Valor Fixo (R$ / Crédito)</option>
                  <option value="bogo">Compre 1 Hora, Leve 2</option>
                </select>
              </div>

              {formData.type !== "bogo" && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-700">
                    Valor do Desconto
                  </Label>
                  <Input
                    required
                    type="number"
                    placeholder={
                      formData.type === "percentage" ? "Ex: 15" : "Ex: 30"
                    }
                    value={formData.discount_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discount_value: e.target.value,
                      })
                    }
                    className="h-11 bg-slate-50 border-slate-200 rounded-xl font-bold"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Limite Total de Usos (Opcional)
                </Label>
                <Input
                  type="number"
                  placeholder="Deixe vazio para ilimitado"
                  value={formData.max_uses}
                  onChange={(e) =>
                    setFormData({ ...formData, max_uses: e.target.value })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-bold text-slate-700">
                  Validade do Cupom (Opcional)
                </Label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) =>
                    setFormData({ ...formData, valid_until: e.target.value })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl text-sm text-slate-700 md:w-1/2"
                />
              </div>
            </div>

            {/* SALAS PERMITIDAS */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
              <div>
                <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                  <Building2 className="w-4 h-4 text-slate-500" /> Salas onde o
                  cupom é aceito
                </h3>
              </div>

              <div className="flex flex-col sm:flex-row gap-3">
                <label
                  className={`flex-1 flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isAllRooms
                      ? "border-slate-900 bg-white shadow-2xs"
                      : "border-slate-200 bg-white/60"
                  }`}
                >
                  <input
                    type="radio"
                    checked={isAllRooms}
                    onChange={() => {
                      setIsAllRooms(true);
                      setFormData({ ...formData, valid_room_ids: [] });
                    }}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <div>
                    <p className="font-bold text-slate-900 text-xs">
                      Todas as salas
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Válido em qualquer consultório.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex-1 flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    !isAllRooms
                      ? "border-slate-900 bg-white shadow-2xs"
                      : "border-slate-200 bg-white/60"
                  }`}
                >
                  <input
                    type="radio"
                    checked={!isAllRooms}
                    onChange={() => setIsAllRooms(false)}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <div>
                    <p className="font-bold text-slate-900 text-xs">
                      Salas selecionadas ({formData.valid_room_ids.length})
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Restringir a salas específicas.
                    </p>
                  </div>
                </label>
              </div>

              {!isAllRooms && (
                <div className="space-y-3 pt-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Buscar sala ou clínica..."
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      className="h-9 pl-9 bg-white border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-3 bg-white border border-slate-200 rounded-xl">
                    {filteredRooms.map((room) => (
                      <label
                        key={room.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          formData.valid_room_ids.includes(room.id)
                            ? "bg-orange-50/60 border-[#BF4B24]"
                            : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.valid_room_ids.includes(room.id)}
                          onChange={() => handleToggleRoom(room.id)}
                          className="w-4 h-4 rounded accent-[#BF4B24]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {room.name}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {room.profiles?.full_name || "Fusion Clinic"}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* VÍNCULO DE AFILIADO */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-3">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Users className="w-4 h-4 text-slate-500" /> Afiliado ou
                Parceiro (Opcional)
              </h3>

              {!selectedAffiliate ? (
                <div className="relative">
                  <Search className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar profissional pelo nome..."
                    value={profSearch}
                    onChange={(e) => {
                      setProfSearch(e.target.value);
                      loadProfessionals(e.target.value);
                    }}
                    className="h-10 pl-9 bg-white border-slate-200 rounded-xl text-xs"
                  />
                  {professionals.length > 0 && profSearch.length > 2 && (
                    <div className="absolute z-50 w-full mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
                      {professionals.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedAffiliate(p);
                            setProfSearch("");
                            setProfessionals([]);
                          }}
                          className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 flex justify-between text-xs"
                        >
                          <span className="font-bold text-slate-900">
                            {p.full_name}
                          </span>
                          <span className="text-slate-500">{p.email}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between bg-white border border-slate-200 p-3.5 rounded-xl">
                  <div className="flex items-center gap-3">
                    <UserCheck className="w-4 h-4 text-[#BF4B24]" />
                    <div>
                      <p className="font-bold text-slate-900 text-xs">
                        {selectedAffiliate.full_name}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Os usos deste cupom ficarão vinculados a este parceiro.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAffiliate(null)}
                    className="text-xs font-semibold text-red-600 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>

            <Button
              disabled={actionLoading}
              type="submit"
              className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-sm cursor-pointer"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingId ? (
                "Salvar Alterações do Cupom"
              ) : (
                "Criar Cupom"
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // FORMULÁRIO B: CRIAR / EDITAR CAMPANHA DE HORÁRIOS (CALENDÁRIO DA SALA)
  // ==========================================================================
  if (view === "create_campaign") {
    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-in fade-in pb-32">
        <Button
          variant="ghost"
          onClick={() => {
            resetForm();
            setView("list");
          }}
          className="mb-6 text-slate-500 font-semibold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para Campanhas
        </Button>

        <div className="bg-white border border-slate-200 rounded-2xl p-6 sm:p-8 shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8 border-b border-slate-100 pb-5">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-orange-50 flex items-center justify-center">
                <CalendarClock className="w-5 h-5 text-[#BF4B24]" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-slate-900">
                  {editingId
                    ? `Editar Campanha (${formData.campaign_name})`
                    : "Nova Campanha de Horários"}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Defina tarifas reduzidas para dias e horários específicos e
                  destaque no calendário de reserva das salas.
                </p>
              </div>
            </div>

            <label className="flex items-center gap-2.5 bg-stone-50 px-3.5 py-2.5 rounded-xl border border-stone-200 cursor-pointer shrink-0 select-none">
              <input
                type="checkbox"
                checked={formData.show_on_calendar}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    show_on_calendar: e.target.checked,
                  }))
                }
                className="w-4 h-4 rounded accent-[#BF4B24] cursor-pointer"
              />
              <span className="text-xs font-bold text-slate-800">
                Destacar no calendário da sala
              </span>
            </label>
          </div>

          <form onSubmit={handleSaveCampaign} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
              <div className="space-y-2 md:col-span-2">
                <Label className="text-xs font-bold text-slate-700">
                  Nome da Campanha
                </Label>
                <Input
                  required
                  placeholder="Ex: Semana Black Friday • Horários Selecionados"
                  value={formData.campaign_name}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      campaign_name: e.target.value,
                    })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl font-semibold text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Código Interno (Opcional)
                </Label>
                <Input
                  placeholder="Gerado automaticamente"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase().replace(/\s/g, ""),
                    })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl font-mono text-xs uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Tipo de Desconto
                </Label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full h-11 bg-slate-50 border border-slate-200 rounded-xl px-3 outline-none font-semibold text-sm text-slate-700"
                >
                  <option value="percentage">Porcentagem (%)</option>
                  <option value="fixed">Valor Fixo em Reais (R$)</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Desconto Aplicado no Horário
                </Label>
                <Input
                  required
                  type="number"
                  placeholder={
                    formData.type === "percentage" ? "Ex: 25" : "Ex: 15"
                  }
                  value={formData.discount_value}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      discount_value: e.target.value,
                    })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl font-bold"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Limite de Reservas na Campanha (Opcional)
                </Label>
                <Input
                  type="number"
                  placeholder="Ilimitado"
                  value={formData.max_uses}
                  onChange={(e) =>
                    setFormData({ ...formData, max_uses: e.target.value })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl text-sm"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Início da Vigência (Opcional)
                </Label>
                <Input
                  type="date"
                  value={formData.start_date}
                  onChange={(e) =>
                    setFormData({ ...formData, start_date: e.target.value })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl text-sm text-slate-700"
                />
              </div>

              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-700">
                  Término da Vigência (Opcional)
                </Label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) =>
                    setFormData({ ...formData, valid_until: e.target.value })
                  }
                  className="h-11 bg-slate-50 border-slate-200 rounded-xl text-sm text-slate-700"
                />
              </div>
            </div>

            {/* 1. SALAS PARTICIPANTES DA CAMPANHA */}
            <div className="p-5 bg-slate-50 rounded-2xl border border-slate-200/80 space-y-4">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center gap-2">
                <Building2 className="w-4 h-4 text-slate-500" /> 1. Salas
                participantes da campanha
              </h3>

              <div className="flex flex-col sm:flex-row gap-3">
                <label
                  className={`flex-1 flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    isAllRooms
                      ? "border-slate-900 bg-white shadow-2xs"
                      : "border-slate-200 bg-white/60"
                  }`}
                >
                  <input
                    type="radio"
                    checked={isAllRooms}
                    onChange={() => {
                      setIsAllRooms(true);
                      setFormData({ ...formData, valid_room_ids: [] });
                    }}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <div>
                    <p className="font-bold text-slate-900 text-xs">
                      Todas as salas ativas
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Aplicar campanha em toda a rede.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex-1 flex items-center gap-3 p-3.5 rounded-xl border cursor-pointer transition-all ${
                    !isAllRooms
                      ? "border-slate-900 bg-white shadow-2xs"
                      : "border-slate-200 bg-white/60"
                  }`}
                >
                  <input
                    type="radio"
                    checked={!isAllRooms}
                    onChange={() => setIsAllRooms(false)}
                    className="w-4 h-4 accent-slate-900"
                  />
                  <div>
                    <p className="font-bold text-slate-900 text-xs">
                      Escolher salas ({formData.valid_room_ids.length}{" "}
                      selecionadas)
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Aplicar apenas nas salas selecionadas abaixo.
                    </p>
                  </div>
                </label>
              </div>

              {!isAllRooms && (
                <div className="space-y-3 pt-1">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Buscar sala ou clínica..."
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      className="h-9 pl-9 bg-white border-slate-200 rounded-xl text-xs"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-52 overflow-y-auto p-3 bg-white border border-slate-200 rounded-xl">
                    {filteredRooms.map((room) => (
                      <label
                        key={room.id}
                        className={`flex items-center gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          formData.valid_room_ids.includes(room.id)
                            ? "bg-orange-50/60 border-[#BF4B24]"
                            : "bg-slate-50 border-slate-100 hover:bg-slate-100"
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.valid_room_ids.includes(room.id)}
                          onChange={() => handleToggleRoom(room.id)}
                          className="w-4 h-4 rounded accent-[#BF4B24]"
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs font-bold text-slate-900 truncate">
                            {room.name}
                          </p>
                          <p className="text-[10px] text-slate-500 truncate">
                            {room.profiles?.full_name || "Fusion Clinic"}
                          </p>
                        </div>
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 2. GRADE SEMANAL POR DIA E HORÁRIO */}
            <div className="p-5 bg-stone-50 rounded-2xl border border-stone-200 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <h3 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Clock className="w-4 h-4 text-[#BF4B24]" /> 2. Dias e
                    Horários com Desconto ({totalSelectedMatrixSlots}{" "}
                    selecionados)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Marque os horários específicos de cada dia da semana que
                    terão o desconto aplicado.
                  </p>
                </div>

                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={detectingColdHours}
                  onClick={handleAutoSelectLowOccupancyHours}
                  className="h-9 rounded-xl border-slate-300 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs shrink-0 cursor-pointer"
                >
                  {detectingColdHours ? (
                    <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                  ) : (
                    <SlidersHorizontal className="w-3.5 h-3.5 mr-1.5 text-[#BF4B24]" />
                  )}
                  Sugerir horários com baixa procura
                </Button>
              </div>

              <div className="bg-white rounded-xl border border-stone-200 p-4 overflow-x-auto">
                <div className="space-y-2.5 min-w-[760px]">
                  {WEEKDAYS_LIST.map((dayItem) => {
                    const dayKey = String(dayItem.id);
                    const daySelectedHours = formData.day_hours[dayKey] || [];
                    const hasAnyOnDay = daySelectedHours.length > 0;

                    return (
                      <div
                        key={dayItem.id}
                        className={`p-3 rounded-xl border transition-all ${
                          hasAnyOnDay
                            ? "bg-white border-slate-200"
                            : "bg-slate-50/60 border-slate-100 opacity-75"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <div className="flex items-center gap-2">
                            <span
                              className={`w-2 h-2 rounded-full ${
                                hasAnyOnDay ? "bg-[#BF4B24]" : "bg-slate-300"
                              }`}
                            />
                            <span className="text-xs font-bold text-slate-900">
                              {dayItem.full}
                            </span>
                            <span className="text-[11px] text-slate-400">
                              {hasAnyOnDay
                                ? `(${daySelectedHours.length}h selecionadas)`
                                : "(Sem desconto)"}
                            </span>
                          </div>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyDayPreset(dayItem.id, "morning")
                              }
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 cursor-pointer"
                            >
                              Manhã
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyDayPreset(dayItem.id, "afternoon")
                              }
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 cursor-pointer"
                            >
                              Tarde
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyDayPreset(dayItem.id, "night")
                              }
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 cursor-pointer"
                            >
                              Noite
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                handleApplyDayPreset(dayItem.id, "all")
                              }
                              className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 cursor-pointer"
                            >
                              Todos
                            </button>
                            {hasAnyOnDay && (
                              <>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleCopyDayToWeekdays(dayItem.id)
                                  }
                                  className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-[10px] font-semibold text-slate-700 inline-flex items-center gap-1 cursor-pointer"
                                >
                                  <Copy className="w-2.5 h-2.5" /> Copiar p/
                                  Seg–Sex
                                </button>
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleApplyDayPreset(dayItem.id, "clear")
                                  }
                                  className="px-2 py-0.5 rounded bg-red-50 hover:bg-red-100 text-[10px] font-semibold text-red-600 cursor-pointer"
                                >
                                  Limpar
                                </button>
                              </>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-14 gap-1.5">
                          {ALL_SLOTS_LIST.map((slot) => {
                            const isMarked = daySelectedHours.includes(
                              slot.hour,
                            );
                            return (
                              <button
                                key={`${dayItem.id}_${slot.hour}`}
                                type="button"
                                onClick={() =>
                                  handleToggleDayHourCell(dayItem.id, slot.hour)
                                }
                                className={`py-2 rounded-lg text-[11px] font-bold border transition-all cursor-pointer tabular-nums ${
                                  isMarked
                                    ? "bg-[#BF4B24] text-white border-[#BF4B24]"
                                    : "bg-slate-50 text-slate-600 border-slate-200 hover:border-slate-300"
                                }`}
                              >
                                {slot.short}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            <Button
              disabled={actionLoading}
              type="submit"
              className="w-full h-12 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold rounded-xl text-sm cursor-pointer"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : editingId ? (
                "Salvar Alterações da Campanha"
              ) : (
                "Publicar Campanha de Horários"
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VISÃO DETALHADA DE USOS (SERVE TANTO PARA CUPOM QUANTO PARA CAMPANHA)
  // ==========================================================================
  if (view === "details" && selectedRecord) {
    const rules = extractCouponRules(selectedRecord);

    return (
      <div className="p-6 lg:p-8 max-w-5xl mx-auto animate-in fade-in pb-32">
        <Button
          variant="ghost"
          onClick={() => setView("list")}
          className="mb-6 text-slate-500 font-semibold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para a listagem
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
          <div className="md:col-span-2 bg-slate-900 text-white p-6 sm:p-8 rounded-2xl">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              {rules.is_campaign
                ? "Relatório da Campanha de Horário"
                : "Relatório do Cupom de Desconto"}
            </p>
            <h2 className="text-2xl sm:text-3xl font-bold tracking-tight mb-3">
              {rules.is_campaign
                ? rules.campaign_name || selectedRecord.code
                : selectedRecord.code}
            </h2>
            <div className="flex flex-wrap gap-2.5">
              {getTypeDisplay(
                selectedRecord.type,
                selectedRecord.discount_value,
              )}
              <Badge className="bg-white/10 text-white border-0 font-semibold">
                {selectedRecord.current_uses || 0}{" "}
                {selectedRecord.max_uses ? `/ ${selectedRecord.max_uses}` : ""}{" "}
                utilizações registradas
              </Badge>
            </div>

            {rules.is_campaign && (
              <div className="mt-5 pt-4 border-t border-white/10 text-xs text-slate-300 space-y-2">
                <p className="font-semibold text-slate-200">
                  Horários configurados por dia:
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                  {WEEKDAYS_LIST.map((w) => {
                    const hrs = rules.day_hours[String(w.id)] || [];
                    if (hrs.length === 0) return null;
                    return (
                      <div
                        key={w.id}
                        className="bg-white/5 px-2.5 py-1.5 rounded-lg text-[11px]"
                      >
                        <strong className="text-white">{w.short}:</strong>{" "}
                        {hrs
                          .map((h) => `${String(h).padStart(2, "0")}h`)
                          .join(", ")}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <div className="bg-white border border-slate-200 p-6 sm:p-8 rounded-2xl flex flex-col justify-center">
            <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider mb-1">
              {rules.is_campaign ? "Escopo da Campanha" : "Afiliado Vinculado"}
            </p>
            <h3 className="text-base font-bold text-slate-900">
              {rules.is_campaign
                ? selectedRecord.valid_room_ids?.length > 0
                  ? `${selectedRecord.valid_room_ids.length} sala(s) selecionada(s)`
                  : "Todas as salas ativas"
                : selectedRecord.profiles?.full_name || "Uso Institucional"}
            </h3>
            <p className="text-xs font-medium text-slate-500 mt-2 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4 text-slate-400" />
              {selectedRecord.valid_until
                ? `Expira em ${format(parseISO(selectedRecord.valid_until), "dd/MM/yyyy")}`
                : "Sem data de expiração"}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          <div className="p-5 border-b border-slate-100">
            <h3 className="text-sm font-bold text-slate-900">
              Profissionais que utilizaram ({recordUses.length})
            </h3>
          </div>

          {actionLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-7 h-7 animate-spin text-slate-300" />
            </div>
          ) : recordUses.length === 0 ? (
            <div className="p-12 text-center text-slate-400 text-xs font-medium">
              Nenhuma utilização registrada até o momento.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-100">
                  <tr>
                    <th className="px-6 py-3.5">Data e Hora</th>
                    <th className="px-6 py-3.5">Profissional</th>
                    <th className="px-6 py-3.5 text-right">
                      Desconto Concedido
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {recordUses.map((use) => (
                    <tr key={use.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3.5 text-slate-600">
                        {format(parseISO(use.used_at), "dd/MM/yyyy 'às' HH:mm")}
                      </td>
                      <td className="px-6 py-3.5">
                        <p className="font-bold text-slate-900">
                          {use.profiles?.full_name || "Profissional"}
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {use.profiles?.email}
                        </p>
                      </td>
                      <td className="px-6 py-3.5 text-right font-bold text-emerald-700">
                        R${" "}
                        {Number(use.discount_applied || 0)
                          .toFixed(2)
                          .replace(".", ",")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ==========================================================================
  // VISÃO PRINCIPAL: SEPARAÇÃO ENTRE CUPONS E CAMPANHAS DE HORÁRIO
  // ==========================================================================
  return (
    <div className="p-6 lg:p-8 max-w-7xl mx-auto animate-in fade-in pb-32 font-sans">
      {/* CABEÇALHO E KPIS SEPARADOS */}
      <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            Cupons & Campanhas de Horário
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gerencie separadamente seus códigos de cupom/afiliados e suas
            campanhas de desconto por horário no calendário.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          {activeSection === "coupons" ? (
            <Button
              onClick={() => {
                resetForm();
                setView("create_coupon");
              }}
              className="h-10 bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl text-xs px-4 cursor-pointer"
            >
              <Plus className="w-4 h-4 mr-1.5" /> Novo Cupom de Código
            </Button>
          ) : (
            <>
              {campaignsList.length > 0 && (
                <Button
                  type="button"
                  variant="outline"
                  disabled={actionLoading}
                  onClick={() =>
                    handleToggleAllCalendarCampaigns(
                      summaryStats.visibleCalendarCampaigns === 0,
                    )
                  }
                  className="h-10 rounded-xl font-semibold text-xs px-3.5 border-slate-200 text-slate-700 cursor-pointer"
                >
                  <Power className="w-3.5 h-3.5 mr-1.5 text-[#BF4B24]" />
                  {summaryStats.visibleCalendarCampaigns > 0
                    ? `Ocultar campanhas do calendário (${summaryStats.visibleCalendarCampaigns})`
                    : "Exibir todas no calendário"}
                </Button>
              )}
              <Button
                onClick={() => {
                  resetForm();
                  setView("create_campaign");
                }}
                className="h-10 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold rounded-xl text-xs px-4 cursor-pointer"
              >
                <Plus className="w-4 h-4 mr-1.5" /> Nova Campanha de Horário
              </Button>
            </>
          )}
        </div>
      </div>

      {/* RESUMO SEPARADO: CUPONS VS CAMPANHAS */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6 tabular-nums">
        <div
          onClick={() => setActiveSection("coupons")}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            activeSection === "coupons"
              ? "bg-white border-slate-900 ring-2 ring-slate-900/10"
              : "bg-white border-slate-200/90 hover:border-slate-300"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-slate-900" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                1. Cupons de Código & Afiliados
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {couponsList.length} cadastrados{" "}
              <span className="text-xs font-normal text-slate-500">
                ({summaryStats.activeCoupons} ativos)
              </span>
            </p>
            <p className="text-xs text-slate-500">
              Total de cupons utilizados:{" "}
              <strong className="text-slate-900">
                {summaryStats.couponUsesTotal} usos
              </strong>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
            <Ticket className="w-5 h-5" />
          </div>
        </div>

        <div
          onClick={() => setActiveSection("campaigns")}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
            activeSection === "campaigns"
              ? "bg-white border-[#BF4B24] ring-2 ring-[#BF4B24]/15"
              : "bg-white border-slate-200/90 hover:border-slate-300"
          }`}
        >
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-[#BF4B24]" />
              <span className="text-xs font-bold uppercase tracking-wider text-[#BF4B24]">
                2. Campanhas de Horário (Calendário)
              </span>
            </div>
            <p className="text-2xl font-bold text-slate-900">
              {campaignsList.length} campanhas{" "}
              <span className="text-xs font-normal text-slate-500">
                ({summaryStats.visibleCalendarCampaigns} visíveis nas salas)
              </span>
            </p>
            <p className="text-xs text-slate-500">
              Reservas geradas por campanhas:{" "}
              <strong className="text-slate-900">
                {summaryStats.campaignUsesTotal} usos
              </strong>
            </p>
          </div>
          <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#BF4B24] flex items-center justify-center shrink-0">
            <CalendarClock className="w-5 h-5" />
          </div>
        </div>
      </div>

      {/* SELETOR DE ABA */}
      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => setActiveSection("coupons")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === "coupons"
              ? "bg-slate-900 text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
          }`}
        >
          Cupons e Afiliados ({couponsList.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveSection("campaigns")}
          className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
            activeSection === "campaigns"
              ? "bg-[#BF4B24] text-white"
              : "bg-white border border-slate-200 text-slate-600 hover:text-slate-900"
          }`}
        >
          Campanhas de Horário ({campaignsList.length})
        </button>
      </div>

      {/* ================================================================== */}
      {/* TABELA 1: APENAS CUPONS DE CÓDIGO E AFILIADOS                      */}
      {/* ================================================================== */}
      {activeSection === "coupons" ? (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {couponsList.length === 0 ? (
            <div className="text-center py-16 px-4">
              <Ticket className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">
                Nenhum cupom de código cadastrado
              </h3>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Crie cupons para parcerias com afiliados ou ações promocionais
                por código.
              </p>
              <Button
                onClick={() => {
                  resetForm();
                  setView("create_coupon");
                }}
                size="sm"
                className="bg-slate-900 text-white font-semibold rounded-xl text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar Primeiro Cupom
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Código do Cupom</th>
                    <th className="px-6 py-3.5">Desconto & Salas</th>
                    <th className="px-6 py-3.5">Afiliado</th>
                    <th className="px-6 py-3.5">Utilizações</th>
                    <th className="px-6 py-3.5">Validade</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {couponsList.map((coupon) => {
                    const isExpired =
                      coupon.valid_until &&
                      new Date(coupon.valid_until) < new Date();
                    const isEsgotado =
                      coupon.max_uses && coupon.current_uses >= coupon.max_uses;

                    return (
                      <tr
                        key={coupon.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 tracking-wider text-sm">
                            {coupon.code}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          {getTypeDisplay(coupon.type, coupon.discount_value)}
                          <span className="block text-[11px] text-slate-500 mt-1">
                            {coupon.valid_room_ids?.length > 0
                              ? `${coupon.valid_room_ids.length} sala(s) específica(s)`
                              : "Todas as salas"}
                          </span>
                        </td>

                        <td className="px-6 py-4 font-medium text-slate-700">
                          {coupon.profiles?.full_name || "Institucional"}
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900">
                            {coupon.current_uses || 0}
                          </span>
                          <span className="text-slate-400">
                            {coupon.max_uses
                              ? ` / ${coupon.max_uses} usos`
                              : " usos"}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-slate-500">
                          {coupon.valid_until
                            ? format(parseISO(coupon.valid_until), "dd/MM/yyyy")
                            : "Vitalício"}
                        </td>

                        <td className="px-6 py-4">
                          {isExpired ? (
                            <Badge className="bg-red-50 text-red-700 border-0 font-semibold">
                              Expirado
                            </Badge>
                          ) : isEsgotado ? (
                            <Badge className="bg-amber-50 text-amber-700 border-0 font-semibold">
                              Esgotado
                            </Badge>
                          ) : coupon.is_active ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-0 font-semibold">
                              Ativo
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-600 border-0 font-semibold">
                              Pausado
                            </Badge>
                          )}
                        </td>

                        <td className="px-6 py-4 flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleToggleStatus(coupon.id, coupon.is_active)
                            }
                            className="h-8 text-xs font-semibold border-slate-200 text-slate-700"
                          >
                            {coupon.is_active ? "Pausar" : "Ativar"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar Cupom"
                            onClick={() => handleOpenEdit(coupon)}
                            className="h-8 w-8 text-slate-600 hover:bg-slate-100"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ver quem utilizou"
                            onClick={() => openDetails(coupon)}
                            className="h-8 w-8 text-slate-600 hover:bg-slate-100"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir"
                            onClick={() =>
                              handleDelete(coupon.id, `o cupom ${coupon.code}`)
                            }
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      ) : (
        /* ================================================================== */
        /* TABELA 2: APENAS CAMPANHAS DE HORÁRIO (CALENDÁRIO DAS SALAS)       */
        /* ================================================================== */
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden">
          {campaignsList.length === 0 ? (
            <div className="text-center py-16 px-4">
              <CalendarClock className="w-8 h-8 text-slate-300 mx-auto mb-2" />
              <h3 className="text-sm font-bold text-slate-900">
                Nenhuma campanha de horário cadastrada
              </h3>
              <p className="text-xs text-slate-500 mt-1 mb-4">
                Crie uma campanha para destacar dias e horários com desconto
                direto no calendário de reserva das salas.
              </p>
              <Button
                onClick={() => {
                  resetForm();
                  setView("create_campaign");
                }}
                size="sm"
                className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold rounded-xl text-xs"
              >
                <Plus className="w-3.5 h-3.5 mr-1.5" /> Criar Primeira Campanha
              </Button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Campanha</th>
                    <th className="px-6 py-3.5">Oferta & Salas</th>
                    <th className="px-6 py-3.5">Grade de Dias e Horários</th>
                    <th className="px-6 py-3.5 text-center">
                      Exibição no Calendário
                    </th>
                    <th className="px-6 py-3.5">Reservas Geradas</th>
                    <th className="px-6 py-3.5">Status</th>
                    <th className="px-6 py-3.5 text-right">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {campaignsList.map((camp) => {
                    const rules = extractCouponRules(camp);
                    const isExpired =
                      camp.valid_until &&
                      new Date(camp.valid_until) < new Date();
                    const totalBlocks = Object.values(rules.day_hours).reduce(
                      (acc, arr) => acc + arr.length,
                      0,
                    );

                    return (
                      <tr
                        key={camp.id}
                        className="hover:bg-slate-50/80 transition-colors"
                      >
                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900 text-sm block">
                            {rules.campaign_name || camp.code}
                          </span>
                          <span className="text-[11px] font-mono text-slate-400">
                            Ref: {camp.code}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          {getTypeDisplay(camp.type, camp.discount_value)}
                          <span className="block text-[11px] text-slate-500 mt-1">
                            {camp.valid_room_ids?.length > 0
                              ? `${camp.valid_room_ids.length} sala(s) participante(s)`
                              : "Todas as salas"}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-semibold text-slate-800 block">
                            {totalBlocks} horário(s) na semana
                          </span>
                          <span className="text-[11px] text-slate-500">
                            {WEEKDAYS_LIST.filter(
                              (w) =>
                                (rules.day_hours[String(w.id)] || []).length >
                                0,
                            )
                              .map(
                                (w) =>
                                  `${w.short} (${rules.day_hours[String(w.id)].length}h)`,
                              )
                              .join(" • ")}
                          </span>
                        </td>

                        <td className="px-6 py-4 text-center">
                          <button
                            type="button"
                            onClick={() => handleToggleCalendarDisplay(camp)}
                            className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all cursor-pointer ${
                              rules.show_on_calendar && camp.is_active
                                ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                                : "bg-slate-100 text-slate-500 border-slate-200"
                            }`}
                          >
                            <span
                              className={`w-2 h-2 rounded-full ${
                                rules.show_on_calendar && camp.is_active
                                  ? "bg-emerald-600"
                                  : "bg-slate-400"
                              }`}
                            />
                            {rules.show_on_calendar && camp.is_active
                              ? "Visível no Calendário"
                              : "Oculta"}
                          </button>
                        </td>

                        <td className="px-6 py-4">
                          <span className="font-bold text-slate-900">
                            {camp.current_uses || 0}
                          </span>
                          <span className="text-slate-400">
                            {camp.max_uses
                              ? ` / ${camp.max_uses} reservas`
                              : " reservas"}
                          </span>
                        </td>

                        <td className="px-6 py-4">
                          {isExpired ? (
                            <Badge className="bg-red-50 text-red-700 border-0 font-semibold">
                              Expirada
                            </Badge>
                          ) : camp.is_active ? (
                            <Badge className="bg-emerald-50 text-emerald-700 border-0 font-semibold">
                              Ativa
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-600 border-0 font-semibold">
                              Pausada
                            </Badge>
                          )}
                        </td>

                        <td className="px-6 py-4 flex items-center justify-end gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() =>
                              handleToggleStatus(camp.id, camp.is_active)
                            }
                            className="h-8 text-xs font-semibold border-slate-200 text-slate-700"
                          >
                            {camp.is_active ? "Pausar" : "Ativar"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Editar Horários e Salas"
                            onClick={() => handleOpenEdit(camp)}
                            className="h-8 w-8 text-slate-600 hover:bg-slate-100"
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Ver reservas desta campanha"
                            onClick={() => openDetails(camp)}
                            className="h-8 w-8 text-slate-600 hover:bg-slate-100"
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            title="Excluir"
                            onClick={() =>
                              handleDelete(
                                camp.id,
                                `a campanha "${rules.campaign_name}"`,
                              )
                            }
                            className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
