"use client";

import { useState, useEffect, useMemo } from "react";
import { Star, Loader2, Check, MessageSquare } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface Review {
  id: string;
  rating: number;
  comment: string;
  host_reply: string | null;
  created_at: string;
  guest_name: string;
  guest_avatar: string;
  room_name: string;
}

export function HostReviewsTab() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [reviews, setReviews] = useState<Review[]>([]);
  const [filter, setFilter] = useState<"all" | "5" | "4" | "3" | "2" | "1">(
    "all",
  );

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);

  useEffect(() => {
    async function fetchReviews() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Pega todas as salas que pertencem a este Host
        const { data: myRooms, error: roomsErr } = await supabase
          .from("rooms")
          .select("id, name")
          .eq("host_id", user.id);

        if (roomsErr) throw roomsErr;
        if (!myRooms || myRooms.length === 0) {
          setReviews([]);
          return;
        }

        const roomIds = myRooms.map((r) => r.id);

        // 2. Busca direto as avaliações dessas salas, pois a tabela possui room_id e guest_id
        const { data: myReviews, error: reviewsErr } = await supabase
          .from("reviews")
          .select(
            "id, rating, comment, host_reply, created_at, room_id, guest_id",
          )
          .in("room_id", roomIds)
          .order("created_at", { ascending: false });

        if (reviewsErr) throw reviewsErr;
        if (!myReviews || myReviews.length === 0) {
          setReviews([]);
          return;
        }

        // 3. Pega os IDs únicos de quem avaliou
        const guestIds = [
          ...new Set(myReviews.map((r) => r.guest_id).filter(Boolean)),
        ];
        let guestProfiles: any[] = [];

        // 4. Busca os nomes dos profissionais na tabela profiles (sem pedir avatar_url)
        if (guestIds.length > 0) {
          const { data: profilesData, error: profilesErr } = await supabase
            .from("profiles")
            .select("id, full_name")
            .in("id", guestIds);

          if (profilesErr) throw profilesErr;
          guestProfiles = profilesData || [];
        }

        // 5. Monta o objeto perfeito pro Frontend
        const formattedReviews: Review[] = myReviews.map((r: any) => {
          const room = myRooms.find((rm) => rm.id === r.room_id);
          const guest = guestProfiles.find((p) => p.id === r.guest_id);
          const guestName = guest?.full_name || "Profissional";

          return {
            id: r.id,
            rating: r.rating || 5,
            comment: r.comment || "",
            host_reply: r.host_reply || null,
            created_at: format(new Date(r.created_at), "dd MMM yyyy", {
              locale: ptBR,
            }),
            guest_name: guestName,
            // Gera um avatar dinâmico com as iniciais do nome, já que não temos foto no banco
            guest_avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(guestName)}&background=f05e23&color=fff`,
            room_name: room?.name || "Sala Excluída",
          };
        });

        setReviews(formattedReviews);
      } catch (err: any) {
        console.error("Erro na busca de avaliações:", err);
        toast({
          variant: "destructive",
          title: "Erro",
          description: "Não foi possível carregar as avaliações no momento.",
        });
      } finally {
        setLoading(false);
      }
    }

    fetchReviews();
  }, [supabase, toast]);

  const handleSubmitReply = async (reviewId: string) => {
    if (!replyText.trim()) return;

    setIsSubmittingReply(true);
    try {
      const { error } = await supabase
        .from("reviews")
        .update({ host_reply: replyText })
        .eq("id", reviewId);

      if (error) throw error;

      setReviews((prev) =>
        prev.map((r) =>
          r.id === reviewId ? { ...r, host_reply: replyText } : r,
        ),
      );

      toast({
        title: "Resposta enviada!",
        description: "Seu comentário agora está público nesta avaliação.",
      });

      setReplyingTo(null);
      setReplyText("");
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao responder",
        description: err.message,
      });
    } finally {
      setIsSubmittingReply(false);
    }
  };

  const totalReviews = reviews.length;
  const averageRating =
    totalReviews > 0
      ? (reviews.reduce((sum, r) => sum + r.rating, 0) / totalReviews).toFixed(
          1,
        )
      : "0.0";

  const ratingCounts = useMemo(() => {
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    reviews.forEach((r) => {
      if (r.rating >= 1 && r.rating <= 5) {
        counts[r.rating as keyof typeof ratingCounts]++;
      }
    });
    return counts;
  }, [reviews]);

  const filteredReviews =
    filter === "all"
      ? reviews
      : reviews.filter((r) => r.rating === parseInt(filter));

  const renderStars = (rating: number, size: "sm" | "lg" = "sm") => {
    const starSize = size === "sm" ? "w-4 h-4" : "w-6 h-6";
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${starSize} ${
              star <= rating
                ? "text-amber-500 fill-amber-500"
                : "text-slate-200 fill-slate-200"
            }`}
          />
        ))}
      </div>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-5xl mx-auto w-full pb-32">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 mb-2">Avaliações</h1>
        <p className="text-sm text-slate-500 font-medium">
          Veja o que os profissionais dizem sobre as suas salas e responda aos
          comentários.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
        <div className="bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col items-center justify-center text-center">
          <p className="text-5xl font-black text-slate-900 mb-2">
            {averageRating}
          </p>
          <div className="mb-2">
            {renderStars(Math.round(parseFloat(averageRating)), "lg")}
          </div>
          <p className="text-slate-500 font-medium text-sm">
            {totalReviews} avaliações no total
          </p>
        </div>

        <div className="md:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-center space-y-3">
          {[5, 4, 3, 2, 1].map((rating) => {
            const count = ratingCounts[rating as keyof typeof ratingCounts];
            const percentage =
              totalReviews > 0 ? (count / totalReviews) * 100 : 0;

            return (
              <div key={rating} className="flex items-center gap-3">
                <span className="text-sm font-bold text-slate-600 w-3">
                  {rating}
                </span>
                <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
                <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-amber-500 rounded-full transition-all duration-1000"
                    style={{ width: `${percentage}%` }}
                  />
                </div>
                <span className="text-xs font-bold text-slate-500 w-8 text-right">
                  {count}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-2">
        <Button
          onClick={() => setFilter("all")}
          className={`rounded-xl font-bold px-6 ${
            filter === "all"
              ? "bg-[#f05e23] text-white shadow-sm"
              : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
          }`}
        >
          Todas
        </Button>
        {[5, 4, 3, 2, 1].map((rating) => (
          <Button
            key={rating}
            onClick={() => setFilter(rating.toString() as any)}
            className={`rounded-xl font-bold px-4 ${
              filter === rating.toString()
                ? "bg-[#f05e23] text-white shadow-sm"
                : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            <Star className="w-4 h-4 mr-1.5 fill-current" /> {rating}
          </Button>
        ))}
      </div>

      <div className="space-y-4">
        {filteredReviews.length > 0 ? (
          filteredReviews.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-100 shrink-0">
                    <img
                      src={review.guest_avatar}
                      alt={review.guest_name}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900">
                      {review.guest_name}
                    </h3>
                    <p className="text-xs font-medium text-slate-500">
                      {review.created_at} •{" "}
                      <span className="text-[#f05e23] font-bold">
                        {review.room_name}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="hidden sm:block">
                  {renderStars(review.rating)}
                </div>
              </div>

              <div className="sm:hidden mb-3">{renderStars(review.rating)}</div>

              <p className="text-slate-700 font-medium text-sm leading-relaxed mb-4">
                {review.comment || (
                  <span className="italic text-slate-400">
                    Nenhum comentário deixado, apenas a nota.
                  </span>
                )}
              </p>

              {review.host_reply ? (
                <div className="bg-slate-50 border-l-4 border-[#f05e23] p-4 rounded-r-xl mt-4">
                  <p className="text-xs font-black text-[#f05e23] uppercase tracking-wider mb-1">
                    Sua Resposta:
                  </p>
                  <p className="text-sm text-slate-700 font-medium">
                    {review.host_reply}
                  </p>
                </div>
              ) : replyingTo === review.id ? (
                <div className="pt-4 border-t border-slate-100 mt-4 space-y-3 animate-in fade-in">
                  <Textarea
                    placeholder="Escreva sua resposta de forma educada e profissional..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="min-h-[100px] bg-slate-50 resize-none"
                    autoFocus
                  />
                  <div className="flex justify-end gap-2">
                    <Button
                      variant="ghost"
                      onClick={() => {
                        setReplyingTo(null);
                        setReplyText("");
                      }}
                      disabled={isSubmittingReply}
                    >
                      Cancelar
                    </Button>
                    <Button
                      onClick={() => handleSubmitReply(review.id)}
                      disabled={!replyText.trim() || isSubmittingReply}
                      className="bg-[#f05e23] hover:bg-[#d6521e] text-white font-bold"
                    >
                      {isSubmittingReply ? (
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                      ) : (
                        <Check className="w-4 h-4 mr-2" />
                      )}
                      Publicar Resposta
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="pt-4 border-t border-slate-100 mt-2">
                  <Button
                    variant="outline"
                    onClick={() => setReplyingTo(review.id)}
                    className="text-[#f05e23] border-[#f05e23]/20 hover:bg-[#f05e23]/5 font-bold"
                  >
                    <MessageSquare className="w-4 h-4 mr-2" /> Responder
                    Avaliação
                  </Button>
                </div>
              )}
            </div>
          ))
        ) : (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 border-dashed">
            <Star className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              Nenhuma avaliação encontrada para os seus espaços.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
