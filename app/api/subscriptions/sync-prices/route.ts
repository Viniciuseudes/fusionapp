// app/api/subscriptions/sync-prices/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isPaidSubscriptionTransaction } from "@/utils/wallet-ledger";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

function getAsaasConfig() {
  const rawKey =
    process.env.ASAAS_API_KEY ||
    process.env.ASAAS_ACCESS_TOKEN ||
    process.env.ASAAS_TOKEN ||
    "";

  let apiKey = rawKey.trim().replace(/^["']|["']$/g, "");
  if (apiKey.startsWith("\\$")) {
    apiKey = apiKey.slice(1);
  }

  const isSandboxKey = apiKey.toLowerCase().includes("hmlg");
  const envUrl = (process.env.ASAAS_API_URL || "").trim().replace(/\/+$/, "");

  let apiUrl = envUrl;
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
    const { apiKey, apiUrl } = getAsaasConfig();
    if (!apiKey) {
      return NextResponse.json({ synced: 0, warning: "Sem chave Asaas" });
    }

    const [txsRes, subsRes] = await Promise.all([
      supabaseAdmin
        .from("wallet_transactions")
        .select("id, user_id, amount, type, tier, description, created_at")
        .gt("amount", 0)
        .order("created_at", { ascending: false }),
      supabaseAdmin.from("subscriptions").select("user_id"),
    ]);

    const subUserIds = new Set(
      (subsRes.data || []).map((s: any) => s.user_id).filter(Boolean),
    );

    const unsyncedTxs = (txsRes.data || []).filter((tx: any) => {
      const desc = String(tx.description || "");
      // Se já tem o valor exato gravado em [Paid:XX.XX], não precisa sincronizar de novo
      if (/\[Paid:\d+(?:\.\d+)?\]/i.test(desc)) return false;
      return isPaidSubscriptionTransaction(tx, subUserIds.has(tx.user_id));
    });

    if (unsyncedTxs.length === 0) {
      return NextResponse.json({ synced: 0 });
    }

    const userIds = [
      ...new Set(unsyncedTxs.map((t: any) => t.user_id).filter(Boolean)),
    ];
    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("id, cpf")
      .in("id", userIds);

    const cpfByUser = new Map<string, string>(
      (profiles || []).map((p: any) => [
        p.id,
        String(p.cpf || "").replace(/\D/g, ""),
      ]),
    );

    let syncedCount = 0;

    for (const tx of unsyncedTxs) {
      const desc = String(tx.description || "");
      const hours = Math.max(1, Number(tx.amount || 1));

      let asaasPayment: any = null;

      // 1. Tenta extrair o pay_... direto da descrição ([Asaas:pay_...] ou (pay_...))
      const payMatch = desc.match(/(pay_[a-zA-Z0-9_]+)/i);
      if (payMatch && payMatch[1]) {
        const pRes = await fetch(`${apiUrl}/payments/${payMatch[1]}`, {
          headers: {
            access_token: apiKey,
            "User-Agent": "FusionClinic/1.0",
          },
          cache: "no-store",
        });
        if (pRes.ok) {
          asaasPayment = await pRes.json();
        }
      }

      // 2. Se tinha um ID de assinatura (sub_...) no lugar de pay_...
      if (!asaasPayment) {
        const subIdMatch = desc.match(/\[Asaas:(sub_[a-zA-Z0-9_]+)\]/i);
        if (subIdMatch && subIdMatch[1]) {
          const sRes = await fetch(
            `${apiUrl}/subscriptions/${subIdMatch[1]}/payments`,
            {
              headers: {
                access_token: apiKey,
                "User-Agent": "FusionClinic/1.0",
              },
              cache: "no-store",
            },
          );
          if (sRes.ok) {
            const sData = await sRes.json();
            asaasPayment =
              (sData?.data || []).find(
                (p: any) =>
                  p.status === "RECEIVED" || p.status === "CONFIRMED",
              ) || sData?.data?.[0];
          }
        }
      }

      // 3. Fallback: Busca pelo CPF do profissional no Asaas e acha a cobrança daquela data
      if (!asaasPayment) {
        const cleanCpf = cpfByUser.get(tx.user_id);
        if (cleanCpf) {
          const cRes = await fetch(
            `${apiUrl}/customers?cpfCnpj=${cleanCpf}`,
            {
              headers: {
                access_token: apiKey,
                "User-Agent": "FusionClinic/1.0",
              },
              cache: "no-store",
            },
          );
          if (cRes.ok) {
            const cData = await cRes.json();
            const customerId = cData?.data?.[0]?.id;
            if (customerId) {
              const pListRes = await fetch(
                `${apiUrl}/payments?customer=${customerId}&limit=20`,
                {
                  headers: {
                    access_token: apiKey,
                    "User-Agent": "FusionClinic/1.0",
                  },
                  cache: "no-store",
                },
              );
              if (pListRes.ok) {
                const pListData = await pListRes.json();
                const txTimeMs = tx.created_at
                  ? new Date(tx.created_at).getTime()
                  : Date.now();

                const confirmedList = (pListData?.data || []).filter(
                  (p: any) =>
                    (p.status === "RECEIVED" || p.status === "CONFIRMED") &&
                    (Boolean(p.subscription) ||
                      String(p.externalReference || "").startsWith("sub_") ||
                      String(p.description || "")
                        .toLowerCase()
                        .includes("assinatura") ||
                      String(p.description || "")
                        .toLowerCase()
                        .includes("fusion pass")),
                );

                if (confirmedList.length > 0) {
                  confirmedList.sort((a: any, b: any) => {
                    const dA = new Date(
                      a.clientPaymentDate || a.paymentDate || a.dateCreated,
                    ).getTime();
                    const dB = new Date(
                      b.clientPaymentDate || b.paymentDate || b.dateCreated,
                    ).getTime();
                    return Math.abs(dA - txTimeMs) - Math.abs(dB - txTimeMs);
                  });
                  asaasPayment = confirmedList[0];
                }
              }
            }
          }
        }
      }

      if (asaasPayment && Number(asaasPayment.value) > 0) {
        const exactPaidBrl = Number(asaasPayment.value);
        const exactHourlyRate = (exactPaidBrl / hours).toFixed(4);
        const viaTag =
          String(asaasPayment.billingType || "").toUpperCase() === "PIX"
            ? "[Via:PIX]"
            : "[Via:CARTAO]";

        const cleanDesc = desc
          .replace(/\[Paid:.*?\]/gi, "")
          .replace(/\[Rate:.*?\]/gi, "")
          .replace(/\[Via:.*?\]/gi, "")
          .trim();

        const hasAsaasTag = /\[Asaas:.*?\]/i.test(cleanDesc);
        const newDesc = `${cleanDesc} ${viaTag} [Paid:${exactPaidBrl.toFixed(2)}] [Rate:${exactHourlyRate}]${hasAsaasTag ? "" : ` [Asaas:${asaasPayment.id}]`}`;

        await supabaseAdmin
          .from("wallet_transactions")
          .update({
            type: "package_purchase",
            description: newDesc,
          })
          .eq("id", tx.id);

        syncedCount++;
      }
    }

    return NextResponse.json({ synced: syncedCount });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro ao sincronizar preços" },
      { status: 500 },
    );
  }
}