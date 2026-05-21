"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  SlidersHorizontal,
  Star,
  MapPin,
  Bell,
  Heart,
  Loader2,
} from "lucide-react";
import { Input } from "@/components/ui/input";

// Definimos os tipos diretamente aqui para nos livrarmos do mock-data
export type RentalType = "hora" | "turno" | "fixo";

export interface Room {
  id: string;
  name: string;
  category: string;
  pricePerHour: number;
  image: string;
  rating: string;
  distance: string;
}

const rentalTypes: { id: RentalType; label: string }[] = [
  { id: "hora", label: "Por Hora" },
  { id: "turno", label: "Turno" },
  { id: "fixo", label: "Fixo" },
];

interface SearchTabProps {
  onOpenRoom?: (room: Room) => void;
}

export function SearchTab({ onOpenRoom }: SearchTabProps) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();

  const isPublic = pathname === "/";

  // Estados de UI
  const [searchQuery, setSearchQuery] = useState("");
  const [rentalType, setRentalType] = useState<RentalType>("hora");
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  // Estados de Dados (Supabase)
  const [dbRooms, setDbRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState({
    name: "",
    balance: 0,
    notifications: 0,
    location: "Natal, RN",
  });
  const [loading, setLoading] = useState(true);

  // O EFEITO MÁGICO: Vai à base de dados buscar tudo ao carregar a página
  useEffect(() => {
    async function fetchData() {
      // 1. Buscar as Salas Ativas e as suas Categorias de Preço
      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select(
          `
          id,
          name,
          image_url,
          room_categories (
            name,
            credit_cost_per_hour
          )
        `,
        )
        .eq("is_active", true);

      if (roomsData) {
        const formattedRooms = roomsData.map((r: any) => ({
          id: r.id,
          name: r.name,
          category: r.room_categories.name,
          pricePerHour: r.room_categories.credit_cost_per_hour,
          image: r.image_url,
          rating: "5.0", // Fixo por agora até termos sistema de avaliações
          distance: "2.5 km", // Fixo por agora
        }));
        setDbRooms(formattedRooms);
      }

      // 2. Se estiver logado, buscar o Nome e o Saldo da Carteira
      if (!isPublic) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          // Busca o perfil
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();

          // Calcula o saldo somando as transações da carteira
          const { data: walletData } = await supabase
            .from("wallet_transactions")
            .select("amount")
            .eq("user_id", user.id);

          const balance = walletData
            ? walletData.reduce((acc, curr) => acc + Number(curr.amount), 0)
            : 0;

          setProfile((prev) => ({
            ...prev,
            name: profileData?.full_name || "Doutor(a)",
            balance: balance,
          }));
        }
      }
      setLoading(false);
    }

    fetchData();
  }, [isPublic, supabase]);

  function toggleFavorite(e: React.MouseEvent, roomId: string) {
    e.stopPropagation();

    if (isPublic) {
      router.push("/login");
      return;
    }

    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  // Se os dados ainda estiverem a carregar, mostramos um ecrã de loading elegante
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-primary" />
        <p className="text-slate-500 font-medium">
          A carregar espaços premium...
        </p>
      </div>
    );
  }

  const filteredRooms = dbRooms.filter(
    (room) =>
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.category.toLowerCase().includes(searchQuery.toLowerCase()),
  );

  // Apenas para efeito visual, dividimos as salas em duas secções
  const nearbyRooms = filteredRooms.slice(
    0,
    Math.ceil(filteredRooms.length / 2),
  );
  const newRooms = filteredRooms.slice(Math.ceil(filteredRooms.length / 2));

  return (
    <div className="flex flex-col pb-20 lg:pb-6 bg-slate-50 min-h-screen">
      <header className="bg-primary px-4 pb-12 pt-10 lg:px-8 lg:pt-12 rounded-b-[2.5rem] shadow-md">
        {isPublic ? (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/20 backdrop-blur-md shadow-inner">
                  <span className="text-white font-black text-2xl">F</span>
                </div>
                <span className="font-bold text-2xl text-white tracking-tight">
                  Fusion
                </span>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => router.push("/login")}
                  className="text-sm font-bold text-white/90 hover:text-white transition-colors"
                >
                  Entrar
                </button>
                <button
                  onClick={() => router.push("/login")}
                  className="bg-white text-primary text-sm font-black px-5 py-2.5 rounded-full shadow-lg hover:scale-105 transition-transform"
                >
                  Registar
                </button>
              </div>
            </div>
            <div>
              <h1 className="text-3xl font-black text-white mb-2 leading-tight">
                O seu próximo consultório.
              </h1>
              <p className="text-primary-foreground/90 text-sm font-medium">
                Alugue espaços premium sem burocracia e com cashback.
              </p>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-3xl">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h1 className="text-2xl font-bold text-primary-foreground">
                  {"Olá, " + profile.name.split(" ")[0] + "!"}
                </h1>
                <p className="text-sm text-primary-foreground/80">
                  Encontre o seu espaço ideal
                </p>
              </div>
              <div className="flex items-center gap-4">
                <button
                  className="relative hover:scale-105 transition-transform"
                  aria-label="Notificações"
                >
                  <Bell className="h-6 w-6 text-primary-foreground" />
                  {profile.notifications > 0 && (
                    <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white shadow-sm">
                      {profile.notifications}
                    </span>
                  )}
                </button>
                <div className="flex flex-col items-end cursor-pointer hover:opacity-90 transition-opacity">
                  <span className="text-[10px] text-primary-foreground/70 font-bold uppercase tracking-widest">
                    Carteira
                  </span>
                  <span className="rounded-full bg-white/20 px-3 py-1 text-sm font-bold text-white backdrop-blur-md shadow-inner border border-white/10 mt-0.5">
                    {"R$ " + profile.balance.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-1.5 text-primary-foreground/90">
              <MapPin className="h-4 w-4" />
              <span className="text-sm font-medium">{profile.location}</span>
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto w-full max-w-3xl px-4 -mt-7 relative z-10">
        <div className="relative flex items-center shadow-lg rounded-2xl bg-white border border-slate-100 p-1">
          <Search className="absolute left-4 h-5 w-5 text-slate-400" />
          <Input
            placeholder={
              isPublic
                ? "Procurar por especialidade ou clínica..."
                : "Para onde vamos hoje?"
            }
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-12 rounded-xl border-0 bg-transparent pl-12 pr-12 text-base text-slate-900 shadow-none focus-visible:ring-0 placeholder:text-slate-400"
          />
          <button
            className="absolute right-2 bg-slate-50 text-primary hover:bg-primary/10 p-2.5 rounded-xl transition-colors"
            aria-label="Filtros"
          >
            <SlidersHorizontal className="h-5 w-5" />
          </button>
        </div>
      </div>

      <div className="px-4 py-5 lg:px-8 mt-2">
        <div className="mx-auto flex max-w-3xl gap-1 bg-slate-200/60 p-1 rounded-xl">
          {rentalTypes.map((type) => {
            const isActive = rentalType === type.id;
            return (
              <button
                key={type.id}
                onClick={() => setRentalType(type.id)}
                className={`flex-1 rounded-lg py-2 text-sm font-bold transition-all ${
                  isActive
                    ? "bg-white text-slate-900 shadow-sm"
                    : "text-slate-500 hover:text-slate-700"
                }`}
              >
                {type.label}
              </button>
            );
          })}
        </div>
      </div>

      <section className="px-4 pt-2 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between mb-4">
          <h2 className="text-lg font-black text-slate-900">Perto de si</h2>
          <button className="text-sm font-bold text-primary hover:underline">
            Ver todas
          </button>
        </div>
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide snap-x">
            {nearbyRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isFavorited={favorites.has(room.id)}
                onToggleFavorite={toggleFavorite}
                onOpen={onOpenRoom}
              />
            ))}
          </div>
        </div>
      </section>

      {newRooms.length > 0 && (
        <section className="px-4 pt-4 lg:px-8">
          <div className="mx-auto flex max-w-3xl items-center justify-between mb-4">
            <h2 className="text-lg font-black text-slate-900">
              Salas em Destaque
            </h2>
            <button className="text-sm font-bold text-primary hover:underline">
              Ver todas
            </button>
          </div>
          <div className="mx-auto max-w-3xl">
            <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide snap-x">
              {newRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  isFavorited={favorites.has(room.id)}
                  onToggleFavorite={toggleFavorite}
                  onOpen={onOpenRoom}
                />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}

function RoomCard({
  room,
  isFavorited,
  onToggleFavorite,
  onOpen,
}: {
  room: Room;
  isFavorited: boolean;
  onToggleFavorite: (e: React.MouseEvent, id: string) => void;
  onOpen?: (room: Room) => void;
}) {
  return (
    <button
      onClick={() => onOpen && onOpen(room)}
      className="group snap-start flex w-[240px] shrink-0 flex-col overflow-hidden rounded-[1.25rem] border border-slate-200 bg-white shadow-sm transition-all hover:shadow-md hover:-translate-y-1 text-left lg:w-[260px]"
    >
      <div className="relative h-40 w-full overflow-hidden bg-slate-100">
        <Image
          src={room.image}
          alt={room.name}
          fill
          className="object-cover transition-transform duration-500 group-hover:scale-110"
          sizes="260px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

        <span
          role="button"
          tabIndex={0}
          onClick={(e) => onToggleFavorite(e, room.id)}
          className="absolute top-3 right-3 flex h-8 w-8 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm hover:scale-110 transition-transform"
        >
          <Heart
            className={`h-4 w-4 ${
              isFavorited ? "fill-red-500 text-red-500" : "text-slate-400"
            }`}
          />
        </span>

        <span className="absolute bottom-3 left-3 rounded-lg bg-primary/95 px-2.5 py-1 text-xs font-bold text-white shadow-sm backdrop-blur-md">
          {room.category}
        </span>
      </div>

      <div className="flex flex-col gap-1 p-4">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-base font-bold text-slate-900">
            {room.name}
          </h3>
          <div className="flex shrink-0 items-center gap-1 bg-amber-50 px-1.5 py-0.5 rounded-md">
            <Star className="h-3 w-3 fill-amber-500 text-amber-500" />
            <span className="text-xs font-bold text-amber-700">
              {room.rating}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>{room.distance}</span>
        </div>
        <p className="mt-2 text-sm">
          <span className="font-black text-primary text-lg">
            {"R$ " + room.pricePerHour}
          </span>
          <span className="text-slate-500 font-medium">/hora</span>
        </p>
      </div>
    </button>
  );
}
