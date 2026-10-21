// app/api/bookings/calculate/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const supabaseAdmin = createAdminClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false } }
);

// GET: Retorna todos os horários ocupados da sala (Bypass de RLS para o RoomDetail)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const roomId = searchParams.get("roomId");

    if (!roomId) {
      return NextResponse.json({ error: "roomId é obrigatório." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("bookings")
      .select("id, start_time, end_time, status, created_at, asaas_payment_id, user_id")
      .eq("room_id", roomId)
      .neq("status", "cancelled");

    if (error) throw error;

    return NextResponse.json({ bookings: data || [] });
  } catch (error: any) {
    console.error("Erro ao listar reservas da sala:", error);
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
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const { roomId, startTime, endTime, slots, lockIds } = body;

    if (!roomId || !startTime || !endTime) {
      return NextResponse.json({ error: "Dados incompletos para o cálculo." }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = Array.isArray(slots) && slots.length > 0
      ? slots.length
      : (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    if (durationHours <= 0) {
      return NextResponse.json(
        { error: "O horário de término deve ser posterior ao início." },
        { status: 400 }
      );
    }

    // 1. Verifica conflito de horário para cada slot selecionado (usando Admin Client)
    const slotsToCheck: Array<{ startTime: string; endTime: string }> =
      Array.isArray(slots) && slots.length > 0
        ? slots
        : [{ startTime: start.toISOString(), endTime: end.toISOString() }];

    const nowMs = Date.now();
    const excludeIds: string[] = Array.isArray(lockIds) ? lockIds : [];

    for (const s of slotsToCheck) {
      const { data: conflicts } = await supabaseAdmin
        .from("bookings")
        .select("id, status, user_id, created_at, asaas_payment_id")
        .eq("room_id", roomId)
        .neq("status", "cancelled")
        .lt("start_time", s.endTime)
        .gt("end_time", s.startTime);

      const hasConflict = (conflicts || []).some((b) => {
        if (excludeIds.includes(b.id)) return false;

        if (["confirmed", "in_progress", "completed"].includes(b.status || "")) {
          return true;
        }

        if (b.status === "pending_payment" || b.status === "pending") {
          if (b.user_id === user.id) return false;
          const lockTime = b.created_at ? new Date(b.created_at).getTime() : 0;
          const maxLockMs = b.asaas_payment_id ? 30 * 60 * 1000 : 6 * 60 * 1000;
          return nowMs - lockTime <= maxLockMs;
        }

        return false;
      });

      if (hasConflict) {
        return NextResponse.json(
          { error: "Um dos horários selecionados já está ocupado por outro profissional." },
          { status: 409 }
        );
      }
    }

    // 2. Busca a sala e seu Tier
    const { data: room, error: roomError } = await supabaseAdmin
      .from("rooms")
      .select("id, name, tier")
      .eq("id", roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: "Sala não encontrada." }, { status: 404 });
    }

    const roomTier = room.tier || "start";

    // 3. Consulta a carteira do usuário (apenas créditos válidos)
    const { data: transactions } = await supabaseAdmin
      .from("wallet_transactions")
      .select("amount, type, tier, expires_at")
      .eq("user_id", user.id);

    let startBal = 0,
      vipBal = 0,
      masterBal = 0;
    const now = new Date();

    transactions?.forEach((tx) => {
      if (tx.amount > 0 && tx.expires_at && new Date(tx.expires_at) < now) return;

      const amt = Number(tx.amount);
      if (tx.tier === "master") masterBal += amt;
      else if (tx.tier === "vip") vipBal += amt;
      else startBal += amt;
    });

    // 4. Lógica de Cascata de Tiers
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
      canProceed: hasEnoughCredits,
      roomTier,
    });
  } catch (error) {
    console.error("Erro ao calcular checkout:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}