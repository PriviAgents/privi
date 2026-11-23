import {
  siAirbnb,
  siBookingdotcom,
  siDoordash,
  siExpedia,
  siInstacart,
  siKlm,
  siLufthansa,
  siNetflix,
  siPlaystation,
  siShopify,
  siSpotify,
  siStarbucks,
  siSteam,
  siTarget,
  siUber,
  type SimpleIcon,
} from "simple-icons";

/** Merchants reachable through Privi's rails. Shared by the marquee and the orbit. */
export type Brand = { name: string; icon?: SimpleIcon; wordmark?: string; short?: string };

export const BRANDS: Brand[] = [
  { name: "Uber Eats", icon: siUber },
  { name: "DoorDash", icon: siDoordash },
  { name: "Amazon", wordmark: "amazon", short: "a" },
  { name: "Airbnb", icon: siAirbnb },
  { name: "Expedia", icon: siExpedia },
  { name: "Booking.com", icon: siBookingdotcom },
  { name: "Delta", wordmark: "DELTA", short: "DL" },
  { name: "United", wordmark: "UNITED", short: "UA" },
  { name: "Lufthansa", icon: siLufthansa },
  { name: "KLM", icon: siKlm },
  { name: "Instacart", icon: siInstacart },
  { name: "Starbucks", icon: siStarbucks },
  { name: "Target", icon: siTarget },
  { name: "Walmart", wordmark: "Walmart", short: "W" },
  { name: "Shopify", icon: siShopify },
  { name: "Steam", icon: siSteam },
  { name: "PlayStation", icon: siPlaystation },
  { name: "Spotify", icon: siSpotify },
  { name: "Netflix", icon: siNetflix },
];
