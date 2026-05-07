export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute inset-0 bg-canvas transition-colors duration-300" />

            <div
                className="absolute inset-0 opacity-[0.035] dark:opacity-[0.05]"
                style={{
                    backgroundImage: "linear-gradient(to right, currentColor 1px, transparent 1px), linear-gradient(to bottom, currentColor 1px, transparent 1px)",
                    backgroundSize: "32px 32px",
                    color: "var(--cc-text-primary)",
                }}
            />
        </div>
    );
}
