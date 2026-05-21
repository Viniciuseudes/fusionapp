"use client"

import { useState, useCallback } from "react"
import { cn } from "@/lib/utils"
import { SearchTab } from "@/components/search-tab"
import { FavoritesTab } from "@/components/favorites-tab"
import { BookingsTab } from "@/components/bookings-tab"
import { ChatTab } from "@/components/chat-tab"
import { ProfileTab } from "@/components/profile-tab"
import { RoomDetail } from "@/components/room-detail"
import type { Room } from "@/lib/mock-data"
import { Search, Heart, CalendarDays, MessageSquare, UserRound } from "lucide-react"

const navItems = [
  { id: "buscar" as const, label: "Buscar", icon: Search },
  { id: "favoritos" as const, label: "Favoritos", icon: Heart },
  { id: "reservas" as const, label: "Reservas", icon: CalendarDays },
  { id: "chat" as const, label: "Chat", icon: MessageSquare },
  { id: "perfil" as const, label: "Perfil", icon: UserRound },
]

type TabId = (typeof navItems)[number]["id"]

export default function AppPage() {
  const [activeTab, setActiveTab] = useState<TabId>("buscar")
  const [selectedRoom, setSelectedRoom] = useState<Room | null>(null)

  const handleOpenRoom = useCallback((room: Room) => {
    setSelectedRoom(room)
  }, [])

  const handleCloseRoom = useCallback(() => {
    setSelectedRoom(null)
  }, [])

  return (
    <div className="flex min-h-svh flex-col bg-background">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex fixed inset-y-0 left-0 z-40 w-64 flex-col border-r border-border bg-card">
        <div className="flex items-center gap-3 px-6 py-5 border-b border-border">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Search className="h-5 w-5 text-primary-foreground" />
          </div>
          <div>
            <h1 className="text-base font-bold text-foreground tracking-tight">Fusion Clinic</h1>
            <p className="text-xs text-muted-foreground">Encontre seu espaço</p>
          </div>
        </div>
        <nav className="flex flex-col gap-1 p-3 flex-1">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => { setActiveTab(item.id); setSelectedRoom(null) }}
                className={cn(
                  "flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition-all",
                  isActive
                    ? "bg-primary/10 text-primary"
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className="h-5 w-5" />
                {item.label}
              </button>
            )
          })}
        </nav>
      </aside>

      {/* Main Content */}
      <main className={cn("flex-1 lg:ml-64", selectedRoom ? "" : "")}>
        {selectedRoom ? (
          <RoomDetail room={selectedRoom} onBack={handleCloseRoom} />
        ) : (
          <>
            {activeTab === "buscar" && <SearchTab onOpenRoom={handleOpenRoom} />}
            {activeTab === "favoritos" && <FavoritesTab onOpenRoom={handleOpenRoom} />}
            {activeTab === "reservas" && <BookingsTab />}
            {activeTab === "chat" && <ChatTab />}
            {activeTab === "perfil" && <ProfileTab />}
          </>
        )}
      </main>

      {/* Mobile Bottom Nav */}
      {!selectedRoom && (
        <nav className="fixed inset-x-0 bottom-0 z-50 flex lg:hidden items-stretch justify-around border-t border-border bg-card pb-[env(safe-area-inset-bottom)]">
          {navItems.map((item) => {
            const isActive = activeTab === item.id
            return (
              <button
                key={item.id}
                onClick={() => setActiveTab(item.id)}
                className={cn(
                  "flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition-colors",
                  isActive ? "text-primary" : "text-muted-foreground"
                )}
              >
                <item.icon className={cn("h-5 w-5", isActive && "fill-primary/20")} />
                {item.label}
              </button>
            )
          })}
        </nav>
      )}
    </div>
  )
}
