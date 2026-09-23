// app/api/checkout/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createClient as createAdminClient } from "@supabase/supabase-js";

const ASAAS_API_URL = process.env.ASAAS_API_URL || "https://api.asaas.com/v3";
const ASAAS_API_KEY = process.env.ASAAS_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = createAdminClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

// GET: Polling de Reconciliação (Checa Supabase e Asaas)
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

// POST: Criação do Pagamento (Recebe os dados do front-end)
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const { price, paymentRef, billingType, creditCard, creditCardHolderInfo } = body;

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

    // 2. Perfil do Cliente
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, cpf, phone")
      .eq("id", user.id)
      .single();

    // 3. Sala e Anfitrião
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
          name: profile?.full_name || user.email?.split("@")[0] || "Cliente",
          email: user.email || profile?.email,
          cpfCnpj: customerCpf || undefined,
          mobilePhone: profile?.phone?.replace(/\D/g, "") || undefined,
        }),
      });

      const customerResult = await createCustomerRes.json();
      if (!createCustomerRes.ok) throw new Error(customerResult.errors?.[0]?.description || "Erro no cliente Asaas.");
      asaasCustomerId = customerResult.id;
    }

    // 5. Monta Payload de Pagamento
    const dueDate = new Date().toISOString().split("T")[0];
    const paymentPayload: any = {
      customer: asaasCustomerId,
      billingType: billingType || "PIX",
      value: price,
      dueDate: dueDate,
      description: `Reserva - ${room?.name || "Sala"}`,
      externalReference: paymentRef,
    };

    // Aplica Split se o Anfitrião possuir carteira
    if (hostWalletId) {
      paymentPayload.split = [{ walletId: hostWalletId, percentualValue: 90.0 }];
    }

    if (billingType === "CREDIT_CARD" && creditCard) {
       paymentPayload.creditCard = creditCard;
       paymentPayload.creditCardHolderInfo = creditCardHolderInfo;
       paymentPayload.remoteIp = request.headers.get("x-forwarded-for") || "127.0.0.1";
    }

    // 6. Envia Pagamento para o Asaas
    const createPaymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: { access_token: ASAAS_API_KEY, "Content-Type": "application/json" },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult = await createPaymentRes.json();
    if (!createPaymentRes.ok) throw new Error(paymentResult.errors?.[0]?.description || "Erro ao gerar cobrança.");

    // Atualiza ID do pagamento no Supabase
    await supabaseAdmin
      .from("bookings")
      .update({ asaas_payment_id: paymentResult.id })
      .eq("id", paymentRef);

    // 7. Retorna QRCode se for PIX
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

    // Retorno Cartão de Crédito
    if (paymentResult.status === "CONFIRMED" || paymentResult.status === "RECEIVED") {
       await supabaseAdmin.from("bookings").update({ status: "confirmed" }).eq("id", paymentRef);
    }
    return NextResponse.json({ success: true, paymentId: paymentResult.id, status: paymentResult.status });

  } catch (error: any) {
    return NextResponse.json({ error: error.message || "Erro no checkout." }, { status: 500 });
  }
}