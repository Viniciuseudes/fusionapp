"use client";

import { useState, useEffect, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Tags,
  Save,
  Shield,
  Star,
  Crown,
  Loader2,
  TrendingUp,
  AlertTriangle,
  DatabaseZap,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

interface PackageRow {
  id: string;
  tier: "start" | "vip" | "master";
  hours: number;
  price: string | number; // Mudamos para aceitar string e permitir a digitação fluida
}

export function PackagesAdminTab() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [packages, setPackages] = useState<PackageRow[]>([]);

  const fetchPackages = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("packages")
        .select("*")
        .eq("active", true)
        .order("hours", { ascending: true });

      if (error) throw error;
      setPackages(data as PackageRow[]);
    } catch (err) {
      console.error("Erro ao buscar pacotes:", err);
      toast({
        variant: "destructive",
        title: "Erro de Conexão",
        description: "Não conseguimos ler a tabela de pacotes.",
      });
    } finally {
      setLoading(false);
    }
  }, [supabase, toast]);

  useEffect(() => {
    fetchPackages();
  }, [fetchPackages]);

  // Atualização de estado local sem forçar conversão imediata para Number (evita travar o input)
  const handlePriceChange = (id: string, newPrice: string) => {
    setPackages((prev) =>
      prev.map((pkg) => (pkg.id === id ? { ...pkg, price: newPrice } : pkg)),
    );
  };

  // Salva no Supabase
  const handleSaveChanges = async () => {
    setSaving(true);
    try {
      const updates = packages.map((pkg) =>
        supabase
          .from("packages")
          .update({ price: Number(pkg.price) }) // Converte para número só na hora de salvar
          .eq("id", pkg.id),
      );

      await Promise.all(updates);

      toast({
        title: "Tabela de Preços Atualizada! 🚀",
        description:
          "Os novos valores já estão ativos na carteira dos médicos.",
      });
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: "Tente novamente.",
      });
    } finally {
      setSaving(false);
    }
  };

  // BOTÃO DE RESGATE: Injeta os pacotes iniciais caso o banco esteja vazio
  const handleAutoSeed = async () => {
    setLoading(true);
    try {
      const defaultPkgs = [
        { tier: "start", hours: 8, price: 260 },
        { tier: "start", hours: 16, price: 499 },
        { tier: "start", hours: 20, price: 559 },
        { tier: "vip", hours: 8, price: 329 },
        { tier: "vip", hours: 16, price: 619 },
        { tier: "vip", hours: 20, price: 699 },
        { tier: "master", hours: 8, price: 449 },
        { tier: "master", hours: 16, price: 849 },
        { tier: "master", hours: 20, price: 949 },
      ];

      const { error } = await supabase.from("packages").insert(defaultPkgs);
      if (error) throw error;

      toast({
        title: "Sucesso!",
        description: "Pacotes base injetados no sistema.",
      });
      await fetchPackages();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao criar",
        description: error.message,
      });
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  // TELA DE ERRO: Caso a tabela esteja vazia ou não exista
  if (packages.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-20 text-center animate-in fade-in">
        <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
          <AlertTriangle className="w-10 h-10 text-red-500" />
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">
          Tabela de Pacotes Vazia
        </h2>
        <p className="text-slate-500 font-medium mb-8 leading-relaxed">
          O sistema não encontrou nenhum pacote cadastrado no banco de dados.
          Você pode injetar a estrutura padrão de precificação com apenas um
          clique.
        </p>
        <Button
          onClick={handleAutoSeed}
          className="h-14 px-8 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black shadow-lg flex items-center gap-2 mx-auto"
        >
          <DatabaseZap className="w-5 h-5" /> Gerar Precificação Padrão
        </Button>
      </div>
    );
  }

  const startPackages = packages.filter((p) => p.tier === "start");
  const vipPackages = packages.filter((p) => p.tier === "vip");
  const masterPackages = packages.filter((p) => p.tier === "master");

  return (
    <div className="max-w-5xl mx-auto animate-in fade-in pb-24 p-8 md:p-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h2 className="text-3xl font-black text-slate-900 flex items-center gap-3 tracking-tight">
            <Tags className="w-8 h-8 text-[#f05e23]" /> Precificação de Pacotes
          </h2>
          <p className="text-sm font-medium text-slate-500 mt-2">
            Altere os valores dos pacotes em tempo real para campanhas e
            promoções.
          </p>
        </div>

        <Button
          onClick={handleSaveChanges}
          disabled={saving}
          className="h-12 px-6 rounded-xl font-black bg-emerald-600 hover:bg-emerald-700 text-white shadow-lg shadow-emerald-500/20 transition-all flex items-center gap-2 shrink-0"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Save className="w-4 h-4" />
          )}
          Salvar Preços
        </Button>
      </div>

      <div className="bg-orange-50 border border-orange-100 rounded-2xl p-5 mb-8 flex items-start gap-4 shadow-sm">
        <TrendingUp className="w-6 h-6 text-orange-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-base font-black text-orange-900">
            Estratégia de Conversão (CRO)
          </p>
          <p className="text-sm font-medium text-orange-800/80 mt-1 leading-relaxed">
            Mantenha a opção do meio (16h) com a melhor percepção de
            custo-benefício. Isso cria ancoragem cognitiva e faz a opção de 8h
            parecer cara, forçando um Upsell natural.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* CARD START */}
        <div className="bg-white rounded-3xl border border-slate-200 shadow-sm overflow-hidden flex flex-col hover:shadow-md transition-shadow">
          <div className="bg-slate-50 p-6 flex items-center gap-3 border-b border-slate-100">
            <div className="w-12 h-12 rounded-2xl bg-white border border-slate-200 flex items-center justify-center shrink-0 shadow-sm">
              <Shield className="w-6 h-6 text-slate-600" />
            </div>
            <div>
              <h3 className="font-black text-slate-900 text-lg">
                Essencial Start
              </h3>
              <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">
                Plano Base
              </p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {startPackages.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between">
                <span className="font-black text-slate-700">
                  {pkg.hours} Horas
                </span>
                <div className="relative w-36">
                  <span className="absolute left-4 top-3.5 text-sm font-bold text-slate-400">
                    R$
                  </span>
                  <Input
                    type="number"
                    value={pkg.price}
                    onChange={(e) => handlePriceChange(pkg.id, e.target.value)}
                    className="h-12 pl-11 rounded-xl border-slate-200 bg-slate-50 font-black text-slate-900 text-lg focus-visible:ring-slate-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CARD VIP */}
        <div className="bg-white rounded-3xl border border-indigo-100 shadow-sm overflow-hidden flex flex-col relative hover:shadow-md transition-shadow">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-indigo-500" />
          <div className="bg-indigo-50/50 p-6 flex items-center gap-3 border-b border-indigo-50">
            <div className="w-12 h-12 rounded-2xl bg-white border border-indigo-100 flex items-center justify-center shrink-0 shadow-sm">
              <Star className="w-6 h-6 text-indigo-600" />
            </div>
            <div>
              <h3 className="font-black text-indigo-950 text-lg">
                Experiência VIP
              </h3>
              <p className="text-xs font-bold text-indigo-600 uppercase tracking-widest">
                Mais Vendidos
              </p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {vipPackages.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between">
                <span className="font-black text-slate-700">
                  {pkg.hours} Horas
                </span>
                <div className="relative w-36">
                  <span className="absolute left-4 top-3.5 text-sm font-bold text-slate-400">
                    R$
                  </span>
                  <Input
                    type="number"
                    value={pkg.price}
                    onChange={(e) => handlePriceChange(pkg.id, e.target.value)}
                    className="h-12 pl-11 rounded-xl border-slate-200 bg-slate-50 font-black text-slate-900 text-lg focus-visible:ring-indigo-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* CARD MASTER */}
        <div className="bg-white rounded-3xl border border-amber-100 shadow-sm overflow-hidden flex flex-col relative hover:shadow-md transition-shadow">
          <div className="absolute top-0 left-0 w-full h-1.5 bg-amber-500" />
          <div className="bg-amber-50/50 p-6 flex items-center gap-3 border-b border-amber-50">
            <div className="w-12 h-12 rounded-2xl bg-white border border-amber-100 flex items-center justify-center shrink-0 shadow-sm">
              <Crown className="w-6 h-6 text-amber-600" />
            </div>
            <div>
              <h3 className="font-black text-amber-950 text-lg">
                Coleção Master
              </h3>
              <p className="text-xs font-bold text-amber-600 uppercase tracking-widest">
                Alto Padrão
              </p>
            </div>
          </div>
          <div className="p-6 space-y-5">
            {masterPackages.map((pkg) => (
              <div key={pkg.id} className="flex items-center justify-between">
                <span className="font-black text-slate-700">
                  {pkg.hours} Horas
                </span>
                <div className="relative w-36">
                  <span className="absolute left-4 top-3.5 text-sm font-bold text-slate-400">
                    R$
                  </span>
                  <Input
                    type="number"
                    value={pkg.price}
                    onChange={(e) => handlePriceChange(pkg.id, e.target.value)}
                    className="h-12 pl-11 rounded-xl border-slate-200 bg-slate-50 font-black text-slate-900 text-lg focus-visible:ring-amber-500"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
