import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({
    request,
  });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({
            request,
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();

  // Verifica se o usuário não está logado e tenta acessar rotas protegidas
  if (
    !user &&
    (request.nextUrl.pathname.startsWith("/dashboard") ||
     request.nextUrl.pathname.startsWith("/host") ||
     request.nextUrl.pathname.startsWith("/admin/dashboard"))
  ) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  // Opcional: Se o usuário estiver logado e tentar acessar o /login, manda pro lugar certo
  if (user && request.nextUrl.pathname === "/login") {
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).single();
    
    const url = request.nextUrl.clone();
    if (profile?.role === "admin") {
      url.pathname = "/admin/dashboard";
    } else if (profile?.role === "host") {
      url.pathname = "/host";
    } else {
      url.pathname = "/dashboard";
    }
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}