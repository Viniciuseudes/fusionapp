import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import webpush from "web-push";

// Configura as chaves VAPID do Web Push
webpush.setVapidDetails(
  "mailto:suporte@fusionclinic.com.br", // Coloque seu e-mail
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    // 1. Blindagem de Segurança (Apenas Admins podem disparar campanhas)
    if (authError || !user) return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    
    const { data: adminCheck } = await supabase.from('profiles').select('role').eq('id', user.id).single();
    if (adminCheck?.role !== 'admin') {
      return NextResponse.json({ error: "Apenas administradores podem enviar campanhas." }, { status: 403 });
    }

    const { title, message, url, filterType, filterValue } = await request.json();

    // 2. Monta a Query Dinâmica no Supabase
    let query = supabase
      .from('profiles')
      .select('id, full_name, push_subscription')
      .not('push_subscription', 'is', null); // Pega apenas quem aceitou notificações

    // Aplica os filtros de segmentação (O segredo do iFood/Uber!)
    if (filterType === 'specialty' && filterValue) {
      query = query.ilike('specialty', `%${filterValue}%`);
    } else if (filterType === 'city' && filterValue) {
      query = query.ilike('address_city', `%${filterValue}%`);
    }

    const { data: profiles, error: dbError } = await query;

    if (dbError) throw dbError;
    if (!profiles || profiles.length === 0) {
      return NextResponse.json({ message: "Nenhum usuário encontrado com esses filtros.", count: 0 });
    }

    // 3. O Payload (Conteúdo) da Notificação
    const payload = JSON.stringify({
      title: title,
      body: message,
      url: url || "/dashboard"
    });

    let successCount = 0;
    let failCount = 0;

    // 4. Disparo Paralelo de Alta Performance (Promise.allSettled)
    const pushPromises = profiles.map(async (profile) => {
      try {
        await webpush.sendNotification(profile.push_subscription as any, payload);
        successCount++;
      } catch (err: any) {
        failCount++;
        // Lógica Sênior: Se o erro for 410 (Gone), o usuário desinstalou o app ou revogou a permissão.
        // Limpamos o banco para não mandar lixo na próxima vez.
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from('profiles').update({ push_subscription: null }).eq('id', profile.id);
        }
      }
    });

    await Promise.allSettled(pushPromises);

    return NextResponse.json({ 
      message: `Campanha disparada com sucesso!`,
      success: successCount,
      failed: failCount 
    });

  } catch (error: any) {
    console.error("Erro na campanha push:", error);
    return NextResponse.json({ error: "Erro interno no servidor." }, { status: 500 });
  }
}