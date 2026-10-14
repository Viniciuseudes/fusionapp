"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Search,
  Calendar as CalendarIcon,
  FileSpreadsheet,
  DownloadCloud,
  Loader2,
  Eye,
  RefreshCw,
  Building2,
  Clock,
  XCircle,
  CalendarDays,
  AlertTriangle,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Calendar } from "@/components/ui/calendar";
import {
  format,
  parseISO,
  startOfDay,
  endOfDay,
  setHours,
  setMinutes,
  setSeconds,
} from "date-fns";
import { ptBR } from "date-fns/locale";
import { useToast } from "@/hooks/use-toast";

interface BookingInfo {
  id: string;
  created_at: string;
  start_time: string;
  end_time: string;
  status: string;
  total_cost: number;
  gross_value_brl: number;
  hourly_rate_brl: number;
  pricing_label: string;
  room_tier: string;
  specialist_name: string;
  room_name: string;
  room_id: string;
  clinic_name: string;
}

// Normaliza nomenclaturas de tier ('basic' e 'start' operam na mesma faixa de entrada)
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

// Extrai preço por hora configurado diretamente nas modalidades da sala, se existir
function extractRoomModalitiesHourlyRate(modalities: any): number | null {
  if (!modalities) return null;
  try {
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
      if (!isNaN(val) && val > 0) return val;
    }
  } catch {
    return null;
  }
  return null;
}

