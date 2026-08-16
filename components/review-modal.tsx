"use client";

import { useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  roomId: string;
  roomName?: string;
  onSuccess: () => void;
}

export function ReviewModal({
  isOpen,
  onClose,
  bookingId,
  roomId,
  roomName,
  onSuccess,
}: ReviewModalProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  // LÓGICA SÊNIOR: Pular Avaliação
  const handleSkip = () => {
    // Salva no cache do celular que essa reserva específica já foi ignorada
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
        showCloseButton={false} // Remove o (X) do topo
        onPointerDownOutside={(e) => e.preventDefault()} // Impede fechar clicando fora
        onEscapeKeyDown={(e) => e.preventDefault()} // Impede fechar apertando ESC
        className="sm:max-w-md p-0 overflow-hidden border-0 rounded-3xl"
      >
        <div className="bg-slate-900 p-6 text-center text-white relative">
          <DialogTitle className="text-2xl font-black mb-2">
            Como foi sua experiência?
          </DialogTitle>
          <p className="text-sm font-medium text-slate-300">
            Sua opinião sobre a sala{" "}
            <strong className="text-white">{roomName || "utilizada"}</strong>{" "}
            ajuda outros profissionais.
          </p>
        </div>

        <div className="p-6 bg-white flex flex-col items-center">
          <div className="flex gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setRating(star)}
                className={`transition-all hover:scale-110 ${
                  rating >= star ? "text-amber-400" : "text-slate-200"
                }`}
              >
                <Star
                  className={`w-10 h-10 ${rating >= star ? "fill-amber-400" : ""}`}
                />
              </button>
            ))}
          </div>

          <div className="w-full space-y-4">
            <Textarea
              placeholder="O que você achou do espaço? (Opcional)"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="bg-slate-50 border-slate-200 resize-none h-24 rounded-xl"
            />

            <div className="flex flex-col gap-2 pt-2">
              <Button
                onClick={handleSubmit}
                disabled={loading || rating === 0}
                className="w-full h-12 rounded-xl font-black bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg shadow-orange-500/20"
              >
                {loading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Enviar Avaliação"
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
