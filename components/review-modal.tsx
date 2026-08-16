"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, CalendarDays, MapPin } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  roomId: string;
  roomName?: string;
  bookingDate?: string; // NOVO: Prop para receber a data da reserva
  onSuccess: () => void;
}

export function ReviewModal({
  isOpen,
  onClose,
  bookingId,
  roomId,
  roomName,
  bookingDate,
  onSuccess,
}: ReviewModalProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  // LÓGICA SÊNIOR: Salva no cache do aparelho que essa reserva já foi ignorada
  const handleSkip = () => {
    if (bookingId) {
      localStorage.setItem(`fusion_review_skipped_${bookingId}`, "true");
    }
    onClose();
  };

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({
        variant: "destructive",
        title: "Nota obrigatória",
        description: "Por favor, selecione de 1 a 5 estrelas.",
      });
      return;
    }

    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { error } = await supabase.from("reviews").insert({
        booking_id: bookingId,
        room_id: roomId,
        guest_id: user.id,
        rating,
        comment,
      });

      if (error) throw error;

      toast({
        title: "Avaliação enviada! 🌟",
        description: "Muito obrigado pelo seu feedback.",
      });

      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao enviar",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent
        showCloseButton={false} // Remove o (X)
        onPointerDownOutside={(e) => e.preventDefault()} // Impede fechar clicando fora
        onEscapeKeyDown={(e) => e.preventDefault()} // Impede fechar apertando ESC
        className="sm:max-w-md p-0 overflow-hidden border-0 rounded-[2rem] bg-white shadow-2xl"
      >
        <div className="p-8 text-center flex flex-col items-center">
          {/* Header Visual Clean */}
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <Star className="w-8 h-8 text-[#f05e23] fill-[#f05e23]" />
          </div>

          <DialogTitle className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
            Como foi sua experiência?
          </DialogTitle>
          <p className="text-sm font-medium text-slate-500 mb-6 px-4">
            Sua opinião é fundamental para mantermos o alto padrão dos nossos
            espaços.
          </p>

          {/* CARD DE CONTEXTO (Heurística de UX) */}
          <div className="w-full bg-slate-50 border border-slate-100 rounded-2xl p-4 mb-8 flex items-center gap-4 text-left">
            <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shadow-sm shrink-0 border border-slate-100">
              <CalendarDays className="w-5 h-5 text-slate-400" />
            </div>
            <div className="flex-1 overflow-hidden">
              <p className="font-black text-slate-900 truncate">
                {roomName || "Espaço Fusion"}
              </p>
              <p className="text-xs font-bold text-slate-500 capitalize flex items-center gap-1 mt-0.5">
                {bookingDate
                  ? format(parseISO(bookingDate), "EEE, dd/MM 'às' HH:mm", {
                      locale: ptBR,
                    })
                  : "Data da sessão não informada"}
              </p>
            </div>
          </div>

          {/* Área de Estrelas (Interativa) */}
          <div
            className="flex gap-2 mb-6"
            onMouseLeave={() => setHoveredRating(0)}
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = (hoveredRating || rating) >= star;
              return (
                <button
                  key={star}
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  className={`transition-all duration-200 transform ${
                    isFilled
                      ? "scale-110 text-amber-400"
                      : "scale-100 text-slate-200 hover:text-amber-200"
                  }`}
                >
                  <Star
                    className={`w-12 h-12 ${isFilled ? "fill-amber-400" : ""}`}
                  />
                </button>
              );
            })}
          </div>

          <div className="w-full space-y-4">
            <Textarea
              placeholder="Deixe um comentário elogiando ou sugerindo melhorias... (Opcional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="bg-slate-50 border-slate-200 resize-none h-24 rounded-xl text-sm placeholder:text-slate-400 focus-visible:ring-[#f05e23]/20"
            />

            <div className="flex flex-col gap-2 pt-4">
              <Button
                onClick={handleSubmit}
                disabled={loading || rating === 0}
                className={`w-full h-14 rounded-xl font-black shadow-lg transition-all text-base ${
                  rating > 0
                    ? "bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-orange-500/20"
                    : "bg-slate-100 text-slate-400 shadow-none"
                }`}
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Avaliar Espaço"
                )}
              </Button>

              <Button
                onClick={handleSkip}
                variant="ghost"
                className="w-full h-12 rounded-xl font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
              >
                Pular avaliação
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
