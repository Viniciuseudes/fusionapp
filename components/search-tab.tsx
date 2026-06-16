"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Search,
  SlidersHorizontal,
  Star,
  MapPin,
  Bell,
  Heart,
  Loader2,
  Sparkles,
  Navigation,
  X,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";

export type RentalType = "hora" | "turno" | "fixo";

export interface Room {
  id: string;
  name: string;
  category: string;
  priceLabel: string;
  filterPrice: number;
  image: string;
  rating: string;
  distance: string;
  modalities: string[];
  isPartner: boolean;
  locationString: string;
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
  const { toast } = useToast();
  const isPublic = pathname === "/";

  const [loading, setLoading] = useState(true);
  const [dbRooms, setDbRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState({
    name: "",
    balance: 0,
    notifications: 0,
    location: "Natal, RN",
  });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());

  const [searchQuery, setSearchQuery] = useState("");
  const [rentalType, setRentalType] = useState<RentalType>("turno");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [usingLocation, setUsingLocation] = useState(false);

  useEffect(() => {
    async function fetchData() {
      const { data: roomsData } = await supabase
        .from("rooms")
        .select(
          `id, name, image_url, modalities, is_partner, specialty, address_details`,
        )
        .eq("is_active", true)
        .eq("is_paused", false);

      if (roomsData) {
        const formattedRooms = roomsData.map((r: any) => {
          const pricing = r.address_details?.pricing || {};
          const address = r.address_details || {};
          const isRoomPartner = r.is_partner === true;

          const locationString = [
            address.street,
            address.city,
            address.neighborhood,
          ]
            .filter(Boolean)
            .join(", ");
          const displayLocation = address.city || "Localização não informada";

          let label = "Sob consulta";
          let numPrice = 0;

          if (rentalType === "hora" && pricing.hourly) {
            label = `R$ ${pricing.hourly}/hora`;
            numPrice = Number(pricing.hourly);
          } else if (rentalType === "turno") {
            const turnos = [pricing.morning, pricing.afternoon, pricing.night]
              .filter(Boolean)
              .map(Number);
            const minTurno = turnos.length > 0 ? Math.min(...turnos) : 0;
            label = minTurno > 0 ? `R$ ${minTurno}/turno` : "Sob consulta";
            numPrice = minTurno;
          } else if (rentalType === "fixo" && pricing.monthly) {
            label = `R$ ${pricing.monthly}/mês`;
            numPrice = Number(pricing.monthly);
          } else {
            if (pricing.hourly && isRoomPartner) {
              label = `R$ ${pricing.hourly}/hora`;
              numPrice = Number(pricing.hourly);
            } else if (pricing.morning) {
              label = `R$ ${pricing.morning}/turno`;
              numPrice = Number(pricing.morning);
            } else if (pricing.monthly) {
              label = `R$ ${pricing.monthly}/mês`;
              numPrice = Number(pricing.monthly);
            }
          }

          const rawModalities = Array.isArray(r.modalities) ? r.modalities : [];
          const finalModalities = isRoomPartner
            ? Array.from(new Set([...rawModalities, "hora"]))
            : rawModalities;

          return {
            id: r.id,
            name: r.name || "Sala sem nome",
            category: r.specialty || "Multiuso",
            priceLabel: label,
            filterPrice: numPrice,
            image: r.image_url || "/placeholder.jpg",
            rating: "5.0",
            distance: displayLocation,
            modalities: finalModalities,
            isPartner: isRoomPartner,
            locationString: locationString,
          };
        });
        setDbRooms(formattedRooms);
      }

      if (!isPublic) {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          const { data: profileData } = await supabase
            .from("profiles")
            .select("full_name")
            .eq("id", user.id)
            .single();
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
            balance,
          }));
        }
      }
      setLoading(false);
    }
    fetchData();
  }, [isPublic, supabase, rentalType]);

  const availableCategories = useMemo(() => {
    const cats = new Set(dbRooms.map((r) => r.category));
    return ["Todas", ...Array.from(cats)];
  }, [dbRooms]);

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      toast({
        title: "Buscando localização...",
        description: "Procurando salas próximas a você.",
      });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUsingLocation(true);
          toast({
            title: "Localização Encontrada",
            description: "Mostrando espaços perto de você.",
          });
        },
        () => {
          toast({
            variant: "destructive",
            title: "Permissão Negada",
            description:
              "Ative o GPS no seu navegador para buscar salas próximas.",
          });
        },
      );
    }
  };

  function toggleFavorite(e: React.MouseEvent, roomId: string) {
    e.stopPropagation();
    if (isPublic) return router.push("/login");
    setFavorites((prev) => {
      const next = new Set(prev);
      if (next.has(roomId)) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
  }

  // --- LÓGICA DE FILTRO 100% BLINDADA CONTRA ERROS DE DADOS NULOS ---
  const filteredRooms = dbRooms.filter((room) => {
    const searchLower = (searchQuery || "").toLowerCase();

    // Fallbacks para evitar o erro Cannot read properties of undefined (reading 'toLowerCase')
    const locStr = (room.locationString || "").toLowerCase();
    const nameStr = (room.name || "").toLowerCase();
    const catStr = (room.category || "").toLowerCase();

    const matchesSearch =
      locStr.includes(searchLower) ||
      nameStr.includes(searchLower) ||
      catStr.includes(searchLower);

    const matchesModality = Array.isArray(room.modalities)
      ? room.modalities.includes(rentalType)
      : false;
    const matchesCategory =
      selectedCategory === "Todas" || room.category === selectedCategory;
    const passesMinPrice =
      minPrice === "" || room.filterPrice >= Number(minPrice);
    const passesMaxPrice =
      maxPrice === "" || room.filterPrice <= Number(maxPrice);

    return (
      matchesSearch &&
      matchesModality &&
      matchesCategory &&
      passesMinPrice &&
      passesMaxPrice
    );
  });

  const partnerRooms = filteredRooms.filter((r) => r.isPartner);
  const regularRooms = filteredRooms.filter((r) => !r.isPartner);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-screen bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="flex flex-col pb-24 bg-slate-50 min-h-screen relative">
      <header className="bg-gradient-to-r from-[#f05e23] to-[#d6521e] px-4 pb-16 pt-10 lg:px-8 lg:pt-12 rounded-b-[2.5rem] shadow-lg">
        {!isPublic && (
          <div className="mx-auto max-w-5xl">
            <div className="flex items-center justify-between mb-2">
              <div>
                <p className="text-white/80 text-sm font-bold tracking-wide uppercase">
                  Bem-vindo de volta
                </p>
                <h1 className="text-2xl font-black text-white">
                  {"Dr(a). " + profile.name.split(" ")[0]}
                </h1>
              </div>
              <div className="flex items-center gap-4">
                <div className="flex flex-col items-end cursor-pointer hover:opacity-90 transition-opacity">
                  <span className="text-[10px] text-white/80 font-bold uppercase tracking-widest">
                    Saldo Fusion
                  </span>
                  <span className="rounded-xl bg-white/20 px-3 py-1.5 text-sm font-bold text-white backdrop-blur-md shadow-inner border border-white/10 mt-0.5">
                    R$ {profile.balance.toFixed(2).replace(".", ",")}
                  </span>
                </div>
              </div>
            </div>
          </div>
        )}
      </header>

      <div className="mx-auto w-full max-w-5xl px-4 -mt-8 relative z-20 sticky top-4">
        <div className="flex items-center gap-2">
          <div className="relative flex items-center flex-1 shadow-xl shadow-orange-500/10 rounded-2xl bg-white border border-slate-100 p-1 transition-all focus-within:ring-2 focus-within:ring-[#f05e23]/20">
            <Search className="absolute left-4 h-5 w-5 text-[#f05e23]" />
            <Input
              placeholder="Buscar por cidade, bairro ou clínica..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-14 rounded-xl border-0 bg-transparent pl-12 text-base text-slate-900 shadow-none focus-visible:ring-0 placeholder:text-slate-400 font-medium"
            />
          </div>
          <button
            onClick={() => setIsFilterModalOpen(true)}
            className="h-16 w-16 bg-white border border-slate-100 shadow-xl shadow-slate-200/50 rounded-2xl flex items-center justify-center text-slate-600 hover:text-[#f05e23] transition-colors shrink-0"
          >
            <SlidersHorizontal className="h-6 w-6" />
          </button>
        </div>
      </div>

      <div className="px-4 py-4 mx-auto max-w-5xl w-full">
        <div className="flex gap-1 bg-slate-200/60 p-1.5 rounded-2xl border border-slate-200/50">
          {rentalTypes.map((type) => (
            <button
              key={type.id}
              onClick={() => setRentalType(type.id)}
              className={`flex-1 rounded-xl py-2.5 text-sm font-black transition-all ${
                rentalType === type.id
                  ? "bg-white text-slate-900 shadow-sm"
                  : "text-slate-500 hover:text-slate-800"
              }`}
            >
              {type.label}
            </button>
          ))}
        </div>
      </div>

      <div className="w-full px-4 mb-6">
        <div className="flex gap-3 overflow-x-auto scrollbar-hide pb-2 max-w-5xl mx-auto">
          {availableCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`whitespace-nowrap px-5 py-2.5 rounded-full text-sm font-bold transition-all border ${
                selectedCategory === cat
                  ? "bg-slate-900 text-white border-slate-900 shadow-md"
                  : "bg-white text-slate-600 border-slate-200 hover:border-slate-400"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {filteredRooms.length === 0 ? (
        <div className="px-4 max-w-5xl mx-auto w-full">
          <div className="text-center py-16 bg-white rounded-[2rem] border border-slate-200 shadow-sm flex flex-col items-center">
            <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Search className="w-8 h-8 text-slate-300" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">
              Nenhuma sala na região
            </h3>
            <p className="text-slate-500 font-medium">
              Tente buscar por outra cidade ou mudar os filtros.
            </p>
            <Button
              variant="outline"
              onClick={() => {
                setSearchQuery("");
                setSelectedCategory("Todas");
                setMinPrice("");
                setMaxPrice("");
              }}
              className="mt-6 font-bold rounded-xl h-12 px-6"
            >
              Limpar Filtros
            </Button>
          </div>
        </div>
      ) : (
        <div className="px-4 max-w-5xl mx-auto w-full space-y-10">
          {partnerRooms.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Sparkles className="w-5 h-5 text-amber-500 fill-amber-500" />
                <h2 className="text-xl font-black text-slate-900">
                  Premium Partners
                </h2>
              </div>
              <div className="flex gap-4 overflow-x-auto pb-6 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide snap-x">
                {partnerRooms.map((room) => (
                  <RoomCard
                    key={room.id}
                    room={room}
                    isFavorited={favorites.has(room.id)}
                    onToggleFavorite={toggleFavorite}
                    onOpen={onOpenRoom}
                    horizontal
                  />
                ))}
              </div>
            </section>
          )}

          <section>
            <h2 className="text-xl font-black text-slate-900 mb-4">
              Explorar Espaços
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {regularRooms.map((room) => (
                <RoomCard
                  key={room.id}
                  room={room}
                  isFavorited={favorites.has(room.id)}
                  onToggleFavorite={toggleFavorite}
                  onOpen={onOpenRoom}
                />
              ))}
            </div>
          </section>
        </div>
      )}

      <Dialog open={isFilterModalOpen} onOpenChange={setIsFilterModalOpen}>
        <DialogContent className="sm:max-w-md rounded-[2rem]">
          <DialogHeader className="border-b border-slate-100 pb-4">
            <DialogTitle className="text-xl font-black text-slate-900">
              Filtros Avançados
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Localização
              </Label>
              <button
                onClick={requestLocation}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${usingLocation ? "border-[#f05e23] bg-orange-50 text-[#f05e23]" : "border-slate-200 hover:border-slate-300 text-slate-700"}`}
              >
                <div className="flex items-center gap-3">
                  <Navigation
                    className={`w-5 h-5 ${usingLocation ? "fill-[#f05e23]" : ""}`}
                  />
                  <span className="font-bold text-base">Próximos a mim</span>
                </div>
                {usingLocation && (
                  <Badge className="bg-[#f05e23] hover:bg-[#f05e23] text-white">
                    Ativado
                  </Badge>
                )}
              </button>
            </div>

            <div className="space-y-3">
              <Label className="text-sm font-bold text-slate-900 uppercase tracking-wider flex justify-between">
                <span>Faixa de Preço</span>
                <span className="text-slate-400 font-medium normal-case">
                  Modalidade:{" "}
                  {rentalTypes.find((t) => t.id === rentalType)?.label}
                </span>
              </Label>
              <div className="flex items-center gap-4">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-3.5 text-slate-500 font-medium">
                    R$
                  </span>
                  <Input
                    type="number"
                    placeholder="Mínimo"
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="h-12 pl-10 rounded-xl bg-slate-50 border-slate-200 font-bold"
                  />
                </div>
                <span className="text-slate-400">-</span>
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-3.5 text-slate-500 font-medium">
                    R$
                  </span>
                  <Input
                    type="number"
                    placeholder="Máximo"
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="h-12 pl-10 rounded-xl bg-slate-50 border-slate-200 font-bold"
                  />
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="border-t border-slate-100 pt-4 flex flex-row gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setMinPrice("");
                setMaxPrice("");
                setUsingLocation(false);
              }}
              className="flex-1 font-bold text-slate-500 hover:bg-slate-100 h-12 rounded-xl"
            >
              Limpar
            </Button>
            <Button
              onClick={() => setIsFilterModalOpen(false)}
              className="flex-[2] bg-slate-900 text-white hover:bg-slate-800 font-black h-12 rounded-xl"
            >
              Ver resultados ({filteredRooms.length})
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function RoomCard({
  room,
  isFavorited,
  onToggleFavorite,
  onOpen,
  horizontal = false,
}: {
  room: Room;
  isFavorited: boolean;
  onToggleFavorite: (e: React.MouseEvent, id: string) => void;
  onOpen?: (room: Room) => void;
  horizontal?: boolean;
}) {
  return (
    <button
      onClick={() => onOpen && onOpen(room)}
      className={`group flex flex-col overflow-hidden rounded-[1.5rem] bg-white transition-all text-left relative
        ${horizontal ? "w-[280px] shrink-0 snap-start border-2 border-amber-400 shadow-amber-500/10 hover:shadow-amber-500/20" : "w-full border border-slate-200 shadow-sm hover:shadow-md hover:-translate-y-1"}`}
    >
      {room.isPartner && horizontal && (
        <div className="absolute top-3 left-3 bg-white/95 backdrop-blur-md px-3 py-1.5 rounded-lg text-[10px] font-black text-amber-600 uppercase tracking-widest z-10 flex items-center gap-1 shadow-lg border border-amber-100">
          <Star className="w-3 h-3 fill-amber-500" /> Premium
        </div>
      )}

      <div
        className={`relative w-full overflow-hidden bg-slate-100 ${horizontal ? "h-48" : "h-56"}`}
      >
        <Image
          src={room.image}
          alt={room.name}
          fill
          className="object-cover transition-transform duration-700 group-hover:scale-105"
          sizes="(max-width: 768px) 100vw, 300px"
          onError={(e: any) => {
            e.target.src = "/placeholder.jpg";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900/60 via-transparent to-transparent" />

        <span
          role="button"
          tabIndex={0}
          onClick={(e) => onToggleFavorite(e, room.id)}
          className="absolute top-3 right-3 flex h-9 w-9 items-center justify-center rounded-full bg-white/90 shadow-sm backdrop-blur-sm hover:scale-110 transition-transform z-10"
        >
          <Heart
            className={`h-4 w-4 ${isFavorited ? "fill-red-500 text-red-500" : "text-slate-400"}`}
          />
        </span>
      </div>

      <div className="flex flex-col gap-1.5 p-5">
        <div className="flex items-start justify-between gap-2">
          <h3 className="truncate text-lg font-black text-slate-900">
            {room.name}
          </h3>
          <div className="flex shrink-0 items-center gap-1 bg-slate-100 px-2 py-1 rounded-lg">
            <Star className="h-3.5 w-3.5 fill-slate-900 text-slate-900" />
            <span className="text-xs font-bold text-slate-700">
              {room.rating}
            </span>
          </div>
        </div>

        <p className="text-sm font-semibold text-slate-500">{room.category}</p>

        <div className="flex items-center gap-1.5 text-xs text-slate-400 font-medium mt-1 mb-2">
          <MapPin className="h-3.5 w-3.5 shrink-0" />
          <span>{room.distance}</span>
        </div>

        <p className="text-base font-black text-slate-900">{room.priceLabel}</p>
      </div>
    </button>
  );
}
