"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import {
  Ticket,
  Plus,
  Percent,
  Banknote,
  Gift,
  Users,
  CalendarClock,
  CheckCircle2,
  XCircle,
  Eye,
  Loader2,
  Trash2,
  ArrowLeft,
  Search,
  UserCheck,
  Building2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

export function AdminCouponsTab() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [coupons, setCoupons] = useState<any[]>([]);
  const [rooms, setRooms] = useState<any[]>([]);
  const [roomSearch, setRoomSearch] = useState(""); // <-- NOVO: Estado para busca de salas
  const [view, setView] = useState<"list" | "create" | "details">("list");

  // Para a visão detalhada de quem usou
  const [selectedCoupon, setSelectedCoupon] = useState<any | null>(null);
  const [couponUses, setCouponUses] = useState<any[]>([]);

  // Formulário de Criação
  const [isAllRooms, setIsAllRooms] = useState(true);
  const [formData, setFormData] = useState({
    code: "",
    type: "percentage", // percentage, fixed, bogo
    discount_value: "",
    max_uses: "",
    valid_until: "",
    affiliate_id: "",
    valid_room_ids: [] as string[],
  });

  const [profSearch, setProfSearch] = useState("");
  const [professionals, setProfessionals] = useState<any[]>([]);
  const [selectedAffiliate, setSelectedAffiliate] = useState<any | null>(null);

  useEffect(() => {
    fetchCoupons();
    loadRooms();
  }, []);

  const fetchCoupons = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coupons")
      .select(
        `
        *,
        profiles:affiliate_id (full_name)
      `,
      )
      .order("created_at", { ascending: false });

    if (!error) setCoupons(data || []);
    setLoading(false);
  };

  const loadRooms = async () => {
    // SÊNIOR: Agora buscamos também o nome do anfitrião fazendo um JOIN na tabela profiles!
    const { data, error } = await supabase
      .from("rooms")
      .select("id, name, tier, profiles:host_id(full_name)")
      .eq("is_active", true)
      .order("name");

    if (!error) setRooms(data || []);
  };

  const loadProfessionals = async (searchStr: string) => {
    if (searchStr.length < 3) return;
    const { data } = await supabase
      .from("profiles")
      .select("id, full_name, email")
      .ilike("full_name", `%${searchStr}%`)
      .limit(5);
    setProfessionals(data || []);
  };

  const loadCouponUses = async (couponId: string) => {
    setActionLoading(true);
    const { data, error } = await supabase
      .from("coupon_uses")
      .select(
        `
        *,
        profiles:user_id (full_name, email)
      `,
      )
      .eq("coupon_id", couponId)
      .order("used_at", { ascending: false });

    if (!error) setCouponUses(data || []);
    setActionLoading(false);
  };

  const handleCreateCoupon = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.code)
      return toast({ variant: "destructive", title: "Código obrigatório." });
    if (!isAllRooms && formData.valid_room_ids.length === 0) {
      return toast({
        variant: "destructive",
        title: "Selecione ao menos uma sala.",
      });
    }

    setActionLoading(true);
    try {
      const { error } = await supabase.from("coupons").insert({
        code: formData.code.toUpperCase().replace(/\s/g, ""),
        type: formData.type,
        discount_value:
          formData.type === "bogo" ? 0 : Number(formData.discount_value),
        max_uses: formData.max_uses ? Number(formData.max_uses) : null,
        valid_until: formData.valid_until
          ? new Date(`${formData.valid_until}T23:59:59`).toISOString()
          : null,
        affiliate_id: selectedAffiliate ? selectedAffiliate.id : null,
        valid_room_ids: isAllRooms ? null : formData.valid_room_ids,
        is_active: true,
      });

      if (error) throw error;

      toast({ title: "Cupom Criado com Sucesso! 🎟️" });
      setView("list");
      fetchCoupons();
      setFormData({
        code: "",
        type: "percentage",
        discount_value: "",
        max_uses: "",
        valid_until: "",
        affiliate_id: "",
        valid_room_ids: [],
      });
      setSelectedAffiliate(null);
      setIsAllRooms(true);
      setRoomSearch(""); // Limpa a busca de salas
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

  const handleToggleRoom = (roomId: string) => {
    setFormData((prev) => {
      const isSelected = prev.valid_room_ids.includes(roomId);
      if (isSelected) {
        return {
          ...prev,
          valid_room_ids: prev.valid_room_ids.filter((id) => id !== roomId),
        };
      } else {
        return { ...prev, valid_room_ids: [...prev.valid_room_ids, roomId] };
      }
    });
  };

  const handleToggleStatus = async (id: string, currentStatus: boolean) => {
    const { error } = await supabase
      .from("coupons")
      .update({ is_active: !currentStatus })
      .eq("id", id);
    if (!error) fetchCoupons();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Excluir este cupom permanentemente?")) return;
    const { error } = await supabase.from("coupons").delete().eq("id", id);
    if (!error) {
      toast({ title: "Cupom Excluído" });
      fetchCoupons();
    }
  };

  const openDetails = (coupon: any) => {
    setSelectedCoupon(coupon);
    loadCouponUses(coupon.id);
    setView("details");
  };

  const getTypeDisplay = (type: string, value: number) => {
    if (type === "percentage")
      return (
        <Badge className="bg-blue-100 text-blue-700 border-0">
          <Percent className="w-3 h-3 mr-1" /> {value}% OFF
        </Badge>
      );
    if (type === "fixed")
      return (
        <Badge className="bg-emerald-100 text-emerald-700 border-0">
          <Banknote className="w-3 h-3 mr-1" /> R$ {value} OFF
        </Badge>
      );
    if (type === "bogo")
      return (
        <Badge className="bg-purple-100 text-purple-700 border-0">
          <Gift className="w-3 h-3 mr-1" /> Compre 1 Leve 2
        </Badge>
      );
    return null;
  };

  // Lógica de filtro para a busca de salas (SÊNIOR: Filtra por nome da sala OU nome do anfitrião)
  const filteredRooms = rooms.filter((room) => {
    const searchLower = roomSearch.toLowerCase();
    const matchName = room.name?.toLowerCase().includes(searchLower);
    const matchHost = room.profiles?.full_name
      ?.toLowerCase()
      .includes(searchLower);
    return matchName || matchHost;
  });

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
      </div>
    );

  // VISÃO 1: CRIAR CUPOM
  if (view === "create") {
    return (
      <div className="p-8 max-w-4xl mx-auto animate-in fade-in">
        <Button
          variant="ghost"
          onClick={() => setView("list")}
          className="mb-6 text-slate-500 font-bold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para lista
        </Button>

        <div className="bg-white border border-slate-200 rounded-[2rem] p-8 shadow-sm">
          <div className="flex items-center gap-3 mb-8 border-b border-slate-100 pb-6">
            <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
              <Ticket className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900">
                Novo Cupom Promocional
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Configure regras, limites e comissionamento de afiliados.
              </p>
            </div>
          </div>

          <form onSubmit={handleCreateCoupon} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">
                  Código do Cupom
                </Label>
                <Input
                  required
                  placeholder="Ex: BLACKFRIDAY20"
                  value={formData.code}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      code: e.target.value.toUpperCase().replace(/\s/g, ""),
                    })
                  }
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl font-black text-lg tracking-widest uppercase"
                />
              </div>

              <div className="space-y-2">
                <Label className="font-bold text-slate-700">
                  Tipo de Oferta
                </Label>
                <select
                  value={formData.type}
                  onChange={(e) =>
                    setFormData({ ...formData, type: e.target.value })
                  }
                  className="w-full h-12 bg-slate-50 border border-slate-200 rounded-xl px-3 outline-none font-bold text-slate-700"
                >
                  <option value="percentage">
                    Desconto em Porcentagem (%)
                  </option>
                  <option value="fixed">Desconto Fixo (R$ / CR)</option>
                  <option value="bogo">Compre 1 Hora, Leve 2 (BOGO)</option>
                </select>
              </div>

              {formData.type !== "bogo" && (
                <div className="space-y-2 animate-in fade-in">
                  <Label className="font-bold text-slate-700">
                    Valor do Desconto
                  </Label>
                  <Input
                    required
                    type="number"
                    placeholder={
                      formData.type === "percentage" ? "Ex: 10" : "Ex: 50"
                    }
                    value={formData.discount_value}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        discount_value: e.target.value,
                      })
                    }
                    className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="font-bold text-slate-700">
                  Limite Total de Usos (Opcional)
                </Label>
                <Input
                  type="number"
                  placeholder="Ex: 100 (Deixe vazio para ilimitado)"
                  value={formData.max_uses}
                  onChange={(e) =>
                    setFormData({ ...formData, max_uses: e.target.value })
                  }
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl font-medium"
                />
              </div>

              <div className="space-y-2 md:col-span-2">
                <Label className="font-bold text-slate-700">
                  Data de Expiração (Opcional)
                </Label>
                <Input
                  type="date"
                  value={formData.valid_until}
                  onChange={(e) =>
                    setFormData({ ...formData, valid_until: e.target.value })
                  }
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl font-medium text-slate-600 w-full md:w-1/2"
                />
              </div>
            </div>

            {/* SESSÃO DE LIMITAÇÃO POR SALAS COM BUSCA SÊNIOR */}
            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
              <div className="flex items-start justify-between">
                <div>
                  <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                    <Building2 className="w-4 h-4" /> Limitar por Salas
                  </h3>
                  <p className="text-sm font-medium text-slate-500 mt-1">
                    Este cupom será válido em quais ambientes?
                  </p>
                </div>
              </div>

              <div className="flex gap-4 mb-4">
                <label
                  className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${isAllRooms ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 bg-white"}`}
                >
                  <input
                    type="radio"
                    checked={isAllRooms}
                    onChange={() => {
                      setIsAllRooms(true);
                      setFormData({ ...formData, valid_room_ids: [] });
                      setRoomSearch("");
                    }}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <div>
                    <p
                      className={`font-bold ${isAllRooms ? "text-indigo-900" : "text-slate-700"}`}
                    >
                      Todas as Salas
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      Válido em qualquer reserva.
                    </p>
                  </div>
                </label>

                <label
                  className={`flex-1 flex items-center gap-3 p-4 rounded-xl border-2 cursor-pointer transition-all ${!isAllRooms ? "border-indigo-600 bg-indigo-50/50" : "border-slate-200 bg-white"}`}
                >
                  <input
                    type="radio"
                    checked={!isAllRooms}
                    onChange={() => setIsAllRooms(false)}
                    className="w-4 h-4 text-indigo-600"
                  />
                  <div>
                    <p
                      className={`font-bold ${!isAllRooms ? "text-indigo-900" : "text-slate-700"}`}
                    >
                      Salas Específicas
                    </p>
                    <p className="text-xs text-slate-500 font-medium">
                      Restringir uso a ambientes selecionados.
                    </p>
                  </div>
                </label>
              </div>

              {!isAllRooms && (
                <div className="space-y-3 animate-in fade-in zoom-in-95">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                    <Input
                      placeholder="Buscar por nome da sala ou anfitrião..."
                      value={roomSearch}
                      onChange={(e) => setRoomSearch(e.target.value)}
                      className="h-10 pl-9 bg-white border-slate-200 rounded-xl text-sm"
                    />
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-60 overflow-y-auto p-4 bg-white border border-slate-200 rounded-xl shadow-inner">
                    {filteredRooms.length === 0 ? (
                      <p className="text-sm text-slate-500 col-span-2 text-center py-4">
                        Nenhuma sala encontrada para esta busca.
                      </p>
                    ) : (
                      filteredRooms.map((room) => (
                        <label
                          key={room.id}
                          className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${formData.valid_room_ids.includes(room.id) ? "bg-indigo-50 border-indigo-200" : "bg-slate-50 border-slate-100 hover:bg-slate-100"}`}
                        >
                          <input
                            type="checkbox"
                            checked={formData.valid_room_ids.includes(room.id)}
                            onChange={() => handleToggleRoom(room.id)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                          />
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-bold text-slate-900 truncate">
                              {room.name}
                            </p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest truncate">
                              {room.tier} •{" "}
                              {room.profiles?.full_name || "Sem Anfitrião"}
                            </p>
                          </div>
                        </label>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="p-6 bg-slate-50 rounded-2xl border border-slate-100 space-y-4">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
                <Users className="w-4 h-4" /> Vínculo de Afiliado /
                Influenciador (Opcional)
              </h3>

              {!selectedAffiliate ? (
                <div className="relative">
                  <Search className="absolute left-3 top-3.5 w-4 h-4 text-slate-400" />
                  <Input
                    placeholder="Buscar profissional cadastrado..."
                    value={profSearch}
                    onChange={(e) => {
                      setProfSearch(e.target.value);
                      loadProfessionals(e.target.value);
                    }}
                    className="h-12 pl-10 bg-white border-slate-200 rounded-xl z-10 relative"
                  />
                  {professionals.length > 0 && profSearch.length > 2 && (
                    <div className="absolute z-50 w-full mt-2 bg-white border border-slate-200 rounded-xl shadow-xl overflow-hidden">
                      {professionals.map((p) => (
                        <div
                          key={p.id}
                          onClick={() => {
                            setSelectedAffiliate(p);
                            setProfSearch("");
                            setProfessionals([]);
                          }}
                          className="p-3 hover:bg-slate-50 cursor-pointer border-b border-slate-100 flex justify-between"
                        >
                          <span className="font-bold text-slate-900 text-sm">
                            {p.full_name}
                          </span>
                          <span className="text-xs text-slate-500">
                            {p.email}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between bg-white border border-indigo-100 p-4 rounded-xl shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-indigo-50 rounded-full flex items-center justify-center">
                      <UserCheck className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <p className="font-bold text-indigo-900 text-sm">
                        Afiliado: {selectedAffiliate.full_name}
                      </p>
                      <p className="text-xs font-medium text-indigo-700">
                        Todas as reservas feitas com este cupom serão rastreadas
                        para ele.
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAffiliate(null)}
                    className="text-xs font-bold text-red-500 hover:underline"
                  >
                    Remover
                  </button>
                </div>
              )}
            </div>

            <Button
              disabled={actionLoading}
              type="submit"
              className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 text-base"
            >
              {actionLoading ? (
                <Loader2 className="w-5 h-5 animate-spin" />
              ) : (
                "Gerar Cupom Oficial"
              )}
            </Button>
          </form>
        </div>
      </div>
    );
  }

  // VISÃO 2: DETALHES E RELATÓRIO DE USO
  if (view === "details" && selectedCoupon) {
    const isExpired =
      selectedCoupon.valid_until &&
      new Date(selectedCoupon.valid_until) < new Date();
    const isEsgotado =
      selectedCoupon.max_uses &&
      selectedCoupon.current_uses >= selectedCoupon.max_uses;

    return (
      <div className="p-8 max-w-5xl mx-auto animate-in fade-in">
        <Button
          variant="ghost"
          onClick={() => setView("list")}
          className="mb-6 text-slate-500 font-bold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para lista
        </Button>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <div className="md:col-span-2 bg-slate-900 text-white p-8 rounded-[2rem] shadow-lg relative overflow-hidden">
            <div className="absolute -right-10 -top-10 opacity-10">
              <Ticket className="w-64 h-64" />
            </div>
            <div className="relative z-10">
              <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                Relatório do Cupom
              </p>
              <h2 className="text-4xl font-black tracking-widest mb-4">
                {selectedCoupon.code}
              </h2>
              <div className="flex gap-3">
                {getTypeDisplay(
                  selectedCoupon.type,
                  selectedCoupon.discount_value,
                )}
                <Badge className="bg-white/10 text-white border-0">
                  {selectedCoupon.current_uses}{" "}
                  {selectedCoupon.max_uses
                    ? `/ ${selectedCoupon.max_uses}`
                    : ""}{" "}
                  Usos
                </Badge>
              </div>
              {selectedCoupon.valid_room_ids &&
                selectedCoupon.valid_room_ids.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-white/10">
                    <p className="text-xs font-bold text-indigo-300 flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5" /> Restrito a{" "}
                      {selectedCoupon.valid_room_ids.length} sala(s)
                      específica(s)
                    </p>
                  </div>
                )}
            </div>
          </div>

          <div className="bg-white border border-slate-200 p-8 rounded-[2rem] shadow-sm flex flex-col justify-center">
            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">
              Afiliado / Parceiro
            </p>
            <h3 className="text-lg font-black text-slate-900 leading-tight">
              {selectedCoupon.profiles?.full_name ||
                "Cupom Institucional (Fusion)"}
            </h3>
            <p className="text-xs font-bold text-slate-500 mt-2 flex items-center gap-1.5">
              <CalendarClock className="w-4 h-4" />
              {selectedCoupon.valid_until
                ? `Válido até ${format(parseISO(selectedCoupon.valid_until), "dd/MM/yyyy")}`
                : "Validade Vitalícia"}
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100">
            <h3 className="text-lg font-black text-slate-900">
              Histórico de Uso
            </h3>
            <p className="text-xs font-medium text-slate-500">
              Rastreabilidade completa de reservas que utilizaram este código.
            </p>
          </div>

          {actionLoading ? (
            <div className="p-12 flex justify-center">
              <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
            </div>
          ) : couponUses.length === 0 ? (
            <div className="p-12 text-center text-slate-500 font-medium">
              Nenhum uso registrado ainda.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm whitespace-nowrap">
                <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                  <tr>
                    <th className="px-6 py-4">Data do Uso</th>
                    <th className="px-6 py-4">Profissional (Quem Usou)</th>
                    <th className="px-6 py-4">Desconto Aplicado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {couponUses.map((use) => (
                    <tr
                      key={use.id}
                      className="hover:bg-slate-50 transition-colors"
                    >
                      <td className="px-6 py-4 font-medium text-slate-600">
                        {format(parseISO(use.used_at), "dd/MM/yyyy 'às' HH:mm")}
                      </td>
                      <td className="px-6 py-4">
                        <p className="font-bold text-slate-900">
                          {use.profiles?.full_name}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {use.profiles?.email}
                        </p>
                      </td>
                      <td className="px-6 py-4 font-black text-emerald-600">
                        {use.discount_applied}{" "}
                        {selectedCoupon.type === "fixed" ? "CR / R$" : ""}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  }

  // VISÃO PRINCIPAL: LISTAGEM
  return (
    <div className="p-8 max-w-7xl mx-auto animate-in fade-in">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Ticket className="w-7 h-7 text-[#BF4B24]" /> Gestão de Cupons
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Motor promocional, controle de salas permitidas e afiliados.
          </p>
        </div>
        <Button
          onClick={() => setView("create")}
          className="h-12 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl shadow-lg"
        >
          <Plus className="w-5 h-5 mr-2" /> Novo Cupom
        </Button>
      </div>

      <div className="bg-white border border-slate-200 rounded-[2rem] shadow-sm overflow-hidden">
        {coupons.length === 0 ? (
          <div className="text-center py-20 flex flex-col items-center">
            <div className="w-20 h-20 bg-slate-50 rounded-full flex items-center justify-center mb-4">
              <Ticket className="w-10 h-10 text-slate-300" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">
              Nenhum cupom ativo
            </h3>
            <p className="text-slate-500 font-medium max-w-sm mb-8">
              Crie ofertas restritas por sala ou ilimitadas para alavancar
              reservas.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm whitespace-nowrap">
              <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
                <tr>
                  <th className="px-6 py-4">Código</th>
                  <th className="px-6 py-4">Regra</th>
                  <th className="px-6 py-4">Performance (Usos)</th>
                  <th className="px-6 py-4">Afiliado</th>
                  <th className="px-6 py-4">Status</th>
                  <th className="px-6 py-4 text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {coupons.map((coupon) => {
                  const isExpired =
                    coupon.valid_until &&
                    new Date(coupon.valid_until) < new Date();
                  const isEsgotado =
                    coupon.max_uses && coupon.current_uses >= coupon.max_uses;

                  return (
                    <tr
                      key={coupon.id}
                      className="hover:bg-slate-50/80 transition-colors group"
                    >
                      <td className="px-6 py-4">
                        <span className="font-black text-slate-900 tracking-wider text-base">
                          {coupon.code}
                        </span>
                      </td>
                      <td className="px-6 py-4">
                        {getTypeDisplay(coupon.type, coupon.discount_value)}
                        {coupon.valid_room_ids &&
                          coupon.valid_room_ids.length > 0 && (
                            <div className="text-[10px] text-indigo-500 font-bold mt-1">
                              Salas Específicas
                            </div>
                          )}
                      </td>
                      <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                          <div className="w-full bg-slate-100 rounded-full h-2 max-w-[80px]">
                            <div
                              className="bg-indigo-500 h-2 rounded-full"
                              style={{
                                width: coupon.max_uses
                                  ? `${(coupon.current_uses / coupon.max_uses) * 100}%`
                                  : "100%",
                              }}
                            />
                          </div>
                          <span className="text-xs font-bold text-slate-600">
                            {coupon.current_uses}{" "}
                            {coupon.max_uses ? `/ ${coupon.max_uses}` : ""}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4 text-xs font-bold text-slate-500">
                        {coupon.profiles?.full_name || "--"}
                      </td>
                      <td className="px-6 py-4">
                        {isExpired ? (
                          <Badge className="bg-red-50 text-red-600 border-red-200">
                            Expirado
                          </Badge>
                        ) : isEsgotado ? (
                          <Badge className="bg-amber-50 text-amber-600 border-amber-200">
                            Esgotado
                          </Badge>
                        ) : coupon.is_active ? (
                          <Badge className="bg-emerald-50 text-emerald-600 border-emerald-200">
                            Ativo
                          </Badge>
                        ) : (
                          <Badge className="bg-slate-100 text-slate-500 border-slate-200">
                            Pausado
                          </Badge>
                        )}
                      </td>
                      <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-50 group-hover:opacity-100 transition-opacity">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => openDetails(coupon)}
                          className="h-8 w-8 text-blue-500 hover:text-blue-700 hover:bg-blue-50"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() =>
                            handleToggleStatus(coupon.id, coupon.is_active)
                          }
                          className={`h-8 w-8 ${coupon.is_active ? "text-amber-500 hover:bg-amber-50" : "text-emerald-500 hover:bg-emerald-50"}`}
                        >
                          {coupon.is_active ? (
                            <XCircle className="w-4 h-4" />
                          ) : (
                            <CheckCircle2 className="w-4 h-4" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleDelete(coupon.id)}
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
        )}
      </div>
    </div>
  );
}
