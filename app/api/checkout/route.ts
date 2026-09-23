import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const ASAAS_API_URL = process.env.ASAAS_API_URL;
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

    if (!ASAAS_API_URL || !ASAAS_API_KEY) {
      throw new Error("As chaves do Asaas não estão configuradas.");
    }

    const body = await req.json();
    const { checkoutType, packageId, hours, price, packageName, paymentRef, billingType: requestedBillingType } = body;
    
    const billingType = requestedBillingType || body.billingType || (checkoutType === 'package' ? 'CREDIT_CARD' : 'PIX');

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    let asaasCustomerId = profile?.asaas_customer_id;
    const blindEmail = "notificacoes@fusionclinic.com.br"; // E-mail cego para bloquear notificações por e-mail

    // 1. CRIA OU RECUPERA O CLIENTE NO ASAAS
    if (!asaasCustomerId) {
      const customerName = profile?.full_name || "Dr(a). Fusion Clinic";
      const customerCpfCnpj = profile?.cpf?.replace(/\D/g, '') || "07519139045"; 

      const customerResponse = await fetch(`${ASAAS_API_URL}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
        body: JSON.stringify({ 
          name: customerName, 
          email: blindEmail, 
          cpfCnpj: customerCpfCnpj,
          phone: "", // Força vazio para impedir SMS
          mobilePhone: "", // Força vazio para impedir WhatsApp
          notificationDisabled: true // Desativa no nível do cliente
        }),
      });

      const customerData = await customerResponse.json();
      if (!customerResponse.ok) throw new Error(customerData.errors?.[0]?.description || "Erro ao criar Cliente no Asaas.");
      
      asaasCustomerId = customerData.id;
      await supabase.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", user.id);
    } else {
      // SOLUÇÃO DEFINITIVA ANTI-TAXAS: 
      // Se o cliente já existe, forçamos um UPDATE no Asaas para apagar qualquer telefone ou e-mail real 
      // que lá esteja guardado de testes passados.
      await fetch(`${ASAAS_API_URL}/customers/${asaasCustomerId}`, {
        method: "POST", // A API V3 do Asaas usa POST na URL com ID para dar Update
        headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
        body: JSON.stringify({ 
          email: blindEmail,
          phone: "", // Apaga o telefone fixo do Asaas
          mobilePhone: "", // Apaga o telefone móvel do Asaas
          notificationDisabled: true // Desativa notificações na raiz do cliente
        }),
      }).catch(err => console.error("Erro silencioso ao atualizar cliente no Asaas:", err));
    }

    const creditCard = body.creditCard || {
      holderName: "FUSION TEST",
      number: "4111111111111111",
      expiryMonth: "12",
      expiryYear: "2030",
      ccv: "123"
    };

    // O telefone real só vai aqui, camuflado no cartão, para o sistema de prevenção de fraudes. O Asaas não envia SMS para o cartão.
    const creditCardHolderInfo = body.creditCardHolderInfo || {
      name: profile?.full_name || "FUSION TEST",
      email: blindEmail, 
      cpfCnpj: profile?.cpf?.replace(/\D/g, '') || "07519139045",
      postalCode: profile?.cep?.replace(/\D/g, '') || "01310100",
      addressNumber: profile?.address_number || "1000",
      phone: profile?.phone?.replace(/\D/g, '') || "11999999999"
    };

    // 2. ASSINATURA RECORRENTE NO CARTÃO (FUSION PASS)
    if (checkoutType === "package") {
      const subResponse = await fetch(`${ASAAS_API_URL}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "CREDIT_CARD",
          value: price,
          nextDueDate: new Date().toISOString().split('T')[0], 
          cycle: "MONTHLY", 
          description: `Fusion Pass ${packageName} - ${hours} Créditos/mês`,
          externalReference: `package|${user.id}|${packageId}|${hours}`,
          creditCard,
          creditCardHolderInfo,
          notificationDisabled: true, // Desativa notificações na assinatura
        }),
      });

      const subData = await subResponse.json();
      if (!subResponse.ok) throw new Error(subData.errors?.[0]?.description || "O cartão foi recusado ou é inválido.");

      const tierFixed = packageName.toLowerCase().replace('pass ', '');
      
      await supabase.from("subscriptions").insert({
        user_id: user.id,
        asaas_subscription_id: subData.id,
        tier: tierFixed, 
        hours: hours,
        status: 'PENDING'
      });
      
      return NextResponse.json({ 
        success: true, 
        message: "Assinatura processada com sucesso!", 
        subscriptionId: subData.id,
        invoiceUrl: "/dashboard" 
      });
    }

    // 3. COMPRA AVULSA DE SALA (RESERVA)
    const paymentPayload: any = {
      customer: asaasCustomerId,
      billingType: billingType,
      value: price,
      dueDate: new Date().toISOString().split('T')[0], 
      description: `Reserva de Espaço - Fusion Clinic`,
      externalReference: `booking|${paymentRef}`,
      notificationDisabled: true, // Desativa notificações na cobrança avulsa
    };

    if (billingType === "CREDIT_CARD") {
      paymentPayload.creditCard = creditCard;
      paymentPayload.creditCardHolderInfo = creditCardHolderInfo;
    }

    const paymentResponse = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
      body: JSON.stringify(paymentPayload),
    });

    const paymentData = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(paymentData.errors?.[0]?.description || "Erro ao gerar cobrança.");

    // 4. BUSCA OS DADOS DO QR CODE SE FOR PIX
    let pixQrCode = null;
    let pixCopyPaste = null;

    if (billingType === "PIX") {
      const qrResponse = await fetch(`${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`, {
        method: "GET",
        headers: { "access_token": ASAAS_API_KEY }
      });
      const qrData = await qrResponse.json();
      
      if (qrResponse.ok) {
        pixQrCode = qrData.encodedImage; 
        pixCopyPaste = qrData.payload;     
      } else {
        throw new Error("Erro ao gerar o QR Code do Pix no Asaas.");
      }
    }

    return NextResponse.json({ 
      success: true, 
      paymentId: paymentData.id, 
      invoiceUrl: "/dashboard",
      pixQrCode,     
      pixCopyPaste   
    });

  } catch (error: any) {
    console.error("Erro no motor de Checkout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}