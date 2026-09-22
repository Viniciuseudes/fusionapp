"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  Wallet,
  Shield,
  Star,
  Crown,
  Loader2,
  History,
  CreditCard,
  Sparkles,
  CheckCircle2,
  Lock,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

interface PlanPackage {
  id: string;
  tier: "start" | "vip" | "master";
  title: string;
  hours: number;
  price: number;
  icon: any;
  color: string;
  benefits: string[];
}

const PACKAGES: PlanPackage[] = [
  {
    id: "pkg_start",
    tier: "start",
    title: "Pacote START",
    hours: 10,
    price: 350,
    icon: Shield,
    color: "blue",
    benefits: ["Acesso a salas Start", "Suporte padrão", "Validade de 30 dias"],
  },
  {
    id: "pkg_vip",
    tier: "vip",
    title: "Pacote VIP",
    hours: 10,
    price: 550,
    icon: Star,
    color: "purple",
    benefits: [
      "Acesso a salas VIP e Start",
      "Agendamento prioritário",
      "Validade de 60 dias",
    ],
  },
  {
    id: "pkg_master",
    tier: "master",
    title: "Pacote MASTER",
    hours: 10,
    price: 850,
    icon: Crown,
    color: "amber",
    benefits: [
      "Acesso a TODAS as salas",
      "Selo Premium no perfil",
      "Validade de 90 dias",
    ],
  },
];

