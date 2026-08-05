import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const ASAAS_API_URL = process.env.ASAAS_API_URL;
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

    if (!ASAAS_API_URL || !ASAAS_API_KEY) {
      throw new Error("As chaves do Asaas não foram encontradas no ambiente.");
    }

    // Identifica se é compra de pacote ("package") ou reserva avulsa ("booking")
    const { checkoutType, packageId, hours, price, packageName, paymentRef } = await req.json();

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sessão expirada. Faça login novamente." }, { status: 401 });
    }

    const { data: profile } = await supabase.from("profiles").select("full_name, email, cpf").eq("id", user.id).single();

    const customerName = profile?.full_name || "Dr(a). Fusion Clinic";
    const customerEmail = user.email || "medico@fusionclinic.com.br";
    const customerCpfCnpj = profile?.cpf?.replace(/\D/g, '') || "12345678909"; // Fallback para dev

    // Cria/Busca Cliente no Asaas
    const customerResponse = await fetch(`${ASAAS_API_URL}/customers`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
      body: JSON.stringify({ name: customerName, email: customerEmail, cpfCnpj: customerCpfCnpj }),
    });

    const customerData = await customerResponse.json();
    if (!customerResponse.ok) throw new Error(customerData.errors?.[0]?.description || "Erro no Cliente Asaas.");

    // Define a referência e a descrição para o Webhook
    let description = "";
    let externalReference = "";

    if (checkoutType === "package") {
      description = `Fusion Pass ${packageName} - ${hours} Créditos`;
      externalReference = `package|${user.id}|${packageId}|${hours}`;
    } else if (checkoutType === "booking") {
      description = `Reserva de Espaço - Fusion Clinic`;
      externalReference = `booking|${paymentRef}`;
    }

    // Gera Cobrança
    const paymentResponse = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "access_token": ASAAS_API_KEY },
      body: JSON.stringify({
        customer: customerData.id,
        billingType: "UNDEFINED", 
        value: price,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], 
        description: description,
        externalReference: externalReference, 
      }),
    });

    const paymentData = await paymentResponse.json();
    if (!paymentResponse.ok) throw new Error(paymentData.errors?.[0]?.description || "Erro ao gerar cobrança.");

    return NextResponse.json({ invoiceUrl: paymentData.invoiceUrl, paymentId: paymentData.id });

  } catch (error: any) {
    console.error("Erro no motor de Checkout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}