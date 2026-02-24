"use client";

import { MOCK_FINANCES } from "@/lib/mockData";
import { FinanceDashboard } from "@/components/admin/FinanceDashboard";
import { motion } from "framer-motion";

export default function AdminFinanzasPage() {
    return (
        <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="max-w-7xl mx-auto py-10 px-4 md:px-8"
        >
            <FinanceDashboard data={MOCK_FINANCES} />
        </motion.div>
    );
}
