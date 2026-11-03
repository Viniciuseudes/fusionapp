// components/search-tab.tsx
"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Image from "next/image";
import { usePathname, useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useMobileBack } from "@/hooks/use-mobile-back";
import { format } from "date-fns";
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
  Wallet,
  Compass,
  BriefcaseMedical,
  Sofa,
  Activity,
  X,
  Clock,
  RefreshCw,
  XCircle,
  History,
  TrendingUp,
  ArrowDownToLine,
  ArrowUpFromLine,
  Calendar as CalendarIcon,
  BadgeCheck,
  Tag,
  SlidersHorizontal,
  Mic,
  MicOff,
  SendHorizontal,
  CalendarCheck,
  MessageSquareText,
  UserCheck,
  AlertCircle,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import {
  FusionPassModal,
  BASE_HOURLY_RATES,
  PassTier,
  normalizePassTier,
} from "@/components/fusion-pass-modal";
import { computeWalletBalancesFIFO } from "@/utils/wallet-ledger";

export type RentalType = "hora" | "turno" | "fixo";

export interface Room {
  id: string;
  name: string;
  description?: string;
  category: string;
  tier: "start" | "vip" | "master";
  priceLabel: string;
  filterPrice: number;
  hourlyPriceNumber: number;
  shiftPriceNumber: number | null;
  monthlyPriceNumber: number | null;
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
  preselectedDate?: string;
  preselectedSlot?: string;
}

interface ComparisonBlock {
  title: string;
  subtitle?: string;
  bullets: string[];
}

interface RoomAvailabilityMatch {
  roomId: string;
  roomName?: string;
  specialty?: string;
  tier?: "start" | "vip" | "master";
  neighborhood?: string;
  city?: string;
  hourlyPrice?: number;
  passHourlyPrice?: number;
  shiftPrice?: number | null;
  monthlyPrice?: number | null;
  score: number;
  exactSlotAvailable: boolean;
  consecutiveSlotsAvailable?: boolean;
  requestedSlotLabel: string | null;
  availableSlots: string[];
  matchReason: string;
  aiPitch?: string;
}

interface AIConversationExchange {
  id: string;
  userQuery: string;
  intentType:
    | "room_search"
    | "comparison_question"
    | "financial_simulation"
    | "routine_diagnosis"
    | "profile_guidance";
  headline: string;
  comparisonBlocks: ComparisonBlock[];
  recommendationSummary: string;
  closingQuestion: string;
  followUpSuggestions: string[];
  suggestedCta:
    "none" | "open_pass_modal" | "switch_to_turno" | "complete_profile";
  recommendedRooms: RoomAvailabilityMatch[];
  targetDateISO: string | null;
}

// Renderiza destaques em **negrito** vindos do Concierge sem exibir asteriscos
function renderFormattedText(text?: string) {
  if (!text) return null;
  const parts = text.split(/(\*\*.*?\*\*)/g);
  return parts.map((part, idx) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return (
        <strong key={idx} className="font-extrabold text-[#BF4B24]">
          {part.slice(2, -2)}
        </strong>
      );
    }
    return <span key={idx}>{part}</span>;
  });
}

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
    shortLabel: "Todas",
    icon: Building2,
    desc: "Visualizar todas as modalidades",
  },
  {
    id: "Psicologia",
    shortLabel: "Psicologia",
    icon: Sofa,
    desc: "Divãs e poltronas confortáveis",
  },
  {
    id: "Nutrição & Clínica",
    shortLabel: "Nutrição & Clínica",
    icon: Activity,
    desc: "Mesa, balança e bioimpedância",
  },
  {
    id: "Odontologia",
    shortLabel: "Odontologia",
    icon: Stethoscope,
    desc: "Cadeira odontológica completa",
  },
  {
    id: "Estética",
    shortLabel: "Estética",
    icon: Sparkles,
    desc: "Maca e lavatório",
  },
  {
    id: "Multiuso",
    shortLabel: "Multiuso",
    icon: BriefcaseMedical,
    desc: "Consultório clínico padrão",
  },
];

