"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { ptBR } from "date-fns/locale";
import {
  format,
  addMonths,
  isSameDay,
  startOfToday,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  eachDayOfInterval,
  isBefore,
  isSameMonth,
  parseISO,
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
  Lock,
  User,
  Check,
  Crown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { CheckoutModal, CheckoutSummary } from "@/components/checkout-modal";
import { useMobileBack } from "@/hooks/use-mobile-back";

const AMENITIES_LIST = [
  { id: "wifi", label: "Wi-Fi de alta velocidade", icon: Wifi },
  { id: "tv", label: 'TV 65" com HDMI', icon: Monitor },
  { id: "coffee", label: "Café e água", icon: Coffee },
  { id: "ac", label: "Ar-condicionado", icon: Wind },
  { id: "printer", label: "Impressora disponível", icon: Printer },
  { id: "parking", label: "Estacionamento", icon: Car },
  { id: "security", label: "Segurança 24h", icon: ShieldCheck },
];

export interface RoomDetailProps {
  roomId?: string | any;
  room?: any;
  onBack: () => void;
  onNavigateToProfile?: () => void;
  initialModality?: "hora" | "turno" | "fixo";
  onNavigateToChat?: () => void;
}

export function RoomDetail(props: RoomDetailProps) {
  const {
    onBack,
    onNavigateToProfile,
    initialModality = "hora",
    onNavigateToChat,
  } = props;
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [roomData, setRoomData] = useState<any>(null);

  const [activeTab, setActiveTab] = useState<"hora" | "turno" | "fixo">("hora");

  const today = startOfToday();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [currentMonthView, setCurrentMonthView] = useState<Date>(
    startOfMonth(today),
  );

  const [roomBookings, setRoomBookings] = useState<any[]>([]);

  const [selectedShift, setSelectedShift] = useState<
    "morning" | "afternoon" | "night" | null
  >(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutSummary, setCheckoutSummary] =
    useState<CheckoutSummary | null>(null);

  const [isFavorited, setIsFavorited] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const [isAllPhotosOpen, setIsAllPhotosOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);

  const [showProfileModal, setShowProfileModal] = useState(false);

  useMobileBack(
    isCheckoutOpen,
    () => setIsCheckoutOpen(false),
    "checkout-modal",
  );
  useMobileBack(
    isAllPhotosOpen,
    () => setIsAllPhotosOpen(false),
    "galeria-fotos",
  );
  useMobileBack(
    isLightboxOpen,
    () => setIsLightboxOpen(false),
    "foto-ampliada",
  );
  useMobileBack(
    showProfileModal,
    () => setShowProfileModal(false),
    "modal-perfil-incompleto",
  );

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
          const mods = data.modalities || [];

          if (mods.includes(initialModality)) {
            setActiveTab(initialModality);
          } else if (mods.includes("hora")) {
            setActiveTab("hora");
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
  }, [props.roomId, props.room, initialModality, supabase]);

  useEffect(() => {
    if (!roomData?.id) return;

    let channel: any;

    async function fetchRoomBookings() {
      const { data, error } = await supabase
        .from("bookings")
        .select("id, start_time, end_time, status")
        .eq("room_id", roomData.id)
        .in("status", [
          "confirmed",
          "pending_payment",
          "completed",
          "locked_temp",
        ]);

      if (!error && data) {
        setRoomBookings(data);
      }
    }

    fetchRoomBookings();

    channel = supabase
      .channel(`room_bookings_${roomData.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "bookings",
          filter: `room_id=eq.${roomData.id}`,
        },
        () => {
          fetchRoomBookings();
        },
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [roomData?.id, supabase]);

  useEffect(() => {
    async function fetchReviews() {
      const rawInput = props.roomId || props.room;
      const idToFetch = typeof rawInput === "object" ? rawInput?.id : rawInput;
      if (!idToFetch) return;

      setLoadingReviews(true);
      try {
        const { data, error } = await supabase
          .from("reviews")
          .select("*, profiles:guest_id(full_name, avatar_url)")
          .eq("room_id", idToFetch)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setReviews(data || []);
      } catch (error) {
        console.error("Erro ao buscar avaliações:", error);
      } finally {
        setLoadingReviews(false);
      }
    }
    fetchReviews();
  }, [props.roomId, props.room, supabase]);

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
  }, [props.roomId, props.room, supabase]);

  const avgRating =
    reviews.length > 0
      ? (
          reviews.reduce((acc, curr) => acc + curr.rating, 0) / reviews.length
        ).toFixed(1)
      : "Novo";

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

          const rawStart = parts[0].trim().replace("h", ":");
          const hourNumber = parseInt(rawStart.split(":")[0], 10);

          if (isNaN(hourNumber)) return "";

          const formattedHour = hourNumber.toString().padStart(2, "0");
          return `${formattedHour}:00 - ${formattedHour}:50`;
        })
        .filter(Boolean);
    }

    let shiftHours: string[] = [];
    const shifts = Array.isArray(configForDay.selectedShifts)
      ? configForDay.selectedShifts
      : [];

    if (shifts.includes("morning"))
      shiftHours.push(
        "08:00 - 08:50",
        "09:00 - 09:50",
        "10:00 - 10:50",
        "11:00 - 11:50",
      );
    if (shifts.includes("afternoon"))
      shiftHours.push(
        "13:00 - 13:50",
        "14:00 - 14:50",
        "15:00 - 15:50",
        "16:00 - 16:50",
        "17:00 - 17:50",
      );
    if (shifts.includes("night"))
      shiftHours.push(
        "18:00 - 18:50",
        "19:00 - 19:50",
        "20:00 - 20:50",
        "21:00 - 21:50",
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

  const parseSlotDate = (dateStr: string, timeStr: string): Date => {
    try {
      const cleanTime = timeStr.trim().replace("h", ":");
      const parts = cleanTime.split(":");
      const hh = parseInt(parts[0], 10);
      const mm = parts[1] ? parseInt(parts[1].substring(0, 2), 10) : 0;

      const [year, month, day] = dateStr.split("-").map(Number);

      const dateObj = new Date(year, month - 1, day, hh, mm, 0);

      if (isNaN(dateObj.getTime())) {
        throw new Error("Data Inválida gerada");
      }
      return dateObj;
    } catch (e) {
      throw new Error(
        `Erro ao interpretar horário: ${timeStr} na data ${dateStr}`,
      );
    }
  };

  const isSlotBooked = (slotKey: string) => {
    try {
      const [dateStr, timeStr] = slotKey.split("|");
      const startSlotStr = timeStr.split(" - ")[0];
      const slotStart = parseSlotDate(dateStr, startSlotStr).getTime();

      return roomBookings.some((b) => {
        const bStart = new Date(b.start_time).getTime();
        const bEnd = new Date(b.end_time).getTime();
        return slotStart >= bStart && slotStart < bEnd;
      });
    } catch {
      return false;
    }
  };

  const isSlotPast = (slotKey: string) => {
    try {
      const [dateStr, timeStr] = slotKey.split("|");
      const startSlotStr = timeStr.split(" - ")[0];
      const slotStart = parseSlotDate(dateStr, startSlotStr).getTime();
      return slotStart < new Date().getTime();
    } catch {
      return true;
    }
  };

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
        error: authError,
      } = await supabase.auth.getUser();

      if (authError || !user) {
        toast({
          title: "Acesso restrito",
          description: "Você precisa entrar na sua conta para continuar.",
        });
        router.push("/login");
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("full_name, cpf, birth_date, address_street, address_number")
        .eq("id", user.id)
        .maybeSingle();

      const isProfileComplete = Boolean(
        profile?.full_name &&
        profile?.cpf &&
        profile?.birth_date &&
        profile?.address_street &&
        profile?.address_number,
      );

      if (!isProfileComplete) {
        setShowProfileModal(true);
        setActionLoading(false);
        return;
      }

      if (activeTab === "hora") {
        if (!selectedDate || isNaN(selectedDate.getTime())) {
          throw new Error("A data base selecionada é inválida.");
        }

        const sortedSlots = [...selectedSlots].sort();

        // Verifica colisão DE NOVO antes de gerar os locks
        for (const slotKey of sortedSlots) {
          if (isSlotBooked(slotKey)) {
            setSelectedSlots([]);
            throw new Error(
              "Um dos horários selecionados acabou de ser reservado por outra pessoa. Atualize a página.",
            );
          }
        }

        const bookingPayloads = sortedSlots.map((slotKey) => {
          const [dateStr, slotTime] = slotKey.split("|");
          const startSlotStr = slotTime.split(" - ")[0];
          const endSlotStr = slotTime.split(" - ")[1];

          const startTime = parseSlotDate(dateStr, startSlotStr);
          const endTime = parseSlotDate(dateStr, endSlotStr);

          return {
            user_id: user.id,
            room_id: roomData.id,
            start_time: startTime.toISOString(),
            end_time: endTime.toISOString(),
            total_cost: 0,
            status: "locked_temp",
          };
        });

        const { data: lockedData, error: lockError } = await supabase
          .from("bookings")
          .insert(bookingPayloads)
          .select("id");

        if (lockError) {
          throw new Error(
            "Erro ao criar reserva temporária. Horário indisponível.",
          );
        }

        const firstSlot = sortedSlots[0];
        const [startDateStr, startTimeStr] = firstSlot.split("|");
        const startSlotStr = startTimeStr.split(" - ")[0];
        const startDate = parseSlotDate(startDateStr, startSlotStr);
        const totalHours = selectedSlots.length;
        const endDateForApi = new Date(
          startDate.getTime() + totalHours * 60 * 60 * 1000,
        );

        const response = await fetch("/api/bookings/calculate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId: roomData.id,
            startTime: startDate.toISOString(),
            endTime: endDateForApi.toISOString(),
          }),
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          throw new Error("Erro de rota: A API de cálculo não foi encontrada.");
        }

        const summaryData = await response.json();
        if (!response.ok)
          throw new Error(summaryData.error || "Erro ao calcular valores.");

        // Guardamos os IDs dos locks para o modal confirmar ou deletar
        setCheckoutSummary({
          ...summaryData,
          lockIds: lockedData.map((d: any) => d.id),
        });
        setIsCheckoutOpen(true);
      } else {
        toast({
          title: "Iniciando negociação...",
          description: "Criando canal seguro com o anfitrião e a Fusion...",
        });

        const { data: existingChat } = await supabase
          .from("chats")
          .select("id")
          .eq("room_id", roomData.id)
          .eq("guest_id", user.id)
          .eq("type", "negotiation")
          .maybeSingle();

        if (!existingChat) {
          const { error: insertError } = await supabase.from("chats").insert({
            type: "negotiation",
            status: "open",
            room_id: roomData.id,
            guest_id: user.id,
            host_id: roomData.host_id,
          });

          if (insertError) throw insertError;
        }

        toast({
          title: "Chat aberto!",
          description: "Redirecionando para as mensagens...",
        });

        if (onNavigateToChat) {
          onNavigateToChat();
        } else {
          onBack();
        }
      }
    } catch (err: any) {
      console.error("Erro no handleAction:", err);
      toast({
        variant: "destructive",
        title: "Erro na operação",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCheckout = async (method: "wallet" | "pix" | "card") => {
    if (!checkoutSummary) return;
    setActionLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const lockIds = (checkoutSummary as any).lockIds;

      if (method === "wallet") {
        const creditCostPerHour =
          checkoutSummary.creditsRequired / selectedSlots.length;

        const { error: updateError } = await supabase
          .from("bookings")
          .update({
            total_cost: creditCostPerHour,
            status: "confirmed",
          })
          .in("id", lockIds);

        if (updateError) throw updateError;

        const { error: walletError } = await supabase
          .from("wallet_transactions")
          .insert({
            user_id: user.id,
            amount: -checkoutSummary.creditsRequired,
            type: "usage",
            tier: roomData.tier || "start",
            description: `Reserva em Créditos: ${roomData.name}`,
          });
        if (walletError) throw walletError;

        toast({
          title: "Reserva Confirmada! 🎉",
          description: "A sala foi agendada e os créditos consumidos.",
        });
        setIsCheckoutOpen(false);
        setCheckoutSummary(null);
        setSelectedSlots([]);
        onBack();
      } else {
        toast({
          title: "Gerando pagamento...",
          description: "Redirecionando para o gateway.",
        });

        const paymentRef = `REF_${Date.now()}_${Math.floor(Math.random() * 1000)}`;

        const { error: updateError } = await supabase
          .from("bookings")
          .update({
            status: "pending_payment",
            asaas_payment_id: paymentRef,
          })
          .in("id", lockIds);

        if (updateError) throw updateError;

        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutType: "booking",
            price: totalHourlyCost,
            paymentRef: paymentRef,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        window.location.href = data.invoiceUrl;
      }
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro na confirmação",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleCheckoutClose = async () => {
    setIsCheckoutOpen(false);
    if (checkoutSummary && (checkoutSummary as any).lockIds) {
      const lockIds = (checkoutSummary as any).lockIds;
      await supabase.from("bookings").delete().in("id", lockIds);
    }
    setCheckoutSummary(null);
  };

  const handleFavoriteToggle = async () => {
    if (isFavoriteLoading || !roomData) return;

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      toast({
        title: "Acesso restrito",
        description: "Você precisa fazer login para favoritar.",
      });
      router.push("/login");
      return;
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
      if (navigator.share) await navigator.share(shareData);
      else {
        await navigator.clipboard.writeText(shareData.url);
        toast({ title: "Link copiado!" });
      }
    } catch (err: any) {
      if (err.name !== "AbortError") {
        await navigator.clipboard.writeText(shareData.url);
        toast({ title: "Link copiado!" });
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

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center">
        <Loader2 className="h-12 w-12 animate-spin text-[#f05e23]" />
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
    if (total === 3)
      return index === 0 ? "col-span-2 row-span-2" : "col-span-2 row-span-1";
    if (total === 4)
      return index === 0
        ? "col-span-2 row-span-2"
        : index === 1
          ? "col-span-2 row-span-1"
          : "col-span-1 row-span-1";
    return index === 0 ? "col-span-2 row-span-2" : "col-span-1 row-span-1";
  };

  const mapSearchQuery = encodeURIComponent(
    `${address.neighborhood || ""}, ${address.city || ""}`,
  );

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
                {avgRating}{" "}
                <span className="text-slate-400 font-normal hidden md:inline">
                  ({reviews.length} avaliações)
                </span>
              </span>
            </div>
          </div>
          <div className="flex items-center gap-4 text-xs md:text-sm font-medium text-slate-600">
            <div className="flex items-center gap-1.5 font-bold">
              <MapPin className="w-4 h-4 text-[#f05e23]" />
              {address.city
                ? `${address.city}, ${address.state}`
                : "Localização protegida"}
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

        <div className="px-5 py-6 max-w-5xl mx-auto flex flex-col lg:grid lg:grid-cols-12 gap-10">
          <div className="order-1 lg:order-1 lg:col-span-8 space-y-10">
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
                      className="flex items-center gap-3 p-3.5 rounded-xl bg-white border border-slate-200 shadow-sm hover:border-slate-300 transition-colors"
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

            <div className="w-full h-px bg-slate-100" />

            <section>
              <h2 className="text-lg font-black text-slate-900 mb-4">
                Localização da Sala
              </h2>
              <div className="relative w-full h-64 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200 shadow-inner">
                <div className="absolute top-[-70px] left-0 w-full h-[calc(100%+70px)] pointer-events-none">
                  <iframe
                    width="100%"
                    height="100%"
                    style={{ border: 0 }}
                    loading="lazy"
                    allowFullScreen
                    src={`https://www.google.com/maps?q=${mapSearchQuery}&output=embed&z=15`}
                  ></iframe>
                </div>
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="w-48 h-48 bg-[#00bcd4]/20 border-2 border-[#00bcd4]/40 rounded-full shadow-[0_0_15px_rgba(0,188,212,0.3)]"></div>
                </div>
                <div className="absolute bottom-4 left-4 right-4 md:right-auto md:w-64 bg-white/95 backdrop-blur-md px-4 py-3 rounded-xl shadow-md border border-slate-100 flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-cyan-50 flex items-center justify-center shrink-0">
                    <MapPin className="w-5 h-5 text-cyan-600" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-sm font-black text-slate-900 truncate">
                      {address.neighborhood || "Região Central"}
                    </p>
                    <p className="text-[10px] font-bold text-slate-500 uppercase truncate">
                      {address.city
                        ? `${address.city}, ${address.state}`
                        : "Localização sob consulta"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 rounded-xl p-4 mt-4 border border-slate-100 flex items-start gap-3">
                <Lock className="w-5 h-5 text-emerald-500 shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-slate-800">
                    Endereço exato protegido
                  </p>
                  <p className="text-xs text-slate-500 font-medium mt-1 leading-relaxed">
                    Para segurança da clínica, exibimos apenas a região
                    aproximada no mapa.{" "}
                    <b>
                      O endereço completo, número e andar serão liberados
                      imediatamente após a confirmação da sua reserva.
                    </b>
                  </p>
                </div>
              </div>
            </section>

            <div className="w-full h-px bg-slate-100 hidden lg:block" />
          </div>

          <div className="order-2 lg:order-2 lg:col-span-4 bg-white md:p-6 md:border md:border-slate-200 md:rounded-2xl md:shadow-lg md:h-fit md:sticky md:top-24 flex flex-col">
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
                          className={`relative h-9 w-full rounded-lg text-xs font-bold flex flex-col items-center justify-center transition-colors ${!isCurrentMonth ? "invisible" : ""} ${isPast ? "text-slate-200 cursor-not-allowed" : ""} ${isSelected ? "bg-[#f05e23] text-white shadow-md shadow-orange-500/30" : ""} ${!isSelected && !isPast && isCurrentMonth ? "text-slate-700 hover:bg-slate-100" : ""}`}
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
                      const isBooked = isSlotBooked(slotKey);
                      const isPastSlot = isSlotPast(slotKey);
                      const isUnavailable = isBooked || isPastSlot;
                      const isSelected = selectedSlots.includes(slotKey);
                      const slotPrice = getSlotPrice(slotKey);

                      return (
                        <button
                          key={slotKey}
                          onClick={() => !isUnavailable && toggleSlot(slotKey)}
                          disabled={isUnavailable}
                          className={`h-14 rounded-xl flex flex-col items-center justify-center transition-all border-2 ${isUnavailable ? "border-slate-100 bg-slate-50 opacity-50 cursor-not-allowed" : isSelected ? "border-[#f05e23] bg-orange-50" : "border-slate-100 bg-white hover:border-slate-300"}`}
                        >
                          <span
                            className={`text-xs font-bold ${isUnavailable ? "text-slate-400 line-through" : isSelected ? "text-[#f05e23]" : "text-slate-700"}`}
                          >
                            {slotTime}
                          </span>
                          <span
                            className={`text-[10px] font-semibold mt-0.5 ${isUnavailable ? "text-slate-400" : isSelected ? "text-[#f05e23]/80" : "text-slate-400"}`}
                          >
                            {isUnavailable
                              ? "Indisponível"
                              : `R$ ${slotPrice.toFixed(2).replace(".", ",")}`}
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
                    <strong className="font-black">Chat Seguro</strong>.
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

            {activeTab === "fixo" && (
              <section className="animate-in fade-in space-y-6">
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-slate-200">
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-1">
                    Contrato Mensal (Exclusivo)
                  </p>
                  <h3 className="text-3xl font-black text-slate-900">
                    {pricingData.monthly ? `R$ ${pricingData.monthly}` : "--"}
                  </h3>
                </div>
                <div className="bg-emerald-50/50 border border-emerald-100 p-4 rounded-xl flex gap-3">
                  <Shield className="w-5 h-5 text-emerald-600 shrink-0" />
                  <p className="text-xs text-emerald-800 font-medium leading-relaxed">
                    O aluguel fixo garante exclusividade total sobre a sala.
                    Inicie uma negociação segura.
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

          <div className="order-3 lg:order-3 lg:col-span-8 lg:col-start-1 pt-8 border-t border-slate-100 lg:border-none lg:pt-0">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-lg font-black text-slate-900">Avaliações</h2>
              <div className="flex items-center gap-1.5">
                <Star className="w-5 h-5 fill-amber-500 text-amber-500" />
                <span className="font-black text-lg text-slate-900">
                  {avgRating}
                </span>
                <span className="text-sm font-medium text-slate-500">
                  ({reviews.length} avaliações)
                </span>
              </div>
            </div>

            {loadingReviews ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-12 bg-slate-50 rounded-[2rem] border border-slate-100">
                <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center mx-auto mb-4 shadow-sm">
                  <Star className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-bold text-slate-900 text-lg">
                  Ainda não há avaliações
                </p>
                <p className="text-sm text-slate-500 font-medium mt-1">
                  Seja o primeiro a avaliar este espaço após seu uso!
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                {reviews.map((review) => (
                  <div
                    key={review.id}
                    className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm"
                  >
                    <div className="flex items-center gap-4 mb-4">
                      <div className="w-12 h-12 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                        {review.profiles?.avatar_url ? (
                          <img
                            src={review.profiles.avatar_url}
                            className="w-full h-full object-cover"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-slate-400">
                            <User className="w-6 h-6" />
                          </div>
                        )}
                      </div>
                      <div>
                        <p className="font-black text-slate-900">
                          {review.profiles?.full_name ||
                            "Profissional Verificado"}
                        </p>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                          {format(parseISO(review.created_at), "dd MMM yyyy", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-1 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-100">
                        <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                        <span className="font-black text-amber-700">
                          {Number(review.rating).toFixed(1)}
                        </span>
                      </div>
                    </div>

                    <p className="text-slate-600 leading-relaxed font-medium">
                      "{review.comment}"
                    </p>

                    {review.host_reply && (
                      <div className="mt-5 p-5 bg-slate-50 rounded-2xl border border-slate-200 md:ml-12 relative">
                        <div className="absolute top-0 left-6 -mt-2 w-4 h-4 bg-slate-50 border-t border-l border-slate-200 rotate-45"></div>
                        <p className="text-xs font-black text-slate-900 mb-1 flex items-center gap-1">
                          <Check className="w-3.5 h-3.5 text-[#f05e23]" />{" "}
                          Resposta do Anfitrião
                        </p>
                        <p className="text-sm font-medium text-slate-600">
                          {review.host_reply}
                        </p>
                      </div>
                    )}
                  </div>
                ))}
                {reviews.length > 3 && (
                  <Button
                    variant="outline"
                    className="w-full h-12 rounded-xl font-bold text-slate-700 border-slate-200"
                  >
                    Ler todas as avaliações
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="md:hidden flex-none bg-white border-t border-slate-200 p-4 pb-safe flex items-center justify-between shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.1)] z-50">
        <div>
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider mb-0.5">
            {activeTab === "hora"
              ? selectedSlots.length > 0
                ? `Total (${selectedSlots.length} horas)`
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

      {showProfileModal && (
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white rounded-3xl p-6 md:p-8 max-w-sm w-full shadow-2xl animate-in zoom-in-95 duration-300 relative">
            <button
              onClick={() => setShowProfileModal(false)}
              className="absolute top-4 right-4 text-slate-400 hover:text-slate-600"
            >
              <AlertCircle className="w-5 h-5 opacity-0" />
            </button>
            <div className="w-16 h-16 bg-amber-50 border border-amber-100 rounded-full flex items-center justify-center mb-4 mx-auto shadow-sm">
              <Crown className="w-8 h-8 text-amber-500" />
            </div>
            <h3 className="text-xl font-black text-center text-slate-900 mb-2 tracking-tight">
              Falta muito pouco!
            </h3>
            <p className="text-sm text-center text-slate-600 font-medium mb-6 leading-relaxed">
              Para confirmar sua reserva com total segurança, você precisa
              atingir o <b className="text-amber-600">Nível Bronze</b>. É rápido
              e leva menos de 1 minuto!
            </p>
            <div className="space-y-3">
              <Button
                onClick={() => {
                  setShowProfileModal(false);
                  if (onNavigateToProfile) onNavigateToProfile();
                }}
                className="w-full h-12 rounded-xl font-black bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg shadow-orange-500/25"
              >
                Completar Perfil
              </Button>
              <Button
                onClick={() => setShowProfileModal(false)}
                variant="ghost"
                className="w-full h-12 rounded-xl font-bold text-slate-500 hover:bg-slate-50"
              >
                Agora não
              </Button>
            </div>
          </div>
        </div>
      )}

      <CheckoutModal
        isOpen={isCheckoutOpen}
        onClose={handleCheckoutClose}
        onConfirm={(method) => {
          handleConfirmCheckout(method);
        }}
        loading={actionLoading}
        summary={checkoutSummary}
        room={roomData}
        selectedSlots={selectedSlots}
        selectedDate={selectedDate || new Date()}
        totalBaseBRL={totalHourlyCost}
      />
    </div>
  );
}
