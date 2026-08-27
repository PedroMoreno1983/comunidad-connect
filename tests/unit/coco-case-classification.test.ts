import { describe, expect, it } from "vitest";
import { classifyCoCoMessage } from "@/lib/coco/caseService";

describe("classifyCoCoMessage", () => {
    it("classifies a plain billing question as finanzas and does not create a case", () => {
        // Regression test: "gastos comunes" (plural) previously failed to match the
        // singular "gasto comun" keyword, and "debo" wasn't a keyword at all, so this
        // exact phrasing fell through to the generic incident bucket and opened a
        // spurious case for a simple informational question.
        const decision = classifyCoCoMessage("¿Cuánto debo de gastos comunes?");
        expect(decision.category).toBe("finanzas");
        expect(decision.shouldCreateCase).toBe(false);
    });

    it("classifies a plumbing leak report as plomeria and creates a case", () => {
        const decision = classifyCoCoMessage("Tengo una filtración de agua bajo el lavaplatos de mi cocina");
        expect(decision.category).toBe("plomeria");
        expect(decision.shouldCreateCase).toBe(true);
    });

    it("flags an active leak as an emergency with the highest urgency", () => {
        const decision = classifyCoCoMessage("Se está inundando la cocina ahora mismo, el agua no para de salir, urgente");
        expect(decision.urgency).toBe("emergencia");
        expect(decision.action).toBe("protocolo_emergencia");
        expect(decision.shouldCreateCase).toBe(true);
    });

    it("flags a gas smell as an emergency regardless of category keywords", () => {
        const decision = classifyCoCoMessage("Siento olor a gas en el pasillo del tercer piso");
        expect(decision.urgency).toBe("emergencia");
        expect(decision.shouldCreateCase).toBe(true);
    });

    it("does not create a case for a plain greeting", () => {
        const decision = classifyCoCoMessage("Hola");
        expect(decision.shouldCreateCase).toBe(false);
    });

    it("classifies a reservation question as areas_comunes and does not create a case", () => {
        const decision = classifyCoCoMessage("Quiero reservar el quincho el sábado de 15 a 18");
        expect(decision.category).toBe("areas_comunes");
        expect(decision.shouldCreateCase).toBe(false);
    });

    it("does not create a case for an administracion/reglamento question", () => {
        const decision = classifyCoCoMessage("¿Qué dice el reglamento sobre las mascotas?");
        expect(decision.category).toBe("administracion");
        expect(decision.shouldCreateCase).toBe(false);
    });

    it("does not create junk cases for unmatched chit-chat like supermarket help", () => {
        // Regression: "del supermercado me puedes ayudar" fell into the generic
        // incident bucket (category 'otro') and opened a spurious 'Caso CoCo'.
        const decision = classifyCoCoMessage("del supermercado me puedes ayudar");
        expect(decision.category).toBe("otro");
        expect(decision.shouldCreateCase).toBe(false);
    });

    it("treats an admin asking how to do something as a question, not a work request", () => {
        // Regression from a real prospect evaluating the product: the admin branch
        // fired on the bare word "crear" anywhere in the text, so asking *how* to
        // create something opened a spurious 'gestion_admin' case.
        const decision = classifyCoCoMessage(
            "Te escribo ya que me gustaría saber como puedo empezar a crear egresos para armar el gasto común del mes. No logré identificar en qué módulo se realiza.",
            { role: "admin" },
        );
        expect(decision.shouldCreateCase).toBe(false);
        expect(decision.type).not.toBe("gestion_admin");
    });

    it("still opens a case when an admin actually asks for work to be done", () => {
        const decision = classifyCoCoMessage(
            "Crea una reunión de comité para el jueves y asigna la revisión del ascensor",
            { role: "admin" },
        );
        expect(decision.shouldCreateCase).toBe(true);
        expect(decision.type).toBe("gestion_admin");
    });

    it("does not create a case for a parking search", () => {
        // Live regression 2026-08-27: "¿tengo estacionamiento? y hay alguno libre el viernes?"
        // was classified as seguridad (keyword estacionamiento) and auto-opened
        // "Caso CoCo: …" with priority MEDIA without the resident confirming.
        const decision = classifyCoCoMessage(
            "¿tengo estacionamiento? y hay alguno libre el viernes?",
        );
        expect(decision.shouldCreateCase).toBe(false);
        expect(decision.category).not.toBe("seguridad");
    });

    it("still creates a case when the resident explicitly asks to open one", () => {
        const decision = classifyCoCoMessage(
            "Abre un caso: el portón de estacionamiento no cierra",
        );
        expect(decision.shouldCreateCase).toBe(true);
    });
});
