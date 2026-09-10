"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMobileBack } from "@/hooks/use-mobile-back";
import { addMonths, format } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  CheckCircle2,
  ArrowLeft,
  ArrowRight,
  Building2,
  Stethoscope,
  Info,
  Zap,
  RefreshCw,
  Unlock,
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
  tier: "start" | "vip" | "master";
  priceLabel: string;
  filterPrice: number;
  image: string;
  rating: number;
  reviews_count: number;
  distance: string;
  distanceKm?: number;
  modalities: string[];
  isPartner: boolean;
  locationString: string;
  rawAddress?: any;
  host_id?: string;
  specialty?: string;
  selectedModality?: RentalType;
}

interface PlanOption {
  hours: number;
  price: number;
}

interface PlanPackage {
  id: "start" | "vip" | "master";
  title: string;
  icon: any;
  badge: string | null;
  cardStyle: string;
  headerStyle: string;
  iconStyle: string;
  buttonStyle: string;
  optionStyle: string;
  benefits: string[];
  options: PlanOption[];
}

const BASE_PACKAGE_INFO = {
  start: {
    title: "Pass Basic",
    icon: Shield,
    badge: null,
    cardStyle: "bg-white border-zinc-200 mt-0 lg:mt-6",
    headerStyle: "text-zinc-900",
    iconStyle: "bg-zinc-100 text-zinc-600",
    buttonStyle: "bg-zinc-900 hover:bg-zinc-800 text-white",
    optionStyle:
      "text-zinc-600 hover:bg-zinc-200 bg-zinc-100 data-[state=active]:bg-white data-[state=active]:text-zinc-900 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-zinc-200",
    benefits: [
      "Salas Basic liberadas",
      "Menor custo por hora",
      "Suporte padrão",
    ],
  },
  vip: {
    title: "Pass VIP",
    icon: Star,
    badge: "Mais Vantajoso",
    cardStyle:
      "bg-white border-[#BF4B24] shadow-2xl shadow-orange-500/10 relative z-10 lg:scale-105",
    headerStyle: "text-orange-950",
    iconStyle: "bg-orange-50 text-[#BF4B24]",
    buttonStyle: "bg-[#BF4B24] hover:bg-[#9A3C1D] text-white",
    optionStyle:
      "text-orange-700 hover:bg-orange-100 bg-orange-50 data-[state=active]:bg-[#BF4B24] data-[state=active]:text-white data-[state=active]:shadow-md",
    benefits: [
      "Salas VIP e Basic",
      "Economia de até 40%",
      "Agendamento prioritário",
    ],
  },
  master: {
    title: "Pass Premium",
    icon: Crown,
    badge: "Exclusivo",
    cardStyle: "bg-zinc-950 border-zinc-800 mt-0 lg:mt-6",
    headerStyle: "text-white",
    iconStyle: "bg-amber-500/10 text-amber-500",
    buttonStyle: "bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black",
    optionStyle:
      "text-zinc-400 hover:bg-zinc-800 bg-zinc-900 data-[state=active]:bg-zinc-700 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-zinc-600",
    benefits: [
      "Acesso a TODAS as salas",
      "Status Premium no perfil",
      "Maior margem de lucro",
    ],
  },
};

