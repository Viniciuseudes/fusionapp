"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
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
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";

type ViewState = "overview" | "edit" | "wallet";

// Função Sênior de Validação Matemática de CPF
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

// Componente para o Asterisco Vermelho
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

  const [transactions, setTransactions] = useState<any[]>([]);
  const [loadingWallet, setLoadingWallet] = useState(false);

  const [walletBalances, setWalletBalances] = useState({
    start: 0,
    vip: 0,
    master: 0,
  });
  const [nextExpiration, setNextExpiration] = useState<Date | null>(null);

  const [formData, setFormData] = useState({
    full_name: "",
    email: "",
    cpf: "",
    birth_date: "", // Será manipulada no formato DD/MM/YYYY para a tela
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

  useEffect(() => {
    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          router.push("/login");
          return;
        }

        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (error) throw error;

        if (data) {
          // Converte YYYY-MM-DD do banco para DD/MM/YYYY na tela
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

          if (!data.cpf || !data.address_street || !data.birth_date) {
            setView("edit");
          }
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
    if (view === "wallet" || view === "overview") {
      fetchTransactions();
    }
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
        .select("*")
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
          if (!closestExp || expDate < closestExp) {
            closestExp = expDate;
          }
        }
      });

      setWalletBalances({ start, vip, master });
      setNextExpiration(closestExp);
    } catch (err) {
      console.error("Erro ao buscar transações:", err);
    } finally {
      setLoadingWallet(false);
    }
  }

  const expirationData = useMemo(() => {
    if (!nextExpiration) return { daysLeft: 0, pct: 0 };
    const daysLeft = differenceInDays(nextExpiration, new Date());
    const pct = Math.max(0, Math.min(100, (daysLeft / 30) * 100));
    return { daysLeft, pct };
  }, [nextExpiration]);

  const totalBalance =
    walletBalances.start + walletBalances.vip + walletBalances.master;

  const handleLogout = async () => {
    setLoading(true);

    try {
      await supabase.auth.signOut();

      for (let key in localStorage) {
        if (key.startsWith("sb-")) {
          localStorage.removeItem(key);
        }
      }
      sessionStorage.clear();

      document.cookie.split(";").forEach((c) => {
        document.cookie = c
          .replace(/^ +/, "")
          .replace(/=.*/, "=;expires=" + new Date().toUTCString() + ";path=/");
      });

      window.location.href = "/login";
    } catch (error) {
      console.error("Erro ao sair:", error);
      toast({
        variant: "destructive",
        title: "Erro ao sair",
        description: "Tente novamente em instantes.",
      });
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
    if (value.length > 4) {
      value = value.replace(/^(\d{2})(\d{2})(\d{1,4}).*/, "$1/$2/$3");
    } else if (value.length > 2) {
      value = value.replace(/^(\d{2})(\d{1,2}).*/, "$1/$2");
    }
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
    if (cleanCep.length !== 8) {
      return toast({
        variant: "destructive",
        title: "CEP Inválido",
        description: "Digite um CEP com 8 dígitos.",
      });
    }

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

      toast({
        title: "Endereço encontrado!",
        description: "Preencha apenas o número e o complemento.",
      });
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: error.message || "Não foi possível buscar o CEP.",
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
        .upload(fileName, file, {
          upsert: true,
          cacheControl: "3600",
        });

      if (uploadError) throw uploadError;

      const {
        data: { publicUrl },
      } = supabase.storage.from("avatars").getPublicUrl(fileName);
      const finalUrl = `${publicUrl}?t=${new Date().getTime()}`;

      setFormData({ ...formData, avatar_url: finalUrl });
      toast({ title: "Foto atualizada!" });
    } catch (error: any) {
      console.error("Erro no upload:", error);
      toast({
        variant: "destructive",
        title: "Erro no upload",
        description:
          "Falha ao processar a imagem. Verifique o Bucket no Supabase.",
      });
    } finally {
      setUploadingImage(false);
    }
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();

    // 1. Validação de CPF
    if (formData.cpf && !isValidCPF(formData.cpf)) {
      return toast({
        variant: "destructive",
        title: "CPF Inválido",
        description: "Por favor, digite um CPF válido e real.",
      });
    }

    // 2. Validação e Conversão da Data de Nascimento (DD/MM/YYYY -> YYYY-MM-DD)
    let dbBirthDate = null;
    if (formData.birth_date) {
      if (formData.birth_date.length !== 10) {
        return toast({
          variant: "destructive",
          title: "Data Inválida",
          description: "Digite a data completa no formato DD/MM/AAAA.",
        });
      }
      const [d, m, y] = formData.birth_date.split("/");
      dbBirthDate = `${y}-${m}-${d}`;

      const dateObj = new Date(`${y}-${m}-${d}T00:00:00`);
      if (
        isNaN(dateObj.getTime()) ||
        dateObj.getFullYear() > new Date().getFullYear() ||
        dateObj.getFullYear() < 1900
      ) {
        return toast({
          variant: "destructive",
          title: "Data Inválida",
          description: "A data de nascimento informada não é coerente.",
        });
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
          birth_date: dbBirthDate, // Envia para o DB no formato YYYY-MM-DD
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

      toast({
        title: "Perfil salvo! 🎉",
        description: "Suas informações foram atualizadas.",
      });
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

  const handleDepositRequest = () => {
    toast({
      title: "Integração Pix em breve!",
      description:
        "O módulo de compra direta de créditos estará disponível na próxima atualização.",
    });
  };

  const isCredit = (type: string, amount: number) => {
    return (
      amount > 0 ||
      ["credit", "deposit", "recharge", "admin_bonus", "refund"].includes(type)
    );
  };

  const isProfileComplete =
    formData.full_name &&
    formData.cpf &&
    formData.birth_date &&
    formData.address_street &&
    formData.address_number;

  if (loading) {
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  // ==========================================
  // RENDER: VISÃO DA CARTEIRA
  // ==========================================
  if (view === "wallet") {
    return (
      <div className="p-4 lg:p-8 animate-in slide-in-from-right-8 duration-300 max-w-2xl mx-auto w-full pb-32">
        <div className="mb-6 flex items-center gap-4">
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

        {/* CARD PRINCIPAL CARTEIRA (CRÉDITOS & TIERS) */}
        <div className="bg-slate-900 p-8 rounded-3xl text-white shadow-xl relative overflow-hidden mb-8">
          <div className="absolute top-0 right-0 w-40 h-40 bg-[#f05e23]/30 rounded-full blur-3xl -mr-10 -mt-10"></div>

          <div className="relative z-10 flex flex-col md:flex-row gap-8 justify-between">
            <div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Wallet className="w-5 h-5" /> Saldo Disponível
              </p>
              <h3 className="text-5xl font-black tracking-tight mb-4">
                {totalBalance}{" "}
                <span className="text-2xl font-bold text-slate-400 ml-1">
                  CR
                </span>
              </h3>

              <Button
                onClick={handleDepositRequest}
                className="w-full sm:w-auto h-12 px-6 rounded-xl font-black bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg text-sm"
              >
                <PlusCircle className="w-4 h-4 mr-2" />
                Comprar Pass
              </Button>
            </div>

            {/* Composição por Tier */}
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
                  <Crown className="w-4 h-4" /> Master
                </span>
                <span className="font-bold text-amber-300">
                  {walletBalances.master}
                </span>
              </div>
            </div>
          </div>

          {/* BARRA DE VENCIMENTO (30 DIAS) */}
          {nextExpiration && totalBalance > 0 && (
            <div className="relative z-10 mt-6 pt-6 border-t border-white/10">
              <div className="flex justify-between text-xs font-bold text-slate-400 mb-2 uppercase tracking-widest">
                <span>Próximo Vencimento</span>
                <span
                  className={
                    expirationData.daysLeft <= 5
                      ? "text-red-400"
                      : "text-emerald-400"
                  }
                >
                  {expirationData.daysLeft} dias restantes
                </span>
              </div>
              <div className="w-full bg-white/10 h-2.5 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-1000 ${expirationData.daysLeft <= 5 ? "bg-red-500" : "bg-emerald-500"}`}
                  style={{ width: `${expirationData.pct}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-400 mt-2 font-medium">
                Os créditos expirados são removidos automaticamente da carteira.
              </p>
            </div>
          )}
        </div>

        {/* EXTRATO */}
        <div>
          <h3 className="text-lg font-black text-slate-900 mb-4 flex items-center gap-2">
            <History className="w-5 h-5 text-[#f05e23]" /> Extrato de Créditos
          </h3>

          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
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
                  Seu histórico de compras e uso de salas aparecerá aqui.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {transactions.map((tx) => {
                  const credit = isCredit(tx.type, Number(tx.amount));
                  return (
                    <div
                      key={tx.id}
                      className="p-4 sm:p-5 flex items-center justify-between hover:bg-slate-50 transition-colors"
                    >
                      <div className="flex items-center gap-4">
                        <div
                          className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 shadow-sm border ${credit ? "bg-emerald-50 border-emerald-100 text-emerald-600" : "bg-slate-50 border-slate-100 text-slate-600"}`}
                        >
                          {credit ? (
                            <ArrowDownRight className="w-6 h-6" />
                          ) : (
                            <ArrowUpRight className="w-6 h-6" />
                          )}
                        </div>
                        <div>
                          <p className="font-bold text-slate-900 text-sm sm:text-base leading-tight">
                            {tx.description ||
                              (credit
                                ? "Recarga de Créditos"
                                : "Reserva de Espaço")}
                          </p>
                          <p className="text-xs font-semibold text-slate-400 mt-1">
                            {format(
                              parseISO(tx.created_at),
                              "dd MMM, yyyy • HH:mm",
                              { locale: ptBR },
                            )}
                          </p>
                        </div>
                      </div>
                      <div className="text-right shrink-0 ml-4">
                        <p
                          className={`font-black text-sm sm:text-base ${credit ? "text-emerald-600" : "text-slate-900"}`}
                        >
                          {credit ? "+" : "-"}
                          {Math.abs(Number(tx.amount))} CR
                        </p>
                        <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest block mt-0.5">
                          {tx.tier === "start" ? "Basic" : tx.tier || "Basic"}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // RENDER: VISÃO GERAL (CARD + MENU)
  // ==========================================
  if (view === "overview") {
    return (
      <div className="space-y-6 max-w-lg mx-auto w-full animate-in fade-in pb-24 pt-6 px-4">
        <div className="text-center mb-6">
          <h2 className="text-2xl font-black text-slate-900">Meu Perfil</h2>
        </div>

        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-20 h-20 rounded-full overflow-hidden bg-slate-100 border-2 border-slate-200 shrink-0">
            {formData.avatar_url ? (
              <img
                src={formData.avatar_url}
                alt={formData.full_name}
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <User className="w-8 h-8" />
              </div>
            )}
          </div>
          <div>
            <h3 className="text-xl font-black text-slate-900 leading-tight mb-1">
              {formData.full_name || "Completar Cadastro"}
            </h3>
            <p className="text-sm font-medium text-slate-500 mb-2">
              {formData.email}
            </p>
            {isProfileComplete ? (
              <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold">
                <ShieldCheck className="w-3 h-3 mr-1" /> Nível Bronze
              </Badge>
            ) : (
              <Badge className="bg-orange-100 text-orange-800 border-0 font-bold">
                <AlertCircle className="w-3 h-3 mr-1" /> Cadastro Incompleto
              </Badge>
            )}
          </div>
        </div>

        {/* CARTEIRA COMPACTA */}
        <div
          onClick={() => setView("wallet")}
          className="cursor-pointer bg-gradient-to-br from-[#f05e23] to-[#d6521e] p-6 sm:p-8 rounded-[2rem] text-white shadow-lg relative overflow-hidden group hover:shadow-xl hover:-translate-y-1 transition-all duration-300"
        >
          <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full blur-2xl transition-transform duration-500 group-hover:scale-150"></div>
          <div className="relative z-10 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-white/80 uppercase tracking-wider mb-1 flex items-center gap-2">
                <Wallet className="w-4 h-4" /> Créditos Totais
              </p>
              <h3 className="text-4xl font-black tracking-tight">
                {totalBalance}{" "}
                <span className="text-xl font-bold ml-1">CR</span>
              </h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-white/10 flex items-center justify-center group-hover:bg-white/20 transition-colors backdrop-blur-sm border border-white/20">
              <ChevronRight className="w-6 h-6 text-white" />
            </div>
          </div>
        </div>

        {!isProfileComplete && (
          <div className="bg-red-50 border border-red-200 p-4 rounded-2xl flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-bold text-red-900">Ação Necessária</p>
              <p className="text-xs text-red-700 font-medium mt-1 mb-2">
                Para conseguir realizar reservas, você precisa preencher seu
                CPF, Endereço e Data de Nascimento.
              </p>
              <Button
                onClick={() => setView("edit")}
                size="sm"
                className="bg-red-600 hover:bg-red-700 text-white font-bold h-8"
              >
                Completar Agora
              </Button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          <button
            onClick={() => setView("edit")}
            className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center text-blue-600">
                <FileText className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-900">Meus Dados</p>
                <p className="text-xs font-medium text-slate-500">
                  Informações pessoais e endereço
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors">
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600">
                <HelpCircle className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-slate-900">Central de Ajuda</p>
                <p className="text-xs font-medium text-slate-500">
                  Dúvidas frequentes e suporte
                </p>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-400" />
          </button>

          <button
            onClick={handleLogout}
            className="w-full flex items-center justify-between p-5 hover:bg-red-50 transition-colors group"
          >
            <div className="flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-red-100 flex items-center justify-center text-red-600 group-hover:bg-red-200 transition-colors">
                <LogOut className="w-5 h-5" />
              </div>
              <div className="text-left">
                <p className="font-bold text-red-600">Encerrar Sessão</p>
                <p className="text-xs font-medium text-red-400">
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
  // RENDER: TELA DE EDIÇÃO (MEUS DADOS)
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
        <div className="bg-white border border-slate-200 p-6 rounded-3xl shadow-sm flex flex-col sm:flex-row items-center gap-6">
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

        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-sm">
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

        <div className="bg-white border border-slate-200 p-6 md:p-8 rounded-3xl shadow-sm">
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
