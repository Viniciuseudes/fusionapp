"use client"

import Image from "next/image"
import {
  ArrowLeft,
  Heart,
  Star,
  MapPin,
  Users,
  Wifi,
  Coffee,
  Monitor,
  Wind,
  Printer,
  Lock,
  Shield,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import type { Room } from "@/lib/mock-data"
import { useState } from "react"

const amenityIcons: Record<string, React.ElementType> = {
  wifi: Wifi,
  coffee: Coffee,
  monitor: Monitor,
  wind: Wind,
  printer: Printer,
  lock: Lock,
  shield: Shield,
}

interface RoomDetailProps {
  room: Room
  onBack: () => void
}

export function RoomDetail({ room, onBack }: RoomDetailProps) {
  const [isFavorited, setIsFavorited] = useState(room.favorited)

  return (
    <div className="flex min-h-svh flex-col bg-background pb-24 lg:pb-6">
      {/* Hero Image */}
      <div className="relative h-64 w-full lg:h-80">
        <Image
          src={room.image}
          alt={room.name}
          fill
          className="object-cover"
          sizes="100vw"
          priority
        />
        {/* Overlay Buttons */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-4">
          <button
            onClick={onBack}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card/90 shadow-md backdrop-blur-sm"
            aria-label="Voltar"
          >
            <ArrowLeft className="h-5 w-5 text-foreground" />
          </button>
          <button
            onClick={() => setIsFavorited(!isFavorited)}
            className="flex h-10 w-10 items-center justify-center rounded-full bg-card/90 shadow-md backdrop-blur-sm"
            aria-label={isFavorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
          >
            <Heart
              className={`h-5 w-5 ${
                isFavorited ? "fill-primary text-primary" : "text-foreground"
              }`}
            />
          </button>
        </div>
      </div>

      {/* Content */}
      <div className="mx-auto w-full max-w-3xl flex flex-col gap-5 px-5 pt-5">
        {/* Title + Rating */}
        <div className="flex items-start justify-between gap-3">
          <h1 className="text-2xl font-bold text-foreground text-balance">{room.name}</h1>
          <div className="flex shrink-0 items-center gap-1.5 rounded-full bg-secondary px-3 py-1.5">
            <Star className="h-4 w-4 fill-primary text-primary" />
            <span className="text-sm font-bold text-foreground">{room.rating}</span>
            <span className="text-xs text-muted-foreground">{"(" + room.reviews + ")"}</span>
          </div>
        </div>

        {/* Distance + Capacity */}
        <div className="flex items-center gap-4 text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <MapPin className="h-4 w-4" />
            {room.distance}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4" />
            {"Até " + room.capacity + " pessoas"}
          </span>
        </div>

        {/* Address Card */}
        <div className="rounded-xl bg-secondary p-4">
          <p className="text-xs font-medium text-muted-foreground mb-1">Endereço</p>
          <p className="text-sm font-medium text-foreground">{room.address}</p>
        </div>

        {/* Description */}
        <div>
          <h2 className="text-base font-bold text-foreground mb-2">Sobre o espaço</h2>
          <p className="text-sm leading-relaxed text-muted-foreground">{room.description}</p>
        </div>

        {/* Amenities */}
        <div>
          <h2 className="text-base font-bold text-foreground mb-3">Comodidades</h2>
          <div className="grid grid-cols-2 gap-2">
            {room.amenities.map((amenity) => {
              const IconComp = amenityIcons[amenity.icon] || Wifi
              return (
                <div
                  key={amenity.label}
                  className="flex items-center gap-3 rounded-xl bg-secondary p-3"
                >
                  <IconComp className="h-5 w-5 text-primary shrink-0" />
                  <span className="text-sm text-foreground">{amenity.label}</span>
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Fixed Bottom Bar */}
      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card px-5 py-3 lg:ml-64">
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Valor por hora</p>
            <p className="text-xl font-bold">
              <span className="text-primary">{"R$ " + room.pricePerHour}</span>
              <span className="text-sm font-normal text-muted-foreground">/hora</span>
            </p>
          </div>
          <Button className="h-12 rounded-xl px-8 text-base font-bold shadow-md">
            Reservar Agora
          </Button>
        </div>
      </div>
    </div>
  )
}
