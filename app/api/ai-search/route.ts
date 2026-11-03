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

// Extrai os preços reais (Hora, Turno e Mensal) e um resumo elegante da descrição/mobiliário da sala
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
// MOTOR CONSULTIVO ESPECIALISTA EM SAÚDE & PRECIFICAÇÃO FUSION (SUPERMÁQUINA)
// Usa os dados reais de preço e descrição (divã, poltrona, etc.) das salas!
// ============================================================================
function buildSpecialistAdvisoryResponse(
  rawQuery: string,
  rooms: any[],
  availableCities: string[],
  defaultDateISO: string,
  walletBalance: number,
  activeTier: string | null,
  userSpecialty: string | null,
  isProfileComplete: boolean,
  missingProfileFields: string[],
): AISearchExtraction | null {
  const q = rawQuery.toLowerCase();
  const mappedProfileCategory = mapProfileSpecialtyToCategory(userSpecialty);
  const specDisplay = userSpecialty || "sua especialidade";

  // Filtra as salas mais relevantes para a especialidade do usuário para citar exemplos reais (ex: Sala Fusion 03 com divã/poltronas)
  const relevantRooms = rooms.filter((r) => {
    if (mappedProfileCategory === "Todas as Salas") return true;
    const spec = String(r.specialty || "").toLowerCase();
    return (
      spec.includes(mappedProfileCategory.split(" ")[0].toLowerCase()) ||
      spec.includes("multiuso")
    );
  });
  const showcaseRooms = (
    relevantRooms.length > 0 ? relevantRooms : rooms
  ).slice(0, 3);

  const roomDescriptionsBullets = showcaseRooms.map((r) => {
    const info = inspectRoomDetails(r);
    const priceParts = [`Avulso R$ ${info.hourly}/h`];
    if (info.minShift) priceParts.push(`Turno R$ ${info.minShift}`);
    if (info.monthly) priceParts.push(`Mensal R$ ${info.monthly}`);
    return `${r.name} (${info.neighborhood}): ${info.cleanDesc} [${priceParts.join(" • ")}]`;
  });

  // --------------------------------------------------------------------------
  // 1. DÚVIDAS DE PREÇO DE TURNO FIXO OU MENSAL (Ex: "Qual o valor em média do turno fixo")
  // --------------------------------------------------------------------------
  const isAskingShiftOrMonthlyPrice =
    (q.includes("turno") || q.includes("mensal") || q.includes("sala fixa")) &&
    (q.includes("valor") ||
      q.includes("preço") ||
      q.includes("preco") ||
      q.includes("quanto") ||
      q.includes("média") ||
      q.includes("media") ||
      q.includes("custa") ||
      q.includes("como funciona"));

  if (isAskingShiftOrMonthlyPrice) {
    const roomsWithShift = rooms
      .map((r) => ({ r, info: inspectRoomDetails(r) }))
      .filter((x) => x.info.minShift !== null || x.info.monthly !== null);

    const shiftValues = roomsWithShift
      .map((x) => x.info.minShift)
      .filter((v): v is number => v !== null);
    const monthlyValues = roomsWithShift
      .map((x) => x.info.monthly)
      .filter((v): v is number => v !== null);

    const minShiftVal =
      shiftValues.length > 0 ? Math.min(...shiftValues) : 140;
    const maxShiftVal =
      shiftValues.length > 0 ? Math.max(...shiftValues) : 220;
    const avgMonthlyVal =
      monthlyValues.length > 0 ? Math.min(...monthlyValues) : 2500;

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
      headline: `Na Fusion Clinic, o valor do Turno Fixo varia conforme o padrão da sala e a quantidade de dias na semana. Veja os valores médios reais e quando compensa migrar para o Pass+ ou para a Sala Fixa com Coanfitrião:`,
      comparisonBlocks: [
        {
          title: "1. Valor do Turno Fixo (Manhã, Tarde ou Noite)",
          subtitle: `Média de R$ ${minShiftVal} a R$ ${maxShiftVal} por turno (4h a 5h)`,
          bullets: [
            "Garante o mesmo consultório toda semana no seu dia e período fixo (Manhã 08h-12h, Tarde 13h-17h ou Noite 18h-21h).",
            "Reduz o custo da hora avulsa e dá previsibilidade total para pacientes de acompanhamento contínuo.",
            "Negociação flexível direto pelo Chat Seguro com a clínica.",
          ],
        },
        {
          title: "2. Alternativa Flexível: Fusion Pass+ (16h)",
          subtitle: "A partir de R$ 27,95/h a R$ 34/h (-41% OFF)",
          bullets: [
            "Se você atende 1 turno por semana (4h/semana = 16h/mês), o pacote Pass+ de 16h entrega custo equivalente ou menor que o turno fixo.",
            "Vantagem: se um paciente desmarcar ou houver feriado, você não perde o turno — pode usar os créditos em qualquer outro dia ou sala.",
          ],
        },
        {
          title: "3. Alta Demanda: Sala Fixa + Coanfitrião (80%)",
          subtitle: `A partir de R$ ${avgMonthlyVal}/mês (Abata seu aluguel!)`,
          bullets: [
            "Se você atende muitos horários na semana, pode alugar uma sala exclusiva mensal e ativar o Modo Coanfitrião.",
            "Nos turnos em que você não estiver na sala, outros profissionais alugam pela plataforma e você recebe 80% do valor de cada locação para abater sua mensalidade!",
          ],
        },
      ],
      recommendationSummary:
        roomDescriptionsBullets.length > 0
          ? `Destaques para ${specDisplay}: ${roomDescriptionsBullets.join(" | ")}`
          : "Toque em 'Ver Salas com Turno Fixo' ao lado se quiser abrir uma proposta de turno direto no chat da sala.",
      closingQuestion:
        "Quantos turnos ou horas por semana você planeja atender? Assim eu calculo se o seu caso pede Turno Fixo, Pass+ 16h ou Sala Exclusiva como Coanfitrião.",
      followUpSuggestions: [
        "Atendo cerca de 2h a 4h por semana",
        "Atendo mais de 8h a 12h por semana (quero entender o Coanfitrião)",
        `Quais salas de ${specDisplay} têm divã e poltrona?`,
        "Ver consultórios disponíveis para Turno Fixo",
      ],
      suggestedCta: "switch_to_turno",
    };
  }

  // --------------------------------------------------------------------------
  // 2. PERGUNTA SOBRE ESTRUTURA FÍSICA DAS SALAS (Divã, Poltronas, Maca, Equipamentos)
  // --------------------------------------------------------------------------
  const isAskingRoomEquipment =
    q.includes("divã") ||
    q.includes("diva") ||
    q.includes("poltrona") ||
    q.includes("maca") ||
    q.includes("bioimped") ||
    q.includes("balança") ||
    q.includes("cadeira odonto") ||
    q.includes("estrutura") ||
    q.includes("equipamento") ||
    q.includes("o que tem na sala");

  if (isAskingRoomEquipment && !q.includes("hoje") && !q.includes("amanhã")) {
    return {
      intentType: "comparison_question",
      shouldApplyFilters: true,
      city: "Qualquer lugar",
      neighborhood: null,
      category: mappedProfileCategory,
      dateISO: defaultDateISO,
      requestedHour: null,
      requestedDurationHours: 1,
      shift: "",
      modality: "hora",
      tier: "all",
      headline: `Confira a estrutura detalhada e o mobiliário dos consultórios preparados para ${specDisplay} na Fusion Clinic:`,
      comparisonBlocks: showcaseRooms.map((r) => {
        const info = inspectRoomDetails(r);
        const tierLabel =
          r.tier === "master"
            ? "Padrão Premium"
            : r.tier === "vip"
              ? "Padrão VIP"
              : "Padrão Basic";
        return {
          title: `${r.name} (${info.neighborhood})`,
          subtitle: `${tierLabel} • Avulso R$ ${info.hourly}/h`,
          bullets: [
            info.fullDesc || info.cleanDesc,
            "Inclui recepção, Wi-Fi de alta velocidade, ar-condicionado, água/café e check-in inteligente na porta.",
            info.monthly
              ? `Disponível por Hora, Pacote Pass+ ou Sala Fixa Mensal (R$ ${info.monthly}/mês).`
              : "Disponível para reserva imediata por Hora ou Pacote Fusion Pass+.",
          ],
        };
      }),
      recommendationSummary:
        "Abaixo você já pode ver as fotos reais de cada consultório e os próximos horários livres.",
      closingQuestion:
        "Alguma dessas salas chamou mais a sua atenção pelo mobiliário ou localização?",
      followUpSuggestions: [
        "Atendo cerca de 2h a 4h por semana, qual plano compensa?",
        "Atendo mais de 8h a 12h por semana (Coanfitrião)",
        "Diferença entre Sala Basic, VIP e Premium?",
      ],
      suggestedCta: "none",
    };
  }

  // --------------------------------------------------------------------------
  // 3. DIAGNÓSTICO DE VOLUME SEMANAL / MENSAL (Baixo/Médio vs. Alto Volume)
  // --------------------------------------------------------------------------
  const isWeeklyVolumeQuery =
    q.includes("por semana") ||
    q.includes("/semana") ||
    q.includes("semanal") ||
    q.includes("vezes por semana") ||
    q.includes("pacientes por semana") ||
    q.includes("horas no mês") ||
    q.includes("horas por mês") ||
    q.includes("2h a 4h") ||
    q.includes("8h a 12h") ||
    q.includes("atendo muito") ||
    q.includes("agenda cheia");

  if (isWeeklyVolumeQuery) {
    const nums = (q.match(/\d+/g) || [])
      .map((n) => parseInt(n, 10))
      .filter((n) => n > 0 && n <= 60);

    const minWeekly =
      nums.length >= 2 ? Math.min(nums[0], nums[1]) : nums[0] || 3;
    const maxWeekly =
      nums.length >= 2 ? Math.max(nums[0], nums[1]) : minWeekly;

    // Se o profissional atende MUITO (6h+ por semana / 24h+ no mês ou pediu Coanfitrião):
    if (
      maxWeekly >= 6 ||
      q.includes("atendo muito") ||
      q.includes("agenda cheia") ||
      q.includes("coanfitri")
    ) {
      const monthlyHrs = maxWeekly * 4;
      const sampleRoom = showcaseRooms[0];
      const sampleInfo = sampleRoom ? inspectRoomDetails(sampleRoom) : null;
      const monthlyRent = sampleInfo?.monthly || 2500;
      // Simulação realista: sublocando 12h/semana ociosas a R$ 45/h = R$ 2.160 * 80% = R$ 1.728 de abatimento!
      const subleasedHoursMonth = 40;
      const cashback80 = Math.round(subleasedHoursMonth * 45 * 0.8);
      const netCostAfterCohost = Math.max(350, monthlyRent - cashback80);

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
        headline: `Para uma carga elevada de ${minWeekly}h a ${maxWeekly}h por semana (~${monthlyHrs}h/mês), além dos Turnos Fixos, você destrava a estratégia mais inteligente da Fusion: a Sala Fixa Mensal com Modo Coanfitrião (80% de repasse)!`,
        comparisonBlocks: [
          {
            title: "1. Pacote Pass+ 16h/24h ou Turnos Fixos",
            subtitle: "Para quem não quer gestão de sala",
            bullets: [
              `Com ${monthlyHrs}h/mês, você pode combinar 2 Turnos Fixos na semana ou pacotes Pass+ com até 41% de desconto.`,
              "Ideal se você prefere pagar estritamente pelas horas/turnos utilizados sem compromisso mensal de exclusividade.",
            ],
          },
          {
            title: "2. Sala Fixa Exclusiva + Modo Coanfitrião",
            subtitle: "Abata seu aluguel sublocando horários vagos (80% seu)",
            bullets: [
              `Você aluga uma sala fixa exclusiva (ex: R$ ${monthlyRent}/mês) e tem prioridade total de agenda.`,
              `Nos dias/horários em que você NÃO estiver atendendo, você libera a sala na plataforma Fusion como Coanfitrião.`,
              `Você recebe 80% de todas as reservas feitas na sua sala!`,
            ],
          },
          {
            title: "3. Matemática Real do Abatimento",
            subtitle: "Como a sala se paga quase sozinha",
            bullets: [
              `Exemplo prático: se outros profissionais alugarem apenas 10h por semana dos seus horários ociosos (40h/mês), os seus 80% geram ~R$ ${cashback80}/mês de receita para você.`,
              `Na prática, sua sala exclusiva de R$ ${monthlyRent}/mês passa a custar apenas ~R$ ${netCostAfterCohost}/mês líquidos!`,
            ],
          },
        ],
        recommendationSummary: sampleRoom
          ? `Sugestão para seu perfil: a ${sampleRoom.name} (${sampleInfo?.cleanDesc}) permite contrato mensal exclusivo com ativação do Modo Coanfitrião.`
          : "Você transforma um custo fixo em uma fonte de renda passiva dentro da própria clínica.",
        closingQuestion:
          "Você gostaria de iniciar uma negociação de Sala Fixa / Turno com essa vantagem de Coanfitrião ou prefere simular pacotes de horas no Pass+?",
        followUpSuggestions: [
          "Quero ver as salas disponíveis para Sala Fixa / Turno",
          "Como ativo o Modo Coanfitrião na prática?",
          "Quero comparar com o pacote Fusion Pass+",
        ],
        suggestedCta: "switch_to_turno",
      };
    }

    // Volume de 2h a 5h por semana (8h a 20h por mês)
    const minMonthly = minWeekly * 4;
    const maxMonthly = maxWeekly * 4;
    const avulsoVipMin = minMonthly * 55;
    const avulsoVipMax = maxMonthly * 55;
    const passVipMax = Math.round(maxMonthly * 34);
    const savingsMax = avulsoVipMax - passVipMax;

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
      headline: `Excelente! Atender de ${minWeekly}h a ${maxWeekly}h por semana equivale a ${minMonthly}h a ${maxMonthly}h por mês. Fiz o cálculo financeiro para seus atendimentos de ${specDisplay} e a melhor escolha depende de como sua agenda se comporta:`,
      comparisonBlocks: [
        {
          title: `1. Hora Avulsa (${minMonthly}h a ${maxMonthly}h/mês)`,
          subtitle: "Custo mais alto neste volume",
          bullets: [
            `Pagando hora avulsa, seu investimento mensal fica entre R$ ${minMonthly * 45} (Basic) e R$ ${avulsoVipMax} (VIP).`,
            "A hora avulsa só é indicada se você atender menos de 4 horas no mês inteiro.",
          ],
        },
        {
          title: "2. Horários Quebrados → Fusion Pass+ (8h ou 16h)",
          subtitle: `Economia imediata de até R$ ${savingsMax}/mês (-41%)`,
          bullets: [
            "Ideal se você atende em dias separados (ex: 1h na segunda, 2h na quinta conforme a demanda dos pacientes).",
            "A hora cai para a faixa de R$ 27,95/h (Basic) a R$ 34/h (VIP), sem fidelidade, com 30 dias de validade e opção de doar/repassar horas.",
          ],
        },
        {
          title: "3. Horários Seguidos → Turno Fixo ou Coanfitrião",
          subtitle: "Para blocos de 4h seguidas ou crescimento de agenda",
          bullets: [
            `Se essas ${maxWeekly}h são seguidas no mesmo dia (ex: toda quarta à tarde), o Turno Fixo trava a mesma sala toda semana para você.`,
            "E quando sua agenda crescer acima de 8h/semana, você pode pegar uma Sala Fixa e sublocar horários vagos como Coanfitrião (recebendo 80%)!",
          ],
        },
      ],
      recommendationSummary:
        roomDescriptionsBullets.length > 0
          ? `Consultórios recomendados para ${specDisplay}: ${roomDescriptionsBullets.slice(0, 2).join(" | ")}`
          : `Com o Fusion Pass+, você economiza até R$ ${savingsMax}/mês mantendo liberdade total de agenda.`,
      closingQuestion:
        "Essas 2h a 4h semanais costumam ser em horários quebrados (dias diferentes) ou seguidos no mesmo turno?",
      followUpSuggestions: [
        "São horários quebrados ao longo da semana",
        "São horários seguidos no mesmo dia (bloco de 3h a 4h)",
        "E se minha agenda crescer para 8h+ na semana (Coanfitrião)?",
        `Mostrar salas de ${specDisplay} disponíveis amanhã`,
      ],
      suggestedCta: "open_pass_modal",
    };
  }

  // --------------------------------------------------------------------------
  // 4. RESPOSTA AO DIAGNÓSTICO: HORÁRIOS QUEBRADOS
  // --------------------------------------------------------------------------
  if (
    q.includes("quebrado") ||
    q.includes("separado") ||
    q.includes("dias diferentes") ||
    q.includes("variado")
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
      headline: `Para horários quebrados ao longo da semana, a escolha matematicamente perfeita para seus atendimentos de ${specDisplay} é o Fusion Pass+ (pacote de 8h ou 16h):`,
      comparisonBlocks: [
        {
          title: "Liberdade Total de Agenda",
          subtitle: "Encaixe pacientes em qualquer dia ou turno",
          bullets: [
            "Você não fica preso a um único dia da semana como no turno fixo.",
            "Surgiu paciente na terça de manhã e outro na quinta à noite? Basta reservar 1h em cada dia usando seus créditos da carteira.",
          ],
        },
        {
          title: "Desconto de Atacado (-41% OFF)",
          subtitle: "Hora a partir de R$ 27,95 (Basic) e R$ 34 (VIP)",
          bullets: [
            "Você paga valor de pacote fechado mas usa de forma 100% fracionada.",
            "Sem fidelidade (cancele a renovação quando quiser) e se sobrarem horas no fim dos 30 dias você pode transferir para outro profissional.",
          ],
        },
        {
          title: "Salas Ideais para Você",
          subtitle: `Estrutura pronta para ${specDisplay}`,
          bullets:
            roomDescriptionsBullets.length > 0
              ? roomDescriptionsBullets
              : [
                  "Consultórios equipados com poltronas, divã, climatização e isolamento acústico.",
                ],
        },
      ],
      recommendationSummary:
        "Clique em 'Simular Fusion Pass+' ao lado para escolher seu pacote de 8h ou 16h, ou veja abaixo a agenda das salas.",
      closingQuestion:
        "Deseja abrir o simulador do Fusion Pass+ agora ou consultar os horários livres de amanhã?",
      followUpSuggestions: [
        "Quero simular os pacotes do Fusion Pass+",
        `Ver salas de ${specDisplay} livres amanhã`,
        "E se minha agenda crescer para uma Sala Fixa (Coanfitrião)?",
      ],
      suggestedCta: "open_pass_modal",
    };
  }

  // --------------------------------------------------------------------------
  // 5. RESPOSTA AO DIAGNÓSTICO: HORÁRIOS SEGUIDOS NO MESMO DIA
  // --------------------------------------------------------------------------
  if (
    q.includes("seguido") ||
    q.includes("bloco") ||
    q.includes("mesmo dia") ||
    q.includes("mesmo turno")
  ) {
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
      headline: `Para blocos de 3h a 4h seguidas no mesmo dia, você pode travar um Turno Fixo Semanal ou usar o Pass+ 16h:`,
      comparisonBlocks: [
        {
          title: "Opção A: Turno Fixo Semanal",
          subtitle: "A mesma sala garantida toda semana",
          bullets: [
            "Você escolhe o turno (Manhã, Tarde ou Noite) e o dia da semana, garantindo que nenhum outro profissional ocupe sua sala naquele período.",
            "O atendimento do seu 1º paciente do dia já paga praticamente todo o turno — os demais pacientes são 100% lucro líquido.",
          ],
        },
        {
          title: "Opção B: Fusion Pass+ 16h",
          subtitle: "4 blocos de 4h/mês podendo alternar o dia",
          bullets: [
            "Se você atende 4h seguidas mas às vezes precisa mudar de quarta para quinta-feira, o Pass+ 16h permite reservar 4 horários seguidos no calendário com até 41% de desconto.",
          ],
        },
        {
          title: "Consultórios Recomendados",
          subtitle: `Estrutura completa para ${specDisplay}`,
          bullets:
            roomDescriptionsBullets.length > 0
              ? roomDescriptionsBullets
              : [
                  "Salas equipadas com divã, poltronas confortáveis, recepção e isolamento acústico.",
                ],
        },
      ],
      recommendationSummary:
        "Para fechar um Turno Fixo, basta tocar em 'Ver Salas com Turno Fixo', abrir a sala desejada na aba 'Por Turno' e clicar em Solicitar Proposta.",
      closingQuestion:
        "Prefere ver as salas na modalidade Turno Fixo ou simular o pacote Pass+ de 16h?",
      followUpSuggestions: [
        "Ver consultórios disponíveis para Turno Fixo",
        "Quero simular o pacote Pass+ de 16h",
        "Como funciona a Sala Fixa com Coanfitrião (80% de repasse)?",
      ],
      suggestedCta: "switch_to_turno",
    };
  }

  // --------------------------------------------------------------------------
  // 6. COMO FUNCIONA O MODO COANFITRIÃO / SALA FIXA MENSAL (80% REPASSE)
  // --------------------------------------------------------------------------
  if (
    q.includes("coanfitri") ||
    q.includes("subloca") ||
    q.includes("abater") ||
    q.includes("abatendo") ||
    q.includes("80%") ||
    q.includes("consultório próprio") ||
    q.includes("consultorio proprio")
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
      modality: "fixo",
      tier: "all",
      headline:
        "O Modo Coanfitrião da Fusion Clinic é a forma mais inteligente de ter seu próprio consultório fixo abatendo até 80% do aluguel:",
      comparisonBlocks: [
        {
          title: "1. Você Aluga a Sala Fixa Mensal",
          subtitle: "Consultório 100% pronto sem fiador ou reforma",
          bullets: [
            "Você fecha o contrato mensal de uma sala (ex: Sala Fusion 03 com divã e poltronas) sem gastar 1 real com obras, móveis, condomínio, limpeza ou recepcionista.",
            "Você define todos os dias e horários da semana em que vai atender seus pacientes.",
          ],
        },
        {
          title: "2. Libera os Horários Ociosos no App",
          subtitle: "Painel 'Minha Sala (80%)' no seu Dashboard",
          bullets: [
            "Sabe aqueles dias ou turnos em que você não está no consultório? Em vez de a sala ficar trancada dando prejuízo, você libera esses horários na vitrine da Fusion.",
            "A Fusion cuida de tudo: cobrança no PIX/Cartão, controle de check-in NFC na porta e limpeza.",
          ],
        },
        {
          title: "3. Recebe 80% para Abater seu Aluguel",
          subtitle: "Sua sala trabalhando para você",
          bullets: [
            "80% do valor de cada hora ou turno sublocado na sua sala vai direto para você!",
            "Na prática, a sublocação dos seus horários vagos paga grande parte (ou até 100%) da sua mensalidade.",
          ],
        },
      ],
      recommendationSummary:
        "Para iniciar uma proposta de Sala Fixa Mensal com Coanfitrião, basta abrir a sala desejada, selecionar a aba 'Fixo Mensal' e clicar em Iniciar Negociação.",
      closingQuestion:
        "Quer que eu filtre os consultórios disponíveis para contrato Mensal / Coanfitrião agora?",
      followUpSuggestions: [
        `Ver salas de ${specDisplay} disponíveis para Fixo Mensal`,
        "Qual o valor em média do turno fixo?",
        "Atendo cerca de 2h a 4h por semana",
      ],
      suggestedCta: "switch_to_turno",
    };
  }

  return null;
}

