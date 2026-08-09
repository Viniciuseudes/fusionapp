"use client";

import { useState, useEffect } from "react";
import { format, differenceInSeconds, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  QrCode,
  AlertTriangle,
  CheckCircle2,
  AlertOctagon,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";

interface ActiveSessionProps {
  booking: any;
  onSessionEnd: () => void;
}

export function ActiveSession({ booking, onSessionEnd }: ActiveSessionProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [secondsElapsed, setSecondsSecondsElapsed] = useState(0);

  // Calcula o tempo a cada segundo
  useEffect(() => {
    if (!booking?.start_time) return;

    const interval = setInterval(() => {
      const start = parseISO(booking.start_time);
      const now = new Date();
      const diff = differenceInSeconds(now, start);
      setSecondsSecondsElapsed(diff > 0 ? diff : 0);
    }, 1000);

    return () => clearInterval(interval);
  }, [booking]);

  const minutesElapsed = Math.floor(secondsElapsed / 60);
  const secondsReminder = secondsElapsed % 60;

  // LÓGICA DE CORES E STATUS (As nossas regras de negócio)
  let statusColor = "bg-emerald-500";
  let bgGlow = "bg-emerald-50";
  let statusText = "Sessão em andamento";
  let statusIcon = <CheckCircle2 className="w-5 h-5 text-emerald-500" />;

  if (minutesElapsed >= 50 && minutesElapsed < 55) {
    statusColor = "bg-amber-500";
    bgGlow = "bg-amber-50";
    statusText = "Tolerância de Limpeza. Faça o Check-out.";
    statusIcon = <AlertTriangle className="w-5 h-5 text-amber-500" />;
  } else if (minutesElapsed >= 55) {
    statusColor = "bg-red-500";
    bgGlow = "bg-red-50";
    statusText = "Atraso! Sujeito a multa e bloqueio.";
    statusIcon = <AlertOctagon className="w-5 h-5 text-red-500" />;
  }

  // O Check-out (Simulando a leitura do QR Code por agora)
  const handleCheckout = async () => {
    setLoading(true);
    try {
      let penalty = "none";
      let amount = 0;

      if (minutesElapsed >= 50 && minutesElapsed < 55) {
        penalty = "warning";
      } else if (minutesElapsed >= 55) {
        penalty = "fined";
        amount = booking.total_cost > 0 ? booking.total_cost : 45; // Exemplo: cobra 1 hora extra
      }

      const { error } = await supabase
        .from("bookings")
        .update({
          checkout_time: new Date().toISOString(),
          status: "completed",
          penalty_status: penalty,
          penalty_amount: amount,
        })
        .eq("id", booking.id);

      if (error) throw error;

      if (penalty === "fined") {
        toast({
          variant: "destructive",
          title: "Check-out com Atraso",
          description:
            "O tempo limite foi excedido. Uma multa de 1 hora foi aplicada.",
        });
      } else if (penalty === "warning") {
        toast({
          title: "Atenção ao horário",
          description:
            "Você saiu no tempo de tolerância. Lembre-se de liberar aos 50min.",
        });
      } else {
        toast({
          title: "Check-out concluído! 🎉",
          description:
            "Obrigado por deixar a sala limpa para o próximo colega.",
        });
      }

      onSessionEnd();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro no Check-out",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (val: number) => val.toString().padStart(2, "0");

  return (
    <div className="max-w-2xl mx-auto w-full p-4 mt-6 animate-in zoom-in-95 duration-500">
      <div
        className={`rounded-[2rem] border-2 shadow-2xl overflow-hidden ${minutesElapsed >= 55 ? "border-red-200" : minutesElapsed >= 50 ? "border-amber-200" : "border-emerald-200"}`}
      >
        <div
          className={`p-8 text-center ${bgGlow} transition-colors duration-500`}
        >
          <div className="inline-flex items-center justify-center p-3 bg-white rounded-2xl shadow-sm mb-6">
            <QrCode className="w-8 h-8 text-slate-800" />
          </div>

          <h2 className="text-xl font-bold text-slate-800 mb-1">
            {booking.rooms?.name || "Sua Sala"}
          </h2>

          <div className="flex items-center justify-center gap-2 mb-8 bg-white/50 w-fit mx-auto px-4 py-2 rounded-full border border-slate-200/50 backdrop-blur-sm">
            {statusIcon}
            <span className="text-sm font-black uppercase tracking-wider text-slate-700">
              {statusText}
            </span>
          </div>

          <div className="font-mono text-7xl md:text-8xl font-black text-slate-900 tracking-tighter tabular-nums mb-2">
            {formatTime(minutesElapsed)}:{formatTime(secondsReminder)}
          </div>
          <p className="text-slate-500 font-medium uppercase tracking-widest text-xs">
            Tempo de uso
          </p>
        </div>

        <div className="bg-white p-6 md:p-8 flex flex-col gap-4">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-2">
            <h4 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">
              Regras de Saída
            </h4>
            <ul className="text-sm text-slate-600 font-medium space-y-2">
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{" "}
                Até 50 min: Saída ideal.
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500"></span> 50 a
                55 min: Tolerância (Advertência).
              </li>
              <li className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500"></span> +55
                min: Multa de 1 hora.
              </li>
            </ul>
          </div>

          <Button
            onClick={handleCheckout}
            disabled={loading}
            className={`w-full h-16 rounded-2xl font-black text-lg text-white shadow-xl transition-all hover:scale-[1.02] ${statusColor}`}
          >
            {loading ? (
              <Loader2 className="w-6 h-6 animate-spin" />
            ) : (
              "Ler QR Code de Check-out"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
