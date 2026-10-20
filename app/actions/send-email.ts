"use server";

import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";

const resend = new Resend(process.env.RESEND_API_KEY);

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "Fusion Clinic <nao-responda@fusionclinic.com.br>";

const FALLBACK_ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "tecnologia@fusionclinic.com.br";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key);
}

function formatBRL(val: number): string {
  return Number(val || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function buildEmailLayout(title: string, badgeText: string, bodyHtml: string) {
  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <body style="margin:0;padding:0;background-color:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#0F172A;">
      <div style="max-width:600px;margin:28px auto;background:#FFFFFF;border-radius:20px;overflow:hidden;border:1px solid #E2E8F0;box-shadow:0 4px 20px rgba(15,23,42,0.04);">
        <div style="background:#0F172A;padding:24px 32px;border-bottom:4px solid #BF4B24;">
          <span style="display:inline-block;background:rgba(191,75,36,0.25);color:#FDBA74;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:1px;padding:4px 10px;border-radius:6px;margin-bottom:8px;">
            ${badgeText}
          </span>
          <h1 style="margin:0;color:#FFFFFF;font-size:20px;font-weight:900;letter-spacing:-0.3px;">
            ${title}
          </h1>
        </div>
        <div style="padding:28px 32px;font-size:14px;line-height:1.6;color:#334155;">
          ${bodyHtml}
        </div>
        <div style="background:#FAF7F5;padding:18px 32px;border-top:1px solid #F1F5F9;font-size:12px;color:#64748B;text-align:center;">
          <strong>Fusion Clinic</strong> • Plataforma Inteligente de Locação de Consultórios<br/>
          Natal, RN • Este é um e-mail automático do sistema.
        </div>
      </div>
    </body>
  </html>`;
}

// ============================================================================
// 1. E-MAIL DE BOAS-VINDAS (APÓS CONFIRMAR O CÓDIGO DE 2 FATORES NO CADASTRO)
// ============================================================================
export async function sendWelcomeEmail(toEmail: string, userName: string) {
  try {
    if (!process.env.RESEND_API_KEY || !toEmail) return { success: false };

    const html = buildEmailLayout(
      `Bem-vindo(a) à Fusion Clinic, ${userName}!`,
      "Conta Verificada",
      `
      <p>Olá, <strong>${userName}</strong>!</p>
      <p>Sua conta foi verificada com sucesso. Agora você tem acesso completo aos consultórios e espaços de saúde de alto padrão da <strong>Fusion Clinic</strong>.</p>
      <div style="background:#FAF7F5;border-left:4px solid #BF4B24;padding:14px 18px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-weight:700;color:#0F172A;">Como começar:</p>
        <ul style="margin:8px 0 0 0;padding-left:18px;color:#475569;">
          <li>Adquira pacotes de horas com tarifas reduzidas na sua Carteira Digital;</li>
          <li>Escolha a sala ideal (Basic, VIP ou Master) e reserve em segundos;</li>
          <li>Realize o check-in na clínica lendo o QR Code da porta.</li>
        </ul>
      </div>
      `,
    );

    await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: "Bem-vindo(a) à Fusion Clinic! Sua conta está ativa",
      html,
    });

    return { success: true };
  } catch (err) {
    console.error("Erro ao enviar e-mail de boas-vindas:", err);
    return { success: false };
  }
}

// ============================================================================
// 2. NOTIFICAÇÕES COMPLETAS DE RESERVA (MÉDICO + ANFITRIÃO + ADMIN)
// ============================================================================
export async function sendBookingNotificationEmails(bookingId: string) {
  try {
    if (!process.env.RESEND_API_KEY || !bookingId) return { success: false };
    const supabase = getAdminSupabase();

    // 1. Busca os dados completos da reserva
    const { data: booking, error: bErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();

    if (bErr || !booking) return { success: false, error: "Reserva não localizada" };

    // 2. Busca Sala, Profissional, Anfitrião e Admins
    const [roomRes, specialistRes, adminsRes] = await Promise.all([
      supabase.from("rooms").select("*").eq("id", booking.room_id).single(),
      supabase.from("profiles").select("*").eq("id", booking.user_id).single(),
      supabase.from("profiles").select("email, full_name").eq("role", "admin"),
    ]);

    const room = roomRes.data;
    const specialist = specialistRes.data;

    let hostProfile: any = null;
    if (room?.host_id) {
      const { data: hData } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", room.host_id)
        .single();
      hostProfile = hData;
    }

    // Caso o e-mail não esteja na tabela profiles, busca no Auth Admin do Supabase
    let specialistEmail = specialist?.email;
    if (!specialistEmail && booking.user_id) {
      const { data: authUser } = await supabase.auth.admin.getUserById(
        booking.user_id,
      );
      specialistEmail = authUser?.user?.email;
    }

    let hostEmail = hostProfile?.email;
    if (!hostEmail && room?.host_id) {
      const { data: authHost } = await supabase.auth.admin.getUserById(
        room.host_id,
      );
      hostEmail = authHost?.user?.email;
    }

    const adminEmails = Array.from(
      new Set([
        ...(adminsRes.data || []).map((a: any) => a.email).filter(Boolean),
        FALLBACK_ADMIN_EMAIL,
      ]),
    );

    const startDt = parseISO(booking.start_time);
    const endDt = parseISO(booking.end_time);
    const formattedDate = format(startDt, "dd 'de' MMMM 'de' yyyy (EEEE)", {
      locale: ptBR,
    });
    const formattedHours = `${format(startDt, "HH:mm")} às ${format(endDt, "HH:mm")}`;
    const durationHours = Math.max(
      1,
      Math.round((endDt.getTime() - startDt.getTime()) / (1000 * 60 * 60)),
    );

    const roomName = room?.name || "Consultório Fusion";
    const clinicName = hostProfile?.full_name || "Fusion Clinic";
    const specialistName = specialist?.full_name || "Profissional";
    const specialistSpecialty = specialist?.specialty || "Saúde";
    const codeShort = `#${String(booking.id).slice(0, 8).toUpperCase()}`;

    const emailPayloads: any[] = [];

    // A) E-mail para o PROFISSIONAL (Confirmação de Reserva)
    if (specialistEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [specialistEmail],
        subject: `✅ Reserva Confirmada: ${roomName} (${format(startDt, "dd/MM")} às ${format(startDt, "HH:mm")})`,
        html: buildEmailLayout(
          "Sua Reserva está Confirmada!",
          `Reserva ${codeShort}`,
          `
          <p>Olá, <strong>${specialistName}</strong>!</p>
          <p>Sua reserva na <strong>${roomName}</strong> foi confirmada com sucesso na agenda.</p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>📍 Espaço:</strong> ${roomName} (${clinicName})</p>
            <p style="margin:4px 0;"><strong>📅 Data:</strong> ${formattedDate}</p>
            <p style="margin:4px 0;"><strong>⏰ Horário:</strong> ${formattedHours} (${durationHours}h)</p>
            <p style="margin:4px 0;"><strong>🔑 Código:</strong> ${codeShort}</p>
          </div>
          <p style="font-size:13px;color:#475569;">
            <strong>Lembrete de Check-in:</strong> Ao chegar na clínica, abra o painel da Fusion Clinic no seu celular e escaneie o QR Code da sala para iniciar seu atendimento.
          </p>
          `,
        ),
      });
    }

    // B) E-mail para o ANFITRIÃO / CLÍNICA (Aviso de Nova Locação)
    if (hostEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [hostEmail],
        subject: `📅 Nova Reserva na ${roomName} — ${specialistName} (${format(startDt, "dd/MM HH:mm")})`,
        html: buildEmailLayout(
          `Nova Reserva na ${roomName}`,
          "Notificação do Anfitrião",
          `
          <p>Olá, <strong>${clinicName}</strong>!</p>
          <p>Um profissional acabou de agendar um horário no seu espaço pela plataforma Fusion Clinic:</p>
          <div style="background:#FAF7F5;border:1px solid #FED7AA;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>👨‍⚕️ Profissional:</strong> ${specialistName} (${specialistSpecialty})</p>
            <p style="margin:4px 0;"><strong>🚪 Sala:</strong> ${roomName}</p>
            <p style="margin:4px 0;"><strong>📅 Data:</strong> ${formattedDate}</p>
            <p style="margin:4px 0;"><strong>⏰ Horário:</strong> ${formattedHours} (${durationHours}h)</p>
            <p style="margin:4px 0;"><strong>🔑 Reserva:</strong> ${codeShort}</p>
          </div>
          <p style="font-size:13px;color:#475569;">Certifique-se de que a sala esteja preparada para receber o especialista no horário agendado.</p>
          `,
        ),
      });
    }

    // C) E-mail para o ADMINISTRADOR (Torre de Controle Fusion)
    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `🔔 [Admin Reserva] ${specialistName} reservou ${roomName} (${format(startDt, "dd/MM HH:mm")})`,
        html: buildEmailLayout(
          "Nova Reserva Registrada na Plataforma",
          "Torre de Controle Admin",
          `
          <p>Uma nova reserva foi registrada em tempo real no sistema:</p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Profissional:</strong> ${specialistName} (${specialistSpecialty})</p>
            <p style="margin:4px 0;"><strong>Sala / Clínica:</strong> ${roomName} • ${clinicName}</p>
            <p style="margin:4px 0;"><strong>Data e Hora:</strong> ${formattedDate}, das ${formattedHours} (${durationHours}h)</p>
            <p style="margin:4px 0;"><strong>Custo / Créditos:</strong> ${booking.total_cost || durationHours} crédito(s)/unid.</p>
            <p style="margin:4px 0;"><strong>Taxa de Upgrade:</strong> R$ ${formatBRL(Number(booking.upgrade_fee_amount || 0))}</p>
            <p style="margin:4px 0;"><strong>ID Reserva:</strong> ${codeShort}</p>
          </div>
          `,
        ),
      });
    }

    await Promise.allSettled(
      emailPayloads.map((payload) => resend.emails.send(payload)),
    );

    return { success: true, sentCount: emailPayloads.length };
  } catch (err) {
    console.error("Erro ao disparar e-mails de reserva:", err);
    return { success: false };
  }
}

