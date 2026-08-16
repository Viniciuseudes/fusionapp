"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Stethoscope, Building2, Loader2, ArrowRight } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import Image from "next/image";

export default function OnboardingPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [checking, setChecking] = useState(true);
  const [loadingRole, setLoadingRole] = useState<"user" | "host" | null>(null);

  // 1. Verifica se ele realmente precisa estar aqui
  useEffect(() => {
    async function verifyStatus() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();

        if (!user) {
          router.push("/login");
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", user.id)
          .single();

        // Se ele já tiver um papel definido, nós expulsamos ele dessa tela e mandamos pro lugar certo
        if (profile?.role) {
          if (profile.role === "admin") router.push("/admin/dashboard");
          else if (profile.role === "host") router.push("/host");
          else router.push("/dashboard");
        } else {
          // Se for null, ele fica na tela para escolher
          setChecking(false);
        }
      } catch (error) {
        console.error(error);
        router.push("/login");
      }
    }
    verifyStatus();
  }, [router, supabase]);

  // 2. Ação quando ele clica no botão escolhendo a rota dele
  const handleSelectRole = async (role: "user" | "host") => {
    setLoadingRole(role);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não encontrado");

      // Atualiza o perfil no banco com a escolha
      const { error } = await supabase
        .from("profiles")
        .update({ role })
        .eq("id", user.id);

      if (error) throw error;

      toast({
        title: "Tudo pronto! 🎉",
        description: "Seu painel foi configurado com sucesso.",
      });

      // Redireciona para o destino correto
      if (role === "host") {
        router.push("/host");
      } else {
        router.push("/dashboard");
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao configurar perfil",
        description: err.message,
      });
      setLoadingRole(null);
    }
  };

  if (checking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <Loader2 className="w-12 h-12 animate-spin text-[#f05e23] mb-4" />
        <h2 className="text-xl font-bold text-slate-700">
          Preparando sua conta...
        </h2>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4 font-sans">
      <Card className="w-full max-w-xl shadow-2xl border-slate-100 rounded-[2rem] overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-[#f05e23] to-[#d6521e]" />

        <CardHeader className="space-y-2 text-center pt-10 pb-6 px-8">
          <div className="mx-auto relative w-20 h-20 mb-4 drop-shadow-md">
            <Image
              src="/icon-512x512.png"
              alt="Fusion Clinic"
              fill
              className="object-contain"
              priority
            />
          </div>
          <CardTitle className="text-3xl font-black text-slate-900 tracking-tight leading-tight">
            Falta muito pouco!
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium text-base">
            Notamos que este é seu primeiro acesso via Google. Para
            configurarmos o seu painel corretamente, conte-nos qual é o seu
            objetivo:
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 sm:px-10 pb-10 space-y-4">
          <button
            onClick={() => handleSelectRole("user")}
            disabled={loadingRole !== null}
            className="w-full bg-white border-2 border-slate-100 hover:border-[#f05e23] hover:shadow-md transition-all p-6 rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-4 text-left group"
          >
            <div className="w-14 h-14 bg-orange-50 rounded-full flex items-center justify-center shrink-0">
              <Stethoscope className="w-7 h-7 text-[#f05e23]" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-black text-slate-900 group-hover:text-[#f05e23] transition-colors">
                Sou Profissional (Especialista)
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-1">
                Quero buscar clínicas, alugar salas e gerenciar meus
                agendamentos e pacientes.
              </p>
            </div>
            <div className="hidden sm:flex self-center">
              {loadingRole === "user" ? (
                <Loader2 className="w-6 h-6 animate-spin text-[#f05e23]" />
              ) : (
                <ArrowRight className="w-6 h-6 text-slate-300 group-hover:text-[#f05e23] transition-colors" />
              )}
            </div>
          </button>

          <button
            onClick={() => handleSelectRole("host")}
            disabled={loadingRole !== null}
            className="w-full bg-white border-2 border-slate-100 hover:border-[#f05e23] hover:shadow-md transition-all p-6 rounded-2xl flex flex-col sm:flex-row items-center sm:items-start gap-4 text-left group"
          >
            <div className="w-14 h-14 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
              <Building2 className="w-7 h-7 text-slate-600" />
            </div>
            <div className="flex-1 text-center sm:text-left">
              <h3 className="text-lg font-black text-slate-900 group-hover:text-[#f05e23] transition-colors">
                Sou Anfitrião (Dono de Clínica)
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-1">
                Quero cadastrar meus espaços, disponibilizar minha agenda e
                rentabilizar minhas salas vazias.
              </p>
            </div>
            <div className="hidden sm:flex self-center">
              {loadingRole === "host" ? (
                <Loader2 className="w-6 h-6 animate-spin text-[#f05e23]" />
              ) : (
                <ArrowRight className="w-6 h-6 text-slate-300 group-hover:text-[#f05e23] transition-colors" />
              )}
            </div>
          </button>
        </CardContent>
      </Card>
    </div>
  );
}
