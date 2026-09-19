import { describe, expect, it } from "vitest";
import { bonoEstaVigente, bonoEsUtilizable } from "./bonos";

// Estas dos funciones deciden si un bono ya vendido y cobrado se puede
// seguir usando: un fallo aquí significa cobrar dos veces por el mismo
// corte (bono agotado que se sigue admitiendo) o negarle a un cliente un
// uso que ya pagó (bono en vigor que se rechaza por error).
describe("bonoEstaVigente", () => {
  const hoy = new Date("2026-09-19T10:00:00Z");

  it("está vigente si la fecha de caducidad es hoy o más adelante", () => {
    expect(bonoEstaVigente({ fecha_caducidad: "2026-09-19" }, hoy)).toBe(true);
    expect(bonoEstaVigente({ fecha_caducidad: "2026-10-19" }, hoy)).toBe(true);
  });

  it("deja de estar vigente el día siguiente a su caducidad", () => {
    expect(bonoEstaVigente({ fecha_caducidad: "2026-09-18" }, hoy)).toBe(false);
  });
});

describe("bonoEsUtilizable", () => {
  const hoy = new Date("2026-09-19T10:00:00Z");

  it("es utilizable con usos restantes y sin caducar", () => {
    expect(bonoEsUtilizable({ usos_restantes: 3, fecha_caducidad: "2026-10-01" }, hoy)).toBe(true);
  });

  it("no es utilizable sin usos restantes, aunque no haya caducado", () => {
    expect(bonoEsUtilizable({ usos_restantes: 0, fecha_caducidad: "2026-10-01" }, hoy)).toBe(false);
  });

  it("no es utilizable si ha caducado, aunque le queden usos", () => {
    expect(bonoEsUtilizable({ usos_restantes: 2, fecha_caducidad: "2026-09-01" }, hoy)).toBe(false);
  });

  it("un bono agotado Y caducado tampoco es utilizable (no se rompe con ambos a la vez)", () => {
    expect(bonoEsUtilizable({ usos_restantes: 0, fecha_caducidad: "2026-01-01" }, hoy)).toBe(false);
  });
});
