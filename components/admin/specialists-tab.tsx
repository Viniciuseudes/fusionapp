"use client";

import { useState, useEffect, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  UserCheck,
  FileText,
  Phone,
  Award,
  Loader2,
  Filter,
  CheckCircle2,
  AlertTriangle,
  Coins,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";

export function AdminSpecialistsTab() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [specialists, setSpecialists] = useState<any[]>([]);
  const [search, setSearch] = useState("");
  const [specialtyFilter, setSpecialtyFilter] = useState("all");

  const fetchSpecialists = async () => {
    setLoading(true);
    try {
      // Busca todos os perfis que possuem dados profissionais preenchidos ou role de profissional
      const { data, error } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;

      // Filtra no client-side para garantir que estamos listando profissionais da saúde
      const filteredData = (data || []).filter(
        (p: any) => p.role === "professional" || p.council || p.specialty,
      );

      setSpecialists(filteredData);
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Erro de Carregamento",
        description: "Não foi possível carregar a lista de especialistas.",
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSpecialists();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Extrai todas as especialidades únicas para alimentar o filtro dinâmico
  const uniqueSpecialties: string[] = useMemo(() => {
    const specs = new Set(
      specialists.map((s: any) => s.specialty).filter(Boolean),
    );
    return ["all", ...Array.from(specs as Set<string>)];
  }, [specialists]);

  // Filtros combinados (Busca textual + Dropdown de especialidade)
  const filteredSpecialists = specialists.filter((s: any) => {
    const matchesSearch =
      s.full_name?.toLowerCase().includes(search.toLowerCase()) ||
      s.council_number?.includes(search) ||
      s.phone?.includes(search);

    const matchesSpecialty =
      specialtyFilter === "all" ? true : s.specialty === specialtyFilter;

    return matchesSearch && matchesSpecialty;
  });

  // Métricas inteligentes para o topo do painel
  const metrics = useMemo(() => {
    const total = specialists.length;
    // Consideramos pendente quem tem conselho cadastrado mas não foi validado (exemplo de regra de negócio)
    const pending = specialists.filter((s: any) => !s.asaas_customer_id).length;
    const verified = total - pending;
    return { total, pending, verified };
  }, [specialists]);

  if (loading) {
    return (
      <div className="flex justify-center items-center py-24">
        <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-7xl mx-auto pb-12 animate-in fade-in duration-300">
      {/* CARD DE MÉTRICAS OPERACIONAIS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-slate-100 flex items-center justify-center text-slate-700">
            <Award className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              Total de Especialistas
            </p>
            <h3 className="text-2xl font-black text-slate-900 mt-0.5">
              {metrics.total}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
            <CheckCircle2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              Contas Integradas (Asaas)
            </p>
            <h3 className="text-2xl font-black text-emerald-600 mt-0.5">
              {metrics.verified}
            </h3>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-amber-50 flex items-center justify-center text-amber-600">
            <AlertTriangle className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-500 uppercase tracking-wider">
              Aguardando Integração
            </p>
            <h3 className="text-2xl font-black text-amber-600 mt-0.5">
              {metrics.pending}
            </h3>
          </div>
        </div>
      </div>

      {/* BARRA DE FILTROS E PESQUISA */}
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-6 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-lg font-black text-slate-900">
              Profissionais da Saúde
            </h3>
            <p className="text-xs font-medium text-slate-500">
              Monitore cadastros, conselhos regionais e dados de faturamento
            </p>
          </div>

          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 h-10">
              <Filter className="w-4 h-4 text-slate-400" />
              <select
                value={specialtyFilter}
                onChange={(e) => setSpecialtyFilter(e.target.value)}
                className="bg-transparent text-sm font-bold text-slate-700 outline-none cursor-pointer"
              >
                <option value="all">Todas as Especialidades</option>
                {uniqueSpecialties
                  .filter((s: string) => s !== "all")
                  .map((spec: string) => (
                    <option key={spec} value={spec}>
                      {spec}
                    </option>
                  ))}
              </select>
            </div>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar por nome, conselho..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 w-64 rounded-xl border-slate-200 bg-slate-50 font-medium focus-visible:ring-[#f05e23]/20"
              />
            </div>
          </div>
        </div>

        {/* TABELA DE DADOS */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[11px] uppercase tracking-wider">
              <tr>
                <th className="px-6 py-4">Nome do Especialista</th>
                <th className="px-6 py-4">Conselho / Registro</th>
                <th className="px-6 py-4">Contato</th>
                <th className="px-6 py-4">ID Asaas</th>
                <th className="px-6 py-4 text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSpecialists.map((spec: any) => (
                <tr
                  key={spec.id}
                  className="hover:bg-slate-50/50 transition-colors group"
                >
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-9 w-9 rounded-full bg-slate-900 text-white font-black text-xs flex items-center justify-center">
                        {spec.full_name
                          ? spec.full_name.substring(0, 2).toUpperCase()
                          : "DR"}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">
                          {spec.full_name || "Sem nome cadastrado"}
                        </p>
                        <p className="text-[11px] font-semibold text-[#f05e23]">
                          {spec.specialty || "Clínica Geral"}
                        </p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-1.5">
                      <FileText className="w-4 h-4 text-slate-400" />
                      <span className="font-bold text-slate-700 uppercase">
                        {spec.council || "CRM"}
                      </span>
                      <span className="text-slate-500 font-medium">
                        nº {spec.council_number || "---"}
                      </span>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-0.5 text-xs font-semibold text-slate-600">
                      <div className="flex items-center gap-1">
                        <Phone className="w-3 h-3 text-slate-400" />
                        <span>{spec.phone || "Sem telefone"}</span>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    {spec.asaas_customer_id ? (
                      <Badge className="bg-blue-50 text-blue-700 hover:bg-blue-50 border-0 font-bold font-mono text-[11px]">
                        {spec.asaas_customer_id}
                      </Badge>
                    ) : (
                      <Badge className="bg-amber-50 text-amber-700 hover:bg-amber-50 border-0 font-bold">
                        Pendente
                      </Badge>
                    )}
                  </td>
                  <td className="px-6 py-4 flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Auditar Carteira / Transações"
                      className="h-8 w-8 text-slate-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg"
                    >
                      <Coins className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      title="Visualizar Cadastro Completo"
                      className="h-8 w-8 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg"
                    >
                      <UserCheck className="w-4 h-4" />
                    </Button>
                  </td>
                </tr>
              ))}
              {filteredSpecialists.length === 0 && (
                <tr>
                  <td
                    colSpan={5}
                    className="px-6 py-12 text-center text-slate-400 font-medium"
                  >
                    Nenhum especialista encontrado com os filtros atuais.
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
