"use client";

import { useState, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import {
  ChevronLeft,
  Calendar as CalendarIcon,
  Clock,
  Check,
  X,
  Copy,
  Trash2,
  PlusCircle,
  ShieldAlert,
  Loader2,
  AlertTriangle,
} from "lucide-react";
import { ptBR } from "date-fns/locale"; // IMPORTAÇÃO DA TRADUÇÃO
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { Switch } from "@/components/ui/switch";

interface HostAvailabilityProps {
  spaceId: string;
  onBack: () => void;
  onSave: () => void;
}

type RentalType = "hourly" | "shift";

interface WeekdayConfig {
  day: number;
  dayName: string;
  enabled: boolean;
  rentalType: RentalType;
  availableHours: string[];
  selectedShifts: string[];
}

interface CalendarException {
  date: Date;
  type: "block" | "extra";
  isFullDay?: boolean;
  hours: string[];
}

const WEEKDAYS = [
  { day: 1, name: "Segunda-feira", short: "Seg" },
  { day: 2, name: "Terça-feira", short: "Ter" },
  { day: 3, name: "Quarta-feira", short: "Qua" },
  { day: 4, name: "Quinta-feira", short: "Qui" },
  { day: 5, name: "Sexta-feira", short: "Sex" },
  { day: 6, name: "Sábado", short: "Sáb" },
  { day: 0, name: "Domingo", short: "Dom" },
];

const generateTimeSlots = () => {
  const slots = [];
  for (let hour = 6; hour <= 22; hour++) {
    const startHour = hour.toString().padStart(2, "0");
    const endHour = (hour + 1).toString().padStart(2, "0");
    slots.push(`${startHour}h-${endHour}h`);
  }
  return slots;
};

const ALL_TIME_SLOTS = generateTimeSlots();

const SHIFTS = [
  { id: "morning", label: "Matutino", time: "08h - 12h", icon: "🌅" },
  { id: "afternoon", label: "Vespertino", time: "13h - 18h", icon: "☀️" },
  { id: "night", label: "Noturno", time: "18h - 22h", icon: "🌙" },
];

const checkIsHoliday = (date: Date) => {
  const d = date.getDate();
  const m = date.getMonth() + 1;
  const holidays = [
    "1/1", // Ano Novo
    "21/4", // Tiradentes
    "1/5", // Dia do Trabalho
    "7/9", // Independência
    "12/10", // Nossa Senhora
    "2/11", // Finados
    "15/11", // Proclamação
    "25/12", // Natal
  ];
  return holidays.includes(`${d}/${m}`);
};

export function AvailabilityConfig({
  spaceId,
  onBack,
  onSave,
}: HostAvailabilityProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [confirmCopyDay, setConfirmCopyDay] = useState<number | null>(null);

  const [exceptions, setExceptions] = useState<CalendarException[]>([]);
  const [selectedDate, setSelectedDate] = useState<Date | undefined>();

  const [editingException, setEditingException] =
    useState<CalendarException | null>(null);
  const [exceptionTab, setExceptionTab] = useState<"block" | "extra">("block");
  const [blockScope, setBlockScope] = useState<"full" | "partial">("full");

  const [weekConfig, setWeekConfig] = useState<WeekdayConfig[]>(
    WEEKDAYS.map((wd) => ({
      day: wd.day,
      dayName: wd.name,
      enabled: wd.day !== 0 && wd.day !== 6,
      rentalType: "hourly",
      availableHours:
        wd.day !== 0 && wd.day !== 6
          ? [
              "08h-09h",
              "09h-10h",
              "10h-11h",
              "11h-12h",
              "13h-14h",
              "14h-15h",
              "15h-16h",
              "16h-17h",
              "17h-18h",
            ]
          : [],
      selectedShifts: [],
    })),
  );

  useEffect(() => {
    async function loadRoomConfig() {
      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("availability")
          .eq("id", spaceId)
          .single();

        if (error) throw error;

        if (data?.availability && Object.keys(data.availability).length > 0) {
          const config = data.availability as any;
          if (config.weekConfig) setWeekConfig(config.weekConfig);
          if (config.exceptions) {
            const parsedExceptions = config.exceptions.map((e: any) => ({
              ...e,
              date: new Date(e.date),
            }));
            setExceptions(parsedExceptions);
          }
        }
      } catch (err) {
        console.error("Erro ao carregar os horários da sala:", err);
      } finally {
        setLoading(false);
      }
    }

    if (spaceId) loadRoomConfig();
  }, [spaceId, supabase]);

  const handleSaveConfigToDatabase = async () => {
    setSaving(true);
    try {
      const payload = {
        weekConfig,
        exceptions: exceptions.map((e) => ({
          ...e,
          date: e.date.toISOString(),
        })),
      };

      const { error } = await supabase
        .from("rooms")
        .update({ availability: payload })
        .eq("id", spaceId);

      if (error) throw error;

      toast({
        title: "Disponibilidade Atualizada! 🎉",
        description: "Os horários e exceções foram sincronizados com sucesso.",
      });

      onSave();
    } catch (err: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: err.message,
      });
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDay = (day: number) => {
    setWeekConfig((prev) =>
      prev.map((config) =>
        config.day === day ? { ...config, enabled: !config.enabled } : config,
      ),
    );
  };

  const handleChangeRentalType = (day: number, rentalType: RentalType) => {
    setWeekConfig((prev) =>
      prev.map((config) =>
        config.day === day ? { ...config, rentalType } : config,
      ),
    );
  };

  const handleToggleHour = (day: number, hour: string) => {
    setWeekConfig((prev) =>
      prev.map((config) => {
        if (config.day === day) {
          const isSelected = config.availableHours.includes(hour);
          const newHours = isSelected
            ? config.availableHours.filter((h) => h !== hour)
            : [...config.availableHours, hour].sort();
          return { ...config, availableHours: newHours };
        }
        return config;
      }),
    );
  };

  const handleToggleShift = (day: number, shiftId: string) => {
    setWeekConfig((prev) =>
      prev.map((config) => {
        if (config.day === day) {
          const isSelected = config.selectedShifts.includes(shiftId);
          const newShifts = isSelected
            ? config.selectedShifts.filter((s) => s !== shiftId)
            : [...config.selectedShifts, shiftId];
          return { ...config, selectedShifts: newShifts };
        }
        return config;
      }),
    );
  };

  const handleSelectBusinessHours = (day: number) => {
    const businessHours = [
      "08h-09h",
      "09h-10h",
      "10h-11h",
      "11h-12h",
      "13h-14h",
      "14h-15h",
      "15h-16h",
      "16h-17h",
      "17h-18h",
    ];
    setWeekConfig((prev) =>
      prev.map((config) =>
        config.day === day
          ? { ...config, availableHours: businessHours }
          : config,
      ),
    );
  };

  const executeCopyAction = () => {
    if (confirmCopyDay === null) return;

    const source = weekConfig.find((c) => c.day === confirmCopyDay);
    if (!source) return;

    setWeekConfig((prev) =>
      prev.map((config) => ({
        ...config,
        enabled: source.enabled,
        rentalType: source.rentalType,
        availableHours: [...source.availableHours],
        selectedShifts: [...source.selectedShifts],
      })),
    );

    setConfirmCopyDay(null);
    toast({
      title: "Horários Copiados",
      description: `As configurações de ${source.dayName} foram aplicadas em todos os dias.`,
    });
  };

  const getBaseAvailableHoursForDate = (date: Date) => {
    if (checkIsHoliday(date)) return [];

    const dayOfWeek = date.getDay();
    const config = weekConfig.find((c) => c.day === dayOfWeek);
    if (!config || !config.enabled) return [];

    if (config.rentalType === "hourly") return config.availableHours;

    let shiftHours: string[] = [];
    if (config.selectedShifts.includes("morning"))
      shiftHours.push("08h-09h", "09h-10h", "10h-11h", "11h-12h");
    if (config.selectedShifts.includes("afternoon"))
      shiftHours.push("13h-14h", "14h-15h", "15h-16h", "16h-17h", "17h-18h");
    if (config.selectedShifts.includes("night"))
      shiftHours.push("18h-19h", "19h-20h", "20h-21h", "21h-22h");
    return shiftHours;
  };

  const handleSelectDateForException = (date: Date | undefined) => {
    if (!date) return;
    setSelectedDate(date);
    const existing = exceptions.find(
      (e) => e.date.toDateString() === date.toDateString(),
    );

    if (existing) {
      setEditingException({ ...existing });
      setExceptionTab(existing.type);
      setBlockScope(existing.isFullDay ? "full" : "partial");
    } else {
      if (checkIsHoliday(date)) {
        setEditingException({
          date,
          type: "extra",
          isFullDay: false,
          hours: [],
        });
        setExceptionTab("extra");
      } else {
        setEditingException({
          date,
          type: "block",
          isFullDay: true,
          hours: [],
        });
        setExceptionTab("block");
        setBlockScope("full");
      }
    }
  };

  const handleSaveException = () => {
    if (!editingException) return;
    const finalException: CalendarException = {
      ...editingException,
      type: exceptionTab,
    };
    if (exceptionTab === "block") {
      finalException.isFullDay = blockScope === "full";
      if (blockScope === "full") finalException.hours = [];
      if (blockScope === "partial" && finalException.hours.length === 0)
        return toast({
          variant: "destructive",
          title: "Atenção",
          description: "Selecione os horários para bloquear.",
        });
    } else {
      finalException.isFullDay = false;
      if (finalException.hours.length === 0)
        return toast({
          variant: "destructive",
          title: "Atenção",
          description: "Selecione os horários para liberar.",
        });
    }

    const dateStr = finalException.date.toDateString();
    const existingIndex = exceptions.findIndex(
      (e) => e.date.toDateString() === dateStr,
    );
    if (existingIndex >= 0) {
      setExceptions((prev) =>
        prev.map((e, i) => (i === existingIndex ? finalException : e)),
      );
    } else {
      setExceptions((prev) => [...prev, finalException]);
    }
    setEditingException(null);
    setSelectedDate(undefined);
  };

  const handleRemoveException = (date: Date) => {
    setExceptions((prev) =>
      prev.filter((e) => e.date.toDateString() !== date.toDateString()),
    );
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[50vh] gap-4">
        <Loader2 className="h-10 w-10 animate-spin text-[#f05e23]" />
        <p className="text-slate-500 font-medium">
          Carregando mapa de horários...
        </p>
      </div>
    );
  }

  const baseAvailableHours = editingException
    ? getBaseAvailableHoursForDate(editingException.date)
    : [];
  const baseClosedHours = editingException
    ? ALL_TIME_SLOTS.filter((h) => !baseAvailableHours.includes(h))
    : [];
  const isSelectedDateHoliday = editingException
    ? checkIsHoliday(editingException.date)
    : false;

  return (
    <div className="flex flex-col h-full bg-slate-50 pb-32 relative">
      <div className="bg-white border-b border-slate-200 p-4 sticky top-0 z-30 shadow-sm flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center hover:bg-slate-200 transition-colors"
          >
            <ChevronLeft className="w-5 h-5 text-slate-700" />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-900">
              Disponibilidade
            </h1>
            <p className="text-xs text-slate-500 font-medium hidden sm:block">
              Configure os horários de funcionamento
            </p>
          </div>
        </div>
        <Button
          onClick={handleSaveConfigToDatabase}
          disabled={saving}
          className="bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-sm font-bold h-10 px-6 transition-colors border-none"
        >
          {saving ? "Salvando..." : "Salvar Configuração"}
        </Button>
      </div>

      <div className="flex-1 overflow-auto p-4 lg:p-8 max-w-4xl mx-auto w-full space-y-6">
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900">
              Horário Base da Semana
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              Defina a regra fixa de como a sala funciona normalmente em cada
              dia.
            </p>
          </div>

          <div className="space-y-4">
            {weekConfig.map((config) => (
              <div
                key={config.day}
                className={`border rounded-xl overflow-hidden transition-all ${config.enabled ? "border-orange-200 bg-white shadow-sm" : "border-slate-200 bg-slate-50"}`}
              >
                <div className="flex items-center justify-between p-4 bg-slate-50/50 border-b border-slate-100">
                  <div className="flex items-center gap-3">
                    <Switch
                      checked={config.enabled}
                      onCheckedChange={() => handleToggleDay(config.day)}
                      className="data-[state=checked]:bg-[#f05e23]"
                    />
                    <span
                      className={`font-bold ${config.enabled ? "text-slate-900" : "text-slate-400"}`}
                    >
                      {config.dayName}
                    </span>
                  </div>
                  {config.enabled && (
                    <button
                      onClick={() => setConfirmCopyDay(config.day)}
                      className="text-xs font-bold flex items-center gap-1 text-[#f05e23] hover:underline"
                    >
                      <Copy className="w-3.5 h-3.5" /> Copiar p/ todos
                    </button>
                  )}
                </div>

                {config.enabled && (
                  <div className="p-4 space-y-5">
                    <div>
                      <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                        Modelo de Locação
                      </Label>
                      <div className="flex gap-2">
                        <button
                          onClick={() =>
                            handleChangeRentalType(config.day, "hourly")
                          }
                          className={`flex-1 py-2 rounded-lg border font-bold text-sm transition-all ${config.rentalType === "hourly" ? "border-[#f05e23] bg-orange-50 text-[#f05e23]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                        >
                          Por Hora
                        </button>
                        <button
                          onClick={() =>
                            handleChangeRentalType(config.day, "shift")
                          }
                          className={`flex-1 py-2 rounded-lg border font-bold text-sm transition-all ${config.rentalType === "shift" ? "border-[#f05e23] bg-orange-50 text-[#f05e23]" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"}`}
                        >
                          Por Turno
                        </button>
                      </div>
                    </div>

                    {config.rentalType === "hourly" && (
                      <div>
                        <div className="flex items-center justify-between mb-3">
                          <Label className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                            Horários Abertos
                          </Label>
                          <Button
                            onClick={() =>
                              handleSelectBusinessHours(config.day)
                            }
                            variant="outline"
                            size="sm"
                            className="h-7 text-xs font-bold text-slate-700"
                          >
                            Horário Comercial
                          </Button>
                        </div>
                        <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-8 gap-2 bg-slate-50 p-3 rounded-xl border border-slate-100">
                          {ALL_TIME_SLOTS.map((hour) => {
                            const isSelected =
                              config.availableHours.includes(hour);
                            return (
                              <button
                                key={hour}
                                type="button"
                                onClick={() =>
                                  handleToggleHour(config.day, hour)
                                }
                                className={`py-2 text-xs font-bold rounded-lg transition-all ${isSelected ? "bg-[#f05e23] text-white shadow-sm" : "bg-white text-slate-500 hover:bg-slate-200 border border-slate-200"}`}
                              >
                                {hour.split("-")[0]}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    {config.rentalType === "shift" && (
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        {SHIFTS.map((shift) => {
                          const isSelected = config.selectedShifts.includes(
                            shift.id,
                          );
                          return (
                            <button
                              key={shift.id}
                              type="button"
                              onClick={() =>
                                handleToggleShift(config.day, shift.id)
                              }
                              className={`p-4 rounded-xl border-2 transition-all flex flex-col items-start gap-2 ${isSelected ? "border-[#f05e23] bg-orange-50/40" : "border-slate-200 bg-white hover:border-slate-300"}`}
                            >
                              <div className="flex w-full justify-between items-center">
                                <span className="text-2xl">{shift.icon}</span>
                                {isSelected && (
                                  <Check className="w-5 h-5 text-[#f05e23]" />
                                )}
                              </div>
                              <div className="text-left">
                                <p
                                  className={`font-black ${isSelected ? "text-[#f05e23]" : "text-slate-900"}`}
                                >
                                  {shift.label}
                                </p>
                                <p className="text-xs font-medium text-slate-500">
                                  {shift.time}
                                </p>
                              </div>
                            </button>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
                {!config.enabled && (
                  <div className="p-4 text-center bg-slate-50">
                    <p className="text-sm font-bold text-slate-400">
                      Sala Fechada neste dia
                    </p>
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* SEÇÃO DE EXCEÇÕES */}
        <section className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200">
          <div className="mb-6">
            <h2 className="text-xl font-black text-slate-900">
              Exceções e Feriados
            </h2>
            <p className="text-sm text-slate-500 font-medium">
              Feriados nacionais são fechados automaticamente. Libere horários
              extras se desejar funcionar.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div>
              <Label className="font-bold text-slate-700 block mb-3">
                1. Selecione a Data no Calendário
              </Label>
              <div className="border border-slate-200 rounded-xl p-2 bg-slate-50 shadow-inner">
                {/* CALENDÁRIO COM TRADUÇÃO E DESTAQUE DE FERIADO */}
                <Calendar
                  mode="single"
                  selected={selectedDate}
                  onSelect={handleSelectDateForException}
                  locale={ptBR}
                  modifiers={{
                    holiday: (date) => checkIsHoliday(date),
                  }}
                  modifiersClassNames={{
                    holiday:
                      "text-[#f05e23] font-black underline decoration-[#f05e23]/30 underline-offset-4",
                  }}
                  className="bg-white rounded-lg shadow-sm w-full pointer-events-auto"
                />
              </div>
            </div>

            {editingException ? (
              <div
                className={`border-2 rounded-xl p-5 shadow-sm animate-in fade-in zoom-in-95 ${exceptionTab === "block" ? "bg-red-50 border-red-200" : "bg-emerald-50 border-emerald-200"}`}
              >
                <div
                  className={`flex justify-between items-center mb-4 border-b pb-3 ${exceptionTab === "block" ? "border-red-100" : "border-emerald-100"}`}
                >
                  <h3
                    className={`font-black flex items-center gap-2 ${exceptionTab === "block" ? "text-red-900" : "text-emerald-900"}`}
                  >
                    {exceptionTab === "block" ? (
                      <ShieldAlert className="w-5 h-5" />
                    ) : (
                      <PlusCircle className="w-5 h-5" />
                    )}
                    {isSelectedDateHoliday
                      ? "Feriado Nacional"
                      : "Configurar Exceção"}
                  </h3>
                  <button
                    onClick={() => {
                      setEditingException(null);
                      setSelectedDate(undefined);
                    }}
                    className="text-slate-400 hover:text-slate-700"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <p
                  className={`font-bold mb-2 capitalize ${exceptionTab === "block" ? "text-red-800" : "text-emerald-800"}`}
                >
                  {editingException.date.toLocaleDateString("pt-BR", {
                    weekday: "long",
                    day: "2-digit",
                    month: "long",
                  })}
                </p>

                {isSelectedDateHoliday && (
                  <p className="text-xs font-bold text-amber-700 bg-amber-100 p-2 rounded-md mb-4 border border-amber-200">
                    Este dia está automaticamente fechado por ser feriado. Use a
                    aba "Liberar Extra" para abrir um plantão.
                  </p>
                )}

                <div className="flex gap-2 mb-5 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
                  <button
                    onClick={() => setExceptionTab("block")}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${exceptionTab === "block" ? "bg-red-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    Bloquear Sala
                  </button>
                  <button
                    onClick={() => setExceptionTab("extra")}
                    className={`flex-1 py-2 rounded-lg font-bold text-sm transition-all ${exceptionTab === "extra" ? "bg-emerald-600 text-white shadow-md" : "text-slate-600 hover:bg-slate-50"}`}
                  >
                    Liberar / Extra
                  </button>
                </div>

                <div className="space-y-4">
                  {exceptionTab === "block" && (
                    <>
                      <div className="flex gap-2">
                        <button
                          onClick={() => {
                            setBlockScope("full");
                            setEditingException({
                              ...editingException,
                              hours: [],
                            });
                          }}
                          className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-sm transition-all ${blockScope === "full" ? "border-red-600 bg-red-100 text-red-800" : "border-red-200 bg-white text-red-600 hover:bg-red-50"}`}
                        >
                          Dia Inteiro
                        </button>
                        <button
                          onClick={() => setBlockScope("partial")}
                          className={`flex-1 py-2.5 rounded-xl border-2 font-bold text-sm transition-all ${blockScope === "partial" ? "border-red-600 bg-red-100 text-red-800" : "border-red-200 bg-white text-red-600 hover:bg-red-50"}`}
                        >
                          Parcial
                        </button>
                      </div>

                      {blockScope === "partial" && (
                        <div>
                          {baseAvailableHours.length === 0 ? (
                            <div className="bg-red-100 text-red-700 p-3 rounded-xl text-sm font-bold text-center">
                              {isSelectedDateHoliday
                                ? "Já está fechado por conta do feriado."
                                : "Este dia já está fechado na configuração base."}
                            </div>
                          ) : (
                            <>
                              <p className="text-xs font-bold text-red-700 mb-2 uppercase tracking-wider">
                                Bloquear horários específicos:
                              </p>
                              <div className="grid grid-cols-4 gap-2">
                                {baseAvailableHours.map((hour) => {
                                  const isSelected =
                                    editingException.hours.includes(hour);
                                  return (
                                    <button
                                      key={hour}
                                      type="button"
                                      onClick={() => {
                                        const newHours = isSelected
                                          ? editingException.hours.filter(
                                              (h) => h !== hour,
                                            )
                                          : [...editingException.hours, hour];
                                        setEditingException({
                                          ...editingException,
                                          hours: newHours,
                                        });
                                      }}
                                      className={`py-1.5 text-xs font-bold rounded-md transition-all ${isSelected ? "bg-red-600 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
                                    >
                                      {hour.split("-")[0]}
                                    </button>
                                  );
                                })}
                              </div>
                            </>
                          )}
                        </div>
                      )}
                    </>
                  )}

                  {exceptionTab === "extra" && (
                    <div>
                      {baseClosedHours.length === 0 ? (
                        <div className="bg-emerald-100 text-emerald-700 p-3 rounded-xl text-sm font-bold text-center">
                          A sala já está aberta totalmente neste dia.
                        </div>
                      ) : (
                        <>
                          <p className="text-xs font-bold text-emerald-700 mb-2 uppercase tracking-wider">
                            Liberar horários extras (Plantão):
                          </p>
                          <div className="grid grid-cols-4 gap-2">
                            {baseClosedHours.map((hour) => {
                              const isSelected =
                                editingException.hours.includes(hour);
                              return (
                                <button
                                  key={hour}
                                  type="button"
                                  onClick={() => {
                                    const newHours = isSelected
                                      ? editingException.hours.filter(
                                          (h) => h !== hour,
                                        )
                                      : [...editingException.hours, hour];
                                    setEditingException({
                                      ...editingException,
                                      hours: newHours,
                                    });
                                  }}
                                  className={`py-1.5 text-xs font-bold rounded-md transition-all ${isSelected ? "bg-emerald-600 text-white" : "bg-white text-slate-500 border border-slate-200"}`}
                                >
                                  {hour.split("-")[0]}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>
                  )}

                  <Button
                    onClick={handleSaveException}
                    className={`w-full text-white font-black h-12 rounded-xl mt-4 shadow-md ${(exceptionTab === "block" && blockScope === "partial" && baseAvailableHours.length === 0) || (exceptionTab === "extra" && baseClosedHours.length === 0) ? "hidden" : ""} ${exceptionTab === "block" ? "bg-red-600 hover:bg-red-700" : "bg-emerald-600 hover:bg-emerald-700"}`}
                  >
                    <Check className="w-5 h-5 mr-2" />{" "}
                    {exceptionTab === "block"
                      ? "Aplicar Bloqueio"
                      : "Ativar Plantão Extra"}
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border-2 border-dashed border-slate-200 rounded-xl p-8 flex flex-col items-center justify-center text-center h-[350px]">
                <CalendarIcon className="w-12 h-12 text-slate-300 mb-3" />
                <h3 className="font-bold text-slate-600">
                  Nenhuma data selecionada
                </h3>
                <p className="text-sm font-medium text-slate-400 mt-1 max-w-[250px]">
                  Clique num dia do calendário ao lado para adicionar exceções
                  ou trabalhar em feriados.
                </p>
              </div>
            )}
          </div>

          {exceptions.length > 0 && (
            <div className="mt-8">
              <h3 className="font-bold text-slate-900 mb-3 border-b border-slate-100 pb-2">
                Exceções Ativas ({exceptions.length})
              </h3>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-2">
                {exceptions.map((exc, idx) => {
                  const isBlock = exc.type === "block";
                  return (
                    <div
                      key={idx}
                      className={`flex items-center justify-between p-3 border rounded-xl ${isBlock ? "bg-red-50 border-red-100" : "bg-emerald-50 border-emerald-100"}`}
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 ${isBlock ? "bg-red-100" : "bg-emerald-100"}`}
                        >
                          {isBlock ? (
                            exc.isFullDay ? (
                              <CalendarIcon className="w-5 h-5 text-red-600" />
                            ) : (
                              <ShieldAlert className="w-5 h-5 text-red-600" />
                            )
                          ) : (
                            <PlusCircle className="w-5 h-5 text-emerald-600" />
                          )}
                        </div>
                        <div>
                          <p
                            className={`font-bold text-sm capitalize ${isBlock ? "text-red-900" : "text-emerald-900"}`}
                          >
                            {exc.date.toLocaleDateString("pt-BR")}
                          </p>
                          <p
                            className={`text-xs font-medium ${isBlock ? "text-red-700" : "text-emerald-700"}`}
                          >
                            {isBlock
                              ? exc.isFullDay
                                ? "Bloqueado o Dia Todo"
                                : `${exc.hours.length} horários bloqueados`
                              : `Plantão Extra: ${exc.hours.length} horários liberados`}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={() => handleRemoveException(exc.date)}
                        className={`p-2 rounded-lg transition-colors ${isBlock ? "text-red-400 hover:text-red-600 hover:bg-red-100" : "text-emerald-500 hover:text-emerald-700 hover:bg-emerald-100"}`}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>
      </div>

      {confirmCopyDay !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 backdrop-blur-sm p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-sm w-full p-6 animate-in zoom-in-95">
            <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertTriangle className="w-6 h-6 text-[#f05e23]" />
            </div>
            <h3 className="text-xl font-black text-center text-slate-900 mb-2">
              Atenção
            </h3>
            <p className="text-center text-slate-500 font-medium mb-6">
              Você está prestes a copiar toda a configuração de{" "}
              <strong className="text-slate-800">
                {weekConfig.find((c) => c.day === confirmCopyDay)?.dayName}
              </strong>{" "}
              para <b>todos os outros dias da semana</b>. Deseja continuar?
            </p>
            <div className="flex gap-3">
              <Button
                variant="outline"
                className="flex-1 font-bold h-12 rounded-xl border-slate-200 text-slate-600"
                onClick={() => setConfirmCopyDay(null)}
              >
                Cancelar
              </Button>
              <Button
                className="flex-1 font-bold h-12 rounded-xl bg-[#f05e23] hover:bg-[#d6521e] text-white"
                onClick={executeCopyAction}
              >
                Sim, Copiar
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
