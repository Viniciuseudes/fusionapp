import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const ASAAS_API_URL = process.env.ASAAS_API_URL;
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

    if (!ASAAS_API_URL || !ASAAS_API_KEY) {
      throw new Error("As chaves do Asaas não foram encontradas no ambiente.");
    }

    // Agora recebemos o billingType e os dados do Cartão (se for cartão)
    const { 
      checkoutType, packageId, hours, price, packageName, paymentRef, 
      billingType, // "PIX" ou "CREDIT_CARD"
      creditCard, // Objeto com (holderName, number, expiryMonth, expiryYear, ccv)
      creditCardHolderInfo // Objeto com (name, email, cpfCnpj, postalCode, addressNumber, phone)
    } = await req.json();

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) return NextResponse.json({ error: "Sessão expirada." }, { status: 401 });

    const { data: profile } = await supabase.from("profiles").select("*").eq("id", user.id).single();

    let asaasCustomerId = profile?.asaas_customer_id;

    // 1. GESTÃO DO CLIENTE NO ASAAS
    if (!asaasCustomerId) {
      const customerName = profile?.full_name || "Dr(a). Fusion Clinic";
      const customerEmail = user.email || "medico@fusionclinic.com.br";
      const customerCpfCnpj = profile?.cpf?.replace(/\D/g, '') || "12345678909"; 

      const customerResponse = await fetch(`${ASAAS_API_URL}/customers`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
        body: JSON.stringify({ name: customerName, email: customerEmail, cpfCnpj: customerCpfCnpj }),
      });

      const customerData = await customerResponse.json();
      if (!customerResponse.ok) throw new Error(customerData.errors?.[0]?.description || "Erro no Cliente Asaas.");
      
      asaasCustomerId = customerData.id;
      
      // Salva o ID no banco para compras futuras
      await supabase.from("profiles").update({ asaas_customer_id: asaasCustomerId }).eq("id", user.id);
    }

    // 2. LÓGICA DE ASSINATURA (FUSION PASS RECORRENTE NO CARTÃO)
    if (checkoutType === "package" && billingType === "CREDIT_CARD") {
      const subResponse = await fetch(`${ASAAS_API_URL}/subscriptions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
        body: JSON.stringify({
          customer: asaasCustomerId,
          billingType: "CREDIT_CARD",
          value: price,
          nextDueDate: new Date().toISOString().split('T')[0], // Cobra hoje
          cycle: "MONTHLY", // Recorrência Mensal
          description: `Fusion Pass ${packageName} - ${hours} Créditos/mês`,
          externalReference: `package|${user.id}|${packageId}|${hours}`,
          creditCard,
          creditCardHolderInfo
        }),
      });

      const subData = await subResponse.json();
      if (!subResponse.ok) throw new Error(subData.errors?.[0]?.description || "Erro ao criar assinatura.");

      // Salva a assinatura ativa no banco de dados!
      await supabase.from("subscriptions").insert({
        user_id: user.id,
        asaas_subscription_id: subData.id,
        tier: packageName.toLowerCase(), // start, vip, master
        hours: hours,
        status: 'ACTIVE'
      });

      return NextResponse.json({ success: true, message: "Assinatura criada e cobrada com sucesso!", subscriptionId: subData.id });
    }

    // 3. LÓGICA DE COMPRA AVULSA (RESERVA DE SALA: PIX OU CARTÃO)
    let description = checkoutType === "booking" ? `Reserva de Espaço - Fusion Clinic` : `Compra de Pacote`;
    let externalReference = checkoutType === "booking" ? `booking|${paymentRef}` : `package_avulso|${user.id}`;

    const paymentPayload: any = {
      customer: asaasCustomerId,
      billingType: billingType, // PIX ou CREDIT_CARD
      value: price,
      dueDate: new Date().toISOString().split('T')[0], 
      description: description,
      externalReference: externalReference, 
    };

    // Se for cartão, anexa os dados invisíveis
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

    // Se for PIX, puxa o QR Code Nativo para exibir na tela!
    if (billingType === "PIX") {
      const qrResponse = await fetch(`${ASAAS_API_URL}/payments/${paymentData.id}/pixQrCode`, {
        method: "GET",
        headers: { "access_token": ASAAS_API_KEY },
      });
      const qrData = await qrResponse.json();
      
      return NextResponse.json({ 
        isPix: true, 
        paymentId: paymentData.id,
        qrCodeImage: qrData.encodedImage, // Imagem Base64 do QR Code
        qrCodePayload: qrData.payload // Código Copia e Cola
      });
    }

    // Se for cartão avulso e deu sucesso
    return NextResponse.json({ success: true, paymentId: paymentData.id, message: "Pagamento aprovado!" });

  } catch (error: any) {
    console.error("Erro no motor de Checkout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}