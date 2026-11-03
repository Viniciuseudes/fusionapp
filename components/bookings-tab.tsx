// components/bookings-tab.tsx
"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  format,
  isSameDay,
  addDays,
  isAfter,
  isBefore,
  subDays,
  startOfMonth,
  endOfMonth,
  parseISO,
  differenceInMinutes,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMobileBack } from "@/hooks/use-mobile-back";
import {
  CalendarDays,
  MapPin,
  Clock,
  CheckCircle2,
  Navigation,
  MessageCircle,
  Loader2,
  XCircle,
  AlertTriangle,
  QrCode,
  Timer,
  ArrowLeft,
  LogOut,
  LogIn,
  ChevronRight,
  Receipt,
  RotateCcw,
  Star,
  Building2,
  Calendar as CalendarIcon,
  Download,
  Mail,
  Map as MapIcon,
  Keyboard,
  BellRing,
  SmartphoneNfc,
  ShieldAlert,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogHeader,
  DialogDescription,
} from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";

import { ActiveSession } from "@/components/active-session";
import { RoomQRScanner } from "@/components/qr-scanner";

interface Booking {
  id: string;
  original_ids?: string[];
  room_id: string;
  start_time: string;
  end_time: string;
  status:
    "pending_payment" | "confirmed" | "cancelled" | "completed" | "in_progress";
  total_cost: number;
  checkin_time?: string;
  checkout_time?: string;
  penalty_status?: string;
  asaas_payment_id?: string | null;
  rooms: {
    id: string;
    name: string;
    tier?: string;
    image_url: string;
    address_details: any;
    host_id: string;
    profiles?: { full_name: string; phone: string };
  };
  reviews?: { id: string; rating: number }[];
}

interface BookingsTabProps {
  onNavigateToSearch?: () => void;
  onNavigateToChat?: () => void;
}

interface DoorSmartFeedbackState {
  isOpen: boolean;
  mode:
    | "checkin_done"
    | "checkout_done"
    | "wrong_room"
    | "too_early"
    | "no_booking";
  booking: Booking | null;
  scannedRoomName?: string;
  message?: string;
}