// ============================================================================
// CONTINGÊNCIA PARA BUSCA DE SALAS QUANDO O USUÁRIO PEDE AGENDA/HORÁRIOS
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
    headline: `Separei os consultórios ideais para ${
      userSpecialty || category
    } com seus diferenciais de estrutura e horários verificados:`,
    comparisonBlocks: [],
    recommendationSummary: !isProfileComplete
      ? `Lembrete: finalize seu perfil (${missingProfileFields.join(", ")}) para liberar o check-in na porta.`
      : walletBalance > 0
        ? `Você possui ${walletBalance}h ativas na carteira e pode reservar qualquer horário livre abaixo sem custo extra.`
        : "Cada card abaixo mostra a estrutura da sala (como divã, poltronas ou maca) e os horários livres para reserva imediata.",
    closingQuestion:
      "Deseja simular sua carga horária semanal ou conhecer a Sala Fixa com Modo Coanfitrião (80% de repasse)?",
    followUpSuggestions: [
      "Atendo cerca de 2h a 4h por semana",
      "Qual o valor em média do turno fixo?",
      "Como funciona a Sala Fixa com Coanfitrião (80%)?",
      "Diferença entre Sala Basic, VIP e Premium?",
    ],
    suggestedCta: !isProfileComplete ? "complete_profile" : "none",
  };
}

