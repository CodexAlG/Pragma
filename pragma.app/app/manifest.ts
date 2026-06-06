import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Pragma — Day Orchestrator",
    short_name: "Pragma",
    description: "Vuelca tu día. Orquesta tu enfoque.",
    start_url: "/hoy",
    display: "standalone",
    background_color: "#0a0e1a",
    theme_color: "#7c6fe0",
    icons: [
      {
        src: "/origami_p_icon.png",
        sizes: "any",
        type: "image/png",
      },
      {
        src: "/icon.png",
        sizes: "any",
        type: "image/png",
      },
      {
        src: "/apple-icon.png",
        sizes: "any",
        type: "image/png",
      },
    ],
  };
}
