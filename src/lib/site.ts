import { BRAND, SLOGAN } from "./brand";
import { OPERATOR } from "./operator";

/** Public site data for metadata, sitemap and structured data (schema.org). */
export const SITE = {
  url: "https://boxentakt.de",
  name: BRAND,
  tagline: "Online-Termine für Werkstätten",
  description:
    "Eigene Buchungsseite, Kalender fürs Team, Erinnerungen, Anzahlung, Gutscheine und Kartenzahlung per QR-Code. Für Werkstätten: 29 € im Monat, 30 Tage gratis.",
  slogan: SLOGAN,
  keywords: [
    "Online-Terminbuchung Werkstatt",
    "Terminbuchung Werkstatt",
    "Werkstatt Kalender",
    "Buchungssystem Werkstatt",
    "Reifenwechsel Termin online",
    "Online-Termine ohne Provision",
    "Werkstattsoftware",
    "Gutscheine Werkstatt",
  ],
};

const DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export function organizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE.name,
    legalName: OPERATOR.name,
    url: SITE.url,
    logo: `${SITE.url}/icon-512.png`,
    slogan: SITE.slogan,
    email: OPERATOR.email,
    founder: { "@type": "Person", name: OPERATOR.owner },
    address: { "@type": "PostalAddress", streetAddress: "Glücksteinallee 25", postalCode: "68163", addressLocality: "Mannheim", addressCountry: "DE" },
  };
}

export function websiteSchema() {
  return { "@context": "https://schema.org", "@type": "WebSite", name: SITE.name, url: SITE.url, inLanguage: "de-DE", publisher: { "@type": "Organization", name: OPERATOR.name } };
}

export function softwareSchema() {
  const offer = (name: string, price: string, unit: string) => ({
    "@type": "Offer",
    name,
    price,
    priceCurrency: "EUR",
    url: `${SITE.url}/#preise`,
    priceSpecification: { "@type": "UnitPriceSpecification", price, priceCurrency: "EUR", unitCode: unit, valueAddedTaxIncluded: false },
  });
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE.name,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Terminbuchung",
    operatingSystem: "Web, iOS, Android",
    inLanguage: "de-DE",
    description: SITE.description,
    url: SITE.url,
    publisher: { "@type": "Organization", name: OPERATOR.name },
    offers: [offer("Monatlich", "29", "MON"), offer("Jährlich", "290", "ANN")],
  };
}

export function faqSchema(faq: [string, string][]) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faq.map(([q, a]) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}

type SalonInput = {
  slug: string;
  name: string;
  address: string | null;
  phone: string | null;
  logo_url: string | null;
  cover_url: string | null;
  hours: { weekday: number; opens: string; closes: string }[];
  services: { name: string; duration_min: number; price_cents: number }[];
};

/** Booking page of a salon as schema.org HairSalon, with opening hours and the service list. */
export function salonSchema(s: SalonInput) {
  const url = `${SITE.url}/${s.slug}`;
  const image = s.cover_url ?? s.logo_url;
  return {
    "@context": "https://schema.org",
    "@type": "HairSalon",
    "@id": url,
    name: s.name,
    url,
    ...(image ? { image } : {}),
    ...(s.logo_url ? { logo: s.logo_url } : {}),
    ...(s.phone ? { telephone: s.phone } : {}),
    ...(s.address ? { address: { "@type": "PostalAddress", streetAddress: s.address, addressCountry: "DE" } } : {}),
    openingHoursSpecification: s.hours.map((h) => ({ "@type": "OpeningHoursSpecification", dayOfWeek: DAYS[h.weekday], opens: h.opens, closes: h.closes })),
    potentialAction: { "@type": "ReserveAction", target: url, name: "Termin buchen" },
    ...(s.services.length
      ? {
          hasOfferCatalog: {
            "@type": "OfferCatalog",
            name: "Leistungen",
            itemListElement: s.services.map((sv) => ({
              "@type": "Offer",
              price: (sv.price_cents / 100).toFixed(2),
              priceCurrency: "EUR",
              itemOffered: { "@type": "Service", name: sv.name },
            })),
          },
        }
      : {}),
  };
}
