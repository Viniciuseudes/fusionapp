"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  Filter,
  Eye,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Calendar as CalendarIcon,
  Clock,
  TrendingUp,
  Award,
  Wallet,
  Stethoscope,
  ChevronLeft,
  Loader2,
  Ban,
  CheckCircle2,
  Users,
  CreditCard,
  PlusCircle,
  AlertTriangle,
  Shield,
  Star,
  Crown,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface Specialist {
  id: string;
  full_name: string;
  avatar_url: string | null;
  specialty: string;
  council: string;
  council_number: string;
  city: string;
  state: string;
  created_at: string;
  phone: string;
  email: string;
  ltv: number;
  bookingsCount: number;
  lastBookingDate: string | null;
  tier: "Start" | "Silver" | "Gold" | "Black";
  status: "active" | "pending" | "blocked";
  walletBalance: number;
  walletBalances: { start: number; vip: number; master: number };
  plan: string;
}

export function AdminSpecialistsTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [specialists, setSpecialists] = useState<Specialist[]>([]);

  const [search, setSearch] = useState("");
  const [councilFilter, setCouncilFilter] = useState("all");

  const [selectedProfile, setSelectedProfile] = useState<Specialist | null>(
    null,
  );
  const [profileBookings, setProfileBookings] = useState<any[]>([]);
  const [profileLoading, setProfileLoading] = useState(false);

  // Controle do Modal de Adicionar Créditos
  const [creditModalOpen, setCreditModalOpen] = useState(false);
  const [creditAmount, setCreditAmount] = useState("");
  const [creditTier, setCreditTier] = useState<"start" | "vip" | "master">(
    "start",
  );
  const [actionLoading, setActionLoading] = useState(false);

  useEffect(() => {
    fetchSpecialists();
  }, [supabase]);

  const fetchSpecialists = async () => {
    setLoading(true);
    try {
      const { data: profiles, error: pErr } = await supabase
        .from("profiles")
        .select("*")
        .order("created_at", { ascending: false });

      if (pErr) throw pErr;

      const { data: bookings, error: bErr } = await supabase
        .from("bookings")
        .select("user_id, total_cost, start_time, status")
        .in("status", ["confirmed", "completed", "pending_payment"]);

      if (bErr) throw bErr;

      // ATUALIZAÇÃO SÊNIOR: Removemos o filtro gt("amount", 0) para trazer TAMBÉM os gastos (valores negativos)
      const { data: transactions, error: tErr } = await supabase
        .from("wallet_transactions")
        .select("user_id, amount, expires_at, tier");

      if (tErr) throw tErr;

      const now = new Date();

      const processedData: Specialist[] = profiles.map((p) => {
        const userBookings = bookings?.filter((b) => b.user_id === p.id) || [];
        const ltv = userBookings.reduce(
          (acc, curr) => acc + (Number(curr.total_cost) || 0) * 45,
          0,
        );
        const bookingsCount = userBookings.length;
        const lastBooking = userBookings.sort(
          (a, b) =>
            new Date(b.start_time).getTime() - new Date(a.start_time).getTime(),
        )[0];

        let tier: Specialist["tier"] = "Start";
        if (ltv >= 5000) tier = "Black";
        else if (ltv >= 2000) tier = "Gold";
        else if (ltv >= 500) tier = "Silver";

        const rawSpecialty = p.specialty || "Clínico Geral";
        let council = "CRM";
        if (rawSpecialty.toLowerCase().includes("psico")) council = "CRP";
        if (rawSpecialty.toLowerCase().includes("odonto")) council = "CRO";
        if (rawSpecialty.toLowerCase().includes("fisio")) council = "CREFITO";
        if (rawSpecialty.toLowerCase().includes("nutri")) council = "CRN";

        // ==========================================
        // CÁLCULO DINÂMICO REAL DO BANCO DE HORAS
        // ==========================================
        const userTransactions =
          transactions?.filter((t) => t.user_id === p.id) || [];
        let startBal = 0,
          vipBal = 0,
          masterBal = 0;

        userTransactions.forEach((tx) => {
          const amt = Number(tx.amount);

          // Se for uma entrada de crédito (positiva) que já passou da validade, a gente ignora da soma
          if (amt > 0 && tx.expires_at && new Date(tx.expires_at) < now) return;

          // Adiciona o valor (seja entrada positiva ou gasto negativo) à prateleira correta
          if (tx.tier === "master") masterBal += amt;
          else if (tx.tier === "vip") vipBal += amt;
          else startBal += amt;
        });

        // O saldo total é a soma exata de tudo o que restou utilizável
        const validCredits = startBal + vipBal + masterBal;
        const plan = p.subscription_plan || "Básico (Start)";

        return {
          id: p.id,
          full_name: p.full_name || "Usuário sem nome",
          avatar_url: p.avatar_url,
          specialty: rawSpecialty,
          council: council,
          council_number: p.document_number || "Pendente",
          city: "Natal",
          state: "RN",
          created_at: p.created_at,
          phone: p.phone || "Não informado",
          email:
            p.email ||
            `${p.full_name?.split(" ")[0]?.toLowerCase() || "user"}@email.com`,
          ltv,
          bookingsCount,
          lastBookingDate: lastBooking ? lastBooking.start_time : null,
          tier,
          status: "active",
          walletBalance: validCredits,
          walletBalances: { start: startBal, vip: vipBal, master: masterBal },
          plan,
        };
      });

      setSpecialists(
        processedData.filter((s) => s.specialty || s.bookingsCount > 0),
      );
    } catch (err: any) {
      console.error("Erro ao buscar especialistas:", err);
      toast({
        variant: "destructive",
        title: "Erro de Conexão",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProfile = async (specialist: Specialist) => {
    setSelectedProfile(specialist);
    setProfileLoading(true);

    try {
      const { data, error } = await supabase
        .from("bookings")
        .select(
          `
          id, start_time, end_time, total_cost, status,
          rooms (name, image_url)
        `,
        )
        .eq("user_id", specialist.id)
        .order("start_time", { ascending: false })
        .limit(5);

      if (!error && data) {
        setProfileBookings(data);
      }
    } catch (err) {}

    setProfileLoading(false);
  };

  const handleAddCredits = async () => {
    if (!selectedProfile || !creditAmount || !creditTier) return;

    setActionLoading(true);
    try {
      const hours = parseInt(creditAmount, 10);
      if (hours <= 0)
        throw new Error("A quantidade de horas deve ser maior que zero.");

      // Validade de 30 dias para os créditos injetados
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + 30);

      // Insere a transação real de Créditos no Banco
      const { error: txError } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: selectedProfile.id,
          amount: hours,
          type: "admin_bonus",
          tier: creditTier,
          description: `Bônus Admin: ${creditTier.toUpperCase()}`,
          expires_at: expiresAt.toISOString(),
        });

      if (txError) throw txError;

      // Atualiza o banco do perfil para compatibilidade legada
      const novoSaldoTotal = selectedProfile.walletBalance + hours;
      await supabase
        .from("profiles")
        .update({ wallet_balance: novoSaldoTotal })
        .eq("id", selectedProfile.id);

      // Atualiza a interface localmente (Total + Detalhado)
      const novoWalletBalances = { ...selectedProfile.walletBalances };
      if (creditTier === "start") novoWalletBalances.start += hours;
      else if (creditTier === "vip") novoWalletBalances.vip += hours;
      else if (creditTier === "master") novoWalletBalances.master += hours;

      setSelectedProfile({
        ...selectedProfile,
        walletBalance: novoSaldoTotal,
        walletBalances: novoWalletBalances,
      });

      setSpecialists((prev) =>
        prev.map((s) =>
          s.id === selectedProfile.id
            ? {
                ...s,
                walletBalance: novoSaldoTotal,
                walletBalances: novoWalletBalances,
              }
            : s,
        ),
      );

      toast({
        title: "Créditos Injetados com Sucesso!",
        description: `${hours} Horas (${creditTier.toUpperCase()}) foram adicionadas à carteira de ${selectedProfile.full_name}.`,
      });

      setCreditModalOpen(false);
      setCreditAmount("");
      setCreditTier("start");
    } catch (error: any) {
      console.error(error);
      toast({
        variant: "destructive",
        title: "Erro ao Injetar Créditos",
        description:
          error.message ||
          "Verifique se a tabela wallet_transactions está acessível.",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const totalLTV = specialists.reduce((acc, curr) => acc + curr.ltv, 0);
  const activeThisMonth = specialists.filter(
    (s) =>
      s.lastBookingDate &&
      new Date(s.lastBookingDate).getMonth() === new Date().getMonth(),
  ).length;

  const filteredSpecialists = specialists.filter((s) => {
    const matchesSearch =
      s.full_name.toLowerCase().includes(search.toLowerCase()) ||
      s.council_number.includes(search) ||
      s.email.toLowerCase().includes(search.toLowerCase());
    const matchesCouncil =
      councilFilter === "all" ? true : s.council === councilFilter;
    return matchesSearch && matchesCouncil;
  });

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "Black":
        return (
          <Badge className="bg-slate-900 text-white border-0">
            <Award className="w-3 h-3 mr-1 text-yellow-500" /> Black
          </Badge>
        );
      case "Gold":
        return (
          <Badge className="bg-amber-100 text-amber-700 border-0">
            <Award className="w-3 h-3 mr-1" /> Gold
          </Badge>
        );
      case "Silver":
        return (
          <Badge className="bg-slate-200 text-slate-700 border-0">
            <Award className="w-3 h-3 mr-1" /> Silver
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-50 text-blue-700 border-0">Start</Badge>
        );
    }
  };

  if (loading)
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );

  // ========================================================
  // RENDERIZAÇÃO: DOSSIÊ DO PERFIL (TELA CHEIA)
  // ========================================================
  if (selectedProfile) {
    return (
      <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
        <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-10 shadow-sm">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSelectedProfile(null)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 leading-none">
                  Dossiê do Especialista
                </h2>
                {selectedProfile.status === "active" ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold uppercase tracking-wider text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Ativo
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 border-0 font-bold uppercase tracking-wider text-[10px]">
                    <Ban className="w-3 h-3 mr-1" /> Bloqueado
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              className="border-slate-200 text-red-600 hover:bg-red-50 hover:text-red-700 font-bold"
            >
              <Ban className="w-4 h-4 mr-2" /> Suspender
            </Button>
            <Button className="bg-slate-900 hover:bg-slate-800 text-white font-bold">
              <Mail className="w-4 h-4 mr-2" /> Contatar
            </Button>
          </div>
        </div>

        <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#f05e23]/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

            <div className="w-32 h-32 rounded-full bg-slate-100 border-4 border-white shadow-lg overflow-hidden shrink-0">
              <img
                src={selectedProfile.avatar_url || "/placeholder.jpg"}
                alt={selectedProfile.full_name}
                className="w-full h-full object-cover"
              />
            </div>

            <div className="flex-1 text-center md:text-left z-10">
              <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
                <h1 className="text-3xl font-black text-slate-900">
                  {selectedProfile.full_name}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-2">
                  {getTierBadge(selectedProfile.tier)}
                  <Badge
                    variant="outline"
                    className="text-slate-600 border-slate-200"
                  >
                    {selectedProfile.council} {selectedProfile.council_number}
                  </Badge>
                </div>
              </div>
              <p className="text-lg font-bold text-slate-500 mb-6">
                {selectedProfile.specialty}
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Mail className="w-4 h-4 text-[#f05e23]" />{" "}
                  {selectedProfile.email}
                </div>
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Phone className="w-4 h-4 text-[#f05e23]" />{" "}
                  {selectedProfile.phone}
                </div>
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <MapPin className="w-4 h-4 text-[#f05e23]" />{" "}
                  {selectedProfile.city} - {selectedProfile.state}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {/* CARTEIRA DO USUÁRIO */}
            <div className="bg-[#f05e23] rounded-3xl p-6 text-white shadow-lg relative overflow-hidden group col-span-1 md:col-span-2">
              <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transition-transform group-hover:scale-150"></div>
              <div className="relative z-10 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6">
                <div className="flex-1">
                  <p className="text-xs font-bold text-white/70 uppercase tracking-wider mb-2 flex items-center gap-2">
                    <CreditCard className="w-4 h-4" /> Banco de Horas Total
                  </p>
                  <h3 className="text-4xl font-black mb-4">
                    {selectedProfile.walletBalance}
                    <span className="text-xl font-bold ml-2">CR</span>
                  </h3>

                  {/* Composição do Saldo */}
                  <div className="flex flex-wrap items-center gap-3">
                    <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 flex items-center gap-1.5 px-3 py-1 text-xs">
                      <Shield className="w-3 h-3" /> Basic:{" "}
                      {selectedProfile.walletBalances.start}
                    </Badge>
                    <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 flex items-center gap-1.5 px-3 py-1 text-xs">
                      <Star className="w-3 h-3 text-purple-200" /> VIP:{" "}
                      {selectedProfile.walletBalances.vip}
                    </Badge>
                    <Badge className="bg-white/20 hover:bg-white/30 text-white border-0 flex items-center gap-1.5 px-3 py-1 text-xs">
                      <Crown className="w-3 h-3 text-amber-200" /> Master:{" "}
                      {selectedProfile.walletBalances.master}
                    </Badge>
                  </div>

                  <div className="flex items-center gap-2 mt-5">
                    <Badge className="bg-white/10 text-white border-0">
                      {selectedProfile.plan}
                    </Badge>
                    <span className="text-xs font-medium text-white/80">
                      Plano Atual
                    </span>
                  </div>
                </div>

                <div className="w-full sm:w-auto self-start sm:self-center">
                  <Button
                    onClick={() => setCreditModalOpen(true)}
                    className="w-full sm:w-auto bg-slate-900 hover:bg-slate-800 text-white font-bold h-12 px-6 rounded-xl shadow-md border border-slate-700"
                  >
                    <PlusCircle className="w-4 h-4 mr-2" /> Injetar Créditos
                  </Button>
                </div>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Wallet className="w-4 h-4" /> LTV (Gasto Total)
              </p>
              <h3 className="text-3xl font-black text-slate-900 mb-1">
                <span className="text-base text-emerald-500 font-bold mr-1">
                  R$
                </span>
                {selectedProfile.ltv.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                })}
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-2">
                {selectedProfile.bookingsCount} locações concluídas
              </p>
            </div>
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm">
            <h3 className="text-xl font-black text-slate-900 mb-6 flex items-center gap-2">
              <TrendingUp className="w-5 h-5 text-[#f05e23]" /> Últimas Locações
            </h3>

            {profileLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="w-6 h-6 animate-spin text-[#f05e23]" />
              </div>
            ) : profileBookings.length === 0 ? (
              <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                <CalendarIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                <p className="text-slate-500 font-medium">
                  Nenhum histórico de reservas encontrado.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {profileBookings.map((b) => (
                  <div
                    key={b.id}
                    className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 hover:border-slate-200 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 rounded-xl bg-slate-200 overflow-hidden shrink-0">
                        <img
                          src={b.rooms?.image_url || "/placeholder.jpg"}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">
                          {b.rooms?.name || "Sala Removida"}
                        </p>
                        <p className="text-xs font-bold text-slate-500 mt-0.5">
                          {format(
                            parseISO(b.start_time),
                            "dd 'de' MMM, HH:mm",
                            { locale: ptBR },
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-emerald-600 mb-1">
                        R${" "}
                        {(b.total_cost * 45).toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <Badge variant="outline" className="text-[10px]">
                        {b.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* MODAL DE ADICIONAR CRÉDITOS */}
        {creditModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm px-4">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-6 w-full max-w-md animate-in zoom-in-95">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-[#f05e23]">
                  <CreditCard className="w-6 h-6" />
                </div>
                <div>
                  <h3 className="text-xl font-black text-slate-900">
                    Injetar Créditos
                  </h3>
                  <p className="text-sm font-medium text-slate-500">
                    Adicionar horas ao banco do profissional.
                  </p>
                </div>
              </div>

              <div className="space-y-4 mb-6">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-500 uppercase">
                    Especialista
                  </p>
                  <p className="font-bold text-slate-900">
                    {selectedProfile.full_name}
                  </p>
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">
                    Categoria do Crédito (Tier)
                  </label>
                  <select
                    value={creditTier}
                    onChange={(e) => setCreditTier(e.target.value as any)}
                    className="w-full h-14 bg-slate-50 border border-slate-200 rounded-xl px-4 font-bold text-slate-700 outline-none"
                  >
                    <option value="start">Basic (Start)</option>
                    <option value="vip">VIP</option>
                    <option value="master">Master</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-bold text-slate-700 mb-2 block">
                    Quantidade de Horas (CR)
                  </label>
                  <Input
                    type="number"
                    placeholder="Ex: 10"
                    value={creditAmount}
                    onChange={(e) => setCreditAmount(e.target.value)}
                    className="h-14 font-black text-lg bg-slate-50 border-slate-200"
                  />
                  <p className="text-xs font-medium text-slate-400 mt-2">
                    Os créditos injetados expirarão automaticamente em 30 dias.
                  </p>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setCreditModalOpen(false)}
                  className="flex-1 h-12 font-bold border-slate-200 text-slate-600"
                >
                  Cancelar
                </Button>
                <Button
                  disabled={!creditAmount || actionLoading}
                  onClick={handleAddCredits}
                  className="flex-1 h-12 bg-[#f05e23] hover:bg-[#d6521e] text-white font-bold shadow-lg"
                >
                  {actionLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    "Confirmar Injeção"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // ========================================================
  // RENDERIZAÇÃO: LISTAGEM PADRÃO (A TELA PRINCIPAL DA ABA)
  // ========================================================
  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <Stethoscope className="w-8 h-8 text-[#f05e23]" />
            Especialistas (Profissionais)
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gestão da base de usuários, planos, LTV e carteira virtual.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-blue-50 flex items-center justify-center text-blue-600 shrink-0">
            <Users className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              Total Cadastrados
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              {specialists.length}
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <TrendingUp className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              Ativos (Este Mês)
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              {activeThisMonth}
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-[#f05e23] shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              LTV Global (Base)
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              R${" "}
              {totalLTV >= 1000 ? (totalLTV / 1000).toFixed(1) + "k" : totalLTV}
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="flex items-center gap-3 w-full md:w-auto">
            <select
              value={councilFilter}
              onChange={(e) => setCouncilFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none min-w-[160px]"
            >
              <option value="all">Todos os Conselhos</option>
              <option value="CRM">CRM (Medicina)</option>
              <option value="CRP">CRP (Psicologia)</option>
              <option value="CRO">CRO (Odontologia)</option>
              <option value="CREFITO">CREFITO (Fisio)</option>
            </select>
          </div>

          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar por nome, email ou conselho..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 rounded-xl border-slate-200 bg-white font-medium w-full"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white text-slate-400 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Profissional & Contato</th>
                <th className="px-6 py-4">Registro & Categoria</th>
                <th className="px-6 py-4">Plano & Carteira</th>
                <th className="px-6 py-4 text-center">Nível (Tier)</th>
                <th className="px-6 py-4 text-right">LTV (Gerado)</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {filteredSpecialists.length === 0 ? (
                <tr>
                  <td
                    colSpan={6}
                    className="px-6 py-12 text-center text-slate-500 font-medium"
                  >
                    Nenhum profissional encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredSpecialists.map((spec) => (
                  <tr
                    key={spec.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-slate-200 overflow-hidden border border-slate-200 shrink-0">
                          <img
                            src={spec.avatar_url || "/placeholder.jpg"}
                            className="w-full h-full object-cover"
                          />
                        </div>
                        <div>
                          <p className="font-black text-slate-900">
                            {spec.full_name}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                            {spec.email}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            {spec.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-700">
                        {spec.council} {spec.council_number}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase mt-0.5">
                        {spec.specialty}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-900">{spec.plan}</p>
                      <p className="text-[10px] font-bold text-emerald-600 mt-0.5">
                        Saldo: {spec.walletBalance} CR
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getTierBadge(spec.tier)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-slate-900">
                        R${" "}
                        {spec.ltv.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {spec.bookingsCount} locações
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button
                        onClick={() => handleOpenProfile(spec)}
                        variant="ghost"
                        className="h-8 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 font-bold px-3 rounded-lg"
                      >
                        Visualizar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
