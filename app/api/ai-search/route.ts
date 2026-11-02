// app/api/ai-search/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export type RentalType = "hora" | "turno" | "fixo";
export type TierFilter = "all" | "start" | "vip" | "master";

export interface ConversationTurn {
  role: "user" | "assistant";
  content: string;
}

export interface ComparisonBlock {
  title: string;
  subtitle?: string;
  bullets: string[];
}

export interface AISearchExtraction {
  intentType:
    | "room_search"
    | "comparison_question"
    | "financial_simulation"
    | "profile_guidance";
  shouldApplyFilters: boolean;
  city: string;
  neighborhood: string | null;
  category:
    | "Todas as Salas"
    | "Psicologia"
    | "Nutrição & Clínica"
    | "Odontologia"
    | "Estética"
    | "Multiuso";
  dateISO: string | null; // YYYY-MM-DD
  requestedHour: number | null; // 8 a 21
  requestedDurationHours: number; // ex: 1, 2, 3, 4 horas
  shift: "manha" | "tarde" | "noite" | "";
  modality: RentalType;
  tier: TierFilter;
  headline: string;
  comparisonBlocks: ComparisonBlock[];
  recommendationSummary: string;
  closingQuestion: string;
  followUpSuggestions: string[];
  suggestedCta:
    | "none"
    | "open_pass_modal"
    | "switch_to_turno"
    | "complete_profile";
}

export interface RoomAvailabilityMatch {
  roomId: string;
  roomName: string;
  specialty: string;
  tier: "start" | "vip" | "master";
  neighborhood: string;
  city: string;
  hourlyPrice: number;
  passHourlyPrice: number;
  score: number;
  exactSlotAvailable: boolean;
  consecutiveSlotsAvailable: boolean;
  requestedSlotLabel: string | null;
  availableSlots: string[];
  matchReason: string;
  aiPitch: string;
}

const PASS_RATES_BY_TIER: Record<"start" | "vip" | "master", number> = {
  start: 26,
  vip: 34,
  master: 50,
};

function formatHourSlot(h: number): string {
  return `${String(h).padStart(2, "0")}:00`;
}

function parseHourNumberFromSlot(raw: string): number | null {
  if (!raw || typeof raw !== "string") return null;
  const parts = raw.split("-");
  const cleanStart = parts[0].trim().replace("h", ":");
  const hourNumber = parseInt(cleanStart.split(":")[0], 10);
  if (isNaN(hourNumber) || hourNumber < 0 || hourNumber > 23) return null;
  return hourNumber;
}

export function mapProfileSpecialtyToCategory(
  rawSpecialty: string | null | undefined,
): AISearchExtraction["category"] {
  if (!rawSpecialty) return "Todas as Salas";
  const s = rawSpecialty.toLowerCase();

  if (
    s.includes("psico") ||
    s.includes("terapia") ||
    s.includes("psican") ||
    s.includes("neuropsico")
  ) {
    return "Psicologia";
  }
  if (
    s.includes("nutri") ||
    s.includes("médic") ||
    s.includes("medic") ||
    s.includes("endocrino") ||
    s.includes("pediatr") ||
    s.includes("cardio") ||
    s.includes("psiquiatr") ||
    s.includes("clínic") ||
    s.includes("clinic") ||
    s.includes("dermato")
  ) {
    return "Nutrição & Clínica";
  }
  if (s.includes("odonto") || s.includes("dentist") || s.includes("ortodont")) {
    return "Odontologia";
  }
  if (
    s.includes("estétic") ||
    s.includes("estetic") ||
    s.includes("harmoniza") ||
    s.includes("biomédic") ||
    s.includes("biomedic") ||
    s.includes("cosmet")
  ) {
    return "Estética";
  }
  if (s.includes("fono") || s.includes("fisio") || s.includes("multiuso")) {
    return "Multiuso";
  }
  return "Todas as Salas";
}

function getBrazilNow(): {
  todayISO: string;
  tomorrowISO: string;
  currentHour: number;
  weekdayName: string;
  nowMs: number;
} {
  const now = new Date();
  const brFormatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Fortaleza",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const hourFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    hour: "2-digit",
    hour12: false,
  });
  const weekdayFormatter = new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Fortaleza",
    weekday: "long",
  });

  const todayISO = brFormatter.format(now);
  const tomorrowDate = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const tomorrowISO = brFormatter.format(tomorrowDate);
  const currentHour = parseInt(hourFormatter.format(now), 10) || 12;
  const weekdayName = weekdayFormatter.format(now);

  return {
    todayISO,
    tomorrowISO,
    currentHour,
    weekdayName,
    nowMs: now.getTime(),
  };
}

// Pré-detecta a data solicitada na frase do especialista antes mesmo de chamar o Gemini
function preDetectTargetDateISO(
  rawQuery: string,
  todayISO: string,
  tomorrowISO: string,
): string {
  const q = rawQuery.toLowerCase();
  if (q.includes("depois de amanhã") || q.includes("depois de amanha")) {
    const base = new Date(`${todayISO}T12:00:00-03:00`);
    const d2 = new Date(base.getTime() + 2 * 24 * 60 * 60 * 1000);
    return d2.toISOString().slice(0, 10);
  }
  if (q.includes("amanhã") || q.includes("amanha")) {
    return tomorrowISO;
  }
  // Formato DD/MM
  const dmMatch = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (dmMatch) {
    const day = String(dmMatch[1]).padStart(2, "0");
    const month = String(dmMatch[2]).padStart(2, "0");
    const year = dmMatch[3] || todayISO.slice(0, 4);
    return `${year}-${month}-${day}`;
  }
  return todayISO;
}

