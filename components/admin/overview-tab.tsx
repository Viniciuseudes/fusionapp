// components/admin/overview-tab.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  calculatePackageBookingArbitrage,
  computeSubscribersBreakageReport,
  resolveCreditHourlyValueBRL,
  SubscriberPackageAnalytics,
  SubscriberProfileInfo,
} from "@/utils/wallet-ledger";
import {
  Wallet,
  Activity,
  Download,
  Building2,
  Stethoscope,
  Loader2,
  FileText,
  Calendar as CalendarIcon,
  Clock,
  ArrowUpRight,
  Search,
  FileSpreadsheet,
  Sparkles,
  Flame,
  Snowflake,
  Crown,
  Gauge,
  CalendarRange,
  CreditCard,
  Users,
  MessageCircle,
  QrCode,
  RotateCcw,
  Bell,
  CalendarCheck,
  CalendarX,
  UserPlus,
  DoorOpen,
  CheckCheck,
  Trash2,
  Volume2,
  VolumeX,
  CheckCircle2,
  ChevronRight,
  User,
  Mail,
  Phone,
  Award,
  MapPin,
  Hash,
  ShieldCheck,
  ArrowDownRight,
} from "lucide-react";
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  subDays,
  addDays,
  startOfYear,
  startOfDay,
  endOfDay,
  parseISO,
  format,
  formatDistanceToNow,
  getDay,
  getHours,
  differenceInDays,
  eachDayOfInterval,
  getDaysInMonth,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const shiftLabels = [
  "Manhã (08h–12h)",
  "Tarde (12h–16h)",
  "Fim de Tarde (16h–20h)",
  "Noite (20h–23h)",
];

const PIE_COLORS = [
  "#0F172A",
  "#BF4B24",
  "#475569",
  "#94A3B8",
  "#10B981",
  "#D97706",
  "#CBD5E1",
];

export type LedgerSubgroup = "avulso" | "package" | "contract";

interface LedgerEntry {
  id: string;
  booking_id: string;
  transaction_date: string;
  created_at: string;
  start_time: string;
  end_time: string;
  status: string;
  subgroup: LedgerSubgroup;
  room_id: string;
  room_name: string;
  room_tier: "start" | "vip" | "master";
  credit_tier: "start" | "vip" | "master";
  is_downgrade: boolean;
  downgrade_spread_brl: number;
  standard_fusion_fee_brl: number;
  clinic_id: string;
  clinic_name: string;
  user_id: string;
  specialist_name: string;
  specialty: string;
  is_contract: boolean;
  is_package: boolean;
  modality_label: string;
  duration_hours: number;
  gross_brl: number;
  room_base_brl: number;
  fusion_fee_brl: number;
  fusion_fee_pct: number;
  cohost_name: string | null;
  cohost_payout_brl: number;
  host_payout_brl: number;
}

interface RoomCapacityMetric {
  room_id: string;
  room_name: string;
  host_name: string;
  tier: "start" | "vip" | "master";
  hourly_rate: number;
  past_available_hours: number;
  past_booked_hours: number;
  past_avulso_hours: number;
  past_package_hours: number;
  past_contract_hours: number;
  past_free_hours: number;
  past_occupancy_pct: number;
  past_potential_revenue: number;
  past_actual_revenue: number;
  past_uncaptured_revenue: number;
  future_available_hours: number;
  future_booked_hours: number;
  future_avulso_hours: number;
  future_package_hours: number;
  future_contract_hours: number;
  future_free_hours: number;
  future_occupancy_pct: number;
  future_potential_revenue: number;
  future_locked_revenue: number;
  future_open_opportunity_revenue: number;
}

