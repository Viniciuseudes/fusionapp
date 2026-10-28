// utils/wallet-ledger.ts

export type CreditTier = "start" | "vip" | "master";

export type SubscriberLifecycleStatus =
  | "NEW"
  | "RENEWED"
  | "REACTIVATED"
  | "EXPIRING_SOON"
  | "OVERDUE"
  | "CANCELLED";

export type SubscriptionPaymentMethod = "PIX" | "CREDIT_CARD" | "MIXED";

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

export interface SubscriberProfileInfo {
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  whatsapp?: string | null;
  cc_last4?: string | null;
  cc_brand?: string | null;
}

interface CreditBucket {
  id: string;
  userId: string;
  tier: CreditTier;
  remaining: number;
  initialAmount: number;
  totalPaidBrl: number;
  hourlyRateBrl: number;
  createdAtMs: number;
  expiresAtMs: number | null;
  description: string;
  paymentMethod: "PIX" | "CREDIT_CARD";
}

export interface DowngradeArbitrageResult {
  creditTier: CreditTier;
  roomTier: CreditTier;
  isDowngrade: boolean;
  creditHourlyRateBrl: number;
  roomReferenceHourlyRateBrl: number;
  grossCreditValueBrl: number;
  roomBaseValueBrl: number;
  standardPlatformFeeBrl: number;
  downgradeSpreadProfitBrl: number;
  totalPlatformProfitBrl: number;
  hostPayoutBrl: number;
  cohostPayoutBrl: number;
}

export interface SubscriberPackageAnalytics {
  userId: string;
  specialistName: string;
  specialistEmail: string;
  specialistPhone: string | null;
  activePlanTier: CreditTier | null;
  activePlanHours: number | null;
  subscriptionStatus: string;
  lifecycleStatus: SubscriberLifecycleStatus;
  paymentMethod: SubscriptionPaymentMethod;
  cardLast4: string | null;
  cardBrand: string | null;
  monthsSubscribed: number;
  renewalsCount: number;
  cancelledHistoryCount: number;
  hasRenewed: boolean;
  hasReactivated: boolean;
  isCurrentlyActive: boolean;
  isExpiringSoon: boolean;
  isOverdue: boolean;
  isCancelled: boolean;
  firstSubscriptionDate: string | null;
  lastPaymentDate: string | null;
  currentExpiresAt: string | null;
  daysUntilExpiry: number | null;
  purchasedHoursTotal: number;
  usedHoursTotal: number;
  activeRemainingHours: number;
  expiredUnusedHours: number;
  utilizationPct: number;
  totalInvestedBrl: number;
  currentMrrBrl: number;
  consumedValueBrl: number;
  realizedBreakageProfitBrl: number;
  floatingUnusedValueBrl: number;
  downgradeBookingsCount: number;
  downgradeSpreadProfitBrl: number;
  batches: {
    date: string;
    expiresAt: string | null;
    isExpired: boolean;
    tier: CreditTier;
    initialHours: number;
    usedHours: number;
    unusedHours: number;
    totalPaidBrl: number;
    hourlyRateBrl: number;
    unconsumedValueBrl: number;
    paymentMethod: "PIX" | "CREDIT_CARD";
  }[];
}

const TIER_RANK: Record<CreditTier, number> = {
  start: 1,
  vip: 2,
  master: 3,
};

export const DEFAULT_PACKAGE_HOURLY_RATES: Record<CreditTier, number> = {
  start: 33.38,
  vip: 41.13,
  master: 60.0,
};

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
 * Extrai o valor exato pago naquela fatura ([Paid:XX.XX]) ou a tarifa horária exata ([Rate:XX.XXXX])
 * gravados na descrição da transação da carteira.
 */
