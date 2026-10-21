"use client";

import { useState } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { sendWelcomeEmail } from "@/app/actions/send-email";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
} from "@/components/ui/card";
import {
  AlertCircle,
  ArrowLeft,
  Stethoscope,
  Building2,
  LogIn,
  Loader2,
  RefreshCw,
} from "lucide-react";

type AuthStep =
  | "gateway"
  | "login"
  | "register_professional"
  | "verify_signup_otp"
  | "forgot_request"
  | "forgot_verify_reset";

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
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const redirectByUserRole = async (userId: string) => {
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", userId)
      .single();

    if (profileError) {
      router.push("/dashboard");
      return;
    }

    const userRole = profile?.role;
    if (userRole === "admin") router.push("/admin/dashboard");
    else if (userRole === "host") router.push("/host");
    else router.push("/dashboard");

    router.refresh();
  };

  // Inicia o fluxo de autenticação OAuth com o Google
  const handleGoogleLogin = async () => {
    setLoadingGoogle(true);
    setError(null);
    try {
      const { error } = await supabase.auth.signInWithOAuth({
        provider: "google",
        options: {
          redirectTo: `${window.location.origin}/auth/callback`,
          queryParams: {
            prompt: "select_account",
          },
        },
      });
      if (error) throw error;
    } catch (err: any) {
      setError("Falha ao conectar com o Google.");
      setLoadingGoogle(false);
    }
  };

  // 1. LOGIN DIRETO COM E-MAIL E SENHA (SEM PEDIR 2FA NO LOGIN)
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: authData, error: authError } =
        await supabase.auth.signInWithPassword({
          email: email.trim(),
          password,
        });

      if (authError) {
        // Caso o usuário tenha se cadastrado antes mas não tenha digitado o código do e-mail
        if (
          authError.message.toLowerCase().includes("email not confirmed") ||
          authError.message.toLowerCase().includes("not confirmed")
        ) {
          await supabase.auth.resend({
            type: "signup",
            email: email.trim(),
          });
          toast({
            title: "Confirme seu cadastro",
            description: "Enviamos um código de 6 dígitos para o seu e-mail.",
          });
          setOtpCode("");
          setStep("verify_signup_otp");
          return;
        }
        throw authError;
      }

      if (authData.user) {
        toast({
          title: "Bem-vindo de volta!",
          description: "Login realizado com sucesso.",
        });
        await redirectByUserRole(authData.user.id);
      }
    } catch (err: any) {
      setError("E-mail ou senha incorretos.");
    } finally {
      setLoading(false);
    }
  };

  // 2. CADASTRO DE PROFISSIONAL -> DISPARA CÓDIGO DE 6 DÍGITOS PARA O E-MAIL
  const handleRegisterProfessional = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { data: signUpData, error: signUpError } =
        await supabase.auth.signUp({
          email: email.trim(),
          password,
          options: {
            data: {
              full_name: fullName.trim(),
              role: "user",
            },
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });

      if (signUpError) throw signUpError;

      // Se a confirmação de e-mail estiver ativa no Supabase, pede o código de 6 dígitos na tela
      if (signUpData.user && !signUpData.session) {
        toast({
          title: "Código enviado para seu e-mail!",
          description: `Digite o código de 6 dígitos enviado para ${email.trim()}.`,
        });
        setOtpCode("");
        setStep("verify_signup_otp");
      } else {
        // Caso a confirmação esteja desativada no painel do Supabase, envia boas-vindas e vai para login/dashboard
        await sendWelcomeEmail(email.trim(), fullName.trim()).catch(() => {});
        toast({
          title: "Conta criada com sucesso!",
          description: "Bem-vindo(a) à Fusion Clinic.",
        });
        if (signUpData.user) {
          await redirectByUserRole(signUpData.user.id);
        } else {
          setStep("login");
        }
      }
    } catch (err: any) {
      setError(err.message || "Erro ao criar conta.");
    } finally {
      setLoading(false);
    }
  };

  // 3. VALIDAR O CÓDIGO DE 2 FATORES (6 DÍGITOS) DO CADASTRO
  const handleVerifySignupOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = otpCode.replace(/\D/g, "");
    if (cleanCode.length < 6) {
      setError("Digite os 6 dígitos do código enviado para o seu e-mail.");
      return;
    }

    setLoading(true);
    try {
      const { data, error: otpError } = await supabase.auth.verifyOtp({
        email: email.trim(),
        token: cleanCode,
        type: "signup",
      });

      if (otpError) throw otpError;

      await sendWelcomeEmail(
        email.trim(),
        fullName.trim() ||
          data.user?.user_metadata?.full_name ||
          "Especialista",
      ).catch(() => {});

      toast({
        title: "E-mail confirmado com sucesso!",
        description: "Sua conta foi ativada.",
      });

      if (data.user) {
        await redirectByUserRole(data.user.id);
      } else {
        setStep("login");
      }
    } catch (err: any) {
      setError("Código inválido ou expirado. Tente novamente ou reenvie.");
    } finally {
      setLoading(false);
    }
  };

  const handleResendSignupCode = async () => {
    if (!email.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const { error: resendErr } = await supabase.auth.resend({
        type: "signup",
        email: email.trim(),
      });
      if (resendErr) throw resendErr;
      toast({
        title: "Código reenviado!",
        description: `Verifique sua caixa de entrada e spam em ${email.trim()}.`,
      });
    } catch (err: any) {
      setError(err.message || "Não foi possível reenviar o código.");
    } finally {
      setLoading(false);
    }
  };

  // 4. ESQUECI MINHA SENHA -> SOLICITAR CÓDIGO NO E-MAIL
  const handleForgotRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const { error: resetErr } = await supabase.auth.resetPasswordForEmail(
        email.trim(),
        {
          redirectTo: `${window.location.origin}/auth/callback?next=/dashboard`,
        },
      );

      if (resetErr) throw resetErr;

      toast({
        title: "Código de recuperação enviado!",
        description: `Verifique o e-mail ${email.trim()}.`,
      });
      setOtpCode("");
      setNewPassword("");
      setStep("forgot_verify_reset");
    } catch (err: any) {
      setError(err.message || "Erro ao enviar e-mail de recuperação de senha.");
    } finally {
      setLoading(false);
    }
  };

  // 5. ESQUECI MINHA SENHA -> VALIDAR CÓDIGO E SALVAR NOVA SENHA
  const handleForgotVerifyReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const cleanCode = otpCode.replace(/\D/g, "");
    if (cleanCode.length < 6) {
      setError("Digite o código de 6 dígitos enviado para o seu e-mail.");
      return;
    }

    if (newPassword.length < 6) {
      setError("A nova senha deve ter pelo menos 6 caracteres.");
      return;
    }

    setLoading(true);
    try {
      const { data: verifyData, error: verifyErr } =
        await supabase.auth.verifyOtp({
          email: email.trim(),
          token: cleanCode,
          type: "recovery",
        });

      if (verifyErr) throw verifyErr;

      const { error: updateErr } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (updateErr) throw updateErr;

      toast({
        title: "Senha atualizada com sucesso!",
        description: "Acessando sua conta...",
      });

      if (verifyData.user) {
        await redirectByUserRole(verifyData.user.id);
      } else {
        setStep("login");
      }
    } catch (err: any) {
      setError("Código inválido ou expirado. Solicite um novo código.");
    } finally {
      setLoading(false);
    }
  };

  const handleBackNavigation = () => {
    setError(null);
    if (step === "gateway") {
      window.location.assign("/");
    } else if (step === "forgot_request") {
      setStep("login");
    } else if (step === "forgot_verify_reset") {
      setStep("forgot_request");
    } else if (step === "verify_signup_otp") {
      setStep("register_professional");
    } else {
      setStep("gateway");
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md mb-3 flex justify-start">
        <button
          type="button"
          onClick={handleBackNavigation}
          className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          {step === "gateway" ? "Voltar para o Início" : "Voltar"}
        </button>
      </div>

      <Card className="w-full max-w-md shadow-2xl border-slate-100 rounded-[2rem] overflow-hidden">
        <div className="h-2 w-full bg-gradient-to-r from-[#BF4B24] to-[#9A3C1D]" />

        <CardHeader className="space-y-1 text-center pt-6 pb-4">
          <div className="mx-auto relative w-48 h-14 mb-1 drop-shadow-md">
            <Image
              src="/logo-fusion-orange.png"
              alt="Fusion Clinic"
              fill
              className="object-contain"
              priority
            />
          </div>
          <CardDescription className="text-slate-500 text-sm font-medium px-4">
            {step === "gateway" && "Acesse ou cadastre-se para começar."}
            {step === "login" && "Acesse seu painel com e-mail e senha."}
            {step === "register_professional" &&
              "Crie sua conta para alugar salas."}
            {step === "verify_signup_otp" &&
              `Digite o código de 6 dígitos enviado para ${email}`}
            {step === "forgot_request" &&
              "Informe seu e-mail para receber o código de recuperação."}
            {step === "forgot_verify_reset" &&
              "Digite o código recebido no e-mail e crie sua nova senha."}
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-6">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          {step === "gateway" && (
            <div className="space-y-3">
              <Button
                type="button"
                onClick={handleGoogleLogin}
                disabled={loadingGoogle}
                variant="outline"
                className="w-full h-12 rounded-xl font-bold border-slate-200 text-slate-700 hover:bg-slate-50 transition-all shadow-sm"
              >
                {loadingGoogle ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  <>
                    <GoogleIcon /> Continuar com o Google
                  </>
                )}
              </Button>

              <div className="relative py-1">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t border-slate-200" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase">
                  <span className="bg-white px-3 text-slate-400 font-bold tracking-widest">
                    Ou use seu e-mail
                  </span>
                </div>
              </div>

              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("login");
                }}
                className="w-full h-12 justify-start text-left bg-[#BF4B24] hover:bg-[#9A3C1D] text-white rounded-xl shadow-sm transition-colors"
              >
                <LogIn className="w-5 h-5 mr-3 text-white/80 shrink-0" />
                <div className="leading-tight">
                  <div className="font-bold text-sm">Já tenho uma conta</div>
                  <div className="text-[10px] text-white/70 font-medium">
                    Fazer login com senha
                  </div>
                </div>
              </Button>

              <Button
                type="button"
                onClick={() => {
                  setError(null);
                  setStep("register_professional");
                }}
                variant="outline"
                className="w-full h-12 justify-start text-left border-slate-200 hover:bg-slate-50 hover:text-[#BF4B24] rounded-xl group"
              >
                <Stethoscope className="w-5 h-5 mr-3 text-slate-400 group-hover:text-[#BF4B24] shrink-0" />
                <div className="leading-tight">
                  <div className="font-bold text-sm text-slate-700 group-hover:text-[#BF4B24]">
                    Sou Profissional
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Criar conta e reservar salas
                  </div>
                </div>
              </Button>

              <Button
                type="button"
                onClick={() => window.location.assign("/host/register")}
                variant="outline"
                className="w-full h-12 justify-start text-left border-slate-200 hover:bg-slate-50 hover:text-[#BF4B24] rounded-xl group"
              >
                <Building2 className="w-5 h-5 mr-3 text-slate-400 group-hover:text-[#BF4B24] shrink-0" />
                <div className="leading-tight">
                  <div className="font-bold text-sm text-slate-700 group-hover:text-[#BF4B24]">
                    Sou Anfitrião
                  </div>
                  <div className="text-[10px] text-slate-500 font-medium">
                    Cadastrar minha clínica
                  </div>
                </div>
              </Button>
            </div>
          )}

          {step === "login" && (
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  E-mail
                </Label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label className="text-xs font-bold text-slate-600">
                    Senha
                  </Label>
                  <button
                    type="button"
                    onClick={() => {
                      setError(null);
                      setStep("forgot_request");
                    }}
                    className="text-xs font-bold text-[#BF4B24] hover:underline"
                  >
                    Esqueceu a senha?
                  </button>
                </div>
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
                className="w-full h-12 rounded-xl mt-2 font-bold bg-[#BF4B24] hover:bg-[#9A3C1D] text-white"
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
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  Nome Completo
                </Label>
                <Input
                  type="text"
                  placeholder="Dr. João Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  E-mail Profissional
                </Label>
                <Input
                  type="email"
                  placeholder="medico@exemplo.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  Senha
                </Label>
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
                className="w-full h-12 rounded-xl mt-2 font-bold bg-[#BF4B24] hover:bg-[#9A3C1D] text-white"
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

          {step === "verify_signup_otp" && (
            <form onSubmit={handleVerifySignupOtp} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  Código de Verificação (6 dígitos)
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, ""))
                  }
                  required
                  className="h-12 bg-slate-50 rounded-xl text-center text-lg font-black tracking-[0.35em]"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl mt-2 font-bold bg-[#BF4B24] hover:bg-[#9A3C1D] text-white"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Confirmar Código e Ativar Conta"
                )}
              </Button>

              <button
                type="button"
                onClick={handleResendSignupCode}
                disabled={loading}
                className="w-full flex items-center justify-center gap-1.5 text-xs font-bold text-slate-500 hover:text-[#BF4B24] pt-1 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Não recebeu? Reenviar
                código
              </button>
            </form>
          )}

          {step === "forgot_request" && (
            <form onSubmit={handleForgotRequest} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  E-mail da sua conta
                </Label>
                <Input
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>
              <Button
                type="submit"
                className="w-full h-12 rounded-xl mt-2 font-bold bg-[#BF4B24] hover:bg-[#9A3C1D] text-white"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Enviar Código de Recuperação"
                )}
              </Button>
            </form>
          )}

          {step === "forgot_verify_reset" && (
            <form onSubmit={handleForgotVerifyReset} className="space-y-4">
              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  Código recebido no e-mail (6 dígitos)
                </Label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="000000"
                  value={otpCode}
                  onChange={(e) =>
                    setOtpCode(e.target.value.replace(/\D/g, ""))
                  }
                  required
                  className="h-12 bg-slate-50 rounded-xl text-center text-lg font-black tracking-[0.35em]"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-bold text-slate-600">
                  Nova Senha
                </Label>
                <Input
                  type="password"
                  placeholder="Digite sua nova senha"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  required
                  className="h-12 bg-slate-50 rounded-xl"
                />
              </div>

              <Button
                type="submit"
                className="w-full h-12 rounded-xl mt-2 font-bold bg-[#BF4B24] hover:bg-[#9A3C1D] text-white"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Salvar Nova Senha e Entrar"
                )}
              </Button>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
