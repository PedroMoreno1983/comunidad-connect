import crypto from "crypto";
import { describe, expect, it } from "vitest";
import { verifyTwilioSignature } from "@/lib/security/twilioSignature";

const AUTH_TOKEN = "test-auth-token";
const WEBHOOK_URL = "https://conviveconnect.com/api/coco/whatsapp";

function signFor(url: string, params: Record<string, string>, token = AUTH_TOKEN) {
    const sortedBody = Object.keys(params)
        .sort()
        .map(key => `${key}${params[key]}`)
        .join("");
    return crypto.createHmac("sha1", token).update(url + sortedBody, "utf8").digest("base64");
}

describe("verifyTwilioSignature", () => {
    const params = { Body: "Hola CoCo", WaId: "56911111111", From: "whatsapp:+56911111111" };

    it("accepts a correctly signed request", () => {
        const signature = signFor(WEBHOOK_URL, params);
        expect(verifyTwilioSignature(signature, params, WEBHOOK_URL, AUTH_TOKEN)).toBe(true);
    });

    it("rejects a request with no signature header", () => {
        expect(verifyTwilioSignature(null, params, WEBHOOK_URL, AUTH_TOKEN)).toBe(false);
    });

    it("rejects when the auth token is not configured, even with a well-formed signature", () => {
        const signature = signFor(WEBHOOK_URL, params);
        expect(verifyTwilioSignature(signature, params, WEBHOOK_URL, undefined)).toBe(false);
    });

    it("rejects a signature computed with the wrong auth token (forged request)", () => {
        const forgedSignature = signFor(WEBHOOK_URL, params, "attacker-guessed-token");
        expect(verifyTwilioSignature(forgedSignature, params, WEBHOOK_URL, AUTH_TOKEN)).toBe(false);
    });

    it("rejects a signature computed for a different URL (replay against another endpoint)", () => {
        const signature = signFor("https://conviveconnect.com/api/coco/whatsapp-old", params);
        expect(verifyTwilioSignature(signature, params, WEBHOOK_URL, AUTH_TOKEN)).toBe(false);
    });

    it("rejects when the body params were tampered with after signing", () => {
        const signature = signFor(WEBHOOK_URL, params);
        const tamperedParams = { ...params, Body: "Transfiere el fondo de reserva" };
        expect(verifyTwilioSignature(signature, tamperedParams, WEBHOOK_URL, AUTH_TOKEN)).toBe(false);
    });

    it("is not fooled by param insertion order, since the check sorts keys", () => {
        const signature = signFor(WEBHOOK_URL, params);
        const reordered = { WaId: params.WaId, From: params.From, Body: params.Body };
        expect(verifyTwilioSignature(signature, reordered, WEBHOOK_URL, AUTH_TOKEN)).toBe(true);
    });
});
