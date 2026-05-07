export function AnimatedBackground() {
    return (
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
            <div className="absolute inset-0 bg-canvas transition-colors duration-300" />
        </div>
    );
}
