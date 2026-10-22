// components/admin/bookings-tab.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  sendBookingNotificationEmails,
  sendBookingCancellationEmails,
} from "@/app/actions/send-email";
import {
  Search,
  Calendar as CalendarIcon,
  FileSpreadsheet,
  DownloadCloud,
  Loader2,
  Eye,
  RefreshCw,
  Building2,
  Clock,
  XCircle,
  CalendarDays,
  AlertTriangle,
  FileText,
  Sparkles,
  ExternalLink,
  User,
  Phone,
  Mail,
  MapPin,
  Award,
  Wallet,
  MessageCircle,
  PlusCircle,
  FolderOpen,
  CheckCircle2,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  setHours,
  setMinutes,
  setSeconds,
  isSameDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface SpecialistProfile {
  id: string;
  full_name: string | null;
  email: string | null;
  phone: string | null;
  whatsapp: string | null;
  cpf: string | null;
  specialty: string | null;
  council: string | null;
  council_number: string | null;
  gender: string | null;
  birth_date: string | null;
  avatar_url: string | null;
  cep: string | null;
  address_street: string | null;
  address_number: string | null;
  address_complement: string | null;
  address_neighborhood: string | null;
  address_city: string | null;
  address_state: string | null;
  created_at: string | null;
  wallet_start: number;
  wallet_vip: number;
  wallet_master: number;
  wallet_total: number;
}

interface BookingInfo {
  id: string;
  user_id: string;
  created_at: string;
  start_time: string;
  end_time: string;
  status: string;
  total_cost: number;
  credits_used: number;
  credit_tier_raw: string;
  credit_tx_type: string;
  credit_expires_at: string | null;
  gross_value_brl: number;
  hourly_rate_brl: number;
  pricing_label: string;
  room_tier: string;
  specialist_name: string;
  room_name: string;
  room_id: string;
  clinic_name: string;
  is_contract: boolean;
  is_subcontract: boolean;
  contract_id: string | null;
  contract_type: string | null;
  contract_pdf_url: string | null;
  cohost_name: string | null;
  cohost_split_pct: number;
  platform_fee_brl: number;
  cohost_payout_brl: number;
  host_payout_brl: number;
}

interface AdminBookingsTabProps {
  onOpenSpecialistDossier?: (
    specialistId: string,
    specialistName: string,
  ) => void;
}

function normalizeTier(tier?: string | null): "start" | "vip" | "master" {
  const t = (tier || "start").toLowerCase().trim();
  if (t.includes("master")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

function formatTierLabel(tier: "start" | "vip" | "master"): string {
  if (tier === "master") return "Master";
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

function normalizeHourSlotFormat(rawSlot: string): string {
  if (!rawSlot || typeof rawSlot !== "string") return "";
  const clean = rawSlot.trim();
  const startPart = clean.split("-")[0].trim().replace(":", "h");
  const startHour = parseInt(startPart.split("h")[0], 10);
  if (isNaN(startHour)) return "";
  const endHour = startHour + 1;
  return `${startHour.toString().padStart(2, "0")}h-${endHour.toString().padStart(2, "0")}h`;
}

export function AdminBookingsTab({
  onOpenSpecialistDossier,
}: AdminBookingsTabProps) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingInfo[]>([]);
  const [profilesById, setProfilesById] = useState<
    Map<string, SpecialistProfile>
  >(new Map());

  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Modal de Visualização de Reserva (Sheet)
  const [selectedBooking, setSelectedBooking] = useState<BookingInfo | null>(
    null,
  );
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal de Perfil do Profissional e Injeção de Créditos (Sheet)
  const [selectedSpecialist, setSelectedSpecialist] =
    useState<SpecialistProfile | null>(null);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  const [injectAmount, setInjectAmount] = useState("8");
  const [injectTier, setInjectTier] = useState<"start" | "vip" | "master">(
    "start",
  );
  const [injectValidityDays, setInjectValidityDays] = useState("30");
  const [injectReason, setInjectReason] = useState("");
  const [injectLoading, setInjectLoading] = useState(false);

  // Modal de Reagendamento (Dialog)
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    new Date(),
  );
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [candidateRooms, setCandidateRooms] = useState<any[]>([]);
  const [selectedRescheduleRoomId, setSelectedRescheduleRoomId] =
    useState<string>("");

  // Modal de Nova Reserva Manual pelo Admin
  const [isNewBookingOpen, setIsNewBookingOpen] = useState(false);
  const [allSpecialists, setAllSpecialists] = useState<any[]>([]);
  const [allActiveRooms, setAllActiveRooms] = useState<any[]>([]);
  const [newBookingSpecialistId, setNewBookingSpecialistId] =
    useState<string>("");
  const [newBookingRoomId, setNewBookingRoomId] = useState<string>("");
  const [newBookingDate, setNewBookingDate] = useState<Date | undefined>(
    new Date(),
  );
  const [newBookingSelectedSlots, setNewBookingSelectedSlots] = useState<
    string[]
  >([]);
  const [newBookingAgreedBrl, setNewBookingAgreedBrl] = useState<string>("");

  useEffect(() => {
    fetchBookings();
  }, [startDate, endDate]);

  useEffect(() => {
    if (isRescheduleOpen && selectedRescheduleRoomId && rescheduleDate) {
      loadRoomScheduleForDate(
        selectedRescheduleRoomId,
        rescheduleDate,
        selectedBooking?.id,
      );
    }
  }, [isRescheduleOpen, rescheduleDate, selectedRescheduleRoomId]);

  useEffect(() => {
    if (isNewBookingOpen && newBookingRoomId && newBookingDate) {
      setNewBookingSelectedSlots([]);
      loadRoomScheduleForDate(newBookingRoomId, newBookingDate);
    }
  }, [isNewBookingOpen, newBookingRoomId, newBookingDate]);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const start = startOfDay(parseISO(startDate)).toISOString();
      const end = endOfDay(parseISO(endDate)).toISOString();

      const { data: rawBookings, error: bErr } = await supabase
        .from("bookings")
        .select(
          "id, created_at, start_time, end_time, status, total_cost, upgrade_fee_amount, room_id, user_id, contract_id, booking_origin, agreed_value_brl",
        )
        .gte("start_time", start)
        .lte("start_time", end)
        .order("start_time", { ascending: true });

      if (bErr) throw new Error(bErr.message || JSON.stringify(bErr));

      if (!rawBookings || rawBookings.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const bookingIds = rawBookings.map((b: any) => b.id);
      const roomIds = [
        ...new Set(rawBookings.map((b: any) => b.room_id).filter(Boolean)),
      ];
      const userIds = [
        ...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean)),
      ];

      const [
        roomsRes,
        packagesRes,
        walletRes,
        subsRes,
        categoriesRes,
        couponsRes,
        usersRes,
        contractsRes,
      ] = await Promise.all([
        roomIds.length > 0
          ? supabase
              .from("rooms")
              .select(
                "id, name, host_id, tier, category_id, modalities, address_details",
              )
              .in("id", roomIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("packages").select("id, tier, hours, price, active"),
        userIds.length > 0
          ? supabase
              .from("wallet_transactions")
              .select(
                "id, user_id, amount, type, description, tier, created_at, expires_at",
              )
              .in("user_id", userIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        userIds.length > 0
          ? supabase
              .from("subscriptions")
              .select("id, user_id, tier, hours, status, created_at")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("room_categories")
          .select("id, name, credit_cost_per_hour, upgrade_fee_per_hour"),
        bookingIds.length > 0
          ? supabase
              .from("coupon_uses")
              .select("booking_id, discount_applied")
              .in("booking_id", bookingIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length > 0
          ? supabase
              .from("profiles")
              .select(
                "id, full_name, email, phone, whatsapp, cpf, specialty, council, council_number, gender, birth_date, avatar_url, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, created_at",
              )
              .in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        roomIds.length > 0
          ? supabase.from("room_contracts").select("*").in("room_id", roomIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const roomsData = roomsRes.data || [];
      const roomsMap = new Map<string, any>(
        roomsData.map((r: any) => [r.id, r]),
      );

      const hostIds = [
        ...new Set(roomsData.map((r: any) => r.host_id).filter(Boolean)),
      ];

      const hostsRes =
        hostIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", hostIds)
          : { data: [] as any[] };

      const hostsMap = new Map<string, string>(
        hostsRes.data?.map((h: any) => [h.id, h.full_name]) || [],
      );

      const userWalletMap = new Map<string, any[]>();
      (walletRes.data || []).forEach((tx: any) => {
        const list = userWalletMap.get(tx.user_id) || [];
        list.push(tx);
        userWalletMap.set(tx.user_id, list);
      });

      const nowDate = new Date();
      const richProfilesMap = new Map<string, SpecialistProfile>();
      (usersRes.data || []).forEach((u: any) => {
        const txs = userWalletMap.get(u.id) || [];
        let startBal = 0;
        let vipBal = 0;
        let masterBal = 0;

        txs.forEach((tx: any) => {
          const amt = Number(tx.amount || 0);
          if (amt > 0 && tx.expires_at && new Date(tx.expires_at) < nowDate) {
            return;
          }
          const t = normalizeTier(tx.tier);
          if (t === "master") masterBal += amt;
          else if (t === "vip") vipBal += amt;
          else startBal += amt;
        });

        richProfilesMap.set(u.id, {
          ...u,
          wallet_start: Math.max(0, startBal),
          wallet_vip: Math.max(0, vipBal),
          wallet_master: Math.max(0, masterBal),
          wallet_total: Math.max(0, startBal + vipBal + masterBal),
        });
      });
      setProfilesById(richProfilesMap);

      if (selectedSpecialist && richProfilesMap.has(selectedSpecialist.id)) {
        setSelectedSpecialist(richProfilesMap.get(selectedSpecialist.id)!);
      }

      const contractsData = contractsRes.data || [];
      const contractsById = new Map<string, any>(
        contractsData.map((c: any) => [c.id, c]),
      );

      // Mapeia todos os contratos de Co-Anfitrião ativos por sala para validar a data exata de cada reserva
      const activeCohostContractsListByRoomId = new Map<string, any[]>();
      contractsData.forEach((c: any) => {
        if (
          c.status === "active" &&
          c.contract_type === "monthly_exclusive" &&
          c.allow_sublease
        ) {
          const list = activeCohostContractsListByRoomId.get(c.room_id) || [];
          list.push(c);
          activeCohostContractsListByRoomId.set(c.room_id, list);
        }
      });

      // Retorna o contrato do Co-Anfitrião APENAS se a reserva ocorrer a partir do start_date e até o end_date dele
      const findCohostForBookingDate = (
        roomId: string,
        bookingStartIso: string,
      ) => {
        const list = activeCohostContractsListByRoomId.get(roomId) || [];
        if (list.length === 0) return null;
        const bDateStr = format(parseISO(bookingStartIso), "yyyy-MM-dd");
        return (
          list.find(
            (c: any) => bDateStr >= c.start_date && bDateStr <= c.end_date,
          ) || null
        );
      };

      const packageRateMap: Record<
        "start" | "vip" | "master",
        Map<number, number>
      > = {
        start: new Map<number, number>(),
        vip: new Map<number, number>(),
        master: new Map<number, number>(),
      };

      (packagesRes.data || []).forEach((pkg: any) => {
        const t = normalizeTier(pkg.tier);
        const h = Math.max(1, Number(pkg.hours) || 1);
        const rawPrice = Number(pkg.price) || 0;
        if (rawPrice <= 0) return;

        const hourlyRate = h > 1 && rawPrice > 120 ? rawPrice / h : rawPrice;
        packageRateMap[t].set(h, hourlyRate);
      });

      const categoriesMap = new Map<string, any>(
        (categoriesRes.data || []).map((c: any) => [c.id, c]),
      );

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

      const userSubsMap = new Map<string, any[]>();
      (subsRes.data || []).forEach((sub: any) => {
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

      const formattedBookings: BookingInfo[] = rawBookings.map((b: any) => {
        const room = roomsMap.get(b.room_id);
        const hostId = room?.host_id;
        const clinicName = hostId ? hostsMap.get(hostId) : "Fusion Clinic";
        const roomTier = normalizeTier(room?.tier);
        const specialistProfile = richProfilesMap.get(b.user_id);

        const slotUnits = calculateSlotUnits(b.start_time, b.end_time);

        // Verifica se a sala possui Co-Anfitrião vigente NA DATA DESTA RESERVA (>= start_date e <= end_date)
        const roomCohostContract = findCohostForBookingDate(
          b.room_id,
          b.start_time,
        );

        const linkedContract = b.contract_id
          ? contractsById.get(b.contract_id)
          : null;
        const isContractBooking = Boolean(
          b.contract_id ||
          (b.booking_origin && String(b.booking_origin).startsWith("contract")),
        );

        if (isContractBooking) {
          const contractSessionVal =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : Number(linkedContract?.session_value || 0);

          // Se este contrato fixo (Turno/Diária) está dentro da sala de um Co-Anfitrião ativo na data
          const isSubContractUnderCohost = Boolean(
            roomCohostContract &&
            b.contract_id &&
            b.contract_id !== roomCohostContract.id,
          );

          // AQUI: Usamos os valores configurados NESTE subcontrato, e não os valores globais do Coanfitrião!
          const customPlatformFeePctForSubcontract = isSubContractUnderCohost
            ? Number(linkedContract?.platform_fee_pct ?? 20) / 100
            : Number(linkedContract?.platform_fee_pct ?? 15) / 100;

          const customCohostPctForSubcontract = isSubContractUnderCohost
            ? Number(linkedContract?.host_split_pct ?? 80) / 100
            : 0;

          const platformFee =
            contractSessionVal * customPlatformFeePctForSubcontract;
          const cohostPayout =
            contractSessionVal * customCohostPctForSubcontract;

          const hostPayout = isSubContractUnderCohost
            ? 0
            : Math.max(0, contractSessionVal - platformFee);

          const cType = linkedContract?.contract_type || b.booking_origin || "";
          let typeLabel = isSubContractUnderCohost
            ? "Subcontrato Fixo (Co-Host)"
            : "Contrato • Alocação Fixa";
          if (cType.includes("monthly_exclusive"))
            typeLabel = "Contrato • Sala Fixa Mensal";
          else if (cType.includes("fixed_shift"))
            typeLabel = isSubContractUnderCohost
              ? "Subcontrato • Turno Fixo"
              : "Contrato • Turno Fixo";
          else if (cType.includes("fixed_daily"))
            typeLabel = isSubContractUnderCohost
              ? "Subcontrato • Diária Fixa"
              : "Contrato • Diária Fixa";

          return {
            id: b.id,
            user_id: b.user_id,
            created_at: b.created_at,
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            total_cost: slotUnits,
            credits_used: 0,
            credit_tier_raw: room?.tier || roomTier,
            credit_tx_type: "contract",
            credit_expires_at: null,
            gross_value_brl: contractSessionVal,
            hourly_rate_brl: contractSessionVal / slotUnits,
            pricing_label: typeLabel,
            room_tier: roomTier,
            room_id: b.room_id,
            specialist_name:
              linkedContract?.specialist_name ||
              specialistProfile?.full_name ||
              "Locatário de Contrato",
            room_name: room?.name || "Sala Removida",
            clinic_name: clinicName || "Fusion Clinic",
            is_contract: true,
            is_subcontract: isSubContractUnderCohost,
            contract_id: b.contract_id || null,
            contract_type: linkedContract?.contract_type || null,
            contract_pdf_url: linkedContract?.pdf_url || null,
            cohost_name: isSubContractUnderCohost
              ? roomCohostContract.specialist_name
              : null,
            cohost_split_pct: isSubContractUnderCohost
              ? Number(linkedContract?.host_split_pct ?? 80)
              : 0,
            platform_fee_brl: platformFee,
            cohost_payout_brl: cohostPayout,
            host_payout_brl: hostPayout,
          };
        }

        const cohostName = roomCohostContract?.specialist_name || null;
        const cohostSplitPct = roomCohostContract
          ? Number(roomCohostContract.cohost_split_pct || 80)
          : 0;

        const computeAvulsoSplit = (grossVal: number) => {
          if (roomCohostContract) {
            const cohostShare = grossVal * (cohostSplitPct / 100);
            const platformFee = Math.max(0, grossVal - cohostShare);
            return {
              platformFee,
              cohostPayout: cohostShare,
              hostPayout: 0,
            };
          }
          const platformFee = grossVal * 0.2;
          const netAfterPlatform = Math.max(0, grossVal - platformFee);
          return {
            platformFee,
            cohostPayout: 0,
            hostPayout: netAfterPlatform,
          };
        };

        const rawTotalCost = Number(b.total_cost || 0);
        const upgradeFee = Number(b.upgrade_fee_amount || 0);
        const discount = couponDiscountMap.get(b.id) || 0;

        const userTxs = userWalletMap.get(b.user_id) || [];
        const bookingTime = new Date(b.created_at).getTime();

        const matchingDebit = userTxs.find((tx: any) => {
          if (Number(tx.amount) >= 0) return false;
          const txTime = new Date(tx.created_at).getTime();
          return Math.abs(txTime - bookingTime) <= 10 * 60 * 1000;
        });

        const positiveTxs = userTxs.filter((tx: any) => Number(tx.amount) > 0);
        const defaultPositiveType =
          positiveTxs[positiveTxs.length - 1]?.type || "credit";

        if (Number(b.agreed_value_brl) > 0 || rawTotalCost >= slotUnits * 20) {
          const baseVal =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : rawTotalCost;
          const finalBrl = Math.max(0, baseVal + upgradeFee - discount);
          const split = computeAvulsoSplit(finalBrl);

          return {
            id: b.id,
            user_id: b.user_id,
            created_at: b.created_at,
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            total_cost: rawTotalCost,
            credits_used: slotUnits,
            credit_tier_raw: matchingDebit?.tier || room?.tier || roomTier,
            credit_tx_type: defaultPositiveType,
            credit_expires_at: null,
            gross_value_brl: finalBrl,
            hourly_rate_brl: finalBrl / slotUnits,
            pricing_label: `${formatTierLabel(roomTier)} • Reserva Direta`,
            room_tier: roomTier,
            room_id: b.room_id,
            specialist_name:
              specialistProfile?.full_name || "Especialista Desconhecido",
            room_name: room?.name || "Sala Removida",
            clinic_name: clinicName || "Fusion Clinic",
            is_contract: false,
            is_subcontract: false,
            contract_id: null,
            contract_type: null,
            contract_pdf_url: null,
            cohost_name: cohostName,
            cohost_split_pct: cohostSplitPct,
            platform_fee_brl: split.platformFee,
            cohost_payout_brl: split.cohostPayout,
            host_payout_brl: split.hostPayout,
          };
        }

        const creditsForThisSlot =
          rawTotalCost > 0 && rawTotalCost <= slotUnits * 2
            ? rawTotalCost
            : slotUnits;

        let creditTierUsed: "start" | "vip" | "master" = roomTier;
        let rawTierString: string = room?.tier || roomTier;

        if (matchingDebit?.tier) {
          creditTierUsed = normalizeTier(matchingDebit.tier);
          rawTierString = matchingDebit.tier;
        }

        const compatibleTiers: ("start" | "vip" | "master")[] =
          roomTier === "master"
            ? ["master"]
            : roomTier === "vip"
              ? ["vip", "master"]
              : ["start", "vip", "master"];

        const purchaseCredits = positiveTxs.filter(
          (tx: any) =>
            !String(tx.description || "")
              .toLowerCase()
              .includes("estorno"),
        );

        const validPriorPurchases = purchaseCredits.filter((tx: any) => {
          const createdMs = new Date(tx.created_at).getTime();
          const notAfterBooking = createdMs <= bookingTime + 60 * 1000;
          const notExpiredAtBooking =
            !tx.expires_at || new Date(tx.expires_at).getTime() >= bookingTime;
          return notAfterBooking && notExpiredAtBooking;
        });

        const candidateCredits =
          validPriorPurchases.length > 0
            ? validPriorPurchases
            : purchaseCredits;

        const sourceCreditTx =
          [...candidateCredits]
            .reverse()
            .find((tx: any) => normalizeTier(tx.tier) === creditTierUsed) ||
          [...candidateCredits]
            .reverse()
            .find((tx: any) =>
              compatibleTiers.includes(normalizeTier(tx.tier)),
            ) ||
          candidateCredits[candidateCredits.length - 1];

        let detectedPackageHours: number | null = null;
        if (sourceCreditTx) {
          creditTierUsed = normalizeTier(sourceCreditTx.tier || roomTier);
          if (!matchingDebit?.tier && sourceCreditTx.tier) {
            rawTierString = sourceCreditTx.tier;
          }
          const txAmt = Math.round(Number(sourceCreditTx.amount));
          const descMatch = String(sourceCreditTx.description || "").match(
            /(\d+)\s*(?:h|hora|horas|crédito|credito)/i,
          );
          const candidateHours =
            descMatch && Number(descMatch[1]) > 0
              ? Number(descMatch[1])
              : txAmt;

          if (candidateHours > 0 && candidateHours <= 60) {
            detectedPackageHours = candidateHours;
          }
        } else {
          const userSubs = userSubsMap.get(b.user_id) || [];
          const activeSub =
            userSubs.find((s: any) => s.status === "ACTIVE") || userSubs[0];
          if (activeSub) {
            creditTierUsed = normalizeTier(activeSub.tier || roomTier);
            if (!matchingDebit?.tier && activeSub.tier) {
              rawTierString = activeSub.tier;
            }
            detectedPackageHours = Number(activeSub.hours) || null;
          }
        }

        let { rate: resolvedHourlyRate, matchedHours } =
          getRateFromPackageTable(creditTierUsed, detectedPackageHours);

        if (resolvedHourlyRate === null && creditTierUsed !== roomTier) {
          const fallbackRoomPkg = getRateFromPackageTable(
            roomTier,
            detectedPackageHours,
          );
          resolvedHourlyRate = fallbackRoomPkg.rate;
          matchedHours = fallbackRoomPkg.matchedHours;
        }

        let pricingOriginLabel = "";
        if (resolvedHourlyRate !== null) {
          pricingOriginLabel = matchedHours
            ? `${formatTierLabel(creditTierUsed)} • Pacote ${matchedHours}h`
            : `${formatTierLabel(creditTierUsed)} • Crédito`;
        } else {
          const roomModalityRate = extractRoomModalitiesHourlyRate(
            room?.modalities,
            room?.address_details,
          );
          const categoryObj = room?.category_id
            ? categoriesMap.get(room.category_id)
            : null;
          const categoryRate =
            categoryObj && Number(categoryObj.credit_cost_per_hour) >= 15
              ? Number(categoryObj.credit_cost_per_hour)
              : null;

          if (roomModalityRate) {
            resolvedHourlyRate = roomModalityRate;
            pricingOriginLabel = `${formatTierLabel(roomTier)} • Tarifa da Sala`;
          } else if (categoryRate) {
            resolvedHourlyRate = categoryRate;
            pricingOriginLabel = `${formatTierLabel(roomTier)} • Categoria`;
          } else {
            const defaultTierRates: Record<"start" | "vip" | "master", number> =
              {
                start: 33.38,
                vip: 41.13,
                master: 60,
              };
            resolvedHourlyRate = defaultTierRates[roomTier];
            pricingOriginLabel = `${formatTierLabel(roomTier)} • Padrão`;
          }
        }

        const grossBrl = Math.max(
          0,
          creditsForThisSlot * resolvedHourlyRate + upgradeFee - discount,
        );
        const split = computeAvulsoSplit(grossBrl);

        return {
          id: b.id,
          user_id: b.user_id,
          created_at: b.created_at,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          total_cost: rawTotalCost,
          credits_used: creditsForThisSlot,
          credit_tier_raw: rawTierString || creditTierUsed,
          credit_tx_type: sourceCreditTx?.type || defaultPositiveType,
          credit_expires_at: sourceCreditTx?.expires_at || null,
          gross_value_brl: grossBrl,
          hourly_rate_brl: resolvedHourlyRate,
          pricing_label: pricingOriginLabel,
          room_tier: roomTier,
          room_id: b.room_id,
          specialist_name:
            specialistProfile?.full_name || "Especialista Desconhecido",
          room_name: room?.name || "Sala Removida",
          clinic_name: clinicName || "Fusion Clinic",
          is_contract: false,
          is_subcontract: false,
          contract_id: null,
          contract_type: null,
          contract_pdf_url: null,
          cohost_name: cohostName,
          cohost_split_pct: cohostSplitPct,
          platform_fee_brl: split.platformFee,
          cohost_payout_brl: split.cohostPayout,
          host_payout_brl: split.hostPayout,
        };
      });

      setBookings(formattedBookings);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Aviso do Sistema",
        description:
          err.message === "{}" ? "Bloqueio de segurança (RLS)." : err.message,
      });
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const handleOpenSpecialistProfile = async (userId: string) => {
    if (!userId) return;
    setInjectAmount("8");
    setInjectTier("start");
    setInjectValidityDays("30");
    setInjectReason("");

    const cached = profilesById.get(userId);
    if (cached) {
      setSelectedSpecialist(cached);
      setIsProfileOpen(true);
      return;
    }

    setActionLoading(true);
    try {
      const { data: prof } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", userId)
        .single();

      if (prof) {
        const specObj: SpecialistProfile = {
          ...prof,
          wallet_start: 0,
          wallet_vip: 0,
          wallet_master: 0,
          wallet_total: 0,
        };
        setSelectedSpecialist(specObj);
        setIsProfileOpen(true);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Não foi possível abrir o perfil",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleInjectCredits = async () => {
    if (!selectedSpecialist) return;
    const hoursNum = Number(injectAmount);
    if (isNaN(hoursNum) || hoursNum === 0) {
      return toast({
        variant: "destructive",
        title: "Quantidade inválida",
        description:
          "Informe a quantidade de créditos/horas que deseja injetar (ex: 8, 16 ou -1 para abater).",
      });
    }

    setInjectLoading(true);
    try {
      const days = Math.max(1, Number(injectValidityDays) || 30);
      const expiresAtIso =
        hoursNum > 0
          ? new Date(Date.now() + days * 24 * 60 * 60 * 1000).toISOString()
          : null;

      const tierName = formatTierLabel(injectTier);
      const defaultDesc =
        hoursNum > 0
          ? `Recarga Admin Manual (${hoursNum}h ${tierName})`
          : `Ajuste/Débito Admin Manual (${hoursNum}h ${tierName})`;

      const finalDescription = injectReason.trim()
        ? `${injectReason.trim()} (${hoursNum}h ${tierName})`
        : defaultDesc;

      const { error: txErr } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: selectedSpecialist.id,
          amount: hoursNum,
          type: hoursNum > 0 ? "credit" : "debit",
          tier: injectTier,
          description: finalDescription,
          expires_at: expiresAtIso,
        });

      if (txErr) throw txErr;

      if (hoursNum > 0) {
        try {
          await supabase.from("notifications").insert({
            user_id: selectedSpecialist.id,
            type: "wallet_credit",
            title: "Novos Créditos Adicionados! 🎉",
            content: `Foram adicionadas ${hoursNum}h de créditos (${tierName}) em sua carteira.`,
            link: "/dashboard",
            is_read: false,
          });
        } catch {}
      }

      const updatedSpec: SpecialistProfile = {
        ...selectedSpecialist,
        wallet_start:
          injectTier === "start"
            ? Math.max(0, selectedSpecialist.wallet_start + hoursNum)
            : selectedSpecialist.wallet_start,
        wallet_vip:
          injectTier === "vip"
            ? Math.max(0, selectedSpecialist.wallet_vip + hoursNum)
            : selectedSpecialist.wallet_vip,
        wallet_master:
          injectTier === "master"
            ? Math.max(0, selectedSpecialist.wallet_master + hoursNum)
            : selectedSpecialist.wallet_master,
        wallet_total: Math.max(0, selectedSpecialist.wallet_total + hoursNum),
      };

      setSelectedSpecialist(updatedSpec);
      const nextMap = new Map(profilesById);
      nextMap.set(updatedSpec.id, updatedSpec);
      setProfilesById(nextMap);
      setInjectReason("");

      toast({
        title:
          hoursNum > 0
            ? "Créditos injetados com sucesso!"
            : "Saldo ajustado com sucesso!",
        description: `${hoursNum > 0 ? `+${hoursNum}h` : `${hoursNum}h`} (${tierName}) aplicado na carteira de ${selectedSpecialist.full_name}.`,
      });

      fetchBookings();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao injetar créditos",
        description: err.message,
      });
    } finally {
      setInjectLoading(false);
    }
  };

  const handleGoToFullDossier = (spec: SpecialistProfile) => {
    try {
      sessionStorage.setItem("fusion_admin_selected_specialist_id", spec.id);
      sessionStorage.setItem(
        "fusion_admin_selected_specialist_name",
        spec.full_name || "",
      );
    } catch {}

    setIsProfileOpen(false);
    if (onOpenSpecialistDossier) {
      onOpenSpecialistDossier(spec.id, spec.full_name || "");
    } else {
      toast({
        title: "Redirecionando para Especialistas",
        description: `Abra a aba Especialistas para ver o dossiê de ${spec.full_name}.`,
      });
    }
  };

  const handleOpenReschedule = async (booking: BookingInfo) => {
    setActionLoading(true);
    try {
      setSelectedBooking(booking);
      setRescheduleDate(parseISO(booking.start_time));
      setSelectedSlot("");

      const { data: originalRoom } = await supabase
        .from("rooms")
        .select("id, name, image_url, tier, is_active, host_id")
        .eq("id", booking.room_id)
        .single();

      let query = supabase
        .from("rooms")
        .select("id, name, image_url, tier, is_active, host_id")
        .eq("is_active", true);

      if (originalRoom?.tier) {
        query = query.eq("tier", originalRoom.tier);
      }

      const { data: candidates } = await query;
      let finalCandidates = candidates || [];

      if (
        originalRoom &&
        !finalCandidates.some((c: any) => c.id === booking.room_id)
      ) {
        finalCandidates.push(originalRoom);
      }

      const candidateHostIds = [
        ...new Set(finalCandidates.map((c: any) => c.host_id).filter(Boolean)),
      ];
      const hostsRes =
        candidateHostIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", candidateHostIds)
          : { data: [] as any[] };
      const hostNameMap = new Map(
        (hostsRes.data || []).map((h: any) => [h.id, h.full_name]),
      );

      finalCandidates = finalCandidates.map((c: any) => ({
        ...c,
        host_name: hostNameMap.get(c.host_id) || "Clínica Padrão",
      }));

      setCandidateRooms(finalCandidates);
      setSelectedRescheduleRoomId(booking.room_id);
      setIsRescheduleOpen(true);
    } catch (err: any) {
      toast({
        title: "Erro ao preparar reagendamento.",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const loadRoomScheduleForDate = async (
    roomId: string,
    date: Date,
    excludeBookingId?: string,
  ) => {
    setLoadingSlots(true);
    setSelectedSlot("");
    setAvailableSlots([]);

    try {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("availability, blocked_dates")
        .eq("id", roomId)
        .single();

      const selectedDateStr = format(date, "yyyy-MM-dd");
      if (
        Array.isArray(roomData?.blocked_dates) &&
        roomData.blocked_dates.includes(selectedDateStr)
      ) {
        setAvailableSlots([]);
        setLoadingSlots(false);
        return;
      }

      let availability = roomData?.availability;
      if (typeof availability === "string") {
        try {
          availability = JSON.parse(availability);
        } catch {
          availability = null;
        }
      }

      const startIso = startOfDay(date).toISOString();
      const endIso = endOfDay(date).toISOString();

      let query = supabase
        .from("bookings")
        .select(
          "id, start_time, end_time, status, created_at, asaas_payment_id",
        )
        .eq("room_id", roomId)
        .neq("status", "cancelled")
        .lt("start_time", endIso)
        .gt("end_time", startIso);

      if (excludeBookingId) {
        query = query.neq("id", excludeBookingId);
      }

      const { data: existingBookings } = await query;

      const nowMs = Date.now();
      const activeBookings = (existingBookings || []).filter((b: any) => {
        if (
          ["confirmed", "in_progress", "completed"].includes(b.status || "")
        ) {
          return true;
        }
        if (b.status === "pending_payment" || b.status === "pending") {
          const lockTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          const maxLock = b.asaas_payment_id ? 30 * 60 * 1000 : 6 * 60 * 1000;
          return nowMs - lockTime <= maxLock;
        }
        return false;
      });

      let dailySlots: string[] = [];
      const dayOfWeek = date.getDay();

      const defaultFullSlots = [
        "08h-09h",
        "09h-10h",
        "10h-11h",
        "11h-12h",
        "13h-14h",
        "14h-15h",
        "15h-16h",
        "16h-17h",
        "17h-18h",
        "18h-19h",
        "19h-20h",
        "20h-21h",
        "21h-22h",
      ];

      if (availability && Array.isArray(availability.weekConfig)) {
        const weekConfig = availability.weekConfig.find(
          (w: any) => w.day === dayOfWeek,
        );
        if (weekConfig && weekConfig.enabled) {
          if (weekConfig.rentalType === "hourly") {
            dailySlots =
              Array.isArray(weekConfig.availableHours) &&
              weekConfig.availableHours.length > 0
                ? weekConfig.availableHours
                    .map(normalizeHourSlotFormat)
                    .filter(Boolean)
                : [...defaultFullSlots];
          } else if (weekConfig.rentalType === "shift") {
            if (weekConfig.selectedShifts?.includes("morning"))
              dailySlots.push("08h-09h", "09h-10h", "10h-11h", "11h-12h");
            if (weekConfig.selectedShifts?.includes("afternoon"))
              dailySlots.push(
                "13h-14h",
                "14h-15h",
                "15h-16h",
                "16h-17h",
                "17h-18h",
              );
            if (weekConfig.selectedShifts?.includes("night"))
              dailySlots.push("18h-19h", "19h-20h", "20h-21h", "21h-22h");
          }
        }

        if (Array.isArray(availability.exceptions)) {
          const exception = availability.exceptions.find(
            (e: any) => e?.date && isSameDay(new Date(e.date), date),
          );
          if (exception) {
            if (exception.type === "block") {
              if (exception.isFullDay) {
                dailySlots = [];
              } else {
                const blockedNormalized = (exception.hours || []).map(
                  normalizeHourSlotFormat,
                );
                dailySlots = dailySlots.filter(
                  (slot) => !blockedNormalized.includes(slot),
                );
              }
            } else if (exception.type === "extra") {
              dailySlots = (exception.hours || [])
                .map(normalizeHourSlotFormat)
                .filter(Boolean);
            }
          }
        }
      } else {
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          dailySlots = [...defaultFullSlots];
        }
      }

      const now = new Date();
      const isToday = isSameDay(date, now);
      const currentHour = now.getHours();

      const finalFreeSlots = dailySlots.filter((slot) => {
        const startHour = parseInt(slot.split("h")[0], 10);
        if (isToday && startHour <= currentHour) return false;

        const slotStartMs = setSeconds(
          setMinutes(setHours(date, startHour), 0),
          0,
        ).getTime();
        const slotEndMs = setSeconds(
          setMinutes(setHours(date, startHour), 50),
          0,
        ).getTime();

        const isOccupied = activeBookings.some((b: any) => {
          const bStart = new Date(b.start_time).getTime();
          const rawBEnd = new Date(b.end_time).getTime();
          const bEnd = rawBEnd > bStart ? rawBEnd : bStart + 50 * 60 * 1000;
          return slotStartMs < bEnd && slotEndMs > bStart;
        });

        return !isOccupied;
      });

      finalFreeSlots.sort(
        (a, b) => parseInt(a.split("h")[0], 10) - parseInt(b.split("h")[0], 10),
      );
      setAvailableSlots(finalFreeSlots);
    } catch (error) {
      console.error("Erro ao carregar agenda da sala:", error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleOpenNewManualBooking = async () => {
    setActionLoading(true);
    try {
      const [specsRes, roomsRes] = await Promise.all([
        supabase
          .from("profiles")
          .select("id, full_name, email, specialty")
          .order("full_name", { ascending: true }),
        supabase
          .from("rooms")
          .select("id, name, tier, host_id, is_active, address_details")
          .eq("is_active", true)
          .order("name", { ascending: true }),
      ]);

      const specs = specsRes.data || [];
      const activeRooms = roomsRes.data || [];

      setAllSpecialists(specs);
      setAllActiveRooms(activeRooms);

      if (specs.length > 0 && !newBookingSpecialistId) {
        setNewBookingSpecialistId(specs[0].id);
      }
      if (activeRooms.length > 0) {
        setNewBookingRoomId(activeRooms[0].id);
      }
      setNewBookingDate(new Date());
      setNewBookingSelectedSlots([]);
      setNewBookingAgreedBrl("");
      setIsNewBookingOpen(true);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao carregar dados",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCreateManualBooking = async () => {
    if (
      !newBookingSpecialistId ||
      !newBookingRoomId ||
      !newBookingDate ||
      newBookingSelectedSlots.length === 0
    ) {
      return toast({
        variant: "destructive",
        title: "Dados incompletos",
        description:
          "Selecione o especialista, a sala, a data e pelo menos um horário.",
      });
    }

    setActionLoading(true);
    try {
      const sortedSlots = [...newBookingSelectedSlots].sort(
        (a, b) => parseInt(a.split("h")[0], 10) - parseInt(b.split("h")[0], 10),
      );

      const payloads = sortedSlots.map((slot) => {
        const startHour = parseInt(slot.split("h")[0], 10);
        const slotStart = setSeconds(
          setMinutes(setHours(newBookingDate, startHour), 0),
          0,
        );
        const slotEnd = setSeconds(
          setMinutes(setHours(newBookingDate, startHour), 50),
          0,
        );

        const customBrl = Number(newBookingAgreedBrl);

        return {
          user_id: newBookingSpecialistId,
          room_id: newBookingRoomId,
          start_time: slotStart.toISOString(),
          end_time: slotEnd.toISOString(),
          status: "confirmed",
          total_cost: 1,
          booking_origin: "admin_manual",
          agreed_value_brl:
            !isNaN(customBrl) && customBrl > 0
              ? Number((customBrl / sortedSlots.length).toFixed(2))
              : null,
        };
      });

      const { data: inserted, error } = await supabase
        .from("bookings")
        .insert(payloads)
        .select("id");

      if (error) throw error;

      if (inserted && inserted[0]?.id) {
        sendBookingNotificationEmails(inserted[0].id).catch(console.error);
      }

      toast({
        title: "Reserva criada com sucesso! 🎉",
        description: `${sortedSlots.length} horário(s) bloqueado(s) na agenda e notificações enviadas.`,
      });

      setIsNewBookingOpen(false);
      fetchBookings();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Conflito ou erro ao criar reserva",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking || selectedBooking.status === "cancelled") return;

    if (selectedBooking.is_contract) {
      if (
        !confirm(
          `Esta reserva pertence a um CONTRATO (${selectedBooking.pricing_label}).\n\nDeseja cancelar e liberar a agenda desta data específica para ${selectedBooking.specialist_name}?`,
        )
      )
        return;

      setActionLoading(true);
      try {
        const { error } = await supabase
          .from("bookings")
          .update({ status: "cancelled" })
          .eq("id", selectedBooking.id);
        if (error) throw error;

        sendBookingCancellationEmails(selectedBooking.id).catch(console.error);

        toast({
          title: "Data contratual liberada!",
          description:
            "O horário foi liberado na agenda para locações avulsas.",
        });
        setIsViewOpen(false);
        fetchBookings();
      } catch (err: any) {
        toast({
          title: "Erro ao cancelar",
          description: err.message,
          variant: "destructive",
        });
      } finally {
        setActionLoading(false);
      }
      return;
    }

    const hoursToRefund = Number(selectedBooking.credits_used) || 1;
    const tierLabel = formatTierLabel(
      normalizeTier(selectedBooking.credit_tier_raw),
    );

    if (
      !confirm(
        `Tem certeza que deseja CANCELAR esta reserva?\n\nSerão estornadas ${hoursToRefund}h (Crédito ${tierLabel}) para a carteira de ${selectedBooking.specialist_name}.`,
      )
    )
      return;

    setActionLoading(true);
    try {
      const bookingRefTag = `[#${selectedBooking.id.slice(0, 8)}]`;

      const { data: existingRefund } = await supabase
        .from("wallet_transactions")
        .select("id")
        .eq("user_id", selectedBooking.user_id)
        .ilike("description", `%${bookingRefTag}%`)
        .limit(1);

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", selectedBooking.id);

      if (updateError) throw updateError;

      sendBookingCancellationEmails(selectedBooking.id).catch(console.error);

      let refunded = false;
      if (
        hoursToRefund > 0 &&
        selectedBooking.user_id &&
        (!existingRefund || existingRefund.length === 0)
      ) {
        const now = new Date();
        const refundExpiresAt =
          selectedBooking.credit_expires_at &&
          new Date(selectedBooking.credit_expires_at) > now
            ? selectedBooking.credit_expires_at
            : new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000).toISOString();

        const formattedSlotDate = format(
          parseISO(selectedBooking.start_time),
          "dd/MM/yyyy 'às' HH:mm",
        );

        const { error: walletError } = await supabase
          .from("wallet_transactions")
          .insert({
            user_id: selectedBooking.user_id,
            amount: hoursToRefund,
            type: selectedBooking.credit_tx_type || "credit",
            tier: selectedBooking.credit_tier_raw || "start",
            description: `Estorno de reserva cancelada: ${selectedBooking.room_name} (${formattedSlotDate}) ${bookingRefTag}`,
            expires_at: refundExpiresAt,
          });

        if (walletError) throw walletError;
        refunded = true;

        try {
          await supabase.from("notifications").insert({
            user_id: selectedBooking.user_id,
            type: "booking_cancelled",
            title: "Reserva Cancelada e Horas Estornadas",
            content: `Sua reserva na sala ${selectedBooking.room_name} (${formattedSlotDate}) foi cancelada. Estornamos ${hoursToRefund}h (${tierLabel}) para sua carteira.`,
            link: "/dashboard",
            is_read: false,
          });
        } catch (notifErr) {
          console.warn("Aviso: Não foi possível criar notificação:", notifErr);
        }
      }

      toast({
        title: "Reserva cancelada e estornada!",
        description: refunded
          ? `${hoursToRefund}h (${tierLabel}) devolvida(s) para a carteira de ${selectedBooking.specialist_name}.`
          : "O status da reserva foi atualizado para cancelado.",
      });

      setIsViewOpen(false);
      fetchBookings();
    } catch (err: any) {
      toast({
        title: "Erro ao cancelar e estornar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (
      !selectedBooking ||
      !rescheduleDate ||
      !selectedSlot ||
      !selectedRescheduleRoomId
    ) {
      return toast({
        title: "Selecione a data, a sala e o horário disponível.",
        variant: "destructive",
      });
    }

    setActionLoading(true);
    try {
      const [startStr] = selectedSlot.split("-");
      const startHour = parseInt(startStr.replace("h", ""), 10);

      const origStartMs = new Date(selectedBooking.start_time).getTime();
      const origEndMs = new Date(selectedBooking.end_time).getTime();
      const origDurationMs =
        origEndMs > origStartMs ? origEndMs - origStartMs : 50 * 60 * 1000;

      const newStartDate = setSeconds(
        setMinutes(setHours(rescheduleDate, startHour), 0),
        0,
      );
      const newEndDate = new Date(newStartDate.getTime() + origDurationMs);

      const { error } = await supabase
        .from("bookings")
        .update({
          start_time: newStartDate.toISOString(),
          end_time: newEndDate.toISOString(),
          room_id: selectedRescheduleRoomId,
        })
        .eq("id", selectedBooking.id);

      if (error) throw error;

      sendBookingNotificationEmails(selectedBooking.id).catch(console.error);

      toast({ title: "Reserva reagendada com sucesso! 📅" });
      setIsRescheduleOpen(false);
      fetchBookings();
    } catch (err: any) {
      toast({
        title: "Erro ao reagendar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

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

  const handleExportExcel = () => {
    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });
    let csv =
      "ID da Reserva;Clínica;Sala;Origem / Modalidade;Data Agendada;Especialista;Entrada;Saída;Status;Valor Hora (R$);Valor Bruto (R$)\n";
    filteredBookings.forEach((b) => {
      const valorHora = b.hourly_rate_brl.toFixed(2).replace(".", ",");
      const valorTotal = b.gross_value_brl.toFixed(2).replace(".", ",");
      const agendada = format(parseISO(b.created_at), "dd/MM/yyyy HH:mm");
      const entrada = format(parseISO(b.start_time), "dd/MM/yyyy HH:mm");
      const saida = format(parseISO(b.end_time), "dd/MM/yyyy HH:mm");
      csv += `${b.id};"${b.clinic_name}";"${b.room_name}";"${b.pricing_label}";${agendada};"${b.specialist_name}";${entrada};${saida};${b.status};${valorHora};${valorTotal}\n`;
    });
    downloadCSV(csv, `Fusion_Agendamentos_${startDate}_a_${endDate}.csv`);
  };

  const handleExportFinances = () => {
    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });
    let csv =
      "ID da Reserva;Clínica (Anfitrião);Sala;Modalidade;Especialista (Cliente);Co-Anfitrião (Sublocação);Valor Bruto (R$);Taxa Fusion (R$);Repasse Co-Anfitrião (R$);Repasse Clínica (R$);Status\n";
    filteredBookings.forEach((b) => {
      csv += `${b.id};"${b.clinic_name}";"${b.room_name}";"${b.pricing_label}";"${b.specialist_name}";"${b.cohost_name || "N/A"}";${b.gross_value_brl.toFixed(2).replace(".", ",")};${b.platform_fee_brl.toFixed(2).replace(".", ",")};${b.cohost_payout_brl.toFixed(2).replace(".", ",")};${b.host_payout_brl.toFixed(2).replace(".", ",")};${b.status}\n`;
    });
    downloadCSV(csv, `Fusion_Financeiro_${startDate}_a_${endDate}.csv`);
  };

  const filteredBookings = bookings.filter((b) => {
    const matchStatus =
      statusFilter === "all" ? true : b.status === statusFilter;
    const matchOrigin =
      originFilter === "all"
        ? true
        : originFilter === "contract"
          ? b.is_contract
          : !b.is_contract;
    const matchSearch =
      b.specialist_name.toLowerCase().includes(search.toLowerCase()) ||
      b.clinic_name.toLowerCase().includes(search.toLowerCase()) ||
      b.room_name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchOrigin && matchSearch;
  });

  const totalRevenue = filteredBookings.reduce((acc, curr) => {
    if (statusFilter !== "cancelled" && curr.status === "cancelled") {
      return acc;
    }
    return acc + curr.gross_value_brl;
  }, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-0">
            Confirmado
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-slate-200 text-slate-800 border-0">
            Concluído
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-800 border-0">Cancelado</Badge>
        );
      case "pending_payment":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-0">
            Aguardando Pagamento
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-600 border-0">
            {status}
          </Badge>
        );
    }
  };

  const selectedRoomDetails = candidateRooms.find(
    (r) => r.id === selectedRescheduleRoomId,
  );
  const isDifferentRoom = selectedBooking?.room_id !== selectedRescheduleRoomId;

  const getFirstImage = (imageField: any) => {
    if (!imageField) return null;
    if (Array.isArray(imageField) && imageField.length > 0)
      return imageField[0];
    if (typeof imageField === "string") {
      try {
        const parsed = JSON.parse(imageField);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
        if (typeof parsed === "string") return parsed;
      } catch {
        if (imageField.startsWith("http") || imageField.startsWith("/")) {
          return imageField;
        }
      }
    }
    return null;
  };
  const roomImageUrl = getFirstImage(
    selectedRoomDetails?.image_url || selectedRoomDetails?.images,
  );

  const specialistBookingsInView = selectedSpecialist
    ? bookings.filter(
        (b) => b.user_id === selectedSpecialist.id && b.status !== "cancelled",
      )
    : [];
  const specialistTotalSpentInView = specialistBookingsInView.reduce(
    (acc, curr) => acc + curr.gross_value_brl,
    0,
  );

  const cleanPhoneForWa = (raw?: string | null) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    return digits.startsWith("55") ? digits : `55${digits}`;
  };

  const toggleNewBookingSlot = (slot: string) => {
    setNewBookingSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-8 h-8 text-[#BF4B24]" />
            Histórico de Agendamentos & Contratos
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gestão operacional e financeira de reservas avulsas, contratos fixos
            e sublocações de Co-Anfitrião (contabilizadas a partir do início do
            contrato).
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button
            onClick={handleOpenNewManualBooking}
            disabled={actionLoading}
            className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black h-10 rounded-xl shadow-sm"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Nova Reserva Manual
          </Button>
          <Badge className="bg-slate-900 text-white font-black px-4 py-1.5 rounded-xl border-0 text-sm">
            Total de registros: {filteredBookings.length}
          </Badge>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#BF4B24]/20">
              <div className="px-3 text-slate-400 border-r border-slate-200">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-0 text-sm font-bold text-slate-700 outline-none p-2 w-36"
              />
              <span className="text-slate-300 font-bold px-2">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-0 text-sm font-bold text-slate-700 outline-none p-2 w-36"
              />
            </div>

            <Button
              onClick={fetchBookings}
              variant="outline"
              className="h-10 w-10 p-0 rounded-xl border-slate-200 text-slate-600 hover:text-[#BF4B24]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>

            <select
              value={originFilter}
              onChange={(e) => setOriginFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none w-full sm:w-auto"
            >
              <option value="all">Todas as Origens</option>
              <option value="marketplace">Reservas Avulsas (Horas)</option>
              <option value="contract">Reservas de Contrato Fixo</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none w-full sm:w-auto"
            >
              <option value="all">Todos os status</option>
              <option value="confirmed">Confirmados</option>
              <option value="completed">Concluídos</option>
              <option value="pending_payment">Aguardando Pagamento</option>
              <option value="cancelled">Cancelados</option>
            </select>

            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar clínica ou especialista..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 rounded-xl border-slate-200 bg-white font-medium min-w-[200px]"
              />
            </div>
          </div>

          <div className="flex gap-3 w-full lg:w-auto mt-4 lg:mt-0">
            <Button
              onClick={handleExportExcel}
              className="flex-1 lg:flex-none bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold h-10 shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
            </Button>
            <Button
              onClick={handleExportFinances}
              className="flex-1 lg:flex-none bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 shadow-sm"
            >
              <DownloadCloud className="w-4 h-4 mr-2" /> Exportar Finanças
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
          </div>
        )}

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Clínica & Sala</th>
                <th className="px-6 py-4">Agendada em</th>
                <th className="px-6 py-4">Especialista (Locatário)</th>
                <th className="px-6 py-4">Entrada / Saída</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Valor Bruto</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredBookings.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <CalendarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold">
                      Nenhum agendamento encontrado no período.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className={`hover:bg-orange-50/30 transition-colors group ${
                      booking.is_contract ? "bg-purple-50/20" : ""
                    }`}
                  >
                    <td className="px-6 py-4">
                      <p className="font-black text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />{" "}
                        {booking.clinic_name}
                      </p>
                      <div className="flex items-center gap-1.5 mt-0.5 ml-5">
                        <p className="text-[10px] font-bold text-slate-500">
                          {booking.room_name}
                        </p>
                        {booking.is_contract && (
                          <Badge className="bg-purple-100 text-purple-800 border-0 text-[9px] px-1.5 py-0 font-black">
                            {booking.is_subcontract
                              ? "SUBCONTRATO"
                              : "CONTRATO"}
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-600">
                        {format(parseISO(booking.created_at), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                      <p className="text-[10px] font-medium text-slate-400">
                        {format(parseISO(booking.created_at), "HH:mm:ss")}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <button
                        type="button"
                        onClick={() =>
                          handleOpenSpecialistProfile(booking.user_id)
                        }
                        title="Clique para abrir o perfil e injetar créditos"
                        className="font-bold text-[#BF4B24] hover:text-[#9A3C1D] hover:underline flex items-center gap-1.5 text-left transition-colors cursor-pointer"
                      >
                        <span>{booking.specialist_name}</span>
                        <ExternalLink className="w-3 h-3 opacity-60 group-hover:opacity-100" />
                      </button>
                      {booking.cohost_name &&
                        (!booking.is_contract || booking.is_subcontract) && (
                          <p className="text-[10px] font-bold text-emerald-700 flex items-center gap-1 mt-0.5">
                            <Sparkles className="w-3 h-3" /> Repasse Co-Host:{" "}
                            {booking.cohost_name} ({booking.cohost_split_pct}%)
                          </p>
                        )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-300" />
                        <div>
                          <p className="font-bold text-slate-700">
                            {format(parseISO(booking.start_time), "dd/MM/yyyy")}
                          </p>
                          <p className="text-[10px] font-black text-emerald-600 mt-0.5">
                            {format(parseISO(booking.start_time), "HH:mm")} às{" "}
                            {format(parseISO(booking.end_time), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-slate-900">
                        R${" "}
                        {booking.gross_value_brl.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {booking.pricing_label}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenReschedule(booking)}
                        disabled={actionLoading}
                        className="h-8 font-bold border-orange-200 text-orange-600 hover:bg-orange-50"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Reagendar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedBooking(booking);
                          setIsViewOpen(true);
                        }}
                        className="h-8 font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col md:flex-row justify-end items-center gap-6">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
            Total de agendamentos no filtro:{" "}
            <span className="text-slate-900">{filteredBookings.length}</span>
          </p>
          <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            Receita Total Bruta:
            <span className="text-xl font-black text-emerald-600">
              R${" "}
              {totalRevenue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        </div>
      </div>

      {/* MODAL 0: FICHA DE PERFIL DO PROFISSIONAL + INJEÇÃO DE CRÉDITOS + ATALHO DOSSIÊ */}
      <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-2xl font-black text-slate-900">
              Perfil & Carteira do Especialista
            </SheetTitle>
            <SheetDescription>
              Gerencie os créditos, dados de contato ou acesse o dossiê
              completo.
            </SheetDescription>
          </SheetHeader>

          {selectedSpecialist && (
            <div className="mt-6 space-y-5 pb-8">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="w-16 h-16 rounded-full bg-orange-100 border-2 border-[#BF4B24]/30 overflow-hidden flex items-center justify-center shrink-0">
                  {selectedSpecialist.avatar_url ? (
                    <img
                      src={selectedSpecialist.avatar_url}
                      alt={selectedSpecialist.full_name || "Avatar"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-8 h-8 text-[#BF4B24]" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-lg font-black text-slate-900 truncate">
                    {selectedSpecialist.full_name || "Sem Nome"}
                  </h3>
                  <p className="text-xs font-bold text-[#BF4B24]">
                    {selectedSpecialist.specialty ||
                      "Especialidade não informada"}
                  </p>
                  {(selectedSpecialist.council ||
                    selectedSpecialist.council_number) && (
                    <Badge className="mt-1.5 bg-slate-900 text-white border-0 text-[10px] font-bold">
                      <Award className="w-3 h-3 mr-1" />
                      {selectedSpecialist.council || "Conselho"}:{" "}
                      {selectedSpecialist.council_number || "S/N"}
                    </Badge>
                  )}
                </div>
              </div>

              <Button
                type="button"
                onClick={() => handleGoToFullDossier(selectedSpecialist)}
                className="w-full h-11 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black text-xs shadow-md flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-4 h-4 text-orange-400" />
                Abrir Dossiê Completo na Aba Especialistas
                <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
              </Button>

              <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-orange-400" />
                    Saldo Atual na Carteira
                  </span>
                  <Badge className="bg-emerald-500/20 text-emerald-300 border-0 font-black">
                    Total: {selectedSpecialist.wallet_total}h
                  </Badge>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-slate-800 p-2.5 rounded-xl text-center">
                    <p className="text-[10px] font-bold text-slate-400 uppercase">
                      Basic / Start
                    </p>
                    <p className="text-base font-black text-white mt-0.5">
                      {selectedSpecialist.wallet_start}h
                    </p>
                  </div>
                  <div className="bg-slate-800 p-2.5 rounded-xl text-center">
                    <p className="text-[10px] font-bold text-purple-300 uppercase">
                      VIP
                    </p>
                    <p className="text-base font-black text-purple-300 mt-0.5">
                      {selectedSpecialist.wallet_vip}h
                    </p>
                  </div>
                  <div className="bg-slate-800 p-2.5 rounded-xl text-center">
                    <p className="text-[10px] font-bold text-amber-300 uppercase">
                      Master
                    </p>
                    <p className="text-base font-black text-amber-300 mt-0.5">
                      {selectedSpecialist.wallet_master}h
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl border-2 border-[#BF4B24]/30 bg-orange-50/40 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-black uppercase tracking-wider text-[#BF4B24] flex items-center gap-1.5">
                    <PlusCircle className="w-4 h-4" />
                    Injetar / Ajustar Créditos na Carteira
                  </p>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] font-bold text-slate-600 uppercase">
                      Horas (CR)
                    </Label>
                    <Input
                      type="number"
                      value={injectAmount}
                      onChange={(e) => setInjectAmount(e.target.value)}
                      placeholder="Ex: 8"
                      className="mt-1 h-9 bg-white font-black text-slate-900"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold text-slate-600 uppercase">
                      Categoria
                    </Label>
                    <select
                      value={injectTier}
                      onChange={(e) =>
                        setInjectTier(
                          e.target.value as "start" | "vip" | "master",
                        )
                      }
                      className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-800"
                    >
                      <option value="start">Basic / Start</option>
                      <option value="vip">VIP</option>
                      <option value="master">Master</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-[10px] font-bold text-slate-600 uppercase">
                      Validade (Dias)
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={injectValidityDays}
                      onChange={(e) => setInjectValidityDays(e.target.value)}
                      placeholder="30"
                      className="mt-1 h-9 bg-white font-bold text-slate-700"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[1, 4, 8, 16, 20, -1].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setInjectAmount(String(preset))}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-black border transition-all ${
                        Number(injectAmount) === preset
                          ? "bg-[#BF4B24] text-white border-[#BF4B24]"
                          : "bg-white text-slate-600 border-slate-200 hover:border-orange-300"
                      }`}
                    >
                      {preset > 0 ? `+${preset}h` : `${preset}h`}
                    </button>
                  ))}
                </div>

                <div>
                  <Label className="text-[10px] font-bold text-slate-600 uppercase">
                    Observação / Motivo (Opcional)
                  </Label>
                  <Input
                    value={injectReason}
                    onChange={(e) => setInjectReason(e.target.value)}
                    placeholder="Ex: Pacote 8h pago via Pix direto / Bônus"
                    className="mt-1 h-9 bg-white text-xs"
                  />
                </div>

                <Button
                  type="button"
                  disabled={injectLoading}
                  onClick={handleInjectCredits}
                  className="w-full h-10 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black text-xs shadow-sm"
                >
                  {injectLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Confirmar Injeção de {injectAmount || 0}h (
                  {formatTierLabel(injectTier)})
                </Button>
              </div>

              <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Dados de Contato & Identificação
                </p>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 font-bold block">CPF</span>
                    <span className="font-bold text-slate-800">
                      {selectedSpecialist.cpf || "Não informado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 font-bold block">
                      Data de Nascimento
                    </span>
                    <span className="font-bold text-slate-800">
                      {selectedSpecialist.birth_date
                        ? format(
                            parseISO(selectedSpecialist.birth_date),
                            "dd/MM/yyyy",
                          )
                        : "Não informada"}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      WhatsApp / Telefone:
                    </span>
                    <span className="font-bold text-slate-900">
                      {selectedSpecialist.whatsapp ||
                        selectedSpecialist.phone ||
                        "Não informado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 font-bold flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      E-mail:
                    </span>
                    <span className="font-bold text-slate-900 truncate max-w-[200px]">
                      {selectedSpecialist.email || "Não informado"}
                    </span>
                  </div>
                </div>

                {cleanPhoneForWa(
                  selectedSpecialist.whatsapp || selectedSpecialist.phone,
                ) && (
                  <a
                    href={`https://wa.me/${cleanPhoneForWa(selectedSpecialist.whatsapp || selectedSpecialist.phone)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-sm transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Conversar no WhatsApp
                  </a>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Endereço Cadastrado
                </p>
                {selectedSpecialist.address_street ? (
                  <>
                    <p className="font-bold text-slate-800">
                      {selectedSpecialist.address_street},{" "}
                      {selectedSpecialist.address_number || "S/N"}
                      {selectedSpecialist.address_complement
                        ? ` (${selectedSpecialist.address_complement})`
                        : ""}
                    </p>
                    <p className="text-slate-600 font-medium">
                      {selectedSpecialist.address_neighborhood || ""} •{" "}
                      {selectedSpecialist.address_city || ""} -{" "}
                      {selectedSpecialist.address_state || ""}
                    </p>
                    {selectedSpecialist.cep && (
                      <p className="text-slate-400 font-mono">
                        CEP: {selectedSpecialist.cep}
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-slate-400 font-medium">
                    Endereço ainda não preenchido pelo profissional.
                  </p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* MODAL 1: VISUALIZAR DETALHES, CONTRATO E REPASSES */}
      <Sheet open={isViewOpen} onOpenChange={setIsViewOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-2xl font-black text-slate-900">
              Detalhes da Reserva
            </SheetTitle>
            <SheetDescription>
              Informações operacionais, vínculo contratual e divisão de
              repasses.
            </SheetDescription>
          </SheetHeader>

          {selectedBooking && (
            <div className="mt-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-400 uppercase">
                  ID da Reserva
                </p>
                <p className="text-sm font-mono font-medium text-slate-700">
                  {selectedBooking.id}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase">
                    Status
                  </p>
                  <div className="mt-1">
                    {getStatusBadge(selectedBooking.status)}
                  </div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase">
                    Receita Bruta
                  </p>
                  <p className="text-lg font-black text-emerald-700">
                    R${" "}
                    {selectedBooking.gross_value_brl.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-600/80 mt-0.5">
                    {selectedBooking.pricing_label}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">
                  Distribuição Financeira (Split)
                </p>
                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">
                    Taxa Plataforma Fusion:
                  </span>
                  <span className="font-bold text-orange-400">
                    R${" "}
                    {selectedBooking.platform_fee_brl.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
                {selectedBooking.cohost_payout_brl > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-emerald-300">
                      Repasse Co-Anfitrião ({selectedBooking.cohost_name}):
                    </span>
                    <span className="font-bold text-emerald-300">
                      R${" "}
                      {selectedBooking.cohost_payout_brl.toLocaleString(
                        "pt-BR",
                        {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        },
                      )}
                    </span>
                  </div>
                )}
                <div className="flex justify-between text-xs pt-1 border-t border-slate-800">
                  <span className="text-slate-300">
                    Repasse Clínica ({selectedBooking.clinic_name}):
                  </span>
                  <span className="font-black text-emerald-400">
                    R${" "}
                    {selectedBooking.host_payout_brl.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              {selectedBooking.is_contract && (
                <div className="p-4 rounded-xl bg-purple-50 border border-purple-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-black text-purple-950 uppercase">
                      {selectedBooking.is_subcontract
                        ? "Subcontrato Fixo (Vinculado ao Co-Host)"
                        : "Reserva de Contrato Recorrente"}
                    </p>
                    <p className="text-xs text-purple-700 font-medium">
                      Alocação garantida por contrato de locação.
                    </p>
                  </div>
                  {selectedBooking.contract_pdf_url && (
                    <a
                      href={selectedBooking.contract_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-purple-700 text-white text-xs font-bold hover:bg-purple-800"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver PDF
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              <div className="space-y-4">
                <div>
                  <Label className="text-slate-500 font-bold">
                    Clínica & Sala
                  </Label>
                  <p className="font-medium text-slate-900">
                    {selectedBooking.clinic_name} - {selectedBooking.room_name}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500 font-bold">
                    Especialista (Locatário)
                  </Label>
                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        setIsViewOpen(false);
                        handleOpenSpecialistProfile(selectedBooking.user_id);
                      }}
                      className="font-bold text-[#BF4B24] hover:underline inline-flex items-center gap-1.5"
                    >
                      {selectedBooking.specialist_name}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-slate-500 font-bold">
                    Período Reservado
                  </Label>
                  <p className="font-medium text-slate-900">
                    {format(parseISO(selectedBooking.start_time), "dd/MM/yyyy")}{" "}
                    das {format(parseISO(selectedBooking.start_time), "HH:mm")}{" "}
                    às {format(parseISO(selectedBooking.end_time), "HH:mm")}
                  </p>
                </div>
              </div>

              {selectedBooking.status !== "cancelled" && (
                <div className="pt-6 mt-6 border-t border-slate-200">
                  <Button
                    variant="destructive"
                    className="w-full font-bold h-12 rounded-xl"
                    onClick={handleCancelBooking}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-2" />
                    )}
                    {selectedBooking.is_contract
                      ? "Liberar Data Contratual na Agenda"
                      : `Cancelar Reserva e Estornar (${selectedBooking.credits_used}h)`}
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* MODAL 2: REAGENDAR */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="sm:max-w-3xl bg-[#F5F2F0] border-none shadow-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-black text-slate-900">
              Gestão de Reagendamento
            </DialogTitle>
            <DialogDescription className="text-slate-600 font-medium">
              Altere a data, o horário e a sala do cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex gap-4 items-center">
              <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                {roomImageUrl ? (
                  <img
                    src={roomImageUrl}
                    alt="Foto da Sala"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-8 h-8 text-slate-300" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Sala do Reagendamento
                </Label>
                <Select
                  value={selectedRescheduleRoomId || undefined}
                  onValueChange={(val) => {
                    setSelectedRescheduleRoomId(val);
                    setSelectedSlot("");
                  }}
                >
                  <SelectTrigger className="bg-white font-bold h-10 border-slate-200 text-slate-700 w-full text-left shadow-none focus:ring-[#BF4B24]">
                    <SelectValue placeholder="Selecione uma sala..." />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateRooms.map((room) => (
                      <SelectItem
                        key={room.id}
                        value={room.id}
                        className="font-bold text-slate-700"
                      >
                        {room.name} ({room.host_name || "Clínica Padrão"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isDifferentRoom && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-2 items-center animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs font-medium text-amber-800">
                  <strong>Atenção:</strong> Você está alocando o cliente para
                  uma sala diferente da reserva original.
                </p>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-shrink-0 border border-slate-100 rounded-xl p-2 bg-white shadow-sm h-fit">
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={(date) => {
                    if (date) setRescheduleDate(date);
                  }}
                  disabled={{ before: startOfDay(new Date()) }}
                  locale={ptBR}
                  className="bg-white rounded-lg w-full pointer-events-auto"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-bold text-slate-700">
                    Horários Livres da Sala
                  </Label>
                  <span className="text-[#BF4B24] font-black text-sm">
                    {availableSlots.length > 0 && rescheduleDate
                      ? `${format(rescheduleDate, "dd/MM", { locale: ptBR })}`
                      : ""}
                  </span>
                </div>

                <div className="flex-1 bg-white border border-slate-100 shadow-sm rounded-xl p-4 overflow-y-auto min-h-[250px] max-h-[310px]">
                  {loadingSlots ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#BF4B24]" />
                      <p className="text-xs text-slate-500 font-medium">
                        Analisando cruzamento de agendas e contratos...
                      </p>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <CalendarDays className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="text-sm font-bold text-slate-500">
                        Nenhum horário disponível.
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Sala fechada, em uso por contrato ou totalmente ocupada.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {availableSlots.map((slot) => {
                        const isSelected = selectedSlot === slot;
                        return (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2.5 px-3 rounded-lg border text-sm font-bold transition-all ${
                              isSelected
                                ? "bg-[#BF4B24] border-[#BF4B24] text-white shadow-md scale-105"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:border-orange-300 hover:text-[#BF4B24]"
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 pt-2 border-t border-slate-200/50">
            <Button
              variant="ghost"
              onClick={() => setIsRescheduleOpen(false)}
              className="rounded-xl font-bold text-slate-500 hover:text-slate-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={
                actionLoading || !selectedSlot || !selectedRescheduleRoomId
              }
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl h-10 shadow-md"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              Salvar Novo Horário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* MODAL 3: NOVA RESERVA MANUAL DIRETA PELO ADMIN */}
      <Dialog open={isNewBookingOpen} onOpenChange={setIsNewBookingOpen}>
        <DialogContent className="sm:max-w-3xl bg-[#F5F2F0] border-none shadow-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-black text-slate-900">
              Nova Reserva Manual (Admin)
            </DialogTitle>
            <DialogDescription className="text-slate-600 font-medium">
              Aloque horários diretamente para um especialista bloqueando a
              agenda da sala em tempo real.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl shadow-sm border border-slate-100">
              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase">
                  Especialista
                </Label>
                <select
                  value={newBookingSpecialistId}
                  onChange={(e) => setNewBookingSpecialistId(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
                >
                  {allSpecialists.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.full_name || spec.email || spec.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase">
                  Sala / Consultório
                </Label>
                <select
                  value={newBookingRoomId}
                  onChange={(e) => setNewBookingRoomId(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800"
                >
                  {allActiveRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({formatTierLabel(normalizeTier(r.tier))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-xs font-bold text-slate-500 uppercase">
                  Valor Total Acordado R$ (Opcional)
                </Label>
                <Input
                  type="number"
                  placeholder="Automático pela tarifa"
                  value={newBookingAgreedBrl}
                  onChange={(e) => setNewBookingAgreedBrl(e.target.value)}
                  className="mt-1 h-10 bg-white text-xs font-bold"
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <div className="flex-shrink-0 border border-slate-100 rounded-xl p-2 bg-white shadow-sm h-fit">
                <Calendar
                  mode="single"
                  selected={newBookingDate}
                  onSelect={(date) => {
                    if (date) setNewBookingDate(date);
                  }}
                  locale={ptBR}
                  className="bg-white rounded-lg w-full pointer-events-auto"
                />
              </div>

              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-bold text-slate-700">
                    Selecione os Horários Livres (
                    {newBookingSelectedSlots.length} selecionado(s))
                  </Label>
                </div>

                <div className="flex-1 bg-white border border-slate-100 shadow-sm rounded-xl p-4 overflow-y-auto min-h-[250px] max-h-[310px]">
                  {loadingSlots ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#BF4B24]" />
                      <p className="text-xs text-slate-500 font-medium">
                        Verificando disponibilidade em tempo real...
                      </p>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <CalendarDays className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="text-sm font-bold text-slate-500">
                        Nenhum horário disponível nesta data.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {availableSlots.map((slot) => {
                        const isSelected =
                          newBookingSelectedSlots.includes(slot);
                        return (
                          <button
                            key={slot}
                            type="button"
                            onClick={() => toggleNewBookingSlot(slot)}
                            className={`py-2.5 px-3 rounded-lg border text-sm font-bold transition-all ${
                              isSelected
                                ? "bg-[#BF4B24] border-[#BF4B24] text-white shadow-md scale-105"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:border-orange-300 hover:text-[#BF4B24]"
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 pt-2 border-t border-slate-200/50">
            <Button
              variant="ghost"
              onClick={() => setIsNewBookingOpen(false)}
              className="rounded-xl font-bold text-slate-500 hover:text-slate-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleCreateManualBooking}
              disabled={
                actionLoading ||
                newBookingSelectedSlots.length === 0 ||
                !newBookingRoomId ||
                !newBookingSpecialistId
              }
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl h-10 shadow-md"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-2" />
              )}
              Confirmar Reserva ({newBookingSelectedSlots.length}h)
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
