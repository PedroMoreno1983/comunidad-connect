// QA en vivo: las ofertas deben llegar desde el scraper hasta la canasta.
import { describe, it, expect } from "vitest";
import { searchAllRetailerProducts, parseACuentaProducts } from "@/lib/supermarketLive";

describe("ofertas de supermercado", () => {
    it("aCuenta: promoción activa baja el precio y marca la oferta", () => {
        // Estructura real verificada el 2026-10-07: price=regular, promotion.conditions[0].price=oferta
        const html = String.raw`{\"product\":{\"name\":\"Detergente En Polvo 2,7 kg Ariel\",\"price\":12590,\"photosUrl\":[],\"sku\":\"111\",\"ean\":[],\"slug\":\"det-ariel\",\"brand\":\"Ariel\",\"stock\":5,\"promotion\":{\"type\":\"specialPrice\",\"isActive\":true,\"conditions\":[{\"quantity\":0,\"price\":6990,\"__typename\":\"PromotionCondition\"}],\"__typename\":\"Promotion\"},\"taxes\":[]}}`;
        const items = parseACuentaProducts(html, "detergente");
        expect(items.length).toBe(1);
        expect(items[0].price).toBe(6990);
        expect(items[0].originalPrice).toBe(12590);
        expect(items[0].isOffer).toBe(true);
    });

    it("aCuenta: promoción con mínimo de cantidad NO se aplica como precio unitario", () => {
        const html = String.raw`{\"product\":{\"name\":\"Caldo en Polvo 32 g Maggi\",\"price\":660,\"photosUrl\":[],\"sku\":\"222\",\"ean\":[],\"slug\":\"caldo\",\"brand\":\"Maggi\",\"stock\":9,\"promotion\":{\"type\":\"specialPrice\",\"isActive\":true,\"conditions\":[{\"quantity\":2,\"price\":1000,\"__typename\":\"PromotionCondition\"}],\"__typename\":\"Promotion\"},\"taxes\":[]}}`;
        const items = parseACuentaProducts(html, "caldo");
        expect(items.length).toBe(1);
        expect(items[0].price).toBe(660);
        expect(items[0].isOffer).toBe(false);
    });

    it("aCuenta en vivo: detergente trae productos con oferta", async () => {
        const items = await searchAllRetailerProducts("aCuenta", "detergente");
        const offers = items.filter(i => i.isOffer && i.originalPrice && i.originalPrice > i.price);
        console.log(`aCuenta detergente: ${items.length} productos, ${offers.length} en oferta`);
        console.log(offers.slice(0, 3).map(i => `${i.name} — $${i.price} (antes $${i.originalPrice})`).join("\n"));
        expect(items.length).toBeGreaterThan(0);
        expect(offers.length).toBeGreaterThan(0);
    }, 30_000);

    it("Lider en vivo: arroz trae productos con wasPrice como oferta", async () => {
        const items = await searchAllRetailerProducts("Lider", "arroz");
        const offers = items.filter(i => i.isOffer && i.originalPrice && i.originalPrice > i.price);
        console.log(`Lider arroz: ${items.length} productos, ${offers.length} en oferta`);
        console.log(offers.slice(0, 3).map(i => `${i.name} — $${i.price} (antes $${i.originalPrice})`).join("\n"));
        expect(items.length).toBeGreaterThan(0);
        expect(offers.length).toBeGreaterThan(0);
    }, 30_000);
});