// ============================================================================
// 3. NOTIFICAÇÕES DE PAGAMENTO CONFIRMADO (PROFISSIONAL + ADMIN + ANFITRIÃO)
// ============================================================================
export async function sendPaymentNotificationEmails(params: {
  userId: string;
  amountBrl: number;
  creditsAdded?: number;
  tier?: string;
  paymentMethod?: string;
  description?: string;
  hostId?: string;
}) {
  try {
    if (!process.env.RESEND_API_KEY) return { success: false };
    const supabase = getAdminSupabase();

    const [userProfileRes, adminsRes] = await Promise.all([
      supabase.from("profiles").select("*").eq("id", params.userId).single(),
      supabase.from("profiles").select("email, full_name").eq("role", "admin"),
    ]);

    const specialist = userProfileRes.data;
    let specialistEmail = specialist?.email;
    if (!specialistEmail && params.userId) {
      const { data: authUser } = await supabase.auth.admin.getUserById(
        params.userId,
      );
      specialistEmail = authUser?.user?.email;
    }

    const adminEmails = Array.from(
      new Set([
        ...(adminsRes.data || []).map((a: any) => a.email).filter(Boolean),
        FALLBACK_ADMIN_EMAIL,
      ]),
    );

    const specialistName = specialist?.full_name || "Especialista";
    const tierUpper = String(params.tier || "START").toUpperCase();
    const nowFormatted = format(new Date(), "dd/MM/yyyy 'às' HH:mm");
    const desc =
      params.description ||
      (params.creditsAdded
        ? `Pacote de ${params.creditsAdded} hora(s) (${tierUpper})`
        : "Pagamento confirmado na Fusion Clinic");

    const emailPayloads: any[] = [];

    // A) Recibo de Pagamento para o PROFISSIONAL
    if (specialistEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [specialistEmail],
        subject: `💳 Pagamento Confirmado: R$ ${formatBRL(params.amountBrl)} — Fusion Clinic`,
        html: buildEmailLayout(
          "Pagamento Confirmado com Sucesso!",
          "Recibo Financeiro",
          `
          <p>Olá, <strong>${specialistName}</strong>!</p>
          <p>Recebemos a confirmação do seu pagamento e seus créditos já foram liberados na sua Carteira Digital.</p>
          <div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>📦 Item:</strong> ${desc}</p>
            <p style="margin:4px 0;"><strong>💰 Valor Pago:</strong> R$ ${formatBRL(params.amountBrl)}</p>
            ${
              params.creditsAdded
                ? `<p style="margin:4px 0;"><strong>⚡ Créditos Liberados:</strong> +${params.creditsAdded} crédito(s) categoria ${tierUpper}</p>`
                : ""
            }
            <p style="margin:4px 0;"><strong>🕒 Data da Confirmação:</strong> ${nowFormatted}</p>
          </div>
          `,
        ),
      });
    }

    // B) Alerta de Cash-In para o ADMINISTRADOR
    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `💰 [Pagamento Recebido] R$ ${formatBRL(params.amountBrl)} de ${specialistName}`,
        html: buildEmailLayout(
          `Novo Pagamento Recebido: R$ ${formatBRL(params.amountBrl)}`,
          "Alerta Financeiro Admin",
          `
          <p>Um pagamento foi compensado e creditado na plataforma:</p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Cliente:</strong> ${specialistName} (${specialistEmail || "Sem e-mail"})</p>
            <p style="margin:4px 0;"><strong>Descrição:</strong> ${desc}</p>
            <p style="margin:4px 0;"><strong>Valor Confirmado:</strong> <span style="color:#059669;font-weight:900;">R$ ${formatBRL(params.amountBrl)}</span></p>
            <p style="margin:4px 0;"><strong>Método:</strong> ${params.paymentMethod || "Asaas / PIX / Cartão"}</p>
            <p style="margin:4px 0;"><strong>Data/Hora:</strong> ${nowFormatted}</p>
          </div>
          `,
        ),
      });
    }

    // C) Se houver um Anfitrião específico atrelado ao pagamento (ex: taxa direta da sala)
    if (params.hostId) {
      const { data: hostProf } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", params.hostId)
        .single();
      if (hostProf?.email) {
        emailPayloads.push({
          from: FROM_EMAIL,
          to: [hostProf.email],
          subject: `💰 Confirmação de Pagamento de Locação — ${specialistName}`,
          html: buildEmailLayout(
            "Pagamento de Locação Confirmado",
            "Financeiro Anfitrião",
            `
            <p>Olá, <strong>${hostProf.full_name || "Anfitrião"}</strong>!</p>
            <p>O pagamento referente à reserva de <strong>${specialistName}</strong> no valor de <strong>R$ ${formatBRL(params.amountBrl)}</strong> foi confirmado.</p>
            `,
          ),
        });
      }
    }

    await Promise.allSettled(
      emailPayloads.map((payload) => resend.emails.send(payload)),
    );

    return { success: true };
  } catch (err) {
    console.error("Erro ao disparar e-mails de pagamento:", err);
    return { success: false };
  }
}