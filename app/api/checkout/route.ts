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

// GET: Consulta e Reconciliação do Status do PIX em Tempo Real (Evita depender 100% de Webhook)
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const bookingId = searchParams.get("bookingId");
    const paymentId = searchParams.get("paymentId");

    if (!bookingId) {
      return NextResponse.json({ error: "bookingId é obrigatório." }, { status: 400 });
    }

    // 1. Checa o status atual no banco
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

    // 2. Se no banco ainda estiver pendente, consulta o Asaas diretamente (Reconciliação Sênior)
    const asaasPayId = paymentId || booking.asaas_payment_id;
    if (asaasPayId) {
      const asaasRes = await fetch(`${ASAAS_API_URL}/payments/${asaasPayId}`, {
        headers: { access_token: ASAAS_API_KEY },
      });

      if (asaasRes.ok) {
        const paymentData = await asaasRes.json();
        
        // Se no Asaas constar como pago, atualiza o banco no mesmo segundo
        if (paymentData.status === "RECEIVED" || paymentData.status === "CONFIRMED") {
          await supabaseAdmin
            .from("bookings")
            .update({
              status: "confirmed",
              asaas_payment_id: asaasPayId,
            })
            .eq("id", bookingId);

          return NextResponse.json({ confirmed: true, status: "confirmed" });
        }
      }
    }

    return NextResponse.json({ confirmed: false, status: booking.status });
  } catch (error: any) {
    console.error("[Checkout Status] Erro ao consultar status:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

// POST: Criação da Reserva e Cobrança PIX no Asaas
export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Usuário não autenticado." }, { status: 401 });
    }

    const body = await request.json();
    const { roomId, startTime, endTime, totalCost } = body;

    if (!roomId || !startTime || !endTime) {
      return NextResponse.json({ error: "Dados incompletos para a reserva." }, { status: 400 });
    }

    // 1. Verificação de Conflito de Horário: Evita duplicidade de agendamento no mesmo espaço
    const { data: conflictingBookings, error: conflictErr } = await supabaseAdmin
      .from("bookings")
      .select("id, status")
      .eq("room_id", roomId)
      .in("status", ["confirmed", "pending_payment"])
      .lt("start_time", endTime)
      .gt("end_time", startTime);

    if (conflictErr) throw conflictErr;

    if (conflictingBookings && conflictingBookings.length > 0) {
      return NextResponse.json({
        error: "Este horário já foi reservado ou está em processo de pagamento por outro profissional.",
      }, { status: 409 });
    }

    // 2. Busca os dados de Perfil do usuário para o cadastro no Asaas
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("full_name, email, cpf, phone")
      .eq("id", user.id)
      .single();

    // 3. Busca a Sala e dados de split do Anfitrião
    const { data: room } = await supabaseAdmin
      .from("rooms")
      .select("name, host_id")
      .eq("id", roomId)
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

    // 4. Cria a Reserva temporária no Supabase com status 'pending_payment'
    const finalAmount = Number(totalCost) || 5.0; // Valor seguro caso venha zerado
    const { data: booking, error: bookingErr } = await supabaseAdmin
      .from("bookings")
      .insert({
        user_id: user.id,
        room_id: roomId,
        start_time: startTime,
        end_time: endTime,
        status: "pending_payment",
        total_cost: finalAmount,
      })
      .select()
      .single();

    if (bookingErr || !booking) {
      throw new Error(`Falha ao registrar agendamento: ${bookingErr?.message}`);
    }

    // 5. Garante a existência do Cliente no Asaas
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
          mobilePhone: profile?.phone?.replace(/\D/g, "") || undefined,
        }),
      });

      const customerResult = await createCustomerRes.json();
      if (!createCustomerRes.ok) {
        throw new Error(customerResult.errors?.[0]?.description || "Erro ao criar cliente no Asaas.");
      }
      asaasCustomerId = customerResult.id;
    }

    // 6. Monta o Payload da Cobrança com Suporte a Split
    const dueDate = new Date().toISOString().split("T")[0];
    const paymentPayload: any = {
      customer: asaasCustomerId,
      billingType: "PIX",
      value: finalAmount,
      dueDate: dueDate,
      description: `Reserva - ${room?.name || "Sala Clínica"}`,
      externalReference: booking.id,
    };

    // Aplica o Split automático se o Anfitrião tiver carteira Asaas
    if (hostWalletId) {
      paymentPayload.split = [
        {
          walletId: hostWalletId,
          percentualValue: 90.0, // 90% para a clínica
        },
      ];
    }

    // 7. Cria a Cobrança no Asaas
    const createPaymentRes = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: {
        access_token: ASAAS_API_KEY,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(paymentPayload),
    });

    const paymentResult = await createPaymentRes.json();
    if (!createPaymentRes.ok) {
      throw new Error(paymentResult.errors?.[0]?.description || "Erro ao gerar PIX no Asaas.");
    }

    const asaasPaymentId = paymentResult.id;

    // Atualiza a reserva com o ID do pagamento gerado
    await supabaseAdmin
      .from("bookings")
      .update({ asaas_payment_id: asaasPaymentId })
      .eq("id", booking.id);

    // 8. Busca o QR Code e o Código Copia e Cola do PIX
    const pixRes = await fetch(`${ASAAS_API_URL}/payments/${asaasPaymentId}/pixQrCode`, {
      headers: { access_token: ASAAS_API_KEY },
    });

    const pixData = await pixRes.json();
    if (!pixRes.ok) {
      throw new Error(pixData.errors?.[0]?.description || "Erro ao buscar QR Code PIX.");
    }

    return NextResponse.json({
      success: true,
      bookingId: booking.id,
      paymentId: asaasPaymentId,
      pixCode: pixData.payload,
      qrCodeBase64: pixData.encodedImage,
      totalAmount: finalAmount,
      expiresAt: pixData.expirationDate || new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    });
  } catch (error: any) {
    console.error("[Checkout] Erro na criação da reserva PIX:", error);
    return NextResponse.json({ error: error.message || "Erro ao processar checkout." }, { status: 500 });
  }
}