// components/room-access-config.tsx
"use client";

import { useState, useMemo } from "react";
import {
  Copy,
  Check,
  Download,
  SmartphoneNfc,
  QrCode,
  Printer,
  ExternalLink,
  KeyRound,
  Info,
  CheckCircle2,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";

export interface RoomAccessItem {
  id: string;
  name: string;
  specialty?: string;
  tier?: string;
  address_details?: any;
}

interface RoomAccessConfigProps {
  room: RoomAccessItem;
  baseUrl?: string;
}

export function RoomAccessConfig({ room, baseUrl }: RoomAccessConfigProps) {
  const { toast } = useToast();

  const [copiedType, setCopiedType] = useState<
    "full" | "short" | "code" | null
  >(null);
  const [downloadingQr, setDownloadingQr] = useState(false);
  const [useShortNfcUrl, setUseShortNfcUrl] = useState(false);

  const resolvedOrigin = useMemo(() => {
    if (baseUrl) return baseUrl.replace(/\/$/, "");
    if (typeof window !== "undefined" && window.location.origin) {
      return window.location.origin;
    }
    return "https://fusionclinic.com.br";
  }, [baseUrl]);

  // Código curto de 6 caracteres (usado no fallback manual e no link compacto NTAG213)
  const shortRoomCode = useMemo(() => {
    return String(room?.id || "")
      .replace(/[^a-zA-Z0-9]/g, "")
      .slice(0, 6)
      .toUpperCase();
  }, [room?.id]);

  // Link completo (ID UUID completo) e Link curto (6 caracteres iniciais suportados pelo detector do BookingsTab)
  const fullNfcLink = `${resolvedOrigin}/dashboard?scan=${room.id}`;
  const shortNfcLink = `${resolvedOrigin}/dashboard?scan=${shortRoomCode.toLowerCase()}`;
  const activeNfcLink = useShortNfcUrl ? shortNfcLink : fullNfcLink;

  // URL da imagem do QR Code em alta definição (600x600px com margem limpa)
  const qrCodeImageUrl = useMemo(() => {
    return `https://api.qrserver.com/v1/create-qr-code/?size=600x600&margin=16&ecc=M&data=${encodeURIComponent(
      fullNfcLink,
    )}`;
  }, [fullNfcLink]);

  const handleCopyText = async (
    text: string,
    type: "full" | "short" | "code",
    label: string,
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedType(type);
      toast({
        title: `${label} copiado!`,
        description:
          type === "code"
            ? "Este é o código de contingência caso a câmera do profissional esteja bloqueada."
            : "Agora basta colar no aplicativo NFC Tools e aproximar da tag na porta.",
      });
      setTimeout(() => setCopiedType(null), 2500);
    } catch {
      toast({
        variant: "destructive",
        title: "Erro ao copiar",
        description: "Selecione e copie o texto manualmente.",
      });
    }
  };

  // Faz o download real do arquivo PNG do QR Code (evita apenas abrir em nova guia)
  const handleDownloadQrPng = async () => {
    setDownloadingQr(true);
    try {
      const response = await fetch(qrCodeImageUrl);
      const blob = await response.blob();
      const blobUrl = URL.createObjectURL(blob);

      const safeRoomName = (room.name || "consultorio")
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
        title: "QR Code baixado com sucesso!",
        description: "Imagem PNG em alta resolução pronta para impressão.",
      });
    } catch {
      window.open(qrCodeImageUrl, "_blank", "noopener,noreferrer");
    } finally {
      setDownloadingQr(false);
    }
  };

  // Gera uma Placa de Porta completa pronta para impressão ou salvar em PDF
  const handlePrintDoorPlaque = () => {
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
      room.tier === "master"
        ? "Consultório Premium"
        : room.tier === "vip"
          ? "Consultório VIP"
          : "Consultório Verificado";

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <title>Placa de Porta NFC & QR Code - ${room.name}</title>
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
            <!-- Topo Laranja Fusion -->
            <div class="bg-[#B83B10] text-white px-8 pt-7 pb-6">
              <p class="text-[11px] font-extrabold uppercase tracking-[0.22em] text-orange-200 mb-1">
                ${tierLabel}
              </p>
              <h1 class="text-2xl font-black tracking-tight leading-tight">
                ${room.name}
              </h1>
              ${
                room.specialty
                  ? `<p class="text-xs font-semibold text-orange-100 mt-1">${room.specialty}</p>`
                  : ""
              }
            </div>

            <!-- Corpo da Placa -->
            <div class="p-8 space-y-6">
              <div class="inline-flex items-center gap-2 bg-stone-900 text-[#FBBF24] text-xs font-extrabold uppercase tracking-wider px-4 py-2 rounded-full">
                <span>📲 Encoste o celular (NFC) ou aponte a câmera</span>
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
                  Como funciona (Entrada e Saída):
                </p>
                <p class="text-xs text-emerald-900 leading-relaxed">
                  <strong>1. Ao chegar:</strong> Encoste seu smartphone na Tag NFC ou leia o QR Code para registrar seu <strong>Check-in</strong>.
                </p>
                <p class="text-xs text-emerald-900 leading-relaxed">
                  <strong>2. Ao sair:</strong> Encoste novamente ao finalizar a consulta para registrar seu <strong>Check-out</strong> no horário e liberar a sala.
                </p>
              </div>
            </div>

            <!-- Rodapé -->
            <div class="bg-stone-950 text-stone-400 py-3.5 px-6 text-[10px] font-bold uppercase tracking-widest">
              Fusion Clinic • Check-in & Check-out Inteligente
            </div>
          </div>
        </body>
      </html>
    `);
    printWindow.document.close();
  };

  return (
    <div className="bg-white rounded-3xl p-5 sm:p-7 border border-stone-200/90 shadow-xs space-y-6 font-sans">
      {/* CABEÇALHO */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-stone-100">
        <div className="flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-2xl bg-[#FAF7F4] border border-[#BF4B24]/25 text-[#BF4B24] flex items-center justify-center shrink-0">
            <SmartphoneNfc className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-base sm:text-lg font-black text-stone-900 leading-tight">
                Acesso Inteligente da Porta (NFC & QR Code)
              </h3>
              <Badge className="bg-emerald-50 text-emerald-800 border border-emerald-200 text-[10px] font-bold">
                Check-in & Check-out Unificados
              </Badge>
            </div>
            <p className="text-xs text-stone-500 mt-0.5">
              Consultório:{" "}
              <strong className="text-stone-800">{room.name}</strong> • O mesmo
              link realiza a entrada e a saída automaticamente.
            </p>
          </div>
        </div>

        <Button
          type="button"
          onClick={handlePrintDoorPlaque}
          className="h-10 px-4 rounded-xl bg-stone-900 hover:bg-stone-800 text-white font-bold text-xs shrink-0 flex items-center gap-2 cursor-pointer"
        >
          <Printer className="w-4 h-4 text-[#FBBF24]" />
          <span>Imprimir Placa da Porta</span>
        </Button>
      </div>

      {/* GRADE PRINCIPAL: QR CODE À ESQUERDA + CONFIGURAÇÃO NFC À DIREITA */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* COLUNA 1: QR CODE E CÓDIGO MANUAL (5 COLUNAS) */}
        <div className="lg:col-span-5 flex flex-col items-center justify-center p-5 rounded-2xl bg-[#FAF7F4] border border-stone-200/80 text-center space-y-4">
          <div className="flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wider text-stone-700">
            <QrCode className="w-4 h-4 text-[#BF4B24]" />
            <span>QR Code Exclusivo da Sala</span>
          </div>

          <div className="w-48 h-48 bg-white p-3 rounded-2xl border border-stone-200/90 shadow-2xs flex items-center justify-center">
            <img
              src={qrCodeImageUrl}
              alt={`QR Code da sala ${room.name}`}
              className="w-full h-full object-contain"
            />
          </div>

          {/* Código Manual de 6 dígitos (Contingência para câmera bloqueada) */}
          <div className="w-full bg-white rounded-xl p-3 border border-stone-200/80 flex items-center justify-between gap-2">
            <div className="text-left">
              <span className="text-[10px] font-bold uppercase tracking-wider text-stone-400 flex items-center gap-1">
                <KeyRound className="w-3 h-3 text-[#BF4B24]" />
                Código Manual (6 dígitos)
              </span>
              <span className="text-base font-black tracking-widest text-stone-900 font-mono block mt-0.5">
                {shortRoomCode}
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              onClick={() =>
                handleCopyText(shortRoomCode, "code", "Código manual")
              }
              className="h-8 px-3 rounded-lg text-xs font-bold border-stone-200"
            >
              {copiedType === "code" ? (
                <Check className="w-3.5 h-3.5 text-emerald-600" />
              ) : (
                <Copy className="w-3.5 h-3.5" />
              )}
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full">
            <Button
              type="button"
              disabled={downloadingQr}
              onClick={handleDownloadQrPng}
              variant="outline"
              className="w-full h-10 rounded-xl font-bold text-xs border-stone-200 bg-white text-stone-800 hover:bg-stone-50 cursor-pointer"
            >
              {downloadingQr ? (
                <Loader2 className="w-4 h-4 mr-1.5 animate-spin text-[#BF4B24]" />
              ) : (
                <Download className="w-4 h-4 mr-1.5 text-[#BF4B24]" />
              )}
              <span>Baixar PNG</span>
            </Button>

            <Button
              type="button"
              onClick={() =>
                window.open(fullNfcLink, "_blank", "noopener,noreferrer")
              }
              variant="outline"
              className="w-full h-10 rounded-xl font-bold text-xs border-stone-200 bg-white text-stone-700 hover:bg-stone-50 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-stone-500" />
              <span>Testar Link</span>
            </Button>
          </div>
        </div>

        {/* COLUNA 2: PROGRAMAÇÃO DA TAG NFC (7 COLUNAS) */}
        <div className="lg:col-span-7 space-y-5">
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="text-xs font-extrabold text-stone-900 uppercase tracking-wider flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-[#BF4B24]" />
                Link para Gravar na Tag NFC da Porta
              </label>

              {/* Alternador entre Link Completo e Link Compacto (para NTAG213 de pouca memória) */}
              <div className="inline-flex bg-stone-100 p-0.5 rounded-lg border border-stone-200/80">
                <button
                  type="button"
                  onClick={() => setUseShortNfcUrl(false)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    !useShortNfcUrl
                      ? "bg-white text-stone-900 shadow-2xs"
                      : "text-stone-500"
                  }`}
                >
                  Padrão (UUID)
                </button>
                <button
                  type="button"
                  onClick={() => setUseShortNfcUrl(true)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-bold transition-all cursor-pointer ${
                    useShortNfcUrl
                      ? "bg-white text-[#BF4B24] shadow-2xs"
                      : "text-stone-500"
                  }`}
                >
                  Compacto (NTAG213)
                </button>
              </div>
            </div>

            <p className="text-xs text-stone-500 leading-relaxed">
              Copie o link abaixo e grave na sua etiqueta{" "}
              <strong>NTAG213</strong> ou <strong>NTAG215</strong> usando o app{" "}
              <em>NFC Tools</em>. Quando o profissional encostar o celular, o
              sistema reconhece a sala automaticamente.
            </p>

            {/* Caixa do Link NFC com botão de cópia */}
            <div className="flex items-center gap-2 p-2.5 pl-3.5 rounded-2xl bg-[#FAF7F4] border border-[#BF4B24]/35">
              <input
                type="text"
                readOnly
                value={activeNfcLink}
                onClick={(e) => (e.target as HTMLInputElement).select()}
                className="w-full bg-transparent text-xs font-mono font-semibold text-stone-800 focus:outline-none truncate"
              />
              <Button
                type="button"
                onClick={() =>
                  handleCopyText(
                    activeNfcLink,
                    useShortNfcUrl ? "short" : "full",
                    "Link NFC da sala",
                  )
                }
                className="h-10 px-4 rounded-xl bg-[#BF4B24] hover:bg-[#9A3C1D] text-white text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                {copiedType === "full" || copiedType === "short" ? (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-4 h-4" />
                    <span>Copiar Link NFC</span>
                  </>
                )}
              </Button>
            </div>

            <div className="flex items-center justify-between text-[11px] text-stone-400 px-1">
              <span>
                Tamanho do registro:{" "}
                <strong className="text-stone-600">
                  {activeNfcLink.length} bytes
                </strong>{" "}
                (Compatível com NTAG213 e NTAG215)
              </span>
              <span className="text-emerald-700 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Reconhecimento automático
              </span>
            </div>
          </div>

          {/* Guia Rápido de Gravação Física da Tag NFC */}
          <div className="p-4 rounded-2xl bg-stone-50 border border-stone-200/80 space-y-2.5">
            <h4 className="text-xs font-extrabold text-stone-900 flex items-center gap-1.5">
              <Info className="w-4 h-4 text-[#BF4B24]" />
              Passo a passo para gravar a etiqueta NFC (1 minuto):
            </h4>
            <ol className="text-xs text-stone-600 space-y-1.5 list-decimal list-inside leading-relaxed">
              <li>
                Abra o aplicativo gratuito <strong>NFC Tools</strong> no seu
                iPhone ou Android.
              </li>
              <li>
                Toque em <strong>Escrever (Write)</strong> →{" "}
                <strong>Adicionar um registro</strong> →{" "}
                <strong>URL / URI</strong>.
              </li>
              <li>
                Cole o link copiado acima, confirme e toque em{" "}
                <strong>Escrever</strong> aproximando o celular da tag NFC.
              </li>
              <li>
                <em>Opcional:</em> No NFC Tools, use a opção{" "}
                <strong>Proteger com senha (Password)</strong> para impedir que
                terceiros alterem o link da porta.
              </li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// VERSÃO EM MODAL (PARA ABRIR A PARTIR DE UM BOTÃO "GERAR QR / NFC" NA LISTA)
// ============================================================================
export function RoomAccessModal({
  room,
  isOpen,
  onClose,
}: {
  room: RoomAccessItem | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  if (!room) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-3xl w-[95vw] max-h-[92vh] overflow-y-auto p-0 rounded-[28px] border-0 bg-transparent shadow-none">
        <DialogTitle className="sr-only">
          Configurar QR Code e NFC - {room.name}
        </DialogTitle>
        <DialogDescription className="sr-only">
          Copie o link NFC ou imprima a placa de QR Code exclusiva deste
          consultório.
        </DialogDescription>
        <RoomAccessConfig room={room} />
      </DialogContent>
    </Dialog>
  );
}
