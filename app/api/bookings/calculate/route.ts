import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: 'Usuário não autenticado.' }, { status: 401 });
    }

    const body = await request.json();
    const { roomId, startTime, endTime } = body;

    if (!roomId || !startTime || !endTime) {
      return NextResponse.json({ error: 'Dados incompletos para o cálculo.' }, { status: 400 });
    }

    const start = new Date(startTime);
    const end = new Date(endTime);
    const durationHours = (end.getTime() - start.getTime()) / (1000 * 60 * 60);

    if (durationHours <= 0) {
      return NextResponse.json({ error: 'O horário de término deve ser posterior ao início.' }, { status: 400 });
    }

    // 1. Busca a sala e seu Tier
    const { data: room, error: roomError } = await supabase
      .from('rooms')
      .select('id, name, tier')
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Sala não encontrada.' }, { status: 404 });
    }

    const roomTier = room.tier || 'start';

    // 2. Consulta a carteira do usuário (apenas créditos válidos)
    const { data: transactions } = await supabase
      .from('wallet_transactions')
      .select('amount, type, tier, expires_at')
      .eq('user_id', user.id);

    let startBal = 0, vipBal = 0, masterBal = 0;
    const now = new Date();
    
    transactions?.forEach(tx => {
      // Ignora créditos que já expiraram
      if (tx.amount > 0 && tx.expires_at && new Date(tx.expires_at) < now) return;

      const amt = Number(tx.amount);
      if (tx.tier === 'master') masterBal += amt;
      else if (tx.tier === 'vip') vipBal += amt;
      else startBal += amt; // Default é start/basic
    });

    // 3. Lógica de Cascata de Tiers
    let availableCredits = 0;
    if (roomTier === 'master') {
      availableCredits = masterBal; // Sala Master exige crédito Master
    } else if (roomTier === 'vip') {
      availableCredits = vipBal + masterBal; // Sala VIP aceita VIP e Master
    } else {
      availableCredits = startBal + vipBal + masterBal; // Sala Basic aceita qualquer crédito
    }

    const creditsRequired = durationHours; // 1 Crédito = 1 Hora
    const hasEnoughCredits = availableCredits >= creditsRequired;

    return NextResponse.json({
      durationHours,
      creditsRequired,
      upgradeFeeBRL: 0,
      hasEnoughCredits,
      currentBalance: availableCredits, // Saldo utilizável para ESTA sala específica
      canProceed: hasEnoughCredits,
      roomTier
    });

  } catch (error) {
    console.error('Erro ao calcular checkout:', error);
    return NextResponse.json({ error: 'Erro interno no servidor.' }, { status: 500 });
  }
}