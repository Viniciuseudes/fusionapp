"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  ShieldCheck,
  Mail,
  Phone,
  MapPin,
  Calendar as CalendarIcon,
  TrendingUp,
  Award,
  Wallet,
  ChevronLeft,
  Loader2,
  Ban,
  CheckCircle2,
  Building2,
  Activity,
  Crown,
  Star,
  FileSpreadsheet,
  Users,
  FileText,
  Sparkles,
  ExternalLink,
  MessageCircle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { format, parseISO, differenceInDays } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface PartnerBookingDetail {
  id: string;
  room_id: string;
  room_name: string;
  user_id: string;
  specialist_name: string;
  start_time: string;
  end_time: string;
  status: string;
  is_contract: boolean;
  pricing_label: string;
  gross_brl: number;
  platform_fee_brl: number;
  cohost_name: string | null;
  cohost_payout_brl: number;
  partner_net_brl: number;
}

interface Partner {
  id: string;
  full_name: string;
  avatar_url: string | null;
  document_number: string;
  city: string;
  state: string;
  created_at: string;
  phone: string;
  whatsapp: string;
  email: string;
  roomsCount: number;
  activeRoomsCount: number;
  contractsCount: number;
  bookingsCount: number;
  gmv: number;
  platformFee: number;
  cohostTotal: number;
  partnerNet: number;
  lastBookingDate: string | null;
  tier: "Start" | "Gold" | "Platinum" | "Diamond";
  status: "active" | "suspended";
  myRooms: any[];
  myContracts: any[];
  detailedBookings: PartnerBookingDetail[];
}

