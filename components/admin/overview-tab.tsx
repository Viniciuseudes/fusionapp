"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
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
  subDays,
  addDays,
  startOfYear,
  startOfDay,
  endOfDay,
  parseISO,
  format,
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
  "#BF4B24",
  "#7C3AED",
  "#10B981",
  "#F59E0B",
  "#64748B",
  "#EC4899",
  "#0F172A",
];

interface LedgerEntry {
  id: string;
  booking_id: string;
  transaction_date: string; // created_at (quando agendou/pagou) ou data da baixa do contrato
  created_at: string;
  start_time: string;
  end_time: string;
  status: string;
  room_id: string;
  room_name: string;
  clinic_id: string;
  clinic_name: string;
  user_id: string;
  specialist_name: string;
  specialty: string;
  is_contract: boolean;
  modality_label: string;
  duration_hours: number;
  gross_brl: number;
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
  // Passado (Período Selecionado)
  past_available_hours: number;
  past_booked_hours: number;
  past_avulso_hours: number;
  past_contract_hours: number;
  past_free_hours: number;
  past_occupancy_pct: number;
  past_potential_revenue: number;
  past_actual_revenue: number;
  past_uncaptured_revenue: number;
  // Futuro (Próximos N dias)
  future_available_hours: number;
  future_booked_hours: number;
  future_avulso_hours: number;
  future_contract_hours: number;
  future_free_hours: number;
  future_occupancy_pct: number;
  future_potential_revenue: number;
  future_locked_revenue: number;
  future_open_opportunity_revenue: number;
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

// Extrai os eventos de Baixa Integral de um contrato (valor cheio no dia da baixa)
function extractContractBaixaEvents(contract: any): {
  competence: string;
  paidDateIso: string; // YYYY-MM-DDTHH:mm:ss
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

  // 1. Se houver histórico de baixas salvo em schedule_config.paid_dates
  if (sched?.paid_dates && typeof sched.paid_dates === "object") {
    Object.entries(sched.paid_dates).forEach(([comp, dateStr]) => {
      if (comp && typeof dateStr === "string") {
        const cleanDate = dateStr.slice(0, 10);
        paidCompetencesMap.set(comp, `${cleanDate}T12:00:00`);
      }
    });
  }

  // 2. Competência marcada como paga em last_paid_competence (quando o gestor dá baixa)
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

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function AdminOverviewTab() {
  const supabase = createClient();
  const { toast } = useToast();

  // `initialLoading` apenas na primeira montagem; `isRefreshing` evita desmontar a página e perder o scroll!
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
  const [chartView, setChartView] = useState<"both" | "avulso" | "contract">(
    "both",
  );

  // Controles do Módulo de Estoque de Horas & Potencial Financeiro (Troca instantânea sem recarregar!)
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

  // Estados Separados: Horas Avulsas vs Contratos
  const [avulsoGmv, setAvulsoGmv] = useState(0);
  const [avulsoTakeRate, setAvulsoTakeRate] = useState(0);
  const [avulsoBookingsCount, setAvulsoBookingsCount] = useState(0);
  const [avulsoHoursCount, setAvulsoHoursCount] = useState(0);

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

  // Dados brutos em memória para cálculo instantâneo de 15d / 20d / 30d sem reload
  const [baseRoomsForCapacity, setBaseRoomsForCapacity] = useState<any[]>([]);
  const [futureResolvedEntries, setFutureResolvedEntries] = useState<
    LedgerEntry[]
  >([]);

  // Controles do Modal de Extrato Bancário (Ledger via Dialog Portal)
  const [isLedgerOpen, setIsLedgerOpen] = useState(false);
  const [ledgerOriginFilter, setLedgerOriginFilter] = useState<
    "all" | "avulso" | "contract"
  >("all");
  const [ledgerClinicFilter, setLedgerClinicFilter] = useState<string>("all");
  const [ledgerSearch, setLedgerSearch] = useState("");

  useEffect(() => {
    async function fetchRealBI() {
      setIsRefreshing(true);
      try {
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

        // Busca sempre 30 dias para a frente de uma só vez; os botões +15d, +20d e +30d filtram em memória sem recarregar a página!
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
        ]);

        if (bookingsByStartRes.error) throw bookingsByStartRes.error;
        if (roomsRes.error) throw roomsRes.error;

        // Unifica reservas sem duplicidade
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

        const bookingIds = allFetchedBookings
          .map((b: any) => b.id)
          .filter(Boolean);
        const userIds = [
          ...new Set(
            allFetchedBookings.map((b: any) => b.user_id).filter(Boolean),
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

        const [profilesRes, walletRes, subsRes, couponsRes] = await Promise.all(
          [
            allProfileIds.length > 0
              ? supabase
                  .from("profiles")
                  .select("id, full_name, specialty")
                  .in("id", allProfileIds)
              : Promise.resolve({ data: [] as any[], error: null }),
            userIds.length > 0
              ? supabase
                  .from("wallet_transactions")
                  .select(
                    "id, user_id, amount, type, description, tier, created_at, expires_at",
                  )
                  .in("user_id", userIds)
                  .order("created_at", { ascending: true })
              : Promise.resolve({ data: [] as any[], error: null }),
            userIds.length > 0
              ? supabase
                  .from("subscriptions")
                  .select("id, user_id, tier, hours, status, created_at")
                  .in("user_id", userIds)
              : Promise.resolve({ data: [] as any[], error: null }),
            bookingIds.length > 0
              ? supabase
                  .from("coupon_uses")
                  .select("booking_id, discount_applied")
                  .in("booking_id", bookingIds)
              : Promise.resolve({ data: [] as any[], error: null }),
          ],
        );

        if (profilesRes.error) throw profilesRes.error;
        const profilesData = profilesRes.data || [];
        const profilesMap = new Map<string, any>(
          profilesData.map((p: any) => [p.id, p]),
        );

        const roomsMap = new Map<string, any>(
          roomsData.map((r: any) => [r.id, r]),
        );
        const categoriesMap = new Map<string, any>(
          (categoriesRes.data || []).map((c: any) => [c.id, c]),
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

        (packagesRes.data || []).forEach((pkg: any) => {
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
        (walletRes.data || []).forEach((tx: any) => {
          const list = userWalletMap.get(tx.user_id) || [];
          list.push(tx);
          userWalletMap.set(tx.user_id, list);
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

          // 1. Reserva de CONTRATO:
          // Conta apenas as HORAS OCUPADAS (duration_hours), mas tem valor R$ 0 na sessão diária,
          // pois o valor cheio do contrato entra integralmente apenas no dia da BAIXA!
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
              room_id: b.room_id,
              room_name: room?.name || "Sala Removida",
              clinic_id: room?.host_id || "fusion",
              clinic_name: clinicName,
              user_id: b.user_id,
              specialist_name:
                linkedContract?.specialist_name || specialistName,
              specialty,
              is_contract: true,
              modality_label: modalityLabel,
              duration_hours: slotUnits,
              gross_brl: 0,
              fusion_fee_brl: 0,
              fusion_fee_pct: feePct,
              cohost_name: null,
              cohost_payout_brl: 0,
              host_payout_brl: 0,
            };
          }

          // Verifica Co-Anfitrião ativo para sublocação
          const roomCohost = activeCohostByRoomId.get(b.room_id);
          const cohostName = roomCohost?.specialist_name || null;
          const cohostSplitPct = roomCohost
            ? Number(roomCohost.cohost_split_pct || 0)
            : 0;

          const computeAvulsoSplit = (grossVal: number) => {
            const fusionFee = grossVal * 0.2;
            const netAfterFusion = Math.max(0, grossVal - fusionFee);
            const cohostPayout =
              cohostSplitPct > 0 ? netAfterFusion * (cohostSplitPct / 100) : 0;
            const hostPayout = Math.max(0, netAfterFusion - cohostPayout);
            return { fusionFee, cohostPayout, hostPayout };
          };

          const rawTotalCost = Number(b.total_cost || 0);
          const upgradeFee = Number(b.upgrade_fee_amount || 0);
          const discount = couponDiscountMap.get(b.id) || 0;

          // 2. Reserva Avulsa Direta em R$
          if (
            Number(b.agreed_value_brl) > 0 ||
            rawTotalCost >= slotUnits * 20
          ) {
            const baseVal =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl)
                : rawTotalCost;
            const rev = Math.max(0, baseVal + upgradeFee - discount);
            const split = computeAvulsoSplit(rev);

            return {
              id: b.id,
              booking_id: b.id,
              transaction_date: b.created_at || b.start_time,
              created_at: b.created_at || b.start_time,
              start_time: b.start_time,
              end_time: b.end_time,
              status: b.status,
              room_id: b.room_id,
              room_name: room?.name || "Sala Removida",
              clinic_id: room?.host_id || "fusion",
              clinic_name: clinicName,
              user_id: b.user_id,
              specialist_name: specialistName,
              specialty,
              is_contract: false,
              modality_label: `Avulso • ${formatTierLabel(roomTier)} Direto`,
              duration_hours: slotUnits,
              gross_brl: rev,
              fusion_fee_brl: split.fusionFee,
              fusion_fee_pct: 20,
              cohost_name: cohostName,
              cohost_payout_brl: split.cohostPayout,
              host_payout_brl: split.hostPayout,
            };
          }

          // 3. Reserva Avulsa via Créditos / Pacotes
          const creditsForThisSlot =
            rawTotalCost > 0 && rawTotalCost <= slotUnits * 2
              ? rawTotalCost
              : slotUnits;

          const userTxs = userWalletMap.get(b.user_id) || [];
          const bookingTime = b.created_at
            ? new Date(b.created_at).getTime()
            : new Date(b.start_time).getTime();

          let creditTierUsed: "start" | "vip" | "master" = roomTier;
          const matchingDebit = userTxs.find((tx: any) => {
            if (Number(tx.amount) >= 0) return false;
            const txTime = new Date(tx.created_at).getTime();
            return Math.abs(txTime - bookingTime) <= 10 * 60 * 1000;
          });
          if (matchingDebit?.tier) {
            creditTierUsed = normalizeTier(matchingDebit.tier);
          }

          const compatibleTiers: ("start" | "vip" | "master")[] =
            roomTier === "master"
              ? ["master"]
              : roomTier === "vip"
                ? ["vip", "master"]
                : ["start", "vip", "master"];

          const purchaseCredits = userTxs.filter(
            (tx: any) =>
              Number(tx.amount) > 0 &&
              !String(tx.description || "")
                .toLowerCase()
                .includes("estorno"),
          );

          const validPriorPurchases = purchaseCredits.filter((tx: any) => {
            const createdMs = new Date(tx.created_at).getTime();
            const notAfterBooking = createdMs <= bookingTime + 60 * 1000;
            const notExpiredAtBooking =
              !tx.expires_at ||
              new Date(tx.expires_at).getTime() >= bookingTime;
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

          let modalityLabel = "";
          if (resolvedHourlyRate !== null) {
            modalityLabel = matchedHours
              ? `Avulso • ${formatTierLabel(creditTierUsed)} (${matchedHours}h)`
              : `Avulso • Crédito ${formatTierLabel(creditTierUsed)}`;
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

            const defaultTierRates: Record<"start" | "vip" | "master", number> =
              {
                start: 33.38,
                vip: 41.13,
                master: 60,
              };

            resolvedHourlyRate =
              roomModalityRate || categoryRate || defaultTierRates[roomTier];
            modalityLabel = `Avulso • Tarifa ${formatTierLabel(roomTier)}`;
          }

          const rev = Math.max(
            0,
            creditsForThisSlot * resolvedHourlyRate + upgradeFee - discount,
          );
          const split = computeAvulsoSplit(rev);

          return {
            id: b.id,
            booking_id: b.id,
            transaction_date: b.created_at || b.start_time,
            created_at: b.created_at || b.start_time,
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            room_id: b.room_id,
            room_name: room?.name || "Sala Removida",
            clinic_id: room?.host_id || "fusion",
            clinic_name: clinicName,
            user_id: b.user_id,
            specialist_name: specialistName,
            specialty,
            is_contract: false,
            modality_label: modalityLabel,
            duration_hours: slotUnits,
            gross_brl: rev,
            fusion_fee_brl: split.fusionFee,
            fusion_fee_pct: 20,
            cohost_name: cohostName,
            cohost_payout_brl: split.cohostPayout,
            host_payout_brl: split.hostPayout,
          };
        };

        // ========================================================
        // SEPARAÇÃO ENTRE PERÍODO ANALISADO E JANELA FUTURA (ATÉ 30d)
        // ========================================================
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
            contractRevenue: 0,
            platformFee: 0,
            hostNet: 0,
            bookings: 0,
            occupiedHours: 0,
            avulsoHours: 0,
            contractHours: 0,
            pastAvailHours,
            hasContracts: roomContracts.length > 0,
            hasExclusiveContract,
            cohostName: cohostContract?.specialist_name || null,
          };
        });

        const useMonthlyGrouping =
          timeFilter === "ytd" || (timeFilter === "custom" && daysCount > 62);

        // 1. Processa reservas (Avulsas somam R$ e horas; Contratos somam APENAS horas ocupadas e mapa de calor)
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

          // Mapa de calor conta todas as sessões físicas (avulso + contrato)
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

          if (entry.is_contract) {
            // Sessão de contrato: contabiliza apenas horas ocupadas e demanda da especialidade (sem diluir valor no gráfico!)
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

          // Sessão Avulsa: contabiliza faturamento, taxas, gráfico e horas
          totalGmv += entry.gross_brl;
          totalTakeRate += entry.fusion_fee_brl;
          totalHostNet += entry.host_payout_brl + entry.cohost_payout_brl;

          sumAvulsoGmv += entry.gross_brl;
          sumAvulsoTake += entry.fusion_fee_brl;
          countAvulsoBookings += 1;
          sumAvulsoHours += entry.duration_hours;

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
              contractGmv: 0,
              contractFee: 0,
              order: startOfDay(refDateObj).getTime(),
            };
          }

          revMap[dateKey].totalGmv += entry.gross_brl;
          revMap[dateKey].platformFee += entry.fusion_fee_brl;
          revMap[dateKey].avulsoGmv += entry.gross_brl;
          revMap[dateKey].avulsoFee += entry.fusion_fee_brl;

          if (!specMap[entry.specialty]) {
            specMap[entry.specialty] = { count: 0, revenue: 0 };
          }
          specMap[entry.specialty].count += 1;
          specMap[entry.specialty].revenue += entry.gross_brl;

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
        });

        // =========================================================================
        // 2. PROCESSA AS BAIXAS INTEGRAIS DE CONTRATOS (VALOR TOTAL NO DIA DA BAIXA)
        // =========================================================================
        const contractBaixaLedgerEntries: LedgerEntry[] = [];

        contractsData.forEach((c: any) => {
          const room = roomsMap.get(c.room_id);
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
              // Soma o valor cheio do contrato no faturamento do período!
              totalGmv += ev.grossBrl;
              totalTakeRate += ev.fusionFeeBrl;
              totalHostNet += ev.hostPayoutBrl;

              sumContractGmv += ev.grossBrl;
              sumContractTake += ev.fusionFeeBrl;
              countContractBookings += 1;

              // Injeta o valor cheio do contrato APENAS no dia exato da baixa no gráfico!
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

              // Adiciona o lançamento único da baixa integral no Extrato Bancário
              contractBaixaLedgerEntries.push({
                id: `baixa_${c.id}_${ev.competence}`,
                booking_id: c.id,
                transaction_date: ev.paidDateIso,
                created_at: ev.paidDateIso,
                start_time: ev.paidDateIso,
                end_time: ev.paidDateIso,
                status: "completed",
                room_id: c.room_id,
                room_name: room?.name || "Sala",
                clinic_id: room?.host_id || "fusion",
                clinic_name: clinicName,
                user_id: c.specialist_id || "",
                specialist_name: c.specialist_name || "Locatário Contrato",
                specialty,
                is_contract: true,
                modality_label: `${modalityLabel} (Baixa ${ev.competence})`,
                duration_hours: roomContractHoursInPeriod,
                gross_brl: ev.grossBrl,
                fusion_fee_brl: ev.fusionFeeBrl,
                fusion_fee_pct: ev.fusionFeePct,
                cohost_name: null,
                cohost_payout_brl: 0,
                host_payout_brl: ev.hostPayoutBrl,
              });
            }
          });
        });

