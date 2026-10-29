// app/api/contracts/payment/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";
import { getDaysInMonth, differenceInCalendarDays, parseISO, format } from "date-fns";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createAdminClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

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

  if (!apiKey) {
    throw new Error("A variável ASAAS_API_KEY não está configurada no .env.");
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

function parseScheduleConfig(raw: any): Record<string, any> {
  if (!raw) return {};
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw);
    } catch {
      return {};
    }
  }
  return typeof raw === "object" ? { ...raw } : {};
}

export function computeContractCompetencePricing(params: {
  contract: any;
  competence: string; // "YYYY-MM"
  referenceDate?: Date;
}) {
  const { contract, competence, referenceDate = new Date() } = params;
  const sched = parseScheduleConfig(contract?.schedule_config);

  const baseValue =
    Number(contract?.contract_value) > 0
      ? Number(contract.contract_value)
      : Number(contract?.session_value || 0);

  const dueDayRaw = Math.max(1, Math.min(31, Number(contract?.due_day) || 8));
  const [yearStr, monthStr] = competence.split("-");
  const yearNum = Number(yearStr);
  const monthNum = Number(monthStr);
  const maxDays = getDaysInMonth(new Date(yearNum, monthNum - 1, 1));
  const safeDay = String(Math.min(dueDayRaw, maxDays)).padStart(2, "0");
  const dueDateIso = `${competence}-${safeDay}`;

  // Taxa de multa (%) e juros ao mês (%) configurados no contrato (Padrão: 2% multa e 1% juros a.m.)
  const finePct = Number(sched?.fine_pct ?? contract?.fine_pct ?? 2);
  const interestMonthlyPct = Number(
    sched?.interest_pct ?? contract?.interest_pct ?? 1,
  );

  const dueDateObj = parseISO(`${dueDateIso}T23:59:59`);
  const daysLate = Math.max(
    0,
    differenceInCalendarDays(referenceDate, dueDateObj),
  );

  const isPaid =
    contract?.last_paid_competence === competence ||
    Boolean(sched?.paid_dates && sched.paid_dates[competence]);

  let fineAmountBrl = 0;
  let interestAmountBrl = 0;

  if (!isPaid && daysLate > 0 && baseValue > 0) {
    if (finePct > 0) {
      fineAmountBrl = Number((baseValue * (finePct / 100)).toFixed(2));
    }
    if (interestMonthlyPct > 0) {
      const dailyInterestRate = interestMonthlyPct / 100 / 30;
      interestAmountBrl = Number(
        (baseValue * dailyInterestRate * daysLate).toFixed(2),
      );
    }
  }

  const totalUpdatedBrl = Number(
    (baseValue + fineAmountBrl + interestAmountBrl).toFixed(2),
  );

  return {
    competence,
    dueDateIso,
    baseValue,
    finePct,
    interestMonthlyPct,
    daysLate,
    isOverdue: !isPaid && daysLate > 0,
    isPaid,
    fineAmountBrl,
    interestAmountBrl,
    totalUpdatedBrl,
  };
}