export function AdminBookingsTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [bookings, setBookings] = useState<BookingInfo[]>([]);

  const [startDate, setStartDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [endDate, setEndDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [statusFilter, setStatusFilter] = useState("all");
  const [search, setSearch] = useState("");

  // Estados para Modal de Visualização (Sheet)
  const [selectedBooking, setSelectedBooking] = useState<BookingInfo | null>(
    null,
  );
  const [isViewOpen, setIsViewOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Estados Sênior para Reagendamento (Dialog)
  const [isRescheduleOpen, setIsRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState<Date | undefined>(
    new Date(),
  );
  const [availableSlots, setAvailableSlots] = useState<string[]>([]);
  const [selectedSlot, setSelectedSlot] = useState<string>("");
  const [loadingSlots, setLoadingSlots] = useState(false);

  const [candidateRooms, setCandidateRooms] = useState<any[]>([]);
  const [selectedRescheduleRoomId, setSelectedRescheduleRoomId] =
    useState<string>("");

  useEffect(() => {
    fetchBookings();
  }, [startDate, endDate]);

  // Sempre que a Data ou a Sala selecionada mudar, recalcula os horários
  useEffect(() => {
    if (isRescheduleOpen && selectedRescheduleRoomId && rescheduleDate) {
      loadRoomScheduleForDate(selectedRescheduleRoomId, rescheduleDate);
    }
  }, [isRescheduleOpen, rescheduleDate, selectedRescheduleRoomId]);

  const fetchBookings = async () => {
    setLoading(true);
    try {
      const start = startOfDay(parseISO(startDate)).toISOString();
      const end = endOfDay(parseISO(endDate)).toISOString();

      const { data: rawBookings, error: bErr } = await supabase
        .from("bookings")
        .select(
          "id, created_at, start_time, end_time, status, total_cost, upgrade_fee_amount, room_id, user_id",
        )
        .gte("start_time", start)
        .lte("start_time", end)
        .order("start_time", { ascending: true });

      if (bErr) throw new Error(bErr.message || JSON.stringify(bErr));

      if (!rawBookings || rawBookings.length === 0) {
        setBookings([]);
        setLoading(false);
        return;
      }

      const bookingIds = rawBookings.map((b: any) => b.id);
      const roomIds = [
        ...new Set(rawBookings.map((b: any) => b.room_id).filter(Boolean)),
      ];
      const userIds = [
        ...new Set(rawBookings.map((b: any) => b.user_id).filter(Boolean)),
      ];

      // Busca paralela de salas, pacotes, carteira, assinaturas, categorias e cupons
      const [
        roomsRes,
        packagesRes,
        walletRes,
        subsRes,
        categoriesRes,
        couponsRes,
        usersRes,
      ] = await Promise.all([
        roomIds.length > 0
          ? supabase
              .from("rooms")
              .select("id, name, host_id, tier, category_id, modalities")
              .in("id", roomIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase.from("packages").select("id, tier, hours, price, active"),
        userIds.length > 0
          ? supabase
              .from("wallet_transactions")
              .select(
                "id, user_id, amount, type, description, tier, created_at, expires_at",
              )
              .in("user_id", userIds)
              .order("created_at", { ascending: true })
          : Promise.resolve({ data: [] as any[] }),
        userIds.length > 0
          ? supabase
              .from("subscriptions")
              .select("id, user_id, tier, hours, status, created_at")
              .in("user_id", userIds)
          : Promise.resolve({ data: [] as any[] }),
        supabase
          .from("room_categories")
          .select("id, name, credit_cost_per_hour, upgrade_fee_per_hour"),
        bookingIds.length > 0
          ? supabase
              .from("coupon_uses")
              .select("booking_id, discount_applied")
              .in("booking_id", bookingIds)
          : Promise.resolve({ data: [] as any[] }),
        userIds.length > 0
          ? supabase.from("profiles").select("id, full_name").in("id", userIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);

      const roomsData = roomsRes.data || [];
      const roomsMap = new Map(roomsData.map((r: any) => [r.id, r]));

      const hostIds = [
        ...new Set(roomsData.map((r: any) => r.host_id).filter(Boolean)),
      ];

      const hostsRes =
        hostIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", hostIds)
          : { data: [] as any[] };

      const usersMap = new Map(
        usersRes.data?.map((u: any) => [u.id, u.full_name]) || [],
      );
      const hostsMap = new Map(
        hostsRes.data?.map((h: any) => [h.id, h.full_name]) || [],
      );

      // Indexação da tabela `packages`: Mapeia (tier -> hours -> valor da hora em R$)
      const packageRateMap: Record<
        "start" | "vip" | "master",
        Map<number, number>
      > = {
        start: new Map(),
        vip: new Map(),
        master: new Map(),
      };

      (packagesRes.data || []).forEach((pkg: any) => {
        const t = normalizeTier(pkg.tier);
        const h = Math.max(1, Number(pkg.hours) || 1);
        const rawPrice = Number(pkg.price) || 0;
        if (rawPrice <= 0) return;

        // Se o preço dividido pelas horas for >= R$ 15, `price` é o valor fechado do pacote (ex: 8h = R$ 360 -> R$ 45/h).
        // Caso contrário, `price` já está salvo como valor unitário da hora.
        const hourlyRate =
          h > 1 && rawPrice / h >= 15 ? rawPrice / h : rawPrice;
        packageRateMap[t].set(h, hourlyRate);
      });

      // Categorias de sala (caso alguma sala utilize category_id com preço base)
      const categoriesMap = new Map(
        (categoriesRes.data || []).map((c: any) => [c.id, c]),
      );

      // Descontos de cupons por booking_id
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

      // Agrupa transações de carteira e assinaturas por usuário
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

      // Função que resolve a tarifa/hora de um Tier e quantidade de horas do pacote
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
          // Busca o pacote de horas mais próximo dentro do mesmo Tier
          let closestHours: number | null = null;
          let minDiff = Infinity;
          for (const [h] of tierPackages.entries()) {
            const diff = Math.abs(h - targetHours);
            if (diff < minDiff) {
              minDiff = diff;
              closestHours = h;
            }
          }
          if (closestHours !== null) {
            return {
              rate: tierPackages.get(closestHours)!,
              matchedHours: closestHours,
            };
          }
        }

        // Sem horas específicas: prioriza 1h (avulso) ou o menor pacote do Tier
        if (tierPackages.has(1)) {
          return { rate: tierPackages.get(1)!, matchedHours: 1 };
        }
        const sortedHours = Array.from(tierPackages.keys()).sort(
          (a, b) => a - b,
        );
        const firstH = sortedHours[0];
        return { rate: tierPackages.get(firstH)!, matchedHours: firstH };
      };

      // Resolve o valor financeiro exato de cada agendamento
      const formattedBookings: BookingInfo[] = rawBookings.map((b: any) => {
        const room = roomsMap.get(b.room_id);
        const hostId = room?.host_id;
        const clinicName = hostId ? hostsMap.get(hostId) : "Fusion Clinic";
        const roomTier = normalizeTier(room?.tier);

        const durationMs =
          new Date(b.end_time).getTime() - new Date(b.start_time).getTime();
        const durationHours = Math.max(0.5, durationMs / (1000 * 60 * 60));

        const rawTotalCost = Number(b.total_cost || 0);
        const upgradeFee = Number(b.upgrade_fee_amount || 0);
        const discount = couponDiscountMap.get(b.id) || 0;

        // Caso 1: `total_cost` já foi salvo em Reais (ex: checkout direto onde total_cost >= R$ 15/h)
        if (rawTotalCost >= durationHours * 15) {
          const finalBrl = Math.max(0, rawTotalCost + upgradeFee - discount);
          return {
            id: b.id,
            created_at: b.created_at,
            start_time: b.start_time,
            end_time: b.end_time,
            status: b.status,
            total_cost: rawTotalCost,
            gross_value_brl: finalBrl,
            hourly_rate_brl: finalBrl / durationHours,
            pricing_label: `${formatTierLabel(roomTier)} • Reserva Direta`,
            room_tier: roomTier,
            room_id: b.room_id,
            specialist_name:
              usersMap.get(b.user_id) || "Especialista Desconhecido",
            room_name: room?.name || "Sala Removida",
            clinic_name: clinicName || "Fusion Clinic",
          };
        }

        // Caso 2: Reserva feita via Créditos/Horas (ex: total_cost = 1 crédito para 1h)
        const creditsUsed = rawTotalCost > 0 ? rawTotalCost : durationHours;
        const userTxs = userWalletMap.get(b.user_id) || [];
        const bookingTime = new Date(b.created_at).getTime();

        // 2.1 Verifica se há débito registrado no momento da reserva para confirmar o Tier do crédito consumido
        let creditTierUsed: "start" | "vip" | "master" = roomTier;
        const matchingDebit = userTxs.find((tx: any) => {
          if (Number(tx.amount) >= 0) return false;
          const txTime = new Date(tx.created_at).getTime();
          return Math.abs(txTime - bookingTime) <= 10 * 60 * 1000; // janela de 10 min
        });
        if (matchingDebit?.tier) {
          creditTierUsed = normalizeTier(matchingDebit.tier);
        }

        // 2.2 Busca a recarga/compra de pacote (`amount > 0`) que originou o saldo do especialista
        const compatibleTiers: ("start" | "vip" | "master")[] =
          roomTier === "master"
            ? ["master"]
            : roomTier === "vip"
              ? ["vip", "master"]
              : ["start", "vip", "master"];

        const positiveTxs = userTxs.filter((tx: any) => Number(tx.amount) > 0);

        // Filtra créditos adquiridos até o momento da reserva (e vigentes na data da reserva)
        const validPriorCredits = positiveTxs.filter((tx: any) => {
          const createdMs = new Date(tx.created_at).getTime();
          const notAfterBooking = createdMs <= bookingTime + 60 * 1000;
          const notExpiredAtBooking =
            !tx.expires_at || new Date(tx.expires_at).getTime() >= bookingTime;
          return notAfterBooking && notExpiredAtBooking;
        });

        const candidateCredits =
          validPriorCredits.length > 0 ? validPriorCredits : positiveTxs;

        // Procura primeiro crédito do mesmo tier usado; se não, segue a cascata da sala
        let sourceCreditTx =
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
          // Verifica também se a descrição cita explicitamente o pacote (ex: "Pacote 16h" ou "8 horas")
          const descMatch = String(sourceCreditTx.description || "").match(
            /(\d+)\s*(?:h|hora|horas|crédito|credito)/i,
          );
          if (descMatch && Number(descMatch[1]) > 0) {
            detectedPackageHours = Number(descMatch[1]);
          } else if (txAmt > 0) {
            detectedPackageHours = txAmt;
          }
        } else {
          // Verifica se o usuário possui assinatura (Fusion Pass)
          const userSubs = userSubsMap.get(b.user_id) || [];
          const activeSub =
            userSubs.find((s: any) => s.status === "ACTIVE") || userSubs[0];
          if (activeSub) {
            creditTierUsed = normalizeTier(activeSub.tier || roomTier);
            detectedPackageHours = Number(activeSub.hours) || null;
          }
        }

        // 2.3 Consulta o valor da hora na tabela `packages` para (creditTierUsed, detectedPackageHours)
        let { rate: resolvedHourlyRate, matchedHours } =
          getRateFromPackageTable(creditTierUsed, detectedPackageHours);

        // Se o tier do crédito não tiver pacote cadastrado, tenta o tier da sala
        if (resolvedHourlyRate === null && creditTierUsed !== roomTier) {
          const fallbackRoomPkg = getRateFromPackageTable(
            roomTier,
            detectedPackageHours,
          );
          resolvedHourlyRate = fallbackRoomPkg.rate;
          matchedHours = fallbackRoomPkg.matchedHours;
        }

        // 2.4 Fallback para preço nas modalidades da própria sala ou categoria da sala
        let pricingOriginLabel = "";
        if (resolvedHourlyRate !== null) {
          pricingOriginLabel = matchedHours
            ? `${formatTierLabel(creditTierUsed)} • Pacote ${matchedHours}h`
            : `${formatTierLabel(creditTierUsed)} • Crédito`;
        } else {
          const roomModalityRate = extractRoomModalitiesHourlyRate(
            room?.modalities,
          );
          const categoryObj = room?.category_id
            ? categoriesMap.get(room.category_id)
            : null;
          const categoryRate =
            categoryObj && Number(categoryObj.credit_cost_per_hour) >= 15
              ? Number(categoryObj.credit_cost_per_hour)
              : null;

          if (roomModalityRate) {
            resolvedHourlyRate = roomModalityRate;
            pricingOriginLabel = `${formatTierLabel(roomTier)} • Tarifa da Sala`;
          } else if (categoryRate) {
            resolvedHourlyRate = categoryRate;
            pricingOriginLabel = `${formatTierLabel(roomTier)} • Categoria`;
          } else {
            // Último fallback seguro por Tier caso a tabela `packages` esteja vazia para aquele Tier
            const defaultTierRates: Record<"start" | "vip" | "master", number> =
              {
                start: 45,
                vip: 60,
                master: 80,
              };
            resolvedHourlyRate = defaultTierRates[roomTier];
            pricingOriginLabel = `${formatTierLabel(roomTier)} • Padrão`;
          }
        }

        const grossBrl = Math.max(
          0,
          creditsUsed * resolvedHourlyRate + upgradeFee - discount,
        );

        return {
          id: b.id,
          created_at: b.created_at,
          start_time: b.start_time,
          end_time: b.end_time,
          status: b.status,
          total_cost: rawTotalCost,
          gross_value_brl: grossBrl,
          hourly_rate_brl: resolvedHourlyRate,
          pricing_label: pricingOriginLabel,
          room_tier: roomTier,
          room_id: b.room_id,
          specialist_name:
            usersMap.get(b.user_id) || "Especialista Desconhecido",
          room_name: room?.name || "Sala Removida",
          clinic_name: clinicName || "Fusion Clinic",
        };
      });

      setBookings(formattedBookings);
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Aviso do Sistema",
        description:
          err.message === "{}" ? "Bloqueio de segurança (RLS)." : err.message,
      });
      setBookings([]);
    } finally {
      setLoading(false);
    }
  };

  // --- ENGINE SÊNIOR: Abertura Segura do Reagendamento ---
  const handleOpenReschedule = async (booking: BookingInfo) => {
    setActionLoading(true);
    try {
      setSelectedBooking(booking);
      setRescheduleDate(parseISO(booking.start_time));
      setSelectedSlot("");

      // 1. Busca os detalhes da sala original diretamente do banco (usando as colunas reais do schema)
      const { data: originalRoom } = await supabase
        .from("rooms")
        .select("id, name, image_url, tier, is_active, host_id")
        .eq("id", booking.room_id)
        .single();

      // 2. Busca o catálogo de salas equivalentes (Mesma Categoria/Tier)
      let query = supabase
        .from("rooms")
        .select("id, name, image_url, tier, is_active, host_id")
        .eq("is_active", true);

      if (originalRoom?.tier) {
        query = query.eq("tier", originalRoom.tier);
      }

      const { data: candidates } = await query;
      let finalCandidates = candidates || [];

      // 3. Injeta a sala original na lista caso ela esteja oculta/inativa, para não quebrar o select
      if (
        originalRoom &&
        !finalCandidates.some((c: any) => c.id === booking.room_id)
      ) {
        finalCandidates.push(originalRoom);
      }

      // Busca nomes dos anfitriões para exibir no Select
      const candidateHostIds = [
        ...new Set(finalCandidates.map((c: any) => c.host_id).filter(Boolean)),
      ];
      const hostsRes =
        candidateHostIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name")
              .in("id", candidateHostIds)
          : { data: [] as any[] };
      const hostNameMap = new Map(
        (hostsRes.data || []).map((h: any) => [h.id, h.full_name]),
      );

      finalCandidates = finalCandidates.map((c: any) => ({
        ...c,
        host_name: hostNameMap.get(c.host_id) || "Clínica Padrão",
      }));

      setCandidateRooms(finalCandidates);
      setSelectedRescheduleRoomId(booking.room_id);
      setIsRescheduleOpen(true);
    } catch (err: any) {
      toast({
        title: "Erro ao preparar reagendamento.",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  // --- ENGINE VISUAL DE CALENDÁRIO: DISPONIBILIDADE REAL DA SALA ---
  const loadRoomScheduleForDate = async (roomId: string, date: Date) => {
    setLoadingSlots(true);
    setSelectedSlot("");
    setAvailableSlots([]);

    try {
      const { data: roomData } = await supabase
        .from("rooms")
        .select("availability")
        .eq("id", roomId)
        .single();

      const availability = roomData?.availability;
      const startIso = startOfDay(date).toISOString();
      const endIso = endOfDay(date).toISOString();

      // Busca apenas reservas que cruzam com esta sala e estão ativas
      const { data: existingBookings } = await supabase
        .from("bookings")
        .select("start_time, end_time")
        .eq("room_id", roomId)
        .in("status", ["confirmed", "in_progress", "pending_payment"])
        .neq("id", selectedBooking?.id)
        .gte("start_time", startIso)
        .lte("start_time", endIso);

      const occupiedSlots = (existingBookings || []).map((b) => {
        const hStart = format(parseISO(b.start_time), "HH");
        const hEnd = format(parseISO(b.end_time), "HH");
        return `${hStart}h-${hEnd}h`;
      });

      let dailySlots: string[] = [];
      const dayOfWeek = date.getDay();
      const dateStr = date.toDateString();

      const defaultFullSlots = [
        "08h-09h",
        "09h-10h",
        "10h-11h",
        "11h-12h",
        "13h-14h",
        "14h-15h",
        "15h-16h",
        "16h-17h",
        "17h-18h",
        "18h-19h",
        "19h-20h",
        "20h-21h",
        "21h-22h",
      ];

      if (availability && availability.weekConfig) {
        const weekConfig = availability.weekConfig.find(
          (w: any) => w.day === dayOfWeek,
        );
        if (weekConfig && weekConfig.enabled) {
          if (weekConfig.rentalType === "hourly") {
            dailySlots =
              Array.isArray(weekConfig.availableHours) &&
              weekConfig.availableHours.length > 0
                ? [...weekConfig.availableHours]
                : [...defaultFullSlots];
          } else if (weekConfig.rentalType === "shift") {
            if (weekConfig.selectedShifts?.includes("morning"))
              dailySlots.push("08h-09h", "09h-10h", "10h-11h", "11h-12h");
            if (weekConfig.selectedShifts?.includes("afternoon"))
              dailySlots.push(
                "13h-14h",
                "14h-15h",
                "15h-16h",
                "16h-17h",
                "17h-18h",
              );
            if (weekConfig.selectedShifts?.includes("night"))
              dailySlots.push("18h-19h", "19h-20h", "20h-21h", "21h-22h");
          }
        }

        if (availability.exceptions) {
          const exception = availability.exceptions.find(
            (e: any) => new Date(e.date).toDateString() === dateStr,
          );
          if (exception) {
            if (exception.type === "block") {
              if (exception.isFullDay) dailySlots = [];
              else
                dailySlots = dailySlots.filter(
                  (slot) => !exception.hours.includes(slot),
                );
            } else if (exception.type === "extra") {
              dailySlots = [...(exception.hours || [])];
            }
          }
        }
      } else {
        if (dayOfWeek !== 0 && dayOfWeek !== 6) {
          dailySlots = [...defaultFullSlots];
        }
      }

      const now = new Date();
      const isToday = date.toDateString() === now.toDateString();
      const currentHour = now.getHours();

      const finalFreeSlots = dailySlots.filter((slot) => {
        const startHour = parseInt(slot.split("h")[0]);
        if (isToday && startHour <= currentHour) return false;
        return !occupiedSlots.includes(slot);
      });

      finalFreeSlots.sort(
        (a, b) => parseInt(a.split("h")[0]) - parseInt(b.split("h")[0]),
      );
      setAvailableSlots(finalFreeSlots);
    } catch (error) {
      console.error("Erro ao carregar agenda da sala:", error);
    } finally {
      setLoadingSlots(false);
    }
  };

  const handleCancelBooking = async () => {
    if (!selectedBooking) return;
    if (
      !confirm(
        "Tem certeza que deseja CANCELAR esta reserva? O valor será impactado.",
      )
    )
      return;

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from("bookings")
        .update({ status: "cancelled" })
        .eq("id", selectedBooking.id);

      if (error) throw error;

      toast({
        title: "Reserva cancelada com sucesso.",
        variant: "destructive",
      });
      setIsViewOpen(false);
      fetchBookings();
    } catch (err: any) {
      toast({
        title: "Erro ao cancelar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleReschedule = async () => {
    if (
      !selectedBooking ||
      !rescheduleDate ||
      !selectedSlot ||
      !selectedRescheduleRoomId
    ) {
      return toast({
        title: "Selecione a data, a sala e o horário disponível.",
        variant: "destructive",
      });
    }

    setActionLoading(true);
    try {
      const [startStr, endStr] = selectedSlot.split("-");
      const startHour = parseInt(startStr.replace("h", ""));
      const endHour = parseInt(endStr.replace("h", ""));

      const newStartDate = setSeconds(
        setMinutes(setHours(rescheduleDate, startHour), 0),
        0,
      );
      const newEndDate = setSeconds(
        setMinutes(setHours(rescheduleDate, endHour), 0),
        0,
      );

      const { error } = await supabase
        .from("bookings")
        .update({
          start_time: newStartDate.toISOString(),
          end_time: newEndDate.toISOString(),
          room_id: selectedRescheduleRoomId,
        })
        .eq("id", selectedBooking.id);

      if (error) throw error;

      toast({ title: "Reserva reagendada com sucesso! 📅" });
      setIsRescheduleOpen(false);
      fetchBookings();
    } catch (err: any) {
      toast({
        title: "Erro ao reagendar",
        description: err.message,
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const downloadCSV = (content: string, fileName: string) => {
    const bom = "\uFEFF";
    const blob = new Blob([bom + content], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", fileName);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleExportExcel = () => {
    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });
    let csv =
      "ID da Reserva;Clínica;Sala;Categoria / Origem;Data Agendada;Especialista;Entrada;Saída;Status;Valor Hora (R$);Valor Bruto (R$)\n";
    filteredBookings.forEach((b) => {
      const valorHora = b.hourly_rate_brl.toFixed(2).replace(".", ",");
      const valorTotal = b.gross_value_brl.toFixed(2).replace(".", ",");
      const agendada = format(parseISO(b.created_at), "dd/MM/yyyy HH:mm");
      const entrada = format(parseISO(b.start_time), "dd/MM/yyyy HH:mm");
      const saida = format(parseISO(b.end_time), "dd/MM/yyyy HH:mm");
      csv += `${b.id};"${b.clinic_name}";"${b.room_name}";"${b.pricing_label}";${agendada};"${b.specialist_name}";${entrada};${saida};${b.status};${valorHora};${valorTotal}\n`;
    });
    downloadCSV(csv, `Fusion_Agendamentos_${startDate}_a_${endDate}.csv`);
  };

  const handleExportFinances = () => {
    if (filteredBookings.length === 0)
      return toast({ title: "Sem dados para exportar." });
    let csv =
      "ID da Reserva;Clínica (Anfitrião);Sala;Modalidade;Especialista (Cliente);Valor Total (R$);Taxa Fusion (10%);Repasse Anfitrião (90%);Status\n";
    filteredBookings.forEach((b) => {
      const valorBase = b.gross_value_brl;
      const fee = valorBase * 0.1;
      const repasse = valorBase * 0.9;
      csv += `${b.id};"${b.clinic_name}";"${b.room_name}";"${b.pricing_label}";"${b.specialist_name}";${valorBase.toFixed(2).replace(".", ",")};${fee.toFixed(2).replace(".", ",")};${repasse.toFixed(2).replace(".", ",")};${b.status}\n`;
    });
    downloadCSV(csv, `Fusion_Financeiro_${startDate}_a_${endDate}.csv`);
  };

  const filteredBookings = bookings.filter((b) => {
    const matchStatus =
      statusFilter === "all" ? true : b.status === statusFilter;
    const matchSearch =
      b.specialist_name.toLowerCase().includes(search.toLowerCase()) ||
      b.clinic_name.toLowerCase().includes(search.toLowerCase()) ||
      b.room_name.toLowerCase().includes(search.toLowerCase());
    return matchStatus && matchSearch;
  });

  const totalRevenue = filteredBookings.reduce((acc, curr) => {
    if (statusFilter !== "cancelled" && curr.status === "cancelled") {
      return acc;
    }
    return acc + curr.gross_value_brl;
  }, 0);

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-0">
            Confirmado
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-slate-200 text-slate-800 border-0">
            Concluído
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-800 border-0">Cancelado</Badge>
        );
      case "pending_payment":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-0">
            Aguardando Pagamento
          </Badge>
        );
      default:
        return (
          <Badge className="bg-slate-100 text-slate-600 border-0">
            {status}
          </Badge>
        );
    }
  };

  // Parser Visual para a Foto da Sala
  const selectedRoomDetails = candidateRooms.find(
    (r) => r.id === selectedRescheduleRoomId,
  );
  const isDifferentRoom = selectedBooking?.room_id !== selectedRescheduleRoomId;

  const getFirstImage = (imageField: any) => {
    if (!imageField) return null;
    if (Array.isArray(imageField) && imageField.length > 0)
      return imageField[0];
    if (typeof imageField === "string") {
      try {
        const parsed = JSON.parse(imageField);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
        if (typeof parsed === "string") return parsed;
      } catch {
        if (imageField.startsWith("http") || imageField.startsWith("/")) {
          return imageField;
        }
      }
    }
    return null;
  };
  const roomImageUrl = getFirstImage(
    selectedRoomDetails?.image_url || selectedRoomDetails?.images,
  );

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 w-full pb-32 font-sans">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            <CalendarIcon className="w-8 h-8 text-[#BF4B24]" />
            Histórico de Agendamentos
          </h1>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gestão operacional e financeira de todas as reservas da plataforma.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Badge className="bg-slate-900 text-white font-black px-4 py-1.5 rounded-xl border-0 text-sm">
            Total de registros: {filteredBookings.length}
          </Badge>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 mb-6">
        <div className="flex flex-col lg:flex-row justify-between items-center gap-4">
          <div className="flex flex-wrap items-center gap-3 w-full lg:w-auto">
            <div className="flex items-center bg-slate-50 border border-slate-200 rounded-xl overflow-hidden focus-within:ring-2 focus-within:ring-[#BF4B24]/20">
              <div className="px-3 text-slate-400 border-r border-slate-200">
                <CalendarIcon className="w-4 h-4" />
              </div>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-transparent border-0 text-sm font-bold text-slate-700 outline-none p-2 w-36"
              />
              <span className="text-slate-300 font-bold px-2">-</span>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="bg-transparent border-0 text-sm font-bold text-slate-700 outline-none p-2 w-36"
              />
            </div>

            <Button
              onClick={fetchBookings}
              variant="outline"
              className="h-10 w-10 p-0 rounded-xl border-slate-200 text-slate-600 hover:text-[#BF4B24]"
            >
              {loading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Search className="w-4 h-4" />
              )}
            </Button>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="h-10 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-700 outline-none w-full sm:w-auto"
            >
              <option value="all">Todos os status</option>
              <option value="confirmed">Confirmados</option>
              <option value="completed">Concluídos</option>
              <option value="pending_payment">Aguardando Pagamento</option>
              <option value="cancelled">Cancelados</option>
            </select>

            <div className="relative w-full sm:w-auto">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar clínica ou especialista..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="h-10 pl-9 rounded-xl border-slate-200 bg-white font-medium min-w-[220px]"
              />
            </div>
          </div>

          <div className="flex gap-3 w-full lg:w-auto mt-4 lg:mt-0">
            <Button
              onClick={handleExportExcel}
              className="flex-1 lg:flex-none bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-bold h-10 shadow-sm"
            >
              <FileSpreadsheet className="w-4 h-4 mr-2" /> Exportar Excel
            </Button>
            <Button
              onClick={handleExportFinances}
              className="flex-1 lg:flex-none bg-slate-900 hover:bg-slate-800 text-white font-bold h-10 shadow-sm"
            >
              <DownloadCloud className="w-4 h-4 mr-2" /> Exportar Finanças
            </Button>
          </div>
        </div>
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden flex flex-col relative">
        {loading && (
          <div className="absolute inset-0 bg-white/50 backdrop-blur-sm z-10 flex items-center justify-center">
            <Loader2 className="w-8 h-8 animate-spin text-[#BF4B24]" />
          </div>
        )}

        <div className="overflow-x-auto min-h-[400px]">
          <table className="w-full text-left text-sm whitespace-nowrap">
            <thead className="bg-slate-50 text-slate-500 font-bold text-[10px] uppercase tracking-wider border-b border-slate-100">
              <tr>
                <th className="px-6 py-4">Clínica & Sala</th>
                <th className="px-6 py-4">Agendada em</th>
                <th className="px-6 py-4">Especialista (Locatário)</th>
                <th className="px-6 py-4">Entrada / Saída</th>
                <th className="px-6 py-4 text-center">Status</th>
                <th className="px-6 py-4 text-right">Valor Bruto</th>
                <th className="px-6 py-4 text-center">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-50">
              {filteredBookings.length === 0 && !loading ? (
                <tr>
                  <td colSpan={7} className="px-6 py-16 text-center">
                    <CalendarIcon className="w-12 h-12 text-slate-200 mx-auto mb-3" />
                    <p className="text-slate-500 font-bold">
                      Nenhum agendamento encontrado no período.
                    </p>
                  </td>
                </tr>
              ) : (
                filteredBookings.map((booking) => (
                  <tr
                    key={booking.id}
                    className="hover:bg-orange-50/30 transition-colors group"
                  >
                    <td className="px-6 py-4">
                      <p className="font-black text-slate-900 flex items-center gap-1.5">
                        <Building2 className="w-3.5 h-3.5 text-slate-400" />{" "}
                        {booking.clinic_name}
                      </p>
                      <p className="text-[10px] font-bold text-slate-500 mt-0.5 ml-5">
                        {booking.room_name}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-slate-600">
                        {format(parseISO(booking.created_at), "dd/MM/yyyy", {
                          locale: ptBR,
                        })}
                      </p>
                      <p className="text-[10px] font-medium text-slate-400">
                        {format(parseISO(booking.created_at), "HH:mm:ss")}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <p className="font-bold text-[#BF4B24]">
                        {booking.specialist_name}
                      </p>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-slate-300" />
                        <div>
                          <p className="font-bold text-slate-700">
                            {format(parseISO(booking.start_time), "dd/MM/yyyy")}
                          </p>
                          <p className="text-[10px] font-black text-emerald-600 mt-0.5">
                            {format(parseISO(booking.start_time), "HH:mm")} às{" "}
                            {format(parseISO(booking.end_time), "HH:mm")}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 text-center">
                      {getStatusBadge(booking.status)}
                    </td>
                    <td className="px-6 py-4 text-right">
                      <p className="font-black text-slate-900">
                        R${" "}
                        {booking.gross_value_brl.toLocaleString("pt-BR", {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2,
                        })}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-0.5">
                        {booking.pricing_label}
                      </p>
                    </td>
                    <td className="px-6 py-4 text-center flex items-center justify-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => handleOpenReschedule(booking)}
                        disabled={actionLoading}
                        className="h-8 font-bold border-orange-200 text-orange-600 hover:bg-orange-50"
                      >
                        {actionLoading ? (
                          <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                        ) : (
                          <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                        )}
                        Reagendar
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setSelectedBooking(booking);
                          setIsViewOpen(true);
                        }}
                        className="h-8 font-bold border-slate-200 text-slate-600 hover:bg-slate-50"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1.5" /> Visualizar
                      </Button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <div className="bg-slate-50 border-t border-slate-200 p-4 flex flex-col md:flex-row justify-end items-center gap-6">
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest">
            Total de agendamentos no filtro:{" "}
            <span className="text-slate-900">{filteredBookings.length}</span>
          </p>
          <div className="h-6 w-px bg-slate-200 hidden md:block"></div>
          <p className="text-sm font-bold text-slate-500 uppercase tracking-widest flex items-center gap-2">
            Receita Total Bruta:
            <span className="text-xl font-black text-emerald-600">
              R${" "}
              {totalRevenue.toLocaleString("pt-BR", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </p>
        </div>
      </div>

      {/* MODAL 1: VISUALIZAR DETALHES E CANCELAMENTO */}
      <Sheet open={isViewOpen} onOpenChange={setIsViewOpen}>
        <SheetContent className="overflow-y-auto w-full sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-2xl font-black text-slate-900">
              Detalhes da Reserva
            </SheetTitle>
            <SheetDescription>
              Informações completas para controle operacional.
            </SheetDescription>
          </SheetHeader>

          {selectedBooking && (
            <div className="mt-6 space-y-6">
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                <p className="text-xs font-bold text-slate-400 uppercase">
                  ID da Reserva
                </p>
                <p className="text-sm font-mono font-medium text-slate-700">
                  {selectedBooking.id}
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="bg-slate-50 p-4 rounded-xl border border-slate-200">
                  <p className="text-xs font-bold text-slate-400 uppercase">
                    Status
                  </p>
                  <div className="mt-1">
                    {getStatusBadge(selectedBooking.status)}
                  </div>
                </div>
                <div className="bg-emerald-50 p-4 rounded-xl border border-emerald-100">
                  <p className="text-xs font-bold text-emerald-600 uppercase">
                    Receita Bruta
                  </p>
                  <p className="text-lg font-black text-emerald-700">
                    R${" "}
                    {selectedBooking.gross_value_brl.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  <p className="text-[10px] font-bold text-emerald-600/80 mt-0.5">
                    {selectedBooking.pricing_label} (R${" "}
                    {selectedBooking.hourly_rate_brl.toLocaleString("pt-BR", {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2,
                    })}
                    /h)
                  </p>
                </div>
              </div>

              <div className="space-y-4">
                <div>
                  <Label className="text-slate-500 font-bold">
                    Clínica & Sala
                  </Label>
                  <p className="font-medium text-slate-900">
                    {selectedBooking.clinic_name} - {selectedBooking.room_name}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500 font-bold">
                    Especialista (Cliente)
                  </Label>
                  <p className="font-medium text-[#BF4B24]">
                    {selectedBooking.specialist_name}
                  </p>
                </div>
                <div>
                  <Label className="text-slate-500 font-bold">
                    Período Original
                  </Label>
                  <p className="font-medium text-slate-900">
                    {format(parseISO(selectedBooking.start_time), "dd/MM/yyyy")}{" "}
                    das {format(parseISO(selectedBooking.start_time), "HH:mm")}{" "}
                    às {format(parseISO(selectedBooking.end_time), "HH:mm")}
                  </p>
                </div>
              </div>

              {selectedBooking.status !== "cancelled" && (
                <div className="pt-6 mt-6 border-t border-slate-200">
                  <Button
                    variant="destructive"
                    className="w-full font-bold h-12 rounded-xl"
                    onClick={handleCancelBooking}
                    disabled={actionLoading}
                  >
                    {actionLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin mr-2" />
                    ) : (
                      <XCircle className="w-4 h-4 mr-2" />
                    )}
                    Cancelar Reserva e Estornar
                  </Button>
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* MODAL 2: REAGENDAR (COM FOTO DA SALA E REGRAS DE PASSADO) */}
      <Dialog open={isRescheduleOpen} onOpenChange={setIsRescheduleOpen}>
        <DialogContent className="sm:max-w-3xl bg-[#F5F2F0] border-none shadow-2xl">
          <DialogHeader className="mb-2">
            <DialogTitle className="text-xl font-black text-slate-900">
              Gestão de Reagendamento
            </DialogTitle>
            <DialogDescription className="text-slate-600 font-medium">
              Altere a data, o horário e a sala do cliente.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {/* SELETOR DE SALA COM FOTO TIPO AIRBNB */}
            <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-100 flex gap-4 items-center">
              <div className="w-16 h-16 rounded-xl bg-slate-100 overflow-hidden shrink-0 flex items-center justify-center border border-slate-200">
                {roomImageUrl ? (
                  <img
                    src={roomImageUrl}
                    alt="Foto da Sala"
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <Building2 className="w-8 h-8 text-slate-300" />
                )}
              </div>
              <div className="flex-1 space-y-1">
                <Label className="text-xs font-bold text-slate-400 uppercase tracking-wider">
                  Sala do Reagendamento
                </Label>
                <Select
                  value={selectedRescheduleRoomId || undefined}
                  onValueChange={(val) => {
                    setSelectedRescheduleRoomId(val);
                    setSelectedSlot("");
                  }}
                >
                  <SelectTrigger className="bg-white font-bold h-10 border-slate-200 text-slate-700 w-full text-left shadow-none focus:ring-[#BF4B24]">
                    <SelectValue placeholder="Selecione uma sala..." />
                  </SelectTrigger>
                  <SelectContent>
                    {candidateRooms.map((room) => (
                      <SelectItem
                        key={room.id}
                        value={room.id}
                        className="font-bold text-slate-700"
                      >
                        {room.name} ({room.host_name || "Clínica Padrão"})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* AVISO SE MUDOU A SALA ORIGINAL */}
            {isDifferentRoom && (
              <div className="bg-amber-50 border border-amber-200 p-3 rounded-lg flex gap-2 items-center animate-in fade-in">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <p className="text-xs font-medium text-amber-800">
                  <strong>Atenção:</strong> Você está alocando o cliente para
                  uma sala diferente da reserva original.
                </p>
              </div>
            )}

            <div className="flex flex-col md:flex-row gap-6">
              {/* Esquerda: Calendário com bloqueio do passado */}
              <div className="flex-shrink-0 border border-slate-100 rounded-xl p-2 bg-white shadow-sm h-fit">
                <Calendar
                  mode="single"
                  selected={rescheduleDate}
                  onSelect={(date) => {
                    if (date) setRescheduleDate(date);
                  }}
                  disabled={{ before: startOfDay(new Date()) }}
                  locale={ptBR}
                  className="bg-white rounded-lg w-full pointer-events-auto"
                />
              </div>

              {/* Direita: Horários Livres Calculados Dinamicamente */}
              <div className="flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <Label className="text-sm font-bold text-slate-700">
                    Horários Livres da Sala
                  </Label>
                  <span className="text-[#BF4B24] font-black text-sm">
                    {availableSlots.length > 0 && rescheduleDate
                      ? `${format(rescheduleDate, "dd/MM", { locale: ptBR })}`
                      : ""}
                  </span>
                </div>

                <div className="flex-1 bg-white border border-slate-100 shadow-sm rounded-xl p-4 overflow-y-auto min-h-[250px] max-h-[310px]">
                  {loadingSlots ? (
                    <div className="flex flex-col items-center justify-center h-full gap-2">
                      <Loader2 className="w-6 h-6 animate-spin text-[#BF4B24]" />
                      <p className="text-xs text-slate-500 font-medium">
                        Analisando cruzamento de agendas...
                      </p>
                    </div>
                  ) : availableSlots.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full text-center p-4">
                      <CalendarDays className="w-10 h-10 text-slate-300 mb-2" />
                      <p className="text-sm font-bold text-slate-500">
                        Nenhum horário disponível.
                      </p>
                      <p className="text-xs text-slate-400 mt-1">
                        Sala fechada, horário já passado ou totalmente ocupada.
                      </p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-2 lg:grid-cols-3 gap-2">
                      {availableSlots.map((slot) => {
                        const isSelected = selectedSlot === slot;
                        return (
                          <button
                            key={slot}
                            onClick={() => setSelectedSlot(slot)}
                            className={`py-2.5 px-3 rounded-lg border text-sm font-bold transition-all ${
                              isSelected
                                ? "bg-[#BF4B24] border-[#BF4B24] text-white shadow-md scale-105"
                                : "bg-slate-50 border-slate-200 text-slate-600 hover:border-orange-300 hover:text-[#BF4B24]"
                            }`}
                          >
                            {slot}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <DialogFooter className="mt-2 pt-2 border-t border-slate-200/50">
            <Button
              variant="ghost"
              onClick={() => setIsRescheduleOpen(false)}
              className="rounded-xl font-bold text-slate-500 hover:text-slate-800"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleReschedule}
              disabled={
                actionLoading || !selectedSlot || !selectedRescheduleRoomId
              }
              className="bg-[#BF4B24] hover:bg-[#9A3C1D] text-white font-black rounded-xl h-10 shadow-md"
            >
              {actionLoading ? (
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
              ) : (
                <Clock className="w-4 h-4 mr-2" />
              )}
              Salvar Novo Horário
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
