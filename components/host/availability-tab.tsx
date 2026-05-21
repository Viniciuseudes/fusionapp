import {
  ChevronLeft,
  Clock,
  MapPin,
  Calendar,
  ChevronRight,
} from "lucide-react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface AvailabilityTabProps {
  onSelectSpace: (spaceId: string) => void;
}

export function AvailabilityTab({ onSelectSpace }: AvailabilityTabProps) {
  // Mock provisório
  const activeSpaces = [
    {
      id: "1",
      name: "Consultório Psicanálise",
      image: "/images/room-consultorio.jpg",
      address: "Centro Médico Fusion, Sala 201",
      status: "active",
    },
    {
      id: "2",
      name: "Sala de Reunião Premium",
      image: "/images/room-reuniao.jpg",
      address: "Centro Médico Fusion, Sala 205",
      status: "active",
    },
  ];

  return (
    <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-4xl mx-auto w-full pb-32">
      <div className="mb-8">
        <h1 className="text-2xl font-black text-slate-900 mb-2">
          Gerenciador de Horários
        </h1>
        <p className="text-sm text-slate-500 font-medium">
          Selecione um espaço para configurar os horários de funcionamento,
          turnos e bloqueios de calendário.
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-black text-slate-900">
            Seus Espaços Ativos
          </h2>
          <Badge className="bg-emerald-100 text-emerald-700 hover:bg-emerald-100 font-bold">
            {activeSpaces.length} espaços
          </Badge>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {activeSpaces.map((space) => (
            <div
              key={space.id}
              className="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:border-primary transition-all group"
            >
              <div className="flex flex-col sm:flex-row gap-4 p-4">
                <div className="relative w-full sm:w-28 h-32 sm:h-28 rounded-xl overflow-hidden shrink-0">
                  <Image
                    src={space.image}
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
                      <MapPin className="w-3.5 h-3.5 shrink-0" />
                      <span className="line-clamp-1">{space.address}</span>
                    </div>
                  </div>

                  <Button
                    onClick={() => onSelectSpace(space.id)}
                    className="w-full bg-primary hover:bg-primary/90 text-white font-bold h-10 shadow-sm"
                  >
                    <Clock className="w-4 h-4 mr-2" />
                    Ajustar Disponibilidade
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
