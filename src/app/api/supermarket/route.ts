import { NextRequest, NextResponse } from "next/server";
import { agent } from "@/lib/agentBrain";

interface CartItemUI {
    id: string;
    name: string;
    price: number;
    store: string;
    originalPrice?: number;
    isOffer?: boolean;
    checked: boolean;
}

export async function POST(req: NextRequest) {
    try {
        const body = await req.json();
        const { message, previousItems = [] } = body;

        // Process message with the supermarket agent
        // The agent currently has a processMessage method that looks for products in the text
        const response = await agent.processMessage(message);

        // We use the agent to get suggested items, but since its interface might be limited
        // let's do a direct keyword search here too to ensure robustness for the frontend 
        const normalizedText = message.toLowerCase();
        
        // Find products from the catalog that match keywords in the message
        let newItems: CartItemUI[] = [];
        
        if (response.cart?.items) {
             newItems = response.cart.items.map((item: any) => ({
                 id: Math.random().toString(),
                 name: item.name,
                 price: item.price,
                 store: item.store,
                 originalPrice: item.originalPrice,
                 isOffer: item.isOffer,
                 checked: false
             }));
        }

        return NextResponse.json({
            message: response.message,
            items: newItems,
            rawCart: response.cart
        });
        
    } catch (error) {
        console.error("Supermarket API Error:", error);
        return NextResponse.json(
            { error: "Error procesando la lista de supermercado" },
            { status: 500 }
        );
    }
}
