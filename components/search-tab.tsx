"use client"

import { useState } from "react"
import Image from "next/image"
import {
  Search,
  SlidersHorizontal,
  Star,
  MapPin,
  Bell,
  Heart,
} from "lucide-react"
import { Input } from "@/components/ui/input"
import { rooms, userProfile, type Room, type RentalType } from "@/lib/mock-data"

const rentalTypes: { id: RentalType; label: string }[] = [
  { id: "hora", label: "Por Hora" },
  { id: "turno", label: "Turno" },
  { id: "fixo", label: "Fixo" },
]

interface SearchTabProps {
  onOpenRoom: (room: Room) => void
}

export function SearchTab({ onOpenRoom }: SearchTabProps) {
  const [searchQuery, setSearchQuery] = useState("")
  const [rentalType, setRentalType] = useState<RentalType>("hora")
  const [favorites, setFavorites] = useState<Set<number>>(
    new Set(rooms.filter((r) => r.favorited).map((r) => r.id))
  )

  function toggleFavorite(e: React.MouseEvent, roomId: number) {
    e.stopPropagation()
    setFavorites((prev) => {
      const next = new Set(prev)
      if (next.has(roomId)) next.delete(roomId)
      else next.add(roomId)
      return next
    })
  }

  const filteredRooms = rooms.filter(
    (room) =>
      room.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      room.category.toLowerCase().includes(searchQuery.toLowerCase())
  )

  const nearbyRooms = filteredRooms.slice(0, 4)
  const newRooms = filteredRooms.slice(2)

  return (
    <div className="flex flex-col pb-20 lg:pb-6">
      {/* Orange Header */}
      <header className="bg-primary px-4 pb-5 pt-6 lg:px-8 lg:pt-8">
        {/* Top Row */}
        <div className="mx-auto flex max-w-3xl items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-primary-foreground">
              {"Olá, " + userProfile.name + "!"}
            </h1>
            <p className="text-sm text-primary-foreground/80">Encontre seu espaço ideal</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative" aria-label="Notificações">
              <Bell className="h-6 w-6 text-primary-foreground" />
              {userProfile.notifications > 0 && (
                <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-card text-[10px] font-bold text-primary">
                  {userProfile.notifications}
                </span>
              )}
            </button>
            <span className="rounded-full bg-card/20 px-3 py-1 text-sm font-semibold text-primary-foreground">
              {"R$ " + userProfile.balance.toFixed(2).replace(".", ",")}
            </span>
          </div>
        </div>

        {/* Location */}
        <div className="mx-auto mt-3 flex max-w-3xl items-center gap-1.5 text-primary-foreground/80">
          <MapPin className="h-4 w-4" />
          <span className="text-sm">{userProfile.location}</span>
        </div>

        {/* Search Bar */}
        <div className="mx-auto mt-4 max-w-3xl">
          <div className="relative flex items-center">
            <Search className="absolute left-3 h-5 w-5 text-muted-foreground" />
            <Input
              placeholder="Buscar espaços..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-12 rounded-xl border-0 bg-card pl-11 pr-12 text-foreground shadow-sm placeholder:text-muted-foreground"
            />
            <button
              className="absolute right-3 text-muted-foreground"
              aria-label="Filtros"
            >
              <SlidersHorizontal className="h-5 w-5" />
            </button>
          </div>
        </div>
      </header>

      {/* Rental Type Filter */}
      <div className="bg-card px-4 py-4 lg:px-8">
        <p className="mx-auto max-w-3xl text-xs font-medium text-muted-foreground mb-2">Tipo de Aluguel</p>
        <div className="mx-auto flex max-w-3xl gap-2">
          {rentalTypes.map((type) => {
            const isActive = rentalType === type.id
            return (
              <button
                key={type.id}
                onClick={() => setRentalType(type.id)}
                className={`flex-1 rounded-xl py-2.5 text-sm font-semibold transition-all ${
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "bg-secondary text-muted-foreground"
                }`}
              >
                {type.label}
              </button>
            )
          })}
        </div>
      </div>

      {/* Divider */}
      <div className="h-px bg-border" />

      {/* Perto de você */}
      <section className="px-4 pt-5 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Perto de você</h2>
          <button className="text-sm font-semibold text-primary">Ver todos</button>
        </div>
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
            {nearbyRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isFavorited={favorites.has(room.id)}
                onToggleFavorite={toggleFavorite}
                onOpen={onOpenRoom}
              />
            ))}
          </div>
        </div>
      </section>

      {/* Salas em Destaque */}
      <section className="px-4 pt-6 lg:px-8">
        <div className="mx-auto flex max-w-3xl items-center justify-between mb-3">
          <h2 className="text-lg font-bold text-foreground">Salas em Destaque</h2>
          <button className="text-sm font-semibold text-primary">Ver todos</button>
        </div>
        <div className="mx-auto max-w-3xl">
          <div className="flex gap-3 overflow-x-auto pb-2 -mx-4 px-4 lg:mx-0 lg:px-0 scrollbar-hide">
            {newRooms.map((room) => (
              <RoomCard
                key={room.id}
                room={room}
                isFavorited={favorites.has(room.id)}
                onToggleFavorite={toggleFavorite}
                onOpen={onOpenRoom}
              />
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

function RoomCard({
  room,
  isFavorited,
  onToggleFavorite,
  onOpen,
}: {
  room: Room
  isFavorited: boolean
  onToggleFavorite: (e: React.MouseEvent, id: number) => void
  onOpen: (room: Room) => void
}) {
  return (
    <button
      onClick={() => onOpen(room)}
      className="group flex w-[220px] shrink-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-sm transition-shadow hover:shadow-md text-left lg:w-[240px]"
    >
      {/* Image */}
      <div className="relative h-36 w-full overflow-hidden lg:h-40">
        <Image
          src={room.image}
          alt={room.name}
          fill
          className="object-cover transition-transform duration-300 group-hover:scale-105"
          sizes="240px"
        />
        {/* Favorite Button */}
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => onToggleFavorite(e, room.id)}
          onKeyDown={(e) => { if (e.key === "Enter") onToggleFavorite(e as unknown as React.MouseEvent, room.id) }}
          className="absolute top-2.5 right-2.5 flex h-8 w-8 items-center justify-center rounded-full bg-card/90 shadow-sm backdrop-blur-sm"
          aria-label={isFavorited ? "Remover dos favoritos" : "Adicionar aos favoritos"}
        >
          <Heart
            className={`h-4 w-4 ${
              isFavorited
                ? "fill-primary text-primary"
                : "text-muted-foreground"
            }`}
          />
        </span>
        {/* Category Badge */}
        <span className="absolute bottom-2.5 left-2.5 rounded-lg bg-primary px-2.5 py-1 text-xs font-semibold text-primary-foreground shadow-sm">
          {room.category}
        </span>
      </div>

      {/* Info */}
      <div className="flex flex-col gap-1 p-3">
        <div className="flex items-center justify-between gap-1">
          <h3 className="truncate text-sm font-semibold text-foreground">{room.name}</h3>
          <div className="flex shrink-0 items-center gap-0.5">
            <Star className="h-3.5 w-3.5 fill-primary text-primary" />
            <span className="text-xs font-semibold text-foreground">{room.rating}</span>
          </div>
        </div>
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <MapPin className="h-3 w-3 shrink-0" />
          <span>{room.distance}</span>
        </div>
        <p className="mt-0.5 text-sm">
          <span className="font-bold text-primary">{"R$ " + room.pricePerHour}</span>
          <span className="text-muted-foreground">/hora</span>
        </p>
      </div>
    </button>
  )
}
