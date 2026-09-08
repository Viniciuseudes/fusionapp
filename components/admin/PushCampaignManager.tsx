"use client";

import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import {
  Loader2,
  Send,
  Megaphone,
  Target,
  Link as LinkIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function PushCampaignManager() {
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    title: "",
    message: "",
    url: "/", // O padrão é abrir na Home/Dashboard
    filterType: "all", // all, specialty, city
    filterValue: "",
  });

  const handleSendCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.title || !formData.message) {
      return toast({
        variant: "destructive",
        title: "Preencha título e mensagem.",
      });
    }

    setLoading(true);
    try {
      const response = await fetch("/api/admin/push-campaign", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData),
      });

      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast({
        title: "Campanha Enviada! 🚀",
        description: `Entregue para ${data.success} profissionais. (Falhas: ${data.failed})`,
      });

      setFormData({ ...formData, title: "", message: "", url: "/" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro no envio",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white p-6 md:p-8 rounded-[2rem] border border-slate-200 shadow-sm max-w-xl w-full">
      <div className="flex items-center gap-3 mb-6">
        <div className="w-12 h-12 rounded-2xl bg-indigo-50 flex items-center justify-center">
          <Megaphone className="w-6 h-6 text-indigo-600" />
        </div>
        <div>
          <h2 className="text-xl font-black text-slate-900">
            Campanhas Web Push
          </h2>
          <p className="text-sm font-medium text-slate-500">
            Envie notificações em tempo real para os celulares.
          </p>
        </div>
      </div>

      <form onSubmit={handleSendCampaign} className="space-y-5">
        <div className="space-y-2">
          <Label className="font-bold text-slate-700">
            Título da Notificação
          </Label>
          <Input
            required
            placeholder="Ex: Oferta Exclusiva para você!"
            value={formData.title}
            onChange={(e) =>
              setFormData({ ...formData, title: e.target.value })
            }
            className="h-12 bg-slate-50 border-slate-200 rounded-xl font-bold"
          />
        </div>

        <div className="space-y-2">
          <Label className="font-bold text-slate-700">Mensagem (Corpo)</Label>
          <Textarea
            required
            placeholder="Ex: Reserve hoje com 10% de desconto usando o cupom..."
            value={formData.message}
            onChange={(e) =>
              setFormData({ ...formData, message: e.target.value })
            }
            className="resize-none h-24 bg-slate-50 border-slate-200 rounded-xl"
          />
        </div>

        {/* NOVO CAMPO: DEEP LINKING (URL) */}
        <div className="space-y-2">
          <Label className="font-bold text-slate-700 flex items-center gap-1.5">
            <LinkIcon className="w-4 h-4 text-slate-400" /> Link de Destino
          </Label>
          <Input
            placeholder="Ex: /dashboard ou /profile"
            value={formData.url}
            onChange={(e) => setFormData({ ...formData, url: e.target.value })}
            className="h-12 bg-slate-50 border-slate-200 rounded-xl text-slate-600 font-medium"
          />
          <p className="text-[11px] text-slate-500 font-medium mt-1">
            Para onde o aplicativo deve ir quando o usuário clicar na
            notificação? (Padrão: <b>/</b>)
          </p>
        </div>

        <div className="p-5 bg-slate-50 rounded-2xl border border-slate-100 space-y-4 mt-2">
          <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-2">
            <Target className="w-4 h-4" /> Segmentação de Público
          </h3>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label className="text-xs font-bold text-slate-600">
                Disparar para
              </Label>
              <select
                value={formData.filterType}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    filterType: e.target.value,
                    filterValue: "",
                  })
                }
                className="w-full h-12 bg-white border border-slate-200 rounded-xl px-3 outline-none font-bold text-slate-700 text-sm"
              >
                <option value="all">Todos os Profissionais</option>
                <option value="specialty">Por Especialidade</option>
                <option value="city">Por Cidade</option>
              </select>
            </div>

            {formData.filterType !== "all" && (
              <div className="space-y-2 animate-in fade-in zoom-in-95">
                <Label className="text-xs font-bold text-slate-600">
                  Qual{" "}
                  {formData.filterType === "specialty"
                    ? "Especialidade"
                    : "Cidade"}
                  ?
                </Label>
                <Input
                  required
                  placeholder={
                    formData.filterType === "specialty"
                      ? "Ex: Psicologia"
                      : "Ex: Natal"
                  }
                  value={formData.filterValue}
                  onChange={(e) =>
                    setFormData({ ...formData, filterValue: e.target.value })
                  }
                  className="h-12 bg-white border-slate-200 rounded-xl text-sm"
                />
              </div>
            )}
          </div>
        </div>

        <Button
          type="submit"
          disabled={loading}
          className="w-full h-14 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl shadow-lg shadow-indigo-600/20 text-base mt-4"
        >
          {loading ? (
            <Loader2 className="w-5 h-5 animate-spin" />
          ) : (
            <>
              <Send className="w-5 h-5 mr-2" /> Disparar Campanha
            </>
          )}
        </Button>
      </form>
    </div>
  );
}
