// app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Cliente Admin com Service Role para bypass de RLS quando necessário
const supabaseAdmin = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// GET: Polling de Reconciliação Ativa (Checa Supabase e Asaas)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get("bookingId");

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId é obrigatório." }, { status: 400 });
    }

    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("id, status, asaas_payment_id")
      .eq("id", bookingId)
      .single();

    if (bErr || !booking) {
      return NextResponse.json({ error: "Reserva não encontrada." }, { status: 404 });
    }

    if (booking.status === "confirmed") {
      return NextResponse.json({ confirmed: true, status: "confirmed" });
    }
    if (booking.status === "cancelled") {
      return NextResponse.json({ confirmed: false, status: "cancelled" });
    }

    // Se estiver pendente, força checagem direto no Asaas
    if (booking.asaas_payment_id) {
      const asaasRes = await fetch(`${ASAAS_API_URL}/payments/${booking.asaas_payment_id}`, {
        headers: { access_token: ASAAS_API_KEY },
      });

      if (asaasRes.ok) {
        const paymentData = await asaasRes.json();
        
        if (paymentData.status === "RECEIVED" || paymentData.status === "CONFIRMED") {
          await supabaseAdmin
            .from("bookings")
            .update({ status: "confirmed" })
            .eq("id", bookingId);

          return NextResponse.json({ confirmed: true, status: "confirmed" });
        }
      }
    }

    return NextResponse.json({ confirmed: false, status: booking.status });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Criação da Cobrança PIX ou Cartão (com Antifraude e Tokenização)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const { price, paymentRef, billingType, creditCard, cardData } = body;

    if (!paymentRef || !price) {
      return NextResponse.json({ error: "Dados incompletos para a reserva." }, { status: 400 });
    }

    // 1. Busca a reserva
    const { data: booking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("room_id")
      .eq("id", paymentRef)
      .single();

    if (bErr || !booking) {
      return NextResponse.json({ error: "Reserva base não encontrada." }, { status: 404 });
    }

    // 2. Perfil do Cliente Logado (Puxamos as informações salvas, incluindo o token do cartão)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, cpf, cep, address_number, phone, cc_token")
      .eq("id", user.id)
      .single();

    // 3. Sala e Anfitrião para o Split de Pagamento
    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("name, host_id")
      .eq("id", booking.room_id)
      .single();

    let hostWalletId: string | null = null;
    if (room?.host_id) {
      const { data: hostProfile } = await supabaseAdmin
        .from("profiles")
        .select("asaas_wallet_id")
        .eq("id", room.host_id)
        .single();
      hostWalletId = hostProfile?.asaas_wallet_id || null;
    }

    // 4. Cria/Busca Cliente no Asaas
    let asaasCustomerId: string = "";
    const customerCpf = (profile?.cpf || "").replace(/\D/g, "");
    
    if (customerCpf) {
      const searchRes = await fetch(`${ASAAS_API_URL}/customers?cpfCnpj=${customerCpf}`, {
        headers: { access_token: ASAAS_API_KEY },
      });
      const searchData = await searchRes.json();
      if (searchData.data && searchData.data.length > 0) {
        asaasCustomerId = searchData.data[0].id;
      }
    }

    if (!asaasCustomerId) {
      const createCustomerRes = await fetch(`${ASAAS_API_URL}/customers`, {
        method: "POST",
        headers: {
          access_token: ASAAS_API_KEY,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          name: profile?.full_name || user.email?.split("@")[0] || "Cliente Fusion",
          email: user.email || profile?.email,
          cpfCnpj: customerCpf || undefined,
        }),
      });

      const customerResult = await createCustomerRes.json();
      if (!createCustomerRes.ok) throw new Error(customerResult.errors?.[0]?.description || "Erro no cliente Asaas.");
      asaasCustomerId = customerResult.id;
    }

    // 5. Monta Payload de Pagamento Padrão
    const dueDate = new Date().toISOString().split("T")[0];
    const paymentPayload: any = {
      customer: asaasCustomerId,
      billingType: billingType || "PIX",
      value: price,
      dueDate: dueDate,
      description: `Reserva no App - ${room?.name || "Sala"}`,
      externalReference: paymentRef,
    };

    // Aplica Split se o Anfitrião possuir carteira
    if (hostWalletId) {
      paymentPayload.split = [{ walletId: hostWalletId, percentualValue: 90.0 }];
    }

    // 6. Inteligência Antifraude e Tokenização (Cartão de Crédito)
    if (billingType === "CREDIT_CARD") {
      if (cardData?.useSavedCard && profile?.cc_token) {
        // Usuário quer usar o cartão salvo com 1-clique
        paymentPayload.creditCardToken = profile.cc_token;
      } else if (creditCard && cardData) {
        // Usuário está inserindo um novo cartão
        paymentPayload.creditCard = creditCard;

        // LÓGICA ANTIFRAUDE SÊNIOR: 
        // Se o cartão for do usuário logado, usa os dados do perfil dele.
        // Se for cartão de terceiros (isThirdParty), usa o CPF e CEP digitados no Modal.
        let finalCpf = profile?.cpf?.replace(/\D/g, "");
        let finalCep = profile?.cep?.replace(/\D/g, "");

        if (cardData.isThirdParty) {
          finalCpf = cardData.cpf?.replace(/\D/g, "");
          finalCep = cardData.cep?.replace(/\D/g, "");
        }

        if (!finalCpf || !finalCep) {
          return NextResponse.json({ error: "CPF ou CEP ausentes. Complete seu perfil ou preencha os dados de terceiros." }, { status: 400 });
        }

        paymentPayload.creditCardHolderInfo = {
          name: creditCard.holderName,
          email: profile?.email || user.email,
          cpfCnpj: finalCpf,
          postalCode: finalCep,
          addressNumber: profile?.address_number || "S/N",
          phone: profile?.phone?.replace(/\D/g, ""),
        };
        paymentPayload.remoteIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
      }
    }

    // 7. Envia Pagamento para o Asaas
    const createPaymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: { access_token: ASAAS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult = await createPaymentRes.json();
    if (!createPaymentRes.ok) throw new Error(paymentResult.errors?.[0]?.description || "Erro ao gerar cobrança.");

    // Atualiza ID do pagamento no Supabase para acompanhamento
    await supabaseAdmin
      .from("bookings")
      .update({ asaas_payment_id: paymentResult.id })
      .eq("id", paymentRef);

    // 8A. Retorno QRCode se for PIX
    if (billingType === "PIX") {
      const pixRes = await fetch(`${ASAAS_API_URL}/payments/${paymentResult.id}/pixQrCode`, {
        headers: { access_token: ASAAS_API_KEY },
      });
      const pixData = await pixRes.json();
      if (!pixRes.ok) throw new Error("Erro ao buscar QR Code PIX.");

      return NextResponse.json({
        success: true,
        paymentId: paymentResult.id,
        pixQrCode: pixData.encodedImage,
        pixCopyPaste: pixData.payload,
      });
    }

    // 8B. Retorno e Processamento para CARTÃO DE CRÉDITO
    if (billingType === "CREDIT_CARD") {
      // Falha Imediata (Limite, Fraude, Dados Incorretos)
      if (paymentResult.status === "REJECTED") {
        await supabaseAdmin.from("bookings").update({ status: "cancelled" }).eq("id", paymentRef);
        return NextResponse.json({ error: "Cartão recusado pelo banco emissor. Verifique os dados ou o limite." }, { status: 400 });
      }

      // Tokenização: Salvar cartão para o futuro se o usuário pediu e a transação foi aceita
      if (cardData?.saveCard && paymentResult.creditCard?.creditCardToken) {
        await supabaseAdmin.from("profiles").update({
          cc_token: paymentResult.creditCard.creditCardToken,
          cc_last4: paymentResult.creditCard.creditCardNumber,
          cc_brand: paymentResult.creditCard.creditCardBrand
        }).eq("id", user.id);
      }

      // Aprovado sem fricção
      if (paymentResult.status === "CONFIRMED" || paymentResult.status === "RECEIVED") {
        await supabaseAdmin.from("bookings").update({ status: "confirmed" }).eq("id", paymentRef);
        return NextResponse.json({ success: true, paymentId: paymentResult.id, status: "CONFIRMED" });
      }

      // Caiu na análise do Gateway (Asaas avaliará manualmente)
      if (paymentResult.status === "PENDING") {
        return NextResponse.json({ success: true, paymentId: paymentResult.id, status: "PENDING" });
      }
    }

    return NextResponse.json({ success: true, paymentId: paymentResult.id, status: paymentResult.status });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro no checkout." }, { status: 500 });
  }
}