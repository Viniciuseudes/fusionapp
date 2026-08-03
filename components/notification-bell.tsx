"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Bell,
  MessageSquare,
  Calendar,
  Wallet,
  Sparkles,
  CheckCircle2,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { ptBR } from "date-fns/locale";

// AS IMPORTAÇÕES QUE FALTAVAM
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Notification {
  id: string;
  type: "message" | "booking" | "wallet" | "system" | "room";
  title: string;
  content: string;
  link?: string;
  is_read: boolean;
  created_at: string;
}

export function NotificationBell() {
  const supabase = createClient();
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [myId, setMyId] = useState("");
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    async function loadNotifications() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);

      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (!error && data) {
        setNotifications(data as Notification[]);
      }
    }
    loadNotifications();
  }, [supabase]);

  // Motor Real-time
  useEffect(() => {
    if (!myId) return;

    const channel = supabase
      .channel("my_notifications")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${myId}`,
        },
        (payload) => {
          setNotifications((prev) => [payload.new as Notification, ...prev]);
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${myId}`,
        },
        (payload) => {
          setNotifications((prev) =>
            prev.map((n) =>
              n.id === payload.new.id ? (payload.new as Notification) : n,
            ),
          );
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [myId, supabase]);

  // Fecha o menu ao clicar fora
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

  const markAsRead = async (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  };

  const markAllAsRead = async () => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;

    setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase
      .from("notifications")
      .update({ is_read: true })
      .in("id", unreadIds);
  };

  const getIcon = (type: string) => {
    switch (type) {
      case "message":
        return <MessageSquare className="w-5 h-5 text-blue-500" />;
      case "booking":
        return <Calendar className="w-5 h-5 text-emerald-500" />;
      case "wallet":
        return <Wallet className="w-5 h-5 text-amber-500" />;
      default:
        return <Sparkles className="w-5 h-5 text-[#f05e23]" />;
    }
  };

  return (
    <div className="relative" ref={dropdownRef}>
      {/* Botão do Sino */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`relative w-12 h-12 rounded-full flex items-center justify-center transition-all ${isOpen ? "bg-orange-50 text-[#f05e23]" : "bg-white text-slate-500 hover:bg-slate-50"} shadow-sm border border-slate-200`}
      >
        <Bell
          className={`w-5 h-5 ${unreadCount > 0 ? "fill-current animate-wiggle" : ""}`}
        />
        {unreadCount > 0 && (
          <span className="absolute top-0 right-0 w-5 h-5 bg-red-500 text-white text-[10px] font-black rounded-full flex items-center justify-center border-2 border-white shadow-sm">
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown de Notificações */}
      {isOpen && (
        <div className="absolute right-0 mt-3 w-[340px] sm:w-[400px] bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden z-50 animate-in fade-in slide-in-from-top-4 duration-200">
          <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="font-black text-slate-900 flex items-center gap-2">
              Notificações{" "}
              {unreadCount > 0 && (
                <Badge className="bg-[#f05e23] text-white hover:bg-[#f05e23] border-0">
                  {unreadCount} novas
                </Badge>
              )}
            </h3>
            {unreadCount > 0 && (
              <button
                onClick={markAllAsRead}
                className="text-xs font-bold text-[#f05e23] hover:underline"
              >
                Marcar todas lidas
              </button>
            )}
          </div>

          <div className="max-h-[400px] overflow-y-auto">
            {notifications.length === 0 ? (
              <div className="p-8 text-center flex flex-col items-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-3">
                  <CheckCircle2 className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-bold text-slate-900">Tudo limpo por aqui!</p>
                <p className="text-xs font-medium text-slate-500">
                  Você não tem novas notificações no momento.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {notifications.map((notification) => (
                  <div
                    key={notification.id}
                    onClick={() =>
                      !notification.is_read && markAsRead(notification.id)
                    }
                    className={`p-4 flex gap-4 transition-colors cursor-pointer hover:bg-slate-50 ${!notification.is_read ? "bg-orange-50/30" : ""}`}
                  >
                    <div className="w-10 h-10 rounded-full bg-white border border-slate-100 flex items-center justify-center shrink-0 shadow-sm">
                      {getIcon(notification.type)}
                    </div>
                    <div className="flex-1">
                      <div className="flex justify-between items-start mb-0.5">
                        <p
                          className={`text-sm ${!notification.is_read ? "font-black text-slate-900" : "font-bold text-slate-700"}`}
                        >
                          {notification.title}
                        </p>
                        {!notification.is_read && (
                          <span className="w-2 h-2 bg-[#f05e23] rounded-full shrink-0 mt-1.5" />
                        )}
                      </div>
                      <p
                        className={`text-xs ${!notification.is_read ? "font-semibold text-slate-600" : "font-medium text-slate-500"} line-clamp-2 leading-relaxed`}
                      >
                        {notification.content}
                      </p>
                      <p className="text-[10px] font-bold text-slate-400 mt-2">
                        {formatDistanceToNow(
                          new Date(notification.created_at),
                          { addSuffix: true, locale: ptBR },
                        )}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="p-2 border-t border-slate-100 bg-slate-50">
            <Button
              variant="ghost"
              className="w-full text-xs font-bold text-slate-500 hover:text-slate-900"
              onClick={() => setIsOpen(false)}
            >
              Fechar Alertas
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
