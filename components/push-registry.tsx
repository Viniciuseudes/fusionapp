"use client";

import { useEffect } from "react";
import { createClient } from "@/utils/supabase/client";

const base64UrlToUint8Array = (base64UrlData: string) => {
  const padding = "=".repeat((4 - (base64UrlData.length % 4)) % 4);
  const base64 = (base64UrlData + padding)
    .replace(/\-/g, "+")
    .replace(/_/g, "/");

  const rawData = window.atob(base64);
  const buffer = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    buffer[i] = rawData.charCodeAt(i);
  }
  return buffer;
};

export function PushRegistry() {
  const supabase = createClient();

  useEffect(() => {
    async function registerPush() {
      // Verifica se o navegador suporta Service Worker e Push
      if (!("serviceWorker" in navigator) || !("PushManager" in window)) return;

      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;

        // Registra o Service Worker (se não estiver registrado)
        const registration = await navigator.serviceWorker.register("/sw.js");

        // Pergunta se o usuário aceita receber notificação
        const permission = await window.Notification.requestPermission();
        if (permission !== "granted") return;

        // Verifica se já tem uma inscrição ativa
        let subscription = await registration.pushManager.getSubscription();

        // Se não tiver, inscreve no servidor do Google/Apple
        if (!subscription) {
          const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
          if (!publicKey) return;

          subscription = await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToUint8Array(publicKey),
          });
        }

        // Salva a inscrição no Supabase para sabermos onde enviar!
        await supabase
          .from("profiles")
          .update({
            push_subscription: JSON.parse(JSON.stringify(subscription)),
          })
          .eq("id", user.id);
      } catch (error) {
        console.error("Erro ao registrar Push Notification:", error);
      }
    }

    // Espera 2 segundos após o load da página para não travar a UI inicial
    const timeout = setTimeout(registerPush, 2000);
    return () => clearTimeout(timeout);
  }, [supabase]);

  return null; // Componente invisível
}
