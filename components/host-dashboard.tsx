"use client";

import { useState } from "react";
import Image from "next/image";
import {
  TrendingUp,
  Clock,
  CalendarCheck,
  DollarSign,
  Plus,
  Settings2,
  Star,
  MessageSquare,
  AlertCircle,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

type HostTab = "resumo" | "salas" | "agenda" | "financeiro" | "avaliacoes";

export function HostDashboard() {
  const [activeTab, setActiveTab] = useState<HostTab>("resumo");
  const [isAddingRoom, setIsAddingRoom] = useState(false);

  return (
    <div className="flex flex-col min-h-screen bg-slate-50 pb-24 lg:pb-0">
      {/* Header do Anfitrião */}
      <header className="bg-slate-900 px-4 pt-8 pb-6 lg:px-8 lg:pt-10 rounded-b-[2rem] shadow-lg sticky top-0 z-30">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <div>
            <span className="inline-block bg-primary/20 text-primary font-bold text-[10px] uppercase tracking-wider px-2 py-1 rounded-md mb-2">
              Modo Anfitrião
            </span>
            <h1 className="text-2xl font-black text-white">
              Painel da Clínica
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <div className="text-right hidden sm:block">
              <p className="text-xs text-slate-400 font-medium uppercase tracking-wider">
                A receber (Hoje)
              </p>
              <p className="text-lg font-black text-emerald-400">R$ 450,00</p>
            </div>
            <div className="h-10 w-10 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center">
              <Settings2 className="w-5 h-5 text-slate-300" />
            </div>
          </div>
        </div>

        {/* Navegação Interna do Anfitrião */}
        <div className="max-w-5xl mx-auto mt-6 flex gap-2 overflow-x-auto scrollbar-hide snap-x">
          {[
            { id: "resumo", label: "Visão Geral" },
            { id: "salas", label: "Minhas Salas" },
            { id: "agenda", label: "Agenda" },
            { id: "financeiro", label: "Receitas" },
            { id: "avaliacoes", label: "Avaliações" },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => {
                setActiveTab(tab.id as HostTab);
                setIsAddingRoom(false);
              }}
              className={`snap-start whitespace-nowrap px-4 py-2 rounded-xl text-sm font-bold transition-all ${
                activeTab === tab.id
                  ? "bg-primary text-primary-foreground shadow-md"
                  : "bg-slate-800/50 text-slate-400 hover:text-white"
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* Área de Conteúdo */}
      <main className="flex-1 max-w-5xl mx-auto w-full p-4 lg:p-8">
        {/* === ABA: VISÃO GERAL === */}
        {activeTab === "resumo" && !isAddingRoom && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                title="Receita Líquida"
                value="R$ 4.250"
                subtitle="Já descontado o split"
                icon={DollarSign}
                color="text-emerald-500"
                bg="bg-emerald-100"
              />
              <StatCard
                title="Horas Alugadas"
                value="124h"
                subtitle="Neste mês"
                icon={Clock}
                color="text-blue-500"
                bg="bg-blue-100"
              />
              <StatCard
                title="Reservas"
                value="38"
                subtitle="5 pendentes hoje"
                icon={CalendarCheck}
                color="text-purple-500"
                bg="bg-purple-100"
              />
              <StatCard
                title="Ocupação Média"
                value="68%"
                subtitle="+12% que mês passado"
                icon={TrendingUp}
                color="text-amber-500"
                bg="bg-amber-100"
              />
            </div>

            <h2 className="text-lg font-black text-slate-900 mt-8 mb-4">
              Próximos Atendimentos (Hoje)
            </h2>
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-2">
              <BookingRow
                time="14:00 - 15:00"
                doctor="Dr. Carlos (Psiquiatria)"
                room="Sala Premium 01"
                status="Confirmado"
              />
              <div className="h-px bg-slate-100 mx-4" />
              <BookingRow
                time="15:30 - 18:30"
                doctor="Dra. Ana (Nutrição)"
                room="Consultório Padrão"
                status="Turno"
              />
            </div>
          </div>
        )}

        {/* === ABA: MINHAS SALAS === */}
        {activeTab === "salas" && !isAddingRoom && (
          <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-black text-slate-900">
                Gerenciar Espaços
              </h2>
              <Button
                onClick={() => setIsAddingRoom(true)}
                className="bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-md"
              >
                <Plus className="w-4 h-4 mr-2" /> Nova Sala
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Sala Aprovada */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row">
                <div className="h-32 sm:h-auto sm:w-40 relative bg-slate-100">
                  <Image
                    src="/images/room-consultorio.jpg"
                    alt="Sala"
                    fill
                    className="object-cover"
                  />
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-slate-900">
                        Sala Premium 01
                      </h3>
                      <span className="flex items-center text-[10px] font-bold text-emerald-600 bg-emerald-100 px-2 py-1 rounded-md">
                        <CheckCircle2 className="w-3 h-3 mr-1" /> Ativa
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium mb-3">
                      Modalidades ativas:
                    </p>
                    <div className="flex gap-2">
                      <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
                        Hora: R$ 60
                      </span>
                      <span className="text-xs font-bold bg-slate-100 text-slate-600 px-2 py-1 rounded-md">
                        Turno: R$ 200
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs font-bold h-8 rounded-lg"
                    >
                      Editar
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="w-full text-xs font-bold h-8 rounded-lg text-red-600 hover:text-red-700 hover:bg-red-50"
                    >
                      Pausar
                    </Button>
                  </div>
                </div>
              </div>

              {/* Sala Em Análise (A Curadoria do Admin!) */}
              <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden flex flex-col sm:flex-row opacity-80">
                <div className="h-32 sm:h-auto sm:w-40 relative bg-slate-200 flex items-center justify-center">
                  <p className="text-xs text-slate-400 font-bold">Sem foto</p>
                </div>
                <div className="p-4 flex-1 flex flex-col justify-between">
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-bold text-slate-900">
                        Sala de Reunião
                      </h3>
                      <span className="flex items-center text-[10px] font-bold text-amber-600 bg-amber-100 px-2 py-1 rounded-md">
                        <AlertCircle className="w-3 h-3 mr-1" /> Em Análise
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 font-medium leading-tight">
                      Aguardando aprovação da Fusion Clinic para ir ao ar.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* === TELA: ADICIONAR NOVA SALA (Com Modalidades) === */}
        {isAddingRoom && (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 md:p-8 animate-in zoom-in-95 duration-300">
            <div className="flex items-center justify-between mb-6 border-b border-slate-100 pb-4">
              <h2 className="text-xl font-black text-slate-900">
                Cadastrar Novo Espaço
              </h2>
              <Button
                variant="ghost"
                onClick={() => setIsAddingRoom(false)}
                className="text-slate-500"
              >
                Cancelar
              </Button>
            </div>

            <div className="space-y-6">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Nome da Sala</Label>
                <Input
                  placeholder="Ex: Consultório de Psicologia 02"
                  className="h-12 rounded-xl bg-slate-50"
                />
              </div>

              <div className="space-y-3">
                <Label className="font-bold text-slate-700">
                  Modalidades de Aluguel permitidas
                </Label>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Modalidade: Por Hora */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 relative">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="font-bold">Avulso (Por Hora)</Label>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-primary"
                        defaultChecked
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-sm">
                        R$
                      </span>
                      <Input
                        type="number"
                        placeholder="45,00"
                        className="pl-9 bg-white"
                      />
                    </div>
                  </div>

                  {/* Modalidade: Por Turno */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 relative">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="font-bold">Por Turno (4h)</Label>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-primary"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-sm">
                        R$
                      </span>
                      <Input
                        type="number"
                        placeholder="150,00"
                        className="pl-9 bg-white"
                        disabled
                      />
                    </div>
                  </div>

                  {/* Modalidade: Mensal/Fixo */}
                  <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 relative">
                    <div className="flex items-center justify-between mb-3">
                      <Label className="font-bold">Fixo Mensal</Label>
                      <input
                        type="checkbox"
                        className="w-4 h-4 rounded text-primary"
                      />
                    </div>
                    <div className="relative">
                      <span className="absolute left-3 top-2.5 text-slate-500 font-bold text-sm">
                        R$
                      </span>
                      <Input
                        type="number"
                        placeholder="1.200,00"
                        className="pl-9 bg-white"
                        disabled
                      />
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-blue-50 text-blue-800 p-4 rounded-xl text-sm font-medium flex gap-3 items-start">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <p>
                  Ao salvar, esta sala será enviada para a equipe da Fusion
                  Clinic avaliar. Você será notificado assim que ela for
                  aprovada e aparecer na vitrine.
                </p>
              </div>

              <Button className="w-full h-12 bg-primary hover:bg-primary/90 text-white font-black rounded-xl text-lg shadow-md">
                Enviar para Avaliação
              </Button>
            </div>
          </div>
        )}

        {/* MENSAGEM TEMPORÁRIA PARA AS OUTRAS ABAS */}
        {(activeTab === "agenda" ||
          activeTab === "financeiro" ||
          activeTab === "avaliacoes") &&
          !isAddingRoom && (
            <div className="flex flex-col items-center justify-center py-20 text-center animate-in fade-in">
              <div className="w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Settings2 className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-black text-slate-900 mb-2">
                Módulo em Desenvolvimento
              </h3>
              <p className="text-slate-500 font-medium max-w-sm">
                Esta área de gestão de {tabNames[activeTab]} será ativada na
                próxima fase da plataforma.
              </p>
            </div>
          )}
      </main>
    </div>
  );
}

// Sub-componentes para limpar o código principal
const tabNames = {
  agenda: "horários",
  financeiro: "receitas e repasses",
  avaliacoes: "comentários e notas",
};

function StatCard({ title, value, subtitle, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-white p-4 rounded-2xl border border-slate-200 shadow-sm flex flex-col justify-between">
      <div className="flex justify-between items-start mb-2">
        <div className={`p-2 rounded-xl ${bg}`}>
          <Icon className={`w-5 h-5 ${color}`} />
        </div>
      </div>
      <div>
        <p className="text-2xl font-black text-slate-900">{value}</p>
        <p className="text-sm font-bold text-slate-700">{title}</p>
        <p className="text-xs font-medium text-slate-400 mt-1">{subtitle}</p>
      </div>
    </div>
  );
}

function BookingRow({ time, doctor, room, status }: any) {
  return (
    <div className="flex items-center justify-between p-3 hover:bg-slate-50 rounded-xl transition-colors">
      <div className="flex items-center gap-3">
        <div className="bg-slate-100 text-slate-700 font-black text-sm px-3 py-1.5 rounded-lg border border-slate-200">
          {time}
        </div>
        <div>
          <p className="font-bold text-slate-900 text-sm">{doctor}</p>
          <p className="text-xs font-medium text-slate-500">{room}</p>
        </div>
      </div>
      <span className="hidden sm:inline-block text-xs font-bold bg-emerald-100 text-emerald-700 px-2 py-1 rounded-md">
        {status}
      </span>
    </div>
  );
}
