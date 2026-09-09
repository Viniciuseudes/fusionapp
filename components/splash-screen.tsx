"use client";

import { useEffect, useState } from "react";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // ESTEIRA DE ANIMAÇÃO COREOGRAFADA (Timings precisos de UX)
    const t1 = setTimeout(() => setStage(1), 100); // Entra a logo
    const t2 = setTimeout(() => setStage(2), 600); // Entra o Glow e a barra carrega
    const t3 = setTimeout(() => setStage(3), 2800); // Fade out (desmonta a tela)
    const t4 = setTimeout(() => onComplete(), 3300); // Libera o app

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  // A cor exata extraída da sua marca
  const brandOrange = "#f05e23";

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center transition-all duration-500 ease-in-out ${
        stage === 3
          ? "opacity-0 scale-105 pointer-events-none"
          : "opacity-100 scale-100"
      }`}
    >
      {/* EFEITO DE BRILHO (GLOW) AO FUNDO */}
      <div
        className={`absolute w-64 h-64 rounded-full blur-[80px] transition-all duration-[2000ms] ease-out ${
          stage >= 2 ? "opacity-20 scale-150" : "opacity-0 scale-50"
        }`}
        style={{ backgroundColor: brandOrange }}
      />

      {/* ÁREA DA LOGO ANIMADA */}
      <div
        className={`relative z-10 flex flex-col items-center transition-all duration-1000 ease-out ${
          stage >= 1 ? "translate-y-0 opacity-100" : "translate-y-12 opacity-0"
        }`}
      >
        {/* A imagem do seu "F" com fundo transparente */}
        <img
          src="/logo-fusion-orange.png"
          alt="Fusion Clinic"
          className="w-32 h-32 object-contain drop-shadow-2xl"
        />

        {/* TEXTO DA MARCA (Opcional, se já não estiver na imagem acima) */}
        <div
          className={`mt-6 overflow-hidden transition-all duration-1000 delay-300 ${
            stage >= 1 ? "opacity-100" : "opacity-0"
          }`}
        >
          <h1
            className="text-4xl font-black tracking-tighter"
            style={{ color: brandOrange }}
          >
            Fusion Clinic
          </h1>
        </div>
      </div>

      {/* BARRA DE PROGRESSO MINIMALISTA (Estilo Apple) */}
      <div
        className={`absolute bottom-20 w-48 h-1 bg-slate-100 rounded-full overflow-hidden transition-all duration-700 delay-500 ${
          stage >= 1 ? "opacity-100" : "opacity-0"
        }`}
      >
        <div
          className="h-full rounded-full transition-all ease-in-out"
          style={{
            backgroundColor: brandOrange,
            width: stage >= 2 ? "100%" : "0%",
            transitionDuration: "2200ms",
          }}
        />
      </div>
    </div>
  );
}
