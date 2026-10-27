// app/api/webhook/asaas/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  sendBookingNotificationEmails,
  sendPaymentNotificationEmails,
} from "@/app/actions/send-email";

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
    const configuredSecret =
      process.env.ASAAS_WEBHOOK_SECRET || process.env.ASAAS_WEBHOOK_TOKEN;

    if (configuredSecret && asaasToken !== configuredSecret) {
      console.error("[Asaas Webhook] Token de webhook inválido ou ausente.");
      return NextResponse.json(
        { error: "Acesso não autorizado." },
        { status: 401 },
      );
    }

    const payload = await request.json();
    const { event, payment } = payload;

    if (!payment || !payment.id) {
      return NextResponse.json(
        { error: "Payload inválido: objeto payment ausente." },
        { status: 400 },
      );
    }

    const paymentId = String(payment.id);
    const externalRef = String(payment.externalReference || "");
    const isSubscriptionPayment =
      Boolean(payment.subscription) || externalRef.startsWith("sub_");

    console.log(
      `[Asaas Webhook] Evento: ${event} | Pagamento: ${paymentId} | Tipo: ${isSubscriptionPayment ? "Assinatura" : "Reserva"}`,
    );

    // ========================================================================
    // 2. PROCESSAMENTO DE PAGAMENTO CONFIRMADO / RECEBIDO
    // ========================================================================
    if (event === "PAYMENT_RECEIVED" || event === "PAYMENT_CONFIRMED") {
      // ----------------------------------------------------------------------
      // CENÁRIO A: ASSINATURA RECORRENTE FUSION PASS+ (1º MÊS E RENOVAÇÕES)
      // ----------------------------------------------------------------------
      if (isSubscriptionPayment) {
        const idempotencyTag = `[Asaas:${paymentId}]`;

        // 1. Trava de Idempotência: Verifica se esta fatura já foi creditada (pelo polling ou por evento anterior)
        const { data: existingTx } = await supabaseAdmin
          .from("wallet_transactions")
          .select("id")
          .or(
            `description.ilike.%${idempotencyTag}%,description.ilike.%(${paymentId})%`,
          )
          .limit(1);

        if (existingTx && existingTx.length > 0) {
          console.log(
            `[Asaas Webhook] Fatura de assinatura ${paymentId} já creditada anteriormente. Ignorando duplicidade.`,
          );
          return NextResponse.json({
            success: true,
            status: "already_credited",
          });
        }

        let userId = "";
        let tier = "start";
        let hours = 0;

        // 2. Extrai os dados do externalReference herdado da assinatura: sub_<userId>_<tier>_<hours>h_<timestamp>
        if (externalRef.startsWith("sub_")) {
          const parts = externalRef.split("_");
          if (parts.length >= 4) {
            userId = parts[1];
            tier = parts[2].toLowerCase().trim();
            hours = Number(parts[3].replace(/\D/g, "")) || 0;
          }
        }

        // 3. Fallback: Caso seja uma assinatura antiga vinculada por asaas_subscription_id
        if ((!userId || hours <= 0) && payment.subscription) {
          const { data: subRecord } = await supabaseAdmin
            .from("subscriptions")
            .select("user_id, tier, hours")
            .eq("asaas_subscription_id", payment.subscription)
            .maybeSingle();

          if (subRecord) {
            userId = subRecord.user_id;
            tier = String(subRecord.tier || "start").toLowerCase().trim();
            hours = Number(subRecord.hours || 0);
          }
        }

        if (!userId || hours <= 0) {
          console.warn(
            `[Asaas Webhook] Não foi possível identificar o usuário/horas para a assinatura ${payment.subscription || externalRef}`,
          );
          return NextResponse.json({
            received: true,
            warning: "Assinatura sem referência de usuário identificada.",
          });
        }

        const priceBrl = Number(payment.value || 0);
        const unitHourlyRate =
          hours > 0 && priceBrl > 0 ? (priceBrl / hours).toFixed(2) : "0.00";
        const rateTag =
          Number(unitHourlyRate) > 0 ? `[Rate:${unitHourlyRate}]` : "";

        // 4. Atualiza o status da assinatura na tabela `subscriptions` para ACTIVE
        await supabaseAdmin
          .from("subscriptions")
          .update({ status: "INACTIVE" })
          .eq("user_id", userId)
          .eq("status", "ACTIVE");

        await supabaseAdmin.from("subscriptions").insert({
          user_id: userId,
          tier,
          hours,
          status: "ACTIVE",
        });

        // 5. Injeta as novas horas na carteira com validade de 30 dias e a tarifa [Rate:XX.XX]
        const expiresAt = new Date(
          Date.now() + 30 * 24 * 60 * 60 * 1000,
        ).toISOString();

        const { error: walletErr } = await supabaseAdmin
          .from("wallet_transactions")
          .insert({
            user_id: userId,
            amount: hours,
            type: "credit",
            tier,
            description: `Assinatura Fusion Pass (${tier.toUpperCase()}) - +${hours}h ${rateTag} ${idempotencyTag}`,
            expires_at: expiresAt,
          });

        if (walletErr) {
          console.error(
            "[Asaas Webhook] Erro ao inserir créditos da assinatura:",
            walletErr,
          );
          throw walletErr;
        }

        // 6. Notifica o profissional no sino do app e envia o e-mail de confirmação
        try {
          await supabaseAdmin.from("notifications").insert({
            user_id: userId,
            type: "subscription_active",
            title: "Créditos do Fusion Pass+ Liberados!",
            content: `Seu pagamento foi confirmado e adicionamos +${hours}h (${tier.toUpperCase()}) na sua carteira.`,
            link: "/dashboard",
            is_read: false,
          });
        } catch {}

        await sendPaymentNotificationEmails({
          userId,
          amountBrl: priceBrl,
          creditsAdded: hours,
          tier,
          paymentMethod: payment.billingType || "Assinatura Asaas",
          description: `Assinatura Fusion Pass+ (${hours}h - ${tier.toUpperCase()})`,
        }).catch(console.error);

        console.log(
          `[Asaas Webhook] +${hours}h (${tier}) creditadas com sucesso para o usuário ${userId}.`,
        );

        return NextResponse.json({
          success: true,
          message: "Assinatura processada e horas creditadas com sucesso.",
        });
      }

      // ----------------------------------------------------------------------
      // CENÁRIO B: RESERVA AVULSA DE SALA
      // ----------------------------------------------------------------------
      let bookingId = externalRef || null;

      if (!bookingId) {
        const { data: existingBooking } = await supabaseAdmin
          .from("bookings")
          .select("id, status")
          .eq("asaas_payment_id", paymentId)
          .maybeSingle();

        if (existingBooking) {
          bookingId = existingBooking.id;
        }
      }

      if (bookingId) {
        // Verifica o status antes de atualizar para não enviar e-mails duplicados se já estava confirmada
        const { data: beforeBooking } = await supabaseAdmin
          .from("bookings")
          .select("id, status")
          .eq("id", bookingId)
          .maybeSingle();

        const wasAlreadyConfirmed = beforeBooking?.status === "confirmed";

        const { data: updatedBooking, error: updateError } = await supabaseAdmin
          .from("bookings")
          .update({
            status: "confirmed",
            asaas_payment_id: paymentId,
          })
          .eq("id", bookingId)
          .select("id, user_id, room_id, start_time, end_time, status")
          .single();

        if (updateError) {
          console.error(
            "[Asaas Webhook] Erro ao confirmar reserva no banco:",
            updateError,
          );
          throw updateError;
        }

        // Caso a mesma cobrança PIX/Cartão esteja vinculada a múltiplos horários
        await supabaseAdmin
          .from("bookings")
          .update({ status: "confirmed" })
          .eq("asaas_payment_id", paymentId);

        if (!wasAlreadyConfirmed) {
          if (updatedBooking?.user_id) {
            await supabaseAdmin.from("notifications").insert({
              user_id: updatedBooking.user_id,
              type: "booking_confirmed",
              title: "Reserva Confirmada!",
              content:
                "Seu pagamento foi confirmado. Seu horário já está garantido.",
              link: "/dashboard",
              is_read: false,
            });
          }

          let hostId: string | undefined = undefined;
          let roomName = "Consultório Fusion";
          if (updatedBooking?.room_id) {
            const { data: roomInfo } = await supabaseAdmin
              .from("rooms")
              .select("name, host_id")
              .eq("id", updatedBooking.room_id)
              .maybeSingle();
            if (roomInfo) {
              hostId = roomInfo.host_id;
              roomName = roomInfo.name || roomName;
            }
          }

          await Promise.allSettled([
            sendBookingNotificationEmails(bookingId),
            updatedBooking?.user_id
              ? sendPaymentNotificationEmails({
                  userId: updatedBooking.user_id,
                  amountBrl: Number(payment.value || 0),
                  paymentMethod: payment.billingType || "PIX / Cartão",
                  description: `Reserva de Sala: ${roomName}`,
                  hostId,
                })
              : Promise.resolve(),
          ]);
        }

        return NextResponse.json({
          success: true,
          message: "Reserva confirmada com sucesso.",
        });
      }
    }

    // ========================================================================
    // 3. PROCESSAMENTO DE PAGAMENTO CANCELADO / VENCIDO / ESTORNADO
    // ========================================================================
    if (
      event === "PAYMENT_OVERDUE" ||
      event === "PAYMENT_DELETED" ||
      event === "PAYMENT_REFUNDED"
    ) {
      // Só cancela na tabela `bookings` se NÃO for uma assinatura (evita erro de UUID com "sub_...")
      if (!isSubscriptionPayment) {
        const query = supabaseAdmin
          .from("bookings")
          .update({ status: "cancelled" });

        if (externalRef) {
          await query.eq("id", externalRef);
        } else {
          await query.eq("asaas_payment_id", paymentId);
        }

        console.log(
          `[Asaas Webhook] Pagamento de reserva ${paymentId} cancelado/vencido. Reserva liberada.`,
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[Asaas Webhook] Erro crítico no processamento:", error);
    return NextResponse.json(
      { error: error.message || "Erro interno no servidor." },
      { status: 500 },
    );
  }
}