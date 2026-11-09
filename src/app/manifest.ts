import type { MetadataRoute } from "next";

/** Installable dashboard app (home screen), required for push notifications on iPhone. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Boxentakt",
    short_name: "Boxentakt",
    description: "Kalender und Online-Terminbuchung für deinen Salon",
    id: "/dashboard",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    lang: "de",
    background_color: "#0b1220",
    theme_color: "#0b1220",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
