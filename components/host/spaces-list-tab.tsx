"use client";

import { useEffect, useState, useCallback } from "react";
import { createClient } from "@/utils/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Clock,
  CheckCircle2,
  Building2,
  PlusCircle,
  AlertCircle,
  ArrowLeft,
  PauseCircle,
  PlayCircle,
  Edit3,
  Star,
  AlertTriangle,
} from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { HostSpaceForm } from "@/components/host/space-form";
import { Badge } from "@/components/ui/badge";

type Room = {
  id: string;
  name: string;
  specialty: string;
  description: string;
  is_active: boolean;
  is_paused: boolean;
  is_partner?: boolean;
  modalities: string[];
  created_at: string;
  image_url?: string;
  address_details?: any;
};

export function HostSpaceList() {
  const supabase = createClient();
  const { toast } = useToast();

  const [rooms, setRooms] = useState<Room[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isCreating, setIsCreating] = useState(false);
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);

  const [roomToPause, setRoomToPause] = useState<Room | null>(null);
  const [isProcessingPause, setIsProcessingPause] = useState(false);

  const fetchRooms = useCallback(async () => {
    setLoading(true);
    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) throw new Error("Usuário não autenticado");

      // Trazendo tudo, inclusive o is_partner recém criado
      const { data, error: roomsError } = await supabase
        .from("rooms")
        .select("*")
        .eq("host_id", user.id)
        .order("created_at", { ascending: false });

      if (roomsError) throw roomsError;
      setRooms(data || []);
    } catch (err: any) {
      console.error("Erro ao buscar salas:", err);
      setError("Não foi possível carregar seus espaços.");
    } finally {
      setLoading(false);
    }
  }, [supabase]);

  useEffect(() => {
    fetchRooms();
  }, [fetchRooms]);

  const executeTogglePause = async () => {
    if (!roomToPause) return;
    setIsProcessingPause(true);

    try {
      const { error } = await supabase
        .from("rooms")
        .update({ is_paused: !roomToPause.is_paused })
        .eq("id", roomToPause.id);

      if (error) throw error;

      toast({
        title: !roomToPause.is_paused
          ? "Sala Pausada com sucesso"
          : "Sala Reativada com sucesso",
        description: !roomToPause.is_paused
          ? "O anúncio foi removido temporariamente da vitrine e não receberá novas reservas."
          : "O anúncio voltou para a vitrine e já pode ser reservado pelos profissionais.",
      });

      setRooms((prev) =>
        prev.map((r) =>
          r.id === roomToPause.id
            ? { ...r, is_paused: !roomToPause.is_paused }
            : r,
        ),
      );
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro",
        description: "Não foi possível alterar o status da sala.",
      });
    } finally {
      setIsProcessingPause(false);
      setRoomToPause(null);
    }
  };

  const handleRequestPartner = (roomId: string) => {
    toast({
      title: "Solicitação Enviada! 🚀",
      description:
        "Nossa equipe entrará em contato em breve para ativar os recursos do plano Fusion Host Partner na sua sala.",
    });
  };

  if (isCreating || editingRoom) {
    return (
      <div className="p-4 md:p-8 max-w-3xl mx-auto space-y-4 animate-in fade-in">
        <Button
          variant="ghost"
          onClick={() => {
            setIsCreating(false);
            setEditingRoom(null);
            fetchRooms();
          }}
          className="text-slate-500 hover:text-[#f05e23] p-0 hover:bg-transparent font-bold"
        >
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar para meus espaços
        </Button>
        <HostSpaceForm
          initialData={editingRoom}
          onSuccess={() => {
            setIsCreating(false);
            setEditingRoom(null);
            fetchRooms();
          }}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="space-y-4 max-w-5xl mx-auto p-4 md:p-8">
        <Skeleton className="h-[160px] w-full rounded-2xl bg-slate-100" />
        <Skeleton className="h-[160px] w-full rounded-2xl bg-slate-100" />
      </div>
    );
  }

  if (error)
    return (
      <div className="p-4 md:p-8 flex items-center justify-center">
        <div className="flex items-center gap-2 text-red-600 bg-red-50 px-4 py-3 rounded-lg">
          <AlertCircle className="w-5 h-5" />
          <p className="font-medium">{error}</p>
        </div>
      </div>
    );

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6 animate-in fade-in duration-300">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-2">
        <div>
          <h2 className="text-2xl font-black text-slate-900 tracking-tight">
            Meus Espaços
          </h2>
          <p className="text-sm text-slate-500 font-medium mt-1">
            Gerencie suas salas, edite informações ou pause anúncios.
          </p>
        </div>
        <Button
          onClick={() => setIsCreating(true)}
          className="bg-[#f05e23] hover:bg-[#d6521e] text-white rounded-xl font-bold h-11"
        >
          <PlusCircle className="w-4 h-4 mr-2" /> Nova Sala
        </Button>
      </div>

      {rooms.length === 0 ? (
        <Card className="border-dashed border-2 border-slate-200 shadow-none bg-slate-50/50">
          <CardContent className="flex flex-col items-center justify-center py-16 text-center">
            <div className="h-16 w-16 bg-white border border-slate-100 text-slate-400 rounded-full flex items-center justify-center mb-4 shadow-sm">
              <Building2 className="h-8 w-8" />
            </div>
            <h3 className="text-xl font-black text-slate-900 mb-2">
              Nenhum espaço cadastrado
            </h3>
            <p className="text-slate-500 max-w-md mx-auto mb-6 font-medium">
              Você ainda não enviou nenhuma sala. Comece agora a rentabilizar o
              seu espaço.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {rooms.map((room) => {
            const pricing = room.address_details?.pricing || {};
            const hasPricing =
              pricing.morning ||
              pricing.afternoon ||
              pricing.night ||
              pricing.monthly ||
              pricing.hourly;

            const isPartner = room.is_partner === true;

            return (
              <Card
                key={room.id}
                className={`shadow-sm rounded-2xl overflow-hidden transition-all border-2 ${
                  room.is_paused
                    ? "opacity-75 bg-slate-50 border-slate-200"
                    : isPartner
                      ? "border-amber-400 shadow-amber-500/10 hover:shadow-amber-500/20 hover:border-amber-500 bg-gradient-to-r from-amber-50/40 to-white"
                      : "border-slate-200 hover:border-[#f05e23]/30 bg-white"
                }`}
              >
                <CardContent className="p-0">
                  <div className="flex flex-col sm:flex-row">
                    <div className="bg-slate-100 sm:w-56 h-48 sm:h-auto relative shrink-0">
                      <img
                        src={room.image_url || "/placeholder.jpg"}
                        alt={room.name}
                        className={`w-full h-full object-cover ${room.is_paused ? "grayscale" : ""}`}
                      />
                      {isPartner && !room.is_paused && (
                        <div className="absolute top-2 left-2 bg-amber-500 text-white text-[10px] font-black px-2 py-1 rounded-md uppercase flex items-center gap-1 shadow-md">
                          <Star className="w-3 h-3 fill-white" /> Partner
                        </div>
                      )}
                    </div>

                    <div className="p-5 flex-1 flex flex-col justify-between">
                      <div>
                        <div className="flex flex-col sm:flex-row justify-between items-start mb-2 gap-2">
                          <div>
                            <h3
                              className={`text-lg font-bold leading-tight ${room.is_paused ? "text-slate-500" : "text-slate-900"}`}
                            >
                              {room.name}
                            </h3>
                            {room.specialty && (
                              <p className="text-xs font-semibold text-slate-500 uppercase tracking-wider mt-1">
                                {room.specialty}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2">
                            {!room.is_active ? (
                              <span className="flex items-center px-3 py-1.5 rounded-lg bg-amber-50 text-amber-700 text-xs font-bold shrink-0 border border-amber-100">
                                <Clock className="w-4 h-4 mr-1.5" /> Em Análise
                              </span>
                            ) : room.is_paused ? (
                              <span className="flex items-center px-3 py-1.5 rounded-lg bg-slate-200 text-slate-600 text-xs font-bold shrink-0 border border-slate-300">
                                <PauseCircle className="w-4 h-4 mr-1.5" />{" "}
                                Pausada
                              </span>
                            ) : (
                              <span className="flex items-center px-3 py-1.5 rounded-lg bg-emerald-50 text-emerald-700 text-xs font-bold shrink-0 border border-emerald-100">
                                <CheckCircle2 className="w-4 h-4 mr-1.5" />{" "}
                                Ativa
                              </span>
                            )}
                          </div>
                        </div>

                        {/* EXIBIÇÃO DE VALORES ATUAIS */}
                        {hasPricing && (
                          <div className="flex flex-wrap gap-2 my-3">
                            {pricing.hourly && (
                              <Badge className="bg-amber-100 text-amber-800 hover:bg-amber-100 border-amber-200 font-bold">
                                <Clock className="w-3 h-3 mr-1" />
                                Hora: R$ {pricing.hourly}
                              </Badge>
                            )}
                            {pricing.morning && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Manhã: R$ {pricing.morning}
                              </Badge>
                            )}
                            {pricing.afternoon && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Tarde: R$ {pricing.afternoon}
                              </Badge>
                            )}
                            {pricing.night && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Noite: R$ {pricing.night}
                              </Badge>
                            )}
                            {pricing.monthly && (
                              <Badge
                                variant="secondary"
                                className="bg-slate-100 text-slate-700 font-bold border-slate-200"
                              >
                                Mensal: R$ {pricing.monthly}
                              </Badge>
                            )}
                          </div>
                        )}

                        <p className="text-sm text-slate-500 line-clamp-2 mb-4">
                          {room.description || "Nenhuma descrição."}
                        </p>
                      </div>

                      <div className="flex flex-wrap items-center justify-between gap-4 mt-auto pt-4 border-t border-slate-100">
                        {/* BOTÃO FUSION PARTNER UPSELL */}
                        <div className="flex-1">
                          {!isPartner ? (
                            <Button
                              variant="outline"
                              onClick={() => handleRequestPartner(room.id)}
                              className="w-full sm:w-auto font-black text-amber-600 border-amber-200 bg-amber-50 hover:bg-amber-100 hover:text-amber-700 shadow-sm"
                            >
                              <Star className="w-4 h-4 mr-2 fill-amber-500" />
                              Tornar Fusion Partner (Liberar por Hora)
                            </Button>
                          ) : (
                            <div className="flex items-center gap-1.5 text-xs font-bold text-amber-600 uppercase tracking-wider">
                              <Star className="w-4 h-4 fill-amber-500" /> Sala
                              Partner Ativa
                            </div>
                          )}
                        </div>

                        <div className="flex items-center gap-2 w-full sm:w-auto">
                          <Button
                            variant="outline"
                            onClick={() => setEditingRoom(room)}
                            className="flex-1 sm:flex-none border-slate-200 text-slate-700 hover:text-[#f05e23] hover:bg-orange-50 font-bold"
                          >
                            <Edit3 className="w-4 h-4 mr-2" /> Editar
                          </Button>
                          <Button
                            variant="outline"
                            onClick={() => setRoomToPause(room)}
                            className={`flex-1 sm:flex-none font-bold ${room.is_paused ? "bg-slate-900 text-white hover:bg-slate-800" : "border-slate-200 text-slate-700 hover:bg-slate-100"}`}
                          >
                            {room.is_paused ? (
                              <>
                                <PlayCircle className="w-4 h-4 mr-2" /> Reativar
                              </>
                            ) : (
                              <>
                                <PauseCircle className="w-4 h-4 mr-2" /> Pausar
                              </>
                            )}
                          </Button>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal de Confirmação Completo para Pausar/Reativar */}
      <Dialog
        open={!!roomToPause}
        onOpenChange={(open) => !open && setRoomToPause(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-amber-500" />
              {roomToPause?.is_paused ? "Reativar Sala" : "Pausar Sala"}
            </DialogTitle>
            <DialogDescription className="text-base text-slate-600 mt-2">
              {roomToPause?.is_paused
                ? "Esta sala voltará a aparecer para todos os profissionais no catálogo. Eles poderão realizar novas reservas normalmente. Deseja reativá-la?"
                : "Ao pausar, esta sala ficará invisível no catálogo e não receberá novas reservas até você reativá-la. Reservas já confirmadas não serão afetadas. Deseja continuar?"}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-4 gap-2 flex-col sm:flex-row">
            <Button
              variant="outline"
              onClick={() => setRoomToPause(null)}
              disabled={isProcessingPause}
              className="w-full sm:w-auto"
            >
              Cancelar
            </Button>
            <Button
              onClick={executeTogglePause}
              disabled={isProcessingPause}
              className={`w-full sm:w-auto font-bold ${roomToPause?.is_paused ? "bg-emerald-600 hover:bg-emerald-700 text-white" : "bg-amber-600 hover:bg-amber-700 text-white"}`}
            >
              {isProcessingPause
                ? "Processando..."
                : roomToPause?.is_paused
                  ? "Sim, Reativar"
                  : "Sim, Pausar"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
