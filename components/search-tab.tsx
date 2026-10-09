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
  ChevronRight,
  Building2,
  Stethoscope,
  Zap,
  Wallet,
  RefreshCw,
  Unlock,
  Compass,
  BriefcaseMedical,
  Sofa,
  Activity,
  X,
  Clock,
  TrendingUp,
  Check,
} from "lucide-react";

import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  subtitle: string;
  icon: any;
  badge: string | null;
  badgeStyle?: string;
  cardStyle: string;
  headerStyle: string;
  iconStyle: string;
  buttonStyle: string;
  optionContainerStyle: string;
  optionStyle: string;
  activeOptionStyle: string;
  benefits: string[];
  options: PlanOption[];
}

// ==========================================
// PRECIFICAÇÃO BASE PARA CÁLCULO DE DESCONTO
// ==========================================
const BASE_HOURLY_RATES = {
  start: 40,
  vip: 45,
  master: 80,
};

// ==========================================
// CONFIGURAÇÃO CRO DOS PACOTES
// ==========================================
const BASE_PACKAGE_INFO = {
  start: {
    title: "Plano Basic",
    subtitle: "Atenda com liberdade e controle seus custos",
    icon: Shield,
    badge: "Para começar",
    badgeStyle: "bg-gray-500 text-white shadow-lg",
    cardStyle: "bg-white border-slate-200 mt-0 lg:mt-6 shadow-sm",
    headerStyle: "text-slate-900",
    iconStyle: "bg-slate-100 text-slate-600 border border-slate-200",
    buttonStyle: "bg-slate-900 hover:bg-slate-800 text-white",
    optionContainerStyle: "bg-slate-100 border-slate-200 p-1",
    optionStyle: "text-slate-500 hover:text-slate-900",
    activeOptionStyle: "bg-white text-slate-900 shadow-sm font-black",
    benefits: [
      "Cancele quando quiser",
      "Previsibilidade na agenda e no orçamento",
      "Consultórios equipados e prontos para atender",
      "Economia em cada hora de atendimento",
      "Renovação automática, sem precisar recomprar horas",
    ],
  },
  vip: {
    title: "Plano VIP",
    subtitle: "Sua agenda muda. A Fusion acompanha",
    icon: Star,
    badge: "Mais Flexibilidade",
    badgeStyle: "bg-slate-900 text-white shadow-lg",
    cardStyle:
      "bg-white border-[#BF4B24] border-2 shadow-2xl shadow-orange-500/10 relative z-10 lg:scale-105",
    headerStyle: "text-slate-900",
    iconStyle: "bg-[#BF4B24] text-white shadow-md shadow-orange-500/20",
    buttonStyle:
      "bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-xl shadow-orange-500/20",
    optionContainerStyle: "bg-orange-50 border-orange-100 p-1",
    optionStyle: "text-orange-600 hover:text-orange-900",
    activeOptionStyle: "bg-[#BF4B24] text-white shadow-md font-black",
    benefits: [
      "Cancele quando quiser",
      "Acesso às salas VIP e Basic.",
      "Economia agressiva na hora avulsa.",
      "Agendamento prioritário xx.",
      "Cancelamento gratuito até 12h antes.",
      "Suporte Humanizado VIP.",
    ],
  },
  master: {
    title: "Plano Premium",
    subtitle: "A experiência completa para aproveitar a elite da Fusion",
    icon: Crown,
    badge: "Experiência exclusiva",
    badgeStyle: "bg-amber-500 text-slate-950 shadow-lg",
    cardStyle: "bg-slate-950 border-slate-800 mt-0 lg:mt-6 shadow-2xl",
    headerStyle: "text-white",
    iconStyle: "bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20",
    buttonStyle:
      "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black shadow-xl shadow-amber-500/20",
    optionContainerStyle: "bg-slate-900 border-slate-800 p-1",
    optionStyle: "text-slate-400 hover:text-white",
    activeOptionStyle:
      "bg-slate-800 text-amber-400 shadow-sm font-black ring-1 ring-slate-700",
    benefits: [
      "Cancele quando quiser",
      "Passe livre em TODAS as salas.",
      "Isenção total de taxas de upgrade.",
      "Status Premium no seu Perfil.",
      "xxxxx.",
      "Concierge Dedicado.",
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

  const [pendingFilters, setPendingFilters] = useState({
    city: "Qualquer lugar",
    date: undefined as Date | undefined,
    time: "",
    modality: "hora" as RentalType,
    category: "Todas as Salas",
  });

  const [appliedFilters, setAppliedFilters] = useState(pendingFilters);
  const [activeTier, setActiveTier] = useState<
    "all" | "start" | "vip" | "master"
  >("all");
  const [hasSearched, setHasSearched] = useState(false);

  const [activeSearchTab, setActiveSearchTab] = useState<
    "onde" | "quando" | "oque" | null
  >(null);
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const [activeMobileTab, setActiveMobileTab] = useState<
    "onde" | "quando" | "como" | "oque"
  >("onde");

  const [usingLocation, setUsingLocation] = useState(false);
  const [userLocation, setUserLocation] = useState<{
    lat: number;
    lng: number;
  } | null>(null);

  // Estados dos Modais e Fluxo de Assinatura
  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [activePlanIndex, setActivePlanIndex] = useState(0); // Controle de scroll Mobile (UX Peeking)
  const [subModal, setSubModal] = useState<{
    isOpen: boolean;
    pkg: PlanPackage | null;
    option: PlanOption | null;
  }>({ isOpen: false, pkg: null, option: null });

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

  useMobileBack(
    isWalletOpen,
    () => setIsWalletOpen(false),
    "fusion-pass-wallet",
  );
  useMobileBack(isPassModalOpen, () => setIsPassModalOpen(false), "pass-modal");
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

      const { data: roomsData } = await supabase
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

  // Função para lidar com o Scroll Horizontal no Mobile (Detectar qual card está ativo)
  const handlePlanScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const { scrollLeft, scrollWidth, clientWidth } = e.currentTarget;
    if (scrollWidth <= clientWidth) return;
    const index = Math.round(
      (scrollLeft / (scrollWidth - clientWidth)) * (dynamicPackages.length - 1),
    );
    setActivePlanIndex(
      Math.max(0, Math.min(index, dynamicPackages.length - 1)),
    );
  };

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

  const handleBuyPackage = (pkg: PlanPackage, option: PlanOption) => {
    setIsPassModalOpen(false);
    setTimeout(() => {
      setSubModal({ isOpen: true, pkg, option });
    }, 150);
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
        title: "Assinatura Ativa!",
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

  const renderTargetedPassBanner = () => {
    if (activeTier === "all") return null;

    let title,
      subtitle,
      Icon,
      bgClass,
      iconColorClass,
      textClass,
      buttonClass,
      benefits;
    let baseHourlyRate = BASE_HOURLY_RATES.start;

    if (activeTier === "vip") {
      baseHourlyRate = BASE_HOURLY_RATES.vip;
      title = "Fusion Pass VIP";
      subtitle = `Salas de alto padrão não precisam custar R$ ${baseHourlyRate}/h. Assine o Pass VIP, impressione seus pacientes e aumente sua margem.`;
      Icon = Star;
      bgClass = "bg-orange-50 border-orange-200";
      iconColorClass = "text-[#BF4B24]";
      textClass = "text-orange-950";
      buttonClass =
        "bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-orange-500/20";
      benefits = [
        "Atraia pacientes High-Ticket",
        "Desconto agressivo no pacote",
        "Reserva prioritária",
      ];
    } else if (activeTier === "master") {
      baseHourlyRate = BASE_HOURLY_RATES.master;
      title = "Fusion Pass Premium";
      subtitle = `A elite da Fusion Clinic à sua disposição. Esqueça os R$ ${baseHourlyRate}/h avulsos: assine o Premium e tenha passe livre nos melhores espaços.`;
      Icon = Crown;
      bgClass = "bg-slate-950 border-slate-800";
      iconColorClass = "text-amber-500";
      textClass = "text-white";
      buttonClass = "bg-amber-500 hover:bg-amber-600 text-slate-950 font-black";
      benefits = [
        "Posicionamento Premium",
        "Zero taxas de upgrade",
        "Status Exclusivo",
      ];
    } else {
      baseHourlyRate = BASE_HOURLY_RATES.start;
      title = "Fusion Pass Basic";
      subtitle = `Cansado de pagar R$ ${baseHourlyRate}/h no avulso? Assine o Pass Basic, trave o menor custo da plataforma e aumente o lucro de cada consulta.`;
      Icon = Shield;
      bgClass = "bg-slate-50 border-slate-200";
      iconColorClass = "text-slate-600";
      textClass = "text-slate-900";
      buttonClass = "bg-slate-900 hover:bg-slate-800 text-white";
      benefits = [
        "Aumente sua margem de lucro",
        "Horas cumulativas",
        "Sem fidelidade oculta",
      ];
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
              className={`text-sm font-medium mt-1 leading-snug max-w-lg ${textClass} opacity-80`}
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
          onClick={() => setIsPassModalOpen(true)}
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
      {/* TELA IMERSIVA DOS PLANOS (MELI+ STYLE)     */}
      {/* ========================================== */}
      <Dialog open={isPassModalOpen} onOpenChange={setIsPassModalOpen}>
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="!max-w-[1200px] w-[100vw] h-[100dvh] md:w-[95vw] md:h-[95vh] p-0 overflow-hidden bg-slate-50 border-0 md:rounded-[2rem] flex flex-col shadow-2xl [&>button]:hidden"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Planos Fusion Pass</DialogTitle>
            <DialogDescription>
              Escolha o melhor plano de assinatura para sua clínica.
            </DialogDescription>
          </DialogHeader>

          {/* Botão Fechar Customizado */}
          <div className="absolute top-4 right-4 md:top-6 md:right-6 z-50">
            <button
              onClick={() => setIsPassModalOpen(false)}
              className="w-10 h-10 bg-black/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white/20 shadow-sm"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* CONTAINER SCROLLÁVEL MESTRE */}
          <div className="flex-1 overflow-y-auto overflow-x-hidden relative w-full scrollbar-hide">
            {/* Header Meli+ Style Modificado */}
            <div className="bg-[#BF4B24] pt-20 md:pt-24 pb-36 px-6 md:px-12 shrink-0">
              <div className="max-w-5xl mx-auto w-full">
                <h2 className="text-3xl md:text-4xl lg:text-5xl font-black text-white max-w-2xl leading-tight">
                  Escolha seu{" "}
                  <span className="bg-white/20 px-4 py-1.5 rounded-2xl whitespace-nowrap inline-block mt-2 md:mt-0">
                    Fusion Pass+
                  </span>
                </h2>
                <h3 className="text-white/95 font-bold mt-5 text-lg md:text-xl lg:text-2xl max-w-2xl leading-relaxed">
                  Cada conquista merece um outro nível
                </h3>
                <p className="text-white/80 font-medium mt-2 text-sm md:text-base max-w-2xl leading-relaxed">
                  Da liberdade de começar ao prestígio de chegar mais longe. Um
                  plano para cada momento de sua carreira.
                </p>
              </div>
            </div>

            {/* Grid Cards Container - Refatorado para Snap Center com Peeking */}
            <div className="px-0 md:px-12 -mt-28 w-full max-w-6xl mx-auto relative z-20">
              <div
                className="flex md:grid md:grid-cols-3 gap-4 md:gap-6 lg:gap-8 overflow-x-auto md:overflow-visible snap-x snap-mandatory scrollbar-hide items-stretch w-full px-[6vw] md:px-0 pt-6 pb-6"
                onScroll={handlePlanScroll}
              >
                {dynamicPackages.map((pkg) => {
                  const currentHours = selectedBundles[pkg.id];
                  const selectedOption =
                    pkg.options.find((o) => o.hours === currentHours) ||
                    pkg.options[0];
                  if (!selectedOption) return null;

                  const baseHourly =
                    BASE_HOURLY_RATES[
                      pkg.id as keyof typeof BASE_HOURLY_RATES
                    ] || 40;
                  const originalPrice = baseHourly * selectedOption.hours;
                  const savingsAmount = originalPrice - selectedOption.price;
                  const savingsPercent = Math.round(
                    (savingsAmount / originalPrice) * 100,
                  );
                  const hasDiscount = savingsAmount > 0;
                  const isVip = pkg.id === "vip";

                  return (
                    <div
                      key={pkg.id}
                      className={`relative snap-center shrink-0 w-[88vw] md:w-full bg-white rounded-[2rem] p-6 lg:p-8 flex flex-col transition-all h-full ${
                        isVip
                          ? "border-2 border-[#BF4B24] shadow-[0_20px_50px_rgba(191,75,36,0.15)] md:-translate-y-4 z-10"
                          : "border border-slate-200 shadow-xl mt-0 md:mt-4"
                      }`}
                    >
                      {/* Badge Promo com Ajuste para não cortar */}
                      {pkg.badge && (
                        <div className="absolute -top-4 left-6 lg:left-8 z-30">
                          <span
                            className={`${pkg.badgeStyle || "bg-slate-900 text-white"} text-[10px] lg:text-xs font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md whitespace-nowrap`}
                          >
                            {pkg.badge}
                          </span>
                        </div>
                      )}

                      <h3 className="text-2xl lg:text-3xl font-black text-slate-900 mb-4 tracking-tight mt-3">
                        {pkg.title}
                      </h3>

                      {/* Botões Franquia */}
                      <div className="mb-6">
                        <p className="text-[10px] lg:text-xs font-bold uppercase tracking-widest mb-2 text-slate-400">
                          Escolha sua franquia:
                        </p>
                        <div className="flex items-center rounded-xl p-1 bg-slate-100 border border-slate-200/60">
                          {pkg.options.map((opt) => {
                            const isActive = currentHours === opt.hours;
                            return (
                              <button
                                key={opt.hours}
                                onClick={() =>
                                  setSelectedBundles({
                                    ...selectedBundles,
                                    [pkg.id]: opt.hours,
                                  })
                                }
                                className={`flex-1 py-2 text-xs lg:text-sm font-bold rounded-lg transition-all truncate px-1 ${
                                  isActive
                                    ? "bg-white text-slate-900 shadow-sm border border-slate-200/50"
                                    : "text-slate-500 hover:text-slate-700"
                                }`}
                              >
                                {opt.hours}h
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      {/* Display Preço Ajustado com Flex Wrap */}
                      <div className="mb-6 flex flex-col gap-1 border-b pb-6 border-slate-100">
                        {hasDiscount && (
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <span className="text-xs lg:text-sm font-bold text-slate-400 line-through decoration-1">
                              R${" "}
                              {originalPrice.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                            <span className="text-[10px] lg:text-xs font-black bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-md uppercase tracking-wider">
                              {savingsPercent}% OFF
                            </span>
                          </div>
                        )}

                        <div className="flex items-baseline gap-1 lg:gap-1.5 flex-wrap">
                          <span className="text-sm lg:text-base font-bold text-slate-900 opacity-80">
                            R$
                          </span>
                          <span className="text-4xl lg:text-5xl font-black text-slate-900 tracking-tighter shrink-0">
                            {selectedOption.price.toLocaleString("pt-BR", {
                              minimumFractionDigits: 2,
                            })}
                          </span>
                          <span className="text-sm lg:text-base font-medium text-slate-500 opacity-80">
                            /mês
                          </span>
                        </div>
                      </div>

                      {/* Área Benefícios */}
                      <div className="flex-1 flex flex-col bg-slate-50 rounded-2xl p-5 mb-6 border border-slate-100/50">
                        <p className="font-bold text-slate-900 mb-4 leading-snug text-sm lg:text-base">
                          {pkg.subtitle}
                        </p>
                        <ul className="space-y-3.5 flex-1">
                          {pkg.benefits.map((benefit, i) => (
                            <li key={i} className="flex items-start gap-3">
                              <div className="w-1.5 h-1.5 rounded-full bg-[#BF4B24] mt-1.5 shrink-0" />
                              <span className="text-xs lg:text-sm font-medium text-slate-600 leading-snug">
                                {benefit}
                              </span>
                            </li>
                          ))}
                        </ul>
                      </div>

                      {/* Call to Action */}
                      <Button
                        onClick={() => handleBuyPackage(pkg, selectedOption)}
                        className={`w-full h-12 lg:h-14 rounded-xl text-sm lg:text-base font-black transition-all shrink-0 ${
                          isVip
                            ? "bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-600/20"
                            : "bg-[#BF4B24] hover:bg-[#9A3C1D] text-white"
                        }`}
                      >
                        Próximo
                      </Button>
                    </div>
                  );
                })}
              </div>

              {/* Paginação Mobile (Dots Meli+ Style) */}
              <div className="flex justify-center items-center gap-2 mt-2 mb-8 md:hidden relative z-20">
                {dynamicPackages.map((_, idx) => (
                  <div
                    key={idx}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      idx === activePlanIndex
                        ? "w-6 bg-slate-400"
                        : "w-2 bg-slate-200"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* ========================================== */}
      {/* MODAL DE BUSCA MOBILE (ESTILO AIRBNB)      */}
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
                        setActiveMobileTab("como");
                      }
                    }}
                    disabled={(date) =>
                      date < new Date(new Date().setHours(0, 0, 0, 0))
                    }
                    locale={ptBR}
                    numberOfMonths={6}
                    disableNavigation
                    showOutsideDays={false}
                    className="p-0 w-full [&_.rdp-months]:flex-col [&_.rdp-month]:mb-10 [&_.rdp-nav]:hidden [&_.rdp-caption_label]:text-lg [&_.rdp-caption_label]:font-black [&_.rdp-caption_label]:capitalize [&_.rdp-head_cell]:text-slate-400 [&_.rdp-head_cell]:font-bold [&_.rdp-head_cell]:text-[11px] [&_.rdp-head_cell]:uppercase [&_.rdp-table]:w-full"
                    modifiersClassNames={{
                      today: "font-normal bg-transparent text-slate-900",
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
      <header className="bg-gradient-to-r from-[#ea580c] to-[#9A3C1D] px-4 pb-16 pt-10 lg:px-8 lg:pt-14 rounded-b-[2.5rem] shadow-md relative z-30">
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
                        className="p-0"
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

              {/* BOTÃO BUSCAR DESKTOP */}
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

          {/* ========================================== */}
          {/* ESTRATÉGIA 1: BANNER GERAL NO TOPO         */}
          {/* ========================================== */}
          {dynamicPackages.length > 0 && (
            <div className="mx-auto w-full max-w-5xl px-4 mt-6 animate-in fade-in slide-in-from-bottom-2 duration-300 relative z-30">
              <div
                onClick={() => setIsPassModalOpen(true)}
                className="flex items-center justify-between bg-gradient-to-r from-[#ea580c] to-[#9A3C1D] p-3.5 rounded-xl shadow-md cursor-pointer active:scale-[0.98] transition-transform"
              >
                <div className="flex items-center gap-2.5">
                  <div className="bg-white/20 p-1.5 rounded-lg">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <span className="text-white font-black text-sm tracking-wide">
                    Fusion Pass+ | +Horas +Desconto
                  </span>
                </div>
                <ChevronRight className="w-5 h-5 text-white/80" />
              </div>
            </div>
          )}

          <div className="px-4 py-2 mx-auto max-w-5xl w-full mt-6 space-y-5">
            {/* PADRÃO DO ESPAÇO */}
            <div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 pl-1">
                Padrão do Espaço
              </p>
              <div className="flex items-center gap-3 overflow-x-auto scrollbar-hide pb-1">
                <button
                  onClick={() => setActiveTier("all")}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all shrink-0 border ${activeTier === "all" ? "bg-slate-900 text-white border-slate-900 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  Todos
                </button>
                <button
                  onClick={() => setActiveTier("start")}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 shrink-0 border ${activeTier === "start" ? "bg-slate-100 text-slate-900 border-slate-300 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Shield className="w-4 h-4" /> Basic
                </button>
                <button
                  onClick={() => setActiveTier("vip")}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 shrink-0 border ${activeTier === "vip" ? "bg-orange-50 text-[#BF4B24] border-orange-200 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Star className="w-4 h-4" /> VIP
                </button>
                <button
                  onClick={() => setActiveTier("master")}
                  className={`px-5 py-2.5 rounded-full text-sm font-bold transition-all flex items-center gap-2 shrink-0 border ${activeTier === "master" ? "bg-amber-50 text-amber-600 border-amber-200 shadow-md" : "bg-white text-slate-500 border-slate-200 hover:bg-slate-50"}`}
                >
                  <Crown className="w-4 h-4" /> Premium
                </button>
              </div>
            </div>
          </div>

          {/* MENSAGEM DE BUSCA FLEXÍVEL */}
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

          {/* LISTAGEM DE SALAS E BANNERS INJETADOS */}
          {searchResults.rooms.length === 0 ? (
            <div className="px-4 max-w-5xl mx-auto w-full mt-8">
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
              {/* MASTER SECTION */}
              {(activeTier === "all" || activeTier === "master") &&
                masterRooms.length > 0 && (
                  <section className="pt-8">
                    <div className="flex items-center gap-2 mb-4 px-4 sm:px-0">
                      <Crown className="w-6 h-6 text-amber-500" />
                      <div>
                        <h2 className="text-xl font-bold text-slate-900">
                          Salas Premium
                        </h2>
                        <p className="text-xs font-medium text-slate-500">
                          O mais alto padrão de sofisticação e conforto.
                        </p>
                      </div>
                    </div>
                    {/* ESTRATÉGIA 2: Banners inseridos APENAS quando o filtro for clicado */}
                    {activeTier === "master" &&
                      appliedFilters.modality === "hora" &&
                      renderTargetedPassBanner()}

                    <div
                      className={
                        masterRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 px-4 sm:px-0"
                          : "flex overflow-x-auto gap-4 pb-6 snap-x scrollbar-hide px-4 sm:px-0"
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
                        <div className="w-1 shrink-0 sm:hidden block"></div>
                      )}
                    </div>
                  </section>
                )}

              {/* VIP SECTION */}
              {(activeTier === "all" || activeTier === "vip") &&
                vipRooms.length > 0 && (
                  <section className="pt-8">
                    <div className="flex items-center gap-2 mb-4 px-4 sm:px-0">
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
                    {/* ESTRATÉGIA 2: Banners inseridos APENAS quando o filtro for clicado */}
                    {activeTier === "vip" &&
                      appliedFilters.modality === "hora" &&
                      renderTargetedPassBanner()}

                    <div
                      className={
                        vipRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 px-4 sm:px-0"
                          : "flex overflow-x-auto gap-4 pb-6 snap-x scrollbar-hide px-4 sm:px-0"
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
                        <div className="w-1 shrink-0 sm:hidden block"></div>
                      )}
                    </div>
                  </section>
                )}

              {/* START (BASIC) SECTION */}
              {(activeTier === "all" || activeTier === "start") &&
                startRooms.length > 0 && (
                  <section className="pt-8">
                    <div className="flex items-center gap-2 mb-4 px-4 sm:px-0">
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
                    {/* ESTRATÉGIA 2: Banners inseridos APENAS quando o filtro for clicado */}
                    {activeTier === "start" &&
                      appliedFilters.modality === "hora" &&
                      renderTargetedPassBanner()}

                    <div
                      className={
                        startRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 px-4 sm:px-0"
                          : "flex overflow-x-auto gap-4 pb-6 snap-x scrollbar-hide px-4 sm:px-0"
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
                        <div className="w-1 shrink-0 sm:hidden block"></div>
                      )}
                    </div>
                  </section>
                )}
            </div>
          )}
        </>
      )}

      {/* SÊNIOR: MODAL DE REVISÃO E CONVERSÃO DE ASSINATURA */}
      <Dialog
        open={subModal.isOpen}
        onOpenChange={(open) =>
          !open && setSubModal({ isOpen: false, pkg: null, option: null })
        }
      >
        <DialogContent
          onInteractOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden bg-slate-50 border-0 [&>button]:hidden"
        >
          <DialogHeader className="sr-only">
            <DialogTitle>Confirmação de Plano</DialogTitle>
            <DialogDescription>
              Revise as vantagens do seu novo plano.
            </DialogDescription>
          </DialogHeader>

          {/* Custom Close Button do SubModal */}
          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={() =>
                setSubModal({ isOpen: false, pkg: null, option: null })
              }
              className="w-8 h-8 bg-black/10 backdrop-blur-md rounded-full flex items-center justify-center text-white hover:bg-black/30 transition-colors border border-white/20"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {subModal.pkg && subModal.option && (
            <div className="flex flex-col">
              {/* Header com Gatilho de Reforço Positivo - Agora SEMPRE laranja */}
              <div className="p-6 pb-10 bg-[#ea580c] text-white">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center mb-4 border border-white/20 shadow-sm">
                  <subModal.pkg.icon className="w-6 h-6 text-white" />
                </div>
                <h2 className="text-2xl font-black mb-1">Excelente escolha!</h2>
                <p className="text-sm opacity-90 font-medium leading-relaxed">
                  Você está a um passo de garantir a melhor tarifa da plataforma
                  com o {subModal.pkg.title}.
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
                      R${" "}
                      {subModal.option.price.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
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

                <div className="pt-2">
                  <Button
                    onClick={confirmSubscription}
                    disabled={isProcessingCheckout === subModal.pkg.id}
                    className="w-full h-14 bg-[#ea580c] hover:bg-[#9A3C1D] text-white font-black rounded-xl text-lg shadow-xl shadow-orange-500/20 transition-all active:scale-95 flex items-center justify-center gap-2"
                  >
                    {isProcessingCheckout === subModal.pkg.id ? (
                      <Loader2 className="w-6 h-6 animate-spin" />
                    ) : (
                      <>
                        Próximo <ArrowRight className="w-5 h-5" />
                      </>
                    )}
                  </Button>
                  <p className="text-center text-[10px] text-slate-400 font-medium mt-3">
                    Pagamento seguro. Você poderá revisar os detalhes a seguir.
                  </p>
                </div>
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
