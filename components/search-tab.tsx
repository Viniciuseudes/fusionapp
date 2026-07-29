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
  modalities: string[];
  isPartner: boolean;
  locationString: string;
}

// ==========================================
// ESTRUTURA VISUAL BASE (Sem preços hardcoded)
// ==========================================
interface PlanOption {
  hours: number;
  price: number;
}
interface PlanPackage {
  id: "start" | "vip" | "master";
  title: string;
  icon: any;
  accentColor: string;
  benefits: string[];
  options: PlanOption[];
}

const BASE_PACKAGE_INFO = {
  start: {
    title: "Start",
    icon: Shield,
    accentColor: "text-zinc-600 bg-zinc-100",
    benefits: ["Acesso a salas Start", "Suporte padrão", "Validade de 30 dias"],
  },
  vip: {
    title: "VIP",
    icon: Star,
    accentColor: "text-indigo-600 bg-indigo-50",
    benefits: [
      "Acesso a salas VIP e Start",
      "Agendamento prioritário",
      "Validade de 60 dias",
    ],
  },
  master: {
    title: "Master",
    icon: Crown,
    accentColor: "text-amber-600 bg-amber-50",
    benefits: [
      "Acesso a TODAS as salas",
      "Selo Premium no perfil",
      "Validade de 90 dias",
    ],
  },
};