// ============================================================================
// MOTOR DETERMINÍSTICO DE DISPONIBILIDADE REAL (ESPELHO EXATO DO ROOM-DETAIL)
// Verifica: blocked_dates + availability (weekConfig + exceptions) +
//           room_contracts exclusivos + bookings (com timeout de pending_payment)
// ============================================================================
function getVerifiedRoomFreeHoursForDate(
  room: any,
  targetDateISO: string,
  roomBookings: any[],
  exclusiveLockedRoomIds: Set<string>,
  nowMs: number,
): number[] {
  // 1. Contrato exclusivo ativo sem sublocação
  if (exclusiveLockedRoomIds.has(room.id)) {
    return [];
  }

  // 2. Data bloqueada em blocked_dates
  if (
    Array.isArray(room.blocked_dates) &&
    room.blocked_dates.includes(targetDateISO)
  ) {
    return [];
  }

  // 3. Leitura obrigatória de room.availability
  let avail = room.availability;
  if (typeof avail === "string") {
    try {
      avail = JSON.parse(avail);
    } catch {
      avail = null;
    }
  }
  if (!avail) {
    return [];
  }

  const weekConfig = Array.isArray(avail.weekConfig) ? avail.weekConfig : [];
  const exceptions = Array.isArray(avail.exceptions) ? avail.exceptions : [];

  const partialBlockedHours = new Set<number>();
  let extraHoursOverride: number[] | null = null;

  // 4. Exceções na data selecionada (bloqueio total, bloqueio parcial ou horário extra)
  if (exceptions.length > 0) {
    const exception = exceptions.find((e: any) => {
      if (!e?.date) return false;
      const rawDateStr = String(e.date);
      if (rawDateStr.slice(0, 10) === targetDateISO) return true;
      try {
        const brDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Fortaleza",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date(rawDateStr));
        return brDate === targetDateISO;
      } catch {
        return false;
      }
    });

    if (exception) {
      if (exception.type === "block" && exception.isFullDay) {
        return [];
      }
      if (exception.type === "block" && !exception.isFullDay) {
        const hrs = Array.isArray(exception.hours) ? exception.hours : [];
        hrs.forEach((h: string) => {
          const parsedH = parseHourNumberFromSlot(h);
          if (parsedH !== null) partialBlockedHours.add(parsedH);
        });
      }
      if (exception.type === "extra") {
        const hrs = Array.isArray(exception.hours) ? exception.hours : [];
        extraHoursOverride = hrs
          .map((h: string) => parseHourNumberFromSlot(h))
          .filter((n: number | null): n is number => n !== null);
      }
    }
  }

  // 5. Configuração do dia da semana (weekConfig)
  let baseHours: number[] = [];
  if (extraHoursOverride !== null) {
    baseHours = extraHoursOverride;
  } else {
    const dayOfWeek = new Date(`${targetDateISO}T12:00:00-03:00`).getUTCDay();
    const configForDay = weekConfig.find(
      (c: any) => Number(c?.day) === dayOfWeek,
    );
    if (!configForDay || !configForDay.enabled) {
      return [];
    }

    if (configForDay.rentalType === "hourly") {
      const hours: string[] = Array.isArray(configForDay.availableHours)
        ? configForDay.availableHours
        : [];
      baseHours = hours
        .map((h: string) => parseHourNumberFromSlot(h))
        .filter((n: number | null): n is number => n !== null);
    } else {
      const shifts: string[] = Array.isArray(configForDay.selectedShifts)
        ? configForDay.selectedShifts
        : [];
      if (shifts.includes("morning")) baseHours.push(8, 9, 10, 11);
      if (shifts.includes("afternoon")) baseHours.push(13, 14, 15, 16, 17);
      if (shifts.includes("night")) baseHours.push(18, 19, 20, 21);
    }
  }

  baseHours = Array.from(new Set(baseHours))
    .filter((h) => !partialBlockedHours.has(h))
    .sort((a, b) => a - b);

  if (baseHours.length === 0) {
    return [];
  }

  // 6. Remove horários que já passaram (se for hoje) e horários já reservados em `bookings`
  const freeHours = baseHours.filter((h) => {
    const hh = String(h).padStart(2, "0");
    const slotStart = new Date(
      `${targetDateISO}T${hh}:00:00-03:00`,
    ).getTime();
    const slotEnd = new Date(
      `${targetDateISO}T${hh}:50:00-03:00`,
    ).getTime();

    // Horário já passou
    if (slotStart < nowMs) {
      return false;
    }

    // Verifica colisão com reservas ativas ou em checkout
    const isBooked = roomBookings.some((b: any) => {
      if (b.status === "cancelled" || b.status === "rejected") return false;

      if (
        (b.status === "pending_payment" || b.status === "pending") &&
        b.created_at
      ) {
        const lockTime = new Date(b.created_at).getTime();
        if (!b.asaas_payment_id && nowMs - lockTime > 6 * 60 * 1000) {
          return false;
        }
        if (b.asaas_payment_id && nowMs - lockTime > 30 * 60 * 1000) {
          return false;
        }
      }

      const bStart = new Date(b.start_time).getTime();
      const rawBEnd = b.end_time ? new Date(b.end_time).getTime() : 0;
      const bEnd = rawBEnd > bStart ? rawBEnd : bStart + 50 * 60 * 1000;

      return slotStart < bEnd && slotEnd > bStart;
    });

    return !isBooked;
  });

  return freeHours;
}

function filterHoursByShift(
  hours: number[],
  shift: "manha" | "tarde" | "noite" | "",
): number[] {
  if (shift === "manha") return hours.filter((h) => h >= 8 && h < 12);
  if (shift === "tarde") return hours.filter((h) => h >= 12 && h < 18);
  if (shift === "noite") return hours.filter((h) => h >= 18 && h <= 21);
  return hours;
}

