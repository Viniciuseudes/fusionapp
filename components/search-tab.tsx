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
  Wallet,
  RefreshCw,
  Unlock,
  Compass,
  BriefcaseMedical,
  Sofa,
  Activity,
  X,
  Calendar as CalendarIcon,
  Clock,
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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";

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
    cardStyle: "bg-white border-slate-200 mt-0 lg:mt-6",
    headerStyle: "text-slate-900",
    iconStyle: "bg-slate-100 text-slate-600",
    buttonStyle: "bg-slate-900 hover:bg-slate-800 text-white",
    optionStyle:
      "text-slate-600 hover:bg-slate-200 bg-slate-100 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-slate-200",
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
    cardStyle: "bg-slate-950 border-slate-800 mt-0 lg:mt-6",
    headerStyle: "text-white",
    iconStyle: "bg-amber-500/10 text-amber-500",
    buttonStyle: "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black",
    optionStyle:
      "text-slate-400 hover:bg-slate-800 bg-slate-900 data-[state=active]:bg-slate-700 data-[state=active]:text-white data-[state=active]:shadow-sm data-[state=active]:ring-1 data-[state=active]:ring-slate-600",
    benefits: [
      "Acesso a TODAS as salas",
      "Status Premium no perfil",
      "Maior margem de lucro",
    ],
  },
};

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

