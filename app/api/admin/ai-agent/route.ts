import { NextResponse } from "next/server";
import { createClient as createServerSupabase } from "@/utils/supabase/server";
import { createClient as createAdminSupabase } from "@supabase/supabase-js";
import {
  subDays,
  subMonths,
  addDays,
  startOfDay,
  endOfDay,
  startOfMonth,
  parseISO,
  format,
  eachDayOfInterval,
  differenceInDays,
  getDay,
  getHours,
} from "date-fns";
import { ptBR } from "date-fns/locale";

const WEEKDAY_NAMES: Record<number, string> = {
  0: "Domingo",
  1: "Segunda-feira",
  2: "Terça-feira",
  3: "Quarta-feira",
  4: "Quinta-feira",
  5: "Sexta-feira",
  6: "Sábado",
};

function normalizeTier(tier?: string | null): "start" | "vip" | "master" {
  const t = (tier || "start").toLowerCase().trim();
  if (t.includes("master")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

function calculateSlotUnits(startIso: string, endIso: string): number {
  const diffMinutes =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
  if (diffMinutes <= 0) return 1;
  if (diffMinutes >= 45 && diffMinutes <= 65) return 1;
  return Math.max(1, Math.round(diffMinutes / 55));
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

function getRoomAvailableHoursForSingleDate(room: any, d: Date): number {
  try {
    const blockedSet = new Set<string>(
      Array.isArray(room?.blocked_dates) ? room.blocked_dates : [],
    );
    const dateIso = format(d, "yyyy-MM-dd");
    if (blockedSet.has(dateIso)) return 0;

    const dayOfWeek = d.getDay();
    const dateStr = d.toDateString();
    const availability =
      typeof room?.availability === "string"
        ? JSON.parse(room.availability)
        : room?.availability;

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
      return daySlotsCount;
    } else {
      if (dayOfWeek >= 1 && dayOfWeek <= 5) return 10;
      if (dayOfWeek === 6) return 4;
      return 0;
    }
  } catch {
    const dow = d.getDay();
    return dow >= 1 && dow <= 5 ? 8 : 0;
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
  try {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        {
          error:
            "A chave GEMINI_API_KEY não foi encontrada no seu arquivo .env.local.",
        },
        { status: 500 },
      );
    }

    const serverSupabase = await createServerSupabase();
    const {
      data: { user },
    } = await serverSupabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const { data: adminProfile } = await serverSupabase
      .from("profiles")
      .select("role, full_name")
      .eq("id", user.id)
      .single();

    if (adminProfile?.role !== "admin") {
      return NextResponse.json(
        { error: "Acesso restrito a administradores." },
        { status: 403 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createAdminSupabase(supabaseUrl, supabaseKey);

    const body = await req.json();
    const {
      question,
      history = [],
      startDate: reqStartDate,
      endDate: reqEndDate,
    } = body;

    if (!question || typeof question !== "string") {
      return NextResponse.json(
        { error: "Envie uma pergunta válida." },
        { status: 400 },
      );
    }

    const now = new Date();
    const currentCompetence = format(now, "yyyy-MM");
    const periodStart = reqStartDate
      ? startOfDay(parseISO(reqStartDate))
      : startOfDay(subDays(now, 30));
    const periodEnd = reqEndDate
      ? endOfDay(parseISO(reqEndDate))
      : endOfDay(now);

    const sixMonthsAgo = startOfMonth(subMonths(now, 5));
    const future30End = endOfDay(addDays(now, 30));

    const earliestFetchDate =
      periodStart < sixMonthsAgo ? periodStart : sixMonthsAgo;
    const latestFetchDate = periodEnd > future30End ? periodEnd : future30End;

    const [
      roomsRes,
      bookingsRes,
      contractsRes,
      packagesRes,
      categoriesRes,
      profilesRes,
      walletRes,
      couponsRes,
      couponUsesRes,
      reviewsRes,
      favoritesRes,
      subscriptionsRes,
      inventoryRes,
      maintenancesRes,
      expensesRes,
    ] = await Promise.all([
      supabase
        .from("rooms")
        .select(
          "id, name, host_id, is_active, is_paused, is_partner, tier, category_id, specialty, modalities, address_details, availability, blocked_dates",
        ),
      supabase
        .from("bookings")
        .select(
          "id, created_at, start_time, end_time, total_cost, upgrade_fee_amount, room_id, user_id, status, checkin_time, checkout_time, penalty_status, penalty_amount, contract_id, booking_origin, agreed_value_brl",
        )
        .gte("start_time", earliestFetchDate.toISOString())
        .lte("start_time", latestFetchDate.toISOString())
        .in("status", [
          "confirmed",
          "completed",
          "in_progress",
          "pending_payment",
        ]),
      supabase.from("room_contracts").select("*"),
      supabase.from("packages").select("id, tier, hours, price, active"),
      supabase
        .from("room_categories")
        .select("id, name, credit_cost_per_hour, upgrade_fee_per_hour"),
      supabase
        .from("profiles")
        .select(
          "id, full_name, role, specialty, council, council_number, email, phone, whatsapp, gamification_level, created_at",
        ),
      supabase
        .from("wallet_transactions")
        .select(
          "id, user_id, amount, type, description, tier, created_at, expires_at",
        )
        .order("created_at", { ascending: true }),
      supabase.from("coupons").select("*"),
      supabase.from("coupon_uses").select("*"),
      supabase.from("reviews").select("*"),
      supabase.from("favorites").select("id, user_id, room_id"),
      supabase.from("subscriptions").select("*"),
      supabase.from("clinic_inventory_items").select("*"),
      supabase.from("clinic_maintenances").select("*"),
      supabase.from("clinic_expenses").select("*"),
    ]);

    const roomsData = roomsRes.data || [];
    const allBookings = bookingsRes.data || [];
    const contractsData = contractsRes.data || [];
    const packagesData = packagesRes.data || [];
    const categoriesData = categoriesRes.data || [];
    const profilesData = profilesRes.data || [];
    const walletData = walletRes.data || [];
    const couponsData = couponsRes.data || [];
    const couponUsesData = couponUsesRes.data || [];
    const reviewsData = reviewsRes.data || [];
    const favoritesData = favoritesRes.data || [];
    const subscriptionsData = subscriptionsRes.data || [];
    const inventoryData = inventoryRes.data || [];
    const maintenancesData = maintenancesRes.data || [];
    const expensesData = expensesRes.data || [];

    const profilesMap = new Map<string, any>(
      profilesData.map((p: any) => [p.id, p]),
    );
    const roomsMap = new Map<string, any>(roomsData.map((r: any) => [r.id, r]));
    const categoriesMap = new Map<string, any>(
      categoriesData.map((c: any) => [c.id, c]),
    );
    const contractsById = new Map<string, any>(
      contractsData.map((c: any) => [c.id, c]),
    );

    const packageRateMap: Record<
      "start" | "vip" | "master",
      Map<number, number>
    > = {
      start: new Map<number, number>(),
      vip: new Map<number, number>(),
      master: new Map<number, number>(),
    };

    packagesData.forEach((pkg: any) => {
      const t = normalizeTier(pkg.tier);
      const h = Math.max(1, Number(pkg.hours) || 1);
      const rawPrice = Number(pkg.price) || 0;
      if (rawPrice <= 0) return;
      const hourlyRate = h > 1 && rawPrice > 120 ? rawPrice / h : rawPrice;
      packageRateMap[t].set(h, hourlyRate);
    });

    const couponDiscountMap = new Map<string, number>();
    couponUsesData.forEach((cu: any) => {
      if (cu.booking_id) {
        couponDiscountMap.set(
          cu.booking_id,
          (couponDiscountMap.get(cu.booking_id) || 0) +
            Number(cu.discount_applied || 0),
        );
      }
    });

    const userWalletMap = new Map<string, any[]>();
    walletData.forEach((tx: any) => {
      const list = userWalletMap.get(tx.user_id) || [];
      list.push(tx);
      userWalletMap.set(tx.user_id, list);
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
      const sortedHours = Array.from(tierPackages.keys()).sort((a, b) => a - b);
      return tierPackages.get(sortedHours[0])!;
    };

    const resolveRoomPotentialHourlyRate = (room: any): number => {
      const roomTier = normalizeTier(room?.tier);
      const pkgDefault = getRateFromPackageTable(roomTier, 8);
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

    const resolveBookingMetrics = (b: any) => {
      const room = roomsMap.get(b.room_id);
      const roomTier = normalizeTier(room?.tier);
      const slotUnits =
        b.start_time && b.end_time
          ? calculateSlotUnits(b.start_time, b.end_time)
          : 1;

      const linkedContract = b.contract_id
        ? contractsById.get(b.contract_id)
        : null;
      const isContract = Boolean(
        b.contract_id ||
          (b.booking_origin && String(b.booking_origin).startsWith("contract")),
      );

      if (isContract) {
        const val =
          Number(b.agreed_value_brl) > 0
            ? Number(b.agreed_value_brl)
            : Number(linkedContract?.session_value || 0);
        const feePct = Number(linkedContract?.platform_fee_pct ?? 15) / 100;
        return {
          grossBrl: val,
          fusionFeeBrl: val * feePct,
          hostPayoutBrl: Math.max(0, val - val * feePct),
          hours: slotUnits,
          isContract: true,
        };
      }

      const rawTotalCost = Number(b.total_cost || 0);
      const upgradeFee = Number(b.upgrade_fee_amount || 0);
      const discount = couponDiscountMap.get(b.id) || 0;

      if (Number(b.agreed_value_brl) > 0 || rawTotalCost >= slotUnits * 20) {
        const baseVal =
          Number(b.agreed_value_brl) > 0
            ? Number(b.agreed_value_brl)
            : rawTotalCost;
        const rev = Math.max(0, baseVal + upgradeFee - discount);
        return {
          grossBrl: rev,
          fusionFeeBrl: rev * 0.2,
          hostPayoutBrl: rev * 0.8,
          hours: slotUnits,
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

      const purchaseCredits = userTxs.filter(
        (tx: any) =>
          Number(tx.amount) > 0 &&
          !String(tx.description || "")
            .toLowerCase()
            .includes("estorno"),
      );
      const sourceCreditTx = purchaseCredits[purchaseCredits.length - 1];
      let detectedPackageHours: number | null = null;
      if (sourceCreditTx) {
        const txAmt = Math.round(Number(sourceCreditTx.amount));
        if (txAmt > 0 && txAmt <= 60) detectedPackageHours = txAmt;
      }

      let resolvedHourlyRate =
        getRateFromPackageTable(creditTierUsed, detectedPackageHours) ||
        getRateFromPackageTable(roomTier, detectedPackageHours);

      if (resolvedHourlyRate === null) {
        const categoryObj = room?.category_id
          ? categoriesMap.get(room.category_id)
          : null;
        const categoryRate =
          categoryObj && Number(categoryObj.credit_cost_per_hour) >= 15
            ? Number(categoryObj.credit_cost_per_hour)
            : null;
        resolvedHourlyRate =
          extractRoomModalitiesHourlyRate(
            room?.modalities,
            room?.address_details,
          ) ||
          categoryRate ||
          resolveRoomPotentialHourlyRate(room);
      }

      const rev = Math.max(
        0,
        creditsForThisSlot * resolvedHourlyRate + upgradeFee - discount,
      );
      return {
        grossBrl: rev,
        fusionFeeBrl: rev * 0.2,
        hostPayoutBrl: rev * 0.8,
        hours: slotUnits,
        isContract: false,
      };
    };

    const periodDaysList = eachDayOfInterval({
      start: periodStart,
      end: periodEnd,
    });
    const periodStartMs = periodStart.getTime();
    const periodEndMs = periodEnd.getTime();

    const tomorrowStart = startOfDay(addDays(now, 1));
    const future15End = endOfDay(addDays(now, 15));
    const future20End = endOfDay(addDays(now, 20));
    const future20DaysList = eachDayOfInterval({
      start: tomorrowStart,
      end: future20End,
    });
    const future30DaysList = eachDayOfInterval({
      start: tomorrowStart,
      end: future30End,
    });

    const periodBookings = allBookings.filter((b: any) => {
      const stMs = new Date(b.start_time).getTime();
      return stMs >= periodStartMs && stMs <= periodEndMs;
    });

    let globalGmv = 0;
    let globalFusionFee = 0;
    let globalAvulsoGmv = 0;
    let globalContractGmv = 0;
    let globalAvailHours = 0;
    let globalOccupiedHours = 0;
    let globalUpgradeFeeBrl = 0;
    let globalPenaltyBrl = 0;

    const doctorStatsMap = new Map<string, any>();
    const specialtyStatsMap = new Map<string, any>();

    const roomsDetailedDossier = roomsData.map((room: any) => {
      const hostProfile = profilesMap.get(room.host_id);
      const hourlyRate = resolveRoomPotentialHourlyRate(room);

      const weekdayBreakdown: Record<number, any> = {};
      for (let d = 0; d <= 6; d++) {
        weekdayBreakdown[d] = {
          dia_semana: WEEKDAY_NAMES[d],
          qtd_dias_no_periodo: 0,
          horas_disponiveis: 0,
          horas_ocupadas: 0,
          horas_avulsas: 0,
          horas_contrato: 0,
          horas_ociosas: 0,
          taxa_ocupacao_pct: 0,
          taxa_ociosidade_pct: 100,
          faturamento_real_brl: 0,
          potencial_maximo_brl: 0,
        };
      }

      let roomTotalAvailHours = 0;
      periodDaysList.forEach((dayDate) => {
        const dow = getDay(dayDate);
        const availOnDay = getRoomAvailableHoursForSingleDate(room, dayDate);
        weekdayBreakdown[dow].qtd_dias_no_periodo += 1;
        weekdayBreakdown[dow].horas_disponiveis += availOnDay;
        roomTotalAvailHours += availOnDay;
      });

      const shiftsBreakdown = {
        manha_08_12: { locacoes: 0, horas_ocupadas: 0, gmv_brl: 0 },
        tarde_12_16: { locacoes: 0, horas_ocupadas: 0, gmv_brl: 0 },
        fim_tarde_16_20: { locacoes: 0, horas_ocupadas: 0, gmv_brl: 0 },
        noite_20_23: { locacoes: 0, horas_ocupadas: 0, gmv_brl: 0 },
      };

      const roomDoctorsMap = new Map<
        string,
        {
          nome: string;
          especialidade: string;
          qtd_reservas_nesta_sala: number;
          horas_avulsas_nesta_sala: number;
          horas_contrato_nesta_sala: number;
          horas_totais_nesta_sala: number;
          gmv_gerado_nesta_sala_brl: number;
          datas_utilizadas: string[];
        }
      >();

      const roomPeriodBookings = periodBookings.filter(
        (b: any) => b.room_id === room.id,
      );

      let roomGmv = 0;
      let roomFusionFee = 0;
      let roomAvulsoGmv = 0;
      let roomContractGmv = 0;
      let roomOccupiedHours = 0;
      let roomAvulsoHours = 0;
      let roomContractHours = 0;
      let roomCheckinCount = 0;
      let roomPenaltyBrl = 0;

      roomPeriodBookings.forEach((b: any) => {
        const m = resolveBookingMetrics(b);
        const dt = parseISO(b.start_time);
        const dow = getDay(dt);
        const startH = getHours(dt);
        const dateFormatted = format(dt, "dd/MM/yyyy HH:mm");

        roomGmv += m.grossBrl;
        roomFusionFee += m.fusionFeeBrl;
        roomOccupiedHours += m.hours;
        globalUpgradeFeeBrl += Number(b.upgrade_fee_amount || 0);

        if (b.checkin_time) roomCheckinCount += 1;
        if (Number(b.penalty_amount) > 0) {
          roomPenaltyBrl += Number(b.penalty_amount);
          globalPenaltyBrl += Number(b.penalty_amount);
        }

        if (m.isContract) {
          roomContractGmv += m.grossBrl;
          roomContractHours += m.hours;
          weekdayBreakdown[dow].horas_contrato += m.hours;
        } else {
          roomAvulsoGmv += m.grossBrl;
          roomAvulsoHours += m.hours;
          weekdayBreakdown[dow].horas_avulsas += m.hours;
        }

        weekdayBreakdown[dow].horas_ocupadas += m.hours;
        weekdayBreakdown[dow].faturamento_real_brl += m.grossBrl;

        if (startH < 12) {
          shiftsBreakdown.manha_08_12.locacoes += 1;
          shiftsBreakdown.manha_08_12.horas_ocupadas += m.hours;
          shiftsBreakdown.manha_08_12.gmv_brl += m.grossBrl;
        } else if (startH < 16) {
          shiftsBreakdown.tarde_12_16.locacoes += 1;
          shiftsBreakdown.tarde_12_16.horas_ocupadas += m.hours;
          shiftsBreakdown.tarde_12_16.gmv_brl += m.grossBrl;
        } else if (startH < 20) {
          shiftsBreakdown.fim_tarde_16_20.locacoes += 1;
          shiftsBreakdown.fim_tarde_16_20.horas_ocupadas += m.hours;
          shiftsBreakdown.fim_tarde_16_20.gmv_brl += m.grossBrl;
        } else {
          shiftsBreakdown.noite_20_23.locacoes += 1;
          shiftsBreakdown.noite_20_23.horas_ocupadas += m.hours;
          shiftsBreakdown.noite_20_23.gmv_brl += m.grossBrl;
        }

        const doc = profilesMap.get(b.user_id);
        const docName = doc?.full_name || "Profissional";
        const specName = doc?.specialty || "Clínico / Saúde";

        if (b.user_id) {
          const prevDoc = doctorStatsMap.get(b.user_id) || {
            profissional_id: b.user_id,
            nome: docName,
            especialidade: specName,
            whatsapp: doc?.whatsapp || doc?.phone || "N/A",
            reservas_avulsas: 0,
            horas_avulsas: 0,
            horas_contrato: 0,
            gmv_gerado_brl: 0,
            salas_utilizadas: [] as string[],
            ultima_reserva_data: dateFormatted,
          };
          if (m.isContract) prevDoc.horas_contrato += m.hours;
          else {
            prevDoc.reservas_avulsas += 1;
            prevDoc.horas_avulsas += m.hours;
          }
          prevDoc.gmv_gerado_brl = Number(
            (prevDoc.gmv_gerado_brl + m.grossBrl).toFixed(2),
          );
          if (!prevDoc.salas_utilizadas.includes(room.name)) {
            prevDoc.salas_utilizadas.push(room.name);
          }
          prevDoc.ultima_reserva_data = dateFormatted;
          doctorStatsMap.set(b.user_id, prevDoc);

          const prevRoomDoc = roomDoctorsMap.get(b.user_id) || {
            nome: docName,
            especialidade: specName,
            qtd_reservas_nesta_sala: 0,
            horas_avulsas_nesta_sala: 0,
            horas_contrato_nesta_sala: 0,
            horas_totais_nesta_sala: 0,
            gmv_gerado_nesta_sala_brl: 0,
            datas_utilizadas: [] as string[],
          };
          prevRoomDoc.qtd_reservas_nesta_sala += 1;
          if (m.isContract) prevRoomDoc.horas_contrato_nesta_sala += m.hours;
          else prevRoomDoc.horas_avulsas_nesta_sala += m.hours;
          prevRoomDoc.horas_totais_nesta_sala += m.hours;
          prevRoomDoc.gmv_gerado_nesta_sala_brl = Number(
            (prevRoomDoc.gmv_gerado_nesta_sala_brl + m.grossBrl).toFixed(2),
          );
          if (prevRoomDoc.datas_utilizadas.length < 15) {
            prevRoomDoc.datas_utilizadas.push(dateFormatted);
          }
          roomDoctorsMap.set(b.user_id, prevRoomDoc);
        }

        const prevSpec = specialtyStatsMap.get(specName) || {
          reservas: 0,
          horas: 0,
          gmv_brl: 0,
        };
        prevSpec.reservas += 1;
        prevSpec.horas += m.hours;
        prevSpec.gmv_brl += m.grossBrl;
        specialtyStatsMap.set(specName, prevSpec);
      });

      Object.values(weekdayBreakdown).forEach((wb) => {
        const effAvail = Math.max(wb.horas_disponiveis, wb.horas_ocupadas);
        wb.horas_disponiveis = effAvail;
        wb.horas_ociosas = Math.max(0, effAvail - wb.horas_ocupadas);
        wb.taxa_ocupacao_pct =
          effAvail > 0
            ? Number(((wb.horas_ocupadas / effAvail) * 100).toFixed(1))
            : 0;
        wb.taxa_ociosidade_pct =
          effAvail > 0
            ? Number((100 - wb.taxa_ocupacao_pct).toFixed(1))
            : 100;
        wb.potencial_maximo_brl = Number((effAvail * hourlyRate).toFixed(2));
        wb.faturamento_real_brl = Number(wb.faturamento_real_brl.toFixed(2));
      });

      const monthlyHistory: Record<string, any> = {};
      for (let mIdx = 5; mIdx >= 0; mIdx--) {
        const mDate = subMonths(now, mIdx);
        const mKey = format(mDate, "yyyy-MM");
        const mLabel = format(mDate, "MMM/yyyy", { locale: ptBR });
        monthlyHistory[mKey] = {
          mes: mLabel,
          horas_ocupadas: 0,
          gmv_total_brl: 0,
          gmv_avulso_brl: 0,
          gmv_contrato_brl: 0,
          receita_fusion_brl: 0,
        };
      }

      allBookings
        .filter((b: any) => b.room_id === room.id)
        .forEach((b: any) => {
          const mKey = format(parseISO(b.start_time), "yyyy-MM");
          if (monthlyHistory[mKey]) {
            const bm = resolveBookingMetrics(b);
            monthlyHistory[mKey].horas_ocupadas += bm.hours;
            monthlyHistory[mKey].gmv_total_brl = Number(
              (monthlyHistory[mKey].gmv_total_brl + bm.grossBrl).toFixed(2),
            );
            monthlyHistory[mKey].receita_fusion_brl = Number(
              (
                monthlyHistory[mKey].receita_fusion_brl + bm.fusionFeeBrl
              ).toFixed(2),
            );
            if (bm.isContract) {
              monthlyHistory[mKey].gmv_contrato_brl = Number(
                (monthlyHistory[mKey].gmv_contrato_brl + bm.grossBrl).toFixed(
                  2,
                ),
              );
            } else {
              monthlyHistory[mKey].gmv_avulso_brl = Number(
                (monthlyHistory[mKey].gmv_avulso_brl + bm.grossBrl).toFixed(2),
              );
            }
          }
        });

      let availNext20d = 0;
      future20DaysList.forEach((d) => {
        availNext20d += getRoomAvailableHoursForSingleDate(room, d);
      });
      let availNext30d = 0;
      future30DaysList.forEach((d) => {
        availNext30d += getRoomAvailableHoursForSingleDate(room, d);
      });

      const future20Bookings = allBookings.filter((b: any) => {
        const ms = new Date(b.start_time).getTime();
        return (
          b.room_id === room.id &&
          ms >= tomorrowStart.getTime() &&
          ms <= future20End.getTime()
        );
      });

      let bookedNext20d = 0;
      let lockedRevNext20d = 0;
      future20Bookings.forEach((fb: any) => {
        const fm = resolveBookingMetrics(fb);
        bookedNext20d += fm.hours;
        lockedRevNext20d += fm.grossBrl;
      });

      const roomReviews = reviewsData.filter(
        (rv: any) => rv.room_id === room.id,
      );
      const avgRating =
        roomReviews.length > 0
          ? Number(
              (
                roomReviews.reduce(
                  (acc: number, curr: any) => acc + Number(curr.rating || 5),
                  0,
                ) / roomReviews.length
              ).toFixed(1),
            )
          : null;
      const roomFavoritesCount = favoritesData.filter(
        (fv: any) => fv.room_id === room.id,
      ).length;
      const roomLowStockItems = inventoryData
        .filter(
          (inv: any) =>
            inv.room_id === room.id &&
            Number(inv.current_quantity) <= Number(inv.min_quantity),
        )
        .map((inv: any) => ({
          item: inv.name,
          atual: inv.current_quantity,
          minimo: inv.min_quantity,
        }));
      const roomMaintenances = maintenancesData
        .filter((mt: any) => mt.room_id === room.id)
        .map((mt: any) => ({
          titulo: mt.title,
          status: mt.status,
          custo_brl: Number(mt.cost || 0),
        }));
      const roomExpensesTotal = expensesData
        .filter((ex: any) => ex.room_id === room.id)
        .reduce((acc: number, curr: any) => acc + Number(curr.amount || 0), 0);

      const effAvailPeriod = Math.max(roomTotalAvailHours, roomOccupiedHours);
      const roomFreeHours = Math.max(0, effAvailPeriod - roomOccupiedHours);
      const roomOccPct =
        effAvailPeriod > 0
          ? Number(((roomOccupiedHours / effAvailPeriod) * 100).toFixed(1))
          : 0;
      const roomIdlePct = Number((100 - roomOccPct).toFixed(1));
      const roomPotentialRev = Math.max(roomGmv, effAvailPeriod * hourlyRate);
      const roomUncapturedRev = Math.max(0, roomPotentialRev - roomGmv);

      globalGmv += roomGmv;
      globalFusionFee += roomFusionFee;
      globalAvulsoGmv += roomAvulsoGmv;
      globalContractGmv += roomContractGmv;
      globalAvailHours += effAvailPeriod;
      globalOccupiedHours += roomOccupiedHours;

      return {
        sala_id: room.id,
        nome_oficial_sala: room.name,
        clinica_anfitria: hostProfile?.full_name || "Fusion Clinic",
        categoria_tier: normalizeTier(room.tier).toUpperCase(),
        selo_partner_hora_avulsa: Boolean(room.is_partner),
        ativa: Boolean(room.is_active),
        tarifa_referencia_hora_brl: Number(hourlyRate.toFixed(2)),
        desempenho_no_periodo_selecionado: {
          estoque_horas_disponiveis: effAvailPeriod,
          horas_alugadas_total: roomOccupiedHours,
          horas_alugadas_avulso: roomAvulsoHours,
          horas_alugadas_contrato: roomContractHours,
          horas_ociosas_livres: roomFreeHours,
          taxa_ocupacao_pct: roomOccPct,
          taxa_ociosidade_pct: roomIdlePct,
          faturamento_realizado_gmv_brl: Number(roomGmv.toFixed(2)),
          faturamento_avulso_brl: Number(roomAvulsoGmv.toFixed(2)),
          faturamento_contratos_brl: Number(roomContractGmv.toFixed(2)),
          receita_liquida_fusion_brl: Number(roomFusionFee.toFixed(2)),
          repasse_clinica_brl: Number((roomGmv - roomFusionFee).toFixed(2)),
          potencial_maximo_100pct_brl: Number(roomPotentialRev.toFixed(2)),
          gap_receita_ociosa_nao_capturada_brl: Number(
            roomUncapturedRev.toFixed(2),
          ),
        },
        qualidade_e_operacao: {
          nota_media_avaliacoes: avgRating,
          total_avaliacoes: roomReviews.length,
          total_favoritos_medicos: roomFavoritesCount,
          checkins_confirmados: roomCheckinCount,
          multas_atraso_brl: Number(roomPenaltyBrl.toFixed(2)),
          despesas_registradas_brl: Number(roomExpensesTotal.toFixed(2)),
          itens_estoque_baixo: roomLowStockItems,
          manutencoes: roomMaintenances,
        },
        profissionais_que_utilizaram_esta_sala: Array.from(
          roomDoctorsMap.values(),
        ).sort(
          (a, b) => b.gmv_gerado_nesta_sala_brl - a.gmv_gerado_nesta_sala_brl,
        ),
        ociosidade_e_ocupacao_por_dia_da_semana: [
          weekdayBreakdown[1],
          weekdayBreakdown[2],
          weekdayBreakdown[3],
          weekdayBreakdown[4],
          weekdayBreakdown[5],
          weekdayBreakdown[6],
          weekdayBreakdown[0],
        ],
        ocupacao_por_turno: shiftsBreakdown,
        historico_ultimos_6_meses: Object.values(monthlyHistory),
        estoque_futuro_proximos_20_dias: {
          capacidade_total_horas: Math.max(availNext20d, bookedNext20d),
          horas_ja_reservadas: bookedNext20d,
          horas_livres_para_venda: Math.max(0, availNext20d - bookedNext20d),
          receita_ja_garantida_brl: Number(lockedRevNext20d.toFixed(2)),
          potencial_aberto_estoque_livre_brl: Number(
            (Math.max(0, availNext20d - bookedNext20d) * hourlyRate).toFixed(2),
          ),
          capacidade_proximos_30_dias_horas: availNext30d,
        },
      };
    });

    let activeStartCredits = 0;
    let activeVipCredits = 0;
    let activeMasterCredits = 0;
    let creditsExpiring15d = 0;

    const doctorsWithIdleBalance: {
      nome: string;
      especialidade: string;
      saldo_creditos: number;
      tier_predominante: string;
      ja_reservou_no_periodo: boolean;
    }[] = [];

    userWalletMap.forEach((txs, userId) => {
      let userBal = 0;
      let lastTier = "start";
      txs.forEach((tx: any) => {
        const amt = Number(tx.amount || 0);
        if (amt > 0 && tx.expires_at && new Date(tx.expires_at) < now) return;
        userBal += amt;
        if (tx.tier) lastTier = normalizeTier(tx.tier);
        if (
          amt > 0 &&
          tx.expires_at &&
          new Date(tx.expires_at) >= now &&
          new Date(tx.expires_at) <= future15End
        ) {
          creditsExpiring15d += amt;
        }
      });

      if (userBal > 0) {
        if (lastTier === "master") activeMasterCredits += userBal;
        else if (lastTier === "vip") activeVipCredits += userBal;
        else activeStartCredits += userBal;

        const docProfile = profilesMap.get(userId);
        const bookedInPeriod = doctorStatsMap.has(userId);
        doctorsWithIdleBalance.push({
          nome: docProfile?.full_name || "Especialista",
          especialidade: docProfile?.specialty || "Saúde",
          saldo_creditos: userBal,
          tier_predominante: lastTier.toUpperCase(),
          ja_reservou_no_periodo: bookedInPeriod,
        });
      }
    });

    const upsellCandidates = Array.from(doctorStatsMap.values())
      .filter((d: any) => d.horas_avulsas >= 4 && d.horas_contrato === 0)
      .sort((a: any, b: any) => b.horas_avulsas - a.horas_avulsas);

    const globalOccPct =
      globalAvailHours > 0
        ? Number(((globalOccupiedHours / globalAvailHours) * 100).toFixed(1))
        : 0;

    const dossieAuditadoSupabase = {
      catalogo_oficial_entidades_para_validacao_de_nomes: {
        salas_cadastradas: roomsData.map((r: any) => ({
          nome_oficial_exato: r.name,
          categoria: normalizeTier(r.tier).toUpperCase(),
          clinica: profilesMap.get(r.host_id)?.full_name || "Fusion Clinic",
          ativa: Boolean(r.is_active),
        })),
        profissionais_cadastrados: profilesData
          .filter((p: any) => p.role !== "admin")
          .map((p: any) => ({
            nome_oficial_exato: p.full_name || "Sem Nome",
            papel: p.role || "specialist",
            especialidade: p.specialty || "Saúde",
          })),
      },
      metadados_consulta: {
        data_hora_atual_sistema: format(now, "dd/MM/yyyy HH:mm"),
        periodo_analisado_inicio: format(periodStart, "dd/MM/yyyy"),
        periodo_analisado_fim: format(periodEnd, "dd/MM/yyyy"),
        quantidade_dias_no_periodo:
          differenceInDays(periodEnd, periodStart) + 1,
      },
      resumo_executivo_global_no_periodo: {
        gmv_total_brl: Number(globalGmv.toFixed(2)),
        receita_liquida_fusion_total_brl: Number(globalFusionFee.toFixed(2)),
        repasse_total_clinicas_brl: Number(
          (globalGmv - globalFusionFee).toFixed(2),
        ),
        receita_taxas_upgrade_brl: Number(globalUpgradeFeeBrl.toFixed(2)),
        receita_multas_checkout_brl: Number(globalPenaltyBrl.toFixed(2)),
        operacao_horas_avulsas: {
          gmv_avulso_brl: Number(globalAvulsoGmv.toFixed(2)),
          receita_fusion_20pct_brl: Number((globalAvulsoGmv * 0.2).toFixed(2)),
          participacao_no_gmv_pct:
            globalGmv > 0
              ? Number(((globalAvulsoGmv / globalGmv) * 100).toFixed(1))
              : 0,
        },
        operacao_contratos_fixos: {
          gmv_contratos_brl: Number(globalContractGmv.toFixed(2)),
          receita_fusion_contratos_brl: Number(
            (globalFusionFee - globalAvulsoGmv * 0.2).toFixed(2),
          ),
          participacao_no_gmv_pct:
            globalGmv > 0
              ? Number(((globalContractGmv / globalGmv) * 100).toFixed(1))
              : 0,
          total_contratos_vigentes_cadastrados: contractsData.filter(
            (c: any) => c.status === "active",
          ).length,
        },
        capacidade_e_ociosidade_global: {
          estoque_total_horas_disponiveis: globalAvailHours,
          horas_totais_ocupadas: globalOccupiedHours,
          horas_totais_ociosas: Math.max(
            0,
            globalAvailHours - globalOccupiedHours,
          ),
          taxa_ocupacao_global_pct: globalOccPct,
          taxa_ociosidade_global_pct: Number((100 - globalOccPct).toFixed(1)),
        },
      },
      salas_detalhadas: roomsDetailedDossier,
      contratos_cadastrados_e_inadimplencia: contractsData.map((c: any) => {
        const isPaidThisMonth = c.last_paid_competence === currentCompetence;
        const isOverdue =
          c.status === "active" &&
          !isPaidThisMonth &&
          now.getDate() > Number(c.due_day || 8);
        return {
          id: c.id,
          sala: roomsMap.get(c.room_id)?.name || "Sala",
          locatario: c.specialist_name,
          modalidade: c.contract_type,
          status: c.status,
          inicio: c.start_date,
          fim: c.end_date,
          dia_vencimento: c.due_day,
          pago_no_mes_atual: isPaidThisMonth,
          em_atraso_no_mes_atual: isOverdue,
          valor_contrato_brl: Number(c.contract_value || 0),
          valor_sessao_diaria_brl: Number(c.session_value || 0),
          split_fusion_pct: Number(c.platform_fee_pct ?? 15),
          split_anfitriao_pct: Number(c.host_split_pct ?? 85),
          co_anfitriao_sublocacao: Boolean(c.allow_sublease),
          faixas_escalonadas: c.schedule_config?.pricingTiers || [],
        };
      }),
      inteligencia_comercial_e_carteira: {
        creditos_ativos_em_circulacao: {
          start_cr: activeStartCredits,
          vip_cr: activeVipCredits,
          master_cr: activeMasterCredits,
          total_cr: activeStartCredits + activeVipCredits + activeMasterCredits,
          creditos_expirando_proximos_15_dias: creditsExpiring15d,
        },
        candidatos_upsell_para_contrato_fixo: upsellCandidates,
        profissionais_com_saldo_em_carteira: doctorsWithIdleBalance,
        assinaturas_recorrentes_ativas: subscriptionsData.filter(
          (s: any) => s.status === "active" || s.status === "ACTIVE",
        ).length,
      },
      ranking_profissionais_no_periodo: Array.from(
        doctorStatsMap.values(),
      ).sort((a: any, b: any) => b.gmv_gerado_brl - a.gmv_gerado_brl),
      demanda_por_especialidade: Array.from(specialtyStatsMap.entries())
        .map(([especialidade, dados]) => ({
          especialidade,
          reservas: dados.reservas,
          horas: dados.horas,
          gmv_brl: Number(dados.gmv_brl.toFixed(2)),
        }))
        .sort((a, b) => b.gmv_brl - a.gmv_brl),
      marketing_cupons: couponsData.map((cp: any) => ({
        codigo: cp.code,
        tipo: cp.type,
        valor_desconto: Number(cp.discount_value || 0),
        usos_atuais: Number(cp.current_uses || 0),
        limite_usos: cp.max_uses,
        ativo: Boolean(cp.is_active),
      })),
    };

    const systemInstructionText = `Você é o "Fusion Intelligence", o Cientista de Dados Chefe e Super Agente Executivo de Business Intelligence (BI), Finanças e Yield Management da plataforma Fusion Clinic.
Você responde diretamente à Diretoria / Gestora Administrativa da plataforma.

================================================================================
REGRA #1 — VALIDAÇÃO E DESAMBIGUAÇÃO DE NOMES DE SALAS E PROFISSIONAIS
================================================================================
Sempre que a gestora mencionar o nome de uma sala ou profissional (ex: "sala 3", "sala 03", "consultório 2"):
1. Verifique em "catalogo_oficial_entidades_para_validacao_de_nomes.salas_cadastradas" se o nome digitado corresponde EXATAMENTE ao campo "nome_oficial_exato" (ignorando maiúsculas/minúsculas).
2. Se o nome for abreviado, incompleto ou diferente do oficial:
   - Avise imediatamente: "⚠️ Não encontrei nenhuma sala cadastrada exatamente com o nome **'[nome digitado]'**."
   - Liste as salas oficiais disponíveis no sistema.
   - Adicione no final da resposta as tags de botões clicáveis usando:
     [[PERGUNTAR: Sua pergunta original substituindo pelo nome_oficial_exato]]

================================================================================
REGRA #2 — MOTOR CIENTÍFICO DE GRÁFICOS INTERATIVOS (QUANDO PEDIR GRÁFICO OU COMPARATIVO)
================================================================================
Sempre que a gestora pedir um gráfico, visualização, evolução, comparativo entre salas/dias/turnos ou análise de BI, você DEVE incluir na resposta um bloco de código \`\`\`chart contendo um JSON válido e rigoroso (sem comentários dentro do JSON).
O frontend vai transformar esse bloco \`\`\`chart em um Gráfico Interativo Recharts!

ESCOLHA O TIPO DE GRÁFICO ("type") COMO UM CIENTISTA DE DADOS:
- "bar": Para comparar salas (Faturamento Real vs Potencial, Ocupação vs Ociosidade), dias da semana (Seg a Dom) ou turnos.
- "area" ou "line": Para séries temporais e evolução mensal (últimos 3 a 6 meses).
- "pie": Para distribuição percentual / Share (Avulso vs Contrato, Demanda por Especialidade, Créditos por Tier).

FORMATO EXATO E OBRIGATÓRIO DO BLOCO \`\`\`chart:
\`\`\`chart
{
  "type": "bar",
  "title": "Título Executivo do Gráfico",
  "subtitle": "Subtítulo explicativo com o período auditado",
  "xKey": "nome",
  "valuePrefix": "R$ ",
  "valueSuffix": "",
  "series": [
    { "key": "faturamento", "label": "Faturamento Realizado", "color": "#BF4B24" },
    { "key": "potencial", "label": "Potencial Máximo (100%)", "color": "#0f172a" }
  ],
  "data": [
    { "nome": "Sala Fusion 01", "faturamento": 1250.5, "potencial": 4500.0 },
    { "nome": "Sala Fusion 03", "faturamento": 980.0, "potencial": 3800.0 }
  ]
}
\`\`\`
Regras do JSON do gráfico:
- Os valores numéricos dentro de "data" DEVEM ser números puros (ex: 1250.50 e NÃO "R$ 1.250,50"), pois o gráfico precisa de números para desenhar as barras/linhas.
- Use "valuePrefix": "R$ " quando os números forem dinheiro, ou "valueSuffix": "%" quando forem porcentagens, ou "valueSuffix": "h" quando forem horas.
- Para gráficos "pie", use apenas 1 item dentro de "series" (ex: \`{ "key": "valor", "label": "Participação", "color": "#BF4B24" }\`).

================================================================================
REGRA #3 — TABELAS EXECUTIVAS + FIDELIDADE CONTÁBIL (ZERO ALUCINAÇÃO)
================================================================================
1. NUNCA invente números. Use EXCLUSIVAMENTE os dados de "dossieAuditadoSupabase".
2. Sempre acompanhe análises e gráficos com uma TABELA EM FORMATO MARKDOWN PADRÃO (usando | Coluna 1 | Coluna 2 |) contendo os indicadores completos para auditoria e exportação em Excel/CSV.
3. Formate valores no texto e nas tabelas Markdown no padrão brasileiro (R$ 1.234,56) e porcentagens com 1 casa decimal (82,5%).
4. Ao final, traga um bloco "💡 Diagnóstico do Cientista de Dados & Plano de Ação" com insights acionáveis.

DOSSIÊ AUDITADO DO SUPABASE EM TEMPO REAL:
${JSON.stringify(dossieAuditadoSupabase)}`;

    const contentsPayload = [
      ...history.slice(-4).map((msg: any) => ({
        role: msg.role === "assistant" ? "model" : "user",
        parts: [{ text: String(msg.content || "") }],
      })),
      {
        role: "user",
        parts: [{ text: question }],
      },
    ];

    const primaryModel = "gemini-3.8-flash";
    let aiAnswer = "";
    let lastApiError = "";

    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${primaryModel}:generateContent?key=${apiKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              systemInstruction: {
                parts: [{ text: systemInstructionText }],
              },
              contents: contentsPayload,
              generationConfig: {
                temperature: 0.1,
                topP: 0.9,
                maxOutputTokens: 4096,
              },
            }),
          },
        );

        const data = await response.json();

        if (response.ok && data?.candidates?.[0]?.content?.parts?.[0]?.text) {
          aiAnswer = data.candidates[0].content.parts[0].text;
          break;
        }

        if (
          (response.status === 429 || response.status === 503) &&
          attempt < 3
        ) {
          await sleep(2500 * attempt);
          continue;
        }

        lastApiError =
          data?.error?.message ||
          `Status ${response.status} em ${primaryModel}`;
        break;
      } catch (err: any) {
        lastApiError = err.message;
        if (attempt < 3) {
          await sleep(2000);
        }
      }
    }

    if (!aiAnswer) {
      return NextResponse.json(
        {
          error: `Falha ao consultar o Google AI Studio: ${lastApiError}`,
        },
        { status: 502 },
      );
    }

    return NextResponse.json({
      answer: aiAnswer,
      model: primaryModel,
      metadata: {
        periodStart: format(periodStart, "dd/MM/yyyy"),
        periodEnd: format(periodEnd, "dd/MM/yyyy"),
        roomsAnalyzed: roomsData.length,
        bookingsAnalyzed: periodBookings.length,
      },
    });
  } catch (error: any) {
    console.error("Erro no Agente RAG Admin:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno ao processar análise de IA." },
      { status: 500 },
    );
  }
}