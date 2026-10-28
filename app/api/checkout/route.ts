// app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import {
  sendBookingNotificationEmails,
  sendPaymentNotificationEmails,
} from "@/app/actions/send-email";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createAdminClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { persistSession: false },
  },
);

// ============================================================================
// RESOLVEDOR INTELIGENTE DE CREDENCIAIS E AMBIENTE DO ASAAS
// ============================================================================
function getAsaasConfig() {
  const rawKey =
    process.env.ASAAS_API_KEY ||
    process.env.ASAAS_ACCESS_TOKEN ||
    process.env.ASAAS_TOKEN ||
    "";

  let apiKey = rawKey.trim().replace(/^["']|["']$/g, "");

  if (!apiKey) {
    throw new Error(
      "A variável ASAAS_API_KEY está vazia no seu ficheiro .env. Adicione ASAAS_API_KEY='$aact_...' e reinicie o servidor.",
    );
  }

  if (apiKey.startsWith("::") || apiKey.startsWith(":")) {
    throw new Error(
      "O Next.js cortou o início '$aact' da sua chave no .env! Coloque a chave entre ASPAS SIMPLES no .env (ex: ASAAS_API_KEY='$aact_...') e reinicie o terminal.",
    );
  }

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

// ============================================================================
// Helper Idempotente: Ativa a assinatura e injeta as horas
// ============================================================================

async function activateSubscriptionAndCreditWallet(params: {
  userId: string;
  tier: string;
  hours: number;
  priceBrl: number;
  paymentId: string;
  subscriptionId?: string;
  paymentMethod: string;
  packageName?: string;
}) {
  const {
    userId,
    tier,
    hours,
    priceBrl,
    paymentId,
    paymentMethod,
    packageName,
  } = params;

  const normalizedTier = String(tier || "start").toLowerCase().trim();
  const numHours = Math.max(1, Number(hours || 1));
  const numPrice = Number(priceBrl || 0);
  const unitHourlyRate =
    numPrice > 0 ? (numPrice / numHours).toFixed(4) : "0.0000";

  const idempotencyTag = `[Asaas:${paymentId}]`;
  const paidTag = numPrice > 0 ? `[Paid:${numPrice.toFixed(2)}]` : "";
  const rateTag = Number(unitHourlyRate) > 0 ? `[Rate:${unitHourlyRate}]` : "";
  const viaTag = paymentMethod.toUpperCase().includes("PIX")
    ? "[Via:PIX]"
    : "[Via:CARTAO]";

  const { data: existingTx } = await supabaseAdmin
    .from("wallet_transactions")
    .select("id")
    .eq("user_id", userId)
    .ilike("description", `%${idempotencyTag}%`)
    .limit(1);

  if (existingTx && existingTx.length > 0) {
    return { alreadyCredited: true };
  }

  await supabaseAdmin
    .from("subscriptions")
    .update({ status: "INACTIVE" })
    .eq("user_id", userId)
    .eq("status", "ACTIVE");

  await supabaseAdmin.from("subscriptions").insert({
    user_id: userId,
    tier: normalizedTier,
    hours: numHours,
    status: "ACTIVE",
  });

  const expiresAt = new Date(
    Date.now() + 30 * 24 * 60 * 60 * 1000,
  ).toISOString();

  const description = `Assinatura ${packageName || `Fusion Pass (${normalizedTier.toUpperCase()})`} - +${numHours}h ${viaTag} ${paidTag} ${rateTag} ${idempotencyTag}`;

  const { error: walletErr } = await supabaseAdmin
    .from("wallet_transactions")
    .insert({
      user_id: userId,
      amount: numHours,
      type: "package_purchase",
      tier: normalizedTier,
      description,
      expires_at: expiresAt,
    });

  if (walletErr) {
    throw new Error(`Erro ao creditar carteira: ${walletErr.message}`);
  }

  try {
    await supabaseAdmin.from("notifications").insert({
      user_id: userId,
      type: "subscription_active",
      title: "Seu Fusion Pass+ está Ativo!",
      content: `Foram liberadas +${numHours}h (${normalizedTier.toUpperCase()}) na sua carteira digital.`,
      link: "/dashboard",
      is_read: false,
    });
  } catch {}

  sendPaymentNotificationEmails({
    userId,
    amountBrl: numPrice,
    creditsAdded: numHours,
    tier: normalizedTier,
    paymentMethod,
    description: `${packageName || "Fusion Pass+"} (${numHours}h/mês)`,
  }).catch(console.error);

  return { alreadyCredited: false };
}

// ============================================================================
// GET: Polling de Reconciliação Ativa (Suporta Reservas e Assinaturas PIX)
// ============================================================================
export async function GET(request: Request) {
  try {
    const { apiKey, apiUrl } = getAsaasConfig();
    const { searchParams } = new URL(request.url);
    const checkoutType = searchParams.get("checkoutType");
    const bookingId = searchParams.get("bookingId");
    const paymentId = searchParams.get("paymentId");

    // FLUXO A: POLLING DE ASSINATURA / PACOTE (FUSION PASS+)
    if (checkoutType === "package" && paymentId) {
      const supabase = await createClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        return NextResponse.json({ error: "Não autenticado" }, { status: 401 });
      }

      const tier = searchParams.get("tier") || "start";
      const hours = Number(searchParams.get("hours") || 8);
      const price = Number(searchParams.get("price") || 0);
      const packageName = searchParams.get("packageName") || "Fusion Pass+";

      const asaasRes = await fetch(`${apiUrl}/payments/${paymentId}`, {
        headers: {
          access_token: apiKey,
          "User-Agent": "FusionClinic/1.0",
        },
        cache: "no-store",
      });

      if (asaasRes.ok) {
        const paymentData = await asaasRes.json();

        if (
          paymentData.status === "RECEIVED" ||
          paymentData.status === "CONFIRMED"
        ) {
          await activateSubscriptionAndCreditWallet({
            userId: user.id,
            tier,
            hours,
            priceBrl: price || Number(paymentData.value || 0),
            paymentId,
            paymentMethod: "PIX",
            packageName,
          });

          return NextResponse.json({
            confirmed: true,
            status: "confirmed",
          });
        }
      }

      return NextResponse.json({ confirmed: false, status: "pending" });
    }

    // FLUXO B: POLLING DE RESERVA DE SALA
    if (!bookingId) {
      return NextResponse.json(
        { error: "bookingId ou paymentId é obrigatório." },
        { status: 400 },
      );
    }

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id, status, asaas_payment_id")
      .eq("id", bookingId)
      .single();

    if (bErr || !booking) {
      return NextResponse.json(
        { error: "Reserva não encontrada." },
        { status: 404 },
      );
    }

    if (booking.status === "confirmed") {
      return NextResponse.json({ confirmed: true, status: "confirmed" });
    }
    if (booking.status === "cancelled") {
      return NextResponse.json({ confirmed: false, status: "cancelled" });
    }

    if (booking.asaas_payment_id) {
      const asaasRes = await fetch(
        `${apiUrl}/payments/${booking.asaas_payment_id}`,
        {
          headers: {
            access_token: apiKey,
            "User-Agent": "FusionClinic/1.0",
          },
          cache: "no-store",
        },
      );

      if (asaasRes.ok) {
        const paymentData = await asaasRes.json();

        if (
          paymentData.status === "RECEIVED" ||
          paymentData.status === "CONFIRMED"
        ) {
          await supabaseAdmin
            .from("bookings")
            .update({ status: "confirmed" })
            .eq("asaas_payment_id", booking.asaas_payment_id);

          await supabaseAdmin
            .from("bookings")
            .update({ status: "confirmed" })
            .eq("id", bookingId);

          sendBookingNotificationEmails(bookingId).catch(console.error);

          return NextResponse.json({ confirmed: true, status: "confirmed" });
        }
      }
    }

    return NextResponse.json({ confirmed: false, status: booking.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// Helper: Busca ou Cria Cliente no Asaas garantindo CPF válido
// ============================================================================
async function getOrCreateAsaasCustomer(params: {
  apiKey: string;
  apiUrl: string;
  userId: string;
  userEmail: string;
  profile: any;
  fallbackCpf?: string;
  fallbackCep?: string;
}) {
  const {
    apiKey,
    apiUrl,
    userId,
    userEmail,
    profile,
    fallbackCpf,
    fallbackCep,
  } = params;

  const cleanCpf = (fallbackCpf || profile?.cpf || "").replace(/\D/g, "");
  const cleanCep = (fallbackCep || profile?.cep || "").replace(/\D/g, "");

  if (!cleanCpf || (cleanCpf.length !== 11 && cleanCpf.length !== 14)) {
    throw new Error(
      "Informe um CPF válido (11 dígitos) para concluir a operação.",
    );
  }

  const profileUpdates: Record<string, any> = {};
  if (!profile?.cpf && cleanCpf) profileUpdates.cpf = cleanCpf;
  if (!profile?.cep && cleanCep) profileUpdates.cep = cleanCep;
  if (Object.keys(profileUpdates).length > 0) {
    await supabaseAdmin
      .from("profiles")
      .update(profileUpdates)
      .eq("id", userId);
  }

  let asaasCustomerId = "";

  const searchRes = await fetch(`${apiUrl}/customers?cpfCnpj=${cleanCpf}`, {
    headers: {
      access_token: apiKey,
      "User-Agent": "FusionClinic/1.0",
    },
  });

  if (searchRes.ok) {
    const searchData = await searchRes.json();
    if (searchData.data && searchData.data.length > 0) {
      asaasCustomerId = searchData.data[0].id;
    }
  } else {
    const errJson = await searchRes.json().catch(() => ({}));
    const asaasMsg = errJson?.errors?.[0]?.description || "";
    if (searchRes.status === 401 || asaasMsg.toLowerCase().includes("chave")) {
      throw new Error(
        `Chave Asaas recusada (${apiUrl.includes("sandbox") ? "Ambiente Sandbox" : "Ambiente Produção"}). Verifique no seu .env se ASAAS_API_KEY está entre aspas simples: ASAAS_API_KEY='$aact_...' e reinicie o servidor.`,
      );
    }
  }

  if (!asaasCustomerId) {
    const createCustomerRes = await fetch(`${apiUrl}/customers`, {
      method: "POST",
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        "User-Agent": "FusionClinic/1.0",
      },
      body: JSON.stringify({
        name:
          profile?.full_name || userEmail?.split("@")[0] || "Cliente Fusion",
        email: userEmail || profile?.email,
        cpfCnpj: cleanCpf,
        mobilePhone:
          (profile?.whatsapp || profile?.phone || "").replace(/\D/g, "") ||
          undefined,
      }),
    });

    const customerResult = await createCustomerRes.json();
    if (!createCustomerRes.ok) {
      throw new Error(
        customerResult.errors?.[0]?.description ||
          "Erro ao registar cliente no Asaas.",
      );
    }
    asaasCustomerId = customerResult.id;
  }

  return { asaasCustomerId, cleanCpf, cleanCep };
}

// ============================================================================
// POST: Processa Assinaturas Recorrentes (Fusion Pass+) e Reservas Avulsas
// ============================================================================
export async function POST(request: Request) {
  try {
    const { apiKey, apiUrl } = getAsaasConfig();

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Utilizador não autenticado." },
        { status: 401 },
      );
    }

    const body = await request.json();
    const {
      checkoutType,
      packageId,
      hours,
      packageName,
      price,
      paymentRef,
      bookingIds,
      billingType,
      creditCard,
      cardData,
      customerCpf,
      customerCep,
    } = body;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(
        "full_name, email, cpf, cep, address_number, phone, whatsapp, cc_token, cc_last4, cc_brand",
      )
      .eq("id", user.id)
      .single();

    // ========================================================================
    // ROTA 1: ASSINATURA RECORRENTE MENSAL DO FUSION PASS+ (checkoutType === "package")
    // ========================================================================
    if (checkoutType === "package" || checkoutType === "subscription") {
      const numHours = Number(hours || 0);
      const numPrice = Number(price || 0);
      const selectedTier = String(packageId || "start").toLowerCase().trim();
      const method = billingType || "PIX";

      if (!selectedTier || numHours <= 0 || numPrice <= 0) {
        return NextResponse.json(
          { error: "Dados do plano Fusion Pass inválidos ou incompletos." },
          { status: 400 },
        );
      }

      const { asaasCustomerId, cleanCpf, cleanCep } =
        await getOrCreateAsaasCustomer({
          apiKey,
          apiUrl,
          userId: user.id,
          userEmail: user.email || profile?.email || "",
          profile,
          fallbackCpf: cardData?.cpf || customerCpf,
          fallbackCep: cardData?.cep || customerCep,
        });

      const todayIso = new Date().toISOString().split("T")[0];
      // Todas as faturas futuras geradas pelo Asaas herdam este externalReference!
      const externalRef = `sub_${user.id}_${selectedTier}_${numHours}h_${Date.now()}`;

      const subscriptionPayload: Record<string, any> = {
        customer: asaasCustomerId,
        billingType: method,
        value: numPrice,
        nextDueDate: todayIso,
        cycle: "MONTHLY",
        description: `Assinatura ${packageName || "Fusion Pass+"} (${numHours}h/mês)`,
        externalReference: externalRef,
      };

      if (method === "CREDIT_CARD") {
        if (cardData?.useSavedCard && profile?.cc_token) {
          subscriptionPayload.creditCardToken = profile.cc_token;
        } else if (creditCard && cardData) {
          const finalCep = (cardData.cep || cleanCep || "59000000").replace(
            /\D/g,
            "",
          );
          const finalCpf = (cardData.cpf || cleanCpf).replace(/\D/g, "");

          if (!finalCpf) {
            return NextResponse.json(
              { error: "Informe o CPF do titular do cartão." },
              { status: 400 },
            );
          }

          subscriptionPayload.creditCard = creditCard;
          subscriptionPayload.creditCardHolderInfo = {
            name: creditCard.holderName,
            email: profile?.email || user.email,
            cpfCnpj: finalCpf,
            postalCode: finalCep || "59000000",
            addressNumber: profile?.address_number || "100",
            phone:
              (profile?.whatsapp || profile?.phone || "84999999999").replace(
                /\D/g,
                "",
              ) || "84999999999",
          };
          subscriptionPayload.remoteIp =
            request.headers.get("x-forwarded-for") || "127.0.0.1";
        } else {
          return NextResponse.json(
            { error: "Preencha os dados do cartão de crédito para assinar." },
            { status: 400 },
          );
        }
      }

      // 1. Cria a Assinatura Recorrente no Asaas (/v3/subscriptions)
      const subRes = await fetch(`${apiUrl}/subscriptions`, {
        method: "POST",
        headers: {
          access_token: apiKey,
          "Content-Type": "application/json",
          "User-Agent": "FusionClinic/1.0",
        },
        body: JSON.stringify(subscriptionPayload),
      });

      const subResult = await subRes.json();
      if (!subRes.ok) {
        throw new Error(
          subResult.errors?.[0]?.description ||
            "Não foi possível criar a assinatura no Asaas.",
        );
      }

      if (
        method === "CREDIT_CARD" &&
        cardData?.saveCard &&
        subResult.creditCard?.creditCardToken
      ) {
        await supabaseAdmin
          .from("profiles")
          .update({
            cc_token: subResult.creditCard.creditCardToken,
            cc_last4: subResult.creditCard.creditCardNumber,
            cc_brand: subResult.creditCard.creditCardBrand,
          })
          .eq("id", user.id);
      }

      // 2. Busca a primeira cobrança gerada pela assinatura no Asaas
      const subPaymentsRes = await fetch(
        `${apiUrl}/subscriptions/${subResult.id}/payments`,
        {
          headers: {
            access_token: apiKey,
            "User-Agent": "FusionClinic/1.0",
          },
          cache: "no-store",
        },
      );
      const subPaymentsData = await subPaymentsRes.json();
      const firstPayment = subPaymentsData?.data?.[0];

      if (method === "PIX") {
        if (!firstPayment?.id) {
          throw new Error(
            "Assinatura criada, mas a fatura PIX inicial não foi localizada.",
          );
        }

        const pixRes = await fetch(
          `${apiUrl}/payments/${firstPayment.id}/pixQrCode`,
          {
            headers: {
              access_token: apiKey,
              "User-Agent": "FusionClinic/1.0",
            },
          },
        );
        const pixData = await pixRes.json();
        if (!pixRes.ok) {
          throw new Error(
            pixData.errors?.[0]?.description ||
              "Erro ao gerar QR Code PIX da assinatura.",
          );
        }

        return NextResponse.json({
          success: true,
          subscriptionId: subResult.id,
          paymentId: firstPayment.id,
          status: "PENDING",
          pixQrCode: pixData.encodedImage,
          pixCopyPaste: pixData.payload,
        });
      }

      if (method === "CREDIT_CARD") {
        if (firstPayment?.status === "REJECTED") {
          await fetch(`${apiUrl}/subscriptions/${subResult.id}`, {
            method: "DELETE",
            headers: {
              access_token: apiKey,
              "User-Agent": "FusionClinic/1.0",
            },
          });
          return NextResponse.json(
            {
              error:
                "Cartão recusado pelo banco emissor. Verifique os dados ou tente via PIX.",
            },
            { status: 400 },
          );
        }

        const paymentIdForRecord = firstPayment?.id || subResult.id;

        await activateSubscriptionAndCreditWallet({
          userId: user.id,
          tier: selectedTier,
          hours: numHours,
          priceBrl: numPrice,
          paymentId: paymentIdForRecord,
          subscriptionId: subResult.id,
          paymentMethod: "CREDIT_CARD",
          packageName: packageName || "Fusion Pass+",
        });

        return NextResponse.json({
          success: true,
          subscriptionId: subResult.id,
          paymentId: paymentIdForRecord,
          status: "CONFIRMED",
        });
      }

      return NextResponse.json({
        success: true,
        subscriptionId: subResult.id,
        status: subResult.status,
      });
    }

    // ========================================================================
    // ROTA 2: RESERVA AVULSA DE SALA
    // ========================================================================
    const targetIds: string[] =
      Array.isArray(bookingIds) && bookingIds.length > 0
        ? bookingIds
        : paymentRef
          ? [paymentRef]
          : [];

    if (targetIds.length === 0 || !price) {
      return NextResponse.json(
        { error: "Dados incompletos para a reserva." },
        { status: 400 },
      );
    }

    const primaryBookingId = targetIds[0];

    const { data: targetBookings, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id, room_id, start_time, end_time, status")
      .in("id", targetIds);

    if (bErr || !targetBookings || targetBookings.length === 0) {
      return NextResponse.json(
        { error: "Reserva base não encontrada." },
        { status: 404 },
      );
    }

    const booking = targetBookings[0];
    const nowMs = Date.now();

    for (const tb of targetBookings) {
      const { data: conflicts } = await supabaseAdmin
        .from("bookings")
        .select("id, status, user_id, created_at, asaas_payment_id")
        .eq("room_id", tb.room_id)
        .neq("status", "cancelled")
        .lt("start_time", tb.end_time)
        .gt("end_time", tb.start_time);

      const isTaken = (conflicts || []).some((c: any) => {
        if (targetIds.includes(c.id)) return false;
        if (["confirmed", "in_progress", "completed"].includes(c.status || ""))
          return true;
        if (c.status === "pending_payment" || c.status === "pending") {
          if (c.user_id === user.id) return false;
          const lockTime = c.created_at ? new Date(c.created_at).getTime() : 0;
          const maxLockMs = c.asaas_payment_id
            ? 30 * 60 * 1000
            : 6 * 60 * 1000;
          return nowMs - lockTime <= maxLockMs;
        }
        return false;
      });

      if (isTaken) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "cancelled" })
          .in("id", targetIds);
        return NextResponse.json(
          {
            error:
              "Este horário acabou de ser reservado por outro profissional.",
          },
          { status: 409 },
        );
      }
    }

    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("name, host_id")
      .eq("id", booking.room_id)
      .single();

    const bookingDateStr = new Date(booking.start_time)
      .toISOString()
      .split("T")[0];
    const { data: activeCohostContract } = await supabaseAdmin
      .from("room_contracts")
      .select("id, specialist_id, cohost_split_pct")
      .eq("room_id", booking.room_id)
      .eq("status", "active")
      .eq("contract_type", "monthly_exclusive")
      .eq("allow_sublease", true)
      .lte("start_date", bookingDateStr)
      .gte("end_date", bookingDateStr)
      .maybeSingle();

    let recipientWalletId: string | null = null;

    if (activeCohostContract?.specialist_id) {
      const { data: cohostProfile } = await supabaseAdmin
        .from("profiles")
        .select("asaas_wallet_id")
        .eq("id", activeCohostContract.specialist_id)
        .single();
      recipientWalletId = cohostProfile?.asaas_wallet_id || null;
    } else if (room?.host_id) {
      const { data: hostProfile } = await supabaseAdmin
        .from("profiles")
        .select("asaas_wallet_id")
        .eq("id", room.host_id)
        .single();
      recipientWalletId = hostProfile?.asaas_wallet_id || null;
    }

    const { asaasCustomerId, cleanCpf, cleanCep } =
      await getOrCreateAsaasCustomer({
        apiKey,
        apiUrl,
        userId: user.id,
        userEmail: user.email || profile?.email || "",
        profile,
        fallbackCpf: cardData?.cpf || customerCpf,
        fallbackCep: cardData?.cep || customerCep,
      });

    const dueDate = new Date().toISOString().split("T")[0];
    const paymentPayload: any = {
      customer: asaasCustomerId,
      billingType: billingType || "PIX",
      value: price,
      dueDate: dueDate,
      description: `Reserva no App - ${room?.name || "Sala"}`,
      externalReference: primaryBookingId,
    };

    if (recipientWalletId) {
      const splitPct = activeCohostContract
        ? Number(activeCohostContract.cohost_split_pct || 80)
        : 80.0;
      paymentPayload.split = [
        { walletId: recipientWalletId, percentualValue: splitPct },
      ];
    }

    if (billingType === "CREDIT_CARD") {
      if (cardData?.useSavedCard && profile?.cc_token) {
        paymentPayload.creditCardToken = profile.cc_token;
      } else if (creditCard && cardData) {
        paymentPayload.creditCard = creditCard;

        let finalCpf = cleanCpf;
        let finalCep = cleanCep;

        if (cardData.isThirdParty) {
          finalCpf = cardData.cpf?.replace(/\D/g, "") || finalCpf;
          finalCep = cardData.cep?.replace(/\D/g, "") || finalCep;
        }

        if (!finalCpf || !finalCep) {
          return NextResponse.json(
            {
              error:
                "CPF ou CEP ausentes. Complete seu perfil ou preencha os dados do titular.",
            },
            { status: 400 },
          );
        }

        paymentPayload.creditCardHolderInfo = {
          name: creditCard.holderName,
          email: profile?.email || user.email,
          cpfCnpj: finalCpf,
          postalCode: finalCep,
          addressNumber: profile?.address_number || "S/N",
          phone:
            (profile?.whatsapp || profile?.phone || "84999999999").replace(
              /\D/g,
              "",
            ) || "84999999999",
        };
        paymentPayload.remoteIp =
          request.headers.get("x-forwarded-for") || "127.0.0.1";
      }
    }

    const createPaymentRes = await fetch(`${apiUrl}/payments`, {
      method: "POST",
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        "User-Agent": "FusionClinic/1.0",
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult = await createPaymentRes.json();
    if (!createPaymentRes.ok) {
      throw new Error(
        paymentResult.errors?.[0]?.description || "Erro ao gerar cobrança.",
      );
    }

    const unitBrlCost = Number((Number(price) / targetIds.length).toFixed(2));
    await supabaseAdmin
      .from("bookings")
      .update({
        asaas_payment_id: paymentResult.id,
        agreed_value_brl: unitBrlCost,
      })
      .in("id", targetIds);

    if (billingType === "PIX") {
      const pixRes = await fetch(
        `${apiUrl}/payments/${paymentResult.id}/pixQrCode`,
        {
          headers: {
            access_token: apiKey,
            "User-Agent": "FusionClinic/1.0",
          },
        },
      );
      const pixData = await pixRes.json();
      if (!pixRes.ok) throw new Error("Erro ao buscar QR Code PIX.");

      return NextResponse.json({
        success: true,
        paymentId: paymentResult.id,
        pixQrCode: pixData.encodedImage,
        pixCopyPaste: pixData.payload,
      });
    }

    if (billingType === "CREDIT_CARD") {
      if (paymentResult.status === "REJECTED") {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "cancelled" })
          .in("id", targetIds);
        return NextResponse.json(
          {
            error:
              "Cartão recusado pelo banco emissor. Verifique os dados ou o limite.",
          },
          { status: 400 },
        );
      }

      if (cardData?.saveCard && paymentResult.creditCard?.creditCardToken) {
        await supabaseAdmin
          .from("profiles")
          .update({
            cc_token: paymentResult.creditCard.creditCardToken,
            cc_last4: paymentResult.creditCard.creditCardNumber,
            cc_brand: paymentResult.creditCard.creditCardBrand,
          })
          .eq("id", user.id);
      }

      if (
        paymentResult.status === "CONFIRMED" ||
        paymentResult.status === "RECEIVED"
      ) {
        await supabaseAdmin
          .from("bookings")
          .update({ status: "confirmed" })
          .in("id", targetIds);
        sendBookingNotificationEmails(primaryBookingId).catch(console.error);
        return NextResponse.json({
          success: true,
          paymentId: paymentResult.id,
          status: "CONFIRMED",
        });
      }

      if (paymentResult.status === "PENDING") {
        return NextResponse.json({
          success: true,
          paymentId: paymentResult.id,
          status: "PENDING",
        });
      }
    }

    return NextResponse.json({
      success: true,
      paymentId: paymentResult.id,
      status: paymentResult.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro no checkout." },
      { status: 500 },
    );
  }
}