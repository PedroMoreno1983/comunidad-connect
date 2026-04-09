import { motion } from "framer-motion";
import { Search, LucideIcon } from "lucide-react";

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
}

export function EmptyState({
  icon: Icon = Search,
  title,
  description,
  action,
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      className="text-center py-20 px-6 bg-white/50 dark:bg-slate-800/50 backdrop-blur-md rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700 w-full max-w-2xl mx-auto my-8"
    >
      <div className="w-20 h-20 mx-auto mb-6 bg-gradient-to-br from-slate-100 to-slate-200 dark:from-slate-700 dark:to-slate-800 rounded-3xl flex items-center justify-center shadow-inner">
        <Icon className="h-10 w-10 text-slate-400" />
      </div>
      <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-2 underline decoration-[#0BC9A1] decoration-4 underline-offset-4">
        {title}
      </h3>
      <p className="text-slate-500 dark:text-slate-400 mb-8 max-w-sm mx-auto font-medium">
        {description}
      </p>
      {action && (
        <div className="flex justify-center">
          {action}
        </div>
      )}
    </motion.div>
  );
}
