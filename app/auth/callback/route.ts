import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// ==========================================
// A MÁGICA DE INFRAESTRUTURA AQUI:
// Impede o Next.js de fazer cache desta rota em produção (Vercel)
// Isso resolve o bug de ter que logar 2x com o Google!
// ==========================================
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    
    // Troca o código pela sessão e GARANTE que os cookies sejam gravados
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Deu certo! Redireciona o usuário para o destino
      return NextResponse.redirect(`${requestUrl.origin}${next}`);
    }
  }

  // Se o código for inválido ou expirar, manda de volta pro login
  return NextResponse.redirect(`${requestUrl.origin}/login?error=GoogleAuthFailed`);
}