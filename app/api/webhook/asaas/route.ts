import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    console.log("🔔 [WEBHOOK ASAAS] Evento Recebido:", body.event);

    if (body.event === "PAYMENT_RECEIVED" || body.event === "PAYMENT_CONFIRMED") {
      const payment = body.payment;
      const externalReference = payment.externalReference;
      
      if (!externalReference) return NextResponse.json({ message: "Ignorado" }, { status: 200 });

      const [refType, ...rest] = externalReference.split("|");

      if (refType === "package") {
        // COMPRA DE PACOTE DE CRÉDITOS (A carteira recebe as horas e expiram em 30 dias)
        const userId = rest[0];
        const tier = rest[1]; 
        const hours = rest[2];

        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30); // 30 Dias de Validade

        await supabaseAdmin.from("wallet_transactions").insert({
          user_id: userId,
          amount: Number(hours),
          tier: tier,
          type: "recharge",
          description: `Assinatura: Fusion Pass ${tier.toUpperCase()}`,
          expires_at: expiresAt.toISOString()
        });
        console.log(`✅ ${hours} CR liberados para o usuário ${userId} no Tier ${tier}`);

      } else if (refType === "booking") {
        // PAGAMENTO AVULSO DE SALA (Não passa pela carteira, confirma direto)
        const paymentRef = rest[0]; // Identificador que o frontend enviou
        
        await supabaseAdmin
          .from("bookings")
          .update({ status: "confirmed" })
          .eq("asaas_payment_id", paymentRef);
          
        console.log(`✅ Reserva(s) do grupo ${paymentRef} confirmadas com sucesso!`);
      }
    }

    return NextResponse.json({ received: true }, { status: 200 });
  } catch (error: any) {
    console.error("Erro no Webhook:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}