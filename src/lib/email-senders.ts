export interface KnownSender {
  email: string;
  name: string;
  category: string;
  hasAttachment?: boolean;
  pdfPasswordEnvVar?: string;
}

export const KNOWN_SENDERS: KnownSender[] = [
  // Servicios
  {
    email: "noresponder@facturas.edesur.com.ar",
    name: "Edesur",
    category: "Luz",
  },
  {
    email: "avisos@aysadigital.com.ar",
    name: "Aysa",
    category: "Agua",
  },
  {
    email: "no-reply@metrogas.com.ar",
    name: "Metrogas",
    category: "Gas",
  },
  {
    email: "difusion@quilmes.gov.ar",
    name: "Municipalidad Quilmes",
    category: "Impuestos",
  },
  // Tarjetas
  {
    email: "mensajesyavisos@mails.santander.com.ar",
    name: "Santander",
    category: "Visa",
  },
  {
    email: "eresumen@icbc.com.ar",
    name: "ICBC",
    category: "Visa",
    hasAttachment: true,
  },
  {
    email: "tarjetasupervielle@e-resumen.com",
    name: "Supervielle",
    category: "Visa",
  },
  {
    email: "NAVI@mailing.bna.com.ar",
    name: "Banco Nación",
    category: "Visa",
    hasAttachment: true,
    pdfPasswordEnvVar: "BNA_PDF_PASSWORD",
  },
  // Suscripciones
  {
    email: "no_reply@email.apple.com",
    name: "Apple iCloud+",
    category: "Otras suscripciones",
  },
];

// Keywords para buscar en asuntos de emails de remitentes desconocidos
export const SUBJECT_KEYWORDS: string[] = [
  "factura",
  "consumo",
  "pago",
  "vencimiento",
  "resumen",
  "cobro",
  "boleta",
  "débito automático",
  "cuota",
];
