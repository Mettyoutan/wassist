export type IntentType = 
 | "order_new" 
 | "browse" 
 | "repeat_last" 
 | "modify_order" 
 | "cancel_order" 
 | "order_status" 
 | "low_confidence"

export interface OrderItem {
    product_name: string;
    qty?: number;
    notes?: string;
}

export interface ParsedIntent {
    intent: IntentType;
    items: OrderItem[] | []; 
    confidence: number;     // 0.0 - 1.0
    language: string;       // "id" | "en" | "mixed"
    raw_text?: string;
}