// ============================================================================
// CHAMADA AO GEMINI 2.5 FLASH COM CATÁLOGO COMPLETO (DESCRIÇÃO + PREÇOS REAIS)
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

  // 1. Verifica cenários consultivos determinísticos (Turno Fixo, Coanfitrião, Volume Semanal, Mobiliário)
  const deterministicAdvisory = buildSpecialistAdvisoryResponse(
    query,
    rooms,
    availableCities,
    preDetectedDateISO,
    walletBalance,
    activeTier,
    userSpecialty,
    isProfileComplete,
    missingProfileFields,
  );

  if (deterministicAdvisory) {
    return deterministicAdvisory;
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
          .slice(-6)
          .map(
            (h) =>
              `${h.role === "user" ? "Especialista" : "Concierge Fusion"}: ${h.content}`,
          )
          .join("\n")
      : "Início da conversa.";

  const systemPrompt = `
Você é o Concierge e Consultor Comercial Sênior da Fusion Clinic — uma supermáquina de inteligência em saúde, precificação de consultórios e rentabilidade médica/clínica.

CONHECIMENTO COMPLETO DE CADA SALA (ESTRUTURA, DIVÃ, POLTRONAS, PREÇOS E AGENDA):
${verifiedRoomsScheduleSummary}

PACOTES FUSION PASS+ ATIVOS:
${packagesSummary}

DIRETRIZES DE OURO (COMO AGIR COMO UM CONSULTOR DE ELITE):
1. FALE DA ESTRUTURA FÍSICA DAS SALAS:
   - Sempre que recomendar ou comparar uma sala, mencione o que ela tem na descrição (ex: se tem divã, duas poltronas confortáveis, maca, pia, iluminação acolhedora, isolamento acústico, Smart TV). Isso gera desejo imediato no especialista!
2. DOMINE TODAS AS MODALIDADES E PREÇOS:
   - Hora Avulsa (50 min): Para quem atende até 4h no mês.
   - Fusion Pass+ (8h ou 16h/mês): Até 41% de desconto na hora (a partir de R$ 27,95/h no Basic e R$ 34/h no VIP). Ideal para quem atende de 2h a 4h por semana em HORÁRIOS QUEBRADOS/VARIADOS. Sem fidelidade, dura 30 dias e permite doar/repassar horas.
   - Turno Fixo Semanal (Manhã, Tarde ou Noite): Ideal para quem atende 3h a 4h SEGUIDAS no mesmo dia toda semana.
   - Sala Fixa Mensal + Modo Coanfitrião (80% de repasse): Se o especialista tem carga horária alta (6h+, 8h+, 10h+ por semana) ou quer uma sala fixa exclusiva (ex: R$ 2.500/mês), apresente a vantagem matadora de virar COANFITRIÃO: nos horários em que ele não estiver usando a sala, a Fusion subloca para outros profissionais e repassa 80% do valor para abater o aluguel dele!
3. NÃO CONFUNDA DÚVIDAS DE PREÇO COM BUSCA DE HORÁRIO:
   - Se o especialista perguntar "Qual o valor do turno fixo?", "Quanto custa por mês?", "Atendo X horas por semana", defina intentType = "financial_simulation" ou "routine_diagnosis" e shouldApplyFilters = false! Só use intentType = "room_search" e shouldApplyFilters = true quando ele quiser ver salas disponíveis para agendar.

Contexto Temporal: Hoje é ${todayISO} (${weekdayName}) | Amanhã é ${tomorrowISO} | Data alvo: ${preDetectedDateISO}
Perfil do Especialista: ${userSpecialty || "Especialista"} (Categoria padrão: ${mappedProfileCategory}) | Saldo na carteira: ${walletBalance}h
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
                  text: `Histórico recente:\n${historyText}\n\nNova mensagem do especialista: "${query}"`,
                },
              ],
            },
          ],
          generationConfig: {
            temperature: 0.2,
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

    // 1. Busca salas (INCLUINDO `description`!) e pacotes reais em paralelo
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

    // 2. Busca reservas e contratos ativos
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

    // 3. Monta o dossiê completo de cada sala (Descrição Física + Preços Reais de Hora/Turno/Mensal + Horários Livres)
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

        return `- ${r.name} (${r.specialty || "Multiuso"}, Padrão: ${r.tier || "start"}, Local: ${info.neighborhood}/${info.city}) | Estrutura/Descrição: "${info.cleanDesc}" | Preços: [${priceDetails}] | Agenda em ${preDetectedDateISO}: [${scheduleDesc}]`;
      })
      .join("\n");

    // 4. Executa o Motor Consultivo
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

    // Se NÃO for busca de agenda (`shouldApplyFilters === false`), retorna a consultoria pura imediatamente
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
          // Agora o aiPitch traz a descrição real da estrutura da sala (poltronas, divã, maca, etc.)!
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

    // Preserva o headline inteligente do Gemini/Consultor e só ajusta se a hora pedida estiver ocupada
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