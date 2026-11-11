// components/admin/admin-notifications-bell.tsx
"use client";

import { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import {
  Bell,
  CalendarCheck,
  CalendarX,
  UserPlus,
  Building2,
  DoorOpen,
  CheckCheck,
  Trash2,
  Volume2,
  VolumeX,
  Sparkles,
  QrCode,
  CheckCircle2,
  Loader2,
  ChevronRight,
} from "lucide-react";
import { formatDistanceToNow, parseISO, format } from "date-fns";
import { ptBR } from "date-fns/locale";

export type AdminNotificationEventType =
  | "booking_created"
  | "booking_cancelled"
  | "specialist_registered"
  | "host_registered"
  | "room_created"
  | "booking_checkin"
  | "booking_checkout";

export interface AdminNotificationItem {
  id: string;
  event_type: AdminNotificationEventType | string;
  title: string;
  message: string;
  metadata: {
    booking_id?: string;
    user_id?: string;
    room_id?: string;
    user_name?: string;
    room_name?: string;
    host_name?: string;
    date?: string;
    first_hour?: string;
    slots_count?: number;
    target_tab?: string;
    [key: string]: any;
  };
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

type FilterCategory =
  "all" | "unread" | "bookings" | "cancellations" | "users" | "rooms";

interface AdminNotificationsBellProps {
  /**
   * Callback opcional para navegar automaticamente para a aba do painel admin
   * quando o administrador clicar em uma notificação.
   * Ex: (tab, metadata) => setActiveTab(tab)
   */
  onNavigateTab?: (tabName: string, metadata?: Record<string, any>) => void;
}

export function AdminNotificationsBell({
  onNavigateTab,
}: AdminNotificationsBellProps) {
  const [supabase] = useState(() => createClient());
  const { toast } = useToast();

  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [notifications, setNotifications] = useState<AdminNotificationItem[]>(
    [],
  );
  const [activeFilter, setActiveFilter] = useState<FilterCategory>("all");
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [hasNewPulse, setHasNewPulse] = useState(false);

  const soundEnabledRef = useRef(soundEnabled);
  useEffect(() => {
    soundEnabledRef.current = soundEnabled;
  }, [soundEnabled]);

  // Sintetizador Web Audio API (gera um alerta sonoro suave e executivo sem depender de arquivos .mp3)
  const playNotificationChime = useCallback(() => {
    if (!soundEnabledRef.current || typeof window === "undefined") return;
    try {
      const AudioCtx =
        window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;

      const ctx = new AudioCtx();
      const now = ctx.currentTime;

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();
      const gain = ctx.createGain();

      osc1.type = "sine";
      osc2.type = "triangle";

      // Acorde curto ascendente (Lá5 -> Mi6)
      osc1.frequency.setValueAtTime(880, now);
      osc1.frequency.exponentialRampToValueAtTime(1318.5, now + 0.14);

      osc2.frequency.setValueAtTime(440, now);
      osc2.frequency.exponentialRampToValueAtTime(659.25, now + 0.14);

      gain.gain.setValueAtTime(0.001, now);
      gain.gain.exponentialRampToValueAtTime(0.12, now + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.38);

      osc1.connect(gain);
      osc2.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.4);
      osc2.stop(now + 0.4);
    } catch {
      // Ignora bloqueio de autoplay do navegador caso ainda não haja interação
    }
  }, []);

  const fetchNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("admin_notifications")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(80);

      if (!error && data) {
        setNotifications(data as AdminNotificationItem[]);
      }
    } catch (err) {
      console.error("Erro ao buscar notificações do admin:", err);
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchNotifications();

    // Assinatura em Tempo Real (WebSocket Supabase Realtime)
    const channel = supabase
      .channel("admin-realtime-notifications-center")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const newNotif = payload.new as AdminNotificationItem;
          setNotifications((prev) => {
            if (prev.some((n) => n.id === newNotif.id)) return prev;
            return [newNotif, ...prev].slice(0, 100);
          });

          setHasNewPulse(true);
          setTimeout(() => setHasNewPulse(false), 4000);

          playNotificationChime();

          toast({
            title: newNotif.title,
            description: newNotif.message,
          });
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const updatedNotif = payload.new as AdminNotificationItem;
          setNotifications((prev) =>
            prev.map((item) =>
              item.id === updatedNotif.id ? updatedNotif : item,
            ),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "public",
          table: "admin_notifications",
        },
        (payload) => {
          const deletedId = (payload.old as any)?.id;
          if (deletedId) {
            setNotifications((prev) =>
              prev.filter((item) => item.id !== deletedId),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [supabase, fetchNotifications, playNotificationChime, toast]);

  const unreadCount = useMemo(
    () => notifications.filter((n) => !n.is_read).length,
    [notifications],
  );

  const countsByCategory = useMemo(() => {
    return {
      all: notifications.length,
      unread: notifications.filter((n) => !n.is_read).length,
      bookings: notifications.filter((n) =>
        ["booking_created", "booking_checkin", "booking_checkout"].includes(
          n.event_type,
        ),
      ).length,
      cancellations: notifications.filter(
        (n) => n.event_type === "booking_cancelled",
      ).length,
      users: notifications.filter((n) =>
        ["specialist_registered", "host_registered"].includes(n.event_type),
      ).length,
      rooms: notifications.filter((n) => n.event_type === "room_created")
        .length,
    };
  }, [notifications]);

  const filteredNotifications = useMemo(() => {
    return notifications.filter((n) => {
      if (activeFilter === "unread") return !n.is_read;
      if (activeFilter === "bookings")
        return [
          "booking_created",
          "booking_checkin",
          "booking_checkout",
        ].includes(n.event_type);
      if (activeFilter === "cancellations")
        return n.event_type === "booking_cancelled";
      if (activeFilter === "users")
        return ["specialist_registered", "host_registered"].includes(
          n.event_type,
        );
      if (activeFilter === "rooms") return n.event_type === "room_created";
      return true;
    });
  }, [notifications, activeFilter]);

  const handleMarkAsRead = async (id: string) => {
    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === id ? { ...n, is_read: true, read_at: nowIso } : n,
      ),
    );
    await supabase
      .from("admin_notifications")
      .update({ is_read: true, read_at: nowIso })
      .eq("id", id);
  };

  const handleMarkAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    const nowIso = new Date().toISOString();
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: nowIso })),
    );

    await supabase
      .from("admin_notifications")
      .update({ is_read: true, read_at: nowIso })
      .in("id", unreadIds);

    toast({
      title: "Tudo em dia!",
      description: "Todas as notificações foram marcadas como lidas.",
    });
  };

  const handleClearRead = async () => {
    const readIds = notifications.filter((n) => n.is_read).map((n) => n.id);
    if (readIds.length === 0) return;

    setNotifications((prev) => prev.filter((n) => !n.is_read));
    await supabase.from("admin_notifications").delete().in("id", readIds);

    toast({
      title: "Histórico limpo",
      description: "As notificações já lidas foram removidas.",
    });
  };

  const handleNotificationClick = async (item: AdminNotificationItem) => {
    if (!item.is_read) {
      await handleMarkAsRead(item.id);
    }

    const targetTab = item.metadata?.target_tab;
    if (targetTab && onNavigateTab) {
      onNavigateTab(targetTab, item.metadata);
      setIsOpen(false);
    }
  };

  const getEventVisuals = (eventType: string) => {
    switch (eventType) {
      case "booking_created":
        return {
          icon: CalendarCheck,
          bgIcon: "bg-emerald-50 text-emerald-600 border-emerald-200",
          badgeText: "Nova Reserva",
          badgeClass: "bg-emerald-50 text-emerald-700",
        };
      case "booking_cancelled":
        return {
          icon: CalendarX,
          bgIcon: "bg-red-50 text-red-600 border-red-200",
          badgeText: "Cancelamento",
          badgeClass: "bg-red-50 text-red-700",
        };
      case "specialist_registered":
        return {
          icon: UserPlus,
          bgIcon: "bg-blue-50 text-blue-600 border-blue-200",
          badgeText: "Novo Especialista",
          badgeClass: "bg-blue-50 text-blue-700",
        };
      case "host_registered":
        return {
          icon: Building2,
          bgIcon: "bg-purple-50 text-purple-600 border-purple-200",
          badgeText: "Novo Anfitrião",
          badgeClass: "bg-purple-50 text-purple-700",
        };
      case "room_created":
        return {
          icon: DoorOpen,
          bgIcon: "bg-orange-50 text-[#BF4B24] border-orange-200",
          badgeText: "Nova Sala",
          badgeClass: "bg-orange-50 text-[#BF4B24]",
        };
      case "booking_checkin":
        return {
          icon: QrCode,
          bgIcon: "bg-amber-50 text-amber-700 border-amber-200",
          badgeText: "Check-in Porta",
          badgeClass: "bg-amber-50 text-amber-800",
        };
      case "booking_checkout":
        return {
          icon: CheckCircle2,
          bgIcon: "bg-teal-50 text-teal-700 border-teal-200",
          badgeText: "Check-out",
          badgeClass: "bg-teal-50 text-teal-800",
        };
      default:
        return {
          icon: Sparkles,
          bgIcon: "bg-slate-100 text-slate-600 border-slate-200",
          badgeText: "Sistema",
          badgeClass: "bg-slate-100 text-slate-700",
        };
    }
  };

  return (
    <Sheet open={isOpen} onOpenChange={setIsOpen}>
      <SheetTrigger asChild>
        <button
          type="button"
          title="Central de Notificações em Tempo Real"
          className={`relative inline-flex items-center justify-center w-10 h-10 rounded-xl border transition-all cursor-pointer ${
            unreadCount > 0
              ? "bg-orange-50/80 border-orange-200 text-[#BF4B24] hover:bg-orange-100/70"
              : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50 hover:text-slate-900"
          } ${hasNewPulse ? "ring-4 ring-[#BF4B24]/25 scale-105" : ""}`}
        >
          <Bell
            className={`w-5 h-5 transition-transform ${
              hasNewPulse ? "animate-bounce" : ""
            }`}
          />

          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-[#BF4B24] text-white text-[10px] font-black shadow-sm tabular-nums">
              <span className="absolute inline-flex h-full w-full rounded-full bg-[#BF4B24] opacity-60 animate-ping" />
              <span className="relative">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            </span>
          )}
        </button>
      </SheetTrigger>

      <SheetContent className="w-full sm:max-w-md md:max-w-lg p-0 flex flex-col bg-[#FAF7F4] border-l border-slate-200">
        {/* CABEÇALHO DA CENTRAL DE NOTIFICAÇÕES */}
        <div className="bg-white px-6 pt-6 pb-4 border-b border-slate-200/90">
          <SheetHeader className="space-y-1 text-left">
            <div className="flex items-center justify-between gap-2 pr-6">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-[#BF4B24]/10 text-[#BF4B24] flex items-center justify-center">
                  <Bell className="w-4 h-4" />
                </div>
                <div>
                  <SheetTitle className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
                    Radar da Plataforma
                    <span className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                      Ao Vivo
                    </span>
                  </SheetTitle>
                  <SheetDescription className="text-xs text-slate-500">
                    Reservas, cancelamentos, cadastros e salas em tempo real.
                  </SheetDescription>
                </div>
              </div>
            </div>
          </SheetHeader>

          {/* BARRA DE AÇÕES RÁPIDAS */}
          <div className="flex items-center justify-between gap-2 mt-4 pt-3 border-t border-slate-100">
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleMarkAllAsRead}
                disabled={unreadCount === 0}
                className="h-8 text-[11px] font-bold border-slate-200 text-slate-700 rounded-lg"
              >
                <CheckCheck className="w-3.5 h-3.5 mr-1.5 text-emerald-600" />
                Ler todas ({unreadCount})
              </Button>

              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={handleClearRead}
                disabled={notifications.length - unreadCount === 0}
                className="h-8 text-[11px] font-semibold text-slate-500 hover:text-red-600 rounded-lg"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1" />
                Limpar lidas
              </Button>
            </div>

            <button
              type="button"
              onClick={() => setSoundEnabled((prev) => !prev)}
              title={
                soundEnabled
                  ? "Som de alerta ativado (clique para silenciar)"
                  : "Som silenciado (clique para ativar)"
              }
              className={`h-8 px-2.5 rounded-lg border text-[11px] font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer ${
                soundEnabled
                  ? "bg-slate-900 text-white border-slate-900"
                  : "bg-slate-100 text-slate-500 border-slate-200"
              }`}
            >
              {soundEnabled ? (
                <>
                  <Volume2 className="w-3.5 h-3.5 text-amber-400" />
                  Som On
                </>
              ) : (
                <>
                  <VolumeX className="w-3.5 h-3.5" />
                  Mudo
                </>
              )}
            </button>
          </div>

          {/* ABAS DE FILTRO POR EVENTO */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar mt-3 pt-1">
            {[
              { id: "all", label: `Todas (${countsByCategory.all})` },
              {
                id: "unread",
                label: `Não lidas (${countsByCategory.unread})`,
              },
              {
                id: "bookings",
                label: `Reservas (${countsByCategory.bookings})`,
              },
              {
                id: "cancellations",
                label: `Cancelamentos (${countsByCategory.cancellations})`,
              },
              {
                id: "users",
                label: `Cadastros (${countsByCategory.users})`,
              },
              {
                id: "rooms",
                label: `Salas (${countsByCategory.rooms})`,
              },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveFilter(tab.id as FilterCategory)}
                className={`px-2.5 py-1.5 rounded-lg text-[11px] font-bold whitespace-nowrap transition-all cursor-pointer ${
                  activeFilter === tab.id
                    ? "bg-[#BF4B24] text-white shadow-2xs"
                    : "bg-slate-100 text-slate-600 hover:bg-slate-200/70"
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* LISTA DE NOTIFICAÇÕES */}
        <div className="flex-1 overflow-y-auto p-4 space-y-2.5">
          {loading ? (
            <div className="flex flex-col items-center justify-center h-64 text-slate-400 gap-2">
              <Loader2 className="w-7 h-7 animate-spin text-[#BF4B24]" />
              <p className="text-xs font-medium">
                Carregando histórico de eventos...
              </p>
            </div>
          ) : filteredNotifications.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center px-6">
              <div className="w-12 h-12 rounded-2xl bg-slate-200/70 text-slate-400 flex items-center justify-center mb-3">
                <Bell className="w-6 h-6" />
              </div>
              <p className="text-sm font-bold text-slate-700">
                Nenhuma notificação neste filtro
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Assim que um profissional agendar, cancelar ou se cadastrar, ou
                um anfitrião publicar uma sala, você verá aqui em tempo real.
              </p>
            </div>
          ) : (
            filteredNotifications.map((item) => {
              const visual = getEventVisuals(item.event_type);
              const IconComponent = visual.icon;

              let relativeTime = "";
              let exactTime = "";
              try {
                const parsed = parseISO(item.created_at);
                relativeTime = formatDistanceToNow(parsed, {
                  addSuffix: true,
                  locale: ptBR,
                });
                exactTime = format(parsed, "dd/MM/yyyy 'às' HH:mm", {
                  locale: ptBR,
                });
              } catch {
                relativeTime = "recentemente";
              }

              return (
                <div
                  key={item.id}
                  onClick={() => handleNotificationClick(item)}
                  className={`group relative rounded-2xl border p-4 transition-all cursor-pointer ${
                    !item.is_read
                      ? "bg-white border-orange-200/90 shadow-xs hover:border-[#BF4B24]"
                      : "bg-white/70 border-slate-200/70 opacity-80 hover:opacity-100 hover:bg-white"
                  }`}
                >
                  {/* Indicador de Não Lida */}
                  {!item.is_read && (
                    <span
                      title="Não lida"
                      className="absolute top-4 right-4 w-2.5 h-2.5 rounded-full bg-[#BF4B24] ring-4 ring-orange-100"
                    />
                  )}

                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 mt-0.5 ${visual.bgIcon}`}
                    >
                      <IconComponent className="w-5 h-5" />
                    </div>

                    <div className="flex-1 min-w-0 pr-4">
                      <div className="flex items-center gap-2 mb-1">
                        <Badge
                          className={`${visual.badgeClass} border-0 text-[10px] font-bold px-2 py-0`}
                        >
                          {visual.badgeText}
                        </Badge>
                        <span
                          title={exactTime}
                          className="text-[11px] font-medium text-slate-400"
                        >
                          {relativeTime}
                        </span>
                      </div>

                      <h4 className="text-xs font-extrabold text-slate-900 leading-snug">
                        {item.title}
                      </h4>

                      <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                        {item.message}
                      </p>

                      <div className="mt-2.5 flex items-center justify-between text-[11px] text-slate-400">
                        <span>{exactTime}</span>
                        {onNavigateTab && item.metadata?.target_tab && (
                          <span className="inline-flex items-center gap-0.5 font-bold text-[#BF4B24] group-hover:translate-x-0.5 transition-transform">
                            Abrir aba <ChevronRight className="w-3 h-3" />
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
