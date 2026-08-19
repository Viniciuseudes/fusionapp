"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Star, MapPin, Heart, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";

interface FavoritesTabProps {
  onOpenRoom: (room: any) => void;
}

export function FavoritesTab({ onOpenRoom }: FavoritesTabProps) {
  const supabase = createClient();
  const [favoritedRooms, setFavoritedRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [isAuthenticated, setIsAuthenticated] = useState(true);

  useEffect(() => {
    async function fetchFavorites() {
      try {
        setLoading(true);
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();

        if (userError || !user) {
          setIsAuthenticated(false);
          setLoading(false);
          return;
        }

        setIsAuthenticated(true);

        const { data, error } = await supabase
          .from("favorites")
          .select(
            `
            id,
            room_id,
            rooms (
              id,
              name,
              image_url,
              address_details,
              is_partner,
              is_active,
              is_paused
            )
          `,
          )
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;

        if (data) {
          const mappedRooms = data
            .map((item: any) => ({ ...item.rooms, favorite_id: item.id }))
            .filter(Boolean);

          setFavoritedRooms(mappedRooms);
        }
      } catch (err) {
        console.error("Erro ao buscar favoritos:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchFavorites();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center pt-32 pb-20">
        <Loader2 className="h-8 w-8 animate-spin text-[#f05e23]" />
        <p className="text-sm font-medium text-slate-500 mt-4">
          Buscando seus espaços favoritos...
        </p>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="flex flex-col items-center justify-center pt-32 pb-20 px-6 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-orange-50 mb-4">
          <Heart className="h-8 w-8 text-[#f05e23]" />
        </div>
        <h2 className="text-lg font-bold text-slate-900 mb-2">
          Faça login para ver seus favoritos
        </h2>
        <p className="text-sm text-slate-500">
          Você precisa estar conectado para salvar e acessar os espaços que mais
          gostou.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-20 lg:pb-6 animate-in fade-in duration-300">
      <div className="px-5 pt-6 pb-4 lg:px-8 border-b border-slate-100 mb-2 bg-white sticky top-0 z-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-2xl font-black text-slate-900">Favoritos</h1>
          <p className="text-sm font-medium text-slate-500 mt-1">
            {favoritedRooms.length}{" "}
            {favoritedRooms.length === 1 ? "espaço salvo" : "espaços salvos"}
          </p>
        </div>
      </div>

      <div className="px-4 lg:px-8 mt-2">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {favoritedRooms.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-50">
                <Heart className="h-8 w-8 text-slate-300" />
              </div>
              <p className="text-slate-500 font-medium">
                Nenhum espaço favoritado ainda.
              </p>
            </div>
          ) : (
            favoritedRooms.map((room) => {
              let address = room.address_details || {};
              if (typeof address === "string") {
                try {
                  address = JSON.parse(address);
                } catch (e) {
                  address = {};
                }
              }

              const locationStr = address.city
                ? `${address.neighborhood ? address.neighborhood + " - " : ""}${address.city}`
                : "Localização sob consulta";

              const basePrice = Number(address.pricing?.hourly || 45)
                .toFixed(2)
                .replace(".", ",");

              const isAvailable = room.is_active && !room.is_paused;

              return (
                <button
                  key={room.favorite_id || room.id}
                  onClick={() => isAvailable && onOpenRoom(room)}
                  disabled={!isAvailable}
                  className={`flex gap-3 rounded-2xl border bg-white p-3 text-left transition-all group ${
                    isAvailable
                      ? "border-slate-100 shadow-sm hover:shadow-md hover:border-slate-200 cursor-pointer"
                      : "border-slate-200 opacity-80 grayscale cursor-not-allowed"
                  }`}
                >
                  <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-xl bg-slate-100">
                    {room.image_url ? (
                      <Image
                        src={room.image_url}
                        alt={room.name || "Sala"}
                        fill
                        className={`object-cover ${isAvailable ? "group-hover:scale-105 transition-transform duration-300" : ""}`}
                        sizes="112px"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center text-slate-300">
                        Sem foto
                      </div>
                    )}

                    {!isAvailable && (
                      <div className="absolute inset-0 bg-slate-900/50 z-10 flex items-center justify-center">
                        <span className="bg-slate-900 text-white text-[9px] font-black px-2 py-1 rounded-md uppercase tracking-wider shadow-sm">
                          Indisponível
                        </span>
                      </div>
                    )}
                  </div>

                  <div className="flex flex-1 flex-col py-0.5 min-w-0">
                    <h3
                      className={`text-sm font-bold truncate pr-4 ${isAvailable ? "text-slate-900" : "text-slate-600"}`}
                    >
                      {room.name}
                    </h3>

                    <div className="flex items-center gap-1.5 text-[11px] font-medium text-slate-500 mt-1 truncate">
                      <MapPin
                        className={`h-3 w-3 shrink-0 ${isAvailable ? "text-[#f05e23]" : "text-slate-400"}`}
                      />
                      <span className="truncate">{locationStr}</span>
                    </div>

                    <div className="flex items-center gap-1 mt-1.5">
                      <Star
                        className={`h-3.5 w-3.5 ${isAvailable ? "fill-amber-400 text-amber-400" : "fill-slate-400 text-slate-400"}`}
                      />
                      <span className="text-xs font-bold text-slate-700">
                        5.0
                      </span>
                      <span className="text-[10px] font-medium text-slate-400">
                        (124)
                      </span>
                    </div>

                    <p className="mt-auto text-xs">
                      <span
                        className={`font-black text-lg ${isAvailable ? "text-slate-900" : "text-slate-500"}`}
                      >
                        R$ {basePrice}
                      </span>
                      <span className="text-slate-400 font-medium"> /hora</span>
                    </p>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
