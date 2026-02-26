"use client"

import Image from "next/image"
import { Star, MapPin, Heart } from "lucide-react"
import { rooms, type Room } from "@/lib/mock-data"

interface FavoritesTabProps {
  onOpenRoom: (room: Room) => void
}

export function FavoritesTab({ onOpenRoom }: FavoritesTabProps) {
  const favoritedRooms = rooms.filter((r) => r.favorited)

  return (
    <div className="flex flex-col pb-20 lg:pb-6">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-bold text-foreground">Favoritos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {"Seus espaços favoritados (" + favoritedRooms.length + ")"}
          </p>
        </div>
      </div>

      {/* List */}
      <div className="px-4 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {favoritedRooms.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
                <Heart className="h-8 w-8 text-muted-foreground" />
              </div>
              <p className="text-muted-foreground">Nenhum favorito ainda</p>
            </div>
          ) : (
            favoritedRooms.map((room) => (
              <button
                key={room.id}
                onClick={() => onOpenRoom(room)}
                className="flex gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-sm transition-shadow hover:shadow-md"
              >
                <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl">
                  <Image
                    src={room.image}
                    alt={room.name}
                    fill
                    className="object-cover"
                    sizes="96px"
                  />
                </div>
                <div className="flex flex-1 flex-col gap-1 min-w-0">
                  <h3 className="text-sm font-semibold text-foreground truncate">{room.name}</h3>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <MapPin className="h-3 w-3 shrink-0" />
                    <span className="truncate">{room.address}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <Star className="h-3 w-3 fill-primary text-primary" />
                    <span className="text-xs font-semibold text-foreground">{room.rating}</span>
                    <span className="text-xs text-muted-foreground">{"(" + room.reviews + ")"}</span>
                  </div>
                  <p className="mt-auto text-sm">
                    <span className="font-bold text-primary">{"R$ " + room.pricePerHour}</span>
                    <span className="text-muted-foreground">/hora</span>
                  </p>
                </div>
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  )
}
