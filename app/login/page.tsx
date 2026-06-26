"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast"; // <-- Utilizando seu hook de toast
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  AlertCircle,
  ArrowLeft,
  Stethoscope,
  Building2,
  LogIn,
} from "lucide-react";

type AuthStep = "gateway" | "login" | "register_professional";

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [step, setStep] = useState<AuthStep>("gateway");

  // States para formulários
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Função unificada de Login com Redirecionamento Inteligente
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email,
          password,
        });

      if (authError) throw authError;

      if (authData.user) {
        // Busca o role do usuário na tabela profiles
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .single();

        if (profileError) throw profileError;

        toast({
          title: "Bem-vindo de volta!",
          description: "Login realizado com sucesso.",
        });

        // Redirecionamento inteligente baseado no Role
        if (profile?.role === "host") {
          router.push("/host");
        } else {
          router.push("/dashboard");
        }
        router.refresh();
      }
    } catch (err: any) {
      console.error(err);
      setError("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  // Função de Cadastro APENAS para Profissionais (Usuários)
  const handleRegisterProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: signUpError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: "user", // Define explicitamente como profissional. O Trigger no SQL fará o resto.
          },
        },
      });

      if (signUpError) throw signUpError;

      toast({
        title: "Conta criada com sucesso!",
        description: "Você já pode fazer login na plataforma.",
      });

      setStep("login");
      // Limpa os campos após sucesso
      setPassword("");
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao criar conta. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      {/* Botão de Voltar */}
      <div className="w-full max-w-md mb-4 flex justify-start">
        <button
          onClick={() =>
            step === "gateway" ? router.push("/") : setStep("gateway")
          }
          className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {step === "gateway" ? "Voltar para o Início" : "Voltar para Opções"}
        </button>
      </div>

      <Card className="w-full max-w-md shadow-xl border-slate-100 rounded-2xl overflow-hidden">
        <div className="h-2 w-full bg-primary" />

        <CardHeader className="space-y-2 text-center pt-8 pb-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-2">
            <span className="text-primary font-black text-3xl">F</span>
          </div>
          <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
            Fusion Clinic
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium">
            {step === "gateway" && "Como você deseja acessar a plataforma?"}
            {step === "login" && "Acesse seu painel"}
            {step === "register_professional" &&
              "Crie sua conta de Profissional"}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {/* PASSO 1: BIFURCAÇÃO (GATEWAY) */}
          {step === "gateway" && (
            <div className="space-y-4">
              <Button
                onClick={() => setStep("login")}
                className="w-full h-14 justify-start text-left bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-sm"
              >
                <LogIn className="w-5 h-5 mr-3 text-slate-300" />
                <div>
                  <div className="font-bold">Já tenho uma conta</div>
                  <div className="text-xs text-slate-400 font-normal">
                    Fazer login no sistema
                  </div>
                </div>
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-2 text-slate-400 font-bold">
                    Ainda não tem conta?
                  </span>
                </div>
              </div>

              <Button
                onClick={() => setStep("register_professional")}
                variant="outline"
                className="w-full h-14 justify-start text-left border-slate-200 hover:bg-slate-50 hover:text-primary rounded-xl"
              >
                <Stethoscope className="w-5 h-5 mr-3 text-slate-400" />
                <div>
                  <div className="font-bold">Sou Profissional</div>
                  <div className="text-xs text-slate-500 font-normal">
                    Quero reservar salas
                  </div>
                </div>
              </Button>

              {/* Rota direcionada para o registro exclusivo de anfitriões */}
              <Button
                onClick={() => router.push("/host/register")}
                variant="outline"
                className="w-full h-14 justify-start text-left border-slate-200 hover:bg-slate-50 hover:text-primary rounded-xl"
              >
                <Building2 className="w-5 h-5 mr-3 text-slate-400" />
                <div>
                  <div className="font-bold">Sou Anfitrião</div>
                  <div className="text-xs text-slate-500 font-normal">
                    Quero cadastrar minha clínica
                  </div>
                </div>
              </Button>
            </div>
          )}

          {/* PASSO 2: FORMULÁRIO DE LOGIN UNIFICADO */}
          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="login-email">E-mail</Label>
                <Input
                  id="login-email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="login-password">Senha</Label>
                <Input
                  id="login-password"
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl mt-2 font-bold"
                disabled={loading}
              >
                {loading ? "Entrando..." : "Entrar"}
              </Button>
            </form>
          )}

          {/* PASSO 3: FORMULÁRIO DE CADASTRO DE PROFISSIONAL */}
          {step === "register_professional" && (
            <form onSubmit={handleRegisterProfessional} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reg-fullName">Nome Completo</Label>
                <Input
                  id="reg-fullName"
                  type="text"
                  placeholder="Dr. João Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">E-mail Profissional</Label>
                <Input
                  id="reg-email"
                  type="email"
                  placeholder="medico@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Senha</Label>
                <Input
                  id="reg-password"
                  type="password"
                  placeholder="Crie uma senha forte"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl mt-2 font-bold"
                disabled={loading}
              >
                {loading ? "Criando sua conta..." : "Criar Conta"}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
