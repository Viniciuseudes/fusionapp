"use client";

import { useState, useEffect, useRef } from "react";
import { createClient } from "@/utils/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { format, parseISO, addHours, isAfter } from "date-fns";
import { ptBR } from "date-fns/locale";
import { useMobileBack } from "@/hooks/use-mobile-back";
import {
  Search,
  MessageSquare,
  Send,
  ArrowLeft,
  CheckCheck,
  Loader2,
  Building2,
  User,
  Calendar as CalendarIcon,
  Clock,
  Info,
  ShieldCheck,
  Handshake,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface ChatPreview {
  id: string;
  room_id: string;
  guest_id: string;
  host_id: string;
  status: string;
  type?: string;
  room_name: string;
  room_image: string;
  other_person_name: string;
  last_message?: string;
  last_message_date?: string;
  unread_count: number;
  booking_id?: string;
  booking_start?: string;
  booking_end?: string;
  booking_status?: string;
}

interface Message {
  id: string;
  sender_id: string;
  content: string;
  created_at: string;
  read_at: string | null;
}

export function ChatTab() {
  const supabase = createClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const [myId, setMyId] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [chats, setChats] = useState<ChatPreview[]>([]);

  const [activeFilter, setActiveFilter] = useState<"all" | "unread">("all");
  const [searchQuery, setSearchQuery] = useState("");

  const [selectedChat, setSelectedChat] = useState<ChatPreview | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sending, setSending] = useState(false);

  useMobileBack(!!selectedChat, () => setSelectedChat(null), "chat-aberto");

  useEffect(() => {
    async function fetchChats() {
      try {
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) return;
        setMyId(user.id);

        const { data: rawChats, error: chatsError } = await supabase
          .from("chats")
          .select(
            `
            id, status, type, room_id, guest_id, host_id, booking_id,
            rooms (name, image_url),
            bookings (start_time, end_time, status)
          `,
          )
          .or(`guest_id.eq.${user.id},host_id.eq.${user.id}`);

        if (chatsError) throw chatsError;
        if (!rawChats || rawChats.length === 0) {
          setChats([]);
          setLoading(false);
          return;
        }

        const otherUserIds = rawChats.map((c) =>
          c.guest_id === user.id ? c.host_id : c.guest_id,
        );
        const { data: profiles } = await supabase
          .from("profiles")
          .select("id, full_name")
          .in("id", otherUserIds);

        const chatIds = rawChats.map((c) => c.id);
        const { data: allMessages } = await supabase
          .from("messages")
          .select("*")
          .in("chat_id", chatIds)
          .order("created_at", { ascending: false });

        const now = new Date();
        const validChats: ChatPreview[] = [];

        for (const chat of rawChats) {
          const otherId =
            chat.guest_id === user.id ? chat.host_id : chat.guest_id;
          const otherProfile = profiles?.find((p) => p.id === otherId);
          const chatMessages =
            allMessages?.filter((m) => m.chat_id === chat.id) || [];

          const lastMsg = chatMessages.length > 0 ? chatMessages[0] : null;
          const unreadCount = chatMessages.filter(
            (m) => m.sender_id !== user.id && !m.read_at,
          ).length;

          const bookingData = Array.isArray(chat.bookings)
            ? chat.bookings[0]
            : chat.bookings;

          const roomData = Array.isArray(chat.rooms)
            ? chat.rooms[0]
            : chat.rooms;

          const isNegotiation = chat.type === "negotiation";
          const isGuest = chat.guest_id === user.id;
          let displayName = otherProfile?.full_name || "Usuário";

          if (isNegotiation && isGuest) {
            displayName = "Anfitrião Parceiro";
          }

          if (!isNegotiation) {
            if (bookingData?.status === "cancelled") {
              continue;
            }

            if (bookingData?.end_time) {
              const expirationTime = addHours(
                parseISO(bookingData.end_time),
                1,
              );
              if (isAfter(now, expirationTime)) {
                continue;
              }
            }
          }

          validChats.push({
            id: chat.id,
            room_id: chat.room_id,
            guest_id: chat.guest_id,
            host_id: chat.host_id,
            status: chat.status,
            type: chat.type,
            room_name: roomData?.name || "Sala Excluída",
            room_image: roomData?.image_url || "/placeholder.jpg",
            other_person_name: displayName,
            last_message: lastMsg?.content,
            last_message_date: lastMsg?.created_at,
            unread_count: unreadCount,
            booking_id: chat.booking_id,
            booking_start: bookingData?.start_time,
            booking_end: bookingData?.end_time,
            booking_status: bookingData?.status,
          });
        }

        validChats.sort((a, b) => {
          if (!a.last_message_date) return 1;
          if (!b.last_message_date) return -1;
          return (
            new Date(b.last_message_date).getTime() -
            new Date(a.last_message_date).getTime()
          );
        });

        setChats(validChats);

        if (selectedChat) {
          const stillExists = validChats.find((c) => c.id === selectedChat.id);
          if (!stillExists) setSelectedChat(null);
        }
      } catch (error) {
        console.error("Erro ao buscar chats:", error);
      } finally {
        setLoading(false);
      }
    }

    fetchChats();
  }, [supabase]);

  useEffect(() => {
    if (!selectedChat) return;

    let channel: any;

    async function fetchMessages() {
      const { data, error } = await supabase
        .from("messages")
        .select("*")
        .eq("chat_id", selectedChat!.id)
        .order("created_at", { ascending: true });

      if (!error && data) {
        setMessages(data);
        scrollToBottom();

        const unreadIds = data
          .filter((m) => m.sender_id !== myId && !m.read_at)
          .map((m) => m.id);
        if (unreadIds.length > 0) {
          await supabase
            .from("messages")
            .update({ read_at: new Date().toISOString() })
            .in("id", unreadIds);
          setChats((prev) =>
            prev.map((c) =>
              c.id === selectedChat!.id ? { ...c, unread_count: 0 } : c,
            ),
          );
        }
      }
    }

    fetchMessages();

    channel = supabase
      .channel(`chat_${selectedChat.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `chat_id=eq.${selectedChat.id}`,
        },
        (payload) => {
          setMessages((prev) => [...prev, payload.new as Message]);
          scrollToBottom();

          if (payload.new.sender_id !== myId) {
            supabase
              .from("messages")
              .update({ read_at: new Date().toISOString() })
              .eq("id", payload.new.id)
              .then();
          }
        },
      )
      .subscribe();

    return () => {
      if (channel) supabase.removeChannel(channel);
    };
  }, [selectedChat, myId, supabase]);

  const scrollToBottom = () => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, 100);
  };

  const handleSendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newMessage.trim() || !selectedChat) return;

    const messageText = newMessage.trim();
    setNewMessage("");
    setSending(true);

    try {
      const { error } = await supabase.from("messages").insert({
        chat_id: selectedChat.id,
        sender_id: myId,
        content: messageText,
      });

      if (error) throw error;

      setChats((prev) =>
        prev.map((c) =>
          c.id === selectedChat.id
            ? {
                ...c,
                last_message: messageText,
                last_message_date: new Date().toISOString(),
              }
            : c,
        ),
      );
    } catch (error) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Falha ao enviar mensagem.",
      });
      setNewMessage(messageText);
    } finally {
      setSending(false);
    }
  };

  const filteredChats = chats.filter((chat) => {
    if (activeFilter === "unread" && chat.unread_count === 0) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        chat.room_name.toLowerCase().includes(q) ||
        chat.other_person_name.toLowerCase().includes(q)
      );
    }
    return true;
  });

  const getBookingStatusBadge = (status?: string) => {
    switch (status) {
      case "confirmed":
        return (
          <Badge className="bg-emerald-100 text-emerald-800 border-0 text-[10px] uppercase tracking-wider">
            Confirmado
          </Badge>
        );
      case "completed":
        return (
          <Badge className="bg-slate-200 text-slate-800 border-0 text-[10px] uppercase tracking-wider">
            Concluído
          </Badge>
        );
      case "cancelled":
        return (
          <Badge className="bg-red-100 text-red-800 border-0 text-[10px] uppercase tracking-wider">
            Cancelado
          </Badge>
        );
      case "pending_payment":
        return (
          <Badge className="bg-amber-100 text-amber-800 border-0 text-[10px] uppercase tracking-wider">
            Pendente
          </Badge>
        );
      default:
        return null;
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-[calc(100vh-100px)]">
        <Loader2 className="w-10 h-10 animate-spin text-[#f05e23]" />
      </div>
    );
  }

  return (
    <div className="h-[100dvh] md:h-[calc(100vh-4rem)] max-w-7xl mx-auto w-full bg-slate-50 pb-[84px] md:pb-6 lg:pb-8 md:pt-6 lg:pt-8 md:px-6 lg:px-8 animate-in fade-in duration-500 box-border">
      <div className="bg-white md:rounded-3xl shadow-sm border border-slate-200 h-full flex overflow-hidden">
        <div
          className={`w-full md:w-[380px] lg:w-[420px] flex flex-col border-r border-slate-100 bg-white shrink-0 ${selectedChat ? "hidden md:flex" : "flex"}`}
        >
          <div className="p-5 border-b border-slate-100 space-y-4">
            <h1 className="text-2xl font-black text-slate-900 tracking-tight">
              Mensagens
            </h1>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <Input
                placeholder="Buscar conversa ou sala..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9 h-11 bg-slate-50 border-slate-200 rounded-xl"
              />
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setActiveFilter("all")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all ${activeFilter === "all" ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Todas
              </button>
              <button
                onClick={() => setActiveFilter("unread")}
                className={`px-4 py-2 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${activeFilter === "unread" ? "bg-[#f05e23] text-white shadow-md shadow-orange-500/20" : "bg-slate-100 text-slate-600 hover:bg-slate-200"}`}
              >
                Não Lidas
                {chats.some((c) => c.unread_count > 0) && (
                  <span className="w-2 h-2 rounded-full bg-red-500"></span>
                )}
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto">
            {filteredChats.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mb-4">
                  <MessageSquare className="w-8 h-8 text-slate-300" />
                </div>
                <p className="font-bold text-slate-900">
                  Nenhuma conversa encontrada
                </p>
                <p className="text-xs text-slate-500 mt-1">
                  {activeFilter === "unread"
                    ? "Você leu todas as suas mensagens."
                    : "Suas conversas aparecerão aqui."}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-50">
                {filteredChats.map((chat) => {
                  const isSelected = selectedChat?.id === chat.id;
                  const hasUnread = chat.unread_count > 0;
                  const isNegotiation = chat.type === "negotiation";

                  return (
                    <button
                      key={chat.id}
                      onClick={() => setSelectedChat(chat)}
                      className={`w-full text-left p-4 flex gap-4 transition-all hover:bg-slate-50 ${isSelected ? "bg-orange-50/50" : ""} ${hasUnread ? "bg-slate-50/50" : ""}`}
                    >
                      <div className="relative">
                        <div className="w-14 h-14 rounded-2xl overflow-hidden bg-slate-100 border border-slate-200 shrink-0 relative">
                          <img
                            src={chat.room_image}
                            alt={chat.room_name}
                            className="w-full h-full object-cover"
                          />
                          {isNegotiation && (
                            <div className="absolute inset-0 bg-black/40 flex items-center justify-center">
                              <Handshake className="w-5 h-5 text-white" />
                            </div>
                          )}
                        </div>
                        {hasUnread && (
                          <div className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 rounded-full flex items-center justify-center text-white text-[10px] font-black border-2 border-white shadow-sm">
                            {chat.unread_count}
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0 flex flex-col justify-center">
                        <div className="flex justify-between items-start mb-0.5">
                          <h4
                            className={`text-sm truncate pr-2 ${hasUnread ? "font-black text-slate-900" : "font-bold text-slate-800"}`}
                          >
                            {chat.other_person_name}
                          </h4>
                          {chat.last_message_date && (
                            <span
                              className={`text-[10px] whitespace-nowrap ${hasUnread ? "font-bold text-[#f05e23]" : "text-slate-400"}`}
                            >
                              {format(
                                parseISO(chat.last_message_date),
                                "HH:mm",
                              )}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mb-1">
                          {isNegotiation ? (
                            <Badge className="bg-amber-100 text-amber-800 border-0 px-1 py-0 text-[8px] font-black uppercase tracking-wider">
                              Em Negociação
                            </Badge>
                          ) : (
                            <Building2 className="w-3 h-3 text-slate-400" />
                          )}
                          <span className="text-[10px] font-bold text-slate-500 uppercase truncate">
                            {chat.room_name}{" "}
                            {chat.booking_start
                              ? ` • ${format(parseISO(chat.booking_start), "dd/MM")}`
                              : ""}
                          </span>
                        </div>

                        <p
                          className={`text-xs truncate ${hasUnread ? "font-bold text-slate-700" : "text-slate-500"}`}
                        >
                          {chat.last_message
                            ? chat.last_message
                            : "Envie a primeira mensagem"}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div
          className={`flex-1 flex flex-col bg-[#f8f9fa] relative ${!selectedChat ? "hidden md:flex" : "flex"}`}
        >
          {!selectedChat ? (
            <div className="hidden md:flex flex-col items-center justify-center h-full text-center p-8 bg-slate-50/50">
              <div className="w-24 h-24 bg-white rounded-full shadow-sm flex items-center justify-center mb-6">
                <MessageSquare className="w-10 h-10 text-slate-300" />
              </div>
              <h2 className="text-2xl font-black text-slate-900 mb-2">
                Suas Conversas
              </h2>
              <p className="text-slate-500 font-medium max-w-md">
                Selecione um chat no menu lateral para visualizar ou enviar
                mensagens.
              </p>
            </div>
          ) : (
            <>
              <div className="h-[72px] bg-white border-b border-slate-200 px-4 flex items-center gap-4 shrink-0 shadow-sm z-20">
                <button
                  onClick={() => setSelectedChat(null)}
                  className="md:hidden w-10 h-10 bg-slate-50 rounded-full flex items-center justify-center text-slate-600"
                >
                  <ArrowLeft className="w-5 h-5" />
                </button>

                <div className="w-10 h-10 rounded-full overflow-hidden bg-slate-100 border border-slate-200 shrink-0">
                  {selectedChat.type === "negotiation" &&
                  selectedChat.guest_id === myId ? (
                    <div className="w-full h-full flex items-center justify-center bg-amber-500 text-black font-black text-lg">
                      F
                    </div>
                  ) : (
                    <div className="w-full h-full flex items-center justify-center bg-orange-50 text-[#f05e23]">
                      <User className="w-5 h-5" />
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-black text-slate-900 truncate leading-tight flex items-center gap-2">
                    {selectedChat.other_person_name}
                    {selectedChat.type === "negotiation" &&
                      selectedChat.guest_id === myId && (
                        <ShieldCheck className="w-4 h-4 text-emerald-500 inline" />
                      )}
                  </h3>
                  <p className="text-[10px] font-bold text-slate-500 uppercase truncate">
                    {selectedChat.type === "negotiation"
                      ? "Intermediação Segura da Plataforma"
                      : "Anfitrião da Sala"}
                  </p>
                </div>
              </div>

              {selectedChat.type === "negotiation" ? (
                <div className="bg-gradient-to-r from-amber-50 to-orange-50 border-b border-amber-200/60 p-3 sm:px-6 flex flex-row items-center justify-between shrink-0 z-10 shadow-sm">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden border border-amber-200/50 shrink-0 shadow-sm relative">
                      <img
                        src={selectedChat.room_image}
                        alt="Sala"
                        className="w-full h-full object-cover"
                      />
                      <div className="absolute inset-0 bg-black/10" />
                    </div>
                    <div>
                      <div className="flex items-center gap-1.5 mb-0.5">
                        <Badge className="bg-amber-500 text-black border-0 px-1.5 py-0 text-[9px] font-black uppercase tracking-wider">
                          Negociação
                        </Badge>
                        <span className="text-[10px] font-bold text-amber-700 uppercase tracking-widest">
                          Turno ou Fixo
                        </span>
                      </div>
                      <p className="text-xs sm:text-sm font-black text-slate-900 leading-tight">
                        {selectedChat.room_name}
                      </p>
                    </div>
                  </div>
                </div>
              ) : selectedChat.booking_start ? (
                <div className="bg-slate-50 border-b border-slate-200 p-3 sm:px-6 flex flex-row items-center justify-between shrink-0 z-10">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg overflow-hidden border border-slate-200 shrink-0 shadow-sm">
                      <img
                        src={selectedChat.room_image}
                        alt="Sala"
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div>
                      <p className="text-xs sm:text-sm font-black text-slate-900 leading-tight">
                        {selectedChat.room_name}
                      </p>
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] sm:text-xs font-bold text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <CalendarIcon className="w-3 h-3 text-[#f05e23]" />
                          {format(
                            parseISO(selectedChat.booking_start),
                            "dd MMM, yyyy",
                            { locale: ptBR },
                          )}
                        </span>
                        <span className="hidden sm:inline w-1 h-1 bg-slate-300 rounded-full"></span>
                        <span className="flex items-center gap-1">
                          <Clock className="w-3 h-3 text-[#f05e23]" />
                          {format(
                            parseISO(selectedChat.booking_start),
                            "HH:mm",
                          )}{" "}
                          às{" "}
                          {format(parseISO(selectedChat.booking_end!), "HH:mm")}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="shrink-0 pl-2">
                    {getBookingStatusBadge(selectedChat.booking_status)}
                  </div>
                </div>
              ) : null}

              <div className="flex-1 overflow-y-auto p-4 md:p-6 space-y-6">
                {selectedChat.type === "negotiation" ? (
                  <div className="text-center my-4">
                    <div className="bg-amber-100/50 border border-amber-200 rounded-2xl p-4 max-w-sm mx-auto text-center">
                      <ShieldCheck className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                      <h4 className="text-sm font-black text-amber-900 mb-1">
                        Negociação Monitorada
                      </h4>
                      <p className="text-[10px] text-amber-800 font-medium leading-relaxed">
                        Para sua segurança, a equipe da Fusion acompanha este
                        chat. Transações por fora da plataforma violam os termos
                        de serviço.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="text-center my-4">
                    <Badge
                      variant="outline"
                      className="bg-white text-slate-400 border-slate-200 text-[10px] uppercase font-bold flex items-center justify-center gap-1 w-fit mx-auto"
                    >
                      <Info className="w-3 h-3" />
                      Início da conversa
                    </Badge>
                  </div>
                )}

                {messages.map((msg, idx) => {
                  const isMe = msg.sender_id === myId;
                  const isRead = !!msg.read_at;

                  return (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}
                    >
                      <div
                        className={`max-w-[85%] md:max-w-[70%] rounded-2xl px-4 py-3 shadow-sm ${isMe ? "bg-[#f05e23] text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"}`}
                      >
                        <p className="text-sm leading-relaxed whitespace-pre-wrap word-break">
                          {msg.content}
                        </p>
                      </div>
                      <div
                        className={`flex items-center gap-1 mt-1 px-1 ${isMe ? "text-slate-400" : "text-slate-400"}`}
                      >
                        <span className="text-[10px] font-medium">
                          {format(parseISO(msg.created_at), "HH:mm")}
                        </span>
                        {isMe && (
                          <CheckCheck
                            className={`w-3.5 h-3.5 ${isRead ? "text-blue-500" : "text-slate-300"}`}
                          />
                        )}
                      </div>
                    </div>
                  );
                })}
                <div ref={messagesEndRef} />
              </div>

              <div className="p-4 bg-white border-t border-slate-200 shrink-0">
                <form
                  onSubmit={handleSendMessage}
                  className="flex items-end gap-3 bg-slate-50 border border-slate-200 p-2 rounded-2xl focus-within:ring-2 ring-[#f05e23]/20 transition-all"
                >
                  <textarea
                    value={newMessage}
                    onChange={(e) => setNewMessage(e.target.value)}
                    placeholder="Digite sua mensagem..."
                    className="flex-1 bg-transparent border-0 resize-none outline-none max-h-32 min-h-[44px] px-3 py-2 text-sm text-slate-700 placeholder:text-slate-400"
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(e);
                      }
                    }}
                  />
                  <Button
                    type="submit"
                    disabled={!newMessage.trim() || sending}
                    className="w-12 h-12 rounded-xl bg-[#f05e23] hover:bg-[#d6521e] text-white shrink-0 shadow-md mb-0.5"
                  >
                    {sending ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Send className="w-5 h-5 ml-1" />
                    )}
                  </Button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
