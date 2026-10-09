"use client";

import * as React from "react";
import {
  Sparkles,
  ChevronRight,
  CheckCircle2,
  Shield,
  Star,
  Crown,
} from "lucide-react";
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const fusionPlans = [
  {
    id: "start",
    name: "Plano Start",
    icon: Shield,
    price: "49,90",
    color: "bg-slate-900",
    textColor: "text-slate-900",
    badge: null,
    benefits: [
      "Frete grátis não se aplica (Digital)",
      "5% de cashback em todas as reservas",
      "Acesso às salas da categoria Basic",
      "Suporte em horário comercial",
    ],
  },
  {
    id: "vip",
    name: "Plano VIP",
    icon: Star,
    price: "99,90",
    color: "bg-indigo-600",
    textColor: "text-indigo-600",
    badge: "OFERTA ESPECIAL",
    benefits: [
      "15% de cashback em todas as reservas",
      "Acesso às salas VIP e Basic",
      "Prioridade no agendamento (48h de antecedência)",
      "Cancelamento gratuito até 12h antes",
      "Suporte prioritário 24/7",
    ],
  },
  {
    id: "master",
    name: "Plano Master",
    icon: Crown,
    price: "199,90",
    color: "bg-amber-600",
    textColor: "text-amber-600",
    badge: "MAIS EXCLUSIVO",
    benefits: [
      "30% de cashback em todas as reservas",
      "Acesso ilimitado a todas as salas (Master, VIP, Basic)",
      "Estacionamento grátis garantido",
      "Isenção de taxas de upgrade de sala",
      "Concierge e suporte dedicado VIP",
    ],
  },
];

export function FusionPassBanner() {
  return (
    <Drawer>
      <DrawerTrigger asChild>
        {/* Banner no estilo "Meli+" */}
        <div className="mx-4 mt-2 mb-4 flex items-center justify-between bg-gradient-to-r from-pink-600 to-[#BF4B24] p-3.5 rounded-xl shadow-md cursor-pointer active:scale-[0.98] transition-transform">
          <div className="flex items-center gap-2.5">
            <div className="bg-white/20 p-1.5 rounded-lg">
              <Sparkles className="w-4 h-4 text-white" />
            </div>
            <span className="text-white font-black text-sm tracking-wide">
              Fusion Pass+ | Assine planos com desconto
            </span>
          </div>
          <ChevronRight className="w-5 h-5 text-white/80" />
        </div>
      </DrawerTrigger>

      {/* Modal (Drawer) que sobe com os planos */}
      <DrawerContent className="bg-slate-50 h-[85vh] flex flex-col">
        <DrawerHeader className="text-left border-b border-slate-200 pb-4 shrink-0 bg-white rounded-t-xl">
          <DrawerTitle className="text-2xl font-black text-slate-900 flex items-center gap-2">
            <span className="bg-gradient-to-r from-pink-600 to-[#BF4B24] text-white px-3 py-1 rounded-lg text-lg">
              Fusion Pass+
            </span>
          </DrawerTitle>
          <DrawerDescription className="text-slate-500 font-medium mt-2 text-base">
            Economize nas suas locações e tenha benefícios exclusivos. Escolha o
            seu plano ideal:
          </DrawerDescription>
        </DrawerHeader>

        {/* Container com scroll horizontal (Estilo Mercado Livre) */}
        <div className="flex-1 overflow-x-auto overflow-y-hidden flex gap-4 p-6 snap-x snap-mandatory scrollbar-hide items-start">
          {fusionPlans.map((plan) => (
            <div
              key={plan.id}
              className="snap-center shrink-0 w-[85vw] max-w-[320px] bg-white rounded-3xl shadow-lg border border-slate-100 flex flex-col overflow-hidden h-full max-h-[600px]"
            >
              {/* Cabeçalho do Plano */}
              <div className={`${plan.color} p-6 text-white relative`}>
                {plan.badge && (
                  <Badge className="absolute top-4 right-4 bg-white/20 hover:bg-white/30 text-white border-0 text-[10px] font-black tracking-widest">
                    {plan.badge}
                  </Badge>
                )}
                <plan.icon className="w-8 h-8 mb-4 text-white/80" />
                <h3 className="text-2xl font-black mb-1">{plan.name}</h3>
                <div className="flex items-baseline gap-1">
                  <span className="text-sm font-bold opacity-80">R$</span>
                  <span className="text-4xl font-black">{plan.price}</span>
                  <span className="text-sm font-medium opacity-80">/mês</span>
                </div>
              </div>

              {/* Benefícios */}
              <div className="p-6 flex-1 flex flex-col overflow-y-auto">
                <p className={`font-black text-lg mb-4 ${plan.textColor}`}>
                  O que está incluído?
                </p>
                <ul className="space-y-4 mb-8 flex-1">
                  {plan.benefits.map((benefit, i) => (
                    <li key={i} className="flex items-start gap-3">
                      <CheckCircle2
                        className={`w-5 h-5 shrink-0 ${plan.textColor}`}
                      />
                      <span className="text-sm font-medium text-slate-600 leading-snug">
                        {benefit}
                      </span>
                    </li>
                  ))}
                </ul>

                <Button
                  className={`w-full h-12 rounded-xl font-black text-base mt-auto ${plan.color} hover:opacity-90`}
                >
                  Próximo
                </Button>
              </div>
            </div>
          ))}
        </div>
      </DrawerContent>
    </Drawer>
  );
}
