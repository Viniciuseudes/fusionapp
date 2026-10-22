// components/host/overview-tab.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Users,
  CalendarDays,
  Wallet,
  Activity,
  Map as MapIcon,
  Maximize,
  PlusCircle,
  ShieldAlert,
  MessageSquare,
  Star,
  Printer,
  Loader2,
  LogOut,
  FileText,
  Sparkles,
  CalendarClock,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  subDays,
  startOfDay,
  endOfDay,
  format,
  parseISO,
  getHours,
  getDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface HostOverviewProps {
  onNavigate: (view: string) => void;
}

const shiftLabels = ["08h-12h", "12h-15h", "15h-18h", "18h-22h"];
const COLORS = ["#BF4B24", "#8b5cf6", "#10b981", "#3b82f6", "#f59e0b"];

function normalizeTier(tier?: string | null): "start" | "vip" | "master" {
  const t = (tier || "start").toLowerCase().trim();
  if (t.includes("master")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
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

export function HostOverview({ onNavigate }: HostOverviewProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"hoje" | "7d" | "30d">("30d");

  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [roomPerformance, setRoomPerformance] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);

  const [totalRevenue, setTotalRevenue] = useState(0);
  const [netHostRevenue, setNetHostRevenue] = useState(0);
  const [contractRevenue, setContractRevenue] = useState(0);
  const [cohostSubleaseNet, setCohostSubleaseNet] = useState(0);
  const [isCohostUser, setIsCohostUser] = useState(false);
  const [totalBookings, setTotalBookings] = useState(0);
  const [globalRevPerSqM, setGlobalRevPerSqM] = useState(0);
  const [occupancyRate, setOccupancyRate] = useState(0);

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      sessionStorage.clear();
      window.location.replace("/login");
    } catch (error) {
      console.error("Erro ao sair:", error);
    }
  };

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const now = new Date();
        const todayStr = format(now, "yyyy-MM-dd");
        let startDate = startOfDay(subDays(now, 30));
        let endDate = endOfDay(now);

        if (timeFilter === "hoje") {
          startDate = startOfDay(now);
        } else if (timeFilter === "7d") {
          startDate = startOfDay(subDays(now, 7));
        }

        // 1. Busca salas onde o usuário é Anfitrião Dono (host_id)
        const { data: ownedRooms, error: roomsErr } = await supabase
          .from("rooms")
          .select(
            "id, name, host_id, address_details, tier, category_id, modalities",
          )
          .eq("host_id", user.id);

        if (roomsErr) throw roomsErr;

        // 2. Busca contratos ativos onde o usuário é Coanfitrião (specialist_id + allow_sublease)
        const { data: myCohostContracts } = await supabase
          .from("room_contracts")
          .select("*")
          .eq("specialist_id", user.id)
          .eq("status", "active")
          .eq("allow_sublease", true)
          .lte("start_date", todayStr)
          .gte("end_date", todayStr);

        const cohostRoomIds = Array.from(
          new Set(
            (myCohostContracts || [])
              .map((c: any) => c.room_id)
              .filter(Boolean),
          ),
        );

        setIsCohostUser(cohostRoomIds.length > 0);

        let subleasedRooms: any[] = [];
        if (cohostRoomIds.length > 0) {
          const { data: cRooms } = await supabase
            .from("rooms")
            .select(
              "id, name, host_id, address_details, tier, category_id, modalities",
            )
            .in("id", cohostRoomIds);
          subleasedRooms = cRooms || [];
        }

        const ownedIdsSet = new Set((ownedRooms || []).map((r: any) => r.id));
        const rooms = [
          ...(ownedRooms || []),
          ...subleasedRooms.filter((r: any) => !ownedIdsSet.has(r.id)),
        ];

        if (rooms.length === 0) {
          setLoading(false);
          return;
        }

        const roomIds = rooms.map((r) => r.id);
        const roomsMap = new Map<string, any>(rooms.map((r: any) => [r.id, r]));

        const [bookingsRes, contractsRes, packagesRes, categoriesRes] =
          await Promise.all([
            supabase
              .from("bookings")
              .select(
                "id, created_at, room_id, user_id, start_time, end_time, total_cost, upgrade_fee_amount, status, contract_id, booking_origin, agreed_value_brl",
              )
              .in("room_id", roomIds)
              .in("status", ["confirmed", "completed", "in_progress"])
              .gte("start_time", startDate.toISOString())
              .lte("start_time", endDate.toISOString()),
            supabase.from("room_contracts").select("*").in("room_id", roomIds),
            supabase.from("packages").select("id, tier, hours, price, active"),
            supabase
              .from("room_categories")
              .select("id, name, credit_cost_per_hour, upgrade_fee_per_hour"),
          ]);

        if (bookingsRes.error) throw bookingsRes.error;

        const bookings = bookingsRes.data || [];
        const contractsData = contractsRes.data || [];

        const userIds = [
          ...new Set(bookings.map((b: any) => b.user_id).filter(Boolean)),
        ];
        const bookingIds = bookings.map((b: any) => b.id).filter(Boolean);

        const [walletRes, subsRes, couponsRes] = await Promise.all([
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
          bookingIds.length > 0
            ? supabase
                .from("coupon_uses")
                .select("booking_id, discount_applied")
                .in("booking_id", bookingIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

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
        ): number | null => {
          const tierPackages = packageRateMap[tier];
          if (!tierPackages || tierPackages.size === 0) return null;

          if (targetHours && tierPackages.has(targetHours)) {
            return tierPackages.get(targetHours)!;
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
              return tierPackages.get(closestHours)!;
            }
          }

          if (tierPackages.has(1)) return tierPackages.get(1)!;
          const sortedHours = Array.from(tierPackages.keys()).sort(
            (a, b) => a - b,
          );
          return tierPackages.get(sortedHours[0])!;
        };

        // ====================================================================
        // RESOLUÇÃO FINANCEIRA SÊNIOR (ANFITRIÃO DONO vs COANFITRIÃO 80/20)
        // ====================================================================
        const resolveBookingFinancials = (
          b: any,
        ): {
          grossRevenue: number;
          userNetRevenue: number;
          cohostEarned: number;
          durationHours: number;
          isContract: boolean;
        } => {
          const room = roomsMap.get(b.room_id);
          const isRoomOwner = room?.host_id === user.id;
          const roomCohost = activeCohostByRoomId.get(b.room_id);
          const isUserCohostOfRoom = roomCohost?.specialist_id === user.id;
          const roomTier = normalizeTier(room?.tier);

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

          // 1. Reserva de Contrato Fixo: pertence ao Anfitrião Dono da Sala
          if (isContractBooking) {
            if (!isRoomOwner) {
              return {
                grossRevenue: 0,
                userNetRevenue: 0,
                cohostEarned: 0,
                durationHours: slotUnits,
                isContract: true,
              };
            }
            const val =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl)
                : Number(linkedContract?.session_value || 0);
            const feePct = Number(linkedContract?.platform_fee_pct ?? 15) / 100;
            const hostNet = Math.max(0, val * (1 - feePct));
            return {
              grossRevenue: val,
              userNetRevenue: hostNet,
              cohostEarned: 0,
              durationHours: slotUnits,
              isContract: true,
            };
          }

          // 2. Reserva Avulsa (Sublocação ou Direta):
          // Se a sala tem Coanfitrião ativo -> 80% Coanfitrião / 20% Fusion / 0% Anfitrião Dono
          // Se a sala NÃO tem Coanfitrião -> 80% Anfitrião Dono / 20% Fusion
          const computeAvulsoUserNet = (grossVal: number) => {
            if (roomCohost) {
              const cohostPct = Number(roomCohost.cohost_split_pct || 80) / 100;
              const cohostShare = Math.max(0, grossVal * cohostPct);
              return {
                userNet: isUserCohostOfRoom ? cohostShare : 0,
                cohostEarned: isUserCohostOfRoom ? cohostShare : 0,
                countedGross: isUserCohostOfRoom ? grossVal : 0,
              };
            }
            const ownerNet = Math.max(0, grossVal * 0.8);
            return {
              userNet: isRoomOwner ? ownerNet : 0,
              cohostEarned: 0,
              countedGross: isRoomOwner ? grossVal : 0,
            };
          };

          const rawTotalCost = Number(b.total_cost || 0);
          const upgradeFee = Number(b.upgrade_fee_amount || 0);
          const discount = couponDiscountMap.get(b.id) || 0;

          if (
            Number(b.agreed_value_brl) > 0 ||
            rawTotalCost >= slotUnits * 20
          ) {
            const baseVal =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl)
                : rawTotalCost;
            const grossVal = Math.max(0, baseVal + upgradeFee - discount);
            const splitRes = computeAvulsoUserNet(grossVal);
            return {
              grossRevenue: splitRes.countedGross,
              userNetRevenue: splitRes.userNet,
              cohostEarned: splitRes.cohostEarned,
              durationHours: slotUnits,
              isContract: false,
            };
          }

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

          let resolvedHourlyRate = getRateFromPackageTable(
            creditTierUsed,
            detectedPackageHours,
          );

          if (resolvedHourlyRate === null && creditTierUsed !== roomTier) {
            resolvedHourlyRate = getRateFromPackageTable(
              roomTier,
              detectedPackageHours,
            );
          }

          if (resolvedHourlyRate === null) {
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
          }

          const grossVal = Math.max(
            0,
            creditsForThisSlot * resolvedHourlyRate + upgradeFee - discount,
          );
          const splitRes = computeAvulsoUserNet(grossVal);

          return {
            grossRevenue: splitRes.countedGross,
            userNetRevenue: splitRes.userNet,
            cohostEarned: splitRes.cohostEarned,
            durationHours: slotUnits,
            isContract: false,
          };
        };

        let revTotal = 0;
        let netTotal = 0;
        let contractRevTotal = 0;
        let cohostNetTotal = 0;
        let bookTotal = bookings.length;
        let areaTotal = 0;
        let totalOccupiedHours = 0;

        const roomStats: any = {};
        rooms.forEach((r, idx) => {
          let addr: any = {};
          try {
            addr =
              typeof r.address_details === "string"
                ? JSON.parse(r.address_details)
                : r.address_details;
          } catch (e) {}

          const area = Number(addr?.size || 15);
          areaTotal += area;

          const roomContracts = activeContractsByRoom.get(r.id) || [];
          const hasExclusiveContract = roomContracts.some(
            (c: any) => c.contract_type === "monthly_exclusive",
          );
          const cohostObj = activeCohostByRoomId.get(r.id);

          roomStats[r.id] = {
            id: r.id,
            name: r.name,
            isOwnedByUser: r.host_id === user.id,
            areaSqM: area,
            revenue: 0,
            netRevenue: 0,
            bookings: 0,
            occupiedHours: 0,
            hasContracts: roomContracts.length > 0,
            hasExclusiveContract,
            cohostName: cohostObj?.specialist_name || null,
            color: COLORS[idx % COLORS.length],
          };
        });

        const dailyRev: any = {};
        const daysDiff =
          timeFilter === "hoje" ? 1 : timeFilter === "7d" ? 7 : 30;
        for (let i = daysDiff - 1; i >= 0; i--) {
          const d = subDays(now, i);
          const dateStr = format(d, "dd MMM", { locale: ptBR });
          dailyRev[dateStr] = {
            date: dateStr,
            revenue: 0,
            netRevenue: 0,
            bookings: 0,
          };
        }

        const heatMatrix = [
          { day: "Dom", shifts: [0, 0, 0, 0] },
          { day: "Seg", shifts: [0, 0, 0, 0] },
          { day: "Ter", shifts: [0, 0, 0, 0] },
          { day: "Qua", shifts: [0, 0, 0, 0] },
          { day: "Qui", shifts: [0, 0, 0, 0] },
          { day: "Sex", shifts: [0, 0, 0, 0] },
          { day: "Sáb", shifts: [0, 0, 0, 0] },
        ];

        bookings.forEach((b: any) => {
          const {
            grossRevenue,
            userNetRevenue,
            cohostEarned,
            durationHours,
            isContract,
          } = resolveBookingFinancials(b);

          revTotal += grossRevenue;
          netTotal += userNetRevenue;
          cohostNetTotal += cohostEarned;
          if (isContract) contractRevTotal += grossRevenue;
          totalOccupiedHours += durationHours;

          if (roomStats[b.room_id]) {
            roomStats[b.room_id].revenue += grossRevenue;
            roomStats[b.room_id].netRevenue += userNetRevenue;
            roomStats[b.room_id].bookings += 1;
            roomStats[b.room_id].occupiedHours += durationHours;
          }

          const startDt = parseISO(b.start_time);
          const endDt = b.end_time ? parseISO(b.end_time) : null;
          const dateStr = format(startDt, "dd MMM", { locale: ptBR });

          if (dailyRev[dateStr]) {
            dailyRev[dateStr].revenue += grossRevenue;
            dailyRev[dateStr].netRevenue += userNetRevenue;
            dailyRev[dateStr].bookings += 1;
          }

          const dayOfWeek = getDay(startDt);
          const startH = getHours(startDt);
          const endH =
            endDt && getHours(endDt) > startH ? getHours(endDt) : startH + 1;

          const shiftRanges = [
            { idx: 0, start: 8, end: 12 },
            { idx: 1, start: 12, end: 15 },
            { idx: 2, start: 15, end: 18 },
            { idx: 3, start: 18, end: 23 },
          ];

          shiftRanges.forEach((sr) => {
            if (startH < sr.end && endH > sr.start) {
              heatMatrix[dayOfWeek].shifts[sr.idx] += 1;
            }
          });
        });

        // Contabiliza para o Anfitrião Dono os contratos mensais com Coanfitrião ativo
        // (já que eles não geram bloqueios na tabela `bookings` para manter a vitrine aberta)
        contractsData.forEach((c: any) => {
          const rObj = roomsMap.get(c.room_id);
          const isOwner = rObj?.host_id === user.id;
          if (
            isOwner &&
            c.status === "active" &&
            c.contract_type === "monthly_exclusive" &&
            c.allow_sublease &&
            c.start_date <= todayStr &&
            c.end_date >= todayStr
          ) {
            const hasBookingsForContract = bookings.some(
              (b: any) => b.contract_id === c.id,
            );
            if (!hasBookingsForContract) {
              const factor =
                timeFilter === "hoje"
                  ? 1 / 30
                  : timeFilter === "7d"
                    ? 7 / 30
                    : 1;
              const cGross = Number(c.contract_value || 0) * factor;
              const feePct = Number(c.platform_fee_pct ?? 15) / 100;
              const cNet = Math.max(0, cGross * (1 - feePct));

              revTotal += cGross;
              netTotal += cNet;
              contractRevTotal += cGross;

              if (roomStats[c.room_id]) {
                roomStats[c.room_id].revenue += cGross;
                roomStats[c.room_id].netRevenue += cNet;
              }
            }
          }
        });

        setTotalRevenue(revTotal);
        setNetHostRevenue(netTotal);
        setContractRevenue(contractRevTotal);
        setCohostSubleaseNet(cohostNetTotal);
        setTotalBookings(bookTotal);
        setGlobalRevPerSqM(areaTotal > 0 ? revTotal / areaTotal : 0);

        const capacityPerRoomHours = Math.max(1, daysDiff * 8);
        const totalCapacityHours = Math.max(
          1,
          rooms.length * capacityPerRoomHours,
        );

        setOccupancyRate(
          totalOccupiedHours > 0
            ? Math.min(
                Math.round((totalOccupiedHours / totalCapacityHours) * 100),
                100,
              )
            : 0,
        );

        const perfArray = Object.values(roomStats).map((r: any) => {
          const rawOcc = Math.round(
            (r.occupiedHours / capacityPerRoomHours) * 100,
          );
          const finalOcc =
            r.hasExclusiveContract && r.isOwnedByUser
              ? Math.max(rawOcc, 85)
              : Math.min(rawOcc, 100);

          return {
            ...r,
            occupancy: Math.min(100, finalOcc),
          };
        });
        setRoomPerformance(perfArray.sort((a, b) => b.revenue - a.revenue));

        setRevenueData(Object.values(dailyRev));

        const orderedHeatmap = [
          heatMatrix[1],
          heatMatrix[2],
          heatMatrix[3],
          heatMatrix[4],
          heatMatrix[5],
          heatMatrix[6],
          heatMatrix[0],
        ];
        setHeatmapData(orderedHeatmap);
      } catch (err) {
        console.error("Erro ao montar o BI:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [supabase, timeFilter]);

  const getHeatmapColor = (intensity: number) => {
    if (intensity === 0) return "bg-slate-50 border-slate-100";
    if (intensity <= 2)
      return "bg-orange-100 border-orange-200 text-orange-800";
    if (intensity <= 5)
      return "bg-orange-300 border-orange-400 text-orange-900";
    if (intensity <= 10) return "bg-orange-500 border-orange-600 text-white";
    return "bg-[#9A3C1D] border-[#b03d12] text-white shadow-inner";
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-7xl mx-auto w-full pb-32 font-sans print:p-0 print:pb-0">
      {/* BANNER EXCLUSIVO PARA COANFITRIÃO */}
      {isCohostUser && (
        <div className="mb-6 bg-gradient-to-r from-purple-900 via-slate-900 to-slate-900 text-white p-5 rounded-2xl shadow-lg border border-purple-500/30 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 print:hidden">
          <div className="flex items-start gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-purple-500/20 border border-purple-400/30 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-purple-300" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-black text-white">
                  Modo Coanfitrião Ativo (Sublocação 80/20)
                </h2>
                <Badge className="bg-purple-500 text-white border-0 text-[10px] font-black">
                  80% Seu
                </Badge>
              </div>
              <p className="text-xs text-slate-300 font-medium mt-1">
                Libere os dias e horários que você não estiver utilizando a sala
                e receba <strong>80% do valor</strong> de todas as locações
                avulsas realizadas.
              </p>
            </div>
          </div>
          <Button
            onClick={() => onNavigate("availability")}
            className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl h-10 px-5 shrink-0 w-full sm:w-auto"
          >
            <CalendarClock className="w-4 h-4 mr-2" />
            Gerenciar Meus Horários
          </Button>
        </div>
      )}

      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 print:mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            Visão Geral de Desempenho
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Análise de rendimentos (Take Rate Avulso 20% + Contratos &
            Sublocações), ocupação e rentabilidade por m².
          </p>
        </div>

        <div className="print:hidden flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm overflow-x-auto scrollbar-hide shrink-0">
          {[
            { id: "hoje", label: "Hoje" },
            { id: "7d", label: "7 Dias" },
            { id: "30d", label: "30 Dias" },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setTimeFilter(filter.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                timeFilter === filter.id
                  ? "bg-slate-900 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:grid-cols-4">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl -mr-4 -mt-4 transition-transform group-hover:scale-150"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet className="w-5 h-5" />
              </div>
              {contractRevenue > 0 ? (
                <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px] font-bold">
                  Contratos: R${" "}
                  {contractRevenue.toLocaleString("pt-BR", {
                    maximumFractionDigits: 0,
                  })}
                </Badge>
              ) : cohostSubleaseNet > 0 ? (
                <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px] font-bold">
                  Sublocação (80%)
                </Badge>
              ) : null}
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
              Rendimento Bruto
            </p>
            <h3 className="text-3xl font-black text-slate-900">
              <span className="text-lg text-slate-400 font-bold mr-1">R$</span>
              {totalRevenue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
            <p className="text-xs font-bold text-emerald-600 mt-1">
              Seu Repasse Líquido: R${" "}
              {netHostRevenue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </p>
          </div>
        </div>

        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden group print:bg-white print:border print:border-slate-200 print:shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#BF4B24]/20 rounded-full blur-2xl -mr-8 -mt-8 transition-transform group-hover:scale-150 print:hidden"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#BF4B24]/20 flex items-center justify-center text-[#BF4B24]">
                <Maximize className="w-5 h-5" />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-500">
              Rentabilidade (R$/m²)
            </p>
            <h3 className="text-3xl font-black text-white print:text-slate-900">
              <span className="text-lg text-slate-400 font-bold mr-1">R$</span>
              {globalRevPerSqM.toLocaleString("pt-BR", {
                maximumFractionDigits: 0,
              })}
              <span className="text-base text-slate-400 font-medium ml-1">
                /m²
              </span>
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
            Agendamentos
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {totalBookings}
          </h3>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
            Taxa de Ocupação Real
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {occupancyRate}%
          </h3>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 print:grid-cols-3">
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Evolução de Receita
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Acompanhamento de rendimentos no período
              </p>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={revenueData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#BF4B24" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#BF4B24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }}
                  tickFormatter={(val) => `R$${val}`}
                />
                <Tooltip
                  formatter={(value: number) => [
                    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    "Receita Bruta",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#BF4B24"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="mb-6">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <MapIcon className="w-5 h-5 text-[#BF4B24]" /> Mapa de Ocupação
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Horários de maior fluxo.
            </p>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div className="grid grid-cols-5 gap-2 mb-2">
              <div className="col-span-1"></div>
              {shiftLabels.map((label) => (
                <div
                  key={label}
                  className="col-span-1 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight"
                >
                  {label.split("-")[0]}
                  <br />|<br />
                  {label.split("-")[1]}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {heatmapData.map((row) => (
                <div
                  key={row.day}
                  className="grid grid-cols-5 gap-2 items-center"
                >
                  <div className="col-span-1 text-xs font-bold text-slate-600 text-right pr-2">
                    {row.day}
                  </div>
                  {row.shifts.map((intensity: number, idx: number) => (
                    <div
                      key={idx}
                      className={`col-span-1 aspect-square rounded-md border flex items-center justify-center transition-all hover:scale-110 cursor-crosshair ${getHeatmapColor(intensity)}`}
                      title={`${row.day} - ${shiftLabels[idx]}: ${intensity} reservas`}
                    >
                      {intensity > 2 && (
                        <Users className="w-3 h-3 opacity-50" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-12">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Desempenho Imobiliário (R$/m²)
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Rentabilidade exata de cada espaço.
            </p>
          </div>
          <Button
            onClick={() => window.print()}
            variant="outline"
            className="font-bold text-slate-600 h-10 rounded-xl print:hidden flex items-center gap-2 hover:text-[#BF4B24] hover:bg-orange-50"
          >
            <Printer className="w-4 h-4" /> Exportar para PDF
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Espaço / Sala</th>
                <th className="px-6 py-4 text-center">Tamanho (m²)</th>
                <th className="px-6 py-4 text-center">Ocupação Est.</th>
                <th className="px-6 py-4 text-right">Rendimento Bruto</th>
                <th className="px-6 py-4 text-right">Seu Repasse Líquido</th>
                <th className="px-6 py-4 text-right bg-orange-50/50 text-[#BF4B24]">
                  Rendimento / m²
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roomPerformance.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-10 text-center text-slate-500 font-medium"
                  >
                    Nenhum dado encontrado para este período.
                  </td>
                </tr>
              ) : (
                roomPerformance.map((room) => {
                  const revPerSqM =
                    room.areaSqM > 0 ? room.revenue / room.areaSqM : 0;
                  return (
                    <tr
                      key={room.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full shrink-0"
                            style={{ backgroundColor: room.color }}
                          />
                          <div>
                            <div className="flex items-center gap-1.5">
                              <p className="font-black text-slate-900 truncate max-w-[200px]">
                                {room.name}
                              </p>
                              {room.hasContracts && (
                                <Badge className="bg-purple-100 text-purple-800 border-0 text-[9px] px-1.5 py-0 font-black">
                                  CONTRATO
                                </Badge>
                              )}
                            </div>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                              {room.occupiedHours}h ocupadas ({room.bookings}{" "}
                              reservas)
                            </p>
                            {room.cohostName && (
                              <p className="text-[10px] font-bold text-purple-700 flex items-center gap-1 mt-0.5">
                                <Sparkles className="w-3 h-3" /> Co-Anfitrião:{" "}
                                {room.cohostName} (Sublocação 80/20)
                              </p>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center font-bold text-slate-600">
                        {room.areaSqM} m²
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-bold text-slate-700 w-8 text-right">
                            {room.occupancy}%
                          </span>
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${room.occupancy}%`,
                                backgroundColor: room.color,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-slate-700">
                        R${" "}
                        {room.revenue.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-5 text-right font-black text-emerald-600">
                        R${" "}
                        {room.netRevenue.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-5 text-right font-black text-slate-900 bg-orange-50/20">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-[#BF4B24] font-bold">
                            R$
                          </span>
                          <span className="text-lg">
                            {revPerSqM.toLocaleString("pt-BR", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
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

      <div className="print:hidden">
        <h3 className="text-lg font-black text-slate-900 mb-4 mt-8">
          Ações Rápidas
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {!isCohostUser && (
            <Button
              onClick={() => onNavigate("create_space")}
              variant="outline"
              className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-[#BF4B24] hover:text-[#BF4B24] hover:bg-orange-50"
            >
              <PlusCircle className="w-8 h-8" />
              <span className="font-bold">Adicionar Sala</span>
            </Button>
          )}

          <Button
            onClick={() => onNavigate("contracts")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-purple-600 hover:text-purple-700 hover:bg-purple-50"
          >
            <FileText className="w-8 h-8" />
            <span className="font-bold">Contratos & Fixos</span>
          </Button>

          <Button
            onClick={() => onNavigate("availability")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-red-500 hover:text-red-500 hover:bg-red-50"
          >
            <ShieldAlert className="w-8 h-8" />
            <span className="font-bold">
              {isCohostUser ? "Horários de Sublocação" : "Bloquear Agenda"}
            </span>
          </Button>

          <Button
            onClick={() => onNavigate("messages")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50"
          >
            <MessageSquare className="w-8 h-8" />
            <span className="font-bold">Ver Mensagens</span>
          </Button>

          <Button
            onClick={() => onNavigate("reviews")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-amber-500 hover:text-amber-500 hover:bg-amber-50"
          >
            <Star className="w-8 h-8" />
            <span className="font-bold">Ver Avaliações</span>
          </Button>

          <button
            onClick={handleLogout}
            className="lg:hidden col-span-2 flex flex-col items-center justify-center p-6 bg-red-50/50 border border-red-100 rounded-2xl hover:bg-red-50 transition-colors text-red-600 gap-3 mt-2"
          >
            <LogOut className="w-6 h-6" />
            <span className="font-bold text-sm">Sair da Conta</span>
          </button>
        </div>
      </div>
    </div>
  );
}
