import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(req: Request) {
  try {
    const ASAAS_API_URL = process.env.ASAAS_API_URL;
    const ASAAS_API_KEY = process.env.ASAAS_API_KEY;

    if (!ASAAS_API_URL || !ASAAS_API_KEY) {
      throw new Error("As chaves do Asaas não foram encontradas no ambiente.");
    }

    const { packageId, hours, price, packageName } = await req.json();

    const supabase = await createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Sua sessão expirou. Faça login novamente." }, { status: 401 });
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name, phone, cpf") 
      .eq("id", user.id)
      .single();

    const customerName = profile?.full_name || "Dr(a). Fusion Clinic";
    const customerEmail = user.email || "medico@fusionclinic.com.br";
    
    // O Asaas exige um CPF matematicamente válido.
    // Se o profile.cpf for nulo ou inválido, usamos este fallback para testes locais.
    // Em produção, o ideal é validar o CPF no frontend antes de enviar pra cá.
    const customerCpfCnpj = "12345678909";

    // ==========================================
    // ETAPA A: CRIAR OU BUSCAR O CLIENTE NO ASAAS
    // ==========================================
    const customerResponse = await fetch(`${ASAAS_API_URL}/customers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": ASAAS_API_KEY,
      },
      body: JSON.stringify({
        name: customerName,
        email: customerEmail,
        cpfCnpj: customerCpfCnpj,
      }),
    });

    const customerData = await customerResponse.json();

    if (!customerResponse.ok) {
      const asaasError = customerData.errors?.[0]?.description || "Erro desconhecido.";
      throw new Error(`Asaas recusou o cliente: ${asaasError}`);
    }

    // ==========================================
    // ETAPA B: CRIAR A COBRANÇA (PAYMENT)
    // ==========================================
    const paymentResponse = await fetch(`${ASAAS_API_URL}/payments`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "access_token": ASAAS_API_KEY,
      },
      body: JSON.stringify({
        customer: customerData.id,
        billingType: "UNDEFINED", 
        value: price,
        dueDate: new Date(new Date().setDate(new Date().getDate() + 1)).toISOString().split('T')[0], 
        description: `Fusion Clinic: Pacote ${packageName} - ${hours} Horas`,
        externalReference: `${user.id}|${packageId}|${hours}`, 
      }),
    });

    const paymentData = await paymentResponse.json();

    if (!paymentResponse.ok) {
      const asaasError = paymentData.errors?.[0]?.description || "Erro ao gerar cobrança.";
      throw new Error(`Asaas recusou a cobrança: ${asaasError}`);
    }

    // Retorna o link mágico para o Front
    return NextResponse.json({ 
      invoiceUrl: paymentData.invoiceUrl, 
      paymentId: paymentData.id 
    });

  } catch (error: any) {
    console.error("Erro no motor de Checkout:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}