// components/admin/bookings-tab.tsx
"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  sendBookingNotificationEmails,
  sendBookingCancellationEmails,
} from "@/app/actions/send-email";
import {
  computeWalletBalancesFIFO,
  calculatePackageBookingArbitrage,
  computeSubscribersBreakageReport,
  resolveCreditHourlyValueBRL,
  SubscriberPackageAnalytics,
  SubscriberProfileInfo,
} from "@/utils/wallet-ledger";
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
  CreditCard,
  ArrowDownRight,
  Users,
  QrCode,
  RotateCcw,
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
  cc_last4?: string | null;
  cc_brand?: string | null;
  created_at: string | null;
  wallet_start: number;
  wallet_vip: number;
  wallet_master: number;
  wallet_total: number;
}

export type BookingSubgroup = "avulso" | "package" | "contract";

interface BookingInfo {
  id: string;
  user_id: string;
  created_at: string;
  start_time: string;
  end_time: string;
  status: string;
  subgroup: BookingSubgroup;
  total_cost: number;
  credits_used: number;
  credit_tier_raw: string;
  credit_tier_normalized: "start" | "vip" | "master";
  credit_tx_type: string;
  credit_expires_at: string | null;
  gross_value_brl: number;
  room_base_value_brl: number;
  hourly_rate_brl: number;
  room_reference_hourly_brl: number;
  pricing_label: string;
  room_tier: "start" | "vip" | "master";
  is_downgrade: boolean;
  standard_platform_fee_brl: number;
  downgrade_spread_profit_brl: number;
  specialist_name: string;
  room_name: string;
  room_id: string;
  clinic_name: string;
  is_contract: boolean;
  is_package: boolean;
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
  if (t.includes("master") || t.includes("premium")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

function formatTierLabel(tier: "start" | "vip" | "master"): string {
  if (tier === "master") return "Premium";
  if (tier === "vip") return "VIP";
  return "Basic";
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

const cleanPhoneForWa = (raw?: string | null) => {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;
  return digits.startsWith("55") ? digits : `55${digits}`;
};

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

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

  const [activeDashboardView, setActiveDashboardView] = useState<
    "bookings" | "subscribers"
  >("bookings");

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

  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [originFilter, setOriginFilter] = useState<
    "all" | "avulso" | "package" | "contract"
  >("all");
  const [packageSubFilter, setPackageSubFilter] = useState<
    "all" | "downgrade" | "start" | "vip" | "master"
  >("all");
  const [search, setSearch] = useState("");

  // Modal de Visualização de Reserva
  const [selectedBooking, setSelectedBooking] = useState<BookingInfo | null>(
    null,
  );
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Modal de Perfil e Créditos
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

  // Modal de Reagendamento
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

  // Modal de Nova Reserva Manual
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
      // Sincroniza automaticamente no banco o valor exato pago no Asaas em assinaturas anteriores
      await fetch("/api/subscriptions/sync-prices", { method: "POST" }).catch(
        () => {},
      );

      const start = startOfDay(parseISO(startDate)).toISOString();
      const end = endOfDay(parseISO(endDate)).toISOString();

      const [rawBookingsRes, packagesRes, allWalletRes, allSubsRes] =
        await Promise.all([
          supabase
            .from("bookings")
            .select(
              "id, created_at, start_time, end_time, status, total_cost, upgrade_fee_amount, room_id, user_id, contract_id, booking_origin, agreed_value_brl",
            )
            .gte("start_time", start)
            .lte("start_time", end)
            .order("start_time", { ascending: true }),
          supabase.from("packages").select("id, tier, hours, price, active"),
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

      if (rawBookingsRes.error) {
        throw new Error(
          rawBookingsRes.error.message || JSON.stringify(rawBookingsRes.error),
        );
      }

      const rawBookings = rawBookingsRes.data || [];
      const allPackagesData = packagesRes.data || [];
      const allWalletData = allWalletRes.data || [];
      const allSubsData = allSubsRes.data || [];

      const bookingIds = rawBookings.map((b: any) => b.id);
      const roomIds = [
        ...new Set(rawBookings.map((b: any) => b.room_id).filter(Boolean)),
      ];

      const userIds = [
        ...new Set(
          [
            ...rawBookings.map((b: any) => b.user_id),
            ...allWalletData.map((w: any) => w.user_id),
            ...allSubsData.map((s: any) => s.user_id),
          ].filter(Boolean),
        ),
      ];

      const [roomsRes, couponsRes, usersRes, contractsRes] = await Promise.all([
        roomIds.length > 0
          ? supabase
              .from("rooms")
              .select(
                "id, name, host_id, tier, category_id, modalities, address_details",
              )
              .in("id", roomIds)
          : Promise.resolve({ data: [] as any[] }),
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
                "id, full_name, email, phone, whatsapp, cpf, specialty, council, council_number, gender, birth_date, avatar_url, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, cc_last4, cc_brand, created_at",
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
      allWalletData.forEach((tx: any) => {
        const list = userWalletMap.get(tx.user_id) || [];
        list.push(tx);
        userWalletMap.set(tx.user_id, list);
      });

      const richProfilesMap = new Map<string, SpecialistProfile>();
      const subscriberProfilesMap = new Map<string, SubscriberProfileInfo>();

      (usersRes.data || []).forEach((u: any) => {
        const txs = userWalletMap.get(u.id) || [];
        const fifo = computeWalletBalancesFIFO(txs);

        subscriberProfilesMap.set(u.id, {
          full_name: u.full_name,
          email: u.email,
          phone: u.phone,
          whatsapp: u.whatsapp,
          cc_last4: u.cc_last4,
          cc_brand: u.cc_brand,
        });

        richProfilesMap.set(u.id, {
          ...u,
          wallet_start: fifo.start,
          wallet_vip: fifo.vip,
          wallet_master: fifo.master,
          wallet_total: fifo.total,
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
      allSubsData.forEach((sub: any) => {
        const list = userSubsMap.get(sub.user_id) || [];
        list.push(sub);
        userSubsMap.set(sub.user_id, list);
      });

      const downgradeStatsByUser = new Map<
        string,
        { count: number; spreadProfitBrl: number }
      >();

      const formattedBookings: BookingInfo[] = rawBookings.map((b: any) => {
        const room = roomsMap.get(b.room_id);
        const hostId = room?.host_id;
        const clinicName = hostId ? hostsMap.get(hostId) : "Fusion Clinic";
        const roomTier = normalizeTier(room?.tier);
        const specialistProfile = richProfilesMap.get(b.user_id);
        const slotUnits = calculateSlotUnits(b.start_time, b.end_time);

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

        // SUBGRUPO 3: CONTRATOS FIXOS
        if (isContractBooking) {
          const contractSessionVal =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : Number(linkedContract?.session_value || 0);

          const isSubContractUnderCohost = Boolean(
            roomCohostContract &&
            b.contract_id &&
            b.contract_id !== roomCohostContract.id,
          );

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
            subgroup: "contract",
            total_cost: slotUnits,
            credits_used: 0,
            credit_tier_raw: room?.tier || roomTier,
            credit_tier_normalized: roomTier,
            credit_tx_type: "contract",
            credit_expires_at: null,
            gross_value_brl: contractSessionVal,
            room_base_value_brl: contractSessionVal,
            hourly_rate_brl: contractSessionVal / slotUnits,
            room_reference_hourly_brl: contractSessionVal / slotUnits,
            pricing_label: typeLabel,
            room_tier: roomTier,
            is_downgrade: false,
            standard_platform_fee_brl: platformFee,
            downgrade_spread_profit_brl: 0,
            room_id: b.room_id,
            specialist_name:
              linkedContract?.specialist_name ||
              specialistProfile?.full_name ||
              "Locatário de Contrato",
            room_name: room?.name || "Sala Removida",
            clinic_name: clinicName || "Fusion Clinic",
            is_contract: true,
            is_package: false,
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

        // SUBGRUPO 2: PACOTES FUSION PASS+
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

          // Puxa o valor exato pago na assinatura/renovação ([Paid:XX.XX] / [Rate:XX.XXXX])
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
            matchedPackageHours: matchedHours,
            packages: allPackagesData,
            cohostSplitPct: roomCohostContract ? cohostSplitPct : null,
          });

          const finalGrossBrl = Math.max(
            0,
            arbitrage.grossCreditValueBrl + upgradeFee - discount,
          );

          if (arbitrage.isDowngrade && b.status !== "cancelled") {
            const currentDg = downgradeStatsByUser.get(b.user_id) || {
              count: 0,
              spreadProfitBrl: 0,
            };
            downgradeStatsByUser.set(b.user_id, {
              count: currentDg.count + 1,
              spreadProfitBrl:
                currentDg.spreadProfitBrl + arbitrage.downgradeSpreadProfitBrl,
            });
          }

          const originLabel = arbitrage.isDowngrade
            ? `Pacote ${formatTierLabel(creditTierUsed)} → Sala ${formatTierLabel(roomTier)}`
            : `Pacote ${formatTierLabel(creditTierUsed)} (${matchedHours || 8}h)`;

          return {
            id: b.id,
            user_id: b.user_id,
            created_at: b.created_at,
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            subgroup: "package",
            total_cost: rawTotalCost,
            credits_used: slotUnits,
            credit_tier_raw: creditTierUsed,
            credit_tier_normalized: creditTierUsed,
            credit_tx_type: "usage",
            credit_expires_at: null,
            gross_value_brl: finalGrossBrl,
            room_base_value_brl: arbitrage.roomBaseValueBrl,
            hourly_rate_brl: arbitrage.creditHourlyRateBrl,
            room_reference_hourly_brl: arbitrage.roomReferenceHourlyRateBrl,
            pricing_label: originLabel,
            room_tier: roomTier,
            is_downgrade: arbitrage.isDowngrade,
            standard_platform_fee_brl: arbitrage.standardPlatformFeeBrl,
            downgrade_spread_profit_brl: arbitrage.downgradeSpreadProfitBrl,
            room_id: b.room_id,
            specialist_name:
              specialistProfile?.full_name || "Especialista Desconhecido",
            room_name: room?.name || "Sala Removida",
            clinic_name: clinicName || "Fusion Clinic",
            is_contract: false,
            is_package: true,
            is_subcontract: false,
            contract_id: null,
            contract_type: null,
            contract_pdf_url: null,
            cohost_name: cohostName,
            cohost_split_pct: cohostSplitPct,
            platform_fee_brl: arbitrage.totalPlatformProfitBrl,
            cohost_payout_brl: arbitrage.cohostPayoutBrl,
            host_payout_brl: arbitrage.hostPayoutBrl,
          };
        }

        // SUBGRUPO 1: HORAS AVULSAS
        const computeAvulsoSplit = (grossVal: number) => {
          if (roomCohostContract) {
            const cohostShare = grossVal * (cohostSplitPct / 100);
            const platformFee = Math.max(0, grossVal - cohostShare);
            return { platformFee, cohostPayout: cohostShare, hostPayout: 0 };
          }
          const platformFee = grossVal * 0.2;
          const netAfterPlatform = Math.max(0, grossVal - platformFee);
          return { platformFee, cohostPayout: 0, hostPayout: netAfterPlatform };
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
          user_id: b.user_id,
          created_at: b.created_at,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          subgroup: "avulso",
          total_cost: rawTotalCost,
          credits_used: slotUnits,
          credit_tier_raw: roomTier,
          credit_tier_normalized: roomTier,
          credit_tx_type: "credit_card",
          credit_expires_at: null,
          gross_value_brl: finalAvulsoBrl,
          room_base_value_brl: finalAvulsoBrl,
          hourly_rate_brl: finalAvulsoBrl / slotUnits,
          room_reference_hourly_brl: finalAvulsoBrl / slotUnits,
          pricing_label: `Hora Avulsa • Sala ${formatTierLabel(roomTier)}`,
          room_tier: roomTier,
          is_downgrade: false,
          standard_platform_fee_brl: avulsoSplit.platformFee,
          downgrade_spread_profit_brl: 0,
          room_id: b.room_id,
          specialist_name:
            specialistProfile?.full_name || "Especialista Desconhecido",
          room_name: room?.name || "Sala Removida",
          clinic_name: clinicName || "Fusion Clinic",
          is_contract: false,
          is_package: false,
          is_subcontract: false,
          contract_id: null,
          contract_type: null,
          contract_pdf_url: null,
          cohost_name: cohostName,
          cohost_split_pct: cohostSplitPct,
          platform_fee_brl: avulsoSplit.platformFee,
          cohost_payout_brl: avulsoSplit.cohostPayout,
          host_payout_brl: avulsoSplit.hostPayout,
        };
      });

      setBookings(formattedBookings);

      const breakageReport = computeSubscribersBreakageReport({
        allWalletTransactions: allWalletData,
        allSubscriptions: allSubsData,
        allPackages: allPackagesData,
        profilesMap: subscriberProfilesMap,
        downgradeStatsByUser,
      });

      setSubscribersReport(breakageReport.subscribers);
      setBreakageTotals(breakageReport.totals);
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

  // ==========================================================================
  // MÉTRICAS DOS 3 SUBGRUPOS FINANCEIROS
  // ==========================================================================
  const threePillarsAnalytics = useMemo(() => {
    const validBookings = bookings.filter((b) => b.status !== "cancelled");

    const avulsoList = validBookings.filter((b) => b.subgroup === "avulso");
    const packageList = validBookings.filter((b) => b.subgroup === "package");
    const contractList = validBookings.filter((b) => b.subgroup === "contract");

    const sum = (arr: BookingInfo[], key: keyof BookingInfo) =>
      arr.reduce((acc, item) => acc + Number(item[key] || 0), 0);

    const pkgByTier = {
      start: packageList.filter((b) => b.credit_tier_normalized === "start"),
      vip: packageList.filter((b) => b.credit_tier_normalized === "vip"),
      master: packageList.filter((b) => b.credit_tier_normalized === "master"),
    };

    const downgradeList = packageList.filter((b) => b.is_downgrade);

    return {
      avulso: {
        count: avulsoList.length,
        hours: sum(avulsoList, "credits_used"),
        grossBrl: sum(avulsoList, "gross_value_brl"),
        hostPayoutBrl:
          sum(avulsoList, "host_payout_brl") +
          sum(avulsoList, "cohost_payout_brl"),
        platformProfitBrl: sum(avulsoList, "platform_fee_brl"),
      },
      packages: {
        count: packageList.length,
        hoursUsedInPeriod: sum(packageList, "credits_used"),
        grossConsumedBrl: sum(packageList, "gross_value_brl"),
        roomBaseBrl: sum(packageList, "room_base_value_brl"),
        hostPayoutBrl:
          sum(packageList, "host_payout_brl") +
          sum(packageList, "cohost_payout_brl"),
        standardFeeBrl: sum(packageList, "standard_platform_fee_brl"),
        downgradeSpreadBrl: sum(packageList, "downgrade_spread_profit_brl"),
        totalPlatformBookingProfitBrl: sum(packageList, "platform_fee_brl"),
        downgradeCount: downgradeList.length,
        byTier: {
          start: {
            count: pkgByTier.start.length,
            hours: sum(pkgByTier.start, "credits_used"),
            grossBrl: sum(pkgByTier.start, "gross_value_brl"),
          },
          vip: {
            count: pkgByTier.vip.length,
            hours: sum(pkgByTier.vip, "credits_used"),
            grossBrl: sum(pkgByTier.vip, "gross_value_brl"),
          },
          master: {
            count: pkgByTier.master.length,
            hours: sum(pkgByTier.master, "credits_used"),
            grossBrl: sum(pkgByTier.master, "gross_value_brl"),
          },
        },
      },
      contracts: {
        count: contractList.length,
        hours: sum(contractList, "total_cost"),
        grossBrl: sum(contractList, "gross_value_brl"),
        hostPayoutBrl:
          sum(contractList, "host_payout_brl") +
          sum(contractList, "cohost_payout_brl"),
        platformProfitBrl: sum(contractList, "platform_fee_brl"),
      },
    };
  }, [bookings]);

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
          ? `[Admin Manual] Recarga Admin Manual (${hoursNum}h ${tierName})`
          : `[Admin Manual] Ajuste/Débito Admin Manual (${hoursNum}h ${tierName})`;

      const finalDescription = injectReason.trim()
        ? `[Admin Manual] ${injectReason.trim()} (${hoursNum}h ${tierName})`
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
            title: "Novos Créditos Adicionados!",
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
            ? "Créditos avulsos injetados na carteira!"
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
        title: "Reserva criada com sucesso!",
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

      toast({ title: "Reserva reagendada com sucesso!" });
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

  const filteredBookings = bookings.filter((b) => {
    const matchStatus =
      statusFilter === "all" ? true : b.status === statusFilter;

    const matchOrigin =
      originFilter === "all" ? true : b.subgroup === originFilter;

    const matchPkgSub =
      originFilter !== "package" || packageSubFilter === "all"
        ? true
        : packageSubFilter === "downgrade"
          ? b.is_downgrade
          : b.credit_tier_normalized === packageSubFilter;

    const matchSearch =
      b.specialist_name.toLowerCase().includes(search.toLowerCase()) ||
      b.clinic_name.toLowerCase().includes(search.toLowerCase()) ||
      b.room_name.toLowerCase().includes(search.toLowerCase());

    return matchStatus && matchOrigin && matchPkgSub && matchSearch;
  });

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

      if (!search.trim()) return true;
      const q = search.toLowerCase();
      return (
        s.specialistName.toLowerCase().includes(q) ||
        s.specialistEmail.toLowerCase().includes(q)
      );
    });
  }, [subscribersReport, subLifecycleFilter, subPaymentFilter, search]);

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
    if (activeDashboardView === "subscribers") {
      if (filteredSubscribers.length === 0)
        return toast({ title: "Sem assinantes para exportar." });
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
      return;
    }

    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });
    let csv =
      "ID da Reserva;Subgrupo;Clínica;Sala;Tier Sala;Tier Crédito;Origem / Modalidade;Data Agendada;Especialista;Entrada;Saída;Status;Valor Hora (R$);Valor Bruto (R$)\n";
    filteredBookings.forEach((b) => {
      const subgrupoLabel =
        b.subgroup === "avulso"
          ? "Hora Avulsa"
          : b.subgroup === "package"
            ? "Pacote Fusion Pass+"
            : "Contrato Fixo";
      const valorHora = b.hourly_rate_brl.toFixed(2).replace(".", ",");
      const valorTotal = b.gross_value_brl.toFixed(2).replace(".", ",");
      const agendada = format(parseISO(b.created_at), "dd/MM/yyyy HH:mm");
      const entrada = format(parseISO(b.start_time), "dd/MM/yyyy HH:mm");
      const saida = format(parseISO(b.end_time), "dd/MM/yyyy HH:mm");
      csv += `${b.id};"${subgrupoLabel}";"${b.clinic_name}";"${b.room_name}";"${formatTierLabel(b.room_tier)}";"${formatTierLabel(b.credit_tier_normalized)}";"${b.pricing_label}";${agendada};"${b.specialist_name}";${entrada};${saida};${b.status};${valorHora};${valorTotal}\n`;
    });
    downloadCSV(csv, `Fusion_Agendamentos_${startDate}_a_${endDate}.csv`);
  };

  const handleExportFinances = () => {
    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });
    let csv =
      "ID da Reserva;Subgrupo;Clínica (Anfitrião);Sala;Modalidade;Especialista (Cliente);Co-Anfitrião;Valor Bruto Crédito/Reserva (R$);Base Sala Entregue (R$);Taxa Base Fusion (R$);Lucro Extra Downgrade (R$);Lucro Total Fusion (R$);Repasse Co-Anfitrião (R$);Repasse Clínica (R$);Status\n";
    filteredBookings.forEach((b) => {
      const subgrupoLabel =
        b.subgroup === "avulso"
          ? "Hora Avulsa"
          : b.subgroup === "package"
            ? "Pacote Fusion Pass+"
            : "Contrato Fixo";
      csv += `${b.id};"${subgrupoLabel}";"${b.clinic_name}";"${b.room_name}";"${b.pricing_label}";"${b.specialist_name}";"${b.cohost_name || "N/A"}";${b.gross_value_brl.toFixed(2).replace(".", ",")};${b.room_base_value_brl.toFixed(2).replace(".", ",")};${b.standard_platform_fee_brl.toFixed(2).replace(".", ",")};${b.downgrade_spread_profit_brl.toFixed(2).replace(".", ",")};${b.platform_fee_brl.toFixed(2).replace(".", ",")};${b.cohost_payout_brl.toFixed(2).replace(".", ",")};${b.host_payout_brl.toFixed(2).replace(".", ",")};${b.status}\n`;
    });
    downloadCSV(csv, `Fusion_Financeiro_${startDate}_a_${endDate}.csv`);
  };

  const totalRevenue = filteredBookings.reduce((acc, curr) => {
    if (statusFilter !== "cancelled" && curr.status === "cancelled") {
      return acc;
    }
    return acc + curr.gross_value_brl;
  }, 0);

  const totalPlatformProfitFiltered = filteredBookings.reduce((acc, curr) => {
    if (statusFilter !== "cancelled" && curr.status === "cancelled") {
      return acc;
    }
    return acc + curr.platform_fee_brl;
  }, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-emerald-50 text-emerald-700 border-0 font-semibold">
            Confirmado
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-slate-100 text-slate-700 border-0 font-semibold">
            Concluído
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-50 text-red-700 border-0 font-semibold">
            Cancelado
          </Badge>
        );
      case "pending_payment":
        return (
          <Badge className="bg-amber-50 text-amber-700 border-0 font-semibold">
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

  const getSubgroupBadge = (b: BookingInfo) => {
    if (b.subgroup === "avulso") {
      return (
        <span className="text-[10px] font-semibold bg-slate-100 text-slate-700 px-2 py-0.5 rounded">
          Hora Avulsa
        </span>
      );
    }
    if (b.subgroup === "package") {
      return (
        <span className="text-[10px] font-semibold bg-orange-50 text-[#BF4B24] px-2 py-0.5 rounded">
          Pacote {formatTierLabel(b.credit_tier_normalized)}
        </span>
      );
    }
    return (
      <span className="text-[10px] font-semibold bg-slate-900 text-white px-2 py-0.5 rounded">
        {b.is_subcontract ? "Subcontrato Fixo" : "Contrato Fixo"}
      </span>
    );
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
          Atrasado / Não Renovou ({Math.abs(sub.daysUntilExpiry || 0)}d)
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

  const toggleNewBookingSlot = (slot: string) => {
    setNewBookingSelectedSlots((prev) =>
      prev.includes(slot) ? prev.filter((s) => s !== slot) : [...prev, slot],
    );
  };

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans">
      {/* CABEÇALHO E SELETOR DE VISÃO */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight">
            Agendamentos, Pacotes & Contratos
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Gestão operacional dividida em Horas Avulsas, Pacotes Fusion Pass+ e
            Contratos Fixos.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="bg-slate-100 p-1 rounded-xl flex items-center border border-slate-200">
            <button
              type="button"
              onClick={() => setActiveDashboardView("bookings")}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeDashboardView === "bookings"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <CalendarDays className="w-3.5 h-3.5 text-slate-500" />
              Reservas ({filteredBookings.length})
            </button>
            <button
              type="button"
              onClick={() => setActiveDashboardView("subscribers")}
              className={`px-3.5 py-2 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 ${
                activeDashboardView === "subscribers"
                  ? "bg-white text-slate-900 shadow-2xs"
                  : "text-slate-600 hover:text-slate-900"
              }`}
            >
              <Users className="w-3.5 h-3.5 text-[#BF4B24]" />
              Inteligência de Assinantes ({breakageTotals.totalSubscribersCount}
              )
            </button>
          </div>

          <Button
            onClick={handleOpenNewManualBooking}
            disabled={actionLoading}
            className="bg-slate-900 hover:bg-slate-800 text-white font-semibold h-10 rounded-xl text-xs"
          >
            <PlusCircle className="w-4 h-4 mr-2" />
            Nova Reserva Manual
          </Button>
        </div>
      </div>

      {/* ================================================================== */}
      {/* PAINEL LIMPO DOS 3 SUBGRUPOS FINANCEIROS                           */}
      {/* ================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 mb-6">
        {/* 1. HORAS AVULSAS */}
        <div
          onClick={() => {
            setActiveDashboardView("bookings");
            setOriginFilter(originFilter === "avulso" ? "all" : "avulso");
          }}
          className={`bg-white rounded-2xl p-6 border transition-all cursor-pointer flex flex-col justify-between ${
            originFilter === "avulso" && activeDashboardView === "bookings"
              ? "border-slate-900 ring-2 ring-slate-900/10"
              : "border-slate-200/90 hover:border-slate-300"
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <CreditCard className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    1. Horas Avulsas
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Checkout direto via PIX ou Cartão
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md tabular-nums">
                {threePillarsAnalytics.avulso.count} reservas (
                {threePillarsAnalytics.avulso.hours}h)
              </span>
            </div>

            <div className="pb-4 mb-4 border-b border-slate-100 tabular-nums">
              <p className="text-[11px] font-medium text-slate-400">
                Volume Bruto no Período
              </p>
              <p className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                R$ {formatBRL(threePillarsAnalytics.avulso.grossBrl)}
              </p>
            </div>

            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex justify-between text-slate-600">
                <span>Repasse Clínicas / Co-Hosts (80%)</span>
                <span className="font-semibold text-slate-900">
                  R$ {formatBRL(threePillarsAnalytics.avulso.hostPayoutBrl)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                <span className="font-semibold text-slate-900">
                  Receita Líquida Fusion (20%)
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  + R${" "}
                  {formatBRL(threePillarsAnalytics.avulso.platformProfitBrl)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              {originFilter === "avulso"
                ? "Filtro ativo (clique p/ mostrar todos)"
                : "Filtrar apenas Horas Avulsas"}
            </span>
            <ExternalLink className="w-3.5 h-3.5" />
          </div>
        </div>

        {/* 2. PACOTES FUSION PASS+ */}
        <div
          onClick={() => {
            setActiveDashboardView("bookings");
            setOriginFilter(originFilter === "package" ? "all" : "package");
          }}
          className={`bg-white rounded-2xl p-6 border transition-all cursor-pointer flex flex-col justify-between ${
            originFilter === "package" && activeDashboardView === "bookings"
              ? "border-slate-900 ring-2 ring-slate-900/10"
              : "border-slate-200/90 hover:border-slate-300"
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-orange-50 text-[#BF4B24] flex items-center justify-center shrink-0">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    2. Pacotes Fusion Pass+
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    PIX ({breakageTotals.pixSubscribersCount}) • Cartão (
                    {breakageTotals.cardSubscribersCount}) • Sobras & Downgrade
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-[#BF4B24] bg-orange-50 px-2.5 py-1 rounded-md tabular-nums">
                {threePillarsAnalytics.packages.count} usos (
                {threePillarsAnalytics.packages.hoursUsedInPeriod}h)
              </span>
            </div>

            <div className="pb-3.5 mb-3.5 border-b border-slate-100 tabular-nums">
              <div className="flex items-baseline justify-between">
                <div>
                  <p className="text-[11px] font-medium text-slate-400">
                    Créditos Consumidos no Período
                  </p>
                  <p className="text-2xl font-bold text-slate-900 tracking-tight mt-0.5">
                    R${" "}
                    {formatBRL(threePillarsAnalytics.packages.grossConsumedBrl)}
                  </p>
                </div>
                <span className="text-xs font-medium text-slate-500">
                  MRR Ativo: R$ {formatBRL(breakageTotals.activeMrrBrl)}
                </span>
              </div>

              <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-500 bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100">
                <span>
                  Basic:{" "}
                  <strong className="text-slate-700">
                    {threePillarsAnalytics.packages.byTier.start.hours}h
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  VIP:{" "}
                  <strong className="text-slate-700">
                    {threePillarsAnalytics.packages.byTier.vip.hours}h
                  </strong>
                </span>
                <span className="text-slate-300">•</span>
                <span>
                  Premium:{" "}
                  <strong className="text-slate-700">
                    {threePillarsAnalytics.packages.byTier.master.hours}h
                  </strong>
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex items-center justify-between text-slate-600">
                <span>Taxa Base (20%) / Repasse Clínicas</span>
                <span className="font-semibold text-slate-900">
                  R$ {formatBRL(threePillarsAnalytics.packages.standardFeeBrl)}{" "}
                  / R$ {formatBRL(threePillarsAnalytics.packages.hostPayoutBrl)}
                </span>
              </div>

              <div className="flex items-center justify-between text-slate-600">
                <span>
                  Ganho Downgrade (
                  {threePillarsAnalytics.packages.downgradeCount}x) + Sobras
                  Vencidas
                </span>
                <span className="font-semibold text-emerald-700">
                  + R${" "}
                  {formatBRL(
                    threePillarsAnalytics.packages.downgradeSpreadBrl +
                      breakageTotals.totalRealizedBreakageProfitBrl,
                  )}
                </span>
              </div>

              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Lucro Realizado Fusion
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  + R${" "}
                  {formatBRL(
                    threePillarsAnalytics.packages
                      .totalPlatformBookingProfitBrl +
                      breakageTotals.totalRealizedBreakageProfitBrl,
                  )}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">
              {originFilter === "package"
                ? "Filtro ativo: Pacotes"
                : "Filtrar reservas de Pacote"}
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveDashboardView(
                  activeDashboardView === "subscribers"
                    ? "bookings"
                    : "subscribers",
                );
              }}
              className="text-xs font-semibold text-[#BF4B24] hover:underline"
            >
              {activeDashboardView === "subscribers"
                ? "Voltar p/ Reservas"
                : `Inteligência de Assinantes (${breakageTotals.totalSubscribersCount})`}
            </button>
          </div>
        </div>

        {/* 3. CONTRATOS FIXOS */}
        <div
          onClick={() => {
            setActiveDashboardView("bookings");
            setOriginFilter(originFilter === "contract" ? "all" : "contract");
          }}
          className={`bg-white rounded-2xl p-6 border transition-all cursor-pointer flex flex-col justify-between ${
            originFilter === "contract" && activeDashboardView === "bookings"
              ? "border-slate-900 ring-2 ring-slate-900/10"
              : "border-slate-200/90 hover:border-slate-300"
          }`}
        >
          <div>
            <div className="flex items-center justify-between gap-2 mb-4">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center shrink-0">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    3. Contratos Fixos
                  </h3>
                  <p className="text-[11px] text-slate-500">
                    Turnos fixos, mensais e sublocações
                  </p>
                </div>
              </div>
              <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md shrink-0 tabular-nums">
                {threePillarsAnalytics.contracts.count} alocações
              </span>
            </div>

            <div className="pb-4 mb-4 border-b border-slate-100 tabular-nums">
              <p className="text-[11px] font-medium text-slate-400">
                Volume de Sessões Contratuais
              </p>
              <div className="flex items-baseline justify-between gap-2 mt-0.5">
                <p className="text-2xl font-bold text-slate-900 tracking-tight">
                  R$ {formatBRL(threePillarsAnalytics.contracts.grossBrl)}
                </p>
                <span className="text-xs font-medium text-slate-500">
                  {threePillarsAnalytics.contracts.hours}h no período
                </span>
              </div>
            </div>

            <div className="space-y-2 text-xs tabular-nums">
              <div className="flex items-center justify-between text-slate-600">
                <span>Repasse Clínicas / Co-Hosts</span>
                <span className="font-semibold text-slate-900">
                  R$ {formatBRL(threePillarsAnalytics.contracts.hostPayoutBrl)}
                </span>
              </div>
              <div className="pt-2 border-t border-slate-100 flex items-center justify-between">
                <span className="font-semibold text-slate-900">
                  Receita Líquida Fusion
                </span>
                <span className="text-sm font-bold text-emerald-700">
                  + R${" "}
                  {formatBRL(threePillarsAnalytics.contracts.platformProfitBrl)}
                </span>
              </div>
            </div>
          </div>

          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>
              {originFilter === "contract"
                ? "Filtro ativo (clique p/ mostrar todos)"
                : "Filtrar apenas Contratos Fixos"}
            </span>
            <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* BARRA DE FILTROS E EXPORTAÇÃO                                        */}
      {/* ==================================================================== */}
      <div className="bg-white border border-slate-200/90 rounded-2xl p-5 mb-6">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            {activeDashboardView === "bookings" ? (
              <>
                <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden">
                  <div className="px-3 text-slate-400 border-r border-slate-200">
                    <CalendarIcon className="w-4 h-4" />
                  </div>
                  <input
                    type="date"
                    value={startDate}
                    onChange={(e) => setStartDate(e.target.value)}
                    className="bg-transparent border-0 text-xs font-semibold text-slate-700 outline-none p-2 w-32 tabular-nums"
                  />
                  <span className="text-slate-300 font-bold px-1">-</span>
                  <input
                    type="date"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="bg-transparent border-0 text-xs font-semibold text-slate-700 outline-none p-2 w-32 tabular-nums"
                  />
                </div>

                <Button
                  onClick={fetchBookings}
                  variant="outline"
                  className="h-9 w-9 p-0 rounded-xl border-slate-200 text-slate-600"
                >
                  {loading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>

                <select
                  value={originFilter}
                  onChange={(e) =>
                    setOriginFilter(
                      e.target.value as
                        "all" | "avulso" | "package" | "contract",
                    )
                  }
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none w-full sm:w-auto"
                >
                  <option value="all">Todos os 3 Subgrupos</option>
                  <option value="avulso">1. Horas Avulsas (PIX/Cartão)</option>
                  <option value="package">
                    2. Pacotes Fusion Pass+ (Carteira)
                  </option>
                  <option value="contract">
                    3. Contratos Fixos & Subcontratos
                  </option>
                </select>

                {originFilter === "package" && (
                  <select
                    value={packageSubFilter}
                    onChange={(e) =>
                      setPackageSubFilter(
                        e.target.value as
                          "all" | "downgrade" | "start" | "vip" | "master",
                      )
                    }
                    className="h-9 rounded-xl border border-slate-300 bg-slate-50 px-3 text-xs font-semibold text-slate-800 outline-none w-full sm:w-auto"
                  >
                    <option value="all">Todas as Categorias de Pacote</option>
                    <option value="downgrade">
                      Apenas c/ Lucro de Downgrade (Sala Inferior)
                    </option>
                    <option value="start">Pacote Basic</option>
                    <option value="vip">Pacote VIP</option>
                    <option value="master">Pacote Premium</option>
                  </select>
                )}

                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-700 outline-none w-full sm:w-auto"
                >
                  <option value="all">Todos os status</option>
                  <option value="confirmed">Confirmados</option>
                  <option value="completed">Concluídos</option>
                  <option value="pending_payment">Aguardando Pagamento</option>
                  <option value="cancelled">Cancelados</option>
                </select>
              </>
            ) : (
              /* FILTROS DE INSIGHTS DE ASSINATURAS */
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
                    Método: PIX + Cartão ({breakageTotals.totalSubscribersCount}
                    )
                  </option>
                  <option value="PIX">
                    Assinantes via PIX ({breakageTotals.pixSubscribersCount})
                  </option>
                  <option value="CREDIT_CARD">
                    Assinantes via Cartão ({breakageTotals.cardSubscribersCount}
                    )
                  </option>
                </select>
              </div>
            )}

            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400" />
              <Input
                placeholder={
                  activeDashboardView === "subscribers"
                    ? "Buscar assinante por nome ou e-mail..."
                    : "Buscar clínica ou especialista..."
                }
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-9 pl-8 rounded-xl border-slate-200 bg-white text-xs min-w-[200px]"
              />
            </div>
          </div>

          <div className="flex gap-2.5 w-full lg:w-auto">
            <Button
              onClick={handleExportExcel}
              variant="outline"
              className="flex-1 lg:flex-none border-slate-200 text-slate-700 font-semibold h-9 text-xs rounded-xl"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 mr-1.5" /> Exportar CSV
            </Button>
            {activeDashboardView === "bookings" && (
              <Button
                onClick={handleExportFinances}
                className="flex-1 lg:flex-none bg-slate-900 hover:bg-slate-800 text-white font-semibold h-9 text-xs rounded-xl"
              >
                <DownloadCloud className="w-3.5 h-3.5 mr-1.5" /> Exportar
                Finanças
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ================================================================== */}
      {/* VISÃO B: CENTRAL DE INTELIGÊNCIA DE ASSINATURAS FUSION PASS+       */}
      {/* ================================================================== */}
      {activeDashboardView === "subscribers" ? (
        <div className="space-y-6 animate-in fade-in">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 tabular-nums">
            <div className="bg-white border border-slate-200/90 p-5 rounded-2xl">
              <div className="flex items-center justify-between">
                <p className="text-xs font-semibold text-slate-500">
                  Base de Assinantes & Método
                </p>
                <span className="text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded">
                  MRR: R$ {formatBRL(breakageTotals.activeMrrBrl)}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900 mt-1.5">
                {breakageTotals.activeSubscribersCount} ativos{" "}
                <span className="text-xs font-normal text-slate-400">
                  / {breakageTotals.totalSubscribersCount} total
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Via PIX: <strong>{breakageTotals.pixSubscribersCount}</strong> •
                Via Cartão:{" "}
                <strong>{breakageTotals.cardSubscribersCount}</strong>
              </p>
            </div>

            <div className="bg-white border border-slate-200/90 p-5 rounded-2xl">
              <p className="text-xs font-semibold text-slate-500">
                Renovações, Reativações & Churn
              </p>
              <p className="text-2xl font-bold text-slate-900 mt-1.5">
                {breakageTotals.renewedSubscribersCount} renovaram
              </p>
              <p className="text-xs text-slate-500 mt-2">
                Reativados (voltaram):{" "}
                <strong className="text-emerald-700">
                  {breakageTotals.reactivatedSubscribersCount}
                </strong>{" "}
                • Cancelados:{" "}
                <strong className="text-red-600">
                  {breakageTotals.cancelledCount}
                </strong>
              </p>
            </div>

            <div className="bg-white border border-slate-200/90 p-5 rounded-2xl">
              <p className="text-xs font-semibold text-slate-500">
                Radar de Vencimento & Atraso
              </p>
              <div className="flex items-baseline gap-3 mt-1.5">
                <p className="text-2xl font-bold text-amber-700">
                  {breakageTotals.expiringSoonCount}{" "}
                  <span className="text-xs font-medium">vencendo (≤7d)</span>
                </p>
                <span className="text-slate-300">|</span>
                <p className="text-xl font-bold text-red-600">
                  {breakageTotals.overdueCount}{" "}
                  <span className="text-xs font-medium">atrasados</span>
                </p>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Clique em "Perto de Vencer" ou "Atrasados" para cobrar no
                WhatsApp
              </p>
            </div>

            <div className="bg-white border border-slate-200/90 p-5 rounded-2xl">
              <p className="text-xs font-semibold text-slate-500">
                Margem Extra (Breakage + Downgrade)
              </p>
              <p className="text-2xl font-bold text-emerald-700 mt-1.5">
                + R${" "}
                {formatBRL(
                  breakageTotals.totalRealizedBreakageProfitBrl +
                    breakageTotals.totalDowngradeSpreadProfitBrl,
                )}
              </p>
              <p className="text-xs text-slate-500 mt-2">
                {breakageTotals.totalExpiredUnusedHours}h expiradas s/ uso •{" "}
                {breakageTotals.totalActiveRemainingHours}h ativas em carteira
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  Raio-X de Assinantes Fusion Pass+ (PIX e Cartão de Crédito)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Valores puxados exatamente pelo montante pago em cada fatura
                  do Asaas (1º pagamento e renovações).
                </p>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
                <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                  <tr>
                    <th className="px-6 py-3.5">Assinante</th>
                    <th className="px-6 py-3.5">Plano & Pagamento</th>
                    <th className="px-6 py-3.5">Status & Vencimento</th>
                    <th className="px-6 py-3.5">
                      Tempo de Casa (Meses / Histórico)
                    </th>
                    <th className="px-6 py-3.5">
                      Consumo (Usadas / Compradas)
                    </th>
                    <th className="px-6 py-3.5 text-right">
                      Breakage + Downgrade
                    </th>
                    <th className="px-6 py-3.5 text-center">Ações</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredSubscribers.length === 0 ? (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-6 py-12 text-center text-slate-400 font-medium"
                      >
                        Nenhum assinante encontrado para este filtro.
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
                            <button
                              type="button"
                              onClick={() =>
                                handleOpenSpecialistProfile(sub.userId)
                              }
                              className="font-bold text-slate-900 hover:text-[#BF4B24] hover:underline flex items-center gap-1.5"
                            >
                              {sub.specialistName}
                              <ExternalLink className="w-3 h-3 text-slate-400" />
                            </button>
                            <p className="text-[11px] text-slate-400">
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
                              <span className="text-[11px] text-slate-500">
                                {sub.currentExpiresAt
                                  ? sub.daysUntilExpiry !== null &&
                                    sub.daysUntilExpiry >= 0
                                    ? `Vence em ${format(parseISO(sub.currentExpiresAt), "dd/MM/yyyy")} (${sub.daysUntilExpiry}d)`
                                    : `Venceu em ${format(parseISO(sub.currentExpiresAt), "dd/MM/yyyy")}`
                                  : "Sem data de vencimento"}
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
                            <p className="text-[11px] text-slate-500 mt-0.5">
                              {sub.renewalsCount > 0
                                ? `${sub.renewalsCount} renovação(ões)`
                                : "1º ciclo"}
                              {sub.firstSubscriptionDate
                                ? ` • Desde ${format(parseISO(sub.firstSubscriptionDate), "dd/MM/yy")}`
                                : ""}
                            </p>
                            {sub.hasReactivated && (
                              <span className="text-[10px] font-semibold text-emerald-700 block mt-0.5">
                                Cancelou/pausou antes e assinou novamente
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
                            <div className="flex items-center justify-center gap-1.5">
                              {waPhone && (
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
                                  className="h-8 px-2.5 rounded-lg border border-slate-200 text-emerald-700 hover:bg-emerald-50 inline-flex items-center justify-center text-xs font-semibold"
                                >
                                  <MessageCircle className="w-3.5 h-3.5" />
                                </a>
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() =>
                                  handleOpenSpecialistProfile(sub.userId)
                                }
                                className="h-8 font-semibold text-xs border-slate-200 text-slate-700"
                              >
                                Carteira
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      ) : (
        /* ================================================================== */
        /* VISÃO A: TABELA DE AGENDAMENTOS (BOOKINGS)                         */
        /* ================================================================== */
        <div className="bg-white border border-slate-200/90 rounded-2xl overflow-hidden flex flex-col relative">
          {loading && (
            <div className="absolute inset-0 bg-white/50 backdrop-blur-xs z-10 flex items-center justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
            </div>
          )}

          <div className="overflow-x-auto min-h-[400px]">
            <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
              <thead className="bg-slate-50 text-slate-500 font-semibold text-[11px] border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3.5">Clínica & Sala</th>
                  <th className="px-6 py-3.5">Canal / Modalidade</th>
                  <th className="px-6 py-3.5">Especialista</th>
                  <th className="px-6 py-3.5">Entrada / Saída</th>
                  <th className="px-6 py-3.5 text-center">Status</th>
                  <th className="px-6 py-3.5 text-right">
                    Valor Bruto & Receita Fusion
                  </th>
                  <th className="px-6 py-3.5 text-center">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredBookings.length === 0 && !loading ? (
                  <tr>
                    <td colSpan={7} className="px-6 py-16 text-center">
                      <CalendarIcon className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                      <p className="text-slate-400 font-medium">
                        Nenhum agendamento encontrado no período.
                      </p>
                    </td>
                  </tr>
                ) : (
                  filteredBookings.map((booking) => (
                    <tr
                      key={booking.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-3.5">
                        <p className="font-bold text-slate-900">
                          {booking.clinic_name}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {booking.room_name} • Sala{" "}
                          {formatTierLabel(booking.room_tier)}
                        </p>
                      </td>

                      <td className="px-6 py-3.5">
                        <div className="flex flex-col items-start gap-1">
                          {getSubgroupBadge(booking)}
                          <span className="text-[11px] text-slate-500">
                            {booking.pricing_label}
                          </span>
                          {booking.is_downgrade && (
                            <span className="text-[10px] font-semibold text-emerald-700 flex items-center gap-0.5">
                              <ArrowDownRight className="w-3 h-3" />+ R${" "}
                              {formatBRL(booking.downgrade_spread_profit_brl)}{" "}
                              downgrade
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-6 py-3.5">
                        <button
                          type="button"
                          onClick={() =>
                            handleOpenSpecialistProfile(booking.user_id)
                          }
                          className="font-semibold text-slate-900 hover:text-[#BF4B24] hover:underline flex items-center gap-1.5 text-left"
                        >
                          <span>{booking.specialist_name}</span>
                          <ExternalLink className="w-3 h-3 text-slate-400" />
                        </button>
                        {booking.cohost_name &&
                          (!booking.is_contract || booking.is_subcontract) && (
                            <p className="text-[10px] text-slate-500 mt-0.5">
                              Co-Host: {booking.cohost_name} (
                              {booking.cohost_split_pct}%)
                            </p>
                          )}
                      </td>

                      <td className="px-6 py-3.5">
                        <p className="font-semibold text-slate-800">
                          {format(parseISO(booking.start_time), "dd/MM/yyyy")}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {format(parseISO(booking.start_time), "HH:mm")} às{" "}
                          {format(parseISO(booking.end_time), "HH:mm")}
                        </p>
                      </td>

                      <td className="px-6 py-3.5 text-center">
                        {getStatusBadge(booking.status)}
                      </td>

                      <td className="px-6 py-3.5 text-right">
                        <p className="font-bold text-slate-900">
                          R$ {formatBRL(booking.gross_value_brl)}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Fusion:{" "}
                          <strong className="text-emerald-700">
                            R$ {formatBRL(booking.platform_fee_brl)}
                          </strong>{" "}
                          • Clínica: R${" "}
                          {formatBRL(
                            booking.host_payout_brl + booking.cohost_payout_brl,
                          )}
                        </p>
                      </td>

                      <td className="px-6 py-3.5 text-center flex items-center justify-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleOpenReschedule(booking)}
                          disabled={actionLoading}
                          className="h-8 font-semibold text-xs border-slate-200 text-slate-700 hover:bg-slate-50"
                        >
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                          Reagendar
                        </Button>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setSelectedBooking(booking);
                            setIsViewOpen(true);
                          }}
                          className="h-8 font-semibold text-xs border-slate-200 text-slate-600 hover:bg-slate-50"
                        >
                          <Eye className="w-3.5 h-3.5 mr-1.5" /> Detalhes
                        </Button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col md:flex-row justify-end items-center gap-6 tabular-nums">
            <p className="text-xs font-semibold text-slate-500">
              Registros:{" "}
              <span className="text-slate-900">{filteredBookings.length}</span>
            </p>
            <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
            <p className="text-xs font-semibold text-slate-500">
              Receita Fusion no Filtro:{" "}
              <span className="text-sm font-bold text-emerald-700">
                R$ {formatBRL(totalPlatformProfitFiltered)}
              </span>
            </p>
            <div className="h-4 w-px bg-slate-200 hidden md:block"></div>
            <p className="text-xs font-semibold text-slate-500">
              Volume Bruto:{" "}
              <span className="text-base font-bold text-slate-900">
                R$ {formatBRL(totalRevenue)}
              </span>
            </p>
          </div>
        </div>
      )}

      {/* MODAL 0: FICHA DE PERFIL DO PROFISSIONAL */}
      <Sheet open={isProfileOpen} onOpenChange={setIsProfileOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-xl font-bold text-slate-900">
              Perfil & Carteira do Especialista
            </SheetTitle>
            <SheetDescription>
              Créditos injetados manualmente aqui servem para agendamento, mas
              não contam como assinatura paga do Fusion Pass+.
            </SheetDescription>
          </SheetHeader>

          {selectedSpecialist && (
            <div className="mt-6 space-y-5 pb-8">
              <div className="flex items-center gap-4 p-4 rounded-2xl bg-slate-50 border border-slate-200">
                <div className="w-14 h-14 rounded-full bg-slate-200 overflow-hidden flex items-center justify-center shrink-0">
                  {selectedSpecialist.avatar_url ? (
                    <img
                      src={selectedSpecialist.avatar_url}
                      alt={selectedSpecialist.full_name || "Avatar"}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <User className="w-7 h-7 text-slate-500" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    {selectedSpecialist.full_name || "Sem Nome"}
                  </h3>
                  <p className="text-xs font-semibold text-[#BF4B24]">
                    {selectedSpecialist.specialty ||
                      "Especialidade não informada"}
                  </p>
                  {(selectedSpecialist.council ||
                    selectedSpecialist.council_number) && (
                    <Badge className="mt-1.5 bg-slate-900 text-white border-0 text-[10px] font-semibold">
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
                className="w-full h-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs flex items-center justify-center gap-2"
              >
                <FolderOpen className="w-4 h-4" />
                Abrir Dossiê Completo na Aba Especialistas
                <ExternalLink className="w-3.5 h-3.5 ml-1 opacity-70" />
              </Button>

              <div className="bg-slate-900 text-white p-4 rounded-2xl space-y-3 tabular-nums">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-slate-400 flex items-center gap-1.5">
                    <Wallet className="w-3.5 h-3.5 text-slate-300" />
                    Saldo Disponível na Carteira
                  </span>
                  <span className="text-xs font-bold text-emerald-400">
                    Total: {selectedSpecialist.wallet_total}h
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-2 pt-1">
                  <div className="bg-slate-800 p-2.5 rounded-xl text-center">
                    <p className="text-[10px] text-slate-400">Basic</p>
                    <p className="text-base font-bold text-white mt-0.5">
                      {selectedSpecialist.wallet_start}h
                    </p>
                  </div>
                  <div className="bg-slate-800 p-2.5 rounded-xl text-center">
                    <p className="text-[10px] text-slate-400">VIP</p>
                    <p className="text-base font-bold text-white mt-0.5">
                      {selectedSpecialist.wallet_vip}h
                    </p>
                  </div>
                  <div className="bg-slate-800 p-2.5 rounded-xl text-center">
                    <p className="text-[10px] text-slate-400">Premium</p>
                    <p className="text-base font-bold text-white mt-0.5">
                      {selectedSpecialist.wallet_master}h
                    </p>
                  </div>
                </div>
              </div>

              <div className="p-4 rounded-2xl border border-slate-200 bg-slate-50 space-y-3">
                <p className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <PlusCircle className="w-4 h-4 text-[#BF4B24]" />
                  Injetar / Ajustar Créditos Manuais (Cortesia / Avulso)
                </p>

                <div className="grid grid-cols-3 gap-2">
                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">
                      Horas
                    </Label>
                    <Input
                      type="number"
                      value={injectAmount}
                      onChange={(e) => setInjectAmount(e.target.value)}
                      placeholder="Ex: 8"
                      className="mt-1 h-9 bg-white font-bold text-slate-900"
                    />
                  </div>

                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">
                      Categoria
                    </Label>
                    <select
                      value={injectTier}
                      onChange={(e) =>
                        setInjectTier(
                          e.target.value as "start" | "vip" | "master",
                        )
                      }
                      className="mt-1 w-full h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-semibold text-slate-800"
                    >
                      <option value="start">Basic</option>
                      <option value="vip">VIP</option>
                      <option value="master">Premium</option>
                    </select>
                  </div>

                  <div>
                    <Label className="text-[10px] font-semibold text-slate-600">
                      Validade (Dias)
                    </Label>
                    <Input
                      type="number"
                      min="1"
                      value={injectValidityDays}
                      onChange={(e) => setInjectValidityDays(e.target.value)}
                      placeholder="30"
                      className="mt-1 h-9 bg-white font-semibold text-slate-700"
                    />
                  </div>
                </div>

                <div className="flex flex-wrap gap-1.5">
                  {[1, 4, 8, 16, 20, -1].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setInjectAmount(String(preset))}
                      className={`px-2.5 py-1 rounded-lg text-[10px] font-semibold border transition-all ${
                        Number(injectAmount) === preset
                          ? "bg-slate-900 text-white border-slate-900"
                          : "bg-white text-slate-600 border-slate-200"
                      }`}
                    >
                      {preset > 0 ? `+${preset}h` : `${preset}h`}
                    </button>
                  ))}
                </div>

                <div>
                  <Label className="text-[10px] font-semibold text-slate-600">
                    Observação / Motivo (Opcional)
                  </Label>
                  <Input
                    value={injectReason}
                    onChange={(e) => setInjectReason(e.target.value)}
                    placeholder="Ex: Cortesia / Bônus"
                    className="mt-1 h-9 bg-white text-xs"
                  />
                </div>

                <Button
                  type="button"
                  disabled={injectLoading}
                  onClick={handleInjectCredits}
                  className="w-full h-10 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-semibold text-xs"
                >
                  {injectLoading ? (
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 mr-2" />
                  )}
                  Confirmar Injeção Manual de {injectAmount || 0}h (
                  {formatTierLabel(injectTier)})
                </Button>
              </div>

              <div className="space-y-3 bg-white p-4 rounded-2xl border border-slate-200 text-xs">
                <p className="text-[11px] font-semibold text-slate-400">
                  Dados de Contato
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <span className="text-slate-400 block">CPF</span>
                    <span className="font-semibold text-slate-800">
                      {selectedSpecialist.cpf || "Não informado"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Nascimento</span>
                    <span className="font-semibold text-slate-800">
                      {selectedSpecialist.birth_date
                        ? format(
                            parseISO(selectedSpecialist.birth_date),
                            "dd/MM/yyyy",
                          )
                        : "Não informada"}
                    </span>
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-100 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5 text-slate-400" />
                      WhatsApp:
                    </span>
                    <span className="font-semibold text-slate-900">
                      {selectedSpecialist.whatsapp ||
                        selectedSpecialist.phone ||
                        "Não informado"}
                    </span>
                  </div>

                  <div className="flex items-center justify-between">
                    <span className="text-slate-500 flex items-center gap-1.5">
                      <Mail className="w-3.5 h-3.5 text-slate-400" />
                      E-mail:
                    </span>
                    <span className="font-semibold text-slate-900 truncate max-w-[200px]">
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
                    className="mt-3 w-full inline-flex items-center justify-center gap-2 h-10 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs transition-colors"
                  >
                    <MessageCircle className="w-4 h-4" />
                    Conversar no WhatsApp
                  </a>
                )}
              </div>

              <div className="p-4 rounded-2xl bg-slate-50 border border-slate-200 space-y-1.5 text-xs">
                <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" /> Endereço Cadastrado
                </p>
                {selectedSpecialist.address_street ? (
                  <>
                    <p className="font-semibold text-slate-800">
                      {selectedSpecialist.address_street},{" "}
                      {selectedSpecialist.address_number || "S/N"}
                      {selectedSpecialist.address_complement
                        ? ` (${selectedSpecialist.address_complement})`
                        : ""}
                    </p>
                    <p className="text-slate-600">
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
                  <p className="text-slate-400">
                    Endereço ainda não preenchido pelo profissional.
                  </p>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* MODAL 1: VISUALIZAR DETALHES */}
      <Sheet open={isViewOpen} onOpenChange={setIsViewOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-xl font-bold text-slate-900">
              Detalhes da Reserva
            </SheetTitle>
            <SheetDescription>
              Informações operacionais e divisão de repasses.
            </SheetDescription>
          </SheetHeader>

          {selectedBooking && (
            <div className="mt-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-medium text-slate-400">
                    ID da Reserva
                  </p>
                  <p className="text-xs font-mono text-slate-700">
                    {selectedBooking.id}
                  </p>
                </div>
                {getSubgroupBadge(selectedBooking)}
              </div>

              <div className="grid grid-cols-2 gap-4 tabular-nums">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[11px] font-medium text-slate-400">
                    Status
                  </p>
                  <div className="mt-1">
                    {getStatusBadge(selectedBooking.status)}
                  </div>
                </div>
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[11px] font-medium text-slate-400">
                    Receita Bruta
                  </p>
                  <p className="text-lg font-bold text-slate-900">
                    R$ {formatBRL(selectedBooking.gross_value_brl)}
                  </p>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    {selectedBooking.pricing_label}
                  </p>
                </div>
              </div>

              <div className="bg-slate-900 text-white p-4 rounded-xl space-y-2 tabular-nums">
                <p className="text-[11px] font-medium text-slate-400">
                  Distribuição Financeira (Split)
                </p>

                {selectedBooking.is_downgrade && (
                  <div className="bg-slate-800 p-2.5 rounded-lg mb-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-slate-300">
                        Valor do Crédito{" "}
                        {formatTierLabel(
                          selectedBooking.credit_tier_normalized,
                        )}
                        :
                      </span>
                      <span className="font-semibold text-white">
                        R$ {formatBRL(selectedBooking.gross_value_brl)}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-slate-300">
                        Base da Sala{" "}
                        {formatTierLabel(selectedBooking.room_tier)}:
                      </span>
                      <span className="text-slate-300">
                        R$ {formatBRL(selectedBooking.room_base_value_brl)}
                      </span>
                    </div>
                    <div className="flex justify-between text-emerald-400 pt-1 border-t border-slate-700">
                      <span>Ganho Extra Downgrade (100% Fusion):</span>
                      <span className="font-bold">
                        + R${" "}
                        {formatBRL(selectedBooking.downgrade_spread_profit_brl)}
                      </span>
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-xs">
                  <span className="text-slate-300">
                    Taxa Base Plataforma (20%):
                  </span>
                  <span className="text-slate-200">
                    R$ {formatBRL(selectedBooking.standard_platform_fee_brl)}
                  </span>
                </div>

                <div className="flex justify-between text-xs">
                  <span className="text-slate-200 font-semibold">
                    Receita Total Fusion:
                  </span>
                  <span className="font-bold text-emerald-400">
                    + R$ {formatBRL(selectedBooking.platform_fee_brl)}
                  </span>
                </div>

                {selectedBooking.cohost_payout_brl > 0 && (
                  <div className="flex justify-between text-xs">
                    <span className="text-slate-300">
                      Repasse Co-Anfitrião ({selectedBooking.cohost_name}):
                    </span>
                    <span className="font-semibold text-white">
                      R$ {formatBRL(selectedBooking.cohost_payout_brl)}
                    </span>
                  </div>
                )}

                <div className="flex justify-between text-xs pt-1 border-t border-slate-800">
                  <span className="text-slate-300">
                    Repasse Clínica ({selectedBooking.clinic_name}):
                  </span>
                  <span className="font-bold text-white">
                    R$ {formatBRL(selectedBooking.host_payout_brl)}
                  </span>
                </div>
              </div>

              {selectedBooking.is_contract && (
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200 flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold text-slate-900">
                      {selectedBooking.is_subcontract
                        ? "Subcontrato Fixo (Co-Host)"
                        : "Reserva de Contrato Recorrente"}
                    </p>
                    <p className="text-[11px] text-slate-500">
                      Alocação garantida por contrato de locação.
                    </p>
                  </div>
                  {selectedBooking.contract_pdf_url && (
                    <a
                      href={selectedBooking.contract_pdf_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-900 text-white text-xs font-semibold hover:bg-slate-800"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      Ver PDF
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}

              <div className="space-y-4 text-xs">
                <div>
                  <Label className="text-slate-400">Clínica & Sala</Label>
                  <p className="font-semibold text-slate-900 mt-0.5">
                    {selectedBooking.clinic_name} - {selectedBooking.room_name}{" "}
                    (Sala {formatTierLabel(selectedBooking.room_tier)})
                  </p>
                </div>
                <div>
                  <Label className="text-slate-400">Especialista</Label>
                  <div className="mt-0.5">
                    <button
                      type="button"
                      onClick={() => {
                        setIsViewOpen(false);
                        handleOpenSpecialistProfile(selectedBooking.user_id);
                      }}
                      className="font-semibold text-[#BF4B24] hover:underline inline-flex items-center gap-1.5"
                    >
                      {selectedBooking.specialist_name}
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
                <div>
                  <Label className="text-slate-400">Período Reservado</Label>
                  <p className="font-semibold text-slate-900 mt-0.5">
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
                    className="w-full font-semibold h-11 rounded-xl text-xs"
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
            <DialogTitle className="text-lg font-bold text-slate-900">
              Gestão de Reagendamento
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs">
              Altere a data, o horário e a sala do cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="bg-white p-4 rounded-xl shadow-xs border border-slate-100 flex gap-4 items-center">
              <div className="w-14 h-14 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                {roomImageUrl ? (
                  <img
                    src={roomImageUrl}
                    alt="Foto da Sala"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-6 h-6 text-slate-300" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-[11px] font-semibold text-slate-400">
                  Sala do Reagendamento
                </Label>
                <Select
                  value={selectedRescheduleRoomId || undefined}
                  onValueChange={(val) => {
                    setSelectedRescheduleRoomId(val);
                    setSelectedSlot("");
                  }}
                >
                  <SelectTrigger className="bg-white font-semibold h-10 border-slate-200 text-slate-700 w-full text-left shadow-none">
                    <SelectValue placeholder="Selecione uma sala..." />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateRooms.map((room) => (
                      <SelectItem
                        key={room.id}
                        value={room.id}
                        className="font-semibold text-slate-700"
                      >
                        {room.name} ({room.host_name || "Clínica Padrão"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {isDifferentRoom && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-2 items-center">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs text-amber-800">
                  Você está alocando o cliente para uma sala diferente da
                  reserva original.
                </p>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-6">
              <div className="shrink-0 border border-slate-100 rounded-xl p-2 bg-white h-fit">
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
                  <Label className="text-xs font-semibold text-slate-700">
                    Horários Livres da Sala
                  </Label>
                  <span className="text-[#BF4B24] font-bold text-xs">
                    {availableSlots.length > 0 && rescheduleDate
                      ? `${format(rescheduleDate, "dd/MM", { locale: ptBR })}`
                      : ""}
                  </span>
                </div>

                <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 overflow-y-auto min-h-[250px] max-h-[310px]">
                  {loadingSlots ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#BF4B24]" />
                      <p className="text-xs text-slate-500">
                        Consultando agenda...
                      </p>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <CalendarDays className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-500">
                        Nenhum horário disponível.
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
                            className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                              isSelected
                                ? "bg-slate-900 border-slate-900 text-white"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
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
              className="rounded-xl font-semibold text-xs text-slate-500"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={
                actionLoading || !selectedSlot || !selectedRescheduleRoomId
              }
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl h-10 text-xs"
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

      {/* MODAL 3: NOVA RESERVA MANUAL */}
      <Dialog open={isNewBookingOpen} onOpenChange={setIsNewBookingOpen}>
        <DialogContent className="sm:max-w-3xl bg-[#F5F2F0] border-none shadow-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-lg font-bold text-slate-900">
              Nova Reserva Manual (Admin)
            </DialogTitle>
            <DialogDescription className="text-slate-600 text-xs">
              Aloque horários diretamente para um especialista bloqueando a
              agenda da sala.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 bg-white p-4 rounded-xl border border-slate-100">
              <div>
                <Label className="text-[11px] font-semibold text-slate-500">
                  Especialista
                </Label>
                <select
                  value={newBookingSpecialistId}
                  onChange={(e) => setNewBookingSpecialistId(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
                >
                  {allSpecialists.map((spec) => (
                    <option key={spec.id} value={spec.id}>
                      {spec.full_name || spec.email || spec.id}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-500">
                  Sala / Consultório
                </Label>
                <select
                  value={newBookingRoomId}
                  onChange={(e) => setNewBookingRoomId(e.target.value)}
                  className="mt-1 w-full h-10 rounded-lg border border-slate-200 bg-white px-3 text-xs font-semibold text-slate-800"
                >
                  {allActiveRooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({formatTierLabel(normalizeTier(r.tier))})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <Label className="text-[11px] font-semibold text-slate-500">
                  Valor Total Acordado R$ (Opcional)
                </Label>
                <Input
                  type="number"
                  placeholder="Automático pela tarifa"
                  value={newBookingAgreedBrl}
                  onChange={(e) => setNewBookingAgreedBrl(e.target.value)}
                  className="mt-1 h-10 bg-white text-xs font-semibold"
                />
              </div>
            </div>

            <div className="flex flex-col md:flex-row gap-6">
              <div className="shrink-0 border border-slate-100 rounded-xl p-2 bg-white h-fit">
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
                  <Label className="text-xs font-semibold text-slate-700">
                    Horários Livres ({newBookingSelectedSlots.length}{" "}
                    selecionado(s))
                  </Label>
                </div>

                <div className="flex-1 bg-white border border-slate-100 rounded-xl p-4 overflow-y-auto min-h-[250px] max-h-[310px]">
                  {loadingSlots ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#BF4B24]" />
                      <p className="text-xs text-slate-500">
                        Verificando disponibilidade...
                      </p>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <CalendarDays className="w-8 h-8 text-slate-300 mb-2" />
                      <p className="text-xs font-semibold text-slate-500">
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
                            className={`py-2 px-3 rounded-lg border text-xs font-semibold transition-all ${
                              isSelected
                                ? "bg-slate-900 border-slate-900 text-white"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:border-slate-300"
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
              className="rounded-xl font-semibold text-xs text-slate-500"
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
              className="bg-slate-900 hover:bg-slate-800 text-white font-semibold rounded-xl h-10 text-xs"
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
