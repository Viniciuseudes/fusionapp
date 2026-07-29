import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js"; // Usamos o cliente padrão do supabase-js aqui

// Inicializamos o Supabase com a Chave Mestra (Bypassa o RLS)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    console.log("🔔 [WEBHOOK ASAAS] Evento Recebido:", body.event);

    // O Asaas envia vários eventos (boleto gerado, vencido, etc).
    // Nós só nos importamos quando o dinheiro CAI NA CONTA:
    if (body.event === "PAYMENT_RECEIVED" || body.event === "PAYMENT_CONFIRMED") {
      
      const payment = body.payment;
      const externalReference = payment.externalReference;
      
      // Lembra que mandamos os IDs espremidos no externalReference? Vamos separá-los!
      if (!externalReference) {
         console.warn("Pagamento sem referência recebido. Ignorando.");
         return NextResponse.json({ message: "Ignorado (Sem referência)" }, { status: 200 });
      }

      // Desempacotando: "user_id|tier|hours" (ex: "123|vip|16")
      const [userId, tier, hours] = externalReference.split("|");

      console.log(`💰 Aprovado! Adicionando ${hours}h no pacote ${tier} para o usuário ${userId}`);

      // Injeta as horas na carteira do médico
      const { error } = await supabaseAdmin
        .from("wallet_transactions")
        .insert({
          user_id: userId,
          amount: Number(hours),
          tier: tier,
          type: "recharge",
          description: `Recarga via Asaas (Fatura: ${payment.id})`
        });

      if (error) {
        console.error("Erro ao injetar horas:", error);
        throw error;
      }
      
      console.log("✅ Horas creditadas com sucesso!");
    }

    // Retornamos 200 OK para o Asaas parar de tentar nos avisar
    return NextResponse.json({ received: true }, { status: 200 });

  } catch (error: any) {
    console.error("Erro no Webhook:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}