export async function markContractCompetenceAsPaid(params: {
  contractId: string;
  competence: string;
  paymentId: string;
  amountPaidBrl: number;
  paymentMethod?: string;
}) {
  const { contractId, competence, paymentId, amountPaidBrl, paymentMethod } =
    params;

  const { data: contract, error } = await supabaseAdmin
    .from("room_contracts")
    .select("*")
    .eq("id", contractId)
    .single();

  if (error || !contract) return;

  const sched = parseScheduleConfig(contract.schedule_config);
  const todayStr = format(new Date(), "yyyy-MM-dd");

  const paidDates =
    sched.paid_dates && typeof sched.paid_dates === "object"
      ? { ...sched.paid_dates }
      : {};
  paidDates[competence] = todayStr;

  const invoices =
    sched.invoices && typeof sched.invoices === "object"
      ? { ...sched.invoices }
      : {};
  invoices[competence] = {
    ...(invoices[competence] || {}),
    paymentId,
    status: "PAID",
    paidAt: new Date().toISOString(),
    amountPaidBrl,
    paymentMethod: paymentMethod || "ASAAS",
  };

  const updatedSched = {
    ...sched,
    paid_dates: paidDates,
    last_paid_date: todayStr,
    invoices,
  };

  const currentLastPaid = String(contract.last_paid_competence || "");
  const nextLastPaid =
    !currentLastPaid || competence >= currentLastPaid
      ? competence
      : currentLastPaid;

  await supabaseAdmin
    .from("room_contracts")
    .update({
      last_paid_competence: nextLastPaid,
      schedule_config: updatedSched,
    })
    .eq("id", contractId);

  if (contract.specialist_id) {
    try {
      await supabaseAdmin.from("notifications").insert({
        user_id: contract.specialist_id,
        type: "contract_paid",
        title: "Mensalidade de Contrato Confirmada!",
        content: `Recebemos o pagamento da competência ${competence} do seu contrato.`,
        link: "/dashboard",
        is_read: false,
      });
    } catch {}
  }
}

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
      "Informe um CPF ou CNPJ válido para gerar a fatura do contrato.",
    );
  }

  const profileUpdates: Record<string, any> = {};
  if (!profile?.cpf && cleanCpf) profileUpdates.cpf = cleanCpf;
  if (!profile?.cep && cleanCep) profileUpdates.cep = cleanCep;
  if (Object.keys(profileUpdates).length > 0 && userId) {
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
  }

  if (!asaasCustomerId) {
    const createRes = await fetch(`${apiUrl}/customers`, {
      method: "POST",
      headers: {
        access_token: apiKey,
        "Content-Type": "application/json",
        "User-Agent": "FusionClinic/1.0",
      },
      body: JSON.stringify({
        name: profile?.full_name || "Coanfitrião Fusion",
        email: userEmail || profile?.email || undefined,
        cpfCnpj: cleanCpf,
        mobilePhone:
          (profile?.whatsapp || profile?.phone || "").replace(/\D/g, "") ||
          undefined,
      }),
    });

    const createData = await createRes.json();
    if (!createRes.ok) {
      throw new Error(
        createData.errors?.[0]?.description ||
          "Erro ao cadastrar cliente no Asaas.",
      );
    }
    asaasCustomerId = createData.id;
  }

  return { asaasCustomerId, cleanCpf, cleanCep };
}

// ============================================================================
// GET: Reconciliação Ativa (Polling) do pagamento do contrato
// ============================================================================
export async function GET(request: Request) {
  try {
    const { apiKey, apiUrl } = getAsaasConfig();
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");
    const competence = searchParams.get("competence");
    const paymentId = searchParams.get("paymentId");

    if (!contractId || !competence || !paymentId) {
      return NextResponse.json(
        { error: "contractId, competence e paymentId são obrigatórios." },
        { status: 400 },
      );
    }

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
        await markContractCompetenceAsPaid({
          contractId,
          competence,
          paymentId,
          amountPaidBrl: Number(paymentData.value || 0),
          paymentMethod: paymentData.billingType || "PIX",
        });

        return NextResponse.json({
          confirmed: true,
          status: "PAID",
        });
      }
    }

    return NextResponse.json({ confirmed: false, status: "PENDING" });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// ============================================================================
