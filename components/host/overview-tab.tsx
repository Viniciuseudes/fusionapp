"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  TrendingUp,
  Users,
  CalendarDays,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  Activity,
  Map,
  Maximize,
  Filter,
  PlusCircle,
  ShieldAlert,
  MessageSquare,
  Star,
  Printer,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import { Button } from "@/components/ui/button";
import {
  subDays,
  startOfDay,
  endOfDay,
  format,
  isSameDay,
  parseISO,
  getHours,
  getDay,
} from "date-fns";
import { ptBR } from "date-fns/locale";

interface HostOverviewProps {
  onNavigate: (view: string) => void;
}

const shiftLabels = ["08h-12h", "12h-15h", "15h-18h", "18h-22h"];
const COLORS = ["#f05e23", "#8b5cf6", "#10b981", "#3b82f6", "#f59e0b"];

export function HostOverview({ onNavigate }: HostOverviewProps) {
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"hoje" | "7d" | "30d">("30d");

  // Estados dos Dados Reais
  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [roomPerformance, setRoomPerformance] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);

  // KPIs
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [totalBookings, setTotalBookings] = useState(0);
  const [globalRevPerSqM, setGlobalRevPerSqM] = useState(0);
  const [occupancyRate, setOccupancyRate] = useState(0);

  useEffect(() => {
    async function fetchDashboardData() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // 1. Determinar intervalo de datas
        const now = new Date();
        let startDate = startOfDay(subDays(now, 30));
        let endDate = endOfDay(now);

        if (timeFilter === "hoje") {
          startDate = startOfDay(now);
        } else if (timeFilter === "7d") {
          startDate = startOfDay(subDays(now, 7));
        }

        // 2. Buscar Salas do Anfitrião
        const { data: rooms, error: roomsErr } = await supabase
          .from("rooms")
          .select("id, name, address_details")
          .eq("host_id", user.id);

        if (roomsErr) throw roomsErr;
        if (!rooms || rooms.length === 0) {
          setLoading(false);
          return;
        }

        const roomIds = rooms.map((r) => r.id);

        // 3. Buscar Reservas no Período
        const { data: bookings, error: bookingsErr } = await supabase
          .from("bookings")
          .select(
            "id, room_id, start_time, end_time, total_cost, upgrade_fee_amount, status",
          )
          .in("room_id", roomIds)
          .gte("start_time", startDate.toISOString())
          .lte("start_time", endDate.toISOString());

        if (bookingsErr) throw bookingsErr;

        // ----------------------------------------------------
        // PROCESSAMENTO DE DADOS (BI)
        // ----------------------------------------------------
        let revTotal = 0;
        let bookTotal = bookings?.length || 0;
        let areaTotal = 0;

        // a. Preparando Performance por Sala
        const roomStats: any = {};
        rooms.forEach((r, idx) => {
          let addr: any = {};
          try {
            addr =
              typeof r.address_details === "string"
                ? JSON.parse(r.address_details)
                : r.address_details;
          } catch (e) {}

          const area = Number(addr?.size || 15); // Se não tiver tamanho cadastrado, assume 15m²
          areaTotal += area;

          roomStats[r.id] = {
            id: r.id,
            name: r.name,
            areaSqM: area,
            revenue: 0,
            bookings: 0,
            occupancy: 0,
            color: COLORS[idx % COLORS.length],
          };
        });

        // b. Preparando Receita Diária (Gráfico)
        const dailyRev: any = {};
        const daysDiff =
          timeFilter === "hoje" ? 1 : timeFilter === "7d" ? 7 : 30;
        for (let i = daysDiff - 1; i >= 0; i--) {
          const d = subDays(now, i);
          const dateStr = format(d, "dd MMM", { locale: ptBR });
          dailyRev[dateStr] = { date: dateStr, revenue: 0, bookings: 0 };
        }

        // c. Preparando Heatmap (Dias da semana vs Turnos)
        const heatMatrix = [
          { day: "Dom", shifts: [0, 0, 0, 0] },
          { day: "Seg", shifts: [0, 0, 0, 0] },
          { day: "Ter", shifts: [0, 0, 0, 0] },
          { day: "Qua", shifts: [0, 0, 0, 0] },
          { day: "Qui", shifts: [0, 0, 0, 0] },
          { day: "Sex", shifts: [0, 0, 0, 0] },
          { day: "Sáb", shifts: [0, 0, 0, 0] },
        ];

        // Processar cada reserva
        bookings?.forEach((b) => {
          // Calcula receita aproximada (Créditos base + Taxas de Upgrade)
          // Se quiser converter o custo de crédito em R$, assumiremos 1 CR = R$ 45 (Exemplo Base)
          const bookingRevenue =
            Number(b.total_cost || 0) * 45 + Number(b.upgrade_fee_amount || 0);
          revTotal += bookingRevenue;

          // Associa à sala
          if (roomStats[b.room_id]) {
            roomStats[b.room_id].revenue += bookingRevenue;
            roomStats[b.room_id].bookings += 1;
          }

          const startDt = parseISO(b.start_time);
          const dateStr = format(startDt, "dd MMM", { locale: ptBR });

          // Associa ao gráfico diário (se estiver dentro dos dias renderizados)
          if (dailyRev[dateStr]) {
            dailyRev[dateStr].revenue += bookingRevenue;
            dailyRev[dateStr].bookings += 1;
          }

          // Associa ao Heatmap
          const dayOfWeek = getDay(startDt); // 0 = Dom, 1 = Seg...
          const hour = getHours(startDt);
          let shiftIndex = -1;
          if (hour >= 8 && hour < 12) shiftIndex = 0;
          else if (hour >= 12 && hour < 15) shiftIndex = 1;
          else if (hour >= 15 && hour < 18) shiftIndex = 2;
          else if (hour >= 18 && hour <= 22) shiftIndex = 3;

          if (shiftIndex !== -1) {
            heatMatrix[dayOfWeek].shifts[shiftIndex] += 1;
          }
        });

        // Formatar para os Estados
        setTotalRevenue(revTotal);
        setTotalBookings(bookTotal);
        setGlobalRevPerSqM(areaTotal > 0 ? revTotal / areaTotal : 0);

        // Ocupação simulada baseada na quantidade de reservas (Fórmula de Exemplo)
        setOccupancyRate(
          bookTotal > 0
            ? Math.min(
                Math.round((bookTotal / (rooms.length * daysDiff * 4)) * 100),
                100,
              )
            : 0,
        );

        // Atualiza Performance das Salas
        const perfArray = Object.values(roomStats).map((r: any) => ({
          ...r,
          occupancy: Math.min(
            Math.round((r.bookings / (daysDiff * 4)) * 100),
            100,
          ), // Cálculo demonstrativo
        }));
        setRoomPerformance(perfArray.sort((a, b) => b.revenue - a.revenue)); // Mais rentáveis primeiro

        // Atualiza Gráfico Diário
        setRevenueData(Object.values(dailyRev));

        // Atualiza Heatmap: Reordena para começar de Segunda a Domingo
        const orderedHeatmap = [
          heatMatrix[1],
          heatMatrix[2],
          heatMatrix[3],
          heatMatrix[4],
          heatMatrix[5],
          heatMatrix[6],
          heatMatrix[0],
        ];
        setHeatmapData(orderedHeatmap);
      } catch (err) {
        console.error("Erro ao montar o BI:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchDashboardData();
  }, [supabase, timeFilter]);

  const getHeatmapColor = (intensity: number) => {
    // Escala dinâmica simples baseada no volume
    if (intensity === 0) return "bg-slate-50 border-slate-100";
    if (intensity <= 2)
      return "bg-orange-100 border-orange-200 text-orange-800";
    if (intensity <= 5)
      return "bg-orange-300 border-orange-400 text-orange-900";
    if (intensity <= 10) return "bg-orange-500 border-orange-600 text-white";
    return "bg-[#d6521e] border-[#b03d12] text-white shadow-inner";
  };

  const handlePrintPDF = () => {
    // Aciona a impressão nativa do navegador (pode ser salva como PDF)
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-7xl mx-auto w-full pb-32 font-sans print:p-0 print:pb-0">
      {/* HEADER & FILTROS */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 print:mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
            Visão Geral de Desempenho
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Análise de rendimentos, ocupação e métricas por m² dos seus espaços.
          </p>
        </div>

        {/* Esconde filtros na impressão */}
        <div className="print:hidden flex items-center gap-2 bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm overflow-x-auto scrollbar-hide shrink-0">
          {[
            { id: "hoje", label: "Hoje" },
            { id: "7d", label: "7 Dias" },
            { id: "30d", label: "30 Dias" },
          ].map((filter) => (
            <button
              key={filter.id}
              onClick={() => setTimeFilter(filter.id as any)}
              className={`px-4 py-2 rounded-lg text-sm font-bold whitespace-nowrap transition-all ${
                timeFilter === filter.id
                  ? "bg-slate-900 text-white shadow-md"
                  : "text-slate-500 hover:text-slate-900 hover:bg-slate-100"
              }`}
            >
              {filter.label}
            </button>
          ))}
        </div>
      </div>

      {/* 4 KPIs PRINCIPAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:grid-cols-4">
        {/* KPI 1: Rendimento Total */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-emerald-50 rounded-full blur-2xl -mr-4 -mt-4 transition-transform group-hover:scale-150"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
              Rendimento Bruto
            </p>
            <h3 className="text-3xl font-black text-slate-900">
              <span className="text-lg text-slate-400 font-bold mr-1">R$</span>
              {totalRevenue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
              })}
            </h3>
          </div>
        </div>

        {/* KPI 2: Rendimento por m2 (MÉTRICA PREMIUM) */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden group print:bg-white print:border print:border-slate-200 print:shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#f05e23]/20 rounded-full blur-2xl -mr-8 -mt-8 transition-transform group-hover:scale-150 print:hidden"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#f05e23]/20 flex items-center justify-center text-[#f05e23]">
                <Maximize className="w-5 h-5" />
              </div>
            </div>
            <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-500">
              Rentabilidade (R$/m²)
            </p>
            <h3 className="text-3xl font-black text-white print:text-slate-900">
              <span className="text-lg text-slate-400 font-bold mr-1">R$</span>
              {globalRevPerSqM.toLocaleString("pt-BR", {
                maximumFractionDigits: 0,
              })}
              <span className="text-base text-slate-400 font-medium ml-1">
                /m²
              </span>
            </h3>
          </div>
        </div>

        {/* KPI 3: Reservas */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <CalendarDays className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
            Agendamentos
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {totalBookings}
          </h3>
        </div>

        {/* KPI 4: Taxa de Ocupação */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-1">
            Taxa de Ocupação Est.
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {occupancyRate}%
          </h3>
        </div>
      </div>

      {/* GRÁFICO PRINCIPAL & MAPA DE CALOR */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 print:grid-cols-3">
        {/* GRÁFICO DE RENDIMENTOS (2 COLUNAS) */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Evolução de Receita
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Acompanhamento no período de{" "}
                {timeFilter === "hoje"
                  ? "1 dia"
                  : timeFilter === "7d"
                    ? "7 dias"
                    : "30 dias"}
              </p>
            </div>
          </div>

          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart
                data={revenueData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <defs>
                  <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f05e23" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f05e23" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#e2e8f0"
                />
                <XAxis
                  dataKey="date"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }}
                  tickFormatter={(val) => `R$${val}`}
                />
                <Tooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                  }}
                  labelStyle={{
                    fontWeight: 900,
                    color: "#0f172a",
                    marginBottom: "4px",
                  }}
                  itemStyle={{ fontWeight: 600 }}
                  formatter={(value: number) => [
                    `R$ ${value.toFixed(2)}`,
                    "Receita",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="revenue"
                  stroke="#f05e23"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorRevenue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* MAPA DE CALOR DE RESERVAS (1 COLUNA) */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="mb-6">
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Map className="w-5 h-5 text-[#f05e23]" /> Mapa de Ocupação
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Horários de maior fluxo.
            </p>
          </div>

          <div className="flex-1 flex flex-col justify-center">
            <div className="grid grid-cols-5 gap-2 mb-2">
              <div className="col-span-1"></div>
              {shiftLabels.map((label) => (
                <div
                  key={label}
                  className="col-span-1 text-center text-[9px] font-bold text-slate-400 uppercase tracking-widest leading-tight"
                >
                  {label.split("-")[0]}
                  <br />|<br />
                  {label.split("-")[1]}
                </div>
              ))}
            </div>

            <div className="flex flex-col gap-2">
              {heatmapData.map((row) => (
                <div
                  key={row.day}
                  className="grid grid-cols-5 gap-2 items-center"
                >
                  <div className="col-span-1 text-xs font-bold text-slate-600 text-right pr-2">
                    {row.day}
                  </div>
                  {row.shifts.map((intensity: number, idx: number) => (
                    <div
                      key={idx}
                      className={`col-span-1 aspect-square rounded-md border flex items-center justify-center transition-all hover:scale-110 cursor-crosshair ${getHeatmapColor(intensity)}`}
                      title={`${row.day} - ${shiftLabels[idx]}: ${intensity} reservas`}
                    >
                      {intensity > 2 && (
                        <Users className="w-3 h-3 opacity-50" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>

            {/* Legenda do Heatmap */}
            <div className="flex items-center justify-center gap-2 mt-6">
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Livre
              </span>
              <div className="flex gap-1">
                {[0, 1, 3, 6, 10].map((i) => (
                  <div
                    key={i}
                    className={`w-3 h-3 rounded-sm border ${getHeatmapColor(i)}`}
                  />
                ))}
              </div>
              <span className="text-[10px] font-bold text-slate-400 uppercase">
                Lotação
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ANÁLISE DETALHADA POR SALA E M² */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden mb-12">
        <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Desempenho Imobiliário (R$/m²)
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Rentabilidade exata de cada espaço neste período.
            </p>
          </div>
          <Button
            onClick={handlePrintPDF}
            variant="outline"
            className="font-bold text-slate-600 h-10 rounded-xl print:hidden flex items-center gap-2 hover:text-[#f05e23] hover:bg-orange-50"
          >
            <Printer className="w-4 h-4" /> Exportar para PDF
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Espaço / Sala</th>
                <th className="px-6 py-4 text-center">Tamanho (m²)</th>
                <th className="px-6 py-4 text-center">Ocupação Est.</th>
                <th className="px-6 py-4 text-right">Rendimento Bruto</th>
                <th className="px-6 py-4 text-right bg-orange-50/50 text-[#f05e23]">
                  Rendimento / m²
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {roomPerformance.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-slate-500 font-medium"
                  >
                    Nenhum dado encontrado para este período.
                  </td>
                </tr>
              ) : (
                roomPerformance.map((room) => {
                  const revPerSqM =
                    room.areaSqM > 0 ? room.revenue / room.areaSqM : 0;
                  return (
                    <tr
                      key={room.id}
                      className="hover:bg-slate-50/80 transition-colors"
                    >
                      <td className="px-6 py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className="w-3 h-3 rounded-full"
                            style={{ backgroundColor: room.color }}
                          />
                          <div>
                            <p className="font-black text-slate-900 truncate max-w-[200px]">
                              {room.name}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                              {room.bookings} reservas registradas
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-center font-bold text-slate-600">
                        {room.areaSqM} m²
                      </td>
                      <td className="px-6 py-5">
                        <div className="flex items-center justify-center gap-2">
                          <span className="font-bold text-slate-700 w-8 text-right">
                            {room.occupancy}%
                          </span>
                          <div className="w-24 h-2 bg-slate-100 rounded-full overflow-hidden">
                            <div
                              className="h-full rounded-full"
                              style={{
                                width: `${room.occupancy}%`,
                                backgroundColor: room.color,
                              }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="px-6 py-5 text-right font-black text-slate-700">
                        R${" "}
                        {room.revenue.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </td>
                      <td className="px-6 py-5 text-right font-black text-slate-900 bg-orange-50/20">
                        <div className="flex items-center justify-end gap-1">
                          <span className="text-xs text-[#f05e23] font-bold">
                            R$
                          </span>
                          <span className="text-lg">
                            {revPerSqM.toLocaleString("pt-BR", {
                              maximumFractionDigits: 0,
                            })}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* AÇÕES RÁPIDAS NO FINAL DA PÁGINA (Igual ao código original) */}
      <div className="print:hidden">
        <h3 className="text-lg font-black text-slate-900 mb-4">
          Ações Rápidas
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Button
            onClick={() => onNavigate("create_space")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-[#f05e23] hover:text-[#f05e23] hover:bg-orange-50"
          >
            <PlusCircle className="w-8 h-8" />
            <span className="font-bold">Adicionar Sala</span>
          </Button>

          <Button
            onClick={() => onNavigate("availability")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-red-500 hover:text-red-500 hover:bg-red-50"
          >
            <ShieldAlert className="w-8 h-8" />
            <span className="font-bold">Bloquear Agenda</span>
          </Button>

          <Button
            onClick={() => onNavigate("messages")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-blue-500 hover:text-blue-500 hover:bg-blue-50"
          >
            <MessageSquare className="w-8 h-8" />
            <span className="font-bold">Ver Mensagens</span>
          </Button>

          <Button
            onClick={() => onNavigate("reviews")}
            variant="outline"
            className="h-auto flex-col items-center justify-center gap-3 p-6 rounded-2xl border-slate-200 text-slate-600 hover:border-amber-500 hover:text-amber-500 hover:bg-amber-50"
          >
            <Star className="w-8 h-8" />
            <span className="font-bold">Ver Avaliações</span>
          </Button>
        </div>
      </div>
    </div>
  );
}
