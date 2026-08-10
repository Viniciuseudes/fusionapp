import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import webpush from 'web-push';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // Usa a role secreta
const supabase = createClient(supabaseUrl, supabaseKey);

webpush.setVapidDetails(
  'mailto:tecnologia@fusionclinic.com.br',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function POST(req: Request) {
  try {
    const { userId, title, body, url } = await req.json();

    if (!userId || !title || !body) {
      return NextResponse.json({ error: "Faltam parâmetros" }, { status: 400 });
    }

    // 1. Pega a inscrição (subscription) do usuário no banco
    const { data: profile, error } = await supabase
      .from('profiles')
      .select('push_subscription')
      .eq('id', userId)
      .single();

    if (error || !profile?.push_subscription) {
      // O usuário não tem notificação ativa, apenas ignoramos em silêncio
      return NextResponse.json({ success: true, message: "Usuário não inscrito" }, { status: 200 });
    }

    // 2. Monta o Payload da Notificação
    const pushPayload = JSON.stringify({
      title: title,
      body: body,
      url: url || '/dashboard'
    });

    // 3. Dispara para o celular da pessoa via Google/Apple
    await webpush.sendNotification(profile.push_subscription, pushPayload);

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error: any) {
    console.error("Erro ao enviar Push:", error);
    // Se der erro 410 (Gone), significa que a pessoa desinstalou o PWA, deveríamos limpar o banco.
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}