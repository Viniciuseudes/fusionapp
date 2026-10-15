"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Search,
  CheckCircle2,
  User,
  Loader2,
  AlertCircle,
  XCircle,
  FileText,
  Sparkles,
  ExternalLink,
  Wallet,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format, isToday, isBefore, startOfToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BookingUI {
  id: string;
  doctorName: string;
  specialty: string;
  roomName: string;
  date: string;
  time: string;
  status: string;
  rawStatus: string;
  type: "hoje" | "proximos" | "historico";
  isContract: boolean;
  pricingLabel: string;
  grossValueBrl: number;
  hostPayoutBrl: number;
  cohostName: string | null;
  cohostSplitPct: number;
  cohostPayoutBrl: number;
  contractPdfUrl: string | null;
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

function extractRoomModalitiesHourlyRate(modalities: any): number | null {
  if (!modalities) return null;
  try {
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
      if (!isNaN(val) && val > 0) return val;
    }
  } catch {
    return null;
  }
  return null;
}

export function HostBookingsTab() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingUI[]>([]);
  const [filter, setFilter] = useState<"hoje" | "proximos" | "historico">(
    "hoje",
  );
  const [originFilter, setOriginFilter] = useState<
    "all" | "marketplace" | "contract"
  >("all");
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchHostBookings() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        const { data: myRooms, error: roomsErr } = await supabase
          .from("rooms")
          .select("id, name, tier, category_id, modalities")
          .eq("host_id", user.id);

        if (roomsErr) throw roomsErr;
        if (!myRooms || myRooms.length === 0) {
          setBookings([]);
          return;
        }
        const roomIds = myRooms.map((r) => r.id);
        const roomsMap = new Map<string, any>(
          myRooms.map((r: any) => [r.id, r]),
        );

        const { data: myBookings, error: bookingsErr } = await supabase
          .from("bookings")
          .select("*")
          .in("room_id", roomIds)
          .order("start_time", { ascending: true });

        if (bookingsErr) throw bookingsErr;
        if (!myBookings || myBookings.length === 0) {
          setBookings([]);
          return;
        }

        const userIds = [
          ...new Set(myBookings.map((b: any) => b.user_id).filter(Boolean)),
        ];
        const bookingIds = myBookings.map((b: any) => b.id).filter(Boolean);

        const [
          profilesRes,
          contractsRes,
          packagesRes,
          walletRes,
          subsRes,
          categoriesRes,
          couponsRes,
        ] = await Promise.all([
          userIds.length > 0
            ? supabase
                .from("profiles")
                .select("id, full_name, specialty")
                .in("id", userIds)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from("room_contracts").select("*").in("room_id", roomIds),
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
        ]);

        const guestProfiles = profilesRes.data || [];
        const contractsData = contractsRes.data || [];

        const contractsById = new Map<string, any>(
          contractsData.map((c: any) => [c.id, c]),
        );
        const activeCohostByRoomId = new Map<string, any>();
        contractsData.forEach((c: any) => {
          if (
            c.status === "active" &&
            c.contract_type === "monthly_exclusive" &&
            c.allow_sublease
          ) {
            activeCohostByRoomId.set(c.room_id, c);
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

          const hourlyRate =
            h > 1 && rawPrice / h >= 15 ? rawPrice / h : rawPrice;
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
            if (closestHours !== null) {
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

        const formattedBookings: BookingUI[] = myBookings.map((b: any) => {
          const room = roomsMap.get(b.room_id);
          const roomTier = normalizeTier(room?.tier);
          const profile = guestProfiles.find((p: any) => p.id === b.user_id);

          const startDate = new Date(b.start_time);
          const endDate = new Date(b.end_time);
          const durationHours = Math.max(
            0.5,
            (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60),
          );

          let type: "hoje" | "proximos" | "historico" = "proximos";
          if (isToday(startDate)) {
            type = "hoje";
          } else if (isBefore(startDate, startOfToday())) {
            type = "historico";
          }

          let dateStr = format(startDate, "dd MMM", { locale: ptBR });
          if (isToday(startDate)) dateStr = `Hoje, ${dateStr}`;
          else if (isTomorrow(startDate)) dateStr = `Amanhã, ${dateStr}`;

          let statusStr = b.status;
          if (b.status === "confirmed") statusStr = "Confirmado";
          else if (b.status === "pending_payment") statusStr = "Pendente";
          else if (b.status === "completed") statusStr = "Concluído";
          else if (b.status === "cancelled") statusStr = "Cancelado";

          const linkedContract = b.contract_id
            ? contractsById.get(b.contract_id)
            : null;
          const isContractBooking = Boolean(
            b.contract_id ||
            (b.booking_origin &&
              String(b.booking_origin).startsWith("contract")),
          );

          if (isContractBooking) {
            const sessionVal =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl)
                : Number(linkedContract?.session_value || 0);
            const feePct = Number(linkedContract?.platform_fee_pct ?? 15) / 100;
            const hostPayout = Math.max(0, sessionVal * (1 - feePct));

            const cType =
              linkedContract?.contract_type || b.booking_origin || "";
            let contractLabel = "Contrato • Alocação Fixa";
            if (cType.includes("monthly_exclusive"))
              contractLabel = "Contrato • Sala Fixa Mensal";
            else if (cType.includes("fixed_shift"))
              contractLabel = "Contrato • Turno Fixo";
            else if (cType.includes("fixed_daily"))
              contractLabel = "Contrato • Diária Fixa";

            return {
              id: b.id,
              doctorName:
                linkedContract?.specialist_name ||
                profile?.full_name ||
                "Locatário de Contrato",
              specialty:
                profile?.specialty || "Locatário Contratual / Exclusivo",
              roomName: room?.name || "Sala Excluída",
              date: dateStr,
              time: `${format(startDate, "HH:mm")} - ${format(endDate, "HH:mm")}`,
              status: statusStr,
              rawStatus: b.status,
              type,
              isContract: true,
              pricingLabel: contractLabel,
              grossValueBrl: sessionVal,
              hostPayoutBrl: hostPayout,
              cohostName: null,
              cohostSplitPct: 0,
              cohostPayoutBrl: 0,
              contractPdfUrl: linkedContract?.pdf_url || null,
            };
          }

          const roomCohost = activeCohostByRoomId.get(b.room_id);
          const cohostName = roomCohost?.specialist_name || null;
          const cohostSplitPct = roomCohost
            ? Number(roomCohost.cohost_split_pct || 0)
            : 0;

          // Take Rate avulso de 20%
          const computeAvulsoSplit = (grossVal: number) => {
            const platformFee = grossVal * 0.2;
            const netAfterPlatform = Math.max(0, grossVal - platformFee);
            const cohostPayout =
              cohostSplitPct > 0
                ? netAfterPlatform * (cohostSplitPct / 100)
                : 0;
            const hostPayout = Math.max(0, netAfterPlatform - cohostPayout);
            return { cohostPayout, hostPayout };
          };

          const rawTotalCost = Number(b.total_cost || 0);
          const upgradeFee = Number(b.upgrade_fee_amount || 0);
          const discount = couponDiscountMap.get(b.id) || 0;

          if (
            Number(b.agreed_value_brl) > 0 ||
            rawTotalCost >= durationHours * 15
          ) {
            const baseVal =
              Number(b.agreed_value_brl) > 0
                ? Number(b.agreed_value_brl)
                : rawTotalCost;
            const grossVal = Math.max(0, baseVal + upgradeFee - discount);
            const { cohostPayout, hostPayout } = computeAvulsoSplit(grossVal);

            return {
              id: b.id,
              doctorName: profile?.full_name || "Profissional",
              specialty: profile?.specialty || "Profissional de Saúde",
              roomName: room?.name || "Sala Excluída",
              date: dateStr,
              time: `${format(startDate, "HH:mm")} - ${format(endDate, "HH:mm")}`,
              status: statusStr,
              rawStatus: b.status,
              type,
              isContract: false,
              pricingLabel: `${formatTierLabel(roomTier)} • Reserva Direta`,
              grossValueBrl: grossVal,
              hostPayoutBrl: hostPayout,
              cohostName,
              cohostSplitPct,
              cohostPayoutBrl: cohostPayout,
              contractPdfUrl: null,
            };
          }

          const creditsUsed = rawTotalCost > 0 ? rawTotalCost : durationHours;
          const userTxs = userWalletMap.get(b.user_id) || [];
          const bookingTime = b.created_at
            ? new Date(b.created_at).getTime()
            : startDate.getTime();

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

          const positiveTxs = userTxs.filter(
            (tx: any) => Number(tx.amount) > 0,
          );
          const validPriorCredits = positiveTxs.filter((tx: any) => {
            const createdMs = new Date(tx.created_at).getTime();
            const notAfterBooking = createdMs <= bookingTime + 60 * 1000;
            const notExpiredAtBooking =
              !tx.expires_at ||
              new Date(tx.expires_at).getTime() >= bookingTime;
            return notAfterBooking && notExpiredAtBooking;
          });

          const candidateCredits =
            validPriorCredits.length > 0 ? validPriorCredits : positiveTxs;

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
            if (descMatch && Number(descMatch[1]) > 0) {
              detectedPackageHours = Number(descMatch[1]);
            } else if (txAmt > 0) {
              detectedPackageHours = txAmt;
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

          let pricingLabel = "";
          if (resolvedHourlyRate !== null) {
            pricingLabel = matchedHours
              ? `${formatTierLabel(creditTierUsed)} • Pacote ${matchedHours}h`
              : `${formatTierLabel(creditTierUsed)} • Crédito`;
          } else {
            const roomModalityRate = extractRoomModalitiesHourlyRate(
              room?.modalities,
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
                start: 45,
                vip: 60,
                master: 80,
              };
            resolvedHourlyRate =
              roomModalityRate || categoryRate || defaultTierRates[roomTier];
            pricingLabel = `${formatTierLabel(roomTier)} • Tarifa da Sala`;
          }

          const grossVal = Math.max(
            0,
            creditsUsed * resolvedHourlyRate + upgradeFee - discount,
          );
          const { cohostPayout, hostPayout } = computeAvulsoSplit(grossVal);

          return {
            id: b.id,
            doctorName: profile?.full_name || "Profissional",
            specialty: profile?.specialty || "Profissional de Saúde",
            roomName: room?.name || "Sala Excluída",
            date: dateStr,
            time: `${format(startDate, "HH:mm")} - ${format(endDate, "HH:mm")}`,
            status: statusStr,
            rawStatus: b.status,
            type,
            isContract: false,
            pricingLabel,
            grossValueBrl: grossVal,
            hostPayoutBrl: hostPayout,
            cohostName,
            cohostSplitPct,
            cohostPayoutBrl: cohostPayout,
            contractPdfUrl: null,
          };
        });

        setBookings(formattedBookings);
      } catch (error) {
        console.error("Erro ao buscar agenda:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchHostBookings();
  }, [supabase]);

  const filteredBookings = bookings.filter((b) => {
    if (b.type !== filter) return false;
    if (originFilter === "contract" && !b.isContract) return false;
    if (originFilter === "marketplace" && b.isContract) return false;

    const q = searchQuery.toLowerCase();
    return (
      b.doctorName.toLowerCase().includes(q) ||
      b.roomName.toLowerCase().includes(q) ||
      b.pricingLabel.toLowerCase().includes(q)
    );
  });

  const getStatusBadge = (status: string, rawStatus: string) => {
    if (rawStatus === "confirmed" || rawStatus === "completed") {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-bold border-0">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {status}
        </Badge>
      );
    }
    if (rawStatus === "cancelled") {
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 font-bold border-0">
          <XCircle className="w-3.5 h-3.5 mr-1" /> {status}
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 font-bold border-0">
        <AlertCircle className="w-3.5 h-3.5 mr-1" /> {status}
      </Badge>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-5xl mx-auto w-full pb-32">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 mb-2">
          Agenda de Reservas & Contratos
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Controle quem está a utilizar os seus espaços (Take Rate Avulso 20% +
          Splits de Contratos).
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200 mb-6">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex bg-slate-100 p-1 rounded-xl w-full md:w-auto overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setFilter("hoje")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "hoje" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Hoje ({bookings.filter((b) => b.type === "hoje").length})
            </button>
            <button
              onClick={() => setFilter("proximos")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "proximos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Próximos ({bookings.filter((b) => b.type === "proximos").length})
            </button>
            <button
              onClick={() => setFilter("historico")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "historico" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Histórico
            </button>
          </div>

          <select
            value={originFilter}
            onChange={(e) => setOriginFilter(e.target.value as any)}
            className="h-11 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
          >
            <option value="all">Todas as Origens</option>
            <option value="marketplace">Horas Avulsas</option>
            <option value="contract">Contratos & Turnos Fixos</option>
          </select>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar profissional, sala ou contrato..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl w-full"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredBookings.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 border-dashed">
            <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {searchQuery
                ? "Nenhuma reserva encontrada para a sua busca."
                : "A agenda está livre neste período."}
            </p>
          </div>
        ) : (
          filteredBookings.map((booking) => (
            <div
              key={booking.id}
              className={`bg-white rounded-2xl border shadow-sm p-5 hover:border-[#BF4B24]/30 transition-colors ${
                booking.isContract
                  ? "border-purple-200 bg-purple-50/10"
                  : "border-slate-200"
              }`}
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div
                    className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 ${
                      booking.isContract
                        ? "bg-purple-100 text-purple-700"
                        : "bg-orange-50 text-[#BF4B24]"
                    }`}
                  >
                    {booking.isContract ? (
                      <FileText className="w-6 h-6" />
                    ) : (
                      <User className="w-6 h-6" />
                    )}
                  </div>
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="text-lg font-black text-slate-900">
                        {booking.doctorName}
                      </h3>
                      {booking.isContract && (
                        <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px] font-black">
                          CONTRATO
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm font-bold text-slate-500 mb-2">
                      {booking.specialty}
                    </p>

                    <div className="flex flex-wrap items-center gap-2">
                      <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md inline-flex">
                        <MapPin className="w-3.5 h-3.5" />
                        <span className="font-bold">{booking.roomName}</span>
                      </div>

                      <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md inline-flex">
                        <Wallet className="w-3.5 h-3.5 text-emerald-600" />
                        <span className="font-bold">
                          {booking.pricingLabel}
                        </span>
                      </div>

                      {booking.contractPdfUrl && (
                        <a
                          href={booking.contractPdfUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs font-bold bg-purple-100 text-purple-800 hover:bg-purple-200 px-2.5 py-1 rounded-md transition-colors"
                        >
                          <FileText className="w-3 h-3" />
                          Ver PDF
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      )}
                    </div>

                    {booking.cohostName && !booking.isContract && (
                      <p className="text-xs font-bold text-purple-700 flex items-center gap-1 mt-2">
                        <Sparkles className="w-3.5 h-3.5" />
                        Sublocação Co-Anfitrião: {booking.cohostName} (
                        {booking.cohostSplitPct}% repassado)
                      </p>
                    )}
                  </div>
                </div>

                <div className="flex flex-col md:items-end gap-2 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
                  <div className="flex items-center gap-4 text-sm font-bold text-slate-700 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4 text-[#BF4B24]" />
                      {booking.date}
                    </div>
                    <div className="w-px h-4 bg-slate-300"></div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#BF4B24]" />
                      {booking.time}
                    </div>
                  </div>

                  <div className="flex items-center gap-3 self-start md:self-end mt-1">
                    <div className="text-left md:text-right">
                      <p className="text-xs font-bold text-slate-400">
                        Bruto: R${" "}
                        {booking.grossValueBrl.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-sm font-black text-emerald-600">
                        Seu Repasse: R${" "}
                        {booking.hostPayoutBrl.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </div>
                    {getStatusBadge(booking.status, booking.rawStatus)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
