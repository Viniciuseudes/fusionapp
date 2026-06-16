"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  LogOut,
  User,
  Settings,
  CreditCard,
  Bell,
  ChevronRight,
  Award,
  Sparkles,
  MapPin,
  Stethoscope,
  Phone,
  ShieldCheck,
  CheckCircle2,
  Building2,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

export function ProfileTab() {
  const router = useRouter();
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [userId, setUserId] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);

  const [whatsapp, setWhatsapp] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [council, setCouncil] = useState("");
  const [councilNumber, setCouncilNumber] = useState("");
  const [gender, setGender] = useState("");
  const [cep, setCep] = useState("");

  useEffect(() => {
    async function loadProfile() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) {
          setUserId(user.id);
          const { data } = await supabase
            .from("profiles")
            .select("*")
            .eq("id", user.id)
            .single();

          if (data) {
            setProfile(data);
            setWhatsapp(data.whatsapp || "");
            setSpecialty(data.specialty || "");
            setCouncil(data.council || "");
            setCouncilNumber(data.council_number || "");
            setGender(data.gender || "");
            setCep(data.cep || "");
          }
        }
      } catch (error) {
        console.error("Erro ao carregar perfil:", error);
      } finally {
        setLoading(false);
      }
    }
    loadProfile();
  }, [supabase]);

  // Validação do Nível Bronze
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
    <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* CABEÇALHO DO PERFIL (Estilo Premium) */}
      <div className="flex items-center gap-5">
        <Avatar className="h-20 w-20 border-[3px] border-white shadow-lg ring-1 ring-slate-100">
          <AvatarFallback className="bg-gradient-to-br from-slate-800 to-slate-900 text-white text-2xl font-black">
            {getInitials(profile?.full_name)}
          </AvatarFallback>
        </Avatar>
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight leading-none">
            {profile?.full_name}
          </h1>
          <div className="flex items-center gap-2 mt-2">
            {isBronze ? (
              <span className="flex items-center gap-1.5 bg-gradient-to-r from-amber-100 to-orange-100 text-amber-900 text-xs font-bold px-3 py-1 rounded-full shadow-sm border border-amber-200/50">
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

      {/* ESTADO 1: NÃO É BRONZE (FORMULÁRIO DE ONBOARDING CLEAN) */}
      {!isBronze && (
        <div className="relative overflow-hidden rounded-[2rem] bg-white border border-slate-200 shadow-xl shadow-slate-200/40">
          {/* Decoração de fundo estilo Airbnb */}
          <div className="absolute top-0 right-0 -mr-16 -mt-16 w-64 h-64 rounded-full bg-gradient-to-bl from-orange-100/50 to-transparent blur-3xl pointer-events-none" />

          <div className="p-8 md:p-10 relative z-10">
            <div className="max-w-xl">
              <h2 className="text-2xl font-black text-slate-900 mb-2 flex items-center gap-2">
                Desbloqueie seu potencial{" "}
                <Sparkles className="w-6 h-6 text-[#f05e23]" />
              </h2>
              <p className="text-slate-500 font-medium leading-relaxed mb-8">
                Falta pouco! Complete sua identidade profissional para ganhar o{" "}
                <strong className="text-slate-800">Selo Bronze</strong> e poder
                reservar consultórios de alto padrão instantaneamente.
              </p>
            </div>

            <form onSubmit={handleSaveBronzeData} className="space-y-8">
              {/* Contato */}
              <div className="space-y-4">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
                  <Phone className="w-4 h-4" /> Contato
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">
                      WhatsApp <span className="text-[#f05e23]">*</span>
                    </Label>
                    <Input
                      required
                      placeholder="(00) 00000-0000"
                      value={whatsapp}
                      onChange={(e) => setWhatsapp(e.target.value)}
                      className="h-14 rounded-2xl bg-slate-50/50 border-slate-200 focus-visible:ring-[#f05e23]/20 text-lg px-4"
                    />
                  </div>
                </div>
              </div>

              {/* Atuação Profissional */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
                  <Stethoscope className="w-4 h-4" /> Atuação
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">
                      Especialidade <span className="text-[#f05e23]">*</span>
                    </Label>
                    <Input
                      required
                      placeholder="Ex: Psicologia Clínica"
                      value={specialty}
                      onChange={(e) => setSpecialty(e.target.value)}
                      className="h-14 rounded-2xl bg-slate-50/50 border-slate-200 focus-visible:ring-[#f05e23]/20 text-lg px-4"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">
                      Conselho e Estado{" "}
                      <span className="text-[#f05e23]">*</span>
                    </Label>
                    <Input
                      required
                      placeholder="Ex: CRM-RN"
                      value={council}
                      onChange={(e) => setCouncil(e.target.value)}
                      className="h-14 rounded-2xl bg-slate-50/50 border-slate-200 focus-visible:ring-[#f05e23]/20 text-lg px-4"
                    />
                  </div>
                  <div className="space-y-2 md:col-span-2">
                    <Label className="text-sm font-semibold text-slate-700">
                      Número do Registro{" "}
                      <span className="text-[#f05e23]">*</span>
                    </Label>
                    <Input
                      required
                      placeholder="00000"
                      value={councilNumber}
                      onChange={(e) => setCouncilNumber(e.target.value)}
                      className="h-14 rounded-2xl bg-slate-50/50 border-slate-200 focus-visible:ring-[#f05e23]/20 text-lg px-4"
                    />
                  </div>
                </div>
              </div>

              {/* Localização e Perfil */}
              <div className="space-y-4 pt-4 border-t border-slate-100">
                <div className="flex items-center gap-2 text-sm font-bold text-slate-400 uppercase tracking-wider">
                  <MapPin className="w-4 h-4" /> Localização & Perfil
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">
                      CEP Principal <span className="text-[#f05e23]">*</span>
                    </Label>
                    <Input
                      required
                      placeholder="00000-000"
                      value={cep}
                      onChange={(e) => setCep(e.target.value)}
                      className="h-14 rounded-2xl bg-slate-50/50 border-slate-200 focus-visible:ring-[#f05e23]/20 text-lg px-4"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-slate-700">
                      Como prefere ser chamado?{" "}
                      <span className="text-slate-400 font-normal text-xs">
                        (Opcional)
                      </span>
                    </Label>
                    <Input
                      placeholder="Gênero ou pronome"
                      value={gender}
                      onChange={(e) => setGender(e.target.value)}
                      className="h-14 rounded-2xl bg-slate-50/50 border-slate-200 focus-visible:ring-[#f05e23]/20 text-lg px-4"
                    />
                  </div>
                </div>
              </div>

              <div className="pt-4">
                <Button
                  type="submit"
                  disabled={saving}
                  className="w-full sm:w-auto px-10 h-14 rounded-2xl font-black text-lg bg-slate-900 hover:bg-slate-800 text-white shadow-xl shadow-slate-900/20 transition-all hover:scale-[1.02]"
                >
                  {saving ? "Autenticando..." : "Conquistar Selo Bronze"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ESTADO 2: É BRONZE (MENSAGEM INSPIRADORA E MENU LIBERADO) */}
      {isBronze && (
        <div className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#f05e23] to-[#d6521e] text-white shadow-xl shadow-orange-500/20 p-8 md:p-10">
          <div className="absolute top-0 right-0 opacity-10 pointer-events-none translate-x-1/4 -translate-y-1/4">
            <ShieldCheck className="w-64 h-64" />
          </div>

          <div className="relative z-10">
            <div className="inline-flex items-center justify-center p-3 bg-white/20 rounded-2xl backdrop-blur-sm mb-6">
              <CheckCircle2 className="w-8 h-8 text-white" />
            </div>
            <h2 className="text-3xl font-black mb-3">
              Tudo pronto, Doutor(a)!
            </h2>
            <p className="text-white/90 text-lg max-w-lg leading-relaxed font-medium mb-8">
              Seu perfil profissional está validado. Agora você pode explorar o
              mundo Fusion, agendar clínicas premium sob demanda e focar apenas
              no que importa:{" "}
              <strong className="text-white">
                seus pacientes e seu crescimento.
              </strong>
            </p>

            <Button
              onClick={() => {
                // Como essa tab é renderizada pelo dashboard, para ir para a busca,
                // podemos usar um truque recarregando a página, ou se você tiver acesso ao setTab, chamá-lo.
                // Usando reload para garantir a volta pro catálogo:
                window.location.href = "/dashboard";
              }}
              className="bg-white text-[#f05e23] hover:bg-slate-50 h-14 px-8 rounded-2xl font-black text-lg shadow-lg hover:scale-105 transition-transform"
            >
              <Building2 className="w-5 h-5 mr-2" />
              Explorar Consultórios
            </Button>
          </div>
        </div>
      )}

      {/* MENU PADRÃO DA CONTA (Estilo Apple / Airbnb) */}
      <div className="bg-white rounded-[2rem] border border-slate-200 shadow-sm overflow-hidden mt-8">
        <div className="divide-y divide-slate-100">
          <button className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-blue-50 text-blue-600 rounded-xl group-hover:scale-110 transition-transform">
                <User className="w-6 h-6" />
              </div>
              <div className="text-left">
                <span className="font-bold text-slate-900 block text-lg">
                  Informações Pessoais
                </span>
                <span className="text-sm text-slate-500 font-medium">
                  Dados de contato e documentos
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500" />
          </button>

          <button className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
                <CreditCard className="w-6 h-6" />
              </div>
              <div className="text-left">
                <span className="font-bold text-slate-900 block text-lg">
                  Pagamentos
                </span>
                <span className="text-sm text-slate-500 font-medium">
                  Cartões e histórico da carteira
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500" />
          </button>

          <button className="w-full flex items-center justify-between p-6 hover:bg-slate-50 transition-colors group">
            <div className="flex items-center gap-4">
              <div className="p-3 bg-slate-100 text-slate-600 rounded-xl group-hover:scale-110 transition-transform">
                <Settings className="w-6 h-6" />
              </div>
              <div className="text-left">
                <span className="font-bold text-slate-900 block text-lg">
                  Configurações
                </span>
                <span className="text-sm text-slate-500 font-medium">
                  Senhas e notificações
                </span>
              </div>
            </div>
            <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-slate-500" />
          </button>
        </div>
      </div>

      {/* BOTÃO DE LOGOUT */}
      <div className="pt-4 pb-8">
        <Button
          variant="ghost"
          className="w-full h-14 rounded-2xl font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 transition-colors"
          onClick={handleLogout}
        >
          <LogOut className="w-5 h-5 mr-2" /> Encerrar Sessão
        </Button>
      </div>
    </div>
  );
}
