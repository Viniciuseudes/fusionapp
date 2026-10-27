// app/api/subscriptions/cancel/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { sendSubscriptionCancellationEmail } from "@/app/actions/send-email";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createAdminClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

function getAsaasConfig() {
  let apiKey = (
    process.env.ASAAS_API_KEY ||
    process.env.ASAAS_ACCESS_TOKEN ||
    process.env.ASAAS_TOKEN ||
    ""
  )
    .trim()
    .replace(/^["']|["']$/g, "");

  if (apiKey.startsWith("\\$")) {
    apiKey = apiKey.slice(1);
  }

  const isSandboxKey = apiKey.toLowerCase().includes("hmlg");
  let apiUrl = (process.env.ASAAS_API_URL || "").trim().replace(/\/+$/, "");

  if (!apiUrl) {
    apiUrl = isSandboxKey
      ? "https://sandbox.asaas.com/api/v3"
      : "https://api.asaas.com/v3";
  } else if (isSandboxKey && !apiUrl.includes("sandbox")) {
    apiUrl = "https://sandbox.asaas.com/api/v3";
  } else if (
    !isSandboxKey &&
    apiUrl.includes("sandbox") &&
    apiKey.includes("prod")
  ) {
    apiUrl = "https://api.asaas.com/v3";
  }

  return { apiKey, apiUrl };
}

export async function POST() {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: authErr,
    } = await supabase.auth.getUser();

    if (authErr || !user) {
      return NextResponse.json(
        { error: "Usuário não autenticado." },
        { status: 401 },
      );
    }

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, cpf")
      .eq("id", user.id)
      .single();

    const { apiKey, apiUrl } = getAsaasConfig();
    let cancelledInAsaasCount = 0;

    // 1. Localiza o cliente no Asaas pelo CPF e cancela todas as assinaturas ACTIVE dele
    if (apiKey && profile?.cpf) {
      const cleanCpf = profile.cpf.replace(/\D/g, "");
      if (cleanCpf) {
        const custRes = await fetch(
          `${apiUrl}/customers?cpfCnpj=${cleanCpf}`,
          {
            headers: {
              access_token: apiKey,
              "User-Agent": "FusionClinic/1.0",
            },
            cache: "no-store",
          },
        );

        if (custRes.ok) {
          const custData = await custRes.json();
          const customers = custData?.data || [];

          for (const cust of customers) {
            const subsRes = await fetch(
              `${apiUrl}/subscriptions?customer=${cust.id}&status=ACTIVE`,
              {
                headers: {
                  access_token: apiKey,
                  "User-Agent": "FusionClinic/1.0",
                },
                cache: "no-store",
              },
            );

            if (subsRes.ok) {
              const subsData = await subsRes.json();
              const activeSubs = subsData?.data || [];

              for (const sub of activeSubs) {
                // Remove também eventuais cobranças pendentes futuras geradas pela assinatura
                const delRes = await fetch(
                  `${apiUrl}/subscriptions/${sub.id}`,
                  {
                    method: "DELETE",
                    headers: {
                      access_token: apiKey,
                      "User-Agent": "FusionClinic/1.0",
                    },
                  },
                );
                if (delRes.ok) {
                  cancelledInAsaasCount++;
                }
              }
            }
          }
        }
      }
    }

    // 2. Atualiza o status na tabela `subscriptions` do Supabase para CANCELLED
    await supabaseAdmin
      .from("subscriptions")
      .update({ status: "CANCELLED" })
      .eq("user_id", user.id)
      .eq("status", "ACTIVE");

    // 3. Registra notificação no sino do app e envia e-mail de confirmação
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: user.id,
        type: "subscription_cancelled",
        title: "Renovação Automática Cancelada",
        content:
          "Sua assinatura do Fusion Pass+ foi cancelada. Nenhuma nova cobrança será feita no seu cartão e suas horas atuais seguem disponíveis até o vencimento.",
        link: "/dashboard",
        is_read: false,
      });
    } catch {}

    const recipientEmail = profile?.email || user.email;
    if (recipientEmail) {
      sendSubscriptionCancellationEmail(
        recipientEmail,
        profile?.full_name || "Doutor(a)",
      ).catch(console.error);
    }

    return NextResponse.json({
      success: true,
      cancelledInAsaasCount,
      message:
        "Sua renovação automática foi cancelada. Nenhuma nova cobrança será feita no seu cartão e seu saldo atual continua disponível até expirar.",
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro ao cancelar assinatura." },
      { status: 500 },
    );
  }
}