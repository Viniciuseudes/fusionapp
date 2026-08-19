"use client";

import { useState, useEffect, useRef } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useToast } from "@/hooks/use-toast";
import { MapPin, X, Camera, AlertCircle } from "lucide-react";

interface QRScannerProps {
  expectedRoomId: string;
  onSuccess: () => void;
  onCancel: () => void;
  type: "checkin" | "checkout";
}

export function RoomQRScanner({
  expectedRoomId,
  onSuccess,
  onCancel,
  type,
}: QRScannerProps) {
  const { toast } = useToast();
  const [checkingLocation, setCheckingLocation] = useState(true);
  const [scanned, setScanned] = useState(false);
  const [cameraError, setCameraError] = useState("");

  // Memória para evitar Spam de alertas do Scanner (Debounce)
  const lastErrorTimeRef = useRef<number>(0);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "unset";
    };
  }, []);

  useEffect(() => {
    if (!("geolocation" in navigator)) {
      setCheckingLocation(false);
      return;
    }

    navigator.geolocation.getCurrentPosition(
      () => setCheckingLocation(false),
      (error) => {
        console.warn("Aviso de GPS:", error);
        setCheckingLocation(false);
      },
      { enableHighAccuracy: false, timeout: 3000, maximumAge: 10000 },
    );
  }, []);

  const handleScan = (detectedCodes: any[]) => {
    if (scanned || !detectedCodes || detectedCodes.length === 0) return;

    const qrData = detectedCodes[0].rawValue;
    const expectedCode = `fusion_room_${expectedRoomId}`;

    if (qrData === expectedCode) {
      setScanned(true);
      onSuccess();
    } else {
      // REGRA SÊNIOR: Debounce de 3 segundos para não travar o celular com alertas
      const now = Date.now();
      if (now - lastErrorTimeRef.current > 3000) {
        lastErrorTimeRef.current = now;
        toast({
          variant: "destructive",
          title: "QR Code Inválido 🚫",
          description: "O código lido não pertence à sala da sua reserva.",
        });
      }
    }
  };

  if (checkingLocation) {
    return (
      <div className="fixed top-0 left-0 w-screen h-[100dvh] z-[9999] bg-slate-900 flex flex-col items-center justify-center p-6 text-center">
        <MapPin className="w-16 h-16 text-[#f05e23] animate-bounce mb-4" />
        <h2 className="text-xl font-black text-white mb-2">
          Preparando Scanner...
        </h2>
        <p className="text-slate-400 font-medium text-sm">
          Otimizando câmera e sensores.
        </p>
      </div>
    );
  }

  return (
    <div className="fixed top-0 left-0 w-screen h-[100dvh] z-[9999] bg-black flex flex-col overflow-hidden">
      <div className="absolute top-0 inset-x-0 z-50 p-6 pt-14 flex justify-between items-center bg-gradient-to-b from-black/90 to-transparent">
        <button
          onClick={onCancel}
          className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center text-white backdrop-blur-md hover:bg-white/30 transition-colors"
        >
          <X className="w-6 h-6" />
        </button>
        <div className="bg-white/20 px-5 py-2 rounded-full backdrop-blur-md flex items-center gap-2 border border-white/10 shadow-lg">
          <Camera className="w-4 h-4 text-emerald-400" />
          <span className="text-xs font-bold text-white tracking-widest uppercase">
            {type === "checkin" ? "Check-in Seguro" : "Check-out"}
          </span>
        </div>
        <div className="w-12"></div>
      </div>

      {cameraError && (
        <div className="absolute inset-0 z-40 bg-black flex flex-col items-center justify-center p-8 text-center">
          <AlertCircle className="w-16 h-16 text-red-500 mb-4" />
          <h2 className="text-xl font-black text-white mb-2">
            Câmera Bloqueada
          </h2>
          <p className="text-slate-400 font-medium text-sm mb-8">
            {cameraError}
          </p>
        </div>
      )}

      <div className="absolute inset-0 w-full h-full z-0 flex items-center justify-center bg-black">
        <Scanner
          onScan={handleScan}
          onError={(error) => {
            console.error("Erro da Câmera:", error);
            setCameraError(
              "Não foi possível acessar a câmera do seu dispositivo.",
            );
          }}
          constraints={{ facingMode: "environment" }}
          components={{
            tracker: () => {},
          }}
          styles={{
            container: { width: "100%", height: "100%" },
            video: { objectFit: "cover", width: "100%", height: "100%" },
          }}
        />
      </div>

      <div className="absolute inset-0 z-10 pointer-events-none flex flex-col items-center justify-center">
        <div className="w-64 h-64 border-2 border-white/20 rounded-[2rem] relative flex items-center justify-center overflow-hidden shadow-[0_0_50px_rgba(0,0,0,0.5)]">
          <div className="absolute top-0 left-0 w-12 h-12 border-t-4 border-l-4 border-[#f05e23] rounded-tl-[2rem]"></div>
          <div className="absolute top-0 right-0 w-12 h-12 border-t-4 border-r-4 border-[#f05e23] rounded-tr-[2rem]"></div>
          <div className="absolute bottom-0 left-0 w-12 h-12 border-b-4 border-l-4 border-[#f05e23] rounded-bl-[2rem]"></div>
          <div className="absolute bottom-0 right-0 w-12 h-12 border-b-4 border-r-4 border-[#f05e23] rounded-br-[2rem]"></div>

          <div className="w-full h-1 bg-[#f05e23] opacity-70 shadow-[0_0_15px_#f05e23] absolute top-1/2 animate-[scan_2s_ease-in-out_infinite]"></div>
        </div>

        <div className="mt-8 bg-black/60 backdrop-blur-md px-6 py-4 rounded-2xl border border-white/10 text-center mx-4">
          <p className="text-sm font-bold text-white mb-1">
            Aponte para o QR Code
          </p>
          <p className="text-xs font-medium text-slate-300">
            A leitura será automática.
          </p>
        </div>
      </div>
    </div>
  );
}
