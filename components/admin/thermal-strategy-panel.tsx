// components/admin/thermal-strategy-panel.tsx
"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2,
  DoorOpen,
  Calendar as CalendarIcon,
  Clock,
  Layers,
  Loader2,
  BarChart3,
} from "lucide-react";
import {
  format,
  subDays,
  startOfMonth,
  endOfMonth,
  subMonths,
  startOfDay,
  endOfDay,
  parseISO,
  eachDayOfInterval,
  getDay,
  getHours,
} from "date-fns";

interface ShiftDef {
  id: "morning" | "afternoon" | "late_afternoon" | "night";
  label: string;
  shortLabel: string;
  startHour: number;
  endHour: number;
  hoursList: number[];
}

const SHIFTS_CONFIG: ShiftDef[] = [
  {
    id: "morning",
    label: "Manhã (08h–12h)",
    shortLabel: "Manhã",
    startHour: 8,
    endHour: 12,
    hoursList: [8, 9, 10, 11],
  },
  {
    id: "afternoon",
    label: "Tarde (12h–16h)",
    shortLabel: "Tarde",
    startHour: 12,
    endHour: 16,
    hoursList: [12, 13, 14, 15],
  },
  {
    id: "late_afternoon",
    label: "Fim de Tarde (16h–20h)",
    shortLabel: "Fim Tarde",
    startHour: 16,
    endHour: 20,
    hoursList: [16, 17, 18, 19],
  },
  {
    id: "night",
    label: "Noite (20h–23h)",
    shortLabel: "Noite",
    startHour: 20,
    endHour: 23,
    hoursList: [20, 21, 22],
  },
];

const WEEKDAYS_ORDER = [
  { dow: 1, short: "Seg", full: "Segunda-feira" },
  { dow: 2, short: "Ter", full: "Terça-feira" },
  { dow: 3, short: "Qua", full: "Quarta-feira" },
  { dow: 4, short: "Qui", full: "Quinta-feira" },
  { dow: 5, short: "Sex", full: "Sexta-feira" },
  { dow: 6, short: "Sáb", full: "Sábado" },
  { dow: 0, short: "Dom", full: "Domingo" },
];

const ALL_HOURS_LIST = [
  8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
];

interface CellRoomBreakdown {
  roomId: string;
  roomName: string;
  clinicName: string;
  tierLabel: string;
  hourlyRate: number;
  availableHours: number;
  occupiedHours: number;
  contractHours: number;
  packageHours: number;
  avulsoHours: number;
  freeHours: number;
  occupancyPct: number;
  hasFixedContract: boolean;
  contractNote: string | null;
}

interface ThermalCellStats {
  dow: number;
  dayShort: string;
  dayFull: string;
  colId: string;
  colLabel: string;
  occurrencesInPeriod: number;
  availableHours: number;
  occupiedHours: number;
  contractHours: number;
  packageHours: number;
  avulsoHours: number;
  freeHours: number;
  occupancyPct: number;
  contractSharePct: number;
  estimatedRevenueBrl: number;
  idleOpportunityBrl: number;
  status: "closed" | "contract_locked" | "hot" | "warm" | "cold";
  specialistsNames: string[];
  roomBreakdowns: CellRoomBreakdown[];
}

function normalizeTier(tier?: string | null): "start" | "vip" | "master" {
  const t = (tier || "start").toLowerCase().trim();
  if (t.includes("master") || t.includes("premium")) return "master";
  if (t.includes("vip")) return "vip";
  return "start";
}

function formatTierLabel(tier: "start" | "vip" | "master"): string {
  if (tier === "master") return "Premium";
  if (tier === "vip") return "VIP";
  return "Basic";
}

function resolveRoomHourlyRate(room: any): number {
  try {
    if (room?.modalities) {
      const parsed =
        typeof room.modalities === "string"
          ? JSON.parse(room.modalities)
          : room.modalities;
      const candidates = [
        parsed?.hourly?.price,
        parsed?.hourlyPrice,
        parsed?.price_per_hour,
        parsed?.price,
      ];
      for (const c of candidates) {
        const val = Number(c);
        if (!isNaN(val) && val > 0 && val <= 250) return val;
      }
    }
    if (room?.address_details) {
      const addr =
        typeof room.address_details === "string"
          ? JSON.parse(room.address_details)
          : room.address_details;
      const addrPrice = Number(addr?.pricing?.hourly);
      if (!isNaN(addrPrice) && addrPrice > 0 && addrPrice <= 250) {
        return addrPrice;
      }
    }
  } catch {}
  const t = normalizeTier(room?.tier);
  if (t === "master") return 60;
  if (t === "vip") return 41.13;
  return 33.38;
}

function calculateSlotUnits(startIso: string, endIso: string): number {
  const diffMinutes =
    (new Date(endIso).getTime() - new Date(startIso).getTime()) / (1000 * 60);
  if (diffMinutes <= 0) return 1;
  if (diffMinutes >= 45 && diffMinutes <= 65) return 1;
  return Math.max(1, Math.round(diffMinutes / 55));
}

