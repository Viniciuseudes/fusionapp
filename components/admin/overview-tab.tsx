"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  TrendingUp,
  Users,
  Map,
  Wallet,
  ArrowUpRight,
  Activity,
  Download,
  Building2,
  Stethoscope,
  Crown,
  Flame,
  Snowflake,
  Search,
  Loader2,
} from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from "recharts";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  subDays,
  startOfYear,
  parseISO,
  format,
  getDay,
  getHours,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

const shiftLabels = [
  "Manhã (08-12)",
  "Tarde (12-16)",
  "Final Tarde (16-20)",
  "Noite (20-23)",
];
const PIE_COLORS = [
  "#f05e23",
  "#8b5cf6",
  "#10b981",
  "#3b82f6",
  "#eab308",
  "#ec4899",
  "#64748b",
];

export function AdminOverviewTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [timeFilter, setTimeFilter] = useState<"7d" | "30d" | "ytd">("30d");

  // Estados dos Dados Reais
  const [gmv, setGmv] = useState(0);
  const [takeRate, setTakeRate] = useState(0);
  const [activeDoctors, setActiveDoctors] = useState(0);
  const [activeRooms, setActiveRooms] = useState(0);

  const [revenueData, setRevenueData] = useState<any[]>([]);
  const [specialtyData, setSpecialtyData] = useState<any[]>([]);
  const [heatmapData, setHeatmapData] = useState<any[]>([]);
  const [topRooms, setTopRooms] = useState<any[]>([]);

  useEffect(() => {
    async function fetchRealBI() {
      setLoading(true);
      try {
        const now = new Date();
        let startDate = subDays(now, 30);
        let daysCount = 30;

        if (timeFilter === "7d") {
          startDate = subDays(now, 7);
          daysCount = 7;
        } else if (timeFilter === "ytd") {
          startDate = startOfYear(now);
          daysCount = 365;
        }

        // 1. Busca Reservas
        const { data: bookingsData, error: bErr } = await supabase
          .from("bookings")
          .select(
            "id, start_time, end_time, total_cost, room_id, user_id, status",
          )
          .gte("start_time", startDate.toISOString())
          .in("status", ["confirmed", "completed", "pending_payment"]);

        if (bErr) throw bErr;

        // 2. Busca Salas
        const { data: roomsData, error: rErr } = await supabase
          .from("rooms")
          .select("id, name, host_id, is_active");

        if (rErr) throw rErr;

        // 3. BLINDAGEM: Coleta de IDs seguros (Remove nulos)
        const userIds = [
          ...new Set(bookingsData?.map((b) => b.user_id).filter(Boolean) || []),
        ];
        const hostIds = [
          ...new Set(roomsData?.map((r) => r.host_id).filter(Boolean) || []),
        ];
        const allProfileIds = [...new Set([...userIds, ...hostIds])];

        let profilesData: any[] = [];

        // Só faz a busca de perfis se existirem IDs na lista! (Evita o Erro Vazio)
        if (allProfileIds.length > 0) {
          const { data, error: pErr } = await supabase
            .from("profiles")
            .select("id, full_name, specialty")
            .in("id", allProfileIds);

          if (pErr) throw pErr;
          profilesData = data || [];
        }

        // ========================================================
        // MOTOR DE PROCESSAMENTO (BI MATH)
        // ========================================================
        let totalGmv = 0;
        const uniqueDoctors = new Set();

        const revMap: any = {};
        const specMap: any = {};

        const heatMapMatrix = [
          { day: "Dom", shifts: [0, 0, 0, 0] },
          { day: "Seg", shifts: [0, 0, 0, 0] },
          { day: "Ter", shifts: [0, 0, 0, 0] },
          { day: "Qua", shifts: [0, 0, 0, 0] },
          { day: "Qui", shifts: [0, 0, 0, 0] },
          { day: "Sex", shifts: [0, 0, 0, 0] },
          { day: "Sáb", shifts: [0, 0, 0, 0] },
        ];

        const roomStats: any = {};
        roomsData?.forEach((r) => {
          roomStats[r.id] = {
            id: r.id,
            name: r.name,
            host_id: r.host_id,
            revenue: 0,
            bookings: 0,
          };
        });

        bookingsData?.forEach((b) => {
          // Blindagem de data nula
          if (!b.start_time) return;

          const revenue = (Number(b.total_cost) || 0) * 45;
          const fee = revenue * 0.1;

          totalGmv += revenue;
          uniqueDoctors.add(b.user_id);

          const dateObj = parseISO(b.start_time);

          const dateKey =
            timeFilter === "ytd"
              ? format(dateObj, "MMM", { locale: ptBR })
              : format(dateObj, "dd MMM", { locale: ptBR });
          if (!revMap[dateKey])
            revMap[dateKey] = {
              name: dateKey,
              gmv: 0,
              platformFee: 0,
              order: dateObj.getTime(),
            };
          revMap[dateKey].gmv += revenue;
          revMap[dateKey].platformFee += fee;

          const doctorProfile = profilesData?.find((p) => p.id === b.user_id);
          const specialty = doctorProfile?.specialty || "Outros";
          specMap[specialty] = (specMap[specialty] || 0) + 1;

          const dayOfWeek = getDay(dateObj);
          const hour = getHours(dateObj);
          let shiftIdx = -1;
          if (hour >= 8 && hour < 12) shiftIdx = 0;
          else if (hour >= 12 && hour < 16) shiftIdx = 1;
          else if (hour >= 16 && hour < 20) shiftIdx = 2;
          else if (hour >= 20 && hour <= 23) shiftIdx = 3;

          if (shiftIdx !== -1) {
            heatMapMatrix[dayOfWeek].shifts[shiftIdx] += 1;
          }

          if (roomStats[b.room_id]) {
            roomStats[b.room_id].revenue += revenue;
            roomStats[b.room_id].bookings += 1;
          }
        });

        setGmv(totalGmv);
        setTakeRate(totalGmv * 0.1);
        setActiveDoctors(uniqueDoctors.size);
        setActiveRooms(roomsData?.filter((r) => r.is_active).length || 0);

        const sortedRevData = Object.values(revMap).sort(
          (a: any, b: any) => a.order - b.order,
        );
        setRevenueData(sortedRevData);

        const totalSpecBookings = Object.values(specMap).reduce(
          (a: any, b: any) => a + b,
          0,
        ) as number;
        const formattedSpecData = Object.keys(specMap)
          .map((key, index) => ({
            name: key,
            value:
              totalSpecBookings > 0
                ? Math.round((specMap[key] / totalSpecBookings) * 100)
                : 0,
            color: PIE_COLORS[index % PIE_COLORS.length],
          }))
          .sort((a, b) => b.value - a.value);
        setSpecialtyData(formattedSpecData);

        const orderedHeatmap = [
          heatMapMatrix[1],
          heatMapMatrix[2],
          heatMapMatrix[3],
          heatMapMatrix[4],
          heatMapMatrix[5],
          heatMapMatrix[6],
          heatMapMatrix[0],
        ];
        setHeatmapData(orderedHeatmap);

        const formattedRooms = Object.values(roomStats)
          .filter((r: any) => r.bookings > 0)
          .map((r: any) => {
            const hostProfile = profilesData?.find((p) => p.id === r.host_id);
            const occ = Math.min(
              Math.round((r.bookings / (daysCount * 4)) * 100),
              100,
            );

            let status = "cold";
            if (occ >= 40) status = "hot";
            else if (occ >= 15) status = "warm";

            return {
              ...r,
              host: hostProfile?.full_name || "Desconhecido",
              occupancy: occ,
              status: status,
            };
          })
          .sort((a: any, b: any) => b.revenue - a.revenue)
          .slice(0, 10);

        setTopRooms(formattedRooms);
      } catch (err: any) {
        // TRATAMENTO DE ERRO AVANÇADO (Captura o motivo real)
        console.error("Erro ao montar BI do Admin:", err);

        let errorMsg = "Ocorreu um erro desconhecido ao carregar o painel.";
        if (err instanceof Error) {
          errorMsg = err.message;
        } else if (err?.message) {
          errorMsg = err.message;
        } else {
          errorMsg = JSON.stringify(err);
        }

        if (errorMsg === "{}" || errorMsg === "[]") {
          errorMsg =
            "Bloqueio do Supabase (RLS). Certifique-se de que rodou o Script SQL para permitir que o Admin leia as reservas e salas.";
        }

        toast({
          variant: "destructive",
          title: "Erro de Processamento de Dados",
          description: errorMsg,
        });
      } finally {
        setLoading(false);
      }
    }

    fetchRealBI();
  }, [supabase, timeFilter, toast]);

  const getHeatmapColor = (intensity: number) => {
    if (intensity === 0) return "bg-slate-50 border-slate-100";
    if (intensity <= 2) return "bg-blue-100 border-blue-200 text-blue-700";
    if (intensity <= 5)
      return "bg-emerald-100 border-emerald-200 text-emerald-700";
    if (intensity <= 10) return "bg-amber-100 border-amber-200 text-amber-700";
    if (intensity <= 20) return "bg-orange-400 border-orange-500 text-white";
    return "bg-[#d6521e] border-[#b03d12] text-white shadow-inner";
  };

  const handleExportPrint = () => {
    window.print();
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-full py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans print:p-0">
      {/* HEADER DO ADMIN */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8 print:mb-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Crown className="w-8 h-8 text-amber-500" />
            Centro de Comando Fusion
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Visão executiva da plataforma, faturamento global e comportamento
            dos usuários.
          </p>
        </div>

        <div className="flex items-center gap-3 print:hidden">
          <div className="flex items-center bg-white border border-slate-200 p-1.5 rounded-xl shadow-sm overflow-x-auto">
            {[
              { id: "7d", label: "7 Dias" },
              { id: "30d", label: "30 Dias" },
              { id: "ytd", label: "Este Ano" },
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
          <Button
            onClick={handleExportPrint}
            variant="outline"
            className="hidden md:flex h-11 rounded-xl border-slate-200 font-bold text-slate-600 hover:text-[#f05e23] hover:bg-orange-50"
          >
            <Download className="w-4 h-4 mr-2" /> Exportar BI
          </Button>
        </div>
      </div>

      {/* KPIs DE PLATAFORMA (SUPERIORES) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8 print:grid-cols-4">
        {/* KPI 1: GMV */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-slate-600">
              <Activity className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Volume Transacionado (GMV)
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            <span className="text-lg text-slate-400 font-bold mr-1">R$</span>
            {gmv.toLocaleString("pt-BR", {
              minimumFractionDigits: 2,
              maximumFractionDigits: 2,
            })}
          </h3>
        </div>

        {/* KPI 2: Receita Fusion (Take Rate) */}
        <div className="bg-gradient-to-br from-slate-900 to-slate-800 p-6 rounded-2xl shadow-xl relative overflow-hidden group print:bg-white print:border print:border-slate-200 print:shadow-none">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#f05e23]/20 rounded-full blur-2xl -mr-8 -mt-8 transition-transform group-hover:scale-150 print:hidden"></div>
          <div className="relative z-10">
            <div className="flex justify-between items-start mb-4">
              <div className="w-10 h-10 rounded-xl bg-[#f05e23]/20 flex items-center justify-center text-[#f05e23]">
                <Wallet className="w-5 h-5" />
              </div>
            </div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1 print:text-slate-500">
              Receita Fusion (Take Rate 10%)
            </p>
            <h3 className="text-3xl font-black text-white print:text-slate-900">
              <span className="text-lg text-emerald-400 font-bold mr-1">
                R$
              </span>
              {takeRate.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
          </div>
        </div>

        {/* KPI 3: Médicos Ativos */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-blue-600">
              <Stethoscope className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Profissionais Ativos
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {activeDoctors}{" "}
            <span className="text-sm text-slate-400 font-medium ml-1">
              usuários
            </span>
          </h3>
        </div>

        {/* KPI 4: Salas Ativas */}
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex justify-between items-start mb-4">
            <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
              <Building2 className="w-5 h-5" />
            </div>
          </div>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
            Salas Cadastradas (Total)
          </p>
          <h3 className="text-3xl font-black text-slate-900">
            {activeRooms}{" "}
            <span className="text-sm text-slate-400 font-medium ml-1">
              espaços
            </span>
          </h3>
        </div>
      </div>

      {/* GRÁFICOS: FATURAMENTO & ESPECIALIDADES */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 mb-8 print:grid-cols-3">
        {/* Gráfico de Faturamento Global */}
        <div className="xl:col-span-2 bg-white rounded-2xl border border-slate-200 shadow-sm p-6">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-900">
                Evolução do Faturamento
              </h2>
              <p className="text-xs font-medium text-slate-500">
                Comparativo do Volume Total vs Receita da Plataforma
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
                  <linearGradient id="colorGmv" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorFee" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#f05e23" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#f05e23" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid
                  strokeDasharray="3 3"
                  vertical={false}
                  stroke="#f1f5f9"
                />
                <XAxis
                  dataKey="name"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b", fontWeight: 600 }}
                  dy={10}
                />
                <YAxis
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: "#64748b" }}
                  tickFormatter={(val) =>
                    `R$${val >= 1000 ? val / 1000 + "k" : val}`
                  }
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: "12px",
                    border: "none",
                    boxShadow: "0 10px 25px -5px rgba(0,0,0,0.1)",
                  }}
                  formatter={(value: number, name: string) => [
                    `R$ ${value.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}`,
                    name === "gmv" ? "Volume Total" : "Receita Fusion",
                  ]}
                />
                <Area
                  type="monotone"
                  dataKey="gmv"
                  stroke="#94a3b8"
                  strokeWidth={2}
                  fillOpacity={1}
                  fill="url(#colorGmv)"
                />
                <Area
                  type="monotone"
                  dataKey="platformFee"
                  stroke="#f05e23"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#colorFee)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Gráfico de Especialidades */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col">
          <div className="mb-2">
            <h2 className="text-lg font-black text-slate-900">
              Demanda por Especialidade
            </h2>
            <p className="text-xs font-medium text-slate-500">
              Quem está alugando mais?
            </p>
          </div>
          <div className="flex-1 flex items-center justify-center">
            {specialtyData.length > 0 ? (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={specialtyData}
                    innerRadius={60}
                    outerRadius={80}
                    paddingAngle={5}
                    dataKey="value"
                  >
                    {specialtyData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <RechartsTooltip
                    formatter={(value) => [`${value}%`, "Market Share"]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="text-slate-400 text-sm font-bold">
                Sem dados no período
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-2 mt-4 max-h-[100px] overflow-y-auto scrollbar-hide">
            {specialtyData.map((spec) => (
              <div
                key={spec.name}
                className="flex items-center gap-2 text-xs font-bold text-slate-600 truncate"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: spec.color }}
                ></span>
                <span className="truncate">{spec.name}</span> ({spec.value}%)
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* MAPA DE CALOR GLOBAL (Horários Frios e Quentes) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-8 overflow-hidden print:break-inside-avoid">
        <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
              <Map className="w-5 h-5 text-indigo-500" /> Zonas Quentes e Frias
              (Real)
            </h2>
            <p className="text-xs font-medium text-slate-500 mt-1">
              Concentração de agendamentos no período selecionado.
            </p>
          </div>
          <div className="flex gap-2">
            <Badge
              variant="outline"
              className="bg-blue-50 text-blue-700 border-blue-200"
            >
              <Snowflake className="w-3 h-3 mr-1" /> Baixa Demanda
            </Badge>
            <Badge
              variant="outline"
              className="bg-orange-50 text-orange-700 border-orange-200"
            >
              <Flame className="w-3 h-3 mr-1" /> Alta Demanda
            </Badge>
          </div>
        </div>

        <div className="overflow-x-auto pb-4">
          <div className="min-w-[600px]">
            {/* Header do Grid */}
            <div className="grid grid-cols-5 gap-2 mb-2">
              <div className="col-span-1"></div>
              {shiftLabels.map((label) => (
                <div
                  key={label}
                  className="col-span-1 text-center text-[10px] font-bold text-slate-500 uppercase"
                >
                  {label}
                </div>
              ))}
            </div>

            {/* Linhas do Grid */}
            <div className="flex flex-col gap-2">
              {heatmapData.map((row) => (
                <div
                  key={row.day}
                  className="grid grid-cols-5 gap-2 items-center"
                >
                  <div className="col-span-1 text-sm font-black text-slate-700 text-right pr-4">
                    {row.day}
                  </div>
                  {row.shifts.map((intensity: number, idx: number) => (
                    <div
                      key={idx}
                      className={`col-span-1 h-12 rounded-xl border flex items-center justify-center transition-all hover:scale-105 cursor-crosshair ${getHeatmapColor(intensity)}`}
                      title={`${row.day} - ${shiftLabels[idx]}: ${intensity} reservas`}
                    >
                      {intensity >= 10 && (
                        <Flame className="w-4 h-4 opacity-50" />
                      )}
                      {intensity > 0 && intensity <= 2 && (
                        <Snowflake className="w-4 h-4 opacity-50" />
                      )}
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* RANKING DE SALAS (PERFORMANCE) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden print:break-inside-avoid">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h2 className="text-lg font-black text-slate-900">
              Top 10 Salas (Performance)
            </h2>
            <p className="text-xs font-medium text-slate-500">
              As salas que mais geram receita real para a plataforma.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Posição / Sala</th>
                <th className="px-6 py-4">Anfitrião</th>
                <th className="px-6 py-4 text-center">Ocupação (Est.)</th>
                <th className="px-6 py-4 text-center">Termômetro</th>
                <th className="px-6 py-4 text-right">Volume Gerado (R$)</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {topRooms.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-10 text-center text-slate-500 font-medium"
                  >
                    Nenhuma reserva no período selecionado.
                  </td>
                </tr>
              ) : (
                topRooms.map((room, index) => (
                  <tr
                    key={room.id}
                    className="hover:bg-slate-50/80 transition-colors"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black shrink-0 ${index === 0 ? "bg-amber-100 text-amber-700" : index === 1 ? "bg-slate-200 text-slate-700" : index === 2 ? "bg-orange-100 text-orange-700" : "bg-slate-100 text-slate-500"}`}
                        >
                          {index + 1}
                        </div>
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
                    <td className="px-6 py-4 font-bold text-slate-600 truncate max-w-[150px]">
                      {room.host}
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center justify-center gap-2">
                        <span className="font-bold text-slate-700 w-8 text-right">
                          {room.occupancy}%
                        </span>
                        <div className="w-20 h-2 bg-slate-100 rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full bg-[#f05e23]"
                            style={{ width: `${room.occupancy}%` }}
                          />
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {room.status === "hot" && (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 border-0">
                          <Flame className="w-3 h-3 mr-1" /> Alta Demanda
                        </Badge>
                      )}
                      {room.status === "warm" && (
                        <Badge className="bg-amber-100 text-amber-700 hover:bg-amber-100 border-0">
                          Estável
                        </Badge>
                      )}
                      {room.status === "cold" && (
                        <Badge className="bg-blue-100 text-blue-700 hover:bg-blue-100 border-0">
                          <Snowflake className="w-3 h-3 mr-1" /> Ociosa
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right font-black text-slate-900 bg-emerald-50/30">
                      R${" "}
                      {room.revenue.toLocaleString("pt-BR", {
                        minimumFractionDigits: 2,
                      })}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
