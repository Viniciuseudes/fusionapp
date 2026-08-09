"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";

interface ReviewModalProps {
  booking: any;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
}

export function ReviewModal({
  booking,
  isOpen,
  onClose,
  onSuccess,
}: ReviewModalProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [comment, setComment] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (rating === 0) {
      toast({
        variant: "destructive",
        title: "Atenção",
        description: "Por favor, selecione uma nota de 1 a 5 estrelas.",
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      const { error } = await supabase.from("reviews").insert({
        booking_id: booking.id,
        room_id: booking.room_id,
        guest_id: user?.id,
        rating,
        comment,
      });

      if (error) throw error;

      toast({
        title: "Avaliação enviada! 🎉",
        description: "Obrigado por ajudar a comunidade Fusion Clinic.",
      });
      onSuccess();
      onClose();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!booking) return null;

  return (
    // Removemos a lógica do onOpenChange que fechava sozinho
    <Dialog open={isOpen}>
      <DialogContent
        className="sm:max-w-md text-center"
        // BLINDAGEM DO MODAL: Impede fechamento ao clicar fora ou apertar ESC
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle className="text-2xl font-black text-center">
            Como foi sua experiência?
          </DialogTitle>
          <DialogDescription className="text-center text-slate-500">
            Avalie seu uso da sala{" "}
            <strong className="text-slate-900">{booking.rooms?.name}</strong>.
          </DialogDescription>
        </DialogHeader>

        <div className="py-6 flex flex-col items-center gap-6">
          {/* Estrelas Interativas */}
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                type="button"
                onMouseEnter={() => setHoverRating(star)}
                onMouseLeave={() => setHoverRating(0)}
                onClick={() => setRating(star)}
                className="transition-transform hover:scale-110 focus:outline-none"
              >
                <Star
                  className={`w-10 h-10 ${
                    star <= (hoverRating || rating)
                      ? "fill-amber-400 text-amber-400"
                      : "fill-slate-100 text-slate-200"
                  } transition-colors`}
                />
              </button>
            ))}
          </div>
          <span className="text-sm font-bold text-slate-400 uppercase tracking-wider">
            {rating === 1 && "Muito Ruim"}
            {rating === 2 && "Ruim"}
            {rating === 3 && "Regular"}
            {rating === 4 && "Muito Bom"}
            {rating === 5 && "Excelente!"}
            {rating === 0 && "Selecione uma nota"}
          </span>

          {/* Campo de Comentário */}
          <div className="w-full space-y-2 text-left">
            <label className="text-sm font-bold text-slate-700">
              Comentário (Opcional)
            </label>
            <Textarea
              placeholder="O ar-condicionado funcionou bem? A internet estava rápida?"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              className="resize-none h-24 bg-slate-50"
            />
          </div>
        </div>

        {/* BOTOES DE AÇÃO */}
        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSubmit}
            disabled={isSubmitting || rating === 0}
            className="w-full h-12 text-lg font-black bg-[#f05e23] hover:bg-[#d6521e] text-white"
          >
            {isSubmitting ? (
              <Loader2 className="w-5 h-5 animate-spin" />
            ) : (
              "Enviar Avaliação"
            )}
          </Button>

          <Button
            onClick={onClose}
            disabled={isSubmitting}
            variant="ghost"
            className="w-full h-12 font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50"
          >
            Pular avaliação
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