function getRoomOpenHoursOnDate(room: any, dateObj: Date): Set<number> {
  const openHours = new Set<number>();
  const dateIso = format(dateObj, "yyyy-MM-dd");

  const blockedDates = Array.isArray(room?.blocked_dates)
    ? room.blocked_dates
    : [];
  if (blockedDates.includes(dateIso)) {
    return openHours;
  }

  let availability = room?.availability;
  if (typeof availability === "string") {
    try {
      availability = JSON.parse(availability);
    } catch {
      availability = null;
    }
  }

  const dow = getDay(dateObj);
  const defaultWeekdayHours = [
    8, 9, 10, 11, 13, 14, 15, 16, 17, 18, 19, 20, 21,
  ];

  if (availability && Array.isArray(availability.weekConfig)) {
    const dayCfg = availability.weekConfig.find(
      (w: any) => Number(w.day) === dow,
    );
    if (dayCfg && dayCfg.enabled) {
      if (dayCfg.rentalType === "hourly") {
        if (
          Array.isArray(dayCfg.availableHours) &&
          dayCfg.availableHours.length > 0
        ) {
          dayCfg.availableHours.forEach((slotStr: string) => {
            const h = parseInt(String(slotStr).split(/[:h-]/)[0], 10);
            if (!isNaN(h) && h >= 7 && h <= 22) openHours.add(h);
          });
        } else {
          defaultWeekdayHours.forEach((h) => openHours.add(h));
        }
      } else if (dayCfg.rentalType === "shift") {
        const shifts = Array.isArray(dayCfg.selectedShifts)
          ? dayCfg.selectedShifts
          : [];
        if (shifts.includes("morning"))
          [8, 9, 10, 11].forEach((h) => openHours.add(h));
        if (shifts.includes("afternoon"))
          [13, 14, 15, 16, 17].forEach((h) => openHours.add(h));
        if (shifts.includes("night"))
          [18, 19, 20, 21].forEach((h) => openHours.add(h));
      }
    }

    if (Array.isArray(availability.exceptions)) {
      const targetDateStr = dateObj.toDateString();
      const ex = availability.exceptions.find(
        (e: any) =>
          e?.date && new Date(e.date).toDateString() === targetDateStr,
      );
      if (ex) {
        if (ex.type === "block") {
          if (ex.isFullDay) {
            openHours.clear();
          } else if (Array.isArray(ex.hours)) {
            ex.hours.forEach((slotStr: string) => {
              const h = parseInt(String(slotStr).split(/[:h-]/)[0], 10);
              if (!isNaN(h)) openHours.delete(h);
            });
          }
        } else if (ex.type === "extra" && Array.isArray(ex.hours)) {
          ex.hours.forEach((slotStr: string) => {
            const h = parseInt(String(slotStr).split(/[:h-]/)[0], 10);
            if (!isNaN(h) && h >= 7 && h <= 22) openHours.add(h);
          });
        }
      }
    }
  } else {
    if (dow >= 1 && dow <= 5) {
      [8, 9, 10, 11, 13, 14, 15, 16, 17, 18].forEach((h) => openHours.add(h));
    } else if (dow === 6) {
      [8, 9, 10, 11].forEach((h) => openHours.add(h));
    }
  }

  return openHours;
}

function getContractCoveredHoursOnDate(
  roomContracts: any[],
  dateObj: Date,
  openHours: Set<number>,
): { hours: Set<number>; contractNotes: string[] } {
  const covered = new Set<number>();
  const notes: string[] = [];
  if (!roomContracts || roomContracts.length === 0 || openHours.size === 0) {
    return { hours: covered, contractNotes: notes };
  }

  const dateIso = format(dateObj, "yyyy-MM-dd");
  const dow = getDay(dateObj);

  roomContracts.forEach((c: any) => {
    if (c.status !== "active") return;
    if (c.start_date && dateIso < String(c.start_date).slice(0, 10)) return;
    if (c.end_date && dateIso > String(c.end_date).slice(0, 10)) return;

    const cType = String(c.contract_type || "").toLowerCase();
    const specName = c.specialist_name || "Locatário Fixo";

    if (cType.includes("monthly_exclusive")) {
      openHours.forEach((h) => covered.add(h));
      notes.push(
        c.allow_sublease
          ? `Contrato Mensal / Co-Host (${specName})`
          : `Sala Exclusiva (${specName})`,
      );
      return;
    }

    let sched = c.schedule_config;
    if (typeof sched === "string") {
      try {
        sched = JSON.parse(sched);
      } catch {
        sched = null;
      }
    }

    if (sched && typeof sched === "object") {
      const daysArray = Array.isArray(sched.days)
        ? sched.days.map(Number)
        : Array.isArray(sched.weekdays)
          ? sched.weekdays.map(Number)
          : null;

      if (daysArray && !daysArray.includes(dow)) return;

      let matchedAnyHour = false;

      if (Array.isArray(sched.hours) && sched.hours.length > 0) {
        sched.hours.forEach((hRaw: any) => {
          const h = parseInt(String(hRaw).split(/[:h-]/)[0], 10);
          if (!isNaN(h) && openHours.has(h)) {
            covered.add(h);
            matchedAnyHour = true;
          }
        });
      }

      const shiftsArr = Array.isArray(sched.shifts)
        ? sched.shifts
        : typeof sched.shift === "string"
          ? [sched.shift]
          : [];

      shiftsArr.forEach((sh: string) => {
        const s = String(sh).toLowerCase();
        if (s.includes("morn") || s.includes("manh")) {
          [8, 9, 10, 11].forEach((h) => {
            if (openHours.has(h)) {
              covered.add(h);
              matchedAnyHour = true;
            }
          });
        }
        if (s.includes("after") || s.includes("tard")) {
          [12, 13, 14, 15, 16, 17].forEach((h) => {
            if (openHours.has(h)) {
              covered.add(h);
              matchedAnyHour = true;
            }
          });
        }
        if (s.includes("night") || s.includes("noit")) {
          [18, 19, 20, 21, 22].forEach((h) => {
            if (openHours.has(h)) {
              covered.add(h);
              matchedAnyHour = true;
            }
          });
        }
      });

      if (matchedAnyHour) {
        notes.push(`Turno Fixo (${specName})`);
      }
    }
  });

  return { hours: covered, contractNotes: Array.from(new Set(notes)) };
}

