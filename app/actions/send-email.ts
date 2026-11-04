// app/actions/send-email.ts
"use server";

import { Resend } from "resend";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerSupabase } from "@/utils/supabase/server";

const resend = new Resend(process.env.RESEND_API_KEY);

const APP_URL =
  process.env.NEXT_PUBLIC_SITE_URL ||
  process.env.NEXT_PUBLIC_APP_URL ||
  "https://fusionapp.com.br";

// DOMÍNIO OFICIAL VERIFICADO NO RESEND: fusionapp.com.br
const FROM_EMAIL =
  process.env.RESEND_FROM_EMAIL ||
  "Fusion Clinic <nao-responda@fusionapp.com.br>";

const FALLBACK_ADMIN_EMAIL =
  process.env.ADMIN_NOTIFICATION_EMAIL || "tecnologia@fusionapp.com.br";

// Usa Service Role Key se disponível; caso contrário, usa a sessão autenticada do servidor (evita bloqueio de RLS na Vercel)
async function getDbClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (serviceKey && serviceKey.trim().length > 20) {
    return createSupabaseClient(url, serviceKey.trim(), {
      auth: { persistSession: false },
    });
  }

  return await createServerSupabase();
}

// Dispara lista de e-mails de forma segura (usa Batch API do Resend para não cair no limite de 2 req/s)
async function dispatchEmailsSafely(emailPayloads: any[]) {
  if (!emailPayloads || emailPayloads.length === 0) {
    return { success: false, error: "Nenhum destinatário encontrado." };
  }

  try {
    if (emailPayloads.length === 1) {
      const { data, error } = await resend.emails.send(emailPayloads[0]);
      if (error) {
        console.error("[Resend Error Single]:", error);
        return { success: false, error: error.message };
      }
      return { success: true, data };
    }

    const { data, error } = await resend.batch.send(emailPayloads);
    if (error) {
      console.error("[Resend Error Batch]:", error);
      // Fallback sequencial caso batch falhe
      const errors: string[] = [];
      for (const payload of emailPayloads) {
        const res = await resend.emails.send(payload);
        if (res.error) {
          console.error("[Resend Error Item]:", res.error);
          errors.push(res.error.message);
        }
      }
      return {
        success: errors.length < emailPayloads.length,
        error: errors.join(" | "),
      };
    }

    return { success: true, data };
  } catch (err: any) {
    console.error("[Resend Exception]:", err);
    return { success: false, error: err.message };
  }
}

// ============================================================================
// FORMATADORES COM TRAVA DE FUSO HORÁRIO (AMERICA/FORTALEZA - UTC-3)
// Garante que 16:00 nunca vire 19:00 ou 08:00 no servidor da Vercel
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

