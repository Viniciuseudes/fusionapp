import {
  TrendingUp,
  Calendar,
  DollarSign,
  MapPin,
  Star,
  Clock,
  Check,
  Building, // <-- Adicionado aqui!
} from "lucide-react";

interface HostOverviewProps {
  onNavigate: (view: string) => void;
}

export function HostOverview({ onNavigate }: HostOverviewProps) {
  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500">
      {/* Cabeçalho Mobile - Visível apenas no celular porque o desktop já tem a sidebar */}
      <div className="lg:hidden mb-6 flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-black text-slate-900">Visão Geral</h2>
          <p className="text-slate-500 text-sm font-medium">
            Resumo da sua operação
          </p>
        </div>
        <div className="w-10 h-10 bg-primary/10 text-primary rounded-full flex items-center justify-center font-bold">
          FC
        </div>
      </div>

      <div className="hidden lg:block mb-8">
        <h2 className="text-3xl font-black text-slate-900">
          Bem-vindo, Anfitrião!
        </h2>
        <p className="text-slate-500 text-lg">
          Aqui está o resumo do seu negócio hoje.
        </p>
      </div>

      {/* Cards de Estatísticas */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-emerald-500 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
              <DollarSign className="w-5 h-5 text-emerald-600" />
            </div>
            <TrendingUp className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl lg:text-3xl font-black text-slate-900">
            R$ 2.450
          </p>
          <p className="text-xs lg:text-sm font-bold text-slate-500">
            Receita Total
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-blue-500 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <Calendar className="w-5 h-5 text-blue-600" />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-slate-900">38</p>
          <p className="text-xs lg:text-sm font-bold text-slate-500">
            Reservas
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-primary transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center">
              <MapPin className="w-5 h-5 text-primary" />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-slate-900">3</p>
          <p className="text-xs lg:text-sm font-bold text-slate-500">
            Espaços Ativos
          </p>
        </div>

        <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 hover:border-amber-500 transition-colors">
          <div className="flex items-center justify-between mb-3">
            <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center">
              <Star className="w-5 h-5 text-amber-600" />
            </div>
          </div>
          <p className="text-2xl lg:text-3xl font-black text-slate-900">4.8</p>
          <p className="text-xs lg:text-sm font-bold text-slate-500">
            Avaliação Média
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Ações Rápidas */}
        <div>
          <h3 className="text-lg font-black text-slate-900 mb-4">
            Ações Rápidas
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <button
              onClick={() => onNavigate("availability")}
              className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-primary hover:shadow-md transition-all group"
            >
              <Clock className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-bold text-slate-900">Gerenciar Horários</p>
              <p className="text-xs text-slate-500 mt-1">Bloqueios e turnos</p>
            </button>
            <button
              onClick={() => onNavigate("spaces")}
              className="bg-white border border-slate-200 rounded-2xl p-6 text-left hover:border-primary hover:shadow-md transition-all group"
            >
              {/* <-- Corrigido para Building aqui --> */}
              <Building className="w-8 h-8 text-primary mb-3 group-hover:scale-110 transition-transform" />
              <p className="font-bold text-slate-900">Ver Minhas Salas</p>
              <p className="text-xs text-slate-500 mt-1">Adicionar ou editar</p>
            </button>
          </div>
        </div>

        {/* Atividade Recente */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-lg font-black text-slate-900">
              Atividade Recente
            </h3>
            <button className="text-sm font-bold text-primary hover:underline">
              Ver todas
            </button>
          </div>
          <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 shadow-sm">
            <div className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors rounded-t-2xl">
              <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center shrink-0">
                <Check className="w-5 h-5 text-emerald-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Nova reserva confirmada
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Sala Premium • Dr. João • Há 2h
                </p>
              </div>
            </div>
            <div className="p-4 flex items-center gap-4 hover:bg-slate-50 transition-colors rounded-b-2xl">
              <div className="w-10 h-10 bg-amber-100 rounded-full flex items-center justify-center shrink-0">
                <Clock className="w-5 h-5 text-amber-600" />
              </div>
              <div>
                <p className="text-sm font-bold text-slate-900">
                  Aguardando Avaliação
                </p>
                <p className="text-xs font-medium text-slate-500">
                  Sala de Conferência • Há 1d
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