const formatBRL = (val: number) =>
  val.toLocaleString("pt-BR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

export function AdminThermalStrategyPanel() {
  const [supabase] = useState(() => createClient());
  const todayIso = useMemo(() => format(new Date(), "yyyy-MM-dd"), []);

  const [loading, setLoading] = useState(true);

  const [QuickRange, setQuickRange] = useState<
    "7d" | "15d" | "30d" | "this_month" | "last_month" | "custom"
  >("30d");
  const [startDate, setStartDate] = useState(() =>
    format(subDays(new Date(), 29), "yyyy-MM-dd"),
  );
  const [endDate, setEndDate] = useState(() =>
    format(new Date(), "yyyy-MM-dd"),
  );

  const [selectedClinicId, setSelectedClinicId] = useState<string>("all");
  const [selectedRoomId, setSelectedRoomId] = useState<string>("all");

  const [matrixGranularity, setMatrixGranularity] = useState<
    "shifts" | "hourly"
  >("shifts");

  const [rooms, setRooms] = useState<any[]>([]);
  const [bookings, setBookings] = useState<any[]>([]);
  const [contracts, setContracts] = useState<any[]>([]);
  const [profilesMap, setProfilesMap] = useState(new Map<string, any>());

  const [selectedCell, setSelectedCell] = useState<ThermalCellStats | null>(
    null,
  );

  const handleApplyQuickRange = (
    preset: "7d" | "15d" | "30d" | "this_month" | "last_month",
  ) => {
    const now = new Date();
    setQuickRange(preset);
    if (preset === "7d") {
      setStartDate(format(subDays(now, 6), "yyyy-MM-dd"));
      setEndDate(format(now, "yyyy-MM-dd"));
    } else if (preset === "15d") {
      setStartDate(format(subDays(now, 14), "yyyy-MM-dd"));
      setEndDate(format(now, "yyyy-MM-dd"));
    } else if (preset === "30d") {
      setStartDate(format(subDays(now, 29), "yyyy-MM-dd"));
      setEndDate(format(now, "yyyy-MM-dd"));
    } else if (preset === "this_month") {
      setStartDate(format(startOfMonth(now), "yyyy-MM-dd"));
      setEndDate(format(now, "yyyy-MM-dd"));
    } else if (preset === "last_month") {
      const lastM = subMonths(now, 1);
      setStartDate(format(startOfMonth(lastM), "yyyy-MM-dd"));
      setEndDate(format(endOfMonth(lastM), "yyyy-MM-dd"));
    }
  };

  const fetchThermalData = useCallback(async () => {
    setLoading(true);
    try {
      const parsedStart = startDate
        ? parseISO(startDate)
        : subDays(new Date(), 29);
      const parsedEnd = endDate ? parseISO(endDate) : new Date();
      const safeStart = startOfDay(
        isNaN(parsedStart.getTime()) ? subDays(new Date(), 29) : parsedStart,
      );
      const safeEnd = endOfDay(
        isNaN(parsedEnd.getTime()) ? new Date() : parsedEnd,
      );

      const [roomsRes, bookingsRes, contractsRes] = await Promise.all([
        supabase
          .from("rooms")
          .select(
            "id, name, host_id, is_active, tier, modalities, address_details, availability, blocked_dates",
          )
          .order("name", { ascending: true }),
        supabase
          .from("bookings")
          .select(
            "id, start_time, end_time, status, room_id, user_id, contract_id, booking_origin, total_cost, agreed_value_brl",
          )
          .gte("start_time", safeStart.toISOString())
          .lte("start_time", safeEnd.toISOString())
          .in("status", ["confirmed", "completed", "in_progress"]),
        supabase.from("room_contracts").select("*"),
      ]);

      const roomsList = (roomsRes.data || []).filter(
        (r: any) => r.is_active !== false,
      );
      const bookingsList = bookingsRes.data || [];
      const contractsList = contractsRes.data || [];

      const profileIds = Array.from(
        new Set(
          [
            ...roomsList.map((r: any) => r.host_id),
            ...bookingsList.map((b: any) => b.user_id),
            ...contractsList.map((c: any) => c.specialist_id),
          ].filter(Boolean),
        ),
      );

      const profilesRes =
        profileIds.length > 0
          ? await supabase
              .from("profiles")
              .select("id, full_name, email, specialty")
              .in("id", profileIds)
          : { data: [] as any[] };

      const pMap = new Map<string, any>();
      (profilesRes.data || []).forEach((p: any) => pMap.set(p.id, p));

      setRooms(roomsList);
      setBookings(bookingsList);
      setContracts(contractsList);
      setProfilesMap(pMap);
    } catch (err) {
      console.error("Erro ao carregar ocupação:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase, startDate, endDate]);

  useEffect(() => {
    fetchThermalData();
  }, [fetchThermalData]);

  const clinicsList = useMemo(() => {
    const map = new Map<
      string,
      { id: string; name: string; roomsCount: number }
    >();
    rooms.forEach((r: any) => {
      const hostId = r.host_id || "fusion";
      const hostName =
        profilesMap.get(hostId)?.full_name || "Fusion Clinic (Sede)";
      const existing = map.get(hostId);
      if (existing) {
        existing.roomsCount += 1;
      } else {
        map.set(hostId, { id: hostId, name: hostName, roomsCount: 1 });
      }
    });
    return Array.from(map.values());
  }, [rooms, profilesMap]);

  const roomsInSelectedClinic = useMemo(() => {
    if (selectedClinicId === "all") return rooms;
    return rooms.filter(
      (r: any) => (r.host_id || "fusion") === selectedClinicId,
    );
  }, [rooms, selectedClinicId]);

  const activeScopedRooms = useMemo(() => {
    if (selectedRoomId !== "all") {
      return roomsInSelectedClinic.filter((r: any) => r.id === selectedRoomId);
    }
    return roomsInSelectedClinic;
  }, [roomsInSelectedClinic, selectedRoomId]);

  const thermalAnalysis = useMemo(() => {
    const parsedStart = startDate
      ? parseISO(startDate)
      : subDays(new Date(), 29);
    const parsedEnd = endDate ? parseISO(endDate) : new Date();
    const safeStart = startOfDay(
      isNaN(parsedStart.getTime()) ? subDays(new Date(), 29) : parsedStart,
    );
    const safeEnd = endOfDay(
      isNaN(parsedEnd.getTime()) || parsedEnd < safeStart
        ? safeStart
        : parsedEnd,
    );

    const daysInterval = eachDayOfInterval({ start: safeStart, end: safeEnd });

    const contractsByRoom = new Map<string, any[]>();
    contracts.forEach((c: any) => {
      if (!c.room_id) return;
      const list = contractsByRoom.get(c.room_id) || [];
      list.push(c);
      contractsByRoom.set(c.room_id, list);
    });

    const bookingsByRoomAndDate = new Map<string, any[]>();
    bookings.forEach((b: any) => {
      if (!b.room_id || !b.start_time) return;
      const dIso = format(parseISO(b.start_time), "yyyy-MM-dd");
      const key = `${b.room_id}_${dIso}`;
      const list = bookingsByRoomAndDate.get(key) || [];
      list.push(b);
      bookingsByRoomAndDate.set(key, list);
    });

    const columns =
      matrixGranularity === "shifts"
        ? SHIFTS_CONFIG.map((sh) => ({
            id: sh.id,
            label: sh.label,
            shortLabel: sh.shortLabel,
            hours: sh.hoursList,
          }))
        : ALL_HOURS_LIST.map((h) => ({
            id: `h_${h}`,
            label: `${String(h).padStart(2, "0")}h–${String(h + 1).padStart(2, "0")}h`,
            shortLabel: `${String(h).padStart(2, "0")}h`,
            hours: [h],
          }));

    const dowOccurrences = new Map<number, number>();
    WEEKDAYS_ORDER.forEach((w) => dowOccurrences.set(w.dow, 0));
    daysInterval.forEach((d) => {
      const dow = getDay(d);
      dowOccurrences.set(dow, (dowOccurrences.get(dow) || 0) + 1);
    });

    const matrixRows = WEEKDAYS_ORDER.map((w) => {
      const cells: ThermalCellStats[] = columns.map((col) => {
        const roomBreakdownsMap = new Map<string, CellRoomBreakdown>();

        activeScopedRooms.forEach((r: any) => {
          const hostId = r.host_id || "fusion";
          const clinicName =
            profilesMap.get(hostId)?.full_name || "Fusion Clinic";
          const rContracts = (contractsByRoom.get(r.id) || []).filter(
            (c: any) => c.status === "active",
          );
          roomBreakdownsMap.set(r.id, {
            roomId: r.id,
            roomName: r.name,
            clinicName,
            tierLabel: formatTierLabel(normalizeTier(r.tier)),
            hourlyRate: resolveRoomHourlyRate(r),
            availableHours: 0,
            occupiedHours: 0,
            contractHours: 0,
            packageHours: 0,
            avulsoHours: 0,
            freeHours: 0,
            occupancyPct: 0,
            hasFixedContract: rContracts.length > 0,
            contractNote: null,
          });
        });

        const specialistsSet = new Set<string>();
        let cellAvail = 0;
        let cellContractH = 0;
        let cellPackageH = 0;
        let cellAvulsoH = 0;
        let cellEstRev = 0;
        let cellIdleRev = 0;

        daysInterval.forEach((d) => {
          if (getDay(d) !== w.dow) return;
          const dateIso = format(d, "yyyy-MM-dd");

          activeScopedRooms.forEach((r: any) => {
            const rb = roomBreakdownsMap.get(r.id)!;
            const openHoursSet = getRoomOpenHoursOnDate(r, d);
            const rContracts = contractsByRoom.get(r.id) || [];
            const { hours: contractCoveredSet, contractNotes } =
              getContractCoveredHoursOnDate(rContracts, d, openHoursSet);

            if (contractNotes.length > 0 && !rb.contractNote) {
              rb.contractNote = contractNotes.join(" • ");
            }

            const dayBookings =
              bookingsByRoomAndDate.get(`${r.id}_${dateIso}`) || [];

            const hourState = new Map<
              number,
              "contract" | "package" | "avulso"
            >();

            contractCoveredSet.forEach((h) => {
              hourState.set(h, "contract");
            });

            dayBookings.forEach((b: any) => {
              const startD = parseISO(b.start_time);
              const endD = b.end_time ? parseISO(b.end_time) : null;
              const startH = getHours(startD);
              const slots = calculateSlotUnits(
                b.start_time,
                b.end_time || b.start_time,
              );
              const endH =
                endD && getHours(endD) > startH
                  ? getHours(endD)
                  : startH + slots;

              const isContractB = Boolean(
                b.contract_id ||
                (b.booking_origin &&
                  String(b.booking_origin).startsWith("contract")),
              );
              const isPkgB = Boolean(
                !isContractB &&
                ((b.booking_origin &&
                  String(b.booking_origin).startsWith("wallet_")) ||
                  (!b.booking_origin &&
                    Number(b.agreed_value_brl || 0) === 0 &&
                    Number(b.total_cost || 0) <= slots * 2)),
              );

              const bType: "contract" | "package" | "avulso" = isContractB
                ? "contract"
                : isPkgB
                  ? "package"
                  : "avulso";

              const specName =
                profilesMap.get(b.user_id)?.full_name || "Profissional";

              for (let h = startH; h < endH; h++) {
                if (col.hours.includes(h)) {
                  specialistsSet.add(specName);
                }
                if (!hourState.has(h) || bType !== "contract") {
                  hourState.set(h, bType);
                }
              }
            });

            col.hours.forEach((h) => {
              const isOpen = openHoursSet.has(h) || hourState.has(h);
              if (!isOpen) return;

              rb.availableHours += 1;
              cellAvail += 1;

              const occType = hourState.get(h);
              if (occType === "contract") {
                rb.occupiedHours += 1;
                rb.contractHours += 1;
                cellContractH += 1;
                cellEstRev += rb.hourlyRate;
              } else if (occType === "package") {
                rb.occupiedHours += 1;
                rb.packageHours += 1;
                cellPackageH += 1;
                cellEstRev += rb.hourlyRate;
              } else if (occType === "avulso") {
                rb.occupiedHours += 1;
                rb.avulsoHours += 1;
                cellAvulsoH += 1;
                cellEstRev += rb.hourlyRate * 1.15;
              } else {
                rb.freeHours += 1;
                cellIdleRev += rb.hourlyRate;
              }
            });
          });
        });

        const roomBreakdowns = Array.from(roomBreakdownsMap.values()).map(
          (rb) => ({
            ...rb,
            occupancyPct:
              rb.availableHours > 0
                ? Math.min(
                    100,
                    Math.round((rb.occupiedHours / rb.availableHours) * 100),
                  )
                : 0,
          }),
        );

        const cellOccupied = cellContractH + cellPackageH + cellAvulsoH;
        const cellFree = Math.max(0, cellAvail - cellOccupied);
        const occPct =
          cellAvail > 0
            ? Math.min(100, Math.round((cellOccupied / cellAvail) * 100))
            : 0;
        const contractSharePct =
          cellAvail > 0
            ? Math.min(100, Math.round((cellContractH / cellAvail) * 100))
            : 0;

        let status: ThermalCellStats["status"] = "cold";
        if (cellAvail === 0) {
          status = "closed";
        } else if (contractSharePct >= 70) {
          status = "contract_locked";
        } else if (occPct >= 70) {
          status = "hot";
        } else if (occPct >= 35) {
          status = "warm";
        } else {
          status = "cold";
        }

        return {
          dow: w.dow,
          dayShort: w.short,
          dayFull: w.full,
          colId: col.id,
          colLabel: col.label,
          occurrencesInPeriod: dowOccurrences.get(w.dow) || 0,
          availableHours: cellAvail,
          occupiedHours: cellOccupied,
          contractHours: cellContractH,
          packageHours: cellPackageH,
          avulsoHours: cellAvulsoH,
          freeHours: cellFree,
          occupancyPct: occPct,
          contractSharePct,
          estimatedRevenueBrl: cellEstRev,
          idleOpportunityBrl: cellIdleRev,
          status,
          specialistsNames: Array.from(specialistsSet),
          roomBreakdowns,
        };
      });

      return {
        dow: w.dow,
        dayShort: w.short,
        dayFull: w.full,
        occurrences: dowOccurrences.get(w.dow) || 0,
        cells,
      };
    });

    const roomSummaries = roomsInSelectedClinic.map((r: any) => {
      let avail = 0;
      let contractH = 0;
      let pkgH = 0;
      let avulsoH = 0;
      let freeH = 0;
      const hourlyRate = resolveRoomHourlyRate(r);

      matrixRows.forEach((row) => {
        row.cells.forEach((c) => {
          const rb = c.roomBreakdowns.find((x) => x.roomId === r.id);
          if (rb) {
            avail += rb.availableHours;
            contractH += rb.contractHours;
            pkgH += rb.packageHours;
            avulsoH += rb.avulsoHours;
            freeH += rb.freeHours;
          }
        });
      });

      const occ = contractH + pkgH + avulsoH;
      const occPct =
        avail > 0 ? Math.min(100, Math.round((occ / avail) * 100)) : 0;

      return {
        id: r.id,
        name: r.name,
        hostId: r.host_id || "fusion",
        clinicName:
          profilesMap.get(r.host_id || "fusion")?.full_name || "Fusion Clinic",
        tierLabel: formatTierLabel(normalizeTier(r.tier)),
        hourlyRate,
        availableHours: avail,
        occupiedHours: occ,
        contractHours: contractH,
        packageHours: pkgH,
        avulsoHours: avulsoH,
        freeHours: freeH,
        occupancyPct: occPct,
        idleOpportunityBrl: freeH * hourlyRate,
      };
    });

    let totalAvail = 0;
    let totalOccupied = 0;
    let totalContract = 0;
    let totalPackage = 0;
    let totalAvulso = 0;
    let totalFree = 0;
    let totalIdleOpportunityBrl = 0;

    const allCellsFlat: ThermalCellStats[] = [];
    matrixRows.forEach((r) => {
      r.cells.forEach((c) => {
        allCellsFlat.push(c);
        totalAvail += c.availableHours;
        totalOccupied += c.occupiedHours;
        totalContract += c.contractHours;
        totalPackage += c.packageHours;
        totalAvulso += c.avulsoHours;
        totalFree += c.freeHours;
        totalIdleOpportunityBrl += c.idleOpportunityBrl;
      });
    });

    const overallOccupancyPct =
      totalAvail > 0
        ? Math.min(100, Math.round((totalOccupied / totalAvail) * 100))
        : 0;
    const overallContractPct =
      totalAvail > 0
        ? Math.min(100, Math.round((totalContract / totalAvail) * 100))
        : 0;

    const openCells = allCellsFlat.filter((c) => c.availableHours > 0);
    const coldestCells = [...openCells]
      .filter((c) => c.status === "cold")
      .sort((a, b) => b.freeHours - a.freeHours);

    const hottestCells = [...openCells]
      .filter((c) => c.status === "hot" || c.status === "contract_locked")
      .sort((a, b) => b.occupancyPct - a.occupancyPct);

    const contractProtectedCells = openCells.filter((c) => c.contractHours > 0);

    return {
      columns,
      matrixRows,
      roomSummaries,
      totals: {
        totalAvail,
        totalOccupied,
        totalContract,
        totalPackage,
        totalAvulso,
        totalFree,
        overallOccupancyPct,
        overallContractPct,
        totalIdleOpportunityBrl,
      },
      insights: {
        topColdCell: coldestCells[0] || null,
        topHotCell: hottestCells[0] || null,
        contractProtectedCount: contractProtectedCells.length,
      },
    };
  }, [
    startDate,
    endDate,
    activeScopedRooms,
    roomsInSelectedClinic,
    contracts,
    bookings,
    profilesMap,
    matrixGranularity,
  ]);

  const getCellVisualStyle = (cell: ThermalCellStats) => {
    if (cell.status === "closed") {
      return "bg-slate-50/70 border-slate-200/60 border-dashed text-slate-300";
    }
    if (cell.status === "contract_locked") {
      return "bg-slate-900 border-slate-800 text-white hover:bg-slate-800";
    }
    if (cell.status === "hot") {
      return "bg-[#9A3C1D] border-[#7c2f15] text-white hover:bg-[#863318]";
    }
    if (cell.status === "warm") {
      return "bg-orange-100/90 border-orange-300 text-[#9A3C1D] hover:bg-orange-200/70";
    }
    return "bg-sky-50/80 border-sky-200/90 text-sky-950 hover:bg-sky-100/70";
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/90 mb-8 overflow-hidden shadow-2xs print:break-inside-avoid">
      <div className="p-6 border-b border-slate-200/80 bg-[#FAF7F4]">
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-900 tracking-tight">
              Ocupação por Turno, Clínica e Sala
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 max-w-3xl">
              Acompanhe os horários de maior procura, turnos já ocupados por
              contratos fixos e janelas disponíveis em cada consultório.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center bg-white p-1 rounded-xl border border-stone-200/90">
              {[
                { id: "7d", label: "7d" },
                { id: "15d", label: "15d" },
                { id: "30d", label: "30d" },
                { id: "this_month", label: "Este Mês" },
                { id: "last_month", label: "Mês Passado" },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => handleApplyQuickRange(p.id as any)}
                  className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                    QuickRange === p.id
                      ? "bg-slate-900 text-white"
                      : "text-slate-600 hover:text-slate-900"
                  }`}
                >
                  {p.label}
                </button>
              ))}
            </div>

            <div className="flex items-center bg-white border border-stone-200/90 rounded-xl px-3 py-1.5">
              <CalendarIcon className="w-3.5 h-3.5 text-[#BF4B24] mr-2 shrink-0" />
              <input
                type="date"
                value={startDate}
                max={todayIso}
                onChange={(e) => {
                  setQuickRange("custom");
                  setStartDate(e.target.value);
                }}
                className="bg-transparent border-0 text-xs font-semibold text-slate-800 outline-none w-28 tabular-nums"
              />
              <span className="text-slate-400 px-1.5 text-[11px]">até</span>
              <input
                type="date"
                value={endDate}
                max={todayIso}
                onChange={(e) => {
                  setQuickRange("custom");
                  setEndDate(e.target.value);
                }}
                className="bg-transparent border-0 text-xs font-semibold text-slate-800 outline-none w-28 tabular-nums"
              />
            </div>
          </div>
        </div>

        <div className="mt-5 pt-4 border-t border-stone-200/80 flex flex-col lg:flex-row lg:items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 h-10">
              <Building2 className="w-4 h-4 text-[#BF4B24] shrink-0" />
              <span className="text-[11px] font-semibold text-slate-400">
                Clínica:
              </span>
              <select
                value={selectedClinicId}
                onChange={(e) => {
                  setSelectedClinicId(e.target.value);
                  setSelectedRoomId("all");
                }}
                className="bg-transparent text-xs font-bold text-slate-900 outline-none cursor-pointer pr-2"
              >
                <option value="all">
                  Todas as Clínicas ({clinicsList.length})
                </option>
                {clinicsList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.roomsCount} salas)
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 bg-white border border-stone-200 rounded-xl px-3 h-10">
              <DoorOpen className="w-4 h-4 text-slate-700 shrink-0" />
              <span className="text-[11px] font-semibold text-slate-400">
                Sala:
              </span>
              <select
                value={selectedRoomId}
                onChange={(e) => setSelectedRoomId(e.target.value)}
                className="bg-transparent text-xs font-bold text-slate-900 outline-none cursor-pointer pr-2"
              >
                <option value="all">
                  Todas ({roomsInSelectedClinic.length} salas)
                </option>
                {roomsInSelectedClinic.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({formatTierLabel(normalizeTier(r.tier))})
                  </option>
                ))}
              </select>
            </div>

            {(selectedClinicId !== "all" || selectedRoomId !== "all") && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  setSelectedClinicId("all");
                  setSelectedRoomId("all");
                }}
                className="h-9 text-xs font-semibold text-[#BF4B24] hover:bg-orange-50 rounded-xl"
              >
                Limpar seleção
              </Button>
            )}
          </div>

          <div className="flex items-center gap-2 self-start lg:self-auto">
            <div className="flex bg-white p-1 rounded-xl border border-stone-200">
              <button
                type="button"
                onClick={() => setMatrixGranularity("shifts")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  matrixGranularity === "shifts"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                Por Turnos
              </button>
              <button
                type="button"
                onClick={() => setMatrixGranularity("hourly")}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all flex items-center gap-1.5 cursor-pointer ${
                  matrixGranularity === "hourly"
                    ? "bg-slate-900 text-white"
                    : "text-slate-600 hover:text-slate-900"
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                Hora a Hora (08h–22h)
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* CARDS DE SELEÇÃO RÁPIDA DE SALA */}
      <div className="px-6 py-4 bg-slate-50/70 border-b border-slate-200/80">
        <div className="flex items-stretch gap-3 overflow-x-auto pb-1 no-scrollbar">
          <button
            type="button"
            onClick={() => setSelectedRoomId("all")}
            className={`min-w-[195px] p-3.5 rounded-xl border text-left transition-all shrink-0 cursor-pointer ${
              selectedRoomId === "all"
                ? "bg-slate-900 text-white border-slate-900"
                : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
            }`}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider opacity-75">
                Consolidado
              </span>
              <span className="text-[11px] font-bold tabular-nums">
                {thermalAnalysis.totals.overallOccupancyPct}%
              </span>
            </div>
            <p className="text-xs font-bold mt-1 truncate">
              {selectedClinicId === "all"
                ? "Todas as Salas"
                : clinicsList.find((c) => c.id === selectedClinicId)?.name}
            </p>
            <div className="mt-2 flex items-center justify-between text-[10px] opacity-80 tabular-nums">
              <span>Contr: {thermalAnalysis.totals.totalContract}h</span>
              <span>
                Loc:{" "}
                {thermalAnalysis.totals.totalPackage +
                  thermalAnalysis.totals.totalAvulso}
                h
              </span>
              <span>Livres: {thermalAnalysis.totals.totalFree}h</span>
            </div>
          </button>

          {thermalAnalysis.roomSummaries.map((rm) => {
            const isSelected = selectedRoomId === rm.id;
            return (
              <button
                key={rm.id}
                type="button"
                onClick={() => setSelectedRoomId(isSelected ? "all" : rm.id)}
                className={`min-w-[205px] p-3.5 rounded-xl border text-left transition-all shrink-0 cursor-pointer ${
                  isSelected
                    ? "bg-[#BF4B24] text-white border-[#BF4B24]"
                    : "bg-white text-slate-800 border-slate-200 hover:border-slate-300"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span
                    className={`text-[10px] font-medium truncate ${
                      isSelected ? "text-white/85" : "text-slate-400"
                    }`}
                  >
                    {rm.clinicName} • {rm.tierLabel}
                  </span>
                  <span className="text-[11px] font-bold tabular-nums">
                    {rm.occupancyPct}%
                  </span>
                </div>

                <p className="text-xs font-bold mt-1 truncate">{rm.name}</p>

                <div
                  className={`mt-2 flex items-center justify-between text-[10px] tabular-nums ${
                    isSelected ? "text-white/90" : "text-slate-500"
                  }`}
                >
                  <span>Contr: {rm.contractHours}h</span>
                  <span>Loc: {rm.packageHours + rm.avulsoHours}h</span>
                  <span>Livres: {rm.freeHours}h</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* RESUMO NUMÉRICO */}
      <div className="grid grid-cols-2 lg:grid-cols-4 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 border-b border-slate-200 bg-white tabular-nums">
        <div className="p-4 sm:px-6">
          <span className="text-[11px] font-medium text-slate-500 block">
            Taxa de Ocupação no Período
          </span>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {thermalAnalysis.totals.overallOccupancyPct}%{" "}
            <span className="text-xs font-normal text-slate-400">
              ({thermalAnalysis.totals.totalOccupied}h /{" "}
              {thermalAnalysis.totals.totalAvail}h)
            </span>
          </p>
        </div>

        <div className="p-4 sm:px-6">
          <span className="text-[11px] font-medium text-slate-500 block">
            Horas em Contratos / Turnos Fixos
          </span>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {thermalAnalysis.totals.totalContract}h{" "}
            <span className="text-xs font-normal text-slate-500">
              ({thermalAnalysis.totals.overallContractPct}% do estoque)
            </span>
          </p>
        </div>

        <div className="p-4 sm:px-6">
          <span className="text-[11px] font-medium text-slate-500 block">
            Reservas Pass+ e Avulsas
          </span>
          <p className="text-xl font-bold text-[#BF4B24] mt-1">
            {thermalAnalysis.totals.totalPackage +
              thermalAnalysis.totals.totalAvulso}
            h{" "}
            <span className="text-xs font-normal text-slate-500">
              ({thermalAnalysis.totals.totalPackage}h Pass+ •{" "}
              {thermalAnalysis.totals.totalAvulso}h Avulso)
            </span>
          </p>
        </div>

        <div className="p-4 sm:px-6">
          <span className="text-[11px] font-medium text-slate-500 block">
            Horas Livres (Potencial em Aberto)
          </span>
          <p className="text-xl font-bold text-slate-900 mt-1">
            {thermalAnalysis.totals.totalFree}h{" "}
            <span className="text-xs font-normal text-slate-500">
              (R$ {formatBRL(thermalAnalysis.totals.totalIdleOpportunityBrl)})
            </span>
          </p>
        </div>
      </div>

      {/* MATRIZ PRINCIPAL */}
      <div className="p-6 relative">
        {loading && (
          <div className="absolute inset-0 bg-white/70 backdrop-blur-xs z-20 flex items-center justify-center">
            <Loader2 className="w-7 h-7 animate-spin text-[#BF4B24]" />
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
          <div className="flex flex-wrap items-center gap-3 text-[11px] font-medium text-slate-600">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-slate-900" />
              Contrato / Turno Fixo
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-[#9A3C1D]" />
              Alta Ocupação (≥70%)
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-orange-200 border border-orange-300" />
              Ocupação Moderada {"(35%–69%)"}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <span className="w-2.5 h-2.5 rounded-xs bg-sky-100 border border-sky-300" />
              Baixa Ocupação {"(<35%)"}
            </span>
          </div>

          <span className="text-[11px] text-slate-400">
            Clique em qualquer bloco para ver a ocupação de cada sala naquele
            horário
          </span>
        </div>

        <div className="overflow-x-auto pb-2">
          <div
            className={
              matrixGranularity === "shifts"
                ? "min-w-[680px]"
                : "min-w-[1150px]"
            }
          >
            <div
              className="grid gap-2 mb-2"
              style={{
                gridTemplateColumns:
                  matrixGranularity === "shifts"
                    ? "110px repeat(4, minmax(130px, 1fr))"
                    : "90px repeat(15, minmax(66px, 1fr))",
              }}
            >
              <div className="text-[10px] font-semibold uppercase text-slate-400 self-end pb-1">
                Dia da Semana
              </div>
              {thermalAnalysis.columns.map((col) => (
                <div
                  key={col.id}
                  className="text-center text-[10px] font-bold text-slate-600 uppercase tracking-wider bg-slate-100/80 py-2 rounded-lg"
                >
                  {matrixGranularity === "shifts" ? col.label : col.shortLabel}
                </div>
              ))}
            </div>

            <div className="space-y-2">
              {thermalAnalysis.matrixRows.map((row) => (
                <div
                  key={row.dow}
                  className="grid gap-2 items-stretch"
                  style={{
                    gridTemplateColumns:
                      matrixGranularity === "shifts"
                        ? "110px repeat(4, minmax(130px, 1fr))"
                        : "90px repeat(15, minmax(66px, 1fr))",
                  }}
                >
                  <div className="flex flex-col justify-center pr-2">
                    <span className="text-xs font-bold text-slate-800">
                      {row.dayFull.split("-")[0]}
                    </span>
                    <span className="text-[10px] text-slate-400">
                      {row.occurrences} {row.occurrences === 1 ? "dia" : "dias"}
                    </span>
                  </div>

                  {row.cells.map((cell) => {
                    const styleClass = getCellVisualStyle(cell);

                    if (matrixGranularity === "hourly") {
                      return (
                        <button
                          key={cell.colId}
                          type="button"
                          onClick={() => setSelectedCell(cell)}
                          className={`h-13 rounded-xl border p-1.5 flex flex-col items-center justify-center transition-all cursor-pointer tabular-nums ${styleClass}`}
                        >
                          {cell.status === "closed" ? (
                            <span className="text-[10px]">–</span>
                          ) : (
                            <>
                              <span className="text-xs font-bold">
                                {cell.occupancyPct}%
                              </span>
                              <span className="text-[9px] opacity-80">
                                {cell.occupiedHours}/{cell.availableHours}h
                              </span>
                            </>
                          )}
                        </button>
                      );
                    }

                    return (
                      <button
                        key={cell.colId}
                        type="button"
                        onClick={() => setSelectedCell(cell)}
                        className={`min-h-[74px] rounded-xl border p-3 flex flex-col justify-between text-left transition-all cursor-pointer tabular-nums ${styleClass}`}
                      >
                        {cell.status === "closed" ? (
                          <div className="m-auto text-center">
                            <span className="text-[11px] font-medium block">
                              Fechado
                            </span>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center justify-between w-full gap-1">
                              <span className="text-base font-bold tracking-tight">
                                {cell.occupancyPct}%
                              </span>
                              <span className="text-[10px] font-medium opacity-85">
                                {cell.occupiedHours}h / {cell.availableHours}h
                              </span>
                            </div>

                            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[10px] font-medium opacity-90">
                              {cell.contractHours > 0 && (
                                <span>Contr: {cell.contractHours}h</span>
                              )}
                              {cell.packageHours + cell.avulsoHours > 0 && (
                                <span>
                                  • Loc: {cell.packageHours + cell.avulsoHours}h
                                </span>
                              )}
                              {cell.freeHours > 0 && (
                                <span>• Livres: {cell.freeHours}h</span>
                              )}
                            </div>
                          </>
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* MODAL DE DETALHAMENTO POR SALA */}
      <Dialog
        open={Boolean(selectedCell)}
        onOpenChange={(open) => !open && setSelectedCell(null)}
      >
        <DialogContent className="sm:max-w-2xl max-h-[88vh] p-0 gap-0 overflow-hidden flex flex-col bg-white border-slate-200 shadow-2xl rounded-2xl">
          {selectedCell && (
            <>
              <DialogHeader className="px-6 py-4 bg-slate-900 text-white shrink-0">
                <div className="flex items-center justify-between pr-6">
                  <div>
                    <DialogTitle className="text-base font-bold text-white flex items-center gap-2">
                      <span>
                        {selectedCell.dayFull} • {selectedCell.colLabel}
                      </span>
                      <Badge className="bg-[#BF4B24] text-white border-0 text-xs font-bold">
                        {selectedCell.occupancyPct}% Ocupado
                      </Badge>
                    </DialogTitle>
                    <DialogDescription className="text-xs text-slate-400 mt-0.5">
                      {selectedCell.occupiedHours}h ocupadas de{" "}
                      {selectedCell.availableHours}h disponíveis no período.
                    </DialogDescription>
                  </div>
                </div>
              </DialogHeader>

              <div className="grid grid-cols-3 divide-x divide-slate-200 border-b border-slate-200 bg-slate-50 text-center py-3 text-xs tabular-nums shrink-0">
                <div>
                  <span className="text-[10px] text-slate-500 block">
                    Contratos / Turnos Fixos
                  </span>
                  <strong className="text-sm font-bold text-slate-900">
                    {selectedCell.contractHours}h (
                    {selectedCell.contractSharePct}%)
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">
                    Pass+ e Horas Avulsas
                  </span>
                  <strong className="text-sm font-bold text-[#BF4B24]">
                    {selectedCell.packageHours + selectedCell.avulsoHours}h
                  </strong>
                </div>
                <div>
                  <span className="text-[10px] text-slate-500 block">
                    Horas Livres
                  </span>
                  <strong className="text-sm font-bold text-slate-800">
                    {selectedCell.freeHours}h (R${" "}
                    {formatBRL(selectedCell.idleOpportunityBrl)})
                  </strong>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-6 space-y-2.5">
                {selectedCell.roomBreakdowns.map((rb) => (
                  <div
                    key={rb.roomId}
                    className="p-3.5 rounded-xl border border-slate-200 bg-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 tabular-nums"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-900">
                          {rb.roomName}
                        </span>
                        <Badge className="bg-slate-100 text-slate-700 border-0 text-[10px]">
                          {rb.tierLabel}
                        </Badge>
                        {rb.contractHours > 0 && (
                          <Badge className="bg-slate-900 text-white border-0 text-[10px]">
                            {rb.contractNote || "Contrato Fixo"}
                          </Badge>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        {rb.clinicName} • R$ {formatBRL(rb.hourlyRate)}/h
                      </p>
                    </div>

                    <div className="text-right text-xs">
                      <span className="font-bold text-slate-900 block">
                        {rb.availableHours === 0
                          ? "Fechada"
                          : `${rb.occupancyPct}% (${rb.occupiedHours}h / ${rb.availableHours}h)`}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Contr: {rb.contractHours}h • Loc:{" "}
                        {rb.packageHours + rb.avulsoHours}h • Livres:{" "}
                        {rb.freeHours}h
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