        const activeContractsList = contractsData.filter(
          (c: any) => c.status === "active",
        );

        let recurringDocs = 0;
        doctorBookingCounts.forEach((cnt) => {
          if (cnt >= 2) recurringDocs += 1;
        });

        // No Extrato Bancário entram as reservas avulsas + os lançamentos integrais de baixa de contrato
        const avulsoLedgerEntries = periodEntries.filter((e) => !e.is_contract);
        setLedgerEntries([
          ...avulsoLedgerEntries,
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

  // =========================================================================
  // CÁLCULO EM MEMÓRIA DE +15d, +20d E +30d (ZERO RELOAD E ZERO SCROLL JUMP!)
  // =========================================================================
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

        // Calcula a capacidade futura desta sala para o horizonte selecionado (15, 20 ou 30 dias)
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
        let futureContractHours = 0;
        let futureLockedRevenue = 0;

        roomFutureBookings.forEach((fe) => {
          futureBookedHours += fe.duration_hours;
          futureLockedRevenue += fe.gross_brl;
          if (fe.is_contract) futureContractHours += fe.duration_hours;
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
          past_contract_hours: r.contractHours,
          past_free_hours: pastFree,
          past_occupancy_pct: pastOccPct,
          past_potential_revenue: pastPotentialRev,
          past_actual_revenue: r.revenue,
          past_uncaptured_revenue: pastUncapturedRev,
          future_available_hours: futAvail,
          future_booked_hours: futureBookedHours,
          future_avulso_hours: futureAvulsoHours,
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
    origin: "all" | "avulso" | "contract" = "all",
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

  // Extrato ordenado pela data em que a reserva foi AGENDADA/PAGA ou da BAIXA DO CONTRATO (`transaction_date`)
  const processedLedger = useMemo(() => {
    const q = ledgerSearch.toLowerCase().trim();
    const filtered = ledgerEntries.filter((e) => {
      if (ledgerOriginFilter === "avulso" && e.is_contract) return false;
      if (ledgerOriginFilter === "contract" && !e.is_contract) return false;
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

  const handleExportLedgerCSV = () => {
    if (processedLedger.length === 0) {
      return toast({ title: "Sem lançamentos para exportar." });
    }
    let csv =
      "Data do Agendamento / Baixa;Data da Sessao / Competencia;Codigo Transacao;Clinica;Sala;Profissional;Especialidade;Natureza;Modalidade;Horas;Entrada Bruta GMV (R$);Repasse Clinica/CoHost (R$);Taxa Fusion (%);Credito Liquido Fusion (R$);Saldo Acumulado Fusion (R$)\n";

    [...processedLedger].reverse().forEach((row) => {
      const createdDt = format(
        parseISO(row.transaction_date),
        "dd/MM/yyyy HH:mm",
      );
      const sessionDt = row.is_contract
        ? `Baixa Integral (${format(parseISO(row.start_time), "dd/MM/yyyy")})`
        : `${format(parseISO(row.start_time), "dd/MM/yyyy HH:mm")}-${format(parseISO(row.end_time), "HH:mm")}`;
      const nat = row.is_contract ? "CONTRATO FIXO (BAIXA)" : "HORA AVULSA";
      const hostTotal = row.host_payout_brl + row.cohost_payout_brl;

      csv += `${createdDt};${sessionDt};#${row.booking_id.slice(0, 8)};"${row.clinic_name}";"${row.room_name}";"${row.specialist_name}";"${row.specialty}";${nat};"${row.modality_label}";${row.duration_hours};${row.gross_brl.toFixed(2).replace(".", ",")};-${hostTotal.toFixed(2).replace(".", ",")};${row.fusion_fee_pct}%;${row.fusion_fee_brl.toFixed(2).replace(".", ",")};${row.running_fusion_balance.toFixed(2).replace(".", ",")}\n`;
    });

    const blob = new Blob(["\uFEFF" + csv], {
      type: "text/csv;charset=utf-8;",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute(
      "download",
      `Extrato_Contabil_Fusion_${format(new Date(), "yyyy-MM-dd")}.csv`,
    );
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const totalBookingsCount = avulsoBookingsCount + contractBookingsCount;
  const totalHoursOccupied = avulsoHoursCount + contractHoursCount;
  const avgTicketPerBooking =
    totalBookingsCount > 0 ? gmv / totalBookingsCount : 0;
  const revPerOccupiedHour =
    totalHoursOccupied > 0 ? gmv / totalHoursOccupied : 0;
  const retentionRatePct =
    activeDoctors > 0
      ? Math.round((recurringDoctorsCount / activeDoctors) * 100)
      : 0;
  const avulsoSharePct = gmv > 0 ? Math.round((avulsoGmv / gmv) * 100) : 0;
  const contractSharePct = gmv > 0 ? Math.round((contractGmv / gmv) * 100) : 0;

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
      {/* HEADER BI EXECUTIVO + FILTROS DE DATA + BOTÃO DO EXTRATO BANCÁRIO */}
      {/* ==================================================================== */}
      <div className="flex flex-col xl:flex-row xl:items-end justify-between gap-4 pb-6 mb-6 border-b border-slate-200 print:mb-4">
        <div>
          <div className="flex items-center gap-2">
            <Badge className="bg-orange-100 text-[#BF4B24] border-0 font-black text-[10px] uppercase tracking-wider px-2.5 py-0.5">
              Business Intelligence & Yield
            </Badge>
            {isRefreshing && (
              <span className="inline-flex items-center gap-1 text-xs font-bold text-[#BF4B24]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                Atualizando...
              </span>
            )}
          </div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2.5 mt-1.5">
            <Crown className="w-7 h-7 text-amber-500" />
            Centro de Comando Fusion
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-0.5">
            Análise executiva de faturamento (Avulso vs. Contratos na Baixa),
            auditoria de extrato e inteligência de estoque de horas das salas.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 print:hidden">
          <div className="flex items-center bg-white border border-slate-200 p-1 rounded-xl shadow-2xs">
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
                className={`px-3.5 py-2 rounded-lg text-xs font-bold whitespace-nowrap transition-all ${
                  timeFilter === filter.id
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900 hover:bg-slate-50"
                }`}
              >
                {filter.label}
              </button>
            ))}
          </div>

          {timeFilter === "custom" && (
            <div className="flex items-center bg-white border-2 border-[#BF4B24]/30 rounded-xl px-3 py-1.5 shadow-2xs">
              <CalendarIcon className="w-4 h-4 text-[#BF4B24] mr-2 shrink-0" />
              <input
                type="date"
                value={customStartDate}
                onChange={(e) => setCustomStartDate(e.target.value)}
                className="bg-transparent border-0 text-xs font-black text-slate-800 outline-none w-28 tabular-nums"
              />
              <span className="text-slate-400 font-bold px-1.5 text-xs">
                até
              </span>
              <input
                type="date"
                value={customEndDate}
                onChange={(e) => setCustomEndDate(e.target.value)}
                className="bg-transparent border-0 text-xs font-black text-slate-800 outline-none w-28 tabular-nums"
              />
            </div>
          )}

          <Button
            type="button"
            onClick={() => handleOpenBankStatement("all")}
            className="h-10 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black text-xs px-4 shadow-sm"
          >
            <FileText className="w-4 h-4 mr-2" />
            Abrir Extrato Bancário ({ledgerEntries.length})
          </Button>

          <Button
            type="button"
            onClick={() => window.print()}
            variant="outline"
            className="hidden md:flex h-10 rounded-xl border-slate-200 bg-white font-bold text-xs text-slate-700 hover:bg-slate-50"
          >
            <Download className="w-4 h-4 mr-1.5" /> PDF
          </Button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 1: 4 KPIS EXECUTIVOS (CLICÁVEIS PARA ABRIR EXTRATO NO CENTRO) */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6 print:grid-cols-4">
        {/* KPI 1: GMV Total */}
        <div
          onClick={() => handleOpenBankStatement("all")}
          className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs hover:border-[#BF4B24] transition-all cursor-pointer group"
        >
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-orange-50 flex items-center justify-center text-[#BF4B24]">
              <Activity className="w-5 h-5" />
            </div>
            <Badge className="bg-slate-100 text-slate-700 group-hover:bg-[#BF4B24] group-hover:text-white transition-colors border-0 text-[10px] font-bold flex items-center gap-1">
              Abrir Extrato <ArrowUpRight className="w-3 h-3" />
            </Badge>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Volume Transacionado (GMV)
          </p>
          <h3 className="text-3xl font-black text-slate-900 tabular-nums">
            <span className="text-base text-slate-400 font-bold mr-1">R$</span>
            {formatBRL(gmv)}
          </h3>
          <p className="text-[11px] font-semibold text-slate-500 mt-2 tabular-nums">
            {totalBookingsCount} lançamentos • Ticket médio: R${" "}
            {formatBRL(avgTicketPerBooking)}
          </p>
        </div>

        {/* KPI 2: Receita Líquida Fusion */}
        <div
          onClick={() => handleOpenBankStatement("all")}
          className="bg-gradient-to-br from-slate-900 via-slate-900 to-slate-800 p-6 rounded-2xl shadow-lg relative overflow-hidden cursor-pointer group"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#BF4B24]/25 rounded-full blur-2xl -mr-8 -mt-8 transition-transform group-hover:scale-150" />
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#BF4B24]/20 flex items-center justify-center text-[#BF4B24]">
                <Wallet className="w-5 h-5" />
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] font-bold">
                Margem: {gmv > 0 ? ((takeRate / gmv) * 100).toFixed(1) : "0.0"}%
              </Badge>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
              Receita Líquida Fusion (Take Rate)
            </p>
            <h3 className="text-3xl font-black text-white tabular-nums">
              <span className="text-base text-emerald-400 font-bold mr-1">
                R$
              </span>
              {formatBRL(takeRate)}
            </h3>
            <p className="text-[11px] font-semibold text-slate-400 mt-2 tabular-nums">
              Repasse Clínicas:{" "}
              <span className="text-slate-200">
                R$ {formatBRL(hostPayoutTotal)}
              </span>
            </p>
          </div>
        </div>

        {/* KPI 3: Profissionais & Recorrência */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-[#FAF7F5] border border-orange-200/60 flex items-center justify-center text-[#BF4B24]">
              <Stethoscope className="w-5 h-5" />
            </div>
            <Badge className="bg-orange-50 text-[#BF4B24] border-0 text-[10px] font-bold">
              Recorrência: {retentionRatePct}%
            </Badge>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Profissionais Ativos no Período
          </p>
          <h3 className="text-3xl font-black text-slate-900 tabular-nums">
            {activeDoctors}{" "}
            <span className="text-sm text-slate-400 font-medium">
              especialistas
            </span>
          </h3>
          <p className="text-[11px] font-semibold text-slate-500 mt-2">
            {recurringDoctorsCount} profissionais alugaram 2x ou mais
          </p>
        </div>

        {/* KPI 4: Ocupação Real do Estoque de Horas */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-xs">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Building2 className="w-5 h-5" />
            </div>
            <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-bold">
              Ocupação: {avgOccupancyRate}%
            </Badge>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Salas Ativas & RevPAH
          </p>
          <h3 className="text-3xl font-black text-slate-900 tabular-nums">
            {activeRooms}{" "}
            <span className="text-sm text-slate-400 font-medium">espaços</span>
          </h3>
          <p className="text-[11px] font-semibold text-slate-500 mt-2 tabular-nums">
            Ticket/Hora: R$ {formatBRL(revPerOccupiedHour)} (
            {totalHoursOccupied}h utilizadas)
          </p>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 2: SEPARAÇÃO VISUAL (HORAS AVULSAS VS. CONTRATOS FIXOS) */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6 print:grid-cols-2">
        {/* Card 1: Horas Avulsas */}
        <div
          onClick={() => handleOpenBankStatement("avulso")}
          className="bg-white rounded-2xl border-2 border-orange-200/80 hover:border-[#BF4B24] shadow-xs p-6 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-orange-50 text-[#BF4B24] flex items-center justify-center">
                <Clock className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  1. Operação Horas Avulsas & Pacotes
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  Locações por hora no marketplace (Take Rate Fixo de 20%)
                </p>
              </div>
            </div>
            <Badge className="bg-orange-100 text-[#BF4B24] border-0 font-black text-xs">
              {avulsoSharePct}% do GMV
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 tabular-nums">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase">
                GMV Horas Avulsas
              </p>
              <p className="text-xl font-black text-slate-900 mt-1">
                R$ {formatBRL(avulsoGmv)}
              </p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">
                {avulsoBookingsCount} reservas ({avulsoHoursCount}h)
              </p>
            </div>

            <div className="p-4 rounded-xl bg-orange-50/70 border border-orange-200/70">
              <p className="text-[10px] font-black text-[#BF4B24] uppercase">
                Receita Fusion (20%)
              </p>
              <p className="text-xl font-black text-[#BF4B24] mt-1">
                R$ {formatBRL(avulsoTakeRate)}
              </p>
              <p className="text-[11px] font-bold text-orange-800/70 mt-1">
                Lucro líquido avulso
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-700 uppercase">
                Repasse Clínicas (80%)
              </p>
              <p className="text-xl font-black text-emerald-700 mt-1">
                R$ {formatBRL(Math.max(0, avulsoGmv - avulsoTakeRate))}
              </p>
              <p className="text-[11px] font-bold text-emerald-700/70 mt-1">
                Líquido Anfitriões
              </p>
            </div>
          </div>
        </div>

        {/* Card 2: Contratos Fixos */}
        <div
          onClick={() => handleOpenBankStatement("contract")}
          className="bg-white rounded-2xl border-2 border-purple-200/80 hover:border-purple-600 shadow-xs p-6 cursor-pointer transition-all group"
        >
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-50 text-purple-700 flex items-center justify-center">
                <FileText className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-black text-slate-900 uppercase tracking-tight">
                  2. Operação de Contratos & Turnos Fixos
                </h2>
                <p className="text-xs font-medium text-slate-500">
                  Valor cheio contabilizado no dia da baixa (
                  {activeContractsCount} contrato(s) ativo(s))
                </p>
              </div>
            </div>
            <Badge className="bg-purple-100 text-purple-800 border-0 font-black text-xs">
              {contractSharePct}% do GMV
            </Badge>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1 tabular-nums">
            <div className="p-4 rounded-xl bg-slate-50 border border-slate-100">
              <p className="text-[10px] font-black text-slate-400 uppercase">
                GMV de Contratos (Baixa)
              </p>
              <p className="text-xl font-black text-slate-900 mt-1">
                R$ {formatBRL(contractGmv)}
              </p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">
                {contractBookingsCount} baixa(s) ({contractHoursCount}h usadas)
              </p>
            </div>

            <div className="p-4 rounded-xl bg-purple-50/70 border border-purple-200/70">
              <p className="text-[10px] font-black text-purple-800 uppercase">
                Receita Fusion Contratos
              </p>
              <p className="text-xl font-black text-purple-800 mt-1">
                R$ {formatBRL(contractTakeRate)}
              </p>
              <p className="text-[11px] font-bold text-purple-700/80 mt-1">
                Taxa média:{" "}
                {contractGmv > 0
                  ? ((contractTakeRate / contractGmv) * 100).toFixed(1)
                  : "0.0"}
                %
              </p>
            </div>

            <div className="p-4 rounded-xl bg-emerald-50/60 border border-emerald-100">
              <p className="text-[10px] font-black text-emerald-700 uppercase">
                Repasse Clínicas Contratos
              </p>
              <p className="text-xl font-black text-emerald-700 mt-1">
                R$ {formatBRL(Math.max(0, contractGmv - contractTakeRate))}
              </p>
              <p className="text-[11px] font-bold text-emerald-700/70 mt-1">
                Receita recorrente clínica
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 3: GRÁFICO DE EVOLUÇÃO (AVULSO + CONTRATOS + TOTAL) & MIX */}
      {/* ==================================================================== */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-6 print:grid-cols-3">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-xs p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Evolução do Faturamento (Avulso + Contratos + Total)
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Horas Avulsas diárias + Valor Total do Contrato lançado no dia
                exato da baixa.
              </p>
            </div>

            <div className="flex items-center bg-slate-100 p-1 rounded-xl self-start sm:self-auto">
              {[
                { id: "both", label: "Total + Divisão" },
                { id: "avulso", label: "Só Avulso" },
                { id: "contract", label: "Só Contratos" },
              ].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setChartView(tab.id as any)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
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

          <div className="flex flex-wrap items-center gap-5 mb-4 text-xs font-bold text-slate-600">
            {(chartView === "both" || chartView === "avulso") && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#BF4B24]" />
                <span>Horas Avulsas</span>
              </div>
            )}
            {(chartView === "both" || chartView === "contract") && (
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-[#7C3AED]" />
                <span>Contratos Fixos (Dia da Baixa)</span>
              </div>
            )}
            {chartView === "both" && (
              <div className="flex items-center gap-1.5">
                <span className="w-4 h-0.5 bg-slate-900" />
                <span className="text-slate-900">Linha GMV Total</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="w-4 h-0.5 bg-emerald-500" />
              <span className="text-emerald-700">Receita Fusion</span>
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
                  tick={{ fontSize: 11, fill: "#64748B", fontWeight: 700 }}
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
                        <div className="font-black text-slate-200 border-b border-slate-800 pb-1.5 flex justify-between">
                          <span>Data: {label}</span>
                          <span className="text-amber-400">
                            Total: R$ {formatBRL(row.totalGmv)}
                          </span>
                        </div>
                        <div className="space-y-1">
                          <div className="flex justify-between text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-xs bg-[#BF4B24]" />
                              Horas Avulsas:
                            </span>
                            <span className="font-bold text-white">
                              R$ {formatBRL(row.avulsoGmv)}
                            </span>
                          </div>
                          <div className="flex justify-between text-slate-300">
                            <span className="flex items-center gap-1.5">
                              <span className="w-2.5 h-2.5 rounded-xs bg-[#7C3AED]" />
                              Contratos Fixos (Baixa):
                            </span>
                            <span className="font-bold text-white">
                              R$ {formatBRL(row.contractGmv)}
                            </span>
                          </div>
                        </div>
                        <div className="pt-1.5 border-t border-slate-800 flex justify-between text-emerald-400 font-black">
                          <span>Receita Líquida Fusion:</span>
                          <span>+ R$ {formatBRL(row.platformFee)}</span>
                        </div>
                      </div>
                    );
                  }}
                />
                {(chartView === "both" || chartView === "avulso") && (
                  <Bar
                    dataKey="avulsoGmv"
                    stackId="a"
                    fill="#BF4B24"
                    radius={
                      chartView === "avulso" ? [6, 6, 0, 0] : [0, 0, 0, 0]
                    }
                    maxBarSize={38}
                  />
                )}
                {(chartView === "both" || chartView === "contract") && (
                  <Bar
                    dataKey="contractGmv"
                    stackId="a"
                    fill="#7C3AED"
                    radius={[6, 6, 0, 0]}
                    maxBarSize={38}
                  />
                )}
                {chartView === "both" && (
                  <Line
                    type="monotone"
                    dataKey="totalGmv"
                    stroke="#0F172A"
                    strokeWidth={2.5}
                    dot={{ r: 3, fill: "#0F172A" }}
                  />
                )}
                <Line
                  type="monotone"
                  dataKey="platformFee"
                  stroke="#10B981"
                  strokeWidth={2.5}
                  dot={false}
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Demanda & Faturamento por Especialidade */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 flex flex-col">
          <div className="mb-2">
            <h2 className="text-lg font-black text-slate-900">
              Demanda por Especialidade
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Participação de mercado e volume gerado no período
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
              <p className="text-slate-400 text-sm font-bold">
                Sem dados no período
              </p>
            )}
          </div>

          <div className="space-y-2 mt-3 max-h-[125px] overflow-y-auto pr-1">
            {specialtyData.map((spec) => (
              <div
                key={spec.name}
                className="flex items-center justify-between text-xs font-bold text-slate-700 tabular-nums"
              >
                <div className="flex items-center gap-2 truncate">
                  <span
                    className="w-2.5 h-2.5 rounded-full shrink-0"
                    style={{ backgroundColor: spec.color }}
                  />
                  <span className="truncate">{spec.name}</span>
                </div>
                <span className="text-slate-900 font-black">
                  R$ {formatBRL(spec.revenue)} ({spec.value}%)
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* LINHA 4: ESTOQUE DE HORAS & POTENCIAL POR SALA (PALETA LEVE FUSION) */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs mb-8 overflow-hidden print:break-inside-avoid">
        <div className="p-6 border-b border-orange-200/60 bg-[#FAF7F5] flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2">
              <Badge className="bg-[#BF4B24]/10 text-[#BF4B24] border border-[#BF4B24]/20 text-[10px] font-black uppercase">
                Yield Management & Capacidade Instalada
              </Badge>
            </div>
            <h2 className="text-xl font-black text-slate-900 flex items-center gap-2 mt-1.5">
              <Gauge className="w-6 h-6 text-[#BF4B24]" />
              Análise de Estoque de Horas & Potencial Financeiro por Sala
            </h2>
            <p className="text-xs text-slate-600 font-medium mt-0.5">
              Compare a capacidade total de horas disponíveis de cada sala com
              as horas efetivamente alugadas, o potencial máximo de faturamento
              e o estoque livre para os próximos dias.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 self-start lg:self-auto">
            <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
              <button
                type="button"
                onClick={() => setInventoryMode("past")}
                className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  inventoryMode === "past"
                    ? "bg-[#BF4B24] text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Desempenho no Período
              </button>
              <button
                type="button"
                onClick={() => setInventoryMode("future")}
                className={`px-3.5 py-2 rounded-lg text-xs font-black transition-all flex items-center gap-1.5 ${
                  inventoryMode === "future"
                    ? "bg-slate-900 text-white shadow-xs"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <CalendarRange className="w-3.5 h-3.5" />
                Estoque Futuro ({futureHorizonDays} Dias)
              </button>
            </div>

            {inventoryMode === "future" && (
              <div className="flex bg-white p-1 rounded-xl border border-slate-200 shadow-2xs">
                {([15, 20, 30] as const).map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => setFutureHorizonDays(d)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-black transition-all ${
                      futureHorizonDays === d
                        ? "bg-[#BF4B24] text-white"
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

        {/* 4 Cartões de Resumo do Estoque */}
        {inventoryMode === "past" ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-slate-50/50 border-b border-slate-100 tabular-nums">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <p className="text-[10px] font-black text-slate-400 uppercase">
                Estoque Total no Período
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {capacityTotals.pastAvail}h{" "}
                <span className="text-xs font-bold text-slate-400">
                  disponíveis
                </span>
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Soma da capacidade das salas
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200">
              <p className="text-[10px] font-black text-emerald-700 uppercase">
                Horas Alugadas vs. Ociosas
              </p>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                {capacityTotals.pastBooked}h{" "}
                <span className="text-xs font-bold text-slate-400">
                  / {capacityTotals.pastFree}h livres
                </span>
              </p>
              <p className="text-[11px] font-bold text-emerald-700/80 mt-1">
                Taxa de aproveitamento:{" "}
                {capacityTotals.pastAvail > 0
                  ? Math.round(
                      (capacityTotals.pastBooked / capacityTotals.pastAvail) *
                        100,
                    )
                  : 0}
                %
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <p className="text-[10px] font-black text-slate-500 uppercase">
                Potencial Máximo (100% Ocupado)
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">
                R$ {formatBRL(capacityTotals.pastPotentialRev)}
              </p>
              <p className="text-[11px] font-bold text-slate-400 mt-1">
                Se 100% do estoque fosse vendido
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-orange-200">
              <p className="text-[10px] font-black text-[#BF4B24] uppercase">
                Faturado Real vs. Ocioso
              </p>
              <p className="text-2xl font-black text-[#BF4B24] mt-1">
                R$ {formatBRL(capacityTotals.pastActualRev)}
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Potencial ocioso: R${" "}
                {formatBRL(capacityTotals.pastUncapturedRev)}
              </p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 p-6 bg-[#FAF7F5]/60 border-b border-orange-100 tabular-nums">
            <div className="bg-white p-4 rounded-xl border border-slate-200">
              <p className="text-[10px] font-black text-slate-500 uppercase">
                Capacidade Próximos {futureHorizonDays} Dias
              </p>
              <p className="text-2xl font-black text-slate-900 mt-1">
                {capacityTotals.futureAvail}h{" "}
                <span className="text-xs font-bold text-slate-400">totais</span>
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Estoque instalado nas salas ativas
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-orange-200">
              <p className="text-[10px] font-black text-[#BF4B24] uppercase">
                Horas Já Reservadas / Contratadas
              </p>
              <p className="text-2xl font-black text-[#BF4B24] mt-1">
                {capacityTotals.futureBooked}h{" "}
                <span className="text-xs font-bold text-orange-700">
                  (R$ {formatBRL(capacityTotals.futureLockedRev)})
                </span>
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Receita futura avulsa já garantida
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-emerald-200">
              <p className="text-[10px] font-black text-emerald-700 uppercase">
                Estoque Livre p/ Venda ({futureHorizonDays}d)
              </p>
              <p className="text-2xl font-black text-emerald-700 mt-1">
                {capacityTotals.futureFree}h{" "}
                <span className="text-xs font-bold text-emerald-600">
                  disponíveis
                </span>
              </p>
              <p className="text-[11px] font-bold text-emerald-700/80 mt-1">
                Prontas para locação imediata
              </p>
            </div>

            <div className="bg-white p-4 rounded-xl border border-amber-200">
              <p className="text-[10px] font-black text-amber-800 uppercase">
                Potencial Financeiro em Aberto
              </p>
              <p className="text-2xl font-black text-amber-700 mt-1">
                R$ {formatBRL(capacityTotals.futureOpenRev)}
              </p>
              <p className="text-[11px] font-bold text-slate-500 mt-1">
                Potencial Total: R${" "}
                {formatBRL(capacityTotals.futurePotentialRev)}
              </p>
            </div>
          </div>
        )}

        {/* Tabela Detalhada de Estoque de Horas e Potencial por Sala */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-200">
              {inventoryMode === "past" ? (
                <tr>
                  <th className="px-6 py-4">Espaço / Sala</th>
                  <th className="px-6 py-4 text-center">Tarifa Base</th>
                  <th className="px-6 py-4 text-center">Estoque Disponível</th>
                  <th className="px-6 py-4 text-center">
                    Horas Alugadas (Avulso / Contrato)
                  </th>
                  <th className="px-6 py-4 text-center">Horas Ociosas</th>
                  <th className="px-6 py-4 text-center">Taxa de Uso</th>
                  <th className="px-6 py-4 text-right text-slate-700">
                    Potencial Máximo (100%)
                  </th>
                  <th className="px-6 py-4 text-right text-emerald-700">
                    Faturamento Realizado
                  </th>
                  <th className="px-6 py-4 text-right text-[#BF4B24]">
                    Gap Ocioso (Não Capturado)
                  </th>
                </tr>
              ) : (
                <tr>
                  <th className="px-6 py-4">Espaço / Sala</th>
                  <th className="px-6 py-4 text-center">Tarifa Base</th>
                  <th className="px-6 py-4 text-center">
                    Capacidade ({futureHorizonDays}d)
                  </th>
                  <th className="px-6 py-4 text-center">
                    Já Ocupadas (Avulso / Contrato)
                  </th>
                  <th className="px-6 py-4 text-center text-emerald-700">
                    Estoque Livre p/ Venda
                  </th>
                  <th className="px-6 py-4 text-center">Ocupação Futura</th>
                  <th className="px-6 py-4 text-right text-[#BF4B24]">
                    Receita Já Garantida
                  </th>
                  <th className="px-6 py-4 text-right text-amber-700">
                    Potencial em Aberto (Estoque Livre)
                  </th>
                  <th className="px-6 py-4 text-right text-slate-800">
                    Teto Potencial ({futureHorizonDays}d)
                  </th>
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
                    className="hover:bg-orange-50/20 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <p className="font-black text-slate-900">
                        {rm.room_name}
                      </p>
                      <p className="text-[11px] font-bold text-slate-400">
                        {rm.host_name} • {formatTierLabel(rm.tier)}
                      </p>
                    </td>

                    <td className="px-6 py-4 text-center font-bold text-slate-600">
                      R$ {formatBRL(rm.hourly_rate)}/h
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className="px-2.5 py-1 rounded-lg bg-slate-100 text-slate-800 font-black">
                        {avail}h
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <span className="font-black text-slate-900">
                        {booked}h
                      </span>
                      <span className="block text-[10px] font-bold text-slate-400">
                        {avulsoH}h avulso • {contractH}h contrato
                      </span>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <Badge
                        className={
                          isPast
                            ? "bg-slate-100 text-slate-700 border-0 font-black"
                            : "bg-emerald-100 text-emerald-800 border-0 font-black"
                        }
                      >
                        {free}h livres
                      </Badge>
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="flex flex-col items-center gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-black text-slate-800 w-9 text-right">
                            {occPct}%
                          </span>
                          <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#BF4B24]"
                              style={{ width: `${occPct}%` }}
                            />
                          </div>
                        </div>
                      </div>
                    </td>

                    {isPast ? (
                      <>
                        <td className="px-6 py-4 text-right font-bold text-slate-800 bg-slate-50/60">
                          R$ {formatBRL(rm.past_potential_revenue)}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-emerald-700 bg-emerald-50/30">
                          R$ {formatBRL(rm.past_actual_revenue)}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-[#BF4B24] bg-orange-50/20">
                          R$ {formatBRL(rm.past_uncaptured_revenue)}
                        </td>
                      </>
                    ) : (
                      <>
                        <td className="px-6 py-4 text-right font-black text-[#BF4B24] bg-orange-50/20">
                          R$ {formatBRL(rm.future_locked_revenue)}
                        </td>
                        <td className="px-6 py-4 text-right font-black text-amber-700 bg-amber-50/30">
                          + R$ {formatBRL(rm.future_open_opportunity_revenue)}
                        </td>
                        <td className="px-6 py-4 text-right font-bold text-slate-900 bg-slate-50/60">
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
      {/* LINHA 5: MAPA DE CALOR GLOBAL (ZONAS QUENTES E FRIAS) */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-6 mb-8 overflow-hidden print:break-inside-avoid">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Flame className="w-5 h-5 text-[#BF4B24]" /> Zonas Quentes e Frias
              por Turno
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-0.5">
              Concentração de ocupação somando horas avulsas e contratos fixos.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className="bg-slate-50 text-slate-600 border-slate-200 font-bold"
            >
              <Snowflake className="w-3 h-3 mr-1" /> Baixa Demanda
            </Badge>
            <Badge
              variant="outline"
              className="bg-orange-50 text-[#BF4B24] border-orange-200 font-bold"
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
                  className="col-span-1 text-center text-[10px] font-bold text-slate-500 uppercase"
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
                  <div className="col-span-1 text-sm font-black text-slate-700 text-right pr-4">
                    {row.day}
                  </div>
                  {row.shifts.map((intensity: number, idx: number) => (
                    <div
                      key={idx}
                      className={`col-span-1 h-11 rounded-xl border flex items-center justify-center text-xs tabular-nums transition-all hover:scale-[1.02] ${getHeatmapColor(intensity)}`}
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
      {/* LINHA 6: RANKING TOP 10 SALAS (ABERTURA HORAS AVULSAS VS CONTRATOS) */}
      {/* ==================================================================== */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden print:break-inside-avoid">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Top 10 Salas (Performance Financeira: Avulso vs. Contratos)
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Abertura contábil de cada espaço mostrando o que veio de horas
              avulsas, baixas de contratos fixos e margem retida pela Fusion.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Posição / Sala</th>
                <th className="px-6 py-4">Anfitrião & Co-Anfitrião</th>
                <th className="px-6 py-4 text-center">Ocupação</th>
                <th className="px-6 py-4 text-right text-[#BF4B24]">
                  GMV Horas Avulsas
                </th>
                <th className="px-6 py-4 text-right text-purple-700">
                  GMV Contratos (Baixa)
                </th>
                <th className="px-6 py-4 text-right">Volume Total (R$)</th>
                <th className="px-6 py-4 text-right">Receita Fusion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topRooms.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
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
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${
                            index === 0
                              ? "bg-amber-100 text-amber-700"
                              : index === 1
                                ? "bg-slate-200 text-slate-700"
                                : index === 2
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {index + 1}
                        </div>
                        <div>
                          <div className="flex items-center gap-1.5">
                            <p className="font-black text-slate-900 truncate max-w-[180px]">
                              {room.name}
                            </p>
                            {room.hasContracts && (
                              <Badge className="bg-purple-100 text-purple-800 border-0 text-[9px] px-1.5 py-0 font-black">
                                CONTRATO
                              </Badge>
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                            {room.avulsoHours}h avulsas • {room.contractHours}h
                            contrato
                          </p>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-700 truncate max-w-[160px]">
                        {room.host}
                      </p>
                      {room.cohostName && (
                        <p className="text-[10px] font-bold text-purple-700 flex items-center gap-1 mt-0.5">
                          <Sparkles className="w-3 h-3" /> Co-Anfitrião:{" "}
                          {room.cohostName}
                        </p>
                      )}
                    </td>

                    <td className="px-6 py-4 text-center">
                      <div className="inline-flex items-center gap-2">
                        <span className="font-bold text-slate-700 w-9 text-right">
                          {room.occupancy}%
                        </span>
                        <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#BF4B24]"
                            style={{ width: `${room.occupancy}%` }}
                          />
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-4 text-right font-bold text-[#BF4B24] bg-orange-50/20">
                      R$ {formatBRL(room.avulsoRevenue)}
                    </td>

                    <td className="px-6 py-4 text-right font-bold text-purple-700 bg-purple-50/20">
                      R$ {formatBRL(room.contractRevenue)}
                    </td>

                    <td className="px-6 py-4 text-right font-black text-slate-900">
                      R$ {formatBRL(room.revenue)}
                    </td>

                    <td className="px-6 py-4 text-right font-black text-emerald-700 bg-emerald-50/30">
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
      {/* MODAL DE EXTRATO BANCÁRIO (ORDENADO PELA DATA DE AGENDAMENTO / BAIXA) */}
      {/* ==================================================================== */}
      <Dialog open={isLedgerOpen} onOpenChange={setIsLedgerOpen}>
        <DialogContent className="max-w-[95vw] sm:max-w-6xl h-[88vh] p-0 gap-0 overflow-hidden flex flex-col bg-white border-slate-200 shadow-2xl rounded-2xl">
          <DialogHeader className="px-6 py-4 bg-slate-950 text-white shrink-0">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pr-6">
              <div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-[#BF4B24] text-white border-0 text-[10px] font-black uppercase">
                    Extrato Bancário Fusion
                  </Badge>
                  <span className="text-xs text-slate-400 font-bold tabular-nums">
                    • {processedLedger.length} lançamento(s) no período
                  </span>
                </div>
                <DialogTitle className="text-lg font-black text-white mt-1">
                  Demonstrativo Contábil por Data de Agendamento / Baixa de
                  Contrato
                </DialogTitle>
                <DialogDescription className="text-xs text-slate-400">
                  Exibe as reservas avulsas pela data de pagamento e os
                  contratos pelo valor integral no dia exato da baixa.
                </DialogDescription>
              </div>

              <Button
                type="button"
                onClick={handleExportLedgerCSV}
                size="sm"
                className="bg-emerald-600 hover:bg-emerald-700 text-white font-black text-xs h-9 shrink-0"
              >
                <FileSpreadsheet className="w-4 h-4 mr-1.5" />
                Baixar Extrato (CSV)
              </Button>
            </div>
          </DialogHeader>

          {/* Resumo de Topo do Extrato */}
          <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200 bg-slate-50 shrink-0 tabular-nums">
            <div className="px-6 py-3">
              <p className="text-[10px] font-black uppercase text-slate-400">
                Entradas Brutas (GMV)
              </p>
              <p className="text-lg font-black text-slate-900 mt-0.5">
                R$ {formatBRL(ledgerTotals.gmv)}
              </p>
            </div>
            <div className="px-6 py-3">
              <p className="text-[10px] font-black uppercase text-slate-400">
                Repasse Clínicas / Co-Hosts
              </p>
              <p className="text-lg font-bold text-slate-700 mt-0.5">
                - R$ {formatBRL(ledgerTotals.hostPayout)}
              </p>
            </div>
            <div className="px-6 py-3">
              <p className="text-[10px] font-black uppercase text-slate-400">
                Volume de Horas Auditadas
              </p>
              <p className="text-lg font-black text-slate-900 mt-0.5">
                {ledgerTotals.hours}h utilizadas
              </p>
            </div>
            <div className="px-6 py-3 bg-emerald-50/70">
              <p className="text-[10px] font-black uppercase text-emerald-800">
                Saldo Líquido Fusion
              </p>
              <p className="text-lg font-black text-emerald-700 mt-0.5">
                + R$ {formatBRL(ledgerTotals.fusionNet)}
              </p>
            </div>
          </div>

          {/* Filtros Internos do Extrato */}
          <div className="px-6 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 bg-white shrink-0">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center bg-slate-100 p-1 rounded-xl">
                {[
                  { id: "all", label: "Todos" },
                  { id: "avulso", label: "Horas Avulsas (20%)" },
                  { id: "contract", label: "Contratos Fixos (Baixa)" },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setLedgerOriginFilter(tab.id as any)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                      ledgerOriginFilter === tab.id
                        ? "bg-slate-900 text-white"
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
                className="h-9 rounded-xl border border-slate-200 bg-white px-3 text-xs font-bold text-slate-700 outline-none"
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

          {/* Tabela Rolável do Extrato */}
          <div className="flex-1 overflow-y-auto">
            <table className="w-full text-left text-xs whitespace-nowrap tabular-nums">
              <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider sticky top-0 z-10 border-b border-slate-200">
                <tr>
                  <th className="px-6 py-3">
                    Data do Pagamento / Baixa • Uso da Sala
                  </th>
                  <th className="px-6 py-3">Cód.</th>
                  <th className="px-6 py-3">Histórico / Locatário</th>
                  <th className="px-6 py-3">Natureza</th>
                  <th className="px-6 py-3 text-right">Entrada Bruta (GMV)</th>
                  <th className="px-6 py-3 text-right">Repasse Clínica</th>
                  <th className="px-6 py-3 text-right">Crédito Fusion</th>
                  <th className="px-6 py-3 text-right bg-slate-100">
                    Saldo Acumulado Fusion
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedLedger.length === 0 ? (
                  <tr>
                    <td
                      colSpan={8}
                      className="px-6 py-16 text-center text-slate-400 font-bold"
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
                          <p className="font-black text-slate-900">
                            {item.is_contract
                              ? `Baixa em ${format(parseISO(item.transaction_date), "dd/MM/yyyy")}`
                              : format(
                                  parseISO(item.transaction_date),
                                  "dd/MM/yyyy 'às' HH:mm",
                                )}
                          </p>
                          <p className="text-[11px] text-emerald-700 font-bold">
                            {item.is_contract ? (
                              <>
                                Valor Integral do Contrato (
                                {item.duration_hours}h no período)
                              </>
                            ) : (
                              <>
                                Uso da sala:{" "}
                                {format(
                                  parseISO(item.start_time),
                                  "dd/MM/yyyy",
                                )}{" "}
                                ({format(parseISO(item.start_time), "HH:mm")}–
                                {format(parseISO(item.end_time), "HH:mm")})
                              </>
                            )}
                          </p>
                        </td>

                        <td className="px-6 py-3 font-mono text-[11px] text-slate-500">
                          #{item.booking_id.slice(0, 8)}
                        </td>

                        <td className="px-6 py-3">
                          <p className="font-bold text-slate-900">
                            {item.specialist_name}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {item.clinic_name} • {item.room_name}
                          </p>
                        </td>

                        <td className="px-6 py-3">
                          <Badge
                            className={
                              item.is_contract
                                ? "bg-purple-100 text-purple-800 border-0 text-[10px] font-bold"
                                : "bg-orange-50 text-[#BF4B24] border-0 text-[10px] font-bold"
                            }
                          >
                            {item.modality_label}
                          </Badge>
                        </td>

                        <td className="px-6 py-3 text-right font-bold text-slate-900">
                          R$ {formatBRL(item.gross_brl)}
                        </td>

                        <td className="px-6 py-3 text-right font-medium text-slate-500">
                          - R$ {formatBRL(hostTotal)}
                        </td>

                        <td className="px-6 py-3 text-right">
                          <span className="font-black text-emerald-700">
                            + R$ {formatBRL(item.fusion_fee_brl)}
                          </span>
                          <span className="block text-[10px] text-slate-400 font-bold">
                            Taxa: {item.fusion_fee_pct}%
                          </span>
                        </td>

                        <td className="px-6 py-3 text-right font-black text-slate-950 bg-slate-50">
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
