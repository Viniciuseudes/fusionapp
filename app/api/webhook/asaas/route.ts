// app/api/webhook/asaas/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// Instanciação do Supabase com Service Role Key para ignorar RLS em chamadas do Gateway
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(request: Request) {
  try {
    // 1. Validação de Segurança do Token do Webhook do Asaas
    const asaasToken = request.headers.get("asaas-access-token");
    const configuredSecret = process.env.ASAAS_WEBHOOK_SECRET || process.env.ASAAS_WEBHOOK_TOKEN;

    if (configuredSecret && asaasToken !== configuredSecret) {
      console.error("[Asaas Webhook] Token de webhook inválido ou ausente.");
      return NextResponse.json({ error: "Acesso não autorizado." }, { status: 401 });
    }

    const payload = await request.json();
    const { event, payment } = payload;

    if (!payment || !payment.id) {
      return NextResponse.json({ error: "Payload inválido: objeto payment ausente." }, { status: 400 });
    }

    console.log(`[Asaas Webhook] Evento recebido: ${event} para o pagamento: ${payment.id}`);

    // 2. Processamento de Pagamento Confirmado / Recebido
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      let bookingId = payment.externalReference;

      // Se não veio no externalReference, localiza pelo asaas_payment_id na tabela bookings
      if (!bookingId) {
        const { data: existingBooking } = await supabaseAdmin
          .from("bookings")
          .select("id, status")
          .eq("asaas_payment_id", payment.id)
          .maybeSingle();

        if (existingBooking) {
          bookingId = existingBooking.id;
        }
      }

      if (bookingId) {
        // Atualiza a reserva para confirmed garantindo idempotência
        const { data: updatedBooking, error: updateError } = await supabaseAdmin
          .from("bookings")
          .update({
            status: "confirmed",
            asaas_payment_id: payment.id,
          })
          .eq("id", bookingId)
          .select("id, user_id, room_id, start_time, end_time, status")
          .single();

        if (updateError) {
          console.error("[Asaas Webhook] Erro ao confirmar reserva no banco:", updateError);
          throw updateError;
        }

        console.log(`[Asaas Webhook] Reserva ${bookingId} confirmada com sucesso.`);

        // Gera notificação interna para o usuário no app
        if (updatedBooking?.user_id) {
          await supabaseAdmin.from("notifications").insert({
            user_id: updatedBooking.user_id,
            type: "booking_confirmed",
            title: "Reserva Confirmada!",
            content: "Seu pagamento via PIX foi confirmado. Seu horário já está garantido.",
            link: "/dashboard",
            is_read: false,
          });
        }

        return NextResponse.json({ success: true, message: "Reserva confirmada com sucesso." });
      }

      // Verificação secundária: Se for assinatura de pacote de horas
      if (payment.subscription) {
        const { data: subscription } = await supabaseAdmin
          .from("subscriptions")
          .select("*")
          .eq("asaas_subscription_id", payment.subscription)
          .maybeSingle();

        if (subscription) {
          // Credita horas na carteira
          await supabaseAdmin.from("wallet_transactions").insert({
            user_id: subscription.user_id,
            amount: subscription.hours,
            type: "package_purchase",
            tier: subscription.tier,
            description: `Recarga via assinatura Asaas (${payment.id})`,
          });

          await supabaseAdmin
            .from("subscriptions")
            .update({ status: "ACTIVE" })
            .eq("id", subscription.id);

          return NextResponse.json({ success: true, message: "Assinatura processada com sucesso." });
        }
      }
    }

    // 3. Processamento de Pagamento Cancelado / Vencido / Deletado
    if (event === "PAYMENT_OVERDUE" || event === "PAYMENT_DELETED" || event === "PAYMENT_REFUNDED") {
      const bookingIdentifier = payment.externalReference;
      
      const query = supabaseAdmin.from("bookings").update({ status: "cancelled" });
      if (bookingIdentifier) {
        await query.eq("id", bookingIdentifier);
      } else {
        await query.eq("asaas_payment_id", payment.id);
      }

      console.log(`[Asaas Webhook] Pagamento ${payment.id} cancelado/estornado. Reserva atualizada.`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[Asaas Webhook] Erro crítico no processamento:", error);
    return NextResponse.json({ error: error.message || "Erro interno no servidor." }, { status: 500 });
  }
}