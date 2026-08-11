"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  Eye,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Calendar as CalendarIcon,
  Clock,
  TrendingUp,
  Award,
  Wallet,
  ChevronLeft,
  Loader2,
  Ban,
  CheckCircle2,
  Building2,
  Activity,
  Crown,
  Star,
  FileSpreadsheet,
  Users,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface Partner {
  id: string;
  full_name: string;
  avatar_url: string | null;
  document_number: string;
  city: string;
  state: string;
  created_at: string;
  phone: string;
  email: string;
  roomsCount: number;
  bookingsCount: number;
  gmv: number;
  platformFee: number;
  partnerNet: number; // Valor líquido do parceiro (90%)
  lastBookingDate: string | null;
  tier: "Start" | "Gold" | "Platinum" | "Diamond";
  status: "active" | "pending" | "blocked";
  myRooms: any[];
}

// Motor Sênior de Exportação para Excel (CSV compatível com o Brasil)
const exportToCSV = (headers: string[], rows: any[][], filename: string) => {
  const csvContent = [
    headers.join(";"),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"),
    ),
  ].join("\n");

  const blob = new Blob(["\ufeff", csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    `${filename}_${format(new Date(), "dd-MM-yyyy")}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export function AdminPartnersTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);

  const [search, setSearch] = useState("");

  const [selectedProfile, setSelectedProfile] = useState<Partner | null>(null);
  const [profileBookings, setProfileBookings] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  // Controles de View do Dossiê
  const [dossierTab, setDossierTab] = useState<"rooms" | "bookings">(
    "bookings",
  );

  // Filtros de Reservas
  const [roomFilter, setRoomFilter] = useState<"all" | string>("all");
  const [bookingFilter, setBookingFilter] = useState<
    "all" | "30" | "90" | "custom"
  >("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  useEffect(() => {
    fetchPartners();
  }, [supabase]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const { data: rooms, error: rErr } = await supabase
        .from("rooms")
        .select("*");
      if (rErr) throw rErr;

      const hostIds = [
        ...new Set(rooms?.map((r) => r.host_id).filter(Boolean) || []),
      ];

      if (hostIds.length === 0) {
        setPartners([]);
        setLoading(false);
        return;
      }

      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .in("id", hostIds);
      if (pErr) throw pErr;

      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("id, total_cost, start_time, status, room_id")
        .in("status", ["confirmed", "completed"]); // Apenas finalizadas/confirmadas para repasse
      if (bErr) throw bErr;

      const processedData: Partner[] = profiles.map((p) => {
        const myRooms = rooms?.filter((r) => r.host_id === p.id) || [];
        const myRoomIds = myRooms.map((r) => r.id);

        const myBookings =
          bookings?.filter((b) => myRoomIds.includes(b.room_id)) || [];

        const gmv = myBookings.reduce(
          (acc, curr) => acc + (Number(curr.total_cost) || 0) * 45,
          0,
        );
        const platformFee = gmv * 0.1; // Take Rate de 10%
        const partnerNet = gmv * 0.9; // Repasse Líquido 90%

        const lastBooking = myBookings.sort(
          (a, b) =>
            new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
        )[0];

        let tier: Partner["tier"] = "Start";
        if (gmv >= 20000) tier = "Diamond";
        else if (gmv >= 10000) tier = "Platinum";
        else if (gmv >= 3000) tier = "Gold";

        let defaultCity = "Não informada";
        let defaultState = "RN";
        if (myRooms.length > 0 && myRooms[0].address_details) {
          try {
            const addr =
              typeof myRooms[0].address_details === "string"
                ? JSON.parse(myRooms[0].address_details)
                : myRooms[0].address_details;
            if (addr.city) defaultCity = addr.city;
            if (addr.state) defaultState = addr.state;
          } catch (e) {}
        }

        return {
          id: p.id,
          full_name: p.full_name || "Clínica Parceira",
          avatar_url: p.avatar_url,
          document_number: p.document_number || "CNPJ/CPF Pendente",
          city: defaultCity,
          state: defaultState,
          created_at: p.created_at,
          phone: p.phone || "Não informado",
          email:
            p.email ||
            `${p.full_name?.split(" ")[0]?.toLowerCase() || "clinica"}@email.com`,
          roomsCount: myRooms.length,
          bookingsCount: myBookings.length,
          gmv,
          platformFee,
          partnerNet,
          lastBookingDate: lastBooking ? lastBooking.start_time : null,
          tier,
          status: "active",
          myRooms,
        };
      });

      setPartners(processedData.sort((a, b) => b.gmv - a.gmv));
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro de Conexão",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProfile = async (partner: Partner) => {
    setSelectedProfile(partner);
    setProfileLoading(true);
    setDossierTab("bookings");
    setBookingFilter("all");
    setRoomFilter("all");

    try {
      const roomIds = partner.myRooms.map((r) => r.id);
      if (roomIds.length > 0) {
        // ATUALIZAÇÃO SÊNIOR: Retirado o .limit(10) para puxar todo o histórico e permitir o filtro/exportação real
        const { data, error } = await supabase
          .from("bookings")
          .select(
            `
            id, start_time, end_time, total_cost, status, user_id,
            rooms (id, name),
            profiles!bookings_user_id_fkey (full_name)
          `,
          )
          .in("room_id", roomIds)
          .order("start_time", { ascending: false });

        if (!error && data) {
          setProfileBookings(data);
        }
      } else {
        setProfileBookings([]);
      }
    } catch (err) {}

    setProfileLoading(false);
  };

  // Exportação Financeira do Repasse
  const exportBookings = (dataToExport: any[]) => {
    const headers = [
      "ID Reserva",
      "Sala",
      "Locatário",
      "Data/Período",
      "Status",
      "Valor Bruto (R$)",
      "Taxa Fusion 10% (R$)",
      "Repasse Líquido (R$)",
    ];
    const rows = dataToExport.map((b) => {
      const bruto = b.total_cost * 45;
      const taxa = bruto * 0.1;
      const liquido = bruto * 0.9;

      return [
        b.id,
        b.rooms?.name || "Desconhecida",
        b.profiles?.full_name || "Usuário Removido",
        `${format(parseISO(b.start_time), "dd/MM/yyyy")} (${format(parseISO(b.start_time), "HH:mm")} às ${format(parseISO(b.end_time), "HH:mm")})`,
        b.status,
        bruto.toFixed(2).replace(".", ","),
        taxa.toFixed(2).replace(".", ","),
        liquido.toFixed(2).replace(".", ","),
      ];
    });
    exportToCSV(
      headers,
      rows,
      `Repasses_Parceiro_${selectedProfile?.full_name.replace(/\s+/g, "_")}`,
    );
  };

  const totalGMV = partners.reduce((acc, curr) => acc + curr.gmv, 0);
  const totalPlatformFee = partners.reduce(
    (acc, curr) => acc + curr.platformFee,
    0,
  );
  const totalRooms = partners.reduce((acc, curr) => acc + curr.roomsCount, 0);

  const filteredPartners = partners.filter(
    (p) =>
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.document_number.includes(search) ||
      p.email.toLowerCase().includes(search.toLowerCase()),
  );

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "Diamond":
        return (
          <Badge className="bg-slate-900 text-white border-0">
            <Crown className="w-3 h-3 mr-1 text-blue-400" /> Diamond
          </Badge>
        );
      case "Platinum":
        return (
          <Badge className="bg-slate-200 text-slate-800 border-0">
            <Star className="w-3 h-3 mr-1 text-slate-600" /> Platinum
          </Badge>
        );
      case "Gold":
        return (
          <Badge className="bg-amber-100 text-amber-700 border-0">
            <Award className="w-3 h-3 mr-1" /> Gold
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-50 text-blue-700 border-0">Start</Badge>
        );
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );

  // ========================================================
  // RENDERIZAÇÃO: DOSSIÊ DO PARCEIRO (TELA CHEIA)
  // ========================================================
  if (selectedProfile) {
    // Filtros de Reservas aplicados em Cascata
    const filteredBookings = profileBookings.filter((b) => {
      // 1. Filtro de Sala
      if (roomFilter !== "all" && b.rooms?.id !== roomFilter) return false;

      // 2. Filtro de Data
      const bDate = new Date(b.start_time);
      if (bookingFilter === "30")
        return differenceInDays(new Date(), bDate) <= 30;
      if (bookingFilter === "90")
        return differenceInDays(new Date(), bDate) <= 90;
      if (bookingFilter === "custom") {
        const start = customStartDate
          ? new Date(`${customStartDate}T00:00:00`)
          : new Date(0);
        const end = customEndDate
          ? new Date(`${customEndDate}T23:59:59`)
          : new Date();
        return bDate >= start && bDate <= end;
      }
      return true; // "all"
    });

    const filteredGMV = filteredBookings.reduce(
      (acc, curr) => acc + (Number(curr.total_cost) || 0) * 45,
      0,
    );

    return (
      <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
        <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSelectedProfile(null)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 leading-none">
                  Dossiê do Parceiro
                </h2>
                {selectedProfile.status === "active" ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold uppercase tracking-wider text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 border-0 font-bold uppercase tracking-wider text-[10px]">
                    <Ban className="w-3 h-3 mr-1" /> Bloqueado
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-slate-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold"
            >
              <Ban className="w-4 h-4 mr-2" /> Suspender Operação
            </Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white font-bold">
              <Mail className="w-4 h-4 mr-2" /> Contatar Gestor
            </Button>
          </div>
        </div>

        <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
          {/* CARTÃO DE IDENTIFICAÇÃO DO ANFITRIÃO */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#f05e23]/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

            <div className="w-32 h-32 rounded-3xl bg-slate-100 border-4 border-white shadow-lg overflow-hidden shrink-0 flex items-center justify-center text-slate-300">
              {selectedProfile.avatar_url ? (
                <img
                  src={selectedProfile.avatar_url}
                  alt={selectedProfile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 className="w-12 h-12" />
              )}
            </div>

            <div className="flex-1 text-center md:text-left z-10">
              <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
                <h1 className="text-3xl font-black text-slate-900">
                  {selectedProfile.full_name}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-2">
                  {getTierBadge(selectedProfile.tier)}
                  <Badge
                    variant="outline"
                    className="text-slate-600 border-slate-200 bg-slate-50"
                  >
                    Doc: {selectedProfile.document_number}
                  </Badge>
                </div>
              </div>
              <p className="text-lg font-bold text-slate-500 mb-6">
                Operador de Espaços de Saúde
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Mail className="w-4 h-4 text-[#f05e23]" />{" "}
                  {selectedProfile.email}
                </div>
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Phone className="w-4 h-4 text-[#f05e23]" />{" "}
                  {selectedProfile.phone}
                </div>
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <MapPin className="w-4 h-4 text-[#f05e23]" />{" "}
                  {selectedProfile.city} - {selectedProfile.state}
                </div>
              </div>
            </div>
          </div>

          {/* KPIS GLOBAIS DA OPERAÇÃO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Volume Transacionado (GMV)
              </p>
              <h3 className="text-3xl font-black text-slate-900 mb-1">
                <span className="text-base text-slate-400 font-bold mr-1">
                  R$
                </span>
                {selectedProfile.gmv.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-2">
                Valor bruto girado nas salas.
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#f05e23]/20 rounded-full blur-2xl transition-transform group-hover:scale-150"></div>
              <div className="relative z-10">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Receita Fusion (Take Rate)
                </p>
                <h3 className="text-4xl font-black mb-1">
                  <span className="text-xl text-emerald-400 font-bold mr-1">
                    R$
                  </span>
                  {selectedProfile.platformFee.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
                </h3>
                <p className="text-sm font-medium text-slate-400">
                  Lucro líquido da plataforma (10%)
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Repasse Líquido Parceiro
              </p>
              <h3 className="text-3xl font-black text-emerald-600 mb-1">
                <span className="text-base text-emerald-400 font-bold mr-1">
                  R$
                </span>
                {selectedProfile.partnerNet.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-2">
                Valor devido ao Anfitrião (90%).
              </p>
            </div>
          </div>

          {/* ÁREA DE ABAS: INVENTÁRIO VS LOCAÇÕES */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => setDossierTab("bookings")}
                className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${dossierTab === "bookings" ? "border-[#f05e23] text-[#f05e23] bg-orange-50/30" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
              >
                Histórico de Repasses (Reservas)
              </button>
              <button
                onClick={() => setDossierTab("rooms")}
                className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${dossierTab === "rooms" ? "border-[#f05e23] text-[#f05e23] bg-orange-50/30" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
              >
                Inventário de Salas
              </button>
            </div>

            {profileLoading ? (
              <div className="flex justify-center py-20">
                <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
              </div>
            ) : dossierTab === "bookings" ? (
              <div className="p-6">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4 border-b border-slate-100 pb-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-[#f05e23]" /> Extrato
                      de Operação
                    </h3>
                    <p className="text-xs font-medium text-slate-500 mt-1">
                      Valores baseados no filtro atual: GMV R${" "}
                      {filteredGMV.toFixed(2).replace(".", ",")}
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    {/* Filtro de Sala */}
                    <select
                      value={roomFilter}
                      onChange={(e) => setRoomFilter(e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none max-w-[200px] truncate"
                    >
                      <option value="all">Todas as Salas</option>
                      {selectedProfile.myRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>

                    {/* Filtro de Data */}
                    <select
                      value={bookingFilter}
                      onChange={(e) => setBookingFilter(e.target.value as any)}
                      className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
                    >
                      <option value="all">Todo o Período</option>
                      <option value="30">Últimos 30 Dias</option>
                      <option value="90">Últimos 90 Dias</option>
                      <option value="custom">Personalizado</option>
                    </select>

                    {bookingFilter === "custom" && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="h-10 w-32 rounded-xl border-slate-200 bg-slate-50 text-sm"
                        />
                        <span className="text-slate-400 font-medium">até</span>
                        <Input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="h-10 w-32 rounded-xl border-slate-200 bg-slate-50 text-sm"
                        />
                      </div>
                    )}

                    <Button
                      onClick={() => exportBookings(filteredBookings)}
                      variant="outline"
                      className="h-10 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 font-bold"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-2" /> Baixar
                      Relatório
                    </Button>
                  </div>
                </div>

                {filteredBookings.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <CalendarIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                      Nenhuma reserva confirmada para os filtros selecionados.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {filteredBookings.map((b) => {
                      const bruto = b.total_cost * 45;
                      const liquido = bruto * 0.9;
                      return (
                        <div
                          key={b.id}
                          className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors gap-4"
                        >
                          <div className="flex items-center gap-4">
                            <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center shrink-0">
                              <Users className="w-5 h-5 text-slate-500" />
                            </div>
                            <div>
                              <p className="font-bold text-slate-900 line-clamp-1">
                                {b.rooms?.name}
                              </p>
                              <p className="text-xs font-bold text-slate-500 mt-0.5">
                                Médico: {b.profiles?.full_name}
                              </p>
                              <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                                {format(parseISO(b.start_time), "dd/MM/yy")} •{" "}
                                {format(parseISO(b.start_time), "HH:mm")} às{" "}
                                {format(parseISO(b.end_time), "HH:mm")}
                              </p>
                            </div>
                          </div>
                          <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
                            <div className="text-left sm:text-right">
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                                Repasse Líquido
                              </p>
                              <p className="font-black text-emerald-600">
                                R${" "}
                                {liquido.toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                })}
                              </p>
                            </div>
                            <div className="text-right">
                              <p className="text-[10px] font-bold text-slate-400">
                                Bruto: R$ {bruto.toFixed(2).replace(".", ",")}
                              </p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#f05e23]" />{" "}
                    Infraestrutura do Parceiro
                  </h3>
                </div>

                {selectedProfile.myRooms.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                      O anfitrião ainda não possui salas ativas.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
                    {selectedProfile.myRooms.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50"
                      >
                        <div className="w-16 h-16 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-slate-200">
                          <img
                            src={r.image_url || "/placeholder.jpg"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <p className="font-bold text-slate-900 line-clamp-1 pr-2">
                              {r.name}
                            </p>
                            <Badge
                              className={
                                r.is_active
                                  ? "bg-emerald-100 text-emerald-700 border-0 shrink-0"
                                  : "bg-slate-200 text-slate-600 border-0 shrink-0"
                              }
                            >
                              {r.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                            Tier: {r.tier || "Start"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // RENDERIZAÇÃO: LISTAGEM PADRÃO DA ABA DE PARCEIROS
  // ========================================================
  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#f05e23]" />
            Parceiros (Anfitriões)
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gestão dos donos de clínicas, acompanhamento de faturamento gerado e
            controle de espaços listados.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              Infraestrutura
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              {totalRooms}{" "}
              <span className="text-sm font-medium text-slate-500">
                salas ativas
              </span>
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              GMV Total Gerado
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              R${" "}
              {totalGMV >= 1000
                ? (totalGMV / 1000).toFixed(1) + "k"
                : totalGMV.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-[#f05e23] shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              Receita Fusion (10%)
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              R${" "}
              {totalPlatformFee >= 1000
                ? (totalPlatformFee / 1000).toFixed(1) + "k"
                : totalPlatformFee.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                  })}
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar clínica, parceiro ou documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 rounded-xl border-slate-200 bg-white font-medium w-full"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white text-slate-400 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Anfitrião / Clínica</th>
                <th className="px-6 py-4 text-center">Salas Listadas</th>
                <th className="px-6 py-4 text-center">Nível de Parceria</th>
                <th className="px-6 py-4 text-right">GMV (Gerado)</th>
                <th className="px-6 py-4 text-right">Receita Fusion (10%)</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-slate-500 font-medium"
                  >
                    Nenhum parceiro encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredPartners.map((partner) => (
                  <tr
                    key={partner.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0 text-slate-300">
                          {partner.avatar_url ? (
                            <img
                              src={partner.avatar_url}
                              className="w-full h-full object-cover"
                            />
                          ) : (
                            <Building2 className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-black text-slate-900">
                            {partner.full_name}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                            {partner.email}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            {partner.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <p className="font-black text-slate-700 text-lg">
                        {partner.roomsCount}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                        Espaços Ativos
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getTierBadge(partner.tier)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-slate-900">
                        R${" "}
                        {partner.gmv.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {partner.bookingsCount} locações totais
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200">
                        + R${" "}
                        {partner.platformFee.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button
                        onClick={() => handleOpenProfile(partner)}
                        variant="ghost"
                        className="h-8 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 font-bold px-3 rounded-lg"
                      >
                        Ver Dossiê
                      </Button>
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