export function extractExactBatchFinancials(
  tx: WalletTxRow,
  fallbackHourlyRate: number,
): {
  totalPaidBrl: number;
  hourlyRateBrl: number;
} {
  const hours = Math.max(1, Math.abs(Number(tx.amount || 1)));
  const desc = String(tx.description || "");

  const paidMatch = desc.match(/\[Paid:(\d+(?:\.\d+)?)\]/i);
  if (paidMatch && Number(paidMatch[1]) > 0) {
    const exactPaid = Number(paidMatch[1]);
    return {
      totalPaidBrl: Number(exactPaid.toFixed(2)),
      hourlyRateBrl: exactPaid / hours,
    };
  }

  const rateMatch = desc.match(/\[Rate:(\d+(?:\.\d+)?)\]/i);
  if (rateMatch && Number(rateMatch[1]) > 0) {
    const exactRate = Number(rateMatch[1]);
    return {
      totalPaidBrl: Number((exactRate * hours).toFixed(2)),
      hourlyRateBrl: exactRate,
    };
  }

  return {
    totalPaidBrl: Number((fallbackHourlyRate * hours).toFixed(2)),
    hourlyRateBrl: fallbackHourlyRate,
  };
}

export function isAdminManualOrBonusTransaction(tx: WalletTxRow): boolean {
  const txType = String(tx.type || "").toLowerCase().trim();
  const desc = String(tx.description || "").toLowerCase().trim();

  if (
    txType === "admin_manual" ||
    txType === "manual" ||
    txType === "debit" ||
    desc.includes("admin manual") ||
    desc.includes("[admin manual]") ||
    desc.includes("[admin]") ||
    desc.includes("recarga admin") ||
    desc.includes("ajuste") ||
    desc.includes("cortesia") ||
    desc.includes("bônus") ||
    desc.includes("bonus") ||
    desc.includes("estorno")
  ) {
    return true;
  }

  return false;
}

export function isPaidSubscriptionTransaction(
  tx: WalletTxRow,
  userHasSubscriptionRecord: boolean = false,
): boolean {
  const amt = Number(tx.amount || 0);
  if (amt <= 0) return false;

  if (isAdminManualOrBonusTransaction(tx)) {
    return false;
  }

  const txType = String(tx.type || "").toLowerCase().trim();
  const desc = String(tx.description || "").toLowerCase().trim();

  if (
    txType === "package_purchase" ||
    desc.includes("[asaas:") ||
    desc.includes("[paid:") ||
    desc.includes("[rate:") ||
    desc.includes("[via:") ||
    desc.includes("assinatura") ||
    desc.includes("fusion pass") ||
    desc.includes("pacote") ||
    desc.includes("pix") ||
    desc.includes("cartão") ||
    desc.includes("cartao")
  ) {
    return true;
  }

  if (userHasSubscriptionRecord) {
    return true;
  }

  return false;
}

export function detectBatchPaymentMethod(
  tx: WalletTxRow,
  profile?: SubscriberProfileInfo,
): "PIX" | "CREDIT_CARD" {
  const desc = String(tx.description || "").toLowerCase();

  if (
    desc.includes("[via:pix]") ||
    desc.includes("pix (assinatura)") ||
    desc.includes("via pix") ||
    desc.includes("pagamento pix")
  ) {
    return "PIX";
  }

  if (
    desc.includes("[via:cartao]") ||
    desc.includes("[via:credit_card]") ||
    desc.includes("cartão") ||
    desc.includes("cartao") ||
    desc.includes("credit_card")
  ) {
    return "CREDIT_CARD";
  }

  if (profile?.cc_last4) {
    return "CREDIT_CARD";
  }

  return "PIX";
}

