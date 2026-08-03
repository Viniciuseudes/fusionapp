"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, isPast, isToday, parseISO, differenceInHours } from "date-fns";
import { ptBR } from "date-fns/locale";
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
  CalendarPlus,
  XCircle,
  AlertTriangle,
  RefreshCcw,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

interface Booking {
  id: string;
  room_id: string;
  start_time: string;
  end_time: string;
  status: "pending_payment" | "confirmed" | "cancelled" | "completed";
  total_cost: number;
  rooms: {
    id: string;
    name: string;
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

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"upcoming" | "past">("upcoming");
  const [bookings, setBookings] = useState<Booking[]>([]);

  const [cancelModal, setCancelModal] = useState<{
    isOpen: boolean;
    booking: Booking | null;
  }>({
    isOpen: false,
    booking: null,
  });

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
          id, room_id, start_time, end_time, status, total_cost,
          rooms ( id, name, image_url, address_details, host_id, profiles (full_name, phone) )
        `,
        )
        .eq("user_id", user.id)
        .order("start_time", { ascending: true });

      if (error) throw error;
      setBookings((data as unknown as Booking[]) || []);
    } catch (err) {
      console.error("Erro ao buscar reservas:", err);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível carregar as reservas.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
  }, [supabase]);

  const upcomingBookings = bookings.filter(
    (b) =>
      (b.status === "confirmed" || b.status === "pending_payment") &&
      !isPast(parseISO(b.end_time)),
  );

  const pastBookings = bookings.filter(
    (b) =>
      b.status === "completed" ||
      b.status === "cancelled" ||
      isPast(parseISO(b.end_time)),
  );

  const displayBookings =
    activeTab === "upcoming" ? upcomingBookings : pastBookings;

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

      // Se a tabela não existir, o erro vaza aqui
      if (searchError && Object.keys(searchError).length > 0) throw searchError;

      if (!existingChat) {
        const { error: insertError } = await supabase.from("chats").insert({
          type: "booking",
          status: "open",
          room_id: booking.room_id,
          guest_id: user.id,
          host_id: booking.rooms.host_id,
          booking_id: booking.id,
        });

        // Captura explícita de erro de inserção
        if (insertError) {
          console.error("Erro detalhado do Supabase no Insert:", insertError);
          throw insertError;
        }
      }

      if (onNavigateToChat) {
        onNavigateToChat();
      } else {
        toast({
          title: "Chat aberto!",
          description: "Acesse a aba 'Mensagens' para conversar.",
        });
      }
    } catch (err: any) {
      console.error("Erro mapeado ao criar chat:", err);
      // Blindagem: se o erro for vazio, avisa sobre as permissões
      const errorMessage =
        !err.message || Object.keys(err).length === 0
          ? "As tabelas de chat não foram configuradas corretamente ou o RLS está bloqueando a criação."
          : err.message;

      toast({
        variant: "destructive",
        title: "Erro ao abrir chat",
        description: errorMessage,
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

      const hoursUntilBooking = differenceInHours(
        parseISO(booking.start_time),
        new Date(),
      );
      const isRefundable = hoursUntilBooking >= 24;

      const { error: updateError } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", booking.id);

      if (updateError) throw updateError;

      if (isRefundable) {
        const { error: refundError } = await supabase
          .from("wallet_transactions")
          .insert({
            user_id: user.id,
            amount: booking.total_cost,
            type: "refund",
            description: `Estorno (Cancelamento antecipado): ${booking.rooms.name}`,
          });
        if (refundError) throw refundError;
      }

      toast({
        title: isRefundable
          ? "Reserva Cancelada e Reembolsada"
          : "Reserva Cancelada",
        description: isRefundable
          ? `O valor de ${booking.total_cost}h foi devolvido à sua carteira.`
          : "Como faltavam menos de 24h, não houve estorno de saldo conforme a política.",
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

  const handleRescheduleClick = () => {
    toast({
      title: "Como reagendar?",
      description:
        "Cancele esta reserva (verifique a regra de estorno de 24h) e realize um novo agendamento na sala desejada.",
    });
  };

  const handleOpenMaps = (addressString: string) => {
    window.open(
      `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(addressString)}`,
      "_blank",
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto animate-in fade-in pb-24 pt-6 px-4">
      {/* HEADER E TABS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-black text-zinc-950 tracking-tight flex items-center gap-2">
            <CalendarDays className="w-6 h-6 text-[#f05e23]" /> Minhas Reservas
          </h2>
          <p className="text-sm font-medium text-zinc-500 mt-1">
            Gerencie seus atendimentos e acesse as instruções das salas.
          </p>
        </div>

        <div className="bg-zinc-100 p-1.5 rounded-xl flex items-center shrink-0 w-full md:w-auto">
          <button
            onClick={() => setActiveTab("upcoming")}
            className={`flex-1 md:px-8 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "upcoming" ? "bg-white text-zinc-950 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
          >
            Próximas ({upcomingBookings.length})
          </button>
          <button
            onClick={() => setActiveTab("past")}
            className={`flex-1 md:px-8 py-2 text-sm font-bold rounded-lg transition-all ${activeTab === "past" ? "bg-white text-zinc-950 shadow-sm border border-zinc-200" : "text-zinc-500 hover:text-zinc-800"}`}
          >
            Histórico
          </button>
        </div>
      </div>

