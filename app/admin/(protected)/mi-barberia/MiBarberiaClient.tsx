"use client";

import { useState } from "react";
import ServiciosClient from "../servicios/ServiciosClient";
import ProductosClient from "../productos/ProductosClient";
import ProfesionalesClient from "../profesionales/ProfesionalesClient";

interface Servicio {
  id: string;
  nombre: string;
  descripcion: string | null;
  duracion_minutos: number;
  precio_centimos: number;
  categoria: string | null;
  orden: number;
  activo: boolean;
  color?: string | null;
}
interface Producto {
  id: string;
  nombre: string;
  categoria: string | null;
  precio_centimos: number;
  orden: number;
  activo: boolean;
}
interface Sede {
  id: string;
  nombre: string;
}
interface ServicioEquipo {
  id: string;
  nombre: string;
  categoria: string | null;
}

type Pestana = "servicios" | "productos" | "equipo";

/**
 * "Mi barbería": agrupa lo que antes eran tres pestañas sueltas del menú
 * (Servicios, Productos, Equipo) en una sola, con sus propias pestañas
 * internas — Diego pidió un menú más minimalista. "Equipo" solo se
 * ofrece a rol "admin" (una cuenta de equipo no debe entrar ahí, ver
 * requireRolAdmin en lib/adminAuth.ts); si esAdmin es false directamente
 * no se le pasan sus datos ni se pinta la pestaña.
 *
 * Los tres componentes de dentro son justo los mismos que ya existían
 * en /admin/servicios, /admin/productos y /admin/profesionales (esas
 * rutas se dejan tal cual por si hay algún enlace guardado, pero ya no
 * están en el menú) — aquí solo se reutilizan con sus mismos props.
 */
export default function MiBarberiaClient({
  servicios,
  productos,
  esAdmin,
  sedesEquipo,
  serviciosEquipo,
}: {
  servicios: Servicio[];
  productos: Producto[];
  esAdmin: boolean;
  sedesEquipo: Sede[];
  serviciosEquipo: ServicioEquipo[];
}) {
  const [pestana, setPestana] = useState<Pestana>("servicios");

  const pestanas: { id: Pestana; label: string }[] = [
    { id: "servicios", label: "Servicios" },
    { id: "productos", label: "Productos" },
    ...(esAdmin ? [{ id: "equipo" as Pestana, label: "Equipo" }] : []),
  ];

  return (
    <div className="space-y-4">
      <div className="flex w-fit gap-1 rounded-lg border border-stone-300 p-1">
        {pestanas.map((p) => (
          <button
            key={p.id}
            onClick={() => setPestana(p.id)}
            className={
              "rounded-md px-3 py-1.5 text-sm " +
              (pestana === p.id ? "bg-stone-900 text-white" : "text-stone-600 hover:text-stone-900")
            }
          >
            {p.label}
          </button>
        ))}
      </div>

      {pestana === "servicios" && <ServiciosClient servicios={servicios} />}
      {pestana === "productos" && <ProductosClient productos={productos} />}
      {pestana === "equipo" && esAdmin && <ProfesionalesClient sedes={sedesEquipo} servicios={serviciosEquipo} />}
    </div>
  );
}
