"use client"

import { MessageSquare } from "lucide-react"

export function ChatTab() {
  return (
    <div className="flex flex-col pb-20 lg:pb-6">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-xl font-bold text-foreground">Chat</h1>
          <p className="text-sm text-muted-foreground mt-1">Suas conversas</p>
        </div>
      </div>

      {/* Empty State */}
      <div className="flex flex-col items-center gap-3 px-4 py-16 text-center">
        <div className="flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
          <MessageSquare className="h-8 w-8 text-muted-foreground" />
        </div>
        <p className="text-sm font-medium text-foreground">Nenhuma conversa</p>
        <p className="text-xs text-muted-foreground max-w-xs">
          Ao fazer uma reserva, você poderá conversar diretamente com o anfitrião do espaço.
        </p>
      </div>
    </div>
  )
}
