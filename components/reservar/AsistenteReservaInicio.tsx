"use client";

import { useRouter } from "next/navigation";
import { AsistenteReserva } from "@/components/reservar/AsistenteReserva";
import type { OpcionPropuestaCita } from "@/lib/asistenteReserva";

// Envoltorio del buscador para la portada (app/page.tsx, pedido por
// Diego 25/09/2026: "en realidad donde quería instalarlo es en la
// página de inicio"). AsistenteReserva es el mismo componente que ya se
// usaba dentro de app/reservar — solo cambia qué se hace al elegir una
// propuesta: aquí no hay ningún estado de BookingFlow que rellenar (es
// otra página), así que se manda la propuesta elegida como parámetro de
// la URL y se navega a /reservar, que la recoge al montar (ver el efecto
// de "propuesta" en BookingFlow.tsx) y salta directamente a "Tus datos"
// — ni un paso de más respecto a elegirla ya dentro de /reservar.
export function AsistenteReservaInicio() {
  const router = useRouter();

  function onElegirOpcion(opcion: OpcionPropuestaCita) {
    router.push(`/reservar?propuesta=${encodeURIComponent(JSON.stringify(opcion))}`);
  }

  return <AsistenteReserva onElegirOpcion={onElegirOpcion} />;
}