      {/* LISTAGEM DE RESERVAS */}
      {displayBookings.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-[2rem] border border-zinc-200 shadow-sm flex flex-col items-center">
          <div className="w-20 h-20 bg-zinc-50 rounded-full flex items-center justify-center mb-4">
            <CalendarDays className="w-10 h-10 text-zinc-300" />
          </div>
          <h3 className="text-xl font-black text-zinc-900 mb-2">
            Nenhuma reserva por aqui
          </h3>
          <p className="text-zinc-500 font-medium max-w-sm mb-8">
            Você ainda não tem agendamentos{" "}
            {activeTab === "upcoming" ? "futuros" : "no histórico"}. Explore as
            salas disponíveis e agende seu primeiro paciente!
          </p>
          <Button
            onClick={() =>
              onNavigateToSearch ? onNavigateToSearch() : router.push("/")
            }
            className="h-14 px-8 rounded-xl font-black bg-zinc-950 hover:bg-zinc-800 text-white shadow-lg"
          >
            Explorar Salas Premium
          </Button>
        </div>
      ) : (
        <div className="space-y-6">
          {displayBookings.map((booking) => {
            const startDate = parseISO(booking.start_time);
            const endDate = parseISO(booking.end_time);

            let address: any = {};
            try {
              address =
                typeof booking.rooms.address_details === "string"
                  ? JSON.parse(booking.rooms.address_details)
                  : booking.rooms.address_details;
            } catch (e) {}
            const fullAddress = `${address.street || ""}, ${address.number || ""} ${address.complement ? `- ${address.complement}` : ""}`;
            const searchAddress = `${address.street}, ${address.number}, ${address.neighborhood}, ${address.city}`;
            const isOngoing = isToday(startDate) && activeTab === "upcoming";

            return (
              <div
                key={booking.id}
                className="bg-white rounded-[2rem] border border-zinc-200 shadow-sm overflow-hidden flex flex-col md:flex-row group hover:shadow-md transition-shadow"
              >
                {/* BLOCO ESQUERDO: Data e Hora */}
                <div
                  className={`md:w-48 p-6 flex flex-col justify-center border-b md:border-b-0 md:border-r border-zinc-100 border-dashed relative ${isOngoing ? "bg-orange-50/50" : "bg-zinc-50/50"}`}
                >
                  <div className="hidden md:block absolute -right-3 top-[-12px] w-6 h-6 bg-zinc-50 rounded-full border-b border-zinc-200"></div>
                  <div className="hidden md:block absolute -right-3 bottom-[-12px] w-6 h-6 bg-zinc-50 rounded-full border-t border-zinc-200"></div>
                  <p className="text-xs font-black text-zinc-400 uppercase tracking-widest mb-1 text-center md:text-left">
                    {format(startDate, "MMMM", { locale: ptBR })}
                  </p>
                  <p className="text-4xl font-black text-zinc-950 tracking-tighter text-center md:text-left">
                    {format(startDate, "dd")}
                  </p>
                  <p className="text-sm font-bold text-zinc-500 capitalize text-center md:text-left mb-4">
                    {format(startDate, "EEEE", { locale: ptBR })}
                  </p>
                  <div className="flex items-center justify-center md:justify-start gap-2 bg-white border border-zinc-200 py-2 px-3 rounded-lg shadow-sm">
                    <Clock className="w-4 h-4 text-[#f05e23]" />
                    <span className="text-xs font-black text-zinc-800">
                      {format(startDate, "HH:mm")} - {format(endDate, "HH:mm")}
                    </span>
                  </div>
                </div>

                {/* BLOCO CENTRAL: Detalhes e Reveal de Endereço */}
                <div className="flex-1 p-6 flex flex-col">
                  <div className="flex items-start justify-between gap-4 mb-4">
                    <div>
                      {isOngoing && (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0 mb-2 font-bold px-2 py-0.5 animate-pulse">
                          Acontecendo Hoje
                        </Badge>
                      )}
                      {activeTab === "past" &&
                        booking.status === "completed" && (
                          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 border-0 mb-2 font-bold">
                            Concluída
                          </Badge>
                        )}
                      {booking.status === "cancelled" && (
                        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 border-0 mb-2 font-bold">
                          Cancelada
                        </Badge>
                      )}

                      <h3 className="text-xl font-black text-zinc-950 leading-tight">
                        {booking.rooms.name}
                      </h3>
                      <p className="text-sm font-semibold text-zinc-500 flex items-center gap-1 mt-1">
                        Anfitrião:{" "}
                        {booking.rooms.profiles?.full_name || "Fusion Partner"}
                      </p>
                    </div>
                    <div className="w-16 h-16 rounded-xl overflow-hidden shrink-0 border border-zinc-200">
                      <Image
                        src={booking.rooms.image_url || "/placeholder.jpg"}
                        alt="Sala"
                        width={64}
                        height={64}
                        className="object-cover w-full h-full"
                      />
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
                              <p className="text-xs text-zinc-400">
                                {address.neighborhood} - {address.city}
                              </p>
                            </div>
                          </div>
                          <button
                            onClick={() => handleOpenMaps(searchAddress)}
                            className="w-10 h-10 rounded-full bg-[#f05e23] hover:bg-[#d6521e] flex items-center justify-center shrink-0 transition-colors shadow-lg"
                          >
                            <Navigation className="w-4 h-4 fill-white" />
                          </button>
                        </div>
                        <div className="grid grid-cols-2 gap-3 pt-4 border-t border-white/10">
                          <div className="flex items-center gap-2">
                            <Key className="w-4 h-4 text-amber-400" />
                            <div>
                              <p className="text-[9px] font-bold text-zinc-400 uppercase">
                                Acesso / Recepção
                              </p>
                              <p className="text-xs font-bold text-white">
                                Consulte anfitrião
                              </p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Wifi className="w-4 h-4 text-blue-400" />
                            <div>
                              <p className="text-[9px] font-bold text-zinc-400 uppercase">
                                Wi-Fi
                              </p>
                              <p className="text-xs font-bold text-white">
                                Na recepção
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                    )}

                  {activeTab === "past" && (
                    <div className="mt-auto bg-zinc-50 rounded-xl p-4 border border-zinc-100 flex items-center gap-3">
                      {booking.status === "cancelled" ? (
                        <XCircle className="w-5 h-5 text-red-500 shrink-0" />
                      ) : (
                        <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                      )}
                      <div>
                        <p className="text-xs font-bold text-zinc-900">
                          {booking.status === "cancelled"
                            ? "Agendamento Cancelado"
                            : "Reserva finalizada com sucesso"}
                        </p>
                        <p className="text-[10px] font-semibold text-zinc-500">
                          {booking.status === "cancelled"
                            ? "Os estornos obedecem à política de 24h."
                            : `Custo de ${booking.total_cost}h da sua carteira.`}
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* BLOCO DIREITO: Ações Reais */}
                {activeTab === "upcoming" && booking.status !== "cancelled" && (
                  <div className="p-4 md:p-6 bg-zinc-50 md:bg-transparent border-t md:border-t-0 md:border-l border-zinc-100 flex flex-row md:flex-col items-center justify-center md:justify-start gap-2 md:w-44 shrink-0">
                    <Button
                      onClick={() => handleOpenChat(booking)}
                      disabled={actionLoading}
                      variant="outline"
                      className="flex-1 md:w-full h-10 rounded-lg text-xs font-bold border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                    >
                      {actionLoading ? (
                        <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                      ) : (
                        <MessageCircle className="w-3.5 h-3.5 mr-1.5" />
                      )}
                      Falar
                    </Button>
                    <Button
                      onClick={handleRescheduleClick}
                      variant="outline"
                      className="flex-1 md:w-full h-10 rounded-lg text-xs font-bold border-zinc-200 text-zinc-700 hover:bg-zinc-100"
                    >
                      <RefreshCcw className="w-3.5 h-3.5 mr-1.5" /> Reagendar
                    </Button>
                    <Button
                      onClick={() => setCancelModal({ isOpen: true, booking })}
                      variant="ghost"
                      className="md:w-full h-10 rounded-lg text-xs font-bold text-red-600 hover:bg-red-50 hover:text-red-700 md:mt-auto"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1.5 md:hidden" />
                      <span className="hidden md:inline">Cancelar</span>
                    </Button>
                  </div>
                )}

                {activeTab === "past" && (
                  <div className="p-4 md:p-6 bg-zinc-50 md:bg-transparent border-t md:border-t-0 md:border-l border-zinc-100 flex flex-col justify-center gap-2 md:w-44 shrink-0">
                    <Button
                      onClick={() => router.push(`/sala/${booking.rooms.id}`)}
                      className="w-full h-12 rounded-xl bg-zinc-950 text-white font-bold shadow-md hover:bg-zinc-800"
                    >
                      Alugar Novamente
                    </Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL DE CONFIRMAÇÃO DE CANCELAMENTO */}
      <Dialog
        open={cancelModal.isOpen}
        onOpenChange={(open) =>
          !open && setCancelModal({ isOpen: false, booking: null })
        }
      >
        <DialogContent className="sm:max-w-md rounded-[2rem] p-0 overflow-hidden border-0">
          {cancelModal.booking &&
            (() => {
              const hoursUntil = differenceInHours(
                parseISO(cancelModal.booking.start_time),
                new Date(),
              );
              const isRefundable = hoursUntil >= 24;

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
                    <p className="font-semibold text-white/90">
                      Sala: {cancelModal.booking.rooms.name}
                    </p>
                  </div>

                  <div className="p-6 bg-white space-y-6">
                    <div className="bg-zinc-50 p-4 rounded-xl border border-zinc-200">
                      <div className="flex justify-between items-center mb-2">
                        <span className="text-xs font-bold text-zinc-500 uppercase">
                          Política de Cancelamento
                        </span>
                        <Badge
                          variant="outline"
                          className={
                            isRefundable
                              ? "border-emerald-500 text-emerald-600"
                              : "border-red-500 text-red-600"
                          }
                        >
                          {isRefundable ? "+24 Horas" : "Menos de 24h"}
                        </Badge>
                      </div>
                      {isRefundable ? (
                        <p className="text-sm font-semibold text-zinc-700">
                          Como você está cancelando com mais de 24h de
                          antecedência,{" "}
                          <strong className="text-emerald-600">
                            você receberá o estorno integral
                          </strong>{" "}
                          de {cancelModal.booking.total_cost}h na sua carteira.
                        </p>
                      ) : (
                        <p className="text-sm font-semibold text-zinc-700">
                          O horário do agendamento é em menos de 24 horas. Para
                          proteger o anfitrião,{" "}
                          <strong className="text-red-600">
                            esta reserva não é elegível para estorno de
                            créditos.
                          </strong>
                        </p>
                      )}
                    </div>

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
                        className={`flex-1 h-12 rounded-xl font-black text-white ${isRefundable ? "bg-emerald-600 hover:bg-emerald-700" : "bg-red-600 hover:bg-red-700"}`}
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
  );
}
