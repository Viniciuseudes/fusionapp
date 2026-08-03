"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Search,
  CheckCircle2,
  User,
  Loader2,
  AlertCircle,
  XCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { format, isToday, isBefore, startOfToday, isTomorrow } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BookingUI {
  id: string;
  doctorName: string;
  specialty: string;
  roomName: string;
  date: string;
  time: string;
  status: string;
  rawStatus: string;
  type: "hoje" | "proximos" | "historico";
}

export function HostBookingsTab() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingUI[]>([]);
  const [filter, setFilter] = useState<"hoje" | "proximos" | "historico">(
    "hoje",
  );
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchHostBookings() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Pega as salas deste anfitrião
        const { data: myRooms, error: roomsErr } = await supabase
          .from("rooms")
          .select("id, name")
          .eq("host_id", user.id);

        if (roomsErr) throw roomsErr;
        if (!myRooms || myRooms.length === 0) {
          setBookings([]);
          return;
        }
        const roomIds = myRooms.map((r) => r.id);

        // 2. Pega todas as reservas feitas nessas salas
        const { data: myBookings, error: bookingsErr } = await supabase
          .from("bookings")
          .select("*")
          .in("room_id", roomIds)
          .order("start_time", { ascending: true });

        if (bookingsErr) throw bookingsErr;
        if (!myBookings || myBookings.length === 0) {
          setBookings([]);
          return;
        }

        // 3. Pega os perfis dos profissionais que reservaram
        const userIds = [...new Set(myBookings.map((b) => b.user_id))];
        const { data: guestProfiles, error: profilesErr } = await supabase
          .from("profiles")
          .select("id, full_name, specialty")
          .in("id", userIds);

        if (profilesErr) throw profilesErr;

        // 4. Mapeia, formata datas e classifica para a UI
        const formattedBookings: BookingUI[] = myBookings.map((b) => {
          const room = myRooms.find((r) => r.id === b.room_id);
          const profile = guestProfiles?.find((p) => p.id === b.user_id);

          const startDate = new Date(b.start_time);
          const endDate = new Date(b.end_time);

          // Lógica de Classificação em Abas
          let type: "hoje" | "proximos" | "historico" = "proximos";
          if (isToday(startDate)) {
            type = "hoje";
          } else if (isBefore(startDate, startOfToday())) {
            type = "historico";
          }

          // Formatação inteligente da data
          let dateStr = format(startDate, "dd MMM", { locale: ptBR });
          if (isToday(startDate)) dateStr = `Hoje, ${dateStr}`;
          else if (isTomorrow(startDate)) dateStr = `Amanhã, ${dateStr}`;

          // Tradução do Status
          let statusStr = b.status;
          if (b.status === "confirmed") statusStr = "Confirmado";
          else if (b.status === "pending_payment") statusStr = "Pendente";
          else if (b.status === "completed") statusStr = "Concluído";
          else if (b.status === "cancelled") statusStr = "Cancelado";

          return {
            id: b.id,
            doctorName: profile?.full_name || "Profissional",
            specialty: profile?.specialty || "Profissional de Saúde",
            roomName: room?.name || "Sala Excluída",
            date: dateStr,
            time: `${format(startDate, "HH:mm")} - ${format(endDate, "HH:mm")}`,
            status: statusStr,
            rawStatus: b.status,
            type: type,
          };
        });

        // Ordena: próximos primeiro para "Hoje/Próximos", mais recentes primeiro para "Histórico"
        setBookings(formattedBookings);
      } catch (error) {
        console.error("Erro ao buscar agenda:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchHostBookings();
  }, [supabase]);

  // Filtros de busca no frontend
  const filteredBookings = bookings.filter((b) => {
    if (b.type !== filter) return false;
    const q = searchQuery.toLowerCase();
    return (
      b.doctorName.toLowerCase().includes(q) ||
      b.roomName.toLowerCase().includes(q)
    );
  });

  // Renderização Dinâmica do Status Badge
  const getStatusBadge = (status: string, rawStatus: string) => {
    if (rawStatus === "confirmed" || rawStatus === "completed") {
      return (
        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-bold border-0">
          <CheckCircle2 className="w-3.5 h-3.5 mr-1" /> {status}
        </Badge>
      );
    }
    if (rawStatus === "cancelled") {
      return (
        <Badge className="bg-red-100 text-red-700 hover:bg-red-100 font-bold border-0">
          <XCircle className="w-3.5 h-3.5 mr-1" /> {status}
        </Badge>
      );
    }
    return (
      <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 font-bold border-0">
        <AlertCircle className="w-3.5 h-3.5 mr-1" /> {status}
      </Badge>
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
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-5xl mx-auto w-full pb-32">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 mb-2">
          Agenda de Reservas
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Controle quem está a utilizar os seus espaços hoje e nos próximos
          dias.
        </p>
      </div>

      <div className="bg-white rounded-2xl p-4 md:p-6 shadow-sm border border-slate-200 mb-6">
        <div className="flex flex-col sm:flex-row gap-4 mb-2">
          <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto overflow-x-auto scrollbar-hide">
            <button
              onClick={() => setFilter("hoje")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "hoje" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Hoje ({bookings.filter((b) => b.type === "hoje").length})
            </button>
            <button
              onClick={() => setFilter("proximos")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "proximos" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Próximos ({bookings.filter((b) => b.type === "proximos").length})
            </button>
            <button
              onClick={() => setFilter("historico")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "historico" ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Histórico
            </button>
          </div>

          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
            <Input
              type="text"
              placeholder="Buscar médico ou sala..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-10 h-11 bg-slate-50 border-slate-200 rounded-xl w-full"
            />
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {filteredBookings.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl border border-slate-200 border-dashed">
            <CalendarIcon className="w-12 h-12 text-slate-300 mx-auto mb-3" />
            <p className="text-slate-500 font-medium">
              {searchQuery
                ? "Nenhuma reserva encontrada para a sua busca."
                : "A agenda está livre neste período."}
            </p>
          </div>
        ) : (
          filteredBookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-[#f05e23]/30 transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Info do Médico e Sala */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-orange-50 text-[#f05e23] rounded-full flex items-center justify-center shrink-0">
                    <User className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-slate-900">
                      {booking.doctorName}
                    </h3>
                    <p className="text-sm font-bold text-slate-500 mb-2">
                      {booking.specialty}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs text-slate-600 bg-slate-100 px-2.5 py-1 rounded-md inline-flex">
                      <MapPin className="w-3.5 h-3.5" />
                      <span className="font-medium">{booking.roomName}</span>
                    </div>
                  </div>
                </div>

                {/* Data e Hora */}
                <div className="flex flex-col md:items-end gap-2 border-t md:border-t-0 border-slate-100 pt-4 md:pt-0">
                  <div className="flex items-center gap-4 text-sm font-bold text-slate-700 bg-slate-50 px-4 py-2 rounded-xl border border-slate-100">
                    <div className="flex items-center gap-1.5">
                      <CalendarIcon className="w-4 h-4 text-[#f05e23]" />
                      {booking.date}
                    </div>
                    <div className="w-px h-4 bg-slate-300"></div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-[#f05e23]" />
                      {booking.time}
                    </div>
                  </div>

                  <div className="self-start md:self-end mt-1">
                    {getStatusBadge(booking.status, booking.rawStatus)}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
