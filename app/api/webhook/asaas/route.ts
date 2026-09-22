import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Usa a Service Role Key para ter permissão de escrever na base de dados sem precisar de um utilizador logado no momento do webhook
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    // 1. BLINDAGEM DE SEGURANÇA: Verifica se a requisição traz o nosso Token Secreto
    const asaasToken = req.headers.get("asaas-access-token");
    
    if (asaasToken !== process.env.ASAAS_WEBHOOK_TOKEN) {
      console.error("🚨 Tentativa de invasão bloqueada no Webhook do Asaas.");
      return NextResponse.json({ error: "Acesso Negado (Unauthorized)" }, { status: 401 });
    }

    // Se a senha estiver correta, processamos o pagamento
    const body = await req.json();
    console.log("🔔 [WEBHOOK ASAAS] Evento Recebido:", body.event);

    if (body.event === "PAYMENT_RECEIVED" || body.event === "PAYMENT_CONFIRMED") {
      const payment = body.payment;
      const externalReference = payment.externalReference;
      
      if (!externalReference) return NextResponse.json({ message: "Sem referência, ignorado." }, { status: 200 });

      // Desmonta a string que enviámos no momento do checkout (ex: "package|id_do_user|start|10")
      const [refType, ...rest] = externalReference.split("|");

      if (refType === "package") {
        // Fluxo A: Compra de Pacote de Horas (Recarga de Carteira)
        const userId = rest[0];
        const tier = rest[1]; 
        const hours = rest[2];

        // Regra de Validade (30 dias corridos)
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);

        await supabaseAdmin.from("wallet_transactions").insert({
          user_id: userId,
          amount: Number(hours),
          tier: tier,
          type: "recharge",
          description: `Assinatura: Fusion Pass ${tier.toUpperCase()}`,
          expires_at: expiresAt.toISOString()
        });
        
        console.log(`✅ ${hours} horas creditadas para o utilizador ${userId} no Tier ${tier}`);

      } else if (refType === "booking") {
        // Fluxo B: Pagamento Avulso de Sala (Confirma a reserva diretamente)
        const paymentRef = rest[0]; 
        
        await supabaseAdmin
          .from("bookings")
          .update({ status: "confirmed" })
          .eq("asaas_payment_id", paymentRef);
          
        console.log(`✅ Reserva ${paymentRef} confirmada com sucesso via pagamento avulso!`);
      }
    }

    // O Asaas exige sempre um status 200 de retorno rápido para saber que recebemos o aviso
    return NextResponse.json({ received: true }, { status: 200 });
    
  } catch (error: any) {
    console.error("Erro crítico no processamento do Webhook:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}