export function WalletTab() {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [profileName, setProfileName] = useState("");
  const [userEmail, setUserEmail] = useState("");
  const [balances, setBalances] = useState({ start: 0, vip: 0, master: 0 });
  const [transactions, setTransactions] = useState<any[]>([]);

  // ESTADOS DO CHECKOUT DE ASSINATURA
  const [isCheckoutOpen, setIsCheckoutOpen] = useState(false);
  const [selectedPackage, setSelectedPackage] = useState<PlanPackage | null>(
    null,
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [cardData, setCardData] = useState({
    number: "",
    name: "",
    expiry: "",
    cvv: "",
    cpf: "",
  });

  useEffect(() => {
    async function fetchWalletData() {
      setLoading(true);
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        setUserEmail(user.email || "");

        const { data: profile } = await supabase
          .from("profiles")
          .select("full_name")
          .eq("id", user.id)
          .single();
        if (profile) setProfileName(profile.full_name);

        const { data: txData } = await supabase
          .from("wallet_transactions")
          .select("amount, created_at, description, type, tier")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (txData) {
          setTransactions(txData.slice(0, 5));

          type BalancesType = { start: number; vip: number; master: number };
          const newBalances = txData.reduce(
            (acc: BalancesType, curr: any) => {
              const tierKey =
                (curr.tier as "start" | "vip" | "master") || "start";
              acc[tierKey] = (acc[tierKey] || 0) + Number(curr.amount);
              return acc;
            },
            { start: 0, vip: 0, master: 0 },
          );

          setBalances(newBalances);
        }
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    fetchWalletData();
  }, [supabase]);

  const totalHours = balances.start + balances.vip + balances.master;

  // Abre o modal de pagamento para o pacote selecionado
  const handleBuyPackage = (pkg: PlanPackage) => {
    setSelectedPackage(pkg);
    setCardData({ number: "", name: "", expiry: "", cvv: "", cpf: "" });
    setIsCheckoutOpen(true);
  };

  // Processa a Assinatura Transparente
  const handleConfirmPurchase = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPackage) return;

    setIsProcessing(true);

    try {
      const [expMonth, expYear] = cardData.expiry.split("/");
      const yearFormatted = expYear?.length === 2 ? `20${expYear}` : expYear;

      const response = await fetch("/api/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          checkoutType: "package",
          packageId: selectedPackage.id,
          packageName: selectedPackage.title,
          hours: selectedPackage.hours,
          price: selectedPackage.price,
          billingType: "CREDIT_CARD",
          creditCard: {
            holderName: cardData.name.toUpperCase(),
            number: cardData.number.replace(/\D/g, ""),
            expiryMonth: expMonth?.trim(),
            expiryYear: yearFormatted?.trim(),
            ccv: cardData.cvv,
          },
          creditCardHolderInfo: {
            name: cardData.name.toUpperCase(),
            email: userEmail || "suporte@fusionclinic.com.br",
            cpfCnpj: cardData.cpf.replace(/\D/g, ""),
            postalCode: "01310100", // CEP padrão exigido pelo Asaas
            addressNumber: "1000",
            phone: "11999999999",
          },
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Erro ao processar o pagamento.");
      }

      toast({
        title: "Assinatura Confirmada! 🎉",
        description:
          "A tua cobrança mensal foi ativada. Os créditos caem na carteira assim que o banco aprovar.",
      });

      setIsCheckoutOpen(false);
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Pagamento Recusado",
        description: error.message,
      });
    } finally {
      setIsProcessing(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );
  }

  return (
    <div className="space-y-8 max-w-5xl mx-auto animate-in fade-in pb-12">
      {/* 1. O CARTÃO DE CRÉDITO DIGITAL */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Wallet className="w-5 h-5 text-[#BF4B24]" /> Minha Carteira
          </h2>
        </div>

        <div className="bg-slate-900 rounded-[2rem] p-8 text-white shadow-2xl relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-white/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />
          <div className="absolute bottom-0 left-0 w-48 h-48 bg-[#BF4B24]/20 rounded-full blur-3xl translate-y-1/2 -translate-x-1/2" />

          <div className="relative z-10 flex flex-col md:flex-row md:items-center justify-between gap-8">
            <div>
              <p className="text-slate-400 font-bold uppercase tracking-widest text-xs mb-1">
                Saldo Total Disponível
              </p>
              <div className="flex items-baseline gap-2">
                <span className="text-6xl font-black">{totalHours}</span>
                <span className="text-xl font-bold text-slate-300">Horas</span>
              </div>
              <p className="text-sm font-medium text-slate-400 mt-2">
                Dr(a). {profileName.split(" ")[0]}
              </p>
            </div>

            <div className="bg-white/10 backdrop-blur-md border border-white/10 rounded-2xl p-5 min-w-[200px]">
              <p className="text-[10px] font-black text-white/50 uppercase tracking-widest mb-3">
                Composição do Saldo
              </p>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <Shield className="w-4 h-4 text-blue-400" /> Start
                  </span>
                  <span className="font-black">{balances.start}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <Star className="w-4 h-4 text-purple-400" /> VIP
                  </span>
                  <span className="font-black">{balances.vip}h</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-2 text-sm font-bold text-slate-200">
                    <Crown className="w-4 h-4 text-amber-400" /> Master
                  </span>
                  <span className="font-black">{balances.master}h</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 2. LOJA DE ASSINATURAS */}
      <section className="pt-4">
        <div className="mb-6">
          <h3 className="text-xl font-black text-slate-900 flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-[#BF4B24]" /> Planos de Assinatura
          </h3>
          <p className="text-sm font-medium text-slate-500 mt-1">
            Garante os teus créditos mensais com renovação automática.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {PACKAGES.map((pkg) => {
            const Icon = pkg.icon;
            const isBlue = pkg.color === "blue";
            const isPurple = pkg.color === "purple";

            return (
              <div
                key={pkg.id}
                className="bg-white rounded-3xl p-1 border-2 border-slate-100 hover:border-slate-300 transition-all flex flex-col group"
              >
                <div
                  className={`p-6 rounded-[1.25rem] h-full flex flex-col ${isBlue ? "bg-blue-50/50" : isPurple ? "bg-purple-50/50" : "bg-amber-50/50"}`}
                >
                  <div className="flex items-start justify-between mb-4">
                    <div
                      className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm ${isBlue ? "bg-blue-500 text-white" : isPurple ? "bg-purple-500 text-white" : "bg-amber-500 text-white"}`}
                    >
                      <Icon className="w-6 h-6" />
                    </div>
                    <Badge className="bg-white text-slate-900 border-0 shadow-sm font-bold">
                      {pkg.hours} Horas/mês
                    </Badge>
                  </div>

                  <h4
                    className={`text-lg font-black mb-1 ${isBlue ? "text-blue-900" : isPurple ? "text-purple-900" : "text-amber-900"}`}
                  >
                    {pkg.title}
                  </h4>

                  <div className="flex items-baseline gap-1 mb-6">
                    <span className="text-2xl font-black text-slate-900">
                      R$ {pkg.price}
                    </span>
                    <span className="text-xs font-bold text-slate-500 uppercase">
                      /mês
                    </span>
                  </div>

                  <div className="space-y-3 mb-8 flex-1">
                    {pkg.benefits.map((benefit, i) => (
                      <div key={i} className="flex items-start gap-2">
                        <CheckCircle2
                          className={`w-4 h-4 shrink-0 mt-0.5 ${isBlue ? "text-blue-500" : isPurple ? "text-purple-500" : "text-amber-500"}`}
                        />
                        <span className="text-sm font-medium text-slate-600">
                          {benefit}
                        </span>
                      </div>
                    ))}
                  </div>

                  <Button
                    onClick={() => handleBuyPackage(pkg)}
                    className={`w-full h-12 font-black shadow-md transition-transform group-hover:-translate-y-1 ${isBlue ? "bg-blue-600 hover:bg-blue-700" : isPurple ? "bg-purple-600 hover:bg-purple-700" : "bg-amber-600 hover:bg-amber-700"} text-white`}
                  >
                    Assinar Plano
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. HISTÓRICO RÁPIDO */}
      <section className="pt-4">
        <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
          <History className="w-5 h-5 text-slate-400" /> Últimas Transações
        </h3>
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {transactions.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {transactions.map((tx, idx) => (
                <div
                  key={idx}
                  className="p-4 flex items-center justify-between hover:bg-slate-50 transition-colors"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${tx.amount > 0 ? "bg-emerald-100 text-emerald-600" : "bg-slate-100 text-slate-600"}`}
                    >
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <div>
                      <p className="font-bold text-slate-900">
                        {tx.description || "Recarga de Pacote"}
                      </p>
                      <p className="text-xs text-slate-500 font-medium">
                        {format(new Date(tx.created_at), "dd 'de' MMM, yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                    </div>
                  </div>
                  <div
                    className={`font-black ${tx.amount > 0 ? "text-emerald-600" : "text-slate-900"}`}
                  >
                    {tx.amount > 0 ? "+" : ""}
                    {tx.amount}h
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500">
              Nenhuma transação encontrada.
            </div>
          )}
        </div>
      </section>

      {/* MODAL TRANSPARENTE DE ASSINATURA */}
      <Dialog open={isCheckoutOpen} onOpenChange={setIsCheckoutOpen}>
        <DialogContent className="sm:max-w-[420px] bg-white rounded-3xl p-6 border-slate-200">
          {selectedPackage && (
            <>
              <DialogHeader className="mb-4">
                <DialogTitle className="text-xl font-black text-slate-900 flex items-center gap-2">
                  <CreditCard className="w-5 h-5 text-[#BF4B24]" />
                  Checkout Transparente
                </DialogTitle>
                <DialogDescription className="text-slate-500 font-medium text-sm">
                  Assinatura Recorrente:{" "}
                  <strong>{selectedPackage.title}</strong> (R${" "}
                  {selectedPackage.price.toFixed(2)}/mês)
                </DialogDescription>
              </DialogHeader>

              <form onSubmit={handleConfirmPurchase} className="space-y-4">
                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">
                    Número do Cartão
                  </Label>
                  <Input
                    required
                    placeholder="0000 0000 0000 0000"
                    maxLength={19}
                    value={cardData.number}
                    onChange={(e) =>
                      setCardData({ ...cardData, number: e.target.value })
                    }
                    className="h-11 bg-slate-50 rounded-xl font-mono text-sm"
                  />
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">
                    Nome Impresso
                  </Label>
                  <Input
                    required
                    placeholder="NOME COMPLETO"
                    value={cardData.name}
                    onChange={(e) =>
                      setCardData({
                        ...cardData,
                        name: e.target.value.toUpperCase(),
                      })
                    }
                    className="h-11 bg-slate-50 rounded-xl text-sm uppercase"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">Validade</Label>
                    <Input
                      required
                      placeholder="MM/AA"
                      maxLength={5}
                      value={cardData.expiry}
                      onChange={(e) =>
                        setCardData({ ...cardData, expiry: e.target.value })
                      }
                      className="h-11 bg-slate-50 rounded-xl text-center font-mono"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="font-bold text-slate-700">CVV</Label>
                    <Input
                      required
                      type="password"
                      placeholder="123"
                      maxLength={4}
                      value={cardData.cvv}
                      onChange={(e) =>
                        setCardData({ ...cardData, cvv: e.target.value })
                      }
                      className="h-11 bg-slate-50 rounded-xl text-center font-mono"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label className="font-bold text-slate-700">
                    CPF do Titular
                  </Label>
                  <Input
                    required
                    placeholder="000.000.000-00"
                    maxLength={14}
                    value={cardData.cpf}
                    onChange={(e) =>
                      setCardData({ ...cardData, cpf: e.target.value })
                    }
                    className="h-11 bg-slate-50 rounded-xl font-mono text-sm"
                  />
                </div>

                <div className="flex items-center justify-center gap-2 text-[10px] font-bold text-emerald-600 bg-emerald-50 p-2 rounded-lg mt-2">
                  <ShieldCheck className="w-4 h-4" /> Encriptação de
                  ponta-a-ponta Asaas.
                </div>

                <Button
                  type="submit"
                  disabled={isProcessing}
                  className="w-full h-12 font-black bg-[#BF4B24] hover:bg-[#9A3C1D] text-white rounded-xl shadow-lg mt-2"
                >
                  {isProcessing ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <span className="flex items-center gap-2">
                      <Lock className="w-4 h-4" /> Assinar Mensalidade
                    </span>
                  )}
                </Button>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