export function SearchTab({
  onOpenRoom,
  onNavigateToProfile,
  isDashboard = false,
}: {
  onOpenRoom?: (room: Room) => void;
  onNavigateToProfile?: () => void;
  isDashboard?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const isPublic = pathname === "/" && !isDashboard;
  const canUseAIConcierge = !isPublic;

  const [isPortalReady, setIsPortalReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [logoError, setLogoError] = useState(false);
  const [dbRooms, setDbRooms] = useState<Room[]>([]);
  const [profile, setProfile] = useState<{
    name: string;
    balance: number;
    specialty: string | null;
    isComplete: boolean;
    completionPct: number;
    missingFields: string[];
  }>({
    name: "",
    balance: 0,
    specialty: null,
    isComplete: true,
    completionPct: 100,
    missingFields: [],
  });
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

  // Estados da Página Dedicada do Concierge IA
  const [isAISearchExpanded, setIsAISearchExpanded] = useState(false);
  const [aiQuery, setAiQuery] = useState("");
  const [isListeningVoice, setIsListeningVoice] = useState(false);
  const [isRunningAISearch, setIsRunningAISearch] = useState(false);
  const [pendingUserQuestion, setPendingUserQuestion] = useState<string | null>(
    null,
  );
  const [aiExchanges, setAiExchanges] = useState<AIConversationExchange[]>([]);
  const [aiMatchesMap, setAiMatchesMap] = useState<
    Record<string, RoomAvailabilityMatch>
  >({});
  const [aiTargetDateISO, setAiTargetDateISO] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);
  const aiInputRef = useRef<HTMLInputElement | null>(null);
  const aiThreadEndRef = useRef<HTMLDivElement | null>(null);

  const [isWalletOpen, setIsWalletOpen] = useState(false);
  const [isPassModalOpen, setIsPassModalOpen] = useState(false);
  const [passPreselect, setPassPreselect] = useState<{
    tier: PassTier;
    hours: number | null;
  }>({ tier: "vip", hours: null });

  const [walletBalances, setWalletBalances] = useState({
    start: 0,
    vip: 0,
    master: 0,
  });
  const [activeSub, setActiveSub] = useState<any>(null);
  const [cancellingSub, setCancellingSub] = useState(false);
  const [txHistory, setTxHistory] = useState<any[]>([]);
  const [totalSavings, setTotalSavings] = useState(0);

  const [bestHourlyRates, setBestHourlyRates] = useState<
    Record<string, number>
  >({
    start: 27.95,
    vip: 34,
    master: 50,
  });

  useEffect(() => {
    setIsPortalReady(true);
  }, []);

  useEffect(() => {
    if (isAISearchExpanded) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isAISearchExpanded]);

  useMobileBack(
    isWalletOpen,
    () => setIsWalletOpen(false),
    "fusion-pass-wallet",
  );
  useMobileBack(
    isMobileSearchOpen,
    () => setIsMobileSearchOpen(false),
    "mobile-search",
  );
  useMobileBack(
    isAISearchExpanded,
    () => setIsAISearchExpanded(false),
    "concierge-ia-page",
  );

  const handleGoToCompleteProfile = useCallback(() => {
    setIsAISearchExpanded(false);
    setIsMobileSearchOpen(false);
    if (onNavigateToProfile) {
      onNavigateToProfile();
      return;
    }
    if (typeof window !== "undefined") {
      window.history.pushState(
        null,
        "",
        window.location.pathname + window.location.search + "#profile",
      );
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  }, [onNavigateToProfile]);

  const dynamicStarterCards = useMemo(() => {
    const specLabel = profile.specialty || "Psicologia";
    return [
      {
        badge: "Descobrir meu Plano Ideal",
        title: "Qual plano vale mais a pena para mim?",
        desc: "A IA faz 2 perguntas rápidas e calcula sua melhor opção",
        icon: TrendingUp,
      },
      {
        badge: "Dúvida Frequente",
        title: "É possível sublocar uma sala?",
        desc: "Entenda como alugar horas ou ter sua sala fixa abatendo aluguel",
        icon: Crown,
      },
      {
        badge: "Turnos & Valores",
        title: "Qual o valor em média do turno fixo?",
        desc: "Compare Turno Fixo semanal com pacotes de horas",
        icon: Clock,
      },
      {
        badge: profile.specialty
          ? `Salas • ${profile.specialty}`
          : "Mobiliário & Agenda",
        title: `Ver salas de ${specLabel} disponíveis amanhã`,
        desc: "Mostra fotos, estrutura física (divã/poltronas) e horários livres",
        icon: Sofa,
      },
    ];
  }, [profile.specialty]);

  const availableCities = useMemo<string[]>(() => {
    const cities = new Set<string>(
      dbRooms
        .map((r: Room) => r.rawAddress?.city)
        .filter((city): city is string =>
          Boolean(city && typeof city === "string"),
        ),
    );
    return Array.from(cities);
  }, [dbRooms]);

  const fetchWalletData = useCallback(async () => {
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return;

    const [profileRes, subRes, txRes, favRes] = await Promise.all([
      supabase
        .from("profiles")
        .select(
          "full_name, specialty, cpf, birth_date, address_street, address_number",
        )
        .eq("id", user.id)
        .single(),
      supabase
        .from("subscriptions")
        .select("id, tier, status, hours, created_at")
        .eq("user_id", user.id)
        .eq("status", "ACTIVE")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("wallet_transactions")
        .select("amount, created_at, description, type, tier, expires_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false }),
      supabase.from("favorites").select("room_id").eq("user_id", user.id),
    ]);

    setActiveSub(subRes.data || null);

    const allTxs = txRes.data || [];
    setTxHistory(allTxs);

    let calculatedSavings = 0;
    allTxs.forEach((tx) => {
      if (tx.amount > 0 && tx.description) {
        const rateMatch = tx.description.match(/\[Rate:(\d+(?:\.\d+)?)\]/i);
        if (rateMatch) {
          const rate = Number(rateMatch[1]);
          const tier = normalizePassTier(tx.tier);
          const base = BASE_HOURLY_RATES[tier] || 40;
          if (base > rate) {
            calculatedSavings += (base - rate) * Number(tx.amount);
          }
        }
      }
    });
    setTotalSavings(calculatedSavings);

    const fifoTxs = [...allTxs].reverse();
    const fifoBalances = computeWalletBalancesFIFO(fifoTxs);

    setWalletBalances({
      start: fifoBalances.start,
      vip: fifoBalances.vip,
      master: fifoBalances.master,
    });

    if (favRes.data) {
      setFavorites(new Set(favRes.data.map((f: any) => f.room_id)));
    }

    const pData = profileRes.data;
    const missing: string[] = [];
    if (!pData?.specialty) missing.push("Especialidade");
    if (!pData?.cpf) missing.push("CPF");
    if (!pData?.birth_date) missing.push("Data de Nascimento");
    if (!pData?.address_street || !pData?.address_number) {
      missing.push("Endereço");
    }

    const totalChecks = 5;
    const completedChecks = totalChecks - missing.length;
    const completionPct = Math.max(
      20,
      Math.round((completedChecks / totalChecks) * 100),
    );

    setProfile({
      name: pData?.full_name || "Doutor(a)",
      balance: fifoBalances.total,
      specialty: pData?.specialty || null,
      isComplete: missing.length === 0,
      completionPct,
      missingFields: missing,
    });
  }, [supabase]);

  const handleCancelSubscription = async () => {
    if (
      !confirm(
        "Tem certeza que deseja cancelar a renovação automática do seu Fusion Pass+?\n\nNenhuma nova cobrança será feita no seu cartão de crédito e suas horas atuais continuarão disponíveis na carteira até a data de vencimento.",
      )
    ) {
      return;
    }

    setCancellingSub(true);
    try {
      const res = await fetch("/api/subscriptions/cancel", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(
          data.error || "Não foi possível cancelar a assinatura.",
        );
      }

      toast({
        title: "Renovação automática cancelada",
        description: data.message,
      });
      setActiveSub(null);
      await fetchWalletData();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao cancelar assinatura",
        description: err.message,
      });
    } finally {
      setCancellingSub(false);
    }
  };

  useEffect(() => {
    async function fetchData() {
      const { data: roomsData } = await supabase
        .from("rooms")
        .select(
          `id, name, description, image_url, modalities, is_partner, specialty, tier, address_details, host_id, reviews ( rating )`,
        )
        .eq("is_active", true)
        .eq("is_paused", false);

      if (roomsData) {
        const formattedRooms: Room[] = roomsData.map((r: any) => {
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

          const hourlyPriceNumber = Number(pricing.hourly || 45);
          const turnos = [pricing.morning, pricing.afternoon, pricing.night]
            .filter(Boolean)
            .map(Number)
            .filter((v) => !isNaN(v) && v > 0);
          const shiftPriceNumber =
            turnos.length > 0 ? Math.min(...turnos) : null;
          const monthlyPriceNumber =
            pricing.monthly && Number(pricing.monthly) > 0
              ? Number(pricing.monthly)
              : null;

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
            label =
              shiftPriceNumber && shiftPriceNumber > 0
                ? `R$ ${shiftPriceNumber}/turno`
                : "Sob consulta";
            numPrice = shiftPriceNumber || 0;
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
            } else if (finalModalities.includes("turno") && shiftPriceNumber) {
              label = `R$ ${shiftPriceNumber}/turno`;
              numPrice = shiftPriceNumber;
            } else if (finalModalities.includes("fixo") && pricing.monthly) {
              label = `R$ ${pricing.monthly}/mês`;
              numPrice = Number(pricing.monthly);
            }
          }

          return {
            id: r.id,
            name: r.name || "Sala sem nome",
            description: r.description || "",
            category: r.specialty || "Multiuso",
            tier: r.tier || "start",
            priceLabel: label,
            filterPrice: numPrice,
            hourlyPriceNumber,
            shiftPriceNumber,
            monthlyPriceNumber,
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
  }, [isPublic, supabase, appliedFilters.modality, fetchWalletData]);

  const executeAISearch = useCallback(
    async (customText?: string) => {
      if (!canUseAIConcierge) return;

      const textToSearch = (customText ?? aiQuery).trim();
      if (!textToSearch) {
        toast({
          title: "Digite ou fale sua dúvida",
          description:
            'Ex: "É possível sublocar uma sala?" ou "Atendo 2h a 4h por semana"',
        });
        return;
      }

      setIsRunningAISearch(true);
      setPendingUserQuestion(textToSearch);
      setIsAISearchExpanded(true);
      setAiQuery("");

      setTimeout(() => {
        aiThreadEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }, 60);

      try {
        // Inclui headline + recommendationSummary + closingQuestion para a IA lembrar exatamente a pergunta que fez antes!
        const historyPayload = aiExchanges.flatMap((ex) => [
          { role: "user" as const, content: ex.userQuery },
          {
            role: "assistant" as const,
            content: [ex.headline, ex.recommendationSummary, ex.closingQuestion]
              .filter(Boolean)
              .join(" "),
          },
        ]);

        const detectedUserTier =
          walletBalances.master > 0
            ? "Premium"
            : walletBalances.vip > 0
              ? "VIP"
              : walletBalances.start > 0
                ? "Basic"
                : activeSub?.tier || null;

        const res = await fetch("/api/ai-search", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            query: textToSearch,
            history: historyPayload,
            walletBalance: profile.balance,
            activeTier: detectedUserTier,
            userSpecialty: profile.specialty,
            isProfileComplete: profile.isComplete,
            missingProfileFields: profile.missingFields,
          }),
        });

        const data = await res.json();
        if (!res.ok) {
          throw new Error(
            data.error || "Falha ao consultar o Concierge IA da Fusion.",
          );
        }

        const ext = data.extraction;
        const matchesList: RoomAvailabilityMatch[] = data.matches || [];

        if (ext?.shouldApplyFilters) {
          const parsedDate = ext?.dateISO
            ? new Date(`${ext.dateISO}T12:00:00`)
            : undefined;

          const nextFilters = {
            city: ext?.city || "Qualquer lugar",
            date: parsedDate,
            time: ext?.shift || "",
            modality: (ext?.modality || "hora") as RentalType,
            category: ext?.category || "Todas as Salas",
          };

          setPendingFilters(nextFilters);
          setAppliedFilters(nextFilters);
          if (ext?.tier && ext.tier !== "all") {
            setActiveTier(ext.tier);
          } else {
            setActiveTier("all");
          }

          const map: Record<string, RoomAvailabilityMatch> = {};
          matchesList.forEach((m: RoomAvailabilityMatch) => {
            map[m.roomId] = m;
          });

          setAiMatchesMap(map);
          setAiTargetDateISO(ext?.dateISO || null);
          setHasSearched(true);
        }

        const newExchange: AIConversationExchange = {
          id: `${Date.now()}`,
          userQuery: textToSearch,
          intentType: ext?.intentType || "room_search",
          headline:
            ext?.headline ||
            data.assistantMessage ||
            "Aqui está a melhor recomendação para o seu atendimento:",
          comparisonBlocks: Array.isArray(ext?.comparisonBlocks)
            ? ext.comparisonBlocks
            : [],
          recommendationSummary: ext?.recommendationSummary || "",
          closingQuestion: ext?.closingQuestion || "",
          followUpSuggestions: Array.isArray(ext?.followUpSuggestions)
            ? ext.followUpSuggestions
            : dynamicStarterCards.map((c) => c.title),
          suggestedCta: ext?.suggestedCta || "none",
          recommendedRooms:
            ext?.shouldApplyFilters !== false
              ? matchesList
                  .filter(
                    (m) =>
                      m.availableSlots &&
                      m.availableSlots.length > 0 &&
                      m.score >= 0,
                  )
                  .slice(0, 3)
              : [],
          targetDateISO: ext?.dateISO || null,
        };

        setAiExchanges((prev) => [...prev.slice(-8), newExchange]);
        setIsMobileSearchOpen(false);

        setTimeout(() => {
          aiThreadEndRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "end",
          });
        }, 120);
      } catch (err: any) {
        toast({
          variant: "destructive",
          title: "Não foi possível consultar o Concierge IA",
          description: err.message,
        });
      } finally {
        setIsRunningAISearch(false);
        setPendingUserQuestion(null);
      }
    },
    [
      canUseAIConcierge,
      aiQuery,
      aiExchanges,
      walletBalances,
      activeSub,
      profile,
      dynamicStarterCards,
      toast,
    ],
  );

  const handleToggleVoiceSearch = useCallback(() => {
    if (!canUseAIConcierge) return;

    if (isListeningVoice) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListeningVoice(false);
      return;
    }

    const SpeechRecognition =
      typeof window !== "undefined"
        ? (window as any).SpeechRecognition ||
          (window as any).webkitSpeechRecognition
        : null;

    if (!SpeechRecognition) {
      setIsAISearchExpanded(true);
      setTimeout(() => aiInputRef.current?.focus(), 100);
      toast({
        title: "Digite sua pergunta abaixo",
        description:
          "Seu navegador não suporta microfone direto, mas o Concierge IA responde por texto imediatamente!",
      });
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.lang = "pt-BR";
      recognition.continuous = false;
      recognition.interimResults = true;

      let finalTranscript = "";

      recognition.onstart = () => {
        setIsAISearchExpanded(true);
        setIsListeningVoice(true);
      };

      recognition.onresult = (event: any) => {
        let interim = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          const transcript = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcript;
          } else {
            interim += transcript;
          }
        }
        const currentText = (finalTranscript || interim).trim();
        if (currentText) {
          setAiQuery(currentText);
        }
      };

      recognition.onerror = () => {
        setIsListeningVoice(false);
      };

      recognition.onend = () => {
        setIsListeningVoice(false);
        if (finalTranscript.trim()) {
          executeAISearch(finalTranscript.trim());
        }
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch {
      setIsListeningVoice(false);
    }
  }, [canUseAIConcierge, isListeningVoice, executeAISearch, toast]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
    };
  }, []);

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
    setAiExchanges([]);
    setAiMatchesMap({});
    setAiTargetDateISO(null);
    setAiQuery("");
    setActiveMobileTab("onde");
  };

  const handleExecuteSearch = () => {
    setAppliedFilters(pendingFilters);
    setHasSearched(true);
    setActiveSearchTab(null);
    setIsMobileSearchOpen(false);
    window.scrollTo({ top: 280, behavior: "smooth" });
  };

  const handleQuickCategorySelect = (categoryId: string) => {
    setPendingFilters((prev) => ({ ...prev, category: categoryId }));
    setAppliedFilters((prev) => ({ ...prev, category: categoryId }));
    setHasSearched(categoryId !== "Todas as Salas");
  };

  const handleOpenPassWithTier = (
    tier: PassTier = "vip",
    hours: number | null = null,
  ) => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(
        new CustomEvent("open-fusion-pass", {
          detail: { step: "plans", tier },
        }),
      );
      return;
    }
    setPassPreselect({ tier, hours });
    setIsPassModalOpen(true);
  };

  const hasAIMatches = Object.keys(aiMatchesMap).length > 0;

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
        fallbackMessage = `Não encontramos espaços exatos para "${appliedFilters.category}" na modalidade selecionada, mas separamos estas excelentes salas disponíveis na região.`;
      } else {
        exactMatches = dbRooms;
        fallbackMessage = `Ainda não temos unidades em "${appliedFilters.city}". Confira nossos consultórios mais reservados:`;
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
    } else if (hasAIMatches) {
      const openInAI = exactMatches.filter(
        (r) => (aiMatchesMap[r.id]?.availableSlots?.length ?? 0) > 0,
      );
      exactMatches = (openInAI.length > 0 ? openInAI : exactMatches).sort(
        (a, b) => {
          const scoreA = aiMatchesMap[a.id]?.score ?? -999;
          const scoreB = aiMatchesMap[b.id]?.score ?? -999;
          return scoreB - scoreA;
        },
      );
    }

    return { rooms: exactMatches, isFallback, fallbackMessage };
  }, [
    dbRooms,
    appliedFilters,
    activeTier,
    hasSearched,
    usingLocation,
    userLocation,
    hasAIMatches,
    aiMatchesMap,
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

  const renderTargetedPassBanner = () => {
    if (activeTier === "all") return null;

    let title, subtitle, Icon, benefits;
    let baseHourlyRate = BASE_HOURLY_RATES.start;

    if (activeTier === "vip") {
      baseHourlyRate = BASE_HOURLY_RATES.vip;
      title = "Pacote de Horas • Salas VIP";
      subtitle = `Reduza o valor da hora avulsa de R$ ${baseHourlyRate}/h com os pacotes VIP e aumente sua margem em cada atendimento.`;
      Icon = Star;
      benefits = [
        "Economia de até 41% por hora",
        "Validade de 30 dias",
        "Sem fidelidade",
      ];
    } else if (activeTier === "master") {
      baseHourlyRate = BASE_HOURLY_RATES.master;
      title = "Pacote de Horas • Salas Premium";
      subtitle = `Acesso livre a todas as salas da Fusion Clinic (Premium, VIP e Basic) pagando muito menos que os R$ ${baseHourlyRate}/h avulsos.`;
      Icon = Crown;
      benefits = [
        "Libera 100% das unidades",
        "Zero taxa de upgrade",
        "Repasse ou doe horas",
      ];
    } else {
      baseHourlyRate = BASE_HOURLY_RATES.start;
      title = "Pacote de Horas • Salas Basic";
      subtitle = `Em vez de pagar R$ ${baseHourlyRate}/h por consulta avulsa, ative um pacote Basic e garanta o menor custo por hora da plataforma.`;
      Icon = Shield;
      benefits = [
        "Maior rentabilidade por paciente",
        "Crédito liberado na hora",
        "Cancele quando quiser",
      ];
    }

    return (
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5 p-5 sm:p-6 rounded-2xl mb-6 bg-[#FAF7F4] border border-[#BF4B24]/25 shadow-2xs transition-all mx-4 sm:mx-0">
        <div className="flex items-start sm:items-center gap-4 w-full sm:w-auto">
          <div className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 bg-white border border-[#BF4B24]/20 text-[#BF4B24]">
            <Icon className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-[#BF4B24] bg-white border border-[#BF4B24]/20 px-2 py-0.5 rounded-full">
                Fusion Pass+
              </span>
              <h3 className="text-base font-bold text-stone-900 leading-tight">
                {title}
              </h3>
            </div>
            <p className="text-xs sm:text-sm text-stone-600 mt-1 leading-relaxed max-w-xl">
              {subtitle}
            </p>
            <div className="flex flex-wrap items-center gap-4 mt-2.5">
              {benefits.map((ben, idx) => (
                <div key={idx} className="flex items-center gap-1.5">
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                  <span className="text-xs font-semibold text-stone-700">
                    {ben}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <Button
          onClick={() => handleOpenPassWithTier(activeTier)}
          className="w-full sm:w-auto shrink-0 rounded-xl font-bold h-11 px-5 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white text-xs cursor-pointer"
        >
          Simular pacote com desconto
        </Button>
      </div>
    );
  };

  if (loading)
    return (
      <div className="flex justify-center items-center min-h-[60vh] bg-[#FAF7F4]">
        <Loader2 className="w-9 h-9 animate-spin text-[#BF4B24]" />
      </div>
    );

  const firstName = profile.name ? profile.name.split(" ")[0] : "Especialista";
  const hasActiveWalletCredits = profile.balance > 0 || Boolean(activeSub);

  // ==========================================================================
  // PÁGINA FULL-SCREEN DO CONCIERGE IA (DIÁLOGO CURTO + VEREDITO ÚNICO)
  // ==========================================================================
  const fullScreenConciergeOverlay =
    canUseAIConcierge &&
    isAISearchExpanded &&
    isPortalReady &&
    typeof document !== "undefined"
      ? createPortal(
          <div className="fixed inset-0 z-[9999] bg-[#FAF7F4] flex flex-col h-[100dvh] w-screen overflow-hidden font-sans animate-in fade-in duration-200">
            {/* 1. CABEÇALHO EXCLUSIVO DA PÁGINA DO CHAT */}
            <div className="bg-[#141210] text-white px-4 sm:px-6 pt-[max(env(safe-area-inset-top,14px),14px)] pb-3.5 border-b border-white/10 shrink-0 shadow-md">
              <div className="max-w-3xl mx-auto flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <button
                    type="button"
                    onClick={() => setIsAISearchExpanded(false)}
                    aria-label="Voltar para as salas"
                    className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-white flex items-center justify-center shrink-0 transition-colors cursor-pointer"
                  >
                    <ArrowLeft className="w-5 h-5" />
                  </button>

                  <div className="relative w-9 h-9 rounded-xl bg-gradient-to-br from-[#DE5D2E] to-[#9A3C1D] text-white flex items-center justify-center shrink-0 shadow-xs ring-1 ring-white/20">
                    <Sparkles className="w-4 h-4" />
                    <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-400 ring-2 ring-[#141210]" />
                  </div>

                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm sm:text-base font-extrabold text-white tracking-tight truncate">
                        Concierge Fusion IA
                      </span>
                      {profile.specialty ? (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-emerald-400/15 text-emerald-300 border border-emerald-400/30 px-2 py-0.5 rounded-full">
                          <Stethoscope className="w-3 h-3" />
                          {profile.specialty}
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-amber-400/15 text-[#FBBF24] border border-amber-400/30 px-2 py-0.5 rounded-full">
                          Consultor VIP
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-stone-300 truncate">
                      {profile.specialty
                        ? `Consultoria rápida e direta para ${profile.specialty}`
                        : "Descubra em 2 perguntas o plano mais econômico para você"}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {aiExchanges.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        setAiExchanges([]);
                        setAiMatchesMap({});
                        setAiTargetDateISO(null);
                      }}
                      className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-[11px] font-bold text-stone-200 transition-colors cursor-pointer"
                    >
                      Recomeçar
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setIsAISearchExpanded(false)}
                    className="px-3 py-1.5 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold text-white flex items-center gap-1 cursor-pointer"
                  >
                    <span className="hidden sm:inline">Fechar</span>
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* 2. ÁREA DE DIÁLOGO COM ROLAGEM 100% ISOLADA */}
            <div className="flex-1 overflow-y-auto overscroll-contain px-4 sm:px-6 py-5">
              <div className="max-w-3xl mx-auto space-y-5 pb-8">
                {/* GUIA DE CONCLUSÃO DE PERFIL (SE INCOMPLETO) */}
                {!profile.isComplete && (
                  <div className="p-4 rounded-2xl bg-gradient-to-r from-amber-50/90 via-orange-50/60 to-white border border-[#BF4B24]/30 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="space-y-1 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold uppercase tracking-wider bg-[#BF4B24] text-white px-2 py-0.5 rounded-full">
                          <AlertCircle className="w-3 h-3" />
                          Perfil {profile.completionPct}%
                        </span>
                        <span className="text-xs font-bold text-stone-900">
                          Falta preencher: {profile.missingFields.join(", ")}
                        </span>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleGoToCompleteProfile}
                      className="px-3.5 py-2 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <UserCheck className="w-3.5 h-3.5 text-[#FBBF24]" />
                      <span>Completar perfil</span>
                    </button>
                  </div>
                )}

                {/* TELA INICIAL CONVERSACIONAL */}
                {aiExchanges.length === 0 && !isRunningAISearch && (
                  <div className="space-y-4">
                    <div className="bg-white rounded-3xl p-5 border border-stone-200/85 shadow-2xs flex items-start gap-3.5">
                      <div className="w-10 h-10 rounded-2xl bg-[#FAF7F4] border border-[#BF4B24]/25 text-[#BF4B24] flex items-center justify-center shrink-0 mt-0.5">
                        <MessageSquareText className="w-5 h-5" />
                      </div>
                      <div className="space-y-1.5">
                        <h3 className="text-sm sm:text-base font-bold text-stone-900">
                          Olá, Dr(a). {firstName}! Como posso te ajudar hoje?
                        </h3>
                        <p className="text-xs sm:text-sm text-stone-600 leading-relaxed">
                          Me conte quantas horas por semana pretende atender ou
                          qual é a sua dúvida. Eu faço as perguntas certas e te
                          entrego <strong>a melhor recomendação</strong> com o
                          cálculo exato da sua economia.
                        </p>
                      </div>
                    </div>

                    <div>
                      <p className="text-[11px] font-bold uppercase tracking-wider text-stone-400 mb-2.5 pl-1">
                        Toque para iniciar a conversa:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                        {dynamicStarterCards.map((card) => {
                          const Icon = card.icon;
                          return (
                            <button
                              key={card.title}
                              type="button"
                              onClick={() => executeAISearch(card.title)}
                              className="group p-3.5 rounded-2xl bg-white hover:bg-orange-50/40 border border-stone-200/90 hover:border-[#BF4B24]/45 text-left transition-all flex items-start gap-3 shadow-2xs cursor-pointer active:scale-[0.99]"
                            >
                              <div className="w-9 h-9 rounded-xl bg-[#FAF7F4] group-hover:bg-[#BF4B24] text-[#BF4B24] group-hover:text-white border border-[#BF4B24]/20 flex items-center justify-center shrink-0 transition-colors mt-0.5">
                                <Icon className="w-4 h-4" />
                              </div>
                              <div className="min-w-0 flex-1">
                                <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#BF4B24] block">
                                  {card.badge}
                                </span>
                                <p className="text-xs sm:text-sm font-bold text-stone-900 group-hover:text-[#BF4B24] transition-colors mt-0.5 leading-snug">
                                  {card.title}
                                </p>
                                <p className="text-[11px] text-stone-500 mt-0.5 line-clamp-1">
                                  {card.desc}
                                </p>
                              </div>
                              <ChevronRight className="w-4 h-4 text-stone-300 group-hover:text-[#BF4B24] shrink-0 self-center" />
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* DIÁLOGO ENTRE O PROFISSIONAL E O CONCIERGE */}
                {aiExchanges.map((exchange) => {
                  const hasSingleVerdict =
                    exchange.comparisonBlocks.length === 1;

                  return (
                    <div key={exchange.id} className="space-y-3.5">
                      {/* Balão do Profissional */}
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1 pr-1">
                          Você
                        </span>
                        <div className="bg-stone-900 text-white px-4 py-2.5 rounded-2xl rounded-tr-xs text-xs sm:text-sm font-semibold max-w-[85%] shadow-xs">
                          {exchange.userQuery}
                        </div>
                      </div>

                      {/* Balão Direto e Conversacional do Concierge */}
                      <div className="bg-white rounded-3xl p-4 sm:p-5 border border-stone-200/90 shadow-xs space-y-4">
                        <div className="flex items-start gap-3">
                          <div className="w-8 h-8 rounded-xl bg-[#FAF7F4] border border-[#BF4B24]/25 text-[#BF4B24] flex items-center justify-center shrink-0 mt-0.5">
                            <Sparkles className="w-4 h-4" />
                          </div>
                          <div className="space-y-1.5 flex-1">
                            <p className="text-xs sm:text-[15px] font-medium text-stone-800 leading-relaxed">
                              {renderFormattedText(exchange.headline)}
                            </p>
                          </div>
                        </div>

                        {/* CARD DE VEREDITO ÚNICO (LARGURA TOTAL QUANDO HÁ 1 RECOMENDAÇÃO) */}
                        {exchange.comparisonBlocks.length > 0 && (
                          <div
                            className={
                              hasSingleVerdict
                                ? "grid grid-cols-1 gap-3"
                                : exchange.comparisonBlocks.length === 2
                                  ? "grid grid-cols-1 sm:grid-cols-2 gap-3"
                                  : "grid grid-cols-1 sm:grid-cols-3 gap-3"
                            }
                          >
                            {exchange.comparisonBlocks.map((block, bIdx) => (
                              <div
                                key={bIdx}
                                className={`p-4 rounded-2xl border flex flex-col justify-between space-y-2.5 ${
                                  hasSingleVerdict
                                    ? "bg-gradient-to-br from-[#FAF7F4] to-orange-50/40 border-[#BF4B24]/35 shadow-2xs"
                                    : "bg-[#FAF7F4] border-stone-200/90"
                                }`}
                              >
                                <div className="space-y-2">
                                  <div className="pb-2 border-b border-stone-200/70 flex items-center justify-between gap-2 flex-wrap">
                                    <h4 className="text-xs sm:text-sm font-extrabold text-stone-900">
                                      {renderFormattedText(block.title)}
                                    </h4>
                                    {block.subtitle && (
                                      <span className="text-[11px] font-bold text-[#BF4B24] bg-white px-2.5 py-0.5 rounded-full border border-[#BF4B24]/20">
                                        {block.subtitle}
                                      </span>
                                    )}
                                  </div>
                                  <ul className="space-y-2 pt-0.5">
                                    {block.bullets.map((bullet, i) => (
                                      <li
                                        key={i}
                                        className="text-xs text-stone-700 leading-relaxed flex items-start gap-2"
                                      >
                                        <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                                        <span>
                                          {renderFormattedText(bullet)}
                                        </span>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* VITRINE DE SALAS (SÓ APARECE QUANDO O USUÁRIO PEDE PARA VER SALAS) */}
                        {exchange.recommendedRooms.length > 0 && (
                          <div className="space-y-3 pt-1">
                            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                              {exchange.recommendedRooms.map((match) => {
                                const fullRoom = dbRooms.find(
                                  (r) => r.id === match.roomId,
                                );
                                if (!fullRoom) return null;

                                const isMaster = fullRoom.tier === "master";
                                const isVip = fullRoom.tier === "vip";
                                const passRate =
                                  bestHourlyRates[fullRoom.tier] ||
                                  (isMaster ? 50 : isVip ? 34 : 27.95);
                                const neighborhood =
                                  fullRoom.rawAddress?.neighborhood ||
                                  match.neighborhood ||
                                  "Lagoa Nova";
                                const hourlyRate =
                                  match.hourlyPrice ||
                                  fullRoom.hourlyPriceNumber ||
                                  45;
                                const shiftPrice =
                                  match.shiftPrice ?? fullRoom.shiftPriceNumber;
                                const monthlyPrice =
                                  match.monthlyPrice ??
                                  fullRoom.monthlyPriceNumber;

                                const equipmentSummary =
                                  match.aiPitch ||
                                  fullRoom.description ||
                                  "Consultório climatizado com isolamento acústico, recepção e Wi-Fi.";

                                return (
                                  <div
                                    key={match.roomId}
                                    onClick={() => {
                                      setIsAISearchExpanded(false);
                                      if (onOpenRoom) {
                                        onOpenRoom({
                                          ...fullRoom,
                                          selectedModality:
                                            appliedFilters.modality,
                                          preselectedDate:
                                            exchange.targetDateISO || undefined,
                                          preselectedSlot:
                                            match.exactSlotAvailable &&
                                            match.requestedSlotLabel
                                              ? match.requestedSlotLabel
                                              : match.availableSlots[0] ||
                                                undefined,
                                        });
                                      }
                                    }}
                                    className="group rounded-2xl bg-white border border-stone-200/90 hover:border-[#BF4B24]/50 overflow-hidden transition-all duration-300 hover:shadow-md cursor-pointer flex flex-col"
                                  >
                                    <div className="relative w-full h-32 bg-stone-100 overflow-hidden">
                                      <Image
                                        src={fullRoom.image}
                                        alt={fullRoom.name}
                                        fill
                                        sizes="(max-width: 768px) 100vw, 320px"
                                        className="object-cover group-hover:scale-105 transition-transform duration-500"
                                        onError={(e: any) => {
                                          e.target.src = "/placeholder.jpg";
                                        }}
                                      />
                                      <div className="absolute inset-0 bg-gradient-to-t from-black/65 via-black/10 to-black/20 pointer-events-none" />

                                      <div className="absolute top-2 left-2 right-2 flex items-center justify-between gap-1 z-10">
                                        <span
                                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold flex items-center gap-1 ${
                                            isMaster
                                              ? "bg-stone-950/90 text-amber-300"
                                              : isVip
                                                ? "bg-[#BF4B24] text-white"
                                                : "bg-white/95 text-stone-800"
                                          }`}
                                        >
                                          {isMaster
                                            ? "Premium"
                                            : isVip
                                              ? "VIP"
                                              : "Basic"}
                                        </span>
                                      </div>

                                      <div className="absolute bottom-2 left-2 right-2 z-10">
                                        <span className="inline-flex items-center gap-1 text-[10px] font-extrabold px-2 py-0.5 rounded-md bg-emerald-600 text-white">
                                          <Clock className="w-2.5 h-2.5" />
                                          {match.matchReason}
                                        </span>
                                      </div>
                                    </div>

                                    <div className="p-3 flex-1 flex flex-col justify-between bg-white space-y-2">
                                      <div className="space-y-1">
                                        <span className="text-[10px] text-stone-500 font-medium block truncate">
                                          {neighborhood} •{" "}
                                          {fullRoom.specialty ||
                                            fullRoom.category}
                                        </span>
                                        <h4 className="font-bold text-xs sm:text-sm text-stone-900 group-hover:text-[#BF4B24] transition-colors line-clamp-1">
                                          {fullRoom.name}
                                        </h4>
                                        <p className="text-[11px] text-stone-600 leading-snug line-clamp-2">
                                          {equipmentSummary}
                                        </p>
                                        <div className="pt-1 flex items-baseline gap-1.5 flex-wrap">
                                          <span className="text-xs font-extrabold text-stone-900">
                                            R$ {hourlyRate}/h
                                          </span>
                                          <span className="text-[10px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">
                                            Pass+ R${" "}
                                            {Number(passRate)
                                              .toFixed(2)
                                              .replace(".00", "")}
                                            /h
                                          </span>
                                        </div>
                                        {(shiftPrice || monthlyPrice) && (
                                          <div className="flex items-center gap-1 flex-wrap text-[10px] font-semibold text-stone-500">
                                            {shiftPrice && (
                                              <span>Turno R$ {shiftPrice}</span>
                                            )}
                                            {shiftPrice && monthlyPrice && (
                                              <span>•</span>
                                            )}
                                            {monthlyPrice && (
                                              <span>
                                                Mensal R$ {monthlyPrice}
                                              </span>
                                            )}
                                          </div>
                                        )}
                                      </div>

                                      {match.availableSlots.length > 0 && (
                                        <div className="flex items-center gap-1.5 flex-wrap pt-1.5 border-t border-stone-100">
                                          {match.availableSlots
                                            .slice(0, 3)
                                            .map((slot) => (
                                              <button
                                                key={slot}
                                                type="button"
                                                onClick={(e) => {
                                                  e.stopPropagation();
                                                  setIsAISearchExpanded(false);
                                                  if (onOpenRoom) {
                                                    onOpenRoom({
                                                      ...fullRoom,
                                                      selectedModality: "hora",
                                                      preselectedDate:
                                                        exchange.targetDateISO ||
                                                        undefined,
                                                      preselectedSlot: slot,
                                                    });
                                                  }
                                                }}
                                                className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-[#FAF7F4] hover:bg-[#BF4B24] text-stone-800 hover:text-white border border-stone-200"
                                              >
                                                {slot}
                                              </button>
                                            ))}
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        )}

                        {/* NOTA COMPLEMENTAR + BOTÃO DE AÇÃO DO VEREDITO */}
                        {(exchange.recommendationSummary ||
                          exchange.suggestedCta !== "none") && (
                          <div className="p-3.5 rounded-2xl bg-emerald-50/80 border border-emerald-200/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            {exchange.recommendationSummary ? (
                              <div className="flex items-start gap-2">
                                <BadgeCheck className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                                <p className="text-xs text-emerald-950 font-medium leading-relaxed">
                                  {renderFormattedText(
                                    exchange.recommendationSummary,
                                  )}
                                </p>
                              </div>
                            ) : (
                              <span className="text-xs font-bold text-emerald-950">
                                Deseja avançar com esta recomendação?
                              </span>
                            )}

                            {exchange.suggestedCta === "complete_profile" && (
                              <button
                                type="button"
                                onClick={handleGoToCompleteProfile}
                                className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <UserCheck className="w-3.5 h-3.5 text-[#FBBF24]" />
                                <span>Completar perfil</span>
                              </button>
                            )}

                            {exchange.suggestedCta === "open_pass_modal" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAISearchExpanded(false);
                                  handleOpenPassWithTier("vip");
                                }}
                                className="px-4 py-2.5 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                              >
                                <Tag className="w-3.5 h-3.5" />
                                <span>Abrir Planos Fusion Pass+</span>
                              </button>
                            )}

                            {exchange.suggestedCta === "switch_to_turno" && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsAISearchExpanded(false);
                                  setPendingFilters((p) => ({
                                    ...p,
                                    modality: "turno",
                                  }));
                                  setAppliedFilters((p) => ({
                                    ...p,
                                    modality: "turno",
                                  }));
                                }}
                                className="px-4 py-2.5 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shrink-0 flex items-center justify-center gap-1.5 cursor-pointer"
                              >
                                <span>Ver Salas para Turno / Fixo</span>
                                <ChevronRight className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}

                        {/* PERGUNTA DIRETA DO CONCIERGE + RESPOSTAS RÁPIDAS */}
                        {(exchange.closingQuestion ||
                          exchange.followUpSuggestions.length > 0) && (
                          <div className="pt-2 border-t border-stone-100 space-y-2.5">
                            {exchange.closingQuestion && (
                              <p className="text-xs sm:text-sm font-bold text-stone-900 leading-snug">
                                {renderFormattedText(exchange.closingQuestion)}
                              </p>
                            )}
                            <div className="flex flex-wrap gap-2">
                              {exchange.followUpSuggestions.map(
                                (followUp, fIdx) => (
                                  <button
                                    key={fIdx}
                                    type="button"
                                    onClick={() => executeAISearch(followUp)}
                                    className="text-xs font-bold text-[#BF4B24] bg-[#FAF7F4] hover:bg-[#BF4B24] hover:text-white border border-[#BF4B24]/35 px-3.5 py-2 rounded-xl transition-all cursor-pointer text-left flex items-center gap-1.5 shadow-2xs active:scale-95"
                                  >
                                    <span>{followUp}</span>
                                    <ArrowRight className="w-3.5 h-3.5 opacity-80 shrink-0" />
                                  </button>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}

                {/* ESTADO DE CARREGAMENTO */}
                {isRunningAISearch && (
                  <div className="space-y-3 animate-in fade-in duration-150">
                    {pendingUserQuestion && (
                      <div className="flex flex-col items-end">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 mb-1 pr-1">
                          Você
                        </span>
                        <div className="bg-stone-900 text-white px-4 py-2.5 rounded-2xl rounded-tr-xs text-xs sm:text-sm font-semibold max-w-[85%]">
                          {pendingUserQuestion}
                        </div>
                      </div>
                    )}
                    <div className="bg-white rounded-3xl p-4 border border-stone-200/90 shadow-2xs flex items-center gap-3">
                      <div className="w-8 h-8 rounded-xl bg-[#FAF7F4] border border-[#BF4B24]/25 flex items-center justify-center shrink-0">
                        <Loader2 className="w-4 h-4 text-[#BF4B24] animate-spin" />
                      </div>
                      <p className="text-xs sm:text-sm font-semibold text-stone-700">
                        Analisando sua resposta...
                      </p>
                    </div>
                  </div>
                )}

                <div ref={aiThreadEndRef} />
              </div>
            </div>

            {/* 3. RODAPÉ FIXO DE RESPOSTA */}
            <div className="bg-white border-t border-stone-200/90 px-4 sm:px-6 pt-3 pb-[max(env(safe-area-inset-bottom,14px),14px)] shrink-0 shadow-[0_-8px_30px_rgba(0,0,0,0.06)]">
              <div className="max-w-3xl mx-auto flex items-center gap-2">
                <div className="relative flex-1">
                  <input
                    ref={aiInputRef}
                    type="text"
                    value={aiQuery}
                    onChange={(e) => setAiQuery(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") executeAISearch();
                    }}
                    placeholder="Responda aqui ou digite sua dúvida..."
                    className="w-full h-12 pl-4 pr-10 rounded-2xl bg-[#FAF7F4] border border-stone-200/95 text-xs sm:text-sm text-stone-900 placeholder:text-stone-400 focus:outline-none focus:border-[#BF4B24] focus:bg-white transition-colors"
                  />
                  {aiQuery && (
                    <button
                      type="button"
                      onClick={() => setAiQuery("")}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-stone-400 hover:text-stone-700"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={handleToggleVoiceSearch}
                  title={
                    isListeningVoice ? "Parar gravação" : "Falar no microfone"
                  }
                  className={`h-12 px-3.5 sm:px-4 rounded-2xl font-bold text-xs flex items-center gap-1.5 shrink-0 transition-all cursor-pointer ${
                    isListeningVoice
                      ? "bg-red-600 text-white animate-pulse shadow-md"
                      : "bg-stone-100 hover:bg-stone-200 text-stone-800"
                  }`}
                >
                  {isListeningVoice ? (
                    <>
                      <MicOff className="w-4 h-4" />
                      <span className="hidden sm:inline">Ouvindo...</span>
                    </>
                  ) : (
                    <>
                      <Mic className="w-4 h-4 text-[#BF4B24]" />
                      <span className="hidden sm:inline">Voz</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  disabled={isRunningAISearch}
                  onClick={() => executeAISearch()}
                  className="h-12 px-4 sm:px-5 rounded-2xl bg-gradient-to-r from-[#C24116] to-[#DE5D2E] hover:from-[#A83812] hover:to-[#C84B20] disabled:opacity-60 text-white font-bold text-xs flex items-center gap-1.5 shrink-0 shadow-sm transition-all cursor-pointer"
                >
                  {isRunningAISearch ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <span className="hidden sm:inline">Enviar</span>
                      <SendHorizontal className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="flex flex-col pb-24 bg-[#FAF7F4] min-h-screen relative font-sans">
      {fullScreenConciergeOverlay}

      <FusionPassModal
        isOpen={isPassModalOpen}
        onOpenChange={setIsPassModalOpen}
        initialTier={passPreselect.tier}
        initialHours={passPreselect.hours}
        onBestRatesLoaded={setBestHourlyRates}
        onSubscriptionSuccess={async () => {
          await fetchWalletData();
          setIsWalletOpen(true);
          window.scrollTo({ top: 0, behavior: "smooth" });
        }}
      />

      {/* GAVETA DE BUSCA TRADICIONAL MOBILE */}
      {isMobileSearchOpen && (
        <div className="fixed inset-0 z-[200] bg-[#FAF7F4] flex flex-col md:hidden animate-in slide-in-from-bottom-6 duration-200">
          <div className="flex justify-between items-center px-5 pt-4 pb-3 bg-white border-b border-stone-200/80 shrink-0 z-10">
            <button
              onClick={() => setIsMobileSearchOpen(false)}
              aria-label="Fechar busca"
              className="w-9 h-9 rounded-full bg-stone-100 flex items-center justify-center hover:bg-stone-200 text-stone-700 transition-colors"
            >
              <X className="w-4 h-4 stroke-[2.5]" />
            </button>
            <span className="text-xs font-bold uppercase tracking-wider text-stone-800">
              Buscar Consultório
            </span>
            <button
              onClick={handleClearFilters}
              className="text-xs font-semibold text-[#BF4B24] hover:underline"
            >
              Limpar
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
            {canUseAIConcierge && (
              <button
                type="button"
                onClick={() => {
                  setIsMobileSearchOpen(false);
                  setIsAISearchExpanded(true);
                }}
                className="w-full bg-stone-950 text-white rounded-2xl p-4 flex items-center justify-between gap-3 shadow-sm"
              >
                <div className="flex items-center gap-3 text-left">
                  <div className="w-9 h-9 rounded-xl bg-[#BF4B24] flex items-center justify-center shrink-0">
                    <Sparkles className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <span className="text-xs font-extrabold text-[#FBBF24] block">
                      Conversar com o Concierge IA
                    </span>
                    <span className="text-[11px] text-stone-300">
                      Descubra o plano mais econômico para sua rotina
                    </span>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
              </button>
            )}

            {/* 1. ONDE - MOBILE */}
            {activeMobileTab === "onde" ? (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-stone-200/80 animate-in fade-in duration-150">
                <h2 className="text-lg font-bold text-stone-900 mb-3.5">
                  Onde você deseja atender?
                </h2>
                <div className="space-y-2 max-h-[48vh] overflow-y-auto scrollbar-hide">
                  <button
                    onClick={requestLocation}
                    className="w-full flex items-center gap-3.5 p-3 rounded-2xl bg-[#FAF7F4] border border-[#BF4B24]/25 text-left"
                  >
                    <div className="w-10 h-10 bg-white rounded-full flex items-center justify-center shrink-0 border border-[#BF4B24]/20">
                      <Compass className="w-5 h-5 text-[#BF4B24]" />
                    </div>
                    <div>
                      <span className="block text-sm font-bold text-stone-900">
                        Perto de mim
                      </span>
                      <span className="block text-xs text-stone-500">
                        Usar localização atual do GPS
                      </span>
                    </div>
                  </button>
                  <div className="w-full h-px bg-stone-100 my-2.5" />
                  <button
                    onClick={() => {
                      setPendingFilters((p) => ({
                        ...p,
                        city: "Qualquer lugar",
                      }));
                      setActiveMobileTab("quando");
                    }}
                    className={`w-full flex items-center gap-3.5 p-3 rounded-2xl transition-colors text-left border ${
                      pendingFilters.city === "Qualquer lugar"
                        ? "border-[#BF4B24] bg-[#FAF7F4]/60"
                        : "border-transparent hover:bg-stone-50"
                    }`}
                  >
                    <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center shrink-0">
                      <Building2 className="w-5 h-5 text-stone-600" />
                    </div>
                    <span className="text-sm font-semibold text-stone-800">
                      Todas as unidades (Qualquer lugar)
                    </span>
                  </button>
                  {availableCities.map((city: string) => (
                    <button
                      key={city}
                      onClick={() => {
                        setPendingFilters((p) => ({ ...p, city }));
                        setActiveMobileTab("quando");
                      }}
                      className={`w-full flex items-center gap-3.5 p-3 rounded-2xl transition-colors text-left border ${
                        pendingFilters.city === city
                          ? "border-[#BF4B24] bg-[#FAF7F4]/60"
                          : "border-transparent hover:bg-stone-50"
                      }`}
                    >
                      <div className="w-10 h-10 bg-stone-100 rounded-full flex items-center justify-center shrink-0">
                        <MapPin className="w-5 h-5 text-stone-600" />
                      </div>
                      <span className="text-sm font-semibold text-stone-800">
                        {city}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div
                onClick={() => setActiveMobileTab("onde")}
                className="bg-white rounded-2xl px-5 py-4 flex justify-between border border-stone-200/80 items-center cursor-pointer active:scale-[0.99] transition-transform"
              >
                <span className="text-xs font-semibold text-stone-500">
                  Localização
                </span>
                <span className="text-xs font-bold text-stone-900">
                  {pendingFilters.city}
                </span>
              </div>
            )}

            {/* 2. QUANDO - MOBILE */}
            {activeMobileTab === "quando" ? (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-stone-200/80 animate-in fade-in duration-150 flex flex-col overflow-hidden max-h-[65vh]">
                <div className="pb-2 shrink-0 flex items-center justify-between">
                  <h2 className="text-lg font-bold text-stone-900">
                    Para quando você precisa?
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveMobileTab("como")}
                    className="text-xs font-bold text-[#BF4B24]"
                  >
                    Pular data ›
                  </button>
                </div>
                <div className="flex-1 overflow-y-auto pb-4 scrollbar-hide">
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
                    numberOfMonths={3}
                    disableNavigation
                    showOutsideDays={false}
                    className="p-0 w-full [&_.rdp-months]:flex-col [&_.rdp-month]:mb-8 [&_.rdp-nav]:hidden [&_.rdp-caption_label]:text-base [&_.rdp-caption_label]:font-bold [&_.rdp-caption_label]:capitalize [&_.rdp-head_cell]:text-stone-400 [&_.rdp-head_cell]:font-semibold [&_.rdp-head_cell]:text-[11px] [&_.rdp-head_cell]:uppercase [&_.rdp-table]:w-full"
                    modifiersClassNames={{
                      today: "font-bold bg-stone-100 text-stone-900",
                    }}
                  />
                </div>
              </div>
            ) : (
              <div
                onClick={() => setActiveMobileTab("quando")}
                className="bg-white rounded-2xl px-5 py-4 flex justify-between border border-stone-200/80 items-center cursor-pointer active:scale-[0.99] transition-transform"
              >
                <span className="text-xs font-semibold text-stone-500">
                  Data
                </span>
                <span className="text-xs font-bold text-stone-900">
                  {pendingFilters.date
                    ? format(pendingFilters.date, "dd 'de' MMM", {
                        locale: ptBR,
                      })
                    : "Qualquer data"}
                </span>
              </div>
            )}

            {/* 3. COMO - MOBILE */}
            {activeMobileTab === "como" ? (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-stone-200/80 animate-in fade-in duration-150">
                <h2 className="text-lg font-bold text-stone-900 mb-4">
                  Modalidade de locação
                </h2>
                <div className="flex bg-stone-100 p-1 rounded-xl mb-5">
                  <button
                    onClick={() =>
                      setPendingFilters((p) => ({ ...p, modality: "hora" }))
                    }
                    className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${
                      pendingFilters.modality === "hora"
                        ? "bg-white shadow-2xs text-[#BF4B24]"
                        : "text-stone-600"
                    }`}
                  >
                    Por Hora
                  </button>
                  <button
                    onClick={() =>
                      setPendingFilters((p) => ({ ...p, modality: "turno" }))
                    }
                    className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${
                      pendingFilters.modality === "turno"
                        ? "bg-white shadow-2xs text-[#BF4B24]"
                        : "text-stone-600"
                    }`}
                  >
                    Turno Fixo
                  </button>
                  <button
                    onClick={() =>
                      setPendingFilters((p) => ({ ...p, modality: "fixo" }))
                    }
                    className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${
                      pendingFilters.modality === "fixo"
                        ? "bg-white shadow-2xs text-[#BF4B24]"
                        : "text-stone-600"
                    }`}
                  >
                    Mensal
                  </button>
                </div>

                {pendingFilters.modality !== "fixo" ? (
                  <>
                    <h3 className="text-xs font-bold text-stone-700 mb-2.5">
                      Período de preferência (opcional)
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
                          className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                            pendingFilters.time === shift.id
                              ? "border-[#BF4B24] bg-[#FAF7F4]"
                              : "border-stone-200/80"
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
                            className={`w-4 h-4 ${
                              pendingFilters.time === shift.id
                                ? "text-[#BF4B24]"
                                : "text-stone-400"
                            }`}
                          />
                          <div>
                            <p className="text-xs font-bold text-stone-900">
                              {shift.label}
                            </p>
                            <p className="text-[11px] text-stone-500">
                              {shift.sub}
                            </p>
                          </div>
                        </label>
                      ))}
                    </div>
                  </>
                ) : (
                  <div className="bg-[#FAF7F4] p-4 rounded-xl border border-[#BF4B24]/25 mt-2">
                    <p className="text-xs font-bold text-stone-900">
                      Sala Exclusiva Mensal
                    </p>
                    <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                      Exclusividade sobre o consultório com opção de sublocar
                      horários vagos no modo Coanfitrião (recebendo 80%).
                    </p>
                  </div>
                )}
                <div className="mt-5 pt-3.5 border-t border-stone-100">
                  <Button
                    onClick={() => setActiveMobileTab("oque")}
                    className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl h-11 font-bold text-xs w-full"
                  >
                    Escolher especialidade
                  </Button>
                </div>
              </div>
            ) : (
              <div
                onClick={() => setActiveMobileTab("como")}
                className="bg-white rounded-2xl px-5 py-4 flex justify-between border border-stone-200/80 items-center cursor-pointer active:scale-[0.99] transition-transform"
              >
                <span className="text-xs font-semibold text-stone-500">
                  Modalidade
                </span>
                <span className="text-xs font-bold text-stone-900">
                  {pendingFilters.modality === "hora"
                    ? "Por Hora"
                    : pendingFilters.modality === "turno"
                      ? "Turno Fixo"
                      : "Mensal"}
                  {pendingFilters.modality !== "fixo" && pendingFilters.time
                    ? ` • ${
                        pendingFilters.time === "manha"
                          ? "Manhã"
                          : pendingFilters.time === "tarde"
                            ? "Tarde"
                            : "Noite"
                      }`
                    : ""}
                </span>
              </div>
            )}

            {/* 4. O QUÊ - MOBILE */}
            {activeMobileTab === "oque" ? (
              <div className="bg-white rounded-3xl p-5 shadow-sm border border-stone-200/80 animate-in fade-in duration-150 pb-6">
                <h2 className="text-lg font-bold text-stone-900 mb-4">
                  Qual a especialidade?
                </h2>
                <div className="grid grid-cols-1 gap-2.5">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const isSelected = pendingFilters.category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        onClick={() =>
                          setPendingFilters((p) => ({ ...p, category: cat.id }))
                        }
                        className={`p-3.5 rounded-2xl flex items-center gap-3.5 transition-all border text-left ${
                          isSelected
                            ? "border-[#BF4B24] bg-[#FAF7F4]"
                            : "border-stone-200/80 bg-white"
                        }`}
                      >
                        <div
                          className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border ${
                            isSelected
                              ? "bg-[#BF4B24] text-white border-transparent"
                              : "bg-stone-50 text-stone-600 border-stone-200/70"
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div>
                          <span className="block text-xs font-bold text-stone-900">
                            {cat.id}
                          </span>
                          <span className="block text-[11px] text-stone-500 mt-0.5 leading-tight">
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
                className="bg-white rounded-2xl px-5 py-4 flex justify-between border border-stone-200/80 items-center cursor-pointer active:scale-[0.99] transition-transform"
              >
                <span className="text-xs font-semibold text-stone-500">
                  Especialidade
                </span>
                <span className="text-xs font-bold text-stone-900">
                  {pendingFilters.category}
                </span>
              </div>
            )}

            <div className="h-24 w-full" />
          </div>

          <div className="fixed bottom-0 inset-x-0 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] bg-white border-t border-stone-200/80 z-50 flex items-center gap-3">
            <Button
              onClick={handleExecuteSearch}
              className="w-full h-12 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold text-sm rounded-xl shadow-sm"
            >
              <Search className="w-4 h-4 mr-2" />
              Mostrar consultórios disponíveis
            </Button>
          </div>
        </div>
      )}

      {/* HERO MOBILE */}
      <header className="relative overflow-hidden bg-[#B83B10] px-4 pt-3.5 pb-12 lg:bg-none lg:bg-transparent lg:shadow-none lg:pt-14 lg:pb-16 rounded-b-[28px] lg:rounded-none shadow-xs z-30 lg:pointer-events-none">
        <div className="lg:hidden absolute inset-y-0 right-0 w-[62%] z-0 pointer-events-none">
          <img
            src="/images/room-consultorio.jpg"
            alt="Consultório Fusion Clinic"
            className="w-full h-full object-cover object-[center_65%] opacity-55"
          />
          <div
            className="absolute inset-0"
            style={{
              background:
                "linear-gradient(90deg, #B83B10 0%, rgba(184,59,16,0.92) 32%, rgba(184,59,16,0.35) 100%)",
            }}
          />
        </div>

        <div className="lg:hidden relative z-10 mx-auto max-w-md">
          <div
            className={`flex items-center justify-between mb-3.5 ${
              !isPublic ? "pr-11" : ""
            }`}
          >
            <div className="inline-flex items-center bg-white/95 backdrop-blur-xs px-3 py-1.5 rounded-xl shadow-2xs border border-white/60">
              {!logoError ? (
                <img
                  src="/logo-fusion-orange.png"
                  alt="Fusion Clinic"
                  onError={() => setLogoError(true)}
                  className="h-5 w-auto object-contain"
                />
              ) : (
                <span className="text-sm font-black text-[#BF4B24] tracking-tight leading-none">
                  Fusion{" "}
                  <span className="font-semibold text-stone-600 text-[11px]">
                    clinic
                  </span>
                </span>
              )}
            </div>

            {!isPublic && (
              <button
                type="button"
                onClick={() => setIsWalletOpen(!isWalletOpen)}
                className="inline-flex items-center gap-1.5 bg-white/95 text-stone-900 px-3 py-1.5 rounded-xl text-[11px] font-bold shadow-2xs active:scale-95 transition-transform"
              >
                <Wallet className="w-3.5 h-3.5 text-[#BF4B24]" />
                <span>
                  {isWalletOpen
                    ? "Voltar à busca"
                    : `${profile.balance}h na Carteira`}
                </span>
              </button>
            )}
          </div>

          {!isPublic ? (
            <div className="space-y-1">
              <h1 className="text-[22px] font-extrabold text-white tracking-tight leading-[1.15]">
                Olá, Dr(a). {firstName}.{" "}
                <span className="font-serif italic font-normal text-orange-50 block">
                  Estrutura pronta para você.
                </span>
              </h1>
              <p className="text-xs text-orange-50/90 leading-relaxed max-w-[310px]">
                Reserve consultórios por hora, turno ou converse com o Concierge
                IA para descobrir o plano ideal.
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <h1 className="text-[23px] font-extrabold text-white tracking-tight leading-[1.15]">
                Consultórios prontos,{" "}
                <span className="font-serif italic font-normal text-orange-50 block">
                  esperando por você.
                </span>
              </h1>
              <p className="text-xs text-orange-50/90 leading-relaxed max-w-[310px]">
                Atenda seus pacientes por hora, turno ou pacote, sem custos
                fixos de manutenção.
              </p>
            </div>
          )}
        </div>
      </header>

      {/* TELA DE CARTEIRA (SALDO FUSION) */}
      {isWalletOpen ? (
        <div className="mx-auto w-full max-w-5xl px-4 -mt-6 relative z-20 animate-in fade-in slide-in-from-bottom-2 duration-300">
          <div className="bg-white rounded-3xl p-6 md:p-10 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-200/80 relative overflow-hidden mb-6">
            <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div>
                <p className="text-stone-500 font-bold uppercase tracking-wider text-xs mb-1.5 flex items-center gap-2">
                  <Wallet className="w-4 h-4 text-[#BF4B24]" /> Saldo Total
                  Disponível
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-5xl md:text-6xl font-black text-stone-900 tracking-tight">
                    {profile.balance}
                  </span>
                  <span className="text-lg font-semibold text-stone-400">
                    Horas
                  </span>
                </div>
                <p className="text-xs text-stone-500 mt-1.5 max-w-md leading-relaxed">
                  Créditos Premium liberam todas as salas. Créditos VIP liberam
                  salas VIP e Basic.
                </p>
              </div>

              <div className="bg-[#FAF7F4] border border-stone-200/80 rounded-2xl p-5 min-w-[240px]">
                <p className="text-[10px] font-bold text-stone-400 uppercase tracking-widest mb-3">
                  Composição do Saldo
                </p>
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                      <Shield className="w-3.5 h-3.5 text-stone-400" /> Basic
                    </span>
                    <span className="font-bold text-sm text-stone-900">
                      {walletBalances.start}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                      <Star className="w-3.5 h-3.5 text-[#BF4B24]" /> VIP
                    </span>
                    <span className="font-bold text-sm text-stone-900">
                      {walletBalances.vip}h
                    </span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-2 text-xs font-semibold text-stone-600">
                      <Crown className="w-3.5 h-3.5 text-amber-500" /> Premium
                    </span>
                    <span className="font-bold text-sm text-stone-900">
                      {walletBalances.master}h
                    </span>
                  </div>
                </div>
              </div>
            </div>

            <div className="relative z-10 mt-6 pt-5 border-t border-stone-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
              {activeSub ? (
                <>
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-xs font-bold flex items-center gap-1">
                        <RefreshCw className="w-3 h-3" /> Assinatura Mensal
                        Ativa
                      </Badge>
                      <span className="text-xs font-black text-stone-900 uppercase">
                        Plano{" "}
                        {activeSub.tier === "master"
                          ? "Premium"
                          : activeSub.tier === "vip"
                            ? "VIP"
                            : "Basic"}{" "}
                        ({activeSub.hours}h/mês)
                      </span>
                    </div>
                    <p className="text-xs text-stone-500 max-w-xl">
                      Suas horas renovam automaticamente. Você pode alterar ou
                      cancelar quando quiser sem multa.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={() =>
                        handleOpenPassWithTier(
                          activeSub.tier === "master"
                            ? "master"
                            : activeSub.tier === "vip"
                              ? "vip"
                              : "start",
                          activeSub.hours,
                        )
                      }
                      className="rounded-xl border-stone-200 text-stone-700 font-bold text-xs h-10 px-4"
                    >
                      Fazer Upgrade / +Horas
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      disabled={cancellingSub}
                      onClick={handleCancelSubscription}
                      className="rounded-xl border-red-200 text-red-600 hover:bg-red-50 font-bold text-xs h-10 px-4"
                    >
                      {cancellingSub ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 mr-2 animate-spin" />
                          Cancelando...
                        </>
                      ) : (
                        <>
                          <XCircle className="w-3.5 h-3.5 mr-1.5" />
                          Cancelar renovação
                        </>
                      )}
                    </Button>
                  </div>
                </>
              ) : (
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between w-full gap-3">
                  <div>
                    <p className="text-sm font-bold text-stone-900">
                      Quer economizar até 41% nas próximas reservas?
                    </p>
                    <p className="text-xs text-stone-500 mt-0.5">
                      Adicione um pacote de horas à sua carteira sem fidelidade.
                    </p>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleOpenPassWithTier("vip")}
                    className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold text-xs rounded-xl h-10 px-5 shrink-0"
                  >
                    Ver Planos Fusion Pass+
                  </Button>
                </div>
              )}
            </div>
          </div>

          <div className="bg-white rounded-3xl p-6 md:p-8 shadow-[0_8px_30px_rgb(0,0,0,0.04)] border border-stone-200/80 mb-10">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-5 border-b border-stone-100 pb-4 gap-3">
              <h3 className="text-base font-bold text-stone-900 flex items-center gap-2">
                <History className="w-4 h-4 text-[#BF4B24]" /> Extrato da
                Carteira
              </h3>

              {totalSavings > 0 && (
                <div className="bg-emerald-50 border border-emerald-200/70 px-3.5 py-2 rounded-xl flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs font-bold text-emerald-800">
                    Economia acumulada:
                  </span>
                  <span className="text-sm font-black text-emerald-700">
                    R${" "}
                    {totalSavings.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              )}
            </div>

            <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1 scrollbar-hide">
              {txHistory.length === 0 ? (
                <div className="text-center py-8">
                  <Wallet className="w-9 h-9 text-stone-200 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-stone-500">
                    Nenhuma movimentação encontrada.
                  </p>
                </div>
              ) : (
                txHistory.map((tx: any, idx: number) => {
                  const isCredit = Number(tx.amount) > 0;
                  const amt = Math.abs(Number(tx.amount));
                  const txDate = tx.created_at
                    ? format(new Date(tx.created_at), "dd/MM/yyyy 'às' HH:mm")
                    : "Data não disponível";

                  return (
                    <div
                      key={tx.id || idx}
                      className="flex items-start gap-3.5 p-3.5 rounded-2xl border border-stone-100 bg-[#FAF7F4]/60"
                    >
                      <div
                        className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                          isCredit
                            ? "bg-emerald-100 text-emerald-700"
                            : "bg-orange-100 text-[#BF4B24]"
                        }`}
                      >
                        {isCredit ? (
                          <ArrowDownToLine className="w-4 h-4" />
                        ) : (
                          <ArrowUpFromLine className="w-4 h-4" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-2 mb-0.5">
                          <p className="text-xs sm:text-sm font-bold text-stone-900 truncate">
                            {tx.description?.replace(/\[Asaas:.*?\]/g, "") ||
                              (isCredit
                                ? "Recarga de Créditos"
                                : "Uso de Créditos")}
                          </p>
                          <span
                            className={`text-xs sm:text-sm font-black whitespace-nowrap ${
                              isCredit ? "text-emerald-700" : "text-[#BF4B24]"
                            }`}
                          >
                            {isCredit ? "+" : "-"}
                            {amt}h
                          </span>
                        </div>

                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-stone-500">
                          <span>{txDate}</span>
                          <span className="font-semibold text-stone-700">
                            {normalizePassTier(tx.tier).toUpperCase()}
                          </span>
                          {isCredit && tx.expires_at && (
                            <span className="text-stone-400">
                              Válido até{" "}
                              {format(new Date(tx.expires_at), "dd/MM/yyyy")}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* BARRA DE BUSCA DESKTOP E CÁPSULA MOBILE */}
          <div className="mx-auto w-full max-w-[960px] px-4 -mt-6 lg:-mt-8 relative z-40 sticky top-3 lg:static animate-in fade-in duration-300">
            <div className="hidden md:flex bg-white rounded-full shadow-[0_18px_45px_rgba(28,25,23,0.12)] items-center border border-stone-200/90 p-2 relative">
              <Popover
                open={activeSearchTab === "onde"}
                onOpenChange={(o) => setActiveSearchTab(o ? "onde" : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`flex-1 px-5 py-2.5 rounded-full cursor-pointer transition-colors flex items-center gap-3 ${
                      activeSearchTab === "onde"
                        ? "bg-stone-50 shadow-2xs ring-1 ring-stone-200"
                        : "hover:bg-stone-50/80"
                    }`}
                  >
                    <MapPin className="w-5 h-5 text-stone-700 shrink-0 stroke-[1.8]" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-800">
                        Onde
                      </div>
                      <div
                        className={`text-sm truncate mt-0.5 ${
                          appliedFilters.city !== "Qualquer lugar"
                            ? "text-stone-900 font-semibold"
                            : "text-stone-500 font-normal"
                        }`}
                      >
                        {pendingFilters.city}
                      </div>
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-80 p-6 rounded-3xl mt-4 shadow-2xl border border-stone-100"
                  align="start"
                >
                  <h3 className="text-sm font-bold text-stone-900 mb-4">
                    Buscar por Região
                  </h3>
                  <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 scrollbar-hide">
                    <button
                      onClick={requestLocation}
                      className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-stone-50 transition-colors text-left group border border-transparent hover:border-stone-200/70"
                    >
                      <div className="w-11 h-11 bg-[#FAF7F4] rounded-full flex items-center justify-center shrink-0 border border-[#BF4B24]/20">
                        <Compass className="w-5 h-5 text-[#BF4B24]" />
                      </div>
                      <div>
                        <span className="block font-bold text-stone-900 text-sm">
                          Perto de mim
                        </span>
                        <span className="block text-xs text-stone-500">
                          Usar GPS do dispositivo
                        </span>
                      </div>
                    </button>
                    <div className="w-full h-px bg-stone-100 my-2"></div>
                    {availableCities.map((city: string) => (
                      <button
                        key={city}
                        onClick={() => {
                          setPendingFilters((p) => ({ ...p, city }));
                          setActiveSearchTab("quando");
                        }}
                        className="w-full flex items-center gap-4 p-3 rounded-2xl hover:bg-stone-50 transition-colors text-left border border-transparent hover:border-stone-200/70"
                      >
                        <div className="w-11 h-11 bg-stone-100 rounded-full flex items-center justify-center shrink-0">
                          <MapPin className="w-5 h-5 text-stone-600" />
                        </div>
                        <span className="font-semibold text-stone-800 text-sm">
                          {city}
                        </span>
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
                      className="w-full mt-2 text-center text-xs font-semibold text-stone-400 hover:text-stone-700 underline"
                    >
                      Limpar localização
                    </button>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="w-px h-9 bg-stone-200/80 mx-1"></div>

              <Popover
                open={activeSearchTab === "quando"}
                onOpenChange={(o) => setActiveSearchTab(o ? "quando" : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`flex-1 px-5 py-2.5 rounded-full cursor-pointer transition-colors flex items-center gap-3 ${
                      activeSearchTab === "quando"
                        ? "bg-stone-50 shadow-2xs ring-1 ring-stone-200"
                        : "hover:bg-stone-50/80"
                    }`}
                  >
                    <CalendarIcon className="w-5 h-5 text-stone-700 shrink-0 stroke-[1.8]" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-800">
                        Quando
                      </div>
                      <div
                        className={`text-sm truncate mt-0.5 ${
                          pendingFilters.date
                            ? "text-stone-900 font-semibold"
                            : "text-stone-500 font-normal"
                        }`}
                      >
                        {pendingFilters.date
                          ? format(pendingFilters.date, "dd MMM", {
                              locale: ptBR,
                            }) +
                            (pendingFilters.time &&
                            pendingFilters.modality !== "fixo"
                              ? ` • ${
                                  pendingFilters.time === "manha"
                                    ? "Manhã"
                                    : pendingFilters.time === "tarde"
                                      ? "Tarde"
                                      : "Noite"
                                }`
                              : "")
                          : "Insira as datas"}
                      </div>
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-auto p-6 rounded-3xl mt-4 shadow-2xl border border-stone-100 overflow-y-auto max-h-[85vh]"
                  align="center"
                >
                  <div className="flex flex-col md:flex-row gap-6">
                    <div>
                      <h3 className="text-sm font-bold text-stone-900 mb-2">
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
                          today: "font-normal bg-transparent text-stone-900",
                        }}
                        className="p-0"
                      />
                    </div>

                    <div className="w-px bg-stone-100 hidden md:block"></div>

                    <div className="w-64 flex flex-col pb-4">
                      <h3 className="text-sm font-bold text-stone-900 mb-3">
                        Como deseja alugar?
                      </h3>
                      <div className="flex bg-stone-100 p-1 rounded-xl mb-6">
                        <button
                          onClick={() =>
                            setPendingFilters((p) => ({
                              ...p,
                              modality: "hora",
                            }))
                          }
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${
                            pendingFilters.modality === "hora"
                              ? "bg-white shadow-2xs text-stone-900"
                              : "text-stone-500"
                          }`}
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
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${
                            pendingFilters.modality === "turno"
                              ? "bg-white shadow-2xs text-stone-900"
                              : "text-stone-500"
                          }`}
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
                          className={`flex-1 text-[11px] font-bold py-1.5 rounded-lg transition-all ${
                            pendingFilters.modality === "fixo"
                              ? "bg-white shadow-2xs text-stone-900"
                              : "text-stone-500"
                          }`}
                        >
                          Mensal
                        </button>
                      </div>

                      {pendingFilters.modality !== "fixo" ? (
                        <>
                          <h3 className="text-sm font-bold text-stone-900 mb-3">
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
                                className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                                  pendingFilters.time === shift.id
                                    ? "border-[#BF4B24] bg-[#FAF7F4]"
                                    : "border-stone-200/80 hover:border-stone-300"
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
                                  className={`w-4 h-4 ${
                                    pendingFilters.time === shift.id
                                      ? "text-[#BF4B24]"
                                      : "text-stone-400"
                                  }`}
                                />
                                <div>
                                  <p
                                    className={`text-xs font-bold ${
                                      pendingFilters.time === shift.id
                                        ? "text-stone-900"
                                        : "text-stone-700"
                                    }`}
                                  >
                                    {shift.label}
                                  </p>
                                  <p className="text-[10px] text-stone-500">
                                    {shift.sub}
                                  </p>
                                </div>
                              </label>
                            ))}
                          </div>
                        </>
                      ) : (
                        <div className="bg-[#FAF7F4] p-4 rounded-xl border border-[#BF4B24]/25 mt-2">
                          <p className="text-xs font-bold text-stone-900">
                            Locação Mensal Exclusiva
                          </p>
                          <p className="text-xs text-stone-600 mt-1 leading-relaxed">
                            Você terá exclusividade sobre o consultório, podendo
                            inclusive sublocar horários livres no modo
                            Coanfitrião (recebendo 80%).
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="mt-4 pt-4 border-t border-stone-100 flex justify-end">
                    <Button
                      onClick={() => setActiveSearchTab("oque")}
                      className="bg-stone-900 hover:bg-stone-800 text-white rounded-xl h-10 px-6 font-bold text-xs"
                    >
                      Próximo
                    </Button>
                  </div>
                </PopoverContent>
              </Popover>

              <div className="w-px h-9 bg-stone-200/80 mx-1"></div>

              <Popover
                open={activeSearchTab === "oque"}
                onOpenChange={(o) => setActiveSearchTab(o ? "oque" : null)}
              >
                <PopoverTrigger asChild>
                  <div
                    className={`flex-1 px-5 py-2.5 rounded-full cursor-pointer transition-colors flex items-center gap-3 ${
                      activeSearchTab === "oque"
                        ? "bg-stone-50 shadow-2xs ring-1 ring-stone-200"
                        : "hover:bg-stone-50/80"
                    }`}
                  >
                    <Stethoscope className="w-5 h-5 text-stone-700 shrink-0 stroke-[1.8]" />
                    <div className="min-w-0">
                      <div className="text-[10px] font-bold uppercase tracking-wider text-stone-800">
                        O Quê?
                      </div>
                      <div
                        className={`text-sm truncate mt-0.5 ${
                          pendingFilters.category !== "Todas as Salas"
                            ? "text-stone-900 font-semibold"
                            : "text-stone-500 font-normal"
                        }`}
                      >
                        {pendingFilters.category}
                      </div>
                    </div>
                  </div>
                </PopoverTrigger>
                <PopoverContent
                  className="w-[460px] p-6 rounded-3xl mt-4 shadow-2xl border border-stone-100"
                  align="end"
                >
                  <h3 className="text-sm font-bold text-stone-900 mb-4">
                    Especialidade do Consultório
                  </h3>
                  <div className="grid grid-cols-2 gap-2.5">
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
                          className={`p-3.5 rounded-2xl flex flex-col items-start gap-2 transition-all border text-left cursor-pointer ${
                            isSelected
                              ? "border-[#BF4B24] bg-[#FAF7F4]"
                              : "border-stone-200/80 bg-white hover:border-stone-300"
                          }`}
                        >
                          <Icon
                            className={`w-5 h-5 ${
                              isSelected ? "text-[#BF4B24]" : "text-stone-500"
                            }`}
                          />
                          <div>
                            <span
                              className={`block text-xs font-bold ${
                                isSelected ? "text-stone-900" : "text-stone-800"
                              }`}
                            >
                              {cat.id}
                            </span>
                            <span className="block text-[10px] text-stone-500 mt-0.5 leading-tight">
                              {cat.desc}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </PopoverContent>
              </Popover>

              <div className="pr-1.5 pl-2 flex gap-2 items-center">
                {(hasSearched || aiExchanges.length > 0) && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleClearFilters();
                    }}
                    className="text-xs font-semibold text-stone-500 hover:text-stone-800 underline mx-1.5 cursor-pointer"
                  >
                    Limpar
                  </button>
                )}

                {canUseAIConcierge && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAISearchExpanded(true);
                      setTimeout(() => aiInputRef.current?.focus(), 80);
                    }}
                    title="Abrir página do Concierge IA"
                    className={`h-12 px-4 rounded-full border flex items-center gap-2 text-xs font-bold transition-all cursor-pointer ${
                      aiExchanges.length > 0
                        ? "bg-stone-950 text-[#FBBF24] border-stone-950 shadow-md"
                        : "bg-gradient-to-r from-[#FAF7F4] to-orange-50/70 hover:from-orange-50 hover:to-orange-100/60 text-stone-900 border-[#BF4B24]/35 shadow-2xs"
                    }`}
                  >
                    <span className="relative flex h-2 w-2">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#BF4B24] opacity-75" />
                      <span className="relative inline-flex rounded-full h-2 w-2 bg-[#BF4B24]" />
                    </span>
                    <Sparkles className="w-3.5 h-3.5 text-[#BF4B24]" />
                    <span>Concierge IA</span>
                  </button>
                )}

                <button
                  onClick={handleExecuteSearch}
                  aria-label="Buscar consultórios"
                  className="w-13 h-13 rounded-full bg-gradient-to-r from-[#C24116] to-[#DE5D2E] hover:from-[#A83812] hover:to-[#C84B20] text-white flex items-center justify-center shrink-0 transition-transform active:scale-95 shadow-md shadow-[#BF4B24]/25 cursor-pointer"
                >
                  <Search className="w-5 h-5 stroke-[2.2]" />
                </button>
              </div>
            </div>

            {/* CÁPSULA MOBILE */}
            <div className="md:hidden w-full bg-white rounded-full shadow-[0_12px_32px_rgba(28,25,23,0.12)] flex items-center justify-between p-2 pl-3.5 border border-stone-200/90">
              <div
                onClick={() => {
                  setIsMobileSearchOpen(true);
                  setActiveMobileTab("onde");
                }}
                className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="w-9 h-9 bg-[#BF4B24] text-white rounded-full flex items-center justify-center shrink-0 shadow-2xs">
                  <Search className="w-4 h-4 stroke-[2.5]" />
                </div>
                <div className="flex flex-col min-w-0 flex-1">
                  <span className="text-xs font-bold text-stone-900 truncate">
                    {appliedFilters.city === "Qualquer lugar"
                      ? "Onde e quando atender?"
                      : appliedFilters.city}
                  </span>
                  <span className="text-[11px] text-stone-500 truncate">
                    {appliedFilters.date
                      ? format(appliedFilters.date, "dd MMM", { locale: ptBR })
                      : "Qualquer data"}{" "}
                    •{" "}
                    {appliedFilters.modality === "hora"
                      ? "Por hora"
                      : appliedFilters.modality === "turno"
                        ? "Turno fixo"
                        : "Mensal"}{" "}
                    •{" "}
                    {appliedFilters.category === "Todas as Salas"
                      ? "Todas as áreas"
                      : appliedFilters.category}
                  </span>
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0 ml-2">
                {canUseAIConcierge && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAISearchExpanded(true);
                      setTimeout(() => aiInputRef.current?.focus(), 80);
                    }}
                    aria-label="Abrir Concierge IA"
                    className={`h-9 px-3 rounded-full border flex items-center gap-1.5 text-[11px] font-bold transition-all ${
                      aiExchanges.length > 0
                        ? "bg-stone-950 text-[#FBBF24] border-stone-950 shadow-2xs"
                        : "bg-[#FAF7F4] border-[#BF4B24]/35 text-[#BF4B24]"
                    }`}
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>IA</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsMobileSearchOpen(true);
                    setActiveMobileTab("onde");
                  }}
                  aria-label="Filtros"
                  className="w-9 h-9 rounded-full border border-stone-200 bg-stone-50 flex items-center justify-center text-stone-700"
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* FAIXA DE ESPECIALIDADES NO POLEGAR (MOBILE) */}
          <div className="lg:hidden px-4 mt-3.5">
            <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide py-1">
              {CATEGORIES.map((cat) => {
                const Icon = cat.icon;
                const active = appliedFilters.category === cat.id;
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => handleQuickCategorySelect(cat.id)}
                    className={`px-3.5 py-2 rounded-full text-xs font-semibold flex items-center gap-1.5 shrink-0 border transition-all ${
                      active
                        ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                        : "bg-white text-stone-600 border-stone-200/90"
                    }`}
                  >
                    <Icon
                      className={`w-3.5 h-3.5 ${
                        active ? "text-[#FBBF24]" : "text-[#BF4B24]"
                      }`}
                    />
                    <span>{cat.shortLabel}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* CARD COMPACTO FUSION PASS+ MOBILE */}
          <div className="lg:hidden mx-auto w-full px-4 mt-3 relative z-30">
            {hasActiveWalletCredits ? (
              <div
                onClick={() => setIsWalletOpen(true)}
                className="flex items-center justify-between bg-white px-4 py-3 rounded-2xl border border-[#BF4B24]/30 shadow-2xs cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-xl bg-[#FAF7F4] border border-[#BF4B24]/20 flex items-center justify-center shrink-0 text-[#BF4B24]">
                    <Crown className="w-4 h-4 fill-[#BF4B24]" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#BF4B24]">
                        Assinante Pass+
                      </span>
                      <span className="text-[10px] font-bold bg-emerald-50 text-emerald-700 px-1.5 py-0.5 rounded">
                        {profile.balance}h ativas
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-stone-700 truncate mt-0.5">
                      Toque para ver seu extrato ou fazer upgrade
                    </p>
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-stone-400 shrink-0" />
              </div>
            ) : (
              <div
                onClick={() =>
                  handleOpenPassWithTier(
                    activeTier === "all" ? "vip" : activeTier,
                  )
                }
                className="flex items-center justify-between bg-white px-3.5 py-3 rounded-2xl border border-[#BF4B24]/30 shadow-2xs cursor-pointer active:scale-[0.99] transition-transform"
              >
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <div className="bg-[#FAF7F4] border border-[#BF4B24]/25 text-[#BF4B24] rounded-xl px-2.5 py-1.5 text-center shrink-0">
                    <span className="text-[9px] font-extrabold uppercase block leading-none">
                      ATÉ
                    </span>
                    <span className="text-sm font-black leading-none block mt-0.5">
                      -41%
                    </span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1 text-xs font-bold text-stone-900 whitespace-nowrap truncate">
                      <span>Fusion Pass+</span>
                      <span className="text-stone-300">•</span>
                      <span className="text-[#BF4B24]">
                        Hora a partir de R$ 26
                      </span>
                    </div>
                    <p className="text-[11px] text-stone-500 truncate mt-0.5">
                      Sem fidelidade • Use em 30 dias, doe ou negocie
                    </p>
                  </div>
                </div>
                <span className="text-xs font-bold text-[#BF4B24] flex items-center shrink-0 ml-2">
                  <span>Simular</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </span>
              </div>
            )}
          </div>

          {/* ATALHO PARA REABRIR A CONVERSA SALVA DO CONCIERGE IA */}
          {canUseAIConcierge &&
            !isAISearchExpanded &&
            aiExchanges.length > 0 && (
              <div className="px-4 lg:px-10 mx-auto max-w-5xl lg:max-w-[1360px] w-full mt-3.5">
                <div
                  onClick={() => setIsAISearchExpanded(true)}
                  className="p-3.5 sm:px-5 rounded-2xl bg-stone-950 text-white border border-stone-800 shadow-sm flex items-center justify-between gap-3 cursor-pointer active:scale-[0.99] transition-transform"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-[#BF4B24] text-white flex items-center justify-center shrink-0">
                      <Sparkles className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#FBBF24] block">
                        Conversa aberta no Concierge IA • Toque para retomar
                      </span>
                      <p className="text-xs font-medium text-stone-200 truncate">
                        {aiExchanges[aiExchanges.length - 1].headline.replace(
                          /\*\*/g,
                          "",
                        )}
                      </p>
                    </div>
                  </div>
                  <span className="text-xs font-bold text-[#FBBF24] shrink-0 flex items-center gap-1">
                    <span>Abrir chat</span>
                    <ChevronRight className="w-4 h-4" />
                  </span>
                </div>
              </div>
            )}

          {/* BARRA DE CURADORIA E FILTROS DO MOSTRUÁRIO */}
          <div className="px-4 lg:px-10 mx-auto max-w-5xl lg:max-w-[1360px] w-full mt-4 lg:mt-8">
            <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-4 pb-4 lg:pb-5 border-b border-stone-200/80">
              <div>
                <p className="text-[10px] lg:text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2">
                  Padrão do Consultório
                </p>
                <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pb-0.5">
                  <button
                    onClick={() => setActiveTier("all")}
                    className={`px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all shrink-0 border cursor-pointer ${
                      activeTier === "all"
                        ? "bg-stone-900 text-white border-stone-900 shadow-2xs"
                        : "bg-white text-stone-600 border-stone-200/90 hover:border-stone-300 hover:text-stone-900"
                    }`}
                  >
                    Todos ({searchResults.rooms.length})
                  </button>
                  <button
                    onClick={() => setActiveTier("master")}
                    className={`px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 shrink-0 border cursor-pointer ${
                      activeTier === "master"
                        ? "bg-stone-900 text-amber-300 border-stone-900 shadow-2xs"
                        : "bg-white text-stone-600 border-stone-200/90 hover:border-stone-300 hover:text-stone-900"
                    }`}
                  >
                    <Crown className="w-3.5 h-3.5 text-amber-500" />
                    <span>Premium</span>
                  </button>
                  <button
                    onClick={() => setActiveTier("vip")}
                    className={`px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 shrink-0 border cursor-pointer ${
                      activeTier === "vip"
                        ? "bg-[#BF4B24] text-white border-[#BF4B24] shadow-2xs"
                        : "bg-white text-stone-600 border-stone-200/90 hover:border-stone-300 hover:text-stone-900"
                    }`}
                  >
                    <Star className="w-3.5 h-3.5" />
                    <span>VIP</span>
                  </button>
                  <button
                    onClick={() => setActiveTier("start")}
                    className={`px-3.5 lg:px-4 py-1.5 lg:py-2 rounded-full text-xs sm:text-sm font-semibold transition-all flex items-center gap-1.5 shrink-0 border cursor-pointer ${
                      activeTier === "start"
                        ? "bg-stone-800 text-white border-stone-800 shadow-2xs"
                        : "bg-white text-stone-600 border-stone-200/90 hover:border-stone-300 hover:text-stone-900"
                    }`}
                  >
                    <Shield className="w-3.5 h-3.5" />
                    <span>Basic</span>
                  </button>
                </div>
              </div>

              <div className="hidden lg:block">
                <p className="text-[11px] font-bold text-stone-400 uppercase tracking-wider mb-2.5 text-right">
                  Filtrar por Especialidade
                </p>
                <div className="flex items-center gap-1.5 bg-white p-1 rounded-full border border-stone-200/80 shadow-2xs">
                  {CATEGORIES.map((cat) => {
                    const Icon = cat.icon;
                    const active = appliedFilters.category === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => handleQuickCategorySelect(cat.id)}
                        className={`px-3.5 py-1.5 rounded-full text-xs font-semibold flex items-center gap-1.5 transition-all cursor-pointer ${
                          active
                            ? "bg-[#FAF7F4] text-[#BF4B24] border border-[#BF4B24]/30 shadow-2xs"
                            : "text-stone-600 hover:text-stone-900 hover:bg-stone-50"
                        }`}
                      >
                        <Icon className="w-3.5 h-3.5" />
                        <span>{cat.shortLabel}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>

          {searchResults.isFallback && aiExchanges.length === 0 && (
            <div className="px-4 lg:px-10 max-w-5xl lg:max-w-[1360px] mx-auto w-full mt-5">
              <div className="p-4 sm:p-5 bg-white border border-[#BF4B24]/25 rounded-2xl flex items-start gap-3.5 animate-in fade-in shadow-2xs">
                <div className="p-2 bg-[#FAF7F4] rounded-xl shrink-0">
                  <Compass className="w-5 h-5 text-[#BF4B24]" />
                </div>
                <div>
                  <h4 className="font-bold text-stone-900 text-sm">
                    Sugestões próximas na Fusion Clinic
                  </h4>
                  <p className="text-xs text-stone-600 mt-0.5 leading-relaxed">
                    {searchResults.fallbackMessage}
                  </p>
                </div>
              </div>
            </div>
          )}

          {searchResults.rooms.length === 0 ? (
            <div className="px-4 lg:px-10 max-w-5xl lg:max-w-[1360px] mx-auto w-full mt-8">
              <div className="text-center py-14 bg-white rounded-3xl border border-stone-200/80 shadow-2xs flex flex-col items-center px-4">
                <Search className="w-9 h-9 text-stone-300 mb-3" />
                <h3 className="text-base font-bold text-stone-900 mb-1">
                  Nenhum consultório encontrado com estes filtros
                </h3>
                <p className="text-stone-500 text-xs max-w-sm">
                  Experimente visualizar todas as especialidades ou limpar o
                  filtro de região.
                </p>
                <Button
                  variant="outline"
                  onClick={handleClearFilters}
                  className="mt-5 font-semibold rounded-xl px-5 text-xs border-stone-200"
                >
                  Mostrar todos os consultórios
                </Button>
              </div>
            </div>
          ) : (
            <div className="px-0 md:px-4 lg:px-10 max-w-5xl lg:max-w-[1360px] mx-auto w-full space-y-9 lg:space-y-12 pb-12 mt-6 lg:mt-8">
              {/* SEÇÃO 1: SALAS PREMIUM */}
              {(activeTier === "all" || activeTier === "master") &&
                masterRooms.length > 0 && (
                  <section>
                    <div className="flex items-end justify-between gap-2 mb-3.5 lg:mb-5 px-4 sm:px-0">
                      <div className="flex items-start gap-2.5 lg:gap-3">
                        <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-2xl bg-stone-900 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 shadow-2xs">
                          <Crown className="w-4 h-4 lg:w-5 lg:h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg lg:text-2xl font-bold text-stone-900 tracking-tight">
                              Consultórios Premium
                            </h2>
                            <span className="text-[10px] lg:text-[11px] font-semibold text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded-full">
                              {masterRooms.length}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                            Arquitetura executiva e máximo conforto acústico.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenPassWithTier("master")}
                        className="inline-flex items-center gap-0.5 text-[11px] lg:text-xs font-bold text-[#BF4B24] hover:underline cursor-pointer shrink-0"
                      >
                        <span className="hidden sm:inline">
                          Ver pacote Pass+ Premium
                        </span>
                        <span className="sm:hidden">Pass+ Premium</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {activeTier === "master" &&
                      appliedFilters.modality === "hora" &&
                      renderTargetedPassBanner()}

                    <div
                      className={
                        masterRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 px-4 sm:px-0"
                          : "flex overflow-x-auto gap-3.5 pb-3 snap-x snap-mandatory scrollbar-hide px-4 sm:px-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:pb-0"
                      }
                    >
                      {masterRooms.map((room: Room) => (
                        <RoomCard
                          key={room.id}
                          room={{
                            ...room,
                            selectedModality: appliedFilters.modality,
                            preselectedDate: aiTargetDateISO || undefined,
                          }}
                          aiMatch={aiMatchesMap[room.id]}
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

              {/* SEÇÃO 2: SALAS VIP */}
              {(activeTier === "all" || activeTier === "vip") &&
                vipRooms.length > 0 && (
                  <section>
                    <div className="flex items-end justify-between gap-2 mb-3.5 lg:mb-5 px-4 sm:px-0">
                      <div className="flex items-start gap-2.5 lg:gap-3">
                        <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-2xl bg-[#FAF7F4] border border-[#BF4B24]/25 text-[#BF4B24] flex items-center justify-center shrink-0 mt-0.5">
                          <Star className="w-4 h-4 lg:w-5 lg:h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg lg:text-2xl font-bold text-stone-900 tracking-tight">
                              Consultórios VIP
                            </h2>
                            <span className="text-[10px] lg:text-[11px] font-semibold text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded-full">
                              {vipRooms.length}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                            Ambientes clínicos completos com design acolhedor.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenPassWithTier("vip")}
                        className="inline-flex items-center gap-0.5 text-[11px] lg:text-xs font-bold text-[#BF4B24] hover:underline cursor-pointer shrink-0"
                      >
                        <span className="hidden sm:inline">
                          Ver pacote Pass+ VIP
                        </span>
                        <span className="sm:hidden">Pass+ VIP</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {activeTier === "vip" &&
                      appliedFilters.modality === "hora" &&
                      renderTargetedPassBanner()}

                    <div
                      className={
                        vipRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 px-4 sm:px-0"
                          : "flex overflow-x-auto gap-3.5 pb-3 snap-x snap-mandatory scrollbar-hide px-4 sm:px-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:pb-0"
                      }
                    >
                      {vipRooms.map((room: Room) => (
                        <RoomCard
                          key={room.id}
                          room={{
                            ...room,
                            selectedModality: appliedFilters.modality,
                            preselectedDate: aiTargetDateISO || undefined,
                          }}
                          aiMatch={aiMatchesMap[room.id]}
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

              {/* SEÇÃO 3: SALAS BASIC */}
              {(activeTier === "all" || activeTier === "start") &&
                startRooms.length > 0 && (
                  <section>
                    <div className="flex items-end justify-between gap-2 mb-3.5 lg:mb-5 px-4 sm:px-0">
                      <div className="flex items-start gap-2.5 lg:gap-3">
                        <div className="w-9 h-9 lg:w-10 lg:h-10 rounded-2xl bg-white border border-stone-200 text-stone-700 flex items-center justify-center shrink-0 mt-0.5">
                          <Shield className="w-4 h-4 lg:w-5 lg:h-5" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-lg lg:text-2xl font-bold text-stone-900 tracking-tight">
                              Consultórios Basic
                            </h2>
                            <span className="text-[10px] lg:text-[11px] font-semibold text-stone-500 bg-stone-200/70 px-2 py-0.5 rounded-full">
                              {startRooms.length}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-stone-500 mt-0.5">
                            Praticidade e o melhor custo-benefício por consulta.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleOpenPassWithTier("start")}
                        className="inline-flex items-center gap-0.5 text-[11px] lg:text-xs font-bold text-[#BF4B24] hover:underline cursor-pointer shrink-0"
                      >
                        <span className="hidden sm:inline">
                          Ver pacote Pass+ Basic
                        </span>
                        <span className="sm:hidden">Pass+ Basic</span>
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {activeTier === "start" &&
                      appliedFilters.modality === "hora" &&
                      renderTargetedPassBanner()}

                    <div
                      className={
                        startRooms.length === 1
                          ? "grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6 px-4 sm:px-0"
                          : "flex overflow-x-auto gap-3.5 pb-3 snap-x snap-mandatory scrollbar-hide px-4 sm:px-0 lg:grid lg:grid-cols-3 lg:gap-6 lg:overflow-visible lg:pb-0"
                      }
                    >
                      {startRooms.map((room: Room) => (
                        <RoomCard
                          key={room.id}
                          room={{
                            ...room,
                            selectedModality: appliedFilters.modality,
                            preselectedDate: aiTargetDateISO || undefined,
                          }}
                          aiMatch={aiMatchesMap[room.id]}
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
    </div>
  );
}

function RoomCard({
  room,
  aiMatch,
  isFavorited,
  onToggleFavorite,
  onOpen,
  horizontal = false,
  usingLocation = false,
  bestHourlyRate,
}: {
  room: Room;
  aiMatch?: RoomAvailabilityMatch;
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

  const isHourly = room.selectedModality === "hora";
  const fallbackPassRate = bestHourlyRate || (isMaster ? 50 : isVip ? 34 : 26);
  const showPassComparison =
    isHourly && room.filterPrice > 0 && room.filterPrice > fallbackPassRate;

  const neighborhood = room.rawAddress?.neighborhood || "Região Central";
  const city = room.rawAddress?.city || "Unidade Verificada";

  return (
    <div
      onClick={() => onOpen && onOpen(room)}
      className={`group cursor-pointer flex flex-col bg-white border rounded-[22px] overflow-hidden shadow-[0_4px_20px_rgba(28,25,23,0.04)] hover:shadow-[0_14px_35px_rgba(28,25,23,0.10)] hover:-translate-y-1 transition-all duration-300 ${
        aiMatch?.exactSlotAvailable && aiMatch?.requestedSlotLabel
          ? "border-emerald-500/60 ring-1 ring-emerald-500/20"
          : "border-stone-200/85 hover:border-stone-300"
      } ${
        horizontal
          ? "w-[285px] sm:w-[325px] lg:w-full shrink-0 snap-start"
          : "w-full"
      }`}
    >
      <div
        className={`relative w-full bg-stone-100 overflow-hidden ${
          horizontal
            ? "h-44 sm:h-48 lg:h-auto lg:aspect-[16/10]"
            : "aspect-[16/10]"
        }`}
      >
        <Image
          src={room.image}
          alt={room.name}
          fill
          sizes="(max-width: 768px) 100vw, 420px"
          className="object-cover group-hover:scale-105 transition-transform duration-500"
          onError={(e: any) => {
            e.target.src = "/placeholder.jpg";
          }}
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-black/15 pointer-events-none" />

        <div className="absolute top-3 left-3 flex items-center gap-1.5 z-10">
          {room.isPartner && (
            <span className="bg-white/95 backdrop-blur-xs px-2.5 py-1 rounded-full text-[10px] font-bold text-stone-800 flex items-center gap-1 shadow-2xs">
              <BadgeCheck className="w-3.5 h-3.5 text-[#BF4B24]" />
              Verificado
            </span>
          )}
          <span
            className={`px-2.5 py-1 rounded-full text-[10px] font-bold flex items-center gap-1 shadow-2xs ${
              isMaster
                ? "bg-stone-950/90 text-amber-300 backdrop-blur-xs"
                : isVip
                  ? "bg-[#BF4B24] text-white"
                  : "bg-white/95 text-stone-700"
            }`}
          >
            {isMaster ? (
              <>
                <Crown className="w-3 h-3" /> Premium
              </>
            ) : isVip ? (
              <>
                <Star className="w-3 h-3" /> VIP
              </>
            ) : (
              <>
                <Shield className="w-3 h-3" /> Basic
              </>
            )}
          </span>
        </div>

        <button
          onClick={(e) => onToggleFavorite(e, room.id)}
          aria-label="Salvar nos favoritos"
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/85 hover:bg-white backdrop-blur-xs flex items-center justify-center transition-transform active:scale-90 z-10 shadow-2xs"
        >
          <Heart
            className={`h-4 w-4 transition-colors ${
              isFavorited
                ? "fill-red-500 text-red-500"
                : "text-stone-700 hover:text-stone-950"
            }`}
          />
        </button>

        <div className="absolute bottom-2.5 left-3 right-3 flex items-center justify-between z-10">
          <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-white bg-black/45 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-white/15">
            <Stethoscope className="w-3 h-3 text-orange-200" />
            {room.specialty || room.category || "Consultório Clínico"}
          </span>

          {usingLocation && room.distanceKm && (
            <span className="text-[10px] font-bold text-white bg-emerald-600/90 backdrop-blur-xs px-2 py-1 rounded-lg flex items-center gap-1">
              <Navigation className="w-2.5 h-2.5" />
              {room.distanceKm.toFixed(1)} km
            </span>
          )}
        </div>
      </div>

      <div className="flex flex-col p-4 sm:p-5 flex-1 bg-white">
        <div className="flex items-center justify-between gap-2 text-xs text-stone-500 mb-1">
          <span className="flex items-center gap-1 font-medium truncate">
            <MapPin className="w-3.5 h-3.5 text-[#BF4B24] shrink-0" />
            <span className="truncate">
              {neighborhood}, {city}
            </span>
          </span>

          {room.reviews_count > 0 ? (
            <span className="flex items-center gap-1 font-bold text-stone-800 shrink-0">
              <Star className="w-3.5 h-3.5 fill-amber-400 text-amber-400" />
              {Number(room.rating).toFixed(1)}
              <span className="text-stone-400 font-normal">
                ({room.reviews_count})
              </span>
            </span>
          ) : (
            <span className="text-[11px] font-semibold text-[#BF4B24] bg-[#FAF7F4] px-2 py-0.5 rounded-md shrink-0">
              Novo
            </span>
          )}
        </div>

        <h3 className="font-bold text-base sm:text-[17px] text-stone-900 leading-snug line-clamp-1 group-hover:text-[#BF4B24] transition-colors">
          {room.name}
        </h3>

        {aiMatch && aiMatch.availableSlots.length > 0 ? (
          <div className="mt-2 mb-1 p-2.5 rounded-xl bg-[#FAF7F4] border border-stone-200/80">
            <div className="flex items-center justify-between gap-1 mb-1.5">
              <span
                className={`text-[10px] font-bold flex items-center gap-1 ${
                  aiMatch.exactSlotAvailable
                    ? "text-emerald-700"
                    : "text-[#BF4B24]"
                }`}
              >
                <Clock className="w-3 h-3" />
                {aiMatch.matchReason}
              </span>
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              {aiMatch.availableSlots.map((slot) => {
                const isRequested = slot === aiMatch.requestedSlotLabel;
                return (
                  <button
                    key={slot}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      if (onOpen) {
                        onOpen({
                          ...room,
                          preselectedSlot: slot,
                        });
                      }
                    }}
                    className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-colors cursor-pointer ${
                      isRequested
                        ? "bg-emerald-600 text-white shadow-2xs"
                        : "bg-white hover:bg-[#BF4B24] text-stone-800 hover:text-white border border-stone-200"
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          </div>
        ) : (
          <p className="text-[11px] text-stone-400 font-medium mt-1 truncate">
            {room.description
              ? room.description
              : "Check-in digital • Recepção e Wi-Fi inclusos"}
          </p>
        )}

        <div className="mt-auto pt-3.5 border-t border-stone-100 flex items-end justify-between gap-2">
          <div>
            <div className="flex items-baseline gap-1.5">
              <span className="text-base sm:text-lg font-extrabold text-stone-900 tracking-tight">
                {room.priceLabel}
              </span>
              {isHourly && (
                <span className="text-[11px] text-stone-400 font-medium">
                  avulso
                </span>
              )}
            </div>

            {showPassComparison ? (
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700 bg-emerald-50/90 px-2 py-0.5 rounded-md mt-1">
                <span>
                  ou R$ {fallbackPassRate.toFixed(0)}/h no Fusion Pass+
                </span>
              </span>
            ) : (
              <span className="text-[11px] text-stone-400 font-medium block mt-0.5">
                {room.selectedModality === "turno"
                  ? "Turno fixo semanal"
                  : room.selectedModality === "fixo"
                    ? "Sala exclusiva mensal"
                    : "Reserva imediata"}
              </span>
            )}
          </div>

          <span className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-[#FAF7F4] group-hover:bg-[#BF4B24] text-stone-800 group-hover:text-white text-xs font-bold transition-colors shrink-0">
            <span>Ver agenda</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </span>
        </div>
      </div>
    </div>
  );
}
