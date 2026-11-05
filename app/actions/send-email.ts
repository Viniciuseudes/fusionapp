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

function formatBrazilUberTimestamp(isoString: string): string {
  const date = new Date(isoString);
  const day = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    day: "2-digit",
  }).format(date);
  const monthShort = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    month: "short",
  }).format(date);
  const year = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    year: "numeric",
  }).format(date);
  const time = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);

  return `${day} de ${monthShort} de ${year} , ${time}`;
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

function getBrazilPeriodGreeting(isoString: string): string {
  const date = new Date(isoString);
  const hourStr = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    hour12: false,
  }).format(date);
  const hour = parseInt(hourStr, 10);
  if (hour >= 5 && hour < 12) return "desta manhã";
  if (hour >= 12 && hour < 18) return "desta tarde";
  return "desta noite";
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

      <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 16px; padding: 16px; margin-bottom: 18px;">
        <p style="font-size: 13px; font-weight: 800; color: #92400E; text-transform: uppercase; letter-spacing: 0.04em; margin-bottom: 6px;">
          ⏱ Importante: Por que a reserva tem 50 minutos por hora? (${entryTimeFormatted} às ${exitTimeFormatted})
        </p>
        <p style="font-size: 13px; color: #78350F; line-height: 1.55;">
          Na Fusion Clinic, cada hora reservada compreende <strong>50 minutos de consulta efetiva</strong>. Os <strong>10 minutos finais</strong> são reservados para a saída tranquila do paciente, organização do espaço e transição sem atrasos para o próximo profissional que atenderá no horário seguinte.
        </p>
      </div>

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
export async function sendBookingCancellationEmails(
  bookingIds: string | string[],
  options?: {
    wasRefunded?: boolean;
    refundedCredits?: number;
    cancelledBy?: "specialist" | "admin" | "host";
  },
) {
  try {
    if (!process.env.RESEND_API_KEY || !bookingIds) {
      return { success: false, error: "Credenciais ou ID da reserva ausentes." };
    }

    const idsArray = Array.isArray(bookingIds)
      ? bookingIds.filter(Boolean)
      : [bookingIds].filter(Boolean);

    if (idsArray.length === 0) return { success: false };

    const supabase = await getDbClient();

    const { data: bookingsList, error: bErr } = await supabase
      .from("bookings")
      .select("*")
      .in("id", idsArray)
      .order("start_time", { ascending: true });

    if (bErr || !bookingsList || bookingsList.length === 0) {
      console.error("[Email Cancelamento] Reserva não localizada:", bErr);
      return { success: false, error: "Reserva não localizada." };
    }

    const firstBooking = bookingsList[0];
    const lastBooking = bookingsList[bookingsList.length - 1];
    const totalSlotsCount = bookingsList.length;

    const [roomRes, specialistRes, adminsRes] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("id", firstBooking.room_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", firstBooking.user_id)
        .maybeSingle(),
      supabase.from("profiles").select("email, full_name").eq("role", "admin"),
    ]);

    const room = roomRes.data;
    const specialist = specialistRes.data;

    const formattedDate = formatBrazilDate(firstBooking.start_time);
    const startHourFormatted = formatBrazilTime(firstBooking.start_time);
    const endHourFormatted = formatBrazilTime(lastBooking.end_time);
    const periodLabel = `${startHourFormatted} às ${endHourFormatted}`;

    let specialistEmail = specialist?.email || null;
    if (!specialistEmail && firstBooking.user_id) {
      try {
        const { data: authUser } = await (
          supabase as any
        ).auth.admin.getUserById(firstBooking.user_id);
        specialistEmail = authUser?.user?.email || null;
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
    const codeShort = `#${String(firstBooking.id).slice(0, 8).toUpperCase()}`;

    const refundNoteHtml =
      options?.wasRefunded === true
        ? `<div style="background:#ECFDF5;border:1px solid #A7F3D0;border-radius:12px;padding:14px;margin:16px 0;color:#065F46;font-size:13px;">
             <strong>✓ Estorno Realizado:</strong> Como o cancelamento ocorreu com mais de 24 horas de antecedência, seus créditos/valores foram integralmente devolvidos à sua Carteira Digital (válidos por 30 dias).
           </div>`
        : options?.wasRefunded === false
          ? `<div style="background:#FEF2F2;border:1px solid #FECACA;border-radius:12px;padding:14px;margin:16px 0;color:#991B1B;font-size:13px;">
               <strong>Política de Cancelamento (< 24h):</strong> Como o cancelamento foi realizado com menos de 24 horas para o início do atendimento, esta reserva não é elegível para estorno.
             </div>`
          : `<p style="font-size:13px;color:#64748B;">Seus créditos/valores foram processados conforme a política de cancelamento da plataforma.</p>`;

    const emailPayloads: any[] = [];

    // 1. E-MAIL PARA O ESPECIALISTA
    if (specialistEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [specialistEmail],
        subject: `❌ Reserva Cancelada: ${roomName} (${formattedDate} às ${startHourFormatted})`,
        html: buildFusionEmailLayout(
          "Confirmação de Cancelamento",
          `Cancelada • ${codeShort}`,
          `
          <p>Olá, <strong>${specialistName}</strong>.</p>
          <p>Confirmamos que a sua reserva abaixo foi cancelada com sucesso:</p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:16px;margin:18px 0;">
            <p style="margin:4px 0;"><strong>🚪 Consultório:</strong> ${roomName} (${clinicName})</p>
            <p style="margin:4px 0;"><strong>📅 Data:</strong> ${formattedDate}</p>
            <p style="margin:4px 0;"><strong>⏰ Horário:</strong> ${periodLabel} (${totalSlotsCount}h)</p>
            <p style="margin:4px 0;"><strong>🔑 Código:</strong> ${codeShort}</p>
          </div>
          ${refundNoteHtml}
          <div style="text-align: center; margin-top: 22px;">
            <a href="${APP_URL}/dashboard#search" style="display: inline-block; background-color: #BF4B24; color: #FFFFFF; font-weight: 800; font-size: 13px; text-decoration: none; padding: 12px 24px; border-radius: 12px;">Agendar Novo Horário</a>
          </div>
          `,
        ),
      });
    }

    // 2. E-MAIL PARA O ANFITRIÃO / CLÍNICA
    if (hostEmail) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: [hostEmail],
        subject: `❌ Reserva Cancelada na ${roomName} — ${specialistName} (${formattedDate})`,
        html: buildFusionEmailLayout(
          "Aviso de Cancelamento de Reserva",
          "Agenda Liberada",
          `
          <p>Olá, <strong>${clinicName}</strong>.</p>
          <p>O(a) profissional <strong>${specialistName}</strong> cancelou a reserva abaixo:</p>
          <div style="background:#FAF7F5;border:1px solid #FED7AA;border-radius:14px;padding:16px;margin:18px 0;">
            <p style="margin:4px 0;"><strong>👨‍⚕️ Profissional:</strong> ${specialistName}</p>
            <p style="margin:4px 0;"><strong>🚪 Sala:</strong> ${roomName}</p>
            <p style="margin:4px 0;"><strong>📅 Data:</strong> ${formattedDate}</p>
            <p style="margin:4px 0;"><strong>⏰ Horário Liberado:</strong> ${periodLabel} (${totalSlotsCount}h)</p>
          </div>
          <p style="font-size:13px;color:#475569;">Este horário já foi liberado automaticamente na agenda para novas locações.</p>
          `,
        ),
      });
    }

    // 3. E-MAIL PARA OS ADMINISTRADORES
    if (adminEmails.length > 0) {
      emailPayloads.push({
        from: FROM_EMAIL,
        to: adminEmails,
        subject: `❌ [Admin Cancelamento] ${specialistName} cancelou ${roomName} (${formattedDate} ${startHourFormatted})`,
        html: buildFusionEmailLayout(
          "Reserva Cancelada pelo Usuário",
          "Torre de Controle Admin",
          `
          <p>Uma reserva foi cancelada e o horário foi liberado na agenda:</p>
          <div style="background:#F8FAFC;border:1px solid #E2E8F0;border-radius:14px;padding:16px;margin:18px 0;">
            <p style="margin:4px 0;"><strong>Profissional:</strong> ${specialistName} (${specialistEmail || "Sem e-mail"})</p>
            <p style="margin:4px 0;"><strong>Sala / Clínica:</strong> ${roomName} • ${clinicName}</p>
            <p style="margin:4px 0;"><strong>Data e Horário:</strong> ${formattedDate}, das ${periodLabel} (${totalSlotsCount}h)</p>
            <p style="margin:4px 0;"><strong>Estorno de Créditos:</strong> ${options?.wasRefunded ? "SIM (Cancelado >= 24h antes)" : "NÃO (< 24h ou pagamento externo)"}</p>
            <p style="margin:4px 0;"><strong>Código:</strong> ${codeShort}</p>
          </div>
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

// ============================================================================
// 7. RECIBO PÓS-CHECK-OUT ESTILO UBER (COM IDENTIDADE FUSION CLINIC)
// Disparado automaticamente quando o profissional faz Check-out na sala
// ============================================================================
export async function sendCheckoutReceiptEmail(
  bookingIds: string | string[],
) {
  try {
    if (!process.env.RESEND_API_KEY || !bookingIds) {
      return { success: false, error: "Dados de reserva ausentes." };
    }

    const idsArray = Array.isArray(bookingIds)
      ? bookingIds.filter(Boolean)
      : [bookingIds].filter(Boolean);

    if (idsArray.length === 0) return { success: false };

    const supabase = await getDbClient();

    const { data: bookingsList, error: bErr } = await supabase
      .from("bookings")
      .select("*")
      .in("id", idsArray)
      .order("start_time", { ascending: true });

    if (bErr || !bookingsList || bookingsList.length === 0) {
      console.error("[Email Checkout Receipt] Reserva não encontrada:", bErr);
      return { success: false, error: "Reserva não localizada." };
    }

    const firstBooking = bookingsList[0];
    const lastBooking = bookingsList[bookingsList.length - 1];
    const totalHoursCount = bookingsList.length;

    const [roomRes, specialistRes] = await Promise.all([
      supabase
        .from("rooms")
        .select("*")
        .eq("id", firstBooking.room_id)
        .maybeSingle(),
      supabase
        .from("profiles")
        .select("*")
        .eq("id", firstBooking.user_id)
        .maybeSingle(),
    ]);

    const room = roomRes.data;
    const specialist = specialistRes.data;

    let specialistEmail = specialist?.email || null;
    if (!specialistEmail && firstBooking.user_id) {
      try {
        const { data: authUser } = await (
          supabase as any
        ).auth.admin.getUserById(firstBooking.user_id);
        specialistEmail = authUser?.user?.email || null;
      } catch {}
    }

    if (!specialistEmail) {
      return { success: false, error: "Profissional sem e-mail cadastrado." };
    }

    const fullName = specialist?.full_name || "Doutor(a)";
    const firstName = fullName.trim().split(" ")[0] || "Doutor(a)";
    const roomName = room?.name || "Consultório Fusion";
    const roomTier = String(room?.tier || "start").toUpperCase();
    const roomTierLabel =
      roomTier === "MASTER"
        ? "Premium"
        : roomTier === "VIP"
          ? "VIP"
          : "Basic";

    let address: any = room?.address_details || {};
    if (typeof address === "string") {
      try {
        address = JSON.parse(address);
      } catch {
        address = {};
      }
    }

    const streetAddress = [
      address.street || "Unidade Fusion Clinic",
      address.number ? `nº ${address.number}` : "",
      address.neighborhood ? `- ${address.neighborhood}` : "",
      address.city ? `, ${address.city}/${address.state || "RN"}` : "",
    ]
      .filter(Boolean)
      .join(" ");

    const hourlyRateFallback = Number(address?.pricing?.hourly || 45);

    const isCreditPayment =
      !firstBooking.asaas_payment_id &&
      (String(firstBooking.booking_origin || "").startsWith("wallet_") ||
        Number(firstBooking.total_cost || 0) < 10);

    const totalCreditsUsed = bookingsList.reduce(
      (acc, b) => acc + Math.max(1, Number(b.total_cost || 1)),
      0,
    );

    const totalBrlAmount = bookingsList.reduce((acc, b) => {
      if (b.agreed_value_brl && Number(b.agreed_value_brl) > 0) {
        return acc + Number(b.agreed_value_brl);
      }
      const c = Number(b.total_cost || 1);
      return acc + (c < 10 ? c * hourlyRateFallback : c);
    }, 0);

    const penaltyAmountBrl = bookingsList.reduce(
      (acc, b) => acc + Number(b.penalty_amount || 0),
      0,
    );

    const displayTotalPrimary = isCreditPayment
      ? `${totalCreditsUsed} CR`
      : `R$ ${formatBRL(totalBrlAmount + penaltyAmountBrl)}`;

    const paymentMethodBadge = isCreditPayment
      ? `Créditos Fusion Pass+ (${roomTierLabel})`
      : "PIX / Cartão (Asaas)";

    const paymentMethodIconText = isCreditPayment ? "PASS+" : "PIX";

    const checkoutIso =
      lastBooking.checkout_time || new Date().toISOString();
    const checkinIso =
      firstBooking.checkin_time || firstBooking.start_time;

    const headerTimestamp = formatBrazilUberTimestamp(checkoutIso);
    const periodGreeting = getBrazilPeriodGreeting(checkoutIso);

    const scheduledStartFormatted = formatBrazilTime(firstBooking.start_time);
    const scheduledEndFormatted = formatBrazilTime(lastBooking.end_time);
    const scheduledDateFormatted = formatBrazilDate(firstBooking.start_time);

    const effectiveCheckinFormatted = formatBrazilTime(checkinIso);
    const effectiveCheckoutFormatted = formatBrazilTime(checkoutIso);

    const receiptCode = `#${String(firstBooking.id).slice(0, 8).toUpperCase()}`;

    const html = `
<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Recibo do seu atendimento - Fusion Clinic</title>
  </head>
  <body style="margin: 0; padding: 0; background-color: #F3F2EF; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #141210; -webkit-font-smoothing: antialiased;">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background-color: #F3F2EF; padding: 20px 10px;">
      <tr>
        <td align="center">
          <!-- CONTAINER PRINCIPAL ESTILO UBER COM IDENTIDADE FUSION -->
          <table width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width: 560px; background-color: #FFFFFF; border-radius: 24px; overflow: hidden; box-shadow: 0 10px 35px rgba(20, 18, 16, 0.06); border: 1px solid #E7E5E4;">
            
            <!-- BARRA DE DESTAQUE LARANJA FUSION -->
            <tr>
              <td style="height: 6px; background: linear-gradient(90deg, #B83B10 0%, #DE5D2E 100%); font-size: 0; line-height: 0;"> </td>
            </tr>

            <!-- 1. HERO HEADER (ESTILO UBER: LOGO + DATA + FRASE GRANDE) -->
            <tr>
              <td style="background-color: #FAF7F4; padding: 36px 32px 32px 32px; border-bottom: 1px solid #EFECE6;">
                <div style="margin-bottom: 26px;">
                  <img
                    src="${APP_URL}/logo-fusion-orange.png"
                    alt="Fusion Clinic"
                    width="150"
                    style="display: block; max-width: 150px; height: auto;"
                  />
                </div>

                <p style="margin: 0 0 12px 0; font-size: 13px; font-weight: 600; color: #78716C;">
                  ${headerTimestamp}
                </p>

                <h1 style="margin: 0 0 16px 0; font-size: 32px; line-height: 1.15; font-weight: 900; color: #141210; letter-spacing: -0.03em;">
                  ${firstName}, este é o <span style="background-color: #FDE68A; padding: 0 6px; border-radius: 6px;">recibo</span> do seu atendimento
                </h1>

                <p style="margin: 0; font-size: 15px; line-height: 1.5; color: #57534E; font-weight: 500;">
                  Esperamos que você e seu paciente tenham tido uma excelente experiência ${periodGreeting}.
                </p>
              </td>
            </tr>

            <!-- 2. BLOCO TOTAL + BREAKDOWN -->
            <tr>
              <td style="padding: 32px 32px 20px 32px;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="padding-bottom: 18px; border-bottom: 2px solid #F5F5F4;">
                  <tr>
                    <td align="left" style="font-size: 26px; font-weight: 900; color: #141210; letter-spacing: -0.02em;">
                      Total
                    </td>
                    <td align="right" style="font-size: 28px; font-weight: 900; color: #141210; letter-spacing: -0.02em;">
                      ${displayTotalPrimary}
                    </td>
                  </tr>
                </table>

                <!-- LINHAS DO RESUMO FINANCEIRO -->
                <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top: 16px;">
                  <tr>
                    <td align="left" style="padding: 8px 0; font-size: 14px; color: #57534E; font-weight: 500;">
                      Locação • ${roomName} (${totalHoursCount}h clínica)
                    </td>
                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #141210; font-weight: 700;">
                      ${displayTotalPrimary}
                    </td>
                  </tr>

                  ${
                    isCreditPayment
                      ? `
                  <tr>
                    <td align="left" style="padding: 6px 0; font-size: 13px; color: #78716C;">
                      Valor equivalente da locação em R$
                    </td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; color: #78716C; font-weight: 600;">
                      R$ ${formatBRL(totalBrlAmount)}
                    </td>
                  </tr>
                  `
                      : ""
                  }

                  ${
                    penaltyAmountBrl > 0
                      ? `
                  <tr>
                    <td align="left" style="padding: 6px 0; font-size: 13px; color: #DC2626; font-weight: 600;">
                      Hora extra / Tolerância excedida
                    </td>
                    <td align="right" style="padding: 6px 0; font-size: 13px; color: #DC2626; font-weight: 700;">
                      R$ ${formatBRL(penaltyAmountBrl)}
                    </td>
                  </tr>
                  `
                      : ""
                  }

                  <tr>
                    <td align="left" style="padding: 8px 0; font-size: 14px; color: #57534E; font-weight: 500;">
                      Taxa de serviço e recepção Fusion
                    </td>
                    <td align="right" style="padding: 8px 0; font-size: 14px; color: #059669; font-weight: 700;">
                      Inclusa (R$ 0,00)
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- 3. SEÇÃO PAGAMENTOS -->
            <tr>
              <td style="padding: 12px 32px 24px 32px;">
                <div style="border-top: 1px solid #F5F5F4; padding-top: 22px;">
                  <h2 style="margin: 0 0 16px 0; font-size: 20px; font-weight: 900; color: #141210; letter-spacing: -0.02em;">
                    Pagamentos
                  </h2>

                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="46" valign="middle">
                        <div style="width: 38px; height: 28px; border-radius: 6px; background-color: #FAF7F4; border: 1px solid #E7E5E4; text-align: center; line-height: 28px; font-size: 10px; font-weight: 900; color: #BF4B24;">
                          ${paymentMethodIconText}
                        </div>
                      </td>
                      <td valign="middle" style="font-size: 15px; font-weight: 700; color: #141210;">
                        ${paymentMethodBadge}
                        <span style="display: block; font-size: 12px; font-weight: 500; color: #78716C; margin-top: 2px;">
                          Comprovante ${receiptCode} • ${scheduledDateFormatted}
                        </span>
                      </td>
                      <td align="right" valign="middle" style="font-size: 16px; font-weight: 900; color: #141210;">
                        ${displayTotalPrimary}
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>

            <!-- 4. LINHA DO TEMPO DO ATENDIMENTO (CHECK-IN E CHECK-OUT NA PORTA) -->
            <tr>
              <td style="padding: 0 32px 28px 32px;">
                <div style="background-color: #FAF7F4; border: 1px solid #EFECE6; border-radius: 18px; padding: 20px;">
                  <p style="margin: 0 0 14px 0; font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.08em; color: #BF4B24;">
                    Resumo de Uso da Sala (${scheduledStartFormatted} às ${scheduledEndFormatted})
                  </p>

                  <table width="100%" cellpadding="0" cellspacing="0" border="0">
                    <tr>
                      <td width="24" valign="top" style="padding-top: 3px;">
                        <div style="width: 10px; height: 10px; border-radius: 50%; background-color: #141210;"></div>
                        <div style="width: 2px; height: 34px; background-color: #D6D3D1; margin-left: 4px;"></div>
                        <div style="width: 10px; height: 10px; border-radius: 50%; background-color: #BF4B24;"></div>
                      </td>
                      <td valign="top">
                        <div style="margin-bottom: 16px;">
                          <p style="margin: 0; font-size: 14px; font-weight: 800; color: #141210;">
                            Check-in registrado às ${effectiveCheckinFormatted}
                          </p>
                          <p style="margin: 2px 0 0 0; font-size: 12px; color: #78716C;">
                            ${roomName} • Sala liberada via NFC/QR Code
                          </p>
                        </div>

                        <div>
                          <p style="margin: 0; font-size: 14px; font-weight: 800; color: #047857;">
                            Check-out finalizado às ${effectiveCheckoutFormatted}
                          </p>
                          <p style="margin: 2px 0 0 0; font-size: 12px; color: #78716C;">
                            ${streetAddress}
                          </p>
                        </div>
                      </td>
                    </tr>
                  </table>
                </div>
              </td>
            </tr>

            <!-- 5. CARD DE AVALIAÇÃO (ESTILO UBER) -->
            <tr>
              <td style="padding: 0 24px 16px 24px;">
                <div style="border: 1px solid #E7E5E4; border-radius: 20px; padding: 20px; text-align: center;">
                  <p style="margin: 0 0 12px 0; font-size: 14px; font-weight: 700; color: #141210;">
                    Como foi seu atendimento no ${roomName}?
                  </p>
                  <a
                    href="${APP_URL}/dashboard#bookings"
                    style="display: block; width: 100%; box-sizing: border-box; background-color: #F5F5F4; color: #141210; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 18px; border-radius: 12px;"
                  >
                    ⭐ Avaliar consultório ou reservar novamente
                  </a>
                </div>
              </td>
            </tr>

            <!-- 6. CARD "PRECISA DE AJUDA?" (IDÊNTICO AO CONCEITO DO UBER) -->
            <tr>
              <td style="padding: 0 24px 28px 24px;">
                <div style="border: 1px solid #E7E5E4; border-radius: 20px; padding: 24px;">
                  <h3 style="margin: 0 0 8px 0; font-size: 18px; font-weight: 900; color: #141210;">
                    Precisa de ajuda?
                  </h3>
                  <p style="margin: 0 0 18px 0; font-size: 14px; line-height: 1.5; color: #57534E;">
                    Nossa equipe de suporte está à disposição para ajudar com qualquer dúvida sobre sua locação ou créditos.
                  </p>
                  <a
                    href="${APP_URL}/dashboard#chat"
                    style="display: block; width: 100%; box-sizing: border-box; background-color: #F5F5F4; color: #141210; font-size: 14px; font-weight: 800; text-decoration: none; padding: 14px 18px; border-radius: 12px; text-align: center;"
                  >
                    🎧 Fale com a equipe de suporte
                  </a>
                </div>
              </td>
            </tr>

            <!-- 7. RODAPÉ ESCURO INSTITUCIONAL FUSION (ESTILO UBER BLACK) -->
            <tr>
              <td style="background-color: #0C0A09; padding: 32px; color: #FFFFFF;">
                <table width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding: 14px 0; border-bottom: 1px solid #292524;">
                      <a href="${APP_URL}/dashboard#profile" style="color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 600;">
                        Minha conta
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 0; border-bottom: 1px solid #292524;">
                      <a href="${APP_URL}/dashboard#bookings" style="color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 600;">
                        Histórico de Reservas e Recibos
                      </a>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 14px 0; border-bottom: 1px solid #292524;">
                      <a href="${APP_URL}/termos" style="color: #FFFFFF; text-decoration: none; font-size: 15px; font-weight: 600;">
                        Termos e Condições de Uso
                      </a>
                    </td>
                  </tr>
                </table>

                <div style="margin-top: 26px; font-size: 12px; line-height: 1.6; color: #A8A29E;">
                  <strong style="color: #F5F5F4;">Fusion Clinic Soluções em Saúde Ltda</strong><br />
                  Natal, Rio Grande do Norte - Brasil<br />
                  CNPJ: 49.351.127/0001-44
                </div>

                <div style="margin-top: 22px; font-size: 24px; font-weight: 900; letter-spacing: -0.03em; color: #FFFFFF;">
                  Fusion<span style="color: #BF4B24;">.</span>
                </div>
              </td>
            </tr>

          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`.trim();

    return await dispatchEmailsSafely([
      {
        from: FROM_EMAIL,
        to: [specialistEmail],
        subject: `Recibo do seu atendimento na ${roomName} — Fusion Clinic`,
        html,
      },
    ]);
  } catch (err: any) {
    console.error("[Email Checkout Receipt] Erro:", err);
    return { success: false, error: err.message };
  }
}