const rentalTypes: { id: RentalType; label: string }[] = [
  { id: "hora", label: "Por Hora" },
  { id: "turno", label: "Turno Fixo" },
  { id: "fixo", label: "Mensal (Fixo)" },
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

  const [activeSub, setActiveSub] = useState<any>(null);

  const [bestHourlyRates, setBestHourlyRates] = useState<
    Record<string, number>
  >({});
  const [dynamicPackages, setDynamicPackages] = useState<PlanPackage[]>([]);
  const [selectedBundles, setSelectedBundles] = useState<{
    start: number;
    vip: number;
    master: number;
  }>({ start: 16, vip: 16, master: 16 });

  const [isProcessingCheckout, setIsProcessingCheckout] = useState<
    string | null
  >(null);

  // SÊNIOR: Estado do Modal Transparente de Assinatura
  const [subModal, setSubModal] = useState<{
    isOpen: boolean;
    pkg: PlanPackage | null;
    option: PlanOption | null;
  }>({ isOpen: false, pkg: null, option: null });

  useMobileBack(
    isWalletOpen,
    () => setIsWalletOpen(false),
    "fusion-pass-modal",
  );
  useMobileBack(
    isFilterModalOpen,
    () => setIsFilterModalOpen(false),
    "filter-modal",
  );
  useMobileBack(
    subModal.isOpen,
    () => setSubModal({ isOpen: false, pkg: null, option: null }),
    "sub-modal",
  );

  const fetchWalletData = async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const { data: profileData } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .single();

    const { data: subData } = await supabase
      .from("subscriptions")
      .select("tier, status, hours")
      .eq("user_id", user.id)
      .eq("status", "ACTIVE")
      .maybeSingle();
    setActiveSub(subData);

    const { data: txData } = await supabase
      .from("wallet_transactions")
      .select("amount, created_at, description, type, tier, expires_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false });

    let bStart = 0,
      bVip = 0,
      bMaster = 0;
    const now = new Date();

    if (txData) {
      txData.forEach((tx) => {
        if (tx.amount > 0 && tx.expires_at && new Date(tx.expires_at) < now)
          return;
        const amt = Number(tx.amount);
        const txTier = tx.tier?.toLowerCase() || "start";

        if (txTier === "master" || txTier === "premium") bMaster += amt;
        else if (txTier === "vip") bVip += amt;
        else bStart += amt;
      });
    }

    if (bStart < 0) {
      bVip += bStart;
      bStart = 0;
    }
    if (bVip < 0) {
      bMaster += bVip;
      bVip = 0;
    }

    bStart = Math.max(0, bStart);
    bVip = Math.max(0, bVip);
    bMaster = Math.max(0, bMaster);

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
  };

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

        const rates: Record<string, number> = {};
        Object.keys(grouped).forEach((tier) => {
          const tierPkgs = grouped[tier];
          const targetPkg =
            tierPkgs.find((p: any) => p.hours === 20) ||
            tierPkgs[tierPkgs.length - 1];
          if (targetPkg) {
            rates[tier] = targetPkg.price / targetPkg.hours;
          }
        });
        setBestHourlyRates(rates);

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

      const { data: roomsData, error: roomsError } = await supabase
        .from("rooms")
        .select(
          `id, name, image_url, modalities, is_partner, specialty, tier, address_details, host_id, reviews ( rating )`,
        )
        .eq("is_active", true)
        .eq("is_paused", false);

      if (roomsError) console.error("Erro ao buscar salas:", roomsError);

      if (roomsData) {
        const formattedRooms = roomsData.map((r: any) => {
          const pricing = r.address_details?.pricing || {};
          const address = r.address_details || {};
          const finalModalities = Array.isArray(r.modalities)
            ? r.modalities
            : [];
          const reviewsArray = r.reviews || [];
          const reviews_count = reviewsArray.length;
          const rating =
            reviews_count > 0
              ? reviewsArray.reduce(
                  (acc: number, curr: any) => acc + curr.rating,
                  0,
                ) / reviews_count
              : 0;

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
            label = minTurno > 0 ? `R$ ${minTurno}/mês` : "Sob consulta";
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
              label = `R$ ${val}/mês`;
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
            rating: rating,
            reviews_count: reviews_count,
            distance: address.city || "Localização pendente",
            modalities: finalModalities,
            isPartner: r.is_partner === true,
            locationString: [address.street, address.city, address.neighborhood]
              .filter(Boolean)
              .join(", "),
            rawAddress: address,
            host_id: r.host_id,
            specialty: r.specialty,
          };
        });
        setDbRooms(formattedRooms);
      }

      if (!isPublic) {
        await fetchWalletData();
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

  const handleOpenWalletPromo = () => {
    setIsWalletOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  // SÊNIOR: Abertura e Confirmação da Assinatura via Modal
  const handleBuyPackage = (pkg: PlanPackage, option: PlanOption) => {
    setSubModal({ isOpen: true, pkg, option });
  };

  const confirmSubscription = async () => {
    if (!subModal.pkg || !subModal.option) return;
    setIsProcessingCheckout(subModal.pkg.id);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Faça login",
          description: "Você precisa estar logado para assinar.",
        });
        return;
      }

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutType: "package",
          packageId: subModal.pkg.id,
          hours: subModal.option.hours,
          price: subModal.option.price,
          packageName: subModal.pkg.title,
        }),
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(data.error || "Falha ao gerar pagamento.");

      await fetchWalletData(); // Atualiza a carteira em tempo real no frontend

      toast({
        title: "Assinatura Ativa! 🎉",
        description: "Suas horas foram adicionadas à carteira com sucesso.",
      });

      setSubModal({ isOpen: false, pkg: null, option: null });
      setIsWalletOpen(true);
      window.scrollTo({ top: 0, behavior: "smooth" });
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro no Checkout",
        description: err.message,
      });
    } finally {
      setIsProcessingCheckout(null);
    }
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
          if (r.rawAddress?.lat && r.rawAddress?.lng)
            d = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              r.rawAddress.lat,
              r.rawAddress.lng,
            );
          else d = Math.random() * 12 + 1;
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

  const masterRooms = processedRooms.filter((r) => r.tier === "master");
  const vipRooms = processedRooms.filter((r) => r.tier === "vip");
  const startRooms = processedRooms.filter(
    (r) => r.tier === "start" || !r.tier,
  );

  const renderFusionPassBanner = () => {
    if (activeTier === "all") return null;

    let title,
      subtitle,
      Icon,
      bgClass,
      iconColorClass,
      textClass,
      descClass,
      buttonClass,
      benefits;

    if (activeTier === "vip") {
      title = "Fusion Pass VIP";
      subtitle =
        "Desbloqueie salas de alto padrão e economize até 40% em cada sessão.";
      Icon = Star;
      bgClass = "bg-orange-50 border-orange-200";
      iconColorClass = "text-[#BF4B24]";
      textClass = "text-orange-950";
      descClass = "text-orange-800";
      buttonClass =
        "bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-orange-500/20";
      benefits = ["Economia de até 40%", "Prioridade na Agenda"];
    } else if (activeTier === "master") {
      title = "Fusion Pass Premium";
      subtitle = "Acesso ilimitado à elite dos consultórios médicos.";
      Icon = Crown;
      bgClass = "bg-zinc-950 border-zinc-800";
      iconColorClass = "text-amber-500";
      textClass = "text-white";
      descClass = "text-zinc-400";
      buttonClass = "bg-amber-500 hover:bg-amber-600 text-zinc-950 font-black";
      benefits = ["Acesso Total", "Maior Margem de Economia"];
    } else {
      title = "Fusion Pass Basic";
      subtitle = "Garante o menor custo por hora e previsibilidade.";
      Icon = Shield;
      bgClass = "bg-zinc-50 border-zinc-200";
      iconColorClass = "text-zinc-600";
      textClass = "text-zinc-900";
      descClass = "text-zinc-600";
      buttonClass = "bg-zinc-900 hover:bg-zinc-800 text-white";
      benefits = ["Melhor Custo-Benefício", "Salas Padrão Liberadas"];
    }

    return (
      <div
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-5 sm:p-6 rounded-2xl mb-8 border shadow-sm transition-all ${bgClass}`}
      >
        <div className="flex items-start sm:items-center gap-4 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-white border border-zinc-200/50">
            <Icon className={`w-6 h-6 ${iconColorClass}`} />
          </div>
          <div>
            <h3 className={`text-lg font-black ${textClass} leading-tight`}>
              {title}
            </h3>
            <p
              className={`text-sm font-medium mt-0.5 leading-snug max-w-sm ${descClass}`}
            >
              {subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-3 mt-3">
              {benefits.map((ben, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                  <span className={`text-xs font-bold ${textClass}`}>
                    {ben}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Button
          onClick={handleOpenWalletPromo}
          className={`w-full sm:w-auto shrink-0 rounded-xl font-bold h-12 px-6 ${buttonClass}`}
        >
          Ver Planos e Assinar
        </Button>
      </div>
    );
  };

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-screen bg-zinc-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );

  return (
    <div className="flex flex-col pb-24 bg-zinc-50 min-h-screen relative font-sans">
      <header className="bg-gradient-to-r from-[#BF4B24] to-[#9A3C1D] px-4 pb-12 pt-10 lg:px-8 lg:pt-12 rounded-b-3xl shadow-md">
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
              className="flex flex-col items-end cursor-pointer group transition-opacity mr-14 mt-1"
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
        <div className="mx-auto w-full max-w-5xl px-4 -mt-6 relative z-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white rounded-3xl p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-zinc-100 relative overflow-hidden mb-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-50 via-transparent to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div>
                <p className="text-zinc-500 font-bold uppercase tracking-wider text-xs mb-2 flex items-center gap-2">
                  <Wallet className="w-5 h-5" /> Saldo Total
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
                      <Crown className="w-4 h-4 text-amber-500" /> Premium
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
                Escolha o nível de exclusividade e garanta descontos.
              </p>
            </div>
          </div>

          {activeSub ? (
            <div className="bg-zinc-900 rounded-3xl p-8 text-white border border-zinc-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
              <div>
                <p className="text-xs text-amber-500 font-black uppercase tracking-widest mb-1">
                  Pass Ativo
                </p>
                <h3 className="text-2xl font-black flex items-center gap-2 capitalize">
                  <Crown className="w-6 h-6 text-amber-500" /> Fusion Pass{" "}
                  {activeSub.tier}
                </h3>
                <p className="text-sm font-medium text-zinc-400 mt-2">
                  Seus descontos exclusivos já estão sendo aplicados em todas as
                  reservas.
                </p>
              </div>
              <div className="text-right w-full md:w-auto">
                <Button
                  variant="outline"
                  onClick={() => {
                    window.location.hash = "profile";
                    window.dispatchEvent(new HashChangeEvent("hashchange"));
                  }}
                  className="w-full md:w-auto bg-transparent border-zinc-700 text-white hover:bg-zinc-800 hover:text-white font-bold h-12"
                >
                  Gerenciar Assinatura
                </Button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-12 items-start">
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
                    className={`rounded-3xl p-6 sm:p-8 flex flex-col border transition-all ${pkg.cardStyle}`}
                  >
                    <div className="flex justify-between items-start mb-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${pkg.iconStyle}`}
                        >
                          <Icon className="w-6 h-6 fill-current" />
                        </div>
                        <h4 className={`text-xl font-black ${pkg.headerStyle}`}>
                          {pkg.title}
                        </h4>
                      </div>
                      {pkg.badge && (
                        <span className="bg-[#BF4B24] text-white text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-md shadow-sm">
                          {pkg.badge}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-2 mb-6">
                      {pkg.options.map((opt) => (
                        <button
                          key={opt.hours}
                          onClick={() =>
                            setSelectedBundles({
                              ...selectedBundles,
                              [pkg.id]: opt.hours,
                            })
                          }
                          data-state={
                            currentHours === opt.hours ? "active" : "inactive"
                          }
                          className={`flex-1 py-2 text-sm font-bold rounded-xl transition-all border ${pkg.optionStyle}`}
                        >
                          {opt.hours}h
                        </button>
                      ))}
                    </div>

                    <div className="mb-6 flex items-baseline gap-1">
                      <span
                        className={`text-4xl font-black ${pkg.headerStyle}`}
                      >
                        R$ {selectedOption.price}
                      </span>
                      <span className="text-sm font-bold opacity-50 uppercase tracking-widest">
                        /mês
                      </span>
                    </div>

                    <div className="space-y-4 mb-8 flex-1">
                      {pkg.benefits.map((benefit, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <CheckCircle2 className="w-5 h-5 shrink-0 text-emerald-500" />
                          <span
                            className={`text-sm font-medium leading-tight ${pkg.headerStyle} opacity-90`}
                          >
                            {benefit}
                          </span>
                        </div>
                      ))}
                    </div>

                    <Button
                      onClick={() => handleBuyPackage(pkg, selectedOption)}
                      className={`w-full h-14 rounded-xl font-black flex items-center justify-center transition-all ${pkg.buttonStyle}`}
                    >
                      Assinar Agora
                    </Button>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <>
          {/* SEARCH COMPONENT (Escondido se a carteira estiver aberta) */}
          <div className="mx-auto w-full max-w-5xl px-4 -mt-6 relative z-20 sticky top-4 animate-in fade-in duration-300">
            <div className="flex flex-col gap-3">
              <div className="flex items-center gap-2">
                <div className="relative flex items-center flex-1 bg-white rounded-2xl border border-zinc-200 shadow-[0_4px_20px_rgb(0,0,0,0.03)] h-14 transition-all focus-within:ring-2 focus-within:ring-[#BF4B24]/20">
                  <Search className="absolute left-4 h-5 w-5 text-zinc-400" />
                  <Input
                    placeholder="Buscar por localização ou especialidade..."
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
                    <span className="absolute top-3 right-3 w-2 h-2 bg-[#BF4B24] rounded-full"></span>
                  )}
                </button>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 mx-auto max-w-5xl w-full mt-4 space-y-5">
            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 pl-1">
                Modalidade de Locação
              </p>
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

            {rentalType === "turno" && (
              <div className="bg-blue-50/80 border border-blue-100 p-4 rounded-2xl flex items-start gap-3 mt-2 animate-in fade-in zoom-in-95">
                <Info className="w-5 h-5 text-blue-600 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-blue-900 mb-0.5">
                    O que é a Locação por Turno?
                  </p>
                  <p className="text-xs font-medium text-blue-800/80 leading-relaxed">
                    Você garante o mesmo bloco de 4 horas durante um mês
                    inteiro.{" "}
                    <strong className="text-blue-900">
                      Total de aprox. 16h/mês.
                    </strong>
                  </p>
                </div>
              </div>
            )}

            <div>
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 pl-1">
                Padrão do Espaço
              </p>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                <button
                  onClick={() => setActiveTier("all")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 border ${activeTier === "all" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setActiveTier("start")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 border ${activeTier === "start" ? "bg-zinc-100 text-zinc-900 border-zinc-200" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"}`}
                >
                  <Shield className="w-4 h-4" /> Basic
                </button>
                <button
                  onClick={() => setActiveTier("vip")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 border ${activeTier === "vip" ? "bg-orange-50 text-[#BF4B24] border-orange-200" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"}`}
                >
                  <Star className="w-4 h-4" /> VIP
                </button>
                <button
                  onClick={() => setActiveTier("master")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 border ${activeTier === "master" ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"}`}
                >
                  <Crown className="w-4 h-4" /> Premium
                </button>
              </div>
            </div>

            <div className="pb-2">
              <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-2 pl-1">
                Especialidade / Categoria
              </p>
              <div className="flex flex-nowrap items-center gap-2 overflow-x-auto scrollbar-hide pb-2">
                {availableCategories.map((cat) => (
                  <button
                    key={cat}
                    onClick={() => setSelectedCategory(cat)}
                    className={`shrink-0 whitespace-nowrap px-4 py-2 rounded-xl text-xs font-semibold transition-all border ${selectedCategory === cat ? "bg-[#BF4B24] text-white border-[#BF4B24]" : "bg-white text-zinc-600 border-zinc-200 hover:bg-zinc-50"}`}
                  >
                    {cat}
                  </button>
                ))}
              </div>
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
            <div className="px-4 max-w-5xl mx-auto w-full space-y-12 pb-12">
              {(activeTier === "all" || activeTier === "master") &&
                masterRooms.length > 0 && (
                  <section className="bg-zinc-900 -mx-4 px-4 py-8 lg:rounded-3xl lg:mx-0 border border-zinc-800 shadow-2xl">
                    <div className="flex items-center gap-2 mb-4">
                      <Crown className="w-6 h-6 text-amber-500" />
                      <div>
                        <h2 className="text-xl font-bold text-white">
                          Salas Premium
                        </h2>
                        <p className="text-xs font-medium text-zinc-400">
                          O mais alto padrão de sofisticação e conforto.
                        </p>
                      </div>
                    </div>
                    {activeTier === "master" &&
                      rentalType === "hora" &&
                      renderFusionPassBanner()}
                    <div
                      className={
                        masterRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                          : "flex overflow-x-auto gap-4 pb-6 snap-x scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
                      }
                    >
                      {masterRooms.map((room) => (
                        <RoomCard
                          key={room.id}
                          room={{ ...room, selectedModality: rentalType }}
                          bestHourlyRate={bestHourlyRates[room.tier]}
                          isFavorited={favorites.has(room.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={onOpenRoom}
                          horizontal={masterRooms.length > 1}
                          usingLocation={usingLocation}
                          activeTier={activeTier}
                        />
                      ))}
                    </div>
                  </section>
                )}

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
                    {activeTier === "vip" &&
                      rentalType === "hora" &&
                      renderFusionPassBanner()}
                    <div
                      className={
                        vipRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                          : "flex overflow-x-auto gap-4 pb-6 snap-x scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
                      }
                    >
                      {vipRooms.map((room) => (
                        <RoomCard
                          key={room.id}
                          room={{ ...room, selectedModality: rentalType }}
                          bestHourlyRate={bestHourlyRates[room.tier]}
                          isFavorited={favorites.has(room.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={onOpenRoom}
                          horizontal={vipRooms.length > 1}
                          usingLocation={usingLocation}
                          activeTier={activeTier}
                        />
                      ))}
                    </div>
                  </section>
                )}

              {(activeTier === "all" || activeTier === "start") &&
                startRooms.length > 0 && (
                  <section className="border-t border-zinc-200 pt-8 pb-8 mt-8">
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
                    {activeTier === "start" &&
                      rentalType === "hora" &&
                      renderFusionPassBanner()}
                    <div
                      className={
                        startRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5"
                          : "flex overflow-x-auto gap-4 pb-6 snap-x scrollbar-hide -mx-4 px-4 sm:mx-0 sm:px-0"
                      }
                    >
                      {startRooms.map((room) => (
                        <RoomCard
                          key={room.id}
                          room={{ ...room, selectedModality: rentalType }}
                          bestHourlyRate={bestHourlyRates[room.tier]}
                          isFavorited={favorites.has(room.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={onOpenRoom}
                          horizontal={startRooms.length > 1}
                          usingLocation={usingLocation}
                          activeTier={activeTier}
                        />
                      ))}
                    </div>
                  </section>
                )}
            </div>
          )}
        </>
      )}

      {/* SÊNIOR: MODAL DE CONFIRMAÇÃO DE ASSINATURA */}
      <Dialog
        open={subModal.isOpen}
        onOpenChange={(open) =>
          !open && setSubModal({ isOpen: false, pkg: null, option: null })
        }
      >
        <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden bg-slate-50 border-0">
          {subModal.pkg && subModal.option && (
            <div className="flex flex-col">
              <div
                className={`p-6 pb-10 ${subModal.pkg.id === "master" ? "bg-zinc-950 text-white" : subModal.pkg.id === "vip" ? "bg-[#ea580c] text-white" : "bg-slate-900 text-white"}`}
              >
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/20">
                  <subModal.pkg.icon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-black mb-1">Revisar Assinatura</h2>
                <p className="text-sm opacity-80 font-medium">
                  Você está a um passo de assinar o plano {subModal.pkg.title}.
                </p>
              </div>

              <div className="p-6 bg-white -mt-6 rounded-t-3xl relative z-10 flex flex-col gap-6 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.1)]">
                <div className="flex justify-between items-center bg-slate-50 p-4 rounded-2xl border border-slate-100">
                  <div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                      Plano Selecionado
                    </p>
                    <p className="text-lg font-black text-slate-900">
                      {subModal.pkg.title}{" "}
                      <span className="text-slate-500 font-bold text-sm">
                        ({subModal.option.hours}h)
                      </span>
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">
                      Mensalidade
                    </p>
                    <p className="text-xl font-black text-[#BF4B24]">
                      R$ {subModal.option.price}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <Shield className="w-4 h-4 text-emerald-500" />{" "}
                    Transparência Fusion
                  </h4>
                  <div className="space-y-4">
                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-50 flex items-center justify-center shrink-0">
                        <Zap className="w-5 h-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Liberação Imediata
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
                          As{" "}
                          <strong className="text-slate-700">
                            {subModal.option.hours} horas
                          </strong>{" "}
                          caem na sua carteira assim que você confirmar a
                          assinatura.
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center shrink-0">
                        <RefreshCw className="w-5 h-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Renovação Automática
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
                          Próxima cobrança será em{" "}
                          <strong className="text-slate-700">
                            {format(addMonths(new Date(), 1), "dd 'de' MMMM", {
                              locale: ptBR,
                            })}
                          </strong>
                          .
                        </p>
                      </div>
                    </div>

                    <div className="flex items-start gap-3">
                      <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                        <Unlock className="w-5 h-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-slate-900">
                          Cancele quando quiser
                        </p>
                        <p className="text-xs font-medium text-slate-500 mt-0.5 leading-relaxed">
                          Sem taxas escondidas. Você gerencia e cancela direto
                          pelo seu Perfil.
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
                    Forma de Pagamento
                  </p>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-6 bg-slate-800 rounded flex items-center justify-center shrink-0 shadow-sm">
                      <span className="text-[8px] font-black text-white">
                        VISA
                      </span>
                    </div>
                    <p className="text-sm font-bold text-slate-900 flex-1 truncate">
                      Cartão final 1111
                    </p>
                    <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 shadow-none text-[10px] uppercase tracking-wider font-bold">
                      Salvo
                    </Badge>
                  </div>
                </div>

                <Button
                  onClick={confirmSubscription}
                  disabled={isProcessingCheckout === subModal.pkg.id}
                  className="w-full h-14 bg-[#ea580c] hover:bg-[#9A3C1D] text-white font-black rounded-xl text-base shadow-xl shadow-orange-500/20 transition-all active:scale-95"
                >
                  {isProcessingCheckout === subModal.pkg.id ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    `Confirmar Assinatura - R$ ${subModal.option.price}`
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

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
                className={`w-full flex items-center justify-between p-4 rounded-xl border-2 transition-all ${usingLocation ? "border-[#BF4B24] bg-orange-50/50 text-[#BF4B24]" : "border-zinc-200 hover:border-zinc-300 text-zinc-700"}`}
              >
                <div className="flex items-center gap-3">
                  <Navigation
                    className={`w-5 h-5 ${usingLocation ? "fill-[#BF4B24]" : ""}`}
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
                  <Badge className="bg-[#BF4B24] text-white border-0 font-bold">
                    Ativado
                  </Badge>
                )}
              </button>
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

function RoomCard({
  room,
  isFavorited,
  onToggleFavorite,
  onOpen,
  horizontal = false,
  usingLocation = false,
  bestHourlyRate,
  activeTier,
}: {
  room: Room;
  isFavorited: boolean;
  onToggleFavorite: (e: React.MouseEvent, id: string) => void;
  onOpen?: (room: Room) => void;
  horizontal?: boolean;
  usingLocation?: boolean;
  bestHourlyRate?: number;
  activeTier: string;
}) {
  const isMaster = room.tier === "master";
  const isVip = room.tier === "vip";
  const isBasic = room.tier === "start";

  const isHourly = room.selectedModality === "hora";
  const showDiscount =
    isHourly &&
    activeTier !== "all" &&
    bestHourlyRate &&
    room.filterPrice > bestHourlyRate;

  return (
    <div
      onClick={() => onOpen && onOpen(room)}
      className={`group cursor-pointer flex flex-col bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${horizontal ? "w-[280px] sm:w-[320px] shrink-0 snap-start" : "w-full"}`}
    >
      <div
        className={`relative w-full bg-zinc-100 ${horizontal ? "h-40 sm:h-48" : "aspect-[4/3]"}`}
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
              <Crown className="w-3 h-3 mr-1" /> Premium
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

      <div className="flex flex-col p-4 flex-1 bg-white">
        <div>
          <div className="flex justify-between items-start mb-3 gap-2">
            <h3 className="font-bold text-lg text-slate-900 leading-tight line-clamp-2 group-hover:text-[#BF4B24] transition-colors">
              {room.name}
            </h3>
            {room.reviews_count > 0 ? (
              <div className="flex items-center gap-1 bg-emerald-50 px-2 py-1 rounded-md shrink-0 border border-emerald-100">
                <Star className="w-3 h-3 fill-emerald-600 text-emerald-600" />
                <span className="text-sm font-black text-emerald-900">
                  {Number(room.rating).toFixed(1)}
                </span>
                <span className="text-[10px] font-bold text-emerald-600 ml-0.5">
                  ({room.reviews_count})
                </span>
              </div>
            ) : (
              <div className="bg-orange-50 px-2 py-1 rounded-md shrink-0 border border-orange-100">
                <span className="text-[10px] font-black text-[#BF4B24] uppercase tracking-wider">
                  Novo
                </span>
              </div>
            )}
          </div>

          <div className="space-y-2 mb-4">
            <div className="flex items-center gap-2 text-slate-500">
              <MapPin className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="text-sm font-medium truncate">
                {room.rawAddress?.neighborhood || "Bairro não inf."},{" "}
                {room.rawAddress?.city || "Localização pendente"}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-500">
              <Stethoscope className="w-4 h-4 shrink-0 text-slate-400" />
              <span className="text-sm font-medium truncate">
                {room.specialty || room.category || "Consultório Padrão"}
              </span>
            </div>
          </div>
          {usingLocation && room.distanceKm && (
            <p className="text-[10px] font-bold text-emerald-600 bg-emerald-50 w-fit px-2 py-1 rounded-md mb-2 flex items-center gap-1">
              <Navigation className="w-3 h-3" /> A {room.distanceKm.toFixed(1)}{" "}
              km
            </p>
          )}
        </div>

        <div className="mt-auto pt-4 border-t border-slate-100 flex items-end justify-between">
          <div>
            <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest mb-0.5">
              {isHourly
                ? "Locação Avulsa"
                : room.selectedModality === "turno"
                  ? "Turno Mensal (16h)"
                  : "Locação Fixa"}
            </p>
            {showDiscount ? (
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-zinc-400 line-through mb-0.5">
                  {room.priceLabel}
                </span>
                <span className="text-lg font-black text-emerald-600 leading-none flex items-center gap-1.5 mt-0.5">
                  R${" "}
                  {bestHourlyRate.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                  /h{" "}
                  <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded-md uppercase tracking-wider">
                    c/ Pass
                  </span>
                </span>
              </div>
            ) : (
              <p className="text-lg font-black text-slate-900">
                {room.priceLabel}
              </p>
            )}
          </div>
          <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center group-hover:bg-[#BF4B24] group-hover:text-white transition-colors border border-slate-100 text-slate-400">
            <ArrowRight className="w-5 h-5" />
          </div>
        </div>
      </div>
    </div>
  );
}
