"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Clock,
  CheckCircle2,
  Building2,
  PlusCircle,
  AlertCircle,
  ArrowLeft,
  PauseCircle,
  PlayCircle,
  Edit3,
  Star,
  AlertTriangle,
  QrCode,
  SmartphoneNfc,
  Copy,
  Check,
  Download,
  Printer,
  KeyRound,
  Loader2,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HostSpaceForm } from "@/components/host/space-form";
import { Badge } from "@/components/ui/badge";

type Room = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  tier?: string;
  is_active: boolean;
  is_paused: boolean;
  is_partner?: boolean;
  modalities: string[];
  created_at: string;
  image_url?: string;
  address_details?: any;
};

export function HostSpaceList() {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const [roomToPause, setRoomToPause] = useState<Room | null>(null);
  const [isProcessingPause, setIsProcessingPause] = useState(false);

  // Estado para o Modal de QR Code & Link NFC da Sala
  const [roomForAccessModal, setRoomForAccessModal] = useState<Room | null>(
    null,
  );
  const [copiedType, setCopiedType] = useState<"link" | "code" | null>(null);
  const [downloadingQr, setDownloadingQr] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      const { data, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });

      if (roomsError) throw roomsError;
      setRooms(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar salas:", err);
      setError("Não foi possível carregar seus espaços.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const executeTogglePause = async () => {
    if (!roomToPause) return;
    setIsProcessingPause(true);

    try {
      const { error } = await supabase
        .from("rooms")
        .update({ is_paused: !roomToPause.is_paused })
        .eq("id", roomToPause.id);

      if (error) throw error;

      toast({
        title: !roomToPause.is_paused
          ? "Sala Pausada com sucesso"
          : "Sala Reativada com sucesso",
        description: !roomToPause.is_paused
          ? "O anúncio foi removido temporariamente da vitrine e não receberá novas reservas."
          : "O anúncio voltou para a vitrine e já pode ser reservado pelos profissionais.",
      });

      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomToPause.id
            ? { ...r, is_paused: !roomToPause.is_paused }
            : r,
        ),
      );
    } catch {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível alterar o status da sala.",
      });
    } finally {
      setIsProcessingPause(false);
      setRoomToPause(null);
    }
  };

  const handleRequestPartner = () => {
    toast({
      title: "Solicitação Enviada! 🚀",
      description:
        "Nossa equipe entrará em contato em breve para ativar os recursos do plano Fusion Host Partner na sua sala.",
    });
  };

  // ==========================================================================
  // CÁLCULOS DO LINK NFC E QR CODE PARA A SALA SELECIONADA
  // ==========================================================================
  const resolvedOrigin = useMemo(() => {
    if (typeof window !== "undefined" && window.location.origin) {
      return window.location.origin;
    }
    return "https://fusionclinic.com.br";
  }, []);

  const shortRoomCode = useMemo(() => {
    if (!roomForAccessModal?.id) return "";
    return String(roomForAccessModal.id)
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();
  }, [roomForAccessModal?.id]);

  // Link único enxuto que funciona tanto no QR Code quanto em qualquer Tag NFC
  const doorAccessLink = roomForAccessModal
    ? `${resolvedOrigin}/dashboard?scan=${shortRoomCode.toLowerCase()}`
    : "";

  const qrCodeImageUrl = useMemo(() => {
    if (!doorAccessLink) return "";
    return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&ecc=M&data=${encodeURIComponent(
      doorAccessLink,
    )}`;
  }, [doorAccessLink]);

  const handleCopyText = async (
    text: string,
    type: "link" | "code",
    label: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      toast({
        title: `${label} copiado!`,
        description:
          type === "code"
            ? "Código manual de 6 dígitos copiado para a área de transferência."
            : "Agora cole este link no aplicativo NFC Tools para gravar o adesivo da porta.",
      });
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao copiar",
        description: "Selecione e copie manualmente.",
      });
    }
  };

  const handleDownloadQrPng = async () => {
    if (!roomForAccessModal || !qrCodeImageUrl) return;
    setDownloadingQr(true);
    try {
      const response = await fetch(qrCodeImageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const safeRoomName = (roomForAccessModal.name || "consultorio")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9]+/g, "-");

      const link = document.createElement("a");
      link.href = blobUrl;
      link.download = `qrcode-porta-${safeRoomName}-${shortRoomCode}.png`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(blobUrl);

      toast({
        title: "Imagem do QR Code baixada!",
        description: "Arquivo PNG salvo no seu dispositivo.",
      });
    } catch {
      window.open(qrCodeImageUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingQr(false);
    }
  };

  const handlePrintDoorPlaque = () => {
    if (!roomForAccessModal) return;
    const printWindow = window.open("", "", "width=850,height=950");
    if (!printWindow) {
      toast({
        variant: "destructive",
        title: "Pop-up bloqueado",
        description:
          "Permita pop-ups no navegador para gerar a placa de porta para impressão.",
      });
      return;
    }

    const tierLabel =
      roomForAccessModal.tier === "master"
        ? "Consultório Premium"
        : roomForAccessModal.tier === "vip"
          ? "Consultório VIP"
          : "Consultório Verificado";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Placa de Porta - ${roomForAccessModal.name}</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <style>
            @media print {
              body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
              .no-print { display: none !important; }
            }
          </style>
        </head>
        <body class="bg-stone-100 p-6 sm:p-10 flex flex-col items-center justify-center min-h-screen font-sans">
          <div class="no-print mb-6 flex items-center gap-3">
            <button onclick="window.print()" class="bg-[#BF4B24] text-white font-bold px-6 py-3 rounded-xl shadow-md cursor-pointer">
              Imprimir / Salvar em PDF
            </button>
            <button onclick="window.close()" class="bg-white text-stone-700 border border-stone-300 font-bold px-5 py-3 rounded-xl cursor-pointer">
              Fechar
            </button>
          </div>

          <div class="w-full max-w-[440px] bg-white rounded-[36px] border-2 border-stone-900 shadow-2xl overflow-hidden text-center">
            <div class="bg-[#B83B10] text-white px-8 pt-7 pb-6">
              <p class="text-[11px] font-extrabold uppercase tracking-[0.22em] text-orange-200 mb-1">
                ${tierLabel}
              </p>
              <h1 class="text-2xl font-black tracking-tight leading-tight">
                ${roomForAccessModal.name}
              </h1>
              ${
                roomForAccessModal.specialty
                  ? `<p class="text-xs font-semibold text-orange-100 mt-1">${roomForAccessModal.specialty}</p>`
                  : ""
              }
            </div>

            <div class="p-8 space-y-6">
              <div class="inline-flex items-center gap-2 bg-stone-900 text-[#FBBF24] text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-full">
                <span>📲 Encoste o celular (NFC) ou leia o QR Code</span>
              </div>

              <div class="w-60 h-60 mx-auto p-3 rounded-3xl border-2 border-dashed border-[#BF4B24]/40 bg-[#FAF7F4] flex items-center justify-center">
                <img src="${qrCodeImageUrl}" alt="QR Code" class="w-full h-full object-contain rounded-2xl" />
              </div>

              <div class="bg-[#FAF7F4] border border-stone-200 rounded-2xl p-4">
                <p class="text-[10px] font-black uppercase tracking-widest text-stone-400">
                  Código Manual da Porta
                </p>
                <p class="text-2xl font-black tracking-[0.25em] text-stone-900 mt-0.5 font-mono">
                  ${shortRoomCode}
                </p>
              </div>

              <div class="text-left bg-emerald-50 border border-emerald-200/80 rounded-2xl p-4 space-y-1.5">
                <p class="text-xs font-black text-emerald-950 uppercase tracking-wider">
                  Registro Obrigatório de Entrada e Saída:
                </p>
                <p class="text-xs text-emerald-900 leading-relaxed">
                  <strong>1. Ao chegar:</strong> Encoste seu celular na placa ou aponte a câmera para registrar seu <strong>Check-in</strong>.
                </p>
                <p class="text-xs text-emerald-900 leading-relaxed">
                  <strong>2. Ao sair:</strong> Repita o processo ao encerrar a consulta para registrar seu <strong>Check-out</strong> no horário.
                </p>
              </div>
            </div>

            <div class="bg-stone-950 text-stone-400 py-3.5 px-6 text-[10px] font-bold uppercase tracking-widest">
              Fusion Clinic • Controle Inteligente de Consultórios
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  if (isCreating || editingRoom) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4 animate-in fade-in">
        <Button
          variant="ghost"
          onClick={() => {
            setIsCreating(false);
            setEditingRoom(null);
            fetchRooms();
          }}
          className="text-slate-500 hover:text-[#BF4B24] p-0 hover:bg-transparent font-bold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para meus espaços
        </Button>
        <HostSpaceForm
          initialData={editingRoom}
          onSuccess={() => {
            setIsCreating(false);
            setEditingRoom(null);
            fetchRooms();
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto p-4 md:p-8">
        <Skeleton className="h-[160px] w-full rounded-2xl bg-slate-100" />
        <Skeleton className="h-[160px] w-full rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error)
    return (
      <div className="p-4 md:p-8 flex items-center justify-center">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Meus Espaços
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gerencie suas salas, imprima a placa de QR Code da porta ou copie o
            link da Tag NFC.
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white rounded-xl font-bold h-11"
        >
          <PlusCircle className="w-4 h-4 mr-2" /> Nova Sala
        </Button>
      </div>

      {rooms.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 bg-white border border-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <Building2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">
              Nenhum espaço cadastrado
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6 font-medium">
              Você ainda não enviou nenhuma sala. Comece agora a rentabilizar o
              seu espaço.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {rooms.map((room) => {
            const pricing = room.address_details?.pricing || {};
            const hasPricing =
              pricing.morning ||
              pricing.afternoon ||
              pricing.night ||
              pricing.monthly ||
              pricing.hourly;

            const isPartner = room.is_partner === true;

            return (
              <Card
                key={room.id}
                className={`shadow-sm rounded-2xl overflow-hidden transition-all border-2 ${
                  room.is_paused
                    ? "opacity-75 bg-slate-50 border-slate-200"
                    : isPartner
                      ? "border-amber-400 shadow-amber-500/10 hover:shadow-amber-500/20 hover:border-amber-500 bg-gradient-to-r from-amber-50/40 to-white"
                      : "border-slate-200 hover:border-[#BF4B24]/30 bg-white"
                }`}
              >
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    <div className="bg-slate-100 sm:w-56 h-48 sm:h-auto relative shrink-0">
                      <img
                        src={room.image_url || "/placeholder.jpg"}
                        alt={room.name}
                        className={`w-full h-full object-cover ${room.is_paused ? "grayscale" : ""}`}
                      />
                      {isPartner && !room.is_paused && (
                        <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded-md uppercase flex items-center gap-1 shadow-md">
                          <Star className="w-3 h-3 fill-white" /> Partner
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-2 gap-2">
                          <div>
                            <h3
                              className={`text-lg font-bold leading-tight ${room.is_paused ? "text-slate-500" : "text-slate-900"}`}
                            >
                              {room.name}
                            </h3>
                            {room.specialty && (
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">
                                {room.specialty}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {!room.is_active ? (
                              <span className="flex items-center px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold shrink-0 border border-amber-100">
                                <Clock className="w-4 h-4 mr-1.5" /> Em Análise
                              </span>
                            ) : room.is_paused ? (
                              <span className="flex items-center px-3 py-1.5 rounded-lg bg-slate-200 text-slate-600 text-xs font-bold shrink-0 border border-slate-300">
                                <PauseCircle className="w-4 h-4 mr-1.5" />{" "}
                                Pausada
                              </span>
                            ) : (
                              <span className="flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold shrink-0 border border-emerald-100">
                                <CheckCircle2 className="w-4 h-4 mr-1.5" />{" "}
                                Ativa
                              </span>
                            )}
                          </div>
                        </div>

                        {hasPricing && (
                          <div className="flex flex-wrap gap-2 my-3">
                            {pricing.hourly && (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 font-bold">
                                <Clock className="w-3 h-3 mr-1" />
                                Hora: R$ {pricing.hourly}
                              </Badge>
                            )}
                            {pricing.morning && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Manhã: R$ {pricing.morning}
                              </Badge>
                            )}
                            {pricing.afternoon && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Tarde: R$ {pricing.afternoon}
                              </Badge>
                            )}
                            {pricing.night && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Noite: R$ {pricing.night}
                              </Badge>
                            )}
                            {pricing.monthly && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Mensal: R$ {pricing.monthly}
                              </Badge>
                            )}
                          </div>
                        )}

                        <p className="text-sm text-slate-500 line-clamp-2 mb-4">
                          {room.description || "Nenhuma descrição."}
                        </p>
                      </div>

                      <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4 mt-auto pt-4 border-t border-slate-100">
                        <div className="w-full xl:w-auto">
                          {!isPartner ? (
                            <Button
                              variant="outline"
                              onClick={handleRequestPartner}
                              className="w-full font-black text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:text-amber-700 shadow-sm"
                            >
                              <Star className="w-4 h-4 mr-2 fill-amber-500" />
                              Tornar Fusion Partner
                            </Button>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-wider">
                              <Star className="w-4 h-4 fill-amber-500" /> Sala
                              Partner Ativa
                            </div>
                          )}
                        </div>

                        <div className="flex flex-wrap items-center gap-2 w-full xl:w-auto">
                          <Button
                            variant="outline"
                            onClick={() => setRoomForAccessModal(room)}
                            className="flex-1 xl:flex-none border-[#BF4B24]/30 text-[#BF4B24] hover:bg-[#BF4B24] hover:text-white font-bold bg-orange-50/60 cursor-pointer"
                          >
                            <SmartphoneNfc className="w-4 h-4 mr-2" /> QR Code &
                            NFC
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setEditingRoom(room)}
                            className="flex-1 xl:flex-none border-slate-200 text-slate-700 hover:text-[#BF4B24] hover:bg-orange-50 font-bold"
                          >
                            <Edit3 className="w-4 h-4 mr-2" /> Editar
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setRoomToPause(room)}
                            className={`flex-1 xl:flex-none font-bold ${room.is_paused ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}
                          >
                            {room.is_paused ? (
                              <>
                                <PlayCircle className="w-4 h-4 mr-2" /> Reativar
                              </>
                            ) : (
                              <>
                                <PauseCircle className="w-4 h-4 mr-2" /> Pausar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* ==================================================================== */}
      {/* NOVO MODAL EDITORIAL DE PORTA (CLARO, ORGANIZADO E SEM CORTAR TEXTO) */}
      {/* ==================================================================== */}
      <Dialog
        open={!!roomForAccessModal}
        onOpenChange={(open) => !open && setRoomForAccessModal(null)}
      >
        <DialogContent className="sm:max-w-[600px] w-[94vw] max-h-[90vh] overflow-y-auto p-0 rounded-3xl border border-stone-200 bg-white shadow-2xl">
          <DialogTitle className="sr-only">
            Identificação da Porta - {roomForAccessModal?.name}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Baixe a placa com QR Code para colar na porta ou copie o link para
            gravar na etiqueta NFC.
          </DialogDescription>

          {roomForAccessModal && (
            <div className="flex flex-col font-sans">
              {/* CABEÇALHO ESCURO EXECUTIVO */}
              <div className="bg-stone-950 text-white px-6 py-5 border-b border-stone-800">
                <div className="flex items-center gap-2 mb-1.5">
                  <span className="inline-flex items-center gap-1.5 bg-[#BF4B24] text-white text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full">
                    <CheckCircle2 className="w-3 h-3" />
                    Check-in e Check-out da Porta
                  </span>
                  <span className="text-xs font-semibold text-stone-400">
                    • {roomForAccessModal.name}
                  </span>
                </div>
                <h3 className="text-lg sm:text-xl font-black text-white tracking-tight">
                  Como os profissionais registram entrada e saída nesta sala
                </h3>
                <p className="text-xs text-stone-300 mt-1 leading-relaxed">
                  Você pode usar a <strong>Placa Impressa com QR Code</strong>{" "}
                  na porta, a <strong>Etiqueta de Aproximação (NFC)</strong> ou
                  ambos juntos.
                </p>
              </div>

              {/* CORPO DO MODAL EM 2 PASSOS LARGOS E DIDÁTICOS */}
              <div className="p-5 sm:p-6 space-y-5 bg-[#FAF7F4]/60">
                {/* OPÇÃO 1: PLACA VISUAL DA PORTA (QR CODE + CÓDIGO MANUAL) */}
                <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs space-y-4">
                  <div className="flex items-start justify-between gap-3 border-b border-stone-100 pb-3.5">
                    <div className="flex items-center gap-2.5">
                      <div className="w-9 h-9 rounded-xl bg-orange-50 border border-[#BF4B24]/20 text-[#BF4B24] flex items-center justify-center shrink-0">
                        <QrCode className="w-5 h-5" />
                      </div>
                      <div>
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#BF4B24] block">
                          Opção 1 • Na Porta da Sala
                        </span>
                        <h4 className="text-sm font-black text-stone-900">
                          Placa com QR Code + Código de 6 Dígitos
                        </h4>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row items-center gap-5">
                    {/* Imagem nítida do QR Code */}
                    <div className="w-36 h-36 bg-white p-2.5 rounded-2xl border-2 border-dashed border-stone-200 shrink-0 flex items-center justify-center">
                      <img
                        src={qrCodeImageUrl}
                        alt={`QR Code ${roomForAccessModal.name}`}
                        className="w-full h-full object-contain"
                      />
                    </div>

                    {/* Explicação + Código Manual alinhado */}
                    <div className="flex-1 space-y-3 w-full">
                      <p className="text-xs text-stone-600 leading-relaxed">
                        Fixe esta placa na porta da{" "}
                        <strong>{roomForAccessModal.name}</strong>. O
                        profissional aponta a câmera ao chegar para fazer{" "}
                        <strong>Check-in</strong> e ao sair para fazer{" "}
                        <strong>Check-out</strong>.
                      </p>

                      {/* Caixa horizontal limpa para o Código Manual */}
                      <div className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-stone-50 border border-stone-200/90">
                        <div>
                          <span className="text-[10px] font-bold uppercase tracking-wider text-stone-500 flex items-center gap-1">
                            <KeyRound className="w-3 h-3 text-[#BF4B24]" />
                            Código se a câmera falhar:
                          </span>
                          <span className="text-lg font-black tracking-[0.2em] text-stone-900 font-mono block leading-tight mt-0.5">
                            {shortRoomCode}
                          </span>
                        </div>

                        <Button
                          type="button"
                          variant="outline"
                          onClick={() =>
                            handleCopyText(
                              shortRoomCode,
                              "code",
                              "Código manual",
                            )
                          }
                          className="h-9 px-3 rounded-lg text-xs font-bold border-stone-200 bg-white hover:bg-stone-100 shrink-0 cursor-pointer"
                        >
                          {copiedType === "code" ? (
                            <>
                              <Check className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                              Copiado
                            </>
                          ) : (
                            <>
                              <Copy className="w-3.5 h-3.5 mr-1.5 text-stone-600" />
                              Copiar código
                            </>
                          )}
                        </Button>
                      </div>
                    </div>
                  </div>

                  {/* Dois botões amplos e claros */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                    <Button
                      type="button"
                      onClick={handlePrintDoorPlaque}
                      className="w-full h-11 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs flex items-center justify-center gap-2 shadow-2xs cursor-pointer"
                    >
                      <Printer className="w-4 h-4 text-[#FBBF24]" />
                      <span>Imprimir Placa Pronta</span>
                    </Button>

                    <Button
                      type="button"
                      disabled={downloadingQr}
                      onClick={handleDownloadQrPng}
                      variant="outline"
                      className="w-full h-11 rounded-xl border-stone-200 bg-white hover:bg-stone-50 text-stone-800 font-bold text-xs flex items-center justify-center gap-2 cursor-pointer"
                    >
                      {downloadingQr ? (
                        <Loader2 className="w-4 h-4 animate-spin text-[#BF4B24]" />
                      ) : (
                        <Download className="w-4 h-4 text-[#BF4B24]" />
                      )}
                      <span>Baixar Só o QR Code (PNG)</span>
                    </Button>
                  </div>
                </div>

                {/* OPÇÃO 2: ADESIVO DE APROXIMAÇÃO (TAG NFC) */}
                <div className="bg-white rounded-2xl p-5 border border-stone-200/90 shadow-2xs space-y-4">
                  <div className="flex items-center gap-2.5 border-b border-stone-100 pb-3.5">
                    <div className="w-9 h-9 rounded-xl bg-orange-50 border border-[#BF4B24]/20 text-[#BF4B24] flex items-center justify-center shrink-0">
                      <SmartphoneNfc className="w-5 h-5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#BF4B24] block">
                        Opção 2 • Aproximação sem Câmera
                      </span>
                      <h4 className="text-sm font-black text-stone-900">
                        Link para Gravar no Adesivo NFC da Porta
                      </h4>
                    </div>
                  </div>

                  <p className="text-xs text-stone-600 leading-relaxed">
                    Se você comprou uma <strong>Tag Adesiva NFC</strong> para
                    colar na porta, copie o link abaixo e grave na etiqueta.
                    Assim o médico faz check-in e check-out apenas encostando o
                    celular na porta:
                  </p>

                  {/* Caixa de Link de Largura Total */}
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 p-2 sm:pl-3.5 rounded-xl bg-[#FAF7F4] border border-[#BF4B24]/35">
                    <input
                      type="text"
                      readOnly
                      value={doorAccessLink}
                      onClick={(e) => (e.target as HTMLInputElement).select()}
                      className="w-full bg-transparent text-xs font-mono font-semibold text-stone-800 focus:outline-none py-1.5 px-1"
                    />
                    <Button
                      type="button"
                      onClick={() =>
                        handleCopyText(
                          doorAccessLink,
                          "link",
                          "Link da Tag NFC",
                        )
                      }
                      className="h-10 px-4 rounded-lg bg-[#BF4B24] hover:bg-[#9A3C1D] text-white text-xs font-bold shrink-0 flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                    >
                      {copiedType === "link" ? (
                        <>
                          <Check className="w-4 h-4" />
                          <span>Link Copiado!</span>
                        </>
                      ) : (
                        <>
                          <Copy className="w-4 h-4" />
                          <span>Copiar Link NFC</span>
                        </>
                      )}
                    </Button>
                  </div>

                  {/* Passo a passo em 3 etapas visuais */}
                  <div className="rounded-xl bg-stone-50 border border-stone-200/80 p-3.5 space-y-2">
                    <p className="text-[11px] font-extrabold uppercase tracking-wider text-stone-700">
                      Como gravar este link na sua Tag NFC pelo celular:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs text-stone-600">
                      <div className="bg-white p-2.5 rounded-lg border border-stone-200/70">
                        <strong className="text-[#BF4B24] block mb-0.5">
                          1. Baixe o app
                        </strong>
                        Instale o app gratuito <strong>NFC Tools</strong> no
                        iPhone ou Android.
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-stone-200/70">
                        <strong className="text-[#BF4B24] block mb-0.5">
                          2. Cole o link
                        </strong>
                        Toque em <strong>Escrever</strong> &rarr;{" "}
                        <strong>Adicionar registro</strong> &rarr;{" "}
                        <strong>URL</strong> e cole o link.
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-stone-200/70">
                        <strong className="text-[#BF4B24] block mb-0.5">
                          3. Encoste na Tag
                        </strong>
                        Toque em <strong>Escrever</strong> e encoste o celular
                        no adesivo NFC da porta.
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog
        open={!!roomToPause}
        onOpenChange={(open) => !open && setRoomToPause(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {roomToPause?.is_paused ? "Reativar Sala" : "Pausar Sala"}
            </DialogTitle>
            <DialogDescription className="text-base text-slate-600 mt-2">
              {roomToPause?.is_paused
                ? "Esta sala voltará a aparecer para todos os profissionais no catálogo. Eles poderão realizar novas reservas normalmente. Deseja reativá-la?"
                : "Ao pausar, esta sala ficará invisível no catálogo e não receberá novas reservas até você reativá-la. Reservas já confirmadas não serão afetadas. Deseja continuar?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setRoomToPause(null)}
              disabled={isProcessingPause}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={executeTogglePause}
              disabled={isProcessingPause}
              className={`w-full sm:w-auto font-bold ${roomToPause?.is_paused ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}`}
            >
              {isProcessingPause
                ? "Processando..."
                : roomToPause?.is_paused
                  ? "Sim, Reativar"
                  : "Sim, Pausar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
