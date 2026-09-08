"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMobileBack } from "@/hooks/use-mobile-back";
import {
  User,
  MapPin,
  Camera,
  Save,
  Loader2,
  Search,
  ShieldCheck,
  AlertCircle,
  Wallet,
  ChevronRight,
  LogOut,
  HelpCircle,
  ArrowLeft,
  FileText,
  PlusCircle,
  History,
  ArrowDownRight,
  ArrowUpRight,
  Receipt,
  Shield,
  Star,
  Crown,
  Gem,
  Gift,
  Clock,
  Mail,
  XCircle,
  ArrowRightLeft,
  Info,
  X,
  CalendarDays,
  Trophy,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";

type ViewState = "overview" | "edit" | "wallet";

interface PendingTransfer {
  id: string;
  receiver_email: string;
  amount: number;
  tier: "start" | "vip" | "master";
  created_at: string;
}

interface Transaction {
  id: string;
  amount: number;
  type: string;
  tier: string;
  description: string;
  created_at: string;
  expires_at?: string;
}

// ==========================================
// FUNÇÕES AUXILIARES GLOBAIS
// ==========================================
const isCredit = (type: string, amount: number) => {
  return (
    amount > 0 ||
    [
      "credit",
      "deposit",
      "recharge",
      "admin_bonus",
      "refund",
      "transfer_in",
    ].includes(type || "")
  );
};

const isValidCPF = (cpf: string) => {
  cpf = cpf.replace(/[^\d]+/g, "");
  if (cpf.length !== 11 || !!cpf.match(/(\d)\1{10}/)) return false;
  let sum = 0,
    rest;
  for (let i = 1; i <= 9; i++)
    sum = sum + parseInt(cpf.substring(i - 1, i)) * (11 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(cpf.substring(9, 10))) return false;
  sum = 0;
  for (let i = 1; i <= 10; i++)
    sum = sum + parseInt(cpf.substring(i - 1, i)) * (12 - i);
  rest = (sum * 10) % 11;
  if (rest === 10 || rest === 11) rest = 0;
  if (rest !== parseInt(cpf.substring(10, 11))) return false;
  return true;
};

// ALGORITMO SÊNIOR DE GAMIFICAÇÃO (Agora com Recompensas)
const getTierInfo = (bookingsCount: number, isProfileComplete: boolean) => {
  if (!isProfileComplete) {
    return {
      name: "Iniciante",
      current: bookingsCount,
      next: 1,
      percent: 0,
      color: "text-slate-600",
      bg: "bg-slate-100",
      bar: "bg-slate-300",
      icon: AlertCircle,
      message: "Complete seu cadastro para habilitar a plataforma.",
      reward: "Habilita reservas no aplicativo",
      isMax: false,
    };
  }
  if (bookingsCount < 10)
    return {
      name: "Bronze",
      current: bookingsCount,
      next: 10,
      percent: (bookingsCount / 10) * 100,
      color: "text-orange-700",
      bg: "bg-orange-100",
      bar: "bg-orange-500",
      icon: Shield,
      message: `Faltam ${10 - bookingsCount} reservas para o Nível Prata`,
      reward: "Desbloqueia 5% de desconto avulso",
      isMax: false,
    };
  if (bookingsCount < 30)
    return {
      name: "Prata",
      current: bookingsCount,
      next: 30,
      percent: (bookingsCount / 30) * 100,
      color: "text-slate-700",
      bg: "bg-slate-200",
      bar: "bg-slate-400",
      icon: Star,
      message: `Faltam ${30 - bookingsCount} reservas para o Nível Ouro`,
      reward: "Prioridade máxima nas buscas",
      isMax: false,
    };
  if (bookingsCount < 100)
    return {
      name: "Ouro",
      current: bookingsCount,
      next: 100,
      percent: (bookingsCount / 100) * 100,
      color: "text-amber-700",
      bg: "bg-amber-100",
      bar: "bg-amber-500",
      icon: Crown,
      message: `Faltam ${100 - bookingsCount} reservas para o Nível Diamante`,
      reward: "Acesso antecipado e Suporte VIP",
      isMax: false,
    };
  return {
    name: "Diamante",
    current: bookingsCount,
    next: bookingsCount,
    percent: 100,
    color: "text-cyan-700",
    bg: "bg-cyan-100",
    bar: "bg-cyan-500",
    icon: Gem,
    message: "Você alcançou o nível máximo da plataforma!",
    reward: "Você possui todos os benefícios exclusivos",
    isMax: true,
  };
};

const RequiredAsterisk = () => (
  <span className="text-red-500 ml-1 font-black">*</span>
);

export function ProfileTab() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [view, setView] = useState<ViewState>("overview");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cepLoading, setCepLoading] = useState(false);
  const [uploadingImage, setUploadingImage] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [bookingsCount, setBookingsCount] = useState(0);

  const [walletBalances, setWalletBalances] = useState({
    start: 0,
    vip: 0,
    master: 0,
  });
  const [nextExpiration, setNextExpiration] = useState<Date | null>(null);

  // Estados dos Modais
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>(
    [],
  );
  const [isGiftModalOpen, setIsGiftModalOpen] = useState(false);
  const [isHowItWorksOpen, setIsHowItWorksOpen] = useState(false);
  const [isTimelineOpen, setIsTimelineOpen] = useState(false);
  const [selectedTx, setSelectedTx] = useState<Transaction | null>(null);

  const [giftEmail, setGiftEmail] = useState("");
  const [giftAmount, setGiftAmount] = useState("");
  const [giftTier, setGiftTier] = useState<"start" | "vip" | "master">("start");

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    cpf: "",
    birth_date: "",
    phone: "",
    specialty: "",
    council: "CRM",
    council_number: "",
    avatar_url: "",
    cep: "",
    address_street: "",
    address_number: "",
    address_complement: "",
    address_neighborhood: "",
    address_city: "",
    address_state: "",
  });

  const isProfileComplete = Boolean(
    formData.full_name &&
    formData.cpf &&
    formData.birth_date &&
    formData.address_street &&
    formData.address_number,
  );

  useMobileBack(
    view !== "overview",
    () => setView("overview"),
    "perfil-interno",
  );

  useEffect(() => {
    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return router.push("/login");

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();
        if (error) throw error;

        const { count } = await supabase
          .from("bookings")
          .select("*", { count: "exact", head: true })
          .eq("user_id", user.id)
          .eq("status", "completed");
        setBookingsCount(count || 0);

        if (data) {
          let displayBirthDate = "";
          if (data.birth_date) {
            const [y, m, d] = data.birth_date.split("-");
            if (y && m && d) displayBirthDate = `${d}/${m}/${y}`;
          }

          setFormData({
            full_name: data.full_name || "",
            email: user.email || "",
            cpf: data.cpf || "",
            birth_date: displayBirthDate,
            phone: data.phone || "",
            specialty: data.specialty || "",
            council: data.council || "CRM",
            council_number: data.council_number || "",
            avatar_url: data.avatar_url || "",
            cep: data.cep || "",
            address_street: data.address_street || "",
            address_number: data.address_number || "",
            address_complement: data.address_complement || "",
            address_neighborhood: data.address_neighborhood || "",
            address_city: data.address_city || "",
            address_state: data.address_state || "",
          });
        }
      } catch (error) {
        console.error("Erro ao carregar perfil:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [supabase, router]);

  useEffect(() => {
    if (view === "wallet" || view === "overview") fetchTransactions();
  }, [view]);

  async function fetchTransactions() {
    setLoadingWallet(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;

      const { data, error } = await supabase
        .from("wallet_transactions")
        .select("id, amount, created_at, description, type, tier, expires_at")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });

      if (error) throw error;
      setTransactions(data || []);

      let start = 0,
        vip = 0,
        master = 0;
      const now = new Date();
      let closestExp: Date | null = null;

      data?.forEach((tx) => {
        const amt = Number(tx.amount);
        if (amt > 0 && tx.expires_at && new Date(tx.expires_at) < now) return;

        if (tx.tier === "master") master += amt;
        else if (tx.tier === "vip") vip += amt;
        else start += amt;

        if (amt > 0 && tx.expires_at) {
          const expDate = new Date(tx.expires_at);
          if (!closestExp || expDate < closestExp) closestExp = expDate;
        }
      });

      // EFEITO CASCATA DE SALDOS
      if (start < 0) {
        vip += start;
        start = 0;
      }
      if (vip < 0) {
        master += vip;
        vip = 0;
      }

      setWalletBalances({ start, vip, master });
      setNextExpiration(closestExp);

      const { data: pendingData } = await supabase
        .from("credit_transfers")
        .select("*")
        .eq("sender_id", user.id)
        .eq("status", "pending")
        .order("created_at", { ascending: false });

      if (pendingData) setPendingTransfers(pendingData);
    } catch (err) {
      console.error("Erro ao buscar transações:", err);
    } finally {
      setLoadingWallet(false);
    }
  }

  // ALGORITMO OTIMIZADO: TODOS OS CRÉDITOS A VENCER
  const allExpiringCredits = useMemo(() => {
    const activeCredits = transactions.filter((tx) => {
      const isCred = isCredit(tx.type, Number(tx.amount));
      if (!isCred || !tx.expires_at) return false;
      const expDate = parseISO(tx.expires_at);
      return expDate >= new Date();
    });

    return activeCredits.sort(
      (a, b) =>
        new Date(a.expires_at!).getTime() - new Date(b.expires_at!).getTime(),
    );
  }, [transactions]);

  const handleSendGift = async () => {
    if (!giftEmail || !giftAmount || Number(giftAmount) <= 0) {
      return toast({
        variant: "destructive",
        title: "Preencha todos os campos corretamente.",
      });
    }

    if (Number(giftAmount) > walletBalances[giftTier]) {
      return toast({
        variant: "destructive",
        title: "Saldo insuficiente nesta categoria.",
      });
    }

    setActionLoading(true);
    try {
      const response = await fetch("/api/wallet/transfer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          receiverEmail: giftEmail.trim(),
          amount: Number(giftAmount),
          tier: giftTier,
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);

      toast({
        title:
          data.status === "pending"
            ? "Convite VIP Enviado!"
            : "Presente Entregue! 🎉",
        description: data.message,
      });
      setIsGiftModalOpen(false);
      setGiftEmail("");
      setGiftAmount("");
      fetchTransactions();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro na transferência",
        description: error.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleRevokeGift = async (transfer: PendingTransfer) => {
    setActionLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      await supabase
        .from("credit_transfers")
        .update({ status: "cancelled" })
        .eq("id", transfer.id);
      await supabase.from("wallet_transactions").insert({
        user_id: user.id,
        amount: transfer.amount,
        type: "refund",
        tier: transfer.tier,
        description: `Estorno de Fusion Gift (${transfer.receiver_email})`,
      });
      toast({
        title: "Convite Revogado",
        description: "As horas retornaram para o seu saldo.",
      });
      fetchTransactions();
    } catch (error) {
      toast({ variant: "destructive", title: "Erro ao cancelar." });
    } finally {
      setActionLoading(false);
    }
  };

  const totalBalance =
    walletBalances.start + walletBalances.vip + walletBalances.master;

  const handleLogout = async () => {
    setLoading(true);
    try {
      await supabase.auth.signOut();
      for (let key in localStorage)
        if (key.startsWith("sb-")) localStorage.removeItem(key);
      sessionStorage.clear();
      window.location.href = "/login";
    } catch (error) {
      toast({ variant: "destructive", title: "Erro ao sair" });
      setLoading(false);
    }
  };

  const handleCpfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 11) value = value.slice(0, 11);
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d)/, "$1.$2");
    value = value.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    setFormData({ ...formData, cpf: value });
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);
    if (value.length > 4)
      value = value.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, "$1/$2/$3");
    else if (value.length > 2)
      value = value.replace(/^(\d{2})(\d{1,2}).*/, "$1/$2");
    setFormData({ ...formData, birth_date: value });
  };

  const handleCepChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    let value = e.target.value.replace(/\D/g, "");
    if (value.length > 8) value = value.slice(0, 8);
    value = value.replace(/^(\d{5})(\d)/, "$1-$2");
    setFormData({ ...formData, cep: value });
  };

  const handleSearchCep = async () => {
    const cleanCep = formData.cep.replace(/\D/g, "");
    if (cleanCep.length !== 8)
      return toast({ variant: "destructive", title: "CEP Inválido" });
    setCepLoading(true);
    try {
      const response = await fetch(
        `https://viacep.com.br/ws/${cleanCep}/json/`,
      );
      const data = await response.json();
      if (data.erro) throw new Error("CEP não encontrado.");
      setFormData((prev) => ({
        ...prev,
        address_street: data.logradouro || "",
        address_neighborhood: data.bairro || "",
        address_city: data.localidade || "",
        address_state: data.uf || "",
      }));
      toast({ title: "Endereço encontrado!" });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message,
      });
    } finally {
      setCepLoading(false);
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploadingImage(true);
      if (!e.target.files || e.target.files.length === 0)
        throw new Error("Selecione uma imagem.");
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");
      const file = e.target.files[0];
      const fileExt = file.name.split(".").pop();
      const fileName = `${user.id}/profile.${fileExt}`;
      const { error: uploadError } = await supabase.storage
        .from("avatars")
        .upload(fileName, file, { upsert: true, cacheControl: "3600" });
      if (uploadError) throw uploadError;
      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);
      setFormData({
        ...formData,
        avatar_url: `${publicUrl}?t=${new Date().getTime()}`,
      });
      toast({ title: "Foto atualizada!" });
    } catch (error: any) {
      toast({ variant: "destructive", title: "Erro no upload" });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (formData.cpf && !isValidCPF(formData.cpf))
      return toast({ variant: "destructive", title: "CPF Inválido" });
    let dbBirthDate = null;
    if (formData.birth_date) {
      if (formData.birth_date.length !== 10)
        return toast({ variant: "destructive", title: "Data Inválida" });
      const [d, m, y] = formData.birth_date.split("/");
      dbBirthDate = `${y}-${m}-${d}`;
      const dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
      if (
        isNaN(dateObj.getTime()) ||
        dateObj.getFullYear() > new Date().getFullYear() ||
        dateObj.getFullYear() < 1900
      ) {
        return toast({ variant: "destructive", title: "Data Inválida" });
      }
    }
    setSaving(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado.");
      const { error } = await supabase
        .from("profiles")
        .update({
          full_name: formData.full_name,
          cpf: formData.cpf,
          birth_date: dbBirthDate,
          phone: formData.phone,
          specialty: formData.specialty,
          council: formData.council,
          council_number: formData.council_number,
          avatar_url: formData.avatar_url,
          cep: formData.cep,
          address_street: formData.address_street,
          address_number: formData.address_number,
          address_complement: formData.address_complement,
          address_neighborhood: formData.address_neighborhood,
          address_city: formData.address_city,
          address_state: formData.address_state,
        })
        .eq("id", user.id);
      if (error) throw error;
      toast({ title: "Perfil salvo! 🎉" });
      setView("overview");
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  // ==========================================
  // VIEW: CARTEIRA DIGITAL (WALLET)
  // ==========================================
  if (view === "wallet") {
    return (
      <div className="p-4 lg:p-8 animate-in slide-in-from-right-8 duration-300 max-w-2xl mx-auto w-full pb-32">
        <div className="mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setView("overview")}
              className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center hover:bg-slate-50 text-slate-600 transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-black text-slate-900">
                Minha Carteira
              </h1>
              <p className="text-sm text-slate-500 font-medium">
                Gestão de créditos e histórico de uso.
              </p>
            </div>
          </div>
          <Button
            onClick={() => setIsHowItWorksOpen(true)}
            variant="outline"
            className="rounded-full text-xs font-bold text-slate-600 border-slate-200"
          >
            <Info className="w-4 h-4 mr-1.5" /> Como funciona?
          </Button>
        </div>

        {/* CARTÃO DE CRÉDITO DIGITAL LUXUOSO */}
        <div className="bg-slate-900 p-6 md:p-8 rounded-3xl text-white shadow-xl relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#f05e23]/30 rounded-full blur-3xl -mr-10 -mt-10"></div>

          <div className="relative z-10 flex flex-col md:flex-row gap-8 justify-between">
            <div className="flex-1">
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Wallet className="w-5 h-5" /> Saldo Disponível
              </p>
              <h3 className="text-5xl font-black tracking-tight mb-5">
                {totalBalance}{" "}
                <span className="text-2xl font-bold text-slate-400 ml-1">
                  CR
                </span>
              </h3>

              <div className="flex flex-col sm:flex-row gap-3 w-full">
                <Button
                  onClick={() => toast({ title: "Em breve" })}
                  className="w-full sm:flex-1 h-12 px-6 rounded-xl font-black bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg text-sm"
                >
                  <PlusCircle className="w-4 h-4 mr-2" /> Comprar Pass
                </Button>
                <Button
                  onClick={() => setIsGiftModalOpen(true)}
                  className="w-full sm:flex-1 h-12 px-6 rounded-xl font-black bg-white/10 hover:bg-white/20 border border-white/10 text-white shadow-lg text-sm transition-all"
                >
                  <Gift className="w-4 h-4 mr-2 text-amber-400" /> Presentear
                </Button>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-md rounded-xl p-5 border border-white/10 min-w-[200px] h-fit">
              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">
                Saldos por Categoria
              </p>
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-sm font-semibold flex items-center gap-1.5">
                  <Shield className="w-4 h-4 text-slate-400" /> Basic
                </span>
                <span className="font-bold">{walletBalances.start}</span>
              </div>
              <div className="flex justify-between items-center mb-2.5">
                <span className="text-sm font-semibold flex items-center gap-1.5 text-purple-300">
                  <Star className="w-4 h-4" /> VIP
                </span>
                <span className="font-bold text-purple-300">
                  {walletBalances.vip}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm font-semibold flex items-center gap-1.5 text-amber-300">
                  <Crown className="w-4 h-4" /> Premium
                </span>
                <span className="font-bold text-amber-300">
                  {walletBalances.master}
                </span>
              </div>
            </div>
          </div>

          {/* NOVA TIMELINE DE VENCIMENTOS NO CARTÃO */}
          {allExpiringCredits.length > 0 && (
            <div className="relative z-10 mt-6 pt-5 border-t border-white/10">
              <div className="flex items-center justify-between mb-4">
                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-amber-400" /> Próximos a
                  Vencer
                </p>
                <button
                  onClick={() => setIsTimelineOpen(true)}
                  className="text-[10px] font-bold text-[#f05e23] hover:text-[#d6521e] uppercase tracking-wider bg-[#f05e23]/10 px-2 py-1 rounded-md transition-colors"
                >
                  Ver Todos ({allExpiringCredits.length})
                </button>
              </div>

              <div className="space-y-2">
                {allExpiringCredits.slice(0, 2).map((tx) => {
                  const daysLeft = differenceInDays(
                    parseISO(tx.expires_at!),
                    new Date(),
                  );
                  const isPremium = tx.tier === "master";
                  const isVip = tx.tier === "vip";

                  return (
                    <div
                      key={`exp-${tx.id}`}
                      onClick={() => setSelectedTx(tx)}
                      className="flex flex-col bg-white/5 hover:bg-white/10 transition-colors rounded-xl p-3 border border-white/10 cursor-pointer group"
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <span className="text-xs font-bold text-slate-300 truncate flex-1 group-hover:text-white transition-colors">
                          {tx.description || "Movimentação Fusion"}
                        </span>
                        <Badge className="bg-white/10 text-white border-0 shadow-none text-[8px] uppercase px-1.5 py-0 shrink-0">
                          {isPremium ? "Premium" : isVip ? "VIP" : "Basic"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-lg font-black text-white leading-none">
                          {tx.amount}h
                        </span>
                        <span
                          className={`text-[10px] font-bold px-2 py-0.5 rounded-md ${daysLeft <= 5 ? "bg-red-500/20 text-red-400" : "bg-amber-500/20 text-amber-400"}`}
                        >
                          {daysLeft === 0
                            ? "Expira hoje"
                            : `Expira em ${daysLeft} dias`}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* CONVITES PENDENTES */}
        {pendingTransfers.length > 0 && (
          <section className="pt-2 mb-8">
            <h3 className="text-lg font-black text-slate-900 flex items-center gap-2 mb-4">
              <Clock className="w-5 h-5 text-amber-500" /> Convites Pendentes
            </h3>
            <div className="space-y-3">
              {pendingTransfers.map((pt) => (
                <div
                  key={pt.id}
                  className="bg-white border border-slate-200 p-4 rounded-2xl shadow-sm flex flex-col sm:flex-row sm:items-center justify-between gap-4 transition-all hover:border-slate-300"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center shrink-0">
                      <Mail className="w-4 h-4 text-slate-500" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-slate-900">
                        {pt.receiver_email}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">
                        Enviado em{" "}
                        {pt.created_at
                          ? format(parseISO(pt.created_at), "dd/MM/yyyy")
                          : "Recente"}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between sm:justify-end w-full sm:w-auto gap-4">
                    <div className="flex items-center gap-1.5">
                      <span className="font-black text-lg text-slate-900">
                        {pt.amount}h
                      </span>
                      <Badge className="bg-slate-100 text-slate-600 border-0 shadow-none text-[9px] uppercase">
                        {pt.tier === "master"
                          ? "Premium"
                          : pt.tier === "vip"
                            ? "VIP"
                            : "Basic"}
                      </Badge>
                    </div>
                    <Button
                      onClick={() => handleRevokeGift(pt)}
                      disabled={actionLoading}
                      variant="ghost"
                      className="text-xs font-bold text-red-500 hover:text-red-600 hover:bg-red-50 h-8 px-3 rounded-lg"
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" /> Revogar
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* EXTRATO ESTILO LIVELO */}
        <div>
          <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-[#f05e23]" /> Extrato
          </h3>

          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
            {loadingWallet ? (
              <div className="flex justify-center items-center py-16">
                <Loader2 className="w-8 h-8 animate-spin text-slate-300" />
              </div>
            ) : transactions.length === 0 ? (
              <div className="text-center py-16 px-4">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Receipt className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-bold text-slate-900">Nenhuma movimentação</p>
                <p className="text-sm text-slate-500 font-medium mt-1">
                  Seu extrato aparecerá aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const credit = isCredit(tx.type, Number(tx.amount));

                  return (
                    <div
                      key={tx.id}
                      onClick={() => setSelectedTx(tx)}
                      className="p-5 flex flex-col gap-1 hover:bg-slate-50 transition-colors cursor-pointer relative"
                    >
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                        {tx.created_at
                          ? format(parseISO(tx.created_at), "dd/MM/yyyy", {
                              locale: ptBR,
                            })
                          : "Recente"}
                      </span>
                      <span className="text-xs font-semibold text-slate-500">
                        {credit ? "Acúmulo / Crédito" : "Uso de Crédito"}
                      </span>
                      <span className="text-base font-black text-slate-900 pr-16 truncate">
                        {tx.description || "Movimentação Fusion"}
                      </span>
                      <span
                        className={`text-xl font-black mt-1 ${credit ? "text-emerald-600" : "text-slate-700"}`}
                      >
                        {credit ? "+" : ""} {tx.amount} horas
                      </span>

                      {credit && tx.expires_at && (
                        <div className="mt-2 inline-flex items-center gap-1.5 bg-slate-100/80 px-2 py-1 rounded-md w-fit">
                          <Clock className="w-3.5 h-3.5 text-slate-500" />
                          <span className="text-[10px] font-bold text-slate-600">
                            Expira em{" "}
                            {format(parseISO(tx.expires_at), "dd/MM/yyyy", {
                              locale: ptBR,
                            })}
                          </span>
                        </div>
                      )}

                      <div className="absolute right-5 top-1/2 -translate-y-1/2 text-slate-300">
                        <ChevronRight className="w-5 h-5" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* MODAL: TIMELINE DE VENCIMENTOS */}
        <Dialog open={isTimelineOpen} onOpenChange={setIsTimelineOpen}>
          <DialogContent className="sm:max-w-md rounded-[2rem] p-6 bg-white border-0 [&>button]:hidden">
            <button
              onClick={() => setIsTimelineOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors z-50"
            >
              <X className="w-4 h-4" />
            </button>
            <DialogTitle className="sr-only">
              Timeline de Vencimentos
            </DialogTitle>
            <DialogDescription className="sr-only">
              Lista completa de todos os créditos que vão expirar.
            </DialogDescription>

            <DialogHeader className="mb-4">
              <div className="w-12 h-12 bg-amber-50 rounded-2xl flex items-center justify-center mb-4">
                <CalendarDays className="w-6 h-6 text-amber-500" />
              </div>
              <h2 className="text-xl font-black text-slate-900">
                Seus Vencimentos
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Acompanhe a data exata de expiração dos seus créditos ativos.
              </p>
            </DialogHeader>

            <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
              {allExpiringCredits.length === 0 ? (
                <p className="text-slate-500 text-center py-6">
                  Você não possui créditos a vencer.
                </p>
              ) : (
                allExpiringCredits.map((tx) => {
                  const daysLeft = differenceInDays(
                    parseISO(tx.expires_at!),
                    new Date(),
                  );
                  const isPremium = tx.tier === "master";
                  const isVip = tx.tier === "vip";

                  return (
                    <div
                      key={`modal-exp-${tx.id}`}
                      className="flex flex-col bg-slate-50 rounded-xl p-4 border border-slate-100"
                    >
                      <div className="flex justify-between items-start mb-2 gap-2">
                        <span className="text-xs font-bold text-slate-600 truncate flex-1">
                          {tx.description || "Movimentação Fusion"}
                        </span>
                        <Badge className="bg-white text-slate-600 border border-slate-200 shadow-none text-[8px] uppercase px-1.5 py-0 shrink-0">
                          {isPremium ? "Premium" : isVip ? "VIP" : "Basic"}
                        </Badge>
                      </div>
                      <div className="flex justify-between items-end">
                        <span className="text-xl font-black text-slate-900 leading-none">
                          {tx.amount}h
                        </span>
                        <div className="text-right">
                          <span
                            className={`text-[10px] font-bold block mb-0.5 ${daysLeft <= 5 ? "text-red-500" : "text-amber-500"}`}
                          >
                            {daysLeft === 0
                              ? "Expira hoje"
                              : `Expira em ${daysLeft} dias`}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400">
                            {format(parseISO(tx.expires_at!), "dd/MM/yyyy")}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </DialogContent>
        </Dialog>

        {/* MODAL DE TRANSFERÊNCIA */}
        <Dialog open={isGiftModalOpen} onOpenChange={setIsGiftModalOpen}>
          <DialogContent className="sm:max-w-md rounded-[2rem] p-6 bg-white border-0 [&>button]:hidden">
            <button
              onClick={() => setIsGiftModalOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors z-50"
            >
              <X className="w-4 h-4" />
            </button>
            <DialogTitle className="sr-only">Enviar Fusion Gift</DialogTitle>
            <DialogDescription className="sr-only">
              Formulário para presentear um colega com horas.
            </DialogDescription>
            <DialogHeader className="mb-4">
              <div className="w-12 h-12 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
                <Gift className="w-6 h-6 text-[#f05e23]" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">
                Enviar Fusion Gift
              </h2>
              <p className="text-sm font-medium text-slate-500">
                Transfira horas não utilizadas para um colega. Se ele não tiver
                conta, enviaremos um convite VIP.
              </p>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                  E-mail do Destinatário
                </Label>
                <Input
                  type="email"
                  placeholder="dr.colega@email.com"
                  value={giftEmail}
                  onChange={(e) => setGiftEmail(e.target.value)}
                  className="h-12 rounded-xl bg-slate-50 border-slate-200"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Qtd de Horas
                  </Label>
                  <Input
                    type="number"
                    min="1"
                    placeholder="Ex: 4"
                    value={giftAmount}
                    onChange={(e) => setGiftAmount(e.target.value)}
                    className="h-12 rounded-xl bg-slate-50 border-slate-200 font-black text-lg"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                    Qual Pacote?
                  </Label>
                  <select
                    value={giftTier}
                    onChange={(e) => setGiftTier(e.target.value as any)}
                    className="h-12 bg-slate-50 border border-slate-200 rounded-xl px-3 outline-none font-bold text-slate-700 w-full"
                  >
                    <option value="start">
                      Basic ({walletBalances.start}h)
                    </option>
                    <option value="vip">VIP ({walletBalances.vip}h)</option>
                    <option value="master">
                      Premium ({walletBalances.master}h)
                    </option>
                  </select>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6">
              <Button
                onClick={handleSendGift}
                disabled={actionLoading}
                className="w-full h-14 bg-[#f05e23] hover:bg-[#d6521e] text-white font-black rounded-xl shadow-lg shadow-orange-500/20 text-base transition-all active:scale-95"
              >
                {actionLoading ? (
                  <Loader2 className="w-5 h-5 animate-spin" />
                ) : (
                  "Confirmar e Enviar"
                )}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* MODAL DETALHES DA TRANSAÇÃO */}
        <Dialog
          open={!!selectedTx}
          onOpenChange={(open) => !open && setSelectedTx(null)}
        >
          <DialogContent className="sm:max-w-sm rounded-[2rem] p-0 overflow-hidden bg-white border-0 gap-0 [&>button]:hidden">
            <button
              onClick={() => setSelectedTx(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-200/50 hover:bg-slate-200 text-slate-600 transition-colors z-50"
            >
              <X className="w-4 h-4" />
            </button>
            <DialogTitle className="sr-only">Detalhes da Transação</DialogTitle>
            <DialogDescription className="sr-only">
              Informações detalhadas sobre a movimentação da carteira.
            </DialogDescription>

            {selectedTx &&
              (() => {
                const credit = isCredit(
                  selectedTx.type,
                  Number(selectedTx.amount),
                );
                const isTransfer = selectedTx.type?.includes("transfer");
                const tierName =
                  selectedTx.tier === "master"
                    ? "Premium"
                    : selectedTx.tier === "vip"
                      ? "VIP"
                      : "Basic";

                return (
                  <div className="flex flex-col">
                    <div
                      className={`p-8 pb-12 flex flex-col items-center justify-center text-center ${credit ? "bg-emerald-50" : "bg-slate-50"}`}
                    >
                      <div
                        className={`w-16 h-16 rounded-full flex items-center justify-center mb-4 shadow-sm border ${credit ? "bg-white border-emerald-100" : "bg-white border-slate-200"}`}
                      >
                        {isTransfer ? (
                          <ArrowRightLeft
                            className={`w-8 h-8 ${credit ? "text-emerald-500" : "text-slate-400"}`}
                          />
                        ) : credit ? (
                          <ArrowDownRight className="w-8 h-8 text-emerald-500" />
                        ) : (
                          <ArrowUpRight className="w-8 h-8 text-slate-400" />
                        )}
                      </div>
                      <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-2">
                        {credit ? "Entrada de Crédito" : "Saída de Crédito"}
                      </p>
                      <h3
                        className={`text-4xl font-black ${credit ? "text-emerald-600" : "text-slate-900"}`}
                      >
                        {credit ? "+" : ""}
                        {selectedTx.amount}h
                      </h3>
                    </div>

                    <div className="p-6 space-y-5 bg-white -mt-6 rounded-t-3xl relative z-10 shadow-[0_-10px_20px_-10px_rgba(0,0,0,0.05)]">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">
                          Descrição do Lançamento
                        </p>
                        <p className="font-black text-slate-900 text-lg leading-tight">
                          {selectedTx.description}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-4 border-t border-slate-100 pt-4">
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Data da Operação
                          </p>
                          <p className="font-bold text-slate-900">
                            {selectedTx.created_at
                              ? format(
                                  parseISO(selectedTx.created_at),
                                  "dd/MM/yyyy",
                                )
                              : "Recente"}
                          </p>
                        </div>
                        <div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">
                            Categoria
                          </p>
                          <Badge className="bg-slate-100 text-slate-700 border-0 shadow-none hover:bg-slate-100">
                            {tierName}
                          </Badge>
                        </div>
                      </div>

                      {credit && selectedTx.expires_at && (
                        <div className="border-t border-slate-100 pt-4 bg-amber-50/50 -mx-6 px-6 pb-4 mt-4">
                          <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider flex items-center gap-1.5 mb-1">
                            <Clock className="w-3.5 h-3.5" /> Validade dos
                            Créditos
                          </p>
                          <p className="font-black text-amber-700 text-lg">
                            {format(
                              parseISO(selectedTx.expires_at),
                              "dd/MM/yyyy",
                            )}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}
          </DialogContent>
        </Dialog>

        {/* MODAL COMO FUNCIONA */}
        <Dialog open={isHowItWorksOpen} onOpenChange={setIsHowItWorksOpen}>
          <DialogContent className="sm:max-w-md rounded-[2rem] p-6 bg-white border-0 [&>button]:hidden">
            <button
              onClick={() => setIsHowItWorksOpen(false)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 hover:bg-slate-200 text-slate-500 transition-colors z-50"
            >
              <X className="w-4 h-4" />
            </button>
            <DialogTitle className="sr-only">Como Funciona</DialogTitle>
            <DialogDescription className="sr-only">
              Regras da carteira e validade de horas
            </DialogDescription>
            <DialogHeader className="mb-4">
              <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center mb-4">
                <HelpCircle className="w-6 h-6 text-blue-500" />
              </div>
              <h2 className="text-2xl font-black text-slate-900">
                Como funciona o Fusion Pass
              </h2>
            </DialogHeader>

            <div className="space-y-6">
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
                  <Clock className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900">
                    Validade de 30 dias
                  </h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed mt-1">
                    Todos os pacotes de horas que você adquire possuem uma
                    validade de exatos 30 dias a partir do momento do pagamento.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
                  <ArrowDownRight className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900">
                    Efeito Cascata (Vantagem)
                  </h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed mt-1">
                    Pacotes de alto padrão podem alugar salas de padrão menor.
                    Ex: Se você usar suas horas "Premium" em uma sala "Basic", o
                    sistema descontará da sua carteira Premium automaticamente.
                  </p>
                </div>
              </div>
              <div className="flex gap-4 items-start">
                <div className="w-10 h-10 rounded-full bg-slate-50 flex items-center justify-center shrink-0 border border-slate-100">
                  <Gift className="w-5 h-5 text-slate-600" />
                </div>
                <div>
                  <h4 className="font-black text-slate-900">Fusion Gift</h4>
                  <p className="text-sm text-slate-500 font-medium leading-relaxed mt-1">
                    O mês está acabando e sobraram horas? Não as perca!
                    Transfira gratuitamente para um colega médico e ajude-o no
                    início da carreira.
                  </p>
                </div>
              </div>
            </div>

            <DialogFooter className="mt-6 border-t border-slate-100 pt-4">
              <Button
                onClick={() => setIsHowItWorksOpen(false)}
                className="w-full h-12 bg-slate-900 hover:bg-slate-800 text-white font-black rounded-xl"
              >
                Entendi
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    );
  }

  // ==========================================
  // VIEW: VISÃO GERAL (OVERVIEW) E EDIT
  // ==========================================
  if (view === "overview") {
    const tierInfo = getTierInfo(bookingsCount, !!isProfileComplete);

    return (
      <div className="space-y-6 max-w-md mx-auto w-full animate-in fade-in pb-24 pt-8 px-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Meu Perfil
          </h2>
        </div>

        <div className="bg-white rounded-[2rem] p-6 shadow-sm border border-slate-100 flex flex-col gap-6">
          <div className="flex gap-4 items-center">
            <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden shrink-0 border-2 border-slate-50 shadow-inner">
              {formData.avatar_url ? (
                <img
                  src={formData.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <User className="w-8 h-8 text-slate-400" />
              )}
            </div>
            <div className="flex-1 overflow-hidden">
              <h2 className="text-lg font-black text-slate-900 leading-tight truncate">
                {formData.full_name || "Completar Cadastro"}
              </h2>
              <p className="text-sm text-slate-500 font-medium truncate mb-2">
                {formData.email}
              </p>

              <Badge
                className={`border-0 font-bold px-2 py-0.5 shadow-none ${tierInfo.bg} ${tierInfo.color}`}
              >
                <tierInfo.icon className="w-3.5 h-3.5 mr-1" /> Nível{" "}
                {tierInfo.name}
              </Badge>
            </div>
          </div>

          <div className="pt-4 border-t border-slate-50">
            <div className="flex justify-between items-end mb-2">
              <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                {tierInfo.message}
              </p>
              <span className="text-xs font-black text-slate-900">
                {!tierInfo.isMax && `${tierInfo.current} / ${tierInfo.next}`}
              </span>
            </div>
            <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden mb-3">
              <div
                className={`h-full rounded-full transition-all duration-1000 ${tierInfo.bar}`}
                style={{ width: `${tierInfo.percent}%` }}
              />
            </div>

            {/* NOVO: RECOMPENSA DE NÍVEL (GAMIFICAÇÃO) */}
            <div
              className={`flex items-center gap-2 px-3 py-2 rounded-xl border ${tierInfo.bg.replace("bg-", "border-").replace("100", "200")} ${tierInfo.bg.replace("100", "50")}`}
            >
              <Trophy className={`w-4 h-4 shrink-0 ${tierInfo.color}`} />
              <p className={`text-xs font-bold ${tierInfo.color}`}>
                <span className="opacity-70 uppercase tracking-wider text-[9px] block mb-0.5">
                  Sua Recompensa
                </span>
                {tierInfo.reward}
              </p>
            </div>
          </div>
        </div>

        <div
          onClick={() => setView("wallet")}
          className="cursor-pointer bg-[#ea580c] rounded-[2rem] p-6 text-white shadow-lg flex items-center justify-between hover:scale-[1.02] transition-transform duration-300"
        >
          <div>
            <p className="text-xs font-bold text-white/90 uppercase tracking-widest mb-1 flex items-center gap-2">
              <Wallet className="w-4 h-4" /> Créditos Totais
            </p>
            <div className="flex items-baseline gap-1.5">
              <span className="text-5xl font-black">{totalBalance}</span>
              <span className="text-xl font-bold text-white/90">CR</span>
            </div>
          </div>

          <div className="w-12 h-12 rounded-full bg-white/20 flex items-center justify-center backdrop-blur-md">
            <ChevronRight className="w-6 h-6 text-white" />
          </div>
        </div>

        {!isProfileComplete && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-[2rem] flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-900">Ação Necessária</p>
              <p className="text-xs text-red-700 font-medium mt-1 mb-2">
                Preencha seu CPF, Endereço e Data de Nascimento para reservar
                salas.
              </p>
              <Button
                onClick={() => setView("edit")}
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-bold h-8 rounded-xl"
              >
                Completar Agora
              </Button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-[2rem] shadow-sm border border-slate-100 overflow-hidden divide-y divide-slate-100">
          <button
            onClick={() => setView("edit")}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-500">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-900">Meus Dados</p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Informações pessoais e endereço
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </button>

          <button
            onClick={() =>
              toast({
                title: "Central de Ajuda",
                description: "Redirecionando para o suporte...",
              })
            }
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-500">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-900">Central de Ajuda</p>
                <p className="text-xs font-medium text-slate-500 mt-0.5">
                  Dúvidas frequentes e suporte
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300" />
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-between p-5 hover:bg-red-50/50 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-50 flex items-center justify-center text-red-500 group-hover:bg-red-100 transition-colors">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-red-600">Encerrar Sessão</p>
                <p className="text-xs font-medium text-red-500/70 mt-0.5">
                  Sair da sua conta
                </p>
              </div>
            </div>
          </button>
        </div>
      </div>
    );
  }

  // ==========================================
  // VIEW: EDITAR DADOS (EDIT)
  // ==========================================
  return (
    <div className="p-4 lg:p-8 animate-in slide-in-from-right-8 duration-300 max-w-4xl mx-auto w-full pb-32">
      <div className="mb-6 flex items-center gap-4">
        <button
          onClick={() => setView("overview")}
          className="w-10 h-10 bg-white border border-slate-200 rounded-full flex items-center justify-center hover:bg-slate-50 text-slate-600"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-black text-slate-900">
            Completar Perfil
          </h1>
          <p className="text-sm text-slate-500 font-medium">
            Preencha seus dados para habilitar reservas.
          </p>
        </div>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        <div className="bg-white border border-slate-200 p-6 rounded-[2rem] shadow-sm flex flex-col sm:flex-row items-center gap-6">
          <div className="relative group shrink-0">
            <div className="w-24 h-24 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200">
              {formData.avatar_url ? (
                <img
                  src={formData.avatar_url}
                  alt="Avatar"
                  className="w-full h-full object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-slate-400">
                  <User className="w-10 h-10" />
                </div>
              )}
            </div>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="absolute bottom-0 right-0 w-8 h-8 bg-slate-900 rounded-full flex items-center justify-center text-white border-2 border-white hover:bg-slate-800 transition-colors"
            >
              {uploadingImage ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Camera className="w-4 h-4" />
              )}
            </button>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleImageUpload}
              accept="image/*"
              className="hidden"
            />
          </div>
          <div className="text-center sm:text-left">
            <h3 className="font-bold text-slate-900 flex items-center justify-center sm:justify-start gap-2">
              Foto de Perfil{" "}
              <span className="text-xs text-slate-400 font-normal">
                (Opcional)
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Sua foto será mostrada para os anfitriões ao realizar uma reserva.
            </p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-[2rem] shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
            <User className="w-5 h-5 text-[#f05e23]" /> Dados Pessoais
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                Nome Completo <RequiredAsterisk />
              </Label>
              <Input
                required
                value={formData.full_name}
                onChange={(e) =>
                  setFormData({ ...formData, full_name: e.target.value })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                CPF <RequiredAsterisk />
              </Label>
              <Input
                required
                placeholder="000.000.000-00"
                value={formData.cpf}
                onChange={handleCpfChange}
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                Data de Nascimento <RequiredAsterisk />
              </Label>
              <Input
                type="text"
                required
                placeholder="DD/MM/AAAA"
                value={formData.birth_date}
                onChange={handleDateChange}
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                Telefone / WhatsApp <RequiredAsterisk />
              </Label>
              <Input
                required
                placeholder="(00) 00000-0000"
                value={formData.phone}
                onChange={(e) =>
                  setFormData({ ...formData, phone: e.target.value })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>

            <div className="space-y-2 md:col-span-2 pt-4 border-t border-slate-100">
              <h4 className="font-bold text-slate-700 mb-2">
                Registro Profissional
              </h4>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                Conselho e Número <RequiredAsterisk />
              </Label>
              <div className="flex gap-2">
                <select
                  required
                  value={formData.council}
                  onChange={(e) =>
                    setFormData({ ...formData, council: e.target.value })
                  }
                  className="h-12 bg-slate-50 border border-slate-200 rounded-xl px-3 outline-none w-28 font-bold text-slate-700"
                >
                  <option value="CRM">CRM</option>
                  <option value="CRP">CRP</option>
                  <option value="CRO">CRO</option>
                  <option value="CREFITO">CREFITO</option>
                  <option value="OUTRO">Outro</option>
                </select>
                <Input
                  required
                  placeholder="Nº do Registro"
                  value={formData.council_number}
                  onChange={(e) =>
                    setFormData({ ...formData, council_number: e.target.value })
                  }
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl flex-1"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label className="font-bold text-slate-700">
                Especialidade <RequiredAsterisk />
              </Label>
              <Input
                required
                placeholder="Ex: Psicologia Clínica"
                value={formData.specialty}
                onChange={(e) =>
                  setFormData({ ...formData, specialty: e.target.value })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
          </div>
        </div>

        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-[2rem] shadow-sm">
          <h3 className="text-lg font-black text-slate-900 mb-6 flex items-center gap-2">
            <MapPin className="w-5 h-5 text-[#f05e23]" /> Endereço Residencial
          </h3>

          <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
            <div className="space-y-2 md:col-span-4">
              <Label className="font-bold text-slate-700">
                CEP <RequiredAsterisk />
              </Label>
              <div className="relative flex items-center">
                <Input
                  required
                  placeholder="00000-000"
                  value={formData.cep}
                  onChange={handleCepChange}
                  className="h-12 bg-slate-50 border-slate-200 rounded-xl pr-12"
                />
                <Button
                  type="button"
                  onClick={handleSearchCep}
                  disabled={cepLoading || formData.cep.length < 8}
                  className="absolute right-1 top-1 bottom-1 w-10 h-10 rounded-lg p-0 bg-slate-900 text-white hover:bg-slate-800"
                >
                  {cepLoading ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Search className="w-4 h-4" />
                  )}
                </Button>
              </div>
            </div>
            <div className="space-y-2 md:col-span-8">
              <Label className="font-bold text-slate-700">
                Rua / Logradouro <RequiredAsterisk />
              </Label>
              <Input
                required
                placeholder="Ex: Av. Salgado Filho"
                value={formData.address_street}
                onChange={(e) =>
                  setFormData({ ...formData, address_street: e.target.value })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label className="font-bold text-slate-700">
                Número <RequiredAsterisk />
              </Label>
              <Input
                required
                placeholder="Ex: 1234"
                value={formData.address_number}
                onChange={(e) =>
                  setFormData({ ...formData, address_number: e.target.value })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2 md:col-span-8">
              <Label className="font-bold text-slate-700">
                Complemento{" "}
                <span className="text-xs text-slate-400 font-normal">
                  (Opcional)
                </span>
              </Label>
              <Input
                placeholder="Apto, Bloco, etc."
                value={formData.address_complement}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address_complement: e.target.value,
                  })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2 md:col-span-4">
              <Label className="font-bold text-slate-700">
                Bairro <RequiredAsterisk />
              </Label>
              <Input
                required
                value={formData.address_neighborhood}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address_neighborhood: e.target.value,
                  })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2 md:col-span-5">
              <Label className="font-bold text-slate-700">
                Cidade <RequiredAsterisk />
              </Label>
              <Input
                required
                value={formData.address_city}
                onChange={(e) =>
                  setFormData({ ...formData, address_city: e.target.value })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
            <div className="space-y-2 md:col-span-3">
              <Label className="font-bold text-slate-700">
                Estado (UF) <RequiredAsterisk />
              </Label>
              <Input
                required
                maxLength={2}
                placeholder="RN"
                value={formData.address_state}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    address_state: e.target.value.toUpperCase(),
                  })
                }
                className="h-12 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>
          </div>
        </div>

        <div className="pt-4 flex justify-end">
          <Button
            type="submit"
            disabled={saving}
            className="w-full md:w-auto h-14 px-10 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-black shadow-lg text-lg"
          >
            {saving ? (
              <Loader2 className="w-5 h-5 mr-2 animate-spin" />
            ) : (
              <Save className="w-5 h-5 mr-2" />
            )}
            {saving ? "Salvando..." : "Salvar Perfil"}
          </Button>
        </div>
      </form>
    </div>
  );
}
