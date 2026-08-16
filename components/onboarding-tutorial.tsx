"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Building2,
  Crown,
  Wallet,
  ShieldCheck,
  ArrowRight,
  CheckCircle2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";

export function OnboardingTutorial() {
  const supabase = createClient();
  const [isMounted, setIsMounted] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [userId, setUserId] = useState<string | null>(null);

  // Controle de UX: Dá o poder ao usuário
  const [dontShowAgain, setDontShowAgain] = useState(true);

  useEffect(() => {
    setIsMounted(true);
    async function checkUserOnboarding() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (user) {
        setUserId(user.id);
        const hasSeenTutorial = localStorage.getItem(
          `fusion_onboarding_${user.id}`,
        );

        // Só abre se não existir a marcação no LocalStorage
        if (!hasSeenTutorial) {
          const timer = setTimeout(() => setIsOpen(true), 500);
          return () => clearTimeout(timer);
        }
      }
    }
    checkUserOnboarding();
  }, [supabase]);

  const savePreferenceAndClose = () => {
    if (dontShowAgain && userId) {
      localStorage.setItem(`fusion_onboarding_${userId}`, "true");
    }
    setIsOpen(false);
  };

  const nextStep = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      savePreferenceAndClose();
    }
  };

  const steps = [
    {
      id: "welcome",
      icon: <Building2 className="w-16 h-16 text-[#f05e23]" />,
      title: "Bem-vindo à Fusion Clinic",
      subtitle: "A nova forma de gerenciar seus atendimentos.",
      description:
        "Esqueça a burocracia de aluguéis tradicionais. Aqui você encontra consultórios de alto padrão, prontos para uso, na palma da sua mão.",
      highlights: [
        "Localização Inteligente",
        "Ambientes Premium",
        "Zero Burocracia",
      ],
      bgDecoration: "bg-orange-500/10",
    },
    {
      id: "tiers",
      icon: <Crown className="w-16 h-16 text-amber-500" />,
      title: "Salas Basic, VIP e Master",
      subtitle: "Um espaço para cada momento da sua carreira.",
      description:
        "Filtre nossas salas por categoria. Desde o excelente custo-benefício das salas Basic até a exclusividade absoluta das salas Master.",
      highlights: [
        "Filtro de Proximidade (GPS)",
        "Fotos e Avaliações Reais",
        "Aluguel por Hora, Turno ou Fixo",
      ],
      bgDecoration: "bg-amber-500/10",
    },
    {
      id: "wallet",
      icon: <Wallet className="w-16 h-16 text-purple-500" />,
      title: "Conheça o Fusion Pass",
      subtitle: "A sua carteira de créditos inteligente.",
      description:
        "Assine um Fusion Pass e transforme Reais (R$) em Créditos (CR). Com o Pass, você economiza até 50% por hora e gerencia seu saldo com validade de 30 dias.",
      highlights: [
        "Descontos Exclusivos",
        "Prioridade na Agenda",
        "Controle Total de Gastos",
      ],
      bgDecoration: "bg-purple-500/10",
    },
    {
      id: "management",
      icon: <ShieldCheck className="w-16 h-16 text-emerald-500" />,
      title: "Gestão e Chat Seguro",
      subtitle: "Tudo sob o seu controle.",
      description:
        "Cancele reservas com estorno automático de créditos (política de 24h), receba o endereço exato com segurança e fale diretamente com o anfitrião via Chat.",
      highlights: [
        "Estorno Inteligente",
        "Chat Direto no App",
        "Histórico de Pacientes",
      ],
      bgDecoration: "bg-emerald-500/10",
    },
  ];

  if (!isMounted || !isOpen) return null;

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-[500] flex items-center justify-center p-4 sm:p-6 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="bg-white w-full max-w-md rounded-[2.5rem] shadow-2xl overflow-hidden relative flex flex-col max-h-[85dvh] animate-in zoom-in-95 slide-in-from-bottom-8 duration-500">
        <button
          onClick={savePreferenceAndClose}
          className="absolute top-4 right-4 z-20 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100/50 backdrop-blur-md text-slate-600 hover:bg-slate-200 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <div
          className={`relative h-32 sm:h-40 flex items-center justify-center shrink-0 transition-colors duration-500 ${step.bgDecoration}`}
        >
          <div className="absolute inset-0 bg-gradient-to-b from-transparent to-white" />
          <div className="relative z-10 p-3 sm:p-4 bg-white rounded-3xl shadow-lg border border-slate-100 animate-in zoom-in duration-500">
            {step.icon}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-6 sm:px-8 py-4 sm:py-6">
          <div className="text-center mb-6">
            <h2 className="text-2xl font-black text-slate-900 mb-2 tracking-tight">
              {step.title}
            </h2>
            <p className="text-xs sm:text-sm font-bold text-[#f05e23] uppercase tracking-wider mb-3">
              {step.subtitle}
            </p>
            <p className="text-sm font-medium text-slate-600 leading-relaxed">
              {step.description}
            </p>
          </div>

          <div className="space-y-3">
            {step.highlights.map((highlight, idx) => (
              <div
                key={idx}
                className="flex items-center gap-3 bg-slate-50 p-3 rounded-xl border border-slate-100"
              >
                <CheckCircle2 className="w-5 h-5 text-emerald-500 shrink-0" />
                <span className="text-sm font-bold text-slate-700">
                  {highlight}
                </span>
              </div>
            ))}
          </div>

          {/* CHECKBOX SÊNIOR DE CONTROLE */}
          {currentStep === steps.length - 1 && (
            <div className="mt-6 flex items-start gap-2 bg-slate-50 p-3 rounded-xl">
              <input
                type="checkbox"
                id="dontShowAgain"
                checked={dontShowAgain}
                onChange={(e) => setDontShowAgain(e.target.checked)}
                className="w-4 h-4 mt-0.5 rounded text-[#f05e23] border-slate-300 focus:ring-[#f05e23]"
              />
              <label
                htmlFor="dontShowAgain"
                className="text-sm font-medium text-slate-600 cursor-pointer select-none leading-tight"
              >
                Não mostrar este tutorial na próxima vez que eu fizer login.
              </label>
            </div>
          )}
        </div>

        <div className="shrink-0 p-6 sm:px-8 bg-white border-t border-slate-50 flex items-center justify-between gap-4">
          <div className="flex gap-1.5 shrink-0">
            {steps.map((_, idx) => (
              <div
                key={idx}
                className={`h-2 rounded-full transition-all duration-300 ${idx === currentStep ? "w-6 bg-[#f05e23]" : "w-2 bg-slate-200"}`}
              />
            ))}
          </div>

          <Button
            onClick={nextStep}
            className="h-12 px-4 sm:px-6 rounded-xl font-black bg-slate-900 hover:bg-slate-800 text-white shadow-lg shadow-slate-900/20 whitespace-nowrap shrink-0 flex items-center"
          >
            {currentStep === steps.length - 1 ? "Começar" : "Próximo"}
            {currentStep !== steps.length - 1 && (
              <ArrowRight className="w-4 h-4 ml-2 shrink-0" />
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