// POST: Gera ou processa pagamento do Contrato (PIX, BOLETO ou CREDIT_CARD)
// ============================================================================
export async function POST(request: Request) {
  try {
    const { apiKey, apiUrl } = getAsaasConfig();
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const {
      contractId,
      competence, // "YYYY-MM"
      billingType, // "PIX" | "BOLETO" | "CREDIT_CARD"
      creditCard,
      cardData,
      customerCpf,
      customerCep,
    } = body;

    if (!contractId || !competence) {
      return NextResponse.json(
        { error: "Informe o contrato e a competência (YYYY-MM)." },
        { status: 400 },
      );
    }

    const { data: contract, error: cErr } = await supabaseAdmin
      .from("room_contracts")
      .select("*")
      .eq("id", contractId)
      .single();

    if (cErr || !contract) {
      return NextResponse.json(
        { error: "Contrato não encontrado." },
        { status: 404 },
      );
    }

    const pricing = computeContractCompetencePricing({
      contract,
      competence,
    });

    if (pricing.isPaid) {
      return NextResponse.json(
        { error: `A competência ${competence} já consta como paga.` },
        { status: 400 },
      );
    }

    const targetUserId = contract.specialist_id || user.id;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select(
        "full_name, email, cpf, cep, address_number, phone, whatsapp, cc_token, cc_last4, cc_brand",
      )
      .eq("id", targetUserId)
      .single();

    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("name, host_id")
      .eq("id", contract.room_id)
      .maybeSingle();

    // Verifica se o Anfitrião (Clínica) possui carteira Asaas para Split automático
    let hostWalletId: string | null = null;
    if (room?.host_id) {
      const { data: hostProfile } = await supabaseAdmin
        .from("profiles")
        .select("asaas_wallet_id")
        .eq("id", room.host_id)
        .maybeSingle();
      hostWalletId = hostProfile?.asaas_wallet_id || null;
    }

    const { asaasCustomerId, cleanCpf, cleanCep } =
      await getOrCreateAsaasCustomer({
        apiKey,
        apiUrl,
        userId: targetUserId,
        userEmail: user.email || profile?.email || "",
        profile: {
          ...profile,
          full_name: profile?.full_name || contract.specialist_name,
        },
        fallbackCpf: cardData?.cpf || customerCpf,
        fallbackCep: cardData?.cep || customerCep,
      });

    const method = (billingType || "PIX").toUpperCase();
    const todayIso = format(new Date(), "yyyy-MM-dd");

    // Se ainda não venceu, usamos o dueDate original do contrato e deixamos o Asaas aplicar multa/juros caso atrase.
    // Se JÁ VENCEU (daysLate > 0), o Asaas exige dueDate >= hoje na criação e nós já embutimos a multa + juros pro-rata no valor!
    const effectiveDueDate =
      pricing.dueDateIso >= todayIso ? pricing.dueDateIso : todayIso;
    const chargeValue =
      pricing.daysLate > 0 ? pricing.totalUpdatedBrl : pricing.baseValue;

    const externalRef = `contract_${contract.id}_${competence}`;

    const descParts = [
      `Contrato ${room?.name || "Sala Fusion"} - Competência ${competence}`,
    ];
    if (pricing.daysLate > 0) {
      descParts.push(
        `(Base R$ ${pricing.baseValue.toFixed(2)} + Multa ${pricing.finePct}%: R$ ${pricing.fineAmountBrl.toFixed(2)} + Juros ${pricing.daysLate}d: R$ ${pricing.interestAmountBrl.toFixed(2)})`,
      );
    }

    const paymentPayload: Record<string, any> = {
      customer: asaasCustomerId,
      billingType: method,
      value: chargeValue,
      dueDate: effectiveDueDate,
      description: descParts.join(" "),
      externalReference: externalRef,
    };

    // Configura multa e juros nativos no Asaas para que boletos/PIX gerados antes do vencimento cobrem encargos se pagos com atraso
    if (pricing.finePct > 0) {
      paymentPayload.fine = {
        value: pricing.finePct,
        type: "PERCENTAGE",
      };
    }
    if (pricing.interestMonthlyPct > 0) {
      paymentPayload.interest = {
        value: pricing.interestMonthlyPct,
      };
    }

    // Split automático entre Fusion (platform_fee_pct) e Clínica Anfitriã
    if (hostWalletId) {
      const platformFeePct = Number(contract.platform_fee_pct ?? 15);
      const hostSharePct = Math.max(0, Math.min(100, 100 - platformFeePct));
      if (hostSharePct > 0) {
        paymentPayload.split = [
          {
            walletId: hostWalletId,
            percentualValue: hostSharePct,
          },
        ];
      }
    }

    if (method === "CREDIT_CARD") {
      if (cardData?.useSavedCard && profile?.cc_token) {
        paymentPayload.creditCardToken = profile.cc_token;
      } else if (creditCard && cardData) {
        const finalCpf = (cardData.cpf || cleanCpf).replace(/\D/g, "");
        const finalCep = (cardData.cep || cleanCep || "59000000").replace(
          /\D/g,
          "",
        );

        paymentPayload.creditCard = creditCard;
        paymentPayload.creditCardHolderInfo = {
          name: creditCard.holderName,
          email: profile?.email || user.email,
          cpfCnpj: finalCpf,
          postalCode: finalCep,
          addressNumber: profile?.address_number || "100",
          phone:
            (profile?.whatsapp || profile?.phone || "84999999999").replace(
              /\D/g,
              "",
            ) || "84999999999",
        };
        paymentPayload.remoteIp =
          request.headers.get("x-forwarded-for") || "127.0.0.1";
      } else {
        return NextResponse.json(
          { error: "Preencha os dados do cartão de crédito." },
          { status: 400 },
        );
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
        paymentResult.errors?.[0]?.description ||
          "Erro ao gerar cobrança do contrato no Asaas.",
      );
    }

    // Salva a referência da fatura gerada no schedule_config do contrato
    const sched = parseScheduleConfig(contract.schedule_config);
    const invoices =
      sched.invoices && typeof sched.invoices === "object"
        ? { ...sched.invoices }
        : {};
    invoices[competence] = {
      paymentId: paymentResult.id,
      billingType: method,
      value: chargeValue,
      dueDate: effectiveDueDate,
      invoiceUrl: paymentResult.invoiceUrl || null,
      bankSlipUrl: paymentResult.bankSlipUrl || null,
      status: paymentResult.status,
      updatedAt: new Date().toISOString(),
    };

    await supabaseAdmin
      .from("room_contracts")
      .update({
        schedule_config: {
          ...sched,
          invoices,
        },
      })
      .eq("id", contract.id);

    // 1. Retorno para PIX
    if (method === "PIX") {
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
      if (!pixRes.ok) {
        throw new Error(
          pixData.errors?.[0]?.description || "Erro ao gerar QR Code PIX.",
        );
      }

      return NextResponse.json({
        success: true,
        paymentId: paymentResult.id,
        billingType: "PIX",
        pricing,
        chargedValueBrl: chargeValue,
        pixQrCode: pixData.encodedImage,
        pixCopyPaste: pixData.payload,
        invoiceUrl: paymentResult.invoiceUrl,
      });
    }

    // 2. Retorno para BOLETO BANCÁRIO
    if (method === "BOLETO") {
      const slipRes = await fetch(
        `${apiUrl}/payments/${paymentResult.id}/identificationField`,
        {
          headers: {
            access_token: apiKey,
            "User-Agent": "FusionClinic/1.0",
          },
        },
      );
      const slipData = await slipRes.json().catch(() => ({}));

      // Também busca o QR Code PIX do boleto (no Asaas todo boleto também aceita PIX)
      const pixRes = await fetch(
        `${apiUrl}/payments/${paymentResult.id}/pixQrCode`,
        {
          headers: {
            access_token: apiKey,
            "User-Agent": "FusionClinic/1.0",
          },
        },
      ).catch(() => null);
      const pixData = pixRes && pixRes.ok ? await pixRes.json() : null;

      return NextResponse.json({
        success: true,
        paymentId: paymentResult.id,
        billingType: "BOLETO",
        pricing,
        chargedValueBrl: chargeValue,
        identificationField: slipData.identificationField || "",
        barCode: slipData.barCode || "",
        bankSlipUrl: paymentResult.bankSlipUrl || paymentResult.invoiceUrl,
        invoiceUrl: paymentResult.invoiceUrl,
        pixQrCode: pixData?.encodedImage || null,
        pixCopyPaste: pixData?.payload || null,
      });
    }

    // 3. Retorno para CARTÃO DE CRÉDITO
    if (method === "CREDIT_CARD") {
      if (paymentResult.status === "REJECTED") {
        return NextResponse.json(
          {
            error:
              "Cartão recusado pelo banco emissor. Verifique os dados ou pague via PIX/Boleto.",
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
          .eq("id", targetUserId);
      }

      if (
        paymentResult.status === "CONFIRMED" ||
        paymentResult.status === "RECEIVED"
      ) {
        await markContractCompetenceAsPaid({
          contractId: contract.id,
          competence,
          paymentId: paymentResult.id,
          amountPaidBrl: chargeValue,
          paymentMethod: "CREDIT_CARD",
        });

        return NextResponse.json({
          success: true,
          paymentId: paymentResult.id,
          billingType: "CREDIT_CARD",
          status: "CONFIRMED",
          chargedValueBrl: chargeValue,
        });
      }

      return NextResponse.json({
        success: true,
        paymentId: paymentResult.id,
        billingType: "CREDIT_CARD",
        status: paymentResult.status,
        chargedValueBrl: chargeValue,
      });
    }

    return NextResponse.json({
      success: true,
      paymentId: paymentResult.id,
      status: paymentResult.status,
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error.message || "Erro ao processar pagamento do contrato." },
      { status: 500 },
    );
  }
}