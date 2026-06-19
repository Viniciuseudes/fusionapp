"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Loader2, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export default function AdminLoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const supabase = createClient();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Tenta fazer o login
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) throw error;

      // 2. Verifica se a pessoa logada é realmente Admin
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("id", data.user.id)
        .single();

      if (profile?.role !== "admin") {
        // Se não for admin, desloga a pessoa e barra o acesso
        await supabase.auth.signOut();
        throw new Error(
          "Acesso negado. Credenciais sem permissão de administrador.",
        );
      }

      toast({
        title: "Acesso Autorizado",
        description: "Bem-vindo à Torre de Controle.",
      });

      // 3. Redireciona para o Dashboard
      router.push("/admin/dashboard");
      router.refresh();
    } catch (error: any) {
      console.error("Erro completo do Supabase:", error);

      let errorMessage = "Ocorreu um erro ao tentar entrar. Tente novamente.";

      // Tradutor Inteligente de Erros do Supabase
      if (error.message?.includes("Invalid login credentials")) {
        errorMessage =
          "E-mail ou senha incorretos. Verifique os dados digitados.";
      } else if (error.message?.includes("Email not confirmed")) {
        errorMessage =
          "Este e-mail ainda não foi confirmado no painel do Supabase.";
      } else {
        errorMessage = error.message;
      }

      toast({
        variant: "destructive",
        title: "Acesso Negado",
        description: errorMessage,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-slate-900 flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-2xl relative overflow-hidden">
        {/* Detalhe visual laranja no topo */}
        <div className="absolute top-0 left-0 w-full h-2 bg-gradient-to-r from-[#f05e23] to-[#d6521e]" />

        <div className="flex flex-col items-center mb-8">
          <div className="w-16 h-16 bg-slate-900 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
            <ShieldCheck className="w-8 h-8 text-[#f05e23]" />
          </div>
          <h1 className="text-2xl font-black text-slate-900">Fusion Admin</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Acesso restrito à diretoria
          </p>
        </div>

        <form onSubmit={handleLogin} className="space-y-6">
          <div className="space-y-2">
            <Label className="text-slate-700 font-bold">
              E-mail corporativo
            </Label>
            <Input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="admin@fusionclinic.com.br"
              className="h-12 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-[#f05e23]/20"
            />
          </div>

          <div className="space-y-2">
            <Label className="text-slate-700 font-bold">Senha de acesso</Label>
            <Input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-12 rounded-xl bg-slate-50 border-slate-200 focus-visible:ring-[#f05e23]/20"
            />
          </div>

          <Button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full h-12 rounded-xl font-black bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg shadow-orange-500/20"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Entrar no Sistema"
            )}
          </Button>
        </form>
      </div>
    </div>
  );
}
