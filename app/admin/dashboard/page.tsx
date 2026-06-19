"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

// ==========================================
// COMPONENTE PRINCIPAL (LAYOUT DA PÁGINA)
// ==========================================
export default function AdminDashboardPage() {
  const [activeTab, setActiveTab] = useState("salas");

  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "especialistas", label: "Especialistas", icon: Users },
    { id: "parceiros", label: "Parceiros", icon: ShieldCheck },
    { id: "salas", label: "Gestão de Salas", icon: Building2 },
    { id: "agendamentos", label: "Agendamentos", icon: CalendarDays },
  ];

  return (
    <div className="flex h-screen bg-slate-50 overflow-hidden font-sans">
      {/* SIDEBAR ADMIN */}
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

      {/* ÁREA DE CONTEÚDO PRINCIPAL */}
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

        <div className="flex-1 overflow-y-auto p-8">
          {activeTab === "salas" && <AdminRoomsTab />}
          {activeTab !== "salas" && (
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
// MÓDULO: GESTÃO DE SALAS (Curadoria)
// ==========================================
function AdminRoomsTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [rooms, setRooms] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchRooms = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("rooms")
      .select(
        `
        id, name, is_active, is_paused, created_at,
        address_details,
        profiles:host_id (full_name)
      `,
      )
      .order("created_at", { ascending: false });

    if (error) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao carregar salas.",
      });
    } else {
      setRooms(data || []);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchRooms();
  }, [supabase, toast]);

  const handleStatusChange = async (roomId: string, newStatus: boolean) => {
    const { error } = await supabase
      .from("rooms")
      .update({ is_active: newStatus })
      .eq("id", roomId);
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível alterar o status.",
      });
    } else {
      toast({
        title: "Sucesso",
        description: `Sala ${newStatus ? "aprovada" : "reprovada"} com sucesso.`,
      });
      fetchRooms(); // Recarrega a lista
    }
  };

  const handleDelete = async (roomId: string) => {
    if (!confirm("Tem certeza que deseja excluir esta sala permanentemente?"))
      return;
    const { error } = await supabase.from("rooms").delete().eq("id", roomId);
    if (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao excluir.",
      });
    } else {
      toast({ title: "Excluída", description: "Sala removida da plataforma." });
      fetchRooms();
    }
  };

  // Separação Inteligente das Salas
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

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in">
      {/* SEÇÃO 1: ALERTA DE CURADORIA (Salas Aguardando Aprovação) */}
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
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white font-black">
              {pendingRooms.length} Pendentes
            </Badge>
          </div>

          <div className="p-0">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-amber-500/5 text-amber-800/60 font-bold text-xs uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-3">Nome da Sala</th>
                  <th className="px-6 py-3">Anfitrião</th>
                  <th className="px-6 py-3">Solicitada em</th>
                  <th className="px-6 py-3 text-right">Ação Rápida</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-200/30">
                {pendingRooms.map((room) => (
                  <tr
                    key={room.id}
                    className="hover:bg-white/50 transition-colors"
                  >
                    <td className="px-6 py-4 font-bold text-slate-800">
                      {room.name}
                    </td>
                    <td className="px-6 py-4 font-medium text-slate-600">
                      {room.profiles?.full_name || "Desconhecido"}
                    </td>
                    <td className="px-6 py-4 text-slate-500">
                      {format(new Date(room.created_at), "dd/MM/yyyy", {
                        locale: ptBR,
                      })}
                    </td>
                    <td className="px-6 py-4 flex items-center justify-end gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-slate-600 bg-white hover:bg-slate-100"
                      >
                        <Eye className="w-4 h-4 mr-2" /> Analisar
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleStatusChange(room.id, true)}
                        className="h-8 bg-emerald-500 hover:bg-emerald-600 text-white"
                      >
                        <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* SEÇÃO 2: LISTAGEM GERAL DE SALAS */}
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
              className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 focus:ring-2 focus:ring-[#f05e23]/20 focus:outline-none"
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
                className="h-10 pl-9 w-64 rounded-xl border-slate-200 bg-slate-50 focus-visible:ring-[#f05e23]/20 font-medium"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Nome da Sala</th>
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
                    <td className="px-6 py-4 font-bold text-slate-600">
                      {basePrice !== "N/A" ? `R$ ${basePrice}` : "--"}
                    </td>
                    <td className="px-6 py-4 text-slate-600 font-medium">
                      {room.profiles?.full_name || "Desconhecido"}
                    </td>
                    <td className="px-6 py-4">
                      {room.is_active ? (
                        <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-bold border-0">
                          Habilitada
                        </Badge>
                      ) : (
                        <Badge className="bg-slate-100 text-slate-600 hover:bg-slate-100 font-bold border-0">
                          Aguardando
                        </Badge>
                      )}
                    </td>
                    <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50"
                      >
                        <Eye className="w-4 h-4" />
                      </Button>
                      {room.is_active ? (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(room.id, false)}
                          title="Desabilitar Sala"
                          className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50"
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleStatusChange(room.id, true)}
                          title="Aprovar Sala"
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
              {filteredRooms.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-500 font-medium"
                  >
                    Nenhuma sala encontrada com esses filtros.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
