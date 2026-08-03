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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
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
  // BI Metrics para Anfitriões
  roomsCount: number;
  bookingsCount: number;
  gmv: number; // Gross Merchandise Volume (Volume total gerado pelas salas dele)
  platformFee: number; // Quanto a Fusion ganhou com ele
  lastBookingDate: string | null;
  tier: "Start" | "Gold" | "Platinum" | "Diamond";
  status: "active" | "pending" | "blocked";
  myRooms: any[];
}

export function AdminPartnersTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [partners, setPartners] = useState<Partner[]>([]);

  const [search, setSearch] = useState("");

  const [selectedProfile, setSelectedProfile] = useState<Partner | null>(null);
  const [profileBookings, setProfileBookings] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  useEffect(() => {
    fetchPartners();
  }, [supabase]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      // 1. Busca todas as salas para descobrir quem são os anfitriões
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

      // 2. Busca os perfis que são donos dessas salas
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .in("id", hostIds);
      if (pErr) throw pErr;

      // 3. Busca as reservas dessas salas para calcular faturamento
      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("id, total_cost, start_time, status, room_id")
        .in("status", ["confirmed", "completed", "pending_payment"]);
      if (bErr) throw bErr;

      // 4. Cruzamento de Dados (BI)
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

        const lastBooking = myBookings.sort(
          (a, b) =>
            new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
        )[0];

        // Regra de Negócio: Categorização de Parceiros (Tiers baseados em Geração de Valor)
        let tier: Partner["tier"] = "Start";
        if (gmv >= 20000) tier = "Diamond";
        else if (gmv >= 10000) tier = "Platinum";
        else if (gmv >= 3000) tier = "Gold";

        // Assumindo endereço de alguma sala caso o perfil não tenha
        let defaultCity = "Natal";
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
          lastBookingDate: lastBooking ? lastBooking.start_time : null,
          tier,
          status: "active",
          myRooms,
        };
      });

      // Ordena por maior GMV
      setPartners(processedData.sort((a, b) => b.gmv - a.gmv));
    } catch (err: any) {
      console.error("Erro ao buscar parceiros:", err);
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

    try {
      const roomIds = partner.myRooms.map((r) => r.id);
      if (roomIds.length > 0) {
        const { data, error } = await supabase
          .from("bookings")
          .select(
            `
            id, start_time, end_time, total_cost, status, user_id,
            rooms (name),
            profiles!bookings_user_id_fkey (full_name)
          `,
          )
          .in("room_id", roomIds)
          .order("start_time", { ascending: false })
          .limit(10); // Últimas 10 locações nas salas deste parceiro

        if (!error && data) {
          setProfileBookings(data);
        }
      } else {
        setProfileBookings([]);
      }
    } catch (err) {}

    setProfileLoading(false);
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
    return (
      <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
        <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10 shadow-sm">
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
                    className="text-slate-600 border-slate-200"
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

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* KPI 1: GMV (Receita Bruta Gerada) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
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
                Valor bruto girado nas salas deste parceiro.
              </p>
            </div>

            {/* KPI 2: Take Rate (O que a plataforma ganhou) */}
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

            {/* KPI 3: Operação (Salas e Reservas) */}
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Infraestrutura Ativa
              </p>
              <h3 className="text-3xl font-black text-slate-900 mb-1">
                {selectedProfile.roomsCount}{" "}
                <span className="text-base font-bold text-slate-400">
                  salas listadas
                </span>
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-2">
                {selectedProfile.bookingsCount} locações recebidas no total.
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Lista de Salas do Parceiro */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-[#f05e23]" /> Salas Listadas
              </h3>
              <div className="space-y-3">
                {selectedProfile.myRooms.length === 0 ? (
                  <p className="text-sm text-slate-500">
                    Nenhuma sala cadastrada.
                  </p>
                ) : (
                  selectedProfile.myRooms.map((r) => (
                    <div
                      key={r.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 bg-slate-50"
                    >
                      <div className="font-bold text-slate-800">{r.name}</div>
                      <Badge
                        className={
                          r.is_active
                            ? "bg-emerald-100 text-emerald-700 border-0"
                            : "bg-slate-200 text-slate-600 border-0"
                        }
                      >
                        {r.is_active ? "Ativa" : "Inativa"}
                      </Badge>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Últimos Agendamentos Recebidos */}
            <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
              <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
                <CalendarIcon className="w-5 h-5 text-[#f05e23]" /> Últimas
                Reservas Recebidas
              </h3>

              {profileLoading ? (
                <div className="flex justify-center py-10">
                  <Loader2 className="w-6 h-6 animate-spin text-[#f05e23]" />
                </div>
              ) : profileBookings.length === 0 ? (
                <div className="text-center py-6">
                  <p className="text-slate-500 font-medium text-sm">
                    Nenhum agendamento nas salas deste parceiro.
                  </p>
                </div>
              ) : (
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-2">
                  {profileBookings.map((b) => (
                    <div
                      key={b.id}
                      className="flex items-center justify-between p-3 rounded-xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                    >
                      <div>
                        <p className="font-bold text-slate-900 text-sm truncate max-w-[180px]">
                          {b.rooms?.name}
                        </p>
                        <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                          Locatário: {b.profiles?.full_name}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-xs font-black text-emerald-600 mb-1">
                          R${" "}
                          {(b.total_cost * 45).toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                          })}
                        </p>
                        <p className="text-[10px] font-bold text-slate-400">
                          {format(parseISO(b.start_time), "dd MMM", {
                            locale: ptBR,
                          })}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
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
              {totalGMV >= 1000 ? (totalGMV / 1000).toFixed(1) + "k" : totalGMV}
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
                : totalPlatformFee.toFixed(2)}
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
