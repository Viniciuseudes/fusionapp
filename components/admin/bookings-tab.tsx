"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  Calendar as CalendarIcon,
  FileSpreadsheet,
  DownloadCloud,
  Loader2,
  Eye,
  RefreshCw,
  Building2,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, startOfDay, endOfDay } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface BookingInfo {
  id: string;
  created_at: string;
  start_time: string;
  end_time: string;
  status: string;
  total_cost: number;
  specialist_name: string;
  room_name: string;
  clinic_name: string;
}

export function AdminBookingsTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingInfo[]>([]);

  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));

  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    fetchBookings();
  }, [startDate, endDate]);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const start = startOfDay(parseISO(startDate)).toISOString();
      const end = endOfDay(parseISO(endDate)).toISOString();

      // 1. Busca pura na tabela bookings (Removido o host_id inexistente)
      const { data: rawBookings, error: bErr } = await supabase
        .from("bookings")
        .select(
          "id, created_at, start_time, end_time, status, total_cost, room_id, user_id",
        )
        .gte("start_time", start)
        .lte("start_time", end)
        .order("start_time", { ascending: true });

      if (bErr) {
        throw new Error(bErr.message || JSON.stringify(bErr));
      }

      if (!rawBookings || rawBookings.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const roomIds = [
        ...new Set(rawBookings.map((b: any) => b.room_id).filter(Boolean)),
      ];
      const userIds = [
        ...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean)),
      ];

      // 2. Busca as salas para descobrir o nome da sala E o host_id dono dela
      const roomsRes =
        roomIds.length > 0
          ? await supabase
              .from("rooms")
              .select("id, name, host_id")
              .in("id", roomIds)
          : { data: [] };

      const roomsData = roomsRes.data || [];
      const roomsMap = new Map(roomsData.map((r: any) => [r.id, r.name]));

      // Coleta os IDs dos anfitriões a partir das salas encontradas
      const hostIds = [
        ...new Set(roomsData.map((r: any) => r.host_id).filter(Boolean)),
      ];

      // 3. Busca em lote os perfis dos especialistas e dos donos das clínicas (hosts)
      const [usersRes, hostsRes] = await Promise.all([
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : { data: [] },
        hostIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", hostIds)
          : { data: [] },
      ]);

      const usersMap = new Map(
        usersRes.data?.map((u: any) => [u.id, u.full_name]) || [],
      );
      const hostsMap = new Map(
        hostsRes.data?.map((h: any) => [h.id, h.full_name]) || [],
      );
      const roomsHostMap = new Map(
        roomsData.map((r: any) => [r.id, r.host_id]),
      );

      // 4. Monta o array final estruturado
      const formattedBookings: BookingInfo[] = rawBookings.map((b: any) => {
        const hostId = roomsHostMap.get(b.room_id);
        const clinicName = hostId ? hostsMap.get(hostId) : "Fusion Clinic";

        return {
          id: b.id,
          created_at: b.created_at,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          total_cost: b.total_cost || 0,
          specialist_name:
            usersMap.get(b.user_id) || "Especialista Desconhecido",
          room_name: roomsMap.get(b.room_id) || "Sala Removida",
          clinic_name: clinicName || "Fusion Clinic",
        };
      });

      setBookings(formattedBookings);
    } catch (err: any) {
      console.error("Erro detalhado ao buscar agendamentos:", err);

      let errorMessage = err?.message || "Erro desconhecido ao carregar dados.";
      if (errorMessage === "{}" || errorMessage === "[]") {
        errorMessage =
          "Bloqueio de segurança (RLS). Verifique as permissões de leitura no Supabase.";
      }

      toast({
        variant: "destructive",
        title: "Aviso do Sistema",
        description: errorMessage,
      });
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  const downloadCSV = (content: string, fileName: string) => {
    const bom = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });

    let csv =
      "ID da Reserva;Clínica;Sala;Data Agendada;Especialista;Entrada;Saída;Status;Valor (R$)\n";
    filteredBookings.forEach((b) => {
      const valor = (b.total_cost * 45).toFixed(2).replace(".", ",");
      const agendada = format(parseISO(b.created_at), "dd/MM/yyyy HH:mm");
      const entrada = format(parseISO(b.start_time), "dd/MM/yyyy HH:mm");
      const saida = format(parseISO(b.end_time), "dd/MM/yyyy HH:mm");
      csv += `${b.id};"${b.clinic_name}";"${b.room_name}";${agendada};"${b.specialist_name}";${entrada};${saida};${b.status};${valor}\n`;
    });
    downloadCSV(csv, `Fusion_Agendamentos_${startDate}_a_${endDate}.csv`);
  };

  const handleExportFinances = () => {
    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });

    let csv =
      "ID da Reserva;Clínica (Anfitrião);Especialista (Cliente);Valor Total (R$);Taxa Fusion (10%);Repasse Anfitrião (90%);Status\n";
    filteredBookings.forEach((b) => {
      const valorBase = b.total_cost * 45;
      const fee = valorBase * 0.1;
      const repasse = valorBase * 0.9;
      csv += `${b.id};"${b.clinic_name}";"${b.specialist_name}";${valorBase.toFixed(2).replace(".", ",")};${fee.toFixed(2).replace(".", ",")};${repasse.toFixed(2).replace(".", ",")};${b.status}\n`;
    });
    downloadCSV(csv, `Fusion_Financeiro_${startDate}_a_${endDate}.csv`);
  };

  const filteredBookings = bookings.filter((b) => {
    const matchStatus =
      statusFilter === "all" ? true : b.status === statusFilter;
    const matchSearch =
      b.specialist_name.toLowerCase().includes(search.toLowerCase()) ||
      b.clinic_name.toLowerCase().includes(search.toLowerCase()) ||
      b.room_name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalRevenue = filteredBookings.reduce(
    (acc, curr) => acc + curr.total_cost * 45,
    0,
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-0">
            Confirmado
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-slate-200 text-slate-800 border-0">
            Concluído
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-800 border-0">Cancelado</Badge>
        );
      case "pending_payment":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-0">
            Aguardando Pagamento
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-600 border-0">
            {status}
          </Badge>
        );
    }
  };

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-8 h-8 text-[#f05e23]" />
            Histórico de Agendamentos
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gestão operacional e financeira de todas as reservas da plataforma.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-slate-900 text-white font-black px-4 py-1.5 rounded-xl border-0 text-sm">
            Total de registros: {filteredBookings.length}
          </Badge>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#f05e23]/20">
              <div className="px-3 text-slate-400 border-r border-slate-200">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-0 text-sm font-bold text-slate-700 outline-none p-2 w-36"
              />
              <span className="text-slate-300 font-bold px-2">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-0 text-sm font-bold text-slate-700 outline-none p-2 w-36"
              />
            </div>

            <Button
              onClick={fetchBookings}
              variant="outline"
              className="h-10 w-10 p-0 rounded-xl border-slate-200 text-slate-600 hover:text-[#f05e23]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none w-full sm:w-auto"
            >
              <option value="all">Todos os status</option>
              <option value="confirmed">Confirmados</option>
              <option value="completed">Concluídos</option>
              <option value="pending_payment">Aguardando Pagamento</option>
              <option value="cancelled">Cancelados</option>
            </select>

            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar clínica ou especialista..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 rounded-xl border-slate-200 bg-white font-medium min-w-[220px]"
              />
            </div>
          </div>

          <div className="flex gap-3 w-full lg:w-auto mt-4 lg:mt-0">
            <Button
              onClick={handleExportExcel}
              className="flex-1 lg:flex-none bg-[#f05e23] hover:bg-[#d6521e] text-white font-bold h-10 shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
            </Button>
            <Button
              onClick={handleExportFinances}
              className="flex-1 lg:flex-none bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 shadow-sm"
            >
              <DownloadCloud className="w-4 h-4 mr-2" /> Exportar Finanças
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
          </div>
        )}

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Clínica & Sala</th>
                <th className="px-6 py-4">Agendada em</th>
                <th className="px-6 py-4">Especialista (Locatário)</th>
                <th className="px-6 py-4">Entrada / Saída</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Valor Bruto</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredBookings.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <CalendarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold">
                      Nenhum agendamento encontrado no período.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="hover:bg-orange-50/30 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <p className="font-black text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />{" "}
                        {booking.clinic_name}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5 ml-5">
                        {booking.room_name}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-600">
                        {format(parseISO(booking.created_at), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                      <p className="text-[10px] font-medium text-slate-400">
                        {format(parseISO(booking.created_at), "HH:mm:ss")}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-[#f05e23]">
                        {booking.specialist_name}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-300" />
                        <div>
                          <p className="font-bold text-slate-700">
                            {format(parseISO(booking.start_time), "dd/MM/yyyy")}
                          </p>
                          <p className="text-[10px] font-black text-emerald-600 mt-0.5">
                            {format(parseISO(booking.start_time), "HH:mm")} às{" "}
                            {format(parseISO(booking.end_time), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-slate-900">
                        R${" "}
                        {(booking.total_cost * 45).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 font-bold border-orange-200 text-orange-600 hover:bg-orange-50"
                      >
                        <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Reagendar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col md:flex-row justify-end items-center gap-6">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
            Total de agendamentos no filtro:{" "}
            <span className="text-slate-900">{filteredBookings.length}</span>
          </p>
          <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            Receita Total Bruta:
            <span className="text-xl font-black text-emerald-600">
              R${" "}
              {totalRevenue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </span>
          </p>
        </div>
      </div>
    </div>
  );
}
