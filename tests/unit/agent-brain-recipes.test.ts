// QA exploratorio: comportamiento del SupermarketAgent (agentBrain) de forma aislada.
// Nota: este agente hoy no está montado en ninguna ruta (WhatsAppChat no se importa).
import { describe, it, expect } from "vitest";
import { SupermarketAgent } from "@/lib/agentBrain";

describe("SupermarketAgent (lógica de recetas)", () => {
    it("sugiere una receta cuando calzan ingredientes", async () => {
        const agent = new SupermarketAgent();
        const res = await agent.processMessage("tengo arroz y cebolla");
        console.log("IN: tengo arroz y cebolla");
        console.log("OUT:", res.message);
        console.log("RECIPE:", res.recipeSuggestion?.recipe.name);
        console.log("MISSING:", res.recipeSuggestion?.missingIngredients.map(m => m.name).join(", "));
        expect(res.recipeSuggestion).toBeDefined();
    });

    it("informa cuando no hay receta posible", async () => {
        const agent = new SupermarketAgent();
        const res = await agent.processMessage("tengo quinoa y tofu");
        console.log("IN: tengo quinoa y tofu");
        console.log("OUT:", res.message);
        expect(res.recipeSuggestion).toBeUndefined();
        expect(res.message).toContain("No se me ocurre ninguna receta");
    });

    it("documenta qué receta elige con tomate, cebolla y limón", async () => {
        const agent = new SupermarketAgent();
        const res = await agent.processMessage("tengo tomate, cebolla y limón");
        console.log("IN: tengo tomate, cebolla y limón");
        console.log("RECIPE:", res.recipeSuggestion?.recipe.name);
        expect(res.recipeSuggestion).toBeDefined();
    });

    it("intención de cocinar con pollo y limón", async () => {
        const agent = new SupermarketAgent();
        const res = await agent.processMessage("quiero cocinar con pollo y limón");
        console.log("IN: quiero cocinar con pollo y limón");
        console.log("RECIPE:", res.recipeSuggestion?.recipe.name);
        expect(res.recipeSuggestion).toBeDefined();
    });

    it("borrar vacía el carrito", async () => {
        const agent = new SupermarketAgent();
        const res = await agent.processMessage("borrar todo");
        console.log("IN: borrar todo");
        console.log("OUT:", res.message);
        expect(res.message).toContain("He vaciado tu carrito");
    });
});
