"use client";

import { useState, useRef, useEffect } from "react";
import { createClient } from "@/utils/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Building2,
  UploadCloud,
  Star,
  Crop as CropIcon,
  Trash2,
  Tag,
  DollarSign,
  AlertTriangle,
  Lock,
  MapPin,
  Users,
  Maximize,
  Wifi,
  Monitor,
  Coffee,
  Wind,
  Car,
  ShieldCheck,
  Check,
  Loader2,
  Sun,
  Moon,
  CalendarDays,
  Info,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import ReactCrop, { type Crop, type PixelCrop } from "react-image-crop";
// @ts-ignore
import "react-image-crop/dist/ReactCrop.css";

// ==========================================
// IMPORTAÇÃO DA NOVA FUNÇÃO SÊNIOR DE CONVERSÃO DE IMAGENS
// Certifique-se de que a biblioteca heic2any foi instalada via: npm install heic2any
// ==========================================
import { processImageToWebp } from "@/lib/image-utils";

type RoomImage = {
  id: string;
  file?: File;
  preview: string;
  isCover: boolean;
  isExisting?: boolean;
};

// Constante com as Especialidades Fixas
const SPECIALTIES = [
  "Multiuso",
  "Estética",
  "Psicologia",
  "Nutrição",
  "Salas com Maca",
  "Odontologia",
  "Fisioterapia",
  "Infantil",
];

const AMENITIES_LIST = [
  { id: "wifi", label: "Wi-Fi", icon: Wifi },
  { id: "tv", label: "TV/Projetor", icon: Monitor },
  { id: "coffee", label: "Café e Água", icon: Coffee },
  { id: "ac", label: "Ar Condicionado", icon: Wind },
  { id: "parking", label: "Estacionamento", icon: Car },
  { id: "security", label: "Segurança 24h", icon: ShieldCheck },
];

const STATE_MAP: Record<string, string> = {
  acre: "AC",
  alagoas: "AL",
  amapá: "AP",
  amazonas: "AM",
  bahia: "BA",
  ceará: "CE",
  "distrito federal": "DF",
  "espírito santo": "ES",
  goiás: "GO",
  maranhão: "MA",
  "mato grosso": "MT",
  "mato grosso do sul": "MS",
  "minas gerais": "MG",
  pará: "PA",
  paraíba: "PB",
  paraná: "PR",
  pernambuco: "PE",
  piauí: "PI",
  "rio de janeiro": "RJ",
  "rio grande do norte": "RN",
  "rio grande do sul": "RS",
  rondônia: "RO",
  roraima: "RR",
  "santa catarina": "SC",
  "são paulo": "SP",
  sergipe: "SE",
  tocantins: "TO",
};