function formatBrazilDateLong(isoString: string): string {
  const date = new Date(isoString);
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
    month: "long",
    year: "numeric",
    weekday: "long",
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

function formatBRL(value: number): string {
  return Number(value || 0).toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

// ============================================================================
// TEMPLATE PADRÃO FUSION (Para Avisos, Anfitrião, Admin, Cancelamento e Gift)
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
        <img src="${APP_URL}/logo-fusion-orange.png" alt="Fusion Clinic" width="170" style="max-width: 170px; height: auto;" />
      </div>
      <div style="width: 100%; max-width: 640px; margin: 0 auto; background-color: #FFFFFF; padding: 28px 24px; border-radius: 24px; border: 1px solid #EAEAEA; box-shadow: 0 8px 28px rgba(0, 0, 0, 0.04);">
        <div style="margin-bottom: 20px; border-bottom: 1px solid #F1F1F4; padding-bottom: 14px;">
          ${
            badgeText
              ? `<span style="display: inline-block; background-color: #FFF4EE; color: #BF4B24; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">${badgeText}</span>`
              : ""
          }
          <h1 style="font-weight: 800; color: #464E5F; font-size: 22px; margin: 0; letter-spacing: -0.02em;">${title}</h1>
        </div>
        <div style="font-size: 14px; line-height: 1.6; color: #464E5F;">
          ${bodyHtml}
        </div>
      </div>
      <div style="text-align: center; padding-top: 20px; font-size: 12px; color: #A1A5B7;">
        <strong>Fusion Clinic</strong> • Plataforma Inteligente de Locação de Consultórios<br/>
        Natal, RN • Este é um e-mail automático do sistema.
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
      <div style="background:#FAF7F5;border-left:4px solid #BF4B24;padding:14px 18px;border-radius:8px;margin:20px 0;">
        <p style="margin:0;font-weight:700;color:#0F172A;">Como começar:</p>
        <ul style="margin:8px 0 0 0;padding-left:18px;color:#475569;">
          <li>Adquira pacotes de horas com tarifas reduzidas na sua Carteira Digital (Fusion Pass+);</li>
          <li>Escolha a sala ideal (Basic, VIP ou Premium) e reserve em segundos;</li>
          <li>Ao chegar na clínica, encoste o celular na Tag NFC ou leia o QR Code na porta da sala para fazer seu Check-in e Check-out.</li>
        </ul>
      </div>
      <div style="text-align: center; margin-top: 24px;">
        <a href="${APP_URL}/dashboard" style="display: inline-block; background-color: #BF4B24; color: #FFFFFF; font-weight: 800; font-size: 14px; text-decoration: none; padding: 12px 24px; border-radius: 12px;">Acessar Painel Fusion</a>
      </div>
      `,
    );

    return await dispatchEmailsSafely([
      {
        from: FROM_EMAIL,
        to: [toEmail],
        subject: "Bem-vindo(a) à Fusion Clinic! Sua conta está ativa",
        html,
      },
    ]);
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
    if (!process.env.RESEND_API_KEY || !bookingId) {
      return { success: false, error: "RESEND_API_KEY ou bookingId ausente." };
    }

    const supabase = await getDbClient();

    const { data: mainBooking, error: bErr } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();

    if (bErr || !mainBooking) {
      console.error("[Email] Reserva não localizada no banco:", bookingId, bErr);
      return { success: false, error: "Reserva não localizada no banco." };
    }

    // Agrupa múltiplos horários reservados juntos (via PIX/Cartão, Carteira ou Manual Admin)
    let batchBookings: any[] = [mainBooking];

    if (mainBooking.asaas_payment_id) {
      const { data: samePaymentBookings } = await supabase
        .from("bookings")
        .select("*")
        .eq("asaas_payment_id", mainBooking.asaas_payment_id)
        .neq("status", "cancelled")
        .order("start_time", { ascending: true });

      if (samePaymentBookings && samePaymentBookings.length > 0) {
        batchBookings = samePaymentBookings;
      }
    } else if (mainBooking.created_at) {
      const createdMs = new Date(mainBooking.created_at).getTime();
      const minWindow = new Date(createdMs - 20 * 1000).toISOString();
      const maxWindow = new Date(createdMs + 20 * 1000).toISOString();

      const { data: siblingBookings } = await supabase
        .from("bookings")
        .select("*")
        .eq("user_id", mainBooking.user_id)
        .eq("room_id", mainBooking.room_id)
        .neq("status", "cancelled")
        .gte("created_at", minWindow)
        .lte("created_at", maxWindow)
        .order("start_time", { ascending: true });

      if (siblingBookings && siblingBookings.length > 0) {
        batchBookings = siblingBookings;
      }
    }

    batchBookings.sort(
      (a, b) =>
        new Date(a.start_time).getTime() - new Date(b.start_time).getTime(),
    );

    const firstSlot = batchBookings[0];
    const lastSlot = batchBookings[batchBookings.length - 1];
    const totalSlotsCount = batchBookings.length;

    const [roomRes, specialistRes, adminsRes] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("id", mainBooking.room_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", mainBooking.user_id)
        .maybeSingle(),
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
        .maybeSingle();
      hostProfile = hData;
    }

    let specialistEmail = specialist?.email || null;
    if (!specialistEmail && mainBooking.user_id) {
      try {
        const { data: authUser } = await (
          supabase as any
        ).auth.admin.getUserById(mainBooking.user_id);
        specialistEmail = authUser?.user?.email || null;
      } catch {}
    }

    let hostEmail = hostProfile?.email || null;
    if (!hostEmail && room?.host_id) {
      try {
        const { data: authHost } = await (
          supabase as any
        ).auth.admin.getUserById(room.host_id);
        hostEmail = authHost?.user?.email || null;
      } catch {}
    }

    const adminEmails = Array.from(
      new Set([
        ...(adminsRes.data || []).map((a: any) => a.email).filter(Boolean),
        FALLBACK_ADMIN_EMAIL,
      ]),
    );

    // Datas e Horários no Fuso Horário de Natal/Fortaleza (UTC-3)
    const entryDateFormatted = formatBrazilDate(firstSlot.start_time);
    const entryTimeFormatted = formatBrazilTime(firstSlot.start_time);
    const exitDateFormatted = formatBrazilDate(lastSlot.end_time);
    const exitTimeFormatted = formatBrazilTime(lastSlot.end_time);
    const fullDateLong = formatBrazilDateLong(firstSlot.start_time);

    let address: any = room?.address_details || {};
    if (typeof address === "string") {
      try {
        address = JSON.parse(address);
      } catch {
        address = {};
      }
    }

    const hourlyRateFallback = Number(address?.pricing?.hourly || 45);
    const totalBrlValue = batchBookings.reduce((acc, b) => {
      if (b.agreed_value_brl && Number(b.agreed_value_brl) > 0) {
        return acc + Number(b.agreed_value_brl);
      }
      const c = Number(b.total_cost || 1);
      return acc + (c < 10 ? c * hourlyRateFallback : c);
    }, 0);

    const isPaidWithCredits = String(
      mainBooking.booking_origin || "",
    ).startsWith("wallet_");

    const streetLine = [
      address.street || "Endereço da Unidade",
      address.number ? `nº ${address.number}` : "",
      address.complement ? `- ${address.complement}` : "",
    ]
      .filter(Boolean)
      .join(", ");

    const neighborhoodLine = address.neighborhood || "Lagoa Nova";
    const cityStateLine = `${address.city || "Natal"} - ${address.state || "RN"}${address.cep ? `, CEP ${address.cep}` : ""}`;

    const roomPhotoUrl =
      room?.image_url && String(room.image_url).startsWith("http")
        ? room.image_url
        : `${APP_URL}${room?.image_url || "/images/room-consultorio.jpg"}`;

    const roomName = room?.name || "Consultório Fusion";
    const clinicName =
      address.clinic_name || hostProfile?.full_name || "Fusion Clinic";
    const specialistName = specialist?.full_name || "Doutor(a)";
    const specialistSpecialty = specialist?.specialty || "Saúde";
    const codeShort = `#${String(mainBooking.id).slice(0, 8).toUpperCase()}`;

    const individualSlotsHtml =
      totalSlotsCount > 1
        ? batchBookings
            .map(
              (b) =>
                `${formatBrazilDate(b.start_time)} das ${formatBrazilTime(b.start_time)} às ${formatBrazilTime(b.end_time)}`,
            )
            .join(" • ")
        : null;

    const emailPayloads: any[] = [];

    // ------------------------------------------------------------------------
    // E-MAIL 1: PARA O PROFISSIONAL (NO SEU LAYOUT DE RESERVA DE SALA)
    // ------------------------------------------------------------------------
    if (specialistEmail) {
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
      body {
        background-color: #FAF7F4;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
        color: #464E5F;
        padding: 24px 12px;
      }
      .section {
        width: 100%;
        max-width: 780px;
        margin: 0 auto;
      }
      .card {
        background-color: #FFFFFF;
        padding: 28px 24px;
        border-radius: 24px;
        border: 1px solid #EAEAEA;
        box-shadow: 0 8px 28px rgba(0, 0, 0, 0.04);
      }
      .room-image {
        width: 100%;
        height: 242px;
        object-fit: cover;
        border-radius: 24px;
        margin: 14px 0 20px 0;
        display: block;
      }
      .info-table {
        width: 100%;
        border-collapse: collapse;
        margin-top: 8px;
        margin-bottom: 20px;
      }
      .info-table td {
        vertical-align: top;
        padding: 8px 10px 8px 0;
      }
      .label-th {
        color: #B5B5C3;
        font-size: 12px;
        font-weight: 700;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        margin-bottom: 4px;
      }
      .value-td {
        color: #464E5F;
        font-size: 15px;
        font-weight: 700;
      }
      @media only screen and (max-width: 580px) {
        .info-table, .info-table tbody, .info-table tr, .info-table td {
          display: block !important;
          width: 100% !important;
        }
        .info-table td {
          padding: 8px 0 !important;
          border-bottom: 1px solid #F3F4F6;
        }
      }
    </style>
  </head>
  <body>
    <div style="text-align: center; margin-bottom: 18px;">
      <img
        alt="Fusion Clinic"
        src="${APP_URL}/logo-fusion-orange.png"
        width="175"
        style="max-width: 175px; height: auto;"
      />
    </div>

    <section class="section card">
      <div>
        <span style="display: inline-block; background-color: #ECFDF5; color: #047857; font-size: 11px; font-weight: 800; padding: 4px 10px; border-radius: 999px; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 8px;">
          ✓ Reserva Confirmada • ${codeShort}
        </span>
        <h1 style="font-weight: 800; color: #464E5F; font-size: 24px; letter-spacing: -0.02em;">
          RESERVA DE SALA
        </h1>
        <p style="font-size: 14px; color: #7E8299; margin-top: 4px;">
          Olá, <strong>${specialistName}</strong>! Seu consultório está reservado e preparado para o seu atendimento.
        </p>
      </div>

      <div>
        <img
          class="room-image"
          src="${roomPhotoUrl}"
          alt="${roomName}"
          width="100%"
          height="242"
        />
      </div>

      <table class="info-table" role="presentation">
        <tr>
          <td width="34%">
            <p class="label-th">SALA</p>
            <p class="value-td">${roomName}</p>
            ${
              room?.specialty
                ? `<p style="font-size: 12px; color: #7E8299; margin-top: 2px;">${room.specialty}</p>`
                : ""
            }
          </td>
          <td width="33%">
            <p class="label-th">DATA DE ENTRADA</p>
            <p class="value-td" style="color: #181C32;">
              ${entryDateFormatted} às ${entryTimeFormatted}
            </p>
          </td>
          <td width="33%">
            <p class="label-th">DATA DE SAÍDA</p>
            <p class="value-td" style="color: #BF4B24;">
              ${exitDateFormatted} às ${exitTimeFormatted}
            </p>
          </td>
        </tr>
      </table>

      ${
        individualSlotsHtml
          ? `<div style="background-color: #FAF7F4; border: 1px solid #E5E7EB; border-radius: 12px; padding: 10px 14px; margin-bottom: 18px; font-size: 12px; color: #464E5F;">
               <strong>Horários reservados (${totalSlotsCount}h):</strong> ${individualSlotsHtml}
             </div>`
          : ""
      }

      <!-- EXPLICAÇÃO DOS 50 MINUTOS -->
      <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 16px; padding: 16px; margin-bottom: 18px;">
        <p style="font-size: 13px; font-weight: 800; color: #92400E; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">
          ⏱ Importante: Por que a reserva tem 50 minutos por hora? (${entryTimeFormatted} às ${exitTimeFormatted})
        </p>
        <p style="font-size: 13px; color: #78350F; line-height: 1.55;">
          Na Fusion Clinic, cada hora reservada compreende <strong>50 minutos de consulta efetiva</strong>. Os <strong>10 minutos finais</strong> são reservados para a saída tranquila do paciente, organização do espaço e transição sem atrasos para o próximo profissional que atenderá no horário seguinte.
        </p>
      </div>

      <!-- CHECK-IN, CHECK-OUT E DESLIGAR AR/LUZES -->
      <div style="background-color: #F8FAFC; border: 1px solid #E2E8F0; border-radius: 16px; padding: 18px; margin-bottom: 22px;">
        <h3 style="font-size: 14px; font-weight: 800; color: #1E293B; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 12px;">
          📲 Check-in, Check-out e Cuidados ao Sair da Sala
        </h3>

        <p style="font-size: 13px; color: #334155; line-height: 1.55; margin-bottom: 10px;">
          <strong>1. Check-in Obrigatório ao Chegar:</strong><br />
          Ao chegar ao consultório, encoste seu celular na <strong>Tag NFC da porta</strong> (ou leia o QR Code da placa) para registrar sua entrada.
        </p>

        <p style="font-size: 13px; color: #334155; line-height: 1.55; margin-bottom: 10px;">
          <strong>2. Ao Finalizar seu Atendimento (Antes de Sair):</strong><br />
          ❄️ <strong>Desligue o ar-condicionado</strong>;<br />
          💡 <strong>Apague todas as luzes</strong> da sala;<br />
          ✨ Deixe o consultório organizado para o próximo profissional.
        </p>

        <p style="font-size: 13px; color: #334155; line-height: 1.55;">
          <strong>3. Check-out Obrigatório ao Sair (Até as ${exitTimeFormatted}):</strong><br />
          Ao sair da sala, <strong>encoste novamente o celular na Tag NFC / QR Code da porta</strong> (ou clique em <em>Registrar Saída</em> no app) para encerrar sua sessão no horário e evitar cobrança automática de hora extra.
        </p>
      </div>

      <!-- DETALHES DO AGENDAMENTO -->
      <div style="border-top: 1px solid #F1F1F4; padding-top: 18px; margin-bottom: 18px;">
        <h2 style="font-size: 15px; font-weight: 800; color: #464E5F; margin-bottom: 12px;">
          DETALHES DO AGENDAMENTO
        </h2>
        <div style="margin-bottom: 12px;">
          <p style="font-size: 12px; font-weight: 700; color: #B5B5C3; text-transform: uppercase;">Clínica</p>
          <p style="font-size: 15px; font-weight: 700; color: #464E5F; margin-top: 2px;">${clinicName} — ${roomName}</p>
        </div>
        <div>
          <p style="font-size: 12px; font-weight: 700; color: #B5B5C3; text-transform: uppercase;">Endereço</p>
          <p style="font-size: 14px; color: #464E5F; margin-top: 2px; line-height: 1.5;">
            ${streetLine}<br />
            ${neighborhoodLine}<br />
            ${cityStateLine}
          </p>
        </div>
      </div>

      <!-- VALOR TOTAL -->
      <div style="border-top: 1px solid #F1F1F4; padding-top: 16px;">
        <h3 style="font-size: 12px; font-weight: 800; color: #B5B5C3; text-transform: uppercase;">VALOR TOTAL</h3>
        <h2 style="font-size: 26px; font-weight: 900; color: #464E5F; margin-top: 2px;">
          R$ ${formatBRL(totalBrlValue)}
        </h2>
        <p style="color: #B5B5C3; font-size: 12px; margin-top: 2px;">
          ${isPaidWithCredits ? `Pago com Créditos Fusion Pass+ (${totalSlotsCount}h) • Taxas inclusas` : "Taxas inclusas"}
        </p>
      </div>

      <div style="margin-top: 24px; text-align: center;">
        <a
          href="${APP_URL}/dashboard#bookings"
          style="display: inline-block; background-color: #BF4B24; color: #FFFFFF; font-weight: 800; font-size: 14px; text-decoration: none; padding: 14px 28px; border-radius: 14px;"
        >
          Ver Minha Reserva no Aplicativo
        </a>
      </div>
    </section>
  </body>
</html>`.trim(),
      });
    }

    // ------------------------------------------------------------------------
    // E-MAIL 2: PARA O ANFITRIÃO / CLÍNICA
    // ------------------------------------------------------------------------
    if (hostEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [hostEmail],
        subject: `📅 Nova Reserva na ${roomName} — ${specialistName} (${entryDateFormatted} ${entryTimeFormatted})`,
        html: buildFusionEmailLayout(
          `Nova Reserva na ${roomName}`,
          "Notificação do Anfitrião",
          `
          <p>Olá, <strong>${clinicName}</strong>!</p>
          <p>Um profissional acabou de agendar um horário no seu espaço pela plataforma Fusion Clinic:</p>
          <div style="background:#FAF7F5;border:1px solid #FED7AA;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>👨‍⚕️ Profissional:</strong> ${specialistName} (${specialistSpecialty})</p>
            <p style="margin:4px 0;"><strong>🚪 Sala:</strong> ${roomName}</p>
            <p style="margin:4px 0;"><strong>📅 Entrada:</strong> ${entryDateFormatted} às ${entryTimeFormatted}</p>
            <p style="margin:4px 0;"><strong>⏰ Saída:</strong> ${exitDateFormatted} às ${exitTimeFormatted} (${totalSlotsCount}h)</p>
            <p style="margin:4px 0;"><strong>🔑 Reserva:</strong> ${codeShort}</p>
          </div>
          <p style="font-size:13px;color:#475569;">Certifique-se de que a sala esteja preparada para receber o especialista no horário agendado.</p>
          `,
        ),
      });
    }

    // ------------------------------------------------------------------------
    // E-MAIL 3: PARA OS ADMINISTRADORES
    // ------------------------------------------------------------------------
    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `🔔 [Admin Reserva] ${specialistName} reservou ${roomName} (${entryDateFormatted} ${entryTimeFormatted})`,
        html: buildFusionEmailLayout(
          "Nova Reserva Registrada na Plataforma",
          "Torre de Controle Admin",
          `
          <p>Uma nova reserva foi registrada no sistema:</p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:18px;margin:20px 0;">
            <p style="margin:4px 0;"><strong>Profissional:</strong> ${specialistName} (${specialistSpecialty})</p>
            <p style="margin:4px 0;"><strong>E-mail do Profissional:</strong> ${specialistEmail || "Não informado"}</p>
            <p style="margin:4px 0;"><strong>Sala / Clínica:</strong> ${roomName} • ${clinicName}</p>
            <p style="margin:4px 0;"><strong>Data:</strong> ${fullDateLong}</p>
            <p style="margin:4px 0;"><strong>Horário (UTC-3):</strong> ${entryTimeFormatted} às ${exitTimeFormatted} (${totalSlotsCount}h)</p>
            <p style="margin:4px 0;"><strong>Valor Total:</strong> R$ ${formatBRL(totalBrlValue)}</p>
            <p style="margin:4px 0;"><strong>ID Reserva:</strong> ${codeShort}</p>
          </div>
          `,
        ),
      });
    }

    const dispatchResult = await dispatchEmailsSafely(emailPayloads);
    return {
      ...dispatchResult,
      sentCount: emailPayloads.length,
    };
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
    const supabase = await getDbClient();

    const [userProfileRes, adminsRes] = await Promise.all([
      supabase
        .from("profiles")
        .select("*")
        .eq("id", params.userId)
        .maybeSingle(),
      supabase.from("profiles").select("email, full_name").eq("role", "admin"),
    ]);

    const specialist = userProfileRes.data;
    let specialistEmail = specialist?.email;
    if (!specialistEmail && params.userId) {
      try {
        const { data: authUser } = await (
          supabase as any
        ).auth.admin.getUserById(params.userId);
        specialistEmail = authUser?.user?.email;
      } catch {}
    }

    const adminEmails = Array.from(
      new Set([
        ...(adminsRes.data || []).map((a: any) => a.email).filter(Boolean),
        FALLBACK_ADMIN_EMAIL,
      ]),
    );

    const specialistName = specialist?.full_name || "Especialista";
    const tierUpper = String(params.tier || "START").toUpperCase();
    const nowIso = new Date().toISOString();
    const nowFormatted = `${formatBrazilDate(nowIso)} às ${formatBrazilTime(nowIso)}`;
    const desc =
      params.description ||
      (params.creditsAdded
        ? `Pacote de ${params.creditsAdded} hora(s) (${tierUpper})`
        : "Pagamento confirmado na Fusion Clinic");

    const emailPayloads: any[] = [];

    if (specialistEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [specialistEmail],
        subject: `💳 Pagamento Confirmado: R$ ${formatBRL(params.amountBrl)} — Fusion Clinic`,
        html: buildFusionEmailLayout(
          "Pagamento Confirmado com Sucesso!",
          "Recibo Financeiro",
          `
          <p>Olá, <strong>${specialistName}</strong>!</p>
          <p>Recebemos a confirmação do seu pagamento na Fusion Clinic.</p>
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

    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `💰 [Pagamento Recebido] R$ ${formatBRL(params.amountBrl)} de ${specialistName}`,
        html: buildFusionEmailLayout(
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

    if (params.hostId) {
      const { data: hostProf } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", params.hostId)
        .maybeSingle();
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
            <p>O pagamento referente à reserva de <strong>${specialistName}</strong> no valor de <strong>R$ ${formatBRL(params.amountBrl)}</strong> foi confirmado.</p>
            `,
          ),
        });
      }
    }

    return await dispatchEmailsSafely(emailPayloads);
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
    const supabase = await getDbClient();

    const { data: booking } = await supabase
      .from("bookings")
      .select("*")
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return { success: false };

    const [roomRes, specialistRes, adminsRes] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("id", booking.room_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", booking.user_id)
        .maybeSingle(),
      supabase.from("profiles").select("email, full_name").eq("role", "admin"),
    ]);

    const room = roomRes.data;
    const specialist = specialistRes.data;
    const formattedDate = formatBrazilDate(booking.start_time);
    const formattedHour = formatBrazilTime(booking.start_time);

    let specialistEmail = specialist?.email;
    if (!specialistEmail && booking.user_id) {
      try {
        const { data: authUser } = await (
          supabase as any
        ).auth.admin.getUserById(booking.user_id);
        specialistEmail = authUser?.user?.email;
      } catch {}
    }

    let hostEmail: string | null = null;
    let clinicName = "Fusion Clinic";
    if (room?.host_id) {
      const { data: hData } = await supabase
        .from("profiles")
        .select("email, full_name")
        .eq("id", room.host_id)
        .maybeSingle();
      hostEmail = hData?.email || null;
      clinicName = hData?.full_name || clinicName;

      if (!hostEmail) {
        try {
          const { data: authHost } = await (
            supabase as any
          ).auth.admin.getUserById(room.host_id);
          hostEmail = authHost?.user?.email || null;
        } catch {}
      }
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
          <p>Seus créditos/valores foram processados conforme a política de cancelamento da plataforma.</p>
          `,
        ),
      });
    }

    if (hostEmail) {
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
        subject: `❌ [Admin Cancelamento] ${specialistName} — ${roomName} (${formattedDate} ${formattedHour})`,
        html: buildFusionEmailLayout(
          "Reserva Cancelada no Sistema",
          "Torre de Controle Admin",
          `
          <p>A reserva abaixo foi cancelada e o horário foi liberado na agenda:</p>
          <p><strong>Profissional:</strong> ${specialistName}</p>
          <p><strong>Sala:</strong> ${roomName} (${clinicName})</p>
          <p><strong>Data/Hora:</strong> ${formattedDate} às ${formattedHour}</p>
          `,
        ),
      });
    }

    return await dispatchEmailsSafely(emailPayloads);
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
    if (!process.env.RESEND_API_KEY || !receiverEmail) {
      return { success: false };
    }
    const tierUpper = String(tier).toUpperCase();
    return await dispatchEmailsSafely([
      {
        from: FROM_EMAIL,
        to: [receiverEmail],
        subject: `🎁 Você ganhou ${amount} hora(s) na Fusion Clinic!`,
        html: buildFusionEmailLayout(
          "Você recebeu um Fusion Gift!",
          "Créditos Recebidos",
          `
          <p>Olá, <strong>${receiverName || "Doutor(a)"}</strong>!</p>
          <p>Temos uma ótima notícia! <strong>${senderName}</strong> acabou de te enviar <strong>${amount} hora(s)</strong> da categoria <strong>${tierUpper}</strong> para você utilizar em nossos consultórios.</p>
          <p>Acesse seu painel agora mesmo para conferir sua Carteira Digital e agendar seus atendimentos.</p>
          `,
        ),
      },
    ]);
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
    if (!process.env.RESEND_API_KEY || !userEmail) {
      return { success: false };
    }
    return await dispatchEmailsSafely([
      {
        from: FROM_EMAIL,
        to: [userEmail],
        subject: "Sua assinatura foi cancelada — Fusion Clinic",
        html: buildFusionEmailLayout(
          "Assinatura Cancelada",
          "Aviso Financeiro",
          `
          <p>Olá, <strong>${userName}</strong>.</p>
          <p>Confirmamos o cancelamento do seu plano de horas recorrente (Fusion Pass+).</p>
          <p>Nenhuma nova cobrança será realizada. Suas horas já creditadas continuam válidas até o prazo de vencimento na sua carteira.</p>
          <p>Se quiser voltar a ter os melhores descontos, basta assinar novamente a qualquer momento!</p>
          `,
        ),
      },
    ]);
  } catch (err: any) {
    return { success: false, error: err.message };
  }
}