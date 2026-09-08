import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function POST(request: Request) {
  try {
    const supabase = await createClient(); 
    
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
    }

    const body = await request.json();
    const { receiverEmail, amount, tier } = body;

    // 1. Validações de Segurança (Anti-Fraude)
    if (!receiverEmail || amount <= 0 || !tier) {
      return NextResponse.json({ error: "Dados de transferência inválidos." }, { status: 400 });
    }

    if (receiverEmail.toLowerCase() === user.email?.toLowerCase()) {
      return NextResponse.json({ error: "Você não pode enviar horas para si mesmo." }, { status: 400 });
    }

    // NOVO: Buscar o nome de quem está enviando para gerar o histórico personalizado
    const { data: senderProfile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();
      
    // Pega só o primeiro nome para ficar elegante, ou usa 'um colega' como fallback
    const senderName = senderProfile?.full_name?.split(" ")[0] || "um colega"; 

    // 2. Verificar o Saldo do Remetente (Prevenção de Saldo Negativo)
    const { data: txs, error: txError } = await supabase
      .from("wallet_transactions")
      .select("amount")
      .eq("user_id", user.id)
      .eq("tier", tier);

    if (txError) throw txError;

    const balance = txs.reduce((acc: number, curr: any) => acc + Number(curr.amount), 0);
    if (balance < amount) {
      return NextResponse.json({ 
        error: "Saldo insuficiente para esta categoria. Verifique sua carteira." 
      }, { status: 400 });
    }

    // 3. Buscar o Destinatário pelo E-mail
    const { data: receiverProfile, error: profileError } = await supabase
      .from("profiles")
      .select("id, gamification_level, full_name")
      .ilike("email", receiverEmail)
      .maybeSingle();

    if (profileError && profileError.code !== 'PGRST116') throw profileError;

    // A REGRA DE NEGÓCIO SUPREMA: Apenas Bronze pode receber
    if (receiverProfile && receiverProfile.gamification_level !== 'bronze') {
      return NextResponse.json({ 
        error: "Transferência negada. Este profissional já é fidelizado na plataforma e não pode receber horas promocionais." 
      }, { status: 403 });
    }

    // 4. Executar o Débito do Remetente
    const { error: debitError } = await supabase
      .from("wallet_transactions")
      .insert({
        user_id: user.id,
        amount: -amount,
        type: "transfer_out",
        tier: tier,
        description: `Fusion Gift enviado para ${receiverEmail}`
      });

    if (debitError) throw debitError;

    // Regra de Uso: Validade de exatos 30 dias para gerar FOMO
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 30);

    if (receiverProfile) {
      // CENÁRIO A: Usuário já existe e é Bronze (Credita na hora)
      const { error: creditError } = await supabase
        .from("wallet_transactions")
        .insert({
          user_id: receiverProfile.id,
          amount: amount,
          type: "transfer_in",
          tier: tier,
          description: `Fusion Gift de Dr(a). ${senderName}`, // O NOME APARECE AQUI!
          expires_at: expiresAt.toISOString()
        });

      if (creditError) throw creditError;

      // Audita a transação concluída
      await supabase.from("credit_transfers").insert({
        sender_id: user.id,
        receiver_email: receiverEmail,
        receiver_id: receiverProfile.id,
        amount: amount,
        tier: tier,
        status: 'completed',
        completed_at: new Date().toISOString()
      });

      return NextResponse.json({ 
        message: `Horas enviadas com sucesso! ${receiverProfile.full_name?.split(" ")[0] || 'Seu colega'} já recebeu o crédito.`,
        status: "completed"
      });

    } else {
      // CENÁRIO B: Usuário não existe (Fica Pendente para Captação)
      await supabase.from("credit_transfers").insert({
        sender_id: user.id,
        receiver_email: receiverEmail,
        amount: amount,
        tier: tier,
        status: 'pending'
      });

      return NextResponse.json({ 
        message: "Convite VIP enviado! Assim que a conta for criada, as horas estarão na carteira com validade de 30 dias.",
        status: "pending"
      });
    }

  } catch (error: any) {
    console.error("Erro Crítico na Transferência:", error);
    return NextResponse.json({ error: "Erro interno ao processar a transferência." }, { status: 500 });
  }
}