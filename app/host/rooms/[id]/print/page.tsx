"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@/utils/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { Loader2, ShieldCheck, Clock, MapPin } from "lucide-react";

export default function PrintQRDoorSign() {
  const params = useParams();
  const roomId = params.id as string;
  const supabase = createClient();

  const [loading, setLoading] = useState(true);
  const [room, setRoom] = useState<any>(null);

  useEffect(() => {
    async function fetchRoom() {
      if (!roomId) return;
      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("id, name, address_details")
          .eq("id", roomId)
          .single();

        if (error) throw error;
        setRoom(data);
      } catch (err) {
        console.error("Erro ao buscar sala:", err);
      } finally {
        setLoading(false);
      }
    }
    fetchRoom();
  }, [roomId, supabase]);

  // Dispara a impressão automaticamente após carregar a imagem
  useEffect(() => {
    if (!loading && room) {
      const timer = setTimeout(() => {
        window.print();
      }, 1000); // 1 segundo para garantir que a fonte carregou
      return () => clearTimeout(timer);
    }
  }, [loading, room]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-slate-100">
        <Loader2 className="w-12 h-12 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  if (!room)
    return (
      <div className="p-10 text-center text-red-500 font-bold">
        Sala não encontrada.
      </div>
    );

  // A chave de segurança que o App do médico vai ler!
  const securityToken = `fusion_room_${room.id}`;

  return (
    // CSS específico para impressão (esconde o que não importa, remove margens)
    <div className="min-h-screen bg-white flex items-center justify-center print:block print:m-0 print:p-0">
      {/* Container Folha A4 */}
      <div className="w-[210mm] h-[297mm] bg-white p-12 flex flex-col items-center justify-between border border-slate-200 shadow-2xl print:border-none print:shadow-none print:w-full print:h-full">
        {/* HEADER DA PLACA */}
        <div className="w-full flex flex-col items-center text-center mt-10">
          <div className="w-24 h-24 bg-[#f05e23] rounded-3xl flex items-center justify-center text-white text-5xl font-black mb-6 shadow-xl">
            F
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tighter uppercase mb-2">
            Fusion Clinic
          </h1>
          <p className="text-xl font-bold text-slate-500 tracking-widest uppercase">
            Acesso Exclusivo
          </p>
        </div>

        {/* ÁREA DO QR CODE */}
        <div className="w-full flex flex-col items-center">
          <div className="bg-slate-50 p-10 rounded-[3rem] border-4 border-[#f05e23] shadow-2xl relative">
            {/* Cantoneiras decorativas para reforçar o design do scanner */}
            <div className="absolute -top-4 -left-4 w-12 h-12 border-t-8 border-l-8 border-[#f05e23] rounded-tl-3xl bg-white"></div>
            <div className="absolute -top-4 -right-4 w-12 h-12 border-t-8 border-r-8 border-[#f05e23] rounded-tr-3xl bg-white"></div>
            <div className="absolute -bottom-4 -left-4 w-12 h-12 border-b-8 border-l-8 border-[#f05e23] rounded-bl-3xl bg-white"></div>
            <div className="absolute -bottom-4 -right-4 w-12 h-12 border-b-8 border-r-8 border-[#f05e23] rounded-br-3xl bg-white"></div>

            {/* O QR Code Oficial gerado pelo React */}
            <QRCodeSVG
              value={securityToken}
              size={320}
              level="H" // High error correction
              includeMargin={false}
              fgColor="#0f172a" // slate-900
            />
          </div>

          <div className="mt-12 text-center max-w-md">
            <h2 className="text-5xl font-black text-slate-900 mb-4">
              {room.name}
            </h2>
            <p className="text-2xl font-bold text-[#f05e23]">
              Aponte a câmera do seu App
            </p>
            <p className="text-lg text-slate-500 font-medium mt-2">
              Faça seu Check-in e Check-out para liberar esta sala.
            </p>
          </div>
        </div>

        {/* INSTRUÇÕES E RODAPÉ */}
        <div className="w-full bg-slate-50 rounded-3xl p-8 mb-10 border border-slate-200">
          <div className="grid grid-cols-3 gap-6">
            <div className="flex flex-col items-center text-center">
              <ShieldCheck className="w-10 h-10 text-emerald-500 mb-3" />
              <p className="text-sm font-bold text-slate-900">100% Seguro</p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Apenas reservas confirmadas liberam a porta.
              </p>
            </div>
            <div className="flex flex-col items-center text-center border-x border-slate-200">
              <Clock className="w-10 h-10 text-amber-500 mb-3" />
              <p className="text-sm font-bold text-slate-900">Hora Clínica</p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                Respeite os 50 minutos de uso do espaço.
              </p>
            </div>
            <div className="flex flex-col items-center text-center">
              <MapPin className="w-10 h-10 text-blue-500 mb-3" />
              <p className="text-sm font-bold text-slate-900">Localização</p>
              <p className="text-xs text-slate-500 font-medium mt-1">
                GPS validado para evitar acessos remotos.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
