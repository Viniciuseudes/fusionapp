"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LogOut,
  User,
  Settings,
  CreditCard,
  ChevronRight,
  Award,
  Sparkles,
  MapPin,
  Stethoscope,
  Phone,
  Wallet,
  ArrowUpRight,
  ArrowDownRight,
  PlusCircle,
  Clock,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { format } from "date-fns";
import { ptBR } from "date-fns/locale";

export function ProfileTab() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);

  // Estados financeiros
  const [balance, setBalance] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);

  // Formulário
  const [whatsapp, setWhatsapp] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [council, setCouncil] = useState("");
  const [councilNumber, setCouncilNumber] = useState("");
  const [gender, setGender] = useState("");
  const [cep, setCep] = useState("");

  useEffect(() => {
    async function loadProfileAndWallet() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);

          // 1. Carrega o Perfil
          const { data: profileData } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

          if (profileData) {
            setProfile(profileData);
            setWhatsapp(profileData.whatsapp || "");
            setSpecialty(profileData.specialty || "");
            setCouncil(profileData.council || "");
            setCouncilNumber(profileData.council_number || "");
            setGender(profileData.gender || "");
            setCep(profileData.cep || "");
          }

          // 2. Carrega a Carteira e Extrato
          const { data: walletData, error: walletError } = await supabase
            .from("wallet_transactions")
            .select("*")
            .eq("user_id", user.id)
            .order("created_at", { ascending: false });

          if (!walletError && walletData) {
            setTransactions(walletData);
            // Calcula o saldo atual
            const currentBalance = walletData.reduce((acc, curr) => {
              if (curr.type === "credit" || curr.type === "deposit")
                return acc + Number(curr.amount);
              if (curr.type === "debit" || curr.type === "usage")
                return acc - Number(curr.amount);
              return acc;
            }, 0);
            setBalance(currentBalance);
          }
        }
      } catch (error) {
        console.error("Erro ao carregar dados:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProfileAndWallet();
  }, [supabase]);

  const isBronze = Boolean(
    profile?.whatsapp &&
    profile?.specialty &&
    profile?.council &&
    profile?.council_number &&
    profile?.cep,
  );

  const handleSaveBronzeData = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const { error } = await supabase
        .from("profiles")
        .update({
          whatsapp,
          specialty,
          council,
          council_number: councilNumber,
          gender,
          cep,
        })
        .eq("id", userId);

      if (error) throw error;

      toast({
        title: "Nível Bronze Alcançado! 🥉",
        description: "Seu perfil foi atualizado e as reservas estão liberadas.",
      });

      setProfile({
        ...profile,
        whatsapp,
        specialty,
        council,
        council_number: councilNumber,
        gender,
        cep,
      });
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

  const handleLogout = async () => {
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  };

  const handleRecharge = () => {
    // Na Fase 3, isso vai chamar a API de pagamento (Asaas)
    toast({
      title: "Redirecionando...",
      description: "Abrindo opções de pacotes de horas.",
    });
  };

  const getInitials = (name: string) =>
    name
      ? name
          .split(" ")
          .map((n) => n[0])
          .join("")
          .substring(0, 2)
          .toUpperCase()
      : "US";

  if (loading) return null;

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* CABEÇALHO DO PERFIL */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-5">
        <div className="flex items-center gap-5">
          <Avatar className="h-20 w-20 border-[3px] border-white shadow-lg ring-1 ring-slate-100">
            <AvatarFallback className="bg-slate-900 text-white text-2xl font-black">
              {getInitials(profile?.full_name)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
              {profile?.full_name}
            </h1>
            <div className="flex items-center gap-2 mt-2">
              {isBronze ? (
                <span className="flex items-center gap-1.5 bg-amber-100 text-amber-900 text-xs font-bold px-3 py-1 rounded-full border border-amber-200/50">
                  <Award className="w-3.5 h-3.5 text-amber-600" /> Profissional
                  Bronze
                </span>
              ) : (
                <span className="flex items-center gap-1.5 bg-slate-100 text-slate-600 text-xs font-bold px-3 py-1 rounded-full border border-slate-200">
                  Membro Iniciante
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {!isBronze && (
        /* O formulário de onboarding original continua aqui (simplificado para focar na tela nova) */
        <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
          <h2 className="text-xl font-black mb-4">
            Complete seu perfil para agendar salas
          </h2>
          <form onSubmit={handleSaveBronzeData} className="space-y-4">
            <Input
              required
              placeholder="WhatsApp"
              value={whatsapp}
              onChange={(e) => setWhatsapp(e.target.value)}
            />
            <Input
              required
              placeholder="Especialidade"
              value={specialty}
              onChange={(e) => setSpecialty(e.target.value)}
            />
            <div className="flex gap-2">
              <Input
                required
                placeholder="Conselho"
                value={council}
                onChange={(e) => setCouncil(e.target.value)}
              />
              <Input
                required
                placeholder="Número"
                value={councilNumber}
                onChange={(e) => setCouncilNumber(e.target.value)}
              />
            </div>
            <Input
              required
              placeholder="CEP"
              value={cep}
              onChange={(e) => setCep(e.target.value)}
            />
            <Button
              type="submit"
              disabled={saving}
              className="w-full bg-[#f05e23] text-white font-bold h-12"
            >
              {saving ? "Salvando..." : "Atualizar Perfil"}
            </Button>
          </form>
        </div>
      )}

      {/* SE O MÉDICO ESTIVER VALIDADO, MOSTRAMOS A CARTEIRA E O EXTRATO */}
      {isBronze && (
        <div className="grid grid-cols-1 md:grid-cols-12 gap-8">
          {/* COLUNA ESQUERDA: CARTEIRA */}
          <div className="md:col-span-5 space-y-6">
            <div className="bg-slate-900 text-white rounded-[2rem] p-6 sm:p-8 shadow-xl relative overflow-hidden">
              <div className="absolute top-0 right-0 p-6 opacity-10">
                <Wallet className="w-24 h-24" />
              </div>
              <p className="text-sm font-bold text-slate-400 uppercase tracking-wider mb-2">
                Seu Saldo
              </p>
              <div className="flex items-end gap-2 mb-8">
                <span className="text-5xl font-black">{balance}</span>
                <span className="text-lg font-bold text-slate-400 mb-1">
                  créditos
                </span>
              </div>

              <Button
                onClick={handleRecharge}
                className="w-full bg-[#f05e23] hover:bg-[#d6521e] text-white font-black h-14 rounded-xl text-lg flex items-center gap-2 shadow-lg"
              >
                <PlusCircle className="w-5 h-5" /> Recarregar Horas
              </Button>
            </div>

            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden">
              <div className="divide-y divide-slate-100">
                <button className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
                      <User className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="font-bold text-slate-900 block">
                        Meus Dados
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </button>
                <button className="w-full flex items-center justify-between p-5 hover:bg-slate-50 transition-colors group">
                  <div className="flex items-center gap-4">
                    <div className="p-3 bg-slate-100 text-slate-600 rounded-xl">
                      <Settings className="w-5 h-5" />
                    </div>
                    <div className="text-left">
                      <span className="font-bold text-slate-900 block">
                        Configurações
                      </span>
                    </div>
                  </div>
                  <ChevronRight className="w-5 h-5 text-slate-300" />
                </button>
              </div>
            </div>
          </div>

          {/* COLUNA DIREITA: EXTRATO */}
          <div className="md:col-span-7">
            <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm p-6 sm:p-8 h-full">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-xl font-black text-slate-900">
                  Extrato de Horas
                </h2>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-[#f05e23] font-bold"
                >
                  Ver tudo
                </Button>
              </div>

              <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2 scrollbar-hide">
                {transactions.length === 0 ? (
                  <div className="text-center py-10">
                    <Clock className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                      Você ainda não tem transações.
                    </p>
                  </div>
                ) : (
                  transactions.map((tx) => {
                    const isCredit =
                      tx.type === "credit" || tx.type === "deposit";
                    return (
                      <div
                        key={tx.id}
                        className="flex items-center justify-between p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-slate-100 transition-colors"
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${isCredit ? "bg-emerald-100 text-emerald-600" : "bg-red-100 text-red-600"}`}
                          >
                            {isCredit ? (
                              <ArrowDownRight className="w-5 h-5" />
                            ) : (
                              <ArrowUpRight className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <p className="font-bold text-slate-900 text-sm">
                              {tx.description ||
                                (isCredit
                                  ? "Recarga de Pacote"
                                  : "Reserva de Sala")}
                            </p>
                            <p className="text-xs font-medium text-slate-500 mt-0.5">
                              {format(
                                new Date(tx.created_at),
                                "dd 'de' MMM, HH:mm",
                                { locale: ptBR },
                              )}
                            </p>
                          </div>
                        </div>
                        <div
                          className={`font-black ${isCredit ? "text-emerald-600" : "text-slate-900"}`}
                        >
                          {isCredit ? "+" : "-"}
                          {tx.amount}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* BOTÃO DE LOGOUT */}
      <div className="pt-4 pb-8 flex justify-center">
        <Button
          variant="ghost"
          className="h-12 rounded-xl font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-2" /> Encerrar Sessão
        </Button>
      </div>
    </div>
  );
}
