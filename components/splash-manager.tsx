"use client";

import { useState, useEffect } from "react";
import { SplashScreen } from "./splash-screen";

export function SplashManager({ children }: { children: React.ReactNode }) {
  const [showSplash, setShowSplash] = useState(false);

  useEffect(() => {
    // Checa se o usuário já viu a splash nesta sessão
    const hasSeenSplash = sessionStorage.getItem("fusion_splash_seen");

    if (!hasSeenSplash) {
      setShowSplash(true);
      sessionStorage.setItem("fusion_splash_seen", "true");
    }
  }, []);

  return (
    <>
      {showSplash && <SplashScreen onComplete={() => setShowSplash(false)} />}

      {/* O aplicativo carrega nos bastidores enquanto a Splash aparece por cima */}
      {children}
    </>
  );
}
