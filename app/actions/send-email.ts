"use server";

import { Resend } from "resend";
import WelcomeEmail from "@/emails/WelcomeEmail";

export async function sendWelcomeEmail(userEmail: string, userFirstName: string) {
  try {
    // DIAGNÓSTICO: Vamos ver o que aparece na consola preta do teu terminal
    console.log("VALOR DA CHAVE NO ENV:", process.env.RESEND_API_KEY);

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new Error("A chave RESEND_API_KEY está vazia ou não foi encontrada pelo Next.js!");
    }

    const resend = new Resend(apiKey);

    const { data, error } = await resend.emails.send({
      from: "Fusion Clinic <nao-responda@fusionapp.com.br>",
      to: [userEmail],
      subject: "Bem-vindo(a) à Fusion Clinic! 🎉",
      react: WelcomeEmail({ userFirstName }),
    });

    if (error) {
      console.error("Erro no Resend:", error);
      return { success: false, error: error.message };
    }

    return { success: true, data };
  } catch (error: any) {
    console.error("Erro fatal ao enviar e-mail:", error);
    return { success: false, error: error.message };
  }
}