/**
 * 1. MOTOR FIFO CRONOLÓGICO DE SALDO DA CARTEIRA
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
        id: tx.id || "",
        userId: tx.user_id || "",
        tier,
        remaining: amt,
        initialAmount: amt,
        totalPaidBrl: DEFAULT_PACKAGE_HOURLY_RATES[tier] * amt,
        hourlyRateBrl: DEFAULT_PACKAGE_HOURLY_RATES[tier],
        createdAtMs: txTimeMs,
        expiresAtMs,
        description: String(tx.description || ""),
        paymentMethod: "PIX",
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
          if (b.expiresAtMs !== null && b.expiresAtMs < txTimeMs) continue;

          const used = Math.min(b.remaining, toConsume);
          b.remaining = Number((b.remaining - used).toFixed(4));
          toConsume = Number((toConsume - used).toFixed(4));
        }
      }
    }
  }

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
 * 3. PRECIFICADOR DO CRÉDITO UTILIZADO
 * Prioriza sempre o valor real que o assinante pagou ([Paid:XX.XX] / [Rate:XX.XXXX])
 * no lote ativo na data da reserva!
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

  const tierPackages = new Map<number, number>();
  for (const pkg of packages) {
    if (normalizeCreditTier(pkg.tier) !== normalizedUsedTier) continue;
    const h = Math.max(1, Number(pkg.hours) || 1);
    const p = Number(pkg.price) || 0;
    if (p <= 0) continue;
    const hourly = h > 1 && p > 120 ? p / h : p;
    tierPackages.set(h, Number(hourly.toFixed(2)));
  }

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
    positiveCreditsOfTier[positiveCreditsOfTier.length - 1] ||
    (userTransactions || []).filter(
      (tx) =>
        Number(tx.amount) > 0 &&
        normalizeCreditTier(tx.tier) === normalizedUsedTier &&
        !String(tx.description || "").toLowerCase().includes("estorno"),
    ).pop();

  let targetHours: number | null = null;

  if (latestCreditTx) {
    const desc = String(latestCreditTx.description || "");
    const hoursInTx = Math.max(1, Math.round(Number(latestCreditTx.amount || 1)));

    // 1º Prioridade: [Paid:XX.XX] (Valor exato pago na fatura)
    const paidMatch = desc.match(/\[Paid:(\d+(?:\.\d+)?)\]/i);
    if (paidMatch && Number(paidMatch[1]) > 0) {
      const paidBrl = Number(paidMatch[1]);
      return {
        hourlyRateBrl: Number((paidBrl / hoursInTx).toFixed(4)),
        matchedHours: hoursInTx,
        creditTier: normalizedUsedTier,
      };
    }

    // 2º Prioridade: [Rate:XX.XXXX] (Tarifa por hora gravada na compra)
    const rateMatch = desc.match(/\[Rate:(\d+(?:\.\d+)?)\]/i);
    if (rateMatch && Number(rateMatch[1]) > 0) {
      return {
        hourlyRateBrl: Number(rateMatch[1]),
        matchedHours: hoursInTx,
        creditTier: normalizedUsedTier,
      };
    }

    const descHoursMatch = desc.match(
      /(\d+)\s*(?:h|hora|horas|crédito|credito)/i,
    );
    targetHours =
      descHoursMatch && Number(descHoursMatch[1]) > 0
        ? Number(descHoursMatch[1])
        : hoursInTx;
  } else {
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

  return {
    hourlyRateBrl: DEFAULT_PACKAGE_HOURLY_RATES[normalizedUsedTier],
    matchedHours: targetHours,
    creditTier: normalizedUsedTier,
  };
}

/**
 * 4. MOTOR DE ARBITRAGEM DE DOWNGRADE (SPREAD DE CATEGORIA)
 */
