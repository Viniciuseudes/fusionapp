"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter, useSearchParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, isSameDay, addDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMobileBack } from "@/hooks/use-mobile-back";
import {
  CalendarDays,
  MapPin,
  Clock,
  CheckCircle2,
  Navigation,
  MessageCircle,
  Key,
  Wifi,
  Loader2,
  XCircle,
  AlertTriangle,
  RefreshCcw,
  QrCode,
  Timer,
  ArrowLeft,
  LogOut,
  LogIn,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

import { ActiveSession } from "@/components/active-session";
import { RoomQRScanner } from "@/components/qr-scanner";

interface Booking {
  id: string;
  original_ids?: string[];
  room_id: string;
  start_time: string;
  end_time: string;
  status:
    | "pending_payment"
    | "confirmed"
    | "cancelled"
    | "completed"
    | "in_progress";
  total_cost: number;
  checkin_time?: string;
  checkout_time?: string;
  penalty_status?: string;
  rooms: {
    id: string;
    name: string;
    tier?: string;
    image_url: string;
    address_details: any;
    host_id: string;
    profiles?: { full_name: string; phone: string };
  };
}

interface BookingsTabProps {
  onNavigateToSearch?: () => void;
  onNavigateToChat?: () => void;
}

export function BookingsTab({
  onNavigateToSearch,
  onNavigateToChat,
}: BookingsTabProps) {
  const supabase = createClient();
  const { toast } = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [dateFilter, setDateFilter] = useState<"all" | "today" | "tomorrow">(
    "all",
  );
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [adjacentMap, setAdjacentMap] = useState<Record<string, boolean>>({});

  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    booking: Booking | null;
  }>({
    isOpen: false,
    booking: null,
  });

  const [activeSessionBooking, setActiveSessionBooking] =
    useState<Booking | null>(null);
  const [scannerConfig, setScannerConfig] = useState<{
    isOpen: boolean;
    type: "checkin" | "checkout";
    booking: Booking | null;
  }>({
    isOpen: false,
    type: "checkin",
    booking: null,
  });

  useMobileBack(
    !!activeSessionBooking,
    () => setActiveSessionBooking(null),
    "sessao-ativa",
  );
  useMobileBack(
    scannerConfig.isOpen,
    () => setScannerConfig({ isOpen: false, type: "checkin", booking: null }),
    "scanner-qr",
  );
  useMobileBack(
    cancelModal.isOpen,
    () => setCancelModal({ isOpen: false, booking: null }),
    "modal-cancelamento",
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
          id, room_id, start_time, end_time, status, total_cost, checkin_time, checkout_time, penalty_status,
          rooms ( id, name, tier, image_url, address_details, host_id, profiles (full_name, phone) )
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

  useEffect(() => {
    const scanAction = searchParams.get("scan");
    const targetBookingId = searchParams.get("bookingId");

    if (scanAction && targetBookingId && bookings.length > 0) {
      const targetBooking = bookings.find((b) => b.id === targetBookingId);

      if (targetBooking) {
        setScannerConfig({
          isOpen: true,
          type: scanAction as "checkin" | "checkout",
          booking: targetBooking,
        });

        router.replace("/dashboard", { scroll: false });
      }
    }
  }, [searchParams, bookings, router]);

  const handleCheckinSuccess = async () => {
    if (!scannerConfig.booking) return;
    const currentBooking = scannerConfig.booking;

    setScannerConfig({ isOpen: false, type: "checkin", booking: null });

    try {
      const checkinTime = new Date().toISOString();
      const idsToUpdate = currentBooking.original_ids || [currentBooking.id];

      const { error } = await supabase
        .from("bookings")
        .update({ status: "in_progress", checkin_time: checkinTime })
        .in("id", idsToUpdate);

      if (error) throw error;

      toast({
        title: "Check-in Realizado! 🔓",
        description: "Sessão liberada com sucesso.",
      });

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            userId: user.id,
            title: "Check-in Confirmado! ✅",
            body: `Sua sessão na ${currentBooking.rooms.name} começou. Excelente atendimento!`,
            url: "/dashboard",
          }),
        }).catch((err) => console.error("Erro ao enviar push:", err));
      }

      setActiveSessionBooking({
        ...currentBooking,
        status: "in_progress",
        checkin_time: checkinTime,
      });
      fetchBookings();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro no Check-in",
        description: error.message,
      });
    }
  };

  const handleOpenChat = async (booking: Booking) => {
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
        const { error: insertError } = await supabase.from("chats").insert({
          type: "booking",
          status: "open",
          room_id: booking.room_id,
          guest_id: user.id,
          host_id: booking.rooms.host_id,
          booking_id: booking.id,
        });
        if (insertError) throw insertError;
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

      if (isRefundable) {
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        const { error: refundError } = await supabase
          .from("wallet_transactions")
          .insert({
            user_id: user.id,
            amount: booking.total_cost,
            type: "refund",
            tier: booking.rooms.tier || "start",
            description: `Estorno (Cancelamento): ${booking.rooms.name}`,
            expires_at: expiresAt.toISOString(),
          });
        if (refundError) throw refundError;
      }

      toast({
        title: isRefundable
          ? "Reserva Cancelada e Reembolsada"
          : "Reserva Cancelada",
        description: isRefundable
          ? `O valor de ${booking.total_cost} CR foi devolvido à sua carteira.`
          : "Como faltavam menos de 24h, não houve estorno.",
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

  const now = new Date();
  const nowTime = now.getTime();

  const upcomingBookings = bookings
    .filter((b) => {
      if (b.status === "in_progress") return true;
      const endTime = new Date(b.end_time).getTime();
      const isValidStatus = ["confirmed", "pending_payment"].includes(b.status);
      return isValidStatus && endTime > nowTime;
    })
    .filter((b) => {
      const startObj = new Date(b.start_time);
      if (dateFilter === "today") return isSameDay(startObj, now);
      if (dateFilter === "tomorrow")
        return isSameDay(startObj, addDays(now, 1));
      return true;
    });

  const pastBookings = bookings.filter((b) => {
    if (b.status === "in_progress") return false;
    const endTime = new Date(b.end_time).getTime();
    return (
      ["completed", "cancelled", "no_show"].includes(b.status) ||
      endTime <= nowTime
    );
  });

  const displayBookings =
    activeTab === "upcoming" ? upcomingBookings : pastBookings;

  if (activeSessionBooking) {
    return (
      <div className="pt-6 px-4 md:pt-10 md:px-8 max-w-2xl mx-auto pb-32 animate-in fade-in">
        <Button
          variant="ghost"
          onClick={() => setActiveSessionBooking(null)}
          className="mb-4 text-zinc-500 hover:text-zinc-900 font-bold"
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
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in pb-24 pt-10 px-4">
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-2 pr-16 md:pr-0">
          <div>
            <h2 className="text-2xl font-black text-zinc-950 tracking-tight flex items-center gap-2">
              <CalendarDays className="w-6 h-6 text-[#f05e23]" /> Minhas
              Reservas
            </h2>
            <p className="text-sm font-medium text-zinc-500 mt-1">
              Gerencie seus atendimentos e faça o check-in das salas.
            </p>
          </div>

          <div className="bg-zinc-100 p-1.5 rounded-xl flex items-center shrink-0 w-full md:w-auto">
            <button
              onClick={() => setActiveTab("upcoming")}
              className={`flex-1 md:px-8 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "upcoming" ? "bg-white text-zinc-950 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              Próximas
            </button>
            <button
              onClick={() => setActiveTab("past")}
              className={`flex-1 md:px-8 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "past" ? "bg-white text-zinc-950 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
            >
              Histórico
            </button>
          </div>
        </div>

        {activeTab === "upcoming" && (
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            <button
              onClick={() => setDateFilter("all")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${dateFilter === "all" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"}`}
            >
              Todas as datas
            </button>
            <button
              onClick={() => setDateFilter("today")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${dateFilter === "today" ? "bg-[#f05e23] text-white border-[#f05e23]" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"}`}
            >
              Apenas Hoje
            </button>
            <button
              onClick={() => setDateFilter("tomorrow")}
              className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-colors whitespace-nowrap ${dateFilter === "tomorrow" ? "bg-zinc-900 text-white border-zinc-900" : "bg-white text-zinc-500 border-zinc-200 hover:bg-zinc-50"}`}
            >
              Amanhã
            </button>
          </div>
        )}

        {displayBookings.length === 0 ? (
          <div className="text-center py-20 bg-white rounded-[2rem] border border-zinc-200 shadow-sm flex flex-col items-center">
            <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
              <CalendarDays className="w-10 h-10 text-zinc-300" />
            </div>
            <h3 className="text-xl font-black text-zinc-900 mb-2">
              Nenhuma reserva encontrada
            </h3>
            <p className="text-zinc-500 font-medium max-w-sm mb-8">
              {activeTab === "upcoming"
                ? "Você não tem agendamentos para o filtro selecionado."
                : "Nenhum histórico disponível."}
            </p>
            {activeTab === "upcoming" && (
              <Button
                onClick={() => onNavigateToSearch && onNavigateToSearch()}
                className="h-14 px-8 rounded-xl font-black bg-zinc-950 hover:bg-zinc-800 text-white shadow-lg"
              >
                Explorar Salas
              </Button>
            )}
          </div>
        ) : (
          <div className="space-y-6">
            {displayBookings.map((booking) => {
              const startObj = new Date(booking.start_time);
              const endObj = new Date(booking.end_time);
              const startTimeMs = startObj.getTime();
              const endTimeMs = endObj.getTime();

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
                nowTime < endTimeMs;

              const isInProgress = booking.status === "in_progress";

              const isMerged =
                booking.original_ids && booking.original_ids.length > 1;

              return (
                <div
                  key={booking.id}
                  className={`bg-white rounded-[2rem] border shadow-sm overflow-hidden flex flex-col md:flex-row group transition-all ${isInProgress ? "border-amber-400 ring-2 ring-amber-400/20" : isReadyForCheckin ? "border-[#f05e23]/50 hover:border-[#f05e23]" : "border-zinc-200 hover:shadow-md"}`}
                >
                  <div
                    className={`md:w-48 p-6 flex flex-col justify-center border-b md:border-b-0 md:border-r border-zinc-100 border-dashed relative ${isSameDay(startObj, now) ? "bg-orange-50/50" : "bg-zinc-50/50"}`}
                  >
                    <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-1 text-center md:text-left">
                      {format(startObj, "MMMM", { locale: ptBR })}
                    </p>
                    <p className="text-4xl font-black text-zinc-950 tracking-tighter text-center md:text-left">
                      {format(startObj, "dd")}
                    </p>
                    <p className="text-sm font-bold text-zinc-500 capitalize text-center md:text-left mb-4">
                      {format(startObj, "EEEE", { locale: ptBR })}
                    </p>
                    <div
                      className={`flex items-center justify-center md:justify-start gap-2 border py-2 px-3 rounded-lg shadow-sm ${isInProgress ? "bg-amber-50 border-amber-200" : "bg-white border-zinc-200"}`}
                    >
                      <Clock
                        className={`w-4 h-4 ${isInProgress ? "text-amber-500" : "text-[#f05e23]"}`}
                      />
                      <span
                        className={`text-xs font-black ${isInProgress ? "text-amber-800" : "text-zinc-800"}`}
                      >
                        {format(startObj, "HH:mm")} - {format(endObj, "HH:mm")}
                      </span>
                    </div>
                  </div>

                  <div className="flex-1 p-6 flex flex-col">
                    <div className="flex items-start justify-between gap-4 mb-4">
                      <div>
                        {isInProgress && (
                          <Badge className="bg-amber-100 text-amber-800 border-0 mb-2 font-black px-2 py-0.5 animate-pulse uppercase tracking-widest mr-2">
                            Sessão em Andamento
                          </Badge>
                        )}
                        {isReadyForCheckin && !isInProgress && (
                          <Badge className="bg-[#f05e23] text-white border-0 mb-2 font-bold px-2 py-0.5 animate-pulse mr-2">
                            Liberada para Check-in
                          </Badge>
                        )}
                        {activeTab === "past" &&
                          booking.status === "completed" && (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 mb-2 font-bold px-2 py-0.5 mr-2">
                              Concluída
                            </Badge>
                          )}
                        {isMerged && (
                          <Badge className="bg-indigo-100 text-indigo-800 border-0 mb-2 font-bold px-2 py-0.5 uppercase tracking-widest">
                            {booking.original_ids?.length} Sessões Contíguas
                          </Badge>
                        )}

                        <h3 className="text-xl font-black text-zinc-950 leading-tight">
                          {booking.rooms.name}
                        </h3>
                        <p className="text-sm font-semibold text-zinc-500 mt-1">
                          Anfitrião: {booking.rooms.profiles?.full_name}
                        </p>
                      </div>
                    </div>

                    {activeTab === "upcoming" &&
                      booking.status !== "cancelled" && (
                        <div className="mt-auto bg-zinc-950 rounded-2xl p-5 text-white shadow-xl">
                          <div className="flex items-start justify-between gap-4 mb-4">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center shrink-0">
                                <MapPin className="w-4 h-4 text-emerald-400" />
                              </div>
                              <div>
                                <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest mb-0.5">
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
                              className="w-10 h-10 rounded-full bg-[#f05e23] hover:bg-[#d6521e] flex items-center justify-center shrink-0 transition-colors shadow-lg"
                            >
                              <Navigation className="w-4 h-4 fill-white" />
                            </button>
                          </div>
                        </div>
                      )}

                    {activeTab === "past" &&
                      (booking.checkin_time || booking.checkout_time) && (
                        <div className="mt-4 pt-4 border-t border-zinc-100 flex flex-col gap-2">
                          <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest">
                            Registro de Acesso
                          </p>
                          <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-1.5">
                              <LogIn className="w-4 h-4 text-emerald-500" />
                              <span className="text-sm font-medium text-zinc-600">
                                Check-in:{" "}
                                <strong className="text-zinc-900">
                                  {booking.checkin_time
                                    ? format(
                                        new Date(booking.checkin_time),
                                        "HH:mm",
                                      )
                                    : "--:--"}
                                </strong>
                              </span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <LogOut className="w-4 h-4 text-blue-500" />
                              <span className="text-sm font-medium text-zinc-600">
                                Check-out:{" "}
                                <strong className="text-zinc-900">
                                  {booking.checkout_time
                                    ? format(
                                        new Date(booking.checkout_time),
                                        "HH:mm",
                                      )
                                    : "--:--"}
                                </strong>
                              </span>
                            </div>
                          </div>
                        </div>
                      )}
                  </div>

                  {activeTab === "upcoming" &&
                    booking.status !== "cancelled" && (
                      <div className="p-4 md:p-6 bg-zinc-50 md:bg-transparent border-t md:border-t-0 md:border-l border-zinc-100 flex flex-col justify-center gap-2 md:w-56 shrink-0">
                        {isInProgress ? (
                          <Button
                            onClick={() => setActiveSessionBooking(booking)}
                            className="w-full h-12 bg-amber-500 hover:bg-amber-600 text-white font-black rounded-xl shadow-lg shadow-amber-500/20"
                          >
                            <Timer className="w-4 h-4 mr-2" /> Sessão Ativa
                          </Button>
                        ) : isReadyForCheckin ? (
                          <Button
                            onClick={() =>
                              setScannerConfig({
                                isOpen: true,
                                type: "checkin",
                                booking,
                              })
                            }
                            className="w-full h-12 bg-[#f05e23] hover:bg-[#d6521e] text-white font-black rounded-xl shadow-lg shadow-orange-500/20"
                          >
                            <QrCode className="w-4 h-4 mr-2" /> Fazer Check-in
                          </Button>
                        ) : (
                          <>
                            {hasBackToBack && startTimeMs > nowTime && (
                              <div className="w-full text-center bg-amber-50 text-amber-700 py-2 rounded-lg text-[10px] font-bold uppercase tracking-widest border border-amber-100 mb-1">
                                Sala Ocupada (Aguarde ⏰)
                              </div>
                            )}
                            <Button
                              onClick={() => handleOpenChat(booking)}
                              disabled={actionLoading}
                              variant="outline"
                              className="w-full h-10 rounded-lg text-xs font-bold border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                            >
                              <MessageCircle className="w-3.5 h-3.5 mr-1.5" />{" "}
                              Falar com Anfitrião
                            </Button>
                            <Button
                              onClick={() =>
                                setCancelModal({ isOpen: true, booking })
                              }
                              variant="ghost"
                              className="w-full h-10 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700"
                            >
                              <XCircle className="w-3.5 h-3.5 mr-1.5" />{" "}
                              Cancelar
                            </Button>
                          </>
                        )}
                      </div>
                    )}
                </div>
              );
            })}
          </div>
        )}

        <Dialog
          open={cancelModal.isOpen}
          onOpenChange={(open) =>
            !open && setCancelModal({ isOpen: false, booking: null })
          }
        >
          <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden border-0">
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
                      className={`p-6 pb-8 text-center text-white ${isRefundable ? "bg-emerald-600" : "bg-red-600"}`}
                    >
                      <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mx-auto mb-4 backdrop-blur-md">
                        <AlertTriangle className="w-8 h-8 text-white" />
                      </div>
                      <DialogTitle className="text-2xl font-black mb-1">
                        Deseja cancelar a reserva?
                      </DialogTitle>
                    </div>
                    <div className="p-6 bg-white space-y-6">
                      <div className="flex gap-3 pt-2">
                        <Button
                          onClick={() =>
                            setCancelModal({ isOpen: false, booking: null })
                          }
                          variant="outline"
                          className="flex-1 h-12 rounded-xl font-bold text-zinc-700 border-zinc-200"
                        >
                          Manter Reserva
                        </Button>
                        <Button
                          onClick={handleConfirmCancel}
                          disabled={actionLoading}
                          className={`flex-1 h-12 rounded-xl font-black text-white ${isRefundable ? "bg-emerald-600" : "bg-red-600"}`}
                        >
                          {actionLoading ? "Cancelando..." : "Confirmar"}
                        </Button>
                      </div>
                    </div>
                  </>
                );
              })()}
          </DialogContent>
        </Dialog>
      </div>

      {scannerConfig.isOpen && scannerConfig.booking && (
        <RoomQRScanner
          key="checkin-scanner"
          expectedRoomId={scannerConfig.booking.room_id}
          type={scannerConfig.type}
          onSuccess={handleCheckinSuccess}
          onCancel={() =>
            setScannerConfig({ isOpen: false, type: "checkin", booking: null })
          }
        />
      )}
    </>
  );
}
