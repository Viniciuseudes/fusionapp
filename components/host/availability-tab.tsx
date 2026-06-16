"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { Clock, MapPin, Calendar, ChevronRight, Loader2 } from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AvailabilityTabProps {
  onSelectSpace: (spaceId: string) => void;
}

export function AvailabilityTab({ onSelectSpace }: AvailabilityTabProps) {
  const supabase = createClient();
  const [rooms, setRooms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchHostRooms() {
      try {
        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser();
        if (userError || !user) throw new Error("Usuário não autenticado");

        // Busca as salas do host conectado
        const { data, error } = await supabase
          .from("rooms")
          .select("id, name, image_url, address_details")
          .eq("host_id", user.id)
          .order("created_at", { ascending: false });

        if (error) throw error;
        setRooms(data || []);
      } catch (err) {
        console.error("Erro ao buscar salas para disponibilidade:", err);
      } finally {
        setLoading(false);
      }
    }

    fetchHostRooms();
  }, [supabase]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 min-h-[40vh]">
        <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
        <p className="mt-4 text-slate-500 font-medium">
          Carregando seus espaços...
        </p>
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-4xl mx-auto w-full pb-32">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 mb-2">
          Gerenciador de Horários
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Selecione um espaço para configure os horários de funcionamento,
          turnos e bloqueios de calendário.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-slate-900">
            Seus Espaços Ativos
          </h2>
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-bold border-none">
            {rooms.length} {rooms.length === 1 ? "espaço" : "espaços"}
          </Badge>
        </div>

        {rooms.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-200">
            <p className="text-slate-500 font-medium">
              Você ainda não possui nenhuma sala cadastrada para configurar
              horários.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {rooms.map((space) => {
              const address = space.address_details || {};
              const fullAddress = address.street
                ? `${address.street}, Sala ${address.number || ""}`
                : "Localização sob consulta";

              return (
                <div
                  key={space.id}
                  className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:border-[#f05e23] transition-all group"
                >
                  <div className="flex flex-col sm:flex-row gap-4 p-4">
                    <div className="relative w-full sm:w-28 h-32 sm:h-28 rounded-xl overflow-hidden shrink-0 bg-slate-100">
                      <Image
                        src={space.image_url || "/placeholder.jpg"}
                        alt={space.name}
                        fill
                        className="object-cover group-hover:scale-110 transition-transform duration-500"
                      />
                      <div className="absolute top-2 right-2 w-4 h-4 bg-emerald-500 rounded-full border-2 border-white shadow-sm" />
                    </div>

                    <div className="flex-1 flex flex-col justify-between">
                      <div>
                        <h3 className="text-slate-900 font-bold mb-1 line-clamp-1">
                          {space.name}
                        </h3>
                        <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium mb-4">
                          <MapPin className="w-3.5 h-3.5 shrink-0 text-[#f05e23]" />
                          <span className="line-clamp-1">{fullAddress}</span>
                        </div>
                      </div>

                      <Button
                        onClick={() => onSelectSpace(space.id)}
                        className="w-full bg-[#f05e23] hover:bg-[#d6521e] text-white font-bold h-10 shadow-sm transition-colors border-none"
                      >
                        <Clock className="w-4 h-4 mr-2" />
                        Ajustar Disponibilidade
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
