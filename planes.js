/*
  Base de datos de planes. Edita este archivo para agregar, quitar o corregir planes.
  Se actualizó con búsqueda web el 2026-10-29 (fuentes: medellin.travel, Tuboleta,
  La Tiquetera, Eventario). Verifica horarios y precios en el enlace de cada plan.

  Campos:
    id           texto único
    titulo       nombre del plan
    categoria    "fiesta" | "aire-libre" | "comida-cultura"
    tipo         "evento" (tiene fechas) | "permanente" (siempre disponible)
    inicio, fin  "AAAA-MM-DD" (solo eventos; fin puede omitirse si es de un solo día)
    hora         texto libre, opcional ("Desde las 8 pm")
    lugar        sitio
    zona         barrio o zona, para el filtro
    descripcion  1-2 frases
    precio       "gratis" | "barato" | "medio" | "alto" | "consultar"
    precioTexto  detalle del precio, opcional
    con          con quién: "pareja" | "amigos" | "familia" | "solo"
    url          enlace a la fuente o al sitio oficial
*/

const maps = (q) => "https://www.google.com/maps/search/?api=1&query=" + encodeURIComponent(q + " Medellín");

window.CIUDAD = "Medellín";
window.ACTUALIZADO = "2026-10-29";

window.PLANES = [
  // ───────── EVENTOS ─────────
  {
    id: "una-noche-en-el-palacio",
    titulo: "Una noche en el Palacio",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-10-29",
    lugar: "Palacio de la Cultura Rafael Uribe Uribe",
    zona: "Centro",
    descripcion: "Recorre el Palacio de noche y visita lugares que de día están restringidos al público.",
    precio: "consultar",
    con: ["pareja", "amigos", "solo"],
    url: "https://www.medellin.travel/caleventos/una-noche-en-el-palacio-1123/?lang=en"
  },
  {
    id: "tertulias-musicales",
    titulo: "Tertulias Musicales",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-10-29",
    lugar: "Palacio de la Cultura Rafael Uribe Uribe",
    zona: "Centro",
    descripcion: "Escucha grabaciones emblemáticas del siglo XX y conversa sobre la historia de la música en Colombia.",
    precio: "consultar",
    con: ["amigos", "solo"],
    url: "https://www.medellin.travel/caleventos/tertulias-musicales-1122/?lang=en"
  },
  {
    id: "navegacion-universo",
    titulo: "Navegación por el universo con Orquesta Corales Reinos Solares",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-10-29",
    lugar: "Parque de los Deseos",
    zona: "Centro",
    descripcion: "Propuesta cultural de música y astronomía en el Parque de los Deseos.",
    precio: "consultar",
    con: ["familia", "pareja", "amigos"],
    url: "https://eventario.co/events/navegacion-por-el-universo-con-orquesta-corales-reinos-solares/"
  },
  {
    id: "salsa-sabor-parche-latino",
    titulo: "Noche de salsa y sabor – Parche Latino",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-10-30",
    lugar: "Bololoi MDE",
    zona: "Medellín",
    descripcion: "Noche de salsa para bailar con amigos o en pareja.",
    precio: "consultar",
    con: ["pareja", "amigos"],
    url: "https://eventario.co/events/noche-de-salsa-y-sabor-parche-latino-3/"
  },
  {
    id: "porro-o-miedo",
    titulo: "¿Porro o miedo? Especial bailable de Noche de Brujas",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-10-30",
    lugar: "La Pascasia",
    zona: "Centro",
    descripcion: "Fiesta de disfraces con la Orquesta La Pascasia: porro, música en vivo y mucho baile.",
    precio: "consultar",
    con: ["amigos", "pareja"],
    url: "https://www.medellin.travel/caleventos/porro-o-miedo-el-porro-es-legal-especial-bailable-de-noche-de-brujas-1128/?lang=en"
  },
  {
    id: "frankenstein",
    titulo: "Frankenstein: La herencia oscura",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-10-30",
    fin: "2026-10-31",
    lugar: "CasaTeatro El Poblado",
    zona: "El Poblado",
    descripcion: "Reinterpretación teatral del clásico de Mary Shelley, perfecta para el fin de semana de Halloween.",
    precio: "consultar",
    con: ["pareja", "amigos", "solo"],
    url: "https://www.medellin.travel/caleventos/frankenstein-la-herencia-oscura-1129/?lang=en"
  },
  {
    id: "ritvales-2026",
    titulo: "RITVALES 2026",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-10-31",
    fin: "2026-11-01",
    lugar: "Parque Norte",
    zona: "Norte",
    descripcion: "El festival de música electrónica al aire libre más grande de Colombia: house, techno y progressive durante dos noches.",
    precio: "alto",
    precioTexto: "Entradas por Tuboleta",
    con: ["amigos", "pareja"],
    url: "https://www.medellin.travel/caleventos/ritvales-2026-263/?lang=en"
  },
  {
    id: "funkoween-favela",
    titulo: "El Funkoween Favela Party",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-10-31",
    lugar: "La Favela, Comuna 13",
    zona: "Comuna 13",
    descripcion: "Fiesta de Halloween con funk brasileño y reggaetón: música en vivo de Lenexx y Franquinho, DJ sets, comida, bar y premios al mejor disfraz.",
    precio: "consultar",
    con: ["amigos", "pareja"],
    url: "https://www.medellin.travel/caleventos/el-funkoween-favela-party-1124/?lang=en"
  },
  {
    id: "14-canonazos-fest",
    titulo: "14 Cañonazos Fest",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-10-31",
    lugar: "Jardín Botánico de Medellín",
    zona: "Centro",
    descripcion: "Noche de música tropical y colombiana organizada por Discos Fuentes, con bandas del sello y el público eligiendo al ganador.",
    precio: "consultar",
    con: ["amigos", "pareja", "familia"],
    url: "https://www.medellin.travel/caleventos/14-canonazos-fest-1067/?lang=en"
  },
  {
    id: "dance-now-america",
    titulo: "Dance Now America Tour",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-10-31",
    lugar: "Diamante de Béisbol",
    zona: "Medellín",
    descripcion: "Noche de eurodance de los 90 con voces originales como Haddaway, Real McCoy, No Mercy y Technotronic.",
    precio: "alto",
    con: ["amigos", "pareja"],
    url: "https://www.medellin.travel/caleventos/dance-now-america-tour-1058/?lang=en"
  },
  {
    id: "halloween-ochentera",
    titulo: "Halloween Fiesta Ochentera",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-10-31",
    lugar: "Cra. 35 #7-75",
    zona: "El Poblado",
    descripcion: "Fiesta de Halloween con música de los 80.",
    precio: "consultar",
    con: ["amigos"],
    url: "https://eventario.co/events/halloween-fiesta-ochentera/"
  },
  {
    id: "halloween-sinfonico",
    titulo: "Halloween Sinfónico: Fiesta de las galaxias",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-10-31",
    lugar: "Ver sede en La Tiquetera",
    zona: "Medellín",
    descripcion: "Concierto didáctico para celebrar Halloween en familia.",
    precio: "consultar",
    con: ["familia"],
    url: "https://latiquetera.com/event/halloween-sinfonico-fiesta-de-las-galaxias"
  },
  {
    id: "festival-teatro-comfama",
    titulo: "Festival de Teatro Comfama San Ignacio",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-10-31",
    fin: "2026-11-07",
    lugar: "Comfama San Ignacio",
    zona: "Centro",
    descripcion: "Varias funciones: El mago de oz, La tercera mitad, Cariño Malo, Murmuria, Todos somos Poe y Loba. Revisa el día de cada obra.",
    precio: "consultar",
    con: ["pareja", "familia", "amigos"],
    url: "https://latiquetera.com/events/search?search=medellin"
  },
  {
    id: "ponte-salsa-familia",
    titulo: "Ponte Salsa en Familia",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-11-01",
    fin: "2026-11-22",
    hora: "Domingos, 3 a 5 pm",
    lugar: "Claustro Comfama, Patio Teatro",
    zona: "Centro",
    descripcion: "Pista de baile salsera dominical con la Orquesta Idiosincrasia en vivo, para todas las edades.",
    precio: "gratis",
    precioTexto: "Gratis con inscripción previa, válida para toda la temporada. Ingreso por orden de llegada.",
    con: ["familia", "pareja", "amigos"],
    url: "https://www.medellin.travel/caleventos/ponte-salsa-en-familia-2026-1019/?lang=en"
  },
  {
    id: "itinerancia-biff",
    titulo: "Itinerancia BIFF 2026",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-10-24",
    fin: "2026-11-02",
    lugar: "MAMM – Museo de Arte Moderno de Medellín",
    zona: "Ciudad del Río",
    descripcion: "Muestra de cine en el Museo de Arte Moderno de Medellín.",
    precio: "consultar",
    con: ["pareja", "amigos", "solo"],
    url: "https://eventario.co/events/itinerancia-biff-2026/"
  },
  {
    id: "miradas-medellin",
    titulo: "Festival Miradas Medellín",
    categoria: "comida-cultura",
    tipo: "evento",
    inicio: "2026-11-03",
    fin: "2026-11-08",
    lugar: "Diferentes lugares de Medellín",
    zona: "Medellín",
    descripcion: "Festival de cine y artes audiovisuales con talento local e internacional.",
    precio: "consultar",
    con: ["amigos", "pareja", "solo"],
    url: "https://www.medellin.travel/caleventos/festival-miradas-medellin-568/?lang=en"
  },
  {
    id: "chayanne",
    titulo: "Chayanne – Bailemos Otra Vez Tour",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-11-19",
    lugar: "DAVIarena",
    zona: "Medellín",
    descripcion: "Concierto con clásicos como Torero, Un siglo sin ti, Salomé y Lola.",
    precio: "alto",
    con: ["pareja", "familia", "amigos"],
    url: "https://www.medellin.travel/caleventos/chayanne-bailemos-otra-vez-tour-1051/?lang=en"
  },
  {
    id: "kris-r",
    titulo: "Kris R – El Trap de Kolombia",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-11-20",
    lugar: "DAVIarena",
    zona: "Medellín",
    descripcion: "Concierto de gran formato del trap hecho en Medellín.",
    precio: "alto",
    con: ["amigos"],
    url: "https://www.medellin.travel/caleventos/kris-r-el-trap-de-kolombia-1007/?lang=en"
  },
  {
    id: "ruben-blades",
    titulo: "Rubén Blades – Fotografías Tour",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-11-21",
    lugar: "DAVIarena",
    zona: "Medellín",
    descripcion: "Noche de salsa, memoria y poesía con la Roberto Delgado Big Band.",
    precio: "alto",
    con: ["pareja", "amigos", "familia"],
    url: "https://www.medellin.travel/caleventos/ruben-blades-fotografias-tour-1008/?lang=en"
  },
  {
    id: "anuel-aa",
    titulo: "Anuel AA – Real Hasta la Muerte Tour 2026",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-11-22",
    lugar: "DAVIarena",
    zona: "Medellín",
    descripcion: "Trap latino y reggaetón con sus grandes éxitos y adelantos de Real Hasta la Muerte 2.",
    precio: "alto",
    con: ["amigos"],
    url: "https://www.medellin.travel/caleventos/anuel-aa-real-hasta-la-muerte-tour-2026-1087/?lang=en"
  },
  {
    id: "patio-de-baile-milonga",
    titulo: "Patio de Baile: La Milonga",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-11-27",
    lugar: "Patio de Baile",
    zona: "Medellín",
    descripcion: "Noche de milonga (tango) en Patio de Baile.",
    precio: "medio",
    precioTexto: "Desde COP $75.800",
    con: ["pareja", "amigos"],
    url: "https://latiquetera.com/site/patio-de-baile/events/view/patio-de-baile-la-milonga-noviembre-2026"
  },
  {
    id: "beele",
    titulo: "Beéle – Borondo Tour 2026",
    categoria: "fiesta",
    tipo: "evento",
    inicio: "2026-11-28",
    lugar: "DAVIarena",
    zona: "Medellín",
    descripcion: "Afrobeat, reguetón y sonidos caribeños con éxitos como Loco, Santorini y Vagabundo.",
    precio: "alto",
    con: ["amigos", "pareja"],
    url: "https://www.medellin.travel/caleventos/beele-borondo-tour-2026-1050/?lang=en"
  },

  // ───────── PLANES DE SIEMPRE ─────────
  {
    id: "parque-arvi",
    titulo: "Parque Arví",
    categoria: "aire-libre",
    tipo: "permanente",
    lugar: "Parque Arví",
    zona: "Santa Elena",
    descripcion: "Parque natural con senderos, bosque y actividades de aventura, al que se llega en Metrocable.",
    precio: "consultar",
    precioTexto: "Revisa tarifas del Metrocable y de las actividades.",
    con: ["familia", "pareja", "amigos"],
    url: "https://parquearvi.org/"
  },
  {
    id: "cerro-tres-cruces",
    titulo: "Cerro Tres Cruces",
    categoria: "aire-libre",
    tipo: "permanente",
    lugar: "Cerro Tres Cruces, Belén",
    zona: "Belén",
    descripcion: "Caminata con vista de la ciudad. Aparece entre las rutas mejor valoradas de Medellín en AllTrails.",
    precio: "gratis",
    con: ["amigos", "pareja", "familia", "solo"],
    url: "https://www.alltrails.com/es/colombia/antioquia/medellin"
  },
  {
    id: "jardin-botanico",
    titulo: "Jardín Botánico de Medellín",
    categoria: "aire-libre",
    tipo: "permanente",
    lugar: "Jardín Botánico",
    zona: "Centro",
    descripcion: "Un respiro verde en el norte del centro: jardines, orquideorama y zonas para caminar y descansar.",
    precio: "gratis",
    con: ["familia", "pareja", "amigos", "solo"],
    url: "https://botanicomedellin.org/"
  },
  {
    id: "ciclovia",
    titulo: "Ciclovía de Medellín",
    categoria: "aire-libre",
    tipo: "permanente",
    hora: "Domingos y festivos, mañana",
    lugar: "Vías habilitadas de la ciudad",
    zona: "Varias",
    descripcion: "Las vías se cierran a los carros para caminar, trotar o montar bicicleta en familia.",
    precio: "gratis",
    con: ["familia", "amigos", "solo", "pareja"],
    url: maps("Ciclovía")
  },
  {
    id: "pueblito-paisa",
    titulo: "Cerro Nutibara y Pueblito Paisa",
    categoria: "aire-libre",
    tipo: "permanente",
    lugar: "Cerro Nutibara",
    zona: "Guayabal",
    descripcion: "Mirador con réplica de un pueblo antioqueño tradicional y buena vista de la ciudad, sobre todo al atardecer.",
    precio: "gratis",
    con: ["pareja", "familia", "amigos"],
    url: maps("Pueblito Paisa Cerro Nutibara")
  },
  {
    id: "comuna-13",
    titulo: "Comuna 13: grafitis y escaleras eléctricas",
    categoria: "comida-cultura",
    tipo: "permanente",
    lugar: "Comuna 13",
    zona: "Comuna 13",
    descripcion: "Recorrido por el arte urbano y las escaleras eléctricas del barrio. Se puede ir por cuenta propia o con guía local.",
    precio: "gratis",
    precioTexto: "Caminar es gratis; los tours guiados tienen costo.",
    con: ["amigos", "pareja", "familia", "solo"],
    url: maps("Comuna 13 escaleras eléctricas")
  },
  {
    id: "plaza-botero",
    titulo: "Plaza Botero y Museo de Antioquia",
    categoria: "comida-cultura",
    tipo: "permanente",
    lugar: "Plaza Botero",
    zona: "Centro",
    descripcion: "Esculturas de Fernando Botero al aire libre, frente al Museo de Antioquia y el Palacio de la Cultura.",
    precio: "gratis",
    precioTexto: "La plaza es gratis. El museo tiene entrada.",
    con: ["pareja", "familia", "amigos", "solo"],
    url: "https://www.museodeantioquia.co/"
  },
  {
    id: "mamm",
    titulo: "MAMM – Museo de Arte Moderno de Medellín",
    categoria: "comida-cultura",
    tipo: "permanente",
    lugar: "MAMM",
    zona: "Ciudad del Río",
    descripcion: "Museo de arte moderno y contemporáneo, ideal para una mañana tranquila.",
    precio: "consultar",
    con: ["pareja", "amigos", "solo"],
    url: "https://elmamm.org/"
  },
  {
    id: "parque-explora",
    titulo: "Parque Explora",
    categoria: "comida-cultura",
    tipo: "permanente",
    lugar: "Parque Explora",
    zona: "Centro",
    descripcion: "Museo interactivo de ciencia y tecnología, pensado para ir en familia.",
    precio: "consultar",
    con: ["familia", "amigos"],
    url: "https://www.parqueexplora.org/"
  },
  {
    id: "mercado-del-rio",
    titulo: "Mercado del Río",
    categoria: "comida-cultura",
    tipo: "permanente",
    lugar: "Mercado del Río",
    zona: "Ciudad del Río",
    descripcion: "Mercado gastronómico con muchas opciones de comida en un solo lugar, bueno cuando el grupo no se pone de acuerdo.",
    precio: "medio",
    con: ["amigos", "pareja", "familia"],
    url: maps("Mercado del Río")
  },
  {
    id: "parque-lleras-provenza",
    titulo: "Salir de rumba: Parque Lleras y Provenza",
    categoria: "fiesta",
    tipo: "permanente",
    hora: "Noches, sobre todo jueves a sábado",
    lugar: "Parque Lleras y Provenza",
    zona: "El Poblado",
    descripcion: "La zona de bares, discotecas y restaurantes más concurrida de Medellín.",
    precio: "medio",
    con: ["amigos", "pareja"],
    url: maps("Parque Lleras Provenza")
  },
  {
    id: "la-70-laureles",
    titulo: "La 70 en Laureles",
    categoria: "fiesta",
    tipo: "permanente",
    hora: "Noches",
    lugar: "Calle 70, Laureles",
    zona: "Laureles",
    descripcion: "Calle de bares y música con ambiente más local que El Poblado.",
    precio: "medio",
    con: ["amigos", "pareja"],
    url: maps("Calle 70 Laureles")
  },
  {
    id: "guatape-penol",
    titulo: "Día en Guatapé y Piedra del Peñol",
    categoria: "aire-libre",
    tipo: "permanente",
    lugar: "Guatapé",
    zona: "Fuera de la ciudad",
    descripcion: "Excursión de un día a un pueblo colorido y a un mirador sobre el embalse. Sale temprano desde la ciudad.",
    precio: "medio",
    precioTexto: "Transporte y entrada a la piedra aparte.",
    con: ["amigos", "pareja", "familia"],
    url: maps("Guatapé Piedra del Peñol")
  }
];
