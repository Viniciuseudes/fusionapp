export const userProfile = {
  name: "Ewrion",
  location: "São Paulo, SP",
  balance: 9.0,
  notifications: 2,
}

export type RentalType = "hora" | "turno" | "fixo"

export type RoomCategory = "Reunião" | "Coworking" | "Escritório" | "Consultório" | "Estúdio"

export interface Room {
  id: number
  name: string
  category: RoomCategory
  image: string
  pricePerHour: number
  rating: number
  reviews: number
  distance: string
  address: string
  capacity: number
  description: string
  amenities: { icon: string; label: string }[]
  available: boolean
  favorited: boolean
}

export const rooms: Room[] = [
  {
    id: 1,
    name: "Sala de Reunião Premium",
    category: "Reunião",
    image: "/images/room-reuniao.jpg",
    pricePerHour: 45,
    rating: 4.8,
    reviews: 124,
    distance: "0.8 km",
    address: "Av. Paulista, 1000 - São Paulo, SP",
    capacity: 12,
    description: "Sala de reunião equipada com projetor, lousa interativa e sistema de videoconferência. Ideal para apresentações e reuniões corporativas.",
    amenities: [
      { icon: "wifi", label: "Wi-Fi de alta velocidade" },
      { icon: "coffee", label: "Café ilimitado" },
      { icon: "monitor", label: "Projetor 4K" },
      { icon: "wind", label: "Ar-condicionado" },
    ],
    available: true,
    favorited: false,
  },
  {
    id: 2,
    name: "Coworking Moderno",
    category: "Coworking",
    image: "/images/room-coworking.jpg",
    pricePerHour: 30,
    rating: 4.9,
    reviews: 256,
    distance: "1.2 km",
    address: "Rua Augusta, 500 - São Paulo, SP",
    capacity: 20,
    description: "Espaço de coworking com ambiente inspirador e colaborativo. Perfeito para freelancers e pequenas equipes.",
    amenities: [
      { icon: "wifi", label: "Wi-Fi de alta velocidade" },
      { icon: "coffee", label: "Café ilimitado" },
      { icon: "printer", label: "Impressora" },
      { icon: "lock", label: "Armário pessoal" },
    ],
    available: true,
    favorited: true,
  },
  {
    id: 3,
    name: "Escritório Privativo",
    category: "Escritório",
    image: "/images/room-escritorio.jpg",
    pricePerHour: 25,
    rating: 4.7,
    reviews: 89,
    distance: "1.5 km",
    address: "Rua Frei Caneca, 300 - São Paulo, SP",
    capacity: 4,
    description: "Escritório privativo com isolamento acústico e mobiliário ergonômico. Perfeito para trabalho focado.",
    amenities: [
      { icon: "wifi", label: "Wi-Fi de alta velocidade" },
      { icon: "wind", label: "Ar-condicionado" },
      { icon: "monitor", label: "Monitor extra" },
      { icon: "lock", label: "Acesso 24h" },
    ],
    available: true,
    favorited: false,
  },
  {
    id: 4,
    name: "Consultório Equipado",
    category: "Consultório",
    image: "/images/room-consultorio.jpg",
    pricePerHour: 55,
    rating: 4.6,
    reviews: 67,
    distance: "2.0 km",
    address: "Rua Oscar Freire, 800 - São Paulo, SP",
    capacity: 3,
    description: "Consultório completo com macas, equipamentos e recepção compartilhada. Ideal para profissionais da saúde.",
    amenities: [
      { icon: "wifi", label: "Wi-Fi de alta velocidade" },
      { icon: "wind", label: "Ar-condicionado" },
      { icon: "shield", label: "Recepção" },
      { icon: "coffee", label: "Água e café" },
    ],
    available: true,
    favorited: false,
  },
  {
    id: 5,
    name: "Estúdio Criativo",
    category: "Estúdio",
    image: "/images/room-studio.jpg",
    pricePerHour: 35,
    rating: 4.8,
    reviews: 142,
    distance: "0.5 km",
    address: "Rua da Consolação, 200 - São Paulo, SP",
    capacity: 8,
    description: "Estúdio amplo com pé direito alto e iluminação natural. Perfeito para workshops e sessões criativas.",
    amenities: [
      { icon: "wifi", label: "Wi-Fi de alta velocidade" },
      { icon: "coffee", label: "Café ilimitado" },
      { icon: "monitor", label: "Smart TV" },
      { icon: "wind", label: "Ar-condicionado" },
    ],
    available: true,
    favorited: true,
  },
  {
    id: 6,
    name: "Sala Executiva",
    category: "Reunião",
    image: "/images/room-1.jpg",
    pricePerHour: 60,
    rating: 4.9,
    reviews: 98,
    distance: "3.0 km",
    address: "Av. Brigadeiro Faria Lima, 1500 - São Paulo, SP",
    capacity: 8,
    description: "Sala executiva de alto padrão com vista panorâmica. Mobiliário premium e serviço de copa.",
    amenities: [
      { icon: "wifi", label: "Wi-Fi de alta velocidade" },
      { icon: "coffee", label: "Serviço de copa" },
      { icon: "monitor", label: "Videoconferência" },
      { icon: "lock", label: "Estacionamento" },
    ],
    available: true,
    favorited: false,
  },
]

export const upcomingBookings = [
  {
    id: 1,
    room: "Coworking Moderno",
    date: "28 Fev",
    time: "09:00 - 12:00",
    status: "confirmada" as const,
  },
  {
    id: 2,
    room: "Sala de Reunião Premium",
    date: "02 Mar",
    time: "14:00 - 16:00",
    status: "pendente" as const,
  },
]

export const availableTimeSlots = [
  "08:00", "09:00", "10:00", "11:00",
  "13:00", "14:00", "15:00", "16:00", "17:00",
]
