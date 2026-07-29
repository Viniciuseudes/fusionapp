"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { PackagesAdminTab } from "@/components/admin/packages-admin-tab";
import {
  Users,
  Building2,
  CalendarDays,
  LayoutDashboard,
  ShieldCheck,
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  Loader2,
  Clock,
  LogOut,
  X,
  MapPin,
  User,
  FileText,
  Shield,
  Star,
  Crown,
  Sparkles,
  AlertTriangle,
  Save,
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Tags,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import {
  format,
  addMonths,
  subMonths,
  startOfMonth,
  endOfMonth,
  startOfWeek,
  endOfWeek,
  isSameMonth,
  isSameDay,
  addDays,
} from "date-fns";
import { ptBR } from "date-fns/locale";

// ==========================================
// COMPONENTE PRINCIPAL (LAYOUT DA PÁGINA)
// ==========================================
export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState("salas");

  // NOVO MENU DE PRECIFICAÇÃO ADICIONADO AQUI
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "especialistas", label: "Especialistas", icon: Users },
    { id: "parceiros", label: "Parceiros", icon: ShieldCheck },
    { id: "salas", label: "Gestão de Salas", icon: Building2 },
    { id: "pacotes", label: "Precificação (Pacotes)", icon: Tags },
    { id: "agendamentos", label: "Agendamentos", icon: CalendarDays },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      <aside className="w-64 bg-slate-900 text-white flex flex-col shrink-0">
        <div className="p-6 border-b border-white/10 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#f05e23] font-black text-xl shadow-lg">
            F
          </div>
          <div>
            <h1 className="font-black text-lg leading-tight tracking-wide">
              Fusion Admin
            </h1>
            <p className="text-[10px] font-bold text-white/50 uppercase tracking-widest">
              Torre de Controle
            </p>
          </div>
        </div>
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={`w-full flex items-center gap-3 px-4 py-3.5 rounded-xl font-bold transition-all ${
                  isActive
                    ? "bg-[#f05e23] text-white shadow-md shadow-orange-500/20"
                    : "text-slate-400 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon
                  className={`w-5 h-5 ${isActive ? "text-white" : "text-slate-400"}`}
                />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="p-4 border-t border-white/10">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl font-bold text-slate-400 hover:bg-red-500/10 hover:text-red-400 transition-all">
            <LogOut className="w-5 h-5" /> Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 flex flex-col h-screen overflow-hidden relative">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 shrink-0 shadow-sm z-10">
          <h2 className="text-xl font-black text-slate-800 capitalize">
            {activeTab.replace("-", " ")}
          </h2>
          <div className="flex items-center gap-4">
            <div className="text-right hidden md:block">
              <p className="text-sm font-bold text-slate-900">Administrador</p>
              <p className="text-xs text-slate-500 font-medium">
                tecnologia@fusionclinic.com.br
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-slate-100 border border-slate-200 flex items-center justify-center font-black text-slate-600">
              A
            </div>
          </div>
        </header>
        <div className="flex-1 overflow-y-auto relative bg-slate-50">
          {/* RENDERIZAÇÃO CONDICIONAL DAS ABAS */}
          {activeTab === "salas" && <AdminRoomsTab />}
          {activeTab === "pacotes" && <PackagesAdminTab />}

          {activeTab !== "salas" && activeTab !== "pacotes" && (
            <div className="h-full flex flex-col items-center justify-center text-slate-400">
              <Loader2 className="w-10 h-10 animate-spin mb-4 text-slate-300" />
              <p className="font-bold">Módulo em construção...</p>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

// ==========================================
// MÓDULO: GESTÃO DE SALAS
// ==========================================
function AdminRoomsTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  // Estados da Gestão de Sala em TELA CHEIA
  const [evaluatingRoom, setEvaluatingRoom] = useState<any | null>(null);
  const [selectedTier, setSelectedTier] = useState<"start" | "vip" | "master">(
    "start",
  );
  const [isPartner, setIsPartner] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  const [auditTab, setAuditTab] = useState<"auditoria" | "editar" | "agenda">(
    "auditoria",
  );
  const [editForm, setEditForm] = useState({
    name: "",
    description: "",
    price: "",
  });

  // Calendário
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [blockedDates, setBlockedDates] = useState<string[]>([]);

  const fetchRooms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rooms")
      .select(
        `
        id, name, is_active, is_paused, created_at, description,
        address_details, image_url, tier, is_partner, blocked_dates,
        profiles:host_id (full_name)
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar as salas.",
      });
    } else {
      setRooms(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRooms();
  }, []);

  const openAuditPanel = (room: any) => {
    setSelectedTier(room.tier || "start");
    setIsPartner(room.is_partner || false);
    setBlockedDates(room.blocked_dates || []);
    setEvaluatingRoom(room);
    setAuditTab("auditoria");
    setCurrentMonth(new Date());

    let parsedPrice = "";
    try {
      const address =
        typeof room.address_details === "string"
          ? JSON.parse(room.address_details)
          : room.address_details || {};
      parsedPrice = address.pricing?.hourly || "";
    } catch (e) {}
    setEditForm({
      name: room.name || "",
      description: room.description || "",
      price: parsedPrice,
    });
  };

  const closeAuditPanel = () => {
    setEvaluatingRoom(null);
  };

  const handleSaveAudit = async () => {
    if (!evaluatingRoom) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("rooms")
        .update({
          is_active: true,
          tier: selectedTier,
          is_partner: isPartner,
        })
        .eq("id", evaluatingRoom.id);
      if (error) throw error;
      toast({ title: "Classificação Salva!" });

      // Atualizar estado local sem fechar a página
      setEvaluatingRoom({
        ...evaluatingRoom,
        is_active: true,
        tier: selectedTier,
        is_partner: isPartner,
      });
      fetchRooms();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveInfoEdit = async () => {
    if (!evaluatingRoom) return;
    setActionLoading(true);
    try {
      let currentAddress =
        typeof evaluatingRoom.address_details === "string"
          ? JSON.parse(evaluatingRoom.address_details)
          : evaluatingRoom.address_details || {};
      const updatedAddress = {
        ...currentAddress,
        pricing: { ...currentAddress.pricing, hourly: editForm.price },
      };

      const { error } = await supabase
        .from("rooms")
        .update({
          name: editForm.name,
          description: editForm.description,
          address_details: updatedAddress,
        })
        .eq("id", evaluatingRoom.id);

      if (error) throw error;
      toast({ title: "Dados atualizados!" });
      fetchRooms();
      setEvaluatingRoom({
        ...evaluatingRoom,
        name: editForm.name,
        description: editForm.description,
        address_details: updatedAddress,
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleSaveBlocks = async () => {
    if (!evaluatingRoom) return;
    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("rooms")
        .update({ blocked_dates: blockedDates })
        .eq("id", evaluatingRoom.id);
      if (error) throw error;
      toast({ title: "Agenda atualizada!" });
      fetchRooms();
      setEvaluatingRoom({ ...evaluatingRoom, blocked_dates: blockedDates });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const toggleBlockDate = (date: Date) => {
    const dateString = format(date, "yyyy-MM-dd");
    if (blockedDates.includes(dateString)) {
      setBlockedDates(blockedDates.filter((d) => d !== dateString));
    } else {
      setBlockedDates([...blockedDates, dateString]);
    }
  };

  const renderCalendar = () => {
    const monthStart = startOfMonth(currentMonth);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);
    const rows = [];
    let days = [];
    let day = startDate;
    const weekDays = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

    const weekDaysRow = (
      <div className="grid grid-cols-7 mb-2 gap-2" key="weekdays">
        {weekDays.map((wd) => (
          <div
            key={wd}
            className="text-center font-black text-xs text-slate-400 uppercase tracking-widest"
          >
            {wd}
          </div>
        ))}
      </div>
    );

    while (day <= endDate) {
      for (let i = 0; i < 7; i++) {
        const cloneDay = day;
        const dateString = format(cloneDay, "yyyy-MM-dd");
        const isBlocked = blockedDates.includes(dateString);
        const isCurrentMonth = isSameMonth(day, monthStart);
        const isPast = day < new Date(new Date().setHours(0, 0, 0, 0));

        days.push(
          <div
            key={day.toString()}
            onClick={() => !isPast && toggleBlockDate(cloneDay)}
            className={`
              h-14 border flex items-center justify-center text-sm font-bold transition-all rounded-xl cursor-pointer relative overflow-hidden
              ${!isCurrentMonth ? "text-slate-300 bg-slate-50 border-slate-100" : "bg-white border-slate-200 hover:border-[#f05e23] hover:shadow-md"}
              ${isPast ? "opacity-40 cursor-not-allowed hover:border-slate-200 hover:shadow-none" : ""}
              ${isBlocked && !isPast ? "bg-red-50 border-red-200 text-red-700" : "text-slate-700"}
            `}
          >
            {isBlocked && !isPast && (
              <div className="absolute top-0 left-0 w-full h-1 bg-red-500" />
            )}
            {format(day, "d")}
          </div>,
        );
        day = addDays(day, 1);
      }
      rows.push(
        <div className="grid grid-cols-7 gap-2 mb-2" key={day.toString()}>
          {days}
        </div>,
      );
      days = [];
    }
    return (
      <div>
        {weekDaysRow}
        {rows}
      </div>
    );
  };

  const handleStatusChange = async (roomId: string, newStatus: boolean) => {
    const { error } = await supabase
      .from("rooms")
      .update({ is_active: newStatus })
      .eq("id", roomId);
    if (!error) {
      toast({ title: "Sucesso" });
      fetchRooms();
    }
  };
  const handleDelete = async (roomId: string) => {
    if (!confirm("Tem certeza que deseja excluir?")) return;
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (!error) {
      toast({ title: "Excluída" });
      fetchRooms();
    }
  };

  // Processamento de dados
  const pendingRooms = rooms.filter((r) => !r.is_active);
  const filteredRooms = rooms.filter((r) => {
    const matchesSearch =
      r.name?.toLowerCase().includes(search.toLowerCase()) ||
      r.profiles?.full_name?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus =
      statusFilter === "all"
        ? true
        : statusFilter === "active"
          ? r.is_active
          : !r.is_active;
    return matchesSearch && matchesStatus;
  });

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
      </div>
    );

  // ========================================================
  // RENDERIZAÇÃO DA PÁGINA (LISTAGEM OU TELA DE GESTÃO)
  // ========================================================

  // SE ESTIVER AVALIANDO UMA SALA -> RENDERIZA A TELA CHEIA
  if (evaluatingRoom) {
    let evalAddress: any = {};
    let evalPricing: any = {};
    let evalImages: string[] = [];
    let mainImage = "/placeholder.jpg";
    try {
      evalAddress =
        typeof evaluatingRoom.address_details === "string"
          ? JSON.parse(evaluatingRoom.address_details)
          : evaluatingRoom.address_details || {};
      evalPricing = evalAddress.pricing || {};
      if (evaluatingRoom.image_url) mainImage = evaluatingRoom.image_url;
      else if (evalAddress.gallery?.length > 0) {
        mainImage = evalAddress.gallery[0];
        evalImages = evalAddress.gallery;
      }
    } catch (e) {}

    return (
      <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header da Tela de Gestão */}
        <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-6">
            <button
              onClick={closeAuditPanel}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors flex items-center justify-center text-slate-500"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 leading-none">
                  {evaluatingRoom.name}
                </h2>
                {evaluatingRoom.is_active ? (
                  <Badge className="bg-emerald-100 text-emerald-800 hover:bg-emerald-100 border-0 font-bold uppercase tracking-wider text-[10px]">
                    Ativa
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-0 font-bold uppercase tracking-wider text-[10px]">
                    Pendente
                  </Badge>
                )}
              </div>
              <p className="text-sm font-medium text-slate-500 mt-1 flex items-center gap-1">
                <User className="w-4 h-4" /> Anfitrião:{" "}
                {evaluatingRoom.profiles?.full_name}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={closeAuditPanel}
              className="font-bold border-slate-200 text-slate-600"
            >
              Voltar à Lista
            </Button>
          </div>
        </div>

        {/* Layout com Sidebar e Conteúdo */}
        <div className="flex-1 flex overflow-hidden">
          {/* Sidebar Interna */}
          <div className="w-72 bg-white border-r border-slate-200 p-6 flex flex-col gap-2 shrink-0 overflow-y-auto">
            <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2 pl-2">
              Menu da Sala
            </p>
            <button
              onClick={() => setAuditTab("auditoria")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${auditTab === "auditoria" ? "bg-[#f05e23]/10 text-[#f05e23]" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <ShieldCheck className="w-5 h-5" /> Auditoria & Selos
            </button>
            <button
              onClick={() => setAuditTab("editar")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${auditTab === "editar" ? "bg-[#f05e23]/10 text-[#f05e23]" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <FileText className="w-5 h-5" /> Editar Informações
            </button>
            <button
              onClick={() => setAuditTab("agenda")}
              className={`flex items-center gap-3 px-4 py-3 rounded-xl font-bold transition-all ${auditTab === "agenda" ? "bg-[#f05e23]/10 text-[#f05e23]" : "text-slate-500 hover:bg-slate-50"}`}
            >
              <CalendarIcon className="w-5 h-5" /> Gerenciar Agenda
            </button>
          </div>

          {/* Área de Conteúdo */}
          <div className="flex-1 overflow-y-auto p-8 bg-slate-50/50">
            <div className="max-w-4xl">
              {/* ABA 1: AUDITORIA */}
              {auditTab === "auditoria" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="grid grid-cols-2 gap-6">
                    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">
                        Mídia da Sala
                      </p>
                      <div className="w-full h-48 rounded-xl overflow-hidden bg-slate-100 border border-slate-100 relative">
                        <img
                          src={mainImage}
                          className="w-full h-full object-cover"
                          alt="Principal"
                        />
                        {evalImages.length > 1 && (
                          <div className="absolute bottom-2 right-2 bg-slate-900/80 text-white text-[10px] font-bold px-2 py-1 rounded backdrop-blur-md">
                            +{evalImages.length - 1} fotos
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="space-y-6">
                      <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3" /> Localização
                        </p>
                        <p className="font-bold text-slate-900">
                          {evalAddress.street || "Endereço Pendente"}
                        </p>
                        <p className="text-sm font-medium text-slate-500">
                          {evalAddress.city} - {evalAddress.state}
                        </p>
                      </div>
                      <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-sm">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1">
                          <User className="w-3 h-3" /> Anfitrião / Cadastro
                        </p>
                        <p className="font-bold text-slate-900">
                          {evaluatingRoom.profiles?.full_name}
                        </p>
                        <p className="text-sm font-medium text-slate-500">
                          Valor Base (Hora):{" "}
                          <strong className="text-[#f05e23]">
                            R$ {evalPricing.hourly || "0"}
                          </strong>
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                    <h3 className="text-lg font-black text-slate-900 mb-6">
                      Definir Categoria
                    </h3>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
                      {/* OPÇÃO START */}
                      <label
                        className={`flex flex-col gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedTier === "start" ? "border-blue-500 bg-blue-50/50" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                      >
                        <input
                          type="radio"
                          value="start"
                          checked={selectedTier === "start"}
                          onChange={() => setSelectedTier("start")}
                          className="sr-only"
                        />
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedTier === "start" ? "bg-blue-500 text-white" : "bg-slate-100 text-slate-400"}`}
                        >
                          <Shield className="w-5 h-5" />
                        </div>
                        <div>
                          <h4
                            className={`font-bold ${selectedTier === "start" ? "text-blue-900" : "text-slate-700"}`}
                          >
                            START
                          </h4>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            Salas padrão. Custo-benefício.
                          </p>
                        </div>
                      </label>

                      {/* OPÇÃO VIP */}
                      <label
                        className={`flex flex-col gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedTier === "vip" ? "border-purple-500 bg-purple-50/50" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                      >
                        <input
                          type="radio"
                          value="vip"
                          checked={selectedTier === "vip"}
                          onChange={() => setSelectedTier("vip")}
                          className="sr-only"
                        />
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedTier === "vip" ? "bg-purple-500 text-white" : "bg-slate-100 text-slate-400"}`}
                        >
                          <Star className="w-5 h-5" />
                        </div>
                        <div>
                          <h4
                            className={`font-bold ${selectedTier === "vip" ? "text-purple-900" : "text-slate-700"}`}
                          >
                            VIP
                          </h4>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            Ambientes diferenciados.
                          </p>
                        </div>
                      </label>

                      {/* OPÇÃO MASTER */}
                      <label
                        className={`flex flex-col gap-3 p-5 rounded-xl border-2 cursor-pointer transition-all ${selectedTier === "master" ? "border-amber-500 bg-amber-50/50" : "border-slate-100 hover:border-slate-200 bg-white"}`}
                      >
                        <input
                          type="radio"
                          value="master"
                          checked={selectedTier === "master"}
                          onChange={() => setSelectedTier("master")}
                          className="sr-only"
                        />
                        <div
                          className={`w-10 h-10 rounded-full flex items-center justify-center ${selectedTier === "master" ? "bg-amber-500 text-white" : "bg-slate-100 text-slate-400"}`}
                        >
                          <Crown className="w-5 h-5" />
                        </div>
                        <div>
                          <h4
                            className={`font-bold ${selectedTier === "master" ? "text-amber-900" : "text-slate-700"}`}
                          >
                            MASTER
                          </h4>
                          <p className="text-xs text-slate-500 font-medium mt-1">
                            Alto padrão e premium.
                          </p>
                        </div>
                      </label>
                    </div>

                    <div className="p-6 border border-orange-200 bg-orange-50/50 rounded-2xl mb-8 flex flex-col md:flex-row md:items-center justify-between gap-6">
                      <div className="flex items-start gap-4">
                        <div className="p-3 bg-white rounded-xl shadow-sm text-[#f05e23] shrink-0">
                          <Sparkles className="w-6 h-6" />
                        </div>
                        <div>
                          <h4 className="font-black text-slate-900 text-lg">
                            Selo Fusion Partner
                          </h4>
                          <p className="text-sm font-medium text-slate-600 mb-2">
                            Destacar esta sala como parceira oficial da
                            plataforma.
                          </p>
                          {isPartner ? (
                            <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold">
                              <CheckCircle2 className="w-3.5 h-3.5 mr-1" />{" "}
                              Locação "Por Hora" Liberada
                            </Badge>
                          ) : (
                            <Badge className="bg-amber-100 text-amber-800 border-0 font-bold">
                              <AlertTriangle className="w-3.5 h-3.5 mr-1" />{" "}
                              Apenas Turnos/Fixos
                            </Badge>
                          )}
                        </div>
                      </div>
                      <label className="relative inline-flex items-center cursor-pointer shrink-0">
                        <input
                          type="checkbox"
                          checked={isPartner}
                          onChange={(e) => setIsPartner(e.target.checked)}
                          className="sr-only peer"
                        />
                        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-[#f05e23]"></div>
                      </label>
                    </div>

                    <div className="flex gap-4">
                      {!evaluatingRoom.is_active && (
                        <Button
                          onClick={() => {
                            handleStatusChange(evaluatingRoom.id, false);
                            closeAuditPanel();
                          }}
                          disabled={actionLoading}
                          variant="outline"
                          className="h-14 px-8 text-red-600 hover:bg-red-50 border-red-200 font-bold text-base"
                        >
                          Reprovar Sala
                        </Button>
                      )}
                      <Button
                        onClick={handleSaveAudit}
                        disabled={actionLoading}
                        className="flex-1 h-14 bg-slate-900 hover:bg-slate-800 text-white font-bold text-base shadow-lg"
                      >
                        {actionLoading
                          ? "Salvando..."
                          : "Salvar Configurações de Auditoria"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 2: EDITAR DADOS */}
              {auditTab === "editar" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="bg-orange-50 border border-orange-200 p-5 rounded-xl flex gap-4">
                    <AlertTriangle className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="text-base font-black text-orange-900">
                        Modo de Edição Avançada
                      </h4>
                      <p className="text-sm font-medium text-orange-700 mt-1">
                        Você está alterando os dados originais do anfitrião
                        direto no banco de dados.
                      </p>
                    </div>
                  </div>
                  <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm space-y-6">
                    <div>
                      <label className="text-sm font-bold text-slate-700 mb-2 block">
                        Nome de Exibição da Sala
                      </label>
                      <Input
                        value={editForm.name}
                        onChange={(e) =>
                          setEditForm({ ...editForm, name: e.target.value })
                        }
                        className="bg-slate-50 border-slate-200 h-14 font-bold text-lg"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700 mb-2 block">
                        Descrição (Marketing)
                      </label>
                      <textarea
                        value={editForm.description}
                        onChange={(e) =>
                          setEditForm({
                            ...editForm,
                            description: e.target.value,
                          })
                        }
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl p-4 font-medium text-base min-h-[160px]"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-bold text-slate-700 mb-2 block">
                        Valor Base por Hora (R$)
                      </label>
                      <Input
                        type="number"
                        value={editForm.price}
                        onChange={(e) =>
                          setEditForm({ ...editForm, price: e.target.value })
                        }
                        className="bg-slate-50 border-slate-200 h-14 font-black text-lg max-w-xs"
                      />
                    </div>
                    <div className="pt-6 border-t border-slate-100 mt-8">
                      <Button
                        onClick={handleSaveInfoEdit}
                        disabled={actionLoading}
                        className="w-full h-14 bg-[#f05e23] hover:bg-[#d6521e] text-white font-black text-base shadow-lg"
                      >
                        {actionLoading ? (
                          "Salvando..."
                        ) : (
                          <>
                            <Save className="w-5 h-5 mr-2" /> Salvar Edições
                            Permanentemente
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </div>
              )}

              {/* ABA 3: GERENCIAR AGENDA */}
              {auditTab === "agenda" && (
                <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  <div className="flex items-start justify-between bg-white p-8 rounded-2xl border border-slate-200 shadow-sm">
                    <div>
                      <h3 className="text-xl font-black text-slate-900 mb-2 flex items-center gap-2">
                        <CalendarIcon className="w-6 h-6 text-[#f05e23]" />{" "}
                        Central de Reservas e Bloqueios
                      </h3>
                      <p className="text-sm font-medium text-slate-500 max-w-lg">
                        Clique nos dias no calendário para bloquear o uso
                        integral da sala. Dias vermelhos impedem qualquer
                        reserva médica.
                      </p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 text-center min-w-[140px]">
                      <p className="text-3xl font-black text-slate-900">
                        {blockedDates.length}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-1">
                        Dias Bloqueados
                      </p>
                    </div>
                  </div>

                  <div className="bg-white border border-slate-200 p-8 rounded-2xl shadow-sm">
                    {/* Controles do Mês */}
                    <div className="flex items-center justify-between mb-8">
                      <h3 className="text-2xl font-black text-slate-900 capitalize">
                        {format(currentMonth, "MMMM yyyy", { locale: ptBR })}
                      </h3>
                      <div className="flex gap-2">
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            setCurrentMonth(subMonths(currentMonth, 1))
                          }
                          className="h-10 w-10 rounded-xl border-slate-200 hover:bg-slate-50"
                        >
                          <ChevronLeft className="w-5 h-5" />
                        </Button>
                        <Button
                          variant="outline"
                          size="icon"
                          onClick={() =>
                            setCurrentMonth(addMonths(currentMonth, 1))
                          }
                          className="h-10 w-10 rounded-xl border-slate-200 hover:bg-slate-50"
                        >
                          <ChevronRight className="w-5 h-5" />
                        </Button>
                      </div>
                    </div>

                    {/* Calendário */}
                    {renderCalendar()}

                    <div className="mt-8 pt-6 border-t border-slate-100 flex justify-end">
                      <Button
                        onClick={handleSaveBlocks}
                        disabled={actionLoading}
                        className="bg-slate-900 hover:bg-slate-800 text-white font-bold h-14 px-8 text-base shadow-lg"
                      >
                        {actionLoading ? "Salvando..." : "Salvar Calendário"}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // SE NÃO ESTIVER AVALIANDO, RENDERIZA A LISTAGEM PADRÃO
  // ========================================================
  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 p-8 animate-in fade-in">
      {pendingRooms.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="bg-amber-500/10 px-6 py-4 border-b border-amber-200/50 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Clock className="w-5 h-5 text-amber-600" />
              <div>
                <h3 className="text-lg font-black text-amber-900">
                  Aguardando Aprovação
                </h3>
                <p className="text-xs font-medium text-amber-700/70">
                  Estas salas precisam da sua análise antes de irem para o ar.
                </p>
              </div>
            </div>
            <Badge className="bg-amber-500 text-white font-black">
              {pendingRooms.length} Pendentes
            </Badge>
          </div>
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-amber-500/5 text-amber-800/60 font-bold text-xs uppercase tracking-wider">
              <tr>
                <th className="px-6 py-3">Sala</th>
                <th className="px-6 py-3">Anfitrião</th>
                <th className="px-6 py-3 text-right">Ação Rápida</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-200/30">
              {pendingRooms.map((room) => (
                <tr key={room.id} className="hover:bg-white/50">
                  <td className="px-6 py-4 font-bold text-slate-800">
                    {room.name}
                  </td>
                  <td className="px-6 py-4 font-medium text-slate-600">
                    {room.profiles?.full_name}
                  </td>
                  <td className="px-6 py-4 flex items-center justify-end gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => openAuditPanel(room)}
                      className="h-8 text-slate-600 bg-white hover:bg-slate-100 border-slate-300"
                    >
                      <Eye className="w-4 h-4 mr-2" /> Analisar Sala
                    </Button>
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(room.id, true)}
                      className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar Direto
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              Listagem Completa de Salas
            </h3>
            <p className="text-xs font-medium text-slate-500">
              Gerencie todo o inventário da plataforma
            </p>
          </div>
          <div className="flex items-center gap-3">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
            >
              <option value="all">Todos os Status</option>
              <option value="active">Habilitadas</option>
              <option value="pending">Aguardando</option>
            </select>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar sala ou anfitrião..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 w-64 rounded-xl border-slate-200 bg-slate-50 font-medium"
              />
            </div>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Nome da Sala</th>
                <th className="px-6 py-4">Categoria</th>
                <th className="px-6 py-4">Valor Base</th>
                <th className="px-6 py-4">Anfitrião</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Gerenciar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRooms.map((room) => {
                let address = room.address_details || {};
                if (typeof address === "string") {
                  try {
                    address = JSON.parse(address);
                  } catch (e) {}
                }
                const basePrice =
                  address.pricing?.hourly || address.pricing?.morning || "N/A";
                return (
                  <tr
                    key={room.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{room.name}</p>
                      <p className="text-[10px] font-medium text-slate-400 mt-0.5">
                        {address.city || "S/ Localização"}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      {room.is_partner && (
                        <Badge className="bg-[#f05e23] text-white mr-2 text-[10px] uppercase border-0">
                          Partner
                        </Badge>
                      )}
                      <span className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                        {room.tier || "Start"}
                      </span>
                    </td>
                    <td className="px-6 py-4 font-bold text-slate-600">
                      {basePrice !== "N/A" ? `R$ ${basePrice}` : "--"}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {room.profiles?.full_name || "Desconhecido"}
                    </td>
                    <td className="px-6 py-4">
                      {room.is_active ? (
                        <Badge className="bg-emerald-100 text-emerald-700 font-bold border-0">
                          Habilitada
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 font-bold border-0">
                          Aguardando
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                      {/* O Botão de Engrenagem / Olho agora abre a TELA CHEIA */}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => openAuditPanel(room)}
                        className="h-8 w-8 text-blue-500 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {room.is_active ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(room.id, false)}
                          className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(room.id, true)}
                          className="h-8 w-8 text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                        >
                          <CheckCircle2 className="w-4 h-4" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleDelete(room.id)}
                        className="h-8 w-8 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