export function BookingsTab({
  onNavigateToSearch,
  onNavigateToChat,
}: BookingsTabProps) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const processedScanRef = useRef<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [adjacentMap, setAdjacentMap] = useState<Record<string, boolean>>({});

  // Flag visual: esconde a tab inteira durante o processamento NFC para ser instantâneo
  const [isProcessingSmartDoor, setIsProcessingSmartDoor] = useState(
    !!(
      searchParams.get("scan") ||
      searchParams.get("room") ||
      searchParams.get("door")
    ),
  );

  // Filtros
  const [upcomingFilter, setUpcomingFilter] = useState<
    "all" | "today" | "tomorrow" | "custom"
  >("all");
  const [customDate, setCustomDate] = useState<Date | undefined>(new Date());
  const [historyFilter, setHistoryFilter] = useState<
    "7d" | "15d" | "30d" | "month" | "all"
  >("30d");

  // Estados de UI
  const [selectedBooking, setSelectedBooking] = useState<Booking | null>(null);
  const [isSheetOpen, setIsSheetOpen] = useState(false);

  const [receiptModal, setReceiptModal] = useState<{
    isOpen: boolean;
    booking: Booking | null;
  }>({ isOpen: false, booking: null });

  const [reviewModal, setReviewModal] = useState<{
    isOpen: boolean;
    booking: Booking | null;
    rating: number;
    comment: string;
  }>({ isOpen: false, booking: null, rating: 0, comment: "" });

  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    booking: Booking | null;
  }>({ isOpen: false, booking: null });

  // Modal de Extensão Automática (Overtime)
  const [extendModal, setExtendModal] = useState<{
    isOpen: boolean;
    booking: Booking | null;
  }>({ isOpen: false, booking: null });

  // NOVO: Modal Inteligente de Porta (NFC / QR Code Direto)
  const [doorSmartModal, setDoorSmartModal] = useState<DoorSmartFeedbackState>({
    isOpen: false,
    mode: "checkin_done",
    booking: null,
  });

  const [activeSessionBooking, setActiveSessionBooking] =
    useState<Booking | null>(null);

  // SCANNER & MANUAL FALLBACK
  const [scannerConfig, setScannerConfig] = useState<{
    isOpen: boolean;
    type: "checkin" | "checkout";
    booking: Booking | null;
    cameraFailed: boolean;
  }>({ isOpen: false, type: "checkin", booking: null, cameraFailed: false });
  const [manualCode, setManualCode] = useState("");

  useMobileBack(
    !!activeSessionBooking,
    () => setActiveSessionBooking(null),
    "sessao-ativa",
  );
  useMobileBack(
    scannerConfig.isOpen,
    () =>
      setScannerConfig({
        isOpen: false,
        type: "checkin",
        booking: null,
        cameraFailed: false,
      }),
    "scanner-qr",
  );
  useMobileBack(
    cancelModal.isOpen,
    () => setCancelModal({ isOpen: false, booking: null }),
    "modal-cancelamento",
  );
  useMobileBack(
    extendModal.isOpen,
    () => setExtendModal({ isOpen: false, booking: null }),
    "modal-extensao",
  );
  useMobileBack(
    doorSmartModal.isOpen,
    () => setDoorSmartModal((p) => ({ ...p, isOpen: false })),
    "modal-porta-nfc",
  );
  useMobileBack(isSheetOpen, () => setIsSheetOpen(false), "sheet-detalhes");
  useMobileBack(
    receiptModal.isOpen,
    () => setReceiptModal({ isOpen: false, booking: null }),
    "modal-recibo",
  );

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          id, room_id, start_time, end_time, status, total_cost, checkin_time, checkout_time, penalty_status, asaas_payment_id,
          rooms ( id, name, tier, image_url, address_details, host_id, profiles (full_name, phone) ),
          reviews ( id, rating )
        `,
        )
        .eq("user_id", user.id)
        .order("start_time", { ascending: true });

      if (error) throw error;

      const fetchedBookings = (data as unknown as Booking[]) || [];
      let mergedBookings: Booking[] = [];

      fetchedBookings.forEach((b) => {
        const last =
          mergedBookings.length > 0
            ? mergedBookings[mergedBookings.length - 1]
            : null;

        if (
          last &&
          last.room_id === b.room_id &&
          last.status === b.status &&
          ["confirmed", "in_progress"].includes(b.status)
        ) {
          const lastEnd = new Date(last.end_time).getTime();
          const currStart = new Date(b.start_time).getTime();
          const gapMs = currStart - lastEnd;

          if (gapMs >= 0 && gapMs <= 15 * 60 * 1000) {
            last.end_time = b.end_time;
            last.total_cost += b.total_cost;
            if (!last.original_ids) last.original_ids = [last.id];
            last.original_ids.push(b.id);
            return;
          }
        }
        mergedBookings.push({ ...b, original_ids: [b.id] });
      });

      const upcoming = mergedBookings.filter((b) => b.status === "confirmed");
      const newAdjacentMap: Record<string, boolean> = {};

      if (upcoming.length > 0) {
        const startTimes = upcoming.map((b) => b.start_time);
        const roomIds = upcoming.map((b) => b.room_id);

        const { data: adjData } = await supabase
          .from("bookings")
          .select("room_id, end_time")
          .in("room_id", roomIds)
          .in("end_time", startTimes)
          .in("status", ["confirmed", "in_progress", "completed"]);

        if (adjData) {
          upcoming.forEach((b) => {
            const hasAdjacent = adjData.some(
              (adj) =>
                adj.room_id === b.room_id && adj.end_time === b.start_time,
            );
            newAdjacentMap[b.id] = hasAdjacent;
          });
        }
      }

      setAdjacentMap(newAdjacentMap);
      setBookings(mergedBookings);
    } catch (err) {
      console.error("Erro ao buscar reservas:", err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [supabase]);

  // --- MOTOR DE NOTIFICAÇÕES E ESTEIRA DE OVERTIME ---
  useEffect(() => {
    if ("Notification" in window && Notification.permission === "default") {
      Notification.requestPermission();
    }

    const interval = setInterval(() => {
      const nowTime = new Date();

      bookings.forEach((b) => {
        if (b.status === "confirmed") {
          const diffStart = differenceInMinutes(
            parseISO(b.start_time),
            nowTime,
          );
          if (diffStart === 15) {
            triggerNotification(
              "Check-in Liberado! 🔓",
              `Sua sala (${b.rooms.name}) está pronta. Encoste o celular na tag NFC da porta ao chegar!`,
            );
          }
        } else if (b.status === "in_progress") {
          const diffEnd = differenceInMinutes(parseISO(b.end_time), nowTime);

          if (diffEnd === 5) {
            triggerNotification(
              "Faltam 5 minutos para encerrar ⏳",
              `Seu horário na sala ${b.rooms.name} termina em 5 min. Prepare-se para registrar o check-out na tag NFC da porta.`,
            );
          } else if (diffEnd === 0) {
            triggerNotification(
              "Horário Esgotado ⏰",
              `Seu horário na sala ${b.rooms.name} acabou. Encoste o celular na porta ou clique em Registrar Saída no app.`,
            );
          } else if (diffEnd === -5) {
            triggerNotification(
              "⚠️ Advertência de Horário!",
              "Você ultrapassou 5 minutos do horário limite. Registre sua saída imediatamente para evitar cobrança automática de nova hora.",
            );
          } else if (diffEnd === -10) {
            triggerNotification(
              "Deseja estender? ⏳",
              "Não identificamos seu check-out. Caso ainda esteja atendendo, você pode estender por +1 hora.",
            );
            if (!extendModal.isOpen) {
              setExtendModal({ isOpen: true, booking: b });
            }
          } else if (diffEnd === -15) {
            handleAutoExtend(b);
          }
        }
      });
    }, 60000);

    return () => clearInterval(interval);
  }, [bookings, extendModal.isOpen]);

  const triggerNotification = (title: string, body: string) => {
    if ("Notification" in window && Notification.permission === "granted") {
      new Notification(title, { body, icon: "/icon-512x512.png" });
    } else {
      toast({
        title: (
          <div className="flex items-center gap-2">
            <BellRing className="w-4 h-4 text-[#BF4B24]" /> {title}
          </div>
        ) as any,
        description: body,
      });
    }
  };

  const handleAutoExtend = async (booking: Booking) => {
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const tier = booking.rooms.tier || "start";

      await supabase.from("wallet_transactions").insert({
        user_id: user.id,
        amount: -1,
        type: "usage",
        tier: tier,
        description: `Extensão Automática (Overtime): ${booking.rooms.name}`,
      });

      const oldEndTime = new Date(booking.end_time);
      const newEndTime = new Date(
        oldEndTime.getTime() + 60 * 60 * 1000,
      ).toISOString();

      await supabase
        .from("bookings")
        .update({
          end_time: newEndTime,
          total_cost: booking.total_cost + 1,
        })
        .eq("id", booking.id);

      toast({
        title: "Extensão Automática 🔄",
        description:
          "Como o check-out não foi realizado no prazo, 1 hora foi debitada da sua carteira e sua sessão foi estendida.",
      });

      setExtendModal({ isOpen: false, booking: null });
      fetchBookings();
    } catch (e) {
      console.error("Erro na extensão automática:", e);
    }
  };

  // ============================================================================
  // EXECUÇÃO DIRETA DE CHECK-IN E CHECK-OUT
  // ============================================================================
  const executeInstantCheckin = async (
    targetBooking: Booking,
    fromDoorTag = false,
  ) => {
    setActionLoading(true);
    try {
      const checkinTime = new Date().toISOString();
      const idsToUpdate = targetBooking.original_ids || [targetBooking.id];

      const { error } = await supabase
        .from("bookings")
        .update({ status: "in_progress", checkin_time: checkinTime })
        .in("id", idsToUpdate);

      if (error) throw error;

      const updatedBooking: Booking = {
        ...targetBooking,
        status: "in_progress",
        checkin_time: checkinTime,
      };

      await fetchBookings();

      if (fromDoorTag) {
        setDoorSmartModal({
          isOpen: true,
          mode: "checkin_done",
          booking: updatedBooking,
        });
      } else {
        toast({
          title: "Entrada Registrada! ✅",
          description: `Bom atendimento na ${targetBooking.rooms.name}. Lembre-se de registrar a saída até as ${format(parseISO(targetBooking.end_time), "HH:mm")}.`,
        });
        setActiveSessionBooking(updatedBooking);
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao registrar entrada",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
      setIsProcessingSmartDoor(false);
    }
  };

  const executeInstantCheckout = async (
    targetBooking: Booking,
    fromDoorTag = false,
  ) => {
    setActionLoading(true);
    try {
      const checkoutTime = new Date().toISOString();
      const idsToUpdate = targetBooking.original_ids || [targetBooking.id];

      const { error } = await supabase
        .from("bookings")
        .update({ status: "completed", checkout_time: checkoutTime })
        .in("id", idsToUpdate);

      if (error) throw error;

      const updatedBooking: Booking = {
        ...targetBooking,
        status: "completed",
        checkout_time: checkoutTime,
      };

      setActiveSessionBooking(null);
      setIsSheetOpen(false);
      await fetchBookings();

      if (fromDoorTag) {
        setDoorSmartModal({
          isOpen: true,
          mode: "checkout_done",
          booking: updatedBooking,
        });
      } else {
        toast({
          title: "Saída Registrada com Sucesso! 👏",
          description:
            "Obrigado pela pontualidade e por liberar o consultório no horário.",
        });
        setReviewModal({
          isOpen: true,
          booking: updatedBooking,
          rating: 0,
          comment: "",
        });
      }
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao registrar saída",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
      setIsProcessingSmartDoor(false);
    }
  };

  // ============================================================================
  // DETECTOR INTELIGENTE DE TAG NFC / QR CODE NA PORTA
  // ============================================================================
  useEffect(() => {
    const rawScan =
      searchParams.get("scan") ||
      searchParams.get("room") ||
      searchParams.get("door");
    const targetBookingId = searchParams.get("bookingId");

    if (!rawScan) {
      setIsProcessingSmartDoor(false);
      return;
    }

    if (loading) return;

    const scanSignature = `${rawScan}:${targetBookingId || ""}`;
    if (processedScanRef.current === scanSignature) {
      setIsProcessingSmartDoor(false);
      return;
    }
    processedScanRef.current = scanSignature;

    const clearUrlScanParams = () => {
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "/dashboard#bookings");
      }
    };

    const processScan = async () => {
      // Caso 1: Formato antigo (?scan=checkin&bookingId=...)
      if (
        (rawScan === "checkin" || rawScan === "checkout") &&
        targetBookingId &&
        bookings.length > 0
      ) {
        const targetBooking = bookings.find((b) => b.id === targetBookingId);
        if (targetBooking) {
          clearUrlScanParams();
          if (
            rawScan === "checkout" ||
            targetBooking.status === "in_progress"
          ) {
            await executeInstantCheckout(targetBooking, true);
          } else {
            await executeInstantCheckin(targetBooking, true);
          }
          return; // as funções de checkin/out já fecham o isProcessing
        }
      }

      // Caso 2: Tag NFC ou QR Code da Porta (?scan=ID_DA_SALA ou código de 6 dígitos)
      const cleanScan = rawScan.trim().toLowerCase();
      const nowMs = Date.now();

      const todayActiveBookings = bookings.filter((b) => {
        if (!["confirmed", "in_progress"].includes(b.status)) return false;
        const s = parseISO(b.start_time);
        const e = parseISO(b.end_time);
        return (
          isSameDay(s, new Date()) ||
          (nowMs >= s.getTime() - 60 * 60 * 1000 &&
            nowMs <= e.getTime() + 2 * 60 * 60 * 1000)
        );
      });

      const matchingRoomBookings = todayActiveBookings.filter((b) => {
        const rId = String(b.room_id || "").toLowerCase();
        return (
          rId === cleanScan ||
          rId.startsWith(cleanScan) ||
          cleanScan.includes(rId)
        );
      });

      clearUrlScanParams();

      // A) CHECK-OUT imediato!
      const inProgressInRoom = matchingRoomBookings.find(
        (b) => b.status === "in_progress",
      );
      if (inProgressInRoom) {
        await executeInstantCheckout(inProgressInRoom, true);
        return; // isProcessingSmartDoor é fechado no finally da função
      }

      // B) CHECK-IN imediato!
      const readyForCheckinInRoom = matchingRoomBookings.find((b) => {
        const startMs = new Date(b.start_time).getTime();
        const endMs = new Date(b.end_time).getTime();
        const hasBackToBack = adjacentMap[b.id] || false;
        const earlyWindowMs = hasBackToBack ? 0 : 15 * 60 * 1000;
        return nowMs >= startMs - earlyWindowMs && nowMs < endMs;
      });

      if (readyForCheckinInRoom) {
        await executeInstantCheckin(readyForCheckinInRoom, true);
        return; // isProcessingSmartDoor é fechado no finally da função
      }

      // C) Muito cedo
      const futureBookingInRoom = matchingRoomBookings.find(
        (b) => new Date(b.start_time).getTime() > nowMs,
      );
      if (futureBookingInRoom) {
        setDoorSmartModal({
          isOpen: true,
          mode: "too_early",
          booking: futureBookingInRoom,
        });
        setIsProcessingSmartDoor(false);
        return;
      }

      // D) Sala ERRADA
      if (todayActiveBookings.length > 0) {
        const correctBooking = todayActiveBookings[0];
        setDoorSmartModal({
          isOpen: true,
          mode: "wrong_room",
          booking: correctBooking,
        });
        setIsProcessingSmartDoor(false);
        return;
      }

      // E) Nenhuma reserva ativa para hoje
      setDoorSmartModal({
        isOpen: true,
        mode: "no_booking",
        booking: null,
      });
      setIsProcessingSmartDoor(false);
    };

    processScan();
  }, [searchParams, bookings, loading, adjacentMap]);

  // --- FILTRAGEM INTELIGENTE ---
  const now = new Date();
  const nowTime = now.getTime();

  let upcomingBookings = bookings.filter((b) => {
    if (b.status === "in_progress") return true;
    const endTime = new Date(b.end_time).getTime();
    return (
      ["confirmed", "pending_payment"].includes(b.status) && endTime > nowTime
    );
  });

  if (upcomingFilter === "today") {
    upcomingBookings = upcomingBookings.filter((b) =>
      isSameDay(parseISO(b.start_time), now),
    );
  } else if (upcomingFilter === "tomorrow") {
    upcomingBookings = upcomingBookings.filter((b) =>
      isSameDay(parseISO(b.start_time), addDays(now, 1)),
    );
  } else if (upcomingFilter === "custom" && customDate) {
    upcomingBookings = upcomingBookings.filter((b) =>
      isSameDay(parseISO(b.start_time), customDate),
    );
  }

  let pastBookings = bookings.filter((b) => {
    if (b.status === "in_progress") return false;
    const endTime = new Date(b.end_time).getTime();
    return (
      ["completed", "cancelled", "no_show"].includes(b.status) ||
      endTime <= nowTime
    );
  });

  if (historyFilter === "7d") {
    pastBookings = pastBookings.filter((b) =>
      isAfter(parseISO(b.start_time), subDays(now, 7)),
    );
  } else if (historyFilter === "15d") {
    pastBookings = pastBookings.filter((b) =>
      isAfter(parseISO(b.start_time), subDays(now, 15)),
    );
  } else if (historyFilter === "30d") {
    pastBookings = pastBookings.filter((b) =>
      isAfter(parseISO(b.start_time), subDays(now, 30)),
    );
  } else if (historyFilter === "month") {
    pastBookings = pastBookings.filter((b) => {
      const d = parseISO(b.start_time);
      return isAfter(d, startOfMonth(now)) && isBefore(d, endOfMonth(now));
    });
  }
  pastBookings.sort(
    (a, b) =>
      parseISO(b.start_time).getTime() - parseISO(a.start_time).getTime(),
  );

  const displayBookings =
    activeTab === "upcoming" ? upcomingBookings : pastBookings;

  // --- MÉTODOS DE AÇÃO UI ---
  const handleOpenChat = async (booking: Booking, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setActionLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const { data: existingChat, error: searchError } = await supabase
        .from("chats")
        .select("id")
        .eq("booking_id", booking.id)
        .maybeSingle();

      if (searchError) throw searchError;

      if (!existingChat) {
        await supabase.from("chats").insert({
          type: "booking",
          status: "open",
          room_id: booking.room_id,
          guest_id: user.id,
          host_id: booking.rooms.host_id,
          booking_id: booking.id,
        });
      }
      if (onNavigateToChat) onNavigateToChat();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao abrir chat",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleConfirmCancel = async () => {
    const booking = cancelModal.booking;
    if (!booking) return;

    setActionLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");

      const nowTimeForCancel = new Date().getTime();
      const startTime = new Date(booking.start_time).getTime();
      const hoursUntilBooking =
        (startTime - nowTimeForCancel) / (1000 * 60 * 60);
      const isRefundable = hoursUntilBooking >= 24;
      const idsToUpdate = booking.original_ids || [booking.id];

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .in("id", idsToUpdate);
      if (updateError) throw updateError;

      if (isRefundable && !booking.asaas_payment_id) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await supabase.from("wallet_transactions").insert({
          user_id: user.id,
          amount: booking.total_cost,
          type: "refund",
          tier: booking.rooms.tier || "start",
          description: `Estorno (Cancelamento): ${booking.rooms.name}`,
          expires_at: expiresAt.toISOString(),
        });
      }

      toast({
        title: isRefundable
          ? "Reserva Cancelada e Reembolsada"
          : "Reserva Cancelada",
        description: isRefundable
          ? `O valor foi devolvido à sua origem de pagamento.`
          : "Cancelado com menos de 24h, sem estorno.",
      });

      setCancelModal({ isOpen: false, booking: null });
      fetchBookings();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao cancelar",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const submitReview = async () => {
    if (!reviewModal.booking || reviewModal.rating === 0) return;
    setActionLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Não autenticado");

      const { error } = await supabase.from("reviews").insert({
        booking_id: reviewModal.booking.id,
        room_id: reviewModal.booking.room_id,
        guest_id: user.id,
        rating: reviewModal.rating,
        comment: reviewModal.comment,
      });
      if (error) throw error;

      toast({
        title: "Avaliação Enviada",
        description: "Obrigado pelo seu feedback!",
      });
      setReviewModal({ isOpen: false, booking: null, rating: 0, comment: "" });
      fetchBookings();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível enviar a avaliação.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleBookAgain = (roomId: string) => {
    setIsSheetOpen(false);
    setTimeout(() => {
      router.push(`/#room/${roomId}`);
      window.location.hash = `room/${roomId}`;
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    }, 300);
  };

  const handleDownloadPDF = () => {
    const element = document.getElementById("receipt-content");
    if (!element) return;

    const printWindow = window.open("", "", "width=800,height=900");
    if (!printWindow) return;

    printWindow.document.write(`
      <html>
        <head>
          <title>Recibo - Fusion Clinic</title>
          <script src="https://cdn.tailwindcss.com"></script>
        </head>
        <body class="bg-slate-50 p-8 antialiased flex justify-center items-start min-h-screen">
          <div class="w-full max-w-2xl bg-white border border-slate-200 rounded-[2rem] p-10 shadow-lg">
            ${element.innerHTML}
          </div>
          <script>
            setTimeout(() => {
              window.print();
              window.close();
            }, 1000);
          </script>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  const handleSendEmail = (booking: Booking, payment: any) => {
    const subject = encodeURIComponent(
      `Recibo Fusion Clinic - ${booking.rooms.name}`,
    );
    const body = encodeURIComponent(`
Olá! Aqui está o resumo da sua locação na Fusion Clinic:

ID da Transação: ${booking.id.toUpperCase()}
Espaço: ${booking.rooms.name}
Data: ${format(parseISO(booking.start_time), "dd/MM/yyyy")}
Horário: ${format(parseISO(booking.start_time), "HH:mm")} às ${format(parseISO(booking.end_time), "HH:mm")}

Valor Total: ${payment.value}
Método de Pagamento: ${payment.method}
${payment.isCredit ? `(Equivalente a ${payment.equivalentBrl})` : ""}

Obrigado por utilizar a Fusion Clinic!
CNPJ: 49.351.127/0001-44
    `);
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  };

  const getPaymentDisplay = (booking: Booking) => {
    const taxaHora = 45;

    if (booking.asaas_payment_id) {
      const amount =
        booking.total_cost < 10
          ? booking.total_cost * taxaHora
          : booking.total_cost;
      return {
        value: `R$ ${amount.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
        method: "Cartão / PIX",
        isCredit: false,
        equivalentBrl: null,
      };
    } else {
      const tier = booking.rooms?.tier
        ? booking.rooms.tier.toUpperCase()
        : "START";
      const equivalentValue = booking.total_cost * taxaHora;
      return {
        value: `${booking.total_cost} CR`,
        method: `Crédito (${tier})`,
        isCredit: true,
        equivalentBrl: `R$ ${equivalentValue.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
      };
    }
  };

  const formatDuration = (start: string, end: string) => {
    const diffMins = differenceInMinutes(parseISO(end), parseISO(start));
    const hours = Math.floor(diffMins / 60);
    const mins = diffMins % 60;
    if (hours > 0 && mins > 0) return `${hours}h ${mins}m`;
    if (hours > 0) return `${hours}h`;
    return `${mins}m`;
  };

  const getStatusDisplay = (status: string) => {
    switch (status) {
      case "confirmed":
        return {
          label: "Confirmada",
          color: "bg-emerald-100 text-emerald-700",
        };
      case "in_progress":
        return { label: "Em andamento", color: "bg-amber-100 text-amber-700" };
      case "completed":
        return { label: "Concluída", color: "bg-slate-100 text-slate-700" };
      case "cancelled":
        return { label: "Cancelada", color: "bg-red-100 text-red-700" };
      case "pending_payment":
        return { label: "Pendente", color: "bg-orange-100 text-orange-700" };
      default:
        return { label: status, color: "bg-slate-100 text-slate-700" };
    }
  };

  const openDetails = (booking: Booking) => {
    setSelectedBooking(booking);
    setIsSheetOpen(true);
  };

  // --- CARD: PRÓXIMAS (DETALHADO E COM EDUCAÇÃO DE HORÁRIO) ---
  const UpcomingCard = ({ booking }: { booking: Booking }) => {
    const startObj = new Date(booking.start_time);
    const endObj = new Date(booking.end_time);
    const startTimeMs = startObj.getTime();

    let address: any = {};
    try {
      address =
        typeof booking.rooms.address_details === "string"
          ? JSON.parse(booking.rooms.address_details)
          : booking.rooms.address_details;
    } catch (e) {}
    const fullAddress = `${address.street || ""}, ${address.number || ""} ${address.complement ? `- ${address.complement}` : ""}`;

    const hasBackToBack = adjacentMap[booking.id] || false;
    const checkInWindowMs = hasBackToBack ? 0 : 15 * 60 * 1000;
    const isReadyForCheckin =
      booking.status === "confirmed" &&
      startTimeMs - nowTime <= checkInWindowMs &&
      nowTime < endObj.getTime();
    const isInProgress = booking.status === "in_progress";
    const isMerged = booking.original_ids && booking.original_ids.length > 1;
    const minsRemaining = differenceInMinutes(endObj, now);

    return (
      <div
        onClick={() => openDetails(booking)}
        className={`bg-white rounded-[2rem] border shadow-sm overflow-hidden flex flex-col md:flex-row group transition-all cursor-pointer hover:shadow-md active:scale-[0.99] ${isInProgress ? "border-amber-400 ring-2 ring-amber-400/20" : isReadyForCheckin ? "border-[#BF4B24]/50 hover:border-[#BF4B24]" : "border-slate-200"}`}
      >
        <div
          className={`md:w-48 p-6 flex flex-col justify-center border-b md:border-b-0 md:border-r border-slate-100 border-dashed relative ${isSameDay(startObj, now) ? "bg-orange-50/50" : "bg-slate-50/50"}`}
        >
          <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-1 text-center md:text-left">
            {format(startObj, "MMMM", { locale: ptBR })}
          </p>
          <p className="text-4xl font-black text-slate-900 tracking-tighter text-center md:text-left">
            {format(startObj, "dd")}
          </p>
          <p className="text-sm font-bold text-slate-500 capitalize text-center md:text-left mb-4">
            {format(startObj, "EEEE", { locale: ptBR })}
          </p>
          <div
            className={`flex items-center justify-center md:justify-start gap-2 border py-2 px-3 rounded-lg shadow-sm ${isInProgress ? "bg-amber-50 border-amber-200" : "bg-white border-slate-200"}`}
          >
            <Clock
              className={`w-4 h-4 ${isInProgress ? "text-amber-500" : "text-[#BF4B24]"}`}
            />
            <span
              className={`text-xs font-black ${isInProgress ? "text-amber-800" : "text-slate-800"}`}
            >
              {format(startObj, "HH:mm")} - {format(endObj, "HH:mm")}
            </span>
          </div>
        </div>

        <div className="flex-1 p-6 flex flex-col">
          <div className="flex items-start justify-between gap-4 mb-3">
            <div>
              {isInProgress && (
                <Badge className="bg-amber-100 text-amber-800 border-0 mb-2 font-black px-2 py-0.5 animate-pulse uppercase tracking-widest mr-2">
                  Em Atendimento • Saída até {format(endObj, "HH:mm")}
                </Badge>
              )}
              {isReadyForCheckin && !isInProgress && (
                <Badge className="bg-[#BF4B24] text-white border-0 mb-2 font-bold px-2 py-0.5 animate-pulse mr-2">
                  Encoste na Tag NFC da porta para Check-in
                </Badge>
              )}
              {isMerged && (
                <Badge className="bg-indigo-100 text-indigo-800 border-0 mb-2 font-bold px-2 py-0.5 uppercase tracking-widest">
                  {booking.original_ids?.length} Sessões Contíguas
                </Badge>
              )}

              <h3 className="text-xl font-black text-slate-900 leading-tight group-hover:text-[#BF4B24] transition-colors">
                {booking.rooms.name}
              </h3>
              <p className="text-sm font-semibold text-slate-500 mt-1">
                Anfitrião: {booking.rooms.profiles?.full_name}
              </p>
            </div>
          </div>

          {/* AVISO EDUCATIVO DE SAÍDA PONTUAL QUANDO EM ANDAMENTO */}
          {isInProgress && (
            <div
              className={`mb-3 p-3 rounded-xl border text-xs font-medium flex items-start gap-2.5 ${
                minsRemaining <= 5
                  ? "bg-red-50 border-red-200 text-red-900"
                  : "bg-amber-50/80 border-amber-200/80 text-amber-950"
              }`}
            >
              <Timer
                className={`w-4 h-4 shrink-0 mt-0.5 ${
                  minsRemaining <= 5
                    ? "text-red-600 animate-bounce"
                    : "text-amber-600"
                }`}
              />
              <div>
                <p className="font-bold">
                  {minsRemaining > 0
                    ? `Restam ${minsRemaining} min • Libere a sala até as ${format(endObj, "HH:mm")}`
                    : `Horário encerrado às ${format(endObj, "HH:mm")} • Registre sua saída agora`}
                </p>
                <p className="text-[11px] opacity-90 mt-0.5">
                  Ao sair, encoste o celular na Tag NFC da porta ou toque em{" "}
                  <strong>Registrar Saída</strong> ao lado para evitar cobrança
                  de hora extra.
                </p>
              </div>
            </div>
          )}

          <div
            className="mt-auto bg-slate-900 rounded-2xl p-5 text-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                  <MapPin className="w-4 h-4 text-emerald-400" />
                </div>
                <div>
                  <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                    Endereço Exato Liberado
                  </p>
                  <p className="font-bold text-sm leading-tight">
                    {fullAddress}
                  </p>
                </div>
              </div>
              <button
                onClick={() =>
                  window.open(
                    `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${address.street}, ${address.number}, ${address.city}`)}`,
                  )
                }
                className="w-10 h-10 rounded-full bg-[#BF4B24] hover:bg-[#9A3C1D] flex items-center justify-center shrink-0 transition-colors shadow-lg"
              >
                <Navigation className="w-4 h-4 fill-white" />
              </button>
            </div>
          </div>
        </div>

        <div
          className="p-4 md:p-6 bg-slate-50 md:bg-transparent border-t md:border-t-0 md:border-l border-slate-100 flex flex-col justify-center gap-2 md:w-60 shrink-0"
          onClick={(e) => e.stopPropagation()}
        >
          <Button
            onClick={(e) => handleOpenChat(booking, e)}
            disabled={actionLoading}
            variant="outline"
            className="w-full h-10 rounded-lg text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-100 mb-1 shadow-sm"
          >
            <MessageCircle className="w-3.5 h-3.5 mr-1.5" /> Falar com Anfitrião
          </Button>

          {isInProgress ? (
            <>
              <Button
                onClick={() => executeInstantCheckout(booking, false)}
                disabled={actionLoading}
                className="w-full h-12 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg shadow-emerald-600/20"
              >
                <LogOut className="w-4 h-4 mr-2" /> Registrar Saída
              </Button>
              <Button
                onClick={() => setActiveSessionBooking(booking)}
                variant="outline"
                className="w-full h-10 border-amber-300 bg-amber-50 text-amber-900 font-bold text-xs rounded-xl"
              >
                <Timer className="w-3.5 h-3.5 mr-1.5" /> Ver Cronômetro
              </Button>
            </>
          ) : isReadyForCheckin ? (
            <>
              <Button
                onClick={() => executeInstantCheckin(booking, false)}
                disabled={actionLoading}
                className="w-full h-12 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl shadow-lg shadow-orange-500/20"
              >
                <SmartphoneNfc className="w-4 h-4 mr-2" /> Confirmar Entrada
              </Button>
              <Button
                onClick={() =>
                  setScannerConfig({
                    isOpen: true,
                    type: "checkin",
                    booking,
                    cameraFailed: false,
                  })
                }
                variant="ghost"
                className="w-full h-9 text-[11px] font-bold text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                <QrCode className="w-3.5 h-3.5 mr-1.5" /> Ler QR Code na porta
              </Button>
            </>
          ) : (
            <>
              {hasBackToBack && startTimeMs > nowTime && (
                <div className="w-full text-center bg-amber-50 text-amber-700 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-amber-100 mb-1">
                  Sala Ocupada (Aguarde ⏰)
                </div>
              )}
              <Button
                onClick={() => setCancelModal({ isOpen: true, booking })}
                variant="ghost"
                className="w-full h-10 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 mt-1"
              >
                <XCircle className="w-3.5 h-3.5 mr-1.5" /> Cancelar
              </Button>
            </>
          )}
        </div>
      </div>
    );
  };

  const HistoryCard = ({ booking }: { booking: Booking }) => {
    const startObj = parseISO(booking.start_time);
    const statusData = getStatusDisplay(booking.status);
    const paymentData = getPaymentDisplay(booking);
    const isMerged = booking.original_ids && booking.original_ids.length > 1;

    return (
      <div
        onClick={() => openDetails(booking)}
        className="flex items-center justify-between p-4 bg-white border border-slate-200 hover:border-[#BF4B24]/50 rounded-2xl cursor-pointer transition-all active:scale-[0.98] shadow-sm hover:shadow-md group"
      >
        <div className="flex items-center gap-4 min-w-0">
          <div className="w-14 h-14 rounded-xl bg-slate-100 border border-slate-200 flex items-center justify-center shrink-0 overflow-hidden relative">
            {booking.rooms?.image_url ? (
              <Image
                src={booking.rooms.image_url}
                alt={booking.rooms.name}
                fill
                className="object-cover"
              />
            ) : (
              <Building2 className="w-6 h-6 text-slate-400" />
            )}
          </div>
          <div className="min-w-0">
            <h4 className="font-black text-slate-900 truncate text-base group-hover:text-[#BF4B24] transition-colors leading-tight">
              {booking.rooms?.name || "Sala Indisponível"}
            </h4>
            <p className="text-xs font-bold text-slate-500 mt-1">
              {format(startObj, "dd 'de' MMM", { locale: ptBR })} •{" "}
              {format(startObj, "HH:mm")}
            </p>
            <div className="flex items-center gap-2 mt-1">
              <Badge
                className={`${statusData.color} border-0 shadow-none font-bold text-[9px] px-1.5 py-0 uppercase tracking-widest`}
              >
                {statusData.label}
              </Badge>
              {isMerged && (
                <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-1.5 rounded-sm">
                  {booking.original_ids?.length}h
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-col items-end gap-1 shrink-0 ml-2">
          <div className="flex items-center text-slate-900 font-black text-sm">
            {paymentData.value}
            <ChevronRight className="w-4 h-4 ml-1 opacity-50 group-hover:opacity-100 group-hover:translate-x-1 group-hover:text-[#BF4B24] transition-all" />
          </div>
          <span className="text-[10px] font-bold text-slate-400">
            {paymentData.method}
          </span>
        </div>
      </div>
    );
  };

  // TELA DE CARREGAMENTO INTELIGENTE ("Conectando à porta...")
  if (isProcessingSmartDoor) {
    return (
      <div className="fixed inset-0 z-[300] bg-stone-950 flex flex-col items-center justify-center p-6 text-center text-white animate-in fade-in duration-200">
        <div className="relative mb-6">
          <div className="absolute inset-0 bg-[#BF4B24] rounded-full blur-xl opacity-20 animate-pulse" />
          <div className="w-20 h-20 bg-stone-900 border border-stone-800 rounded-full flex items-center justify-center relative z-10">
            <SmartphoneNfc className="w-10 h-10 text-[#BF4B24] animate-pulse" />
          </div>
        </div>
        <h2 className="text-2xl font-black mb-2">Conectando à porta...</h2>
        <p className="text-sm text-stone-400 max-w-xs leading-relaxed">
          Verificando sua reserva e autenticando o acesso de forma segura.
        </p>
      </div>
    );
  }

  if (activeSessionBooking) {
    return (
      <div className="pt-6 px-4 md:pt-10 md:px-8 max-w-2xl mx-auto pb-32 animate-in fade-in">
        <Button
          variant="ghost"
          onClick={() => setActiveSessionBooking(null)}
          className="mb-4 text-slate-500 hover:text-slate-900 font-bold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para as Reservas
        </Button>
        <ActiveSession
          booking={activeSessionBooking}
          onSessionEnd={() => {
            setActiveSessionBooking(null);
            fetchBookings();
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 max-w-3xl mx-auto animate-in fade-in pb-24 pt-6 px-4">
        {/* HEADER & TABS */}
        <div className="sticky top-0 bg-slate-50 z-20 pb-4">
          <div className="flex items-center justify-between gap-3 mb-6">
            <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-[#BF4B24]" /> Suas Reservas
            </h2>

            <div className="inline-flex items-center gap-1.5 bg-white border border-stone-200/90 px-3 py-1.5 rounded-full text-[11px] font-bold text-stone-700 shadow-2xs">
              <SmartphoneNfc className="w-3.5 h-3.5 text-[#BF4B24]" />
              <span>NFC / QR ativo nas portas</span>
            </div>
          </div>

          <div className="bg-slate-200/60 p-1 rounded-xl flex items-center mb-4">
            <button
              onClick={() => {
                setActiveTab("upcoming");
                setUpcomingFilter("all");
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "upcoming" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Próximas
            </button>
            <button
              onClick={() => {
                setActiveTab("past");
                setHistoryFilter("30d");
              }}
              className={`flex-1 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "past" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"}`}
            >
              Histórico
            </button>
          </div>

          {/* FILTERS */}
          <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
            {activeTab === "upcoming" ? (
              <>
                {["all", "today", "tomorrow"].map((f) => (
                  <Badge
                    key={f}
                    onClick={() => setUpcomingFilter(f as any)}
                    className={`cursor-pointer px-4 py-1.5 text-xs font-bold border-0 transition-colors ${upcomingFilter === f ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-100 shadow-sm"}`}
                  >
                    {f === "all" ? "Todas" : f === "today" ? "Hoje" : "Amanhã"}
                  </Badge>
                ))}
                <Popover>
                  <PopoverTrigger asChild>
                    <Badge
                      className={`cursor-pointer px-4 py-1.5 text-xs font-bold border-0 transition-colors flex items-center gap-1 ${upcomingFilter === "custom" ? "bg-[#BF4B24] text-white" : "bg-white text-slate-600 hover:bg-slate-100 shadow-sm"}`}
                    >
                      <CalendarIcon className="w-3 h-3" />
                      {upcomingFilter === "custom" && customDate
                        ? format(customDate, "dd/MM")
                        : "Data Específica"}
                    </Badge>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar
                      mode="single"
                      selected={customDate}
                      onSelect={(date) => {
                        if (date) {
                          setCustomDate(date);
                          setUpcomingFilter("custom");
                        }
                      }}
                      initialFocus
                    />
                  </PopoverContent>
                </Popover>
              </>
            ) : (
              <Select
                value={historyFilter}
                onValueChange={(v: any) => setHistoryFilter(v)}
              >
                <SelectTrigger className="w-[180px] bg-white border-0 shadow-sm h-8 font-bold text-slate-700 rounded-full text-xs focus:ring-0">
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="7d">Últimos 7 dias</SelectItem>
                  <SelectItem value="15d">Últimos 15 dias</SelectItem>
                  <SelectItem value="30d">Últimos 30 dias</SelectItem>
                  <SelectItem value="month">Este Mês</SelectItem>
                  <SelectItem value="all">Todo o Histórico</SelectItem>
                </SelectContent>
              </Select>
            )}
          </div>
        </div>

        {/* LISTAGEM DE CARDS */}
        <div className="space-y-3">
          {displayBookings.length === 0 ? (
            <div className="text-center py-20 bg-white rounded-3xl border border-slate-200 shadow-sm flex flex-col items-center">
              <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                {activeTab === "upcoming" ? (
                  <CalendarDays className="w-10 h-10 text-slate-300" />
                ) : (
                  <Clock className="w-10 h-10 text-slate-300" />
                )}
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">
                Nenhum registro encontrado
              </h3>
              <p className="text-slate-500 font-medium max-w-sm mb-8">
                {activeTab === "upcoming"
                  ? "Você não possui agendamentos para esta data."
                  : "Nenhum histórico disponível para este filtro."}
              </p>
              {activeTab === "upcoming" && (
                <Button
                  onClick={() => onNavigateToSearch && onNavigateToSearch()}
                  className="h-14 px-8 rounded-xl font-black bg-slate-900 hover:bg-slate-800 text-white shadow-lg"
                >
                  Explorar Salas
                </Button>
              )}
            </div>
          ) : (
            displayBookings.map((b) =>
              activeTab === "upcoming" ? (
                <UpcomingCard key={b.id} booking={b} />
              ) : (
                <HistoryCard key={b.id} booking={b} />
              ),
            )
          )}
        </div>
      </div>

      {/* ==================================================================== */}
      {/* MODAL INTELIGENTE DE PORTA (NFC / QR CODE AUTOMÁTICO + EDUCAÇÃO)     */}
      {/* ==================================================================== */}
      <Dialog
        open={doorSmartModal.isOpen}
        onOpenChange={(open) =>
          !open && setDoorSmartModal((p) => ({ ...p, isOpen: false }))
        }
      >
        <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden bg-white border-0 shadow-2xl">
          <DialogTitle className="sr-only">
            Controle de Acesso da Sala
          </DialogTitle>

          {/* 1. CHECK-IN REALIZADO COM EDUCAÇÃO DE HORÁRIO */}
          {doorSmartModal.mode === "checkin_done" && doorSmartModal.booking && (
            <div>
              <div className="bg-emerald-600 p-6 text-white text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur-xs flex items-center justify-center mx-auto mb-3">
                  <CheckCircle2 className="w-9 h-9 text-white" />
                </div>
                <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-800/60 px-3 py-1 rounded-full">
                  Check-in NFC / QR Registrado
                </span>
                <h2 className="text-2xl font-black mt-2">
                  Bom atendimento, Doutor(a)!
                </h2>
                <p className="text-xs text-emerald-100 mt-1 font-medium">
                  {doorSmartModal.booking.rooms.name} • Entrada às{" "}
                  {format(
                    parseISO(
                      doorSmartModal.booking.checkin_time ||
                        new Date().toISOString(),
                    ),
                    "HH:mm",
                  )}
                </p>
              </div>

              <div className="p-6 space-y-4">
                <div className="p-4 rounded-2xl bg-amber-50 border border-amber-200/90 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-black uppercase tracking-wider text-amber-800 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#BF4B24]" />
                      Horário Limite de Saída
                    </span>
                    <span className="text-lg font-black text-stone-900">
                      {format(
                        parseISO(doorSmartModal.booking.end_time),
                        "HH:mm",
                      )}
                    </span>
                  </div>
                  <p className="text-xs text-stone-700 leading-relaxed">
                    Para garantir a organização da clínica e a entrada pontual
                    do próximo profissional, encerre sua consulta até as{" "}
                    <strong>
                      {format(
                        parseISO(doorSmartModal.booking.end_time),
                        "HH:mm",
                      )}
                    </strong>
                    .
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-stone-100 border border-stone-200/80 flex items-start gap-3">
                  <SmartphoneNfc className="w-5 h-5 text-[#BF4B24] shrink-0 mt-0.5" />
                  <p className="text-xs text-stone-700 leading-relaxed">
                    <strong className="text-stone-900 block mb-0.5">
                      Como registrar sua saída (Check-out):
                    </strong>
                    Ao sair do consultório, basta{" "}
                    <strong>
                      encostar novamente o celular na Tag NFC da porta
                    </strong>{" "}
                    (ou tocar em <em>Registrar Saída</em> no app). Isso evita a
                    cobrança automática de hora adicional.
                  </p>
                </div>

                <Button
                  onClick={() => {
                    const b = doorSmartModal.booking;
                    setDoorSmartModal((p) => ({ ...p, isOpen: false }));
                    if (b) setActiveSessionBooking(b);
                  }}
                  className="w-full h-12 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-black"
                >
                  Entendi, abrir cronômetro da sessão
                </Button>
              </div>
            </div>
          )}

          {/* 2. CHECK-OUT REALIZADO COM RESUMO DE PONTUALIDADE + AVALIAÇÃO */}
          {doorSmartModal.mode === "checkout_done" &&
            doorSmartModal.booking && (
              <div>
                <div className="bg-stone-900 p-6 text-white text-center">
                  <div className="w-16 h-16 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center mx-auto mb-3">
                    <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest bg-emerald-500/20 text-emerald-300 px-3 py-1 rounded-full">
                    Saída Registrada com Sucesso
                  </span>
                  <h2 className="text-2xl font-black mt-2">
                    Sessão Encerrada! 👏
                  </h2>
                  <p className="text-xs text-stone-300 mt-1">
                    Obrigado por liberar a{" "}
                    <strong>{doorSmartModal.booking.rooms.name}</strong> e
                    contribuir com a pontualidade da Fusion Clinic.
                  </p>
                </div>

                <div className="p-6 space-y-5">
                  <div className="grid grid-cols-2 gap-3 p-3.5 rounded-2xl bg-stone-50 border border-stone-200/80 text-center">
                    <div>
                      <span className="text-[10px] font-bold uppercase text-stone-400 block">
                        Horário de Entrada
                      </span>
                      <span className="text-base font-black text-stone-900">
                        {doorSmartModal.booking.checkin_time
                          ? format(
                              parseISO(doorSmartModal.booking.checkin_time),
                              "HH:mm",
                            )
                          : "--:--"}
                      </span>
                    </div>
                    <div className="border-l border-stone-200">
                      <span className="text-[10px] font-bold uppercase text-stone-400 block">
                        Horário de Saída
                      </span>
                      <span className="text-base font-black text-emerald-700">
                        {doorSmartModal.booking.checkout_time
                          ? format(
                              parseISO(doorSmartModal.booking.checkout_time),
                              "HH:mm",
                            )
                          : format(new Date(), "HH:mm")}
                      </span>
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      onClick={() =>
                        setDoorSmartModal((p) => ({ ...p, isOpen: false }))
                      }
                      className="flex-1 h-12 rounded-xl font-bold border-stone-200"
                    >
                      Fechar
                    </Button>
                    <Button
                      onClick={() => {
                        const b = doorSmartModal.booking;
                        setDoorSmartModal((p) => ({ ...p, isOpen: false }));
                        if (b) {
                          setReviewModal({
                            isOpen: true,
                            booking: b,
                            rating: 0,
                            comment: "",
                          });
                        }
                      }}
                      className="flex-1 h-12 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black"
                    >
                      <Star className="w-4 h-4 mr-1.5 fill-white" /> Avaliar
                      Sala
                    </Button>
                  </div>
                </div>
              </div>
            )}

          {/* 3. ALERTA DE SALA INCORRETA (PROTEÇÃO PARA PORTAS SEM TRANCA) */}
          {doorSmartModal.mode === "wrong_room" && doorSmartModal.booking && (
            <div>
              <div className="bg-red-600 p-6 text-white text-center">
                <div className="w-16 h-16 rounded-2xl bg-white/20 flex items-center justify-center mx-auto mb-3">
                  <ShieldAlert className="w-9 h-9 text-white" />
                </div>
                <h2 className="text-xl font-black">
                  Atenção: Consultório Diferente!
                </h2>
                <p className="text-xs text-red-100 mt-1">
                  Você aproximou o celular de outra porta.
                </p>
              </div>

              <div className="p-6 space-y-4 text-center">
                <p className="text-xs text-stone-600 leading-relaxed">
                  Sua reserva agendada para hoje é no consultório abaixo:
                </p>

                <div className="p-4 rounded-2xl bg-orange-50 border border-[#BF4B24]/30">
                  <p className="text-base font-black text-stone-900">
                    {doorSmartModal.booking.rooms.name}
                  </p>
                  <p className="text-xs font-bold text-[#BF4B24] mt-1">
                    Horário:{" "}
                    {format(
                      parseISO(doorSmartModal.booking.start_time),
                      "HH:mm",
                    )}{" "}
                    às{" "}
                    {format(parseISO(doorSmartModal.booking.end_time), "HH:mm")}
                  </p>
                </div>

                <Button
                  onClick={() =>
                    setDoorSmartModal((p) => ({ ...p, isOpen: false }))
                  }
                  className="w-full h-12 rounded-xl bg-stone-900 text-white font-black"
                >
                  Entendi, vou para a sala correta
                </Button>
              </div>
            </div>
          )}

          {/* 4. AINDA MUITO CEDO PARA CHECK-IN */}
          {doorSmartModal.mode === "too_early" && doorSmartModal.booking && (
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                <Clock className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-stone-900">
                Sua reserva começa às{" "}
                {format(parseISO(doorSmartModal.booking.start_time), "HH:mm")}
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                O check-in na{" "}
                <strong>{doorSmartModal.booking.rooms.name}</strong> libera
                automaticamente 15 minutos antes do início (ou assim que o
                profissional anterior encerrar o atendimento).
              </p>
              <Button
                onClick={() =>
                  setDoorSmartModal((p) => ({ ...p, isOpen: false }))
                }
                className="w-full h-11 rounded-xl bg-stone-900 text-white font-bold"
              >
                Aguardar na recepção
              </Button>
            </div>
          )}

          {/* 5. SEM RESERVA ATIVA HOJE */}
          {doorSmartModal.mode === "no_booking" && (
            <div className="p-6 text-center space-y-4">
              <div className="w-14 h-14 rounded-2xl bg-stone-100 text-stone-700 flex items-center justify-center mx-auto">
                <CalendarDays className="w-7 h-7" />
              </div>
              <h3 className="text-lg font-black text-stone-900">
                Nenhuma reserva ativa encontrada para agora
              </h3>
              <p className="text-xs text-stone-600 leading-relaxed">
                Não localizamos um agendamento confirmado na sua conta para este
                horário. Deseja verificar a disponibilidade e reservar agora?
              </p>
              <div className="flex gap-2.5">
                <Button
                  variant="outline"
                  onClick={() =>
                    setDoorSmartModal((p) => ({ ...p, isOpen: false }))
                  }
                  className="flex-1 h-11 rounded-xl font-bold"
                >
                  Fechar
                </Button>
                <Button
                  onClick={() => {
                    setDoorSmartModal((p) => ({ ...p, isOpen: false }));
                    if (onNavigateToSearch) onNavigateToSearch();
                  }}
                  className="flex-1 h-11 rounded-xl bg-[#BF4B24] text-white font-bold"
                >
                  Reservar Sala
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* GAVETA DE DETALHES (Sheet) */}
      <Sheet open={isSheetOpen} onOpenChange={setIsSheetOpen}>
        <SheetContent
          side="bottom"
          className="h-[92vh] sm:h-[100dvh] sm:max-h-screen sm:max-w-full sm:w-full sm:inset-0 rounded-t-[2rem] sm:rounded-none px-6 pt-8 pb-6 sm:p-12 overflow-y-auto bg-slate-50"
        >
          <SheetTitle className="sr-only">Detalhes da Reserva</SheetTitle>
          {selectedBooking &&
            (() => {
              const startObj = parseISO(selectedBooking.start_time);
              const endObj = parseISO(selectedBooking.end_time);
              const statusData = getStatusDisplay(selectedBooking.status);
              const paymentData = getPaymentDisplay(selectedBooking);

              let address: any = {};
              try {
                address =
                  typeof selectedBooking.rooms.address_details === "string"
                    ? JSON.parse(selectedBooking.rooms.address_details)
                    : selectedBooking.rooms.address_details;
              } catch (e) {}
              const fullAddress = `${address.street || ""}, ${address.number || ""} ${address.complement ? `- ${address.complement}` : ""}`;

              const hasBackToBack = adjacentMap[selectedBooking.id] || false;
              const checkInWindowMs = hasBackToBack ? 0 : 15 * 60 * 1000;
              const isReadyForCheckin =
                selectedBooking.status === "confirmed" &&
                startObj.getTime() - nowTime <= checkInWindowMs &&
                nowTime < endObj.getTime();
              const isInProgress = selectedBooking.status === "in_progress";
              const isEvaluated =
                selectedBooking.reviews && selectedBooking.reviews.length > 0;

              return (
                <div className="max-w-3xl mx-auto w-full space-y-6">
                  <div className="hidden sm:flex mb-6">
                    <Button
                      variant="ghost"
                      onClick={() => setIsSheetOpen(false)}
                      className="text-slate-500 hover:text-slate-900 font-bold -ml-4"
                    >
                      <ArrowLeft className="w-4 h-4 mr-2" /> Fechar Detalhes
                    </Button>
                  </div>

                  <div className="flex justify-between items-start">
                    <div>
                      <Badge
                        className={`${statusData.color} mb-3 shadow-none border-0 uppercase tracking-widest font-black text-[10px]`}
                      >
                        {statusData.label}
                      </Badge>
                      <h2 className="text-2xl sm:text-3xl font-black text-slate-900 leading-tight">
                        {selectedBooking.rooms?.name}
                      </h2>
                      <p className="text-sm font-bold text-slate-500 mt-1 flex items-center gap-1.5">
                        <MapPin className="w-4 h-4" />{" "}
                        {address.neighborhood || "Localização"},{" "}
                        {address.city || "Cidade"}
                      </p>
                    </div>
                  </div>

                  <div className="w-full h-48 sm:h-64 bg-slate-200 rounded-2xl overflow-hidden relative border border-slate-200 shadow-inner">
                    {selectedBooking.rooms?.image_url ? (
                      <Image
                        src={selectedBooking.rooms.image_url}
                        alt="Sala"
                        fill
                        className="object-cover"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <MapIcon className="w-10 h-10 text-slate-400" />
                      </div>
                    )}
                    {activeTab === "upcoming" && (
                      <div className="absolute bottom-3 right-3">
                        <button
                          onClick={() =>
                            window.open(
                              `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`,
                            )
                          }
                          className="bg-white/90 backdrop-blur text-slate-900 text-xs font-bold px-3 py-2 rounded-lg flex items-center gap-2 shadow-lg"
                        >
                          <Navigation className="w-3.5 h-3.5 text-[#BF4B24]" />{" "}
                          Ver no Mapa
                        </button>
                      </div>
                    )}
                  </div>

                  {activeTab === "upcoming" && (
                    <Button
                      onClick={(e) => handleOpenChat(selectedBooking, e)}
                      disabled={actionLoading}
                      variant="outline"
                      className="w-full h-12 rounded-xl font-bold border-slate-200 text-slate-700 bg-white shadow-sm mb-2"
                    >
                      <MessageCircle className="w-4 h-4 mr-2 text-[#BF4B24]" />{" "}
                      Acionar Anfitrião / Suporte
                    </Button>
                  )}

                  <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm space-y-4">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                      Cronograma
                    </h4>
                    <div className="relative pl-6 space-y-6 before:absolute before:inset-y-2 before:left-2 before:w-0.5 before:bg-slate-100">
                      <div className="relative">
                        <div className="absolute -left-[1.6rem] top-1.5 w-2.5 h-2.5 rounded-full bg-slate-300 ring-4 ring-white" />
                        <p className="text-xs font-bold text-slate-500 uppercase">
                          Período Agendado
                        </p>
                        <p className="text-sm font-black text-slate-900">
                          {format(startObj, "dd MMM yyyy", { locale: ptBR })} •{" "}
                          {format(startObj, "HH:mm")} às{" "}
                          {format(endObj, "HH:mm")}
                        </p>
                      </div>
                      {(selectedBooking.checkin_time ||
                        selectedBooking.checkout_time) && (
                        <div className="relative">
                          <div className="absolute -left-[1.6rem] top-1.5 w-2.5 h-2.5 rounded-full bg-[#BF4B24] ring-4 ring-white" />
                          <p className="text-xs font-bold text-[#BF4B24] uppercase">
                            Uso Efetivo
                          </p>
                          <div className="flex gap-6 mt-1">
                            <div>
                              <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                <LogIn className="w-3 h-3" /> Entrada
                              </p>
                              <p className="text-sm font-black text-slate-900">
                                {selectedBooking.checkin_time
                                  ? format(
                                      parseISO(selectedBooking.checkin_time),
                                      "HH:mm",
                                    )
                                  : "--:--"}
                              </p>
                            </div>
                            <div>
                              <p className="text-xs font-medium text-slate-500 flex items-center gap-1">
                                <LogOut className="w-3 h-3" /> Saída
                              </p>
                              <p className="text-sm font-black text-slate-900">
                                {selectedBooking.checkout_time
                                  ? format(
                                      parseISO(selectedBooking.checkout_time),
                                      "HH:mm",
                                    )
                                  : "--:--"}
                              </p>
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="bg-white border border-slate-100 p-5 rounded-2xl shadow-sm flex justify-between items-center">
                    <div>
                      <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Resumo Financeiro
                      </h4>
                      <p className="text-xs font-bold text-slate-500 mt-1">
                        Via {paymentData.method}
                      </p>
                      {paymentData.isCredit && (
                        <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                          {paymentData.equivalentBrl}
                        </p>
                      )}
                    </div>
                    <span className="text-2xl font-black text-slate-900">
                      {paymentData.value}
                    </span>
                  </div>

                  <div className="space-y-3 pt-4">
                    {activeTab === "upcoming" ? (
                      <>
                        {isInProgress ? (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <Button
                              onClick={() =>
                                executeInstantCheckout(selectedBooking, false)
                              }
                              disabled={actionLoading}
                              className="w-full h-14 bg-emerald-600 hover:bg-emerald-700 text-white font-black rounded-xl shadow-lg"
                            >
                              <LogOut className="w-5 h-5 mr-2" /> Registrar
                              Saída (Check-out)
                            </Button>
                            <Button
                              onClick={() => {
                                setIsSheetOpen(false);
                                setActiveSessionBooking(selectedBooking);
                              }}
                              variant="outline"
                              className="w-full h-14 border-amber-300 bg-amber-50 text-amber-900 font-black rounded-xl"
                            >
                              <Timer className="w-5 h-5 mr-2" /> Ver Cronômetro
                            </Button>
                          </div>
                        ) : isReadyForCheckin ? (
                          <Button
                            onClick={() => {
                              setIsSheetOpen(false);
                              executeInstantCheckin(selectedBooking, false);
                            }}
                            disabled={actionLoading}
                            className="w-full h-14 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl shadow-lg"
                          >
                            <SmartphoneNfc className="w-5 h-5 mr-2" /> Confirmar
                            Entrada (Check-in)
                          </Button>
                        ) : (
                          <Button
                            onClick={() => {
                              setIsSheetOpen(false);
                              setCancelModal({
                                isOpen: true,
                                booking: selectedBooking,
                              });
                            }}
                            variant="ghost"
                            className="w-full h-12 text-xs font-bold text-red-500 hover:text-red-700 hover:bg-red-50 rounded-xl"
                          >
                            Cancelar Reserva
                          </Button>
                        )}
                      </>
                    ) : (
                      <>
                        <Button
                          onClick={() =>
                            handleBookAgain(selectedBooking.room_id)
                          }
                          className="w-full h-14 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl shadow-lg shadow-orange-500/20"
                        >
                          <RotateCcw className="w-5 h-5 mr-2" /> Reservar
                          Novamente
                        </Button>
                        <div className="grid grid-cols-2 gap-3">
                          {selectedBooking.status === "completed" ? (
                            <Button
                              onClick={() =>
                                setReceiptModal({
                                  isOpen: true,
                                  booking: selectedBooking,
                                })
                              }
                              variant="outline"
                              className="h-12 border-slate-200 bg-white text-slate-700 font-bold rounded-xl shadow-sm"
                            >
                              <Receipt className="w-4 h-4 mr-2" /> Recibo
                            </Button>
                          ) : (
                            <div className="flex items-center justify-center h-12 text-[10px] font-bold text-slate-400 uppercase tracking-widest text-center bg-white border border-slate-100 rounded-xl">
                              Sem Recibo
                              <br />
                              (Não Concluída)
                            </div>
                          )}
                          {selectedBooking.status === "completed" &&
                            (isEvaluated ? (
                              <div className="h-12 bg-emerald-50 border border-emerald-100 rounded-xl flex items-center justify-center gap-2 text-emerald-700 font-black text-sm">
                                <CheckCircle2 className="w-4 h-4" /> Avaliado (
                                {selectedBooking.reviews?.[0]?.rating}{" "}
                                <Star className="w-3 h-3 inline fill-current -mt-0.5" />
                                )
                              </div>
                            ) : (
                              <Button
                                onClick={() =>
                                  setReviewModal({
                                    isOpen: true,
                                    booking: selectedBooking,
                                    rating: 0,
                                    comment: "",
                                  })
                                }
                                variant="outline"
                                className="h-12 border-amber-200 bg-amber-50 text-amber-700 font-bold rounded-xl shadow-sm hover:bg-amber-100"
                              >
                                <Star className="w-4 h-4 mr-2" /> Avaliar
                              </Button>
                            ))}
                        </div>
                      </>
                    )}
                  </div>
                </div>
              );
            })()}
        </SheetContent>
      </Sheet>

      {/* MODAL DE EXTENSÃO AUTOMÁTICA (OVERTIME) */}
      <Dialog
        open={extendModal.isOpen}
        onOpenChange={(open) =>
          !open && setExtendModal({ isOpen: false, booking: null })
        }
      >
        <DialogContent className="sm:max-w-md rounded-[2rem] p-6 bg-white border-0">
          <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Timer className="w-6 h-6 text-[#BF4B24]" /> Estender Sessão?
          </DialogTitle>
          <DialogDescription className="text-sm font-medium text-slate-500 mb-6">
            O seu horário já acabou e notamos que você ainda não fez o
            check-out. A sala está livre no próximo horário. Deseja estender sua
            permanência por mais 1 hora?
            <br />
            <br />
            <span className="text-red-500 font-bold">
              Atenção: Se você já saiu da sala, clique em &ldquo;Registrar Saída
              Agora&rdquo; abaixo. Caso contrário, em 5 minutos o sistema
              renovará +1 hora automaticamente.
            </span>
          </DialogDescription>
          <div className="flex gap-3">
            <Button
              onClick={() => {
                const b = extendModal.booking;
                setExtendModal({ isOpen: false, booking: null });
                if (b) executeInstantCheckout(b, false);
              }}
              variant="outline"
              className="flex-1 h-12 rounded-xl font-bold border-emerald-200 bg-emerald-50 text-emerald-800"
            >
              Registrar Saída Agora
            </Button>
            <Button
              onClick={() => {
                if (extendModal.booking) handleAutoExtend(extendModal.booking);
              }}
              className="flex-1 h-12 bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl"
            >
              Estender (+1 CR)
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE RECIBO DIGITAL */}
      <Dialog
        open={receiptModal.isOpen}
        onOpenChange={(open) =>
          !open && setReceiptModal({ isOpen: false, booking: null })
        }
      >
        <DialogContent className="max-w-2xl w-full h-[100dvh] sm:h-auto sm:max-h-[90vh] p-0 overflow-y-auto bg-slate-50 border-0 sm:rounded-[2rem]">
          <DialogTitle className="sr-only">Recibo de Reserva</DialogTitle>
          {receiptModal.booking &&
            (() => {
              const b = receiptModal.booking;
              const payment = getPaymentDisplay(b);
              const startObj = parseISO(b.start_time);
              const endObj = parseISO(b.end_time);
              const durationFormatted = formatDuration(
                b.start_time,
                b.end_time,
              );
              let address: any = {};
              try {
                address =
                  typeof b.rooms.address_details === "string"
                    ? JSON.parse(b.rooms.address_details)
                    : b.rooms.address_details;
              } catch (e) {}
              const fullAddress = `${address.street || ""}, ${address.number || ""}`;

              return (
                <div className="flex flex-col h-full">
                  <div
                    id="receipt-content"
                    className="bg-white px-6 py-10 sm:p-12 w-full font-sans"
                  >
                    <div className="flex justify-between items-start mb-10">
                      <div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">
                          Recibo
                        </h1>
                        <p className="text-slate-500 font-medium mt-1">
                          {format(endObj, "dd 'de' MMMM 'de' yyyy", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                      <img
                        src="/icon-512x512.png"
                        alt="Fusion Clinic"
                        className="w-14 h-14 rounded-2xl shadow-sm border border-slate-200 object-cover"
                      />
                    </div>
                    <div className="mb-8">
                      <p className="text-[3rem] leading-none font-black text-slate-900">
                        {payment.value}
                      </p>
                      <div className="flex items-center gap-2 mt-3">
                        <CheckCircle2 className="w-5 h-5 text-emerald-500" />
                        <span className="text-emerald-700 font-bold bg-emerald-50 px-2 py-1 rounded-md text-xs uppercase tracking-widest">
                          Pago com {payment.method}
                        </span>
                      </div>
                    </div>
                    <div className="border-t border-b border-slate-200 py-8 mb-8">
                      <div className="flex gap-6">
                        <div className="flex flex-col items-center mt-1">
                          <div className="w-3 h-3 bg-slate-900 rounded-full" />
                          <div className="w-0.5 h-12 bg-slate-200" />
                          <div className="w-3 h-3 border-[3px] border-slate-900 rounded-full bg-white" />
                        </div>
                        <div className="flex flex-col justify-between h-[4.5rem] flex-1">
                          <div className="flex justify-between items-start w-full">
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {format(startObj, "HH:mm")}
                              </p>
                              <p className="text-xs font-medium text-slate-500 truncate max-w-[200px]">
                                {b.rooms.name}
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-between items-end w-full">
                            <div>
                              <p className="text-sm font-bold text-slate-900">
                                {format(endObj, "HH:mm")}
                              </p>
                              <p className="text-xs font-medium text-slate-500 truncate max-w-[200px]">
                                {fullAddress}
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-4 mb-10">
                      <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest mb-4">
                        Resumo da Fatura
                      </h3>
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 font-medium">
                          Tempo de Locação ({durationFormatted})
                        </span>
                        <span className="font-bold text-slate-900">
                          {payment.value}
                        </span>
                      </div>
                      {payment.isCredit && (
                        <div className="flex justify-between text-sm">
                          <span className="text-slate-600 font-medium">
                            Equivalência (R$)
                          </span>
                          <span className="font-bold text-slate-900">
                            {payment.equivalentBrl}
                          </span>
                        </div>
                      )}
                      <div className="flex justify-between text-sm">
                        <span className="text-slate-600 font-medium">
                          Taxas Fusion Clinic
                        </span>
                        <span className="font-bold text-slate-900">
                          {payment.isCredit ? "0 CR" : "R$ 0,00"}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-lg border-t border-slate-200 pt-4 mt-2">
                        <span className="font-black text-slate-900">
                          Valor Cobrado
                        </span>
                        <span className="font-black text-slate-900">
                          {payment.value}
                        </span>
                      </div>
                    </div>
                    <div className="text-[10px] text-slate-400 text-center uppercase tracking-widest font-bold mt-16">
                      <p>Fusion Clinic Soluções em Saúde Ltda</p>
                      <p>CNPJ: 49.351.127/0001-44</p>
                      <p className="mt-4 font-mono text-slate-300">
                        ID: {b.id.toUpperCase()}
                      </p>
                    </div>
                  </div>
                  <div className="p-6 bg-slate-100 border-t border-slate-200 mt-auto grid grid-cols-2 gap-3">
                    <Button
                      onClick={handleDownloadPDF}
                      variant="outline"
                      className="h-14 font-black rounded-xl text-slate-700 bg-white border-slate-200 shadow-sm"
                    >
                      <Download className="w-5 h-5 mr-2" /> Baixar PDF
                    </Button>
                    <Button
                      onClick={() => handleSendEmail(b, payment)}
                      className="h-14 font-black rounded-xl bg-slate-900 text-white hover:bg-slate-800 shadow-lg"
                    >
                      <Mail className="w-5 h-5 mr-2" /> Enviar p/ Mim
                    </Button>
                  </div>
                </div>
              );
            })()}
        </DialogContent>
      </Dialog>

      {/* MODAL DE AVALIAÇÃO */}
      <Dialog
        open={reviewModal.isOpen}
        onOpenChange={(open) =>
          !open &&
          setReviewModal({
            isOpen: false,
            booking: null,
            rating: 0,
            comment: "",
          })
        }
      >
        <DialogContent className="sm:max-w-md rounded-[2rem] border-0 p-6 bg-white">
          <DialogTitle className="sr-only">Avaliar Experiência</DialogTitle>
          <DialogHeader className="mb-4">
            <h2 className="text-xl font-black text-slate-900">
              Avalie sua experiência
            </h2>
            <DialogDescription className="text-slate-500 font-medium">
              Como foi seu atendimento na sala{" "}
              <strong className="text-slate-700">
                {reviewModal.booking?.rooms.name}
              </strong>
              ?
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-center gap-2 mb-6">
            {[1, 2, 3, 4, 5].map((star) => (
              <button
                key={star}
                onClick={() => setReviewModal((p) => ({ ...p, rating: star }))}
                className="focus:outline-none transition-transform hover:scale-110"
              >
                <Star
                  className={`w-10 h-10 ${reviewModal.rating >= star ? "fill-amber-400 text-amber-400" : "text-slate-200"}`}
                />
              </button>
            ))}
          </div>
          <div className="space-y-4">
            <Textarea
              placeholder="Conte-nos o que achou do espaço (opcional)"
              value={reviewModal.comment}
              onChange={(e) =>
                setReviewModal((p) => ({ ...p, comment: e.target.value }))
              }
              className="resize-none h-24 bg-slate-50 border-slate-200 rounded-xl"
            />
            <Button
              onClick={submitReview}
              disabled={reviewModal.rating === 0 || actionLoading}
              className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-600 text-white font-black shadow-lg"
            >
              {actionLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Enviar Avaliação"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* MODAL DE CANCELAMENTO CLARO E TRANSPARENTE */}
      <Dialog
        open={cancelModal.isOpen}
        onOpenChange={(open) =>
          !open && setCancelModal({ isOpen: false, booking: null })
        }
      >
        <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden border-0">
          <DialogTitle className="sr-only">Cancelar Reserva</DialogTitle>
          {cancelModal.booking &&
            (() => {
              const startMs = new Date(
                cancelModal.booking.start_time,
              ).getTime();
              const isRefundable =
                (startMs - new Date().getTime()) / (1000 * 60 * 60) >= 24;

              return (
                <>
                  <div
                    className={`p-6 pb-8 text-center text-white ${isRefundable ? "bg-amber-500" : "bg-red-600"}`}
                  >
                    <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
                      <AlertTriangle className="w-8 h-8 text-white" />
                    </div>
                    <h2 className="text-2xl font-black mb-1">
                      Deseja cancelar a reserva?
                    </h2>
                  </div>
                  <div className="p-6 bg-white space-y-6">
                    <div
                      className={`p-4 rounded-xl border ${isRefundable ? "bg-emerald-50 border-emerald-100" : "bg-red-50 border-red-100"}`}
                    >
                      {isRefundable ? (
                        <p className="text-sm text-emerald-800 font-medium leading-relaxed">
                          Como você está cancelando com{" "}
                          <b className="font-black">
                            mais de 24 horas de antecedência
                          </b>
                          , o valor desta reserva será integralmente devolvido à
                          sua carteira. Você terá <b>30 dias</b> para utilizar
                          este crédito em uma nova locação.
                        </p>
                      ) : (
                        <p className="text-sm text-red-800 font-medium leading-relaxed">
                          Como falta{" "}
                          <b className="font-black">menos de 24 horas</b> para o
                          início da sua reserva, a janela gratuita expirou. Este
                          cancelamento <b>não é reembolsável</b> e o
                          crédito/valor não retornará para sua conta.
                        </p>
                      )}
                    </div>

                    <div className="flex gap-3 pt-2">
                      <Button
                        onClick={() =>
                          setCancelModal({ isOpen: false, booking: null })
                        }
                        variant="outline"
                        className="flex-1 h-12 rounded-xl font-bold text-slate-700 border-slate-200"
                      >
                        Não, voltar
                      </Button>
                      <Button
                        onClick={handleConfirmCancel}
                        disabled={actionLoading}
                        className={`flex-1 h-12 rounded-xl font-black text-white ${isRefundable ? "bg-amber-500 hover:bg-amber-600" : "bg-red-600 hover:bg-red-700"}`}
                      >
                        {actionLoading ? "Cancelando..." : "Sim, Cancelar"}
                      </Button>
                    </div>
                  </div>
                </>
              );
            })()}
        </DialogContent>
      </Dialog>
    </>
  );
}