export function calculatePackageBookingArbitrage(params: {
  creditTierRaw: string | null | undefined;
  roomTierRaw: string | null | undefined;
  creditsUsed: number;
  creditHourlyRateBrl: number;
  matchedPackageHours?: number | null;
  packages: PackageRow[];
  cohostSplitPct?: number | null;
}): DowngradeArbitrageResult {
  const {
    creditTierRaw,
    roomTierRaw,
    creditsUsed,
    creditHourlyRateBrl,
    matchedPackageHours = 16,
    packages = [],
    cohostSplitPct = null,
  } = params;

  const creditTier = normalizeCreditTier(creditTierRaw);
  const roomTier = normalizeCreditTier(roomTierRaw);
  const isDowngrade = TIER_RANK[creditTier] > TIER_RANK[roomTier];

  let roomReferenceHourlyRateBrl = creditHourlyRateBrl;

  if (isDowngrade) {
    const roomTierPkgs = packages.filter(
      (p) => normalizeCreditTier(p.tier) === roomTier && Number(p.price) > 0,
    );

    if (roomTierPkgs.length > 0) {
      const targetH = matchedPackageHours || 16;
      let bestPkg = roomTierPkgs[0];
      let minDiff = Infinity;

      for (const p of roomTierPkgs) {
        const diff = Math.abs(Number(p.hours) - targetH);
        if (diff < minDiff) {
          minDiff = diff;
          bestPkg = p;
        }
      }
      const h = Math.max(1, Number(bestPkg.hours) || 1);
      const pr = Number(bestPkg.price) || 0;
      const candidateRate = h > 1 && pr > 120 ? pr / h : pr;
      roomReferenceHourlyRateBrl = Math.min(
        creditHourlyRateBrl,
        Number(candidateRate.toFixed(2)),
      );
    } else {
      roomReferenceHourlyRateBrl = Math.min(
        creditHourlyRateBrl,
        DEFAULT_PACKAGE_HOURLY_RATES[roomTier],
      );
    }
  }

  const units = Math.max(1, Number(creditsUsed) || 1);
  const grossCreditValueBrl = Number(
    (creditHourlyRateBrl * units).toFixed(2),
  );
  const roomBaseValueBrl = Number(
    (roomReferenceHourlyRateBrl * units).toFixed(2),
  );

  const downgradeSpreadProfitBrl = Math.max(
    0,
    Number((grossCreditValueBrl - roomBaseValueBrl).toFixed(2)),
  );

  let hostPayoutBrl = 0;
  let cohostPayoutBrl = 0;
  let standardPlatformFeeBrl = 0;

  if (cohostSplitPct && cohostSplitPct > 0) {
    cohostPayoutBrl = Number(
      (roomBaseValueBrl * (cohostSplitPct / 100)).toFixed(2),
    );
    standardPlatformFeeBrl = Math.max(
      0,
      Number((roomBaseValueBrl - cohostPayoutBrl).toFixed(2)),
    );
  } else {
    standardPlatformFeeBrl = Number((roomBaseValueBrl * 0.2).toFixed(2));
    hostPayoutBrl = Math.max(
      0,
      Number((roomBaseValueBrl - standardPlatformFeeBrl).toFixed(2)),
    );
  }

  const totalPlatformProfitBrl = Number(
    (standardPlatformFeeBrl + downgradeSpreadProfitBrl).toFixed(2),
  );

  return {
    creditTier,
    roomTier,
    isDowngrade,
    creditHourlyRateBrl,
    roomReferenceHourlyRateBrl,
    grossCreditValueBrl,
    roomBaseValueBrl,
    standardPlatformFeeBrl,
    downgradeSpreadProfitBrl,
    totalPlatformProfitBrl,
    hostPayoutBrl,
    cohostPayoutBrl,
  };
}

/**
 * 5. MOTOR COMPLETO DE INTELIGÊNCIA DE ASSINATURAS
 * Usa exatamente o valor pago em cada ciclo ([Paid:XX.XX] / [Rate:XX.XXXX]).
 */
