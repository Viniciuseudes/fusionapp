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
  Heart,
  Loader2,
  Sparkles,
  Navigation,
  Shield,
  Crown,
  History,
  CreditCard,
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  TrendingDown,
  Building2,
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
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type RentalType = "hora" | "turno" | "fixo";

export interface Room {
  id: string;
  name: string;
  category: string;
  tier: "start" | "vip" | "master";
  priceLabel: string;
  filterPrice: number;
  image: string;
  rating: string;
  distance: string;
  distanceKm?: number;
  modalities: string[];
  isPartner: boolean;
  locationString: string;
  rawAddress?: any;
}

// ==========================================
// ESTRUTURA VISUAL E COPY DE ALTA CONVERSÃO (CRO) - DESIGN PREMIUM
// ==========================================
interface PlanOption {
  hours: number;
  price: number;
}
interface PlanPackage {
  id: "start" | "vip" | "master";
  title: string;
  icon: any;
  cardStyle: string;
  iconStyle: string;
  buttonStyle: string;
  optionStyle: string;
  benefits: string[];
  options: PlanOption[];
}

const BASE_PACKAGE_INFO = {
  start: {
    title: "Fusion Pass Basic",
    icon: Shield,
    cardStyle: "bg-white border-zinc-200 text-zinc-900",
    iconStyle: "bg-zinc-100 text-zinc-600",
    buttonStyle: "bg-zinc-900 hover:bg-zinc-800 text-white",
    optionStyle: "bg-zinc-50 border-zinc-200 text-zinc-600 hover:bg-zinc-100",
    benefits: [
      "Acesso livre a Salas Basic por 30 dias",
      "Menor custo por hora garantido",
      "Previsibilidade na sua agenda",
    ],
  },
  vip: {
    title: "Fusion Pass VIP",
    icon: Star,
    cardStyle: "bg-zinc-900 border-zinc-800 text-white",
    iconStyle: "bg-white/10 text-white",
    buttonStyle: "bg-[#f05e23] hover:bg-[#d6521e] text-white",
    optionStyle: "bg-white/10 border-white/20 text-white hover:bg-white/20",
    benefits: [
      "Acesso a Salas VIP e Basic por 30 dias",
      "Ambientes de alto padrão e conforto",
      "Economia massiva nos seus atendimentos",
    ],
  },
  master: {
    title: "Fusion Pass Master",
    icon: Crown,
    cardStyle:
      "bg-gradient-to-b from-zinc-900 to-black border-amber-500/20 text-white",
    iconStyle: "bg-amber-500/10 text-amber-500",
    buttonStyle: "bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black",
    optionStyle:
      "bg-white/5 border-amber-500/30 text-amber-50 hover:bg-white/10",
    benefits: [
      "Acesso a TODAS as salas por 30 dias",
      "O nível máximo de exclusividade",
      "A maior margem de economia da plataforma",
    ],
  },
};

const rentalTypes: { id: RentalType; label: string }[] = [
  { id: "hora", label: "Por Hora" },
  { id: "turno", label: "Turno" },
  { id: "fixo", label: "Fixo" },
];

const calculateDistance = (
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number,
) => {
  const R = 6371;
  const dLat = (lat2 - lat1) * (Math.PI / 180);
  const dLon = (lon2 - lon1) * (Math.PI / 180);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * (Math.PI / 180)) *
      Math.cos(lat2 * (Math.PI / 180)) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
};