function normalizeTier(tier?: string | null): "start" | "vip" | "master" {
  const t = (tier || "start").toLowerCase().trim();
  if (t.includes("master") || t.includes("premium")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

function formatTierLabel(tier: "start" | "vip" | "master"): string {
  if (tier === "master") return "Premium";
  if (tier === "vip") return "VIP";
  return "Basic";
}

function extractRoomModalitiesHourlyRate(
  modalities: any,
  addressDetails?: any,
): number | null {
  try {
    if (modalities) {
      const parsed =
        typeof modalities === "string" ? JSON.parse(modalities) : modalities;
      const candidates = [
        parsed?.hourly?.price,
        parsed?.hourlyPrice,
        parsed?.price_per_hour,
        parsed?.pricePerHour,
        parsed?.price,
      ];
      for (const c of candidates) {
        const val = Number(c);
        if (!isNaN(val) && val > 0 && val <= 250) return val;
      }
    }
    if (addressDetails) {
      const addr =
        typeof addressDetails === "string"
          ? JSON.parse(addressDetails)
          : addressDetails;
      const addrPrice = Number(addr?.pricing?.hourly);
      if (!isNaN(addrPrice) && addrPrice > 0 && addrPrice <= 250) {
        return addrPrice;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function calculateSlotUnits(startIso: string, endIso: string): number {
  const diffMinutes =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
  if (diffMinutes <= 0) return 1;
  if (diffMinutes >= 45 && diffMinutes <= 65) return 1;
  return Math.max(1, Math.round(diffMinutes / 55));
}

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

const cleanPhoneForWa = (raw?: string | null) => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
};

// ============================================================================
// TIPOS E COMPONENTE DO SINO DE NOTIFICAÇÕES EM TEMPO REAL DO ADMIN
// ============================================================================
export type AdminNotificationEventType =
  | "booking_created"
  | "booking_cancelled"
  | "specialist_registered"
  | "host_registered"
  | "room_created"
  | "booking_checkin"
  | "booking_checkout";

export interface AdminNotificationItem {
  id: string;
  event_type: AdminNotificationEventType | string;
  title: string;
  message: string;
  metadata: {
    booking_id?: string;
    user_id?: string;
    room_id?: string;
    user_name?: string;
    room_name?: string;
    host_name?: string;
    date?: string;
    first_hour?: string;
    slots_count?: number;
    target_tab?: string;
    synthetic?: boolean;
    [key: string]: any;
  };
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

type NotificationFilterCategory =
  "all" | "unread" | "bookings" | "cancellations" | "users" | "rooms";

const STORAGE_READ_KEY = "fusion_admin_notif_read_ids_v1";
const STORAGE_CLEARED_KEY = "fusion_admin_notif_cleared_ids_v1";

// Variáveis de controle de módulo (livres de conflitos de tipagem com useRef)
const recentRealtimeKeys = new Map<string, number>();
let bellSoundEnabledState = true;
let bellUsingDbTableState = false;

function getStoredIdSet(key: string): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? new Set(parsed) : new Set();
  } catch {
    return new Set();
  }
}

function saveStoredIdSet(key: string, set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, JSON.stringify(Array.from(set).slice(-500)));
  } catch {}
}

export function AdminNotificationsBell({
  onNavigateTab,
}: {
  onNavigateTab?: (tabName: string, metadata?: Record<string, any>) => void;
}) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>(
    [],
  );
  const [activeFilter, setActiveFilter] =
    useState<NotificationFilterCategory>("all");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasNewPulse, setHasNewPulse] = useState(false);
  const [usingDbTable, setUsingDbTable] = useState(false);

  // Estados do Modal de Detalhes Completos da Notificação
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedNotif, setSelectedNotif] =
    useState<AdminNotificationItem | null>(null);
  const [detailData, setDetailData] = useState<any>(null);

  useEffect(() => {
    bellSoundEnabledState = soundEnabled;
  }, [soundEnabled]);

  useEffect(() => {
    bellUsingDbTableState = usingDbTable;
  }, [usingDbTable]);

  const playNotificationChime = useCallback(() => {
    if (!bellSoundEnabledState || typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";

      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.14);

      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(659.25, now + 0.14);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch {}
  }, []);

  const pushIncomingNotification = useCallback(
    (newNotif: AdminNotificationItem) => {
      const dedupeKey = `${newNotif.event_type}_${newNotif.metadata?.booking_id || newNotif.metadata?.user_id || newNotif.metadata?.room_id || newNotif.id}`;
      const nowMs = Date.now();
      const lastSeen = recentRealtimeKeys.get(dedupeKey) || 0;
      if (nowMs - lastSeen < 4000) return;
      recentRealtimeKeys.set(dedupeKey, nowMs);

      setNotifications((prev) => {
        if (prev.some((n) => n.id === newNotif.id)) return prev;
        return [newNotif, ...prev].slice(0, 100);
      });

      setHasNewPulse(true);
      setTimeout(() => setHasNewPulse(false), 4000);

      playNotificationChime();

      toast({
        title: newNotif.title,
        description: newNotif.message,
      });
    },
    [playNotificationChime, toast],
  );

  const loadFallbackActivityFeed = useCallback(async () => {
    const readSet = getStoredIdSet(STORAGE_READ_KEY);
    const clearedSet = getStoredIdSet(STORAGE_CLEARED_KEY);

    const [bookingsRes, profilesRes, roomsRes] = await Promise.all([
      supabase
        .from("bookings")
        .select("id, created_at, start_time, status, room_id, user_id")
        .in("status", ["confirmed", "completed", "cancelled", "in_progress"])
        .order("created_at", { ascending: false })
        .limit(35),
      supabase
        .from("profiles")
        .select("id, full_name, email, role, specialty, created_at")
        .order("created_at", { ascending: false })
        .limit(30),
      supabase
        .from("rooms")
        .select("id, name, host_id, tier, created_at")
        .order("created_at", { ascending: false })
        .limit(20),
    ]);

    const bookingsList = bookingsRes.data || [];
    const profilesList = profilesRes.data || [];
    const roomsList = roomsRes.data || [];

    const neededUserIds = Array.from(
      new Set(
        [
          ...bookingsList.map((b: any) => b.user_id),
          ...roomsList.map((r: any) => r.host_id),
        ].filter(Boolean),
      ),
    );
    const neededRoomIds = Array.from(
      new Set(bookingsList.map((b: any) => b.room_id).filter(Boolean)),
    );

    const [extraUsersRes, extraRoomsRes] = await Promise.all([
      neededUserIds.length > 0
        ? supabase
            .from("profiles")
            .select("id, full_name, email")
            .in("id", neededUserIds)
        : Promise.resolve({ data: [] as any[] }),
      neededRoomIds.length > 0
        ? supabase.from("rooms").select("id, name").in("id", neededRoomIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const userMap = new Map<string, any>();
    profilesList.forEach((p: any) => userMap.set(p.id, p));
    (extraUsersRes.data || []).forEach((p: any) => userMap.set(p.id, p));

    const roomMap = new Map<string, any>();
    roomsList.forEach((r: any) => roomMap.set(r.id, r));
    (extraRoomsRes.data || []).forEach((r: any) => roomMap.set(r.id, r));

    const synthesized: AdminNotificationItem[] = [];

    bookingsList.forEach((b: any) => {
      const isCancelled = b.status === "cancelled";
      const notifId = `synth_booking_${b.id}_${isCancelled ? "cancel" : "create"}`;
      if (clearedSet.has(notifId)) return;

      const u = userMap.get(b.user_id);
      const r = roomMap.get(b.room_id);
      const userName = u?.full_name || u?.email || "Especialista";
      const roomName = r?.name || "Consultório";

      let formattedSlot = "";
      try {
        formattedSlot = format(parseISO(b.start_time), "dd/MM/yyyy 'às' HH:mm");
      } catch {
        formattedSlot = String(b.start_time || "").slice(0, 16);
      }

      synthesized.push({
        id: notifId,
        event_type: isCancelled ? "booking_cancelled" : "booking_created",
        title: isCancelled
          ? "❌ Reserva Cancelada"
          : "📅 Nova Reserva Confirmada",
        message: isCancelled
          ? `A reserva de ${userName} na sala ${roomName} (${formattedSlot}) foi cancelada.`
          : `${userName} agendou a sala ${roomName} para ${formattedSlot}.`,
        metadata: {
          booking_id: b.id,
          user_id: b.user_id,
          room_id: b.room_id,
          user_name: userName,
          room_name: roomName,
          target_tab: "bookings",
          synthetic: true,
        },
        is_read: readSet.has(notifId),
        read_at: null,
        created_at: b.created_at || b.start_time || new Date().toISOString(),
      });
    });

    profilesList.forEach((p: any) => {
      if (p.role === "admin" || !p.created_at) return;
      const isHost = p.role === "host";
      const notifId = `synth_profile_${p.id}_${isHost ? "host" : "spec"}`;
      if (clearedSet.has(notifId)) return;

      const userName = p.full_name || p.email || "Novo Usuário";
      const specSuffix = p.specialty ? ` (${p.specialty})` : "";

      synthesized.push({
        id: notifId,
        event_type: isHost ? "host_registered" : "specialist_registered",
        title: isHost
          ? "🏢 Novo Anfitrião Cadastrado"
          : "👨‍⚕️ Novo Especialista Cadastrado",
        message: isHost
          ? `${userName} realizou o cadastro como Anfitrião na plataforma.`
          : `${userName}${specSuffix} criou uma conta de especialista na Fusion Clinic.`,
        metadata: {
          user_id: p.id,
          user_name: userName,
          role: p.role || "user",
          target_tab: isHost ? "hosts" : "specialists",
          synthetic: true,
        },
        is_read: readSet.has(notifId),
        read_at: null,
        created_at: p.created_at,
      });
    });

    roomsList.forEach((r: any) => {
      if (!r.created_at) return;
      const notifId = `synth_room_${r.id}`;
      if (clearedSet.has(notifId)) return;

      const host = userMap.get(r.host_id);
      const hostName = host?.full_name || host?.email || "Anfitrião";
      const roomName = r.name || "Novo Consultório";

      synthesized.push({
        id: notifId,
        event_type: "room_created",
        title: "🚪 Nova Sala Cadastrada",
        message: `${hostName} cadastrou o espaço "${roomName}" na plataforma.`,
        metadata: {
          room_id: r.id,
          room_name: roomName,
          host_id: r.host_id,
          host_name: hostName,
          target_tab: "rooms",
          synthetic: true,
        },
        is_read: readSet.has(notifId),
        read_at: null,
        created_at: r.created_at,
      });
    });

    synthesized.sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );

    setNotifications(synthesized.slice(0, 80));
  }, [supabase]);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const readSet = getStoredIdSet(STORAGE_READ_KEY);
      const clearedSet = getStoredIdSet(STORAGE_CLEARED_KEY);

      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);

      if (!error && Array.isArray(data) && data.length > 0) {
        setUsingDbTable(true);
        bellUsingDbTableState = true;
        const merged = (data as AdminNotificationItem[])
          .filter((item) => !clearedSet.has(item.id))
          .map((item) => ({
            ...item,
            is_read: item.is_read || readSet.has(item.id),
          }));
        setNotifications(merged);
      } else {
        const tableExists = !error;
        setUsingDbTable(tableExists);
        bellUsingDbTableState = tableExists;
        await loadFallbackActivityFeed();
      }
    } catch {
      await loadFallbackActivityFeed();
    } finally {
      setLoading(false);
    }
  }, [supabase, loadFallbackActivityFeed]);

  useEffect(() => {
    fetchNotifications();

    const channel = supabase
      .channel("fusion-admin-command-bell-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const newNotif = payload.new as AdminNotificationItem;
          pushIncomingNotification(newNotif);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
        },
        async (payload) => {
          if (bellUsingDbTableState) return;
          const bNew = payload.new as any;
          const bOld = payload.old as any;
          if (!bNew?.id) return;

          const isNewConfirmed =
            (payload.eventType === "INSERT" && bNew.status === "confirmed") ||
            (payload.eventType === "UPDATE" &&
              bOld?.status !== "confirmed" &&
              bNew.status === "confirmed");

          const isCancelled =
            payload.eventType === "UPDATE" &&
            bOld?.status !== "cancelled" &&
            bNew.status === "cancelled";

          if (!isNewConfirmed && !isCancelled) return;

          const [{ data: uData }, { data: rData }] = await Promise.all([
            bNew.user_id
              ? supabase
                  .from("profiles")
                  .select("full_name, email")
                  .eq("id", bNew.user_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
            bNew.room_id
              ? supabase
                  .from("rooms")
                  .select("name")
                  .eq("id", bNew.room_id)
                  .maybeSingle()
              : Promise.resolve({ data: null }),
          ]);

          const userName = uData?.full_name || uData?.email || "Especialista";
          const roomName = rData?.name || "Consultório";
          let slotStr = "";
          try {
            slotStr = format(
              parseISO(bNew.start_time),
              "dd/MM/yyyy 'às' HH:mm",
            );
          } catch {
            slotStr = "";
          }

          pushIncomingNotification({
            id: `rt_booking_${bNew.id}_${Date.now()}`,
            event_type: isCancelled ? "booking_cancelled" : "booking_created",
            title: isCancelled
              ? "❌ Reserva Cancelada"
              : "📅 Nova Reserva Confirmada",
            message: isCancelled
              ? `A reserva de ${userName} na sala ${roomName} (${slotStr}) foi cancelada.`
              : `${userName} acabou de reservar a sala ${roomName} (${slotStr}).`,
            metadata: {
              booking_id: bNew.id,
              user_id: bNew.user_id,
              room_id: bNew.room_id,
              target_tab: "bookings",
              synthetic: true,
            },
            is_read: false,
            read_at: null,
            created_at: new Date().toISOString(),
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "profiles",
        },
        (payload) => {
          if (bellUsingDbTableState) return;
          const pNew = payload.new as any;
          if (!pNew?.id || pNew.role === "admin") return;

          const isHost = pNew.role === "host";
          const userName = pNew.full_name || pNew.email || "Novo Usuário";

          pushIncomingNotification({
            id: `rt_profile_${pNew.id}_${Date.now()}`,
            event_type: isHost ? "host_registered" : "specialist_registered",
            title: isHost
              ? "🏢 Novo Anfitrião Cadastrado"
              : "👨‍⚕️ Novo Especialista Cadastrado",
            message: isHost
              ? `${userName} acabou de se cadastrar como Anfitrião.`
              : `${userName} acabou de criar uma conta de Especialista.`,
            metadata: {
              user_id: pNew.id,
              role: pNew.role,
              target_tab: isHost ? "hosts" : "specialists",
              synthetic: true,
            },
            is_read: false,
            read_at: null,
            created_at: new Date().toISOString(),
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "rooms",
        },
        async (payload) => {
          if (bellUsingDbTableState) return;
          const rNew = payload.new as any;
          if (!rNew?.id) return;

          let hostName = "Um anfitrião";
          if (rNew.host_id) {
            const { data: hData } = await supabase
              .from("profiles")
              .select("full_name, email")
              .eq("id", rNew.host_id)
              .maybeSingle();
            if (hData) hostName = hData.full_name || hData.email || hostName;
          }

          pushIncomingNotification({
            id: `rt_room_${rNew.id}_${Date.now()}`,
            event_type: "room_created",
            title: "🚪 Nova Sala Cadastrada",
            message: `${hostName} publicou a sala "${rNew.name || "Novo Consultório"}".`,
            metadata: {
              room_id: rNew.id,
              host_id: rNew.host_id,
              target_tab: "rooms",
              synthetic: true,
            },
            is_read: false,
            read_at: null,
            created_at: new Date().toISOString(),
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchNotifications, pushIncomingNotification]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const countsByCategory = useMemo(() => {
    return {
      all: notifications.length,
      unread: notifications.filter((n) => !n.is_read).length,
      bookings: notifications.filter((n) =>
        ["booking_created", "booking_checkin", "booking_checkout"].includes(
          n.event_type,
        ),
      ).length,
      cancellations: notifications.filter(
        (n) => n.event_type === "booking_cancelled",
      ).length,
      users: notifications.filter((n) =>
        ["specialist_registered", "host_registered"].includes(n.event_type),
      ).length,
      rooms: notifications.filter((n) => n.event_type === "room_created")
        .length,
    };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeFilter === "unread") return !n.is_read;
      if (activeFilter === "bookings")
        return [
          "booking_created",
          "booking_checkin",
          "booking_checkout",
        ].includes(n.event_type);
      if (activeFilter === "cancellations")
        return n.event_type === "booking_cancelled";
      if (activeFilter === "users")
        return ["specialist_registered", "host_registered"].includes(
          n.event_type,
        );
      if (activeFilter === "rooms") return n.event_type === "room_created";
      return true;
    });
  }, [notifications, activeFilter]);

  const handleMarkAsRead = async (id: string) => {
    const nowIso = new Date().toISOString();
    const readSet = getStoredIdSet(STORAGE_READ_KEY);
    readSet.add(id);
    saveStoredIdSet(STORAGE_READ_KEY, readSet);

    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: nowIso } : n,
      ),
    );

    if (usingDbTable && !id.startsWith("synth_") && !id.startsWith("rt_")) {
      await supabase
        .from("admin_notifications")
        .update({ is_read: true, read_at: nowIso })
        .eq("id", id);
    }
  };

  const handleMarkAllAsRead = async () => {
    const unreadItems = notifications.filter((n) => !n.is_read);
    if (unreadItems.length === 0) return;

    const nowIso = new Date().toISOString();
    const readSet = getStoredIdSet(STORAGE_READ_KEY);
    unreadItems.forEach((item) => readSet.add(item.id));
    saveStoredIdSet(STORAGE_READ_KEY, readSet);

    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: nowIso })),
    );

    const dbIds = unreadItems
      .map((n) => n.id)
      .filter((id) => !id.startsWith("synth_") && !id.startsWith("rt_"));

    if (usingDbTable && dbIds.length > 0) {
      await supabase
        .from("admin_notifications")
        .update({ is_read: true, read_at: nowIso })
        .in("id", dbIds);
    }

    toast({
      title: "Tudo em dia!",
      description: "Todas as notificações foram marcadas como lidas.",
    });
  };

  const handleClearRead = async () => {
    const readItems = notifications.filter((n) => n.is_read);
    if (readItems.length === 0) return;

    const clearedSet = getStoredIdSet(STORAGE_CLEARED_KEY);
    readItems.forEach((item) => clearedSet.add(item.id));
    saveStoredIdSet(STORAGE_CLEARED_KEY, clearedSet);

    setNotifications((prev) => prev.filter((n) => !n.is_read));

    const dbIds = readItems
      .map((n) => n.id)
      .filter((id) => !id.startsWith("synth_") && !id.startsWith("rt_"));

    if (usingDbTable && dbIds.length > 0) {
      await supabase.from("admin_notifications").delete().in("id", dbIds);
    }

    toast({
      title: "Histórico limpo",
      description: "As notificações já lidas foram removidas.",
    });
  };

  // ==========================================================================
  // CARREGAMENTO DO RAIO-X COMPLETO AO CLICAR EM "VER DETALHES"
  // ==========================================================================
  const handleNotificationClick = async (item: AdminNotificationItem) => {
    if (!item.is_read) {
      handleMarkAsRead(item.id);
    }

    setSelectedNotif(item);
    setDetailData(null);
    setIsDetailOpen(true);
    setDetailLoading(true);

    try {
      const evType = item.event_type;
      const meta = item.metadata || {};

      // 1. SE FOR RESERVA, CANCELAMENTO, CHECK-IN OU CHECK-OUT
      if (
        [
          "booking_created",
          "booking_cancelled",
          "booking_checkin",
          "booking_checkout",
        ].includes(evType)
      ) {
        let bookingRecord: any = null;

        if (meta.booking_id) {
          const { data } = await supabase
            .from("bookings")
            .select("*")
            .eq("id", meta.booking_id)
            .maybeSingle();
          bookingRecord = data;
        }

        // Fallback caso a notificação antiga não tenha booking_id
        if (!bookingRecord && meta.user_id && meta.room_id) {
          const { data } = await supabase
            .from("bookings")
            .select("*")
            .eq("user_id", meta.user_id)
            .eq("room_id", meta.room_id)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          bookingRecord = data;
        }

        if (!bookingRecord) {
          setDetailData({ kind: "not_found" });
          setDetailLoading(false);
          return;
        }

        // Busca dados enriquecidos em paralelo
        const bookingDayStart = startOfDay(
          parseISO(bookingRecord.start_time),
        ).toISOString();
        const bookingDayEnd = endOfDay(
          parseISO(bookingRecord.start_time),
        ).toISOString();

        const [
          roomRes,
          specRes,
          packagesRes,
          userTxsRes,
          userSubsRes,
          couponRes,
          contractsRes,
          sameDayBookingsRes,
        ] = await Promise.all([
          bookingRecord.room_id
            ? supabase
                .from("rooms")
                .select("*")
                .eq("id", bookingRecord.room_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          bookingRecord.user_id
            ? supabase
                .from("profiles")
                .select("*")
                .eq("id", bookingRecord.user_id)
                .maybeSingle()
            : Promise.resolve({ data: null }),
          supabase.from("packages").select("id, tier, hours, price, active"),
          bookingRecord.user_id
            ? supabase
                .from("wallet_transactions")
                .select("*")
                .eq("user_id", bookingRecord.user_id)
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [] as any[] }),
          bookingRecord.user_id
            ? supabase
                .from("subscriptions")
                .select("*")
                .eq("user_id", bookingRecord.user_id)
            : Promise.resolve({ data: [] as any[] }),
          supabase
            .from("coupon_uses")
            .select("booking_id, discount_applied")
            .eq("booking_id", bookingRecord.id),
          bookingRecord.room_id
            ? supabase
                .from("room_contracts")
                .select("*")
                .eq("room_id", bookingRecord.room_id)
            : Promise.resolve({ data: [] as any[] }),
          bookingRecord.user_id && bookingRecord.room_id
            ? supabase
                .from("bookings")
                .select("*")
                .eq("user_id", bookingRecord.user_id)
                .eq("room_id", bookingRecord.room_id)
                .gte("start_time", bookingDayStart)
                .lte("start_time", bookingDayEnd)
                .order("start_time", { ascending: true })
            : Promise.resolve({ data: [bookingRecord] }),
        ]);

        const room = roomRes.data;
        const specialist = specRes.data;
        const allPackages = packagesRes.data || [];
        const userTxs = userTxsRes.data || [];
        const userSubs = userSubsRes.data || [];
        const roomContracts = contractsRes.data || [];

        let hostProfile: any = null;
        if (room?.host_id) {
          const { data: hData } = await supabase
            .from("profiles")
            .select("id, full_name, email, phone, whatsapp")
            .eq("id", room.host_id)
            .maybeSingle();
          hostProfile = hData;
        }

        // Identifica se o agendamento fez parte de um lote de múltiplas horas no mesmo dia
        const mainCreatedMs = bookingRecord.created_at
          ? new Date(bookingRecord.created_at).getTime()
          : 0;
        const batchBookings = (
          sameDayBookingsRes.data || [bookingRecord]
        ).filter((b: any) => {
          if (b.id === bookingRecord.id) return true;
          if (b.status !== bookingRecord.status) return false;
          const bCreatedMs = b.created_at
            ? new Date(b.created_at).getTime()
            : 0;
          return Math.abs(bCreatedMs - mainCreatedMs) <= 60 * 1000;
        });

        const totalBatchSlots = batchBookings.reduce(
          (acc: number, b: any) =>
            acc + calculateSlotUnits(b.start_time, b.end_time),
          0,
        );

        const roomTier = normalizeTier(room?.tier);
        const rawTotalCost = Number(bookingRecord.total_cost || 0);
        const upgradeFee = Number(bookingRecord.upgrade_fee_amount || 0);
        const discount = (couponRes.data || []).reduce(
          (acc: number, c: any) => acc + Number(c.discount_applied || 0),
          0,
        );

        const linkedContract = bookingRecord.contract_id
          ? roomContracts.find((c: any) => c.id === bookingRecord.contract_id)
          : null;

        const activeCohostContract = roomContracts.find(
          (c: any) =>
            c.status === "active" &&
            c.contract_type === "monthly_exclusive" &&
            c.allow_sublease,
        );

        const isContractBooking = Boolean(
          bookingRecord.contract_id ||
          (bookingRecord.booking_origin &&
            String(bookingRecord.booking_origin).startsWith("contract")),
        );

        const isAdminManual = bookingRecord.booking_origin === "admin_manual";

        const isExplicitWalletOrigin =
          bookingRecord.booking_origin &&
          String(bookingRecord.booking_origin).startsWith("wallet_");

        const singleSlotUnits = calculateSlotUnits(
          bookingRecord.start_time,
          bookingRecord.end_time,
        );

        const isLegacyWalletOrigin =
          !bookingRecord.booking_origin &&
          Number(bookingRecord.agreed_value_brl || 0) === 0 &&
          rawTotalCost > 0 &&
          rawTotalCost <= singleSlotUnits * 2;

        const isPackageBooking = Boolean(
          isExplicitWalletOrigin || isLegacyWalletOrigin,
        );

        let originTitle = "";
        let paymentMethodBadge = "";
        let paymentDetailsText = "";
        let unitHourlyBrl = 0;
        let grossSingleBrl = 0;
        let roomBaseSingleBrl = 0;
        let standardFeeSingleBrl = 0;
        let downgradeSpreadSingleBrl = 0;
        let fusionProfitSingleBrl = 0;
        let hostPayoutSingleBrl = 0;
        let cohostPayoutSingleBrl = 0;
        let isDowngrade = false;
        let creditTierNormalized: "start" | "vip" | "master" = roomTier;

        if (isContractBooking) {
          const sessionVal =
            Number(bookingRecord.agreed_value_brl) > 0
              ? Number(bookingRecord.agreed_value_brl)
              : Number(linkedContract?.session_value || 0);
          const feePct = Number(linkedContract?.platform_fee_pct ?? 15) / 100;
          unitHourlyBrl = sessionVal / Math.max(1, singleSlotUnits);
          grossSingleBrl = sessionVal;
          roomBaseSingleBrl = sessionVal;
          standardFeeSingleBrl = sessionVal * feePct;
          fusionProfitSingleBrl = standardFeeSingleBrl;
          hostPayoutSingleBrl = Math.max(0, sessionVal - standardFeeSingleBrl);
          originTitle = "Contrato Fixo / Recorrente";
          paymentMethodBadge = "Fatura Contratual";
          paymentDetailsText = linkedContract?.contract_type
            ? `Alocação vinculada ao contrato (${linkedContract.contract_type})`
            : "Horário fixo bloqueado por contrato";
        } else if (isPackageBooking) {
          const activeSub =
            userSubs.find((s: any) => s.status === "ACTIVE") || userSubs[0];

          creditTierNormalized = isExplicitWalletOrigin
            ? normalizeTier(
                String(bookingRecord.booking_origin).replace("wallet_", ""),
              )
            : activeSub
              ? normalizeTier(activeSub.tier)
              : roomTier;

          const bookingTimeMs = bookingRecord.created_at
            ? new Date(bookingRecord.created_at).getTime()
            : new Date(bookingRecord.start_time).getTime();

          if (!isExplicitWalletOrigin) {
            const matchingDebit = userTxs.find((tx: any) => {
              if (Number(tx.amount) >= 0) return false;
              const txTime = new Date(tx.created_at).getTime();
              return Math.abs(txTime - bookingTimeMs) <= 10 * 60 * 1000;
            });
            if (matchingDebit?.tier) {
              creditTierNormalized = normalizeTier(matchingDebit.tier);
            }
          }

          const { hourlyRateBrl: exactUserCreditRate, matchedHours } =
            resolveCreditHourlyValueBRL({
              usedTier: creditTierNormalized,
              userTransactions: userTxs,
              userSubscriptions: userSubs,
              packages: allPackages,
              bookingTimestampMs: bookingTimeMs,
            });

          const creditHourlyRate =
            Number(bookingRecord.agreed_value_brl) > 0
              ? Number(bookingRecord.agreed_value_brl) / singleSlotUnits
              : exactUserCreditRate;

          const cohostSplitPct = activeCohostContract
            ? Number(activeCohostContract.cohost_split_pct || 80)
            : null;

          const arbitrage = calculatePackageBookingArbitrage({
            creditTierRaw: creditTierNormalized,
            roomTierRaw: roomTier,
            creditsUsed: singleSlotUnits,
            creditHourlyRateBrl: creditHourlyRate,
            matchedPackageHours: matchedHours,
            packages: allPackages,
            cohostSplitPct,
          });

          unitHourlyBrl = arbitrage.creditHourlyRateBrl;
          grossSingleBrl = Math.max(
            0,
            arbitrage.grossCreditValueBrl + upgradeFee - discount,
          );
          roomBaseSingleBrl = arbitrage.roomBaseValueBrl;
          standardFeeSingleBrl = arbitrage.standardPlatformFeeBrl;
          downgradeSpreadSingleBrl = arbitrage.downgradeSpreadProfitBrl;
          fusionProfitSingleBrl = arbitrage.totalPlatformProfitBrl;
          hostPayoutSingleBrl = arbitrage.hostPayoutBrl;
          cohostPayoutSingleBrl = arbitrage.cohostPayoutBrl;
          isDowngrade = arbitrage.isDowngrade;

          // Identifica como o assinante pagou o pacote dele (PIX ou Cartão)
          const hasPixPurchase = userTxs.some((tx: any) =>
            String(tx.description || "")
              .toUpperCase()
              .includes("PIX"),
          );
          const cardInfo = specialist?.cc_last4
            ? `Cartão final ${specialist.cc_last4}`
            : "Cartão de Crédito";

          originTitle = `Carteira Digital • Pacote Fusion Pass+ ${formatTierLabel(creditTierNormalized)} (${matchedHours || 8}h)`;
          paymentMethodBadge = `Créditos Pass+ (${hasPixPurchase ? "Assinatura PIX" : cardInfo})`;
          paymentDetailsText = isDowngrade
            ? `Usou crédito ${formatTierLabel(creditTierNormalized)} em Sala ${formatTierLabel(roomTier)} (Downgrade c/ margem extra)`
            : `Abatimento de saldo na Carteira Digital (${formatTierLabel(creditTierNormalized)})`;
        } else {
          // HORA AVULSA OU RESERVA ADMIN MANUAL
          const baseAvulsoVal =
            Number(bookingRecord.agreed_value_brl) > 0
              ? Number(bookingRecord.agreed_value_brl)
              : rawTotalCost >= singleSlotUnits * 20
                ? rawTotalCost
                : (roomTier === "master" ? 80 : roomTier === "vip" ? 45 : 40) *
                  singleSlotUnits;

          grossSingleBrl = Math.max(0, baseAvulsoVal + upgradeFee - discount);
          unitHourlyBrl = grossSingleBrl / Math.max(1, singleSlotUnits);
          roomBaseSingleBrl = grossSingleBrl;

          if (activeCohostContract) {
            const cohostPct = Number(
              activeCohostContract.cohost_split_pct || 80,
            );
            cohostPayoutSingleBrl = grossSingleBrl * (cohostPct / 100);
            standardFeeSingleBrl = Math.max(
              0,
              grossSingleBrl - cohostPayoutSingleBrl,
            );
            fusionProfitSingleBrl = standardFeeSingleBrl;
            hostPayoutSingleBrl = 0;
          } else {
            standardFeeSingleBrl = grossSingleBrl * 0.2;
            fusionProfitSingleBrl = standardFeeSingleBrl;
            hostPayoutSingleBrl = Math.max(
              0,
              grossSingleBrl - standardFeeSingleBrl,
            );
          }

          if (isAdminManual) {
            originTitle = "Reserva Manual (Painel Admin)";
            paymentMethodBadge = "Alocação Direta Admin";
            paymentDetailsText =
              "Horário bloqueado manualmente pela administração";
          } else {
            originTitle = `Hora Avulsa • Checkout Direto`;
            const asaasId = bookingRecord.asaas_payment_id;
            if (specialist?.cc_last4 && !asaasId) {
              paymentMethodBadge = `Cartão •••• ${specialist.cc_last4}`;
            } else if (asaasId) {
              paymentMethodBadge = specialist?.cc_last4
                ? `Checkout Asaas (PIX / Cartão •••• ${specialist.cc_last4})`
                : `Checkout Asaas (PIX / Cartão)`;
            } else {
              paymentMethodBadge = "Pagamento Direto (PIX / Cartão)";
            }
            paymentDetailsText = asaasId
              ? `Transação Asaas ID: ${asaasId}`
              : "Reserva avulsa confirmada no checkout";
          }
        }

        const multiplier = Math.max(1, batchBookings.length);

        setDetailData({
          kind: "booking",
          booking: bookingRecord,
          batchBookings,
          totalBatchHours: totalBatchSlots,
          room,
          roomTier,
          hostProfile,
          specialist,
          cohostName: activeCohostContract?.specialist_name || null,
          originTitle,
          paymentMethodBadge,
          paymentDetailsText,
          isPackageBooking,
          isContractBooking,
          isAdminManual,
          isDowngrade,
          creditTierNormalized,
          unitHourlyBrl,
          discountBrl: discount * multiplier,
          upgradeFeeBrl: upgradeFee * multiplier,
          grossTotalBrl: grossSingleBrl * multiplier,
          roomBaseTotalBrl: roomBaseSingleBrl * multiplier,
          standardFeeTotalBrl: standardFeeSingleBrl * multiplier,
          downgradeSpreadTotalBrl: downgradeSpreadSingleBrl * multiplier,
          fusionProfitTotalBrl: fusionProfitSingleBrl * multiplier,
          hostPayoutTotalBrl: hostPayoutSingleBrl * multiplier,
          cohostPayoutTotalBrl: cohostPayoutSingleBrl * multiplier,
        });
      }
      // 2. SE FOR CADASTRO DE ESPECIALISTA OU ANFITRIÃO
      else if (
        evType === "specialist_registered" ||
        evType === "host_registered"
      ) {
        const userId = meta.user_id;
        const { data: prof } = userId
          ? await supabase
              .from("profiles")
              .select("*")
              .eq("id", userId)
              .maybeSingle()
          : { data: null };

        setDetailData({
          kind: "profile",
          profile: prof,
          isHost: evType === "host_registered" || prof?.role === "host",
        });
      }
      // 3. SE FOR NOVA SALA CADASTRADA
      else if (evType === "room_created") {
        const roomId = meta.room_id;
        const { data: room } = roomId
          ? await supabase
              .from("rooms")
              .select("*")
              .eq("id", roomId)
              .maybeSingle()
          : { data: null };

        let hostProfile: any = null;
        if (room?.host_id) {
          const { data: hData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", room.host_id)
            .maybeSingle();
          hostProfile = hData;
        }

        setDetailData({
          kind: "room",
          room,
          hostProfile,
          hourlyRate: room
            ? extractRoomModalitiesHourlyRate(
                room.modalities,
                room.address_details,
              )
            : null,
        });
      }
    } catch (err) {
      console.error("Erro ao carregar detalhes da notificação:", err);
      setDetailData({ kind: "error" });
    } finally {
      setDetailLoading(false);
    }
  };

  const getEventVisuals = (eventType: string) => {
    switch (eventType) {
      case "booking_created":
        return {
          icon: CalendarCheck,
          bgIcon: "bg-emerald-50 text-emerald-600 border-emerald-200",
          badgeText: "Nova Reserva",
          badgeClass: "bg-emerald-50 text-emerald-700",
        };
      case "booking_cancelled":
        return {
          icon: CalendarX,
          bgIcon: "bg-red-50 text-red-600 border-red-200",
          badgeText: "Cancelamento",
          badgeClass: "bg-red-50 text-red-700",
        };
      case "specialist_registered":
        return {
          icon: UserPlus,
          bgIcon: "bg-blue-50 text-blue-600 border-blue-200",
          badgeText: "Novo Especialista",
          badgeClass: "bg-blue-50 text-blue-700",
        };
      case "host_registered":
        return {
          icon: Building2,
          bgIcon: "bg-purple-50 text-purple-600 border-purple-200",
          badgeText: "Novo Anfitrião",
          badgeClass: "bg-purple-50 text-purple-700",
        };
      case "room_created":
        return {
          icon: DoorOpen,
          bgIcon: "bg-orange-50 text-[#BF4B24] border-orange-200",
          badgeText: "Nova Sala",
          badgeClass: "bg-orange-50 text-[#BF4B24]",
        };
      case "booking_checkin":
        return {
          icon: QrCode,
          bgIcon: "bg-amber-50 text-amber-700 border-amber-200",
          badgeText: "Check-in Porta",
          badgeClass: "bg-amber-50 text-amber-800",
        };
      case "booking_checkout":
        return {
          icon: CheckCircle2,
          bgIcon: "bg-teal-50 text-teal-700 border-teal-200",
          badgeText: "Check-out",
          badgeClass: "bg-teal-50 text-teal-800",
        };
      default:
        return {
          icon: Sparkles,
          bgIcon: "bg-slate-100 text-slate-600 border-slate-200",
          badgeText: "Sistema",
          badgeClass: "bg-slate-100 text-slate-700",
        };
    }
  };

  return (
    <>
      <Sheet open={isOpen} onOpenChange={setIsOpen}>
        <SheetTrigger asChild>
          <button
            type="button"
            title="Central de Notificações em Tempo Real"
            className={`relative inline-flex items-center justify-center h-10 px-3.5 rounded-xl border transition-all cursor-pointer shadow-2xs gap-2 ${
              unreadCount > 0
                ? "bg-orange-50/90 border-orange-200 text-[#BF4B24] hover:bg-orange-100/80"
                : "bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900"
            } ${hasNewPulse ? "ring-4 ring-[#BF4B24]/25 scale-105" : ""}`}
          >
            <Bell
              className={`w-4 h-4 transition-transform ${
                hasNewPulse ? "animate-bounce" : ""
              }`}
            />
            <span className="text-xs font-semibold hidden sm:inline">
              Notificações
            </span>

            {unreadCount > 0 && (
              <span className="flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#BF4B24] text-white text-[10px] font-black shadow-2xs tabular-nums relative">
                <span className="absolute inline-flex h-full w-full rounded-full bg-[#BF4B24] opacity-60 animate-ping" />
                <span className="relative">
                  {unreadCount > 99 ? "99+" : unreadCount}
                </span>
              </span>
            )}
          </button>
        </SheetTrigger>

        <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col bg-[#FAF7F4] border-l border-slate-200">
          <div className="bg-white px-6 pt-6 pb-4 border-b border-slate-200/90">
            <SheetHeader className="space-y-1 text-left">
              <div className="flex items-center justify-between gap-2 pr-6">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#BF4B24]/10 text-[#BF4B24] flex items-center justify-center">
                    <Bell className="w-4 h-4" />
                  </div>
                  <div>
                    <SheetTitle className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                      Radar da Plataforma
                      <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Ao Vivo
                      </span>
                    </SheetTitle>
                    <SheetDescription className="text-xs text-slate-500">
                      Clique em qualquer notificação para abrir o Raio-X
                      completo.
                    </SheetDescription>
                  </div>
                </div>
              </div>
            </SheetHeader>

            <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={handleMarkAllAsRead}
                  disabled={unreadCount === 0}
                  className="h-8 text-[11px] font-bold border-slate-200 text-slate-700 rounded-lg"
                >
                  <CheckCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                  Ler todas ({unreadCount})
                </Button>

                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleClearRead}
                  disabled={notifications.length - unreadCount === 0}
                  className="h-8 text-[11px] font-semibold text-slate-500 hover:text-red-600 rounded-lg"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Limpar lidas
                </Button>
              </div>

              <button
                type="button"
                onClick={() => setSoundEnabled((prev) => !prev)}
                className={`h-8 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                  soundEnabled
                    ? "bg-slate-900 text-white border-slate-900"
                    : "bg-slate-100 text-slate-500 border-slate-200"
                }`}
              >
                {soundEnabled ? (
                  <>
                    <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                    Som On
                  </>
                ) : (
                  <>
                    <VolumeX className="w-3.5 h-3.5" />
                    Mudo
                  </>
                )}
              </button>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mt-3 pt-1">
              {[
                { id: "all", label: `Todas (${countsByCategory.all})` },
                {
                  id: "unread",
                  label: `Não lidas (${countsByCategory.unread})`,
                },
                {
                  id: "bookings",
                  label: `Reservas (${countsByCategory.bookings})`,
                },
                {
                  id: "cancellations",
                  label: `Cancelamentos (${countsByCategory.cancellations})`,
                },
                {
                  id: "users",
                  label: `Cadastros (${countsByCategory.users})`,
                },
                {
                  id: "rooms",
                  label: `Salas (${countsByCategory.rooms})`,
                },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() =>
                    setActiveFilter(tab.id as NotificationFilterCategory)
                  }
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                    activeFilter === tab.id
                      ? "bg-[#BF4B24] text-white shadow-2xs"
                      : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
            {loading ? (
              <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
                <Loader2 className="w-7 h-7 animate-spin text-[#BF4B24]" />
                <p className="text-xs font-medium">
                  Carregando eventos da plataforma...
                </p>
              </div>
            ) : filteredNotifications.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-64 text-center px-6">
                <div className="w-12 h-12 rounded-2xl bg-slate-200/70 text-slate-400 flex items-center justify-center mb-3">
                  <Bell className="w-6 h-6" />
                </div>
                <p className="text-sm font-bold text-slate-700">
                  Nenhuma notificação neste filtro
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  Novos agendamentos, cancelamentos, cadastros de especialistas,
                  anfitriões e salas aparecerão aqui instantaneamente.
                </p>
              </div>
            ) : (
              filteredNotifications.map((item) => {
                const visual = getEventVisuals(item.event_type);
                const IconComponent = visual.icon;

                let relativeTime = "";
                let exactTime = "";
                try {
                  const parsed = parseISO(item.created_at);
                  relativeTime = formatDistanceToNow(parsed, {
                    addSuffix: true,
                    locale: ptBR,
                  });
                  exactTime = format(parsed, "dd/MM/yyyy 'às' HH:mm", {
                    locale: ptBR,
                  });
                } catch {
                  relativeTime = "recentemente";
                }

                return (
                  <div
                    key={item.id}
                    onClick={() => handleNotificationClick(item)}
                    className={`group relative rounded-2xl border p-4 transition-all cursor-pointer ${
                      !item.is_read
                        ? "bg-white border-orange-200/90 shadow-xs hover:border-[#BF4B24]"
                        : "bg-white/70 border-slate-200/70 opacity-85 hover:opacity-100 hover:bg-white"
                    }`}
                  >
                    {!item.is_read && (
                      <span
                        title="Não lida"
                        className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-[#BF4B24] ring-4 ring-orange-100"
                      />
                    )}

                    <div className="flex items-start gap-3.5">
                      <div
                        className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${visual.bgIcon}`}
                      >
                        <IconComponent className="w-5 h-5" />
                      </div>

                      <div className="flex-1 min-w-0 pr-4">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge
                            className={`${visual.badgeClass} border-0 text-[10px] font-bold px-2 py-0`}
                          >
                            {visual.badgeText}
                          </Badge>
                          <span
                            title={exactTime}
                            className="text-[11px] font-medium text-slate-400"
                          >
                            {relativeTime}
                          </span>
                        </div>

                        <h4 className="text-xs font-extrabold text-slate-900 leading-snug">
                          {item.title}
                        </h4>

                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {item.message}
                        </p>

                        <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                          <span>{exactTime}</span>
                          <span className="inline-flex items-center gap-0.5 font-bold text-[#BF4B24] group-hover:translate-x-0.5 transition-transform">
                            Ver detalhes completos{" "}
                            <ChevronRight className="w-3.5 h-3.5" />
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </SheetContent>
      </Sheet>

      {/* ================================================================== */}
      {/* MODAL DE RAIO-X COMPLETO DO EVENTO / RESERVA                       */}
      {/* ================================================================== */}
      <Dialog open={isDetailOpen} onOpenChange={setIsDetailOpen}>
        <DialogContent className="sm:max-w-xl max-h-[90vh] p-0 gap-0 overflow-hidden flex flex-col bg-white border-slate-200 shadow-2xl rounded-2xl">
          <DialogHeader className="px-6 py-4 bg-slate-900 text-white shrink-0">
            <div className="flex items-center justify-between gap-2 pr-6">
              <div>
                <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                  {selectedNotif?.title || "Detalhes da Notificação"}
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400 mt-0.5">
                  Auditoria completa de origem, forma de pagamento, horários e
                  divisão financeira.
                </DialogDescription>
              </div>
            </div>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto p-6 space-y-5 text-xs">
            {detailLoading ? (
              <div className="flex flex-col items-center justify-center py-16 gap-2.5 text-slate-500">
                <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
                <p className="font-semibold text-xs">
                  Buscando dados completos da transação...
                </p>
              </div>
            ) : !detailData || detailData.kind === "not_found" ? (
              <div className="text-center py-12 space-y-2">
                <p className="text-sm font-bold text-slate-800">
                  {selectedNotif?.title}
                </p>
                <p className="text-xs text-slate-600">
                  {selectedNotif?.message}
                </p>
                <p className="text-[11px] text-slate-400 pt-2">
                  O registro original não foi localizado ou foi removido.
                </p>
              </div>
            ) : detailData.kind === "booking" ? (
              <>
                {/* 1. STATUS, CANAL / ORIGEM E FORMA DE PAGAMENTO */}
                <div className="p-4 rounded-2xl bg-[#FAF7F4] border border-orange-200/80 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#BF4B24] bg-orange-100/80 px-2.5 py-1 rounded-md">
                      {detailData.originTitle}
                    </span>

                    {detailData.booking.status === "cancelled" ? (
                      <Badge className="bg-red-100 text-red-800 border-0 font-bold text-[11px]">
                        Cancelada
                      </Badge>
                    ) : detailData.booking.status === "completed" ? (
                      <Badge className="bg-slate-200 text-slate-800 border-0 font-bold text-[11px]">
                        Concluída
                      </Badge>
                    ) : (
                      <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold text-[11px]">
                        Confirmada
                      </Badge>
                    )}
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-stone-200/70">
                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        Forma de Pagamento / Meio
                      </span>
                      <span className="font-extrabold text-slate-900 text-xs flex items-center gap-1.5 mt-0.5">
                        <CreditCard className="w-3.5 h-3.5 text-[#BF4B24]" />
                        {detailData.paymentMethodBadge}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        Código da Reserva
                      </span>
                      <span className="font-mono font-bold text-slate-800 text-xs flex items-center gap-1 mt-0.5">
                        <Hash className="w-3.5 h-3.5 text-slate-400" />
                        {detailData.booking.id.slice(0, 8)}
                      </span>
                    </div>
                  </div>

                  <p className="text-[11px] text-slate-600 bg-white/80 px-3 py-2 rounded-xl border border-stone-200/60">
                    {detailData.paymentDetailsText}
                  </p>
                </div>

                {/* 2. SALA, CLÍNICA E DATA/HORÁRIOS RESERVADOS */}
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Consultório & Clínica Anfitriã
                      </span>
                      <h4 className="text-sm font-black text-slate-900 mt-0.5">
                        {detailData.room?.name || "Sala"} • Categoria{" "}
                        {formatTierLabel(detailData.roomTier)}
                      </h4>
                      <p className="text-xs font-medium text-slate-600 mt-0.5">
                        Anfitrião:{" "}
                        <strong>
                          {detailData.hostProfile?.full_name || "Fusion Clinic"}
                        </strong>
                        {detailData.cohostName
                          ? ` • Co-Host: ${detailData.cohostName}`
                          : ""}
                      </p>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-200/80 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        Para qual dia foi agendado
                      </span>
                      <span className="font-extrabold text-slate-900 text-xs block mt-0.5 capitalize">
                        {format(
                          parseISO(detailData.booking.start_time),
                          "EEEE, dd/MM/yyyy",
                          { locale: ptBR },
                        )}
                      </span>
                    </div>

                    <div>
                      <span className="text-[11px] text-slate-500 block">
                        Feito em (Data do Pedido)
                      </span>
                      <span className="font-bold text-slate-700 text-xs block mt-0.5">
                        {detailData.booking.created_at
                          ? format(
                              parseISO(detailData.booking.created_at),
                              "dd/MM/yyyy 'às' HH:mm",
                            )
                          : "-"}
                      </span>
                    </div>
                  </div>

                  {/* Lista todos os horários reservados naquele lote */}
                  <div className="pt-2">
                    <span className="text-[11px] font-bold text-slate-600 block mb-1.5">
                      Horário(s) Reservado(s) ({detailData.totalBatchHours}h no
                      total):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {detailData.batchBookings.map((bSlot: any) => (
                        <span
                          key={bSlot.id}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-slate-900 text-white font-bold text-[11px] tabular-nums"
                        >
                          <Clock className="w-3 h-3 text-amber-400" />
                          {format(parseISO(bSlot.start_time), "HH:mm")} às{" "}
                          {format(parseISO(bSlot.end_time), "HH:mm")}
                        </span>
                      ))}
                    </div>
                  </div>

                  {(detailData.booking.checkin_time ||
                    detailData.booking.checkout_time) && (
                    <div className="pt-2 border-t border-slate-200/80 flex flex-wrap gap-4 text-[11px]">
                      {detailData.booking.checkin_time && (
                        <span className="text-emerald-700 font-bold">
                          📲 Check-in:{" "}
                          {format(
                            parseISO(detailData.booking.checkin_time),
                            "dd/MM HH:mm",
                          )}
                        </span>
                      )}
                      {detailData.booking.checkout_time && (
                        <span className="text-teal-700 font-bold">
                          ✅ Check-out:{" "}
                          {format(
                            parseISO(detailData.booking.checkout_time),
                            "dd/MM HH:mm",
                          )}
                        </span>
                      )}
                    </div>
                  )}
                </div>

                {/* 3. RAIO-X FINANCEIRO E SPLIT */}
                <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-2.5 tabular-nums">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2.5">
                    <div>
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Valor Total da Reserva ({detailData.totalBatchHours}h)
                      </span>
                      <span className="text-xl font-black text-white">
                        R$ {formatBRL(detailData.grossTotalBrl)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="text-[10px] text-slate-400 block">
                        Valor por Hora
                      </span>
                      <span className="text-xs font-bold text-amber-400">
                        R$ {formatBRL(detailData.unitHourlyBrl)}/h
                      </span>
                    </div>
                  </div>

                  {detailData.discountBrl > 0 && (
                    <div className="flex justify-between text-xs text-amber-300">
                      <span>Desconto de Cupom Aplicado:</span>
                      <span className="font-bold">
                        - R$ {formatBRL(detailData.discountBrl)}
                      </span>
                    </div>
                  )}

                  {detailData.isDowngrade && (
                    <div className="bg-slate-800 p-2.5 rounded-xl space-y-1 text-[11px]">
                      <div className="flex justify-between text-slate-300">
                        <span>
                          Base da Sala Entregue (
                          {formatTierLabel(detailData.roomTier)}):
                        </span>
                        <span className="font-semibold text-white">
                          R$ {formatBRL(detailData.roomBaseTotalBrl)}
                        </span>
                      </div>
                      <div className="flex justify-between text-emerald-400 font-bold">
                        <span className="flex items-center gap-1">
                          <ArrowDownRight className="w-3.5 h-3.5" /> Ganho Extra
                          de Downgrade (100% Fusion):
                        </span>
                        <span>
                          + R$ {formatBRL(detailData.downgradeSpreadTotalBrl)}
                        </span>
                      </div>
                    </div>
                  )}

                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Taxa Base Plataforma:</span>
                    <span className="font-semibold text-white">
                      R$ {formatBRL(detailData.standardFeeTotalBrl)}
                    </span>
                  </div>

                  {detailData.cohostPayoutTotalBrl > 0 && (
                    <div className="flex justify-between text-xs text-slate-300">
                      <span>
                        Repasse Co-Anfitrião ({detailData.cohostName}):
                      </span>
                      <span className="font-semibold text-white">
                        R$ {formatBRL(detailData.cohostPayoutTotalBrl)}
                      </span>
                    </div>
                  )}

                  <div className="flex justify-between text-xs text-slate-300">
                    <span>
                      Repasse Clínica (
                      {detailData.hostProfile?.full_name || "Fusion Clinic"}):
                    </span>
                    <span className="font-semibold text-white">
                      R$ {formatBRL(detailData.hostPayoutTotalBrl)}
                    </span>
                  </div>

                  <div className="pt-2 border-t border-slate-800 flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-200">
                      Receita Líquida Total Fusion:
                    </span>
                    <span className="text-sm font-black text-emerald-400">
                      + R$ {formatBRL(detailData.fusionProfitTotalBrl)}
                    </span>
                  </div>
                </div>

                {/* 4. DADOS DO PROFISSIONAL / ESPECIALISTA */}
                {detailData.specialist && (
                  <div className="p-4 rounded-2xl bg-white border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                        Profissional Responsável
                      </span>
                      <p className="text-sm font-bold text-slate-900">
                        {detailData.specialist.full_name || "Especialista"}
                      </p>
                      <p className="text-xs text-[#BF4B24] font-semibold">
                        {detailData.specialist.specialty || "Saúde"}{" "}
                        {detailData.specialist.council_number
                          ? `• ${detailData.specialist.council || "Conselho"}: ${detailData.specialist.council_number}`
                          : ""}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {detailData.specialist.email || ""}{" "}
                        {detailData.specialist.cpf
                          ? `• CPF: ${detailData.specialist.cpf}`
                          : ""}
                      </p>
                    </div>

                    {cleanPhoneForWa(
                      detailData.specialist.whatsapp ||
                        detailData.specialist.phone,
                    ) && (
                      <a
                        href={`https://wa.me/${cleanPhoneForWa(
                          detailData.specialist.whatsapp ||
                            detailData.specialist.phone,
                        )}?text=${encodeURIComponent(
                          `Olá Dr(a). ${(detailData.specialist.full_name || "").split(" ")[0]}, tudo bem? Falando da Fusion Clinic sobre sua reserva na sala ${detailData.room?.name || ""}.`,
                        )}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-9 px-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center gap-1.5 shrink-0 transition-colors"
                      >
                        <MessageCircle className="w-4 h-4" />
                        WhatsApp
                      </a>
                    )}
                  </div>
                )}
              </>
            ) : detailData.kind === "profile" && detailData.profile ? (
              /* MODAL DE DETALHES DE CADASTRO DE ESPECIALISTA / ANFITRIÃO */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 flex items-center gap-3.5">
                  <div className="w-12 h-12 rounded-full bg-[#BF4B24]/10 text-[#BF4B24] flex items-center justify-center font-black text-base shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <Badge className="bg-slate-900 text-white border-0 text-[10px] mb-1">
                      {detailData.isHost
                        ? "Conta de Anfitrião"
                        : "Conta de Especialista"}
                    </Badge>
                    <h4 className="text-base font-black text-slate-900">
                      {detailData.profile.full_name || "Novo Cadastrado"}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {detailData.profile.email}
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 p-4 rounded-2xl border border-slate-200 bg-white">
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Especialidade
                    </span>
                    <span className="font-bold text-slate-900">
                      {detailData.profile.specialty || "Não informada"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Conselho Profissional
                    </span>
                    <span className="font-bold text-slate-900">
                      {detailData.profile.council
                        ? `${detailData.profile.council} ${detailData.profile.council_number || ""}`
                        : "Não informado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      CPF
                    </span>
                    <span className="font-bold text-slate-900">
                      {detailData.profile.cpf || "Não informado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block text-[11px]">
                      Telefone / WhatsApp
                    </span>
                    <span className="font-bold text-slate-900">
                      {detailData.profile.whatsapp ||
                        detailData.profile.phone ||
                        "Não informado"}
                    </span>
                  </div>
                </div>

                {cleanPhoneForWa(
                  detailData.profile.whatsapp || detailData.profile.phone,
                ) && (
                  <a
                    href={`https://wa.me/${cleanPhoneForWa(
                      detailData.profile.whatsapp || detailData.profile.phone,
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="w-full h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center justify-center gap-2 transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Dar Boas-Vindas no WhatsApp
                  </a>
                )}
              </div>
            ) : detailData.kind === "room" && detailData.room ? (
              /* MODAL DE DETALHES DE NOVA SALA CADASTRADA */
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-2">
                  <Badge className="bg-orange-100 text-[#BF4B24] border-0 font-bold text-[10px]">
                    Categoria{" "}
                    {formatTierLabel(normalizeTier(detailData.room.tier))}
                  </Badge>
                  <h4 className="text-base font-black text-slate-900">
                    {detailData.room.name}
                  </h4>
                  <p className="text-xs text-slate-600">
                    Cadastrada por:{" "}
                    <strong>
                      {detailData.hostProfile?.full_name || "Anfitrião"}
                    </strong>
                  </p>
                  {detailData.hourlyRate && (
                    <p className="text-xs font-bold text-emerald-700">
                      Tarifa Hora Avulsa: R$ {formatBRL(detailData.hourlyRate)}
                      /h
                    </p>
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function computeRoomAvailableHoursInInterval(
  room: any,
  startDate: Date,
  endDate: Date,
): number {
  try {
    if (endDate < startDate) return 0;
    const days = eachDayOfInterval({ start: startDate, end: endDate });
    const blockedSet = new Set<string>(
      Array.isArray(room?.blocked_dates) ? room.blocked_dates : [],
    );
    const availability =
      typeof room?.availability === "string"
        ? JSON.parse(room.availability)
        : room?.availability;

    let totalHours = 0;

    days.forEach((d) => {
      const dateIso = format(d, "yyyy-MM-dd");
      if (blockedSet.has(dateIso)) return;

      const dayOfWeek = d.getDay();
      const dateStr = d.toDateString();

      if (availability && Array.isArray(availability.weekConfig)) {
        const dayConfig = availability.weekConfig.find(
          (w: any) => Number(w.day) === dayOfWeek,
        );
        let daySlotsCount = 0;

        if (dayConfig && dayConfig.enabled) {
          if (dayConfig.rentalType === "hourly") {
            daySlotsCount =
              Array.isArray(dayConfig.availableHours) &&
              dayConfig.availableHours.length > 0
                ? dayConfig.availableHours.length
                : 10;
          } else if (dayConfig.rentalType === "shift") {
            const shifts = Array.isArray(dayConfig.selectedShifts)
              ? dayConfig.selectedShifts
              : [];
            if (shifts.includes("morning")) daySlotsCount += 4;
            if (shifts.includes("afternoon")) daySlotsCount += 5;
            if (shifts.includes("night")) daySlotsCount += 4;
          }
        }

        if (Array.isArray(availability.exceptions)) {
          const ex = availability.exceptions.find(
            (e: any) => new Date(e.date).toDateString() === dateStr,
          );
          if (ex) {
            if (ex.type === "block") {
              if (ex.isFullDay) daySlotsCount = 0;
              else if (Array.isArray(ex.hours)) {
                daySlotsCount = Math.max(0, daySlotsCount - ex.hours.length);
              }
            } else if (ex.type === "extra" && Array.isArray(ex.hours)) {
              daySlotsCount += ex.hours.length;
            }
          }
        }

        totalHours += daySlotsCount;
      } else {
        if (dayOfWeek >= 1 && dayOfWeek <= 5) totalHours += 10;
        else if (dayOfWeek === 6) totalHours += 4;
      }
    });

    return Math.max(1, totalHours);
  } catch {
    const diffDays = Math.max(1, differenceInDays(endDate, startDate) + 1);
    return Math.max(1, Math.round(diffDays * 8));
  }
}

function extractContractBaixaEvents(contract: any): {
  competence: string;
  paidDateIso: string;
  grossBrl: number;
  fusionFeeBrl: number;
  fusionFeePct: number;
  hostPayoutBrl: number;
}[] {
  const events: {
    competence: string;
    paidDateIso: string;
    grossBrl: number;
    fusionFeeBrl: number;
    fusionFeePct: number;
    hostPayoutBrl: number;
  }[] = [];

  const contractVal =
    Number(contract?.contract_value) > 0
      ? Number(contract.contract_value)
      : Number(contract?.session_value || 0);

  if (contractVal <= 0) return events;

  const feePct = Number(contract?.platform_fee_pct ?? 15);
  const fusionFee = contractVal * (feePct / 100);
  const hostPayout = Math.max(0, contractVal - fusionFee);

  const dueDayRaw = Math.max(1, Math.min(31, Number(contract?.due_day) || 8));
  const sched =
    typeof contract?.schedule_config === "string"
      ? (() => {
          try {
            return JSON.parse(contract.schedule_config);
          } catch {
            return {};
          }
        })()
      : contract?.schedule_config || {};

  const paidCompetencesMap = new Map<string, string>();

  if (sched?.paid_dates && typeof sched.paid_dates === "object") {
    Object.entries(sched.paid_dates).forEach(([comp, dateStr]) => {
      if (comp && typeof dateStr === "string") {
        const cleanDate = dateStr.slice(0, 10);
        paidCompetencesMap.set(comp, `${cleanDate}T12:00:00`);
      }
    });
  }

  const lastPaidComp = String(contract?.last_paid_competence || "").trim();
  if (lastPaidComp && /^\d{4}-\d{2}$/.test(lastPaidComp)) {
    if (!paidCompetencesMap.has(lastPaidComp)) {
      if (
        typeof sched?.last_paid_date === "string" &&
        sched.last_paid_date.startsWith(lastPaidComp)
      ) {
        const cleanDate = sched.last_paid_date.slice(0, 10);
        paidCompetencesMap.set(lastPaidComp, `${cleanDate}T12:00:00`);
      } else {
        const [yearStr, monthStr] = lastPaidComp.split("-");
        const yearNum = Number(yearStr);
        const monthNum = Number(monthStr);
        const maxDays = getDaysInMonth(new Date(yearNum, monthNum - 1, 1));
        const safeDay = String(Math.min(dueDayRaw, maxDays)).padStart(2, "0");
        paidCompetencesMap.set(
          lastPaidComp,
          `${lastPaidComp}-${safeDay}T12:00:00`,
        );
      }
    }
  }

  paidCompetencesMap.forEach((paidDateIso, competence) => {
    events.push({
      competence,
      paidDateIso,
      grossBrl: contractVal,
      fusionFeeBrl: fusionFee,
      fusionFeePct: feePct,
      hostPayoutBrl: hostPayout,
    });
  });

  return events;
}

export function AdminOverviewTab({
  onNavigateTab,
}: {
  onNavigateTab?: (tabName: string, metadata?: Record<string, any>) => void;
} = {}) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [initialLoading, setInitialLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Filtro de Período Histórico
  const [timeFilter, setTimeFilter] = useState<"7d" | "30d" | "ytd" | "custom">(
    "30d",
  );
  const [customStartDate, setCustomStartDate] = useState(
    format(subDays(new Date(), 30), "yyyy-MM-dd"),
  );
  const [customEndDate, setCustomEndDate] = useState(
    format(new Date(), "yyyy-MM-dd"),
  );

  // Filtro de Série do Gráfico Principal
  const [chartView, setChartView] = useState<
    "all" | "avulso" | "package" | "contract"
  >("all");

  // Controles do Módulo de Estoque de Horas & Potencial Financeiro
  const [inventoryMode, setInventoryMode] = useState<"past" | "future">("past");
  const [futureHorizonDays, setFutureHorizonDays] = useState<15 | 20 | 30>(20);

  // Estados Globais
  const [gmv, setGmv] = useState(0);
  const [takeRate, setTakeRate] = useState(0);
  const [hostPayoutTotal, setHostPayoutTotal] = useState(0);
  const [activeDoctors, setActiveDoctors] = useState(0);
  const [recurringDoctorsCount, setRecurringDoctorsCount] = useState(0);
  const [activeRooms, setActiveRooms] = useState(0);
  const [activeContractsCount, setActiveContractsCount] = useState(0);
  const [avgOccupancyRate, setAvgOccupancyRate] = useState(0);

  // Subgrupo 1: Horas Avulsas
  const [avulsoGmv, setAvulsoGmv] = useState(0);
  const [avulsoTakeRate, setAvulsoTakeRate] = useState(0);
  const [avulsoBookingsCount, setAvulsoBookingsCount] = useState(0);
  const [avulsoHoursCount, setAvulsoHoursCount] = useState(0);

  // Subgrupo 2: Pacotes Fusion Pass+
  const [packageGmv, setPackageGmv] = useState(0);
  const [packageStandardFee, setPackageStandardFee] = useState(0);
  const [packageDowngradeSpread, setPackageDowngradeSpread] = useState(0);
  const [packageTotalTakeRate, setPackageTotalTakeRate] = useState(0);
  const [packageHostPayout, setPackageHostPayout] = useState(0);
  const [packageBookingsCount, setPackageBookingsCount] = useState(0);
  const [packageHoursCount, setPackageHoursCount] = useState(0);
  const [packageDowngradeCount, setPackageDowngradeCount] = useState(0);
  const [packageByTierStats, setPackageByTierStats] = useState({
    start: { count: 0, hours: 0, gmv: 0 },
    vip: { count: 0, hours: 0, gmv: 0 },
    master: { count: 0, hours: 0, gmv: 0 },
  });

  // Inteligência de Assinantes (Raio-X e Breakage)
  const [subscribersReport, setSubscribersReport] = useState<
    SubscriberPackageAnalytics[]
  >([]);
  const [breakageTotals, setBreakageTotals] = useState({
    totalSubscribersCount: 0,
    activeSubscribersCount: 0,
    renewedSubscribersCount: 0,
    reactivatedSubscribersCount: 0,
    expiringSoonCount: 0,
    overdueCount: 0,
    cancelledCount: 0,
    pixSubscribersCount: 0,
    cardSubscribersCount: 0,
    activeMrrBrl: 0,
    totalPurchasedHours: 0,
    totalUsedHours: 0,
    totalExpiredUnusedHours: 0,
    totalActiveRemainingHours: 0,
    totalInvestedBrl: 0,
    totalRealizedBreakageProfitBrl: 0,
    totalFloatingUnusedValueBrl: 0,
    totalDowngradeSpreadProfitBrl: 0,
  });

  const [isSubscribersModalOpen, setIsSubscribersModalOpen] = useState(false);
  const [subLifecycleFilter, setSubLifecycleFilter] = useState<
    | "all"
    | "active"
    | "renewed"
    | "reactivated"
    | "expiring_soon"
    | "overdue"
    | "cancelled"
  >("all");
  const [subPaymentFilter, setSubPaymentFilter] = useState<
    "all" | "PIX" | "CREDIT_CARD"
  >("all");
  const [subscriberSearch, setSubscriberSearch] = useState("");

  // Subgrupo 3: Contratos Fixos
  const [contractGmv, setContractGmv] = useState(0);
  const [contractTakeRate, setContractTakeRate] = useState(0);
  const [contractBookingsCount, setContractBookingsCount] = useState(0);
  const [contractHoursCount, setContractHoursCount] = useState(0);

  // Séries e Tabelas Analíticas
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [specialtyData, setSpecialtyData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [topRooms, setTopRooms] = useState<any[]>([]);
  const [ledgerEntries, setLedgerEntries] = useState<LedgerEntry[]>([]);

  const [baseRoomsForCapacity, setBaseRoomsForCapacity] = useState<any[]>([]);
  const [futureResolvedEntries, setFutureResolvedEntries] = useState<
    LedgerEntry[]
  >([]);

  // Controles do Modal de Extrato Bancário (Ledger)
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [ledgerOriginFilter, setLedgerOriginFilter] = useState<
    "all" | "avulso" | "package" | "contract"
  >("all");
  const [ledgerClinicFilter, setLedgerClinicFilter] = useState<string>("all");
  const [ledgerSearch, setLedgerSearch] = useState("");

  useEffect(() => {
    async function fetchRealBI() {
      setIsRefreshing(true);
      try {
        await fetch("/api/subscriptions/sync-prices", { method: "POST" }).catch(
          () => {},
        );

        const now = new Date();
        let startDateObj = startOfDay(subDays(now, 30));
        let endDateObj = endOfDay(now);

        if (timeFilter === "7d") {
          startDateObj = startOfDay(subDays(now, 7));
          endDateObj = endOfDay(now);
        } else if (timeFilter === "30d") {
          startDateObj = startOfDay(subDays(now, 30));
          endDateObj = endOfDay(now);
        } else if (timeFilter === "ytd") {
          startDateObj = startOfYear(now);
          endDateObj = endOfDay(now);
        } else if (timeFilter === "custom") {
          const parsedStart = customStartDate
            ? parseISO(customStartDate)
            : subDays(now, 30);
          const parsedEnd = customEndDate ? parseISO(customEndDate) : now;
          startDateObj = startOfDay(
            isNaN(parsedStart.getTime()) ? subDays(now, 30) : parsedStart,
          );
          endDateObj = endOfDay(isNaN(parsedEnd.getTime()) ? now : parsedEnd);
          if (endDateObj < startDateObj) {
            endDateObj = endOfDay(startDateObj);
          }
        }

        const maxFutureEndObj = endOfDay(addDays(now, 30));
        const daysCount = Math.max(
          1,
          differenceInDays(endDateObj, startDateObj) + 1,
        );

        const [
          bookingsByStartRes,
          bookingsByCreatedRes,
          roomsRes,
          packagesRes,
          categoriesRes,
          contractsRes,
          allWalletRes,
          allSubsRes,
        ] = await Promise.all([
          supabase
            .from("bookings")
            .select(
              "id, created_at, start_time, end_time, total_cost, upgrade_fee_amount, room_id, user_id, status, contract_id, booking_origin, agreed_value_brl",
            )
            .gte("start_time", startDateObj.toISOString())
            .lte("start_time", maxFutureEndObj.toISOString())
            .in("status", ["confirmed", "completed", "pending_payment"]),
          supabase
            .from("bookings")
            .select(
              "id, created_at, start_time, end_time, total_cost, upgrade_fee_amount, room_id, user_id, status, contract_id, booking_origin, agreed_value_brl",
            )
            .gte("created_at", startDateObj.toISOString())
            .lte("created_at", endDateObj.toISOString())
            .in("status", ["confirmed", "completed", "pending_payment"]),
          supabase
            .from("rooms")
            .select(
              "id, name, host_id, is_active, tier, category_id, modalities, address_details, availability, blocked_dates",
            ),
          supabase.from("packages").select("id, tier, hours, price, active"),
          supabase
            .from("room_categories")
            .select("id, name, credit_cost_per_hour, upgrade_fee_per_hour"),
          supabase.from("room_contracts").select("*"),
          supabase
            .from("wallet_transactions")
            .select(
              "id, user_id, amount, type, description, tier, created_at, expires_at",
            )
            .order("created_at", { ascending: true }),
          supabase
            .from("subscriptions")
            .select("id, user_id, tier, hours, status, created_at"),
        ]);

        if (bookingsByStartRes.error) throw bookingsByStartRes.error;
        if (roomsRes.error) throw roomsRes.error;

        const unifiedBookingsMap = new Map<string, any>();
        (bookingsByStartRes.data || []).forEach((b: any) =>
          unifiedBookingsMap.set(b.id, b),
        );
        (bookingsByCreatedRes.data || []).forEach((b: any) =>
          unifiedBookingsMap.set(b.id, b),
        );
        const allFetchedBookings = Array.from(unifiedBookingsMap.values());

        const roomsData = roomsRes.data || [];
        const contractsData = contractsRes.data || [];
        const allPackagesData = packagesRes.data || [];
        const allWalletData = allWalletRes.data || [];
        const allSubsData = allSubsRes.data || [];

        const bookingIds = allFetchedBookings
          .map((b: any) => b.id)
          .filter(Boolean);

        const userIds = [
          ...new Set(
            [
              ...allFetchedBookings.map((b: any) => b.user_id),
              ...allWalletData.map((w: any) => w.user_id),
              ...allSubsData.map((s: any) => s.user_id),
            ].filter(Boolean),
          ),
        ];
        const contractSpecialistIds = [
          ...new Set(
            contractsData.map((c: any) => c.specialist_id).filter(Boolean),
          ),
        ];
        const hostIds = [
          ...new Set(roomsData.map((r: any) => r.host_id).filter(Boolean)),
        ];
        const allProfileIds = [
          ...new Set([...userIds, ...contractSpecialistIds, ...hostIds]),
        ];

        const [profilesRes, couponsRes] = await Promise.all([
          allProfileIds.length > 0
            ? supabase
                .from("profiles")
                .select(
                  "id, full_name, email, phone, whatsapp, cc_last4, cc_brand, specialty",
                )
                .in("id", allProfileIds)
            : Promise.resolve({ data: [] as any[], error: null }),
          bookingIds.length > 0
            ? supabase
                .from("coupon_uses")
                .select("booking_id, discount_applied")
                .in("booking_id", bookingIds)
            : Promise.resolve({ data: [] as any[], error: null }),
        ]);

        if (profilesRes.error) throw profilesRes.error;
        const profilesData = profilesRes.data || [];

        const subscriberProfilesMap = new Map<string, SubscriberProfileInfo>();
        profilesData.forEach((u: any) => {
          subscriberProfilesMap.set(u.id, {
            full_name: u.full_name,
            email: u.email,
            phone: u.phone,
            whatsapp: u.whatsapp,
            cc_last4: u.cc_last4,
            cc_brand: u.cc_brand,
          });
        });

        const profilesMap = new Map<string, any>(
          profilesData.map((p: any) => [p.id, p]),
        );

        const roomsMap = new Map<string, any>(
          roomsData.map((r: any) => [r.id, r]),
        );
        const contractsById = new Map<string, any>(
          contractsData.map((c: any) => [c.id, c]),
        );
        const activeContractsByRoom = new Map<string, any[]>();
        const activeCohostByRoomId = new Map<string, any>();

        contractsData.forEach((c: any) => {
          if (c.status === "active") {
            const list = activeContractsByRoom.get(c.room_id) || [];
            list.push(c);
            activeContractsByRoom.set(c.room_id, list);

            if (c.contract_type === "monthly_exclusive" && c.allow_sublease) {
              activeCohostByRoomId.set(c.room_id, c);
            }
          }
        });

        const packageRateMap: Record<
          "start" | "vip" | "master",
          Map<number, number>
        > = {
          start: new Map<number, number>(),
          vip: new Map<number, number>(),
          master: new Map<number, number>(),
        };

        allPackagesData.forEach((pkg: any) => {
          const t = normalizeTier(pkg.tier);
          const h = Math.max(1, Number(pkg.hours) || 1);
          const rawPrice = Number(pkg.price) || 0;
          if (rawPrice <= 0) return;

          const hourlyRate = h > 1 && rawPrice > 120 ? rawPrice / h : rawPrice;
          packageRateMap[t].set(h, hourlyRate);
        });

        const couponDiscountMap = new Map<string, number>();
        (couponsRes.data || []).forEach((cu: any) => {
          if (cu.booking_id) {
            couponDiscountMap.set(
              cu.booking_id,
              (couponDiscountMap.get(cu.booking_id) || 0) +
                Number(cu.discount_applied || 0),
            );
          }
        });

        const userWalletMap = new Map<string, any[]>();
        allWalletData.forEach((tx: any) => {
          const list = userWalletMap.get(tx.user_id) || [];
          list.push(tx);
          userWalletMap.set(tx.user_id, list);
        });

        const userSubsMap = new Map<string, any[]>();
        allSubsData.forEach((sub: any) => {
          const list = userSubsMap.get(sub.user_id) || [];
          list.push(sub);
          userSubsMap.set(sub.user_id, list);
        });

        const getRateFromPackageTable = (
          tier: "start" | "vip" | "master",
          targetHours?: number | null,
        ): { rate: number | null; matchedHours: number | null } => {
          const tierPackages = packageRateMap[tier];
          if (!tierPackages || tierPackages.size === 0) {
            return { rate: null, matchedHours: null };
          }

          if (targetHours && tierPackages.has(targetHours)) {
            return {
              rate: tierPackages.get(targetHours)!,
              matchedHours: targetHours,
            };
          }

          if (targetHours && targetHours > 0) {
            let closestHours: number | null = null;
            let minDiff = Infinity;
            for (const [h] of tierPackages.entries()) {
              const diff = Math.abs(h - targetHours);
              if (diff < minDiff) {
                minDiff = diff;
                closestHours = h;
              }
            }
            if (closestHours !== null && minDiff <= 4) {
              return {
                rate: tierPackages.get(closestHours)!,
                matchedHours: closestHours,
              };
            }
          }

          if (tierPackages.has(1)) {
            return { rate: tierPackages.get(1)!, matchedHours: 1 };
          }
          const sortedHours = Array.from(tierPackages.keys()).sort(
            (a, b) => a - b,
          );
          const firstH = sortedHours[0];
          return { rate: tierPackages.get(firstH)!, matchedHours: firstH };
        };

        const resolveRoomPotentialHourlyRate = (room: any): number => {
          const roomTier = normalizeTier(room?.tier);
          const pkgDefault = getRateFromPackageTable(roomTier, 8).rate;
          if (pkgDefault && pkgDefault > 0) return pkgDefault;

          const modalityRate = extractRoomModalitiesHourlyRate(
            room?.modalities,
            room?.address_details,
          );
          if (modalityRate && modalityRate > 0) return modalityRate;

          const defaultTierRates: Record<"start" | "vip" | "master", number> = {
            start: 33.38,
            vip: 41.13,
            master: 60,
          };
          return defaultTierRates[roomTier];
        };

        const downgradeStatsByUser = new Map<
          string,
          { count: number; spreadProfitBrl: number }
        >();

        const resolveBookingLedgerEntry = (b: any): LedgerEntry => {
          const room = roomsMap.get(b.room_id);
          const roomTier = normalizeTier(room?.tier);
          const hostProfile = room?.host_id
            ? profilesMap.get(room.host_id)
            : null;
          const clinicName = hostProfile?.full_name || "Fusion Clinic";
          const doctorProfile = profilesMap.get(b.user_id);
          const specialistName =
            doctorProfile?.full_name || "Profissional Cadastrado";
          const specialty = doctorProfile?.specialty || "Clínico / Saúde";

          const slotUnits =
            b.start_time && b.end_time
              ? calculateSlotUnits(b.start_time, b.end_time)
              : 1;

          const linkedContract = b.contract_id
            ? contractsById.get(b.contract_id)
            : null;
          const isContractBooking = Boolean(
            b.contract_id ||
            (b.booking_origin &&
              String(b.booking_origin).startsWith("contract")),
          );

          if (isContractBooking) {
            const feePct = Number(linkedContract?.platform_fee_pct ?? 15);
            const cType =
              linkedContract?.contract_type || b.booking_origin || "";
            let modalityLabel = "Contrato • Alocação Fixa";
            if (cType.includes("monthly_exclusive"))
              modalityLabel = "Contrato • Sala Exclusiva";
            else if (cType.includes("fixed_shift"))
              modalityLabel = "Contrato • Turno Fixo";
            else if (cType.includes("fixed_daily"))
              modalityLabel = "Contrato • Diária Fixa";

            return {
              id: b.id,
              booking_id: b.id,
              transaction_date: b.start_time || b.created_at,
              created_at: b.created_at || b.start_time,
              start_time: b.start_time,
              end_time: b.end_time,
              status: b.status,
              subgroup: "contract",
              room_id: b.room_id,
              room_name: room?.name || "Sala Removida",
              room_tier: roomTier,
              credit_tier: roomTier,
              is_downgrade: false,
              downgrade_spread_brl: 0,
              standard_fusion_fee_brl: 0,
              clinic_id: room?.host_id || "fusion",
              clinic_name: clinicName,
              user_id: b.user_id,
              specialist_name:
                linkedContract?.specialist_name || specialistName,
              specialty,
              is_contract: true,
              is_package: false,
              modality_label: modalityLabel,
              duration_hours: slotUnits,
              gross_brl: 0,
              room_base_brl: 0,
              fusion_fee_brl: 0,
              fusion_fee_pct: feePct,
              cohost_name: null,
              cohost_payout_brl: 0,
              host_payout_brl: 0,
            };
          }

          const roomCohost = activeCohostByRoomId.get(b.room_id);
          const cohostName = roomCohost?.specialist_name || null;
          const cohostSplitPct = roomCohost
            ? Number(roomCohost.cohost_split_pct || 0)
            : 0;

          const rawTotalCost = Number(b.total_cost || 0);
          const upgradeFee = Number(b.upgrade_fee_amount || 0);
          const discount = couponDiscountMap.get(b.id) || 0;

          const isExplicitWalletOrigin =
            b.booking_origin && String(b.booking_origin).startsWith("wallet_");
          const isLegacyWalletOrigin =
            !b.booking_origin &&
            Number(b.agreed_value_brl || 0) === 0 &&
            rawTotalCost > 0 &&
            rawTotalCost <= slotUnits * 2;

          const isPackageBooking = Boolean(
            isExplicitWalletOrigin || isLegacyWalletOrigin,
          );

          if (isPackageBooking) {
            const userTxs = userWalletMap.get(b.user_id) || [];
            const userSubs = userSubsMap.get(b.user_id) || [];
            const activeSub =
              userSubs.find((s: any) => s.status === "ACTIVE") || userSubs[0];

            let creditTierUsed: "start" | "vip" | "master" =
              isExplicitWalletOrigin
                ? normalizeTier(String(b.booking_origin).replace("wallet_", ""))
                : activeSub
                  ? normalizeTier(activeSub.tier)
                  : roomTier;

            const bookingTime = b.created_at
              ? new Date(b.created_at).getTime()
              : new Date(b.start_time).getTime();

            if (!isExplicitWalletOrigin) {
              const matchingDebit = userTxs.find((tx: any) => {
                if (Number(tx.amount) >= 0) return false;
                const txTime = new Date(tx.created_at).getTime();
                return Math.abs(txTime - bookingTime) <= 10 * 60 * 1000;
              });
              if (matchingDebit?.tier) {
                creditTierUsed = normalizeTier(matchingDebit.tier);
              }
            }

            const detectedPackageHours = Number(activeSub?.hours) || 16;

            const { hourlyRateBrl: exactUserCreditRate, matchedHours } =
              resolveCreditHourlyValueBRL({
                usedTier: creditTierUsed,
                userTransactions: userTxs,
                userSubscriptions: userSubs,
                packages: allPackagesData,
                bookingTimestampMs: bookingTime,
              });

            const creditHourlyRate =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl) / slotUnits
                : exactUserCreditRate;

            const arbitrage = calculatePackageBookingArbitrage({
              creditTierRaw: creditTierUsed,
              roomTierRaw: roomTier,
              creditsUsed: slotUnits,
              creditHourlyRateBrl: creditHourlyRate,
              matchedPackageHours: matchedHours || detectedPackageHours,
              packages: allPackagesData,
              cohostSplitPct: roomCohost ? cohostSplitPct : null,
            });

            const rev = Math.max(
              0,
              arbitrage.grossCreditValueBrl + upgradeFee - discount,
            );

            const modalityLabel = arbitrage.isDowngrade
              ? `Pacote ${formatTierLabel(creditTierUsed)} → Sala ${formatTierLabel(roomTier)}`
              : `Pacote ${formatTierLabel(creditTierUsed)} (${matchedHours || detectedPackageHours}h)`;

            const effectivePct =
              rev > 0
                ? Math.round((arbitrage.totalPlatformProfitBrl / rev) * 100)
                : 20;

            return {
              id: b.id,
              booking_id: b.id,
              transaction_date: b.created_at || b.start_time,
              created_at: b.created_at || b.start_time,
              start_time: b.start_time,
              end_time: b.end_time,
              status: b.status,
              subgroup: "package",
              room_id: b.room_id,
              room_name: room?.name || "Sala Removida",
              room_tier: roomTier,
              credit_tier: creditTierUsed,
              is_downgrade: arbitrage.isDowngrade,
              downgrade_spread_brl: arbitrage.downgradeSpreadProfitBrl,
              standard_fusion_fee_brl: arbitrage.standardPlatformFeeBrl,
              clinic_id: room?.host_id || "fusion",
              clinic_name: clinicName,
              user_id: b.user_id,
              specialist_name: specialistName,
              specialty,
              is_contract: false,
              is_package: true,
              modality_label: modalityLabel,
              duration_hours: slotUnits,
              gross_brl: rev,
              room_base_brl: arbitrage.roomBaseValueBrl,
              fusion_fee_brl: arbitrage.totalPlatformProfitBrl,
              fusion_fee_pct: effectivePct,
              cohost_name: cohostName,
              cohost_payout_brl: arbitrage.cohostPayoutBrl,
              host_payout_brl: arbitrage.hostPayoutBrl,
            };
          }

          const computeAvulsoSplit = (grossVal: number) => {
            const fusionFee = grossVal * 0.2;
            const netAfterFusion = Math.max(0, grossVal - fusionFee);
            const cohostPayout =
              cohostSplitPct > 0 ? netAfterFusion * (cohostSplitPct / 100) : 0;
            const hostPayout = Math.max(0, netAfterFusion - cohostPayout);
            return { fusionFee, cohostPayout, hostPayout };
          };

          const baseAvulsoVal =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : rawTotalCost >= slotUnits * 20
                ? rawTotalCost
                : (roomTier === "master" ? 80 : roomTier === "vip" ? 45 : 40) *
                  slotUnits;

          const finalAvulsoBrl = Math.max(
            0,
            baseAvulsoVal + upgradeFee - discount,
          );
          const avulsoSplit = computeAvulsoSplit(finalAvulsoBrl);

          return {
            id: b.id,
            booking_id: b.id,
            transaction_date: b.created_at || b.start_time,
            created_at: b.created_at || b.start_time,
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            subgroup: "avulso",
            room_id: b.room_id,
            room_name: room?.name || "Sala Removida",
            room_tier: roomTier,
            credit_tier: roomTier,
            is_downgrade: false,
            downgrade_spread_brl: 0,
            standard_fusion_fee_brl: avulsoSplit.fusionFee,
            clinic_id: room?.host_id || "fusion",
            clinic_name: clinicName,
            user_id: b.user_id,
            specialist_name: specialistName,
            specialty,
            is_contract: false,
            is_package: false,
            modality_label: `Hora Avulsa • Sala ${formatTierLabel(roomTier)}`,
            duration_hours: slotUnits,
            gross_brl: finalAvulsoBrl,
            room_base_brl: finalAvulsoBrl,
            fusion_fee_brl: avulsoSplit.fusionFee,
            fusion_fee_pct: 20,
            cohost_name: cohostName,
            cohost_payout_brl: avulsoSplit.cohostPayout,
            host_payout_brl: avulsoSplit.hostPayout,
          };
        };

        const startMs = startDateObj.getTime();
        const endMs = endDateObj.getTime();
        const tomorrowStartMs = startOfDay(addDays(now, 1)).getTime();

        const allResolvedEntries = allFetchedBookings.map(
          resolveBookingLedgerEntry,
        );

        const periodEntries = allResolvedEntries.filter((entry) => {
          const startTimeMs = new Date(entry.start_time).getTime();
          const createdTimeMs = new Date(entry.created_at).getTime();

          if (entry.is_contract) {
            return startTimeMs >= startMs && startTimeMs <= endMs;
          }
          return (
            (createdTimeMs >= startMs && createdTimeMs <= endMs) ||
            (startTimeMs >= startMs && startTimeMs <= endMs)
          );
        });

        const futureEntries = allResolvedEntries.filter((entry) => {
          const startTimeMs = new Date(entry.start_time).getTime();
          return startTimeMs >= tomorrowStartMs;
        });

        let totalGmv = 0;
        let totalTakeRate = 0;
        let totalHostNet = 0;

        let sumAvulsoGmv = 0;
        let sumAvulsoTake = 0;
        let countAvulsoBookings = 0;
        let sumAvulsoHours = 0;

        let sumPkgGmv = 0;
        let sumPkgStandardFee = 0;
        let sumPkgDowngradeSpread = 0;
        let sumPkgTotalTake = 0;
        let sumPkgHostPayout = 0;
        let countPkgBookings = 0;
        let sumPkgHours = 0;
        let countPkgDowngrades = 0;
        const pkgTierAcc = {
          start: { count: 0, hours: 0, gmv: 0 },
          vip: { count: 0, hours: 0, gmv: 0 },
          master: { count: 0, hours: 0, gmv: 0 },
        };

        let sumContractGmv = 0;
        let sumContractTake = 0;
        let countContractBookings = 0;
        let sumContractHours = 0;

        const doctorBookingCounts = new Map<string, number>();
        const revMap: Record<string, any> = {};
        const specMap: Record<string, { count: number; revenue: number }> = {};

        const heatMapMatrix = [
          { day: "Dom", shifts: [0, 0, 0, 0] },
          { day: "Seg", shifts: [0, 0, 0, 0] },
          { day: "Ter", shifts: [0, 0, 0, 0] },
          { day: "Qua", shifts: [0, 0, 0, 0] },
          { day: "Qui", shifts: [0, 0, 0, 0] },
          { day: "Sex", shifts: [0, 0, 0, 0] },
          { day: "Sáb", shifts: [0, 0, 0, 0] },
        ];

        const roomStats: Record<string, any> = {};
        roomsData.forEach((r: any) => {
          const roomContracts = activeContractsByRoom.get(r.id) || [];
          const hasExclusiveContract = roomContracts.some(
            (c: any) => c.contract_type === "monthly_exclusive",
          );
          const cohostContract = roomContracts.find(
            (c: any) =>
              c.contract_type === "monthly_exclusive" && c.allow_sublease,
          );
          const hostProfile = profilesMap.get(r.host_id);
          const hourlyRate = resolveRoomPotentialHourlyRate(r);
          const pastAvailHours = computeRoomAvailableHoursInInterval(
            r,
            startDateObj,
            endDateObj,
          );

          roomStats[r.id] = {
            id: r.id,
            rawRoom: r,
            name: r.name,
            is_active: Boolean(r.is_active),
            tier: normalizeTier(r.tier),
            hourlyRate,
            host_id: r.host_id,
            host_name: hostProfile?.full_name || "Fusion Clinic",
            revenue: 0,
            avulsoRevenue: 0,
            packageRevenue: 0,
            contractRevenue: 0,
            platformFee: 0,
            hostNet: 0,
            bookings: 0,
            occupiedHours: 0,
            avulsoHours: 0,
            packageHours: 0,
            contractHours: 0,
            pastAvailHours,
            hasContracts: roomContracts.length > 0,
            hasExclusiveContract,
            cohostName: cohostContract?.specialist_name || null,
          };
        });

        const useMonthlyGrouping =
          timeFilter === "ytd" || (timeFilter === "custom" && daysCount > 62);

        periodEntries.forEach((entry) => {
          if (entry.user_id) {
            doctorBookingCounts.set(
              entry.user_id,
              (doctorBookingCounts.get(entry.user_id) || 0) + 1,
            );
          }

          const startDateBookingObj = parseISO(entry.start_time);
          const endDateObjBooking = entry.end_time
            ? parseISO(entry.end_time)
            : null;

          const dayOfWeek = getDay(startDateBookingObj);
          const startH = getHours(startDateBookingObj);
          const endH =
            endDateObjBooking && getHours(endDateObjBooking) > startH
              ? getHours(endDateObjBooking)
              : startH + 1;

          const shiftRanges = [
            { idx: 0, start: 8, end: 12 },
            { idx: 1, start: 12, end: 16 },
            { idx: 2, start: 16, end: 20 },
            { idx: 3, start: 20, end: 24 },
          ];

          shiftRanges.forEach((sr) => {
            if (startH < sr.end && endH > sr.start) {
              heatMapMatrix[dayOfWeek].shifts[sr.idx] += 1;
            }
          });

          if (entry.subgroup === "contract") {
            sumContractHours += entry.duration_hours;

            if (!specMap[entry.specialty]) {
              specMap[entry.specialty] = { count: 0, revenue: 0 };
            }
            specMap[entry.specialty].count += 1;

            if (roomStats[entry.room_id]) {
              roomStats[entry.room_id].bookings += 1;
              roomStats[entry.room_id].occupiedHours += entry.duration_hours;
              roomStats[entry.room_id].contractHours += entry.duration_hours;
            }
            return;
          }

          totalGmv += entry.gross_brl;
          totalTakeRate += entry.fusion_fee_brl;
          totalHostNet += entry.host_payout_brl + entry.cohost_payout_brl;

          const refDateObj = parseISO(entry.transaction_date);
          const dateKey = useMonthlyGrouping
            ? format(refDateObj, "MMM/yy", { locale: ptBR })
            : format(refDateObj, "dd/MM", { locale: ptBR });

          if (!revMap[dateKey]) {
            revMap[dateKey] = {
              name: dateKey,
              totalGmv: 0,
              platformFee: 0,
              avulsoGmv: 0,
              avulsoFee: 0,
              packageGmv: 0,
              packageFee: 0,
              contractGmv: 0,
              contractFee: 0,
              order: startOfDay(refDateObj).getTime(),
            };
          }

          revMap[dateKey].totalGmv += entry.gross_brl;
          revMap[dateKey].platformFee += entry.fusion_fee_brl;

          if (entry.subgroup === "package") {
            sumPkgGmv += entry.gross_brl;
            sumPkgStandardFee += entry.standard_fusion_fee_brl;
            sumPkgDowngradeSpread += entry.downgrade_spread_brl;
            sumPkgTotalTake += entry.fusion_fee_brl;
            sumPkgHostPayout += entry.host_payout_brl + entry.cohost_payout_brl;
            countPkgBookings += 1;
            sumPkgHours += entry.duration_hours;

            if (entry.is_downgrade) {
              countPkgDowngrades += 1;
              const cur = downgradeStatsByUser.get(entry.user_id) || {
                count: 0,
                spreadProfitBrl: 0,
              };
              downgradeStatsByUser.set(entry.user_id, {
                count: cur.count + 1,
                spreadProfitBrl:
                  cur.spreadProfitBrl + entry.downgrade_spread_brl,
              });
            }

            pkgTierAcc[entry.credit_tier].count += 1;
            pkgTierAcc[entry.credit_tier].hours += entry.duration_hours;
            pkgTierAcc[entry.credit_tier].gmv += entry.gross_brl;

            revMap[dateKey].packageGmv += entry.gross_brl;
            revMap[dateKey].packageFee += entry.fusion_fee_brl;

            if (roomStats[entry.room_id]) {
              roomStats[entry.room_id].revenue += entry.gross_brl;
              roomStats[entry.room_id].packageRevenue += entry.gross_brl;
              roomStats[entry.room_id].platformFee += entry.fusion_fee_brl;
              roomStats[entry.room_id].hostNet +=
                entry.host_payout_brl + entry.cohost_payout_brl;
              roomStats[entry.room_id].bookings += 1;
              roomStats[entry.room_id].occupiedHours += entry.duration_hours;
              roomStats[entry.room_id].packageHours += entry.duration_hours;
            }
          } else {
            sumAvulsoGmv += entry.gross_brl;
            sumAvulsoTake += entry.fusion_fee_brl;
            countAvulsoBookings += 1;
            sumAvulsoHours += entry.duration_hours;

            revMap[dateKey].avulsoGmv += entry.gross_brl;
            revMap[dateKey].avulsoFee += entry.fusion_fee_brl;

            if (roomStats[entry.room_id]) {
              roomStats[entry.room_id].revenue += entry.gross_brl;
              roomStats[entry.room_id].avulsoRevenue += entry.gross_brl;
              roomStats[entry.room_id].platformFee += entry.fusion_fee_brl;
              roomStats[entry.room_id].hostNet +=
                entry.host_payout_brl + entry.cohost_payout_brl;
              roomStats[entry.room_id].bookings += 1;
              roomStats[entry.room_id].occupiedHours += entry.duration_hours;
              roomStats[entry.room_id].avulsoHours += entry.duration_hours;
            }
          }

          if (!specMap[entry.specialty]) {
            specMap[entry.specialty] = { count: 0, revenue: 0 };
          }
          specMap[entry.specialty].count += 1;
          specMap[entry.specialty].revenue += entry.gross_brl;
        });

        const contractBaixaLedgerEntries: LedgerEntry[] = [];

        contractsData.forEach((c: any) => {
          const room = roomsMap.get(c.room_id);
          const roomTier = normalizeTier(room?.tier);
          const hostProfile = room?.host_id
            ? profilesMap.get(room.host_id)
            : null;
          const clinicName = hostProfile?.full_name || "Fusion Clinic";
          const docProfile = c.specialist_id
            ? profilesMap.get(c.specialist_id)
            : null;
          const specialty = docProfile?.specialty || "Clínico / Saúde";

          const cType = String(c.contract_type || "");
          let modalityLabel = "Contrato • Alocação Fixa";
          if (cType.includes("monthly_exclusive"))
            modalityLabel = "Contrato • Sala Exclusiva";
          else if (cType.includes("fixed_shift"))
            modalityLabel = "Contrato • Turno Fixo";
          else if (cType.includes("fixed_daily"))
            modalityLabel = "Contrato • Diária Fixa";

          const roomContractHoursInPeriod =
            roomStats[c.room_id]?.contractHours || 0;

          const baixaEvents = extractContractBaixaEvents(c);

          baixaEvents.forEach((ev) => {
            const paidDateObj = parseISO(ev.paidDateIso);
            const paidMs = paidDateObj.getTime();

            if (paidMs >= startMs && paidMs <= endMs) {
              totalGmv += ev.grossBrl;
              totalTakeRate += ev.fusionFeeBrl;
              totalHostNet += ev.hostPayoutBrl;

              sumContractGmv += ev.grossBrl;
              sumContractTake += ev.fusionFeeBrl;
              countContractBookings += 1;

              const dateKey = useMonthlyGrouping
                ? format(paidDateObj, "MMM/yy", { locale: ptBR })
                : format(paidDateObj, "dd/MM", { locale: ptBR });

              if (!revMap[dateKey]) {
                revMap[dateKey] = {
                  name: dateKey,
                  totalGmv: 0,
                  platformFee: 0,
                  avulsoGmv: 0,
                  avulsoFee: 0,
                  packageGmv: 0,
                  packageFee: 0,
                  contractGmv: 0,
                  contractFee: 0,
                  order: startOfDay(paidDateObj).getTime(),
                };
              }

              revMap[dateKey].totalGmv += ev.grossBrl;
              revMap[dateKey].platformFee += ev.fusionFeeBrl;
              revMap[dateKey].contractGmv += ev.grossBrl;
              revMap[dateKey].contractFee += ev.fusionFeeBrl;

              if (!specMap[specialty]) {
                specMap[specialty] = { count: 1, revenue: 0 };
              }
              specMap[specialty].revenue += ev.grossBrl;

              if (roomStats[c.room_id]) {
                roomStats[c.room_id].revenue += ev.grossBrl;
                roomStats[c.room_id].contractRevenue += ev.grossBrl;
                roomStats[c.room_id].platformFee += ev.fusionFeeBrl;
                roomStats[c.room_id].hostNet += ev.hostPayoutBrl;
              }

              contractBaixaLedgerEntries.push({
                id: `baixa_${c.id}_${ev.competence}`,
                booking_id: c.id,
                transaction_date: ev.paidDateIso,
                created_at: ev.paidDateIso,
                start_time: ev.paidDateIso,
                end_time: ev.paidDateIso,
                status: "completed",
                subgroup: "contract",
                room_id: c.room_id,
                room_name: room?.name || "Sala",
                room_tier: roomTier,
                credit_tier: roomTier,
                is_downgrade: false,
                downgrade_spread_brl: 0,
                standard_fusion_fee_brl: ev.fusionFeeBrl,
                clinic_id: room?.host_id || "fusion",
                clinic_name: clinicName,
                user_id: c.specialist_id || "",
                specialist_name: c.specialist_name || "Locatário Contrato",
                specialty,
                is_contract: true,
                is_package: false,
                modality_label: `${modalityLabel} (Baixa ${ev.competence})`,
                duration_hours: roomContractHoursInPeriod,
                gross_brl: ev.grossBrl,
                room_base_brl: ev.grossBrl,
                fusion_fee_brl: ev.fusionFeeBrl,
                fusion_fee_pct: ev.fusionFeePct,
                cohost_name: null,
                cohost_payout_brl: 0,
                host_payout_brl: ev.hostPayoutBrl,
              });
            }
          });
        });

        const breakageReport = computeSubscribersBreakageReport({
          allWalletTransactions: allWalletData,
          allSubscriptions: allSubsData,
          allPackages: allPackagesData,
          profilesMap: subscriberProfilesMap,
          downgradeStatsByUser,
        });

        setSubscribersReport(breakageReport.subscribers);
        setBreakageTotals(breakageReport.totals);

        const activeContractsList = contractsData.filter(
          (c: any) => c.status === "active",
        );

        let recurringDocs = 0;
        doctorBookingCounts.forEach((cnt) => {
          if (cnt >= 2) recurringDocs += 1;
        });

        const nonContractLedgerEntries = periodEntries.filter(
          (e) => !e.is_contract,
        );
        setLedgerEntries([
          ...nonContractLedgerEntries,
          ...contractBaixaLedgerEntries,
        ]);
        setFutureResolvedEntries(futureEntries);

        setGmv(totalGmv);
        setTakeRate(totalTakeRate);
        setHostPayoutTotal(totalHostNet);

        setAvulsoGmv(sumAvulsoGmv);
        setAvulsoTakeRate(sumAvulsoTake);
        setAvulsoBookingsCount(countAvulsoBookings);
        setAvulsoHoursCount(sumAvulsoHours);

        setPackageGmv(sumPkgGmv);
        setPackageStandardFee(sumPkgStandardFee);
        setPackageDowngradeSpread(sumPkgDowngradeSpread);
        setPackageTotalTakeRate(sumPkgTotalTake);
        setPackageHostPayout(sumPkgHostPayout);
        setPackageBookingsCount(countPkgBookings);
        setPackageHoursCount(sumPkgHours);
        setPackageDowngradeCount(countPkgDowngrades);
        setPackageByTierStats(pkgTierAcc);

        setContractGmv(sumContractGmv);
        setContractTakeRate(sumContractTake);
        setContractBookingsCount(countContractBookings);
        setContractHoursCount(sumContractHours);

        setActiveDoctors(doctorBookingCounts.size);
        setRecurringDoctorsCount(recurringDocs);
        setActiveRooms(roomsData.filter((r: any) => r.is_active).length || 0);
        setActiveContractsCount(activeContractsList.length);

        const sortedRevData = Object.values(revMap).sort(
          (a: any, b: any) => a.order - b.order,
        );
        setRevenueData(sortedRevData);

        const totalSpecBookings = Object.values(specMap).reduce(
          (a, b) => a + b.count,
          0,
        );
        const formattedSpecData = Object.entries(specMap)
          .map(([key, val], index) => ({
            name: key,
            count: val.count,
            revenue: val.revenue,
            value:
              totalSpecBookings > 0
                ? Math.round((val.count / totalSpecBookings) * 100)
                : 0,
            color: PIE_COLORS[index % PIE_COLORS.length],
          }))
          .sort((a, b) => b.revenue - a.revenue);
        setSpecialtyData(formattedSpecData);

        const orderedHeatmap = [
          heatMapMatrix[1],
          heatMapMatrix[2],
          heatMapMatrix[3],
          heatMapMatrix[4],
          heatMapMatrix[5],
          heatMapMatrix[6],
          heatMapMatrix[0],
        ];
        setHeatmapData(orderedHeatmap);

        const activeRoomsList = Object.values(roomStats).filter(
          (r: any) => r.is_active || r.bookings > 0 || r.hasContracts,
        );
        setBaseRoomsForCapacity(activeRoomsList);

        const formattedTopRooms = activeRoomsList
          .filter((r: any) => r.bookings > 0 || r.hasContracts)
          .map((r: any) => {
            const pastAvail = Math.max(1, r.pastAvailHours);
            const rawOcc = Math.round((r.occupiedHours / pastAvail) * 100);
            const occ = r.hasExclusiveContract
              ? Math.max(rawOcc, 85)
              : Math.min(rawOcc, 100);

            return {
              ...r,
              host: r.host_name,
              occupancy: Math.min(100, occ),
            };
          })
          .sort((a: any, b: any) => b.revenue - a.revenue)
          .slice(0, 10);

        setTopRooms(formattedTopRooms);

        if (activeRoomsList.length > 0) {
          const totalCapHours = activeRoomsList.reduce(
            (acc: number, curr: any) =>
              acc + Math.max(curr.pastAvailHours, curr.occupiedHours),
            0,
          );
          const totalUsedHours = activeRoomsList.reduce(
            (acc: number, curr: any) => acc + curr.occupiedHours,
            0,
          );
          setAvgOccupancyRate(
            totalCapHours > 0
              ? Math.min(
                  100,
                  Math.round((totalUsedHours / totalCapHours) * 100),
                )
              : 0,
          );
        } else {
          setAvgOccupancyRate(0);
        }
      } catch (err: any) {
        console.error("Erro ao montar BI do Admin:", err);
        toast({
          variant: "destructive",
          title: "Erro de Processamento de Dados",
          description: err?.message || "Erro ao carregar indicadores.",
        });
      } finally {
        setInitialLoading(false);
        setIsRefreshing(false);
      }
    }

    fetchRealBI();
  }, [supabase, timeFilter, customStartDate, customEndDate, toast]);

  const roomCapacityMetrics: RoomCapacityMetric[] = useMemo(() => {
    const now = new Date();
    const futureStartObj = startOfDay(addDays(now, 1));
    const futureEndObj = endOfDay(addDays(now, futureHorizonDays));
    const futureEndMs = futureEndObj.getTime();

    return baseRoomsForCapacity
      .map((r: any) => {
        const pastAvail = Math.max(r.pastAvailHours, r.occupiedHours);
        const pastFree = Math.max(0, pastAvail - r.occupiedHours);
        const pastOccPct =
          pastAvail > 0
            ? Math.min(100, Math.round((r.occupiedHours / pastAvail) * 100))
            : 0;
        const pastPotentialRev = Math.max(r.revenue, pastAvail * r.hourlyRate);
        const pastUncapturedRev = Math.max(0, pastPotentialRev - r.revenue);

        const futureAvailHours = computeRoomAvailableHoursInInterval(
          r.rawRoom,
          futureStartObj,
          futureEndObj,
        );

        const roomFutureBookings = futureResolvedEntries.filter(
          (fe) =>
            fe.room_id === r.id &&
            new Date(fe.start_time).getTime() <= futureEndMs,
        );

        let futureBookedHours = 0;
        let futureAvulsoHours = 0;
        let futurePackageHours = 0;
        let futureContractHours = 0;
        let futureLockedRevenue = 0;

        roomFutureBookings.forEach((fe) => {
          futureBookedHours += fe.duration_hours;
          futureLockedRevenue += fe.gross_brl;
          if (fe.subgroup === "contract")
            futureContractHours += fe.duration_hours;
          else if (fe.subgroup === "package")
            futurePackageHours += fe.duration_hours;
          else futureAvulsoHours += fe.duration_hours;
        });

        const futAvail = Math.max(futureAvailHours, futureBookedHours);
        const futFree = Math.max(0, futAvail - futureBookedHours);
        const futOccPct =
          futAvail > 0
            ? Math.min(100, Math.round((futureBookedHours / futAvail) * 100))
            : 0;
        const futOpenOpportunityRev = futFree * r.hourlyRate;
        const futPotentialRev = futureLockedRevenue + futOpenOpportunityRev;

        return {
          room_id: r.id,
          room_name: r.name,
          host_name: r.host_name,
          tier: r.tier,
          hourly_rate: r.hourlyRate,
          past_available_hours: pastAvail,
          past_booked_hours: r.occupiedHours,
          past_avulso_hours: r.avulsoHours,
          past_package_hours: r.packageHours,
          past_contract_hours: r.contractHours,
          past_free_hours: pastFree,
          past_occupancy_pct: pastOccPct,
          past_potential_revenue: pastPotentialRev,
          past_actual_revenue: r.revenue,
          past_uncaptured_revenue: pastUncapturedRev,
          future_available_hours: futAvail,
          future_booked_hours: futureBookedHours,
          future_avulso_hours: futureAvulsoHours,
          future_package_hours: futurePackageHours,
          future_contract_hours: futureContractHours,
          future_free_hours: futFree,
          future_occupancy_pct: futOccPct,
          future_potential_revenue: futPotentialRev,
          future_locked_revenue: futureLockedRevenue,
          future_open_opportunity_revenue: futOpenOpportunityRev,
        };
      })
      .sort((a, b) => b.past_actual_revenue - a.past_actual_revenue);
  }, [baseRoomsForCapacity, futureResolvedEntries, futureHorizonDays]);

  const handleOpenBankStatement = (
    origin: "all" | "avulso" | "package" | "contract" = "all",
  ) => {
    setLedgerOriginFilter(origin);
    setLedgerClinicFilter("all");
    setLedgerSearch("");
    setIsLedgerOpen(true);
  };

  const availableClinics = useMemo(() => {
    const map = new Map<string, string>();
    ledgerEntries.forEach((e) => {
      map.set(e.clinic_id, e.clinic_name);
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [ledgerEntries]);

  const processedLedger = useMemo(() => {
    const q = ledgerSearch.toLowerCase().trim();
    const filtered = ledgerEntries.filter((e) => {
      if (ledgerOriginFilter !== "all" && e.subgroup !== ledgerOriginFilter)
        return false;
      if (ledgerClinicFilter !== "all" && e.clinic_id !== ledgerClinicFilter)
        return false;
      if (!q) return true;
      return (
        e.specialist_name.toLowerCase().includes(q) ||
        e.room_name.toLowerCase().includes(q) ||
        e.clinic_name.toLowerCase().includes(q) ||
        e.modality_label.toLowerCase().includes(q) ||
        e.booking_id.toLowerCase().includes(q)
      );
    });

    const chronological = [...filtered].sort(
      (a, b) =>
        new Date(a.transaction_date).getTime() -
        new Date(b.transaction_date).getTime(),
    );

    let runningFusionBalance = 0;
    let runningGmv = 0;
    const withRunning = chronological.map((item) => {
      runningGmv += item.gross_brl;
      runningFusionBalance += item.fusion_fee_brl;
      return {
        ...item,
        running_gmv: runningGmv,
        running_fusion_balance: runningFusionBalance,
      };
    });

    return withRunning.reverse();
  }, [ledgerEntries, ledgerOriginFilter, ledgerClinicFilter, ledgerSearch]);

  const ledgerTotals = useMemo(() => {
    return processedLedger.reduce(
      (acc, curr) => {
        acc.gmv += curr.gross_brl;
        acc.fusionNet += curr.fusion_fee_brl;
        acc.hostPayout += curr.host_payout_brl + curr.cohost_payout_brl;
        acc.hours += curr.duration_hours;
        return acc;
      },
      { gmv: 0, fusionNet: 0, hostPayout: 0, hours: 0 },
    );
  }, [processedLedger]);

  const capacityTotals = useMemo(() => {
    return roomCapacityMetrics.reduce(
      (acc, r) => {
        acc.pastAvail += r.past_available_hours;
        acc.pastBooked += r.past_booked_hours;
        acc.pastFree += r.past_free_hours;
        acc.pastPotentialRev += r.past_potential_revenue;
        acc.pastActualRev += r.past_actual_revenue;
        acc.pastUncapturedRev += r.past_uncaptured_revenue;

        acc.futureAvail += r.future_available_hours;
        acc.futureBooked += r.future_booked_hours;
        acc.futureFree += r.future_free_hours;
        acc.futurePotentialRev += r.future_potential_revenue;
        acc.futureLockedRev += r.future_locked_revenue;
        acc.futureOpenRev += r.future_open_opportunity_revenue;
        return acc;
      },
      {
        pastAvail: 0,
        pastBooked: 0,
        pastFree: 0,
        pastPotentialRev: 0,
        pastActualRev: 0,
        pastUncapturedRev: 0,
        futureAvail: 0,
        futureBooked: 0,
        futureFree: 0,
        futurePotentialRev: 0,
        futureLockedRev: 0,
        futureOpenRev: 0,
      },
    );
  }, [roomCapacityMetrics]);

  const filteredSubscribers = useMemo(() => {
    return subscribersReport.filter((s) => {
      if (subLifecycleFilter === "active" && !s.isCurrentlyActive) return false;
      if (subLifecycleFilter === "renewed" && !s.hasRenewed) return false;
      if (subLifecycleFilter === "reactivated" && !s.hasReactivated)
        return false;
      if (subLifecycleFilter === "expiring_soon" && !s.isExpiringSoon)
        return false;
      if (subLifecycleFilter === "overdue" && !s.isOverdue) return false;
      if (subLifecycleFilter === "cancelled" && !s.isCancelled) return false;

      if (subPaymentFilter === "PIX" && s.paymentMethod === "CREDIT_CARD")
        return false;
      if (subPaymentFilter === "CREDIT_CARD" && s.paymentMethod === "PIX")
        return false;

      if (!subscriberSearch.trim()) return true;
      const q = subscriberSearch.toLowerCase().trim();
      return (
        s.specialistName.toLowerCase().includes(q) ||
        s.specialistEmail.toLowerCase().includes(q)
      );
    });
  }, [
    subscribersReport,
    subLifecycleFilter,
    subPaymentFilter,
    subscriberSearch,
  ]);

  const downloadCSV = (content: string, fileName: string) => {
    const bom = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportSubscribersCSV = () => {
    if (filteredSubscribers.length === 0) {
      return toast({ title: "Sem assinantes para exportar." });
    }
    let csv =
      "Assinante;E-mail;WhatsApp;Plano;Metodo Pagamento;Ciclo / Status;Meses Assinados;Reativado;Ultimo Pagamento;Vencimento Ciclo;Horas Compradas;Horas Usadas;Saldo Ativo;Breakage Expirado (R$);Ganho Downgrade (R$);Total Pago (R$)\n";
    filteredSubscribers.forEach((s) => {
      const tierLbl = s.activePlanTier
        ? formatTierLabel(s.activePlanTier)
        : "Basic";
      const methodLbl =
        s.paymentMethod === "PIX"
          ? "PIX"
          : s.paymentMethod === "MIXED"
            ? "PIX + Cartao"
            : `Cartao ${s.cardLast4 ? `final ${s.cardLast4}` : ""}`;
      const lastDt = s.lastPaymentDate
        ? format(parseISO(s.lastPaymentDate), "dd/MM/yyyy")
        : "-";
      const expDt = s.currentExpiresAt
        ? format(parseISO(s.currentExpiresAt), "dd/MM/yyyy")
        : "-";
      csv += `"${s.specialistName}";"${s.specialistEmail}";"${s.specialistPhone || ""}";"${tierLbl} (${s.activePlanHours || 0}h)";"${methodLbl}";"${s.lifecycleStatus}";${s.monthsSubscribed};${s.hasReactivated ? "SIM" : "NAO"};${lastDt};${expDt};${s.purchasedHoursTotal};${s.usedHoursTotal};${s.activeRemainingHours};${s.realizedBreakageProfitBrl.toFixed(2).replace(".", ",")};${s.downgradeSpreadProfitBrl.toFixed(2).replace(".", ",")};${s.totalInvestedBrl.toFixed(2).replace(".", ",")}\n`;
    });
    downloadCSV(
      csv,
      `Fusion_Assinantes_${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
  };

  const handleExportLedgerCSV = () => {
    if (processedLedger.length === 0) {
      return toast({ title: "Sem lançamentos para exportar." });
    }
    let csv =
      "Data do Agendamento / Baixa;Data da Sessao / Competencia;Codigo Transacao;Subgrupo;Clinica;Sala;Profissional;Especialidade;Modalidade;Horas;Entrada Bruta GMV (R$);Base Sala Entregue (R$);Repasse Clinica/CoHost (R$);Ganho Extra Downgrade (R$);Credito Liquido Total Fusion (R$);Saldo Acumulado Fusion (R$)\n";

    [...processedLedger].reverse().forEach((row) => {
      const createdDt = format(
        parseISO(row.transaction_date),
        "dd/MM/yyyy HH:mm",
      );
      const sessionDt = row.is_contract
        ? `Baixa Integral (${format(parseISO(row.start_time), "dd/MM/yyyy")})`
        : `${format(parseISO(row.start_time), "dd/MM/yyyy HH:mm")}-${format(parseISO(row.end_time), "HH:mm")}`;
      const nat =
        row.subgroup === "contract"
          ? "3. CONTRATO FIXO"
          : row.subgroup === "package"
            ? "2. PACOTE FUSION PASS+"
            : "1. HORA AVULSA";
      const hostTotal = row.host_payout_brl + row.cohost_payout_brl;

      csv += `${createdDt};${sessionDt};#${row.booking_id.slice(0, 8)};"${nat}";"${row.clinic_name}";"${row.room_name}";"${row.specialist_name}";"${row.specialty}";"${row.modality_label}";${row.duration_hours};${row.gross_brl.toFixed(2).replace(".", ",")};${row.room_base_brl.toFixed(2).replace(".", ",")};-${hostTotal.toFixed(2).replace(".", ",")};${row.downgrade_spread_brl.toFixed(2).replace(".", ",")};${row.fusion_fee_brl.toFixed(2).replace(".", ",")};${row.running_fusion_balance.toFixed(2).replace(".", ",")}\n`;
    });

    downloadCSV(
      csv,
      `Extrato_Contabil_Fusion_${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
  };

  const totalBookingsCount =
    avulsoBookingsCount + packageBookingsCount + contractBookingsCount;
  const totalHoursOccupied =
    avulsoHoursCount + packageHoursCount + contractHoursCount;
  const avgTicketPerBooking =
    totalBookingsCount > 0 ? gmv / totalBookingsCount : 0;
  const revPerOccupiedHour =
    totalHoursOccupied > 0 ? gmv / totalHoursOccupied : 0;
  const retentionRatePct =
    activeDoctors > 0
      ? Math.round((recurringDoctorsCount / activeDoctors) * 100)
      : 0;
  const avulsoSharePct = gmv > 0 ? Math.round((avulsoGmv / gmv) * 100) : 0;
  const packageSharePct = gmv > 0 ? Math.round((packageGmv / gmv) * 100) : 0;
  const contractSharePct = gmv > 0 ? Math.round((contractGmv / gmv) * 100) : 0;

  const totalPackageNetProfit =
    packageTotalTakeRate + breakageTotals.totalRealizedBreakageProfitBrl;

  const getHeatmapColor = (intensity: number) => {
    if (intensity === 0) return "bg-slate-50 border-slate-100 text-slate-300";
    if (intensity <= 2)
      return "bg-[#FAF7F5] border-orange-200/70 text-slate-700 font-bold";
    if (intensity <= 6)
      return "bg-orange-100/80 border-orange-300 text-[#9A3C1D] font-bold";
    if (intensity <= 12)
      return "bg-[#BF4B24]/85 border-[#BF4B24] text-white font-black";
    return "bg-[#9A3C1D] border-[#7c2f15] text-white font-black shadow-xs";
  };

  const getSubscriberLifecycleBadge = (sub: SubscriberPackageAnalytics) => {
    if (sub.isCancelled) {
      return (
        <span className="text-[10px] font-semibold bg-red-50 text-red-700 px-2 py-0.5 rounded">
          Cancelado
        </span>
      );
    }
    if (sub.isOverdue) {
      return (
        <span className="text-[10px] font-semibold bg-red-100 text-red-800 px-2 py-0.5 rounded">
          Atrasado ({Math.abs(sub.daysUntilExpiry || 0)}d)
        </span>
      );
    }
    if (sub.isExpiringSoon) {
      return (
        <span className="text-[10px] font-semibold bg-amber-100 text-amber-800 px-2 py-0.5 rounded">
          Vence em {sub.daysUntilExpiry}d
        </span>
      );
    }
    if (sub.hasReactivated) {
      return (
        <span className="text-[10px] font-semibold bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded inline-flex items-center gap-1">
          <RotateCcw className="w-2.5 h-2.5" /> Reativado (Voltou)
        </span>
      );
    }
    if (sub.hasRenewed) {
      return (
        <span className="text-[10px] font-semibold bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded">
          Renovado • Ativo
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
        Novo (1º Mês)
      </span>
    );
  };

  if (initialLoading) {
    return (
      <div className="flex justify-center items-center h-full py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 w-full pb-32 font-sans text-slate-900 bg-[#F8FAFC] print:p-0">
      {/* ==================================================================== */}
      {/* HEADER BI EXECUTIVO, SINO DE NOTIFICAÇÕES E FILTROS DE DATA          */}
      {/* ==================================================================== */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-6 mb-6 border-b border-slate-200 print:mb-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-bold uppercase tracking-widest text-slate-400">
              Visão Geral Executiva
            </span>
            {isRefreshing && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#BF4B24]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight flex items-center gap-2 mt-1">
            <Crown className="w-6 h-6 text-amber-500" />
            Centro de Comando Fusion
          </h1>
          <p className="text-sm text-slate-500 mt-0.5">
            Faturamento por canal (Horas Avulsas, Pacotes e Contratos Fixos) e
            capacidade instalada.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          {/* SINO DE NOTIFICAÇÕES EM TEMPO REAL COM MODAL DE RAIO-X */}
          <AdminNotificationsBell onNavigateTab={onNavigateTab} />

          <div className="flex items-center bg-white border border-slate-200 p-1 rounded-xl">
            {[
              { id: "7d", label: "7 Dias" },
              { id: "30d", label: "30 Dias" },
              { id: "ytd", label: "Este Ano" },
              { id: "custom", label: "Personalizado" },
            ].map((filter) => (
              <button
                key={filter.id}
                type="button"
                onClick={() => setTimeFilter(filter.id as any)}
                className={`px-3.5 py-2 rounded-lg text-xs font-semibold whitespace-nowrap transition-all ${
                  timeFilter === filter.id
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {timeFilter === "custom" && (
            <div className="flex items-center bg-white border border-slate-200 rounded-xl px-3 py-1.5">
              <CalendarIcon className="w-4 h-4 text-slate-400 mr-2 shrink-0" />
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent border-0 text-xs font-semibold text-slate-800 outline-none w-28 tabular-nums"
              />
              <span className="text-slate-400 px-1.5 text-xs">até</span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent border-0 text-xs font-semibold text-slate-800 outline-none w-28 tabular-nums"
              />
            </div>
          )}

          <Button
            type="button"
            variant="outline"
            onClick={() => setIsSubscribersModalOpen(true)}
            className="h-10 rounded-xl border-slate-200 bg-white hover:bg-slate-50 text-slate-800 font-semibold text-xs px-4 shadow-2xs"
          >
            <Users className="w-4 h-4 mr-2 text-[#BF4B24]" />
            Assinantes ({breakageTotals.totalSubscribersCount})
          </Button>

          <Button
            type="button"
            onClick={() => handleOpenBankStatement("all")}
            className="h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs px-4 shadow-2xs"
          >
            <FileText className="w-4 h-4 mr-2" />
            Extrato Contábil ({ledgerEntries.length})
          </Button>

          <Button
            type="button"
            onClick={() => window.print()}
            variant="outline"
            className="hidden md:flex h-10 rounded-xl border-slate-200 bg-white font-semibold text-xs text-slate-700 hover:bg-slate-50 shadow-2xs"
          >
            <Download className="w-4 h-4 mr-1.5" /> PDF
          </Button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 1: 4 KPIS GLOBAIS                                              */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 print:grid-cols-4">
        <div
          onClick={() => handleOpenBankStatement("all")}
          className="bg-white p-6 rounded-2xl border border-slate-200/90 hover:border-slate-300 transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-slate-500">
              Volume Transacionado (GMV)
            </span>
            <Activity className="w-4 h-4 text-slate-400 group-hover:text-slate-700 transition-colors" />
          </div>
          <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
            R$ {formatBRL(gmv)}
          </h3>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            {totalBookingsCount} lançamentos • Ticket médio R${" "}
            {formatBRL(avgTicketPerBooking)}
          </p>
        </div>

        <div
          onClick={() => handleOpenBankStatement("all")}
          className="bg-slate-900 p-6 rounded-2xl text-white cursor-pointer group relative overflow-hidden"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-slate-700/30 rounded-full blur-2xl -mr-8 -mt-8 transition-transform group-hover:scale-150" />
          <div className="relative z-10">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-medium text-slate-400">
                Receita Líquida Fusion
              </span>
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-md">
                {gmv > 0
                  ? (
                      ((takeRate +
                        breakageTotals.totalRealizedBreakageProfitBrl) /
                        Math.max(
                          1,
                          gmv + breakageTotals.totalRealizedBreakageProfitBrl,
                        )) *
                      100
                    ).toFixed(1)
                  : "0.0"}
                % margem
              </span>
            </div>
            <h3 className="text-2xl md:text-3xl font-bold text-white tabular-nums tracking-tight">
              R${" "}
              {formatBRL(
                takeRate + breakageTotals.totalRealizedBreakageProfitBrl,
              )}
            </h3>
            <p className="text-xs text-slate-400 mt-2 tabular-nums">
              Repasse Clínicas: R$ {formatBRL(hostPayoutTotal)}
            </p>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/90">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-slate-500">
              Profissionais Ativos
            </span>
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              {retentionRatePct}% recorrentes
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
            {activeDoctors}
          </h3>
          <p className="text-xs text-slate-500 mt-2">
            {breakageTotals.activeSubscribersCount} assinantes Fusion Pass+
            ativos
          </p>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200/90">
          <div className="flex justify-between items-center mb-3">
            <span className="text-xs font-semibold text-slate-500">
              Salas Ativas & Ocupação
            </span>
            <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2 py-0.5 rounded-md">
              {avgOccupancyRate}% uso
            </span>
          </div>
          <h3 className="text-2xl md:text-3xl font-bold text-slate-900 tabular-nums tracking-tight">
            {activeRooms}{" "}
            <span className="text-sm font-normal text-slate-400">salas</span>
          </h3>
          <p className="text-xs text-slate-500 mt-2 tabular-nums">
            R$ {formatBRL(revPerOccupiedHour)}/h • {totalHoursOccupied}h
            utilizadas
          </p>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 2: OS 3 SUBGRUPOS INDEPENDENTES (DESIGN LIMPO E ALINHADO)      */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6 print:grid-cols-3">
        {/* 1. HORAS AVULSAS */}
        <div
          onClick={() => handleOpenBankStatement("avulso")}
          className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-6 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    1. Horas Avulsas
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    PIX ou Cartão direto (sem pacote)
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md shrink-0 tabular-nums">
                {avulsoSharePct}% do GMV
              </span>
            </div>

            <div className="pb-4 mb-4 border-b border-slate-100 tabular-nums">
              <p className="text-[11px] font-medium text-slate-400">
                Volume Bruto no Período
              </p>
              <div className="flex items-baseline justify-between gap-2 mt-0.5">
                <p className="text-2xl font-bold text-slate-900 tracking-tight">
                  R$ {formatBRL(avulsoGmv)}
                </p>
                <span className="text-xs font-medium text-slate-500">
                  {avulsoBookingsCount} reservas ({avulsoHoursCount}h)
                </span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs tabular-nums">
              <div className="flex items-center justify-between text-slate-600">
                <span>Repasse Clínicas (80%)</span>
                <span className="font-semibold text-slate-900">
                  R$ {formatBRL(Math.max(0, avulsoGmv - avulsoTakeRate))}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Taxa média aplicada</span>
                <span className="font-medium text-slate-500">20% fixo</span>
              </div>
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Receita Líquida Fusion
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  + R$ {formatBRL(avulsoTakeRate)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900">
            <span>Ver extrato de Horas Avulsas</span>
            <ArrowUpRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>

        {/* 2. PACOTES FUSION PASS+ */}
        <div
          onClick={() => handleOpenBankStatement("package")}
          className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-6 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#BF4B24] flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    2. Pacotes Fusion Pass+
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    PIX ({breakageTotals.pixSubscribersCount}) • Cartão (
                    {breakageTotals.cardSubscribersCount}) • Sobras & Downgrade
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-[#BF4B24] bg-orange-50 px-2.5 py-1 rounded-md shrink-0 tabular-nums">
                {packageSharePct}% do GMV
              </span>
            </div>

            <div className="pb-3.5 mb-3.5 border-b border-slate-100 tabular-nums">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] font-medium text-slate-400">
                    Créditos Consumidos no Período
                  </p>
                  <p className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                    R$ {formatBRL(packageGmv)}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  {packageBookingsCount} usos ({packageHoursCount}h)
                </span>
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg">
                <span>
                  Basic:{" "}
                  <strong className="text-slate-700">
                    {packageByTierStats.start.hours}h
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  VIP:{" "}
                  <strong className="text-slate-700">
                    {packageByTierStats.vip.hours}h
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  Premium:{" "}
                  <strong className="text-slate-700">
                    {packageByTierStats.master.hours}h
                  </strong>
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex items-center justify-between text-slate-600">
                <span>Taxa Base (20%) / Repasse</span>
                <span className="font-semibold text-slate-900">
                  R$ {formatBRL(packageStandardFee)} / R${" "}
                  {formatBRL(packageHostPayout)}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>
                  Ganho Downgrade ({packageDowngradeCount}x) + Sobras Vencidas
                </span>
                <span className="font-semibold text-emerald-700">
                  + R${" "}
                  {formatBRL(
                    packageDowngradeSpread +
                      breakageTotals.totalRealizedBreakageProfitBrl,
                  )}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-500">
                <span>
                  Saldo Ativo em Carteira (
                  {breakageTotals.totalActiveRemainingHours}h)
                </span>
                <span className="font-medium text-slate-700">
                  R$ {formatBRL(breakageTotals.totalFloatingUnusedValueBrl)}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Lucro Realizado Fusion
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  + R$ {formatBRL(totalPackageNetProfit)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-600 hover:text-slate-900">
              Extrato de Pacotes
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setIsSubscribersModalOpen(true);
              }}
              className="text-xs font-semibold text-[#BF4B24] hover:underline flex items-center gap-1"
            >
              Ver assinantes ({breakageTotals.totalSubscribersCount})
              <ArrowUpRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* 3. CONTRATOS FIXOS */}
        <div
          onClick={() => handleOpenBankStatement("contract")}
          className="bg-white rounded-2xl border border-slate-200/90 hover:border-slate-300 p-6 cursor-pointer transition-all flex flex-col justify-between"
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h2 className="text-sm font-bold text-slate-900">
                    3. Contratos Fixos
                  </h2>
                  <p className="text-[11px] text-slate-500">
                    Turnos fixos, mensais e sublocações ({activeContractsCount}{" "}
                    ativos)
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md shrink-0 tabular-nums">
                {contractSharePct}% do GMV
              </span>
            </div>

            <div className="pb-4 mb-4 border-b border-slate-100 tabular-nums">
              <p className="text-[11px] font-medium text-slate-400">
                Volume de Baixas no Período
              </p>
              <div className="flex items-baseline justify-between gap-2 mt-0.5">
                <p className="text-2xl font-bold text-slate-900 tracking-tight">
                  R$ {formatBRL(contractGmv)}
                </p>
                <span className="text-xs font-medium text-slate-500">
                  {contractBookingsCount} baixas ({contractHoursCount}h)
                </span>
              </div>
            </div>

            <div className="space-y-2.5 text-xs tabular-nums">
              <div className="flex items-center justify-between text-slate-600">
                <span>Repasse Clínicas (Líquido)</span>
                <span className="font-semibold text-slate-900">
                  R$ {formatBRL(Math.max(0, contractGmv - contractTakeRate))}
                </span>
              </div>
              <div className="flex items-center justify-between text-slate-600">
                <span>Taxa média de administração</span>
                <span className="font-medium text-slate-500">
                  {contractGmv > 0
                    ? ((contractTakeRate / contractGmv) * 100).toFixed(1)
                    : "0.0"}
                  %
                </span>
              </div>
              <div className="pt-2.5 border-t border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Receita Líquida Fusion
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  + R$ {formatBRL(contractTakeRate)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-600 hover:text-slate-900">
            <span>Ver extrato de Contratos Fixos</span>
            <ArrowUpRight className="w-4 h-4 text-slate-400" />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 3: GRÁFICO DE EVOLUÇÃO & ESPECIALIDADES                        */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6 print:grid-cols-3">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200/90 p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Evolução do Faturamento por Canal
              </h2>
              <p className="text-xs text-slate-500">
                Comparativo diário entre Horas Avulsas, Pacotes e Contratos
              </p>
            </div>

            <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
              {[
                { id: "all", label: "Todos" },
                { id: "avulso", label: "Avulso" },
                { id: "package", label: "Pacotes" },
                { id: "contract", label: "Contratos" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartView(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                    chartView === tab.id
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-500 hover:text-slate-900"
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-5 mb-4 text-xs font-medium text-slate-600">
            {(chartView === "all" || chartView === "avulso") && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-400" />
                <span>Horas Avulsas</span>
              </div>
            )}
            {(chartView === "all" || chartView === "package") && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-[#BF4B24]" />
                <span>Pacotes Fusion Pass+</span>
              </div>
            )}
            {(chartView === "all" || chartView === "contract") && (
              <div className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-xs bg-slate-900" />
                <span>Contratos Fixos</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-emerald-600" />
              <span className="text-emerald-700 font-semibold">
                Receita Fusion
              </span>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart
                data={revenueData}
                margin={{ top: 10, right: 10, left: -15, bottom: 0 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#F1F5F9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#64748B", fontWeight: 600 }}
                  dy={8}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 11, fill: "#64748B" }}
                  tickFormatter={(val) =>
                    `R$${val >= 1000 ? (val / 1000).toFixed(1) + "k" : val}`
                  }
                />
                <RechartsTooltip
                  content={({ active, payload, label }) => {
                    if (!active || !payload || payload.length === 0)
                      return null;
                    const row = payload[0]?.payload;
                    if (!row) return null;
                    return (
                      <div className="bg-slate-900 text-white p-3.5 rounded-xl shadow-xl border border-slate-800 text-xs space-y-2 min-w-[230px] tabular-nums">
                        <div className="font-bold text-slate-200 border-b border-slate-800 pb-1.5 flex justify-between">
                          <span>Data: {label}</span>
                          <span className="text-white">
                            Total: R$ {formatBRL(row.totalGmv)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-300">
                            <span>Horas Avulsas:</span>
                            <span className="font-semibold text-white">
                              R$ {formatBRL(row.avulsoGmv || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>Pacotes Fusion Pass+:</span>
                            <span className="font-semibold text-white">
                              R$ {formatBRL(row.packageGmv || 0)}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span>Contratos Fixos:</span>
                            <span className="font-semibold text-white">
                              R$ {formatBRL(row.contractGmv || 0)}
                            </span>
                          </div>
                        </div>
                        <div className="pt-1.5 border-t border-slate-800 flex justify-between text-emerald-400 font-bold">
                          <span>Receita Líquida Fusion:</span>
                          <span>+ R$ {formatBRL(row.platformFee)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                {(chartView === "all" || chartView === "avulso") && (
                  <Bar
                    dataKey="avulsoGmv"
                    stackId="a"
                    fill="#94A3B8"
                    radius={
                      chartView === "avulso" ? [6, 6, 0, 0] : [0, 0, 0, 0]
                    }
                    maxBarSize={38}
                  />
                )}
                {(chartView === "all" || chartView === "package") && (
                  <Bar
                    dataKey="packageGmv"
                    stackId="a"
                    fill="#BF4B24"
                    radius={
                      chartView === "package" ? [6, 6, 0, 0] : [0, 0, 0, 0]
                    }
                    maxBarSize={38}
                  />
                )}
                {(chartView === "all" || chartView === "contract") && (
                  <Bar
                    dataKey="contractGmv"
                    stackId="a"
                    fill="#0F172A"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="platformFee"
                  stroke="#10B981"
                  strokeWidth={2}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Demanda por Especialidade */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-6 flex flex-col">
          <div className="mb-2">
            <h2 className="text-base font-bold text-slate-900">
              Demanda por Especialidade
            </h2>
            <p className="text-xs text-slate-500">
              Participação e volume gerado no período
            </p>
          </div>

          <div className="flex-1 flex items-center justify-center">
            {specialtyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={specialtyData}
                    innerRadius={55}
                    outerRadius={78}
                    paddingAngle={4}
                    dataKey="value"
                  >
                    {specialtyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value: any, _name: any, props: any) => [
                      `${value}% (R$ ${formatBRL(props.payload.revenue)})`,
                      props.payload.name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm font-medium">
                Sem dados no período
              </p>
            )}
          </div>

          <div className="space-y-2 mt-3 max-h-[125px] overflow-y-auto pr-1">
            {specialtyData.map((spec) => (
              <div
                key={spec.name}
                className="flex items-center justify-between text-xs text-slate-600 tabular-nums"
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: spec.color }}
                  />
                  <span className="truncate font-medium">{spec.name}</span>
                </div>
                <span className="text-slate-900 font-semibold">
                  R$ {formatBRL(spec.revenue)} ({spec.value}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 4: ESTOQUE DE HORAS & POTENCIAL POR SALA                       */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 mb-8 overflow-hidden print:break-inside-avoid">
        <div className="p-6 border-b border-slate-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-[#F8FAFC]">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-slate-700" />
              Estoque de Horas & Potencial Financeiro por Sala
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Compare a capacidade total disponível com as horas alugadas
              (Avulso, Pacotes e Contratos).
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setInventoryMode("past")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  inventoryMode === "past"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                No Período
              </button>
              <button
                type="button"
                onClick={() => setInventoryMode("future")}
                className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                  inventoryMode === "future"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                Próximos {futureHorizonDays} Dias
              </button>
            </div>

            {inventoryMode === "future" && (
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                {([15, 20, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setFutureHorizonDays(d)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      futureHorizonDays === d
                        ? "bg-slate-900 text-white"
                        : "text-slate-500 hover:text-slate-900"
                    }`}
                  >
                    +{d}d
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {inventoryMode === "past" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-slate-50/50 border-b border-slate-100 tabular-nums">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Estoque Total no Período
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {capacityTotals.pastAvail}h{" "}
                <span className="text-xs font-normal text-slate-400">
                  disponíveis
                </span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Horas Alugadas vs. Ociosas
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {capacityTotals.pastBooked}h{" "}
                <span className="text-xs font-normal text-slate-400">
                  / {capacityTotals.pastFree}h livres
                </span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Potencial Máximo (100%)
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                R$ {formatBRL(capacityTotals.pastPotentialRev)}
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Faturado Realizado
              </p>
              <p className="text-xl font-bold text-emerald-700 mt-1">
                R$ {formatBRL(capacityTotals.pastActualRev)}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-slate-50/50 border-b border-slate-100 tabular-nums">
            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Capacidade Próximos {futureHorizonDays} Dias
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {capacityTotals.futureAvail}h{" "}
                <span className="text-xs font-normal text-slate-400">
                  totais
                </span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Horas Já Reservadas
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                {capacityTotals.futureBooked}h{" "}
                <span className="text-xs font-normal text-slate-500">
                  (R$ {formatBRL(capacityTotals.futureLockedRev)})
                </span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Estoque Livre p/ Venda
              </p>
              <p className="text-xl font-bold text-emerald-700 mt-1">
                {capacityTotals.futureFree}h{" "}
                <span className="text-xs font-normal text-slate-400">
                  disponíveis
                </span>
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200/80">
              <p className="text-[11px] font-medium text-slate-500">
                Potencial em Aberto
              </p>
              <p className="text-xl font-bold text-slate-900 mt-1">
                R$ {formatBRL(capacityTotals.futureOpenRev)}
              </p>
            </div>
          </div>
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
            <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
              {inventoryMode === "past" ? (
                <tr>
                  <th className="px-6 py-3.5">Espaço / Sala</th>
                  <th className="px-6 py-3.5 text-center">Tarifa Base</th>
                  <th className="px-6 py-3.5 text-center">Estoque</th>
                  <th className="px-6 py-3.5 text-center">
                    Horas Alugadas (Avulso / Pacote / Contrato)
                  </th>
                  <th className="px-6 py-3.5 text-center">Ociosas</th>
                  <th className="px-6 py-3.5 text-center">Ocupação</th>
                  <th className="px-6 py-3.5 text-right">Potencial (100%)</th>
                  <th className="px-6 py-3.5 text-right">Faturado Real</th>
                  <th className="px-6 py-3.5 text-right">Gap Ocioso</th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-3.5">Espaço / Sala</th>
                  <th className="px-6 py-3.5 text-center">Tarifa Base</th>
                  <th className="px-6 py-3.5 text-center">
                    Capacidade ({futureHorizonDays}d)
                  </th>
                  <th className="px-6 py-3.5 text-center">
                    Já Ocupadas (Avulso / Pacote / Contrato)
                  </th>
                  <th className="px-6 py-3.5 text-center">Estoque Livre</th>
                  <th className="px-6 py-3.5 text-center">Ocupação Futura</th>
                  <th className="px-6 py-3.5 text-right">Receita Garantida</th>
                  <th className="px-6 py-3.5 text-right">
                    Potencial em Aberto
                  </th>
                  <th className="px-6 py-3.5 text-right">Teto Potencial</th>
                </tr>
              )}
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roomCapacityMetrics.map((rm) => {
                const isPast = inventoryMode === "past";
                const avail = isPast
                  ? rm.past_available_hours
                  : rm.future_available_hours;
                const booked = isPast
                  ? rm.past_booked_hours
                  : rm.future_booked_hours;
                const avulsoH = isPast
                  ? rm.past_avulso_hours
                  : rm.future_avulso_hours;
                const pkgH = isPast
                  ? rm.past_package_hours
                  : rm.future_package_hours;
                const contractH = isPast
                  ? rm.past_contract_hours
                  : rm.future_contract_hours;
                const free = isPast ? rm.past_free_hours : rm.future_free_hours;
                const occPct = isPast
                  ? rm.past_occupancy_pct
                  : rm.future_occupancy_pct;

                return (
                  <tr
                    key={rm.room_id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <p className="font-bold text-slate-900">{rm.room_name}</p>
                      <p className="text-[11px] text-slate-400">
                        {rm.host_name} • {formatTierLabel(rm.tier)}
                      </p>
                    </td>

                    <td className="px-6 py-3.5 text-center text-slate-600">
                      R$ {formatBRL(rm.hourly_rate)}/h
                    </td>

                    <td className="px-6 py-3.5 text-center font-semibold text-slate-700">
                      {avail}h
                    </td>

                    <td className="px-6 py-3.5 text-center">
                      <span className="font-bold text-slate-900">
                        {booked}h
                      </span>
                      <span className="block text-[10px] text-slate-400">
                        {avulsoH}h avulso • {pkgH}h pacote • {contractH}h
                        contrato
                      </span>
                    </td>

                    <td className="px-6 py-3.5 text-center text-slate-600 font-medium">
                      {free}h
                    </td>

                    <td className="px-6 py-3.5 text-center">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-semibold text-slate-700 w-8 text-right">
                          {occPct}%
                        </span>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-slate-900"
                            style={{ width: `${occPct}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    {isPast ? (
                      <>
                        <td className="px-6 py-3.5 text-right text-slate-600">
                          R$ {formatBRL(rm.past_potential_revenue)}
                        </td>
                        <td className="px-6 py-3.5 text-right font-bold text-slate-900">
                          R$ {formatBRL(rm.past_actual_revenue)}
                        </td>
                        <td className="px-6 py-3.5 text-right text-slate-500">
                          R$ {formatBRL(rm.past_uncaptured_revenue)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-3.5 text-right font-bold text-slate-900">
                          R$ {formatBRL(rm.future_locked_revenue)}
                        </td>
                        <td className="px-6 py-3.5 text-right text-emerald-700 font-semibold">
                          + R$ {formatBRL(rm.future_open_opportunity_revenue)}
                        </td>
                        <td className="px-6 py-3.5 text-right text-slate-600">
                          R$ {formatBRL(rm.future_potential_revenue)}
                        </td>
                      </>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 5: MAPA DE CALOR GLOBAL                                        */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-6 mb-8 overflow-hidden print:break-inside-avoid">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#BF4B24]" /> Zonas Quentes e Frias
              por Turno
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Concentração de ocupação somando horas avulsas, pacotes e
              contratos fixos.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className="bg-slate-50 text-slate-600 border-slate-200 font-medium"
            >
              <Snowflake className="w-3 h-3 mr-1" /> Baixa Demanda
            </Badge>
            <Badge
              variant="outline"
              className="bg-orange-50 text-[#BF4B24] border-orange-200 font-medium"
            >
              <Flame className="w-3 h-3 mr-1" /> Alta Demanda
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto pb-2">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-5 gap-2 mb-2">
              <div className="col-span-1" />
              {shiftLabels.map((label) => (
                <div
                  key={label}
                  className="col-span-1 text-center text-[10px] font-semibold text-slate-500 uppercase"
                >
                  {label}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {heatmapData.map((row) => (
                <div
                  key={row.day}
                  className="grid grid-cols-5 gap-2 items-center"
                >
                  <div className="col-span-1 text-xs font-bold text-slate-700 text-right pr-4">
                    {row.day}
                  </div>
                  {row.shifts.map((intensity: number, idx: number) => (
                    <div
                      key={idx}
                      className={`col-span-1 h-10 rounded-xl border flex items-center justify-center text-xs tabular-nums transition-all ${getHeatmapColor(intensity)}`}
                      title={`${row.day} - ${shiftLabels[idx]}: ${intensity} turno(s) ocupado(s)`}
                    >
                      {intensity > 0 ? `${intensity} loc.` : "–"}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 6: RANKING TOP 10 SALAS (ABERTURA NOS 3 SUBGRUPOS)             */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200/90 overflow-hidden print:break-inside-avoid">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Top 10 Salas (Performance nos 3 Subgrupos)
            </h2>
            <p className="text-xs text-slate-500">
              Abertura contábil mostrando o que veio de Horas Avulsas, Pacotes,
              Baixas de Contratos Fixos e a Margem retida pela Fusion.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
            <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
              <tr>
                <th className="px-6 py-3.5">Posição / Sala</th>
                <th className="px-6 py-3.5">Anfitrião & Co-Anfitrião</th>
                <th className="px-6 py-3.5 text-center">Ocupação</th>
                <th className="px-6 py-3.5 text-right text-slate-600">
                  1. GMV Avulso
                </th>
                <th className="px-6 py-3.5 text-right text-slate-600">
                  2. GMV Pacotes
                </th>
                <th className="px-6 py-3.5 text-right text-slate-600">
                  3. GMV Contratos
                </th>
                <th className="px-6 py-3.5 text-right">Volume Total (R$)</th>
                <th className="px-6 py-3.5 text-right">Receita Fusion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topRooms.length === 0 ? (
                <tr>
                  <td
                    colSpan={8}
                    className="px-6 py-10 text-center text-slate-500 font-medium"
                  >
                    Nenhuma reserva ou contrato ativo no período selecionado.
                  </td>
                </tr>
              ) : (
                topRooms.map((room, index) => (
                  <tr
                    key={room.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                            index === 0
                              ? "bg-slate-900 text-white"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-bold text-slate-900 truncate max-w-[180px]">
                              {room.name}
                            </p>
                            {room.hasContracts && (
                              <span className="bg-slate-100 text-slate-700 text-[9px] px-1.5 py-0.5 rounded font-semibold">
                                CONTRATO
                              </span>
                            )}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-0.5">
                            {room.avulsoHours}h avulso • {room.packageHours}h
                            pacote • {room.contractHours}h contrato
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-3.5">
                      <p className="font-medium text-slate-700 truncate max-w-[160px]">
                        {room.host}
                      </p>
                      {room.cohostName && (
                        <p className="text-[10px] text-slate-500 flex items-center gap-1 mt-0.5">
                          <Sparkles className="w-3 h-3 text-[#BF4B24]" />{" "}
                          Co-Host: {room.cohostName}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-3.5 text-center">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-semibold text-slate-700 w-8 text-right">
                          {room.occupancy}%
                        </span>
                        <div className="w-16 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-slate-900"
                            style={{ width: `${room.occupancy}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-3.5 text-right font-medium text-slate-600">
                      R$ {formatBRL(room.avulsoRevenue)}
                    </td>

                    <td className="px-6 py-3.5 text-right font-medium text-slate-600">
                      R$ {formatBRL(room.packageRevenue)}
                    </td>

                    <td className="px-6 py-3.5 text-right font-medium text-slate-600">
                      R$ {formatBRL(room.contractRevenue)}
                    </td>

                    <td className="px-6 py-3.5 text-right font-bold text-slate-900">
                      R$ {formatBRL(room.revenue)}
                    </td>

                    <td className="px-6 py-3.5 text-right font-bold text-emerald-700">
                      + R$ {formatBRL(room.platformFee)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL 1: INTELIGÊNCIA DE ASSINANTES FUSION PASS+                     */}
      {/* ==================================================================== */}
      <Dialog
        open={isSubscribersModalOpen}
        onOpenChange={setIsSubscribersModalOpen}
      >
        <DialogContent className="max-w-[95vw] sm:max-w-6xl h-[88vh] p-0 gap-0 overflow-hidden flex flex-col bg-white border-slate-200 shadow-2xl rounded-2xl">
          <DialogHeader className="px-6 py-4 bg-slate-900 text-white shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Inteligência de Assinaturas Fusion Pass+ (
                  {breakageTotals.totalSubscribersCount})
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Acompanhe quem assinou via PIX ou Cartão, quem renovou, quem
                  cancelou e voltou, vencimentos e lucro de sobras (breakage).
                </DialogDescription>
              </div>
              <Button
                type="button"
                onClick={handleExportSubscribersCSV}
                size="sm"
                className="bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs h-9 shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Exportar CSV
              </Button>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50 shrink-0 tabular-nums">
            <div className="px-6 py-3">
              <p className="text-[11px] font-medium text-slate-500">
                Ativos & Método (MRR: R${" "}
                {formatBRL(breakageTotals.activeMrrBrl)})
              </p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {breakageTotals.activeSubscribersCount} ativos{" "}
                <span className="text-xs font-normal text-slate-500">
                  (PIX: {breakageTotals.pixSubscribersCount} • Cartão:{" "}
                  {breakageTotals.cardSubscribersCount})
                </span>
              </p>
            </div>
            <div className="px-6 py-3">
              <p className="text-[11px] font-medium text-slate-500">
                Renovações, Reativações & Cancelados
              </p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {breakageTotals.renewedSubscribersCount} renovados{" "}
                <span className="text-xs font-normal text-slate-500">
                  ({breakageTotals.reactivatedSubscribersCount} voltaram •{" "}
                  {breakageTotals.cancelledCount} canc.)
                </span>
              </p>
            </div>
            <div className="px-6 py-3">
              <p className="text-[11px] font-medium text-slate-500">
                Radar de Vencimento & Atraso
              </p>
              <p className="text-lg font-bold text-amber-700 mt-0.5">
                {breakageTotals.expiringSoonCount} vencendo{" "}
                <span className="text-xs font-semibold text-red-600">
                  • {breakageTotals.overdueCount} atrasados
                </span>
              </p>
            </div>
            <div className="px-6 py-3 bg-emerald-50/50">
              <p className="text-[11px] font-medium text-emerald-800">
                Lucro Extra (Breakage + Downgrade)
              </p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">
                + R${" "}
                {formatBRL(
                  breakageTotals.totalRealizedBreakageProfitBrl +
                    breakageTotals.totalDowngradeSpreadProfitBrl,
                )}
              </p>
            </div>
          </div>

          <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl">
                {[
                  {
                    id: "all",
                    label: `Todos (${breakageTotals.totalSubscribersCount})`,
                  },
                  {
                    id: "active",
                    label: `Ativos (${breakageTotals.activeSubscribersCount})`,
                  },
                  {
                    id: "renewed",
                    label: `Renovados ≥ 2m (${breakageTotals.renewedSubscribersCount})`,
                  },
                  {
                    id: "reactivated",
                    label: `Reativados ↺ (${breakageTotals.reactivatedSubscribersCount})`,
                  },
                  {
                    id: "expiring_soon",
                    label: `Perto de Vencer (${breakageTotals.expiringSoonCount})`,
                  },
                  {
                    id: "overdue",
                    label: `Atrasados (${breakageTotals.overdueCount})`,
                  },
                  {
                    id: "cancelled",
                    label: `Cancelados (${breakageTotals.cancelledCount})`,
                  },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setSubLifecycleFilter(tab.id as any)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      subLifecycleFilter === tab.id
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <select
                value={subPaymentFilter}
                onChange={(e) =>
                  setSubPaymentFilter(
                    e.target.value as "all" | "PIX" | "CREDIT_CARD",
                  )
                }
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="all">
                  Método: PIX + Cartão ({breakageTotals.totalSubscribersCount})
                </option>
                <option value="PIX">
                  Assinantes via PIX ({breakageTotals.pixSubscribersCount})
                </option>
                <option value="CREDIT_CARD">
                  Assinantes via Cartão ({breakageTotals.cardSubscribersCount})
                </option>
              </select>
            </div>

            <div className="relative w-full sm:w-64">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar assinante por nome ou e-mail..."
                value={subscriberSearch}
                onChange={(e) => setSubscriberSearch(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl border-slate-200"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
              <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Assinante</th>
                  <th className="px-6 py-3.5">Plano & Pagamento</th>
                  <th className="px-6 py-3.5">Status & Vencimento</th>
                  <th className="px-6 py-3.5">Tempo de Casa (Meses)</th>
                  <th className="px-6 py-3.5">Consumo (Usadas / Compradas)</th>
                  <th className="px-6 py-3.5 text-right">
                    Breakage & Downgrade
                  </th>
                  <th className="px-6 py-3.5 text-center">Contato</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSubscribers.length === 0 ? (
                  <tr>
                    <td
                      colSpan={7}
                      className="px-6 py-16 text-center text-slate-400 font-medium"
                    >
                      Nenhum assinante encontrado no filtro atual.
                    </td>
                  </tr>
                ) : (
                  filteredSubscribers.map((sub) => {
                    const tierLabel = sub.activePlanTier
                      ? formatTierLabel(sub.activePlanTier)
                      : "Basic";
                    const waPhone = cleanPhoneForWa(sub.specialistPhone);

                    return (
                      <tr
                        key={sub.userId}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-3.5">
                          <p className="font-bold text-slate-900">
                            {sub.specialistName}
                          </p>
                          <p className="text-[11px] text-slate-400 mt-0.5">
                            {sub.specialistEmail}
                          </p>
                        </td>

                        <td className="px-6 py-3.5">
                          <div className="font-semibold text-slate-900">
                            Plano {tierLabel}{" "}
                            {sub.activePlanHours
                              ? `(${sub.activePlanHours}h/mês)`
                              : ""}
                          </div>
                          <div className="flex items-center gap-1.5 mt-1">
                            {sub.paymentMethod === "PIX" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                <QrCode className="w-3 h-3 text-[#BF4B24]" />
                                Via PIX
                              </span>
                            ) : sub.paymentMethod === "CREDIT_CARD" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                <CreditCard className="w-3 h-3 text-slate-600" />
                                Cartão{" "}
                                {sub.cardLast4 ? `•••• ${sub.cardLast4}` : ""}
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
                                PIX + Cartão
                              </span>
                            )}
                            <span className="text-[10px] text-slate-400">
                              Pago: R$ {formatBRL(sub.totalInvestedBrl)}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-3.5">
                          <div className="flex flex-col items-start gap-1">
                            {getSubscriberLifecycleBadge(sub)}
                            <span className="text-[10px] text-slate-500">
                              {sub.currentExpiresAt
                                ? sub.daysUntilExpiry !== null &&
                                  sub.daysUntilExpiry >= 0
                                  ? `Vence em ${format(parseISO(sub.currentExpiresAt), "dd/MM/yyyy")} (${sub.daysUntilExpiry}d)`
                                  : `Venceu em ${format(parseISO(sub.currentExpiresAt), "dd/MM/yyyy")}`
                                : "Sem vencimento"}
                            </span>
                          </div>
                        </td>

                        <td className="px-6 py-3.5">
                          <p className="font-bold text-slate-900">
                            {sub.monthsSubscribed}{" "}
                            {sub.monthsSubscribed === 1
                              ? "mês assinado"
                              : "meses assinados"}
                          </p>
                          <p className="text-[10px] text-slate-500 mt-0.5">
                            {sub.renewalsCount > 0
                              ? `${sub.renewalsCount} renovação(ões)`
                              : "1º ciclo"}
                            {sub.firstSubscriptionDate
                              ? ` • Desde ${format(parseISO(sub.firstSubscriptionDate), "dd/MM/yy")}`
                              : ""}
                          </p>
                          {sub.hasReactivated && (
                            <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5">
                              Cancelou antes e voltou a assinar
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-3.5 min-w-[190px]">
                          <div className="flex justify-between font-medium text-xs mb-1">
                            <span className="text-slate-700">
                              Usou {sub.usedHoursTotal}h de{" "}
                              {sub.purchasedHoursTotal}h
                            </span>
                            <span className="text-slate-500">
                              {sub.utilizationPct}%
                            </span>
                          </div>
                          <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-slate-900 rounded-full"
                              style={{ width: `${sub.utilizationPct}%` }}
                            />
                          </div>
                          <span className="block text-[10px] text-slate-400 mt-1">
                            Saldo livre hoje:{" "}
                            <strong className="text-slate-700">
                              {sub.activeRemainingHours}h
                            </strong>{" "}
                            (R$ {formatBRL(sub.floatingUnusedValueBrl)})
                          </span>
                        </td>

                        <td className="px-6 py-3.5 text-right">
                          {sub.realizedBreakageProfitBrl +
                            sub.downgradeSpreadProfitBrl >
                          0 ? (
                            <div>
                              <span className="font-bold text-emerald-700">
                                + R${" "}
                                {formatBRL(
                                  sub.realizedBreakageProfitBrl +
                                    sub.downgradeSpreadProfitBrl,
                                )}
                              </span>
                              <span className="block text-[10px] text-slate-400">
                                {sub.expiredUnusedHours}h vencidas •{" "}
                                {sub.downgradeBookingsCount}x downgrade
                              </span>
                            </div>
                          ) : (
                            <span className="text-slate-400">R$ 0,00</span>
                          )}
                        </td>

                        <td className="px-6 py-3.5 text-center">
                          {waPhone ? (
                            <a
                              href={`https://wa.me/${waPhone}?text=${encodeURIComponent(
                                sub.isOverdue
                                  ? `Olá Dr(a). ${sub.specialistName.split(" ")[0]}, tudo bem? Notamos que o ciclo do seu Fusion Pass+ venceu. Gostaria de renovar suas horas com desconto?`
                                  : sub.isExpiringSoon
                                    ? `Olá Dr(a). ${sub.specialistName.split(" ")[0]}, tudo bem? Seu ciclo do Fusion Pass+ vence em ${sub.daysUntilExpiry} dia(s).`
                                    : `Olá Dr(a). ${sub.specialistName.split(" ")[0]}, tudo bem?`,
                              )}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              title="Chamar no WhatsApp"
                              className="h-8 px-3 rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 inline-flex items-center justify-center gap-1.5 text-xs font-semibold"
                            >
                              <MessageCircle className="w-3.5 h-3.5" />
                              WhatsApp
                            </a>
                          ) : (
                            <span className="text-[11px] text-slate-400">
                              Sem telefone
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

      {/* ==================================================================== */}
      {/* MODAL 2: EXTRATO BANCÁRIO FUSION (LEDGER COMPLETO)                   */}
      {/* ==================================================================== */}
      <Dialog open={isLedgerOpen} onOpenChange={setIsLedgerOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl h-[88vh] p-0 gap-0 overflow-hidden flex flex-col bg-white border-slate-200 shadow-2xl rounded-2xl">
          <DialogHeader className="px-6 py-4 bg-slate-900 text-white shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
              <div>
                <DialogTitle className="text-base font-bold text-white">
                  Extrato Contábil Fusion ({processedLedger.length} lançamentos)
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Horas Avulsas, Pacotes Fusion Pass+ e Contratos Fixos (pelo
                  valor integral no dia da baixa).
                </DialogDescription>
              </div>

              <Button
                type="button"
                onClick={handleExportLedgerCSV}
                size="sm"
                className="bg-white hover:bg-slate-100 text-slate-900 font-semibold text-xs h-9 shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Exportar CSV
              </Button>
            </div>
          </DialogHeader>

          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50 shrink-0 tabular-nums">
            <div className="px-6 py-3">
              <p className="text-[11px] font-medium text-slate-500">
                Entradas Brutas (GMV)
              </p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                R$ {formatBRL(ledgerTotals.gmv)}
              </p>
            </div>
            <div className="px-6 py-3">
              <p className="text-[11px] font-medium text-slate-500">
                Repasse Clínicas / Co-Hosts
              </p>
              <p className="text-lg font-bold text-slate-700 mt-0.5">
                - R$ {formatBRL(ledgerTotals.hostPayout)}
              </p>
            </div>
            <div className="px-6 py-3">
              <p className="text-[11px] font-medium text-slate-500">
                Horas Auditadas
              </p>
              <p className="text-lg font-bold text-slate-900 mt-0.5">
                {ledgerTotals.hours}h utilizadas
              </p>
            </div>
            <div className="px-6 py-3 bg-emerald-50/60">
              <p className="text-[11px] font-medium text-emerald-800">
                Receita Líquida Fusion
              </p>
              <p className="text-lg font-bold text-emerald-700 mt-0.5">
                + R$ {formatBRL(ledgerTotals.fusionNet)}
              </p>
            </div>
          </div>

          <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex flex-wrap items-center bg-slate-100 p-1 rounded-xl">
                {[
                  { id: "all", label: "Todos" },
                  { id: "avulso", label: "1. Horas Avulsas" },
                  { id: "package", label: "2. Pacotes" },
                  { id: "contract", label: "3. Contratos" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLedgerOriginFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ${
                      ledgerOriginFilter === tab.id
                        ? "bg-white text-slate-900 shadow-2xs"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <select
                value={ledgerClinicFilter}
                onChange={(e) => setLedgerClinicFilter(e.target.value)}
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none"
              >
                <option value="all">Todas as Clínicas</option>
                {availableClinics.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="relative w-full sm:w-72">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <Input
                placeholder="Buscar profissional, sala ou código..."
                value={ledgerSearch}
                onChange={(e) => setLedgerSearch(e.target.value)}
                className="pl-8 h-9 text-xs rounded-xl border-slate-200"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
              <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">Data / Sessão</th>
                  <th className="px-6 py-3">Cód.</th>
                  <th className="px-6 py-3">Locatário / Sala</th>
                  <th className="px-6 py-3">Canal</th>
                  <th className="px-6 py-3 text-right">Valor Bruto</th>
                  <th className="px-6 py-3 text-right">Repasse Clínica</th>
                  <th className="px-6 py-3 text-right">Receita Fusion</th>
                  <th className="px-6 py-3 text-right bg-slate-50">
                    Saldo Acumulado
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedLedger.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-16 text-center text-slate-400"
                    >
                      Nenhum lançamento encontrado para este filtro.
                    </td>
                  </tr>
                ) : (
                  processedLedger.map((item) => {
                    const hostTotal =
                      item.host_payout_brl + item.cohost_payout_brl;
                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-slate-50 transition-colors"
                      >
                        <td className="px-6 py-3">
                          <p className="font-bold text-slate-900">
                            {item.is_contract
                              ? `Baixa ${format(parseISO(item.transaction_date), "dd/MM/yyyy")}`
                              : format(
                                  parseISO(item.transaction_date),
                                  "dd/MM/yyyy HH:mm",
                                )}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {item.is_contract
                              ? `Contrato (${item.duration_hours}h no período)`
                              : `Sessão: ${format(parseISO(item.start_time), "dd/MM HH:mm")}`}
                          </p>
                        </td>

                        <td className="px-6 py-3 font-mono text-[11px] text-slate-400">
                          #{item.booking_id.slice(0, 8)}
                        </td>

                        <td className="px-6 py-3">
                          <p className="font-semibold text-slate-900">
                            {item.specialist_name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {item.clinic_name} • {item.room_name}
                          </p>
                        </td>

                        <td className="px-6 py-3">
                          <span className="text-xs font-medium text-slate-700">
                            {item.modality_label}
                          </span>
                          {item.is_downgrade && (
                            <span className="block text-[10px] font-semibold text-emerald-700">
                              + R$ {formatBRL(item.downgrade_spread_brl)}{" "}
                              downgrade
                            </span>
                          )}
                        </td>

                        <td className="px-6 py-3 text-right font-semibold text-slate-900">
                          R$ {formatBRL(item.gross_brl)}
                        </td>

                        <td className="px-6 py-3 text-right text-slate-500">
                          - R$ {formatBRL(hostTotal)}
                        </td>

                        <td className="px-6 py-3 text-right font-bold text-emerald-700">
                          + R$ {formatBRL(item.fusion_fee_brl)}
                        </td>

                        <td className="px-6 py-3 text-right font-bold text-slate-900 bg-slate-50/60">
                          R$ {formatBRL(item.running_fusion_balance)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