export function computeSubscribersBreakageReport(params: {
  allWalletTransactions: WalletTxRow[];
  allSubscriptions: SubscriptionRow[];
  allPackages: PackageRow[];
  profilesMap: Map<string, SubscriberProfileInfo>;
  downgradeStatsByUser?: Map<
    string,
    { count: number; spreadProfitBrl: number }
  >;
  referenceDate?: Date;
}): {
  subscribers: SubscriberPackageAnalytics[];
  totals: {
    totalSubscribersCount: number;
    activeSubscribersCount: number;
    renewedSubscribersCount: number;
    reactivatedSubscribersCount: number;
    expiringSoonCount: number;
    overdueCount: number;
    cancelledCount: number;
    pixSubscribersCount: number;
    cardSubscribersCount: number;
    activeMrrBrl: number;
    totalPurchasedHours: number;
    totalUsedHours: number;
    totalExpiredUnusedHours: number;
    totalActiveRemainingHours: number;
    totalInvestedBrl: number;
    totalRealizedBreakageProfitBrl: number;
    totalFloatingUnusedValueBrl: number;
    totalDowngradeSpreadProfitBrl: number;
  };
} {
  const {
    allWalletTransactions = [],
    allSubscriptions = [],
    allPackages = [],
    profilesMap,
    downgradeStatsByUser = new Map(),
    referenceDate = new Date(),
  } = params;

  const nowMs = referenceDate.getTime();
  const DAY_MS = 24 * 60 * 60 * 1000;

  const pkgHourlyLookup: Record<CreditTier, Map<number, number>> = {
    start: new Map(),
    vip: new Map(),
    master: new Map(),
  };

  for (const pkg of allPackages) {
    const t = normalizeCreditTier(pkg.tier);
    const h = Math.max(1, Number(pkg.hours) || 1);
    const p = Number(pkg.price) || 0;
    if (p > 0) {
      pkgHourlyLookup[t].set(
        h,
        Number((p > 120 && h > 1 ? p / h : p).toFixed(2)),
      );
    }
  }

  const inferBatchFinancials = (
    tx: WalletTxRow,
    tier: CreditTier,
  ): { totalPaidBrl: number; hourlyRateBrl: number } => {
    const hours = Math.max(1, Math.round(Math.abs(Number(tx.amount || 1))));
    const tierMap = pkgHourlyLookup[tier];
    const catalogFallbackRate =
      (tierMap && tierMap.get(hours)) ||
      (tierMap && tierMap.size > 0
        ? Array.from(tierMap.values())[0]
        : DEFAULT_PACKAGE_HOURLY_RATES[tier]);

    return extractExactBatchFinancials(tx, catalogFallbackRate);
  };

  const txsByUser = new Map<string, WalletTxRow[]>();
  for (const tx of allWalletTransactions) {
    if (!tx.user_id) continue;
    const list = txsByUser.get(tx.user_id) || [];
    list.push(tx);
    txsByUser.set(tx.user_id, list);
  }

  const subsByUser = new Map<string, SubscriptionRow[]>();
  for (const s of allSubscriptions) {
    if (!s.user_id) continue;
    const list = subsByUser.get(s.user_id) || [];
    list.push(s);
    subsByUser.set(s.user_id, list);
  }

  const candidateUserIds = new Set<string>([
    ...Array.from(subsByUser.keys()),
    ...Array.from(txsByUser.keys()),
  ]);

  const subscribers: SubscriberPackageAnalytics[] = [];

  const cascadeOrder: Record<CreditTier, CreditTier[]> = {
    start: ["start", "vip", "master"],
    vip: ["vip", "master"],
    master: ["master"],
  };

  for (const userId of candidateUserIds) {
    const prof = profilesMap.get(userId);
    const userSubs = (subsByUser.get(userId) || []).sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tA - tB;
    });

    const hasSubRecord = userSubs.length > 0;
    const latestSubRecord = userSubs[userSubs.length - 1] || null;
    const activeSub =
      userSubs.find((s) => s.status === "ACTIVE") || latestSubRecord;

    const userTxs = (txsByUser.get(userId) || []).sort((a, b) => {
      const tA = a.created_at ? new Date(a.created_at).getTime() : 0;
      const tB = b.created_at ? new Date(b.created_at).getTime() : 0;
      return tA - tB;
    });

    const hasPaidPackageTx = userTxs.some((tx) =>
      isPaidSubscriptionTransaction(tx, hasSubRecord),
    );

    if (!hasSubRecord && !hasPaidPackageTx) {
      continue;
    }

    const paidBuckets: Record<CreditTier, CreditBucket[]> = {
      start: [],
      vip: [],
      master: [],
    };

    const manualBuckets: Record<CreditTier, CreditBucket[]> = {
      start: [],
      vip: [],
      master: [],
    };

    for (const tx of userTxs) {
      const amt = Number(tx.amount || 0);
      if (amt === 0) continue;

      const descLower = String(tx.description || "").toLowerCase();
      const isRefund = descLower.includes("estorno");
      const tier = normalizeCreditTier(tx.tier);
      const txTimeMs = tx.created_at
        ? new Date(tx.created_at).getTime()
        : nowMs;
      const expiresAtMs = tx.expires_at
        ? new Date(tx.expires_at).getTime()
        : txTimeMs + 30 * DAY_MS;

      if (amt > 0) {
        if (isRefund) {
          const tierPaid = paidBuckets[tier];
          const targetBucket =
            tierPaid.find(
              (b) =>
                b.remaining < b.initialAmount &&
                (!b.expiresAtMs || b.expiresAtMs >= txTimeMs),
            ) || tierPaid[tierPaid.length - 1];

          if (targetBucket) {
            targetBucket.remaining = Math.min(
              targetBucket.initialAmount,
              Number((targetBucket.remaining + amt).toFixed(4)),
            );
          }
          continue;
        }

        if (isPaidSubscriptionTransaction(tx, hasSubRecord)) {
          const { totalPaidBrl, hourlyRateBrl } = inferBatchFinancials(
            tx,
            tier,
          );
          const method = detectBatchPaymentMethod(tx, prof);
          paidBuckets[tier].push({
            id: tx.id || "",
            userId,
            tier,
            remaining: amt,
            initialAmount: amt,
            totalPaidBrl,
            hourlyRateBrl,
            createdAtMs: txTimeMs,
            expiresAtMs,
            description: String(tx.description || ""),
            paymentMethod: method,
          });
        } else {
          manualBuckets[tier].push({
            id: tx.id || "",
            userId,
            tier,
            remaining: amt,
            initialAmount: amt,
            totalPaidBrl: 0,
            hourlyRateBrl: 0,
            createdAtMs: txTimeMs,
            expiresAtMs,
            description: String(tx.description || ""),
            paymentMethod: "PIX",
          });
        }
      } else {
        let toConsume = Math.abs(amt);
        const allowedTiers = cascadeOrder[tier];

        for (const candidateTier of allowedTiers) {
          if (toConsume <= 0) break;

          const combined = [
            ...paidBuckets[candidateTier],
            ...manualBuckets[candidateTier],
          ].sort((a, b) => a.createdAtMs - b.createdAtMs);

          for (const b of combined) {
            if (toConsume <= 0) break;
            if (b.remaining <= 0) continue;
            if (b.expiresAtMs !== null && b.expiresAtMs < txTimeMs) continue;

            const used = Math.min(b.remaining, toConsume);
            b.remaining = Number((b.remaining - used).toFixed(4));
            toConsume = Number((toConsume - used).toFixed(4));
          }
        }
      }
    }

    let allPaidChronological = [
      ...paidBuckets.start,
      ...paidBuckets.vip,
      ...paidBuckets.master,
    ].sort((a, b) => a.createdAtMs - b.createdAtMs);

    if (allPaidChronological.length === 0) {
      continue;
    }

    const monthsSubscribed = allPaidChronological.length;
    const renewalsCount = Math.max(0, monthsSubscribed - 1);
    const hasRenewed = monthsSubscribed >= 2;

    const firstBatch = allPaidChronological[0];
    const latestBatch = allPaidChronological[allPaidChronological.length - 1];

    const cancelledSubs = userSubs.filter((s) => s.status === "CANCELLED");
    const cancelledHistoryCount = cancelledSubs.length;

    let hadGapGreaterThan38Days = false;
    for (let i = 1; i < allPaidChronological.length; i++) {
      const prev = allPaidChronological[i - 1];
      const curr = allPaidChronological[i];
      if (curr.createdAtMs - prev.createdAtMs > 38 * DAY_MS) {
        hadGapGreaterThan38Days = true;
        break;
      }
    }

    const hadCancelledBeforeLatest = cancelledSubs.some((c) => {
      const cTime = c.created_at ? new Date(c.created_at).getTime() : 0;
      return cTime > 0 && cTime < latestBatch.createdAtMs;
    });

    const usedPix = allPaidChronological.some((b) => b.paymentMethod === "PIX");
    const usedCard = allPaidChronological.some(
      (b) => b.paymentMethod === "CREDIT_CARD",
    );
    const paymentMethod: SubscriptionPaymentMethod =
      usedPix && usedCard ? "MIXED" : usedCard ? "CREDIT_CARD" : "PIX";

    const currentExpiresMs =
      latestBatch.expiresAtMs || latestBatch.createdAtMs + 30 * DAY_MS;
    const daysUntilExpiry = Math.ceil((currentExpiresMs - nowMs) / DAY_MS);

    const isExplicitlyCancelled = latestSubRecord?.status === "CANCELLED";
    const isCurrentlyActive = daysUntilExpiry >= 0 && !isExplicitlyCancelled;
    const isExpiringSoon =
      isCurrentlyActive && daysUntilExpiry >= 0 && daysUntilExpiry <= 7;
    const isOverdue =
      !isExplicitlyCancelled &&
      daysUntilExpiry < 0 &&
      daysUntilExpiry >= -45;
    const isCancelled =
      isExplicitlyCancelled || (!isCurrentlyActive && daysUntilExpiry < -45);

    const hasReactivated =
      monthsSubscribed >= 2 &&
      (hadGapGreaterThan38Days ||
        hadCancelledBeforeLatest ||
        (cancelledHistoryCount > 0 && isCurrentlyActive));

    let lifecycleStatus: SubscriberLifecycleStatus = "NEW";
    if (isCancelled) {
      lifecycleStatus = "CANCELLED";
    } else if (isOverdue) {
      lifecycleStatus = "OVERDUE";
    } else if (isExpiringSoon) {
      lifecycleStatus = "EXPIRING_SOON";
    } else if (hasReactivated) {
      lifecycleStatus = "REACTIVATED";
    } else if (hasRenewed) {
      lifecycleStatus = "RENEWED";
    } else {
      lifecycleStatus = "NEW";
    }

    const allPaidDesc = [...allPaidChronological].reverse();

    let purchasedHoursTotal = 0;
    let usedHoursTotal = 0;
    let activeRemainingHours = 0;
    let expiredUnusedHours = 0;
    let totalInvestedBrl = 0;
    let consumedValueBrl = 0;
    let realizedBreakageProfitBrl = 0;
    let floatingUnusedValueBrl = 0;

    const batchDetails = allPaidDesc.map((b) => {
      const isExpired = b.expiresAtMs !== null && b.expiresAtMs < nowMs;
      const usedH = Math.max(
        0,
        Number((b.initialAmount - b.remaining).toFixed(2)),
      );
      const unusedH = Math.max(0, Number(b.remaining.toFixed(2)));

      // Proporção exata sobre o valor real pago no lote (evita erro de arredondamento de centavos)
      const unconsumedBrl =
        b.initialAmount > 0
          ? Number(((unusedH / b.initialAmount) * b.totalPaidBrl).toFixed(2))
          : 0;
      const consumedBrl = Number((b.totalPaidBrl - unconsumedBrl).toFixed(2));

      purchasedHoursTotal += b.initialAmount;
      usedHoursTotal += usedH;
      totalInvestedBrl += b.totalPaidBrl;
      consumedValueBrl += consumedBrl;

      if (isExpired) {
        expiredUnusedHours += unusedH;
        realizedBreakageProfitBrl += unconsumedBrl;
      } else {
        activeRemainingHours += unusedH;
        floatingUnusedValueBrl += unconsumedBrl;
      }

      return {
        date: new Date(b.createdAtMs).toISOString(),
        expiresAt: b.expiresAtMs ? new Date(b.expiresAtMs).toISOString() : null,
        isExpired,
        tier: b.tier,
        initialHours: b.initialAmount,
        usedHours: usedH,
        unusedHours: unusedH,
        totalPaidBrl: b.totalPaidBrl,
        hourlyRateBrl: Number(b.hourlyRateBrl.toFixed(2)),
        unconsumedValueBrl: unconsumedBrl,
        paymentMethod: b.paymentMethod,
      };
    });

    const dgStats = downgradeStatsByUser.get(userId) || {
      count: 0,
      spreadProfitBrl: 0,
    };

    const utilizationPct =
      purchasedHoursTotal > 0
        ? Math.min(100, Math.round((usedHoursTotal / purchasedHoursTotal) * 100))
        : 0;

    // O MRR atual é exatamente o valor pago na última assinatura/renovação ativa
    const currentMrrBrl = isCurrentlyActive
      ? Number(latestBatch.totalPaidBrl.toFixed(2))
      : 0;

    subscribers.push({
      userId,
      specialistName: prof?.full_name || "Profissional Assinante",
      specialistEmail: prof?.email || "",
      specialistPhone: prof?.whatsapp || prof?.phone || null,
      activePlanTier: activeSub
        ? normalizeCreditTier(activeSub.tier)
        : latestBatch.tier,
      activePlanHours: activeSub
        ? Number(activeSub.hours)
        : latestBatch.initialAmount,
      subscriptionStatus: isCancelled
        ? "CANCELLED"
        : isOverdue
          ? "OVERDUE"
          : "ACTIVE",
      lifecycleStatus,
      paymentMethod,
      cardLast4: prof?.cc_last4 || null,
      cardBrand: prof?.cc_brand || null,
      monthsSubscribed,
      renewalsCount,
      cancelledHistoryCount,
      hasRenewed,
      hasReactivated,
      isCurrentlyActive,
      isExpiringSoon,
      isOverdue,
      isCancelled,
      firstSubscriptionDate: new Date(firstBatch.createdAtMs).toISOString(),
      lastPaymentDate: new Date(latestBatch.createdAtMs).toISOString(),
      currentExpiresAt: new Date(currentExpiresMs).toISOString(),
      daysUntilExpiry,
      purchasedHoursTotal: Number(purchasedHoursTotal.toFixed(2)),
      usedHoursTotal: Number(usedHoursTotal.toFixed(2)),
      activeRemainingHours: Number(activeRemainingHours.toFixed(2)),
      expiredUnusedHours: Number(expiredUnusedHours.toFixed(2)),
      utilizationPct,
      totalInvestedBrl: Number(totalInvestedBrl.toFixed(2)),
      currentMrrBrl,
      consumedValueBrl: Number(consumedValueBrl.toFixed(2)),
      realizedBreakageProfitBrl: Number(realizedBreakageProfitBrl.toFixed(2)),
      floatingUnusedValueBrl: Number(floatingUnusedValueBrl.toFixed(2)),
      downgradeBookingsCount: dgStats.count,
      downgradeSpreadProfitBrl: Number(dgStats.spreadProfitBrl.toFixed(2)),
      batches: batchDetails,
    });
  }

  subscribers.sort((a, b) => {
    const lA = a.lastPaymentDate ? new Date(a.lastPaymentDate).getTime() : 0;
    const lB = b.lastPaymentDate ? new Date(b.lastPaymentDate).getTime() : 0;
    return lB - lA;
  });

  const totals = subscribers.reduce(
    (acc, curr) => {
      acc.totalSubscribersCount += 1;
      if (curr.isCurrentlyActive) acc.activeSubscribersCount += 1;
      if (curr.hasRenewed) acc.renewedSubscribersCount += 1;
      if (curr.hasReactivated) acc.reactivatedSubscribersCount += 1;
      if (curr.isExpiringSoon) acc.expiringSoonCount += 1;
      if (curr.isOverdue) acc.overdueCount += 1;
      if (curr.isCancelled) acc.cancelledCount += 1;

      if (curr.paymentMethod === "PIX") acc.pixSubscribersCount += 1;
      else acc.cardSubscribersCount += 1;

      acc.activeMrrBrl += curr.currentMrrBrl;
      acc.totalPurchasedHours += curr.purchasedHoursTotal;
      acc.totalUsedHours += curr.usedHoursTotal;
      acc.totalExpiredUnusedHours += curr.expiredUnusedHours;
      acc.totalActiveRemainingHours += curr.activeRemainingHours;
      acc.totalInvestedBrl += curr.totalInvestedBrl;
      acc.totalRealizedBreakageProfitBrl += curr.realizedBreakageProfitBrl;
      acc.totalFloatingUnusedValueBrl += curr.floatingUnusedValueBrl;
      acc.totalDowngradeSpreadProfitBrl += curr.downgradeSpreadProfitBrl;
      return acc;
    },
    {
      totalSubscribersCount: 0,
      activeSubscribersCount: 0,
      renewedSubscribersCount: 0,
      reactivatedSubscribersCount: 0,
      expiringSoonCount: 0,
      overdueCount: 0,
      cancelledCount: 0,
      pixSubscribersCount: 0,
      cardSubscribersCount: 0,
      activeMrrBrl: 0,
      totalPurchasedHours: 0,
      totalUsedHours: 0,
      totalExpiredUnusedHours: 0,
      totalActiveRemainingHours: 0,
      totalInvestedBrl: 0,
      totalRealizedBreakageProfitBrl: 0,
      totalFloatingUnusedValueBrl: 0,
      totalDowngradeSpreadProfitBrl: 0,
    },
  );

  return { subscribers, totals };
}