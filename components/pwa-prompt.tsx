"use client";

import { useState, useEffect } from "react";
import { X, Share, PlusSquare, Download, Loader2 } from "lucide-react";

export function PWAPrompt() {
  const [isIOS, setIsIOS] = useState(false);
  const [isStandalone, setIsStandalone] = useState(true);
  const [showPrompt, setShowPrompt] = useState(false);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    // 1. Verifica se já está instalado
    const checkIsStandalone = () => {
      const isStandaloneQuery = window.matchMedia(
        "(display-mode: standalone)",
      ).matches;
      const isIOSStandalone = (window.navigator as any).standalone === true;
      const isAndroidTwa = document.referrer.includes("android-app://");
      return isStandaloneQuery || isIOSStandalone || isAndroidTwa;
    };

    if (checkIsStandalone()) {
      setIsStandalone(true);
      return;
    } else {
      setIsStandalone(false);
    }

    // 2. Detecta iOS
    const userAgent = window.navigator.userAgent.toLowerCase();
    const isIOSDevice = /iphone|ipad|ipod/.test(userAgent);
    setIsIOS(isIOSDevice);

    // 3. Verifica a armadilha global repetidamente (resolve a penalidade do Chrome)
    const checkGlobalPrompt = setInterval(() => {
      if ((window as any).deferredPrompt) {
        setIsReady(true);
        clearInterval(checkGlobalPrompt);
      }
    }, 500);

    // 4. Captura também por evento (caso demore)
    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      (window as any).deferredPrompt = e;
      setIsReady(true);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    // 5. Escuta o sucesso da instalação
    const handleAppInstalled = () => {
      setIsStandalone(true);
      setShowPrompt(false);
      (window as any).deferredPrompt = null;
    };
    window.addEventListener("appinstalled", handleAppInstalled);

    // 6. Mostra no mobile
    const isMobile = /android|iphone|ipad|ipod/.test(userAgent);
    if (isMobile) {
      setTimeout(() => setShowPrompt(true), 2500);
    }

    return () => {
      clearInterval(checkGlobalPrompt);
      window.removeEventListener(
        "beforeinstallprompt",
        handleBeforeInstallPrompt,
      );
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  // Registra o Service Worker
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js", { scope: "/" })
        .catch((err) => {
          console.error("Erro no Service Worker do PWA", err);
        });
    }
  }, []);

  if (isStandalone || !showPrompt) return null;

  const handleInstallClick = async () => {
    const promptEvent = (window as any).deferredPrompt;
    if (!promptEvent) return;

    // Dispara a janela nativa do Android
    promptEvent.prompt();

    // Aguarda a resposta do usuário
    const { outcome } = await promptEvent.userChoice;

    if (outcome === "accepted") {
      setShowPrompt(false);
    }

    (window as any).deferredPrompt = null;
    setIsReady(false);
  };

  return (
    <div className="fixed bottom-0 left-0 w-full z-[100] p-4 animate-in slide-in-from-bottom-10 duration-500">
      <div className="bg-slate-900 text-white p-4 rounded-3xl shadow-2xl border border-slate-800 flex items-start gap-4">
        <div className="w-12 h-12 bg-[#f05e23] rounded-2xl flex items-center justify-center font-black text-xl shrink-0 shadow-sm">
          F
        </div>
        <div className="flex-1">
          <div className="flex justify-between items-start mb-1">
            <h3 className="font-bold text-sm">Instalar App da Fusion</h3>
            <button
              onClick={() => setShowPrompt(false)}
              className="text-slate-400 hover:text-white transition-colors"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {isIOS ? (
            <div className="text-[11px] text-slate-300 font-medium leading-relaxed mt-2 bg-slate-800/50 p-2.5 rounded-xl border border-slate-700/50">
              Para instalar, toque em{" "}
              <Share className="w-3.5 h-3.5 inline mx-1" /> <b>Compartilhar</b>{" "}
              e depois escolha{" "}
              <PlusSquare className="w-3.5 h-3.5 inline mx-1" />{" "}
              <b>Adicionar à Tela de Início</b>.
            </div>
          ) : (
            <>
              <p className="text-[11px] text-slate-400 font-medium mb-3 leading-relaxed pr-2">
                Tenha o aplicativo no seu celular para acesso rápido às suas
                reservas e mensagens.
              </p>

              <button
                onClick={handleInstallClick}
                disabled={!isReady}
                className={`px-4 py-2.5 rounded-xl text-xs font-bold flex items-center gap-2 transition-all ${
                  isReady
                    ? "bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg shadow-orange-500/20"
                    : "bg-slate-800 text-slate-500 cursor-not-allowed"
                }`}
              >
                {!isReady ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" /> Verificando...
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" /> Instalar
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
