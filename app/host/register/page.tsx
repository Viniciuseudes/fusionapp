"use client";

import { useState } from "react";
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
import { Building2, ArrowLeft, AlertCircle } from "lucide-react";

export default function HostRegisterPage() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleRegister = async (e: React.FormEvent) => {
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
            role: "host", // <-- Garante que o usuário seja um Anfitrião
          },
        },
      });

      if (signUpError) throw signUpError;

      toast({
        title: "Conta de Anfitrião criada!",
        description: "Bem-vindo à Fusion Clinic. Configurando seu painel...",
      });

      // O Supabase faz auto-login após o signUp. Redirecionamos para a área restrita.
      router.push("/host");
      router.refresh();
    } catch (err: any) {
      console.error(err);
      setError(err.message || "Erro ao criar conta. Verifique os dados.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md mb-4 flex justify-start">
        <button
          onClick={() => router.push("/login")}
          className="flex items-center text-sm font-bold text-slate-500 hover:text-slate-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4 mr-1" />
          Voltar para o Login
        </button>
      </div>

      <Card className="w-full max-w-md shadow-xl border-slate-100 rounded-2xl overflow-hidden">
        <div className="h-2 w-full bg-slate-900" />

        <CardHeader className="space-y-2 text-center pt-8 pb-6">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-100 mb-2">
            <Building2 className="w-6 h-6 text-slate-900" />
          </div>
          <CardTitle className="text-2xl font-black text-slate-900 tracking-tight">
            Seja um Anfitrião
          </CardTitle>
          <CardDescription className="text-slate-500 font-medium">
            Cadastre seus espaços e maximize sua rentabilidade.
          </CardDescription>
        </CardHeader>

        <CardContent className="px-6 pb-8">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 text-red-600 p-3 rounded-lg text-sm font-medium mb-4">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <p>{error}</p>
            </div>
          )}

          <form onSubmit={handleRegister} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="fullName">Nome do Responsável ou Clínica</Label>
              <Input
                id="fullName"
                type="text"
                placeholder="Ex: Clínica Bem Estar"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                required
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">E-mail Comercial</Label>
              <Input
                id="email"
                type="email"
                placeholder="contato@clinica.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="Crie uma senha segura"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <Button
              type="submit"
              className="w-full h-12 rounded-xl mt-2 font-bold bg-slate-900 hover:bg-slate-800"
              disabled={loading}
            >
              {loading ? "Criando painel..." : "Criar Conta de Anfitrião"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
