"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { ptBR } from "date-fns/locale";
import {
  format,
  addDays,
  isSameDay,
  startOfToday,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isBefore,
  addMonths,
  isSameMonth,
} from "date-fns";
import {
  ArrowLeft,
  Heart,
  MapPin,
  Users,
  Star,
  Wifi,
  Monitor,
  Coffee,
  Wind,
  Car,
  ShieldCheck,
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
  ChevronRight,
  ChevronLeft,
  Printer,
  Loader2,
  Sparkles,
  Grid,
  Share,
  Shield,
  MessageSquare,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const AMENITIES_LIST = [
  { id: "wifi", label: "Wi-Fi de alta velocidade", icon: Wifi },
  { id: "tv", label: 'TV 65" com HDMI', icon: Monitor },
  { id: "coffee", label: "Café e água", icon: Coffee },
  { id: "ac", label: "Ar-condicionado", icon: Wind },
  { id: "printer", label: "Impressora disponível", icon: Printer },
  { id: "parking", label: "Estacionamento", icon: Car },
  { id: "security", label: "Segurança 24h", icon: ShieldCheck },
];

interface RoomDetailProps {
  roomId?: string | any;
  room?: any;
  onBack: () => void;
  initialModality?: "hora" | "turno" | "fixo";
}

export function RoomDetail(props: RoomDetailProps) {
  const { onBack, initialModality = "hora" } = props;
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);

  // ABA ATIVA (Controle de Modalidade)
  const [activeTab, setActiveTab] = useState<"hora" | "turno" | "fixo">("hora");

  // ESTADOS: POR HORA
  const today = startOfToday();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [currentMonthView, setCurrentMonthView] = useState<Date>(
    startOfMonth(today),
  );

  // ESTADOS: POR TURNO
  const [selectedShift, setSelectedShift] = useState<
    "morning" | "afternoon" | "night" | null
  >(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  // ESTADO DE FAVORITOS, COMPARTILHAMENTO E GALERIA
  const [isFavorited, setIsFavorited] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const [isAllPhotosOpen, setIsAllPhotosOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const lightboxRef = useRef<HTMLDivElement>(null);

  // 1. CARREGAMENTO DOS DADOS DA SALA
  useEffect(() => {
    let isMounted = true;
    const rawInput = props.roomId || props.room;
    const idToFetch = typeof rawInput === "object" ? rawInput?.id : rawInput;

    async function fetchRoomDetails() {
      if (!idToFetch) {
        if (isMounted) setLoading(false);
        return;
      }
      if (isMounted) setLoading(true);

      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("*, profiles:host_id(full_name)")
          .eq("id", idToFetch)
          .single();

        if (error) throw error;

        if (isMounted) {
          setRoomData(data);

          // Define a aba correta com base no que a sala permite ou no que foi passado
          const mods = data.modalities || [];
          if (mods.includes(initialModality)) {
            setActiveTab(initialModality);
          } else if (mods.length > 0) {
            setActiveTab(mods[0]);
          }
        }
      } catch (err) {
        console.error("Erro ao buscar sala:", err);
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchRoomDetails();
    return () => {
      isMounted = false;
    };
  }, [props.roomId, props.room, initialModality]);

  // 2. VERIFICAÇÃO DE FAVORITOS
  useEffect(() => {
    async function checkFavoriteStatus() {
      const rawInput = props.roomId || props.room;
      const idToFetch = typeof rawInput === "object" ? rawInput?.id : rawInput;
      if (!idToFetch) return;

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("favorites")
        .select("id")
        .eq("user_id", user.id)
        .eq("room_id", idToFetch)
        .maybeSingle();

      if (data) setIsFavorited(true);
    }
    checkFavoriteStatus();
  }, [props.roomId, props.room]);

  // ==========================================
  // LÓGICAS: POR HORA
  // ==========================================
  const availableSlots = useMemo(() => {
    if (!roomData || activeTab !== "hora") return [];
    let avail = roomData.availability;
    if (typeof avail === "string") {
      try {
        avail = JSON.parse(avail);
      } catch (e) {
        avail = null;
      }
    }
    if (!avail) return [];

    const weekConfig = Array.isArray(avail.weekConfig) ? avail.weekConfig : [];
    const exceptions = Array.isArray(avail.exceptions) ? avail.exceptions : [];

    if (exceptions.length > 0) {
      const exception = exceptions.find(
        (e: any) => e?.date && isSameDay(new Date(e.date), selectedDate),
      );
      if (exception) {
        if (exception.type === "block" && exception.isFullDay) return [];
        if (exception.type === "extra")
          return Array.isArray(exception.hours) ? exception.hours : [];
      }
    }

    const dayOfWeek = selectedDate.getDay();
    const configForDay = weekConfig.find((c: any) => c?.day === dayOfWeek);
    if (!configForDay || !configForDay.enabled) return [];

    if (configForDay.rentalType === "hourly") {
      const hours = Array.isArray(configForDay.availableHours)
        ? configForDay.availableHours
        : [];
      return hours
        .map((h: string) => {
          if (!h || typeof h !== "string") return "";
          const parts = h.split("-");
          if (parts.length < 2) return h;
          return `${parts[0].trim()}00 - ${parts[1].trim()}00`;
        })
        .filter(Boolean);
    }

    let shiftHours: string[] = [];
    const shifts = Array.isArray(configForDay.selectedShifts)
      ? configForDay.selectedShifts
      : [];
    if (shifts.includes("morning"))
      shiftHours.push(
        "08h00 - 09h00",
        "09h00 - 10h00",
        "10h00 - 11h00",
        "11h00 - 12h00",
      );
    if (shifts.includes("afternoon"))
      shiftHours.push(
        "13h00 - 14h00",
        "14h00 - 15h00",
        "15h00 - 16h00",
        "16h00 - 17h00",
        "17h00 - 18h00",
      );
    if (shifts.includes("night"))
      shiftHours.push(
        "18h00 - 19h00",
        "19h00 - 20h00",
        "20h00 - 21h00",
        "21h00 - 22h00",
      );

    return shiftHours;
  }, [roomData, selectedDate, activeTab]);

  const getBasePrice = () => {
    let address = roomData?.address_details || {};
    if (typeof address === "string") {
      try {
        address = JSON.parse(address);
      } catch (e) {
        address = {};
      }
    }
    return Number(address.pricing?.hourly || 45);
  };

  const getSlotPrice = (slotKey: string) => {
    let address = roomData?.address_details || {};
    if (typeof address === "string") {
      try {
        address = JSON.parse(address);
      } catch (e) {
        address = {};
      }
    }
    const pricing = address.pricing || {};

    const commercialRate = Number(pricing.hourly || 45);
    const afterHoursRate = pricing.afterHours
      ? Number(pricing.afterHours)
      : commercialRate;
    const weekendRate = pricing.weekend
      ? Number(pricing.weekend)
      : commercialRate;

    if (!slotKey.includes("|")) return commercialRate;

    const [dateStr, slotTime] = slotKey.split("|");
    const dateObj = new Date(`${dateStr}T12:00:00`);

    const isWeekend = dateObj.getDay() === 0 || dateObj.getDay() === 6;
    const startHour = parseInt(slotTime.substring(0, 2), 10);
    const isAfterHours = startHour >= 18 || startHour < 8;

    if (isWeekend) return weekendRate;
    if (isAfterHours) return afterHoursRate;
    return commercialRate;
  };

  const totalHourlyCost = selectedSlots.reduce(
    (acc, slotKey) => acc + getSlotPrice(slotKey),
    0,
  );

  const toggleSlot = (slotKey: string) => {
    setSelectedSlots((prev) =>
      prev.includes(slotKey)
        ? prev.filter((s) => s !== slotKey)
        : [...prev, slotKey].sort(),
    );
  };

  // ==========================================
  // LÓGICAS: POR TURNO E FIXO
  // ==========================================
  const getPricingData = () => {
    let address = roomData?.address_details || {};
    if (typeof address === "string") {
      try {
        address = JSON.parse(address);
      } catch (e) {
        address = {};
      }
    }
    return address.pricing || {};
  };

  const pricingData = getPricingData();
  const shiftPrice = selectedShift
    ? Number(pricingData[selectedShift] || 0)
    : 0;
  const totalShiftCost = shiftPrice * selectedDays.length;

  const toggleDay = (day: number) => {
    setSelectedDays((prev) =>
      prev.includes(day)
        ? prev.filter((d) => d !== day)
        : [...prev, day].sort(),
    );
  };

  // ==========================================
  // AÇÃO PRINCIPAL (Reserva ou Negociação)
  // ==========================================
  const handleAction = async () => {
    if (activeTab === "hora" && selectedSlots.length === 0) {
      return toast({
        variant: "destructive",
        title: "Atenção",
        description: "Selecione pelo menos um horário.",
      });
    }
    if (
      activeTab === "turno" &&
      (!selectedShift || selectedDays.length === 0)
    ) {
      return toast({
        variant: "destructive",
        title: "Atenção",
        description: "Selecione um turno e ao menos um dia da semana.",
      });
    }

    setActionLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user)
        throw new Error("Você precisa estar logado para prosseguir.");

      if (activeTab === "hora") {
        // FLUXO NORMAL (Transacional Direto)
        const bookingPayloads = selectedSlots.map((slotKey) => {
          const [dateStr, slotTime] = slotKey.split("|");
          const startSlot = slotTime.split(" - ")[0].replace("h", ":");
          const endSlot = slotTime.split(" - ")[1].replace("h", ":");
          return {
            user_id: user.id,
            room_id: roomData.id,
            start_time: new Date(`${dateStr}T${startSlot}:00`).toISOString(),
            end_time: new Date(`${dateStr}T${endSlot}:00`).toISOString(),
            total_cost: getSlotPrice(slotKey),
            status: "pending",
          };
        });

        const { error: bookingError } = await supabase
          .from("bookings")
          .insert(bookingPayloads);
        if (bookingError) throw bookingError;
        toast({
          title: "Reservas Solicitadas! 🎉",
          description:
            "Seus horários foram enviados para aprovação com sucesso.",
        });
        onBack();
      } else {
        // FLUXO DE NEGOCIAÇÃO SEGURA (Turno ou Fixo)
        toast({
          title: "Iniciando ambiente seguro...",
          description:
            "Criando canal de negociação com o anfitrião. Você será redirecionado para o chat.",
        });

        // Aqui nós criaremos o redirecionamento real para o Chat na próxima etapa da arquitetura.
        // Simulando o processo para a interface não travar:
        setTimeout(() => {
          onBack();
          // router.push(`/dashboard?tab=chat&new=${roomData.id}`)
        }, 1500);
      }
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro na operação",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // ==========================================
  // FUNÇÕES UTILITÁRIAS DA GALERIA
  // ==========================================
  const handleFavoriteToggle = async () => {
    if (isFavoriteLoading || !roomData) return;

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      return toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para favoritar uma sala.",
      });
    }

    setIsFavoriteLoading(true);
    try {
      if (isFavorited) {
        const { error } = await supabase
          .from("favorites")
          .delete()
          .eq("user_id", user.id)
          .eq("room_id", roomData.id);
        if (error) throw error;
        setIsFavorited(false);
        toast({ description: "Sala removida dos favoritos." });
      } else {
        const { error } = await supabase
          .from("favorites")
          .insert({ user_id: user.id, room_id: roomData.id });
        if (error) throw error;
        setIsFavorited(true);
        toast({
          title: "Salvo!",
          description: "A sala foi adicionada aos favoritos.",
        });
      }
    } catch (error: any) {
      console.error("Erro ao favoritar:", error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível salvar o favorito.",
      });
    } finally {
      setIsFavoriteLoading(false);
    }
  };

  const handleShare = async () => {
    if (isSharing) return;
    setIsSharing(true);
    const shareData = {
      title: roomData?.name || "Sala na Fusion Clinic",
      text: `Dá uma olhada nesta sala: ${roomData?.name || "Premium"} na Fusion Clinic!`,
      url: window.location.href,
    };
    try {
      if (navigator.share) {
        await navigator.share(shareData);
      } else {
        await navigator.clipboard.writeText(shareData.url);
        toast({
          title: "Link copiado!",
          description: "O link foi copiado para a área de transferência.",
        });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        try {
          await navigator.clipboard.writeText(shareData.url);
          toast({
            title: "Link copiado!",
            description:
              "Copiado para a área de transferência como alternativa.",
          });
        } catch (clipboardErr) {}
      }
    } finally {
      setTimeout(() => setIsSharing(false), 500);
    }
  };

  const openLightbox = (index: number) => {
    setCurrentPhotoIndex(index);
    setIsLightboxOpen(true);
    setTimeout(() => {
      if (lightboxRef.current)
        lightboxRef.current.scrollLeft =
          lightboxRef.current.clientWidth * index;
    }, 10);
  };

  const handleLightboxScroll = () => {
    if (lightboxRef.current) {
      const scrollPosition = lightboxRef.current.scrollLeft;
      const width = lightboxRef.current.clientWidth;
      const newIndex = Math.round(scrollPosition / width);
      if (newIndex !== currentPhotoIndex) setCurrentPhotoIndex(newIndex);
    }
  };

  const nextPhoto = () => {
    if (
      currentPhotoIndex < (roomData?.address_details?.gallery?.length || 0) &&
      lightboxRef.current
    ) {
      lightboxRef.current.scrollBy({
        left: lightboxRef.current.clientWidth,
        behavior: "smooth",
      });
    }
  };

  const prevPhoto = () => {
    if (currentPhotoIndex > 0 && lightboxRef.current) {
      lightboxRef.current.scrollBy({
        left: -lightboxRef.current.clientWidth,
        behavior: "smooth",
      });
    }
  };

  const monthStart = startOfMonth(currentMonthView);
  const monthEnd = endOfMonth(monthStart);
  const calendarDays = eachDayOfInterval({
    start: startOfWeek(monthStart),
    end: endOfWeek(monthEnd),
  });
  const nextMonth = () => setCurrentMonthView(addMonths(currentMonthView, 1));
  const prevMonth = () => setCurrentMonthView(addMonths(currentMonthView, -1));
  const canGoPrevMonth = !isBefore(
    startOfMonth(currentMonthView),
    startOfMonth(today),
  );

  // ==========================================
  // RENDERIZAÇÃO
  // ==========================================
  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-[#f05e23] mb-4" />
        <h2 className="text-xl font-black text-slate-900 mb-2">
          Preparando o espaço...
        </h2>
      </div>
    );
  }

  if (!roomData) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-xl font-black text-slate-900 mb-2">
          Sala não encontrada
        </h2>
        <Button
          onClick={onBack}
          className="bg-slate-900 text-white font-bold h-12 px-8 rounded-xl mt-4"
        >
          Voltar
        </Button>
      </div>
    );
  }

  let address = roomData.address_details || {};
  if (typeof address === "string") {
    try {
      address = JSON.parse(address);
    } catch (e) {
      address = {};
    }
  }

  const rawGallery = Array.isArray(address.gallery) ? address.gallery : [];
  const allImages = [roomData.image_url, ...rawGallery].filter(Boolean);
  const imagesToShow = allImages.slice(0, 5);
  const totalImages = imagesToShow.length;
  const isPartner = roomData.is_partner === true;
  const roomModalities = roomData.modalities || [];

  const displayAmenities =
    Array.isArray(address.amenities) && address.amenities.length > 0
      ? address.amenities
      : ["wifi", "tv", "coffee", "ac", "printer", "parking"];

  const getGridClass = (total: number, index: number) => {
    if (total === 1) return "col-span-4 row-span-2";
    if (total === 2) return "col-span-2 row-span-2";
    if (total === 3) {
      if (index === 0) return "col-span-2 row-span-2";
      return "col-span-2 row-span-1";
    }
    if (total === 4) {
      if (index === 0) return "col-span-2 row-span-2";
      if (index === 1) return "col-span-2 row-span-1";
      return "col-span-1 row-span-1";
    }
    if (index === 0) return "col-span-2 row-span-2";
    return "col-span-1 row-span-1";
  };

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom-4 duration-300">
      <div className="flex-none bg-white z-30 border-b border-slate-100 md:border-transparent">
        <div className="max-w-5xl mx-auto pt-6 px-5 flex justify-between items-center pb-4">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 text-slate-900 transition-transform hover:scale-105"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={handleShare}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 transition-transform hover:scale-105"
            >
              <Share className="w-4 h-4 text-slate-900" />
            </button>
            <button
              onClick={handleFavoriteToggle}
              disabled={isFavoriteLoading}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-sm border border-slate-200 transition-transform hover:scale-105 disabled:opacity-50"
            >
              <Heart
                className={`w-5 h-5 transition-colors ${isFavorited ? "fill-red-500 text-red-500" : "text-slate-900"}`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-8 md:pb-12 scrollbar-hide">
        <div className="max-w-5xl mx-auto px-5 pt-2 pb-6">
          {isPartner && (
            <div className="mb-3 inline-flex items-center gap-1.5 bg-gradient-to-r from-amber-500 to-orange-500 text-white text-[10px] font-black px-3 py-1.5 rounded-lg uppercase tracking-widest shadow-md">
              <Sparkles className="w-3 h-3" /> Fusion Partner
            </div>
          )}
          <div className="flex justify-between items-start gap-4 mb-3">
            <h1 className="text-2xl md:text-3xl font-black text-slate-900 leading-tight">
              {roomData.name || "Consultório Premium"}
            </h1>
            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-md shrink-0 border border-amber-100 mt-1">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span className="text-xs font-bold text-slate-700">
                5.0{" "}
                <span className="text-slate-400 font-normal hidden md:inline">
                  (124)
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs md:text-sm font-medium text-slate-600">
            <div className="flex items-center gap-1.5 font-bold">
              <MapPin className="w-4 h-4 text-[#f05e23]" />
              {address.city
                ? `${address.city}, ${address.state}`
                : "Localização sob consulta"}
            </div>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1.5">
              <Users className="w-4 h-4 text-slate-400" /> Até{" "}
              {address.capacity || 4} pessoas
            </div>
          </div>
        </div>

        <div className="md:hidden relative w-full h-[35vh] bg-slate-100 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
          {allImages.length > 0 ? (
            allImages.map((img, idx) => (
              <div
                key={idx}
                onClick={() => setIsAllPhotosOpen(true)}
                className="relative w-full h-full shrink-0 snap-center cursor-pointer"
              >
                <Image
                  src={img}
                  alt={`Foto ${idx + 1}`}
                  fill
                  className="object-cover"
                  sizes="100vw"
                  priority={idx === 0}
                />
              </div>
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-medium">
              Sem fotos
            </div>
          )}
          {allImages.length > 0 && (
            <button
              onClick={() => setIsAllPhotosOpen(true)}
              className="absolute bottom-4 right-4 bg-white/90 backdrop-blur-md text-slate-900 font-black text-xs py-1.5 px-3 rounded-lg flex items-center gap-1 shadow-sm border border-slate-200"
            >
              <Grid className="w-3.5 h-3.5" /> 1/{allImages.length}
            </button>
          )}
        </div>

        <div className="hidden md:block max-w-5xl mx-auto px-5 mb-8">
          <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[420px] w-full rounded-2xl overflow-hidden relative bg-slate-50">
            {imagesToShow.map((img, idx) => {
              const gridClass = getGridClass(totalImages, idx);
              return (
                <div
                  key={idx}
                  onClick={() => setIsAllPhotosOpen(true)}
                  className={`relative group ${gridClass}`}
                >
                  <Image
                    src={img}
                    alt={`Detalhe ${idx + 1}`}
                    fill
                    className="object-cover transition-all duration-300 group-hover:scale-[1.02] group-hover:brightness-95 cursor-pointer"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority={idx === 0}
                  />
                </div>
              );
            })}
            {allImages.length > 5 && (
              <button
                onClick={() => setIsAllPhotosOpen(true)}
                className="absolute bottom-4 right-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 font-bold text-xs py-2 px-4 rounded-xl flex items-center gap-2 shadow-md transition-transform active:scale-95"
              >
                <Grid className="w-3.5 h-3.5" /> Mostrar todas as{" "}
                {allImages.length} fotos
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-6 max-w-5xl mx-auto grid grid-cols-1 md:grid-cols-12 gap-10">
          <div className="md:col-span-7 space-y-8">
            <div className="bg-slate-50 border border-slate-100 p-4 rounded-xl flex items-center justify-between shadow-sm">
              <div>
                <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                  Endereço do Local
                </p>
                <p className="text-sm font-bold text-slate-900">
                  {address.street
                    ? `${address.street}, ${address.number}`
                    : "Av. Paulista, 1000"}
                </p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  {address.neighborhood
                    ? `${address.neighborhood} - ${address.city}`
                    : "São Paulo, SP"}
                </p>
              </div>
              <div className="w-10 h-10 rounded-full bg-white shadow-sm flex items-center justify-center text-[#f05e23]">
                <MapPin className="w-5 h-5" />
              </div>
            </div>

            <section>
              <h2 className="text-lg font-black text-slate-900 mb-3">
                Sobre o espaço
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm font-medium">
                {roomData.description ||
                  "Sala equipada com tecnologia de ponta, ideal para consultas. Ambiente climatizado, silencioso e muito confortável."}
              </p>
            </section>

            <div className="w-full h-px bg-slate-100" />

            <section>
              <h2 className="text-lg font-black text-slate-900 mb-4">
                O que o espaço oferece
              </h2>
              <div className="grid grid-cols-2 gap-4">
                {displayAmenities.map((amId: string) => {
                  const amenityDef = AMENITIES_LIST.find((a) => a.id === amId);
                  if (!amenityDef) return null;
                  const Icon = amenityDef.icon;
                  return (
                    <div
                      key={amId}
                      className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm"
                    >
                      <Icon className="w-5 h-5 text-[#f05e23]" />
                      <span className="text-xs font-bold text-slate-700">
                        {amenityDef.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>
          </div>

          <div className="md:col-span-5 bg-white md:p-6 md:border md:border-slate-200 md:rounded-2xl md:shadow-lg md:h-fit md:sticky md:top-6 flex flex-col">
            <div className="flex bg-slate-100 p-1.5 rounded-xl mb-6">
              {roomModalities.includes("hora") && (
                <button
                  onClick={() => setActiveTab("hora")}
                  className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${activeTab === "hora" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                >
                  Por Hora
                </button>
              )}
              {roomModalities.includes("turno") && (
                <button
                  onClick={() => setActiveTab("turno")}
                  className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${activeTab === "turno" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                >
                  Por Turno
                </button>
              )}
              {roomModalities.includes("fixo") && (
                <button
                  onClick={() => setActiveTab("fixo")}
                  className={`flex-1 text-xs font-bold py-2.5 rounded-lg transition-all ${activeTab === "fixo" ? "bg-white shadow-sm text-slate-900" : "text-slate-500"}`}
                >
                  Mensal (Fixo)
                </button>
              )}
            </div>

            {/* SEÇÃO: POR HORA */}
            {activeTab === "hora" && (
              <section className="animate-in fade-in">
                <div className="flex items-center gap-2 mb-4">
                  <CalendarIcon className="w-5 h-5 text-[#f05e23]" />
                  <h2 className="text-lg font-black text-slate-900">
                    Agendamento
                  </h2>
                </div>

                <div className="w-full bg-white rounded-2xl border border-slate-100 p-4 mb-6 shadow-sm">
                  <div className="flex items-center justify-between mb-4">
                    <button
                      onClick={prevMonth}
                      disabled={!canGoPrevMonth}
                      className={`p-1.5 rounded-full transition-colors ${canGoPrevMonth ? "text-slate-500 hover:bg-slate-100 hover:text-[#f05e23]" : "text-slate-200 cursor-not-allowed"}`}
                    >
                      <ChevronLeft className="w-5 h-5" />
                    </button>
                    <div className="font-bold text-slate-800 capitalize text-sm">
                      {format(currentMonthView, "MMMM 'de' yyyy", {
                        locale: ptBR,
                      })}
                    </div>
                    <button
                      onClick={nextMonth}
                      className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 hover:text-[#f05e23] transition-colors"
                    >
                      <ChevronRight className="w-5 h-5" />
                    </button>
                  </div>

                  <div className="grid grid-cols-7 text-center mb-2">
                    {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                      (d) => (
                        <div
                          key={d}
                          className="text-[10px] font-bold text-slate-400 uppercase"
                        >
                          {d}
                        </div>
                      ),
                    )}
                  </div>

                  <div className="grid grid-cols-7 gap-y-2 gap-x-1">
                    {calendarDays.map((day) => {
                      const dateStr = format(day, "yyyy-MM-dd");
                      const isSelected = isSameDay(day, selectedDate);
                      const isPast =
                        isBefore(day, today) && !isSameDay(day, today);
                      const isCurrentMonth = isSameMonth(day, currentMonthView);
                      const hasSelection = selectedSlots.some((slotKey) =>
                        slotKey.startsWith(dateStr),
                      );

                      return (
                        <button
                          key={day.toISOString()}
                          onClick={() => {
                            if (!isPast) setSelectedDate(day);
                          }}
                          disabled={isPast || !isCurrentMonth}
                          className={`relative h-9 w-full rounded-lg text-xs font-bold flex flex-col items-center justify-center transition-colors
                            ${!isCurrentMonth ? "invisible" : ""}
                            ${isPast ? "text-slate-200 cursor-not-allowed" : ""}
                            ${isSelected ? "bg-[#f05e23] text-white shadow-md shadow-orange-500/30" : ""}
                            ${!isSelected && !isPast && isCurrentMonth ? "text-slate-700 hover:bg-slate-100" : ""}
                          `}
                        >
                          <span className="relative z-10">
                            {format(day, "d")}
                          </span>
                          {hasSelection && (
                            <span
                              className={`absolute bottom-1 w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-[#f05e23]"}`}
                            />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="w-full h-px bg-slate-100 my-4" />

                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-bold text-slate-800 capitalize">
                    Horários disponíveis{" "}
                    <span className="font-medium text-slate-500 lowercase">
                      (
                      {format(selectedDate, "EEE, dd 'de' MMM", {
                        locale: ptBR,
                      })}
                      )
                    </span>
                  </h3>
                </div>

                {availableSlots.length === 0 ? (
                  <div className="text-center py-6 bg-slate-50 rounded-xl border border-slate-100">
                    <AlertCircle className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                    <p className="text-slate-500 font-bold text-xs">
                      Nenhum horário disponível para esta data.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-2 max-h-[220px] overflow-y-auto pr-1 scrollbar-hide">
                    {availableSlots.map((slotTime: string) => {
                      const slotKey = `${format(selectedDate, "yyyy-MM-dd")}|${slotTime}`;
                      const isSelected = selectedSlots.includes(slotKey);
                      const slotPrice = getSlotPrice(slotKey);

                      return (
                        <button
                          key={slotKey}
                          onClick={() => toggleSlot(slotKey)}
                          className={`h-14 rounded-xl flex flex-col items-center justify-center transition-all border-2 ${
                            isSelected
                              ? "border-[#f05e23] bg-orange-50"
                              : "border-slate-100 bg-white hover:border-slate-300"
                          }`}
                        >
                          <span
                            className={`text-xs font-bold ${isSelected ? "text-[#f05e23]" : "text-slate-700"}`}
                          >
                            {slotTime}
                          </span>
                          <span
                            className={`text-[10px] font-semibold mt-0.5 ${isSelected ? "text-[#f05e23]/80" : "text-slate-400"}`}
                          >
                            R$ {slotPrice.toFixed(2).replace(".", ",")}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                <div className="hidden md:block pt-6 border-t border-slate-100 mt-6">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">
                        {selectedSlots.length > 0
                          ? `Total (${selectedSlots.length} horas)`
                          : "A partir de"}
                      </p>
                      <div className="flex items-baseline gap-1">
                        <span className="text-2xl font-black text-[#f05e23]">
                          R${" "}
                          {selectedSlots.length > 0
                            ? totalHourlyCost
                            : getBasePrice()}
                        </span>
                      </div>
                    </div>
                  </div>
                  <Button
                    onClick={handleAction}
                    disabled={actionLoading || selectedSlots.length === 0}
                    className={`w-full h-14 rounded-xl font-black transition-all text-base ${selectedSlots.length > 0 ? "bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg shadow-orange-500/25 hover:scale-[1.02]" : "bg-slate-100 text-slate-400 shadow-none"}`}
                  >
                    {actionLoading ? "Processando..." : "Reservar Agora"}
                  </Button>
                </div>
              </section>
            )}

            {/* SEÇÃO: POR TURNO */}
            {activeTab === "turno" && (
              <section className="animate-in fade-in space-y-6">
                <div>
                  <h2 className="text-sm font-black text-slate-900 mb-3">
                    1. Qual turno deseja alugar?
                  </h2>
                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        id: "morning",
                        label: "Manhã",
                        price: pricingData.morning,
                      },
                      {
                        id: "afternoon",
                        label: "Tarde",
                        price: pricingData.afternoon,
                      },
                      { id: "night", label: "Noite", price: pricingData.night },
                    ].map((t) => (
                      <button
                        key={t.id}
                        onClick={() => setSelectedShift(t.id as any)}
                        className={`flex flex-col items-center justify-center p-3.5 rounded-xl border-2 transition-all ${selectedShift === t.id ? "border-[#f05e23] bg-orange-50 text-[#f05e23]" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                      >
                        <span className="text-xs font-black">{t.label}</span>
                        <span
                          className={`text-[10px] font-bold mt-1 ${selectedShift === t.id ? "text-[#f05e23]/70" : "text-slate-400"}`}
                        >
                          {t.price ? `R$ ${t.price}` : "--"}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <h2 className="text-sm font-black text-slate-900 mb-3">
                    2. Quais dias da semana?
                  </h2>
                  <div className="flex gap-2 justify-between">
                    {["D", "S", "T", "Q", "Q", "S", "S"].map((day, i) => (
                      <button
                        key={i}
                        onClick={() => toggleDay(i)}
                        className={`w-10 h-10 rounded-full text-xs font-black transition-all ${selectedDays.includes(i) ? "bg-slate-900 text-white shadow-md shadow-slate-900/20" : "bg-slate-100 text-slate-500 hover:bg-slate-200"}`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="bg-blue-50/50 border border-blue-100 p-4 rounded-xl flex gap-3">
                  <Shield className="w-5 h-5 text-blue-500 shrink-0" />
                  <p className="text-xs text-blue-800 font-medium leading-relaxed">
                    Aluguéis recorrentes são fechados através do nosso{" "}
                    <strong className="font-black">Chat Seguro</strong>. O
                    anfitrião avaliará sua proposta e vocês combinarão as chaves
                    e o contrato na plataforma.
                  </p>
                </div>

                <div className="hidden md:block pt-4 border-t border-slate-100">
                  <div className="flex justify-between items-end mb-4">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                      Estimativa Semanal
                    </span>
                    <span className="text-2xl font-black text-slate-900">
                      R$ {totalShiftCost.toFixed(2)}
                    </span>
                  </div>
                  <Button
                    onClick={handleAction}
                    disabled={
                      actionLoading ||
                      !selectedShift ||
                      selectedDays.length === 0
                    }
                    className="w-full h-14 rounded-xl font-black bg-slate-900 hover:bg-slate-800 text-white gap-2 transition-all"
                  >
                    {actionLoading ? (
                      "Processando..."
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4" /> Solicitar Proposta
                      </>
                    )}
                  </Button>
                </div>
              </section>
            )}

            {/* SEÇÃO: MENSAL (FIXO) */}
            {activeTab === "fixo" && (
              <section className="animate-in fade-in space-y-6">
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Contrato Mensal (Exclusivo)
                  </p>
                  <h3 className="text-3xl font-black text-slate-900">
                    R$ {pricingData.monthly || "--"}
                  </h3>
                </div>

                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex gap-3">
                  <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                    O aluguel fixo garante exclusividade total sobre a sala.
                    Inicie uma negociação segura para definir prazos, reformas,
                    equipamentos e documentação do contrato.
                  </p>
                </div>

                <div className="hidden md:block pt-4 border-t border-slate-100">
                  <Button
                    onClick={handleAction}
                    disabled={actionLoading}
                    className="w-full h-14 rounded-xl font-black bg-slate-900 hover:bg-slate-800 text-white gap-2 shadow-xl shadow-slate-900/10 transition-all"
                  >
                    {actionLoading ? (
                      "Processando..."
                    ) : (
                      <>
                        <MessageSquare className="w-4 h-4" /> Iniciar Negociação
                      </>
                    )}
                  </Button>
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      {/* RODAPÉ MOBILE INTELIGENTE (SHAPESHIFTER) */}
      <div className="md:hidden flex-none bg-white border-t border-slate-200 p-4 pb-safe flex items-center justify-between shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">
            {activeTab === "hora"
              ? selectedSlots.length > 0
                ? `Total (${selectedSlots.length} h)`
                : "A partir de"
              : activeTab === "turno"
                ? "Estimativa Semanal"
                : "Mensalidade"}
          </p>
          <div className="flex items-baseline gap-1">
            <span
              className={`text-2xl font-black ${activeTab === "hora" ? "text-[#f05e23]" : "text-slate-900"}`}
            >
              R${" "}
              {activeTab === "hora"
                ? selectedSlots.length > 0
                  ? totalHourlyCost
                  : getBasePrice()
                : activeTab === "turno"
                  ? totalShiftCost
                  : pricingData.monthly || 0}
            </span>
          </div>
        </div>

        {activeTab === "hora" ? (
          <Button
            onClick={handleAction}
            disabled={actionLoading || selectedSlots.length === 0}
            className={`h-14 px-6 rounded-xl font-black transition-all w-[55%] text-base ${selectedSlots.length > 0 ? "bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg shadow-orange-500/25 active:scale-95" : "bg-slate-100 text-slate-400 shadow-none"}`}
          >
            {actionLoading ? "Aguarde..." : "Reservar"}
          </Button>
        ) : (
          <Button
            onClick={handleAction}
            disabled={
              actionLoading ||
              (activeTab === "turno" &&
                (!selectedShift || selectedDays.length === 0))
            }
            className="h-14 px-6 rounded-xl font-black bg-slate-900 text-white w-[55%] text-base flex gap-2 active:scale-95 shadow-xl shadow-slate-900/10"
          >
            {actionLoading ? (
              "Aguarde..."
            ) : (
              <>
                <MessageSquare className="w-4 h-4" /> Negociar
              </>
            )}
          </Button>
        )}
      </div>

      {isAllPhotosOpen && (
        <div className="fixed inset-0 z-[150] bg-white flex flex-col animate-in fade-in duration-200">
          <div className="flex-none p-4 flex justify-between items-center bg-white border-b border-slate-100 z-10 sticky top-0">
            <button
              onClick={() => setIsAllPhotosOpen(false)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-slate-900" />
            </button>
            <span className="font-bold text-slate-900 text-sm">
              Todas as fotos
            </span>
            <button
              onClick={handleShare}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <Share className="w-4 h-4 text-slate-900" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white px-2 py-4 md:px-6">
            <div className="grid grid-cols-2 gap-1 md:max-w-4xl md:mx-auto md:gap-4">
              {allImages.map((img, idx) => {
                const isFullWidth = idx % 3 === 0;
                return (
                  <div
                    key={idx}
                    onClick={() => openLightbox(idx)}
                    className={`relative w-full bg-slate-100 cursor-pointer overflow-hidden md:rounded-2xl group ${isFullWidth ? "col-span-2 h-[35vh] md:h-[60vh]" : "col-span-1 h-[25vh] md:h-[40vh]"}`}
                  >
                    <Image
                      src={img}
                      alt={`Foto ${idx + 1}`}
                      fill
                      className="object-cover transition-transform duration-300 group-hover:scale-105"
                      sizes="(max-width: 768px) 100vw, 80vw"
                      priority={idx < 3}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {isLightboxOpen && (
        <div className="fixed inset-0 z-[200] bg-black text-white flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex-none p-4 flex justify-between items-center bg-transparent z-20 absolute top-0 w-full">
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <span className="font-medium text-sm tracking-widest bg-black/40 px-3 py-1 rounded-full backdrop-blur-md">
              {currentPhotoIndex + 1} / {allImages.length}
            </span>
            <button
              onClick={handleShare}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <Share className="w-5 h-5 text-white" />
            </button>
          </div>

          <div className="flex-1 relative flex items-center justify-center w-full h-full overflow-hidden">
            <button
              onClick={prevPhoto}
              disabled={currentPhotoIndex === 0}
              className={`hidden md:flex absolute left-8 z-20 p-3 rounded-full backdrop-blur-md transition-all border border-white/20 ${currentPhotoIndex === 0 ? "bg-white/5 text-white/30 cursor-not-allowed border-transparent" : "bg-white/10 hover:bg-white/20 text-white"}`}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>

            <div
              ref={lightboxRef}
              onScroll={handleLightboxScroll}
              className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth items-center"
            >
              {allImages.map((img, idx) => (
                <div
                  key={idx}
                  className="relative w-full h-full shrink-0 snap-center flex items-center justify-center p-0 md:p-16"
                >
                  <Image
                    src={img}
                    alt={`Foto ampliada ${idx + 1}`}
                    fill
                    className="object-contain"
                    sizes="100vw"
                    priority={Math.abs(currentPhotoIndex - idx) <= 1}
                  />
                </div>
              ))}
            </div>

            <button
              onClick={nextPhoto}
              disabled={currentPhotoIndex === allImages.length - 1}
              className={`hidden md:flex absolute right-8 z-20 p-3 rounded-full backdrop-blur-md transition-all border border-white/20 ${currentPhotoIndex === allImages.length - 1 ? "bg-white/5 text-white/30 cursor-not-allowed border-transparent" : "bg-white/10 hover:bg-white/20 text-white"}`}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
