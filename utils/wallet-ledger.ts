// utils/wallet-ledger.ts

export type CreditTier = "start" | "vip" | "master";

export interface WalletTxRow {
  id?: string;
  user_id?: string;
  amount: number;
  type?: string | null;
  tier?: string | null;
  description?: string | null;
  created_at?: string | null;
  expires_at?: string | null;
}

export interface PackageRow {
  id?: string;
  tier: string;
  hours: number;
  price: number;
  active?: boolean;
}

export interface SubscriptionRow {
  id?: string;
  user_id?: string;
  tier: string;
  hours: number;
  status: string;
  created_at?: string | null;
}

interface CreditBucket {
  tier: CreditTier;
  remaining: number;
  initialAmount: number;
  createdAtMs: number;
  expiresAtMs: number | null;
  description: string;
}

export function normalizeCreditTier(raw?: string | null): CreditTier {
  const t = String(raw || "start").toLowerCase().trim();
  if (t.includes("master") || t.includes("premium")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

export function formatCreditTierName(tier: CreditTier): string {
  if (tier === "master") return "Premium (Master)";
  if (tier === "vip") return "VIP";
  return "Basic";
}

/**
 * 1. MOTOR FIFO CRONOLÓGICO DE SALDO DA CARTEIRA
 * Abate cada uso do lote de crédito vigente na data do uso.
 * Impede que usos de meses anteriores negativem as novas recargas de renovação.
 */
export function computeWalletBalancesFIFO(
  transactions: WalletTxRow[],
  referenceDate: Date = new Date(),
): {
  start: number;
  vip: number;
  master: number;
  total: number;
} {
  const nowMs = referenceDate.getTime();

  const sorted = [...(transactions || [])].sort((a, b) => {
    const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
    const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
    return tA - tB;
  });

  const buckets: Record<CreditTier, CreditBucket[]> = {
    start: [],
    vip: [],
    master: [],
  };

  // Hierarquia de consumo caso o débito precise buscar em categoria superior compatível
  const cascadeOrder: Record<CreditTier, CreditTier[]> = {
    start: ["start", "vip", "master"],
    vip: ["vip", "master"],
    master: ["master"],
  };

  for (const tx of sorted) {
    const amt = Number(tx.amount || 0);
    if (amt === 0) continue;

    const tier = normalizeCreditTier(tx.tier);
    const txTimeMs = tx.created_at ? new Date(tx.created_at).getTime() : nowMs;
    const expiresAtMs = tx.expires_at
      ? new Date(tx.expires_at).getTime()
      : null;

    if (amt > 0) {
      buckets[tier].push({
        tier,
        remaining: amt,
        initialAmount: amt,
        createdAtMs: txTimeMs,
        expiresAtMs,
        description: String(tx.description || ""),
      });
    } else {
      let toConsume = Math.abs(amt);
      const allowedTiers = cascadeOrder[tier];

      for (const candidateTier of allowedTiers) {
        if (toConsume <= 0) break;
        const tierBuckets = buckets[candidateTier];

        for (const b of tierBuckets) {
          if (toConsume <= 0) break;
          if (b.remaining <= 0) continue;
          // Só consome de pacotes que não estavam expirados no momento em que a reserva foi feita
          if (b.expiresAtMs !== null && b.expiresAtMs < txTimeMs) continue;

          const used = Math.min(b.remaining, toConsume);
          b.remaining = Number((b.remaining - used).toFixed(4));
          toConsume = Number((toConsume - used).toFixed(4));
        }
      }
    }
  }

  // Soma apenas os lotes positivos que ainda estão dentro da validade hoje
  const sumActive = (tier: CreditTier) =>
    Math.max(
      0,
      Number(
        buckets[tier]
          .filter(
            (b) =>
              b.remaining > 0 && (!b.expiresAtMs || b.expiresAtMs >= nowMs),
          )
          .reduce((acc, curr) => acc + curr.remaining, 0)
          .toFixed(2),
      ),
    );

  const start = sumActive("start");
  const vip = sumActive("vip");
  const master = sumActive("master");

  return {
    start,
    vip,
    master,
    total: Number((start + vip + master).toFixed(2)),
  };
}

/**
 * 2. SELETOR DE HIERARQUIA DE CRÉDITO PARA RESERVA
 * - Sala Basic (start): usa Basic -> se não tiver, usa VIP -> se não tiver, usa Master
 * - Sala VIP (vip): usa VIP -> se não tiver, usa Master
 * - Sala Master (master): usa exclusivamente Master
 */
export function selectCreditTierForBooking(
  roomTierRaw: string | null | undefined,
  requiredCredits: number,
  balances: { start: number; vip: number; master: number },
): {
  usedTier: CreditTier;
  availableInChosenTier: number;
  hasEnoughCredits: boolean;
} {
  const roomTier = normalizeCreditTier(roomTierRaw);

  if (roomTier === "start") {
    if (balances.start >= requiredCredits) {
      return {
        usedTier: "start",
        availableInChosenTier: balances.start,
        hasEnoughCredits: true,
      };
    }
    if (balances.vip >= requiredCredits) {
      return {
        usedTier: "vip",
        availableInChosenTier: balances.vip,
        hasEnoughCredits: true,
      };
    }
    if (balances.master >= requiredCredits) {
      return {
        usedTier: "master",
        availableInChosenTier: balances.master,
        hasEnoughCredits: true,
      };
    }
    const bestTier: CreditTier =
      balances.start >= balances.vip && balances.start >= balances.master
        ? "start"
        : balances.vip >= balances.master
          ? "vip"
          : "master";
    return {
      usedTier: bestTier,
      availableInChosenTier: balances[bestTier],
      hasEnoughCredits: false,
    };
  }

  if (roomTier === "vip") {
    if (balances.vip >= requiredCredits) {
      return {
        usedTier: "vip",
        availableInChosenTier: balances.vip,
        hasEnoughCredits: true,
      };
    }
    if (balances.master >= requiredCredits) {
      return {
        usedTier: "master",
        availableInChosenTier: balances.master,
        hasEnoughCredits: true,
      };
    }
    const bestTier: CreditTier =
      balances.vip >= balances.master ? "vip" : "master";
    return {
      usedTier: bestTier,
      availableInChosenTier: balances[bestTier],
      hasEnoughCredits: false,
    };
  }

  return {
    usedTier: "master",
    availableInChosenTier: balances.master,
    hasEnoughCredits: balances.master >= requiredCredits,
  };
}

/**
 * 3. PRECIFICADOR DO CRÉDITO UTILIZADO (REGRA DO CRÉDITO SUPERIOR EM SALA INFERIOR)
 * Retorna o valor em R$/hora do crédito que o profissional efetivamente usou.
 * Exemplo: Se o médico comprou um pacote Master (ex: 16h por R$ 960 -> R$ 60/h)
 * e usou esse crédito Master para reservar uma sala VIP, o valor retornado para a reserva
 * será R$ 60/h (referente ao crédito Master comprado), e não o preço da sala VIP.
 */
export function resolveCreditHourlyValueBRL(params: {
  usedTier: CreditTier;
  userTransactions: WalletTxRow[];
  userSubscriptions?: SubscriptionRow[];
  packages: PackageRow[];
  bookingTimestampMs?: number;
}): {
  hourlyRateBrl: number;
  matchedHours: number | null;
  creditTier: CreditTier;
} {
  const {
    usedTier,
    userTransactions,
    userSubscriptions = [],
    packages = [],
    bookingTimestampMs = Date.now(),
  } = params;

  const normalizedUsedTier = normalizeCreditTier(usedTier);

  // Mapeia os preços por hora de cada franquia daquela categoria (usedTier)
  const tierPackages = new Map<number, number>();
  for (const pkg of packages) {
    if (normalizeCreditTier(pkg.tier) !== normalizedUsedTier) continue;
    const h = Math.max(1, Number(pkg.hours) || 1);
    const p = Number(pkg.price) || 0;
    if (p <= 0) continue;
    const hourly = h > 1 && p > 120 ? p / h : p;
    tierPackages.set(h, Number(hourly.toFixed(2)));
  }

  // Busca as recargas positivas da categoria que está sendo usada (usedTier)
  const positiveCreditsOfTier = (userTransactions || []).filter((tx) => {
    if (Number(tx.amount) <= 0) return false;
    if (normalizeCreditTier(tx.tier) !== normalizedUsedTier) return false;
    const desc = String(tx.description || "").toLowerCase();
    if (desc.includes("estorno")) return false;
    const createdMs = tx.created_at
      ? new Date(tx.created_at).getTime()
      : bookingTimestampMs;
    return createdMs <= bookingTimestampMs + 60 * 1000;
  });

  const latestCreditTx =
    positiveCreditsOfTier[positiveCreditsOfTier.length - 1];

  let targetHours: number | null = null;

  if (latestCreditTx) {
    // 1ª Prioridade: Se a recarga da assinatura gravou a tarifa exata [Rate:XX.XX], usa ela direto!
    const rateMatch = String(latestCreditTx.description || "").match(
      /\[Rate:(\d+(?:\.\d+)?)\]/i,
    );
    if (rateMatch && Number(rateMatch[1]) > 0) {
      return {
        hourlyRateBrl: Number(rateMatch[1]),
        matchedHours: Math.round(Number(latestCreditTx.amount)),
        creditTier: normalizedUsedTier,
      };
    }

    // 2ª Prioridade: Extrai a franquia de horas (ex: 8h, 16h, 20h) da recarga para buscar na tabela packages
    const descHoursMatch = String(latestCreditTx.description || "").match(
      /(\d+)\s*(?:h|hora|horas|crédito|credito)/i,
    );
    targetHours =
      descHoursMatch && Number(descHoursMatch[1]) > 0
        ? Number(descHoursMatch[1])
        : Math.round(Number(latestCreditTx.amount));
  } else {
    // 3ª Prioridade: Olha na tabela subscriptions do usuário para aquela categoria
    const activeSub =
      userSubscriptions.find(
        (s) =>
          s.status === "ACTIVE" &&
          normalizeCreditTier(s.tier) === normalizedUsedTier,
      ) ||
      userSubscriptions.find(
        (s) => normalizeCreditTier(s.tier) === normalizedUsedTier,
      );

    if (activeSub && Number(activeSub.hours) > 0) {
      targetHours = Number(activeSub.hours);
    }
  }

  if (tierPackages.size > 0) {
    if (targetHours && tierPackages.has(targetHours)) {
      return {
        hourlyRateBrl: tierPackages.get(targetHours)!,
        matchedHours: targetHours,
        creditTier: normalizedUsedTier,
      };
    }
    if (targetHours && targetHours > 0) {
      let closestH: number | null = null;
      let minDiff = Infinity;
      for (const [h] of tierPackages.entries()) {
        const diff = Math.abs(h - targetHours);
        if (diff < minDiff) {
          minDiff = diff;
          closestH = h;
        }
      }
      if (closestH !== null) {
        return {
          hourlyRateBrl: tierPackages.get(closestH)!,
          matchedHours: closestH,
          creditTier: normalizedUsedTier,
        };
      }
    }
    const firstEntry = Array.from(tierPackages.entries())[0];
    return {
      hourlyRateBrl: firstEntry[1],
      matchedHours: firstEntry[0],
      creditTier: normalizedUsedTier,
    };
  }

  const defaultFallbacks: Record<CreditTier, number> = {
    start: 33.38,
    vip: 41.13,
    master: 60.0,
  };

  return {
    hourlyRateBrl: defaultFallbacks[normalizedUsedTier],
    matchedHours: targetHours,
    creditTier: normalizedUsedTier,
  };
}