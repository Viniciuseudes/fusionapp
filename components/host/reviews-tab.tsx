import { useState } from "react";
import {
  Star,
  ThumbsUp,
  Flag,
  MoreVertical,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import Image from "next/image";

interface Review {
  id: string;
  guestName: string;
  guestAvatar: string;
  spaceName: string;
  rating: number;
  comment: string;
  date: string;
  response?: string;
}

const mockReviews: Review[] = [
  {
    id: "1",
    guestName: "Dra. Maria Santos",
    guestAvatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
    spaceName: "Consultório Psicanálise",
    rating: 5,
    comment:
      "Espaço excelente! Muito bem equipado, isolamento acústico perfeito. A sala estava impecável.",
    date: "10 Nov 2025",
    response:
      "Obrigado pelo feedback, Dra. Maria! Ficamos felizes com a sua experiência.",
  },
  {
    id: "2",
    guestName: "Dr. João Pedro Silva",
    guestAvatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
    spaceName: "Sala de Reunião Premium",
    rating: 4,
    comment:
      "Ótimo ambiente, internet rápida e café incluído. Apenas o ar condicionado estava um pouco forte no início.",
    date: "08 Nov 2025",
  },
  {
    id: "3",
    guestName: "Dra. Ana Costa",
    guestAvatar:
      "https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&h=100&fit=crop",
    spaceName: "Consultório Padrão",
    rating: 5,
    comment: "Perfeito para os meus atendimentos. Limpo e organizado.",
    date: "05 Nov 2025",
  },
];

export function HostReviewsTab() {
  const [filter, setFilter] = useState<"all" | "5" | "4" | "3" | "2" | "1">(
    "all",
  );

  const averageRating = (
    mockReviews.reduce((sum, r) => sum + r.rating, 0) / mockReviews.length
  ).toFixed(1);
  const totalReviews = mockReviews.length;

  const ratingCounts = {
    5: mockReviews.filter((r) => r.rating === 5).length,
    4: mockReviews.filter((r) => r.rating === 4).length,
    3: mockReviews.filter((r) => r.rating === 3).length,
    2: mockReviews.filter((r) => r.rating === 2).length,
    1: mockReviews.filter((r) => r.rating === 1).length,
  };

  const filteredReviews =
    filter === "all"
      ? mockReviews
      : mockReviews.filter((r) => r.rating === parseInt(filter));

  const renderStars = (rating: number, size: "sm" | "lg" = "sm") => {
    const starSize = size === "sm" ? "w-4 h-4" : "w-6 h-6";
    return (
      <div className="flex gap-1">
        {[1, 2, 3, 4, 5].map((star) => (
          <Star
            key={star}
            className={`${starSize} ${star <= rating ? "text-amber-500 fill-amber-500" : "text-slate-200 fill-slate-200"}`}
          />
        ))}
      </div>
    );
  };

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
        {/* Resumo */}
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

        {/* Barras de Progresso */}
        <div className="md:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-slate-200 flex flex-col justify-center space-y-3">
          {[5, 4, 3, 2, 1].map((rating) => (
            <div key={rating} className="flex items-center gap-3">
              <span className="text-sm font-bold text-slate-600 w-3">
                {rating}
              </span>
              <Star className="w-4 h-4 text-amber-500 fill-amber-500 shrink-0" />
              <div className="flex-1 h-3 bg-slate-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-amber-500 rounded-full"
                  style={{
                    width: `${(ratingCounts[rating as keyof typeof ratingCounts] / totalReviews) * 100}%`,
                  }}
                />
              </div>
              <span className="text-xs font-bold text-slate-500 w-8 text-right">
                {ratingCounts[rating as keyof typeof ratingCounts]}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Filtros */}
      <div className="flex gap-2 overflow-x-auto pb-4 scrollbar-hide mb-2">
        <Button
          onClick={() => setFilter("all")}
          className={`rounded-xl font-bold px-6 ${filter === "all" ? "bg-primary text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
        >
          Todas
        </Button>
        {[5, 4, 3, 2, 1].map((rating) => (
          <Button
            key={rating}
            onClick={() => setFilter(rating.toString() as any)}
            className={`rounded-xl font-bold px-4 ${filter === rating.toString() ? "bg-primary text-white shadow-sm" : "bg-white text-slate-600 border border-slate-200 hover:bg-slate-50"}`}
          >
            <Star className="w-4 h-4 mr-1.5 fill-current" /> {rating}
          </Button>
        ))}
      </div>

      {/* Lista de Avaliações */}
      <div className="space-y-4">
        {filteredReviews.length > 0 ? (
          filteredReviews.map((review) => (
            <div
              key={review.id}
              className="bg-white rounded-2xl shadow-sm border border-slate-200 p-5 md:p-6"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="relative w-12 h-12 rounded-full overflow-hidden bg-slate-100">
                    {/* Imagem usando div para mock temporário, no projeto real usar Image do next */}
                    <img
                      src={review.guestAvatar}
                      alt={review.guestName}
                      className="object-cover w-full h-full"
                    />
                  </div>
                  <div>
                    <h3 className="font-black text-slate-900">
                      {review.guestName}
                    </h3>
                    <p className="text-xs font-medium text-slate-500">
                      {review.date} •{" "}
                      <span className="text-primary font-bold">
                        {review.spaceName}
                      </span>
                    </p>
                  </div>
                </div>
                {renderStars(review.rating)}
              </div>

              <p className="text-slate-700 font-medium text-sm leading-relaxed mb-4">
                {review.comment}
              </p>

              {review.response ? (
                <div className="bg-slate-50 border-l-4 border-primary p-4 rounded-r-xl mt-4">
                  <p className="text-xs font-black text-primary uppercase tracking-wider mb-1">
                    Sua Resposta:
                  </p>
                  <p className="text-sm text-slate-700 font-medium">
                    {review.response}
                  </p>
                </div>
              ) : (
                <div className="pt-4 border-t border-slate-100 mt-2">
                  <Button
                    variant="outline"
                    className="text-primary border-primary/20 hover:bg-primary/5 font-bold"
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
              Nenhuma avaliação encontrada com este filtro.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
