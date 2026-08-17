import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/dashboard";

  if (code) {
    const supabase = await createClient();
    
    // Troca o código pela sessão no Supabase
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    
    if (!error) {
      // ==========================================
      // LÓGICA SÊNIOR DE ROTEAMENTO (VERCEL FIX)
      // Garante que o redirecionamento seja instantâneo 
      // driblando o balanceador de carga da Vercel.
      // ==========================================
      const forwardedHost = request.headers.get("x-forwarded-host");
      const isLocalEnv = process.env.NODE_ENV === "development";

      if (isLocalEnv) {
        // No Localhost, usamos o origin normal (http://localhost:3000)
        return NextResponse.redirect(`${origin}${next}`);
      } else if (forwardedHost) {
        // Na Produção, forçamos a URL real do seu domínio com HTTPS
        return NextResponse.redirect(`https://${forwardedHost}${next}`);
      } else {
        // Fallback de segurança
        return NextResponse.redirect(`${origin}${next}`);
      }
    }
  }

  // Se der erro no código do Google, volta para o login
  return NextResponse.redirect(`${origin}/login?error=GoogleAuthFailed`);
}