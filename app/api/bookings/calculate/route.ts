import { NextResponse } from 'next/server';
import { createClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  try {
    const supabase = createClient();
    
    const { data: { user }, error: authError } = await (await supabase).auth.getUser();

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
    const durationMs = end.getTime() - start.getTime();
    const durationHours = durationMs / (1000 * 60 * 60);

    if (durationHours <= 0) {
      return NextResponse.json({ error: 'O horário de término deve ser posterior ao início.' }, { status: 400 });
    }

    // 4. Buscar a sala e as categorias
    const { data: room, error: roomError } = await (await supabase)
      .from('rooms')
      .select(`
        id,
        name,
        room_categories (
          credit_cost_per_hour,
          upgrade_fee_per_hour
        )
      `)
      .eq('id', roomId)
      .single();

    if (roomError || !room) {
      return NextResponse.json({ error: 'Sala não encontrada no banco de dados.' }, { status: 404 });
    }

    // CORREÇÃO: Valores padrão (fallback) caso a sala não tenha categoria vinculada
    let creditCostPerHour = 1; 
    let upgradeFeePerHour = 0;

    // Se existir categoria, usamos os valores do banco
    if (room.room_categories) {
      const category = Array.isArray(room.room_categories) 
        ? room.room_categories[0] 
        : room.room_categories;
      
      creditCostPerHour = Number(category?.credit_cost_per_hour || 1);
      upgradeFeePerHour = Number(category?.upgrade_fee_per_hour || 0);
    }

    const totalCreditsRequired = durationHours * creditCostPerHour;
    const totalUpgradeFeeBRL = durationHours * upgradeFeePerHour;

    const { data: transactions, error: walletError } = await (await supabase)
      .from('wallet_transactions')
      .select('amount, type')
      .eq('user_id', user.id); 

    if (walletError) {
      return NextResponse.json({ error: 'Erro ao consultar a carteira do usuário.' }, { status: 500 });
    }

    let currentBalance = 0;
    transactions?.forEach(tx => {
      if (tx.type === 'credit' || tx.type === 'deposit') {
        currentBalance += Number(tx.amount);
      } else if (tx.type === 'debit' || tx.type === 'usage') {
        currentBalance -= Number(tx.amount);
      }
    });

    const hasEnoughCredits = currentBalance >= totalCreditsRequired;

    return NextResponse.json({
      durationHours,
      creditsRequired: totalCreditsRequired,
      upgradeFeeBRL: totalUpgradeFeeBRL,
      hasEnoughCredits,
      currentBalance,
      canProceed: hasEnoughCredits, 
    });

  } catch (error) {
    console.error('Erro ao calcular checkout:', error);
    return NextResponse.json({ error: 'Erro interno no servidor.' }, { status: 500 });
  }
}