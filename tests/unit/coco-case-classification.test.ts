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

    it("classifies a reservation question as areas_comunes and creates a case", () => {
        const decision = classifyCoCoMessage("Quiero reservar el quincho el sábado de 15 a 18");
        expect(decision.category).toBe("areas_comunes");
        expect(decision.shouldCreateCase).toBe(true);
    });

    it("does not create a case for an administracion/reglamento question", () => {
        const decision = classifyCoCoMessage("¿Qué dice el reglamento sobre las mascotas?");
        expect(decision.category).toBe("administracion");
        expect(decision.shouldCreateCase).toBe(false);
    });
});
