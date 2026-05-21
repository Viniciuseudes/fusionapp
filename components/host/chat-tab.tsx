import { useState } from "react";
import {
  ArrowLeft,
  Send,
  Image as ImageIcon,
  Paperclip,
  Search,
  CheckCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface Message {
  id: string;
  senderId: string;
  text: string;
  time: string;
}

interface Conversation {
  id: string;
  guestName: string;
  guestAvatar: string;
  spaceName: string;
  lastMessage: string;
  unreadCount: number;
  messages: Message[];
}

const mockConversations: Conversation[] = [
  {
    id: "1",
    guestName: "Dra. Ana Costa",
    guestAvatar:
      "https://images.unsplash.com/photo-1438761681033-6461ffad8d80?w=100&h=100&fit=crop",
    spaceName: "Sala de Reunião Premium",
    lastMessage: "Perfeito, estarei aí às 14h!",
    unreadCount: 2,
    messages: [
      {
        id: "m1",
        senderId: "guest",
        text: "Olá! A sala possui quadro branco?",
        time: "09:15",
      },
      {
        id: "m2",
        senderId: "host",
        text: "Olá Dra. Ana! Sim, todas as salas premium possuem quadro e canetas.",
        time: "09:20",
      },
      {
        id: "m3",
        senderId: "guest",
        text: "Perfeito, estarei aí às 14h!",
        time: "09:25",
      },
    ],
  },
  {
    id: "2",
    guestName: "Dr. Roberto Mendes",
    guestAvatar:
      "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=100&h=100&fit=crop",
    spaceName: "Consultório Psicanálise",
    lastMessage: "Obrigado pelas informações.",
    unreadCount: 0,
    messages: [
      {
        id: "m1",
        senderId: "guest",
        text: "Como funciona o acesso ao prédio no sábado?",
        time: "Ontem",
      },
      {
        id: "m2",
        senderId: "host",
        text: "A recepção funciona normalmente até as 18h.",
        time: "Ontem",
      },
      {
        id: "m3",
        senderId: "guest",
        text: "Obrigado pelas informações.",
        time: "Ontem",
      },
    ],
  },
];

export function HostChatTab() {
  const [selectedChat, setSelectedChat] = useState<Conversation | null>(null);
  const [messageInput, setMessageInput] = useState("");
  const [conversations, setConversations] = useState(mockConversations);

  const handleSendMessage = () => {
    if (!messageInput.trim() || !selectedChat) return;

    const newMessage: Message = {
      id: `m${Date.now()}`,
      senderId: "host",
      text: messageInput.trim(),
      time: new Date().toLocaleTimeString([], {
        hour: "2-digit",
        minute: "2-digit",
      }),
    };

    const updatedConversations = conversations.map((conv) => {
      if (conv.id === selectedChat.id) {
        const updatedConv = {
          ...conv,
          messages: [...conv.messages, newMessage],
          lastMessage: messageInput.trim(),
          unreadCount: 0, // Zera as não lidas ao responder
        };
        setSelectedChat(updatedConv);
        return updatedConv;
      }
      return conv;
    });

    setConversations(updatedConversations);
    setMessageInput("");
  };

  // TELA DE LISTA DE CONVERSAS
  if (!selectedChat) {
    return (
      <div className="p-4 lg:p-8 animate-in fade-in duration-500 max-w-4xl mx-auto w-full pb-32">
        <div className="mb-6">
          <h1 className="text-2xl font-black text-slate-900 mb-2">Mensagens</h1>
          <p className="text-sm text-slate-500 font-medium">
            Converse diretamente com os profissionais que agendaram o seu
            espaço.
          </p>
        </div>

        <div className="relative mb-6">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
          <Input
            placeholder="Buscar conversas..."
            className="pl-10 h-12 bg-white border-slate-200 rounded-xl shadow-sm"
          />
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden divide-y divide-slate-100">
          {conversations.map((conv) => (
            <div
              key={conv.id}
              onClick={() => setSelectedChat(conv)}
              className="p-4 hover:bg-slate-50 cursor-pointer transition-colors flex gap-4 items-center"
            >
              <div className="relative shrink-0">
                <img
                  src={conv.guestAvatar}
                  alt={conv.guestName}
                  className="w-14 h-14 rounded-full object-cover bg-slate-100"
                />
                {conv.unreadCount > 0 && (
                  <div className="absolute -top-1 -right-1 w-5 h-5 bg-primary rounded-full border-2 border-white flex items-center justify-center text-[10px] font-bold text-white shadow-sm">
                    {conv.unreadCount}
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex justify-between items-start mb-1">
                  <h3
                    className={`text-sm truncate ${conv.unreadCount > 0 ? "font-black text-slate-900" : "font-bold text-slate-700"}`}
                  >
                    {conv.guestName}
                  </h3>
                  <span className="text-xs text-slate-400 font-medium whitespace-nowrap ml-2">
                    {conv.messages[conv.messages.length - 1].time}
                  </span>
                </div>
                <p className="text-xs text-primary font-bold mb-1 truncate">
                  {conv.spaceName}
                </p>
                <p
                  className={`text-sm truncate ${conv.unreadCount > 0 ? "text-slate-800 font-bold" : "text-slate-500"}`}
                >
                  {conv.lastMessage}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // TELA DE CHAT ABERTO
  return (
    <div className="flex flex-col h-[calc(100vh-80px)] lg:h-screen bg-slate-50">
      {/* Header do Chat */}
      <div className="bg-white border-b border-slate-200 p-4 flex items-center gap-4 shadow-sm z-10 shrink-0">
        <button
          onClick={() => setSelectedChat(null)}
          className="p-2 hover:bg-slate-100 rounded-full transition-colors"
        >
          <ArrowLeft className="w-5 h-5 text-slate-600" />
        </button>
        <img
          src={selectedChat.guestAvatar}
          alt={selectedChat.guestName}
          className="w-10 h-10 rounded-full object-cover"
        />
        <div>
          <h2 className="font-black text-slate-900 text-sm">
            {selectedChat.guestName}
          </h2>
          <p className="text-xs text-primary font-bold">
            {selectedChat.spaceName}
          </p>
        </div>
      </div>

      {/* Área de Mensagens */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {selectedChat.messages.map((message) => {
          const isHost = message.senderId === "host";
          return (
            <div
              key={message.id}
              className={`flex ${isHost ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[75%] rounded-2xl px-4 py-3 shadow-sm ${isHost ? "bg-primary text-white rounded-tr-sm" : "bg-white border border-slate-200 text-slate-800 rounded-tl-sm"}`}
              >
                <p className="text-sm font-medium leading-relaxed">
                  {message.text}
                </p>
                <div
                  className={`flex items-center justify-end gap-1 mt-1 ${isHost ? "text-primary-foreground/70" : "text-slate-400"}`}
                >
                  <span className="text-[10px] font-bold">{message.time}</span>
                  {isHost && <CheckCheck className="w-3 h-3" />}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Input de Envio */}
      <div className="bg-white border-t border-slate-200 p-4 shrink-0">
        <div className="max-w-4xl mx-auto flex items-center gap-2">
          <button className="p-2 text-slate-400 hover:text-primary transition-colors">
            <Paperclip className="w-5 h-5" />
          </button>
          <Input
            value={messageInput}
            onChange={(e) => setMessageInput(e.target.value)}
            onKeyPress={(e) => e.key === "Enter" && handleSendMessage()}
            placeholder="Digite sua mensagem..."
            className="flex-1 h-12 bg-slate-50 border-slate-200 rounded-xl"
          />
          <Button
            onClick={handleSendMessage}
            disabled={!messageInput.trim()}
            className="h-12 w-12 rounded-xl bg-primary hover:bg-primary/90 shadow-sm shrink-0 p-0"
          >
            <Send className="w-5 h-5" />
          </Button>
        </div>
      </div>
    </div>
  );
}