// ==========================================
// CATEGORIAS REVISADAS PARA A BUSCA
// ==========================================
const CATEGORIES = [
  {
    id: "Todas as Salas",
    icon: Building2,
    desc: "Visualizar todas as modalidades",
  },
  { id: "Psicologia", icon: Sofa, desc: "Divãs e poltronas confortáveis" },
  {
    id: "Nutrição & Clínica",
    icon: Activity,
    desc: "Mesa, balança e bioimpedância",
  },
  {
    id: "Odontologia",
    icon: Stethoscope,
    desc: "Cadeira odontológica completa",
  },
  { id: "Estética", icon: Sparkles, desc: "Maca e lavatório" },
  {
    id: "Multiuso",
    icon: BriefcaseMedical,
    desc: "Consultório clínico padrão",
  },
];

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

  // ==========================================
  // ESTADOS PENDENTES (RASCUNHO DA BUSCA)
  // O usuário mexe nesses sem afetar a lista de salas até clicar em "Buscar"
  // ==========================================
  const [pendingFilters, setPendingFilters] = useState({
    city: "Qualquer lugar",
    date: undefined as Date | undefined,
    time: "",
    modality: "hora" as RentalType,
    category: "Todas as Salas",
  });

  // ==========================================
  // ESTADOS APLICADOS (TELA REAL)
  // ==========================================
  const [appliedFilters, setAppliedFilters] = useState(pendingFilters);
  const [activeTier, setActiveTier] = useState<
    "all" | "start" | "vip" | "master"
  >("all");
  const [hasSearched, setHasSearched] = useState(false);

  // Estados de Interface
  const [activeSearchTab, setActiveSearchTab] = useState<
    "onde" | "quando" | "oque" | null
  >(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<
    "onde" | "quando" | "como" | "oque"
  >("onde");

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
  useMobileBack(
    isMobileSearchOpen,
    () => setIsMobileSearchOpen(false),
    "mobile-search",
  );

  const availableCities = useMemo(() => {
    const cities = new Set(
      dbRooms
        .map((r) => r.rawAddress?.city)
        .filter((city) => city && typeof city === "string"),
    );
    return Array.from(cities);
  }, [dbRooms]);

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
          if (targetPkg) rates[tier] = targetPkg.price / targetPkg.hours;
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

      if (roomsData) {
        const formattedRooms = roomsData.map((r: any) => {
          const address = r.address_details || {};
          const pricing = address.pricing || {};
          const finalModalities = Array.isArray(r.modalities)
            ? r.modalities
            : [];
          const reviewsArray = r.reviews || [];
          const rating =
            reviewsArray.length > 0
              ? reviewsArray.reduce(
                  (acc: number, curr: any) => acc + curr.rating,
                  0,
                ) / reviewsArray.length
              : 0;

          let label = "Sob consulta";
          let numPrice = 0;

          if (
            appliedFilters.modality === "hora" &&
            pricing.hourly &&
            finalModalities.includes("hora")
          ) {
            label = `R$ ${pricing.hourly}/hora`;
            numPrice = Number(pricing.hourly);
          } else if (
            appliedFilters.modality === "turno" &&
            finalModalities.includes("turno")
          ) {
            const turnos = [pricing.morning, pricing.afternoon, pricing.night]
              .filter(Boolean)
              .map(Number);
            const minTurno = turnos.length > 0 ? Math.min(...turnos) : 0;
            label = minTurno > 0 ? `R$ ${minTurno}/turno` : "Sob consulta";
            numPrice = minTurno;
          } else if (
            appliedFilters.modality === "fixo" &&
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
            rating: rating,
            reviews_count: reviewsArray.length,
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

      if (!isPublic) await fetchWalletData();
      setLoading(false);
    }
    fetchData();
  }, [isPublic, supabase, appliedFilters.modality]);

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      toast({
        title: "Buscando localização...",
        description: "Aguarde um momento...",
      });
      navigator.geolocation.getCurrentPosition(
        (position) => {
          setUserLocation({
            lat: position.coords.latitude,
            lng: position.coords.longitude,
          });
          setUsingLocation(true);

          setPendingFilters((prev) => ({ ...prev, city: "Perto de mim" }));

          if (isMobileSearchOpen) {
            setActiveMobileTab("quando");
          } else {
            setActiveSearchTab("quando");
          }
        },
        () => {
          toast({ variant: "destructive", title: "Permissão de GPS negada." });
        },
      );
    }
  };

  const handleClearFilters = () => {
    const cleared = {
      city: "Qualquer lugar",
      date: undefined,
      time: "",
      modality: "hora" as RentalType,
      category: "Todas as Salas",
    };
    setPendingFilters(cleared);
    setAppliedFilters(cleared);
    setActiveTier("all");
    setUsingLocation(false);
    setHasSearched(false);
    setActiveMobileTab("onde");
  };

  const handleExecuteSearch = () => {
    setAppliedFilters(pendingFilters);
    setHasSearched(true);
    setActiveSearchTab(null);
    setIsMobileSearchOpen(false);
    window.scrollTo({ top: 380, behavior: "smooth" });
  };

  // ==========================================
  // MOTOR DE BUSCA (Usa os appliedFilters)
  // ==========================================
  const searchResults = useMemo(() => {
    let exactMatches = dbRooms;
    let isFallback = false;
    let fallbackMessage = "";

    if (
      appliedFilters.city !== "Qualquer lugar" &&
      appliedFilters.city !== "Perto de mim"
    ) {
      exactMatches = exactMatches.filter(
        (r) =>
          r.rawAddress?.city?.toLowerCase() ===
          appliedFilters.city.toLowerCase(),
      );
    }

    if (appliedFilters.category !== "Todas as Salas") {
      exactMatches = exactMatches.filter((r) =>
        r.category
          .toLowerCase()
          .includes(appliedFilters.category.split(" ")[0].toLowerCase()),
      );
    }

    if (appliedFilters.modality) {
      exactMatches = exactMatches.filter((r) =>
        r.modalities.includes(appliedFilters.modality),
      );
    }

    if (activeTier !== "all") {
      exactMatches = exactMatches.filter((r) => r.tier === activeTier);
    }

    // Fallback Heurístico
    if (exactMatches.length === 0 && hasSearched) {
      isFallback = true;
      const cityMatches = dbRooms.filter(
        (r) =>
          appliedFilters.city === "Qualquer lugar" ||
          appliedFilters.city === "Perto de mim" ||
          r.rawAddress?.city?.toLowerCase() ===
            appliedFilters.city.toLowerCase(),
      );

      if (cityMatches.length > 0) {
        exactMatches = cityMatches;
        fallbackMessage = `Não encontramos espaços exatos para "${appliedFilters.category}" na modalidade desejada, mas veja estas excelentes salas na região.`;
      } else {
        exactMatches = dbRooms;
        fallbackMessage = `Ainda não temos unidades em "${appliedFilters.city}". Confira nossos espaços mais populares!`;
      }
    }

    // GPS Order
    if (usingLocation && userLocation) {
      exactMatches = exactMatches
        .map((r) => {
          let d = 999;
          if (r.rawAddress?.lat && r.rawAddress?.lng)
            d = calculateDistance(
              userLocation.lat,
              userLocation.lng,
              r.rawAddress.lat,
              r.rawAddress.lng,
            );
          return { ...r, distanceKm: d };
        })
        .sort((a, b) => (a.distanceKm || 999) - (b.distanceKm || 999));
    }

    return { rooms: exactMatches, isFallback, fallbackMessage };
  }, [
    dbRooms,
    appliedFilters,
    activeTier,
    hasSearched,
    usingLocation,
    userLocation,
  ]);

  const masterRooms = searchResults.rooms.filter((r) => r.tier === "master");
  const vipRooms = searchResults.rooms.filter((r) => r.tier === "vip");
  const startRooms = searchResults.rooms.filter(
    (r) => r.tier === "start" || !r.tier,
  );

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

      await fetchWalletData();

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
      bgClass = "bg-slate-950 border-slate-800";
      iconColorClass = "text-amber-500";
      textClass = "text-white";
      descClass = "text-slate-400";
      buttonClass = "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black";
      benefits = ["Acesso Total", "Maior Margem de Economia"];
    } else {
      title = "Fusion Pass Basic";
      subtitle = "Garante o menor custo por hora e previsibilidade.";
      Icon = Shield;
      bgClass = "bg-slate-50 border-slate-200";
      iconColorClass = "text-slate-600";
      textClass = "text-slate-900";
      descClass = "text-slate-600";
      buttonClass = "bg-slate-900 hover:bg-slate-800 text-white";
      benefits = ["Melhor Custo-Benefício", "Salas Padrão Liberadas"];
    }

    return (
      <div
        className={`flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-5 sm:p-6 rounded-2xl mb-8 border shadow-sm transition-all ${bgClass}`}
      >
        <div className="flex items-start sm:items-center gap-4 w-full sm:w-auto">
          <div className="w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-sm bg-white border border-slate-200/50">
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
      <div className="flex justify-center items-center min-h-screen bg-slate-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );

  return (
    <div className="flex flex-col pb-24 bg-slate-50 min-h-screen relative font-sans">
      {/* ========================================== */}
      {/* 1. O MODAL DE BUSCA MOBILE (ESTILO AIRBNB TELA CHEIA) */}
      {/* ========================================== */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-[200] bg-slate-100 flex flex-col md:hidden animate-in slide-in-from-bottom-full duration-300">
          <div className="flex justify-between items-center p-4 bg-slate-100 shrink-0 z-10">
            <button
              onClick={() => setIsMobileSearchOpen(false)}
              className="w-10 h-10 rounded-full bg-white flex items-center justify-center hover:bg-slate-50 border border-slate-200 shadow-sm"
            >
              <X className="w-5 h-5 text-slate-700" />
            </button>
            <button
              onClick={handleClearFilters}
              className="text-xs font-bold text-slate-900 underline underline-offset-2"
            >
              Limpar tudo
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-2 space-y-4">
            {/* ONDE - MOBILE */}
            {activeMobileTab === "onde" ? (
              <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in zoom-in-95">
                <h2 className="text-2xl font-black text-slate-900 mb-6">
                  Para onde?
                </h2>
                <div className="space-y-2 max-h-[50vh] overflow-y-auto scrollbar-hide">
                  <button
                    onClick={requestLocation}
                    className="w-full flex items-center gap-4 p-3 rounded-2xl bg-orange-50 border border-orange-100 text-left"
                  >
                    <div className="w-12 h-12 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm">
                      <Compass className="w-6 h-6 text-[#BF4B24]" />
                    </div>
                    <div>
                      <span className="block font-bold text-slate-900">
                        Perto de mim
                      </span>
                      <span className="block text-xs text-slate-500 mt-0.5">
                        Buscar por GPS
                      </span>
                    </div>
                  </button>
                  <div className="w-full h-px bg-slate-100 my-4"></div>
                  {availableCities.map((city) => (
                    <button
                      key={city}
                      onClick={() => {
                        setPendingFilters((p) => ({ ...p, city }));
                        setActiveMobileTab("quando");
                      }}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors text-left"
                    >
                      <div className="w-12 h-12 bg-slate-50 border border-slate-100 rounded-full flex items-center justify-center shrink-0">
                        <MapPin className="w-6 h-6 text-slate-500" />
                      </div>
                      <span className="font-bold text-slate-700">{city}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                onClick={() => setActiveMobileTab("onde")}
                className="bg-white rounded-2xl p-5 flex justify-between shadow-sm border border-slate-100 items-center cursor-pointer active:scale-[0.98] transition-transform"
              >
                <span className="text-sm font-medium text-slate-500">Onde</span>
                <span className="text-sm font-bold text-slate-900">
                  {pendingFilters.city}
                </span>
              </div>
            )}

            {/* QUANDO (CALENDÁRIO VERTICAL AIRBNB STYLE) - MOBILE */}
            {activeMobileTab === "quando" ? (
              <div className="bg-white rounded-[2rem] p-0 shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in zoom-in-95 flex flex-col overflow-hidden max-h-[70vh]">
                <div className="p-6 pb-2 shrink-0">
                  <h2 className="text-2xl font-black text-slate-900">
                    Quando você precisa?
                  </h2>
                </div>

                <div className="flex-1 overflow-y-auto px-6 pb-6 scrollbar-hide">
                  <Calendar
                    mode="single"
                    selected={pendingFilters.date}
                    onSelect={(d) => {
                      if (d) {
                        setPendingFilters((p) => ({ ...p, date: d }));
                        setActiveMobileTab("como"); // Auto advance
                      }
                    }}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                    locale={ptBR}
                    numberOfMonths={6}
                    disableNavigation
                    showOutsideDays={false}
                    className="p-0 w-full [&_.rdp-months]:flex-col [&_.rdp-month]:mb-10 [&_.rdp-caption]:mb-4 [&_.rdp-nav]:hidden [&_.rdp-caption_label]:text-lg [&_.rdp-caption_label]:font-black [&_.rdp-caption_label]:capitalize [&_.rdp-head_cell]:text-slate-400 [&_.rdp-head_cell]:font-bold [&_.rdp-head_cell]:text-[11px] [&_.rdp-head_cell]:uppercase [&_.rdp-table]:w-full"
                    modifiersClassNames={{
                      today: "font-normal bg-transparent text-slate-900", // Remove o outline do dia atual
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => setActiveMobileTab("quando")}
                className="bg-white rounded-2xl p-5 flex justify-between shadow-sm border border-slate-100 items-center cursor-pointer active:scale-[0.98] transition-transform"
              >
                <span className="text-sm font-medium text-slate-500">
                  Quando
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {pendingFilters.date
                    ? format(pendingFilters.date, "dd MMM", { locale: ptBR })
                    : "Insira as datas"}
                </span>
              </div>
            )}

            {/* COMO (MODALIDADE E HORÁRIO) - MOBILE */}
            {activeMobileTab === "como" ? (
              <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in zoom-in-95">
                <h2 className="text-2xl font-black text-slate-900 mb-6">
                  Como deseja alugar?
                </h2>

                <div className="flex bg-slate-100 p-1.5 rounded-xl mb-6">
                  <button
                    onClick={() =>
                      setPendingFilters((p) => ({ ...p, modality: "hora" }))
                    }
                    className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${pendingFilters.modality === "hora" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                  >
                    Por Hora
                  </button>
                  <button
                    onClick={() =>
                      setPendingFilters((p) => ({ ...p, modality: "turno" }))
                    }
                    className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${pendingFilters.modality === "turno" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                  >
                    Turno Fixo
                  </button>
                  <button
                    onClick={() =>
                      setPendingFilters((p) => ({ ...p, modality: "fixo" }))
                    }
                    className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${pendingFilters.modality === "fixo" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                  >
                    Mensal
                  </button>
                </div>

                {/* SÊNIOR: Esconde o horário se a locação for mensal */}
                {pendingFilters.modality !== "fixo" ? (
                  <>
                    <h3 className="text-sm font-black text-slate-900 mb-3">
                      Período de preferência
                    </h3>
                    <div className="space-y-2">
                      {[
                        {
                          id: "manha",
                          label: "Manhã",
                          sub: "08h às 12h",
                          icon: Clock,
                        },
                        {
                          id: "tarde",
                          label: "Tarde",
                          sub: "12h às 18h",
                          icon: Clock,
                        },
                        {
                          id: "noite",
                          label: "Noite",
                          sub: "18h às 22h",
                          icon: Clock,
                        },
                      ].map((shift) => (
                        <label
                          key={shift.id}
                          className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                            pendingFilters.time === shift.id
                              ? "border-[#BF4B24] bg-orange-50"
                              : "border-slate-100"
                          }`}
                        >
                          <input
                            type="radio"
                            name="shiftMobile"
                            className="sr-only"
                            checked={pendingFilters.time === shift.id}
                            onChange={() =>
                              setPendingFilters((p) => ({
                                ...p,
                                time: shift.id,
                              }))
                            }
                          />
                          <shift.icon
                            className={`w-5 h-5 ${pendingFilters.time === shift.id ? "text-[#BF4B24]" : "text-slate-400"}`}
                          />
                          <div>
                            <p
                              className={`text-sm font-bold ${pendingFilters.time === shift.id ? "text-orange-950" : "text-slate-700"}`}
                            >
                              {shift.label}
                            </p>
                            <p className="text-[10px] text-slate-500">
                              {shift.sub}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-2">
                    <p className="text-sm font-bold text-blue-900">
                      Locação Mensal
                    </p>
                    <p className="text-xs text-blue-800/80 mt-1 font-medium">
                      Você terá exclusividade total sobre a sala 24h por dia,
                      sem precisar escolher turnos.
                    </p>
                  </div>
                )}

                <div className="mt-6 pt-4 border-t border-slate-100 flex justify-end">
                  <Button
                    onClick={() => setActiveMobileTab("oque")}
                    className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-12 px-8 font-black w-full shadow-lg"
                  >
                    Próximo Passo
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setActiveMobileTab("como")}
                className="bg-white rounded-2xl p-5 flex justify-between shadow-sm border border-slate-100 items-center cursor-pointer active:scale-[0.98] transition-transform"
              >
                <span className="text-sm font-medium text-slate-500">Como</span>
                <span className="text-sm font-bold text-slate-900">
                  {pendingFilters.modality === "hora"
                    ? "Por Hora"
                    : pendingFilters.modality === "turno"
                      ? "Turno Fixo"
                      : "Mensal"}
                  {pendingFilters.modality !== "fixo" && pendingFilters.time
                    ? ` • ${pendingFilters.time === "manha" ? "Manhã" : pendingFilters.time === "tarde" ? "Tarde" : "Noite"}`
                    : ""}
                </span>
              </div>
            )}

            {/* O QUÊ - MOBILE */}
            {activeMobileTab === "oque" ? (
              <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-slate-200/50 border border-slate-100 animate-in fade-in zoom-in-95 pb-8">
                <h2 className="text-2xl font-black text-slate-900 mb-6">
                  Qual a especialidade?
                </h2>
                <div className="flex flex-col gap-3">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = pendingFilters.category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() =>
                          setPendingFilters((p) => ({ ...p, category: cat.id }))
                        }
                        className={`p-4 rounded-2xl flex items-center gap-4 transition-all border-2 text-left ${
                          isSelected
                            ? "border-[#BF4B24] bg-orange-50"
                            : "border-slate-100 bg-white hover:border-slate-200"
                        }`}
                      >
                        <div
                          className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 border ${isSelected ? "bg-[#BF4B24] text-white border-transparent" : "bg-slate-50 text-slate-500 border-slate-200"}`}
                        >
                          <Icon className="w-5 h-5" />
                        </div>
                        <div>
                          <span
                            className={`block text-sm font-black ${isSelected ? "text-orange-950" : "text-slate-700"}`}
                          >
                            {cat.id}
                          </span>
                          <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                            {cat.desc}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div
                onClick={() => setActiveMobileTab("oque")}
                className="bg-white rounded-2xl p-5 flex justify-between shadow-sm border border-slate-100 items-center cursor-pointer active:scale-[0.98] transition-transform"
              >
                <span className="text-sm font-medium text-slate-500">
                  O Quê
                </span>
                <span className="text-sm font-bold text-slate-900">
                  {pendingFilters.category}
                </span>
              </div>
            )}

            <div className="h-24 w-full"></div>
          </div>

          {/* FOOTER DO MODAL (Buscar) */}
          <div className="fixed bottom-0 left-0 w-full p-4 bg-white border-t border-slate-200 z-50">
            <Button
              onClick={handleExecuteSearch}
              className="w-full h-14 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black text-lg rounded-xl shadow-lg shadow-orange-500/30"
            >
              <Search className="w-5 h-5 mr-2" /> Buscar Espaços
            </Button>
          </div>
        </div>
      )}

      {/* HEADER ORIGINAL LARANJA COM BOAS VINDAS */}
      <header className="bg-gradient-to-r from-[#BF4B24] to-[#9A3C1D] px-4 pb-16 pt-10 lg:px-8 lg:pt-14 rounded-b-[2.5rem] shadow-md relative z-30">
        {!isPublic && (
          <div className="mx-auto max-w-5xl mb-6 flex justify-between items-center">
            <div>
              <p className="text-white/80 text-xs font-bold tracking-widest uppercase mb-1">
                Bem-vindo(a) de volta
              </p>
              <h1 className="text-2xl font-bold text-white tracking-tight">
                Dr(a). {profile.name.split(" ")[0]}
              </h1>
            </div>
            <div
              onClick={() => setIsWalletOpen(!isWalletOpen)}
              className="flex flex-col items-end cursor-pointer group transition-opacity mt-1 mr-16 sm:mr-20"
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
          <div className="bg-white rounded-3xl p-8 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-slate-100 relative overflow-hidden mb-10">
            <div className="absolute top-0 right-0 w-96 h-96 bg-gradient-to-bl from-orange-50 via-transparent to-transparent rounded-full blur-3xl -translate-y-1/2 translate-x-1/3 pointer-events-none" />
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
              <div>
                <p className="text-slate-500 font-bold uppercase tracking-wider text-xs mb-2 flex items-center gap-2">
                  <Wallet className="w-5 h-5" /> Saldo Total
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-6xl font-black text-slate-900 tracking-tight">
                    {profile.balance}
                  </span>
                  <span className="text-xl font-semibold text-slate-400">
                    Horas
                  </span>
                </div>
              </div>

              <div className="bg-slate-50 border border-slate-100/80 rounded-2xl p-6 min-w-[240px]">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-4">
                  Composição do Saldo
                </p>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <Shield className="w-4 h-4 text-slate-400" /> Basic
                    </span>
                    <span className="font-bold text-slate-900">
                      {walletBalances.start}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <Star className="w-4 h-4 text-slate-800" /> VIP
                    </span>
                    <span className="font-bold text-slate-900">
                      {walletBalances.vip}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-slate-600">
                      <Crown className="w-4 h-4 text-amber-500" /> Premium
                    </span>
                    <span className="font-bold text-slate-900">
                      {walletBalances.master}h
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="mb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
            <div>
              <h3 className="text-2xl font-bold text-slate-900">
                Assine um Fusion Pass
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-1">
                Escolha o nível de exclusividade e garanta descontos.
              </p>
            </div>
          </div>

          {activeSub ? (
            <div className="bg-slate-900 rounded-3xl p-8 text-white border border-slate-800 shadow-xl flex flex-col md:flex-row items-start md:items-center justify-between gap-6 mb-12">
              <div>
                <p className="text-xs text-amber-500 font-black uppercase tracking-widest mb-1">
                  Pass Ativo
                </p>
                <h3 className="text-2xl font-black flex items-center gap-2 capitalize">
                  <Crown className="w-6 h-6 text-amber-500" /> Fusion Pass{" "}
                  {activeSub.tier}
                </h3>
                <p className="text-sm font-medium text-slate-400 mt-2">
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
                  className="w-full md:w-auto bg-transparent border-slate-700 text-white hover:bg-slate-800 hover:text-white font-bold h-12"
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
          {/* ========================================== */}
          {/* SEARCH COMPONENT (DESKTOP E TRIGGER MOBILE) */}
          {/* ========================================== */}
          <div className="mx-auto w-full max-w-4xl px-4 -mt-8 relative z-40 sticky top-4 animate-in fade-in duration-300">
            {/* PILL DESKTOP (Escondido no Mobile) */}
            <div className="hidden md:flex bg-white rounded-full shadow-xl shadow-slate-200/50 items-center border border-slate-200 p-2 relative">
              {/* 1. ONDE */}
              <Popover
                open={activeSearchTab === "onde"}
                onOpenChange={(o) => setActiveSearchTab(o ? "onde" : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`flex-1 px-6 py-3 rounded-full cursor-pointer transition-colors ${activeSearchTab === "onde" ? "bg-white shadow-md ring-1 ring-slate-200" : "hover:bg-slate-100"}`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                      Onde
                    </div>
                    <div
                      className={`text-sm truncate mt-0.5 ${appliedFilters.city !== "Qualquer lugar" ? "text-slate-900 font-bold" : "text-slate-500 font-medium"}`}
                    >
                      {pendingFilters.city}
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-6 rounded-3xl mt-4 shadow-2xl border-0"
                  align="start"
                >
                  <h3 className="text-sm font-black text-slate-900 mb-4">
                    Buscar por Região
                  </h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                    <button
                      onClick={requestLocation}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors text-left group border border-transparent hover:border-slate-100"
                    >
                      <div className="w-12 h-12 bg-orange-50 rounded-full flex items-center justify-center shrink-0 group-hover:bg-[#BF4B24]/10 transition-colors">
                        <Compass className="w-6 h-6 text-[#BF4B24]" />
                      </div>
                      <div>
                        <span className="block font-bold text-slate-900">
                          Perto de mim
                        </span>
                        <span className="block text-xs text-slate-500">
                          Usar GPS do dispositivo
                        </span>
                      </div>
                    </button>
                    <div className="w-full h-px bg-slate-100 my-2"></div>
                    {availableCities.map((city) => (
                      <button
                        key={city}
                        onClick={() => {
                          setPendingFilters((p) => ({ ...p, city }));
                          setActiveSearchTab("quando");
                        }}
                        className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-slate-50 transition-colors text-left border border-transparent hover:border-slate-100"
                      >
                        <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                          <MapPin className="w-6 h-6 text-slate-500" />
                        </div>
                        <span className="font-bold text-slate-700">{city}</span>
                      </button>
                    ))}
                    <button
                      onClick={() => {
                        setPendingFilters((p) => ({
                          ...p,
                          city: "Qualquer lugar",
                        }));
                        setActiveSearchTab("quando");
                      }}
                      className="w-full mt-2 text-center text-xs font-bold text-slate-400 hover:text-slate-600 underline"
                    >
                      Limpar localização
                    </button>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="w-px h-10 bg-slate-200 mx-1"></div>

              {/* 2. QUANDO E COMO (Desktop) */}
              <Popover
                open={activeSearchTab === "quando"}
                onOpenChange={(o) => setActiveSearchTab(o ? "quando" : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`flex-1 px-6 py-3 rounded-full cursor-pointer transition-colors ${activeSearchTab === "quando" ? "bg-white shadow-md ring-1 ring-slate-200" : "hover:bg-slate-100"}`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                      Quando
                    </div>
                    <div
                      className={`text-sm truncate mt-0.5 ${pendingFilters.date ? "text-slate-900 font-bold" : "text-slate-500 font-medium"}`}
                    >
                      {pendingFilters.date
                        ? format(pendingFilters.date, "dd MMM", {
                            locale: ptBR,
                          }) +
                          (pendingFilters.time &&
                          pendingFilters.modality !== "fixo"
                            ? ` • ${pendingFilters.time === "manha" ? "Manhã" : pendingFilters.time === "tarde" ? "Tarde" : "Noite"}`
                            : "")
                        : "Insira as datas"}
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-6 rounded-3xl mt-4 shadow-2xl border-0 overflow-y-auto max-h-[85vh]"
                  align="center"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <div>
                      <h3 className="text-sm font-black text-slate-900 mb-2">
                        Selecione a Data
                      </h3>
                      <Calendar
                        mode="single"
                        selected={pendingFilters.date}
                        onSelect={(date) => {
                          setPendingFilters((p) => ({ ...p, date }));
                        }}
                        disabled={(date) =>
                          date < new Date(new Date().setHours(0, 0, 0, 0))
                        }
                        locale={ptBR}
                        modifiersClassNames={{
                          today: "font-normal bg-transparent text-slate-900",
                        }}
                        className="p-0 w-full [&_.rdp-months]:flex-col [&_.rdp-month]:mb-10 [&_.rdp-nav]:hidden [&_.rdp-caption_label]:text-lg [&_.rdp-caption_label]:font-black [&_.rdp-caption_label]:capitalize [&_.rdp-caption]:mb-4 [&_.rdp-head_cell]:text-slate-400 [&_.rdp-head_cell]:font-bold [&_.rdp-head_cell]:text-[11px] [&_.rdp-head_cell]:uppercase [&_.rdp-table]:w-full"
                      />
                    </div>

                    <div className="w-px bg-slate-100 hidden md:block"></div>

                    <div className="w-64 flex flex-col pb-4">
                      <h3 className="text-sm font-black text-slate-900 mb-3">
                        Como deseja alugar?
                      </h3>
                      <div className="flex bg-slate-100 p-1.5 rounded-xl mb-6">
                        <button
                          onClick={() =>
                            setPendingFilters((p) => ({
                              ...p,
                              modality: "hora",
                            }))
                          }
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${pendingFilters.modality === "hora" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                        >
                          Por Hora
                        </button>
                        <button
                          onClick={() =>
                            setPendingFilters((p) => ({
                              ...p,
                              modality: "turno",
                            }))
                          }
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${pendingFilters.modality === "turno" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                        >
                          Turno Fixo
                        </button>
                        <button
                          onClick={() =>
                            setPendingFilters((p) => ({
                              ...p,
                              modality: "fixo",
                            }))
                          }
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${pendingFilters.modality === "fixo" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                        >
                          Mensal
                        </button>
                      </div>

                      {pendingFilters.modality !== "fixo" ? (
                        <>
                          <h3 className="text-sm font-black text-slate-900 mb-3">
                            Período de preferência
                          </h3>
                          <div className="space-y-2">
                            {[
                              {
                                id: "manha",
                                label: "Manhã",
                                sub: "08h às 12h",
                                icon: Clock,
                              },
                              {
                                id: "tarde",
                                label: "Tarde",
                                sub: "12h às 18h",
                                icon: Clock,
                              },
                              {
                                id: "noite",
                                label: "Noite",
                                sub: "18h às 22h",
                                icon: Clock,
                              },
                            ].map((shift) => (
                              <label
                                key={shift.id}
                                className={`flex items-center gap-3 p-3 rounded-xl border-2 cursor-pointer transition-all ${
                                  pendingFilters.time === shift.id
                                    ? "border-[#BF4B24] bg-orange-50"
                                    : "border-slate-100 hover:border-slate-200"
                                }`}
                              >
                                <input
                                  type="radio"
                                  name="shiftDsk"
                                  className="sr-only"
                                  checked={pendingFilters.time === shift.id}
                                  onChange={() =>
                                    setPendingFilters((p) => ({
                                      ...p,
                                      time: shift.id,
                                    }))
                                  }
                                />
                                <shift.icon
                                  className={`w-5 h-5 ${pendingFilters.time === shift.id ? "text-[#BF4B24]" : "text-slate-400"}`}
                                />
                                <div>
                                  <p
                                    className={`text-sm font-bold ${pendingFilters.time === shift.id ? "text-orange-950" : "text-slate-700"}`}
                                  >
                                    {shift.label}
                                  </p>
                                  <p className="text-[10px] text-slate-500">
                                    {shift.sub}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="bg-blue-50 p-4 rounded-xl border border-blue-100 mt-2">
                          <p className="text-sm font-bold text-blue-900">
                            Locação Mensal
                          </p>
                          <p className="text-xs text-blue-800/80 mt-1 font-medium">
                            Você terá exclusividade total sobre a sala 24h por
                            dia, sem precisar escolher turnos.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-slate-100 flex justify-end">
                    <Button
                      onClick={() => setActiveSearchTab("oque")}
                      className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl h-10 px-6 font-bold"
                    >
                      Próximo
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="w-px h-10 bg-slate-200 mx-1"></div>

              {/* 3. O QUÊ? */}
              <Popover
                open={activeSearchTab === "oque"}
                onOpenChange={(o) => setActiveSearchTab(o ? "oque" : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`flex-1 px-6 py-3 rounded-full cursor-pointer transition-colors ${activeSearchTab === "oque" ? "bg-white shadow-md ring-1 ring-slate-200" : "hover:bg-slate-100"}`}
                  >
                    <div className="text-[10px] font-black uppercase tracking-widest text-slate-800">
                      O Quê?
                    </div>
                    <div
                      className={`text-sm truncate mt-0.5 ${pendingFilters.category !== "Todas as Salas" ? "text-slate-900 font-bold" : "text-slate-500 font-medium"}`}
                    >
                      {pendingFilters.category}
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[480px] p-6 rounded-3xl mt-4 shadow-2xl border-0"
                  align="end"
                >
                  <h3 className="text-sm font-black text-slate-900 mb-4">
                    Especialidade da Sala
                  </h3>
                  <div className="grid grid-cols-2 gap-3">
                    {CATEGORIES.map((cat) => {
                      const Icon = cat.icon;
                      const isSelected = pendingFilters.category === cat.id;
                      return (
                        <button
                          key={cat.id}
                          onClick={() => {
                            setPendingFilters((p) => ({
                              ...p,
                              category: cat.id,
                            }));
                          }}
                          className={`p-4 rounded-2xl flex flex-col items-start gap-2 transition-all border-2 text-left ${
                            isSelected
                              ? "border-[#BF4B24] bg-orange-50"
                              : "border-slate-100 bg-white hover:border-slate-200 hover:bg-slate-50"
                          }`}
                        >
                          <Icon
                            className={`w-6 h-6 ${isSelected ? "text-[#BF4B24]" : "text-slate-400"}`}
                          />
                          <div>
                            <span
                              className={`block text-xs font-bold ${isSelected ? "text-orange-950" : "text-slate-700"}`}
                            >
                              {cat.id}
                            </span>
                            <span className="block text-[10px] text-slate-500 mt-0.5 leading-tight">
                              {cat.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              {/* BOTÃO BUSCAR DESKTOP (Apenas o Buscar e Limpar) */}
              <div className="p-2 flex gap-2 items-center">
                {hasSearched && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFilters();
                    }}
                    className="text-xs font-bold text-slate-500 hover:text-slate-700 underline mx-2"
                  >
                    Limpar
                  </button>
                )}
                <button
                  onClick={handleExecuteSearch}
                  className="w-14 h-14 rounded-full bg-[#BF4B24] text-white flex items-center justify-center shrink-0 hover:bg-[#9A3C1D] transition-transform active:scale-95 shadow-lg shadow-orange-500/30 gap-2"
                >
                  <Search className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* PILL MOBILE TRIGGER */}
            <div
              className="md:hidden w-full bg-white rounded-full shadow-xl shadow-slate-200/50 flex items-center p-3 gap-3 border border-slate-100 cursor-pointer"
              onClick={() => {
                setIsMobileSearchOpen(true);
                setActiveMobileTab("onde");
              }}
            >
              <div className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center shrink-0">
                <Search className="w-5 h-5 text-slate-900" />
              </div>
              <div className="flex flex-col flex-1 truncate">
                <span className="text-sm font-black text-slate-900 truncate">
                  {appliedFilters.city}
                </span>
                <span className="text-[10px] font-medium text-slate-500 truncate">
                  {appliedFilters.date
                    ? format(appliedFilters.date, "dd MMM", { locale: ptBR })
                    : "Insira as datas"}{" "}
                  • {appliedFilters.category}
                </span>
              </div>
            </div>
          </div>

          <div className="px-4 py-2 mx-auto max-w-5xl w-full mt-4 space-y-5">
            {/* PADRÃO DO ESPAÇO (ORIGINAL PRESERVADO) */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 pl-1">
                Padrão do Espaço
              </p>
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-1">
                <button
                  onClick={() => setActiveTier("all")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all shrink-0 border ${activeTier === "all" ? "bg-slate-900 text-white border-slate-900" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setActiveTier("start")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 border ${activeTier === "start" ? "bg-slate-100 text-slate-900 border-slate-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Shield className="w-4 h-4" /> Basic
                </button>
                <button
                  onClick={() => setActiveTier("vip")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 border ${activeTier === "vip" ? "bg-orange-50 text-[#BF4B24] border-orange-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Star className="w-4 h-4" /> VIP
                </button>
                <button
                  onClick={() => setActiveTier("master")}
                  className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-1.5 shrink-0 border ${activeTier === "master" ? "bg-amber-50 text-amber-600 border-amber-200" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Crown className="w-4 h-4" /> Premium
                </button>
              </div>
            </div>
          </div>

          {/* FALLBACK ALERT MENSAGEM INTELIGENTE */}
          {searchResults.isFallback && (
            <div className="px-4 max-w-5xl mx-auto w-full mb-8">
              <div className="p-5 bg-orange-50 border border-orange-200 rounded-2xl flex items-start gap-4 animate-in fade-in shadow-sm">
                <div className="p-2 bg-white rounded-xl shadow-sm shrink-0">
                  <Zap className="w-6 h-6 text-[#BF4B24]" />
                </div>
                <div>
                  <h4 className="font-black text-orange-950 text-lg">
                    Busca Flexível
                  </h4>
                  <p className="text-sm font-medium text-orange-800 mt-1 leading-relaxed">
                    {searchResults.fallbackMessage}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* RENDENRIZAÇÃO DOS CARDS */}
          {searchResults.rooms.length === 0 ? (
            <div className="px-4 max-w-5xl mx-auto w-full">
              <div className="text-center py-16 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
                <Search className="w-10 h-10 text-slate-300 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 mb-1">
                  Nenhuma sala disponível
                </h3>
                <p className="text-slate-500 text-sm font-medium max-w-sm">
                  Tente ajustar seus filtros ou desativar a localização.
                </p>
                <Button
                  variant="outline"
                  onClick={handleClearFilters}
                  className="mt-6 font-semibold rounded-xl px-6"
                >
                  Limpar Todos os Filtros
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-0 md:px-4 max-w-5xl mx-auto w-full space-y-12 pb-12 mt-6">
              {(activeTier === "all" || activeTier === "master") &&
                masterRooms.length > 0 && (
                  <section className="bg-slate-900 px-4 py-8 lg:rounded-3xl border border-slate-800 shadow-2xl">
                    <div className="flex items-center gap-2 mb-4">
                      <Crown className="w-6 h-6 text-amber-500" />
                      <div>
                        <h2 className="text-xl font-bold text-white">
                          Salas Premium
                        </h2>
                        <p className="text-xs font-medium text-slate-400">
                          O mais alto padrão de sofisticação e conforto.
                        </p>
                      </div>
                    </div>
                    {activeTier === "master" &&
                      appliedFilters.modality === "hora" &&
                      renderFusionPassBanner()}

                    {/* SÊNIOR: SPACER E PADDING PARA NÃO COLAR NA TELA NO MOBILE (16px) */}
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
                          room={{
                            ...room,
                            selectedModality: appliedFilters.modality,
                          }}
                          bestHourlyRate={bestHourlyRates[room.tier]}
                          isFavorited={favorites.has(room.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={onOpenRoom}
                          horizontal={masterRooms.length > 1}
                          usingLocation={usingLocation}
                          activeTier={activeTier}
                        />
                      ))}
                      {masterRooms.length > 1 && (
                        <div className="w-1 shrink-0 sm:hidden"></div>
                      )}
                    </div>
                  </section>
                )}

              {(activeTier === "all" || activeTier === "vip") &&
                vipRooms.length > 0 && (
                  <section className="pt-8 px-4 md:px-0">
                    <div className="flex items-center gap-2 mb-4">
                      <Star className="w-6 h-6 text-slate-900" />
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">
                          Salas VIP
                        </h2>
                        <p className="text-xs font-medium text-slate-500">
                          Ambientes premium com design diferenciado.
                        </p>
                      </div>
                    </div>
                    {activeTier === "vip" &&
                      appliedFilters.modality === "hora" &&
                      renderFusionPassBanner()}

                    {/* SÊNIOR: SPACER E PADDING PARA NÃO COLAR NA TELA NO MOBILE (16px) */}
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
                          room={{
                            ...room,
                            selectedModality: appliedFilters.modality,
                          }}
                          bestHourlyRate={bestHourlyRates[room.tier]}
                          isFavorited={favorites.has(room.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={onOpenRoom}
                          horizontal={vipRooms.length > 1}
                          usingLocation={usingLocation}
                          activeTier={activeTier}
                        />
                      ))}
                      {vipRooms.length > 1 && (
                        <div className="w-1 shrink-0 sm:hidden"></div>
                      )}
                    </div>
                  </section>
                )}

              {(activeTier === "all" || activeTier === "start") &&
                startRooms.length > 0 && (
                  <section className="border-t border-slate-200 pt-8 pb-8 mt-8 px-4 md:px-0">
                    <div className="flex items-center gap-2 mb-4">
                      <Shield className="w-6 h-6 text-slate-400" />
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">
                          Salas Basic
                        </h2>
                        <p className="text-xs font-medium text-slate-500">
                          Conforto e o melhor custo-benefício.
                        </p>
                      </div>
                    </div>
                    {activeTier === "start" &&
                      appliedFilters.modality === "hora" &&
                      renderFusionPassBanner()}

                    {/* SÊNIOR: SPACER E PADDING PARA NÃO COLAR NA TELA NO MOBILE (16px) */}
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
                          room={{
                            ...room,
                            selectedModality: appliedFilters.modality,
                          }}
                          bestHourlyRate={bestHourlyRates[room.tier]}
                          isFavorited={favorites.has(room.id)}
                          onToggleFavorite={toggleFavorite}
                          onOpen={onOpenRoom}
                          horizontal={startRooms.length > 1}
                          usingLocation={usingLocation}
                          activeTier={activeTier}
                        />
                      ))}
                      {startRooms.length > 1 && (
                        <div className="w-1 shrink-0 sm:hidden"></div>
                      )}
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
                className={`p-6 pb-10 ${subModal.pkg.id === "master" ? "bg-slate-950 text-white" : subModal.pkg.id === "vip" ? "bg-[#ea580c] text-white" : "bg-slate-900 text-white"}`}
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
      className={`group cursor-pointer flex flex-col bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 ${horizontal ? "w-[280px] sm:w-[320px] shrink-0 snap-start" : "w-full"}`}
    >
      <div
        className={`relative w-full bg-slate-100 ${horizontal ? "h-40 sm:h-48" : "aspect-[4/3]"}`}
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
            <Badge className="bg-amber-500 text-slate-950 font-black border-0 shadow-sm">
              <Crown className="w-3 h-3 mr-1" /> Premium
            </Badge>
          )}
          {isVip && (
            <Badge className="bg-slate-900 text-white font-black border-0 shadow-sm">
              <Star className="w-3 h-3 mr-1" /> VIP
            </Badge>
          )}
          {isBasic && (
            <Badge className="bg-white text-slate-700 font-black border border-slate-200 shadow-sm">
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
            className={`h-4 w-4 transition-colors ${isFavorited ? "fill-red-500 text-red-500" : "text-white group-hover:text-slate-900"}`}
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
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
              {isHourly
                ? "Locação Avulsa"
                : room.selectedModality === "turno"
                  ? "Turno Mensal (16h)"
                  : "Locação Fixa"}
            </p>
            {showDiscount ? (
              <div className="flex flex-col">
                <span className="text-xs font-semibold text-slate-400 line-through mb-0.5">
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
