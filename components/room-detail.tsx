// components/room-detail.tsx
"use client";

import { useEffect, useState, useRef, useMemo, useCallback } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import {
  sendBookingNotificationEmails,
  sendPaymentNotificationEmails,
} from "@/app/actions/send-email";
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
  Grid,
  Share,
  Shield,
  MessageSquare,
  Lock,
  User,
  Check,
  BadgeCheck,
  Clock,
  Building2,
  ArrowRight,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  CheckoutModal,
  CheckoutSummary,
  CardData,
} from "@/components/checkout-modal";
import { useMobileBack } from "@/hooks/use-mobile-back";

const AMENITIES_LIST = [
  { id: "wifi", label: "Wi-Fi de alta velocidade", icon: Wifi },
  { id: "tv", label: 'Smart TV 65" com HDMI', icon: Monitor },
  { id: "coffee", label: "Café e água cortesia", icon: Coffee },
  { id: "ac", label: "Ambiente climatizado", icon: Wind },
  { id: "printer", label: "Impressora disponível", icon: Printer },
  { id: "parking", label: "Estacionamento no local", icon: Car },
  { id: "security", label: "Portaria e segurança", icon: ShieldCheck },
];

export interface RoomDetailProps {
  roomId?: string | any;
  room?: any;
  onBack: () => void;
  onNavigateToProfile?: () => void;
  initialModality?: "hora" | "turno" | "fixo";
  onNavigateToChat?: () => void;
  onOpenFusionPass?: (tier?: string, hours?: number | null) => void;
}

const normalizeSlotLabel = (h: string): string => {
  if (!h || typeof h !== "string") return "";
  const parts = h.split("-");
  if (parts.length < 2) return h;

  const rawStart = parts[0].trim().replace("h", ":");
  const hourNumber = parseInt(rawStart.split(":")[0], 10);

  if (isNaN(hourNumber)) return "";

  const formattedHour = hourNumber.toString().padStart(2, "0");
  return `${formattedHour}:00 - ${formattedHour}:50`;
};

