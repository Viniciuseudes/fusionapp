import { redirect } from "next/navigation";
import { createClient } from "@/utils/supabase/server";

export const metadata = {
  title: "Fusion Admin | Torre de Controle",
};

export default async function AdminDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createClient();

  // 1. Verifica se tem alguém logado
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  // 2. Se não estiver logado, manda para o login do admin
  if (authError || !user) {
    redirect("/admin/login");
  }

  // 3. Verifica se a role no banco é 'admin'
  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .eq("id", user.id)
    .single();

  // 4. Se não for admin, manda para a home normal
  if (profile?.role !== "admin") {
    redirect("/");
  }

  // 5. Se for admin, renderiza o dashboard perfeitamente
  return <>{children}</>;
}
