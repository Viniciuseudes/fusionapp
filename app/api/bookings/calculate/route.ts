// app/api/bookings/calculate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } },
);

/**
 * Verifica se um intervalo [slotStart, slotEnd] conflita com as regras de horário
 * de um contrato ativo/pendente da sala (suporta scheduleRules por dia, day_hours e legado).
 */
function doesSlotConflictWithContract(
  slotStart: Date,
  slotEnd: Date,
  contract: any,
): boolean {
  if (!contract) return false;
  if (contract.status === "cancelled" || contract.status === "expired") {
    return false;
  }

  // Contratos de Coanfitrião (monthly_exclusive com allow_sublease = true)
  // não bloqueiam a sala inteira, pois eles próprios abrem a agenda para sublocação.
  if (
    contract.contract_type === "monthly_exclusive" &&
    contract.allow_sublease === true
  ) {
    return false;
  }

  // Formata data em YYYY-MM-DD respeitando o fuso local do slot
  const yyyy = slotStart.getFullYear();
  const mm = String(slotStart.getMonth() + 1).padStart(2, "0");
  const dd = String(slotStart.getDate()).padStart(2, "0");
  const slotDateIso = `${yyyy}-${mm}-${dd}`;

  const startDateIso = contract.start_date
    ? String(contract.start_date).slice(0, 10)
    : null;
  const endDateIso = contract.end_date
    ? String(contract.end_date).slice(0, 10)
    : null;

  if (startDateIso && slotDateIso < startDateIso) return false;
  if (endDateIso && slotDateIso > endDateIso) return false;

  // Sala Fixa Exclusiva (sem sublocação) bloqueia 100% dos horários durante a vigência
  if (
    contract.contract_type === "monthly_exclusive" &&
    !contract.allow_sublease
  ) {
    return true;
  }

  let sched = contract.schedule_config;
  if (typeof sched === "string") {
    try {
      sched = JSON.parse(sched);
    } catch {
      sched = {};
    }
  }
  if (!sched || typeof sched !== "object") return false;

  const dow = slotStart.getDay();
  const slotStartHour = slotStart.getHours();
  const rawEndHour = slotEnd.getHours();
  const slotEndHour =
    rawEndHour > slotStartHour ? rawEndHour : slotStartHour + 1;

  // 1. Verifica scheduleRules (múltiplas janelas independentes por dia da semana)
  if (Array.isArray(sched.scheduleRules) && sched.scheduleRules.length > 0) {
    return sched.scheduleRules.some((rule: any) => {
      if (Number(rule.dayOfWeek) !== dow) return false;
      const rStart = Number(rule.startHour ?? 8);
      const rEnd = Number(rule.endHour ?? 20);
      return slotStartHour < rEnd && slotEndHour > rStart;
    });
  }

  // 2. Verifica mapa day_hours (ex: { "1": [8, 9, 10, 11], "2": [13, 14, 15, 16, 17] })
  if (sched.day_hours && typeof sched.day_hours === "object") {
    const dayHrs = sched.day_hours[String(dow)];
    if (Array.isArray(dayHrs) && dayHrs.length > 0) {
      const normalizedHrs = dayHrs.map(Number);
      for (let h = slotStartHour; h < slotEndHour; h++) {
        if (normalizedHrs.includes(h)) return true;
      }
      return false;
    }
  }

  // 3. Fallback legado: daysOfWeek + startHour / endHour
  const legacyDays = Array.isArray(sched.daysOfWeek)
    ? sched.daysOfWeek.map(Number)
    : [];
  if (legacyDays.includes(dow)) {
    const sH = Number(sched.startHour ?? 8);
    const eH = Number(sched.endHour ?? 20);
    return slotStartHour < eH && slotEndHour > sH;
  }

  return false;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json(
        { error: "roomId é obrigatório." },
        { status: 400 },
      );
    }

    const [bookingsRes, contractsRes] = await Promise.all([
      supabaseAdmin
        .from("bookings")
        .select(
          "id, start_time, end_time, status, created_at, asaas_payment_id, user_id, contract_id, booking_origin",
        )
        .eq("room_id", roomId)
        .neq("status", "cancelled"),
      supabaseAdmin
        .from("room_contracts")
        .select(
          "id, room_id, specialist_id, specialist_name, contract_type, status, start_date, end_date, allow_sublease, schedule_config",
        )
        .eq("room_id", roomId)
        .in("status", ["active", "pending_signature"]),
    ]);

    if (bookingsRes.error) throw bookingsRes.error;

    return NextResponse.json({
      bookings: bookingsRes.data || [],
      contracts: contractsRes.data || [],
    });
  } catch (error: any) {
    console.error("Erro ao listar reservas e contratos da sala:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const { roomId, startTime, endTime, slots, lockIds } = body;

    if (!roomId || !startTime || !endTime) {
      return NextResponse.json(
        { error: "Dados incompletos para o cálculo." },
        { status: 400 },
      );
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours =
      Array.isArray(slots) && slots.length > 0
        ? slots.length
        : (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    if (durationHours <= 0) {
      return NextResponse.json(
        { error: "O horário de término deve ser posterior ao início." },
        { status: 400 },
      );
    }

    const slotsToCheck: Array<{ startTime: string; endTime: string }> =
      Array.isArray(slots) && slots.length > 0
        ? slots
        : [{ startTime: start.toISOString(), endTime: end.toISOString() }];

    const nowMs = Date.now();
    const excludeIds: string[] = Array.isArray(lockIds) ? lockIds : [];

    // Busca contratos ativos/pendentes da sala para validar conflito direto
    const { data: activeContracts } = await supabaseAdmin
      .from("room_contracts")
      .select(
        "id, room_id, contract_type, status, start_date, end_date, allow_sublease, schedule_config",
      )
      .eq("room_id", roomId)
      .in("status", ["active", "pending_signature"]);

    for (const s of slotsToCheck) {
      const slotStartObj = new Date(s.startTime);
      const slotEndObj = new Date(s.endTime);

      // 1. Verifica conflito direto com Contratos Fixos da sala
      const hasContractConflict = (activeContracts || []).some((c) =>
        doesSlotConflictWithContract(slotStartObj, slotEndObj, c),
      );

      if (hasContractConflict) {
        return NextResponse.json(
          {
            error:
              "Um dos horários selecionados faz parte de um contrato fixo desta sala e já está ocupado.",
          },
          { status: 409 },
        );
      }

      // 2. Verifica conflito na tabela bookings
      const { data: conflicts } = await supabaseAdmin
        .from("bookings")
        .select(
          "id, status, user_id, created_at, asaas_payment_id, contract_id, booking_origin",
        )
        .eq("room_id", roomId)
        .neq("status", "cancelled")
        .lt("start_time", s.endTime)
        .gt("end_time", s.startTime);

      const hasConflict = (conflicts || []).some((b) => {
        if (excludeIds.includes(b.id)) return false;

        // Qualquer reserva originada de contrato fixo bloqueia permanentemente
        if (
          b.contract_id ||
          (b.booking_origin && String(b.booking_origin).startsWith("contract"))
        ) {
          return true;
        }

        if (
          ["confirmed", "in_progress", "completed"].includes(b.status || "")
        ) {
          return true;
        }

        if (b.status === "pending_payment" || b.status === "pending") {
          if (b.user_id === user.id) return false;

          const lockTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          const maxLockMs = b.asaas_payment_id
            ? 30 * 60 * 1000
            : 6 * 60 * 1000;
          return nowMs - lockTime <= maxLockMs;
        }

        return false;
      });

      if (hasConflict) {
        return NextResponse.json(
          {
            error:
              "Um dos horários selecionados já está ocupado por outro profissional.",
          },
          { status: 409 },
        );
      }
    }

    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .select("id, name, tier")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json(
        { error: "Sala não encontrada." },
        { status: 404 },
      );
    }

    const roomTier = room.tier || "start";

    const { data: transactions } = await supabaseAdmin
      .from("wallet_transactions")
      .select("amount, type, tier, expires_at")
      .eq("user_id", user.id);

    let startBal = 0,
      vipBal = 0,
      masterBal = 0;
    const now = new Date();

    transactions?.forEach((tx) => {
      if (tx.amount > 0 && tx.expires_at && new Date(tx.expires_at) < now)
        return;
      const amt = Number(tx.amount);
      if (tx.tier === "master") masterBal += amt;
      else if (tx.tier === "vip") vipBal += amt;
      else startBal += amt;
    });

    let availableCredits = 0;
    if (roomTier === "master") {
      availableCredits = masterBal;
    } else if (roomTier === "vip") {
      availableCredits = vipBal + masterBal;
    } else {
      availableCredits = startBal + vipBal + masterBal;
    }

    const creditsRequired = durationHours;
    const hasEnoughCredits = availableCredits >= creditsRequired;

    return NextResponse.json({
      durationHours,
      creditsRequired,
      upgradeFeeBRL: 0,
      hasEnoughCredits,
      currentBalance: availableCredits,
      canProceed: true,
      roomTier,
    });
  } catch (error) {
    console.error("Erro ao calcular checkout:", error);
    return NextResponse.json(
      { error: "Erro interno no servidor." },
      { status: 500 },
    );
  }
}

/**
 * PUT: Permite ao painel de Contratos sincronizar os bloqueios na tabela `bookings`
 * usando `supabaseAdmin` (Service Role), evitando falhas de RLS ao alocar horários para especialistas.
 */
export async function PUT(request: Request) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const { contractId, deleteFromIso, bookingsPayload } = body;

    if (!contractId) {
      return NextResponse.json(
        { error: "contractId é obrigatório." },
        { status: 400 },
      );
    }

    let delQuery = supabaseAdmin
      .from("bookings")
      .delete()
      .eq("contract_id", contractId);

    if (deleteFromIso) {
      delQuery = delQuery.gte("start_time", deleteFromIso);
    }
    await delQuery;

    let insertedCount = 0;
    if (Array.isArray(bookingsPayload) && bookingsPayload.length > 0) {
      for (let i = 0; i < bookingsPayload.length; i += 100) {
        const chunk = bookingsPayload.slice(i, i + 100);
        const { error: insErr } = await supabaseAdmin
          .from("bookings")
          .insert(chunk);
        if (!insErr) {
          insertedCount += chunk.length;
        } else {
          console.error("Erro ao inserir lote de reservas do contrato:", insErr);
        }
      }
    }

    return NextResponse.json({
      success: true,
      insertedCount,
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}