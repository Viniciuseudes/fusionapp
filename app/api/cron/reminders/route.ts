import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(request: Request) {
  try {
    const now = new Date();
    
    // ===================================================================
    // 1. AVISO DE CHECK-IN (Faltam 15 minutos ou menos para a consulta)
    // ===================================================================
    const fifteenMinsFromNow = new Date(now.getTime() + 15 * 60000).toISOString();
    
    const { data: checkinBookings } = await supabase
      .from('bookings')
      .select('id, user_id, start_time, rooms(name)')
      .eq('status', 'confirmed')
      .eq('notified_checkin', false)
      .lte('start_time', fifteenMinsFromNow)
      .gte('start_time', now.toISOString()); // Garante que não passou da hora

    if (checkinBookings && checkinBookings.length > 0) {
      for (const booking of checkinBookings) {
        
        const roomData = booking.rooms as any;
        const roomName = Array.isArray(roomData) ? roomData[0]?.name : roomData?.name;

        // Envia o Push
        await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://fusionapp-chi.vercel.app'}/api/push`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: booking.user_id,
            title: "Sua sala está liberada! 🔓",
            body: `Faltam menos de 15 minutos para sua sessão na ${roomName}. Faça seu check-in!`,
            url: "/dashboard"
          })
        }).catch(err => console.error(err));

        // Atualiza a flag
        await supabase.from('bookings').update({ notified_checkin: true }).eq('id', booking.id);
      }
    }

    // ===================================================================
    // 2. AVISOS DE CHECK-OUT (Durante a sessão ativa)
    // ===================================================================
    // Puxa as reservas ativas que ainda precisam receber UM dos dois avisos
    const { data: activeBookings } = await supabase
      .from('bookings')
      .select('id, user_id, checkin_time, start_time, rooms(name), notified_checkout_45min, notified_checkout_warning')
      .eq('status', 'in_progress')
      .or('notified_checkout_45min.eq.false,notified_checkout_warning.eq.false');

    if (activeBookings && activeBookings.length > 0) {
      for (const booking of activeBookings) {
        
        const roomData = booking.rooms as any;
        const roomName = Array.isArray(roomData) ? roomData[0]?.name : roomData?.name;

        const referenceTime = new Date(booking.checkin_time || booking.start_time).getTime();
        const diffMinutes = (now.getTime() - referenceTime) / 60000;

        // AVISO 1: Aos 45 minutos (Faltam 5 min para a saída ideal)
        if (diffMinutes >= 45 && !booking.notified_checkout_45min) {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://fusionapp-chi.vercel.app'}/api/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: booking.user_id,
              title: "Prepare-se para o Check-out ⏳",
              body: `Faltam 5 minutos para concluir sua sessão na ${roomName}. Comece a se organizar!`,
              url: "/dashboard"
            })
          }).catch(err => console.error(err));

          await supabase.from('bookings').update({ notified_checkout_45min: true }).eq('id', booking.id);
        }

        // AVISO 2: Aos 50 minutos (Tolerância / Risco de Multa)
        if (diffMinutes >= 50 && !booking.notified_checkout_warning) {
          await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || 'https://fusionapp-chi.vercel.app'}/api/push`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              userId: booking.user_id,
              title: "Atenção: Tempo Esgotado! ⚠️",
              body: `Você entrou nos 5 minutos de tolerância na ${roomName}. Faça o check-out agora para evitar multas.`,
              url: "/dashboard"
            })
          }).catch(err => console.error(err));

          await supabase.from('bookings').update({ notified_checkout_warning: true }).eq('id', booking.id);
        }
      }
    }

    return NextResponse.json({ success: true, message: "Varredura do Cron finalizada" });
  } catch (error: any) {
    console.error("Erro no Cron Job:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}