// components/review-modal.tsx
"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Star, Loader2, CalendarDays } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  bookingId: string;
  siblingBookingIds?: string[]; // Todos os IDs de horários da mesma sessão/reserva
  roomId: string;
  roomName?: string;
  bookingDate?: string;
  onSuccess: () => void;
}

export const SKIPPED_REVIEWS_LIST_KEY = "fusion_skipped_reviews_list_v2";

export function markBookingsReviewHandledLocal(
  bookingIds: string[],
  roomId?: string,
  bookingDate?: string,
) {
  if (typeof window === "undefined") return;
  try {
    const rawList = localStorage.getItem(SKIPPED_REVIEWS_LIST_KEY);
    const parsedList: string[] = rawList ? JSON.parse(rawList) : [];
    const set = new Set<string>(Array.isArray(parsedList) ? parsedList : []);

    bookingIds.filter(Boolean).forEach((id) => {
      localStorage.setItem(`fusion_review_skipped_${id}`, "true");
      set.add(id);
    });

    if (roomId && bookingDate) {
      const dayKey = `${roomId}_${bookingDate.slice(0, 10)}`;
      localStorage.setItem(`fusion_review_skipped_session_${dayKey}`, "true");
      set.add(dayKey);
    }

    localStorage.setItem(
      SKIPPED_REVIEWS_LIST_KEY,
      JSON.stringify(Array.from(set).slice(-300)),
    );
  } catch {}
}

export function ReviewModal({
  isOpen,
  onClose,
  bookingId,
  siblingBookingIds = [],
  roomId,
  roomName,
  bookingDate,
  onSuccess,
}: ReviewModalProps) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();
  const [rating, setRating] = useState(0);
  const [hoveredRating, setHoveredRating] = useState(0);
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(false);

  // Sinaliza no DOM quando o modal de avaliação está aberto para bloquear qualquer banner promocional por cima
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (isOpen) {
      document.documentElement.setAttribute("data-fusion-review-open", "true");
    } else {
      document.documentElement.removeAttribute("data-fusion-review-open");
    }
    return () => {
      document.documentElement.removeAttribute("data-fusion-review-open");
    };
  }, [isOpen]);

  const persistHandledIdsEverywhere = async () => {
    const allIds = Array.from(
      new Set([bookingId, ...siblingBookingIds].filter(Boolean)),
    );
    const sessionKey =
      roomId && bookingDate ? `${roomId}_${bookingDate.slice(0, 10)}` : null;

    // 1. Salva imediatamente no armazenamento local do dispositivo
    markBookingsReviewHandledLocal(allIds, roomId, bookingDate);

    // 2. Salva também nos metadados do usuário no Supabase (para nunca voltar mesmo limpando cache ou trocando de aparelho)
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        const existingSkipped: string[] = Array.isArray(
          user.user_metadata?.skipped_review_ids,
        )
          ? user.user_metadata.skipped_review_ids
          : [];
        const merged = Array.from(
          new Set([
            ...existingSkipped,
            ...allIds,
            ...(sessionKey ? [sessionKey] : []),
          ]),
        ).slice(-200);

        await supabase.auth.updateUser({
          data: { skipped_review_ids: merged },
        });
      }
    } catch {}
  };

  // Quando o profissional clica em "Pular avaliação", dispensa definitivamente todas as horas daquela reserva
  const handleSkip = () => {
    persistHandledIdsEverywhere();
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

      // Marca todas as horas irmãs da mesma sessão como já avaliadas para não perguntar novamente
      await persistHandledIdsEverywhere();

      toast({
        title: "Avaliação enviada",
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
        data-fusion-review-modal="true"
        showCloseButton={false}
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        className="sm:max-w-md p-0 overflow-hidden border-0 rounded-[2rem] bg-white shadow-2xl z-[10050]"
      >
        <div className="p-8 text-center flex flex-col items-center">
          <div className="w-16 h-16 bg-orange-50 rounded-full flex items-center justify-center mb-6 shadow-inner">
            <Star className="w-8 h-8 text-[#BF4B24] fill-[#BF4B24]" />
          </div>

          <DialogTitle className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
            Como foi sua experiência?
          </DialogTitle>
          <p className="text-sm font-medium text-slate-500 mb-6 px-4">
            Sua opinião é fundamental para mantermos o alto padrão dos nossos
            espaços.
          </p>

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

          <div
            className="flex gap-2 mb-6"
            onMouseLeave={() => setHoveredRating(0)}
          >
            {[1, 2, 3, 4, 5].map((star) => {
              const isFilled = (hoveredRating || rating) >= star;
              return (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoveredRating(star)}
                  className={`transition-all duration-200 transform cursor-pointer ${
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
              className="bg-slate-50 border-slate-200 resize-none h-24 rounded-xl text-sm placeholder:text-slate-400 focus-visible:ring-[#BF4B24]/20"
            />

            <div className="flex flex-col gap-2 pt-4">
              <Button
                type="button"
                onClick={handleSubmit}
                disabled={loading || rating === 0}
                className={`w-full h-14 rounded-xl font-black shadow-lg transition-all text-base cursor-pointer ${
                  rating > 0
                    ? "bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-orange-500/20"
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
                type="button"
                onClick={handleSkip}
                variant="ghost"
                className="w-full h-12 rounded-xl font-bold text-slate-400 hover:text-slate-600 hover:bg-slate-50 cursor-pointer"
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
