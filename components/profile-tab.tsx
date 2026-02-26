"use client"

import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Separator } from "@/components/ui/separator"
import {
  User,
  Settings,
  HelpCircle,
  LogOut,
  ChevronRight,
  Shield,
  FileText,
  Star,
  Bell,
  CreditCard,
} from "lucide-react"
import { userProfile } from "@/lib/mock-data"

const menuItems = [
  { icon: User, label: "Dados Pessoais", description: "Edite suas informações" },
  { icon: CreditCard, label: "Pagamentos", description: "Cartões e métodos" },
  { icon: Shield, label: "Segurança", description: "Senha e autenticação" },
  { icon: FileText, label: "Documentos", description: "Seus documentos" },
  { icon: Star, label: "Avaliações", description: "Suas avaliações" },
  { icon: Bell, label: "Notificações", description: "Preferências de alertas" },
  { icon: Settings, label: "Configurações", description: "Geral e idioma" },
  { icon: HelpCircle, label: "Ajuda e Suporte", description: "Central de ajuda" },
]

export function ProfileTab() {
  return (
    <div className="flex flex-col pb-20 lg:pb-6">
      {/* Header */}
      <div className="px-4 pt-6 pb-4 lg:px-8">
        <div className="mx-auto max-w-3xl flex flex-col items-center gap-3">
          <Avatar className="h-20 w-20 border-4 border-primary/20">
            <AvatarFallback className="bg-primary/10 text-primary text-xl font-bold">
              {userProfile.name.charAt(0)}
            </AvatarFallback>
          </Avatar>
          <div className="text-center">
            <h1 className="text-xl font-bold text-foreground">{userProfile.name}</h1>
            <p className="text-sm text-muted-foreground">{userProfile.location}</p>
          </div>
        </div>
      </div>

      {/* Menu Items */}
      <div className="px-4 lg:px-8">
        <div className="mx-auto max-w-3xl overflow-hidden rounded-2xl border border-border bg-card">
          {menuItems.map((item, index) => (
            <div key={item.label}>
              <button className="flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-secondary">
                <div className="flex h-9 w-9 items-center justify-center rounded-full bg-secondary">
                  <item.icon className="h-4 w-4 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-foreground">{item.label}</p>
                  <p className="text-xs text-muted-foreground">{item.description}</p>
                </div>
                <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {index < menuItems.length - 1 && <Separator />}
            </div>
          ))}
        </div>
      </div>

      {/* Logout */}
      <div className="px-4 pt-4 lg:px-8">
        <div className="mx-auto max-w-3xl">
          <Button
            variant="outline"
            className="w-full text-destructive hover:text-destructive hover:bg-destructive/5"
          >
            <LogOut className="mr-2 h-4 w-4" />
            Sair da Conta
          </Button>
        </div>
      </div>
    </div>
  )
}
