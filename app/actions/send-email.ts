// app/actions/send-email.ts
"use server";

import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://fusionapp.com.br";

const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "Fusion Clinic <nao-responda@fusionclinic.com.br>";

const FALLBACK_ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "tecnologia@fusionapp.com.br";

function getAdminSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { persistSession: false } });
}

// ============================================================================
// FORMATADORES COM TRAVA DE FUSO HORÁRIO (AMERICA/FORTALEZA - UTC-3)
// ============================================================================
function formatBrazilDate(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatBrazilTime(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}

function formatCurrencyBRL(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ============================================================================
// TEMPLATE BASE PARA E-MAILS SIMPLES (Boas-vindas, Cancelamentos, Gifts)
// ============================================================================
function buildFusionEmailLayout(
  title: string,
  badgeText: string,
  bodyHtml: string,
) {
  return `
  <!DOCTYPE html>
  <html lang="pt-BR">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    </head>
    <body style="margin: 0; padding: 24px 12px; background-color: #FAF7F4; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #464E5F;">
      <div style="text-align: center; margin-bottom: 18px;">
        <img src="${APP_URL}/logo-fusion-orange.png" alt="Fusion Clinic" style="max-width: 170px; height: auto;" />
      </div>
      <div style="width: 100%; max-width: 600px; margin: 0 auto; background-color: #FFFFFF; padding: 28px 24px; border-radius: 24px; border: 1px solid #EAEAEA; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.04);">
        <div style="margin-bottom: 20px;">
          ${
            badgeText
              ? `<span style="display: inline-block; background-color: #FFFBEB; color: #B45309; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">${badgeText}</span>`
              : ""
          }
          <h1 style="font-weight: 800; color: #464E5F; font-size: 22px; margin: 0; letter-spacing: -0.02em;">${title}</h1>
        </div>
        <div style="font-size: 14px; line-height: 1.6; color: #464E5F;">
          ${bodyHtml}
        </div>
      </div>
      <div style="text-align: center; padding-top: 24px; font-size: 12px; color: #A1A5B7;">
        <strong>Fusion Clinic</strong> • Plataforma Inteligente de Locação<br/>
        Este é um e-mail automático do sistema.
      </div>
    </body>
  </html>`;
}

// ============================================================================
// 1. E-MAIL DE BOAS-VINDAS
// ============================================================================
export async function sendWelcomeEmail(toEmail: string, userName: string) {
  try {
    if (!process.env.RESEND_API_KEY || !toEmail) {
      return { success: false, error: "Credenciais ou destinatário ausentes" };
    }

    const html = buildFusionEmailLayout(
      `Bem-vindo(a) à Fusion Clinic, ${userName}!`,
      "Conta Verificada",
      `
      <p>Olá, <strong>${userName}</strong>!</p>
      <p>Sua conta foi verificada com sucesso. Agora você tem acesso completo aos consultórios e espaços de saúde de alto padrão da <strong>Fusion Clinic</strong>.</p>
      <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:12px; margin:20px 0;">
        <p style="margin:0 0 8px 0; font-weight:800; color:#1E293B; text-transform:uppercase; font-size:12px;">Como começar:</p>
        <ul style="margin:0; padding-left:18px; color:#475569;">
          <li style="margin-bottom:4px;">Adquira pacotes de horas com tarifas reduzidas no <strong>Fusion Pass+</strong>;</li>
          <li style="margin-bottom:4px;">Escolha a sala ideal (Basic, VIP ou Premium) e reserve em segundos;</li>
          <li>Realize o check-in na clínica encostando o celular na <strong>Tag NFC da porta</strong>.</li>
        </ul>
      </div>
      <div style="text-align: center; margin-top: 24px;">
        <a href="${APP_URL}/dashboard" style="display: inline-block; background-color: #BF4B24; color: #FFFFFF; font-weight: 800; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 12px;">Acessar minha conta</a>
      </div>
      `,
    );

    const { data, error } = await resend.emails.send({
      from: FROM_EMAIL,
      to: [toEmail],
      subject: "Bem-vindo(a) à Fusion Clinic! Sua conta está ativa",
      html,
    });

    if (error) throw new Error(error.message);
    return { success: true, data };
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de boas-vindas:", err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 2. NOTIFICAÇÕES COMPLETAS DE RESERVA (MÉDICO + ANFITRIÃO + ADMIN)
// ============================================================================
export async function sendBookingNotificationEmails(bookingId: string) {
  try {
    if (!process.env.RESEND_API_KEY || !bookingId) return { success: false };
    const supabaseAdmin = getAdminSupabase();

    const { data: mainBooking, error: bErr } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr || !mainBooking) return { success: false };

    // Agrupa reservas irmãs
    let batchBookings = [mainBooking];
    if (mainBooking.asaas_payment_id) {
      const { data: samePaymentBookings } = await supabaseAdmin
        .from("bookings")
        .select("*")
        .eq("asaas_payment_id", mainBooking.asaas_payment_id)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true });
      if (samePaymentBookings && samePaymentBookings.length > 0) {
        batchBookings = samePaymentBookings;
      }
    }

    batchBookings.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );

    const firstSlot = batchBookings[0];
    const lastSlot = batchBookings[batchBookings.length - 1];
    const totalSlotsCount = batchBookings.length;

    const [roomRes, guestRes, adminsRes] = await Promise.all([
      supabaseAdmin.from("rooms").select("*").eq("id", mainBooking.room_id).single(),
      supabaseAdmin.from("profiles").select("*").eq("id", mainBooking.user_id).single(),
      supabaseAdmin.from("profiles").select("email").eq("role", "admin"),
    ]);

    const room = roomRes.data;
    const guest = guestRes.data;

    let hostEmail: string | null = null;
    let hostName = "Fusion Clinic";
    if (room?.host_id) {
      const { data: hostProfile } = await supabaseAdmin
        .from("profiles")
        .select("full_name, email")
        .eq("id", room.host_id)
        .maybeSingle();
      if (hostProfile) {
        hostEmail = hostProfile.email || null;
        hostName = hostProfile.full_name || "Fusion Clinic";
      }
    }

    let specialistEmail = guest?.email || null;
    if (!specialistEmail) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(mainBooking.user_id);
      specialistEmail = authUser?.user?.email || null;
    }

    if (!specialistEmail) return { success: false };

    const adminEmails = Array.from(
      new Set([
        ...(adminsRes.data || []).map((a: any) => a.email).filter(Boolean),
        FALLBACK_ADMIN_EMAIL,
      ]),
    );

    const entryDateFormatted = formatBrazilDate(firstSlot.start_time);
    const entryTimeFormatted = formatBrazilTime(firstSlot.start_time);
    const exitDateFormatted = formatBrazilDate(lastSlot.end_time);
    const exitTimeFormatted = formatBrazilTime(lastSlot.end_time);

    let address: any = room?.address_details || {};
    if (typeof address === "string") {
      try { address = JSON.parse(address); } catch { address = {}; }
    }

    const hourlyRateFallback = Number(address?.pricing?.hourly || 45);
    const totalBrlValue = batchBookings.reduce((acc, b) => {
      if (b.agreed_value_brl && Number(b.agreed_value_brl) > 0) return acc + Number(b.agreed_value_brl);
      const c = Number(b.total_cost || 1);
      return acc + (c < 10 ? c * hourlyRateFallback : c);
    }, 0);

    const isPaidWithCredits = String(mainBooking.booking_origin || "").startsWith("wallet_");
    const streetLine = [address.street, address.number ? `nº ${address.number}` : "", address.complement ? `- ${address.complement}` : ""]
      .filter(Boolean).join(", ");
    const neighborhoodLine = address.neighborhood || "Lagoa Nova";
    const cityStateLine = `${address.city || "Natal"} - ${address.state || "RN"}`;
    const roomPhotoUrl = room?.image_url?.startsWith("http") ? room.image_url : `${APP_URL}${room?.image_url || "/images/room-consultorio.jpg"}`;
    const roomName = room?.name || "Consultório Fusion";
    const clinicName = address.clinic_name || hostName;

    const emailPayloads: any[] = [];

    // EMAIL DO PROFISSIONAL (TEMPLATE CUSTOMIZADO DA PORTA/CHECKLIST)
    emailPayloads.push({
      from: FROM_EMAIL,
      to: [specialistEmail],
      subject: `✅ Reserva Confirmada: ${roomName} (${entryDateFormatted} às ${entryTimeFormatted})`,
      html: `
      <!DOCTYPE html>
      <html lang="pt-BR">
        <head>
          <meta charset="UTF-8" />
          <meta name="viewport" content="width=device-width, initial-scale=1.0" />
          <title>Reserva de Sala - ${roomName}</title>
          <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            body { background-color: #FAF7F4; font-family: sans-serif; color: #464E5F; padding: 24px 12px; }
            .section { width: 100%; max-width: 760px; margin: 0 auto; }
            .card { background-color: #FFFFFF; padding: 28px 24px; border-radius: 24px; border: 1px solid #EAEAEA; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.04); }
            .room-image { width: 100%; height: 242px; object-fit: cover; border-radius: 24px; margin: 14px 0 20px 0; display: block; }
            .info-table { width: 100%; border-collapse: collapse; margin-top: 8px; margin-bottom: 20px; }
            .info-table td { vertical-align: top; padding: 8px 10px 8px 0; }
            .label-th { color: #B5B5C3; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }
            .value-td { color: #464E5F; font-size: 15px; font-weight: 700; }
            @media only screen and (max-width: 580px) {
              .info-table, .info-table tbody, .info-table tr, .info-table td { display: block !important; width: 100% !important; }
              .info-table td { padding: 8px 0 !important; border-bottom: 1px solid #F3F4F6; }
            }
          </style>
        </head>
        <body>
          <div style="text-align: center; margin-bottom: 18px;">
            <img src="${APP_URL}/logo-fusion-orange.png" alt="Fusion Clinic" style="max-width: 170px; height: auto;" />
          </div>
          <section class="section card">
            <div style="margin-bottom: 8px;">
              <span style="display: inline-block; background-color: #ECFDF5; color: #047857; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">
                ✓ Reserva Confirmada
              </span>
              <h1 style="font-weight: 800; color: #464E5F; font-size: 24px; letter-spacing: -0.02em;">RESERVA DE SALA</h1>
              <p style="font-size: 14px; color: #7E8299; margin-top: 4px;">Olá, <strong>${guest?.full_name || "Doutor(a)"}</strong>! Sua sala já está reservada.</p>
            </div>
            <div>
              <img class="room-image" src="${roomPhotoUrl}" alt="${roomName}" width="100%" height="242" />
            </div>
            <table class="info-table" role="presentation">
              <tr>
                <td width="34%">
                  <p class="label-th">SALA</p>
                  <p class="value-td">${roomName}</p>
                  ${room?.specialty ? `<p style="font-size: 12px; color: #7E8299; margin-top: 2px;">${room.specialty}</p>` : ""}
                </td>
                <td width="33%">
                  <p class="label-th">DATA DE ENTRADA</p>
                  <p class="value-td" style="color: #181C32;">${entryDateFormatted} às ${entryTimeFormatted}</p>
                </td>
                <td width="33%">
                  <p class="label-th">DATA DE SAÍDA</p>
                  <p class="value-td" style="color: #BF4B24;">${exitDateFormatted} às ${exitTimeFormatted}</p>
                </td>
              </tr>
            </table>
            
            <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 16px; padding: 16px; margin-bottom: 18px;">
              <p style="font-size: 13px; font-weight: 800; color: #92400E; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">
                ⏱ Por que a hora clínica tem 50 minutos?
              </p>
              <p style="font-size: 13px; color: #78350F; line-height: 1.55;">
                Cada bloco possui <strong>50 minutos de atendimento efetivo</strong>. Os <strong>10 minutos finais</strong> são reservados para a saída do paciente, ventilação e transição sem atrasos para o próximo profissional.
              </p>
            </div>

            <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 18px; margin-bottom: 22px;">
              <h3 style="font-size: 14px; font-weight: 800; color: #1E293B; text-transform: uppercase; margin-bottom: 12px;">📲 Instruções Obrigatórias</h3>
              <p style="font-size: 13px; color: #334155; line-height: 1.55; margin-bottom: 10px;">
                <strong>1. Faça seu Check-in na Porta (Ao chegar):</strong><br />
                Encoste seu celular na <strong>Tag NFC</strong> ou aponte a câmera para o <strong>QR Code na porta da sala</strong> para liberar o acesso.
              </p>
              <p style="font-size: 13px; color: #334155; line-height: 1.55; margin-bottom: 10px;">
                <strong>2. Antes de Sair (Checklist):</strong><br />
                ❄️ <strong>Desligue o ar-condicionado</strong>; 💡 <strong>Apague as luzes</strong>; ✨ Organize a sala.
              </p>
              <p style="font-size: 13px; color: #334155; line-height: 1.55;">
                <strong>3. Faça seu Check-out na Porta (Até as ${exitTimeFormatted}):</strong><br />
                Ao sair, <strong>encoste novamente o celular na Tag NFC / QR Code</strong>. Isso encerra o cronômetro e evita cobrança de hora extra.
              </p>
            </div>

            <div style="border-top: 1px solid #F1F1F4; padding-top: 18px; margin-bottom: 18px;">
              <h2 style="font-size: 15px; font-weight: 800; color: #464E5F; margin-bottom: 12px;">DETALHES DO AGENDAMENTO</h2>
              <div style="margin-bottom: 12px;">
                <p style="font-size: 13px; font-weight: 700; color: #B5B5C3;">Clínica</p>
                <p style="font-size: 15px; font-weight: 700; color: #464E5F;">${clinicName} — ${roomName}</p>
              </div>
              <div>
                <p style="font-size: 13px; font-weight: 700; color: #B5B5C3;">Endereço</p>
                <p style="font-size: 14px; color: #464E5F; line-height: 1.5;">${streetLine}<br />${neighborhoodLine}<br />${cityStateLine}</p>
              </div>
            </div>

            <div style="border-top: 1px solid #F1F1F4; padding-top: 16px; display: flex; justify-content: space-between; align-items: center;">
              <div>
                <h3 style="font-size: 12px; font-weight: 800; color: #B5B5C3;">VALOR TOTAL</h3>
                <h2 style="font-size: 26px; font-weight: 900; color: #464E5F;">R$ ${formatCurrencyBRL(totalBrlValue)}</h2>
                <p style="color: #B5B5C3; font-size: 12px;">${isPaidWithCredits ? `Pago com Créditos (${totalSlotsCount}h)` : "Taxas inclusas"}</p>
              </div>
            </div>

            <div style="margin-top: 24px; text-align: center;">
              <a href="${APP_URL}/dashboard#bookings" style="display: inline-block; background-color: #BF4B24; color: #FFFFFF; font-weight: 800; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 14px;">Ver Minha Reserva no Aplicativo</a>
            </div>
          </section>
        </body>
      </html>`,
    });

    // EMAIL DO ANFITRIÃO
    if (hostEmail && hostEmail !== specialistEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [hostEmail],
        subject: `📅 Nova Reserva na ${roomName} — ${guest?.full_name} (${entryDateFormatted})`,
        html: buildFusionEmailLayout(
          `Nova Reserva na ${roomName}`,
          "Notificação do Anfitrião",
          `
          <p>Olá, <strong>${clinicName}</strong>!</p>
          <p>Um profissional acabou de agendar um horário no seu espaço pela plataforma:</p>
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:12px; margin:20px 0;">
            <p style="margin:4px 0;"><strong>👨‍⚕️ Profissional:</strong> ${guest?.full_name} (${guest?.specialty || "Saúde"})</p>
            <p style="margin:4px 0;"><strong>🚪 Sala:</strong> ${roomName}</p>
            <p style="margin:4px 0;"><strong>📅 Entrada:</strong> ${entryDateFormatted} às ${entryTimeFormatted}</p>
            <p style="margin:4px 0;"><strong>⏰ Saída:</strong> ${exitDateFormatted} às ${exitTimeFormatted}</p>
            <p style="margin:4px 0;"><strong>💰 Valor:</strong> R$ ${formatCurrencyBRL(totalBrlValue)}</p>
          </div>
          `,
        ),
      });
    }

    // EMAIL DO ADMIN
    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `🔔 [Admin Reserva] ${guest?.full_name} reservou ${roomName}`,
        html: buildFusionEmailLayout(
          "Nova Reserva Registrada",
          "Torre de Controle Admin",
          `
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:12px;">
            <p style="margin:4px 0;"><strong>Profissional:</strong> ${guest?.full_name}</p>
            <p style="margin:4px 0;"><strong>Sala / Clínica:</strong> ${roomName} • ${clinicName}</p>
            <p style="margin:4px 0;"><strong>Período:</strong> ${entryDateFormatted} (${entryTimeFormatted} às ${exitTimeFormatted})</p>
            <p style="margin:4px 0;"><strong>Custo Total:</strong> R$ ${formatCurrencyBRL(totalBrlValue)} / ${totalSlotsCount} créditos</p>
          </div>
          `,
        ),
      });
    }

    const results = await Promise.allSettled(
      emailPayloads.map((payload) => resend.emails.send(payload)),
    );
    return { success: true, sentCount: emailPayloads.length, results };
  } catch (err: any) {
    console.error("Erro ao disparar e-mails de reserva:", err);
    return { success: false, error: err.message };
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
    const supabaseAdmin = getAdminSupabase();

    const [userProfileRes, adminsRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("*").eq("id", params.userId).single(),
      supabaseAdmin.from("profiles").select("email").eq("role", "admin"),
    ]);

    const specialist = userProfileRes.data;
    let specialistEmail = specialist?.email;
    if (!specialistEmail) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(params.userId);
      specialistEmail = authUser?.user?.email;
    }

    if (!specialistEmail) return { success: false };

    const adminEmails = Array.from(
      new Set([
        ...(adminsRes.data || []).map((a: any) => a.email).filter(Boolean),
        FALLBACK_ADMIN_EMAIL,
      ]),
    );

    const specialistName = specialist?.full_name || "Especialista";
    const tierUpper = String(params.tier || "START").toUpperCase();
    const nowFormatted = formatBrazilDate(new Date().toISOString()) + " às " + formatBrazilTime(new Date().toISOString());
    const desc = params.description || (params.creditsAdded ? `Pacote de ${params.creditsAdded} hora(s) (${tierUpper})` : "Pagamento confirmado");

    const emailPayloads: any[] = [];

    emailPayloads.push({
      from: FROM_EMAIL,
      to: [specialistEmail],
      subject: `💳 Pagamento Confirmado: R$ ${formatCurrencyBRL(params.amountBrl)}`,
      html: buildFusionEmailLayout(
        "Pagamento Confirmado!",
        "Recibo Financeiro",
        `
        <p>Olá, <strong>${specialistName}</strong>!</p>
        <p>Recebemos a confirmação do seu pagamento e os seus créditos já foram liberados (se aplicável).</p>
        <div style="background:#ECFDF5; border:1px solid #A7F3D0; padding:16px; border-radius:12px; margin:20px 0;">
          <p style="margin:4px 0;"><strong>📦 Item:</strong> ${desc}</p>
          <p style="margin:4px 0;"><strong>💰 Valor Pago:</strong> R$ ${formatCurrencyBRL(params.amountBrl)}</p>
          <p style="margin:4px 0;"><strong>💳 Método:</strong> ${params.paymentMethod || "Cartão/Pix"}</p>
          ${params.creditsAdded ? `<p style="margin:4px 0; color:#047857;"><strong>⚡ Créditos Liberados:</strong> +${params.creditsAdded}h (${tierUpper})</p>` : ""}
          <p style="margin:4px 0;"><strong>🕒 Data:</strong> ${nowFormatted}</p>
        </div>
        `,
      ),
    });

    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `💰 [Pagamento Recebido] R$ ${formatCurrencyBRL(params.amountBrl)} de ${specialistName}`,
        html: buildFusionEmailLayout(
          `Receita: R$ ${formatCurrencyBRL(params.amountBrl)}`,
          "Alerta Financeiro Admin",
          `
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:12px;">
            <p style="margin:4px 0;"><strong>Cliente:</strong> ${specialistName}</p>
            <p style="margin:4px 0;"><strong>Descrição:</strong> ${desc}</p>
            <p style="margin:4px 0;"><strong>Valor Confirmado:</strong> R$ ${formatCurrencyBRL(params.amountBrl)}</p>
            <p style="margin:4px 0;"><strong>Data/Hora:</strong> ${nowFormatted}</p>
          </div>
          `,
        ),
      });
    }

    if (params.hostId) {
      const { data: hostProf } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", params.hostId)
        .single();
      if (hostProf?.email) {
        emailPayloads.push({
          from: FROM_EMAIL,
          to: [hostProf.email],
          subject: `💰 Confirmação de Pagamento de Locação — ${specialistName}`,
          html: buildFusionEmailLayout(
            "Pagamento de Locação Confirmado",
            "Financeiro Anfitrião",
            `
            <p>Olá, <strong>${hostProf.full_name || "Anfitrião"}</strong>!</p>
            <p>O pagamento referente à reserva de <strong>${specialistName}</strong> no valor de <strong>R$ ${formatCurrencyBRL(params.amountBrl)}</strong> foi confirmado.</p>
            `,
          ),
        });
      }
    }

    await Promise.allSettled(emailPayloads.map((payload) => resend.emails.send(payload)));
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao disparar e-mails de pagamento:", err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 4. CANCELAMENTO DE RESERVA (PROFISSIONAL + ANFITRIÃO + ADMIN)
// ============================================================================
export async function sendBookingCancellationEmails(bookingId: string) {
  try {
    if (!process.env.RESEND_API_KEY || !bookingId) return { success: false };
    const supabaseAdmin = getAdminSupabase();

    const { data: booking } = await supabaseAdmin
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .single();
    if (!booking) return { success: false };

    const [roomRes, specialistRes, adminsRes] = await Promise.all([
      supabaseAdmin.from("rooms").select("*").eq("id", booking.room_id).single(),
      supabaseAdmin.from("profiles").select("*").eq("id", booking.user_id).single(),
      supabaseAdmin.from("profiles").select("email").eq("role", "admin"),
    ]);

    const room = roomRes.data;
    const specialist = specialistRes.data;
    
    // Formatação segura UTC-3
    const formattedDate = formatBrazilDate(booking.start_time);
    const formattedHour = formatBrazilTime(booking.start_time);

    let specialistEmail = specialist?.email;
    if (!specialistEmail && booking.user_id) {
      const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(booking.user_id);
      specialistEmail = authUser?.user?.email;
    }

    let hostEmail: string | null = null;
    let clinicName = "Fusion Clinic";
    if (room?.host_id) {
      const { data: hData } = await supabaseAdmin
        .from("profiles")
        .select("email, full_name")
        .eq("id", room.host_id)
        .single();
      hostEmail = hData?.email || null;
      clinicName = hData?.full_name || clinicName;
    }

    const adminEmails = Array.from(
      new Set([
        ...(adminsRes.data || []).map((a: any) => a.email).filter(Boolean),
        FALLBACK_ADMIN_EMAIL,
      ]),
    );

    const roomName = room?.name || "Consultório Fusion";
    const specialistName = specialist?.full_name || "Profissional";
    const emailPayloads: any[] = [];

    if (specialistEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [specialistEmail],
        subject: `❌ Reserva Cancelada: ${roomName} (${formattedDate})`,
        html: buildFusionEmailLayout(
          "Reserva Cancelada",
          "Aviso de Cancelamento",
          `
          <p>Olá, <strong>${specialistName}</strong>.</p>
          <p>Sua reserva para a <strong>${roomName}</strong> no dia <strong>${formattedDate} às ${formattedHour}</strong> foi cancelada.</p>
          <p>Os seus créditos/valores foram processados conforme a nossa política de cancelamento (reembolso integral se efetuado com mais de 24h de antecedência).</p>
          `,
        ),
      });
    }

    if (hostEmail && hostEmail !== specialistEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [hostEmail],
        subject: `❌ Reserva Cancelada na ${roomName} (${formattedDate})`,
        html: buildFusionEmailLayout(
          "Aviso de Cancelamento",
          "Agenda Liberada",
          `
          <p>Olá, <strong>${clinicName}</strong>.</p>
          <p>A reserva de <strong>${specialistName}</strong> na <strong>${roomName}</strong> para o dia <strong>${formattedDate} às ${formattedHour}</strong> foi cancelada.</p>
          <p>O horário já está livre e disponível novamente na sua agenda para novas locações.</p>
          `,
        ),
      });
    }

    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `❌ [Admin Cancelamento] ${specialistName} — ${roomName}`,
        html: buildFusionEmailLayout(
          "Reserva Cancelada no Sistema",
          "Torre de Controle Admin",
          `
          <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:12px;">
            <p style="margin:4px 0;"><strong>Profissional:</strong> ${specialistName}</p>
            <p style="margin:4px 0;"><strong>Sala:</strong> ${roomName} (${clinicName})</p>
            <p style="margin:4px 0;"><strong>Data/Hora original:</strong> ${formattedDate} às ${formattedHour}</p>
          </div>
          `,
        ),
      });
    }

    await Promise.allSettled(emailPayloads.map((payload) => resend.emails.send(payload)));
    return { success: true };
  } catch (err: any) {
    console.error("Erro ao enviar e-mail de cancelamento:", err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 5. TRANSFERÊNCIA DE HORAS (FUSION GIFT)
// ============================================================================
export async function sendGiftNotificationEmail(
  receiverEmail: string,
  receiverName: string,
  senderName: string,
  amount: number,
  tier: string,
) {
  try {
    if (!process.env.RESEND_API_KEY || !receiverEmail) return { success: false };
    const tierUpper = String(tier).toUpperCase();
    
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [receiverEmail],
      subject: `🎁 Você ganhou ${amount} hora(s) na Fusion Clinic!`,
      html: buildFusionEmailLayout(
        "Você recebeu um Fusion Gift!",
        "Créditos Recebidos",
        `
        <p>Olá, <strong>${receiverName || "Doutor(a)"}</strong>!</p>
        <p>Temos uma ótima notícia! <strong>${senderName}</strong> acabou de te enviar <strong>${amount} hora(s)</strong> da categoria <strong>${tierUpper}</strong> para você utilizar em nossos consultórios.</p>
        <div style="text-align: center; margin-top: 24px;">
          <a href="${APP_URL}/dashboard" style="display: inline-block; background-color: #BF4B24; color: #FFFFFF; font-weight: 800; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 12px;">Acessar minha Carteira</a>
        </div>
        `,
      ),
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}

// ============================================================================
// 6. CANCELAMENTO DE ASSINATURA
// ============================================================================
export async function sendSubscriptionCancellationEmail(
  userEmail: string,
  userName: string,
) {
  try {
    if (!process.env.RESEND_API_KEY || !userEmail) return { success: false };
    
    await resend.emails.send({
      from: FROM_EMAIL,
      to: [userEmail],
      subject: "Sua assinatura foi cancelada — Fusion Clinic",
      html: buildFusionEmailLayout(
        "Assinatura Cancelada",
        "Aviso Financeiro",
        `
        <p>Olá, <strong>${userName}</strong>.</p>
        <p>Confirmamos o cancelamento do seu plano de horas recorrente (Fusion Pass+).</p>
        <div style="background:#F8FAFC; border:1px solid #E2E8F0; padding:16px; border-radius:12px; margin:20px 0;">
          <p style="margin:0; color:#475569;">Nenhuma nova cobrança será realizada. As horas já creditadas continuam válidas até ao final do prazo de vencimento na sua carteira.</p>
        </div>
        <p>Se quiser voltar a ter os melhores descontos, basta assinar novamente a qualquer momento!</p>
        `,
      ),
    });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}