// ============================================================================
// CONTINGÊNCIA INTELIGENTE LOCAL
// ============================================================================
function fallbackConsultativeIntent(
  rawQuery: string,
  availableCities: string[],
  todayISO: string,
  tomorrowISO: string,
  walletBalance: number,
  userSpecialty: string | null,
  isProfileComplete: boolean,
  missingProfileFields: string[],
): AISearchExtraction {
  const q = rawQuery.toLowerCase();
  const mappedProfileCategory = mapProfileSpecialtyToCategory(userSpecialty);

  if (
    q.includes("cadastro") ||
    q.includes("perfil") ||
    q.includes("documento") ||
    q.includes("cpf") ||
    q.includes("como reserv") ||
    q.includes("fechadura")
  ) {
    return {
      intentType: "profile_guidance",
      shouldApplyFilters: false,
      city: "Qualquer lugar",
      neighborhood: null,
      category: mappedProfileCategory,
      dateISO: null,
      requestedHour: null,
      requestedDurationHours: 1,
      shift: "",
      modality: "hora",
      tier: "all",
      headline: isProfileComplete
        ? `Seu perfil profissional (${userSpecialty || "Especialista"}) já está 100% completo e verificado para reservas instantâneas!`
        : `Para liberar suas reservas com check-in digital na porta, falta apenas concluir ${missingProfileFields.length} item(ns) no seu perfil:`,
      comparisonBlocks: [
        {
          title: "1. Especialidade Clínica",
          subtitle: userSpecialty
            ? `Preenchido: ${userSpecialty}`
            : "Pendente no seu perfil",
          bullets: [
            "Permite que o Concierge IA recomende consultórios com a estrutura exata da sua área (divã, maca, cadeira odontológica ou bioimpedância).",
          ],
        },
        {
          title: "2. CPF e Data de Nascimento",
          subtitle: missingProfileFields.includes("CPF")
            ? "Pendente no seu perfil"
            : "Verificado",
          bullets: [
            "Obrigatório para emissão automática de cobrança PIX/Cartão no Asaas e geração da sua senha individual na fechadura eletrônica.",
          ],
        },
        {
          title: "3. Endereço Profissional",
          subtitle: missingProfileFields.includes("Endereço")
            ? "Pendente no seu perfil"
            : "Verificado",
          bullets: [
            "Necessário para emissão do comprovante de locação e segurança de acesso às unidades Fusion Clinic.",
          ],
        },
      ],
      recommendationSummary: isProfileComplete
        ? "Você já pode escolher qualquer horário livre abaixo e confirmar sua reserva em 1 clique."
        : `Toque no botão ao lado para preencher (${missingProfileFields.join(", ")}) em menos de 1 minuto.`,
      closingQuestion:
        "Deseja que eu já filtre os consultórios ideais para a sua especialidade?",
      followUpSuggestions: [
        `Mostrar consultórios para ${userSpecialty || "minha especialidade"} hoje`,
        "Vale mais a pena Hora Avulsa ou Fusion Pass+?",
        "Diferença entre Sala Basic, VIP e Premium?",
      ],
      suggestedCta: isProfileComplete ? "none" : "complete_profile",
    };
  }

  const isDifferenceOrComparison =
    q.includes("diferença") ||
    q.includes("diferenca") ||
    q.includes("qual escolher") ||
    q.includes("vale mais a pena") ||
    q.includes("compensa") ||
    q.includes("como funciona") ||
    q.includes("basic e vip") ||
    q.includes("vip e premium") ||
    q.includes("avulso ou pass") ||
    q.includes("hora ou turno");

  if (
    isDifferenceOrComparison &&
    (q.includes("basic") ||
      q.includes("vip") ||
      q.includes("premium") ||
      q.includes("padrão"))
  ) {
    return {
      intentType: "comparison_question",
      shouldApplyFilters: false,
      city: "Qualquer lugar",
      neighborhood: null,
      category: mappedProfileCategory,
      dateISO: null,
      requestedHour: null,
      requestedDurationHours: 1,
      shift: "",
      modality: "hora",
      tier: "all",
      headline: `Para atendimentos de ${userSpecialty || "Saúde"}, a diferença entre os padrões Basic, VIP e Premium está no posicionamento de imagem e na flexibilidade dos créditos:`,
      comparisonBlocks: [
        {
          title: "Salas Basic",
          subtitle: "Foco em margem líquida por consulta",
          bullets: [
            "Valor avulso médio: R$ 45/h (ou a partir de R$ 26/h no Pass+)",
            "Estrutura clínica completa: climatização, Wi-Fi rápido, recepção e limpeza",
            "Ideal para atendimentos recorrentes com o menor custo operacional",
          ],
        },
        {
          title: "Salas VIP",
          subtitle: "Equilíbrio entre sofisticação e custo-benefício",
          bullets: [
            "Valor avulso médio: R$ 55/h (ou a partir de R$ 34/h no Pass+)",
            "Mobiliário e arquitetura diferenciados que elevam o valor percebido da consulta",
            "Créditos Pass+ VIP liberam tanto salas VIP quanto salas Basic",
          ],
        },
        {
          title: "Salas Premium",
          subtitle: "Posicionamento executivo High-Ticket",
          bullets: [
            "Valor avulso médio: R$ 80/h (ou a partir de R$ 50/h no Pass+)",
            "Arquitetura assinada, máximo conforto acústico e localização nobre",
            "Passe livre total: créditos Premium liberam 100% das salas (Premium, VIP e Basic)",
          ],
        },
      ],
      recommendationSummary: !isProfileComplete
        ? `Dica: antes de reservar, complete seu cadastro (${missingProfileFields.join(", ")}) para liberar seu acesso imediato.`
        : "Comece pelo Basic para maximizar seu lucro líquido inicial, ou escolha VIP/Premium para consultas particulares de maior ticket.",
      closingQuestion:
        "Qual padrão combina mais com o perfil dos seus pacientes atuais?",
      followUpSuggestions: [
        `Ver salas VIP para ${userSpecialty || "minha área"}`,
        "Vale mais a pena Hora Avulsa ou Fusion Pass+?",
        "Como funciona o Turno Fixo semanal?",
      ],
      suggestedCta: !isProfileComplete ? "complete_profile" : "open_pass_modal",
    };
  }

  if (
    isDifferenceOrComparison &&
    (q.includes("pass") ||
      q.includes("assinatura") ||
      q.includes("pacote") ||
      q.includes("turno") ||
      q.includes("avulso") ||
      q.includes("desconto"))
  ) {
    return {
      intentType: "financial_simulation",
      shouldApplyFilters: false,
      city: "Qualquer lugar",
      neighborhood: null,
      category: mappedProfileCategory,
      dateISO: null,
      requestedHour: null,
      requestedDurationHours: 1,
      shift: "",
      modality: "hora",
      tier: "all",
      headline: `Comparei as 3 modalidades na Fusion pensando na sua rotina de ${userSpecialty || "atendimentos"}:`,
      comparisonBlocks: [
        {
          title: "1. Hora Avulsa (50 min)",
          subtitle: "Para até 4 atendimentos no mês",
          bullets: [
            "Custo médio: R$ 45/h a R$ 80/h conforme a sala",
            "Pague apenas quando tiver paciente agendado, sem compromisso mensal",
            "Liberação imediata de senha na fechadura digital",
          ],
        },
        {
          title: "2. Fusion Pass+ (Pacotes de 8h ou 16h)",
          subtitle: "Até 41% de economia (A partir de 2h por semana)",
          bullets: [
            "Derruba o custo da hora para a faixa de R$ 26/h a R$ 50/h",
            "Sem fidelidade: cancele quando quiser pelo painel, sem multa",
            "Validade de 30 dias — se sobrarem horas, você pode doar ou negociar com colegas",
          ],
        },
        {
          title: "3. Turno Fixo ou Sala Mensal",
          subtitle: "Para agenda cheia em dia fixo da semana",
          bullets: [
            "Garante a mesma sala toda semana (Manhã, Tarde ou Noite)",
            "Na modalidade Mensal Exclusiva, você ainda pode sublocar horários vagos como Coanfitrião",
          ],
        },
      ],
      recommendationSummary:
        "Regra prática de bolso: Se você atende 5 horas ou mais no mês, o Fusion Pass+ já se paga e coloca até 41% mais margem no seu bolso.",
      closingQuestion:
        "Quantas horas por semana você planeja atender neste mês?",
      followUpSuggestions: [
        "Atendo cerca de 2h a 4h por semana",
        "Quero simular os pacotes do Fusion Pass+",
        `Ver salas de ${userSpecialty || "atendimento"} livres hoje`,
      ],
      suggestedCta: "open_pass_modal",
    };
  }

  let detectedCity = "Qualquer lugar";
  for (const city of availableCities) {
    if (q.includes(city.toLowerCase())) {
      detectedCity = city;
      break;
    }
  }
  if (detectedCity === "Qualquer lugar" && q.includes("natal")) {
    detectedCity =
      availableCities.find((c) => c.toLowerCase().includes("natal")) || "Natal";
  }

  let category: AISearchExtraction["category"] = "Todas as Salas";
  if (q.includes("psico") || q.includes("terapia") || q.includes("divã")) {
    category = "Psicologia";
  } else if (
    q.includes("nutri") ||
    q.includes("endocrino") ||
    q.includes("bioimped") ||
    q.includes("médic") ||
    q.includes("medic") ||
    q.includes("clínic")
  ) {
    category = "Nutrição & Clínica";
  } else if (q.includes("odonto") || q.includes("dentista")) {
    category = "Odontologia";
  } else if (
    q.includes("estétic") ||
    q.includes("estetic") ||
    q.includes("harmoniza") ||
    q.includes("maca")
  ) {
    category = "Estética";
  } else if (q.includes("multiuso")) {
    category = "Multiuso";
  } else if (mappedProfileCategory !== "Todas as Salas") {
    category = mappedProfileCategory;
  }

  const dateISO = preDetectTargetDateISO(rawQuery, todayISO, tomorrowISO);

  let requestedDurationHours = 1;
  const durationMatch = q.match(
    /(?:por|durante|reservar|preciso de)\s*(\d{1,2})\s*(?:h|hora|horas)\b/i,
  );
  if (durationMatch) {
    const d = parseInt(durationMatch[1], 10);
    if (d >= 2 && d <= 8) requestedDurationHours = d;
  }

  let requestedHour: number | null = null;
  const timeMatch =
    q.match(
      /(?:às|as|a partir das|de)\s*(\d{1,2})\s*(?:h|hora|horas|:00)?/i,
    ) || q.match(/\b(\d{1,2}):00\b/);

  if (timeMatch && !durationMatch) {
    let parsed = parseInt(timeMatch[1], 10);
    if (
      parsed >= 1 &&
      parsed <= 7 &&
      !q.includes("manhã") &&
      !q.includes("manha")
    ) {
      parsed += 12;
    }
    if (parsed >= 8 && parsed <= 21) {
      requestedHour = parsed;
    }
  }

  let shift: AISearchExtraction["shift"] = "";
  if (q.includes("manhã") || q.includes("manha")) shift = "manha";
  else if (q.includes("tarde")) shift = "tarde";
  else if (q.includes("noite")) shift = "noite";
  else if (requestedHour !== null) {
    if (requestedHour < 12) shift = "manha";
    else if (requestedHour < 18) shift = "tarde";
    else shift = "noite";
  }

  let modality: RentalType = "hora";
  if (q.includes("mensal") || q.includes("fixo")) modality = "fixo";
  else if (q.includes("turno")) modality = "turno";

  let tier: TierFilter = "all";
  if (q.includes("premium") || q.includes("master")) tier = "master";
  else if (q.includes("vip")) tier = "vip";
  else if (q.includes("basic") || q.includes("básic")) tier = "start";

  const comparisonBlocks: ComparisonBlock[] = [];
  if (requestedDurationHours >= 3 && walletBalance <= 0) {
    comparisonBlocks.push({
      title: `Dica de Economia para ${requestedDurationHours} horas`,
      subtitle: "Comparativo Hora Avulsa vs. Fusion Pass+ / Turno",
      bullets: [
        `Reservando ${requestedDurationHours}h no avulso, o investimento médio fica entre R$ ${requestedDurationHours * 45} e R$ ${requestedDurationHours * 55}.`,
        `Com o Fusion Pass+, sua hora cai até 41% (a partir de R$ 26/h) e as horas restantes ficam na carteira por 30 dias.`,
        `Se você atende ${requestedDurationHours}h toda semana, o Turno Fixo garante a mesma sala com valor reduzido.`,
      ],
    });
  }

  return {
    intentType: "room_search",
    shouldApplyFilters: true,
    city: detectedCity,
    neighborhood: null,
    category,
    dateISO,
    requestedHour,
    requestedDurationHours,
    shift,
    modality,
    tier,
    headline: `Verifiquei a agenda real das salas para ${
      dateISO === tomorrowISO ? "amanhã" : dateISO === todayISO ? "hoje" : dateISO
    }:`,
    comparisonBlocks,
    recommendationSummary: !isProfileComplete
      ? `Importante: para concluir sua reserva e receber a senha da fechadura digital, finalize seu perfil (${missingProfileFields.join(", ")}).`
      : walletBalance > 0
        ? `Você possui ${walletBalance}h ativas na carteira e pode reservar qualquer horário livre abaixo.`
        : "Toque em um dos horários livres verificados abaixo para abrir a sala já com a agenda marcada.",
    closingQuestion:
      "Gostaria de comparar o valor avulso com o pacote Fusion Pass+ ou consultar outro turno?",
    followUpSuggestions: [
      "Vale mais a pena Hora Avulsa ou Fusion Pass+?",
      "Diferença entre Sala Basic, VIP e Premium?",
      "E se eu precisar de 3 horas seguidas?",
    ],
    suggestedCta: !isProfileComplete
      ? "complete_profile"
      : requestedDurationHours >= 3
        ? "open_pass_modal"
        : "none",
  };
}

