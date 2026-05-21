import Image from "next/image";
import { ArrowLeft, Star, MapPin } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Room } from "@/components/search-tab";

interface RoomDetailProps {
  room: Room;
  onBack: () => void;
}

export function RoomDetail({ room, onBack }: RoomDetailProps) {
  return (
    <div className="flex flex-col min-h-screen bg-white pb-24 relative z-50">
      {/* Header Imagem */}
      <div className="relative h-72 w-full bg-slate-100">
        <Image
          src={room.image}
          alt={room.name}
          fill
          className="object-cover"
          priority
        />
        <div className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-transparent" />
        <button
          onClick={onBack}
          className="absolute top-6 left-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/90 shadow-md backdrop-blur-sm hover:scale-105 transition-transform"
        >
          <ArrowLeft className="h-5 w-5 text-slate-900" />
        </button>
      </div>

      {/* Conteúdo */}
      <div className="px-5 pt-6 flex-1 max-w-3xl mx-auto w-full">
        <div className="flex items-start justify-between mb-3">
          <div>
            <span className="inline-block rounded-lg bg-primary/10 px-2.5 py-1.5 text-xs font-black text-primary mb-3">
              {room.category}
            </span>
            <h1 className="text-2xl font-black text-slate-900 leading-tight mb-2">
              {room.name}
            </h1>
          </div>
        </div>

        <div className="flex items-center gap-4 text-sm text-slate-500 font-medium mb-8 pb-6 border-b border-slate-100">
          <div className="flex items-center gap-1.5 bg-amber-50 px-2.5 py-1 rounded-md text-amber-700">
            <Star className="h-4 w-4 fill-amber-500 text-amber-500" />
            <span className="font-bold">{room.rating}</span>
          </div>
          <div className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            <span>{room.distance}</span>
          </div>
        </div>

        <div className="space-y-4 mb-8">
          <h3 className="text-lg font-black text-slate-900">Sobre o espaço</h3>
          <p className="text-slate-500 leading-relaxed text-sm font-medium">
            Este é um espaço premium gerido pela Fusion Clinic. A sua
            infraestrutura de alto padrão é ideal para profissionais que buscam
            conforto e sofisticação para os seus pacientes.
          </p>
        </div>
      </div>

      {/* Bottom Bar para Agendar */}
      <div className="fixed bottom-0 left-0 right-0 lg:left-64 bg-white border-t border-slate-200 p-4 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] flex items-center justify-between z-50">
        <div>
          <p className="text-xs text-slate-500 font-bold mb-0.5 uppercase tracking-wider">
            Preço por hora
          </p>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-black text-primary">
              R$ {room.pricePerHour}
            </p>
          </div>
        </div>
        <Button className="bg-primary hover:bg-primary/90 text-primary-foreground font-black px-8 h-12 rounded-xl shadow-lg transition-transform active:scale-95">
          Agendar Sala
        </Button>
      </div>
    </div>
  );
}
