"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
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
  Loader2,
} from "lucide-react";

type AuthStep = "gateway" | "login" | "register_professional";

// Ícone Oficial do Google Otimizado
const GoogleIcon = () => (
  <svg viewBox="0 0 24 24" className="w-5 h-5 mr-2" aria-hidden="true">
    <path
      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
      fill="#4285F4"
    />
    <path
      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
      fill="#34A853"
    />
    <path
      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
      fill="#FBBC05"
    />
    <path
      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
      fill="#EA4335"
    />
  </svg>
);

export default function LoginPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [step, setStep] = useState<AuthStep>("gateway");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleGoogleLogin = async () => {
    setLoadingGoogle(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError("Falha ao conectar com o Google.");
      setLoadingGoogle(false);
    }
  };

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
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("role")
          .eq("id", authData.user.id)
          .single();

        if (profileError) {
          router.push("/dashboard");
          return;
        }

        toast({
          title: "Bem-vindo de volta!",
          description: "Login realizado com sucesso.",
        });

        const userRole = profile?.role;
        if (userRole === "admin") router.push("/admin/dashboard");
        else if (userRole === "host") router.push("/host");
        else router.push("/dashboard");

        router.refresh();
      }
    } catch (err: any) {
      setError("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

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
            role: "user",
          },
        },
      });

      if (signUpError) throw signUpError;

      toast({
        title: "Conta criada com sucesso!",
        description: "Faça login para continuar.",
      });
      setStep("login");
      setPassword("");
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md mb-4 flex justify-start">
        <button
          onClick={() =>
            step === "gateway"
              ? window.location.assign("/")
              : setStep("gateway")
          }
          className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {step === "gateway" ? "Voltar para o Início" : "Voltar para Opções"}
        </button>
      </div>

      <Card className="w-full max-w-md shadow-2xl border-slate-100 rounded-[2rem] overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-[#f05e23] to-[#d6521e]" />

        <CardHeader className="space-y-2 text-center pt-8 pb-6">
          <div className="mx-auto relative w-20 h-20 mb-2 drop-shadow-md">
            <Image
              src="/icon-512x512.png"
              alt="Fusion Clinic"
              fill
              className="object-contain"
              priority
            />
          </div>
          <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
            Fusion Clinic
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium px-4">
            {step === "gateway" &&
              "Acesse sua conta ou cadastre-se para alugar ou gerenciar espaços."}
            {step === "login" && "Acesse seu painel com e-mail e senha."}
            {step === "register_professional" &&
              "Crie sua conta de Especialista para alugar salas."}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {step === "gateway" && (
            <div className="space-y-4">
              {/* BOTÃO GOOGLE */}
              <Button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loadingGoogle}
                variant="outline"
                className="w-full h-14 rounded-xl font-bold border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
              >
                {loadingGoogle ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <GoogleIcon /> Continuar com o Google
                  </>
                )}
              </Button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-white px-3 text-slate-400 font-bold tracking-widest">
                    Ou use seu e-mail
                  </span>
                </div>
              </div>

              {/* BOTÃO JÁ TENHO UMA CONTA (AGORA LARANJA!) */}
              <Button
                onClick={() => setStep("login")}
                className="w-full h-14 justify-start text-left bg-[#f05e23] hover:bg-[#d6521e] text-white rounded-xl shadow-sm transition-colors"
              >
                <LogIn className="w-5 h-5 mr-3 text-white/80" />
                <div>
                  <div className="font-bold">Já tenho uma conta</div>
                  <div className="text-xs text-white/70 font-medium">
                    Fazer login com senha
                  </div>
                </div>
              </Button>

              <Button
                onClick={() => setStep("register_professional")}
                variant="outline"
                className="w-full h-14 justify-start text-left border-slate-200 hover:bg-slate-50 hover:text-[#f05e23] rounded-xl group"
              >
                <Stethoscope className="w-5 h-5 mr-3 text-slate-400 group-hover:text-[#f05e23]" />
                <div>
                  <div className="font-bold">Sou Profissional</div>
                  <div className="text-xs text-slate-500 font-normal">
                    Quero criar conta e reservar salas
                  </div>
                </div>
              </Button>

              <Button
                type="button"
                onClick={() => window.location.assign("/host/register")}
                variant="outline"
                className="w-full h-14 justify-start text-left border-slate-200 hover:bg-slate-50 hover:text-[#f05e23] rounded-xl group"
              >
                <Building2 className="w-5 h-5 mr-3 text-slate-400 group-hover:text-[#f05e23]" />
                <div>
                  <div className="font-bold">Sou Anfitrião</div>
                  <div className="text-xs text-slate-500 font-normal">
                    Quero cadastrar minha clínica
                  </div>
                </div>
              </Button>
            </div>
          )}

          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input
                  type="password"
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl mt-2 font-bold bg-[#f05e23] hover:bg-[#d6521e] text-white"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Entrar na Conta"
                )}
              </Button>
            </form>
          )}

          {step === "register_professional" && (
            <form onSubmit={handleRegisterProfessional} className="space-y-4">
              <div className="space-y-2">
                <Label>Nome Completo</Label>
                <Input
                  type="text"
                  placeholder="Dr. João Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>E-mail Profissional</Label>
                <Input
                  type="email"
                  placeholder="medico@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <div className="space-y-2">
                <Label>Senha</Label>
                <Input
                  type="password"
                  placeholder="Crie uma senha forte"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl mt-2 font-bold bg-[#f05e23] hover:bg-[#d6521e] text-white"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Criar Conta de Especialista"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