export function SearchTab({
  onOpenRoom,
}: {
  onOpenRoom?: (room: Room) => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();
  const isPublic = pathname === "/";

  const [loading, setLoading] = useState(true);
  const [dbRooms, setDbRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState({ name: "", balance: 0 });
  const [favorites, setFavorites] = useState<Set<string>>(new Set());
  const [searchQuery, setSearchQuery] = useState("");
  const [rentalType, setRentalType] = useState<RentalType>("hora");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [activeTier, setActiveTier] = useState<
    "all" | "start" | "vip" | "master"
  >("all");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");

  const [usingLocation, setUsingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [walletBalances, setWalletBalances] = useState({
    start: 0,
    vip: 0,
    master: 0,
  });
  const [walletTransactions, setWalletTransactions] = useState<any[]>([]);
  const [dynamicPackages, setDynamicPackages] = useState<PlanPackage[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<{
    start: number;
    vip: number;
    master: number;
  }>({ start: 16, vip: 16, master: 16 });

  const [isProcessingCheckout, setIsProcessingCheckout] = useState<
    string | null
  >(null);

  useEffect(() => {
    async function fetchData() {
      const { data: pkgsData } = await supabase
        .from("packages")
        .select("*")
        .eq("active", true)
        .order("hours", { ascending: true });

      if (pkgsData && pkgsData.length > 0) {
        const grouped = pkgsData.reduce((acc: any, curr) => {
          if (!acc[curr.tier]) acc[curr.tier] = [];
          acc[curr.tier].push({ hours: curr.hours, price: curr.price });
          return acc;
        }, {});

        const mergedPackages: PlanPackage[] = (
          ["start", "vip", "master"] as const
        ).map((tier) => ({
          id: tier,
          ...BASE_PACKAGE_INFO[tier],
          options: grouped[tier] || [],
        }));

        setDynamicPackages(mergedPackages);

        setSelectedBundles({
          start:
            grouped["start"]?.[1]?.hours || grouped["start"]?.[0]?.hours || 16,
          vip: grouped["vip"]?.[1]?.hours || grouped["vip"]?.[0]?.hours || 16,
          master:
            grouped["master"]?.[1]?.hours ||
            grouped["master"]?.[0]?.hours ||
            16,
        });
      }

      const { data: roomsData } = await supabase
        .from("rooms")
        .select(
          `id, name, image_url, modalities, is_partner, specialty, tier, address_details`,
        )
        .eq("is_active", true)
        .eq("is_paused", false);

      if (roomsData) {
        const formattedRooms = roomsData.map((r: any) => {
          const pricing = r.address_details?.pricing || {};
          const address = r.address_details || {};
          const finalModalities = Array.isArray(r.modalities)
            ? r.modalities
            : [];
          let label = "Sob consulta";
          let numPrice = 0;

          if (
            rentalType === "hora" &&
            pricing.hourly &&
            finalModalities.includes("hora")
          ) {
            label = `R$ ${pricing.hourly}/hora`;
            numPrice = Number(pricing.hourly);
          } else if (
            rentalType === "turno" &&
            finalModalities.includes("turno")
          ) {
            const turnos = [pricing.morning, pricing.afternoon, pricing.night]
              .filter(Boolean)
              .map(Number);
            const minTurno = turnos.length > 0 ? Math.min(...turnos) : 0;
            label = minTurno > 0 ? `R$ ${minTurno}/turno` : "Sob consulta";
            numPrice = minTurno;
          } else if (
            rentalType === "fixo" &&
            pricing.monthly &&
            finalModalities.includes("fixo")
          ) {
            label = `R$ ${pricing.monthly}/mês`;
            numPrice = Number(pricing.monthly);
          } else {
            if (finalModalities.includes("hora") && pricing.hourly) {
              label = `R$ ${pricing.hourly}/hora`;
              numPrice = Number(pricing.hourly);
            } else if (
              finalModalities.includes("turno") &&
              (pricing.morning || pricing.afternoon)
            ) {
              const val = pricing.morning || pricing.afternoon;
              label = `R$ ${val}/turno`;
              numPrice = Number(val);
            } else if (finalModalities.includes("fixo") && pricing.monthly) {
              label = `R$ ${pricing.monthly}/mês`;
              numPrice = Number(pricing.monthly);
            }
          }
          return {
            id: r.id,
            name: r.name || "Sala sem nome",
            category: r.specialty || "Multiuso",
            tier: r.tier || "start",
            priceLabel: label,
            filterPrice: numPrice,
            image: r.image_url || "/placeholder.jpg",
            rating: "5.0",
            distance: address.city || "Localização pendente",
            modalities: finalModalities,
            isPartner: r.is_partner === true,
            locationString: [address.street, address.city, address.neighborhood]
              .filter(Boolean)
              .join(", "),
            rawAddress: address,
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
          const { data: txData } = await supabase
            .from("wallet_transactions")
            .select("amount, created_at, description, type, tier")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          let bStart = 0,
            bVip = 0,
            bMaster = 0;
          if (txData) {
            setWalletTransactions(txData.slice(0, 5));
            txData.forEach((tx) => {
              if (tx.tier === "vip") bVip += Number(tx.amount);
              else if (tx.tier === "master") bMaster += Number(tx.amount);
              else bStart += Number(tx.amount);
            });
          }
          setWalletBalances({ start: bStart, vip: bVip, master: bMaster });
          const { data: favData } = await supabase
            .from("favorites")
            .select("room_id")
            .eq("user_id", user.id);
          if (favData) setFavorites(new Set(favData.map((f) => f.room_id)));
          setProfile({
            name: profileData?.full_name || "Doutor(a)",
            balance: bStart + bVip + bMaster,
          });
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
        description: "Calculando a distância das salas...",
      });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setUsingLocation(true);
          setIsFilterModalOpen(false);
          toast({
            title: "Localização Ativada",
            description: "Ordenando as salas mais próximas a você.",
          });
        },
        () => {
          toast({
            variant: "destructive",
            title: "Permissão Negada",
            description:
              "Ative a localização no seu navegador para usar esta função.",
          });
        },
      );
    } else {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Geolocalização não suportada neste dispositivo.",
      });
    }
  };

  async function toggleFavorite(e: React.MouseEvent, roomId: string) {
    e.stopPropagation();
    if (isPublic) return router.push("/login");
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;
    const isFavorited = favorites.has(roomId);
    setFavorites((prev) => {
      const next = new Set(prev);
      if (isFavorited) next.delete(roomId);
      else next.add(roomId);
      return next;
    });
    try {
      if (isFavorited)
        await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("room_id", roomId);
      else
        await supabase
          .from("favorites")
          .insert({ user_id: user.id, room_id: roomId });
    } catch {
      setFavorites((prev) => {
        const next = new Set(prev);
        if (isFavorited) next.add(roomId);
        else next.delete(roomId);
        return next;
      });
    }
  }

  const handleBuyPackage = async (pkg: PlanPackage, option: PlanOption) => {
    setIsProcessingCheckout(pkg.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Faça login",
          description: "Você precisa estar logado para assinar.",
        });
        setIsProcessingCheckout(null);
        return;
      }
      toast({
        title: "Preparando ambiente seguro...",
        description: `Gerando cobrança para o ${pkg.title}`,
      });
      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          packageId: pkg.id,
          hours: option.hours,
          price: option.price,
          packageName: pkg.title,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Falha ao gerar pagamento.");
      }
      window.location.href = data.invoiceUrl;
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro no Checkout",
        description: err.message,
      });
      setIsProcessingCheckout(null);
    }
  };

  const handleOpenWalletPromo = () => {
    setIsWalletOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const processedRooms = useMemo(() => {
    let result = dbRooms.filter((room) => {
      const searchLower = (searchQuery || "").toLowerCase();
      const matchesSearch =
        (room.locationString || "").toLowerCase().includes(searchLower) ||
        (room.name || "").toLowerCase().includes(searchLower) ||
        (room.category || "").toLowerCase().includes(searchLower);
      const matchesModality = Array.isArray(room.modalities)
        ? room.modalities.includes(rentalType)
        : false;
      const matchesCategory =
        selectedCategory === "Todas" || room.category === selectedCategory;
      const passesMinPrice =
        minPrice === "" || room.filterPrice >= Number(minPrice);
      const passesMaxPrice =
        maxPrice === "" || room.filterPrice <= Number(maxPrice);

      const matchesTier = activeTier === "all" || room.tier === activeTier;

      return (
        matchesSearch &&
        matchesModality &&
        matchesCategory &&
        passesMinPrice &&
        passesMaxPrice &&
        matchesTier
      );
    });

    if (usingLocation && userLocation) {
      result = result
        .map((r) => {
          let d = 999;
          if (r.rawAddress?.lat && r.rawAddress?.lng) {
            d = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              r.rawAddress.lat,
              r.rawAddress.lng,
            );
          } else {
            d = Math.random() * 12 + 1;
          }
          return { ...r, distanceKm: d };
        })
        .sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
    }

    return result;
  }, [
    dbRooms,
    searchQuery,
    rentalType,
    selectedCategory,
    minPrice,
    maxPrice,
    activeTier,
    usingLocation,
    userLocation,
  ]);

  const featuredRooms = processedRooms.filter((r) => r.isPartner);
  const masterRooms = processedRooms.filter((r) => r.tier === "master");
  const vipRooms = processedRooms.filter((r) => r.tier === "vip");
  const startRooms = processedRooms.filter(
    (r) => r.tier === "start" || !r.tier,
  );

  // ==========================================
  // UI COMPONENTS (CRO BANNER - PREMIUM DARK MODE)
  // ==========================================
  const renderFusionPassBanner = () => {
    let title,
      subtitle,
      icon,
      bgClass,
      textClass,
      descClass,
      buttonClass,
      highlightText,
      discount;

    if (activeTier === "vip") {
      title = "Fusion Pass VIP";
      subtitle = "Conforto e prestígio para seus pacientes.";
      icon = <Star className="w-8 h-8 text-white mb-2" />;
      bgClass = "bg-zinc-900 border-zinc-800";
      textClass = "text-white";
      descClass = "text-zinc-400";
      buttonClass =
        "bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-orange-500/20";
      highlightText = "Salas VIP";
      discount = "40%";
    } else if (activeTier === "master") {
      title = "Fusion Pass Master";
      subtitle = "O ápice da exclusividade médica na cidade.";
      icon = <Crown className="w-8 h-8 text-amber-500 mb-2 fill-current" />;
      bgClass = "bg-gradient-to-br from-zinc-900 to-black border-amber-500/30";
      textClass = "text-amber-400";
      descClass = "text-zinc-400";
      buttonClass =
        "bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black shadow-amber-500/20";
      highlightText = "Salas Master";
      discount = "50%";
    } else {
      title = "Fusion Pass Basic";
      subtitle = "Acesso inteligente por 30 dias.";
      icon = <Shield className="w-8 h-8 text-zinc-400 mb-2" />;
      bgClass = "bg-white border-zinc-200";
      textClass = "text-zinc-900";
      descClass = "text-zinc-500";
      buttonClass = "bg-zinc-900 hover:bg-zinc-800 text-white";
      highlightText = "Salas Basic";
      discount = "30%";
    }

    return (
      <div
        className={`mt-8 mb-10 p-6 sm:p-8 rounded-[2rem] border shadow-xl relative overflow-hidden group ${bgClass}`}
      >
        <div className="absolute -right-10 -top-10 w-40 h-40 bg-white/5 rounded-full blur-3xl group-hover:scale-150 transition-transform duration-700"></div>
        <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            {icon}
            <h3
              className={`text-2xl sm:text-3xl font-black tracking-tight mb-2 ${textClass}`}
            >
              Assine o {title}
            </h3>
            <p
              className={`font-medium max-w-md leading-relaxed mb-4 ${descClass}`}
            >
              {subtitle} Tenha acesso garantido a todas as{" "}
              <strong className={textClass}>{highlightText}</strong> por 30 dias
              com até{" "}
              <span className="bg-emerald-500/10 text-emerald-500 px-2 py-0.5 rounded-md font-bold">
                {discount} de economia
              </span>
              .
            </p>
            <div
              className={`flex flex-wrap items-center gap-3 text-xs font-bold ${descClass}`}
            >
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Créditos
                Cumulativos
              </span>
              <span className="flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" /> Prioridade
                na Agenda
              </span>
            </div>
          </div>
          <Button
            onClick={handleOpenWalletPromo}
            className={`h-14 px-8 rounded-xl font-black shadow-lg w-full md:w-auto shrink-0 transition-transform active:scale-95 ${buttonClass}`}
          >
            Ver Planos do Pass <ArrowRight className="w-5 h-5 ml-2" />
          </Button>
        </div>
      </div>
    );
  };

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-screen bg-zinc-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );

  return (
    <div className="flex flex-col pb-24 bg-zinc-50 min-h-screen relative font-sans">
      {/* HEADER PRINCIPAL */}
      <header className="bg-gradient-to-r from-[#f05e23] to-[#d6521e] px-4 pb-12 pt-10 lg:px-8 lg:pt-12 rounded-b-3xl shadow-md">
        {!isPublic && (
          <div className="mx-auto max-w-5xl flex items-center justify-between">
            <div>
              <p className="text-white/80 text-xs font-semibold tracking-wide uppercase mb-0.5">
                Bem-vindo(a) de volta
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Dr(a). {profile.name.split(" ")[0]}
              </h1>
            </div>

            <div
              onClick={() => setIsWalletOpen(!isWalletOpen)}
              className="flex flex-col items-end cursor-pointer group transition-opacity"
            >
              <span className="text-[10px] text-white/80 font-bold uppercase tracking-widest group-hover:text-white">
                {isWalletOpen ? "Voltar para Busca" : "Saldo Fusion"}
              </span>
              <div className="bg-white/20 backdrop-blur-md px-4 py-2 rounded-xl mt-1 flex items-center gap-2 border border-white/10 group-hover:bg-white/30 transition-all shadow-sm">
                {isWalletOpen ? (
                  <span className="text-sm font-semibold text-white flex items-center gap-1.5">
                    <ArrowLeft className="w-4 h-4" /> Fechar
                  </span>
                ) : (
                  <span className="text-sm font-bold text-white">
                    {profile.balance} Horas
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
      </header>

      {isWalletOpen ? (
        // ======================================================
        // A NOVA CARTEIRA / VENDA DE PACOTES (DARK PREMIUM MODE)
        // ======================================================
        <div className="mx-auto w-full max-w-5xl px-4 -mt-6 relative z-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white rounded-3xl p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100 relative overflow-hidden mb-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-50 via-transparent to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />

            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div>
                <p className="text-zinc-500 font-bold uppercase tracking-wider text-xs mb-2">
                  Saldo Total Disponível
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black text-zinc-900 tracking-tight">
                    {profile.balance}
                  </span>
                  <span className="text-xl font-semibold text-zinc-400">
                    Horas
                  </span>
                </div>
              </div>

              <div className="bg-zinc-50 border border-zinc-100/80 rounded-2xl p-6 min-w-[240px]">
                <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-4">
                  Composição do Saldo
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-600">
                      <Shield className="w-4 h-4 text-zinc-400" /> Basic
                    </span>
                    <span className="font-bold text-zinc-900">
                      {walletBalances.start}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-600">
                      <Star className="w-4 h-4 text-zinc-800" /> VIP
                    </span>
                    <span className="font-bold text-zinc-900">
                      {walletBalances.vip}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-600">
                      <Crown className="w-4 h-4 text-amber-500" /> Master
                    </span>
                    <span className="font-bold text-zinc-900">
                      {walletBalances.master}h
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-zinc-900">
                Assine um Fusion Pass
              </h3>
              <p className="text-sm font-medium text-zinc-500 mt-1">
                Escolha o nível de exclusividade e garanta até 30 dias de acesso
                com economia.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
            {dynamicPackages.map((pkg) => {
              const Icon = pkg.icon;
              const currentHours = selectedBundles[pkg.id];
              const selectedOption =
                pkg.options.find((o) => o.hours === currentHours) ||
                pkg.options[0];

              if (!selectedOption) return null;

              return (
                <div
                  key={pkg.id}
                  className={`rounded-3xl p-6 shadow-sm hover:shadow-xl transition-all flex flex-col border ${pkg.cardStyle}`}
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${pkg.iconStyle}`}
                    >
                      <Icon className="w-6 h-6 fill-current" />
                    </div>
                    <h4 className="text-lg font-bold">{pkg.title}</h4>
                  </div>

                  <div
                    className={`p-1 rounded-lg flex items-center justify-between mb-6 border shadow-inner ${pkg.optionStyle.split("hover")[0]}`}
                  >
                    {pkg.options.map((opt) => (
                      <button
                        key={opt.hours}
                        onClick={() =>
                          setSelectedBundles({
                            ...selectedBundles,
                            [pkg.id]: opt.hours,
                          })
                        }
                        className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all ${currentHours === opt.hours ? "bg-white text-zinc-900 shadow-sm" : pkg.optionStyle}`}
                      >
                        {opt.hours}h
                      </button>
                    ))}
                  </div>

                  <div className="mb-6 flex items-baseline gap-1">
                    <span className="text-3xl font-black">
                      R$ {selectedOption.price}
                    </span>
                    <span className="text-sm font-medium opacity-60">
                      /pacote
                    </span>
                  </div>

                  <div className="space-y-3 mb-8 flex-1">
                    {pkg.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span className="text-sm font-medium leading-tight opacity-90">
                          {benefit}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handleBuyPackage(pkg, selectedOption)}
                    disabled={isProcessingCheckout === pkg.id}
                    className={`w-full h-12 rounded-xl font-semibold flex items-center justify-between px-5 transition-colors shadow-lg ${pkg.buttonStyle}`}
                  >
                    <span>
                      {isProcessingCheckout === pkg.id
                        ? "Redirecionando..."
                        : "Assinar Pass"}
                    </span>
                    {isProcessingCheckout === pkg.id ? (
                      <Loader2 className="w-4 h-4 opacity-80 animate-spin" />
                    ) : (
                      <ArrowRight className="w-4 h-4 opacity-80" />
                    )}
                  </Button>
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        // ======================================================
        // TELA DE BUSCA E EXPLORAÇÃO DE SALAS
        // ======================================================
        <>
          <div className="mx-auto w-full max-w-5xl px-4 -mt-6 relative z-20 sticky top-4 animate-in fade-in duration-300">
            <div className="flex flex-col gap-3">
              {/* Barra de Busca */}
              <div className="flex items-center gap-2">
                <div className="relative flex items-center flex-1 bg-white rounded-2xl border border-zinc-200 shadow-[0_4px_20px_rgb(0,0,0,0.03)] h-14 transition-all focus-within:ring-2 focus-within:ring-[#f05e23]/20">
                  <Search className="absolute left-4 h-5 w-5 text-zinc-400" />
                  <Input
                    placeholder="Buscar por cidade, clínica ou especialidade..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="h-full w-full border-0 bg-transparent pl-11 pr-4 text-sm text-zinc-900 shadow-none focus-visible:ring-0 placeholder:text-zinc-400 font-medium"
                  />
                </div>
                <button
                  onClick={() => setIsFilterModalOpen(true)}
                  className="h-14 w-14 bg-white border border-zinc-200 shadow-sm rounded-2xl flex items-center justify-center text-zinc-600 hover:bg-zinc-50 transition-colors shrink-0 relative"
                >
                  <SlidersHorizontal className="h-5 w-5" />
                  {usingLocation && (
                    <span className="absolute top-3 right-3 w-2 h-2 bg-[#f05e23] rounded-full"></span>
                  )}
                </button>
              </div>

              {/* Toggles Rápidos e Tiers - ESTILO PREMIUM CLEAN */}
              <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1">
                <div className="flex bg-white border border-zinc-200 p-1.5 rounded-xl shrink-0 shadow-sm">
                  <button
                    onClick={() => setActiveTier("all")}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${activeTier === "all" ? "bg-zinc-100 text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:bg-zinc-50"}`}
                  >
                    Todas
                  </button>
                  <button
                    onClick={() => setActiveTier("start")}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${activeTier === "start" ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:bg-zinc-50"}`}
                  >
                    <Shield className="w-4 h-4" /> Basic
                  </button>
                  <button
                    onClick={() => setActiveTier("vip")}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${activeTier === "vip" ? "bg-zinc-900 text-white shadow-sm border border-zinc-800" : "text-zinc-500 hover:bg-zinc-50"}`}
                  >
                    <Star className="w-4 h-4" /> VIP
                  </button>
                  <button
                    onClick={() => setActiveTier("master")}
                    className={`px-4 py-2 rounded-lg text-sm font-bold transition-all flex items-center gap-1.5 ${activeTier === "master" ? "bg-gradient-to-r from-zinc-900 to-black text-amber-400 shadow-sm border border-amber-900/30" : "text-zinc-500 hover:bg-zinc-50"}`}
                  >
                    <Crown className="w-4 h-4" /> Master
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div className="px-4 py-4 mx-auto max-w-5xl w-full mt-2">
            <div className="flex gap-1 bg-white border border-zinc-200 p-1 rounded-xl shadow-sm">
              {rentalTypes.map((type) => (
                <button
                  key={type.id}
                  onClick={() => setRentalType(type.id)}
                  className={`flex-1 rounded-lg py-2 text-sm font-semibold transition-all ${rentalType === type.id ? "bg-zinc-100 text-zinc-900" : "text-zinc-500 hover:text-zinc-800"}`}
                >
                  {type.label}
                </button>
              ))}
            </div>
          </div>

          <div className="w-full px-4 mb-8">
            <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-2 max-w-5xl mx-auto">
              {availableCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`whitespace-nowrap px-4 py-2 rounded-full text-xs font-semibold transition-all border ${selectedCategory === cat ? "bg-[#f05e23] text-white border-[#f05e23]" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"}`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {processedRooms.length === 0 ? (
            <div className="px-4 max-w-5xl mx-auto w-full">
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center">
                <Search className="w-10 h-10 text-zinc-300 mb-4" />
                <h3 className="text-lg font-bold text-zinc-900 mb-1">
                  Nenhuma sala disponível
                </h3>
                <p className="text-zinc-500 text-sm font-medium max-w-sm">
                  Tente ajustar seus filtros, desativar a localização ou
                  escolher outra modalidade.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("Todas");
                    setActiveTier("all");
                    setUsingLocation(false);
                    setMinPrice("");
                    setMaxPrice("");
                  }}
                  className="mt-6 font-semibold rounded-xl px-6"
                >
                  Limpar Todos os Filtros
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-4 max-w-5xl mx-auto w-full space-y-12">
              {rentalType === "hora" ? (
                <>
                  {/* MASTER ROOMS */}
                  {(activeTier === "all" || activeTier === "master") &&
                    masterRooms.length > 0 && (
                      <section className="bg-zinc-900 -mx-4 px-4 py-8 lg:rounded-3xl lg:mx-0 border border-zinc-800 shadow-2xl">
                        <div className="flex items-center gap-2 mb-4">
                          <Crown className="w-6 h-6 text-amber-500" />
                          <div>
                            <h2 className="text-xl font-bold text-white">
                              Salas Master
                            </h2>
                            <p className="text-xs font-medium text-zinc-400">
                              O mais alto padrão de sofisticação e conforto.
                            </p>
                          </div>
                        </div>

                        {activeTier === "master" && renderFusionPassBanner()}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {masterRooms.map((room) => (
                            <RoomCard
                              key={room.id}
                              room={room}
                              isFavorited={favorites.has(room.id)}
                              onToggleFavorite={toggleFavorite}
                              onOpen={onOpenRoom}
                              usingLocation={usingLocation}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                  {/* VIP ROOMS */}
                  {(activeTier === "all" || activeTier === "vip") &&
                    vipRooms.length > 0 && (
                      <section className="pt-8">
                        <div className="flex items-center gap-2 mb-4">
                          <Star className="w-6 h-6 text-zinc-900" />
                          <div>
                            <h2 className="text-xl font-bold text-zinc-900">
                              Salas VIP
                            </h2>
                            <p className="text-xs font-medium text-zinc-500">
                              Ambientes premium com design diferenciado.
                            </p>
                          </div>
                        </div>

                        {activeTier === "vip" && renderFusionPassBanner()}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {vipRooms.map((room) => (
                            <RoomCard
                              key={room.id}
                              room={room}
                              isFavorited={favorites.has(room.id)}
                              onToggleFavorite={toggleFavorite}
                              onOpen={onOpenRoom}
                              usingLocation={usingLocation}
                            />
                          ))}
                        </div>
                      </section>
                    )}

                  {/* BASIC ROOMS */}
                  {(activeTier === "all" || activeTier === "start") &&
                    startRooms.length > 0 && (
                      <section className="border-t border-zinc-200 pt-8 pb-8">
                        <div className="flex items-center gap-2 mb-4">
                          <Shield className="w-6 h-6 text-zinc-400" />
                          <div>
                            <h2 className="text-xl font-bold text-zinc-900">
                              Salas Basic
                            </h2>
                            <p className="text-xs font-medium text-zinc-500">
                              Conforto e o melhor custo-benefício.
                            </p>
                          </div>
                        </div>

                        {activeTier === "start" && renderFusionPassBanner()}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                          {startRooms.map((room) => (
                            <RoomCard
                              key={room.id}
                              room={room}
                              isFavorited={favorites.has(room.id)}
                              onToggleFavorite={toggleFavorite}
                              onOpen={onOpenRoom}
                              usingLocation={usingLocation}
                            />
                          ))}
                        </div>
                      </section>
                    )}
                </>
              ) : (
                /* GRID SIMPLES PARA TURNO OU FIXO */
                <section className="pt-4 pb-8">
                  <div className="flex items-center gap-3 mb-6">
                    <Building2 className="w-6 h-6 text-[#f05e23]" />
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900 capitalize">
                        Espaços Disponíveis
                      </h2>
                      <p className="text-xs font-medium text-zinc-500">
                        {processedRooms.length}{" "}
                        {processedRooms.length === 1
                          ? "sala encontrada"
                          : "salas encontradas"}{" "}
                        para locação por {rentalType}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {processedRooms.map((room) => (
                      <RoomCard
                        key={room.id}
                        room={room}
                        isFavorited={favorites.has(room.id)}
                        onToggleFavorite={toggleFavorite}
                        onOpen={onOpenRoom}
                        usingLocation={usingLocation}
                      />
                    ))}
                  </div>
                </section>
              )}
            </div>
          )}
        </>
      )}

      {/* MODAL DE FILTROS */}
      <Dialog open={isFilterModalOpen} onOpenChange={setIsFilterModalOpen}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader className="border-b border-zinc-100 pb-3">
            <DialogTitle className="text-lg font-bold text-zinc-900">
              Filtros Avançados
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider">
                Geolocalização (Sua Região)
              </Label>
              <button
                onClick={requestLocation}
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${usingLocation ? "border-[#f05e23] bg-orange-50/50 text-[#f05e23]" : "border-zinc-200 hover:border-zinc-300 text-zinc-700"}`}
              >
                <div className="flex items-center gap-3">
                  <Navigation
                    className={`w-5 h-5 ${usingLocation ? "fill-[#f05e23]" : ""}`}
                  />
                  <div className="text-left">
                    <span className="font-bold text-sm block">
                      Perto de Mim
                    </span>
                    <span className="text-xs font-medium text-zinc-500">
                      Mostra as salas mais próximas
                    </span>
                  </div>
                </div>
                {usingLocation && (
                  <Badge className="bg-[#f05e23] text-white border-0 font-bold">
                    Ativado
                  </Badge>
                )}
              </button>
            </div>

            <div className="space-y-3">
              <Label className="text-xs font-bold text-zinc-500 uppercase tracking-wider flex justify-between">
                <span>Faixa de Preço</span>
                <span className="text-zinc-400 font-medium normal-case">
                  Modalidade:{" "}
                  {rentalTypes.find((t) => t.id === rentalType)?.label}
                </span>
              </Label>
              <div className="flex items-center gap-3">
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-3 text-zinc-400 text-sm">
                    R$
                  </span>
                  <Input
                    type="number"
                    placeholder="Mín."
                    value={minPrice}
                    onChange={(e) => setMinPrice(e.target.value)}
                    className="h-10 pl-9 rounded-xl border-zinc-200 text-sm font-semibold"
                  />
                </div>
                <span className="text-zinc-300">-</span>
                <div className="flex-1 relative">
                  <span className="absolute left-3 top-3 text-zinc-400 text-sm">
                    R$
                  </span>
                  <Input
                    type="number"
                    placeholder="Máx."
                    value={maxPrice}
                    onChange={(e) => setMaxPrice(e.target.value)}
                    className="h-10 pl-9 rounded-xl border-zinc-200 text-sm font-semibold"
                  />
                </div>
              </div>
            </div>
          </div>
          <DialogFooter className="border-t border-zinc-100 pt-4 flex flex-row gap-3">
            <Button
              variant="ghost"
              onClick={() => {
                setMinPrice("");
                setMaxPrice("");
                setUsingLocation(false);
                setUserLocation(null);
              }}
              className="flex-1 font-semibold text-zinc-500 hover:bg-zinc-100 h-12 rounded-xl"
            >
              Limpar Tudo
            </Button>
            <Button
              onClick={() => setIsFilterModalOpen(false)}
              className="flex-1 bg-zinc-900 text-white hover:bg-zinc-800 font-bold h-12 rounded-xl shadow-lg"
            >
              Aplicar Filtros
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

// ==========================================
// COMPONENTE DO CARD DA SALA
// ==========================================
function RoomCard({
  room,
  isFavorited,
  onToggleFavorite,
  onOpen,
  horizontal = false,
  usingLocation = false,
}: {
  room: Room;
  isFavorited: boolean;
  onToggleFavorite: (e: React.MouseEvent, id: string) => void;
  onOpen?: (room: Room) => void;
  horizontal?: boolean;
  usingLocation?: boolean;
}) {
  const isMaster = room.tier === "master";
  const isVip = room.tier === "vip";
  const isBasic = room.tier === "start";

  return (
    <div
      onClick={() => onOpen && onOpen(room)}
      className={`group cursor-pointer flex flex-col bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${horizontal ? "w-[260px] shrink-0 snap-start" : "w-full"}`}
    >
      <div
        className={`relative w-full bg-zinc-100 ${horizontal ? "h-40" : "aspect-[4/3]"}`}
      >
        <Image
          src={room.image}
          alt={room.name}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e: any) => {
            e.target.src = "/placeholder.jpg";
          }}
        />

        <div className="absolute top-2 left-2 flex flex-col gap-1 z-10">
          {room.isPartner && (
            <div className="bg-white/95 backdrop-blur px-2 py-1 rounded-md text-[9px] font-bold text-orange-600 uppercase tracking-wider flex items-center gap-1 shadow-sm">
              <Sparkles className="w-3 h-3 fill-orange-500" /> Destaque
            </div>
          )}
        </div>

        <div className="absolute top-2 right-2 z-10">
          {isMaster && (
            <Badge className="bg-amber-500 text-zinc-950 font-black border-0 shadow-sm">
              <Crown className="w-3 h-3 mr-1" /> Master
            </Badge>
          )}
          {isVip && (
            <Badge className="bg-zinc-900 text-white font-black border-0 shadow-sm">
              <Star className="w-3 h-3 mr-1" /> VIP
            </Badge>
          )}
          {isBasic && (
            <Badge className="bg-white text-zinc-700 font-black border border-zinc-200 shadow-sm">
              <Shield className="w-3 h-3 mr-1" /> Basic
            </Badge>
          )}
        </div>

        <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300"></div>

        <button
          onClick={(e) => onToggleFavorite(e, room.id)}
          className="absolute bottom-3 right-3 p-2 rounded-full bg-white/30 backdrop-blur-md hover:bg-white/80 transition-colors z-10 shadow-sm"
        >
          <Heart
            className={`h-4 w-4 transition-colors ${isFavorited ? "fill-red-500 text-red-500" : "text-white group-hover:text-zinc-900"}`}
          />
        </button>
      </div>

      <div className="flex flex-col p-4 flex-1">
        <div className="flex justify-between items-start gap-2 mb-1.5">
          <h3 className="truncate text-base font-bold text-zinc-900 leading-tight group-hover:text-[#f05e23] transition-colors">
            {room.name}
          </h3>
          <div className="flex shrink-0 items-center gap-0.5">
            <Star className="h-3 w-3 fill-zinc-900 text-zinc-900" />
            <span className="text-xs font-semibold text-zinc-700">
              {room.rating}
            </span>
          </div>
        </div>

        <p className="text-xs font-medium text-zinc-500 truncate flex items-center gap-1.5 mb-2">
          <MapPin className="w-3.5 h-3.5 shrink-0" />
          {room.category} • {room.distance}
        </p>

        {usingLocation && room.distanceKm && (
          <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-md mb-2 flex items-center gap-1">
            <Navigation className="w-3 h-3" /> A {room.distanceKm.toFixed(1)} km
          </p>
        )}

        <div className="mt-auto pt-3 border-t border-zinc-100 flex items-end justify-between">
          <div>
            <p className="text-[9px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">
              Locação Avulsa
            </p>
            <p className="text-base font-black text-zinc-900">
              {room.priceLabel}
            </p>
          </div>
          <div className="w-8 h-8 rounded-full bg-zinc-50 flex items-center justify-center group-hover:bg-[#f05e23] group-hover:text-white transition-colors text-zinc-400">
            <ArrowRight className="w-4 h-4" />
          </div>
        </div>
      </div>
    </div>
  );
}
