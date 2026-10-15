"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  TrendingUp,
  Users,
  Map as MapIcon,
  Wallet,
  ArrowUpRight,
  Activity,
  Download,
  Building2,
  Stethoscope,
  Crown,
  Flame,
  Snowflake,
  Search,
  Loader2,
  FileText,
  Sparkles,
} from "lucide-react";
import {
  AreaChart,
  Area,
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
import {
  subDays,
  startOfYear,
  parseISO,
  format,
  getDay,
  getHours,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const shiftLabels = [
  "Manhã (08-12)",
  "Tarde (12-16)",
  "Final Tarde (16-20)",
  "Noite (20-23)",
];
const PIE_COLORS = [
  "#BF4B24",
  "#8b5cf6",
  "#10b981",
  "#3b82f6",
  "#eab308",
  "#ec4899",
  "#64748b",
];

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

// Calcula a quantidade real de blocos/horas de UMA reserva individual (ex: 50min ou 60min = 1h)
function calculateSlotUnits(startIso: string, endIso: string): number {
  const diffMinutes =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
  if (diffMinutes <= 0) return 1;
  if (diffMinutes >= 45 && diffMinutes <= 65) return 1;
  return Math.max(1, Math.round(diffMinutes / 55));
}

export function AdminOverviewTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"7d" | "30d" | "ytd">("30d");

  // Estados dos Dados Reais
  const [gmv, setGmv] = useState(0);
  const [contractGmv, setContractGmv] = useState(0);
  const [takeRate, setTakeRate] = useState(0);
  const [activeDoctors, setActiveDoctors] = useState(0);
  const [activeRooms, setActiveRooms] = useState(0);
  const [activeContractsCount, setActiveContractsCount] = useState(0);
  const [avgOccupancyRate, setAvgOccupancyRate] = useState(0);

  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [specialtyData, setSpecialtyData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [topRooms, setTopRooms] = useState<any[]>([]);

  useEffect(() => {
    async function fetchRealBI() {
      setLoading(true);
      try {
        const now = new Date();
        let startDate = subDays(now, 30);
        let daysCount = 30;

        if (timeFilter === "7d") {
          startDate = subDays(now, 7);
          daysCount = 7;
        } else if (timeFilter === "ytd") {
          startDate = startOfYear(now);
          const diffMs = now.getTime() - startDate.getTime();
          daysCount = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }

        // 1. Busca Reservas, Salas, Pacotes, Categorias e Contratos em paralelo
        const [
          bookingsRes,
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
            .gte("start_time", startDate.toISOString())
            .in("status", ["confirmed", "completed", "pending_payment"]),
          supabase
            .from("rooms")
            .select(
              "id, name, host_id, is_active, tier, category_id, modalities, address_details",
            ),
          supabase.from("packages").select("id, tier, hours, price, active"),
          supabase
            .from("room_categories")
            .select("id, name, credit_cost_per_hour, upgrade_fee_per_hour"),
          supabase.from("room_contracts").select("*"),
        ]);

        if (bookingsRes.error) throw bookingsRes.error;
        if (roomsRes.error) throw roomsRes.error;

        const bookingsData = bookingsRes.data || [];
        const roomsData = roomsRes.data || [];
        const contractsData = contractsRes.data || [];

        const bookingIds = bookingsData.map((b: any) => b.id).filter(Boolean);
        const userIds = [
          ...new Set(bookingsData.map((b: any) => b.user_id).filter(Boolean)),
        ];
        const hostIds = [
          ...new Set(roomsData.map((r: any) => r.host_id).filter(Boolean)),
        ];
        const allProfileIds = [...new Set([...userIds, ...hostIds])];

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

        // ========================================================
        // PREPARAÇÃO DO MOTOR DE PRECIFICAÇÃO (PACKAGES + CONTRATOS)
        // ========================================================
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
        contractsData.forEach((c: any) => {
          if (c.status === "active") {
            const list = activeContractsByRoom.get(c.room_id) || [];
            list.push(c);
            activeContractsByRoom.set(c.room_id, list);
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

        const resolveBookingFinancials = (
          b: any,
        ): {
          revenue: number;
          fee: number;
          durationHours: number;
          isContract: boolean;
        } => {
          const room = roomsMap.get(b.room_id);
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

          // 1. Se for reserva de CONTRATO: aplica a porcentagem configurada no contrato
          if (isContractBooking) {
            const val =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl)
                : Number(linkedContract?.session_value || 0);
            const feePct = Number(linkedContract?.platform_fee_pct ?? 15) / 100;
            return {
              revenue: val,
              fee: val * feePct,
              durationHours: slotUnits,
              isContract: true,
            };
          }

          const rawTotalCost = Number(b.total_cost || 0);
          const upgradeFee = Number(b.upgrade_fee_amount || 0);
          const discount = couponDiscountMap.get(b.id) || 0;

          // 2. Reserva Avulsa Direta (em R$): Take Rate da Fusion = 20% (0.2)
          if (
            Number(b.agreed_value_brl) > 0 ||
            rawTotalCost >= slotUnits * 20
          ) {
            const baseVal =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl)
                : rawTotalCost;
            const rev = Math.max(0, baseVal + upgradeFee - discount);
            return {
              revenue: rev,
              fee: rev * 0.2, // <-- 20% TAKE RATE AVULSO
              durationHours: slotUnits,
              isContract: false,
            };
          }

          // 3. Reserva Avulsa via Créditos / Pacotes: Take Rate da Fusion = 20% (0.2)
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

          const rev = Math.max(
            0,
            creditsForThisSlot * resolvedHourlyRate + upgradeFee - discount,
          );

          return {
            revenue: rev,
            fee: rev * 0.2, // <-- 20% TAKE RATE AVULSO
            durationHours: slotUnits,
            isContract: false,
          };
        };

        // ========================================================
        // MOTOR DE PROCESSAMENTO (BI MATH + OCUPAÇÃO CONTRATUAL)
        // ========================================================
        let totalGmv = 0;
        let totalContractGmv = 0;
        let totalTakeRate = 0;
        const uniqueDoctors = new Set();

        const revMap: any = {};
        const specMap: any = {};

        const heatMapMatrix = [
          { day: "Dom", shifts: [0, 0, 0, 0] },
          { day: "Seg", shifts: [0, 0, 0, 0] },
          { day: "Ter", shifts: [0, 0, 0, 0] },
          { day: "Qua", shifts: [0, 0, 0, 0] },
          { day: "Qui", shifts: [0, 0, 0, 0] },
          { day: "Sex", shifts: [0, 0, 0, 0] },
          { day: "Sáb", shifts: [0, 0, 0, 0] },
        ];

        const roomStats: any = {};
        roomsData.forEach((r: any) => {
          const roomContracts = activeContractsByRoom.get(r.id) || [];
          const hasExclusiveContract = roomContracts.some(
            (c: any) => c.contract_type === "monthly_exclusive",
          );
          const cohostContract = roomContracts.find(
            (c: any) =>
              c.contract_type === "monthly_exclusive" && c.allow_sublease,
          );

          roomStats[r.id] = {
            id: r.id,
            name: r.name,
            host_id: r.host_id,
            revenue: 0,
            bookings: 0,
            occupiedHours: 0,
            contractHours: 0,
            hasContracts: roomContracts.length > 0,
            hasExclusiveContract,
            cohostName: cohostContract?.specialist_name || null,
          };
        });

        bookingsData.forEach((b: any) => {
          if (!b.start_time) return;

          const { revenue, fee, durationHours, isContract } =
            resolveBookingFinancials(b);

          totalGmv += revenue;
          if (isContract) totalContractGmv += revenue;
          totalTakeRate += fee;
          if (b.user_id) uniqueDoctors.add(b.user_id);

          const dateObj = parseISO(b.start_time);
          const endDateObj = b.end_time ? parseISO(b.end_time) : null;

          const dateKey =
            timeFilter === "ytd"
              ? format(dateObj, "MMM", { locale: ptBR })
              : format(dateObj, "dd MMM", { locale: ptBR });
          if (!revMap[dateKey])
            revMap[dateKey] = {
              name: dateKey,
              gmv: 0,
              platformFee: 0,
              order: dateObj.getTime(),
            };
          revMap[dateKey].gmv += revenue;
          revMap[dateKey].platformFee += fee;

          const doctorProfile = profilesData.find(
            (p: any) => p.id === b.user_id,
          );
          const specialty = doctorProfile?.specialty || "Outros";
          specMap[specialty] = (specMap[specialty] || 0) + 1;

          // Preenche o Mapa de Calor em todos os turnos ocupados pela reserva/contrato
          const dayOfWeek = getDay(dateObj);
          const startH = getHours(dateObj);
          const endH =
            endDateObj && getHours(endDateObj) > startH
              ? getHours(endDateObj)
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

          if (roomStats[b.room_id]) {
            roomStats[b.room_id].revenue += revenue;
            roomStats[b.room_id].bookings += 1;
            roomStats[b.room_id].occupiedHours += durationHours;
            if (isContract) {
              roomStats[b.room_id].contractHours += durationHours;
            }
          }
        });

        const activeContractsList = contractsData.filter(
          (c: any) => c.status === "active",
        );

        setGmv(totalGmv);
        setContractGmv(totalContractGmv);
        setTakeRate(totalTakeRate);
        setActiveDoctors(uniqueDoctors.size);
        setActiveRooms(roomsData.filter((r: any) => r.is_active).length || 0);
        setActiveContractsCount(activeContractsList.length);

        const sortedRevData = Object.values(revMap).sort(
          (a: any, b: any) => a.order - b.order,
        );
        setRevenueData(sortedRevData);

        const totalSpecBookings = Object.values(specMap).reduce(
          (a: any, b: any) => a + b,
          0,
        ) as number;
        const formattedSpecData = Object.keys(specMap)
          .map((key, index) => ({
            name: key,
            value:
              totalSpecBookings > 0
                ? Math.round((specMap[key] / totalSpecBookings) * 100)
                : 0,
            color: PIE_COLORS[index % PIE_COLORS.length],
          }))
          .sort((a, b) => b.value - a.value);
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

        // Capacidade operacional de referência: 8h/dia útil por sala (retenção do m²)
        const availableHoursPerRoom = Math.max(1, daysCount * 8);

        const activeRoomsStats = Object.values(roomStats).filter(
          (r: any) => r.bookings > 0 || r.hasContracts,
        );

        const formattedRooms = activeRoomsStats
          .map((r: any) => {
            const hostProfile = profilesData.find(
              (p: any) => p.id === r.host_id,
            );
            const rawOcc = Math.round(
              (r.occupiedHours / availableHoursPerRoom) * 100,
            );
            const occ = r.hasExclusiveContract
              ? Math.max(rawOcc, 85)
              : Math.min(rawOcc, 100);

            let status = "cold";
            if (occ >= 40) status = "hot";
            else if (occ >= 15) status = "warm";

            return {
              ...r,
              host: hostProfile?.full_name || "Desconhecido",
              occupancy: Math.min(100, occ),
              status: status,
            };
          })
          .sort((a: any, b: any) => b.revenue - a.revenue)
          .slice(0, 10);

        setTopRooms(formattedRooms);

        if (formattedRooms.length > 0) {
          const sumOcc = formattedRooms.reduce(
            (acc: number, curr: any) => acc + curr.occupancy,
            0,
          );
          setAvgOccupancyRate(Math.round(sumOcc / formattedRooms.length));
        } else {
          setAvgOccupancyRate(0);
        }
      } catch (err: any) {
        console.error("Erro ao montar BI do Admin:", err);

        let errorMsg = "Ocorreu um erro desconhecido ao carregar o painel.";
        if (err instanceof Error) {
          errorMsg = err.message;
        } else if (err?.message) {
          errorMsg = err.message;
        } else {
          errorMsg = JSON.stringify(err);
        }

        if (errorMsg === "{}" || errorMsg === "[]") {
          errorMsg =
            "Bloqueio do Supabase (RLS). Certifique-se de que rodou o Script SQL para permitir que o Admin leia as reservas e salas.";
        }

        toast({
          variant: "destructive",
          title: "Erro de Processamento de Dados",
          description: errorMsg,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchRealBI();
  }, [supabase, timeFilter, toast]);

  const getHeatmapColor = (intensity: number) => {
    if (intensity === 0) return "bg-slate-50 border-slate-100";
    if (intensity <= 2) return "bg-blue-100 border-blue-200 text-blue-700";
    if (intensity <= 5)
      return "bg-emerald-100 border-emerald-200 text-emerald-700";
    if (intensity <= 10) return "bg-amber-100 border-amber-200 text-amber-700";
    if (intensity <= 20) return "bg-orange-400 border-orange-500 text-white";
    return "bg-[#9A3C1D] border-[#b03d12] text-white shadow-inner";
  };

  const handleExportPrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans print:p-0">
      {/* HEADER DO ADMIN */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 print:mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Crown className="w-8 h-8 text-amber-500" />
            Centro de Comando Fusion
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Visão executiva da plataforma (Take Rate Avulso 20% + Contratos),
            retenção do m² e comportamento dos usuários.
          </p>
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm overflow-x-auto">
            {[
              { id: "7d", label: "7 Dias" },
              { id: "30d", label: "30 Dias" },
              { id: "ytd", label: "Este Ano" },
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
          <Button
            onClick={handleExportPrint}
            variant="outline"
            className="hidden md:flex h-11 rounded-xl border-slate-200 font-bold text-slate-600 hover:text-[#BF4B24] hover:bg-orange-50"
          >
            <Download className="w-4 h-4 mr-2" /> Exportar BI
          </Button>
        </div>
      </div>

      {/* KPIs DE PLATAFORMA (SUPERIORES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:grid-cols-4">
        {/* KPI 1: GMV (Avulso + Contratos) */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Activity className="w-5 h-5" />
            </div>
            {contractGmv > 0 && (
              <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px] font-bold">
                Contratos: R${" "}
                {contractGmv.toLocaleString("pt-BR", {
                  minimumFractionDigits: 0,
                  maximumFractionDigits: 0,
                })}
              </Badge>
            )}
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Volume Transacionado (GMV)
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            <span className="text-lg text-slate-400 font-bold mr-1">R$</span>
            {gmv.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </h3>
        </div>

        {/* KPI 2: Receita Fusion (Take Rate 20% + Contratos) */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden group print:bg-white print:border print:border-slate-200 print:shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#BF4B24]/20 rounded-full blur-2xl -mr-8 -mt-8 transition-transform group-hover:scale-150 print:hidden"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#BF4B24]/20 flex items-center justify-center text-[#BF4B24]">
                <Wallet className="w-5 h-5" />
              </div>
              <Badge className="bg-emerald-500/20 text-emerald-300 border-0 text-[10px] font-bold">
                {activeContractsCount} contrato(s) ativo(s)
              </Badge>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-500">
              Receita Fusion (Take Rate 20% + Contratos)
            </p>
            <h3 className="text-3xl font-black text-white print:text-slate-900">
              <span className="text-lg text-emerald-400 font-bold mr-1">
                R$
              </span>
              {takeRate.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
          </div>
        </div>

        {/* KPI 3: Médicos Ativos */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Stethoscope className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Profissionais Ativos
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {activeDoctors}{" "}
            <span className="text-sm text-slate-400 font-medium ml-1">
              usuários
            </span>
          </h3>
        </div>

        {/* KPI 4: Salas Ativas & Retenção do m² */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Building2 className="w-5 h-5" />
            </div>
            <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] font-bold">
              Ocupação Média: {avgOccupancyRate}%
            </Badge>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Salas Ativas (Retenção m²)
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {activeRooms}{" "}
            <span className="text-sm text-slate-400 font-medium ml-1">
              espaços
            </span>
          </h3>
        </div>
      </div>

      {/* GRÁFICOS: FATURAMENTO & ESPECIALIDADES */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 print:grid-cols-3">
        {/* Gráfico de Faturamento Global */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Evolução do Faturamento (Avulso + Contratos)
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Comparativo do Volume Total vs Receita da Plataforma (20% Avulso
                + Split Contratos)
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
                  <linearGradient id="colorGmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorFee" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#BF4B24" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#BF4B24" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickFormatter={(val) =>
                    `R$${val >= 1000 ? (val / 1000).toFixed(1) + "k" : val}`
                  }
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                  }}
                  formatter={(value: number, name: string) => [
                    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
                    name === "gmv" ? "Volume Total" : "Receita Fusion",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorGmv)"
                />
                <Area
                  type="monotone"
                  dataKey="platformFee"
                  stroke="#BF4B24"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorFee)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Especialidades */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="mb-2">
            <h2 className="text-lg font-black text-slate-900">
              Demanda por Especialidade
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Quem está ocupando mais o m²?
            </p>
          </div>
          <div className="flex-1 flex items-center justify-center">
            {specialtyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={specialtyData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {specialtyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value) => [`${value}%`, "Market Share"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm font-bold">
                Sem dados no período
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 max-h-[100px] overflow-y-auto scrollbar-hide">
            {specialtyData.map((spec) => (
              <div
                key={spec.name}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 truncate"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: spec.color }}
                ></span>
                <span className="truncate">{spec.name}</span> ({spec.value}%)
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAPA DE CALOR GLOBAL (Horários Frios e Quentes) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8 overflow-hidden print:break-inside-avoid">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <MapIcon className="w-5 h-5 text-indigo-500" /> Zonas Quentes e
              Frias (Horas Avulsas + Contratos)
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Concentração real de ocupação por turno considerando diárias e
              turnos contratuais.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200"
            >
              <Snowflake className="w-3 h-3 mr-1" /> Baixa Demanda
            </Badge>
            <Badge
              variant="outline"
              className="bg-orange-50 text-orange-700 border-orange-200"
            >
              <Flame className="w-3 h-3 mr-1" /> Alta Demanda
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto pb-4">
          <div className="min-w-[600px]">
            <div className="grid grid-cols-5 gap-2 mb-2">
              <div className="col-span-1"></div>
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
                      className={`col-span-1 h-12 rounded-xl border flex items-center justify-center transition-all hover:scale-105 cursor-crosshair ${getHeatmapColor(intensity)}`}
                      title={`${row.day} - ${shiftLabels[idx]}: ${intensity} turno(s) ocupado(s)`}
                    >
                      {intensity >= 10 && (
                        <Flame className="w-4 h-4 opacity-50" />
                      )}
                      {intensity > 0 && intensity <= 2 && (
                        <Snowflake className="w-4 h-4 opacity-50" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RANKING DE SALAS (PERFORMANCE E RETENÇÃO DO M²) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:break-inside-avoid">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Top 10 Salas (Performance & Retenção do m²)
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Rendimento somado de horas avulsas, contratos fixos e sublocações
              por Co-Anfitrião.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Posição / Sala</th>
                <th className="px-6 py-4">Anfitrião & Co-Anfitrião</th>
                <th className="px-6 py-4 text-center">
                  Taxa de Ocupação (Redução de Ociosidade)
                </th>
                <th className="px-6 py-4 text-center">Termômetro</th>
                <th className="px-6 py-4 text-right">Volume Gerado (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topRooms.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
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
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${index === 0 ? "bg-amber-100 text-amber-700" : index === 1 ? "bg-slate-200 text-slate-700" : index === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {index + 1}
                        </div>
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
                            agendamentos)
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-700 truncate max-w-[180px]">
                        {room.host}
                      </p>
                      {room.cohostName && (
                        <p className="text-[10px] font-bold text-purple-700 flex items-center gap-1 mt-0.5">
                          <Sparkles className="w-3 h-3" /> Co-Anfitrião:{" "}
                          {room.cohostName}
                        </p>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex flex-col items-center justify-center gap-1">
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-700 w-9 text-right">
                            {room.occupancy}%
                          </span>
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full bg-[#BF4B24]"
                              style={{ width: `${room.occupancy}%` }}
                            />
                          </div>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                          Ociosidade: {Math.max(0, 100 - room.occupancy)}%
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {room.status === "hot" && (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0">
                          <Flame className="w-3 h-3 mr-1" /> Alta Retenção
                        </Badge>
                      )}
                      {room.status === "warm" && (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
                          Estável
                        </Badge>
                      )}
                      {room.status === "cold" && (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">
                          <Snowflake className="w-3 h-3 mr-1" /> Ociosa
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-900 bg-emerald-50/30">
                      R${" "}
                      {room.revenue.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