const rentalTypes: { id: RentalType; label: string }[] = [
  { id: "hora", label: "Por Hora" },
  { id: "turno", label: "Turno" },
  { id: "fixo", label: "Fixo" },
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
  const [searchQuery, setSearchQuery] = useState("");
  const [rentalType, setRentalType] = useState<RentalType>("turno");
  const [selectedCategory, setSelectedCategory] = useState<string>("Todas");
  const [isFilterModalOpen, setIsFilterModalOpen] = useState(false);
  const [minPrice, setMinPrice] = useState("");
  const [maxPrice, setMaxPrice] = useState("");
  const [usingLocation, setUsingLocation] = useState(false);

  // ESTADOS DA CARTEIRA E PACOTES
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

  // ESTADO QUE FALTAVA (CONTROLE DE LOADING DO CHECKOUT ASAAS)
  const [isProcessingCheckout, setIsProcessingCheckout] = useState<
    string | null
  >(null);

  useEffect(() => {
    async function fetchData() {
      // 1. Busca os preços dinâmicos primeiro
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

      // 2. Busca das Salas
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
          };
        });
        setDbRooms(formattedRooms);
      }

      // 3. Busca do Usuário
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
          if (bStart === 0 && bVip === 0 && bMaster === 0) {
            bStart = 2;
            bVip = 5;
            bMaster = 0;
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
        description: "Procurando salas...",
      });
      navigator.geolocation.getCurrentPosition(
        () => {
          setUsingLocation(true);
          toast({ title: "Localização Encontrada" });
        },
        () => {
          toast({ variant: "destructive", title: "Permissão Negada" });
        },
      );
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

  // ==========================================
  // O NOVO MOTOR DE CHECKOUT COM ASAAS
  // ==========================================
  const handleBuyPackage = async (pkg: PlanPackage, option: PlanOption) => {
    setIsProcessingCheckout(pkg.id);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        toast({
          title: "Faça login",
          description: "Você precisa estar logado para comprar.",
        });
        setIsProcessingCheckout(null);
        return;
      }

      toast({
        title: "Preparando ambiente seguro...",
        description: `Gerando cobrança para o pacote ${pkg.title}`,
      });

      // 1. Chama nossa rota de API para gerar o Pix/Boleto no Asaas
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

      // 2. Sucesso! Redireciona o médico para o gateway Asaas
      window.location.href = data.invoiceUrl;
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro no Checkout",
        description: err.message,
      });
      setIsProcessingCheckout(null); // Só removemos se der erro, pois o sucesso muda a página
    }
  };

  const handleOpenWalletPromo = () => {
    setIsWalletOpen(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const filteredRooms = dbRooms.filter((room) => {
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
    return (
      matchesSearch &&
      matchesModality &&
      matchesCategory &&
      passesMinPrice &&
      passesMaxPrice
    );
  });

  const featuredRooms = filteredRooms.filter((r) => r.isPartner);
  const masterRooms = filteredRooms.filter((r) => r.tier === "master");
  const vipRooms = filteredRooms.filter((r) => r.tier === "vip");
  const startRooms = filteredRooms.filter((r) => r.tier === "start" || !r.tier);

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-screen bg-zinc-50">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );

  return (
    <div className="flex flex-col pb-24 bg-zinc-50 min-h-screen relative font-sans">
      {/* HEADER */}
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
        // A NOVA CARTEIRA
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
                      <Shield className="w-4 h-4 text-zinc-400" /> Start
                    </span>
                    <span className="font-bold text-zinc-900">
                      {walletBalances.start}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-sm font-medium text-zinc-600">
                      <Star className="w-4 h-4 text-indigo-400" /> VIP
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
                Recarregar Horas
              </h3>
              <p className="text-sm font-medium text-zinc-500 mt-1">
                O saldo superior desbloqueia as salas das categorias inferiores.
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
                  className="bg-white rounded-3xl p-6 border border-zinc-200 shadow-sm hover:shadow-md transition-shadow flex flex-col"
                >
                  <div className="flex items-center gap-3 mb-6">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${pkg.accentColor}`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <h4 className="text-lg font-bold text-zinc-900">
                      {pkg.title}
                    </h4>
                  </div>

                  <div className="bg-zinc-50 p-1 rounded-lg flex items-center justify-between mb-6 border border-zinc-100">
                    {pkg.options.map((opt) => (
                      <button
                        key={opt.hours}
                        onClick={() =>
                          setSelectedBundles({
                            ...selectedBundles,
                            [pkg.id]: opt.hours,
                          })
                        }
                        className={`flex-1 py-1.5 text-sm font-semibold rounded-md transition-all ${currentHours === opt.hours ? "bg-white text-zinc-900 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-700"}`}
                      >
                        {opt.hours}h
                      </button>
                    ))}
                  </div>

                  <div className="mb-6 flex items-baseline gap-1">
                    <span className="text-3xl font-black text-zinc-900">
                      R$ {selectedOption.price}
                    </span>
                    <span className="text-sm font-medium text-zinc-400">
                      /pacote
                    </span>
                  </div>

                  <div className="space-y-3 mb-8 flex-1">
                    {pkg.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-start gap-2.5">
                        <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-500 mt-0.5" />
                        <span className="text-sm font-medium text-zinc-600 leading-tight">
                          {benefit}
                        </span>
                      </div>
                    ))}
                  </div>

                  {/* BOTÃO ATUALIZADO DO CHECKOUT (ASAAS) */}
                  <Button
                    onClick={() => handleBuyPackage(pkg, selectedOption)}
                    disabled={isProcessingCheckout === pkg.id}
                    className="w-full h-12 rounded-xl bg-zinc-900 hover:bg-zinc-800 text-white font-semibold flex items-center justify-between px-5 transition-colors"
                  >
                    <span>
                      {isProcessingCheckout === pkg.id
                        ? "Redirecionando..."
                        : "Comprar Agora"}
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

          <h3 className="text-lg font-bold text-zinc-900 mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-zinc-400" /> Últimas Transações
          </h3>
          <div className="bg-white rounded-2xl border border-zinc-200 shadow-sm overflow-hidden mb-12">
            {walletTransactions.length > 0 ? (
              <div className="divide-y divide-zinc-100">
                {walletTransactions.map((tx, idx) => (
                  <div
                    key={idx}
                    className="p-4 flex items-center justify-between hover:bg-zinc-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div
                        className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tx.amount > 0 ? "bg-emerald-50 text-emerald-600" : "bg-zinc-50 text-zinc-500"}`}
                      >
                        <CreditCard className="w-4 h-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-zinc-900 text-sm">
                          {tx.description || "Recarga de Pacote"}
                        </p>
                        <p className="text-xs text-zinc-500 font-medium">
                          {format(
                            new Date(tx.created_at),
                            "dd 'de' MMM, yyyy",
                            { locale: ptBR },
                          )}
                        </p>
                      </div>
                    </div>
                    <div
                      className={`text-base font-bold ${tx.amount > 0 ? "text-emerald-600" : "text-zinc-900"}`}
                    >
                      {tx.amount > 0 ? "+" : ""}
                      {tx.amount}h
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 text-center text-zinc-500 font-medium text-sm">
                Nenhuma transação recente encontrada.
              </div>
            )}
          </div>
        </div>
      ) : (
        // ======================================================
        // TELA DE BUSCA
        // ======================================================
        <>
          <div className="mx-auto w-full max-w-5xl px-4 -mt-6 relative z-20 sticky top-4 animate-in fade-in duration-300">
            <div className="flex items-center gap-2">
              <div className="relative flex items-center flex-1 bg-white rounded-2xl border border-zinc-200 shadow-[0_4px_20px_rgb(0,0,0,0.03)] h-14 transition-all focus-within:ring-2 focus-within:ring-[#f05e23]/20">
                <Search className="absolute left-4 h-5 w-5 text-zinc-400" />
                <Input
                  placeholder="Buscar por cidade, clínica..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-full w-full border-0 bg-transparent pl-11 pr-4 text-sm text-zinc-900 shadow-none focus-visible:ring-0 placeholder:text-zinc-400 font-medium"
                />
              </div>
              <button
                onClick={() => setIsFilterModalOpen(true)}
                className="h-14 w-14 bg-white border border-zinc-200 shadow-sm rounded-2xl flex items-center justify-center text-zinc-600 hover:bg-zinc-50 transition-colors shrink-0"
              >
                <SlidersHorizontal className="h-5 w-5" />
              </button>
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

          {filteredRooms.length === 0 ? (
            <div className="px-4 max-w-5xl mx-auto w-full">
              <div className="text-center py-16 bg-white rounded-3xl border border-zinc-200 shadow-sm flex flex-col items-center">
                <Search className="w-10 h-10 text-zinc-300 mb-4" />
                <h3 className="text-lg font-bold text-zinc-900 mb-1">
                  Nenhuma sala disponível
                </h3>
                <p className="text-zinc-500 text-sm font-medium">
                  Tente ajustar seus filtros para ver mais opções.
                </p>
                <Button
                  variant="outline"
                  onClick={() => {
                    setSearchQuery("");
                    setSelectedCategory("Todas");
                    setMinPrice("");
                    setMaxPrice("");
                  }}
                  className="mt-6 font-semibold rounded-xl px-6"
                >
                  Limpar Filtros
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-4 max-w-5xl mx-auto w-full space-y-12">
              {featuredRooms.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-5 h-5 text-amber-500" />
                    <h2 className="text-xl font-bold text-zinc-900">
                      Salas em Destaque
                    </h2>
                  </div>
                  <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide snap-x">
                    {featuredRooms.map((room) => (
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

              {masterRooms.length > 0 && (
                <section className="bg-amber-50/50 -mx-4 px-4 py-8 lg:rounded-3xl lg:mx-0 border border-amber-100/50">
                  <div className="flex items-center gap-2 mb-4">
                    <Crown className="w-6 h-6 text-amber-500" />
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900">
                        Coleção Master
                      </h2>
                      <p className="text-xs font-medium text-amber-700/80">
                        O mais alto padrão de sofisticação.
                      </p>
                    </div>
                  </div>

                  <div className="bg-gradient-to-r from-amber-500 to-amber-600 rounded-2xl p-5 mb-6 text-white flex flex-col md:flex-row items-center justify-between shadow-sm">
                    <div>
                      <h4 className="font-bold text-base flex items-center gap-1.5">
                        Passe Livre Master{" "}
                        <Crown className="w-3.5 h-3.5 text-amber-200" />
                      </h4>
                      <p className="text-xs font-medium text-amber-50 mt-1 max-w-md leading-relaxed">
                        Assine o Pacote Master e garanta o menor custo por hora
                        em <b>qualquer sala da plataforma.</b>
                      </p>
                    </div>
                    <Button
                      onClick={handleOpenWalletPromo}
                      className="bg-white text-amber-900 hover:bg-amber-50 font-bold mt-4 md:mt-0 w-full md:w-auto h-10 text-sm whitespace-nowrap rounded-xl"
                    >
                      Ver Pacotes
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {masterRooms.map((room) => (
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
              )}

              {vipRooms.length > 0 && (
                <section>
                  <div className="flex items-center gap-2 mb-4">
                    <Star className="w-6 h-6 text-indigo-500" />
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900">
                        Experiência VIP
                      </h2>
                      <p className="text-xs font-medium text-zinc-500">
                        Ambientes premium com design diferenciado.
                      </p>
                    </div>
                  </div>

                  <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-5 mb-6 flex flex-col md:flex-row items-center justify-between">
                    <div>
                      <h4 className="font-bold text-base text-indigo-900 flex items-center gap-1.5">
                        <TrendingDown className="w-4 h-4 text-indigo-500" />{" "}
                        Tarifas Reduzidas
                      </h4>
                      <p className="text-xs font-medium text-indigo-700/80 mt-1 max-w-md leading-relaxed">
                        Assinantes do <b>Pacote VIP</b> têm descontos nestes
                        consultórios e acesso livre às salas Start.
                      </p>
                    </div>
                    <Button
                      onClick={handleOpenWalletPromo}
                      className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold mt-4 md:mt-0 w-full md:w-auto h-10 text-sm whitespace-nowrap rounded-xl"
                    >
                      Assinar VIP
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {vipRooms.map((room) => (
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
              )}

              {startRooms.length > 0 && (
                <section className="border-t border-zinc-200 pt-8 pb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Shield className="w-6 h-6 text-zinc-400" />
                    <div>
                      <h2 className="text-xl font-bold text-zinc-900">
                        Essencial Start
                      </h2>
                      <p className="text-xs font-medium text-zinc-500">
                        Conforto e o melhor custo-benefício.
                      </p>
                    </div>
                  </div>

                  <div className="bg-zinc-100 rounded-2xl p-5 mb-6 flex flex-col md:flex-row items-center justify-between border border-zinc-200">
                    <div>
                      <h4 className="font-bold text-base text-zinc-900">
                        Previsibilidade de Agenda
                      </h4>
                      <p className="text-xs font-medium text-zinc-600 mt-1 max-w-md leading-relaxed">
                        Assine um <b>Pacote Start</b> e trave o menor preço por
                        hora, sem variações.
                      </p>
                    </div>
                    <Button
                      onClick={handleOpenWalletPromo}
                      className="bg-zinc-900 hover:bg-zinc-800 text-white font-semibold mt-4 md:mt-0 w-full md:w-auto h-10 text-sm whitespace-nowrap rounded-xl"
                    >
                      Pacotes Start
                    </Button>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
                    {startRooms.map((room) => (
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
                Localização
              </Label>
              <button
                onClick={requestLocation}
                className={`w-full flex items-center justify-between p-3.5 rounded-xl border transition-all ${usingLocation ? "border-[#f05e23] bg-orange-50/50 text-[#f05e23]" : "border-zinc-200 hover:border-zinc-300 text-zinc-700"}`}
              >
                <div className="flex items-center gap-3">
                  <Navigation
                    className={`w-4 h-4 ${usingLocation ? "fill-[#f05e23]" : ""}`}
                  />
                  <span className="font-semibold text-sm">Próximos a mim</span>
                </div>
                {usingLocation && (
                  <Badge className="bg-[#f05e23] text-white">Ativado</Badge>
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
              }}
              className="flex-1 font-semibold text-zinc-500 hover:bg-zinc-100 h-10 rounded-xl"
            >
              Limpar
            </Button>
            <Button
              onClick={() => setIsFilterModalOpen(false)}
              className="flex-[2] bg-zinc-900 text-white hover:bg-zinc-800 font-semibold h-10 rounded-xl"
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
  const isMaster = room.tier === "master";

  return (
    <div
      onClick={() => onOpen && onOpen(room)}
      className={`group cursor-pointer flex flex-col bg-white border border-zinc-200 rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition-all ${horizontal ? "w-[260px] shrink-0 snap-start" : "w-full"}`}
    >
      <div
        className={`relative w-full bg-zinc-100 ${horizontal ? "h-40" : "h-48"}`}
      >
        <Image
          src={room.image}
          alt={room.name}
          fill
          sizes="(max-width: 768px) 100vw, 400px"
          className="object-cover"
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
          {isMaster && !room.isPartner && (
            <div className="bg-amber-500/95 backdrop-blur px-2 py-1 rounded-md text-[9px] font-bold text-white uppercase tracking-wider flex items-center gap-1 shadow-sm">
              <Crown className="w-3 h-3 fill-white" /> Master
            </div>
          )}
        </div>

        <button
          onClick={(e) => onToggleFavorite(e, room.id)}
          className="absolute top-2 right-2 p-1.5 rounded-full bg-white/50 backdrop-blur-sm hover:bg-white/80 transition-colors z-10 shadow-sm"
        >
          <Heart
            className={`h-4 w-4 ${isFavorited ? "fill-red-500 text-red-500" : "text-zinc-600"}`}
          />
        </button>
      </div>

      <div className="flex flex-col p-4">
        <div className="flex justify-between items-start gap-2 mb-1">
          <h3 className="truncate text-base font-bold text-zinc-900 leading-tight">
            {room.name}
          </h3>
          <div className="flex shrink-0 items-center gap-0.5">
            <Star className="h-3 w-3 fill-zinc-900 text-zinc-900" />
            <span className="text-xs font-semibold text-zinc-700">
              {room.rating}
            </span>
          </div>
        </div>
        <p className="text-xs font-medium text-zinc-500 truncate mb-3">
          {room.category} • {room.distance}
        </p>
        <p className="text-sm font-bold text-zinc-900">{room.priceLabel}</p>
      </div>
    </div>
  );
}
