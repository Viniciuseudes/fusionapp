"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  CheckCircle2,
  XCircle,
  Eye,
  Trash2,
  Loader2,
  Clock,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function AdminRoomsTab() {
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
      fetchRooms();
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

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in">
      {/* ALERTA DE CURADORIA */}
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
                  Análise as salas antes de irem para o ar.
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
                <th className="px-6 py-3">Nome da Sala</th>
                <th className="px-6 py-3">Anfitrião</th>
                <th className="px-6 py-3">Data</th>
                <th className="px-6 py-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-amber-200/30">
              {pendingRooms.map((room) => (
                <tr key={room.id} className="hover:bg-white/50">
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
                  <td className="px-6 py-4 flex justify-end gap-2">
                    <Button
                      size="sm"
                      onClick={() => handleStatusChange(room.id, true)}
                      className="bg-emerald-500 hover:bg-emerald-600 text-white"
                    >
                      <CheckCircle2 className="w-4 h-4 mr-1" /> Aprovar
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* LISTAGEM COMPLETA */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              Listagem Completa
            </h3>
            <p className="text-xs text-slate-500">Inventário da plataforma</p>
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
                placeholder="Buscar sala..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 w-64 rounded-xl bg-slate-50"
              />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Nome da Sala</th>
                <th className="px-6 py-4">Status</th>
                <th className="px-6 py-4 text-right">Gerenciar</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredRooms.map((room) => (
                <tr key={room.id} className="hover:bg-slate-50/80 group">
                  <td className="px-6 py-4 font-bold text-slate-900">
                    {room.name}
                  </td>
                  <td className="px-6 py-4">
                    {room.is_active ? (
                      <Badge className="bg-emerald-100 text-emerald-700">
                        Habilitada
                      </Badge>
                    ) : (
                      <Badge className="bg-slate-100 text-slate-600">
                        Aguardando
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 flex justify-end gap-2 opacity-0 group-hover:opacity-100">
                    {room.is_active ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStatusChange(room.id, false)}
                        className="text-slate-400 hover:text-amber-600"
                      >
                        <XCircle className="w-4 h-4" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleStatusChange(room.id, true)}
                        className="text-slate-400 hover:text-emerald-600"
                      >
                        <CheckCircle2 className="w-4 h-4" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(room.id)}
                      className="text-slate-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