function normalizeTier(tier?: string | null): "start" | "vip" | "master" {
  const t = (tier || "start").toLowerCase().trim();
  if (t.includes("master")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

function formatTierLabel(tier: "start" | "vip" | "master"): string {
  if (tier === "master") return "Master";
  if (tier === "vip") return "VIP";
  return "Basic";
}

function extractRoomModalitiesHourlyRate(
  modalities: any,
  addressDetails?: any,
): number | null {
  try {
    if (modalities) {
      const parsed =
        typeof modalities === "string" ? JSON.parse(modalities) : modalities;
      const candidates = [
        parsed?.hourly?.price,
        parsed?.hourlyPrice,
        parsed?.price_per_hour,
        parsed?.pricePerHour,
        parsed?.price,
      ];
      for (const c of candidates) {
        const val = Number(c);
        if (!isNaN(val) && val > 0 && val <= 250) return val;
      }
    }
    if (addressDetails) {
      const addr =
        typeof addressDetails === "string"
          ? JSON.parse(addressDetails)
          : addressDetails;
      const addrPrice = Number(addr?.pricing?.hourly);
      if (!isNaN(addrPrice) && addrPrice > 0 && addrPrice <= 250) {
        return addrPrice;
      }
    }
  } catch {
    return null;
  }
  return null;
}

function calculateSlotUnits(startIso: string, endIso: string): number {
  const diffMinutes =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
  if (diffMinutes <= 0) return 1;
  if (diffMinutes >= 45 && diffMinutes <= 65) return 1;
  return Math.max(1, Math.round(diffMinutes / 55));
}

// Motor Sênior de Exportação para Excel (CSV compatível com o Brasil)
const exportToCSV = (headers: string[], rows: any[][], filename: string) => {
  const csvContent = [
    headers.join(";"),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";"),
    ),
  ].join("\n");

  const blob = new Blob(["\ufeff", csvContent], {
    type: "text/csv;charset=utf-8;",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute(
    "download",
    `${filename}_${format(new Date(), "dd-MM-yyyy")}.csv`,
  );
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
};

export function AdminPartnersTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [partners, setPartners] = useState<Partner[]>([]);

  const [search, setSearch] = useState("");
  const [selectedProfile, setSelectedProfile] = useState<Partner | null>(null);

  // Controles de View do Dossiê
  const [dossierTab, setDossierTab] = useState<
    "bookings" | "rooms" | "contracts"
  >("bookings");

  // Filtros de Reservas no Dossiê
  const [roomFilter, setRoomFilter] = useState<"all" | string>("all");
  const [originFilter, setOriginFilter] = useState<
    "all" | "marketplace" | "contract"
  >("all");
  const [bookingFilter, setBookingFilter] = useState<
    "all" | "30" | "90" | "custom"
  >("all");
  const [customStartDate, setCustomStartDate] = useState("");
  const [customEndDate, setCustomEndDate] = useState("");

  useEffect(() => {
    fetchPartners();
  }, [supabase]);

  const fetchPartners = async () => {
    setLoading(true);
    try {
      const { data: rooms, error: rErr } = await supabase
        .from("rooms")
        .select("*");
      if (rErr) throw rErr;

      const safeRooms = rooms || [];
      const hostIds = [
        ...new Set(safeRooms.map((r: any) => r.host_id).filter(Boolean)),
      ];

      if (hostIds.length === 0) {
        setPartners([]);
        setLoading(false);
        return;
      }

      const allRoomIds = safeRooms.map((r: any) => r.id);

      const [
        profilesRes,
        bookingsRes,
        packagesRes,
        categoriesRes,
        contractsRes,
      ] = await Promise.all([
        supabase.from("profiles").select("*").in("id", hostIds),
        allRoomIds.length > 0
          ? supabase
              .from("bookings")
              .select(
                "id, created_at, start_time, end_time, total_cost, upgrade_fee_amount, status, room_id, user_id, contract_id, booking_origin, agreed_value_brl",
              )
              .in("room_id", allRoomIds)
              .in("status", ["confirmed", "completed"])
              .order("start_time", { ascending: false })
          : Promise.resolve({ data: [] as any[], error: null }),
        supabase.from("packages").select("id, tier, hours, price, active"),
        supabase
          .from("room_categories")
          .select("id, name, credit_cost_per_hour, upgrade_fee_per_hour"),
        allRoomIds.length > 0
          ? supabase
              .from("room_contracts")
              .select("*")
              .in("room_id", allRoomIds)
          : Promise.resolve({ data: [] as any[], error: null }),
      ]);

      if (profilesRes.error) throw profilesRes.error;
      if (bookingsRes.error) throw bookingsRes.error;

      const hostProfiles = profilesRes.data || [];
      const allBookings = bookingsRes.data || [];
      const contractsData = contractsRes.data || [];

      const guestUserIds = [
        ...new Set(allBookings.map((b: any) => b.user_id).filter(Boolean)),
      ];
      const bookingIds = allBookings.map((b: any) => b.id).filter(Boolean);

      const [guestProfilesRes, walletRes, subsRes, couponsRes] =
        await Promise.all([
          guestUserIds.length > 0
            ? supabase
                .from("profiles")
                .select("id, full_name")
                .in("id", guestUserIds)
            : Promise.resolve({ data: [] as any[] }),
          guestUserIds.length > 0
            ? supabase
                .from("wallet_transactions")
                .select(
                  "id, user_id, amount, type, description, tier, created_at, expires_at",
                )
                .in("user_id", guestUserIds)
                .order("created_at", { ascending: true })
            : Promise.resolve({ data: [] as any[] }),
          guestUserIds.length > 0
            ? supabase
                .from("subscriptions")
                .select("id, user_id, tier, hours, status, created_at")
                .in("user_id", guestUserIds)
            : Promise.resolve({ data: [] as any[] }),
          bookingIds.length > 0
            ? supabase
                .from("coupon_uses")
                .select("booking_id, discount_applied")
                .in("booking_id", bookingIds)
            : Promise.resolve({ data: [] as any[] }),
        ]);

      const guestNameMap = new Map<string, string>(
        (guestProfilesRes.data || []).map((g: any) => [
          g.id,
          g.full_name || "Profissional",
        ]),
      );

      const roomsMap = new Map<string, any>(
        safeRooms.map((r: any) => [r.id, r]),
      );
      const categoriesMap = new Map<string, any>(
        (categoriesRes.data || []).map((c: any) => [c.id, c]),
      );
      const contractsById = new Map<string, any>(
        contractsData.map((c: any) => [c.id, c]),
      );
      const activeCohostByRoomId = new Map<string, any>();
      contractsData.forEach((c: any) => {
        if (
          c.status === "active" &&
          c.contract_type === "monthly_exclusive" &&
          c.allow_sublease
        ) {
          activeCohostByRoomId.set(c.room_id, c);
        }
      });

      const packageRateMap: Record<
        "start" | "vip" | "master",
        Map<number, number>
      > = {
        start: new Map<number, number>(),
        vip: new Map<number, number>(),
        master: new Map<number, number>(),
      };

      (packagesRes.data || []).forEach((pkg: any) => {
        const t = normalizeTier(pkg.tier);
        const h = Math.max(1, Number(pkg.hours) || 1);
        const rawPrice = Number(pkg.price) || 0;
        if (rawPrice <= 0) return;

        const hourlyRate = h > 1 && rawPrice > 120 ? rawPrice / h : rawPrice;
        packageRateMap[t].set(h, hourlyRate);
      });

      const couponDiscountMap = new Map<string, number>();
      (couponsRes.data || []).forEach((cu: any) => {
        if (cu.booking_id) {
          couponDiscountMap.set(
            cu.booking_id,
            (couponDiscountMap.get(cu.booking_id) || 0) +
              Number(cu.discount_applied || 0),
          );
        }
      });

      const userWalletMap = new Map<string, any[]>();
      (walletRes.data || []).forEach((tx: any) => {
        const list = userWalletMap.get(tx.user_id) || [];
        list.push(tx);
        userWalletMap.set(tx.user_id, list);
      });

      const userSubsMap = new Map<string, any[]>();
      (subsRes.data || []).forEach((sub: any) => {
        const list = userSubsMap.get(sub.user_id) || [];
        list.push(sub);
        userSubsMap.set(sub.user_id, list);
      });

      const getRateFromPackageTable = (
        tier: "start" | "vip" | "master",
        targetHours?: number | null,
      ): { rate: number | null; matchedHours: number | null } => {
        const tierPackages = packageRateMap[tier];
        if (!tierPackages || tierPackages.size === 0) {
          return { rate: null, matchedHours: null };
        }
        if (targetHours && tierPackages.has(targetHours)) {
          return {
            rate: tierPackages.get(targetHours)!,
            matchedHours: targetHours,
          };
        }
        if (targetHours && targetHours > 0) {
          let closestHours: number | null = null;
          let minDiff = Infinity;
          for (const [h] of tierPackages.entries()) {
            const diff = Math.abs(h - targetHours);
            if (diff < minDiff) {
              minDiff = diff;
              closestHours = h;
            }
          }
          if (closestHours !== null && minDiff <= 4) {
            return {
              rate: tierPackages.get(closestHours)!,
              matchedHours: closestHours,
            };
          }
        }
        if (tierPackages.has(1)) {
          return { rate: tierPackages.get(1)!, matchedHours: 1 };
        }
        const sortedHours = Array.from(tierPackages.keys()).sort(
          (a, b) => a - b,
        );
        const firstH = sortedHours[0];
        return { rate: tierPackages.get(firstH)!, matchedHours: firstH };
      };

      // Função unificada que resolve o financeiro exato de cada reserva do parceiro
      const evaluateBookingDetail = (b: any): PartnerBookingDetail => {
        const room = roomsMap.get(b.room_id);
        const roomTier = normalizeTier(room?.tier);
        const slotUnits =
          b.start_time && b.end_time
            ? calculateSlotUnits(b.start_time, b.end_time)
            : 1;

        const linkedContract = b.contract_id
          ? contractsById.get(b.contract_id)
          : null;
        const isContractBooking = Boolean(
          b.contract_id ||
          (b.booking_origin && String(b.booking_origin).startsWith("contract")),
        );

        // 1. Reserva de Contrato (Usa a % configurada no contrato)
        if (isContractBooking) {
          const val =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : Number(linkedContract?.session_value || 0);
          const feePct = Number(linkedContract?.platform_fee_pct ?? 15) / 100;
          const platformFee = val * feePct;
          const partnerNet = Math.max(0, val - platformFee);

          const cType = linkedContract?.contract_type || b.booking_origin || "";
          let typeLabel = "Contrato • Alocação Fixa";
          if (cType.includes("monthly_exclusive"))
            typeLabel = "Contrato • Sala Fixa Mensal";
          else if (cType.includes("fixed_shift"))
            typeLabel = "Contrato • Turno Fixo";
          else if (cType.includes("fixed_daily"))
            typeLabel = "Contrato • Diária Fixa";

          return {
            id: b.id,
            room_id: b.room_id,
            room_name: room?.name || "Sala Removida",
            user_id: b.user_id,
            specialist_name:
              linkedContract?.specialist_name ||
              guestNameMap.get(b.user_id) ||
              "Locatário de Contrato",
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            is_contract: true,
            pricing_label: typeLabel,
            gross_brl: val,
            platform_fee_brl: platformFee,
            cohost_name: null,
            cohost_payout_brl: 0,
            partner_net_brl: partnerNet,
          };
        }

        // Verifica se a sala possui Co-Anfitrião ativo para sublocação
        const roomCohost = activeCohostByRoomId.get(b.room_id);
        const cohostName = roomCohost?.specialist_name || null;
        const cohostSplitPct = roomCohost
          ? Number(roomCohost.cohost_split_pct || 0)
          : 0;

        // 2. Reserva Avulsa: Take Rate Fusion de 20%
        const computeAvulsoSplit = (grossVal: number) => {
          const platformFee = grossVal * 0.2; // 20% Fusion
          const netAfterFusion = Math.max(0, grossVal - platformFee); // 80%
          const cohostPayout =
            cohostSplitPct > 0 ? netAfterFusion * (cohostSplitPct / 100) : 0;
          const partnerNet = Math.max(0, netAfterFusion - cohostPayout);
          return { platformFee, cohostPayout, partnerNet };
        };

        const rawTotalCost = Number(b.total_cost || 0);
        const upgradeFee = Number(b.upgrade_fee_amount || 0);
        const discount = couponDiscountMap.get(b.id) || 0;

        if (Number(b.agreed_value_brl) > 0 || rawTotalCost >= slotUnits * 20) {
          const baseVal =
            Number(b.agreed_value_brl) > 0
              ? Number(b.agreed_value_brl)
              : rawTotalCost;
          const grossBrl = Math.max(0, baseVal + upgradeFee - discount);
          const split = computeAvulsoSplit(grossBrl);

          return {
            id: b.id,
            room_id: b.room_id,
            room_name: room?.name || "Sala Removida",
            user_id: b.user_id,
            specialist_name:
              guestNameMap.get(b.user_id) || "Especialista Parceiro",
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            is_contract: false,
            pricing_label: `${formatTierLabel(roomTier)} • Reserva Direta`,
            gross_brl: grossBrl,
            platform_fee_brl: split.platformFee,
            cohost_name: cohostName,
            cohost_payout_brl: split.cohostPayout,
            partner_net_brl: split.partnerNet,
          };
        }

        // Reserva via Créditos / Pacotes
        const creditsForThisSlot =
          rawTotalCost > 0 && rawTotalCost <= slotUnits * 2
            ? rawTotalCost
            : slotUnits;

        const userTxs = userWalletMap.get(b.user_id) || [];
        const bookingTime = b.created_at
          ? new Date(b.created_at).getTime()
          : new Date(b.start_time).getTime();

        let creditTierUsed: "start" | "vip" | "master" = roomTier;
        const matchingDebit = userTxs.find((tx: any) => {
          if (Number(tx.amount) >= 0) return false;
          const txTime = new Date(tx.created_at).getTime();
          return Math.abs(txTime - bookingTime) <= 10 * 60 * 1000;
        });
        if (matchingDebit?.tier) {
          creditTierUsed = normalizeTier(matchingDebit.tier);
        }

        const compatibleTiers: ("start" | "vip" | "master")[] =
          roomTier === "master"
            ? ["master"]
            : roomTier === "vip"
              ? ["vip", "master"]
              : ["start", "vip", "master"];

        const purchaseCredits = userTxs.filter(
          (tx: any) =>
            Number(tx.amount) > 0 &&
            !String(tx.description || "")
              .toLowerCase()
              .includes("estorno"),
        );

        const validPriorPurchases = purchaseCredits.filter((tx: any) => {
          const createdMs = new Date(tx.created_at).getTime();
          const notAfterBooking = createdMs <= bookingTime + 60 * 1000;
          const notExpiredAtBooking =
            !tx.expires_at || new Date(tx.expires_at).getTime() >= bookingTime;
          return notAfterBooking && notExpiredAtBooking;
        });

        const candidateCredits =
          validPriorPurchases.length > 0
            ? validPriorPurchases
            : purchaseCredits;

        const sourceCreditTx =
          [...candidateCredits]
            .reverse()
            .find((tx: any) => normalizeTier(tx.tier) === creditTierUsed) ||
          [...candidateCredits]
            .reverse()
            .find((tx: any) =>
              compatibleTiers.includes(normalizeTier(tx.tier)),
            ) ||
          candidateCredits[candidateCredits.length - 1];

        let detectedPackageHours: number | null = null;
        if (sourceCreditTx) {
          creditTierUsed = normalizeTier(sourceCreditTx.tier || roomTier);
          const txAmt = Math.round(Number(sourceCreditTx.amount));
          const descMatch = String(sourceCreditTx.description || "").match(
            /(\d+)\s*(?:h|hora|horas|crédito|credito)/i,
          );
          const candidateHours =
            descMatch && Number(descMatch[1]) > 0
              ? Number(descMatch[1])
              : txAmt;

          if (candidateHours > 0 && candidateHours <= 60) {
            detectedPackageHours = candidateHours;
          }
        } else {
          const userSubs = userSubsMap.get(b.user_id) || [];
          const activeSub =
            userSubs.find((s: any) => s.status === "ACTIVE") || userSubs[0];
          if (activeSub) {
            creditTierUsed = normalizeTier(activeSub.tier || roomTier);
            detectedPackageHours = Number(activeSub.hours) || null;
          }
        }

        let { rate: resolvedHourlyRate, matchedHours } =
          getRateFromPackageTable(creditTierUsed, detectedPackageHours);

        if (resolvedHourlyRate === null && creditTierUsed !== roomTier) {
          const fallbackRoomPkg = getRateFromPackageTable(
            roomTier,
            detectedPackageHours,
          );
          resolvedHourlyRate = fallbackRoomPkg.rate;
          matchedHours = fallbackRoomPkg.matchedHours;
        }

        let pricingOriginLabel = "";
        if (resolvedHourlyRate !== null) {
          pricingOriginLabel = matchedHours
            ? `${formatTierLabel(creditTierUsed)} • Pacote ${matchedHours}h`
            : `${formatTierLabel(creditTierUsed)} • Crédito`;
        } else {
          const roomModalityRate = extractRoomModalitiesHourlyRate(
            room?.modalities,
            room?.address_details,
          );
          const categoryObj = room?.category_id
            ? categoriesMap.get(room.category_id)
            : null;
          const categoryRate =
            categoryObj && Number(categoryObj.credit_cost_per_hour) >= 15
              ? Number(categoryObj.credit_cost_per_hour)
              : null;
          const defaultTierRates: Record<"start" | "vip" | "master", number> = {
            start: 33.38,
            vip: 41.13,
            master: 60,
          };
          resolvedHourlyRate =
            roomModalityRate || categoryRate || defaultTierRates[roomTier];
          pricingOriginLabel = `${formatTierLabel(roomTier)} • Tarifa da Sala`;
        }

        const grossBrl = Math.max(
          0,
          creditsForThisSlot * resolvedHourlyRate + upgradeFee - discount,
        );
        const split = computeAvulsoSplit(grossBrl);

        return {
          id: b.id,
          room_id: b.room_id,
          room_name: room?.name || "Sala Removida",
          user_id: b.user_id,
          specialist_name:
            guestNameMap.get(b.user_id) || "Especialista Parceiro",
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          is_contract: false,
          pricing_label: pricingOriginLabel,
          gross_brl: grossBrl,
          platform_fee_brl: split.platformFee,
          cohost_name: cohostName,
          cohost_payout_brl: split.cohostPayout,
          partner_net_brl: split.partnerNet,
        };
      };

      const processedData: Partner[] = hostProfiles.map((p: any) => {
        const myRooms = safeRooms.filter((r: any) => r.host_id === p.id);
        const myRoomIds = myRooms.map((r: any) => r.id);
        const activeRoomsCount = myRooms.filter((r: any) => r.is_active).length;

        const myContracts = contractsData.filter((c: any) =>
          myRoomIds.includes(c.room_id),
        );
        const activeContractsCount = myContracts.filter(
          (c: any) => c.status === "active",
        ).length;

        const myRawBookings = allBookings.filter((b: any) =>
          myRoomIds.includes(b.room_id),
        );
        const detailedBookings = myRawBookings.map(evaluateBookingDetail);

        const gmv = detailedBookings.reduce(
          (acc, curr) => acc + curr.gross_brl,
          0,
        );
        const platformFee = detailedBookings.reduce(
          (acc, curr) => acc + curr.platform_fee_brl,
          0,
        );
        const cohostTotal = detailedBookings.reduce(
          (acc, curr) => acc + curr.cohost_payout_brl,
          0,
        );
        const partnerNet = detailedBookings.reduce(
          (acc, curr) => acc + curr.partner_net_brl,
          0,
        );

        const lastBooking = detailedBookings[0];

        let tier: Partner["tier"] = "Start";
        if (gmv >= 20000) tier = "Diamond";
        else if (gmv >= 10000) tier = "Platinum";
        else if (gmv >= 3000) tier = "Gold";

        let defaultCity = p.address_city || "Não informada";
        let defaultState = p.address_state || "RN";
        if (
          defaultCity === "Não informada" &&
          myRooms.length > 0 &&
          myRooms[0].address_details
        ) {
          try {
            const addr =
              typeof myRooms[0].address_details === "string"
                ? JSON.parse(myRooms[0].address_details)
                : myRooms[0].address_details;
            if (addr.city) defaultCity = addr.city;
            if (addr.state) defaultState = addr.state;
          } catch (e) {}
        }

        const isActiveOperation = myRooms.length === 0 || activeRoomsCount > 0;

        return {
          id: p.id,
          full_name: p.full_name || "Clínica Parceira",
          avatar_url: p.avatar_url,
          document_number: p.cpf || "CNPJ/CPF Pendente",
          city: defaultCity,
          state: defaultState,
          created_at: p.created_at || new Date().toISOString(),
          phone: p.phone || p.whatsapp || "Não informado",
          whatsapp: p.whatsapp || p.phone || "",
          email:
            p.email ||
            `${p.full_name?.split(" ")[0]?.toLowerCase() || "clinica"}@email.com`,
          roomsCount: myRooms.length,
          activeRoomsCount,
          contractsCount: activeContractsCount,
          bookingsCount: detailedBookings.length,
          gmv,
          platformFee,
          cohostTotal,
          partnerNet,
          lastBookingDate: lastBooking ? lastBooking.start_time : null,
          tier,
          status: isActiveOperation ? "active" : "suspended",
          myRooms,
          myContracts,
          detailedBookings,
        };
      });

      const sortedPartners = processedData.sort((a, b) => b.gmv - a.gmv);
      setPartners(sortedPartners);

      if (selectedProfile) {
        const refreshedSelected = sortedPartners.find(
          (sp) => sp.id === selectedProfile.id,
        );
        if (refreshedSelected) setSelectedProfile(refreshedSelected);
      }
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro de Conexão",
        description: err.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenProfile = (partner: Partner) => {
    setSelectedProfile(partner);
    setDossierTab("bookings");
    setBookingFilter("all");
    setRoomFilter("all");
    setOriginFilter("all");
  };

  // Suspende ou Reativa todas as salas do parceiro no banco
  const handleTogglePartnerOperation = async (partner: Partner) => {
    if (partner.myRooms.length === 0) return;
    const willActivate = partner.status === "suspended";

    if (
      !confirm(
        willActivate
          ? `Deseja REATIVAR todas as ${partner.roomsCount} sala(s) de ${partner.full_name}?`
          : `Tem certeza que deseja SUSPENDER a operação de ${partner.full_name}?\n\nTodas as ${partner.roomsCount} sala(s) deste parceiro ficarão ocultas no marketplace.`,
      )
    )
      return;

    setActionLoading(true);
    try {
      const roomIds = partner.myRooms.map((r) => r.id);
      const { error } = await supabase
        .from("rooms")
        .update({ is_active: willActivate })
        .in("id", roomIds);

      if (error) throw error;

      toast({
        title: willActivate
          ? "Operação do Parceiro Reativada!"
          : "Operação Suspensa com Sucesso",
        description: willActivate
          ? "As salas voltaram a ficar ativas na plataforma."
          : "As salas do parceiro foram pausadas no marketplace.",
      });

      await fetchPartners();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao alterar status da operação",
        description: err.message,
      });
    } finally {
      setActionLoading(false);
    }
  };

  // Exportação Financeira Real do Repasse
  const exportBookings = (dataToExport: PartnerBookingDetail[]) => {
    const headers = [
      "ID Reserva",
      "Sala",
      "Origem / Modalidade",
      "Locatário",
      "Data/Período",
      "Status",
      "Valor Bruto (R$)",
      "Taxa Fusion (R$)",
      "Split Co-Anfitrião (R$)",
      "Repasse Líquido Parceiro (R$)",
    ];
    const rows = dataToExport.map((b) => [
      b.id,
      b.room_name,
      b.pricing_label,
      b.specialist_name,
      `${format(parseISO(b.start_time), "dd/MM/yyyy")} (${format(parseISO(b.start_time), "HH:mm")} às ${format(parseISO(b.end_time), "HH:mm")})`,
      b.status,
      b.gross_brl.toFixed(2).replace(".", ","),
      b.platform_fee_brl.toFixed(2).replace(".", ","),
      b.cohost_payout_brl.toFixed(2).replace(".", ","),
      b.partner_net_brl.toFixed(2).replace(".", ","),
    ]);
    exportToCSV(
      headers,
      rows,
      `Repasses_Parceiro_${selectedProfile?.full_name.replace(/\s+/g, "_")}`,
    );
  };

  const totalGMV = partners.reduce((acc, curr) => acc + curr.gmv, 0);
  const totalPlatformFee = partners.reduce(
    (acc, curr) => acc + curr.platformFee,
    0,
  );
  const totalRooms = partners.reduce((acc, curr) => acc + curr.roomsCount, 0);

  const filteredPartners = partners.filter(
    (p) =>
      p.full_name.toLowerCase().includes(search.toLowerCase()) ||
      p.document_number.includes(search) ||
      p.email.toLowerCase().includes(search.toLowerCase()),
  );

  const getTierBadge = (tier: string) => {
    switch (tier) {
      case "Diamond":
        return (
          <Badge className="bg-slate-900 text-white border-0">
            <Crown className="w-3 h-3 mr-1 text-blue-400" /> Diamond
          </Badge>
        );
      case "Platinum":
        return (
          <Badge className="bg-slate-200 text-slate-800 border-0">
            <Star className="w-3 h-3 mr-1 text-slate-600" /> Platinum
          </Badge>
        );
      case "Gold":
        return (
          <Badge className="bg-amber-100 text-amber-700 border-0">
            <Award className="w-3 h-3 mr-1" /> Gold
          </Badge>
        );
      default:
        return (
          <Badge className="bg-blue-50 text-blue-700 border-0">Start</Badge>
        );
    }
  };

  const cleanPhoneForWa = (raw?: string | null) => {
    if (!raw) return null;
    const digits = raw.replace(/\D/g, "");
    if (!digits) return null;
    return digits.startsWith("55") ? digits : `55${digits}`;
  };

  if (loading)
    return (
      <div className="flex justify-center items-center py-32">
        <Loader2 className="w-10 h-10 animate-spin text-[#BF4B24]" />
      </div>
    );

  // ========================================================
  // RENDERIZAÇÃO: DOSSIÊ DO PARCEIRO (TELA CHEIA)
  // ========================================================
  if (selectedProfile) {
    const filteredBookings = selectedProfile.detailedBookings.filter((b) => {
      if (roomFilter !== "all" && b.room_id !== roomFilter) return false;
      if (originFilter === "contract" && !b.is_contract) return false;
      if (originFilter === "marketplace" && b.is_contract) return false;

      const bDate = new Date(b.start_time);
      if (bookingFilter === "30")
        return differenceInDays(new Date(), bDate) <= 30;
      if (bookingFilter === "90")
        return differenceInDays(new Date(), bDate) <= 90;
      if (bookingFilter === "custom") {
        const start = customStartDate
          ? new Date(`${customStartDate}T00:00:00`)
          : new Date(0);
        const end = customEndDate
          ? new Date(`${customEndDate}T23:59:59`)
          : new Date();
        return bDate >= start && bDate <= end;
      }
      return true;
    });

    const filteredGMV = filteredBookings.reduce(
      (acc, curr) => acc + curr.gross_brl,
      0,
    );
    const filteredFusionFee = filteredBookings.reduce(
      (acc, curr) => acc + curr.platform_fee_brl,
      0,
    );
    const filteredPartnerNet = filteredBookings.reduce(
      (acc, curr) => acc + curr.partner_net_brl,
      0,
    );

    const waNumber = cleanPhoneForWa(
      selectedProfile.whatsapp || selectedProfile.phone,
    );

    return (
      <div className="absolute inset-0 bg-slate-50 z-20 flex flex-col animate-in fade-in zoom-in-95 duration-200 overflow-y-auto">
        <div className="bg-white border-b border-slate-200 px-8 py-5 flex items-center justify-between sticky top-0 z-20 shadow-sm">
          <div className="flex items-center gap-6">
            <button
              onClick={() => setSelectedProfile(null)}
              className="p-2 hover:bg-slate-100 rounded-full transition-colors text-slate-500"
            >
              <ChevronLeft className="w-6 h-6" />
            </button>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-black text-slate-900 leading-none">
                  Dossiê do Parceiro
                </h2>
                {selectedProfile.status === "active" ? (
                  <Badge className="bg-emerald-100 text-emerald-800 border-0 font-bold uppercase tracking-wider text-[10px]">
                    <CheckCircle2 className="w-3 h-3 mr-1" /> Operação Ativa (
                    {selectedProfile.activeRoomsCount}/
                    {selectedProfile.roomsCount} salas)
                  </Badge>
                ) : (
                  <Badge className="bg-red-100 text-red-800 border-0 font-bold uppercase tracking-wider text-[10px]">
                    <Ban className="w-3 h-3 mr-1" /> Operação Suspensa
                  </Badge>
                )}
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              disabled={actionLoading}
              onClick={() => handleTogglePartnerOperation(selectedProfile)}
              className={`border-slate-200 font-bold ${
                selectedProfile.status === "active"
                  ? "text-red-600 hover:bg-red-50 hover:text-red-700"
                  : "text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
              }`}
            >
              <Ban className="w-4 h-4 mr-2" />
              {selectedProfile.status === "active"
                ? "Suspender Operação"
                : "Reativar Operação"}
            </Button>

            {waNumber ? (
              <a
                href={`https://wa.me/${waNumber}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center justify-center px-4 h-10 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm"
              >
                <MessageCircle className="w-4 h-4 mr-2 text-emerald-400" />
                Contatar Gestor
              </a>
            ) : (
              <a
                href={`mailto:${selectedProfile.email}`}
                className="inline-flex items-center justify-center px-4 h-10 rounded-md bg-slate-900 hover:bg-slate-800 text-white font-bold text-sm"
              >
                <Mail className="w-4 h-4 mr-2" /> Contatar Gestor
              </a>
            )}
          </div>
        </div>

        <div className="p-8 max-w-6xl mx-auto w-full space-y-6">
          {/* CARTÃO DE IDENTIFICAÇÃO DO ANFITRIÃO */}
          <div className="bg-white border border-slate-200 rounded-3xl p-8 shadow-sm flex flex-col md:flex-row items-center md:items-start gap-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-64 h-64 bg-[#BF4B24]/5 rounded-full blur-3xl -mr-10 -mt-10 pointer-events-none"></div>

            <div className="w-32 h-32 rounded-3xl bg-slate-100 border-4 border-white shadow-lg overflow-hidden shrink-0 flex items-center justify-center text-slate-300">
              {selectedProfile.avatar_url ? (
                <img
                  src={selectedProfile.avatar_url}
                  alt={selectedProfile.full_name}
                  className="w-full h-full object-cover"
                />
              ) : (
                <Building2 className="w-12 h-12" />
              )}
            </div>

            <div className="flex-1 text-center md:text-left z-10">
              <div className="flex flex-col md:flex-row md:items-center gap-4 mb-2">
                <h1 className="text-3xl font-black text-slate-900">
                  {selectedProfile.full_name}
                </h1>
                <div className="flex items-center justify-center md:justify-start gap-2">
                  {getTierBadge(selectedProfile.tier)}
                  <Badge
                    variant="outline"
                    className="text-slate-600 border-slate-200 bg-slate-50"
                  >
                    Doc: {selectedProfile.document_number}
                  </Badge>
                  {selectedProfile.contractsCount > 0 && (
                    <Badge className="bg-purple-100 text-purple-800 border-0 font-bold">
                      {selectedProfile.contractsCount} Contrato(s) Vigente(s)
                    </Badge>
                  )}
                </div>
              </div>
              <p className="text-lg font-bold text-slate-500 mb-6">
                Operador de Espaços de Saúde
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Mail className="w-4 h-4 text-[#BF4B24]" />{" "}
                  {selectedProfile.email}
                </div>
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <Phone className="w-4 h-4 text-[#BF4B24]" />{" "}
                  {selectedProfile.phone}
                </div>
                <div className="flex items-center justify-center md:justify-start gap-3 text-sm font-medium text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100">
                  <MapPin className="w-4 h-4 text-[#BF4B24]" />{" "}
                  {selectedProfile.city} - {selectedProfile.state}
                </div>
              </div>
            </div>
          </div>

          {/* KPIS GLOBAIS DA OPERAÇÃO */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Activity className="w-4 h-4" /> Volume Transacionado (GMV)
              </p>
              <h3 className="text-3xl font-black text-slate-900 mb-1">
                <span className="text-base text-slate-400 font-bold mr-1">
                  R$
                </span>
                {selectedProfile.gmv.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-2">
                Valor bruto real girado nas salas (
                {selectedProfile.bookingsCount} locações).
              </p>
            </div>

            <div className="bg-gradient-to-br from-slate-900 to-slate-800 rounded-3xl p-6 text-white shadow-lg relative overflow-hidden group">
              <div className="absolute top-0 right-0 w-32 h-32 bg-[#BF4B24]/20 rounded-full blur-2xl transition-transform group-hover:scale-150"></div>
              <div className="relative z-10">
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                  <Wallet className="w-4 h-4" /> Receita Fusion (Take Rate)
                </p>
                <h3 className="text-4xl font-black mb-1">
                  <span className="text-xl text-emerald-400 font-bold mr-1">
                    R$
                  </span>
                  {selectedProfile.platformFee.toLocaleString("pt-BR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </h3>
                <p className="text-sm font-medium text-slate-400">
                  Lucro da plataforma (20% avulso + % contratos)
                </p>
              </div>
            </div>

            <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-center">
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-2">
                <Building2 className="w-4 h-4" /> Repasse Líquido Parceiro
              </p>
              <h3 className="text-3xl font-black text-emerald-600 mb-1">
                <span className="text-base text-emerald-400 font-bold mr-1">
                  R$
                </span>
                {selectedProfile.partnerNet.toLocaleString("pt-BR", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}
              </h3>
              <p className="text-sm font-medium text-slate-500 mt-2">
                Valor líquido devido ao Anfitrião (80% avulso + % contratos).
              </p>
            </div>
          </div>

          {/* ÁREA DE ABAS: REPASSES VS INVENTÁRIO VS CONTRATOS */}
          <div className="bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden">
            <div className="flex border-b border-slate-100">
              <button
                onClick={() => setDossierTab("bookings")}
                className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${dossierTab === "bookings" ? "border-[#BF4B24] text-[#BF4B24] bg-orange-50/30" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
              >
                Histórico de Repasses ({selectedProfile.bookingsCount})
              </button>
              <button
                onClick={() => setDossierTab("rooms")}
                className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${dossierTab === "rooms" ? "border-[#BF4B24] text-[#BF4B24] bg-orange-50/30" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
              >
                Inventário de Salas ({selectedProfile.roomsCount})
              </button>
              <button
                onClick={() => setDossierTab("contracts")}
                className={`flex-1 py-4 text-sm font-bold transition-all border-b-2 ${dossierTab === "contracts" ? "border-[#BF4B24] text-[#BF4B24] bg-orange-50/30" : "border-transparent text-slate-500 hover:bg-slate-50"}`}
              >
                Contratos da Clínica ({selectedProfile.myContracts.length})
              </button>
            </div>

            {dossierTab === "bookings" ? (
              <div className="p-6">
                <div className="flex flex-col xl:flex-row xl:items-center justify-between mb-6 gap-4 border-b border-slate-100 pb-6">
                  <div>
                    <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                      <TrendingUp className="w-5 h-5 text-[#BF4B24]" /> Extrato
                      de Operação & Split
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold mt-1">
                      <span className="text-slate-500">
                        GMV Filtro:{" "}
                        <strong className="text-slate-900">
                          R${" "}
                          {filteredGMV.toLocaleString("pt-BR", {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </strong>
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-[#BF4B24]">
                        Receita Fusion: R${" "}
                        {filteredFusionFee.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                      <span className="text-slate-300">•</span>
                      <span className="text-emerald-600">
                        Líquido Parceiro: R${" "}
                        {filteredPartnerNet.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </span>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-3">
                    <select
                      value={roomFilter}
                      onChange={(e) => setRoomFilter(e.target.value)}
                      className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none max-w-[180px] truncate"
                    >
                      <option value="all">Todas as Salas</option>
                      {selectedProfile.myRooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>

                    <select
                      value={originFilter}
                      onChange={(e) => setOriginFilter(e.target.value as any)}
                      className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
                    >
                      <option value="all">Todas as Origens</option>
                      <option value="marketplace">Avulsas (20% Fusion)</option>
                      <option value="contract">Contratos Fixos</option>
                    </select>

                    <select
                      value={bookingFilter}
                      onChange={(e) => setBookingFilter(e.target.value as any)}
                      className="h-10 rounded-xl border border-slate-200 bg-slate-50 px-3 text-sm font-bold text-slate-700 outline-none"
                    >
                      <option value="all">Todo o Período</option>
                      <option value="30">Últimos 30 Dias</option>
                      <option value="90">Últimos 90 Dias</option>
                      <option value="custom">Personalizado</option>
                    </select>

                    {bookingFilter === "custom" && (
                      <div className="flex items-center gap-2">
                        <Input
                          type="date"
                          value={customStartDate}
                          onChange={(e) => setCustomStartDate(e.target.value)}
                          className="h-10 w-32 rounded-xl border-slate-200 bg-slate-50 text-sm"
                        />
                        <span className="text-slate-400 font-medium">até</span>
                        <Input
                          type="date"
                          value={customEndDate}
                          onChange={(e) => setCustomEndDate(e.target.value)}
                          className="h-10 w-32 rounded-xl border-slate-200 bg-slate-50 text-sm"
                        />
                      </div>
                    )}

                    <Button
                      onClick={() => exportBookings(filteredBookings)}
                      variant="outline"
                      className="h-10 border-slate-200 text-slate-700 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 font-bold"
                    >
                      <FileSpreadsheet className="w-4 h-4 mr-2" /> Baixar
                      Relatório
                    </Button>
                  </div>
                </div>

                {filteredBookings.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <CalendarIcon className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                      Nenhuma reserva confirmada para os filtros selecionados.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 max-h-[500px] overflow-y-auto pr-2">
                    {filteredBookings.map((b) => (
                      <div
                        key={b.id}
                        className={`flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-2xl border transition-colors gap-4 ${
                          b.is_contract
                            ? "border-purple-200 bg-purple-50/20"
                            : "border-slate-100 hover:border-slate-200 hover:bg-slate-50"
                        }`}
                      >
                        <div className="flex items-center gap-4">
                          <div
                            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                              b.is_contract
                                ? "bg-purple-100 text-purple-700"
                                : "bg-slate-200 text-slate-500"
                            }`}
                          >
                            {b.is_contract ? (
                              <FileText className="w-5 h-5" />
                            ) : (
                              <Users className="w-5 h-5" />
                            )}
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <p className="font-bold text-slate-900 line-clamp-1">
                                {b.room_name}
                              </p>
                              <Badge
                                className={`border-0 text-[9px] font-black ${
                                  b.is_contract
                                    ? "bg-purple-100 text-purple-800"
                                    : "bg-slate-100 text-slate-600"
                                }`}
                              >
                                {b.pricing_label}
                              </Badge>
                            </div>
                            <p className="text-xs font-bold text-[#BF4B24] mt-0.5">
                              Especialista: {b.specialist_name}
                            </p>
                            {b.cohost_name && !b.is_contract && (
                              <p className="text-[10px] font-bold text-purple-700 flex items-center gap-1 mt-0.5">
                                <Sparkles className="w-3 h-3" /> Co-Anfitrião:{" "}
                                {b.cohost_name} (R${" "}
                                {b.cohost_payout_brl.toLocaleString("pt-BR", {
                                  minimumFractionDigits: 2,
                                  maximumFractionDigits: 2,
                                })}
                                )
                              </p>
                            )}
                            <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                              {format(parseISO(b.start_time), "dd/MM/yyyy")} •{" "}
                              {format(parseISO(b.start_time), "HH:mm")} às{" "}
                              {format(parseISO(b.end_time), "HH:mm")}
                            </p>
                          </div>
                        </div>

                        <div className="flex sm:flex-col items-center sm:items-end justify-between sm:justify-center border-t sm:border-0 border-slate-100 pt-3 sm:pt-0">
                          <div className="text-left sm:text-right">
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
                              Repasse Líquido Clínica
                            </p>
                            <p className="font-black text-emerald-600 text-base">
                              R${" "}
                              {b.partner_net_brl.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </p>
                          </div>
                          <div className="text-right flex items-center gap-2 mt-0.5">
                            <span className="text-[10px] font-bold text-slate-400">
                              Bruto: R${" "}
                              {b.gross_brl.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                            <span className="text-slate-300">•</span>
                            <span className="text-[10px] font-bold text-[#BF4B24]">
                              Fusion: R${" "}
                              {b.platform_fee_brl.toLocaleString("pt-BR", {
                                minimumFractionDigits: 2,
                                maximumFractionDigits: 2,
                              })}
                            </span>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : dossierTab === "rooms" ? (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <Building2 className="w-5 h-5 text-[#BF4B24]" />{" "}
                    Infraestrutura do Parceiro
                  </h3>
                </div>

                {selectedProfile.myRooms.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <Building2 className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                      O anfitrião ainda não possui salas cadastradas.
                    </p>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-h-[500px] overflow-y-auto pr-2">
                    {selectedProfile.myRooms.map((r) => (
                      <div
                        key={r.id}
                        className="flex items-center gap-4 p-4 rounded-2xl border border-slate-100 bg-slate-50"
                      >
                        <div className="w-16 h-16 rounded-xl bg-slate-200 overflow-hidden shrink-0 border border-slate-200">
                          <img
                            src={r.image_url || "/placeholder.jpg"}
                            className="w-full h-full object-cover"
                            alt={r.name}
                          />
                        </div>
                        <div className="flex-1">
                          <div className="flex justify-between items-start">
                            <p className="font-bold text-slate-900 line-clamp-1 pr-2">
                              {r.name}
                            </p>
                            <Badge
                              className={
                                r.is_active
                                  ? "bg-emerald-100 text-emerald-700 border-0 shrink-0"
                                  : "bg-slate-200 text-slate-600 border-0 shrink-0"
                              }
                            >
                              {r.is_active ? "Ativa" : "Inativa"}
                            </Badge>
                          </div>
                          <p className="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">
                            Tier: {r.tier || "Start"}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : (
              <div className="p-6">
                <div className="flex items-center justify-between mb-6">
                  <h3 className="text-lg font-black text-slate-900 flex items-center gap-2">
                    <FileText className="w-5 h-5 text-[#BF4B24]" /> Contratos
                    Vinculados às Salas deste Parceiro
                  </h3>
                </div>

                {selectedProfile.myContracts.length === 0 ? (
                  <div className="text-center py-10 bg-slate-50 rounded-2xl border border-slate-100 border-dashed">
                    <FileText className="w-10 h-10 text-slate-300 mx-auto mb-3" />
                    <p className="text-slate-500 font-medium">
                      Nenhum contrato de turno fixo ou sala mensal registrado
                      para este parceiro.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                    {selectedProfile.myContracts.map((c: any) => {
                      const roomObj = selectedProfile.myRooms.find(
                        (r) => r.id === c.room_id,
                      );
                      const fusionPct = Number(c.platform_fee_pct ?? 15);
                      const hostPct =
                        c.host_split_pct !== undefined &&
                        c.host_split_pct !== null
                          ? Number(c.host_split_pct)
                          : Math.max(0, 100 - fusionPct);

                      return (
                        <div
                          key={c.id}
                          className="p-4 rounded-2xl border border-slate-200 bg-slate-50/70 flex flex-col md:flex-row md:items-center justify-between gap-4"
                        >
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-black text-slate-900">
                                {roomObj?.name || "Sala"}
                              </span>
                              <Badge className="bg-purple-100 text-purple-800 border-0 text-[10px] font-bold">
                                {c.contract_type === "monthly_exclusive"
                                  ? "Fixo Mensal / Exclusivo"
                                  : c.contract_type === "fixed_shift"
                                    ? "Turno Fixo"
                                    : "Diária Fixa"}
                              </Badge>
                            </div>
                            <p className="text-xs font-bold text-[#BF4B24] mt-1">
                              Locatário: {c.specialist_name}
                            </p>
                            <p className="text-[11px] font-medium text-slate-500 mt-0.5">
                              Vigência:{" "}
                              {format(parseISO(c.start_date), "dd/MM/yyyy")} até{" "}
                              {format(parseISO(c.end_date), "dd/MM/yyyy")} •
                              Pagamento até dia{" "}
                              {String(c.due_day || 8).padStart(2, "0")}
                            </p>
                          </div>

                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="font-black text-slate-900">
                                R${" "}
                                {Number(c.contract_value || 0).toLocaleString(
                                  "pt-BR",
                                  {
                                    minimumFractionDigits: 2,
                                  },
                                )}
                              </p>
                              <p className="text-[10px] font-bold text-slate-500">
                                Split: {fusionPct}% Fusion / {hostPct}% Parceiro
                              </p>
                            </div>
                            {c.pdf_url && (
                              <a
                                href={c.pdf_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold"
                              >
                                <FileText className="w-3.5 h-3.5" />
                                PDF
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ========================================================
  // RENDERIZAÇÃO: LISTAGEM PADRÃO DA ABA DE PARCEIROS
  // ========================================================
  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-8">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <ShieldCheck className="w-8 h-8 text-[#BF4B24]" />
            Parceiros (Anfitriões)
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gestão dos donos de clínicas, acompanhamento de faturamento real
            (Take Rate Avulso 20% + Contratos) e controle de espaços listados.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
            <Building2 className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              Infraestrutura
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              {totalRooms}{" "}
              <span className="text-sm font-medium text-slate-500">
                salas cadastradas
              </span>
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center text-emerald-600 shrink-0">
            <Activity className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              GMV Total Gerado
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              R${" "}
              {totalGMV.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
          </div>
        </div>
        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex items-center gap-4">
          <div className="w-12 h-12 rounded-full bg-orange-50 flex items-center justify-center text-[#BF4B24] shrink-0">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase">
              Receita Fusion (20% + Contratos)
            </p>
            <h3 className="text-2xl font-black text-slate-900">
              R${" "}
              {totalPlatformFee.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </h3>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-slate-50/50">
          <div className="relative w-full md:w-96">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input
              placeholder="Buscar clínica, parceiro ou documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="h-10 pl-9 rounded-xl border-slate-200 bg-white font-medium w-full"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-white text-slate-400 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Anfitrião / Clínica</th>
                <th className="px-6 py-4 text-center">Salas & Contratos</th>
                <th className="px-6 py-4 text-center">Nível de Parceria</th>
                <th className="px-6 py-4 text-right">GMV (Gerado)</th>
                <th className="px-6 py-4 text-right">
                  Receita Fusion (20% + Contratos)
                </th>
                <th className="px-6 py-4 text-right">Repasse Líquido</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50 bg-white">
              {filteredPartners.length === 0 ? (
                <tr>
                  <td
                    colSpan={7}
                    className="px-6 py-12 text-center text-slate-500 font-medium"
                  >
                    Nenhum parceiro encontrado com os filtros atuais.
                  </td>
                </tr>
              ) : (
                filteredPartners.map((partner) => (
                  <tr
                    key={partner.id}
                    className="hover:bg-slate-50/80 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0 text-slate-300">
                          {partner.avatar_url ? (
                            <img
                              src={partner.avatar_url}
                              className="w-full h-full object-cover"
                              alt={partner.full_name}
                            />
                          ) : (
                            <Building2 className="w-5 h-5" />
                          )}
                        </div>
                        <div>
                          <p className="font-black text-slate-900">
                            {partner.full_name}
                          </p>
                          <p className="text-[10px] font-bold text-slate-500 mt-0.5">
                            {partner.email}
                          </p>
                          <p className="text-[10px] font-bold text-slate-400">
                            {partner.phone}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <p className="font-black text-slate-700 text-base">
                        {partner.activeRoomsCount}/{partner.roomsCount} salas
                      </p>
                      <p className="text-[10px] font-bold text-purple-700 mt-0.5">
                        {partner.contractsCount} contrato(s) ativo(s)
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getTierBadge(partner.tier)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-slate-900">
                        R${" "}
                        {partner.gmv.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {partner.bookingsCount} locações totais
                      </p>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <Badge className="bg-orange-50 text-[#BF4B24] border-orange-200 font-black">
                        + R${" "}
                        {partner.platformFee.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </Badge>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-emerald-600">
                        R${" "}
                        {partner.partnerNet.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center">
                      <Button
                        onClick={() => handleOpenProfile(partner)}
                        variant="ghost"
                        className="h-8 bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900 font-bold px-3 rounded-lg"
                      >
                        Ver Dossiê
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
