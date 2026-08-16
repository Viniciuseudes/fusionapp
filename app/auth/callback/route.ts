import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function GET(request: Request) {
  // Pega a URL completa que o Google nos devolveu
  const { searchParams, origin } = new URL(request.url);
  
  // Extrai o código de autorização do Google
  const code = searchParams.get("code");
  
  // Define para onde o usuário vai depois do login (Padrão: Dashboard)
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    
    // A MÁGICA ACONTECE AQUI: Troca o código do Google por uma Sessão do Supabase
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // Deu certo! Redireciona o usuário para o Dashboard.
      // Chegando no Dashboard, nosso Guardião vai ver se ele precisa ir pro Onboarding!
      return NextResponse.redirect(`${origin}${next}`);
    }
  }

  // Se o código for inválido ou expirar, manda de volta pro login com erro
  return NextResponse.redirect(`${origin}/login?error=GoogleAuthFailed`);
}