export function HostSpaceForm({
  onSuccess,
  initialData,
}: {
  onSuccess?: () => void;
  initialData?: any;
}) {
  const supabase = createClient();
  const { toast } = useToast();

  const isEditing = !!initialData;
  const isPartner = initialData?.is_partner || false;

  const [loading, setLoading] = useState(false);
  const [isProcessingImages, setIsProcessingImages] = useState(false); // Novo estado de carregamento de fotos
  const [confirmSaveModal, setConfirmSaveModal] = useState(false);

  // DADOS BÁSICOS
  const [name, setName] = useState("");
  const [specialty, setSpecialty] = useState("");
  const [secondarySpecialties, setSecondarySpecialties] = useState<string[]>(
    [],
  );
  const [description, setDescription] = useState("");
  const [contactName, setContactName] = useState("");
  const [contactPhone, setContactPhone] = useState("");

  // AUTOCOMPLETE DE ENDEREÇO
  const [addressSearch, setAddressSearch] = useState("");
  const [addressSuggestions, setAddressSuggestions] = useState<any[]>([]);
  const [isSearchingAddress, setIsSearchingAddress] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  // CAMPOS DO ENDEREÇO REAIS
  const [street, setStreet] = useState("");
  const [number, setNumber] = useState("");
  const [floor, setFloor] = useState("");
  const [roomNumber, setRoomNumber] = useState("");
  const [complement, setComplement] = useState("");
  const [neighborhood, setNeighborhood] = useState("");
  const [city, setCity] = useState("");
  const [stateUF, setStateUF] = useState("");

  // ESTRUTURA E COMODIDADES
  const [capacity, setCapacity] = useState("");
  const [area, setArea] = useState("");
  const [amenities, setAmenities] = useState<string[]>([]);

  // POLÍTICAS DA SALA
  const [minNotice, setMinNotice] = useState("2");
  const [cancellationPolicy, setCancellationPolicy] = useState("24");

  // VALORES E FOTOS
  const [modalities, setModalities] = useState<string[]>(["turno", "fixo"]);
  const [prices, setPrices] = useState({
    hourly: "",
    afterHours: "",
    weekend: "",
    morning: "",
    afternoon: "",
    night: "",
    monthly: "",
  });
  const [images, setImages] = useState<RoomImage[]>([]);

  // CROP
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [croppingId, setCroppingId] = useState<string | null>(null);
  const [crop, setCrop] = useState<Crop>({
    unit: "%",
    width: 100,
    height: 100,
    x: 0,
    y: 0,
  });
  const [completedCrop, setCompletedCrop] = useState<PixelCrop | null>(null);
  const imageRef = useRef<HTMLImageElement>(null);

  useEffect(() => {
    if (initialData) {
      setName(initialData.name || "");
      setSpecialty(initialData.specialty || "");
      setDescription(initialData.description || "");
      setContactName(initialData.contact_name || "");
      setContactPhone(initialData.contact_phone || "");
      setModalities(initialData.modalities || []);

      if (initialData.address_details) {
        const ad = initialData.address_details;
        setStreet(ad.street || "");
        setNumber(ad.number || "");
        setFloor(ad.floor || "");
        setRoomNumber(ad.roomNumber || "");
        setComplement(ad.complement || "");
        setNeighborhood(ad.neighborhood || "");
        setCity(ad.city || "");
        setStateUF(ad.state || "");
        setCapacity(ad.capacity || "");
        setArea(ad.area || "");
        setAmenities(ad.amenities || []);
        setSecondarySpecialties(ad.secondary_specialties || []);

        if (ad.policies) {
          setMinNotice(ad.policies.min_notice || "2");
          setCancellationPolicy(ad.policies.cancellation || "24");
        }

        if (ad.pricing) {
          setPrices({
            hourly: ad.pricing.hourly || "",
            afterHours: ad.pricing.afterHours || "",
            weekend: ad.pricing.weekend || "",
            morning: ad.pricing.morning || "",
            afternoon: ad.pricing.afternoon || "",
            night: ad.pricing.night || "",
            monthly: ad.pricing.monthly || "",
          });
        }
      }

      const loadedImages: RoomImage[] = [];
      if (initialData.image_url)
        loadedImages.push({
          id: "cover-img",
          preview: initialData.image_url,
          isCover: true,
          isExisting: true,
        });
      if (initialData.address_details?.gallery) {
        initialData.address_details.gallery.forEach(
          (url: string, index: number) => {
            loadedImages.push({
              id: `gallery-${index}`,
              preview: url,
              isCover: false,
              isExisting: true,
            });
          },
        );
      }
      setImages(loadedImages);
    }
  }, [initialData]);

  useEffect(() => {
    if (addressSearch.length < 4) {
      setAddressSuggestions([]);
      return;
    }
    const delayDebounceFn = setTimeout(async () => {
      setIsSearchingAddress(true);
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/search?format=json&addressdetails=1&countrycodes=br&q=${encodeURIComponent(addressSearch)}`,
        );
        const data = await response.json();
        setAddressSuggestions(data || []);
      } catch (err) {
        console.error("Erro no autocomplete de endereço:", err);
      } finally {
        setIsSearchingAddress(false);
      }
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [addressSearch]);

  const handleSelectSuggestion = (place: any) => {
    const addr = place.address;
    const localStreet = addr.road || addr.pedestrian || addr.avenue || "";
    const localNeighborhood =
      addr.suburb || addr.neighbourhood || addr.district || "";
    const localCity = addr.city || addr.town || addr.municipality || "";
    const stateName = (addr.state || "").toLowerCase();
    const localUF = STATE_MAP[stateName] || addr.state || "";

    setStreet(localStreet);
    setNeighborhood(localNeighborhood);
    setCity(localCity);
    setStateUF(localUF);

    setAddressSearch(place.display_name);
    setShowSuggestions(false);

    toast({
      title: "Endereço selecionado!",
      description:
        "Preenchemos os campos estruturais abaixo. Insira apenas o número e os detalhes da sala.",
    });
  };

  // ==========================================
  // LÓGICA SÊNIOR DE CONVERSÃO DE IMAGENS
  // ==========================================
  const handleImageSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setIsProcessingImages(true);
      const newImages: RoomImage[] = [];
      const fileList = Array.from(e.target.files);

      for (let i = 0; i < fileList.length; i++) {
        try {
          const file = fileList[i];
          // Transforma qualquer imagem (inclusive HEIC de iPhone) em WebP
          const webpFile = await processImageToWebp(file);

          newImages.push({
            id: Math.random().toString(36).substring(7),
            file: webpFile,
            preview: URL.createObjectURL(webpFile),
            isCover: images.length === 0 && i === 0,
            isExisting: false,
          });
        } catch (error) {
          console.error("Erro processando imagem:", error);
          toast({
            variant: "destructive",
            title: "Erro na foto",
            description: "Uma das fotos selecionadas não pôde ser processada.",
          });
        }
      }

      if (newImages.length > 0) {
        setImages((prev) => [...prev, ...newImages]);
      }
      setIsProcessingImages(false);
    }
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const filtered = prev.filter((img) => img.id !== id);
      if (filtered.length > 0 && !filtered.some((img) => img.isCover))
        filtered[0].isCover = true;
      return filtered;
    });
  };

  const setCover = (id: string) =>
    setImages((prev) =>
      prev.map((img) => ({ ...img, isCover: img.id === id })),
    );

  const openCropModal = (id: string) => {
    setCroppingId(id);
    setCrop({ unit: "%", width: 80, height: 80, x: 10, y: 10 });
    setCropModalOpen(true);
  };

  const applyCrop = async () => {
    if (!imageRef.current || !completedCrop || !croppingId) return;
    const canvas = document.createElement("canvas");
    const scaleX = imageRef.current.naturalWidth / imageRef.current.width;
    const scaleY = imageRef.current.naturalHeight / imageRef.current.height;
    canvas.width = completedCrop.width;
    canvas.height = completedCrop.height;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(
        imageRef.current,
        completedCrop.x * scaleX,
        completedCrop.y * scaleY,
        completedCrop.width * scaleX,
        completedCrop.height * scaleY,
        0,
        0,
        completedCrop.width,
        completedCrop.height,
      );
      canvas.toBlob(
        (blob) => {
          if (!blob) return;
          // Asseguramos que o crop também seja WebP!
          const croppedFile = new File([blob], "cropped.webp", {
            type: "image/webp",
          });
          const newPreview = URL.createObjectURL(blob);
          setImages((prev) =>
            prev.map((img) =>
              img.id === croppingId
                ? {
                    ...img,
                    file: croppedFile,
                    preview: newPreview,
                    isExisting: false,
                  }
                : img,
            ),
          );
          setCropModalOpen(false);
        },
        "image/webp", // Alterado para WEBP
        0.9, // Alta qualidade
      );
    }
  };

  const toggleAmenity = (id: string) => {
    setAmenities((prev) =>
      prev.includes(id) ? prev.filter((a) => a !== id) : [...prev, id],
    );
  };

  const toggleSecondarySpecialty = (spec: string) => {
    setSecondarySpecialties((prev) =>
      prev.includes(spec) ? prev.filter((s) => s !== spec) : [...prev, spec],
    );
  };

  const handlePreSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (images.length === 0)
      return toast({
        variant: "destructive",
        title: "Atenção",
        description: "Adicione ao menos uma foto do espaço.",
      });
    if (!specialty)
      return toast({
        variant: "destructive",
        title: "Atenção",
        description: "Selecione a especialidade principal.",
      });
    if (!city || !neighborhood || !street)
      return toast({
        variant: "destructive",
        title: "Atenção",
        description: "Por favor, busque e selecione um endereço válido.",
      });
    setConfirmSaveModal(true);
  };

  const executeSave = async () => {
    setConfirmSaveModal(false);
    setLoading(true);
    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();
      if (userError || !user) throw new Error("Usuário não autenticado");

      const uploadedGallery = [];
      let finalCoverUrl = "";

      for (const img of images) {
        if (img.isExisting) {
          uploadedGallery.push(img.preview);
          if (img.isCover) finalCoverUrl = img.preview;
        } else if (img.file) {
          // O nome do arquivo já carrega a extensão .webp corretamente
          const fileName = `${user.id}/${Date.now()}-${Math.random()}.webp`;
          const { error: uploadError } = await supabase.storage
            .from("rooms")
            .upload(fileName, img.file, {
              contentType: "image/webp", // Define explicitamente para o banco
            });

          if (uploadError) throw uploadError;

          const {
            data: { publicUrl },
          } = supabase.storage.from("rooms").getPublicUrl(fileName);

          uploadedGallery.push(publicUrl);
          if (img.isCover) finalCoverUrl = publicUrl;
        }
      }

      const filteredGallery = uploadedGallery.filter(
        (url) => url !== finalCoverUrl,
      );

      const address_details = {
        street,
        number,
        floor,
        roomNumber,
        complement,
        neighborhood,
        city,
        state: stateUF,
        capacity,
        area,
        amenities,
        secondary_specialties: secondarySpecialties,
        policies: { min_notice: minNotice, cancellation: cancellationPolicy },
        pricing: {
          hourly: prices.hourly ? Number(prices.hourly) : null,
          afterHours: prices.afterHours ? Number(prices.afterHours) : null,
          weekend: prices.weekend ? Number(prices.weekend) : null,
          morning: prices.morning ? Number(prices.morning) : null,
          afternoon: prices.afternoon ? Number(prices.afternoon) : null,
          night: prices.night ? Number(prices.night) : null,
          monthly: prices.monthly ? Number(prices.monthly) : null,
        },
        gallery: filteredGallery,
      };

      const payload = {
        name,
        specialty,
        description,
        image_url: finalCoverUrl,
        contact_name: contactName,
        contact_phone: contactPhone,
        address_details,
        modalities,
      };

      if (isEditing) {
        const { error: updateError } = await supabase
          .from("rooms")
          .update(payload)
          .eq("id", initialData.id);
        if (updateError) throw updateError;
        toast({
          title: "Sala atualizada!",
          description: "As alterações foram salvas com sucesso.",
        });
      } else {
        const { error: insertError } = await supabase
          .from("rooms")
          .insert({ ...payload, host_id: user.id, is_active: false });
        if (insertError) throw insertError;
        toast({
          title: "Sala cadastrada!",
          description: "O espaço foi enviado para a curadoria.",
        });
      }
      if (onSuccess) onSuccess();
    } catch (error: any) {
      toast({
        variant: "destructive",
        title: "Erro ao salvar",
        description: error.message,
      });
    } finally {
      setLoading(false);
    }
  };

  const imageToCropPreview = images.find(
    (img) => img.id === croppingId,
  )?.preview;

  return (
    <>
      <Card className="border-slate-100 shadow-sm rounded-2xl overflow-hidden mb-8">
        <CardHeader className="bg-slate-50/50 pb-4 border-b border-slate-100">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-[#f05e23] text-white rounded-lg">
              <Building2 className="w-5 h-5" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-800">
                {isEditing ? "Editar Espaço" : "Cadastrar Novo Espaço"}
              </CardTitle>
              <CardDescription>
                {isEditing
                  ? "Atualize as fotos, preços e informações da sua sala."
                  : "Preencha os detalhes e adicione boas fotos."}
              </CardDescription>
            </div>
          </div>
        </CardHeader>

        <CardContent className="pt-6">
          <form onSubmit={handlePreSubmit} className="space-y-10">
            {/* SEÇÃO 1: FOTOS */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <UploadCloud className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-bold text-slate-800">
                  1. Fotos do Espaço
                </h3>
              </div>

              <label className="flex flex-col items-center justify-center w-full h-32 border-2 border-slate-300 border-dashed rounded-xl cursor-pointer bg-slate-50 hover:bg-slate-100 transition-colors">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  {isProcessingImages ? (
                    <>
                      <Loader2 className="w-8 h-8 mb-2 text-[#f05e23] animate-spin" />
                      <p className="text-sm font-semibold text-[#f05e23]">
                        Processando fotos (WebP)...
                      </p>
                    </>
                  ) : (
                    <>
                      <UploadCloud className="w-8 h-8 mb-2 text-slate-400" />
                      <p className="text-sm text-slate-500">
                        <span className="font-semibold text-[#f05e23]">
                          Clique para buscar fotos
                        </span>{" "}
                        ou arraste
                      </p>
                    </>
                  )}
                </div>
                {/* Permite seleção de HEIC diretamente */}
                <input
                  type="file"
                  className="hidden"
                  multiple
                  accept="image/*, .heic, .heif"
                  disabled={isProcessingImages}
                  onChange={handleImageSelect}
                />
              </label>

              {images.length > 0 && (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-4">
                  {images.map((img) => (
                    <div
                      key={img.id}
                      className="relative group rounded-xl overflow-hidden border border-slate-200 aspect-video"
                    >
                      <img
                        src={img.preview}
                        alt="Preview"
                        className="w-full h-full object-cover"
                      />
                      {img.isCover && (
                        <div className="absolute top-2 left-2 bg-[#f05e23] text-white text-[10px] font-bold px-2 py-1 rounded-md uppercase tracking-wider z-10 shadow-sm">
                          Capa
                        </div>
                      )}
                      <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3 backdrop-blur-sm">
                        <button
                          type="button"
                          onClick={() => setCover(img.id)}
                          title="Capa"
                          className={`p-2 rounded-full ${img.isCover ? "bg-[#f05e23]" : "bg-white/20 hover:bg-[#f05e23]"} text-white`}
                        >
                          <Star className="w-4 h-4" />
                        </button>
                        {!img.isExisting && (
                          <button
                            type="button"
                            onClick={() => openCropModal(img.id)}
                            title="Recortar"
                            className="p-2 rounded-full bg-white/20 text-white hover:bg-blue-500"
                          >
                            <CropIcon className="w-4 h-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => removeImage(img.id)}
                          title="Excluir"
                          className="p-2 rounded-full bg-white/20 text-white hover:bg-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            {/* SEÇÃO 2: DADOS BÁSICOS & ESPECIALIDADES */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <Tag className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-bold text-slate-800">
                  2. Informações e Especialidades
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2 md:col-span-2">
                  <Label>
                    Nome da Sala <span className="text-red-500">*</span>
                  </Label>
                  <Input
                    placeholder="Ex: Consultório Master 01"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="h-11 bg-white"
                  />
                </div>

                <div className="space-y-3 md:col-span-2 pt-2">
                  <Label className="font-bold text-slate-700">
                    Especialidade Principal{" "}
                    <span className="text-red-500">*</span>
                  </Label>
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                    {SPECIALTIES.map((spec) => (
                      <button
                        key={spec}
                        type="button"
                        onClick={() => setSpecialty(spec)}
                        className={`p-3 rounded-xl border-2 text-sm font-bold transition-all text-left flex justify-between items-center ${
                          specialty === spec
                            ? "border-[#f05e23] bg-orange-50 text-[#f05e23]"
                            : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"
                        }`}
                      >
                        <span className="truncate pr-2">{spec}</span>
                        {specialty === spec && (
                          <Check className="w-4 h-4 shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-3 md:col-span-2 bg-slate-50 p-5 rounded-2xl border border-slate-100">
                  <Label className="font-bold text-slate-700">
                    Outras Especialidades Atendidas (Opcional)
                  </Label>
                  <p className="text-xs text-slate-500 font-medium mb-2">
                    Sua sala é flexível? Marque outras utilidades para ajudar
                    nas buscas.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {SPECIALTIES.filter((s) => s !== specialty).map((spec) => {
                      const isSelected = secondarySpecialties.includes(spec);
                      return (
                        <Badge
                          key={spec}
                          onClick={() => toggleSecondarySpecialty(spec)}
                          className={`cursor-pointer px-4 py-2 text-xs font-bold border transition-colors ${
                            isSelected
                              ? "bg-slate-900 text-white border-slate-900 hover:bg-slate-800"
                              : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
                          }`}
                        >
                          {isSelected && <Check className="w-3 h-3 mr-1.5" />}
                          {spec}
                        </Badge>
                      );
                    })}
                  </div>
                </div>

                <div className="space-y-2 md:col-span-2 pt-2">
                  <Label>Descrição</Label>
                  <Textarea
                    placeholder="Descreva equipamentos, estrutura e o que faz seu espaço ser especial..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className="min-h-[100px] bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Nome do Contato</Label>
                  <Input
                    placeholder="Recepção"
                    value={contactName}
                    onChange={(e) => setContactName(e.target.value)}
                    className="h-11 bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label>WhatsApp da Clínica</Label>
                  <Input
                    placeholder="(00) 00000-0000"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    className="h-11 bg-white"
                  />
                </div>
              </div>
            </section>

            {/* SEÇÃO 3: LOCALIZAÇÃO AUTOCOMPLETE */}
            <section className="space-y-6 relative">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <MapPin className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-bold text-slate-800">
                  3. Endereço e Estrutura
                </h3>
              </div>
              <div className="space-y-2 relative">
                <Label className="text-slate-700 font-bold">
                  Buscar Endereço Completo{" "}
                  <span className="text-red-500">*</span>
                </Label>
                <div className="relative flex items-center">
                  <MapPin className="absolute left-3.5 h-5 w-5 text-[#f05e23]" />
                  <Input
                    placeholder="Digite a rua, bairro ou nome do prédio comercial..."
                    value={addressSearch}
                    onChange={(e) => {
                      setAddressSearch(e.target.value);
                      setShowSuggestions(true);
                    }}
                    onFocus={() => setShowSuggestions(true)}
                    className="h-12 pl-11 rounded-xl bg-white border-slate-200 text-slate-900"
                  />
                  {isSearchingAddress && (
                    <Loader2 className="absolute right-3.5 h-5 w-5 animate-spin text-slate-400" />
                  )}
                </div>
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div className="absolute z-50 bg-white border border-slate-200 rounded-xl shadow-xl mt-1 w-full max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {addressSuggestions.map((place) => (
                      <button
                        key={place.place_id}
                        type="button"
                        onClick={() => handleSelectSuggestion(place)}
                        className="w-full text-left px-4 py-3 hover:bg-slate-50 font-medium text-sm text-slate-700 block transition-colors truncate"
                      >
                        {place.display_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-1 md:grid-cols-12 gap-4 bg-slate-50/70 p-5 rounded-2xl border border-slate-200">
                <div className="space-y-2 md:col-span-9">
                  <Label className="text-slate-500 font-bold">
                    Rua / Logradouro
                  </Label>
                  <Input
                    placeholder="Preenchido automaticamente"
                    value={street}
                    readOnly
                    className="h-11 bg-slate-100 font-bold text-slate-700"
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label className="font-black text-[#f05e23]">
                    Nº do Prédio *
                  </Label>
                  <Input
                    placeholder="Ex: 123"
                    value={number}
                    onChange={(e) => setNumber(e.target.value)}
                    required
                    className="h-11 bg-white border-orange-300 ring-orange-100 font-bold"
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label className="text-slate-700 font-bold">Andar</Label>
                  <Input
                    placeholder="Ex: 5º Andar"
                    value={floor}
                    onChange={(e) => setFloor(e.target.value)}
                    className="h-11 bg-white"
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label className="text-slate-700 font-bold">Nº da Sala</Label>
                  <Input
                    placeholder="Ex: 502"
                    value={roomNumber}
                    onChange={(e) => setRoomNumber(e.target.value)}
                    className="h-11 bg-white"
                  />
                </div>
                <div className="space-y-2 md:col-span-6">
                  <Label className="text-slate-700 font-bold">
                    Complemento
                  </Label>
                  <Input
                    placeholder="Ponto de referência, bloco..."
                    value={complement}
                    onChange={(e) => setComplement(e.target.value)}
                    className="h-11 bg-white"
                  />
                </div>
                <div className="space-y-2 md:col-span-4">
                  <Label className="text-slate-500 font-bold">Bairro</Label>
                  <Input
                    placeholder="Automático"
                    value={neighborhood}
                    readOnly
                    className="h-11 bg-slate-100 text-slate-600 font-medium"
                  />
                </div>
                <div className="space-y-2 md:col-span-5">
                  <Label className="text-slate-500 font-bold">Cidade</Label>
                  <Input
                    placeholder="Automático"
                    value={city}
                    readOnly
                    className="h-11 bg-slate-100 text-slate-600 font-medium"
                  />
                </div>
                <div className="space-y-2 md:col-span-3">
                  <Label className="text-slate-500 font-bold">Estado</Label>
                  <Input
                    placeholder="Automático"
                    value={stateUF}
                    readOnly
                    className="h-11 bg-slate-100 text-slate-600 font-medium uppercase"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Capacidade</Label>
                  <div className="relative">
                    <Users className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <Input
                      type="number"
                      placeholder="Ex: 8"
                      value={capacity}
                      onChange={(e) => setCapacity(e.target.value)}
                      className="h-11 pl-9 bg-white"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Área (m²)</Label>
                  <div className="relative">
                    <Maximize className="absolute left-3 top-3.5 h-4 w-4 text-slate-400" />
                    <Input
                      type="number"
                      placeholder="Ex: 45"
                      value={area}
                      onChange={(e) => setArea(e.target.value)}
                      className="h-11 pl-9 bg-white"
                    />
                  </div>
                </div>
              </div>

              <div className="space-y-3 pt-2">
                <Label className="text-base font-bold text-slate-900">
                  Comodidades Inclusas
                </Label>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {AMENITIES_LIST.map((am) => (
                    <button
                      key={am.id}
                      type="button"
                      onClick={() => toggleAmenity(am.id)}
                      className={`flex items-center justify-between p-3.5 rounded-xl border-2 transition-all ${amenities.includes(am.id) ? "border-[#f05e23] bg-orange-50/50 text-[#f05e23]" : "border-slate-200 bg-white text-slate-600 hover:border-slate-300"}`}
                    >
                      <div className="flex items-center gap-3">
                        <am.icon className="w-5 h-5" />
                        <span className="font-bold text-sm">{am.label}</span>
                      </div>
                      {amenities.includes(am.id) && (
                        <Check className="w-5 h-5" />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </section>

            {/* SEÇÃO 4: POLÍTICAS */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <AlertTriangle className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-bold text-slate-800">
                  4. Políticas da Sala
                </h3>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
                <div className="space-y-2">
                  <Label className="font-bold">
                    Antecedência Mínima para Reserva
                  </Label>
                  <p className="text-xs text-slate-500 mb-2">
                    Com quanto tempo de aviso o profissional pode agendar?
                  </p>
                  <select
                    value={minNotice}
                    onChange={(e) => setMinNotice(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f05e23]/20"
                  >
                    <option value="1">Até 1 hora antes</option>
                    <option value="2">Até 2 horas antes</option>
                    <option value="12">Até 12 horas antes</option>
                    <option value="24">Até 24 horas antes</option>
                  </select>
                </div>
                <div className="space-y-2">
                  <Label className="font-bold">Política de Cancelamento</Label>
                  <p className="text-xs text-slate-500 mb-2">
                    Até quando o profissional pode cancelar gratuitamente?
                  </p>
                  <select
                    value={cancellationPolicy}
                    onChange={(e) => setCancellationPolicy(e.target.value)}
                    className="flex h-11 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#f05e23]/20"
                  >
                    <option value="12">Reembolso até 12h antes</option>
                    <option value="24">Reembolso até 24h antes</option>
                    <option value="48">Reembolso até 48h antes</option>
                    <option value="0">
                      Sem reembolso (Cancelamento Rigoroso)
                    </option>
                  </select>
                </div>
              </div>
            </section>

            {/* SEÇÃO 5: MODALIDADES E VALORES */}
            <section className="space-y-4">
              <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
                <DollarSign className="w-5 h-5 text-slate-400" />
                <h3 className="text-lg font-bold text-slate-800">
                  5. Modalidades e Valores
                </h3>
              </div>

              <div className="grid grid-cols-1 gap-6 bg-slate-50 p-5 rounded-xl border border-slate-200">
                <div
                  className={`space-y-4 p-5 rounded-2xl border transition-all ${isPartner ? "bg-white border-orange-200 shadow-sm" : "bg-slate-100/50 border-slate-200"}`}
                >
                  <div className="flex items-center justify-between border-b border-slate-200/60 pb-4">
                    <div className="flex items-center space-x-3">
                      <Checkbox
                        id="hora"
                        disabled={!isPartner}
                        checked={modalities.includes("hora")}
                        onCheckedChange={() =>
                          setModalities((prev) =>
                            prev.includes("hora")
                              ? prev.filter((m) => m !== "hora")
                              : [...prev, "hora"],
                          )
                        }
                        className={!isPartner ? "opacity-50" : ""}
                      />
                      <Label
                        htmlFor="hora"
                        className={`font-black text-base md:text-lg cursor-pointer flex items-center gap-2 ${!isPartner ? "text-slate-400" : "text-slate-900"}`}
                      >
                        Locação Por Hora (Dinâmico)
                      </Label>
                    </div>

                    <div className="flex items-center gap-2">
                      {!isPartner ? (
                        <>
                          <Badge
                            variant="outline"
                            className="bg-white text-slate-500 border-slate-200 font-bold flex items-center gap-1.5 py-1 px-3 shadow-sm"
                          >
                            <Lock className="w-3.5 h-3.5" /> Bloqueado
                          </Badge>
                          <TooltipProvider delayDuration={100}>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-[#f05e23] transition-colors p-1"
                                >
                                  <Info className="w-5 h-5" />
                                </button>
                              </TooltipTrigger>
                              <TooltipContent className="bg-slate-900 text-white p-4 max-w-xs border-0 shadow-xl rounded-xl">
                                <p className="text-sm font-medium leading-relaxed">
                                  Apenas salas certificadas com o selo{" "}
                                  <strong className="text-orange-400">
                                    Fusion Partner
                                  </strong>{" "}
                                  podem oferecer locação flexível Por Hora. Após
                                  concluir este cadastro, acesse seu painel para
                                  solicitar a auditoria da nossa equipe.
                                </p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </>
                      ) : (
                        <Badge className="bg-orange-100 text-orange-700 hover:bg-orange-100 font-black border-0 px-3 py-1 shadow-sm">
                          <Star className="w-3.5 h-3.5 fill-orange-500 text-orange-500 mr-1.5" />{" "}
                          Fusion Partner
                        </Badge>
                      )}
                    </div>
                  </div>

                  {modalities.includes("hora") && isPartner && (
                    <div className="pt-2 animate-in fade-in slide-in-from-top-2">
                      <p className="text-sm text-slate-500 font-medium mb-5">
                        Maximize seus lucros definindo valores estratégicos para
                        diferentes períodos.
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-[#f05e23]" />
                          <div className="flex items-center gap-2 mb-1">
                            <Sun className="w-4 h-4 text-[#f05e23]" />
                            <h4 className="font-bold text-slate-900 text-sm">
                              Comercial
                            </h4>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium mb-3">
                            Seg a Sex (08h às 18h)
                          </p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black">
                              R$
                            </span>
                            <Input
                              type="number"
                              required
                              placeholder="45"
                              value={prices.hourly}
                              onChange={(e) =>
                                setPrices({ ...prices, hourly: e.target.value })
                              }
                              className="w-full pl-9 h-11 bg-slate-50 border-slate-200 font-bold"
                            />
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-indigo-500" />
                          <div className="flex items-center gap-2 mb-1">
                            <Moon className="w-4 h-4 text-indigo-500" />
                            <h4 className="font-bold text-slate-900 text-sm">
                              Noturno
                            </h4>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium mb-3">
                            Seg a Sex (18h às 08h)
                          </p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black">
                              R$
                            </span>
                            <Input
                              type="number"
                              placeholder="Ex: 55"
                              value={prices.afterHours}
                              onChange={(e) =>
                                setPrices({
                                  ...prices,
                                  afterHours: e.target.value,
                                })
                              }
                              className="w-full pl-9 h-11 bg-slate-50 border-slate-200 font-bold focus-visible:ring-indigo-500/20 focus-visible:border-indigo-500"
                            />
                          </div>
                        </div>

                        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                          <div className="absolute top-0 left-0 w-1 h-full bg-emerald-500" />
                          <div className="flex items-center gap-2 mb-1">
                            <CalendarDays className="w-4 h-4 text-emerald-500" />
                            <h4 className="font-bold text-slate-900 text-sm">
                              Fim de Semana
                            </h4>
                          </div>
                          <p className="text-[10px] text-slate-500 font-medium mb-3">
                            Sábados e Domingos
                          </p>
                          <div className="relative">
                            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-black">
                              R$
                            </span>
                            <Input
                              type="number"
                              placeholder="Ex: 65"
                              value={prices.weekend}
                              onChange={(e) =>
                                setPrices({
                                  ...prices,
                                  weekend: e.target.value,
                                })
                              }
                              className="w-full pl-9 h-11 bg-slate-50 border-slate-200 font-bold focus-visible:ring-emerald-500/20 focus-visible:border-emerald-500"
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
                    <Checkbox
                      id="turno"
                      checked={modalities.includes("turno")}
                      onCheckedChange={() =>
                        setModalities((prev) =>
                          prev.includes("turno")
                            ? prev.filter((m) => m !== "turno")
                            : [...prev, "turno"],
                        )
                      }
                    />
                    <Label
                      htmlFor="turno"
                      className="font-black text-slate-900 text-base cursor-pointer"
                    >
                      Disponibilizar por Turno
                    </Label>
                  </div>
                  {modalities.includes("turno") && (
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2 animate-in fade-in slide-in-from-top-2">
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          Manhã (R$)
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                            R$
                          </span>
                          <Input
                            placeholder="Ex: 100"
                            value={prices.morning}
                            onChange={(e) =>
                              setPrices({ ...prices, morning: e.target.value })
                            }
                            className="h-11 pl-9 bg-slate-50 border-slate-200"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          Tarde (R$)
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                            R$
                          </span>
                          <Input
                            placeholder="Ex: 120"
                            value={prices.afternoon}
                            onChange={(e) =>
                              setPrices({
                                ...prices,
                                afternoon: e.target.value,
                              })
                            }
                            className="h-11 pl-9 bg-slate-50 border-slate-200"
                          />
                        </div>
                      </div>
                      <div className="space-y-1.5">
                        <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wider">
                          Noite (R$)
                        </Label>
                        <div className="relative">
                          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                            R$
                          </span>
                          <Input
                            placeholder="Ex: 150"
                            value={prices.night}
                            onChange={(e) =>
                              setPrices({ ...prices, night: e.target.value })
                            }
                            className="h-11 pl-9 bg-slate-50 border-slate-200"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
                  <div className="flex items-center space-x-3 border-b border-slate-100 pb-3">
                    <Checkbox
                      id="fixo"
                      checked={modalities.includes("fixo")}
                      onCheckedChange={() =>
                        setModalities((prev) =>
                          prev.includes("fixo")
                            ? prev.filter((m) => m !== "fixo")
                            : [...prev, "fixo"],
                        )
                      }
                    />
                    <Label
                      htmlFor="fixo"
                      className="font-black text-slate-900 text-base cursor-pointer"
                    >
                      Contrato Mensal Fixo
                    </Label>
                  </div>
                  {modalities.includes("fixo") && (
                    <div className="pt-2 sm:w-1/3 animate-in fade-in slide-in-from-top-2">
                      <Label className="text-[10px] font-black text-slate-500 uppercase tracking-wider block mb-1.5">
                        Valor Mensal (R$)
                      </Label>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">
                          R$
                        </span>
                        <Input
                          placeholder="Ex: 2500"
                          value={prices.monthly}
                          onChange={(e) =>
                            setPrices({ ...prices, monthly: e.target.value })
                          }
                          className="h-11 pl-9 bg-slate-50 border-slate-200"
                        />
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </section>

            <Button
              type="submit"
              disabled={loading || isProcessingImages}
              className="w-full h-14 text-lg rounded-xl font-bold bg-[#f05e23] hover:bg-[#d6521e] text-white shadow-lg shadow-orange-500/20 transition-all active:scale-95"
            >
              {loading || isProcessingImages
                ? "Processando..."
                : isEditing
                  ? "Salvar Alterações"
                  : "Finalizar Cadastro"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Dialog open={cropModalOpen} onOpenChange={setCropModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Recortar Imagem</DialogTitle>
          </DialogHeader>
          <div className="flex justify-center bg-slate-950 rounded-lg overflow-hidden p-4 max-h-[60vh]">
            {imageToCropPreview && (
              <ReactCrop
                crop={crop}
                onChange={(c) => setCrop(c)}
                onComplete={(c) => setCompletedCrop(c)}
              >
                <img
                  ref={imageRef}
                  src={imageToCropPreview}
                  alt="Crop preview"
                  className="max-h-[50vh] object-contain"
                />
              </ReactCrop>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setCropModalOpen(false)}>
              Cancelar
            </Button>
            <Button
              onClick={applyCrop}
              className="bg-[#f05e23] hover:bg-[#d6521e] text-white"
            >
              Aplicar Corte
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmSaveModal} onOpenChange={setConfirmSaveModal}>
        <DialogContent className="sm:max-w-md rounded-3xl">
          <DialogHeader>
            <div className="w-12 h-12 bg-amber-100 text-amber-500 rounded-full flex items-center justify-center mb-4 mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>
            <DialogTitle className="text-xl font-black text-center text-slate-900">
              Confirmação de Dados
            </DialogTitle>
            <DialogDescription className="text-sm font-medium text-slate-500 text-center mt-2">
              Você está prestes a enviar sua sala para nossa curadoria. Tem
              certeza que os dados estão corretos?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="mt-6 flex flex-row gap-3">
            <Button
              variant="outline"
              onClick={() => setConfirmSaveModal(false)}
              className="flex-1 h-12 rounded-xl font-bold border-slate-200 text-slate-600"
            >
              Voltar
            </Button>
            <Button
              onClick={executeSave}
              className="flex-1 h-12 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold shadow-md"
            >
              Sim, Enviar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
