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
    | "routine_diagnosis"
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
  dateISO: string | null;
  requestedHour: number | null;
  requestedDurationHours: number;
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
  shiftPrice: number | null;
  monthlyPrice: number | null;
  score: number;
  exactSlotAvailable: boolean;
  consecutiveSlotsAvailable: boolean;
  requestedSlotLabel: string | null;
  availableSlots: string[];
  matchReason: string;
  aiPitch: string;
}

const PASS_RATES_BY_TIER: Record<"start" | "vip" | "master", number> = {
  start: 27.95,
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

function inspectRoomDetails(room: any) {
  let addr = room.address_details || {};
  if (typeof addr === "string") {
    try {
      addr = JSON.parse(addr);
    } catch {
      addr = {};
    }
  }
  const pricing = addr.pricing || {};
  const hourly = Number(pricing.hourly || 45);

  const shiftCandidates = [pricing.morning, pricing.afternoon, pricing.night]
    .map((v) => Number(v))
    .filter((v) => !isNaN(v) && v > 0);

  const minShift =
    shiftCandidates.length > 0 ? Math.min(...shiftCandidates) : null;
  const monthly =
    pricing.monthly && Number(pricing.monthly) > 0
      ? Number(pricing.monthly)
      : null;

  const rawDesc = String(room.description || "").trim();
  const cleanDesc =
    rawDesc.length > 0
      ? rawDesc.length > 130
        ? `${rawDesc.slice(0, 127).trim()}...`
        : rawDesc
      : room.specialty?.toLowerCase().includes("psico")
        ? "Ambiente acolhedor com isolamento acústico, poltronas confortáveis e climatização."
        : "Consultório completo, climatizado, com recepção e Wi-Fi de alta velocidade.";

  return {
    neighborhood: addr.neighborhood || "Lagoa Nova",
    city: addr.city || "Natal",
    hourly,
    morning: pricing.morning ? Number(pricing.morning) : null,
    afternoon: pricing.afternoon ? Number(pricing.afternoon) : null,
    night: pricing.night ? Number(pricing.night) : null,
    minShift,
    monthly,
    cleanDesc,
    fullDesc: rawDesc,
  };
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

function preDetectTargetDateISO(
  rawQuery: string,
  todayISO: string,
  tomorrowISO: string,
  currentHour: number,
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
  const dmMatch = q.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\b/);
  if (dmMatch) {
    const day = String(dmMatch[1]).padStart(2, "0");
    const month = String(dmMatch[2]).padStart(2, "0");
    const year = dmMatch[3] || todayISO.slice(0, 4);
    return `${year}-${month}-${day}`;
  }
  if (q.includes("hoje") && currentHour < 20) {
    return todayISO;
  }
  if (currentHour >= 19) {
    return tomorrowISO;
  }
  return todayISO;
}

// ============================================================================
// MOTOR DETERMINÍSTICO DE DISPONIBILIDADE REAL
// ============================================================================
function getVerifiedRoomFreeHoursForDate(
  room: any,
  targetDateISO: string,
  roomBookings: any[],
  exclusiveLockedRoomIds: Set<string>,
  nowMs: number,
): number[] {
  if (exclusiveLockedRoomIds.has(room.id)) {
    return [];
  }

  if (
    Array.isArray(room.blocked_dates) &&
    room.blocked_dates.includes(targetDateISO)
  ) {
    return [];
  }

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

  const freeHours = baseHours.filter((h) => {
    const hh = String(h).padStart(2, "0");
    const slotStart = new Date(
      `${targetDateISO}T${hh}:00:00-03:00`,
    ).getTime();
    const slotEnd = new Date(
      `${targetDateISO}T${hh}:50:00-03:00`,
    ).getTime();

    if (slotStart < nowMs) {
      return false;
    }

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
// MOTOR DE DIÁLOGO CONSULTIVO (PERGUNTA PRIMEIRO -> 1 RECOMENDAÇÃO ASSERTIVA)
// Menos texto, diálogo natural e veredito único com economia exata
// ============================================================================
function buildConversationalAdvisory(
  rawQuery: string,
  history: ConversationTurn[],
  rooms: any[],
  defaultDateISO: string,
  userSpecialty: string | null,
): AISearchExtraction | null {
  const q = rawQuery.toLowerCase().trim();
  const mappedProfileCategory = mapProfileSpecialtyToCategory(userSpecialty);
  const specDisplay = userSpecialty || "sua área";

  // Junta o histórico recente do usuário para saber o que ele já informou nas mensagens anteriores
  const previousUserMessages = history
    .filter((h) => h.role === "user")
    .map((h) => h.content.toLowerCase())
    .join(" | ");

  const relevantRooms = rooms.filter((r) => {
    if (mappedProfileCategory === "Todas as Salas") return true;
    const spec = String(r.specialty || "").toLowerCase();
    return (
      spec.includes(mappedProfileCategory.split(" ")[0].toLowerCase()) ||
      spec.includes("multiuso")
    );
  });
  const sampleRoom = (relevantRooms.length > 0 ? relevantRooms : rooms)[0];
  const sampleInfo = sampleRoom ? inspectRoomDetails(sampleRoom) : null;

  // Extrai números da mensagem atual ou da mensagem anterior (ex: "2h a 4h")
  const currentNums = (q.match(/\d+/g) || [])
    .map((n) => parseInt(n, 10))
    .filter((n) => n > 0 && n <= 60);
  const historyNums = (previousUserMessages.match(/\d+/g) || [])
    .map((n) => parseInt(n, 10))
    .filter((n) => n > 0 && n <= 60);

  const activeNums = currentNums.length > 0 ? currentNums : historyNums;
  const minWeekly =
    activeNums.length >= 2
      ? Math.min(activeNums[0], activeNums[1])
      : activeNums[0] || 3;
  const maxWeekly =
    activeNums.length >= 2
      ? Math.max(activeNums[0], activeNums[1])
      : minWeekly;

  const isBrokenPattern =
    q.includes("quebrado") ||
    q.includes("separado") ||
    q.includes("dias diferentes") ||
    q.includes("variado") ||
    q.includes("alternado") ||
    q.includes("pingado");

  const isConsecutivePattern =
    q.includes("seguido") ||
    q.includes("seguida") ||
    q.includes("bloco") ||
    q.includes("mesmo dia") ||
    q.includes("mesmo turno") ||
    q.includes("tudo junto");

  // --------------------------------------------------------------------------
  // CENÁRIO A: DÚVIDA SOBRE SUBLOCAÇÃO ("É possível sublocar uma sala?")
  // Passo 1: Não joga texto longo. Pergunta qual dos 2 sentidos ele busca!
  // --------------------------------------------------------------------------
  const isAskingSubleaseAmbiguous =
    (q.includes("subloca") || q.includes("alugar uma sala")) &&
    !q.includes("coanfitri") &&
    !q.includes("vago") &&
    !q.includes("ocioso") &&
    !q.includes("minha sala") &&
    !q.includes("abater") &&
    !q.includes("hora") &&
    !q.includes("turno");

  if (isAskingSubleaseAmbiguous) {
    return {
      intentType: "routine_diagnosis",
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
      headline:
        "Sim, é totalmente possível! Aqui na Fusion você pode atuar de duas formas: **alugando horários/turnos prontos** para atender seus pacientes ou **tendo uma sala fixa exclusiva sua e sublocando seus horários livres** para abater seu aluguel.",
      comparisonBlocks: [],
      recommendationSummary: "",
      closingQuestion:
        "Qual desses dois formatos você está buscando para o seu momento atual?",
      followUpSuggestions: [
        "Quero alugar horas ou turnos para atender",
        "Quero ter uma sala fixa e sublocar meus horários vagos",
      ],
      suggestedCta: "none",
    };
  }

  // --------------------------------------------------------------------------
  // CENÁRIO B: QUER ALUGAR HORAS/TURNOS OU PERGUNTA "QUAL PLANO COMPENSA?" (SEM DIZER HORAS)
  // Passo 1: Pergunta quantas horas por semana atende antes de fazer conta!
  // --------------------------------------------------------------------------
  const isAskingWhichPlanWithoutHours =
    q === "quero alugar horas ou turnos para atender" ||
    ((q.includes("vale mais a pena") ||
      q.includes("compensa") ||
      q.includes("qual plano") ||
      q.includes("melhor opção") ||
      q.includes("melhor opcao") ||
      q.includes("como funciona para atender")) &&
      currentNums.length === 0 &&
      !isBrokenPattern &&
      !isConsecutivePattern);

  if (isAskingWhichPlanWithoutHours) {
    return {
      intentType: "routine_diagnosis",
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
      headline: `Perfeito! Para eu calcular a única opção mais econômica para os seus atendimentos de ${specDisplay}, me conta rapidinho:`,
      comparisonBlocks: [],
      recommendationSummary: "",
      closingQuestion:
        "Quantas horas por semana (em média) você pretende atender?",
      followUpSuggestions: [
        "Até 1h por semana (atendimento eventual)",
        "De 2h a 4h por semana",
        "De 5h a 8h por semana",
        "Mais de 10h por semana",
      ],
      suggestedCta: "none",
    };
  }

  // --------------------------------------------------------------------------
  // CENÁRIO C: DISSE QUANTAS HORAS ATENDE POR SEMANA (Ex: "2h a 4h por semana")
  // Verifica se já sabemos se é horário quebrado ou seguido:
  // - Se NÃO sabemos: faz apenas a pergunta curta (sem jogar cálculo!).
  // - Se for até 1h/semana ou +10h/semana: já dá o veredito único direto.
  // --------------------------------------------------------------------------
  const isStatingWeeklyHours =
    q.includes("por semana") ||
    q.includes("/semana") ||
    q.includes("semanal") ||
    q.includes("2h a 4h") ||
    q.includes("5h a 8h") ||
    q.includes("1h por semana") ||
    q.includes("10h por semana");

  if (isStatingWeeklyHours && !isBrokenPattern && !isConsecutivePattern) {
    // Caso 1: Até 1h por semana (1h a 4h no mês) -> Veredito Único: Hora Avulsa
    if (maxWeekly <= 1) {
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
        headline:
          "Olha, para até 1h por semana (4h no mês), a melhor opção para você é a **Hora Avulsa**.",
        comparisonBlocks: [
          {
            title: "Por que essa é a melhor escolha para você:",
            subtitle: "Zero compromisso mensal • Pague só quando atender",
            bullets: [
              "Você investe apenas R$ 45/h (Basic) ou R$ 55/h (VIP) somente quando tiver paciente confirmado.",
              "Se a sua demanda subir para 2h+ por semana no futuro, aí sim vale migrar para o Fusion Pass+.",
            ],
          },
        ],
        recommendationSummary: "",
        closingQuestion: `Quer ver os consultórios de ${specDisplay} disponíveis para agendar uma hora avulsa?`,
        followUpSuggestions: [
          `Ver salas de ${specDisplay} disponíveis amanhã`,
          "E se eu passar a atender 2h a 4h por semana?",
        ],
        suggestedCta: "none",
      };
    }

    // Caso 2: Alta demanda (10h+ por semana / 40h+ no mês) -> Pergunta se quer Sala Fixa com Coanfitrião
    if (minWeekly >= 9) {
      return {
        intentType: "routine_diagnosis",
        shouldApplyFilters: false,
        city: "Qualquer lugar",
        neighborhood: null,
        category: mappedProfileCategory,
        dateISO: null,
        requestedHour: null,
        requestedDurationHours: 1,
        shift: "",
        modality: "fixo",
        tier: "all",
        headline: `Com ${maxWeekly}h+ por semana (mais de ${maxWeekly * 4}h no mês), você já tem porte para uma **Sala Fixa Exclusiva** ou **Turnos Fixos**.`,
        comparisonBlocks: [],
        recommendationSummary: "",
        closingQuestion:
          "Você prefere fechar apenas os seus Turnos Fixos na semana ou ter uma Sala Fixa 100% sua e sublocar seus horários livres como Coanfitrião (recebendo 80% para abater seu aluguel)?",
        followUpSuggestions: [
          "Quero entender a Sala Fixa abatendo aluguel (Coanfitrião 80%)",
          "Prefiro fechar apenas meus Turnos Fixos na semana",
        ],
        suggestedCta: "none",
      };
    }

    // Caso 3: De 2h a 8h por semana -> NÃO joga o cálculo todo! Pergunta se são horários quebrados ou seguidos!
    const minM = minWeekly * 4;
    const maxM = maxWeekly * 4;
    return {
      intentType: "routine_diagnosis",
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
      headline: `Entendi! Atender de ${minWeekly}h a ${maxWeekly}h por semana soma de **${minM}h a ${maxM}h por mês** — nesse volume você já garante um excelente desconto saindo da hora avulsa.`,
      comparisonBlocks: [],
      recommendationSummary: "",
      closingQuestion:
        "Para eu te dar a recomendação única ideal: você costuma atender esses pacientes em **horários quebrados** (dias diferentes na semana) ou **todas as horas seguidas** no mesmo dia?",
      followUpSuggestions: [
        "Horários quebrados ao longo da semana",
        "Horas seguidas no mesmo dia (bloco de 3h a 4h)",
      ],
      suggestedCta: "none",
    };
  }

  // --------------------------------------------------------------------------
  // CENÁRIO D: VEREDITO ÚNICO -> RESPONDEU "HORÁRIOS QUEBRADOS"
  // Dá APENAS 1 opção concreta com a economia exata em R$!
  // --------------------------------------------------------------------------
  if (isBrokenPattern) {
    const monthlyHours = maxWeekly >= 2 ? maxWeekly * 4 : 16;
    const targetPassHours = monthlyHours <= 10 ? 8 : 16;

    const avulsoBasicTotal = targetPassHours * 45;
    const passBasicTotal = Math.round(targetPassHours * 27.95);
    const economyBasic = avulsoBasicTotal - passBasicTotal;

    const avulsoVipTotal = targetPassHours * 55;
    const passVipTotal = Math.round(targetPassHours * 34);
    const economyVip = avulsoVipTotal - passVipTotal;

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
      headline: `Olha, para o seu formato de horários quebrados, a melhor opção para você é fechar o **Fusion Pass+ de ${targetPassHours}h/mês**.`,
      comparisonBlocks: [
        {
          title: `Sua economia direta: até R$ ${economyVip}/mês (-38% a -41%)`,
          subtitle: `Pacote Fusion Pass+ (${targetPassHours} horas mensais)`,
          bullets: [
            `Na hora avulsa, ${targetPassHours}h custariam R$ ${avulsoBasicTotal} (Basic) ou R$ ${avulsoVipTotal} (VIP).`,
            `No Fusion Pass+, sua hora cai para **R$ 27,95/h (Basic)** ou **R$ 34/h (VIP)** — você economiza de **R$ ${economyBasic} a R$ ${economyVip} todo mês**.`,
            `Você agenda horários picados em qualquer dia da semana pelo app, sem fidelidade e com 30 dias para usar.`,
          ],
        },
      ],
      recommendationSummary: sampleRoom
        ? `Com esse pacote você já pode atender na ${sampleRoom.name} (${sampleInfo?.cleanDesc}).`
        : "",
      closingQuestion:
        "Quer abrir o simulador desse pacote agora ou ver os horários livres das salas?",
      followUpSuggestions: [
        `Ver salas de ${specDisplay} disponíveis amanhã`,
        "Qual a diferença entre a sala Basic e a VIP?",
      ],
      suggestedCta: "open_pass_modal",
    };
  }

  // --------------------------------------------------------------------------
  // CENÁRIO E: VEREDITO ÚNICO -> RESPONDEU "HORAS SEGUIDAS NO MESMO DIA"
  // Dá APENAS 1 recomendação concreta (Turno Fixo) com a economia exata!
  // --------------------------------------------------------------------------
  if (
    isConsecutivePattern ||
    q === "prefiro fechar apenas meus turnos fixos na semana"
  ) {
    const shiftRate = sampleInfo?.minShift || 150;
    const monthlyShiftTotal = shiftRate * 4;
    const avulso16hVip = 16 * 55; // R$ 880
    const economyShift = Math.max(160, avulso16hVip - monthlyShiftTotal);

    return {
      intentType: "financial_simulation",
      shouldApplyFilters: false,
      city: "Qualquer lugar",
      neighborhood: null,
      category: mappedProfileCategory,
      dateISO: null,
      requestedHour: null,
      requestedDurationHours: 4,
      shift: "",
      modality: "turno",
      tier: "all",
      headline:
        "Olha, como você atende em horas seguidas no mesmo dia, a melhor opção para você é fechar um **Turno Fixo Semanal**.",
      comparisonBlocks: [
        {
          title: `Por que o Turno Fixo é a melhor escolha (Economia de ~R$ ${economyShift}/mês):`,
          subtitle: `Média de R$ ${shiftRate} por turno de 4h a 5h`,
          bullets: [
            `A mesma sala fica travada para você toda semana no seu turno (Manhã, Tarde ou Noite), garantindo estabilidade para os seus pacientes.`,
            `O valor de 1 única consulta sua no dia já paga praticamente o turno inteiro — os outros 3 ou 4 pacientes do bloco são lucro líquido.`,
          ],
        },
      ],
      recommendationSummary: sampleRoom
        ? `Destaque para ${specDisplay}: a ${sampleRoom.name} oferece ${sampleInfo?.cleanDesc}`
        : "",
      closingQuestion:
        "Qual período do dia (Manhã, Tarde ou Noite) você prefere para eu te mostrar as salas disponíveis para Turno Fixo?",
      followUpSuggestions: [
        `Ver salas para Turno Fixo pela manhã`,
        `Ver salas para Turno Fixo à tarde`,
        "E se eu quiser variar o dia da semana? (Pass+ 16h)",
      ],
      suggestedCta: "switch_to_turno",
    };
  }

  // --------------------------------------------------------------------------
  // CENÁRIO F: SALA FIXA + COANFITRIÃO (80% DE REPASSE)
  // Se ainda não sabemos quantos turnos ele usa, pergunta; se já sabemos, dá o veredito único!
  // --------------------------------------------------------------------------
  const isAskingCohost =
    q.includes("coanfitri") ||
    q.includes("horários vagos") ||
    q.includes("horarios vagos") ||
    q.includes("abater") ||
    q.includes("80%");

  if (isAskingCohost) {
    const monthlyRent = sampleInfo?.monthly || 2500;
    const cashback80 = Math.round(40 * 45 * 0.8); // 10h/sem sublocadas = R$ 1.440/mês
    const netRent = Math.max(400, monthlyRent - cashback80);

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
      modality: "fixo",
      tier: "all",
      headline:
        "Para quem quer ter seu próprio consultório sem arcar sozinho com o custo fixo, a melhor opção é a **Sala Fixa Mensal no Modo Coanfitrião (80% de repasse)**.",
      comparisonBlocks: [
        {
          title: "Como funciona o abatimento do seu aluguel na prática:",
          subtitle: `Receba 80% de todas as sublocações na sua sala`,
          bullets: [
            `Você aluga uma sala exclusiva pronta (ex: R$ ${monthlyRent}/mês com recepção, limpeza, ar e Wi-Fi inclusos) e bloqueia os horários dos seus pacientes.`,
            `Nos horários em que você não estiver lá, outros profissionais alugam sua sala pelo app da Fusion e **80% do valor vai direto para você**.`,
            `Exemplo real: sublocando apenas 10h/semana ociosas, você gera **~R$ ${cashback80}/mês de abatimento**, reduzindo seu custo líquido para cerca de **R$ ${netRent}/mês**!`,
          ],
        },
      ],
      recommendationSummary: sampleRoom
        ? `A ${sampleRoom.name} (${sampleInfo?.cleanDesc}) está disponível para proposta de Sala Fixa com Coanfitrião.`
        : "",
      closingQuestion:
        "Quer ver as salas disponíveis nessa modalidade para iniciar uma proposta sem compromisso?",
      followUpSuggestions: [
        `Ver salas de ${specDisplay} disponíveis`,
        "Atendo poucas horas (2h a 4h por semana)",
      ],
      suggestedCta: "switch_to_turno",
    };
  }

  // --------------------------------------------------------------------------
  // CENÁRIO G: PERGUNTOU VALOR DO TURNO FIXO ("Qual o valor em média do turno fixo?")
  // Responde de forma curta e faz 1 pergunta para direcionar!
  // --------------------------------------------------------------------------
  const isAskingShiftPrice =
    q.includes("turno") &&
    (q.includes("valor") ||
      q.includes("preço") ||
      q.includes("preco") ||
      q.includes("média") ||
      q.includes("media") ||
      q.includes("quanto"));

  if (isAskingShiftPrice) {
    const shiftRate = sampleInfo?.minShift || 150;
    return {
      intentType: "routine_diagnosis",
      shouldApplyFilters: false,
      city: "Qualquer lugar",
      neighborhood: null,
      category: mappedProfileCategory,
      dateISO: null,
      requestedHour: null,
      requestedDurationHours: 4,
      shift: "",
      modality: "turno",
      tier: "all",
      headline: `O Turno Fixo (bloco de 4h a 5h seguidas toda semana na mesma sala) custa em média **a partir de R$ ${shiftRate} por turno**. Já nos pacotes **Fusion Pass+**, a hora sai a partir de **R$ 27,95/h**.`,
      comparisonBlocks: [],
      recommendationSummary: "",
      closingQuestion:
        "Para eu calcular qual dos dois sai mais barato para você: quantos turnos ou horas por semana você pretende atender?",
      followUpSuggestions: [
        "1 turno por semana (3h a 4h seguidas)",
        "2h a 4h quebradas em dias diferentes",
        "2 ou mais turnos por semana (8h+ semanais)",
      ],
      suggestedCta: "none",
    };
  }

  // --------------------------------------------------------------------------
  // CENÁRIO H: DIFERENÇA ENTRE SALA BASIC, VIP E PREMIUM (Enxuto e Direto)
  // --------------------------------------------------------------------------
  const isTierQuestion =
    (q.includes("diferença") ||
      q.includes("diferenca") ||
      q.includes("qual escolher")) &&
    (q.includes("basic") || q.includes("vip") || q.includes("premium"));

  if (isTierQuestion) {
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
      headline:
        "Todas as salas já incluem recepção, ar-condicionado, Wi-Fi e limpeza. A diferença está no acabamento arquitetônico e na liberdade dos seus créditos:",
      comparisonBlocks: [
        {
          title: "Resumo Direto: Basic vs. VIP vs. Premium",
          subtitle: "Como funciona na prática",
          bullets: [
            "**Basic (Avulso R$ 45/h • Pass+ R$ 27,95/h):** Consultório clínico padrão focado no menor custo por consulta.",
            "**VIP (Avulso R$ 55/h • Pass+ R$ 34/h):** Mobiliário e decoração mais sofisticados + seus créditos VIP liberam salas VIP e Basic.",
            "**Premium (Avulso R$ 80/h • Pass+ R$ 50/h):** Arquitetura executiva de alto padrão + seus créditos liberam 100% das salas da plataforma.",
          ],
        },
      ],
      recommendationSummary: "",
      closingQuestion:
        "Qual é o foco principal para os seus pacientes hoje: menor custo operacional (Basic) ou maior valor percebido na consulta (VIP/Premium)?",
      followUpSuggestions: [
        `Ver salas de ${specDisplay} com fotos da estrutura`,
        "Atendo cerca de 2h a 4h por semana, qual pacote escolher?",
      ],
      suggestedCta: "none",
    };
  }

  return null;
}

