import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const ASAAS_API_URL = process.env.ASAAS_API_URL;
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

    if (!ASAAS_API_URL || !ASAAS_API_KEY) {
      throw new Error("As chaves do Asaas não estão configuradas no .env.local");
    }

    const body = await req.json();
    const { checkoutType, packageId, hours, price, packageName, paymentRef } = body;
    
    // Define o billingType (Se o frontend não mandar, assumimos CREDIT_CARD para pacotes)
    const billingType = body.billingType || (checkoutType === 'package' ? 'CREDIT_CARD' : 'PIX');

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    let asaasCustomerId = profile?.asaas_customer_id;

    // 1. CRIA OU RECUPERA O CLIENTE NO ASAAS
    if (!asaasCustomerId) {
      const customerName = profile?.full_name || "Dr(a). Fusion Clinic";
      const customerEmail = user.email || "medico@fusionclinic.com.br";
      // Usando um CPF válido de teste para o Asaas não rejeitar a criação
      const customerCpfCnpj = profile?.cpf?.replace(/\D/g, '') || "07519139045"; 

      const customerResponse = await fetch(`${ASAAS_API_URL}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
        body: JSON.stringify({ name: customerName, email: customerEmail, cpfCnpj: customerCpfCnpj }),
      });

      const customerData = await customerResponse.json();
      if (!customerResponse.ok) throw new Error(customerData.errors?.[0]?.description || "Erro ao criar Cliente no Asaas.");
      
      asaasCustomerId = customerData.id;
      await supabase.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", user.id);
    }

    // ========================================================
    // HACK DE SANDBOX: INJEÇÃO DE CARTÃO DE CRÉDITO DE TESTES
    // Como o frontend ainda não tem o formulário, injetamos o mock
    // ========================================================
    const creditCard = body.creditCard || {
      holderName: "FUSION TEST",
      number: "4111111111111111",
      expiryMonth: "12",
      expiryYear: "2030",
      ccv: "123"
    };

    const creditCardHolderInfo = body.creditCardHolderInfo || {
      name: profile?.full_name || "FUSION TEST",
      email: user.email || "test@fusionclinic.com.br",
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
          nextDueDate: new Date().toISOString().split('T')[0], // Começa a cobrar hoje
          cycle: "MONTHLY", // Recorrência mensal
          description: `Fusion Pass ${packageName} - ${hours} Créditos/mês`,
          externalReference: `package|${user.id}|${packageId}|${hours}`,
          creditCard,
          creditCardHolderInfo
        }),
      });

      const subData = await subResponse.json();
      if (!subResponse.ok) throw new Error(subData.errors?.[0]?.description || "Erro ao criar assinatura.");

      // Grava a assinatura ativa no Supabase
      const tierFixed = packageName.toLowerCase().replace('pass ', '');
      await supabase.from("subscriptions").insert({
        user_id: user.id,
        asaas_subscription_id: subData.id,
        tier: tierFixed, 
        hours: hours,
        status: 'ACTIVE'
      });
      
      // Libera os créditos na carteira IMEDIATAMENTE!
      await supabase.from("wallet_transactions").insert({
        user_id: user.id,
        amount: hours,
        type: "subscription",
        tier: tierFixed,
        description: `Nova Assinatura: ${packageName}`
      });

      // Retornamos invoiceUrl com o caminho do Perfil para evitar erro de redirecionamento no frontend
      return NextResponse.json({ 
        success: true, 
        message: "Assinatura criada!", 
        subscriptionId: subData.id,
        invoiceUrl: "/#profile" 
      });
    }

    // 3. COMPRA AVULSA (RESERVA DE SALA)
    const paymentPayload: any = {
      customer: asaasCustomerId,
      billingType: billingType,
      value: price,
      dueDate: new Date().toISOString().split('T')[0], 
      description: `Reserva de Espaço - Fusion Clinic`,
      externalReference: `booking|${paymentRef}`,
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

    return NextResponse.json({ 
      success: true, 
      paymentId: paymentData.id, 
      invoiceUrl: "/#profile" 
    });

  } catch (error: any) {
    console.error("Erro no motor de Checkout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}