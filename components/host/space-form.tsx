import { useState } from "react";
import {
  ChevronLeft,
  Upload,
  X,
  MapPin,
  Users,
  DollarSign,
  Wifi,
  Monitor,
  Coffee,
  Car,
  AirVent,
  Shield,
  Check,
  Info,
  Layers,
  Clock,
  Calendar,
  Briefcase,
  Phone,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

interface HostSpaceFormProps {
  onBack: () => void;
  isEditing?: boolean;
}

const amenitiesList = [
  { id: "wifi", icon: Wifi, label: "Wi-Fi Alta Velocidade" },
  { id: "monitor", icon: Monitor, label: "TV / Monitor" },
  { id: "coffee", icon: Coffee, label: "Café e Água" },
  { id: "ac", icon: AirVent, label: "Ar Condicionado" },
  { id: "parking", icon: Car, label: "Estacionamento" },
  { id: "security", icon: Shield, label: "Recepção / Segurança" },
];

// Categorias oficiais da plataforma (Ligadas ao sistema de Créditos)
const platformCategories = [
  {
    id: "standard",
    name: "Standard",
    description: "Consultórios básicos e funcionais.",
    suggestedPrice: 45,
  },
  {
    id: "premium",
    name: "Premium",
    description: "Alto padrão, macas e decoração fina.",
    suggestedPrice: 60,
  },
  {
    id: "master",
    name: "Master",
    description: "Salas amplas, reuniões ou grupos.",
    suggestedPrice: 80,
  },
];

export function HostSpaceForm({
  onBack,
  isEditing = false,
}: HostSpaceFormProps) {
  const [images, setImages] = useState<string[]>([]);
  const [selectedAmenities, setSelectedAmenities] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>("premium");

  // Controle de Modalidades (Liga/Desliga)
  const [modalities, setModalities] = useState({
    hourly: true,
    shift: true,
    daily: false,
    monthly: false,
  });

  const toggleAmenity = (id: string) => {
    setSelectedAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const toggleModality = (key: keyof typeof modalities) => {
    setModalities((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-4xl mx-auto w-full pb-32">
      {/* Header */}
      <div className="flex items-center gap-4 mb-6">
        <button
          onClick={onBack}
          className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center hover:bg-slate-50 transition-colors shadow-sm"
        >
          <ChevronLeft className="w-5 h-5 text-slate-700" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            {isEditing ? "Editar Espaço" : "Cadastrar Novo Espaço"}
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Configure a sua sala para o catálogo da Fusion Clinic.
          </p>
        </div>
      </div>

      <div className="space-y-6">
        {/* ======================================= */}
        {/* FOTOS */}
        {/* ======================================= */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 mb-4">
            Fotos do Espaço
          </h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-2">
            {images.map((img, i) => (
              <div
                key={i}
                className="relative aspect-square rounded-xl bg-slate-100 border border-slate-200"
              >
                <button className="absolute top-2 right-2 w-6 h-6 bg-red-500 text-white rounded-full flex items-center justify-center shadow-md">
                  <X className="w-4 h-4" />
                </button>
              </div>
            ))}
            <button className="aspect-square rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 flex flex-col items-center justify-center text-slate-500 hover:border-primary hover:text-primary transition-colors">
              <Upload className="w-6 h-6 mb-2" />
              <span className="text-xs font-bold">Adicionar Foto</span>
            </button>
          </div>
          <p className="text-xs text-slate-500 font-medium">
            <Info className="inline w-3 h-3 mr-1" /> Adicione fotos nítidas e
            bem iluminadas. A primeira foto será a capa.
          </p>
        </section>

        {/* ======================================= */}
        {/* DADOS BÁSICOS & CATEGORIA DA PLATAFORMA */}
        {/* ======================================= */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <h2 className="text-lg font-black text-slate-900">
            Informações Básicas
          </h2>

          <div className="space-y-2">
            <Label className="font-bold text-slate-700">Nome da Sala *</Label>
            <Input
              placeholder="Ex: Consultório de Psicanálise 01"
              className="h-11 rounded-xl bg-slate-50"
            />
          </div>

          <div className="space-y-3">
            <Label className="font-bold text-slate-700">
              Categoria na Plataforma (Créditos) *
            </Label>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {platformCategories.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`p-4 rounded-xl border-2 text-left transition-all ${
                    selectedCategory === cat.id
                      ? "border-primary bg-primary/5 shadow-sm"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex justify-between items-center mb-1">
                    <span
                      className={`font-black ${selectedCategory === cat.id ? "text-primary" : "text-slate-900"}`}
                    >
                      {cat.name}
                    </span>
                    {selectedCategory === cat.id && (
                      <Check className="w-5 h-5 text-primary" />
                    )}
                  </div>
                  <p className="text-xs font-medium text-slate-500 mb-3 leading-relaxed">
                    {cat.description}
                  </p>
                  <span className="inline-block bg-slate-100 text-slate-600 text-[10px] font-bold px-2 py-1 rounded-md">
                    Sugestão: R$ {cat.suggestedPrice}/h
                  </span>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500 font-medium flex items-center gap-1 mt-2">
              <Info className="w-3.5 h-3.5" /> A categoria define como a sua
              sala aparece para os médicos que compram pacotes de horas.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 pt-2">
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                Especialidade Principal (Filtro)
              </Label>
              <Input
                placeholder="Ex: Psicologia, Nutrição..."
                className="h-11 rounded-xl bg-slate-50"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                Capacidade Máxima
              </Label>
              <div className="relative">
                <Users className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  type="number"
                  placeholder="Ex: 4 pessoas"
                  className="pl-10 h-11 rounded-xl bg-slate-50"
                />
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <Label className="font-bold text-slate-700">
              Descrição Detalhada *
            </Label>
            <Textarea
              placeholder="Descreva a infraestrutura, diferenciais e o ambiente da sua sala..."
              className="rounded-xl bg-slate-50 min-h-[100px]"
            />
          </div>
        </section>

        {/* ======================================= */}
        {/* NOVA SECÇÃO: LOCALIZAÇÃO E CONTATO */}
        {/* ======================================= */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <h2 className="text-lg font-black text-slate-900">
            Localização e Contato
          </h2>

          <div className="space-y-4">
            <div>
              <Label className="font-bold text-slate-700">
                Endereço da Clínica / Sala *
              </Label>
              <div className="relative mt-2">
                <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                <Input
                  placeholder="Ex: Av. Prudente de Morais, Tirol - Edifício Medical Center"
                  className="pl-10 h-11 rounded-xl bg-slate-50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Número *</Label>
                <Input
                  placeholder="Ex: 1000"
                  className="h-11 rounded-xl bg-slate-50"
                />
              </div>
              <div className="space-y-2">
                <Label className="font-bold text-slate-700">Sala/Andar *</Label>
                <Input
                  placeholder="Ex: Sala 402"
                  className="h-11 rounded-xl bg-slate-50"
                />
              </div>
              <div className="space-y-2 md:col-span-2">
                <Label className="font-bold text-slate-700">
                  Bairro / Cidade *
                </Label>
                <Input
                  placeholder="Ex: Tirol, Natal - RN"
                  className="h-11 rounded-xl bg-slate-50"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-100">
              <h3 className="font-bold text-slate-800 mb-4">
                Contato do Responsável pela Sala
              </h3>
              <p className="text-xs text-slate-500 mb-4 -mt-2">
                Quem o médico deve procurar ou ligar em caso de imprevistos na
                chegada.
              </p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">
                    Nome do Responsável *
                  </Label>
                  <div className="relative">
                    <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      placeholder="Ex: Maria (Recepção) ou Dr. Silva"
                      className="pl-10 h-11 rounded-xl bg-slate-50"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">
                    Telefone / WhatsApp *
                  </Label>
                  <div className="relative">
                    <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      placeholder="Ex: (84) 99999-9999"
                      className="pl-10 h-11 rounded-xl bg-slate-50"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ======================================= */}
        {/* MODALIDADES & PRECIFICAÇÃO DINÂMICA */}
        {/* ======================================= */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm space-y-6">
          <div>
            <h2 className="text-lg font-black text-slate-900 mb-1">
              Modalidades de Locação & Preços
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              Ative apenas as formas como deseja alugar esta sala.
            </p>
          </div>

          {/* 1. POR HORA AVULSA */}
          <div
            className={`border-2 rounded-xl transition-all overflow-hidden ${modalities.hourly ? "border-primary/40 bg-white" : "border-slate-200 bg-slate-50"}`}
          >
            <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${modalities.hourly ? "bg-primary/20 text-primary" : "bg-slate-200 text-slate-400"}`}
                >
                  <Clock className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className={`font-bold ${modalities.hourly ? "text-slate-900" : "text-slate-500"}`}
                  >
                    Locação Avulsa (Por Hora)
                  </h3>
                  <p className="text-xs text-slate-500">
                    Permite reservas de 1h ou mais.
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleModality("hourly")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${modalities.hourly ? "bg-primary" : "bg-slate-300"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${modalities.hourly ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
            {modalities.hourly && (
              <div className="p-4 bg-white flex items-center gap-4 animate-in slide-in-from-top-2">
                <div className="flex-1">
                  <Label className="font-bold text-slate-700 mb-1 block">
                    Valor por Hora (R$)
                  </Label>
                  <div className="relative max-w-xs">
                    <DollarSign className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <Input
                      type="number"
                      placeholder="Ex: 60"
                      className="pl-10 h-11 rounded-xl bg-slate-50 text-lg font-black text-primary border-slate-200"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* 2. POR TURNO */}
          <div
            className={`border-2 rounded-xl transition-all overflow-hidden ${modalities.shift ? "border-primary/40 bg-white" : "border-slate-200 bg-slate-50"}`}
          >
            <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${modalities.shift ? "bg-primary/20 text-primary" : "bg-slate-200 text-slate-400"}`}
                >
                  <Layers className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className={`font-bold ${modalities.shift ? "text-slate-900" : "text-slate-500"}`}
                  >
                    Pacote por Turnos
                  </h3>
                  <p className="text-xs text-slate-500">
                    Blocos de 4 a 6 horas com desconto.
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleModality("shift")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${modalities.shift ? "bg-primary" : "bg-slate-300"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${modalities.shift ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
            {modalities.shift && (
              <div className="p-4 bg-white grid grid-cols-1 md:grid-cols-3 gap-4 animate-in slide-in-from-top-2">
                <div>
                  <Label className="font-bold text-slate-700 mb-1 block">
                    Manhã (08h-12h)
                  </Label>
                  <Input
                    type="number"
                    placeholder="R$ 150,00"
                    className="h-11 rounded-xl bg-slate-50"
                  />
                </div>
                <div>
                  <Label className="font-bold text-slate-700 mb-1 block">
                    Tarde (13h-18h)
                  </Label>
                  <Input
                    type="number"
                    placeholder="R$ 180,00"
                    className="h-11 rounded-xl bg-slate-50"
                  />
                </div>
                <div>
                  <Label className="font-bold text-slate-700 mb-1 block">
                    Noite (18h-22h)
                  </Label>
                  <Input
                    type="number"
                    placeholder="R$ 160,00"
                    className="h-11 rounded-xl bg-slate-50"
                  />
                </div>
              </div>
            )}
          </div>

          {/* 3. DIÁRIA COMPLETA */}
          <div
            className={`border-2 rounded-xl transition-all overflow-hidden ${modalities.daily ? "border-primary/40 bg-white" : "border-slate-200 bg-slate-50"}`}
          >
            <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${modalities.daily ? "bg-primary/20 text-primary" : "bg-slate-200 text-slate-400"}`}
                >
                  <Calendar className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className={`font-bold ${modalities.daily ? "text-slate-900" : "text-slate-500"}`}
                  >
                    Diária Completa
                  </h3>
                  <p className="text-xs text-slate-500">
                    Permite alugar o dia todo (Ex: 08h às 18h).
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleModality("daily")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${modalities.daily ? "bg-primary" : "bg-slate-300"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${modalities.daily ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
            {modalities.daily && (
              <div className="p-4 bg-white animate-in slide-in-from-top-2">
                <Label className="font-bold text-slate-700 mb-1 block">
                  Valor da Diária (R$)
                </Label>
                <Input
                  type="number"
                  placeholder="Ex: 350,00"
                  className="max-w-xs h-11 rounded-xl bg-slate-50"
                />
              </div>
            )}
          </div>

          {/* 4. MENSAL (FIXO) */}
          <div
            className={`border-2 rounded-xl transition-all overflow-hidden ${modalities.monthly ? "border-primary/40 bg-white" : "border-slate-200 bg-slate-50"}`}
          >
            <div className="p-4 flex items-center justify-between border-b border-slate-100 bg-slate-50/50">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-lg flex items-center justify-center ${modalities.monthly ? "bg-primary/20 text-primary" : "bg-slate-200 text-slate-400"}`}
                >
                  <Briefcase className="w-5 h-5" />
                </div>
                <div>
                  <h3
                    className={`font-bold ${modalities.monthly ? "text-slate-900" : "text-slate-500"}`}
                  >
                    Locação Fixa / Mensal
                  </h3>
                  <p className="text-xs text-slate-500">
                    Médico aluga dias fixos na semana por um valor mensal.
                  </p>
                </div>
              </div>
              <button
                onClick={() => toggleModality("monthly")}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${modalities.monthly ? "bg-primary" : "bg-slate-300"}`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${modalities.monthly ? "translate-x-6" : "translate-x-1"}`}
                />
              </button>
            </div>
            {modalities.monthly && (
              <div className="p-4 bg-white animate-in slide-in-from-top-2">
                <Label className="font-bold text-slate-700 mb-1 block">
                  Valor Mensal (1x por semana)
                </Label>
                <Input
                  type="number"
                  placeholder="Ex: 1.200,00 / mês"
                  className="max-w-xs h-11 rounded-xl bg-slate-50"
                />
                <p className="text-xs text-slate-500 mt-2">
                  Este valor será cobrado via assinatura (recorrência) pelo
                  Asaas.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* ======================================= */}
        {/* COMODIDADES */}
        {/* ======================================= */}
        <section className="bg-white rounded-2xl p-6 border border-slate-200 shadow-sm">
          <h2 className="text-lg font-black text-slate-900 mb-4">
            Comodidades Inclusas
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {amenitiesList.map((item) => {
              const isSelected = selectedAmenities.includes(item.id);
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => toggleAmenity(item.id)}
                  className={`flex items-center gap-3 p-3 rounded-xl border-2 transition-all text-left ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-slate-100 bg-white hover:border-slate-200"
                  }`}
                >
                  <div
                    className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isSelected ? "bg-primary/20 text-primary" : "bg-slate-100 text-slate-500"}`}
                  >
                    <item.icon className="w-4 h-4" />
                  </div>
                  <span
                    className={`text-sm font-bold flex-1 ${isSelected ? "text-primary" : "text-slate-700"}`}
                  >
                    {item.label}
                  </span>
                  {isSelected && (
                    <Check className="w-4 h-4 text-primary shrink-0" />
                  )}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {/* FOOTER FIXO */}
      <div className="fixed bottom-0 left-0 lg:left-64 right-0 bg-white border-t border-slate-200 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] z-40">
        <div className="max-w-4xl mx-auto flex items-center justify-between gap-4">
          <p className="hidden sm:block text-xs text-slate-500 font-medium">
            Sua sala irá para análise após salvar.
          </p>
          <div className="flex gap-3 w-full sm:w-auto">
            <Button
              variant="ghost"
              onClick={onBack}
              className="font-bold text-slate-600"
            >
              Cancelar
            </Button>
            <Button
              onClick={onBack}
              className="flex-1 sm:flex-none bg-primary hover:bg-primary/90 text-white font-black px-8 h-12 rounded-xl shadow-lg"
            >
              {isEditing ? "Salvar Alterações" : "Cadastrar Sala"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