export function RoomDetail(props: RoomDetailProps) {
  const {
    onBack,
    onNavigateToProfile,
    initialModality = "hora",
    onNavigateToChat,
    onOpenFusionPass,
  } = props;
  const router = useRouter();
  const [supabase] = useState(() => createClient());
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
  const bookingConfirmedRef = useRef<boolean>(false);

  const bookingSectionRef = useRef<HTMLDivElement>(null);
  const [highlightSchedule, setHighlightSchedule] = useState(false);

  const [selectedShift, setSelectedShift] = useState<
    "morning" | "afternoon" | "night" | null
  >(null);
  const [selectedDays, setSelectedDays] = useState<number[]>([]);

  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [checkoutSummary, setCheckoutSummary] =
    useState<CheckoutSummary | null>(null);

  const [pixQrCode, setPixQrCode] = useState<string | null>(null);
  const [pixCopyPaste, setPixCopyPaste] = useState<string | null>(null);
  const [activeBookingId, setActiveBookingId] = useState<string | null>(null);

  const [isFavorited, setIsFavorited] = useState(false);
  const [isFavoriteLoading, setIsFavoriteLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);

  const [isAllPhotosOpen, setIsAllPhotosOpen] = useState(false);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const [currentPhotoIndex, setCurrentPhotoIndex] = useState(0);
  const lightboxRef = useRef<HTMLDivElement>(null);

  const [reviews, setReviews] = useState<any[]>([]);
  const [loadingReviews, setLoadingReviews] = useState(true);
  const [reviewFilter, setReviewFilter] = useState<number>(0);

  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPkgHours, setSelectedPkgHours] = useState<number | null>(null);

  const [showProfileModal, setShowProfileModal] = useState(false);
  const [currentTime, setCurrentTime] = useState<number>(Date.now());

  useEffect(() => {
    const interval = setInterval(() => {
      setCurrentTime(Date.now());
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  const scrollToBookingSection = () => {
    if (bookingSectionRef.current) {
      bookingSectionRef.current.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
      setHighlightSchedule(true);
      setTimeout(() => setHighlightSchedule(false), 1800);
    }
  };

  // Navega diretamente para o módulo Fusion Pass ("Mais horas, mais desconto") e abre os pacotes
  const handleGoToFusionPass = () => {
    const targetTier = roomData?.tier || "start";
    try {
      sessionStorage.setItem(
        "fusion_preselect_pass",
        JSON.stringify({
          tier: targetTier,
          hours: selectedPkgHours,
          roomId: roomData?.id,
        }),
      );
    } catch {}

    if (onOpenFusionPass) {
      onOpenFusionPass(targetTier, selectedPkgHours);
      return;
    }

    // Fecha o modal de detalhes da sala para revelar a tela principal onde está o Fusion Pass
    onBack();

    // Após fechar o RoomDetail, localiza e aciona automaticamente o banner "Fusion Pass / Mais horas, mais desconto"
    setTimeout(() => {
      window.dispatchEvent(
        new CustomEvent("fusion:open-pass", {
          detail: { tier: targetTier, hours: selectedPkgHours },
        }),
      );

      const candidates = Array.from(
        document.querySelectorAll("button, a, [role='button'], div"),
      );

      const passTrigger = candidates.find((el) => {
        const text = (el.textContent || "").toLowerCase();
        return (
          (text.includes("mais horas") && text.includes("mais desconto")) ||
          text.includes("comprar pacote") ||
          text.includes("recarregar") ||
          text.includes("adquirir pass") ||
          text.includes("fusion pass")
        );
      }) as HTMLElement | undefined;

      if (passTrigger) {
        passTrigger.scrollIntoView({ behavior: "smooth", block: "center" });
        const clickable =
          (passTrigger.closest("button") as HTMLElement) ||
          (passTrigger.querySelector("button") as HTMLElement) ||
          passTrigger;
        clickable.click();
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }, 280);
  };

  const fetchRoomBookings = useCallback(async () => {
    if (!roomData?.id) return;
    try {
      const res = await fetch(
        `/api/bookings/calculate?roomId=${roomData.id}&_t=${Date.now()}`,
        { cache: "no-store" },
      );
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.bookings)) {
          setRoomBookings(json.bookings);
          return;
        }
      }
    } catch (e) {
      console.error("Fallback para busca direta de reservas:", e);
    }

    const { data, error } = await supabase
      .from("bookings")
      .select(
        "id, start_time, end_time, status, created_at, asaas_payment_id, user_id",
      )
      .eq("room_id", roomData.id)
      .neq("status", "cancelled");

    if (!error && data) {
      setRoomBookings(data);
    }
  }, [roomData?.id, supabase]);

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

          const roomTier = data.tier || "start";
          const { data: pkgs } = await supabase
            .from("packages")
            .select("*")
            .eq("active", true)
            .eq("tier", roomTier)
            .order("hours", { ascending: true });

          if (pkgs && pkgs.length > 0) {
            setPackages(pkgs);
            setSelectedPkgHours(pkgs[1]?.hours || pkgs[0]?.hours);
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

    fetchRoomBookings();

    const pollInterval = setInterval(fetchRoomBookings, 8000);

    const channel = supabase
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
      clearInterval(pollInterval);
      supabase.removeChannel(channel);
    };
  }, [roomData?.id, supabase, fetchRoomBookings]);

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
          reviews.reduce(
            (acc: number, curr: any) => acc + Number(curr.rating || 0),
            0,
          ) / reviews.length
        ).toFixed(1)
      : "Novo";

  const filteredReviews =
    reviewFilter === 0
      ? reviews
      : reviews.filter((r: any) => r.rating === reviewFilter);

  const availableSlots = useMemo<string[]>(() => {
    if (!roomData || activeTab !== "hora") return [];

    const selectedDateStr = format(selectedDate, "yyyy-MM-dd");
    if (
      Array.isArray(roomData.blocked_dates) &&
      roomData.blocked_dates.includes(selectedDateStr)
    ) {
      return [];
    }

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

    let partialBlockedSlots: string[] = [];

    if (exceptions.length > 0) {
      const exception = exceptions.find(
        (e: any) => e?.date && isSameDay(new Date(e.date), selectedDate),
      );
      if (exception) {
        if (exception.type === "block" && exception.isFullDay) return [];
        if (exception.type === "block" && !exception.isFullDay) {
          partialBlockedSlots = (
            Array.isArray(exception.hours) ? exception.hours : []
          )
            .map((h: string) => normalizeSlotLabel(h))
            .filter(Boolean);
        }
        if (exception.type === "extra") {
          const extraHours: string[] = (
            Array.isArray(exception.hours) ? exception.hours : []
          )
            .map((h: string) => normalizeSlotLabel(h))
            .filter(Boolean);
          return extraHours;
        }
      }
    }

    const dayOfWeek = selectedDate.getDay();
    const configForDay = weekConfig.find((c: any) => c?.day === dayOfWeek);
    if (!configForDay || !configForDay.enabled) return [];

    let baseSlots: string[] = [];

    if (configForDay.rentalType === "hourly") {
      const hours: string[] = Array.isArray(configForDay.availableHours)
        ? configForDay.availableHours
        : [];
      baseSlots = hours
        .map((h: string) => normalizeSlotLabel(h))
        .filter(Boolean);
    } else {
      const shifts: string[] = Array.isArray(configForDay.selectedShifts)
        ? configForDay.selectedShifts
        : [];

      if (shifts.includes("morning"))
        baseSlots.push(
          "08:00 - 08:50",
          "09:00 - 09:50",
          "10:00 - 10:50",
          "11:00 - 11:50",
        );
      if (shifts.includes("afternoon"))
        baseSlots.push(
          "13:00 - 13:50",
          "14:00 - 14:50",
          "15:00 - 15:50",
          "16:00 - 16:50",
          "17:00 - 17:50",
        );
      if (shifts.includes("night"))
        baseSlots.push(
          "18:00 - 18:50",
          "19:00 - 19:50",
          "20:00 - 20:50",
          "21:00 - 21:50",
        );
    }

    if (partialBlockedSlots.length > 0) {
      return baseSlots.filter((s: string) => !partialBlockedSlots.includes(s));
    }

    return baseSlots;
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
    (acc: number, slotKey: string) => acc + getSlotPrice(slotKey),
    0,
  );

  const toggleSlot = (slotKey: string) => {
    setSelectedSlots((prev: string[]) =>
      prev.includes(slotKey)
        ? prev.filter((s: string) => s !== slotKey)
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
    setSelectedDays((prev: number[]) =>
      prev.includes(day)
        ? prev.filter((d: number) => d !== day)
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

  const isSlotBooked = useCallback(
    (slotKey: string) => {
      try {
        const [dateStr, timeStr] = slotKey.split("|");
        const parts = timeStr.split(" - ");
        const startSlotStr = parts[0];
        const endSlotStr = parts[1] || parts[0];

        const slotStart = parseSlotDate(dateStr, startSlotStr).getTime();
        const rawSlotEnd = parseSlotDate(dateStr, endSlotStr).getTime();
        const slotEnd =
          rawSlotEnd > slotStart ? rawSlotEnd : slotStart + 50 * 60 * 1000;

        return roomBookings.some((b: any) => {
          if (b.status === "cancelled" || b.status === "rejected") return false;

          if (
            (b.status === "pending_payment" || b.status === "pending") &&
            b.created_at
          ) {
            const lockTime = new Date(b.created_at).getTime();
            const now = currentTime;

            if (!b.asaas_payment_id && now - lockTime > 6 * 60 * 1000) {
              return false;
            }

            if (b.asaas_payment_id && now - lockTime > 30 * 60 * 1000) {
              return false;
            }
          }

          const bStart = new Date(b.start_time).getTime();
          const rawBEnd = new Date(b.end_time).getTime();
          const bEnd = rawBEnd > bStart ? rawBEnd : bStart + 50 * 60 * 1000;

          return slotStart < bEnd && slotEnd > bStart;
        });
      } catch {
        return false;
      }
    },
    [roomBookings, currentTime],
  );

  const isSlotPast = useCallback(
    (slotKey: string) => {
      try {
        const [dateStr, timeStr] = slotKey.split("|");
        const startSlotStr = timeStr.split(" - ")[0];
        const slotStart = parseSlotDate(dateStr, startSlotStr).getTime();
        return slotStart < currentTime;
      } catch {
        return true;
      }
    },
    [currentTime],
  );

  const freeSlotsForSelectedDate = useMemo<string[]>(() => {
    const datePrefix = format(selectedDate, "yyyy-MM-dd");
    return availableSlots.filter((slotTime: string) => {
      const slotKey = `${datePrefix}|${slotTime}`;
      return !isSlotBooked(slotKey) && !isSlotPast(slotKey);
    });
  }, [availableSlots, selectedDate, isSlotBooked, isSlotPast]);

  const handleAction = async () => {
    if (activeTab === "hora" && selectedSlots.length === 0) {
      scrollToBookingSection();
      return;
    }
    if (
      activeTab === "turno" &&
      (!selectedShift || selectedDays.length === 0)
    ) {
      scrollToBookingSection();
      return toast({
        title: "Selecione o turno e os dias",
        description: "Escolha o turno e os dias da semana desejados abaixo.",
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

        await fetchRoomBookings();

        const sortedSlots = [...selectedSlots].sort();

        for (const slotKey of sortedSlots) {
          if (isSlotBooked(slotKey)) {
            setSelectedSlots([]);
            throw new Error(
              "Um dos horários selecionados acabou de ser reservado por outra pessoa. Escolha outro horário.",
            );
          }
        }

        const bookingPayloads = sortedSlots.map((slotKey: string) => {
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
            status: "pending_payment",
          };
        });

        bookingConfirmedRef.current = false;

        const { data: lockedData, error: lockError } = await supabase
          .from("bookings")
          .insert(bookingPayloads)
          .select("id");

        if (lockError || !lockedData) {
          await fetchRoomBookings();
          setSelectedSlots([]);
          throw new Error(
            "Este horário acabou de ser reservado por outro profissional. Escolha outro horário.",
          );
        }

        const createdLockIds = lockedData.map((d: any) => d.id);
        await fetchRoomBookings();

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
            slots: bookingPayloads.map((b) => ({
              startTime: b.start_time,
              endTime: b.end_time,
            })),
            lockIds: createdLockIds,
          }),
        });

        const contentType = response.headers.get("content-type");
        if (!contentType || !contentType.includes("application/json")) {
          await supabase.from("bookings").delete().in("id", createdLockIds);
          await fetchRoomBookings();
          throw new Error("Erro de rota: A API de cálculo não foi encontrada.");
        }

        const summaryData = await response.json();
        if (!response.ok) {
          await supabase.from("bookings").delete().in("id", createdLockIds);
          await fetchRoomBookings();
          throw new Error(summaryData.error || "Erro ao calcular valores.");
        }

        const { data: txs } = await supabase
          .from("wallet_transactions")
          .select("amount, tier, expires_at")
          .eq("user_id", user.id);

        let masterBal = 0;
        let vipBal = 0;
        let startBal = 0;
        const now = new Date();

        if (txs) {
          txs.forEach((tx: any) => {
            if (tx.amount > 0 && tx.expires_at && new Date(tx.expires_at) < now)
              return;
            const amt = Number(tx.amount);
            if (tx.tier === "master") masterBal += amt;
            else if (tx.tier === "vip") vipBal += amt;
            else startBal += amt;
          });
        }

        const roomTier = roomData.tier || "start";
        let calcUsedTier = roomTier;
        const required = summaryData.creditsRequired;

        if (roomTier === "start") {
          if (startBal >= required) calcUsedTier = "start";
          else if (vipBal >= required) calcUsedTier = "vip";
          else if (masterBal >= required) calcUsedTier = "master";
        } else if (roomTier === "vip") {
          if (vipBal >= required) calcUsedTier = "vip";
          else if (masterBal >= required) calcUsedTier = "master";
        } else {
          calcUsedTier = "master";
        }

        setCheckoutSummary({
          ...summaryData,
          usedTier: calcUsedTier,
          lockIds: createdLockIds,
        });
        setIsCheckoutOpen(true);
      } else {
        toast({
          title: "Iniciando negociação...",
          description: "Criando canal seguro com a clínica e a Fusion...",
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
          title: "Canal aberto!",
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

  const handleConfirmCheckout = async (
    method: "wallet" | "pix" | "card",
    appliedCoupon?: any,
    cardData?: CardData,
  ) => {
    if (!checkoutSummary) return;
    setActionLoading(true);

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const lockIds: string[] = (checkoutSummary as any).lockIds || [];

      let finalCreditsRequired = checkoutSummary.creditsRequired;
      let finalHourlyCost = totalHourlyCost;

      if (appliedCoupon) {
        if (appliedCoupon.type === "percentage") {
          finalCreditsRequired -=
            finalCreditsRequired * (appliedCoupon.discount_value / 100);
          finalHourlyCost -=
            finalHourlyCost * (appliedCoupon.discount_value / 100);
        } else if (appliedCoupon.type === "fixed") {
          finalCreditsRequired -= appliedCoupon.discount_value;
          finalHourlyCost -=
            (appliedCoupon.discount_value / checkoutSummary.creditsRequired) *
            finalHourlyCost;
        } else if (appliedCoupon.type === "bogo") {
          finalCreditsRequired -= 1;
          finalHourlyCost -= finalHourlyCost / checkoutSummary.creditsRequired;
        }
        finalCreditsRequired = Math.max(0, finalCreditsRequired);
        finalHourlyCost = Math.max(0, finalHourlyCost);
      }

      if (method === "wallet") {
        const creditCostPerHour = finalCreditsRequired / selectedSlots.length;
        const usedTier = checkoutSummary.usedTier || roomData.tier || "start";

        const { error: updateError } = await supabase
          .from("bookings")
          .update({
            total_cost: creditCostPerHour,
            status: "confirmed",
          })
          .in("id", lockIds);

        if (updateError) {
          throw new Error(
            "Este horário acabou de ser reservado por outro profissional.",
          );
        }

        bookingConfirmedRef.current = true;

        const { error: walletError } = await supabase
          .from("wallet_transactions")
          .insert({
            user_id: user.id,
            amount: -finalCreditsRequired,
            type: "usage",
            tier: usedTier,
            description: `Reserva em Créditos (${usedTier.toUpperCase()}): ${roomData.name}`,
          });
        if (walletError) throw walletError;

        if (appliedCoupon) {
          await supabase
            .from("coupons")
            .update({ current_uses: appliedCoupon.current_uses + 1 })
            .eq("id", appliedCoupon.id);
          await supabase.from("coupon_uses").insert({
            coupon_id: appliedCoupon.id,
            user_id: user.id,
            booking_id: lockIds[0],
            discount_applied:
              checkoutSummary.creditsRequired - finalCreditsRequired,
          });
        }

        if (lockIds && lockIds[0]) {
          sendBookingNotificationEmails(lockIds[0]).catch((e) =>
            console.error("Erro ao enviar e-mail de reserva:", e),
          );
        }

        await fetchRoomBookings();

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
          title: "Processando pagamento...",
          description: "Por favor, aguarde um instante.",
        });

        const paymentRef = lockIds[0];

        const { error: updateError } = await supabase
          .from("bookings")
          .update({
            status: "pending_payment",
          })
          .in("id", lockIds);

        if (updateError) throw updateError;

        if (appliedCoupon) {
          await supabase
            .from("coupons")
            .update({ current_uses: appliedCoupon.current_uses + 1 })
            .eq("id", appliedCoupon.id);
          await supabase.from("coupon_uses").insert({
            coupon_id: appliedCoupon.id,
            user_id: user.id,
            booking_id: lockIds[0],
            discount_applied: totalHourlyCost - finalHourlyCost,
          });
        }

        let formattedCard = undefined;
        let holderInfo = undefined;

        if (method === "card" && cardData) {
          const [expMonth, expYear] = cardData.expiry.split("/");
          const yearFormatted =
            expYear?.length === 2 ? `20${expYear}` : expYear;

          formattedCard = {
            holderName: cardData.name.toUpperCase(),
            number: cardData.number.replace(/\D/g, ""),
            expiryMonth: expMonth?.trim(),
            expiryYear: yearFormatted?.trim(),
            ccv: cardData.cvv,
          };

          const { data: userProfile } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

          holderInfo = {
            name: cardData.name.toUpperCase(),
            email: user.email || "medico@fusionclinic.com.br",
            cpfCnpj: cardData.cpf.replace(/\D/g, ""),
            postalCode: userProfile?.cep?.replace(/\D/g, "") || "01310100",
            addressNumber: userProfile?.address_number || "1000",
            phone: userProfile?.phone?.replace(/\D/g, "") || "11999999999",
          };
        }

        const response = await fetch("/api/checkout", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            checkoutType: "booking",
            price: finalHourlyCost,
            paymentRef: paymentRef,
            bookingIds: lockIds,
            billingType: method === "card" ? "CREDIT_CARD" : "PIX",
            creditCard: formattedCard,
            creditCardHolderInfo: holderInfo,
            cardData: cardData,
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error);

        await fetchRoomBookings();

        if (method === "pix" && data.pixQrCode) {
          setPixQrCode(data.pixQrCode);
          setPixCopyPaste(data.pixCopyPaste);
          setActiveBookingId(lockIds[0]);
          setActionLoading(false);
          return;
        }

        bookingConfirmedRef.current = true;

        if (lockIds && lockIds[0]) {
          await Promise.allSettled([
            sendBookingNotificationEmails(lockIds[0]),
            sendPaymentNotificationEmails({
              userId: user.id,
              amountBrl: finalHourlyCost,
              paymentMethod: "Cartão de Crédito",
              description: `Reserva Avulsa: ${roomData.name}`,
              hostId: roomData.host_id,
            }),
          ]);
        }

        await fetchRoomBookings();

        toast({
          title: "Pagamento Aprovado! 🎉",
          description: "Sua reserva foi confirmada com sucesso.",
        });
        setIsCheckoutOpen(false);
        setCheckoutSummary(null);
        setSelectedSlots([]);
        window.location.reload();
      }
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro na confirmação",
        description: err.message,
      });
      throw err;
    } finally {
      setActionLoading(false);
    }
  };

  const checkoutSummaryRef = useRef<any>(null);

  useEffect(() => {
    checkoutSummaryRef.current = checkoutSummary;
  }, [checkoutSummary]);

  const handleCheckoutClose = useCallback(async () => {
    setIsCheckoutOpen(false);
    setSelectedSlots([]);
    setPixQrCode(null);
    setPixCopyPaste(null);
    setActiveBookingId(null);

    if (bookingConfirmedRef.current) {
      setCheckoutSummary(null);
      await fetchRoomBookings();
      return;
    }

    const summary = checkoutSummaryRef.current;
    if (summary && summary.lockIds) {
      const lockIds = summary.lockIds;
      const supabaseClient = createClient();

      const { data: checkBookings } = await supabaseClient
        .from("bookings")
        .select("id, status")
        .in("id", lockIds);

      const pendingIds =
        checkBookings
          ?.filter((b: any) => b.status === "pending_payment")
          .map((b: any) => b.id) || [];

      if (pendingIds.length > 0) {
        setRoomBookings((prevBookings: any[]) =>
          prevBookings.filter((b: any) => !pendingIds.includes(b.id)),
        );
        await supabaseClient.from("bookings").delete().in("id", pendingIds);
      }
    }

    setCheckoutSummary(null);
    await fetchRoomBookings();
  }, [fetchRoomBookings]);

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
      text: `Confira este espaço na Fusion Clinic: ${roomData?.name || "Consultório"}`,
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
        <Loader2 className="h-8 w-8 animate-spin text-[#BF4B24] mb-3" />
        <h2 className="text-base font-bold text-slate-800">
          Carregando detalhes do consultório...
        </h2>
      </div>
    );
  }

  if (!roomData) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center p-6 text-center">
        <AlertCircle className="h-12 w-12 text-slate-300 mb-4" />
        <h2 className="text-xl font-bold text-slate-900 mb-2">
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
  const allImages: string[] = [roomData.image_url, ...rawGallery].filter(
    Boolean,
  );
  const imagesToShow: string[] = allImages.slice(0, 5);
  const totalImages = imagesToShow.length;
  const isPartner = roomData.is_partner === true;
  const roomModalities: string[] = Array.isArray(roomData.modalities)
    ? roomData.modalities
    : [];

  const displayAmenities: string[] =
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

  const clinicHostName = roomData.profiles?.full_name || "Equipe Fusion Clinic";

  return (
    <div className="fixed inset-0 z-[100] bg-white flex flex-col animate-in slide-in-from-bottom-4 duration-300">
      {/* TOP BAR LIMPA */}
      <div className="flex-none bg-white z-30 border-b border-slate-100 md:border-transparent">
        <div className="max-w-5xl mx-auto pt-5 px-5 flex justify-between items-center pb-3.5">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 text-slate-900 transition-colors hover:bg-slate-50"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleShare}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 transition-colors hover:bg-slate-50"
            >
              <Share className="w-4 h-4 text-slate-900" />
            </button>
            <button
              onClick={handleFavoriteToggle}
              disabled={isFavoriteLoading}
              className="flex h-10 w-10 items-center justify-center rounded-full bg-white border border-slate-200 transition-colors hover:bg-slate-50 disabled:opacity-50"
            >
              <Heart
                className={`w-5 h-5 transition-colors ${
                  isFavorited ? "fill-red-500 text-red-500" : "text-slate-900"
                }`}
              />
            </button>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto pb-28 md:pb-12 scrollbar-hide">
        {/* CABEÇALHO EDITORIAL DO ESPAÇO */}
        <div className="max-w-5xl mx-auto px-5 pt-2 pb-5">
          {isPartner && (
            <div className="mb-2.5 inline-flex items-center gap-1.5 bg-stone-100 text-stone-800 border border-stone-200/80 text-[11px] font-bold px-2.5 py-1 rounded-md">
              <BadgeCheck className="w-3.5 h-3.5 text-[#BF4B24]" />
              Espaço Verificado • Fusion Partner
            </div>
          )}

          <div className="flex justify-between items-start gap-4 mb-2">
            <h1 className="text-2xl md:text-3xl font-bold text-slate-900 tracking-tight leading-tight">
              {roomData.name || "Consultório"}
            </h1>
            <div className="flex items-center gap-1 bg-stone-100 px-2.5 py-1 rounded-lg shrink-0 mt-0.5">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span className="text-xs font-bold text-slate-800">
                {avgRating}{" "}
                <span className="text-slate-500 font-medium hidden md:inline">
                  ({reviews.length})
                </span>
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs md:text-sm text-slate-600">
            <div className="flex items-center gap-1 font-semibold text-slate-700">
              <MapPin className="w-3.5 h-3.5 text-[#BF4B24]" />
              {address.neighborhood
                ? `${address.neighborhood}, ${address.city || ""}`
                : address.city
                  ? `${address.city}, ${address.state}`
                  : "Localização verificada"}
            </div>
            <span className="text-slate-300">•</span>
            <div className="flex items-center gap-1 text-slate-600">
              <Users className="w-3.5 h-3.5 text-slate-400" />
              Até {address.capacity || 4} pessoas
            </div>
          </div>
        </div>

        {/* GALERIA MOBILE */}
        <div className="md:hidden relative w-full h-[34vh] bg-slate-100 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide touch-pan-x">
          {allImages.length > 0 ? (
            allImages.map((img: string, idx: number) => (
              <div
                key={idx}
                onClick={() => setIsAllPhotosOpen(true)}
                className="relative w-full h-full shrink-0 snap-center snap-always cursor-pointer"
              >
                <Image
                  src={img}
                  alt={`Foto ${idx + 1}`}
                  fill
                  quality={75}
                  className="object-cover"
                  sizes="100vw"
                  priority={idx < 3}
                />
              </div>
            ))
          ) : (
            <div className="w-full h-full flex items-center justify-center text-slate-400 font-medium bg-slate-100">
              Sem fotos
            </div>
          )}
          {allImages.length > 0 && (
            <button
              onClick={() => setIsAllPhotosOpen(true)}
              className="absolute bottom-3.5 right-4 bg-slate-900/80 backdrop-blur-xs text-white font-semibold text-xs py-1.5 px-3 rounded-lg flex items-center gap-1.5"
            >
              <Grid className="w-3.5 h-3.5" /> 1/{allImages.length}
            </button>
          )}
        </div>

        {/* BARRA RÁPIDA DE HORÁRIOS MOBILE (LOGO ABAIXO DA FOTO) */}
        <div className="md:hidden px-5 pt-4">
          <div className="bg-stone-50 border border-stone-200/90 rounded-2xl p-3.5 flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-white border border-stone-200 flex items-center justify-center shrink-0">
                  <CalendarIcon className="w-4 h-4 text-[#BF4B24]" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-900">
                    {isSameDay(selectedDate, today)
                      ? "Disponibilidade para Hoje"
                      : format(selectedDate, "dd 'de' MMMM", { locale: ptBR })}
                  </p>
                  <p className="text-[11px] text-slate-500 font-medium">
                    {freeSlotsForSelectedDate.length > 0
                      ? `${freeSlotsForSelectedDate.length} horário(s) livre(s) nesta data`
                      : "Toque para escolher outra data no calendário"}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={scrollToBookingSection}
                className="text-xs font-bold text-[#BF4B24] bg-white border border-stone-200 px-3 py-2 rounded-xl shrink-0 active:scale-95 transition-transform"
              >
                Ver calendário
              </button>
            </div>

            {activeTab === "hora" && freeSlotsForSelectedDate.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide pt-1">
                {freeSlotsForSelectedDate
                  .slice(0, 5)
                  .map((slotTime: string) => {
                    const slotKey = `${format(selectedDate, "yyyy-MM-dd")}|${slotTime}`;
                    const isSelected = selectedSlots.includes(slotKey);
                    return (
                      <button
                        key={slotKey}
                        type="button"
                        onClick={() => toggleSlot(slotKey)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap border transition-colors shrink-0 ${
                          isSelected
                            ? "bg-[#BF4B24] text-white border-[#BF4B24]"
                            : "bg-white text-slate-700 border-stone-200 hover:border-stone-300"
                        }`}
                      >
                        {slotTime.split(" - ")[0]}
                      </button>
                    );
                  })}
                {freeSlotsForSelectedDate.length > 5 && (
                  <button
                    type="button"
                    onClick={scrollToBookingSection}
                    className="px-3 py-1.5 rounded-lg text-xs font-bold text-slate-600 bg-stone-200/60 whitespace-nowrap shrink-0"
                  >
                    +{freeSlotsForSelectedDate.length - 5} horários
                  </button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* GALERIA DESKTOP */}
        <div className="hidden md:block max-w-5xl mx-auto px-5 mb-8">
          <div className="grid grid-cols-4 grid-rows-2 gap-2 h-[420px] w-full rounded-2xl overflow-hidden relative bg-slate-100">
            {imagesToShow.map((img: string, idx: number) => {
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
                    className="object-cover transition-all duration-300 group-hover:scale-[1.01] group-hover:brightness-95 cursor-pointer"
                    sizes="(max-width: 768px) 100vw, 50vw"
                    priority={idx === 0}
                  />
                </div>
              );
            })}
            {allImages.length > 5 && (
              <button
                onClick={() => setIsAllPhotosOpen(true)}
                className="absolute bottom-4 right-4 bg-white hover:bg-slate-50 border border-slate-200 text-slate-900 font-semibold text-xs py-2 px-4 rounded-xl flex items-center gap-2 shadow-sm transition-transform active:scale-95"
              >
                <Grid className="w-3.5 h-3.5" /> Mostrar todas as{" "}
                {allImages.length} fotos
              </button>
            )}
          </div>
        </div>

        <div className="px-5 py-6 max-w-5xl mx-auto flex flex-col lg:grid lg:grid-cols-12 gap-10">
          <div className="order-1 lg:order-1 lg:col-span-7 space-y-8">
            {/* CREDIBILIDADE HUMANA DO ANFITRIÃO */}
            <div className="flex items-center justify-between pb-6 border-b border-slate-100">
              <div className="flex items-center gap-3.5">
                <div className="w-11 h-11 rounded-full bg-stone-100 border border-stone-200 flex items-center justify-center text-slate-700 shrink-0">
                  <Building2 className="w-5 h-5 text-[#BF4B24]" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Espaço gerenciado por {clinicHostName}
                  </p>
                  <p className="text-xs text-slate-500 font-medium mt-0.5">
                    Check-in digital na porta • Hora clínica de 50 min
                  </p>
                </div>
              </div>
            </div>

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-2.5">
                Sobre o consultório
              </h2>
              <p className="text-slate-600 leading-relaxed text-sm">
                {roomData.description ||
                  "Consultório preparado para atendimentos de saúde, com isolamento acústico, climatização e recepção equipada para receber seus pacientes com conforto."}
              </p>
            </section>

            <div className="w-full h-px bg-slate-100" />

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                O que este espaço oferece
              </h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {displayAmenities.map((amId: string) => {
                  const amenityDef = AMENITIES_LIST.find((a) => a.id === amId);
                  if (!amenityDef) return null;
                  const Icon = amenityDef.icon;
                  return (
                    <div
                      key={amId}
                      className="flex items-center gap-3 p-3.5 rounded-xl bg-stone-50/70 border border-stone-200/70"
                    >
                      <Icon className="w-5 h-5 text-slate-700 shrink-0" />
                      <span className="text-xs font-semibold text-slate-800">
                        {amenityDef.label}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <div className="w-full h-px bg-slate-100" />

            <section>
              <h2 className="text-lg font-bold text-slate-900 mb-4">
                Localização aproximada
              </h2>
              <div className="relative w-full h-60 bg-slate-100 rounded-2xl overflow-hidden border border-slate-200">
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
                  <div className="w-40 h-40 bg-[#BF4B24]/15 border border-[#BF4B24]/40 rounded-full"></div>
                </div>
                <div className="absolute bottom-3.5 left-3.5 right-3.5 md:right-auto md:w-64 bg-white/95 backdrop-blur-xs px-4 py-2.5 rounded-xl shadow-xs border border-slate-200/80 flex items-center gap-3 pointer-events-none">
                  <div className="w-8 h-8 rounded-lg bg-stone-100 flex items-center justify-center shrink-0">
                    <MapPin className="w-4 h-4 text-[#BF4B24]" />
                  </div>
                  <div className="overflow-hidden">
                    <p className="text-xs font-bold text-slate-900 truncate">
                      {address.neighborhood || "Região Central"}
                    </p>
                    <p className="text-[11px] font-medium text-slate-500 truncate">
                      {address.city
                        ? `${address.city}, ${address.state}`
                        : "Localização verificada"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="bg-stone-50 rounded-xl p-3.5 mt-3 border border-stone-200/70 flex items-start gap-3">
                <Lock className="w-4 h-4 text-slate-600 shrink-0 mt-0.5" />
                <p className="text-xs text-slate-600 leading-relaxed">
                  Para privacidade da clínica, o número exato, sala e instruções
                  de acesso são liberados assim que sua reserva é confirmada.
                </p>
              </div>
            </section>

            {/* PACOTES DE HORAS (COM VALOR TOTAL DO PACOTE, ECONOMIA TOTAL E REDIRECIONAMENTO AUTOMÁTICO) */}
            {packages.length > 0 && activeTab === "hora" && (
              <section className="pt-2">
                <div className="bg-stone-50 rounded-2xl p-5 md:p-6 border border-stone-200/90">
                  <div className="flex flex-col md:flex-row gap-6">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-[11px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded bg-slate-900 text-white">
                          Fusion Pass
                        </span>
                        <span className="text-xs font-bold text-[#BF4B24]">
                          Mais horas, mais desconto
                        </span>
                      </div>

                      <h3 className="text-lg font-bold text-slate-900 mb-1.5">
                        Pacotes de horas para{" "}
                        {roomData.tier === "master"
                          ? "Salas Master"
                          : roomData.tier === "vip"
                            ? "Salas VIP"
                            : "Salas Essencial"}
                      </h3>

                      <p className="text-xs text-slate-600 mb-4 leading-relaxed">
                        A hora avulsa nesta sala custa{" "}
                        <strong className="text-slate-900">
                          R$ {getBasePrice().toFixed(2).replace(".", ",")}/h
                        </strong>
                        . Comprando um pacote de horas, você reduz o custo por
                        consulta e usa os créditos quando quiser:
                      </p>

                      <div className="grid grid-cols-3 gap-2">
                        {packages.map((pkg: any) => {
                          const isSelected = selectedPkgHours === pkg.hours;
                          const pkgTotal = Number(pkg.price || 0);
                          return (
                            <button
                              key={pkg.id}
                              type="button"
                              onClick={() => setSelectedPkgHours(pkg.hours)}
                              className={`p-3 rounded-xl transition-all border text-left flex flex-col justify-between ${
                                isSelected
                                  ? "bg-slate-900 text-white border-slate-900 shadow-xs"
                                  : "bg-white text-slate-700 border-stone-200 hover:border-stone-300"
                              }`}
                            >
                              <span className="text-xs font-bold block">
                                {pkg.hours} horas
                              </span>
                              <span
                                className={`text-[11px] font-semibold mt-0.5 block ${
                                  isSelected
                                    ? "text-stone-300"
                                    : "text-slate-500"
                                }`}
                              >
                                R$ {pkgTotal.toFixed(0)} total
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div className="md:w-64 shrink-0 flex flex-col justify-center border-t md:border-t-0 md:border-l border-stone-200 pt-4 md:pt-0 md:pl-6">
                      {packages
                        .filter((p: any) => p.hours === selectedPkgHours)
                        .map((pkg: any) => {
                          const pkgHours = Number(pkg.hours || 1);
                          const pkgTotalBRL = Number(pkg.price || 0);
                          const hourlyRate = pkgTotalBRL / pkgHours;
                          const basePrice = getBasePrice();
                          const avulsoTotalBRL = basePrice * pkgHours;
                          const totalSavingsBRL = Math.max(
                            0,
                            avulsoTotalBRL - pkgTotalBRL,
                          );
                          const hourlySavingsBRL = Math.max(
                            0,
                            basePrice - hourlyRate,
                          );
                          const savingsPercent =
                            avulsoTotalBRL > 0
                              ? Math.round(
                                  (totalSavingsBRL / avulsoTotalBRL) * 100,
                                )
                              : 0;

                          return (
                            <div
                              key={pkg.id}
                              className="flex flex-col justify-center space-y-3"
                            >
                              <div>
                                <p className="text-[11px] font-semibold text-slate-500 mb-0.5">
                                  Valor da hora no pacote ({pkgHours}h)
                                </p>
                                <div className="flex items-baseline gap-1.5">
                                  <span className="text-2xl font-bold text-slate-900">
                                    R$ {hourlyRate.toFixed(2).replace(".", ",")}
                                  </span>
                                  <span className="text-xs text-slate-500 font-semibold">
                                    /hora
                                  </span>
                                  {hourlySavingsBRL > 0 && (
                                    <span className="text-[11px] text-slate-400 line-through ml-1">
                                      R${" "}
                                      {basePrice.toFixed(2).replace(".", ",")}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {/* COMPARATIVO DO VALOR TOTAL DO PACOTE vs AVULSO */}
                              <div className="bg-white rounded-xl p-3 border border-stone-200/90 space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-slate-500 font-medium">
                                    Total do pacote ({pkgHours}h):
                                  </span>
                                  <span className="font-bold text-slate-900">
                                    R${" "}
                                    {pkgTotalBRL.toLocaleString("pt-BR", {
                                      minimumFractionDigits: 2,
                                      maximumFractionDigits: 2,
                                    })}
                                  </span>
                                </div>

                                {totalSavingsBRL > 0 && (
                                  <div className="flex items-center justify-between text-[11px]">
                                    <span className="text-slate-400">
                                      {pkgHours}h no avulso sairiam por:
                                    </span>
                                    <span className="text-slate-400 line-through font-medium">
                                      R${" "}
                                      {avulsoTotalBRL.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}
                                    </span>
                                  </div>
                                )}

                                {totalSavingsBRL > 0 && (
                                  <div className="pt-1.5 border-t border-stone-100 flex items-center justify-between">
                                    <span className="text-[11px] font-bold text-emerald-700 flex items-center gap-1">
                                      <TrendingDown className="w-3.5 h-3.5" />
                                      Economia total:
                                    </span>
                                    <span className="text-xs font-black text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/60">
                                      R${" "}
                                      {totalSavingsBRL.toLocaleString("pt-BR", {
                                        minimumFractionDigits: 2,
                                        maximumFractionDigits: 2,
                                      })}{" "}
                                      (-{savingsPercent}%)
                                    </span>
                                  </div>
                                )}
                              </div>

                              <Button
                                type="button"
                                onClick={handleGoToFusionPass}
                                className="w-full h-11 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold text-xs rounded-xl shadow-xs flex items-center justify-center gap-1.5"
                              >
                                Ver pacotes e assinar ({pkgHours}h)
                                <ArrowRight className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          );
                        })}
                    </div>
                  </div>
                </div>
              </section>
            )}
          </div>

          {/* COLUNA DE AGENDAMENTO */}
          <div
            ref={bookingSectionRef}
            className="order-2 lg:order-2 lg:col-span-5 flex flex-col gap-6 scroll-mt-20"
          >
            <div
              className={`bg-white p-5 md:p-6 border rounded-2xl transition-all duration-300 md:shadow-md md:h-fit md:sticky md:top-24 flex flex-col ${
                highlightSchedule
                  ? "border-[#BF4B24] ring-4 ring-[#BF4B24]/15"
                  : "border-slate-200"
              }`}
            >
              {roomModalities.length > 1 && (
                <div className="flex bg-stone-100 p-1 rounded-xl mb-5">
                  {roomModalities.includes("hora") && (
                    <button
                      onClick={() => setActiveTab("hora")}
                      className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${
                        activeTab === "hora"
                          ? "bg-white shadow-xs text-slate-900"
                          : "text-slate-500"
                      }`}
                    >
                      Por Hora
                    </button>
                  )}
                  {roomModalities.includes("turno") && (
                    <button
                      onClick={() => setActiveTab("turno")}
                      className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${
                        activeTab === "turno"
                          ? "bg-white shadow-xs text-slate-900"
                          : "text-slate-500"
                      }`}
                    >
                      Por Turno
                    </button>
                  )}
                  {roomModalities.includes("fixo") && (
                    <button
                      onClick={() => setActiveTab("fixo")}
                      className={`flex-1 text-xs font-bold py-2 rounded-lg transition-all ${
                        activeTab === "fixo"
                          ? "bg-white shadow-xs text-slate-900"
                          : "text-slate-500"
                      }`}
                    >
                      Fixo Mensal
                    </button>
                  )}
                </div>
              )}

              {activeTab === "hora" && (
                <section className="animate-in fade-in">
                  <div className="flex items-center justify-between mb-4">
                    <div>
                      <h2 className="text-base font-bold text-slate-900">
                        Escolha a data e os horários
                      </h2>
                      <p className="text-xs text-slate-500">
                        Selecione um ou mais horários para reservar
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="text-lg font-bold text-slate-900">
                        R$ {getBasePrice()}
                      </span>
                      <span className="text-xs text-slate-500 block">
                        /hora
                      </span>
                    </div>
                  </div>

                  {/* CALENDÁRIO */}
                  <div className="w-full bg-stone-50/60 rounded-xl border border-stone-200/80 p-3.5 mb-5">
                    <div className="flex items-center justify-between mb-3">
                      <button
                        onClick={prevMonth}
                        disabled={!canGoPrevMonth}
                        className={`p-1.5 rounded-lg transition-colors ${
                          canGoPrevMonth
                            ? "text-slate-600 hover:bg-stone-200/60"
                            : "text-slate-200 cursor-not-allowed"
                        }`}
                      >
                        <ChevronLeft className="w-4 h-4" />
                      </button>
                      <div className="font-bold text-slate-900 capitalize text-sm">
                        {format(currentMonthView, "MMMM 'de' yyyy", {
                          locale: ptBR,
                        })}
                      </div>
                      <button
                        onClick={nextMonth}
                        className="p-1.5 rounded-lg text-slate-600 hover:bg-stone-200/60 transition-colors"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 text-center mb-1.5">
                      {["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"].map(
                        (d: string) => (
                          <div
                            key={d}
                            className="text-[10px] font-semibold text-slate-400 uppercase"
                          >
                            {d}
                          </div>
                        ),
                      )}
                    </div>

                    <div className="grid grid-cols-7 gap-y-1.5 gap-x-1">
                      {calendarDays.map((day: Date) => {
                        const dateStr = format(day, "yyyy-MM-dd");
                        const isSelected = isSameDay(day, selectedDate);
                        const isPast =
                          isBefore(day, today) && !isSameDay(day, today);
                        const isCurrentMonth = isSameMonth(
                          day,
                          currentMonthView,
                        );
                        const hasSelection = selectedSlots.some(
                          (slotKey: string) => slotKey.startsWith(dateStr),
                        );

                        return (
                          <button
                            key={day.toISOString()}
                            onClick={() => {
                              if (!isPast) setSelectedDate(day);
                            }}
                            disabled={isPast || !isCurrentMonth}
                            className={`relative h-9 w-full rounded-lg text-xs font-semibold flex flex-col items-center justify-center transition-colors ${
                              !isCurrentMonth ? "invisible" : ""
                            } ${
                              isPast ? "text-slate-300 cursor-not-allowed" : ""
                            } ${
                              isSelected
                                ? "bg-slate-900 text-white font-bold"
                                : ""
                            } ${
                              !isSelected && !isPast && isCurrentMonth
                                ? "text-slate-700 hover:bg-stone-200/60"
                                : ""
                            }`}
                          >
                            <span className="relative z-10">
                              {format(day, "d")}
                            </span>
                            {hasSelection && (
                              <span
                                className={`absolute bottom-1 w-1.5 h-1.5 rounded-full ${
                                  isSelected ? "bg-[#BF4B24]" : "bg-[#BF4B24]"
                                }`}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* GRADE DE HORÁRIOS */}
                  <div className="flex items-center justify-between mb-2.5">
                    <h3 className="text-xs font-bold text-slate-800">
                      Horários em{" "}
                      <span className="text-[#BF4B24]">
                        {format(selectedDate, "dd/MM (EEEE)", {
                          locale: ptBR,
                        })}
                      </span>
                    </h3>
                    <span className="text-[11px] font-semibold text-slate-500">
                      {freeSlotsForSelectedDate.length} livre(s)
                    </span>
                  </div>

                  {availableSlots.length === 0 ? (
                    <div className="text-center py-6 bg-stone-50 rounded-xl border border-stone-200/70">
                      <Clock className="w-5 h-5 text-slate-400 mx-auto mb-1.5" />
                      <p className="text-slate-600 font-semibold text-xs">
                        Nenhum horário disponível nesta data.
                      </p>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        Experimente selecionar outro dia no calendário acima.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 gap-2 max-h-[240px] overflow-y-auto pr-1 scrollbar-hide">
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
                            type="button"
                            onClick={() =>
                              !isUnavailable && toggleSlot(slotKey)
                            }
                            disabled={isUnavailable}
                            className={`h-13 rounded-xl flex flex-col items-center justify-center transition-all border ${
                              isUnavailable
                                ? "border-slate-100 bg-slate-50 opacity-45 cursor-not-allowed"
                                : isSelected
                                  ? "border-[#BF4B24] bg-[#BF4B24]/8 ring-1 ring-[#BF4B24]"
                                  : "border-slate-200 bg-white hover:border-slate-300"
                            }`}
                          >
                            <span
                              className={`text-xs font-bold ${
                                isUnavailable
                                  ? "text-slate-400 line-through"
                                  : isSelected
                                    ? "text-[#BF4B24]"
                                    : "text-slate-800"
                              }`}
                            >
                              {slotTime}
                            </span>
                            <span
                              className={`text-[10px] font-medium mt-0.5 ${
                                isUnavailable
                                  ? "text-slate-400"
                                  : isSelected
                                    ? "text-[#BF4B24]"
                                    : "text-slate-500"
                              }`}
                            >
                              {isUnavailable
                                ? "Ocupado"
                                : `R$ ${slotPrice.toFixed(2).replace(".", ",")}`}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}

                  {/* BOTÃO DESKTOP */}
                  <div className="hidden md:block pt-5 border-t border-slate-100 mt-5">
                    {selectedSlots.length > 0 && (
                      <div className="flex items-center justify-between mb-3 text-sm">
                        <span className="font-medium text-slate-600">
                          Total ({selectedSlots.length}{" "}
                          {selectedSlots.length === 1 ? "horário" : "horários"})
                        </span>
                        <span className="text-lg font-bold text-slate-900">
                          R$ {totalHourlyCost.toFixed(2).replace(".", ",")}
                        </span>
                      </div>
                    )}
                    <Button
                      onClick={handleAction}
                      disabled={actionLoading}
                      className="w-full h-12 rounded-xl font-bold transition-all text-sm bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-xs"
                    >
                      {actionLoading
                        ? "Processando..."
                        : selectedSlots.length > 0
                          ? `Reservar (${selectedSlots.length}h)`
                          : "Selecione um horário acima"}
                    </Button>
                  </div>
                </section>
              )}

              {activeTab === "turno" && (
                <section className="animate-in fade-in space-y-5">
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 mb-2.5">
                      1. Qual turno você deseja?
                    </h2>
                    <div className="grid grid-cols-3 gap-2.5">
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
                        {
                          id: "night",
                          label: "Noite",
                          price: pricingData.night,
                        },
                      ].map((t) => (
                        <button
                          key={t.id}
                          onClick={() => setSelectedShift(t.id as any)}
                          className={`flex flex-col items-center justify-center p-3 rounded-xl border transition-all ${
                            selectedShift === t.id
                              ? "border-[#BF4B24] bg-orange-50/60 text-[#BF4B24]"
                              : "border-slate-200 hover:border-slate-300 bg-white"
                          }`}
                        >
                          <span className="text-xs font-bold">{t.label}</span>
                          <span
                            className={`text-[10px] font-semibold mt-0.5 ${
                              selectedShift === t.id
                                ? "text-[#BF4B24]"
                                : "text-slate-500"
                            }`}
                          >
                            {t.price ? `R$ ${t.price}` : "--"}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <h2 className="text-sm font-bold text-slate-900 mb-2.5">
                      2. Quais dias da semana?
                    </h2>
                    <div className="flex gap-2 justify-between">
                      {["D", "S", "T", "Q", "Q", "S", "S"].map(
                        (day: string, i: number) => (
                          <button
                            key={i}
                            onClick={() => toggleDay(i)}
                            className={`w-10 h-10 rounded-xl text-xs font-bold transition-all ${
                              selectedDays.includes(i)
                                ? "bg-slate-900 text-white"
                                : "bg-stone-100 text-slate-600 hover:bg-stone-200"
                            }`}
                          >
                            {day}
                          </button>
                        ),
                      )}
                    </div>
                  </div>
                  <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl flex gap-3">
                    <Shield className="w-4 h-4 text-slate-700 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      Locações de turnos fixos são combinadas diretamente pelo{" "}
                      <strong className="font-bold text-slate-800">
                        Chat Seguro
                      </strong>{" "}
                      da plataforma.
                    </p>
                  </div>
                  <div className="hidden md:block pt-4 border-t border-slate-100">
                    <div className="flex justify-between items-end mb-3">
                      <span className="text-xs font-semibold text-slate-500">
                        Estimativa semanal
                      </span>
                      <span className="text-xl font-bold text-slate-900">
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
                      className="w-full h-12 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white gap-2"
                    >
                      {actionLoading ? (
                        "Processando..."
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" /> Solicitar
                          Proposta
                        </>
                      )}
                    </Button>
                  </div>
                </section>
              )}

              {activeTab === "fixo" && (
                <section className="animate-in fade-in space-y-5">
                  <div className="text-center py-6 bg-stone-50 rounded-xl border border-stone-200">
                    <p className="text-xs font-semibold text-slate-500 mb-1">
                      Mensalidade (Sala Exclusiva)
                    </p>
                    <h3 className="text-2xl font-bold text-slate-900">
                      {pricingData.monthly ? `R$ ${pricingData.monthly}` : "--"}
                    </h3>
                  </div>
                  <div className="bg-stone-50 border border-stone-200 p-3.5 rounded-xl flex gap-3">
                    <Shield className="w-4 h-4 text-emerald-700 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-600 leading-relaxed">
                      No contrato mensal você conta com exclusividade na sala e
                      pode optar pelo modo Coanfitrião para sublocar seus
                      horários vagos.
                    </p>
                  </div>
                  <div className="hidden md:block pt-4 border-t border-slate-100">
                    <Button
                      onClick={handleAction}
                      disabled={actionLoading}
                      className="w-full h-12 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white gap-2"
                    >
                      {actionLoading ? (
                        "Processando..."
                      ) : (
                        <>
                          <MessageSquare className="w-4 h-4" /> Iniciar
                          Negociação
                        </>
                      )}
                    </Button>
                  </div>
                </section>
              )}
            </div>
          </div>

          {/* AVALIAÇÕES */}
          <div className="order-3 lg:order-3 lg:col-span-7 lg:col-start-1 pt-6 border-t border-slate-100 lg:border-none lg:pt-0">
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-bold text-slate-900">
                Avaliações de profissionais
              </h2>
              <div className="flex items-center gap-1.5">
                <Star className="w-4 h-4 fill-amber-500 text-amber-500" />
                <span className="font-bold text-base text-slate-900">
                  {avgRating}
                </span>
                <span className="text-xs font-medium text-slate-500">
                  ({reviews.length})
                </span>
              </div>
            </div>

            {reviews.length > 0 && (
              <div className="flex items-center gap-2 overflow-x-auto scrollbar-hide mb-5 pb-1">
                <button
                  onClick={() => setReviewFilter(0)}
                  className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 border ${
                    reviewFilter === 0
                      ? "bg-slate-900 text-white border-slate-900"
                      : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                  }`}
                >
                  Todas
                </button>
                {[5, 4, 3, 2, 1].map((star: number) => {
                  const count = reviews.filter(
                    (r: any) => r.rating === star,
                  ).length;
                  if (count === 0) return null;
                  return (
                    <button
                      key={star}
                      onClick={() => setReviewFilter(star)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all shrink-0 flex items-center gap-1 border ${
                        reviewFilter === star
                          ? "bg-stone-100 text-slate-900 border-slate-300"
                          : "bg-white text-slate-600 border-slate-200 hover:bg-slate-50"
                      }`}
                    >
                      {star}{" "}
                      <Star className="w-3 h-3 fill-amber-500 text-amber-500" />
                      <span className="text-[10px] text-slate-400 ml-0.5">
                        ({count})
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {loadingReviews ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-slate-300" />
              </div>
            ) : reviews.length === 0 ? (
              <div className="text-center py-10 bg-stone-50 rounded-2xl border border-stone-200/70">
                <p className="font-bold text-slate-800 text-sm">
                  Este consultório ainda não possui avaliações
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  As avaliações são feitas exclusivamente por profissionais após
                  o uso da sala.
                </p>
              </div>
            ) : filteredReviews.length === 0 ? (
              <div className="text-center py-8 text-slate-500 text-xs font-medium">
                Nenhuma avaliação com esta nota.
              </div>
            ) : (
              <div className="space-y-4">
                {filteredReviews.map((review: any) => {
                  const hasComment =
                    review.comment && review.comment.trim().length > 0;

                  return (
                    <div
                      key={review.id}
                      className="bg-white p-5 rounded-2xl border border-slate-200/80"
                    >
                      <div className="flex items-center gap-3 mb-3">
                        <div className="w-10 h-10 rounded-full overflow-hidden bg-stone-100 border border-stone-200 shrink-0">
                          {review.profiles?.avatar_url ? (
                            <img
                              src={review.profiles.avatar_url}
                              alt="Avatar"
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center text-slate-400">
                              <User className="w-5 h-5" />
                            </div>
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-sm text-slate-900">
                            {review.profiles?.full_name ||
                              "Profissional Verificado"}
                          </p>
                          <p className="text-[11px] font-medium text-slate-400">
                            {format(
                              parseISO(review.created_at),
                              "dd 'de' MMM, yyyy",
                              {
                                locale: ptBR,
                              },
                            )}
                          </p>
                        </div>
                        <div className="ml-auto flex items-center gap-1 bg-stone-100 px-2.5 py-1 rounded-lg">
                          <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
                          <span className="font-bold text-xs text-slate-800">
                            {Number(review.rating).toFixed(1)}
                          </span>
                        </div>
                      </div>

                      {hasComment && (
                        <p className="text-slate-600 text-sm leading-relaxed">
                          "{review.comment}"
                        </p>
                      )}

                      {review.host_reply && (
                        <div className="mt-3.5 p-3.5 bg-stone-50 rounded-xl border border-stone-200/70">
                          <p className="text-xs font-bold text-slate-800 mb-1 flex items-center gap-1">
                            <Check className="w-3.5 h-3.5 text-[#BF4B24]" />{" "}
                            Resposta da Clínica
                          </p>
                          <p className="text-xs text-slate-600">
                            {review.host_reply}
                          </p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* BARRA INFERIOR MOBILE INTELIGENTE */}
      <div className="md:hidden fixed bottom-0 inset-x-0 bg-white border-t border-slate-200 px-5 py-3.5 pb-[calc(0.875rem+env(safe-area-inset-bottom))] flex items-center justify-between shadow-[0_-8px_30px_rgba(15,23,42,0.08)] z-50">
        <div onClick={scrollToBookingSection} className="cursor-pointer pr-2">
          <p className="text-[11px] font-semibold text-slate-500">
            {activeTab === "hora"
              ? selectedSlots.length > 0
                ? `${selectedSlots.length} ${selectedSlots.length === 1 ? "horário selecionado" : "horários selecionados"}`
                : "A partir de"
              : activeTab === "turno"
                ? "Estimativa semanal"
                : "Contrato mensal"}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-slate-900">
              R${" "}
              {activeTab === "hora"
                ? selectedSlots.length > 0
                  ? totalHourlyCost
                  : getBasePrice()
                : activeTab === "turno"
                  ? totalShiftCost
                  : pricingData.monthly || 0}
            </span>
            {activeTab === "hora" && selectedSlots.length === 0 && (
              <span className="text-xs font-medium text-slate-500">/hora</span>
            )}
          </div>
          {activeTab === "hora" && selectedSlots.length === 0 && (
            <span className="text-[11px] font-semibold text-[#BF4B24] underline underline-offset-2 block">
              {freeSlotsForSelectedDate.length > 0
                ? `${freeSlotsForSelectedDate.length} horários livres hoje`
                : "Consultar datas"}
            </span>
          )}
        </div>

        {activeTab === "hora" ? (
          <Button
            onClick={() => {
              if (selectedSlots.length === 0) {
                scrollToBookingSection();
              } else {
                handleAction();
              }
            }}
            disabled={actionLoading}
            className="h-12 px-6 rounded-xl font-bold transition-all min-w-[165px] text-sm bg-[#BF4B24] hover:bg-[#9A3C1D] text-white shadow-sm active:scale-95"
          >
            {actionLoading
              ? "Processando..."
              : selectedSlots.length > 0
                ? `Reservar (${selectedSlots.length}h)`
                : "Ver horários"}
          </Button>
        ) : (
          <Button
            onClick={() => {
              if (
                activeTab === "turno" &&
                (!selectedShift || selectedDays.length === 0)
              ) {
                scrollToBookingSection();
              } else {
                handleAction();
              }
            }}
            disabled={actionLoading}
            className="h-12 px-6 rounded-xl font-bold bg-slate-900 hover:bg-slate-800 text-white min-w-[165px] text-sm flex gap-2 active:scale-95"
          >
            {actionLoading ? (
              "Processando..."
            ) : activeTab === "turno" &&
              (!selectedShift || selectedDays.length === 0) ? (
              "Escolher turno"
            ) : (
              <>
                <MessageSquare className="w-4 h-4" /> Negociar
              </>
            )}
          </Button>
        )}
      </div>

      {/* GALERIA DE TODAS AS FOTOS */}
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
              Fotos do espaço ({allImages.length})
            </span>
            <button
              onClick={handleShare}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors"
            >
              <Share className="w-4 h-4 text-slate-900" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto bg-white px-2 py-4 md:px-6">
            <div className="grid grid-cols-2 gap-1.5 md:max-w-4xl md:mx-auto md:gap-4">
              {allImages.map((img: string, idx: number) => {
                const isFullWidth = idx % 3 === 0;
                return (
                  <div
                    key={idx}
                    onClick={() => openLightbox(idx)}
                    className={`relative w-full bg-slate-100 cursor-pointer overflow-hidden rounded-lg md:rounded-2xl group ${
                      isFullWidth
                        ? "col-span-2 h-[35vh] md:h-[60vh]"
                        : "col-span-1 h-[25vh] md:h-[40vh]"
                    }`}
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

      {/* LIGHTBOX TELA CHEIA */}
      {isLightboxOpen && (
        <div className="fixed inset-0 z-[200] bg-black text-white flex flex-col animate-in fade-in zoom-in-95 duration-200">
          <div className="flex-none p-4 flex justify-between items-center bg-transparent z-20 absolute top-0 w-full">
            <button
              onClick={() => setIsLightboxOpen(false)}
              className="p-2 hover:bg-white/10 rounded-full transition-colors"
            >
              <ArrowLeft className="w-6 h-6 text-white" />
            </button>
            <span className="font-medium text-sm tracking-widest bg-black/50 px-3 py-1 rounded-full">
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
              className={`hidden md:flex absolute left-8 z-20 p-3 rounded-full transition-all border border-white/20 ${
                currentPhotoIndex === 0
                  ? "bg-white/5 text-white/30 cursor-not-allowed border-transparent"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              <ChevronLeft className="w-8 h-8" />
            </button>
            <div
              ref={lightboxRef}
              onScroll={handleLightboxScroll}
              className="w-full h-full flex overflow-x-auto snap-x snap-mandatory scrollbar-hide scroll-smooth items-center"
            >
              {allImages.map((img: string, idx: number) => (
                <div
                  key={idx}
                  className="relative w-full h-full shrink-0 snap-center snap-always flex items-center justify-center p-0 md:p-16"
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
              className={`hidden md:flex absolute right-8 z-20 p-3 rounded-full transition-all border border-white/20 ${
                currentPhotoIndex === allImages.length - 1
                  ? "bg-white/5 text-white/30 cursor-not-allowed border-transparent"
                  : "bg-white/10 hover:bg-white/20 text-white"
              }`}
            >
              <ChevronRight className="w-8 h-8" />
            </button>
          </div>
        </div>
      )}

      {/* MODAL DE CADASTRO INCOMPLETO */}
      {showProfileModal && (
        <div className="fixed inset-0 z-[250] bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl p-6 md:p-8 max-w-sm w-full shadow-xl relative">
            <div className="w-12 h-12 bg-stone-100 border border-stone-200 rounded-xl flex items-center justify-center mb-4 mx-auto">
              <ShieldCheck className="w-6 h-6 text-[#BF4B24]" />
            </div>
            <h3 className="text-lg font-bold text-center text-slate-900 mb-2">
              Complete seus dados para reservar
            </h3>
            <p className="text-xs text-center text-slate-600 mb-6 leading-relaxed">
              Para segurança da clínica e emissão do seu comprovante de acesso,
              precisamos que você preencha seu CPF e endereço no perfil. Leva
              menos de 1 minuto.
            </p>
            <div className="space-y-2.5">
              <Button
                onClick={() => {
                  setShowProfileModal(false);
                  if (onNavigateToProfile) onNavigateToProfile();
                }}
                className="w-full h-11 rounded-xl font-bold bg-[#BF4B24] hover:bg-[#9A3C1D] text-white"
              >
                Completar meu perfil
              </Button>
              <Button
                onClick={() => setShowProfileModal(false)}
                variant="ghost"
                className="w-full h-11 rounded-xl font-semibold text-slate-500 hover:bg-slate-50"
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
        onConfirm={(method, appliedCoupon, cardData) =>
          handleConfirmCheckout(method, appliedCoupon, cardData)
        }
        onSuccess={() => {
          bookingConfirmedRef.current = true;
          fetchRoomBookings();
        }}
        loading={actionLoading}
        summary={checkoutSummary}
        room={roomData}
        selectedSlots={selectedSlots}
        selectedDate={selectedDate || new Date()}
        totalBaseBRL={totalHourlyCost}
        pixQrCode={pixQrCode}
        pixCopyPaste={pixCopyPaste}
        activeBookingId={activeBookingId}
      />
    </div>
  );
}
