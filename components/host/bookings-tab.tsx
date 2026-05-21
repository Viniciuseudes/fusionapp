import { useState } from "react";
import {
  Calendar as CalendarIcon,
  Clock,
  MapPin,
  Search,
  CheckCircle2,
  User,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";

export function HostBookingsTab() {
  const [filter, setFilter] = useState<"hoje" | "proximos" | "historico">(
    "hoje",
  );
  const [searchQuery, setSearchQuery] = useState("");

  // Mock de dados de agendamentos
  const bookings = [
    {
      id: "1",
      doctorName: "Dr. Carlos Mendes",
      specialty: "Psiquiatria",
      roomName: "Consultório Psicanálise",
      date: "Hoje, 15 Nov",
      time: "14:00 - 15:00",
      status: "Confirmado",
      type: "hoje",
    },
    {
      id: "2",
      doctorName: "Dra. Ana Costa",
      specialty: "Nutrição",
      roomName: "Sala de Reunião Premium",
      date: "Hoje, 15 Nov",
      time: "16:00 - 18:00",
      status: "Confirmado",
      type: "hoje",
    },
    {
      id: "3",
      doctorName: "Dr. Roberto Almeida",
      specialty: "Fisioterapia",
      roomName: "Consultório Padrão",
      date: "Amanhã, 16 Nov",
      time: "08:00 - 12:00",
      status: "Pendente",
      type: "proximos",
    },
  ];

  const filteredBookings = bookings.filter(
    (b) =>
      b.type === filter &&
      (b.doctorName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        b.roomName.toLowerCase().includes(searchQuery.toLowerCase())),
  );

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
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "hoje" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Hoje
            </button>
            <button
              onClick={() => setFilter("proximos")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "proximos" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
            >
              Próximos
            </button>
            <button
              onClick={() => setFilter("historico")}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${filter === "historico" ? "bg-white text-primary shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
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
              Nenhuma reserva encontrada para este filtro.
            </p>
          </div>
        ) : (
          filteredBookings.map((booking) => (
            <div
              key={booking.id}
              className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 hover:border-primary/50 transition-colors"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                {/* Info do Médico e Sala */}
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 bg-primary/10 text-primary rounded-full flex items-center justify-center shrink-0">
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
                      <CalendarIcon className="w-4 h-4 text-primary" />
                      {booking.date}
                    </div>
                    <div className="w-px h-4 bg-slate-300"></div>
                    <div className="flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-primary" />
                      {booking.time}
                    </div>
                  </div>

                  <Badge
                    className={`self-start md:self-end font-bold ${booking.status === "Confirmado" ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-100" : "bg-amber-100 text-amber-700 hover:bg-amber-100"}`}
                  >
                    {booking.status === "Confirmado" && (
                      <CheckCircle2 className="w-3.5 h-3.5 mr-1" />
                    )}
                    {booking.status}
                  </Badge>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
