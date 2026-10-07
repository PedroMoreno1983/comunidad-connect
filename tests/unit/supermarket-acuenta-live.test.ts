// QA exploratorio: scraper en vivo de aCuenta (red real, tarda unos segundos).
import { describe, it, expect } from "vitest";
import { searchAllRetailerProducts, parseACuentaProducts } from "@/lib/supermarketLive";

describe("aCuenta live scraper", () => {
    it("el parser extrae productos de HTML embebido escapado", () => {
        const html = String.raw`{\"product\":{\"name\":\"Arroz Grano Largo 1kg\",\"price\":1290,\"photosUrl\":[\"https:\/\/cdn.acuenta.cl\/x.jpg\"],\"sku\":\"12345\",\"ean\":[\"7800001234567\"],\"slug\":\"arroz-grano-largo\",\"brand\":\"aCuenta\",\"stock\":12}}`;
        const items = parseACuentaProducts(html, "arroz");
        console.log("parser sintético:", JSON.stringify(items));
        expect(items.length).toBe(1);
        expect(items[0].name).toContain("Arroz");
        expect(items[0].price).toBe(1290);
        expect(items[0].store).toBe("aCuenta");
    });

    it("busca productos reales en acuenta.cl", async () => {
        const items = await searchAllRetailerProducts("aCuenta", "arroz");
        console.log("aCuenta 'arroz':", items.length, "productos");
        console.log(items.slice(0, 5).map(i => `${i.name} — $${i.price} (${i.brand})`).join("\n"));
        expect(items.length).toBeGreaterThan(0);
        expect(items.every(i => i.store === "aCuenta" && i.price > 0)).toBe(true);
    }, 30_000);

    it("busca un segundo término para descartar casualidad", async () => {
        const items = await searchAllRetailerProducts("aCuenta", "papel higienico");
        console.log("aCuenta 'papel higienico':", items.length, "productos");
        expect(items.length).toBeGreaterThan(0);
    }, 30_000);
});
