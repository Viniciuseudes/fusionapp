"use client"

import { CalendarDays, Clock } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { upcomingBookings } from "@/lib/mock-data"

export function BookingsTab() {
  return (
    <div className="flex flex-col pb-20 lg:pb-6">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-bold text-foreground">Reservas</h1>
          <p className="text-sm text-muted-foreground mt-1">Suas reservas ativas e futuras</p>
        </div>
      </div>

      {/* Bookings List */}
      <div className="px-4 lg:px-8">
        <div className="mx-auto flex max-w-3xl flex-col gap-3">
          {upcomingBookings.map((booking) => (
            <div
              key={booking.id}
              className="flex items-center gap-4 rounded-2xl border border-border bg-card p-4 shadow-sm"
            >
              <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10">
                <CalendarDays className="h-6 w-6 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold text-foreground truncate">{booking.room}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                  <span className="flex items-center gap-1">
                    <CalendarDays className="h-3 w-3" />
                    {booking.date}
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-3 w-3" />
                    {booking.time}
                  </span>
                </div>
              </div>
              <Badge
                className={
                  booking.status === "confirmada"
                    ? "bg-chart-2/10 text-chart-2 border-chart-2/20"
                    : "bg-primary/10 text-primary border-primary/20"
                }
              >
                {booking.status === "confirmada" ? "Confirmada" : "Pendente"}
              </Badge>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