// ============================================================================
// MOTOR CONSULTIVO COM GOOGLE GEMINI (ALIMENTADO COM AGENDA REAL VERIFICADA)
// ============================================================================
async function extractConsultativeWithGemini(
  query: string,
  history: ConversationTurn[],
  availableCities: string[],
  availableNeighborhoods: string[],
  verifiedRoomsScheduleSummary: string,
  preDetectedDateISO: string,
  walletBalance: number,
  activeTier: string | null,
  userSpecialty: string | null,
  isProfileComplete: boolean,
  missingProfileFields: string[],
): Promise<AISearchExtraction> {
  const { todayISO, tomorrowISO, weekdayName } = getBrazilNow();
  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    return fallbackConsultativeIntent(
      query,
      availableCities,
      todayISO,
      tomorrowISO,
      walletBalance,
      userSpecialty,
      isProfileComplete,
      missingProfileFields,
    );
  }

  const mappedProfileCategory = mapProfileSpecialtyToCategory(userSpecialty);

  const historyText =
    history.length > 0
      ? history
          .slice(-6)
          .map(
            (h) =>
              `${h.role === "user" ? "Especialista" : "Concierge Fusion"}: ${h.content}`,
          )
          .join("\n")
      : "Início da conversa.";

  const systemPrompt = `
Você é o Concierge Inteligente da Fusion Clinic — assistente consultivo exclusivo para profissionais de saúde cadastrados.

REGRA DE OURO CONTRA ALUCINAÇÃO DE AGENDA (CRÍTICO):
Abaixo está a DISPONIBILIDADE REAL E VERIFICADA no banco de dados para a data ${preDetectedDateISO}.
- NUNCA invente que uma sala está livre se ela estiver listada como "FECHADA / SEM VAGAS" no turno solicitado.
- Se uma sala estiver fechada pela manhã (08h-11h) mas tiver horários à tarde, diga explicitamente que pela manhã ela está fechada/ocupada e informe apenas os horários reais livres.

Contexto Temporal (Fuso America/Fortaleza):
- Hoje é: ${todayISO} (${weekdayName})
- Amanhã é: ${tomorrowISO}
- Data alvo pré-detectada para consulta de agenda: ${preDetectedDateISO}

Perfil do Especialista Logado:
- Especialidade cadastrada no perfil: ${userSpecialty ? `"${userSpecialty}" (Categoria padrão sugerida: "${mappedProfileCategory}")` : "Ainda não informada no perfil"}
- Cadastro completo para reserva instantânea? ${isProfileComplete ? "SIM (100% completo)" : `NÃO — Faltam os campos: ${missingProfileFields.join(", ")}`}
- Saldo atual na carteira Fusion Pass+: ${walletBalance} horas (${activeTier ? `Categoria ${activeTier}` : "Sem assinatura ativa"})

DISPONIBILIDADE REAL DAS SALAS EM ${preDetectedDateISO}:
${verifiedRoomsScheduleSummary}

Diretrizes de Personalização:
1. Se o especialista fizer uma busca por salas/horários, defina shouldApplyFilters = true e preencha shift ("manha", "tarde", "noite" ou "") e requestedHour (se citou hora exata).
2. Se o especialista não especificar a especialidade na frase mas tiver "${userSpecialty || ""}" no perfil, use category = "${mappedProfileCategory}". Unless ele peça explicitamente "todas as salas" ou outra especialidade.
3. Se o cadastro estiver incompleto (isProfileComplete = false), lembre-o em recommendationSummary que faltam (${missingProfileFields.join(", ")}) e defina suggestedCta = "complete_profile".
4. Horários coloquiais: "de 3 horas", "às 3 horas" -> requestedHour = 15. "por 3 horas" ou "3 horas seguidas" -> requestedDurationHours = 3.
`.trim();

  const responseSchema = {
    type: "OBJECT",
    properties: {
      intentType: {
        type: "STRING",
        enum: [
          "room_search",
          "comparison_question",
          "financial_simulation",
          "profile_guidance",
        ],
      },
      shouldApplyFilters: { type: "BOOLEAN" },
      city: { type: "STRING" },
      neighborhood: { type: "STRING", nullable: true },
      category: {
        type: "STRING",
        enum: [
          "Todas as Salas",
          "Psicologia",
          "Nutrição & Clínica",
          "Odontologia",
          "Estética",
          "Multiuso",
        ],
      },
      dateISO: { type: "STRING", nullable: true },
      requestedHour: { type: "INTEGER", nullable: true },
      requestedDurationHours: { type: "INTEGER" },
      shift: {
        type: "STRING",
        enum: ["manha", "tarde", "noite", ""],
      },
      modality: {
        type: "STRING",
        enum: ["hora", "turno", "fixo"],
      },
      tier: {
        type: "STRING",
        enum: ["all", "start", "vip", "master"],
      },
      headline: { type: "STRING" },
      comparisonBlocks: {
        type: "ARRAY",
        items: {
          type: "OBJECT",
          properties: {
            title: { type: "STRING" },
            subtitle: { type: "STRING", nullable: true },
            bullets: {
              type: "ARRAY",
              items: { type: "STRING" },
            },
          },
          required: ["title", "bullets"],
        },
      },
      recommendationSummary: { type: "STRING" },
      closingQuestion: { type: "STRING" },
      followUpSuggestions: {
        type: "ARRAY",
        items: { type: "STRING" },
      },
      suggestedCta: {
        type: "STRING",
        enum: [
          "none",
          "open_pass_modal",
          "switch_to_turno",
          "complete_profile",
        ],
      },
    },
    required: [
      "intentType",
      "shouldApplyFilters",
      "city",
      "category",
      "requestedDurationHours",
      "shift",
      "modality",
      "tier",
      "headline",
      "comparisonBlocks",
      "recommendationSummary",
      "closingQuestion",
      "followUpSuggestions",
      "suggestedCta",
    ],
  };

  try {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [
            {
              role: "user",
              parts: [
                {
                  text: `Histórico recente:\n${historyText}\n\nNova mensagem do especialista: "${query}"`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.1,
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
      },
    );

    if (!res.ok) {
      return fallbackConsultativeIntent(
        query,
        availableCities,
        todayISO,
        tomorrowISO,
        walletBalance,
        userSpecialty,
        isProfileComplete,
        missingProfileFields,
      );
    }

    const data = await res.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return fallbackConsultativeIntent(
        query,
        availableCities,
        todayISO,
        tomorrowISO,
        walletBalance,
        userSpecialty,
        isProfileComplete,
        missingProfileFields,
      );
    }

    const parsed = JSON.parse(rawJson) as AISearchExtraction;

    if (
      parsed.requestedHour !== null &&
      parsed.requestedHour >= 1 &&
      parsed.requestedHour <= 7 &&
      parsed.shift !== "manha"
    ) {
      parsed.requestedHour += 12;
    }

    return parsed;
  } catch {
    return fallbackConsultativeIntent(
      query,
      availableCities,
      todayISO,
      tomorrowISO,
      walletBalance,
      userSpecialty,
      isProfileComplete,
      missingProfileFields,
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const query = String(body?.query || "").trim();
    const history: ConversationTurn[] = Array.isArray(body?.history)
      ? body.history
      : [];
    const walletBalance = Number(body?.walletBalance || 0);
    const activeTier = body?.activeTier ? String(body.activeTier) : null;
    const userSpecialty = body?.userSpecialty
      ? String(body.userSpecialty).trim()
      : null;
    const isProfileComplete = Boolean(body?.isProfileComplete ?? true);
    const missingProfileFields: string[] = Array.isArray(
      body?.missingProfileFields,
    )
      ? body.missingProfileFields
      : [];

    if (!query) {
      return NextResponse.json(
        { error: "Digite ou fale sua dúvida ou o que você procura." },
        { status: 400 },
      );
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey =
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // 1. Busca todas as salas ativas INCLUINDO `availability` e `blocked_dates`
    const { data: roomsData } = await supabase
      .from("rooms")
      .select(
        "id, name, specialty, tier, modalities, address_details, availability, blocked_dates, is_active, is_paused",
      )
      .eq("is_active", true)
      .eq("is_paused", false);

    const rooms = roomsData || [];

    const availableCities = Array.from(
      new Set(
        rooms
          .map((r: any) => r.address_details?.city)
          .filter((c): c is string => Boolean(c && typeof c === "string")),
      ),
    );

    const availableNeighborhoods = Array.from(
      new Set(
        rooms
          .map((r: any) => r.address_details?.neighborhood)
          .filter((n): n is string => Boolean(n && typeof n === "string")),
      ),
    );

    const { todayISO, tomorrowISO, nowMs } = getBrazilNow();
    const preDetectedDateISO = preDetectTargetDateISO(
      query,
      todayISO,
      tomorrowISO,
    );

    // 2. Busca reservas e contratos ativos com janela de segurança para fuso UTC-3
    const baseDateObj = new Date(`${preDetectedDateISO}T12:00:00-03:00`);
    const windowStartISO = new Date(
      baseDateObj.getTime() - 36 * 60 * 60 * 1000,
    ).toISOString();
    const windowEndISO = new Date(
      baseDateObj.getTime() + 36 * 60 * 60 * 1000,
    ).toISOString();

    const [bookingsRes, contractsRes] = await Promise.all([
      supabase
        .from("bookings")
        .select(
          "id, room_id, start_time, end_time, status, created_at, asaas_payment_id",
        )
        .gte("start_time", windowStartISO)
        .lte("start_time", windowEndISO)
        .neq("status", "cancelled"),
      supabase
        .from("room_contracts")
        .select("room_id, allow_sublease, start_date, end_date, status")
        .eq("status", "active")
        .lte("start_date", preDetectedDateISO)
        .gte("end_date", preDetectedDateISO),
    ]);

    const allWindowBookings = bookingsRes.data || [];
    const exclusiveLockedRoomIds = new Set<string>(
      (contractsRes.data || [])
        .filter((c: any) => c.allow_sublease === false && c.room_id)
        .map((c: any) => c.room_id),
    );

    const bookingsByRoom = new Map<string, any[]>();
    allWindowBookings.forEach((b: any) => {
      if (!b.room_id) return;
      if (!bookingsByRoom.has(b.room_id)) {
        bookingsByRoom.set(b.room_id, []);
      }
      bookingsByRoom.get(b.room_id)!.push(b);
    });

    // 3. Monta o resumo de disponibilidade 100% REAL de cada sala para enviar ao Gemini
    const verifiedRoomsScheduleSummary = rooms
      .map((r: any) => {
        const freeHrs = getVerifiedRoomFreeHoursForDate(
          r,
          preDetectedDateISO,
          bookingsByRoom.get(r.id) || [],
          exclusiveLockedRoomIds,
          nowMs,
        );
        const morningHrs = freeHrs
          .filter((h) => h >= 8 && h < 12)
          .map(formatHourSlot);
        const afternoonHrs = freeHrs
          .filter((h) => h >= 12 && h < 18)
          .map(formatHourSlot);
        const nightHrs = freeHrs
          .filter((h) => h >= 18 && h <= 21)
          .map(formatHourSlot);

        const hrPrice = r.address_details?.pricing?.hourly || 45;
        const neigh = r.address_details?.neighborhood || "Centro";
        const ct = r.address_details?.city || "Natal";

        const scheduleDesc =
          freeHrs.length === 0
            ? "FECHADA / SEM NENHUM HORÁRIO LIVRE NESTA DATA"
            : `Manhã: ${morningHrs.length > 0 ? morningHrs.join(", ") : "FECHADO/OCUPADO"} | Tarde: ${afternoonHrs.length > 0 ? afternoonHrs.join(", ") : "FECHADO/OCUPADO"} | Noite: ${nightHrs.length > 0 ? nightHrs.join(", ") : "FECHADO/OCUPADO"}`;

        return `- ${r.name} (${r.specialty || "Multiuso"}, Padrão: ${r.tier || "start"}, Local: ${neigh}/${ct}, R$ ${hrPrice}/h) -> [${scheduleDesc}]`;
      })
      .join("\n");

    // 4. Chama o Gemini já com a agenda real verificada no prompt
    const extraction = await extractConsultativeWithGemini(
      query,
      history,
      availableCities,
      availableNeighborhoods,
      verifiedRoomsScheduleSummary,
      preDetectedDateISO,
      walletBalance,
      activeTier,
      userSpecialty,
      isProfileComplete,
      missingProfileFields,
    );

    const targetDateISO = extraction.dateISO || preDetectedDateISO;

    // Se o Gemini extraiu uma data diferente da pré-detectada, busca as reservas da data exata
    if (targetDateISO !== preDetectedDateISO) {
      const targetObj = new Date(`${targetDateISO}T12:00:00-03:00`);
      const wStart = new Date(
        targetObj.getTime() - 36 * 60 * 60 * 1000,
      ).toISOString();
      const wEnd = new Date(
        targetObj.getTime() + 36 * 60 * 60 * 1000,
      ).toISOString();

      const { data: newBookings } = await supabase
        .from("bookings")
        .select(
          "id, room_id, start_time, end_time, status, created_at, asaas_payment_id",
        )
        .gte("start_time", wStart)
        .lte("start_time", wEnd)
        .neq("status", "cancelled");

      bookingsByRoom.clear();
      (newBookings || []).forEach((b: any) => {
        if (!b.room_id) return;
        if (!bookingsByRoom.has(b.room_id)) {
          bookingsByRoom.set(b.room_id, []);
        }
        bookingsByRoom.get(b.room_id)!.push(b);
      });
    }

    // 5. Calcula Score e Disponibilidade Estrita de cada sala (Zero Alucinação)
    const reqHour = extraction.requestedHour;
    const reqDuration = Math.max(1, extraction.requestedDurationHours || 1);
    const reqShift = extraction.shift;
    const mappedProfileCat = mapProfileSpecialtyToCategory(userSpecialty);

    const shiftLabelMap: Record<string, string> = {
      manha: "manhã",
      tarde: "tarde",
      noite: "noite",
    };

    const roomMatches: RoomAvailabilityMatch[] = rooms.map((r: any) => {
      let score = 0;
      const roomCity = String(r.address_details?.city || "").toLowerCase();
      const roomNeighborhood = String(
        r.address_details?.neighborhood || "",
      ).toLowerCase();
      const roomSpec = String(r.specialty || "Multiuso").toLowerCase();
      const roomModalities: string[] = Array.isArray(r.modalities)
        ? r.modalities
        : ["hora"];
      const tierKey: "start" | "vip" | "master" =
        r.tier === "master" ? "master" : r.tier === "vip" ? "vip" : "start";
      const hourlyPrice = Number(r.address_details?.pricing?.hourly || 45);
      const passHourlyPrice = PASS_RATES_BY_TIER[tierKey];

      // Horários 100% verificados na agenda real da sala (`weekConfig` + `exceptions` + `blocked_dates` + `bookings`)
      const allFreeHours = getVerifiedRoomFreeHoursForDate(
        r,
        targetDateISO,
        bookingsByRoom.get(r.id) || [],
        exclusiveLockedRoomIds,
        nowMs,
      );

      const shiftFreeHours = filterHoursByShift(allFreeHours, reqShift);

      // Se a sala NÃO tem nenhum horário livre no dia inteiro, recebe score negativo e nunca é oferecida como livre
      if (allFreeHours.length === 0) {
        return {
          roomId: r.id,
          roomName: r.name || "Consultório Fusion",
          specialty: r.specialty || "Multiuso",
          tier: tierKey,
          neighborhood: r.address_details?.neighborhood || "Centro",
          city: r.address_details?.city || "Natal",
          hourlyPrice,
          passHourlyPrice,
          score: -999,
          exactSlotAvailable: false,
          consecutiveSlotsAvailable: false,
          requestedSlotLabel: reqHour !== null ? formatHourSlot(reqHour) : null,
          availableSlots: [],
          matchReason: "Agenda fechada ou sem vagas nesta data",
          aiPitch: `Consultório sem horários disponíveis em ${targetDateISO}.`,
        };
      }

      // Pontuação de Cidade, Bairro e Especialidade
      if (
        extraction.city !== "Qualquer lugar" &&
        roomCity.includes(extraction.city.toLowerCase())
      ) {
        score += 40;
      }
      if (
        extraction.neighborhood &&
        roomNeighborhood.includes(extraction.neighborhood.toLowerCase())
      ) {
        score += 25;
      }

      const wantedCatFirstWord = extraction.category
        .split(" ")[0]
        .toLowerCase();
      const isExactCategory =
        extraction.category === "Todas as Salas" ||
        roomSpec.includes(wantedCatFirstWord);
      const isCompatibleMultiuso = roomSpec.includes("multiuso");

      if (isExactCategory) score += 50;
      else if (isCompatibleMultiuso) score += 20;

      if (
        mappedProfileCat !== "Todas as Salas" &&
        roomSpec.includes(mappedProfileCat.split(" ")[0].toLowerCase())
      ) {
        score += 25;
      }

      if (roomModalities.includes(extraction.modality)) score += 15;
      if (extraction.tier !== "all" && r.tier === extraction.tier) score += 25;

      // Verificação estrita do Horário ou Turno solicitado
      let exactSlotAvailable = false;
      let consecutiveSlotsAvailable = false;
      let displaySlots: string[] = [];
      let matchReason = "";

      if (reqHour !== null) {
        const reqLabel = formatHourSlot(reqHour);
        exactSlotAvailable = allFreeHours.includes(reqHour);

        consecutiveSlotsAvailable = exactSlotAvailable;
        if (exactSlotAvailable && reqDuration > 1) {
          for (let i = 0; i < reqDuration; i++) {
            if (!allFreeHours.includes(reqHour + i)) {
              consecutiveSlotsAvailable = false;
              break;
            }
          }
        }

        const closestHours = [...allFreeHours].sort(
          (a, b) => Math.abs(a - reqHour) - Math.abs(b - reqHour),
        );
        displaySlots = closestHours
          .slice(0, 4)
          .sort((a, b) => a - b)
          .map(formatHourSlot);

        if (reqDuration > 1 && consecutiveSlotsAvailable) {
          score += 80;
          matchReason = `${reqDuration}h seguidas livres a partir das ${reqLabel}`;
        } else if (exactSlotAvailable) {
          score += 65;
          matchReason = `Livre às ${reqLabel}`;
        } else {
          score -= 50; // Penaliza sala ocupada/fechada no horário pedido
          matchReason = `Fechada/Ocupada às ${reqLabel} • Livre às ${displaySlots.slice(0, 2).join(" e ")}`;
        }
      } else if (reqShift !== "") {
        const sLabel = shiftLabelMap[reqShift] || reqShift;
        if (shiftFreeHours.length > 0) {
          exactSlotAvailable = true;
          consecutiveSlotsAvailable = shiftFreeHours.length >= reqDuration;
          score += 65;
          displaySlots = shiftFreeHours.slice(0, 4).map(formatHourSlot);
          matchReason = `Livre pela ${sLabel}: ${displaySlots.slice(0, 3).join(", ")}`;
        } else {
          // A sala NÃO tem vagas no turno pedido (ex: fechada pela manhã), mas tem em outro turno
          exactSlotAvailable = false;
          consecutiveSlotsAvailable = false;
          score -= 80; // Penaliza fortemente para nunca passar na frente nem parecer livre no turno pedido
          displaySlots = allFreeHours.slice(0, 3).map(formatHourSlot);
          matchReason = `Fechada pela ${sLabel} • Vagas apenas às ${displaySlots.join(", ")}`;
        }
      } else {
        exactSlotAvailable = allFreeHours.length > 0;
        consecutiveSlotsAvailable = allFreeHours.length >= reqDuration;
        score += 30;
        displaySlots = allFreeHours.slice(0, 4).map(formatHourSlot);
        matchReason = `Horários livres: ${displaySlots.slice(0, 3).join(", ")}`;
      }

      const tierName =
        tierKey === "master" ? "Premium" : tierKey === "vip" ? "VIP" : "Basic";
      const aiPitch = `Consultório ${tierName} de ${r.specialty || "Multiuso"} em ${
        r.address_details?.neighborhood || "localização central"
      } — R$ ${hourlyPrice}/h avulso ou R$ ${passHourlyPrice}/h no Fusion Pass+.`;

      return {
        roomId: r.id,
        roomName: r.name || "Consultório Fusion",
        specialty: r.specialty || "Multiuso",
        tier: tierKey,
        neighborhood: r.address_details?.neighborhood || "Centro",
        city: r.address_details?.city || "Natal",
        hourlyPrice,
        passHourlyPrice,
        score,
        exactSlotAvailable,
        consecutiveSlotsAvailable,
        requestedSlotLabel: reqHour !== null ? formatHourSlot(reqHour) : null,
        availableSlots: displaySlots,
        matchReason,
        aiPitch,
      };
    });

    roomMatches.sort((a, b) => b.score - a.score);

    // 6. Validação Determinística do Headline (Garante transparência total ao especialista)
    let finalHeadline = extraction.headline;
    if (extraction.intentType === "room_search") {
      const openRoomsOnDate = roomMatches.filter(
        (m) => m.availableSlots.length > 0,
      );
      const exactShiftOrHourRooms = openRoomsOnDate.filter(
        (m) => m.exactSlotAvailable,
      );

      if (openRoomsOnDate.length === 0) {
        finalHeadline = `Verifiquei a agenda em tempo real e nenhum consultório possui horários livres para ${targetDateISO}. Experimente consultar outro dia ou turno.`;
      } else if (reqHour !== null) {
        const reqLabel = formatHourSlot(reqHour);
        if (exactShiftOrHourRooms.length > 0) {
          finalHeadline = `Encontrei ${exactShiftOrHourRooms.length} consultório(s) com agenda verificada livre às ${reqLabel}:`;
        } else {
          finalHeadline = `Às ${reqLabel} os consultórios estão fechados ou já reservados, mas separei abaixo as salas que possuem outros horários realmente livres nesta data:`;
        }
      } else if (reqShift !== "") {
        const sLabel = shiftLabelMap[reqShift] || reqShift;
        if (exactShiftOrHourRooms.length > 0) {
          finalHeadline = `Encontrei ${exactShiftOrHourRooms.length} consultório(s) com horários realmente abertos no turno da ${sLabel}:`;
        } else {
          finalHeadline = `No turno da ${sLabel} os consultórios estão fechados ou já locados nesta data. Veja abaixo as opções com horários livres em outros períodos do dia:`;
        }
      }
    }

    return NextResponse.json({
      extraction: {
        ...extraction,
        dateISO: targetDateISO,
        headline: finalHeadline,
      },
      matches: roomMatches,
      assistantMessage: finalHeadline,
    });
  } catch (error: any) {
    console.error("Erro no Concierge IA Fusion:", error);
    return NextResponse.json(
      { error: "Não foi possível consultar o assistente no momento." },
      { status: 500 },
    );
  }
}