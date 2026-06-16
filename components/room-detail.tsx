"use client";

import { useState, useEffect, useMemo } from "react";
import Image from "next/image";
import { createClient } from "@/utils/supabase/client";
import { ptBR } from "date-fns/locale";
import { format, addDays, isSameDay, startOfToday } from "date-fns";
import {
  ArrowLeft,
  Heart,
  MapPin,
  Users,
  Star,
  Wifi,
  Monitor,
  Coffee,
  Wind,
  Car,
  ShieldCheck,
  Calendar as CalendarIcon,
  Clock,
  AlertCircle,
  CheckCircle2,
  ChevronRight,
  Printer,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

const AMENITIES_LIST = [
  { id: "wifi", label: "Wi-Fi de alta velocidade", icon: Wifi },
  { id: "tv", label: 'TV 65" com HDMI', icon: Monitor },
  { id: "coffee", label: "Café e água", icon: Coffee },
  { id: "ac", label: "Ar-condicionado", icon: Wind },
  { id: "printer", label: "Impressora disponível", icon: Printer },
  { id: "parking", label: "Estacionamento", icon: Car },
  { id: "security", label: "Segurança 24h", icon: ShieldCheck },
];

interface RoomDetailProps {
  roomId: string | any; // Aceita tanto a string do ID quanto o objeto inteiro para evitar travamentos
  onBack: () => void;
}

export function RoomDetail({ roomId, onBack }: RoomDetailProps) {
  const supabase = createClient();
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [bookingLoading, setBookingLoading] = useState(false);
  const [room, setRoom] = useState<any>(null);

  const today = startOfToday();
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [selectedSlots, setSelectedSlots] = useState<string[]>([]);
  const [isFavorited, setIsFavorited] = useState(false);

  // EFEITO BLINDADO: Carregamento rápido e seguro
  useEffect(() => {
    let isMounted = true;
    // Puxa o ID independente de como o componente pai enviou os dados
    const idToFetch = typeof roomId === "object" ? roomId?.id : roomId;

    async function fetchRoomDetails() {
      if (!idToFetch) {
        if (isMounted) setLoading(false);
        return;
      }

      try {
        const { data, error } = await supabase
          .from("rooms")
          .select("*") // Removido joins desnecessários para carregar instantaneamente
          .eq("id", idToFetch)
          .single();

        if (error) throw error;
        if (isMounted) setRoom(data);
      } catch (err) {
        console.error("Erro ao buscar sala:", err);
        if (isMounted) {
          toast({
            variant: "destructive",
            title: "Erro",
            description: "Não foi possível carregar os detalhes desta sala.",
          });
          onBack();
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    }

    fetchRoomDetails();

    return () => {
      isMounted = false;
    };
  }, [roomId]);

  // Lógica de Disponibilidade (Puxando do Banco)
  const availableSlots = useMemo(() => {
    if (!room) return [];
    if (!room.availability) {
      return [
        "08h00 - 09h00",
        "09h00 - 10h00",
        "10h00 - 11h00",
        "11h00 - 12h00",
        "14h00 - 15h00",
        "15h00 - 16h00",
        "16h00 - 17h00",
        "17h00 - 18h00",
      ];
    }

    const { weekConfig, exceptions } = room.availability;

    if (exceptions) {
      const exception = exceptions.find((e: any) =>
        isSameDay(new Date(e.date), selectedDate),
      );
      if (exception) {
        if (exception.type === "block" && exception.isFullDay) return [];
        if (exception.type === "extra") return exception.hours || [];
      }
    }

    const dayOfWeek = selectedDate.getDay();
    const configForDay = weekConfig?.find((c: any) => c.day === dayOfWeek);

    if (!configForDay || !configForDay.enabled) return [];

    if (configForDay.rentalType === "hourly") {
      return configForDay.availableHours.map((h: string) => {
        const [start, end] = h.split("-");
        return `${start}00 - ${end}00`;
      });
    }

    let shiftHours: string[] = [];
    if (configForDay.selectedShifts?.includes("morning"))
      shiftHours.push(
        "08h00 - 09h00",
        "09h00 - 10h00",
        "10h00 - 11h00",
        "11h00 - 12h00",
      );
    if (configForDay.selectedShifts?.includes("afternoon"))
      shiftHours.push(
        "13h00 - 14h00",
        "14h00 - 15h00",
        "15h00 - 16h00",
        "16h00 - 17h00",
        "17h00 - 18h00",
      );
    if (configForDay.selectedShifts?.includes("night"))
      shiftHours.push(
        "18h00 - 19h00",
        "19h00 - 20h00",
        "20h00 - 21h00",
        "21h00 - 22h00",
      );

    return shiftHours;
  }, [room, selectedDate]);

  const toggleSlot = (slot: string) => {
    setSelectedSlots((prev) =>
      prev.includes(slot)
        ? prev.filter((s) => s !== slot)
        : [...prev, slot].sort(),
    );
  };

  const handleBooking = async () => {
    if (selectedSlots.length === 0) {
      return toast({
        variant: "destructive",
        title: "Atenção",
        description: "Selecione pelo menos um horário.",
      });
    }

    setBookingLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Você precisa estar logado.");

      const pricing = room.address_details?.pricing || {};
      const hourlyRate = Number(pricing.hourly || 45);
      const totalCost = selectedSlots.length * hourlyRate;

      const firstSlot = selectedSlots[0].split(" - ")[0].replace("h", ":");
      const lastSlot = selectedSlots[selectedSlots.length - 1]
        .split(" - ")[1]
        .replace("h", ":");

      const dateStr = format(selectedDate, "yyyy-MM-dd");
      const startTime = new Date(`${dateStr}T${firstSlot}:00`).toISOString();
      const endTime = new Date(`${dateStr}T${lastSlot}:00`).toISOString();

      const { error: bookingError } = await supabase.from("bookings").insert({
        user_id: room.id,
        room_id: room.id,
        start_time: startTime,
        end_time: endTime,
        total_cost: totalCost,
        status: "pending",
      });

      if (bookingError) throw bookingError;

      toast({
        title: "Reserva Solicitada! 🎉",
        description:
          "Sua intenção de reserva foi enviada. O anfitrião entrará em contato.",
      });
      onBack();
    } catch (err: any) {
      console.error(err);
      toast({
        variant: "destructive",
        title: "Erro na reserva",
        description: err.message || "Tente novamente mais tarde.",
      });
    } finally {
      setBookingLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="fixed inset-0 z-[100] bg-white flex flex-col items-center justify-center">
        <Loader2 className="h-10 w-10 animate-spin text-[#f05e23]" />
        <p className="mt-4 text-slate-500 font-medium">
          Preparando o espaço...
        </p>
      </div>
    );
  }

  if (!room) return null;

  const address = room.address_details || {};
  const pricing = address.pricing || {};
  const gallery = address.gallery || [];
  const allImages = [room.image_url, ...gallery].filter(Boolean);

  const hourlyRate = Number(pricing.hourly || 45);
  const totalCost = selectedSlots.length * hourlyRate;

  const calendarDays = Array.from({ length: 14 }).map((_, i) =>
    addDays(today, i),
  );

  const displayAmenities =
    address.amenities && address.amenities.length > 0
      ? address.amenities
      : ["wifi", "tv", "coffee", "ac", "printer", "parking"];

  return (
    <div className="fixed inset-0 z-[100] bg-white overflow-y-auto pb-32 animate-in slide-in-from-bottom-4">
      <div className="absolute top-6 w-full px-4 z-10 flex justify-between">
        <button
          onClick={onBack}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md text-slate-900 transition-transform hover:scale-105"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => setIsFavorited(!isFavorited)}
          className="flex h-10 w-10 items-center justify-center rounded-full bg-white shadow-md transition-transform hover:scale-105"
        >
          <Heart
            className={`w-5 h-5 ${isFavorited ? "fill-red-500 text-red-500" : "text-slate-900"}`}
          />
        </button>
      </div>

      <div className="relative w-full h-[35vh] sm:h-[45vh] bg-slate-100 flex overflow-x-auto snap-x snap-mandatory scrollbar-hide">
        {allImages.length > 0 ? (
          allImages.map((img, idx) => (
            <div
              key={idx}
              className="relative w-full h-full shrink-0 snap-center"
            >
              <Image
                src={img}
                alt={`${room.name} - Foto ${idx + 1}`}
                fill
                className="object-cover"
                sizes="100vw"
                priority={idx === 0}
              />
            </div>
          ))
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            Sem fotos disponíveis
          </div>
        )}
      </div>

      <div className="px-5 py-6 max-w-3xl mx-auto space-y-8">
        <section>
          <div className="flex justify-between items-start gap-4 mb-3">
            <h1 className="text-[22px] font-medium text-slate-900 leading-tight">
              {room.name}
            </h1>
            <div className="flex items-center gap-1 bg-amber-50 px-2 py-1 rounded-md shrink-0">
              <Star className="w-3.5 h-3.5 fill-amber-500 text-amber-500" />
              <span className="text-xs font-bold text-slate-700">
                4.8 <span className="text-slate-400 font-normal">(124)</span>
              </span>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs font-medium text-slate-600 mb-4">
            <div className="flex items-center gap-1.5">
              <MapPin className="w-3.5 h-3.5 text-slate-400" /> 0.8 km
            </div>
            <div className="flex items-center gap-1.5">
              <Users className="w-3.5 h-3.5 text-slate-400" /> Até{" "}
              {address.capacity || 12} pessoas
            </div>
          </div>

          <div className="bg-slate-50 p-4 rounded-xl">
            <p className="text-xs font-semibold text-slate-500 mb-1">
              Endereço
            </p>
            <p className="text-sm font-medium text-slate-900">
              {address.street
                ? `${address.street}, ${address.number} - ${address.city}, ${address.state}`
                : "Av. Paulista, 1000 - São Paulo, SP"}
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 mb-2">
            Sobre o espaço
          </h2>
          <p className="text-slate-600 leading-relaxed text-sm font-medium">
            {room.description ||
              "Sala de reunião equipada com tecnologia de ponta, ideal para apresentações e reuniões executivas. Ambiente climatizado e confortável."}
          </p>
        </section>

        <section>
          <h2 className="text-base font-bold text-slate-900 mb-4">
            Comodidades
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {displayAmenities.map((amId: string) => {
              const amenityDef = AMENITIES_LIST.find((a) => a.id === amId);
              if (!amenityDef) return null;
              const Icon = amenityDef.icon;
              return (
                <div
                  key={amId}
                  className="flex items-center gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-100"
                >
                  <Icon className="w-5 h-5 text-[#f05e23]" />
                  <span className="text-xs font-bold text-slate-700 leading-tight">
                    {amenityDef.label}
                  </span>
                </div>
              );
            })}
          </div>
        </section>

        <section className="pt-2 border-t border-slate-100">
          <div className="flex items-center gap-2 mb-6">
            <CalendarIcon className="w-5 h-5 text-[#f05e23]" />
            <h2 className="text-base font-bold text-slate-900">Agendamento</h2>
          </div>

          <div className="flex items-center justify-between px-2 mb-6">
            <button className="text-slate-400">
              <ArrowLeft className="w-4 h-4" />
            </button>
            <div className="flex gap-6 text-sm font-medium">
              <span className="text-[#f05e23] font-bold">
                {format(today, "MMMM", { locale: ptBR })}
              </span>
            </div>
            <button className="text-slate-400">
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="flex gap-1 overflow-x-auto scrollbar-hide pb-4 snap-x">
            {calendarDays.map((date) => {
              const isSelected = isSameDay(date, selectedDate);
              return (
                <button
                  key={date.toISOString()}
                  onClick={() => {
                    setSelectedDate(date);
                    setSelectedSlots([]);
                  }}
                  className="flex flex-col items-center justify-center min-w-[50px] snap-start"
                >
                  <span className="text-[10px] font-bold text-slate-400 uppercase mb-2">
                    {format(date, "EEE", { locale: ptBR }).substring(0, 3)}
                  </span>
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      isSelected ? "bg-[#f05e23] text-white" : "text-slate-700"
                    }`}
                  >
                    {format(date, "dd")}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="w-full h-px bg-slate-100 my-4" />

          <p className="text-sm font-medium text-slate-700 capitalize mb-4">
            {format(selectedDate, "EEEE, dd 'de' MMMM 'de' yyyy", {
              locale: ptBR,
            })}
          </p>
          <p className="text-xs text-slate-500 mb-4">
            Selecione os horários disponíveis:
          </p>

          {availableSlots.length === 0 ? (
            <div className="text-center py-6 bg-slate-50 rounded-xl">
              <p className="text-slate-500 font-medium text-sm">
                Nenhum horário disponível nesta data.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 mb-6">
              {availableSlots.map((slot: string) => {
                const isSelected = selectedSlots.includes(slot);
                return (
                  <button
                    key={slot}
                    onClick={() => toggleSlot(slot)}
                    className={`h-11 rounded-lg text-xs font-semibold transition-all border ${
                      isSelected
                        ? "border-[#f05e23] bg-orange-50 text-[#f05e23]"
                        : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                    }`}
                  >
                    {slot}
                  </button>
                );
              })}
            </div>
          )}

          {/* Botão Adicionar Novo Agendamento Oculto se não houver slots */}
          {availableSlots.length > 0 && (
            <Button className="w-full bg-[#f4a282] hover:bg-[#e08c6c] text-white font-bold h-12 rounded-lg mb-8">
              <CalendarIcon className="w-4 h-4 mr-2" /> Adicionar Novo
              Agendamento
            </Button>
          )}

          <div>
            <div className="flex items-center gap-2 mb-4">
              <Clock className="w-4 h-4 text-[#f05e23]" />
              <h3 className="text-sm font-bold text-slate-900">
                Horário de Funcionamento
              </h3>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                <span className="text-slate-500">Segunda - Sexta</span>
                <span className="text-slate-900 font-medium">
                  09:00 - 21:00
                </span>
              </div>
              <div className="flex justify-between items-center border-b border-slate-50 pb-2">
                <span className="text-slate-500">Sábado</span>
                <span className="text-slate-900 font-medium">
                  09:00 - 18:00
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-slate-500">Domingo</span>
                <span className="text-red-500 font-medium">Fechado</span>
              </div>
            </div>
          </div>
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 p-4 pb-safe flex items-center justify-between z-50 shadow-[0_-10px_40px_-15px_rgba(0,0,0,0.05)]">
        <div>
          <p className="text-xs font-medium text-slate-500">
            {selectedSlots.length > 0
              ? `Total (${selectedSlots.length} horas)`
              : "Valor por hora"}
          </p>
          <div className="flex items-baseline gap-1">
            <span className="text-xl font-bold text-[#f05e23]">
              R$ {selectedSlots.length > 0 ? totalCost : hourlyRate}
            </span>
            <span className="text-xs font-medium text-slate-500">
              {selectedSlots.length > 0 ? "" : "/hora"}
            </span>
          </div>
        </div>
        <Button
          onClick={handleBooking}
          disabled={bookingLoading || selectedSlots.length === 0}
          className={`h-11 px-8 rounded-lg font-bold transition-all w-[55%] ${
            selectedSlots.length > 0
              ? "bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-md shadow-orange-500/20"
              : "bg-slate-200 text-slate-400"
          }`}
        >
          {bookingLoading ? "Processando..." : "Reservar Agora"}
        </Button>
      </div>
    </div>
  );
}
