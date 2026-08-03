"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import {
  Send,
  Loader2,
  MessageSquare,
  ShieldAlert,
  Calendar,
  Clock,
  Lock,
  Check,
  CheckCheck,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { applyDLP, maskIdentity } from "@/lib/chat-utils";
import { format, parseISO, isPast } from "date-fns";
import { ptBR } from "date-fns/locale";

interface BookingInfo {
  start_time: string;
  end_time: string;
  status: string;
}

interface Chat {
  id: string;
  type: "booking" | "negotiation";
  status: string;
  room_name: string;
  guest_name: string;
  guest_id: string;
  booking?: BookingInfo | null;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at?: string | null;
}

export function HostChatTab() {
  const supabase = createClient();
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeChat, setActiveChat] = useState<Chat | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [myId, setMyId] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Busca inicial dos Chats (Foco no Anfitrião)
  useEffect(() => {
    async function loadChats() {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return;
      setMyId(user.id);

      const { data: chatData, error } = await supabase
        .from("chats")
        .select(
          `
          id, type, status, guest_id,
          rooms (name),
          profiles!chats_guest_id_fkey (full_name),
          bookings (start_time, end_time, status)
        `,
        )
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });

      if (!error && chatData) {
        const formatted = chatData.map((c: any) => ({
          id: c.id,
          type: c.type,
          status: c.status,
          guest_id: c.guest_id,
          room_name: c.rooms?.name || "Sala",
          guest_name: c.profiles?.full_name || "Profissional",
          booking: c.bookings ? c.bookings : null,
        }));
        setChats(formatted);
      }
      setLoading(false);
    }
    loadChats();
  }, [supabase]);

  // Carrega mensagens e inscreve no WebSocket (Realtime para INSERT e UPDATE)
  useEffect(() => {
    if (!activeChat) return;

    const fetchMessages = async () => {
      const { data } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", activeChat.id)
        .order("created_at", { ascending: true });

      if (data) setMessages(data);
      setTimeout(
        () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
        100,
      );
    };

    fetchMessages();

    // Inscrição Real-time do Supabase: Agora escuta TUDO (event: "*")
    const channel = supabase
      .channel(`chat_host_${activeChat.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${activeChat.id}`,
        },
        (payload) => {
          if (payload.eventType === "INSERT") {
            setMessages((prev) => {
              if (prev.some((m) => m.id === payload.new.id)) return prev;
              return [...prev, payload.new as Message];
            });
            setTimeout(
              () =>
                messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
              100,
            );
          } else if (payload.eventType === "UPDATE") {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === payload.new.id ? (payload.new as Message) : m,
              ),
            );
          }
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [activeChat, supabase]);

  // ==========================================
  // MARCADOR AUTOMÁTICO DE LEITURA
  // ==========================================
  useEffect(() => {
    if (!activeChat || messages.length === 0) return;

    // Acha mensagens enviadas pelo MÉDICO (ou admin) que O ANFITRIÃO ainda não leu
    const unreadMessages = messages.filter(
      (m) => m.sender_id !== myId && !m.read_at,
    );

    if (unreadMessages.length > 0) {
      const unreadIds = unreadMessages.map((m) => m.id);
      const now = new Date().toISOString();

      setMessages((prev) =>
        prev.map((m) =>
          unreadIds.includes(m.id) ? { ...m, read_at: now } : m,
        ),
      );

      supabase
        .from("messages")
        .update({ read_at: now })
        .in("id", unreadIds)
        .then();
    }
  }, [messages, activeChat, myId, supabase]);

  // Inserção Otimista (Mensagem instantânea)
  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !activeChat) return;

    const safeContent = applyDLP(newMessage);
    setNewMessage("");

    const tempId = `temp-${Date.now()}`;
    const optimisticMsg: Message = {
      id: tempId,
      sender_id: myId,
      content: safeContent,
      created_at: new Date().toISOString(),
      read_at: null, // Nasce não lida
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    setTimeout(
      () => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }),
      50,
    );

    const { data, error } = await supabase
      .from("messages")
      .insert({
        chat_id: activeChat.id,
        sender_id: myId,
        content: safeContent,
      })
      .select()
      .single();

    if (data && !error) {
      setMessages((prev) => prev.map((m) => (m.id === tempId ? data : m)));
    }
  };

  const getDisplayName = (chat: Chat) => {
    if (chat.type === "negotiation")
      return maskIdentity("host", chat.guest_name, chat.guest_id);
    return chat.guest_name;
  };

  const isChatLocked = () => {
    if (!activeChat) return false;
    if (activeChat.status === "closed") return true;
    if (activeChat.type === "booking" && activeChat.booking) {
      return isPast(parseISO(activeChat.booking.end_time));
    }
    return false;
  };

  if (loading)
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-[#f05e23]" />
      </div>
    );

  return (
    <div className="flex h-[calc(100vh-80px)] md:h-[calc(100vh-100px)] bg-slate-50 overflow-hidden rounded-2xl border border-slate-200">
      {/* Sidebar de Chats */}
      <div
        className={`w-full md:w-80 bg-white border-r border-slate-200 flex flex-col ${activeChat ? "hidden md:flex" : "flex"}`}
      >
        <div className="p-6 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-black text-slate-900">
            Caixa de Entrada
          </h2>
        </div>
        <div className="flex-1 overflow-y-auto">
          {chats.length === 0 ? (
            <div className="p-8 text-center text-slate-400 font-medium">
              Nenhuma conversa encontrada.
            </div>
          ) : (
            chats.map((chat) => {
              const isLocked =
                chat.type === "booking" &&
                chat.booking &&
                isPast(parseISO(chat.booking.end_time));
              return (
                <div
                  key={chat.id}
                  onClick={() => setActiveChat(chat)}
                  className={`p-4 border-b border-slate-50 cursor-pointer transition-colors ${activeChat?.id === chat.id ? "bg-orange-50 border-l-4 border-l-[#f05e23]" : "hover:bg-slate-50 border-l-4 border-l-transparent"} ${isLocked ? "opacity-60 grayscale" : ""}`}
                >
                  <div className="flex justify-between items-start mb-1">
                    <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1">
                      {isLocked && <Lock className="w-3 h-3 text-slate-400" />}
                      {getDisplayName(chat)}
                    </h4>
                  </div>
                  <p className="text-xs font-semibold text-[#f05e23] truncate">
                    {chat.room_name}
                  </p>

                  {chat.type === "booking" && chat.booking && (
                    <p className="text-[10px] font-medium text-slate-500 mt-1">
                      {format(parseISO(chat.booking.start_time), "dd MMM")} •{" "}
                      {format(parseISO(chat.booking.start_time), "HH:mm")}
                    </p>
                  )}
                  {chat.type === "negotiation" && (
                    <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-2 py-0.5 rounded mt-2 inline-block uppercase">
                      Negociação
                    </span>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Área do Chat */}
      {activeChat ? (
        <div className="flex-1 flex flex-col bg-slate-50/50 relative">
          {/* Header do Chat */}
          <div className="bg-white px-6 py-4 border-b border-slate-200 flex items-center justify-between shadow-sm z-10 shrink-0">
            <div className="flex items-center gap-4">
              <button
                className="md:hidden p-2 -ml-2 text-slate-400"
                onClick={() => setActiveChat(null)}
              >
                Voltar
              </button>
              <div>
                <h3 className="font-black text-slate-900">
                  {getDisplayName(activeChat)}
                </h3>
                <p className="text-xs font-bold text-slate-500">
                  {activeChat.room_name}
                </p>
              </div>
            </div>
            {isChatLocked() && (
              <Badge
                variant="outline"
                className="bg-slate-100 text-slate-500 border-slate-200 flex items-center gap-1"
              >
                <Lock className="w-3 h-3" /> Encerrado
              </Badge>
            )}
          </div>

          <div className="flex-1 overflow-y-auto flex flex-col relative">
            {/* CONTEXTO DA RESERVA */}
            {activeChat.type === "booking" && activeChat.booking && (
              <div className="m-4 p-4 bg-white border border-slate-200 rounded-2xl shadow-sm flex flex-col sm:flex-row justify-between sm:items-center gap-4 shrink-0">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-full bg-orange-50 flex items-center justify-center shrink-0">
                    <Calendar className="w-5 h-5 text-[#f05e23]" />
                  </div>
                  <div>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-0.5">
                      Detalhes do Agendamento
                    </p>
                    <p className="text-sm font-black text-slate-900">
                      {format(
                        parseISO(activeChat.booking.start_time),
                        "EEEE, dd 'de' MMMM",
                        { locale: ptBR },
                      )}
                    </p>
                    <div className="flex items-center gap-1.5 text-xs font-bold text-slate-500 mt-1">
                      <Clock className="w-3.5 h-3.5 text-[#f05e23]" />
                      {format(
                        parseISO(activeChat.booking.start_time),
                        "HH:mm",
                      )}{" "}
                      às{" "}
                      {format(parseISO(activeChat.booking.end_time), "HH:mm")}
                    </div>
                  </div>
                </div>
                <div className="sm:text-right border-t sm:border-t-0 border-slate-100 pt-3 sm:pt-0">
                  <Badge
                    className={
                      activeChat.booking.status === "confirmed"
                        ? "bg-emerald-100 text-emerald-700"
                        : "bg-amber-100 text-amber-700"
                    }
                  >
                    {activeChat.booking.status === "confirmed"
                      ? "Confirmada"
                      : "Pendente"}
                  </Badge>
                </div>
              </div>
            )}

            {activeChat.type === "negotiation" && (
              <div className="bg-blue-50 border border-blue-200 p-4 rounded-xl flex gap-3 mx-4 my-4 shadow-sm shrink-0">
                <ShieldAlert className="w-5 h-5 text-blue-600 shrink-0" />
                <p className="text-xs font-medium text-blue-800 leading-relaxed">
                  Esta é uma negociação de contrato. Para a sua segurança, o
                  envio de telefones e e-mails é bloqueado. A equipe Fusion
                  acompanha este chat.
                </p>
              </div>
            )}

            {/* MENSAGENS COM SISTEMA DE LEITURA E MARCA DO ADMIN */}
            <div className="p-6 space-y-4 flex-1">
              {messages.map((msg) => {
                const isMe = msg.sender_id === myId;
                const isAdmin = !isMe && msg.sender_id !== activeChat.guest_id;

                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isMe ? "items-end" : isAdmin ? "items-center" : "items-start"}`}
                  >
                    {isAdmin && (
                      <span className="text-[10px] font-black text-emerald-600 uppercase mb-1">
                        Equipe Fusion Clinic
                      </span>
                    )}
                    <div
                      className={`max-w-[85%] md:max-w-[75%] px-4 py-3 rounded-2xl text-sm font-medium shadow-sm ${
                        isMe
                          ? "bg-slate-900 text-white rounded-br-none"
                          : isAdmin
                            ? "bg-emerald-100 text-emerald-900 border border-emerald-200"
                            : "bg-white border border-slate-200 text-slate-700 rounded-bl-none"
                      }`}
                    >
                      {msg.content}
                    </div>
                    <span className="text-[10px] text-slate-400 mt-1 px-1 font-bold flex items-center gap-1">
                      {format(new Date(msg.created_at), "HH:mm")}

                      {/* Ícone de Visualizado apenas para as mensagens que EU enviei */}
                      {isMe &&
                        (msg.read_at ? (
                          <CheckCheck className="w-3.5 h-3.5 text-blue-500" />
                        ) : (
                          <Check className="w-3.5 h-3.5 text-slate-400" />
                        ))}
                    </span>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </div>

          {/* ÁREA DE INPUT */}
          <div className="bg-white p-4 border-t border-slate-200 shrink-0">
            {isChatLocked() ? (
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-center">
                <p className="text-sm font-bold text-slate-500 flex items-center justify-center gap-2">
                  <Lock className="w-4 h-4" /> Este agendamento foi finalizado e
                  o chat está bloqueado.
                </p>
              </div>
            ) : (
              <form
                onSubmit={handleSendMessage}
                className="flex items-center gap-2 max-w-4xl mx-auto relative"
              >
                <Input
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  placeholder="Escreva sua resposta..."
                  className="h-12 bg-slate-50 border-slate-200 pr-14 rounded-xl focus-visible:ring-[#f05e23]"
                  autoComplete="off"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!newMessage.trim()}
                  className="absolute right-1 h-10 w-10 rounded-lg bg-slate-900 hover:bg-slate-800 text-white transition-all"
                >
                  <Send className="w-4 h-4" />
                </Button>
              </form>
            )}
          </div>
        </div>
      ) : (
        <div className="hidden md:flex flex-1 items-center justify-center flex-col text-slate-400">
          <div className="w-20 h-20 bg-slate-100 rounded-full flex items-center justify-center mb-4">
            <MessageSquare className="w-10 h-10 opacity-40" />
          </div>
          <p className="font-bold text-slate-500">
            Selecione uma conversa ao lado
          </p>
        </div>
      )}
    </div>
  );
}
