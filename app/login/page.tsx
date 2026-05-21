"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { AlertCircle, ArrowLeft } from "lucide-react";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [isSignUp, setIsSignUp] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const router = useRouter();
  const supabase = createClient();

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    if (isSignUp) {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName } },
      });

      if (error) {
        setError(error.message);
      } else {
        alert("Conta criada com sucesso! Faça o login agora.");
        setIsSignUp(false);
      }
    } else {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        setError("E-mail ou senha incorretos.");
      } else {
        router.push("/dashboard");
        router.refresh();
      }
    }
    setLoading(false);
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      {/* Botão de Voltar estilo App */}
      <div className="w-full max-w-md mb-4 flex justify-start">
        <button
          onClick={() => router.push("/")}
          className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Voltar para o Início
        </button>
      </div>

      <Card className="w-full max-w-md shadow-xl border-slate-100 rounded-2xl overflow-hidden">
        {/* Detalhe de cor no topo do cartão para dar um ar premium */}
        <div className="h-2 w-full bg-primary" />

        <CardHeader className="space-y-2 text-center pt-8 pb-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 mb-2">
            <span className="text-primary font-black text-3xl">F</span>
          </div>
          <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
            Fusion Clinic
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium">
            {isSignUp
              ? "Crie sua conta para reservar espaços premium"
              : "Acesse seu painel e sua carteira digital"}
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleAuth}>
          <CardContent className="space-y-4 px-6">
            {error && (
              <div className="flex items-center gap-2 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <p>{error}</p>
              </div>
            )}

            {isSignUp && (
              <div className="space-y-2">
                <Label htmlFor="fullName" className="text-slate-700 font-bold">
                  Nome Completo
                </Label>
                <Input
                  id="fullName"
                  type="text"
                  placeholder="Dr. João Silva"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  required={isSignUp}
                  className="h-12 bg-slate-50 border-slate-200 focus-visible:ring-primary rounded-xl"
                />
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="email" className="text-slate-700 font-bold">
                E-mail
              </Label>
              <Input
                id="email"
                type="email"
                placeholder="medico@exemplo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-slate-50 border-slate-200 focus-visible:ring-primary rounded-xl"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-slate-700 font-bold">
                Senha
              </Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-slate-50 border-slate-200 focus-visible:ring-primary rounded-xl"
              />
            </div>
          </CardContent>

          <CardFooter className="flex flex-col space-y-4 px-6 pb-8 pt-4">
            <Button
              type="submit"
              className="w-full h-12 bg-primary hover:bg-primary/90 text-primary-foreground font-bold text-base rounded-xl shadow-md transition-all active:scale-[0.98]"
              disabled={loading}
            >
              {loading
                ? "Aguarde..."
                : isSignUp
                  ? "Criar Conta"
                  : "Entrar na Plataforma"}
            </Button>

            <div className="text-center text-sm font-medium text-slate-500">
              {isSignUp ? "Já tem uma conta?" : "Ainda não faz parte?"}
              <button
                type="button"
                onClick={() => {
                  setIsSignUp(!isSignUp);
                  setError(null);
                }}
                className="ml-1.5 font-bold text-primary hover:text-primary/80 transition-colors"
              >
                {isSignUp ? "Faça login" : "Cadastre-se grátis"}
              </button>
            </div>
          </CardFooter>
        </form>
      </Card>
    </div>
  );
}
