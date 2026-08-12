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
  Clock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { createClient } from "@/utils/supabase/client";

// Importamos a nossa câmera blindada
import { RoomQRScanner } from "@/components/qr-scanner";

interface ActiveSessionProps {
  booking: any;
  onSessionEnd: () => void;
}

export function ActiveSession({ booking, onSessionEnd }: ActiveSessionProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(false);
  const [secondsElapsed, setSecondsElapsed] = useState(0);
  const [sessionPhase, setSessionPhase] = useState<
    "early" | "running" | "overtime"
  >("early");

  // Controle da Câmera de Check-out
  const [showScanner, setShowScanner] = useState(false);

  // ==========================================
  // MOTOR SÊNIOR DE CÁLCULO DE TEMPO & HARDWARE LOCK
  // Resolve o problema de Check-in Adiantado, resiste ao F5 e PROÍBE re-renderização se a câmera abrir
  // ==========================================
  useEffect(() => {
    // A MÁGICA: Se o Scanner abriu, trava o relógio! Isso impede que o React interrompa a câmera no celular
    if (!booking || showScanner) return;

    const interval = setInterval(() => {
      const now = new Date();
      const startTime = parseISO(booking.start_time);
      const endTime = parseISO(booking.end_time);

      if (now < startTime) {
        // FASE 1: Check-in antecipado (ex: Chegou 11:45 para sessão de 12:00)
        // O tempo DEVE ficar cravado em 0. O médico não perde minutos por ter chegado cedo.
        setSessionPhase("early");
        setSecondsElapsed(0);
      } else if (now >= startTime && now <= endTime) {
        // FASE 2: Sessão rolando oficialmente.
        // Calculamos a diferença entre AGORA e a HORA DE INÍCIO OFICIAL (start_time), ignorando o clique.
        setSessionPhase("running");
        setSecondsElapsed(differenceInSeconds(now, startTime));
      } else {
        // FASE 3: Estourou o tempo.
        setSessionPhase("overtime");
        setSecondsElapsed(differenceInSeconds(now, startTime));
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [booking, showScanner]); // O showScanner é a dependência que trava o relógio

  const minutesElapsed = Math.floor(secondsElapsed / 60);
  const secondsReminder = secondsElapsed % 60;

  // Como o booking pode ser uma "Mescla" de várias sessões, nós precisamos somar o tempo real.
  // Uma sessão padrão tem 60 minutos de intervalo de agenda, então o "estouro" de tolerância
  // acontece nos 5 min finais.
  const totalSessionMinutes =
    differenceInSeconds(
      parseISO(booking.end_time),
      parseISO(booking.start_time),
    ) / 60;
  const warningThreshold = totalSessionMinutes - 10; // 50 min em uma sessão de 1h
  const fineThreshold = totalSessionMinutes - 5; // 55 min em uma sessão de 1h

  let statusColor = "bg-emerald-500";
  let bgGlow = "bg-emerald-50";
  let statusText = "Sessão em andamento";
  let statusIcon = <CheckCircle2 className="w-5 h-5 text-emerald-500" />;

  // Se for Check-in antecipado, sobrescreve o visual
  if (sessionPhase === "early") {
    statusColor = "bg-blue-500";
    bgGlow = "bg-blue-50";
    statusText = "Aguardando Início Oficial";
    statusIcon = <Clock className="w-5 h-5 text-blue-500" />;
  } else if (
    minutesElapsed >= warningThreshold &&
    minutesElapsed < fineThreshold
  ) {
    statusColor = "bg-amber-500";
    bgGlow = "bg-amber-50";
    statusText = "Tolerância de Limpeza. Faça o Check-out.";
    statusIcon = <AlertTriangle className="w-5 h-5 text-amber-500" />;
  } else if (minutesElapsed >= fineThreshold) {
    statusColor = "bg-red-500";
    bgGlow = "bg-red-50";
    statusText = "Atraso! Sujeito a multa e bloqueio.";
    statusIcon = <AlertOctagon className="w-5 h-5 text-red-500" />;
  }

  // Check-out Multi-Sessões
  const processCheckout = async () => {
    setLoading(true);
    setShowScanner(false);
    try {
      let penalty = "none";
      let amount = 0;

      if (
        minutesElapsed >= warningThreshold &&
        minutesElapsed < fineThreshold
      ) {
        penalty = "warning";
      } else if (minutesElapsed >= fineThreshold) {
        penalty = "fined";
        amount = booking.total_cost > 0 ? booking.total_cost : 45; // Mantivemos sua regra de negócios original
      }

      const checkoutTime = new Date().toISOString();
      const idsToUpdate = booking.original_ids || [booking.id];

      // ATUALIZAÇÃO SÊNIOR EM LOTE
      const { error } = await supabase
        .from("bookings")
        .update({
          checkout_time: checkoutTime,
          status: "completed",
          penalty_status: penalty,
          // A penalidade (fined) é aplicada uniformemente ou fracionada, mas o supabase fará o update pra todas.
          penalty_amount: amount / idsToUpdate.length,
        })
        .in("id", idsToUpdate);

      if (error) throw error;

      if (penalty === "fined") {
        toast({
          variant: "destructive",
          title: "Check-out com Atraso",
          description: "O tempo limite foi excedido. Uma multa será aplicada.",
        });
      } else if (penalty === "warning") {
        toast({
          title: "Atenção ao horário",
          description: "Você saiu no limite da tolerância de limpeza.",
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
      setLoading(false);
    }
  };

  return (
    <>
      <div className="max-w-2xl mx-auto w-full p-4 mt-6 animate-in zoom-in-95 duration-500">
        <div
          className={`rounded-[2rem] border-2 shadow-2xl overflow-hidden transition-all duration-300 ${showScanner ? "scale-95 opacity-50 blur-sm" : ""} ${minutesElapsed >= fineThreshold ? "border-red-200" : minutesElapsed >= warningThreshold ? "border-amber-200" : sessionPhase === "early" ? "border-blue-200" : "border-emerald-200"}`}
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
              {minutesElapsed.toString().padStart(2, "0")}:
              {secondsReminder.toString().padStart(2, "0")}
            </div>

            {sessionPhase === "early" ? (
              <p className="text-blue-600 font-bold uppercase tracking-widest text-xs animate-pulse">
                O cronômetro iniciará às{" "}
                {format(parseISO(booking.start_time), "HH:mm")}
              </p>
            ) : (
              <p className="text-slate-500 font-medium uppercase tracking-widest text-xs">
                Tempo de uso
              </p>
            )}
          </div>

          <div className="bg-white p-6 md:p-8 flex flex-col gap-4">
            <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 mb-2">
              <h4 className="text-xs font-bold uppercase text-slate-400 mb-2 tracking-wider">
                Regras de Saída
              </h4>
              <ul className="text-sm text-slate-600 font-medium space-y-2">
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-500"></span>{" "}
                  Saia até os últimos 10 min: Limpeza ideal.
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                  Últimos 10 min: Tolerância (Advertência).
                </li>
                <li className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                  Estouro do relógio: Multa no sistema.
                </li>
              </ul>
            </div>

            <Button
              onClick={() => setShowScanner(true)}
              disabled={loading || sessionPhase === "early"}
              className={`w-full h-16 rounded-2xl font-black text-lg text-white shadow-xl transition-all hover:scale-[1.02] ${statusColor}`}
            >
              {loading ? (
                <Loader2 className="w-6 h-6 animate-spin" />
              ) : sessionPhase === "early" ? (
                "Aguarde o início da sessão..."
              ) : (
                "Ler QR Code de Saída"
              )}
            </Button>
          </div>
        </div>
      </div>

      {showScanner && (
        <RoomQRScanner
          key="checkout-scanner"
          expectedRoomId={booking.room_id}
          type="checkout"
          onSuccess={processCheckout}
          onCancel={() => setShowScanner(false)}
        />
      )}
    </>
  );
}
