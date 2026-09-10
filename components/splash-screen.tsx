"use client";

import { useEffect, useState } from "react";

export function SplashScreen({ onComplete }: { onComplete: () => void }) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // TIMING COREOGRAFADO PARA UMA EXPERIÊNCIA CINEMATOGRÁFICA
    const t1 = setTimeout(() => setStage(1), 50); // Inicia o "respiro" da logo e o Glow
    const t2 = setTimeout(() => setStage(2), 600); // Entra o Slogan e a barra começa a carregar
    const t3 = setTimeout(() => setStage(3), 2800); // Tela dissolve suavemente
    const t4 = setTimeout(() => onComplete(), 3300); // App é liberado para uso

    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
      clearTimeout(t4);
    };
  }, [onComplete]);

  const brandOrange = "#BF4B24";

  return (
    <div
      className={`fixed inset-0 z-[9999] bg-white flex flex-col items-center justify-center transition-all duration-700 ease-in-out ${
        stage === 3
          ? "opacity-0 scale-105 pointer-events-none"
          : "opacity-100 scale-100"
      }`}
    >
      {/* EFEITO DE BRILHO (GLOW) PULSANTE AO FUNDO */}
      <div
        className={`absolute w-[300px] h-[300px] rounded-full blur-[100px] transition-all duration-[2000ms] ease-out ${
          stage >= 1 ? "opacity-20 scale-150" : "opacity-0 scale-50"
        }`}
        style={{ backgroundColor: brandOrange }}
      />

      <div className="relative z-10 flex flex-col items-center">
        {/* A LOGO PRINCIPAL (Com o texto "Fusion Clinic" já embutido nela) */}
        <img
          src="/logo-fusion-orange.png"
          alt="Fusion Clinic"
          className={`w-56 h-auto object-contain transition-all duration-1000 ease-out ${
            stage >= 1
              ? "translate-y-0 opacity-100 drop-shadow-2xl"
              : "translate-y-4 opacity-0"
          }`}
        />

        {/* O NOVO SLOGAN SOFISTICADO */}
        <div
          className={`mt-3 overflow-hidden transition-all duration-1000 delay-300 ${
            stage >= 2 ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
          }`}
        >
          <p className="text-slate-400 font-semibold tracking-[0.2em] text-[10px] uppercase text-center">
            A sua flexibilidade em consutórios
          </p>
        </div>
      </div>

      {/* BARRA DE PROGRESSO APPLE-STYLE */}
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