// ============================================================================
// CONTINGÊNCIA PARA BUSCA DE SALAS QUANDO O USUÁRIO PEDE AGENDA/ESTRUTURA
// ============================================================================
function fallbackRoomSearchIntent(
  rawQuery: string,
  availableCities: string[],
  defaultDateISO: string,
  walletBalance: number,
  userSpecialty: string | null,
  isProfileComplete: boolean,
  missingProfileFields: string[],
): AISearchExtraction {
  const q = rawQuery.toLowerCase();
  const mappedProfileCategory = mapProfileSpecialtyToCategory(userSpecialty);

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

  let requestedDurationHours = 1;
  const durationMatch = q.match(
    /(?:por|durante|reservar|preciso de|bloco de)\s*(\d{1,2})\s*(?:h|hora|horas)\b/i,
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

  return {
    intentType: "room_search",
    shouldApplyFilters: true,
    city: detectedCity,
    neighborhood: null,
    category,
    dateISO: defaultDateISO,
    requestedHour,
    requestedDurationHours,
    shift,
    modality,
    tier,
    headline: `Aqui estão os consultórios preparados para ${
      userSpecialty || category
    }, com os detalhes do mobiliário e horários livres:`,
    comparisonBlocks: [],
    recommendationSummary: !isProfileComplete
      ? `Lembrete: complete seu perfil (${missingProfileFields.join(", ")}) para liberar a reserva.`
      : "",
    closingQuestion:
      "Alguma dessas salas atende melhor o formato da sua consulta ou quer que eu calcule o plano mais econômico para você?",
    followUpSuggestions: [
      "Atendo cerca de 2h a 4h por semana",
      "Qual o valor em média do turno fixo?",
      "É possível sublocar uma sala?",
    ],
    suggestedCta: !isProfileComplete ? "complete_profile" : "none",
  };
}

// ============================================================================
// CHAMADA AO GEMINI 2.5 FLASH (TREINADO PARA DIÁLOGO CURTO E VEREDITO ÚNICO)
// ============================================================================
async function extractConsultativeWithGemini(
  query: string,
  history: ConversationTurn[],
  rooms: any[],
  availableCities: string[],
  verifiedRoomsScheduleSummary: string,
  packagesSummary: string,
  preDetectedDateISO: string,
  walletBalance: number,
  activeTier: string | null,
  userSpecialty: string | null,
  isProfileComplete: boolean,
  missingProfileFields: string[],
): Promise<AISearchExtraction> {
  const { todayISO, tomorrowISO, weekdayName } = getBrazilNow();

  // 1. Verifica primeiro os fluxos de diálogo consultivo (Pergunta Rápida -> Veredito Único)
  const conversationalMatch = buildConversationalAdvisory(
    query,
    history,
    rooms,
    preDetectedDateISO,
    userSpecialty,
  );

  if (conversationalMatch) {
    return conversationalMatch;
  }

  const apiKey =
    process.env.GEMINI_API_KEY ||
    process.env.GOOGLE_GENERATIVE_AI_API_KEY ||
    process.env.NEXT_PUBLIC_GEMINI_API_KEY;

  if (!apiKey) {
    return fallbackRoomSearchIntent(
      query,
      availableCities,
      preDetectedDateISO,
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
          .slice(-8)
          .map(
            (h) =>
              `${h.role === "user" ? "Profissional" : "Concierge Fusion"}: ${h.content}`,
          )
          .join("\n")
      : "Início da conversa.";

  const systemPrompt = `
Você é o Concierge Consultivo da Fusion Clinic.
Seu estilo de conversa é DIRETO, HUMANO, CURTO e SOCRÁTICO (como um consultor pelo WhatsApp).

REGRAS OBRIGATÓRIAS DE COMPORTAMENTO (NUNCA VIOLE):
1. PROIBIDO TEXTÃO E PROIBIDO JOGAR 3 OPÇÕES DE UMA VEZ:
   - Nunca despeje cálculos de Hora Avulsa, Pass+ e Turno Fixo juntos antes de perguntar o contexto do profissional.
2. FAÇA PERGUNTAS ANTES DE RECOMENDAR (FASE DE DESCOBERTA):
   - Se o profissional fizer uma pergunta aberta (ex: "Posso sublocar uma sala?", "Qual plano vale a pena?", "Atendo 3h por semana"), NÃO mande blocos de comparação (deixe comparisonBlocks = [] e recommendationSummary = "").
   - Responda em no máximo 2 frases curtas no "headline" e faça 1 pergunta objetiva no "closingQuestion" para entender a rotina dele (ex: quantas horas por semana atende, ou se são horas seguidas no mesmo turno vs. horários quebrados em dias diferentes).
3. QUANDO TIVER A RESPOSTA CONCRETA, DÊ APENAS 1 ÚNICA OPÇÃO (VEREDITO ÚNICO):
   - Assim que o profissional responder sua pergunta (olhe o Histórico da conversa!), dê APENAS A MELHOR OPÇÃO para ele:
     * Exemplo Horários Quebrados (2h a 6h/sem): "Olha, a melhor opção para você é fechar o **Fusion Pass+ de 8h (ou 16h)** porque você vai economizar R$ X por mês..."
     * Exemplo Horas Seguidas no mesmo dia (3h a 4h seguidas): "Olha, a melhor opção para você é fechar um **Turno Fixo Semanal** porque garante sempre a mesma sala e..."
     * Exemplo Alta Demanda (8h+ na semana ou quer sala própria): "Olha, a melhor opção para você é fechar uma **Sala Fixa Mensal com Modo Coanfitrião**, onde você subloca os horários vagos e recebe 80% para abater seu aluguel."
   - Quando der o veredito final, use NO MÁXIMO 1 ÚNICO item dentro de "comparisonBlocks" com 2 ou 3 bullets curtos mostrando a economia em Reais.
4. SÓ MOSTRE SALAS (shouldApplyFilters = true e intentType = "room_search") quando o profissional pedir para ver salas, estrutura física (divã, poltrona, maca) ou horários livres na agenda.

Catálogo Real das Salas e Estrutura:
${verifiedRoomsScheduleSummary}

Pacotes Fusion Pass+:
${packagesSummary}

Contexto Temporal: Hoje é ${todayISO} (${weekdayName}) | Amanhã é ${tomorrowISO} | Data alvo: ${preDetectedDateISO}
Especialista Logado: ${userSpecialty || "Profissional de Saúde"} (Categoria: ${mappedProfileCategory}) | Saldo atual: ${walletBalance}h
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
          "routine_diagnosis",
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
                  text: `Histórico da conversa:\n${historyText}\n\nNova resposta/pergunta do profissional: "${query}"`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.15,
            responseMimeType: "application/json",
            responseSchema,
          },
        }),
      },
    );

    if (!res.ok) {
      return fallbackRoomSearchIntent(
        query,
        availableCities,
        preDetectedDateISO,
        walletBalance,
        userSpecialty,
        isProfileComplete,
        missingProfileFields,
      );
    }

    const data = await res.json();
    const rawJson = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawJson) {
      return fallbackRoomSearchIntent(
        query,
        availableCities,
        preDetectedDateISO,
        walletBalance,
        userSpecialty,
        isProfileComplete,
        missingProfileFields,
      );
    }

    const parsed = JSON.parse(rawJson) as AISearchExtraction;

    // Garante que nunca retorne mais de 1 bloco de recomendação em dúvidas financeiras/rotina
    if (
      parsed.intentType !== "room_search" &&
      Array.isArray(parsed.comparisonBlocks) &&
      parsed.comparisonBlocks.length > 1
    ) {
      parsed.comparisonBlocks = [parsed.comparisonBlocks[0]];
    }

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
    return fallbackRoomSearchIntent(
      query,
      availableCities,
      preDetectedDateISO,
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

    const [roomsRes, pkgsRes] = await Promise.all([
      supabase
        .from("rooms")
        .select(
          "id, name, description, specialty, tier, modalities, address_details, availability, blocked_dates, is_active, is_paused",
        )
        .eq("is_active", true)
        .eq("is_paused", false),
      supabase
        .from("packages")
        .select("tier, hours, price, active")
        .eq("active", true)
        .order("hours", { ascending: true }),
    ]);

    const rooms = roomsRes.data || [];
    const packages = pkgsRes.data || [];

    const packagesSummary =
      packages.length > 0
        ? packages
            .map((p: any) => {
              const h = Math.max(1, Number(p.hours) || 1);
              const pr = Number(p.price) || 0;
              const total = h > 1 && pr <= 120 ? pr * h : pr;
              const rate = (total / h).toFixed(2);
              return `${String(p.tier).toUpperCase()} ${h}h: Total R$ ${total.toFixed(2)} (R$ ${rate}/h)`;
            })
            .join(" | ")
        : "Basic 8h (R$ 35/h), Basic 16h (R$ 27,95/h) | VIP 8h (R$ 42/h), VIP 16h (R$ 34/h) | Premium 8h (R$ 62/h), Premium 16h (R$ 50/h)";

    const availableCities = Array.from(
      new Set(
        rooms
          .map((r: any) => r.address_details?.city)
          .filter((c): c is string => Boolean(c && typeof c === "string")),
      ),
    );

    const { todayISO, tomorrowISO, currentHour, nowMs } = getBrazilNow();
    const preDetectedDateISO = preDetectTargetDateISO(
      query,
      todayISO,
      tomorrowISO,
      currentHour,
    );

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

    const verifiedRoomsScheduleSummary = rooms
      .map((r: any) => {
        const info = inspectRoomDetails(r);
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

        const scheduleDesc =
          freeHrs.length === 0
            ? "FECHADA / SEM VAGAS NESTA DATA"
            : `Manhã: ${morningHrs.length > 0 ? morningHrs.join(", ") : "FECHADO/OCUPADO"} | Tarde: ${afternoonHrs.length > 0 ? afternoonHrs.join(", ") : "FECHADO/OCUPADO"} | Noite: ${nightHrs.length > 0 ? nightHrs.join(", ") : "FECHADO/OCUPADO"}`;

        const priceDetails = [
          `Avulso: R$ ${info.hourly}/h`,
          info.minShift ? `Turno Fixo: R$ ${info.minShift}` : null,
          info.monthly ? `Sala Fixa Mensal: R$ ${info.monthly}/mês` : null,
        ]
          .filter(Boolean)
          .join(" | ");

        return `- ${r.name} (${r.specialty || "Multiuso"}, Padrão: ${r.tier || "start"}, Local: ${info.neighborhood}/${info.city}) | Estrutura: "${info.cleanDesc}" | Preços: [${priceDetails}] | Agenda em ${preDetectedDateISO}: [${scheduleDesc}]`;
      })
      .join("\n");

    const extraction = await extractConsultativeWithGemini(
      query,
      history,
      rooms,
      availableCities,
      verifiedRoomsScheduleSummary,
      packagesSummary,
      preDetectedDateISO,
      walletBalance,
      activeTier,
      userSpecialty,
      isProfileComplete,
      missingProfileFields,
    );

    if (
      extraction.intentType !== "room_search" &&
      !extraction.shouldApplyFilters
    ) {
      return NextResponse.json({
        extraction,
        matches: [],
        assistantMessage: extraction.headline,
      });
    }

    let targetDateISO = extraction.dateISO || preDetectedDateISO;

    const buildMatchesForDate = (dateToUse: string) => {
      const reqHour = extraction.requestedHour;
      const reqDuration = Math.max(1, extraction.requestedDurationHours || 1);
      const reqShift = extraction.shift;
      const mappedProfileCat = mapProfileSpecialtyToCategory(userSpecialty);

      const shiftLabelMap: Record<string, string> = {
        manha: "manhã",
        tarde: "tarde",
        noite: "noite",
      };

      const list: RoomAvailabilityMatch[] = rooms.map((r: any) => {
        let score = 0;
        const info = inspectRoomDetails(r);
        const roomCity = info.city.toLowerCase();
        const roomNeighborhood = info.neighborhood.toLowerCase();
        const roomSpec = String(r.specialty || "Multiuso").toLowerCase();
        const roomModalities: string[] = Array.isArray(r.modalities)
          ? r.modalities
          : ["hora"];
        const tierKey: "start" | "vip" | "master" =
          r.tier === "master" ? "master" : r.tier === "vip" ? "vip" : "start";
        const passHourlyPrice = PASS_RATES_BY_TIER[tierKey];

        const allFreeHours = getVerifiedRoomFreeHoursForDate(
          r,
          dateToUse,
          bookingsByRoom.get(r.id) || [],
          exclusiveLockedRoomIds,
          nowMs,
        );

        const shiftFreeHours = filterHoursByShift(allFreeHours, reqShift);

        if (allFreeHours.length === 0) {
          return {
            roomId: r.id,
            roomName: r.name || "Consultório Fusion",
            specialty: r.specialty || "Multiuso",
            tier: tierKey,
            neighborhood: info.neighborhood,
            city: info.city,
            hourlyPrice: info.hourly,
            passHourlyPrice,
            shiftPrice: info.minShift,
            monthlyPrice: info.monthly,
            score: -999,
            exactSlotAvailable: false,
            consecutiveSlotsAvailable: false,
            requestedSlotLabel:
              reqHour !== null ? formatHourSlot(reqHour) : null,
            availableSlots: [],
            matchReason: "Agenda fechada ou sem vagas nesta data",
            aiPitch: info.cleanDesc,
          };
        }

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
        if (extraction.tier !== "all" && r.tier === extraction.tier)
          score += 25;

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
            score -= 50;
            matchReason = `Ocupada às ${reqLabel} • Livre às ${displaySlots.slice(0, 2).join(" e ")}`;
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
            exactSlotAvailable = false;
            consecutiveSlotsAvailable = false;
            score -= 80;
            displaySlots = allFreeHours.slice(0, 3).map(formatHourSlot);
            matchReason = `Fechada pela ${sLabel} • Vagas às ${displaySlots.join(", ")}`;
          }
        } else {
          exactSlotAvailable = allFreeHours.length > 0;
          consecutiveSlotsAvailable = allFreeHours.length >= reqDuration;
          score += 30;
          displaySlots = allFreeHours.slice(0, 4).map(formatHourSlot);
          matchReason = `Horários livres: ${displaySlots.slice(0, 3).join(", ")}`;
        }

        return {
          roomId: r.id,
          roomName: r.name || "Consultório Fusion",
          specialty: r.specialty || "Multiuso",
          tier: tierKey,
          neighborhood: info.neighborhood,
          city: info.city,
          hourlyPrice: info.hourly,
          passHourlyPrice,
          shiftPrice: info.minShift,
          monthlyPrice: info.monthly,
          score,
          exactSlotAvailable,
          consecutiveSlotsAvailable,
          requestedSlotLabel: reqHour !== null ? formatHourSlot(reqHour) : null,
          availableSlots: displaySlots,
          matchReason,
          aiPitch: info.cleanDesc,
        };
      });

      list.sort((a, b) => b.score - a.score);
      return list;
    };

    let roomMatches = buildMatchesForDate(targetDateISO);
    let openRoomsOnDate = roomMatches.filter(
      (m) => m.availableSlots.length > 0,
    );

    if (openRoomsOnDate.length === 0 && targetDateISO === todayISO) {
      targetDateISO = tomorrowISO;
      roomMatches = buildMatchesForDate(tomorrowISO);
      openRoomsOnDate = roomMatches.filter((m) => m.availableSlots.length > 0);
    }

    let finalHeadline = extraction.headline;
    const reqHour = extraction.requestedHour;
    if (extraction.intentType === "room_search" && reqHour !== null) {
      const exactShiftOrHourRooms = openRoomsOnDate.filter(
        (m) => m.exactSlotAvailable,
      );
      const reqLabel = formatHourSlot(reqHour);
      const dayLabel =
        targetDateISO === tomorrowISO
          ? "amanhã"
          : targetDateISO === todayISO
            ? "hoje"
            : targetDateISO;

      if (exactShiftOrHourRooms.length === 0 && openRoomsOnDate.length > 0) {
        finalHeadline = `Para ${dayLabel} às ${reqLabel} os consultórios já estão ocupados, mas separei as opções abaixo com horários vizinhos livres:`;
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