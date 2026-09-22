"use client";

import { useState } from "react";
import { sendWelcomeEmail } from "@/app/actions/send-email"; // Ajusta o caminho se necessário
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useToast } from "@/hooks/use-toast";
import { Loader2, Mail } from "lucide-react";

export default function TesteEmailPage() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const handleTestEmail = async () => {
    if (!email) return;

    setLoading(true);

    try {
      // Dispara a Server Action enviando para o e-mail digitado
      const res = await sendWelcomeEmail(email, "Teste Fusion");

      if (res.success) {
        toast({
          title: "E-mail enviado! 🚀",
          description: "Verifica a tua caixa de entrada (ou pasta de SPAM).",
        });
      } else {
        toast({
          variant: "destructive",
          title: "Erro no envio",
          description: res.error,
        });
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro Crítico",
        description: err.message,
      });
    } finally {
      setLoading(false);
      setEmail("");
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white p-8 rounded-2xl shadow-sm border border-slate-200 max-w-md w-full text-center">
        <div className="w-16 h-16 bg-orange-50 rounded-2xl mx-auto flex items-center justify-center mb-6">
          <Mail className="w-8 h-8 text-[#BF4B24]" />
        </div>

        <h1 className="text-2xl font-black text-slate-900 mb-2">
          Teste de Resend
        </h1>
        <p className="text-sm font-medium text-slate-500 mb-6">
          Digita o teu e-mail pessoal abaixo para receberes o template de
          Boas-Vindas da Fusion Clinic.
        </p>

        <div className="space-y-4">
          <Input
            type="email"
            placeholder="teu-email@gmail.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="h-12 bg-slate-50"
          />

          <Button
            onClick={handleTestEmail}
            disabled={loading || !email}
            className="w-full h-12 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl"
          >
            {loading ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Disparar E-mail de Teste"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
