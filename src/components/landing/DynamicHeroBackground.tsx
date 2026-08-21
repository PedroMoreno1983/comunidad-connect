'use client';

import { useEffect, useRef, useState } from 'react';
import Image from 'next/image';
import { motion, useScroll, useTransform, useMotionValue, useSpring } from 'framer-motion';

interface DynamicHeroBackgroundProps {
  imageSrc?: string;
  alt?: string;
}

export function DynamicHeroBackground({
  imageSrc = '/hero-condominio-bg.jpg',
  alt = 'Condominio inteligente conectado con Convive Connect',
}: DynamicHeroBackgroundProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isLoaded, setIsLoaded] = useState(false);

  // Parallax on scroll
  const { scrollY } = useScroll();
  const yParallax = useTransform(scrollY, [0, 800], [0, 110]);
  const opacityFade = useTransform(scrollY, [0, 700], [1, 0.45]);

  // Mouse interactive spotlight & parallax. El eje vertical de la capa lo
  // ocupa el parallax de scroll (yParallax), así que el ratón solo mueve X.
  const mouseX = useMotionValue(0);
  const mouseClientX = useMotionValue(-1000);
  const mouseClientY = useMotionValue(-1000);

  const springX = useSpring(mouseX, { stiffness: 40, damping: 25 });
  const spotX = useSpring(mouseClientX, { stiffness: 60, damping: 30 });
  const spotY = useSpring(mouseClientY, { stiffness: 60, damping: 30 });

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const xNorm = (e.clientX / window.innerWidth - 0.5) * 24; // -12px to +12px
      mouseX.set(xNorm);
      mouseClientX.set(e.clientX);
      mouseClientY.set(e.clientY);
    };

    window.addEventListener('mousemove', handleMouseMove, { passive: true });
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseClientX, mouseClientY]);

  // Floating ambient light particles canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = canvas.offsetWidth);
    let height = (canvas.height = canvas.offsetHeight);

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = canvas.offsetWidth;
      height = canvas.height = canvas.offsetHeight;
    };

    window.addEventListener('resize', handleResize);

    // Particle pool with warm ambient embers/bokeh
    const particleCount = 48;
    const particles = Array.from({ length: particleCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 2.8 + 0.8,
      speedY: Math.random() * 0.45 + 0.15,
      speedX: (Math.random() - 0.5) * 0.25,
      opacity: Math.random() * 0.6 + 0.2,
      opacitySpeed: Math.random() * 0.01 + 0.004,
      opacityDir: Math.random() > 0.5 ? 1 : -1,
      color:
        Math.random() > 0.6
          ? '224, 134, 76' // Copper/Amber
          : Math.random() > 0.3
          ? '245, 230, 200' // Warm Ivory
          : '142, 168, 112', // Sage
    }));

    let isVisible = true;
    const observer = new IntersectionObserver(([entry]) => {
      isVisible = entry.isIntersecting;
    });
    if (containerRef.current) observer.observe(containerRef.current);

    const render = () => {
      if (isVisible) {
        ctx.clearRect(0, 0, width, height);

        for (let i = 0; i < particles.length; i++) {
          const p = particles[i];

          // Update position
          p.y -= p.speedY;
          p.x += p.speedX;

          // Wrap around edges
          if (p.y < -10) {
            p.y = height + 10;
            p.x = Math.random() * width;
          }
          if (p.x < -10) p.x = width + 10;
          if (p.x > width + 10) p.x = -10;

          // Pulse opacity
          p.opacity += p.opacitySpeed * p.opacityDir;
          if (p.opacity > 0.85) {
            p.opacity = 0.85;
            p.opacityDir = -1;
          } else if (p.opacity < 0.15) {
            p.opacity = 0.15;
            p.opacityDir = 1;
          }

          // Draw soft glowing particle
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
          ctx.fillStyle = `rgba(${p.color}, ${p.opacity})`;
          ctx.shadowBlur = p.size * 3.5;
          ctx.shadowColor = `rgba(${p.color}, 0.8)`;
          ctx.fill();
        }
      }
      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      cancelAnimationFrame(animationFrameId);
      observer.disconnect();
    };
  }, []);

  return (
    <div
      ref={containerRef}
      className="pointer-events-none absolute inset-0 overflow-hidden select-none"
      style={{ background: '#171512' }}
    >
      {/* ── Layer 1: Ken Burns Living Motion Image ── */}
      <motion.div
        style={{
          y: yParallax,
          x: springX,
          opacity: opacityFade,
        }}
        className="absolute -inset-12"
      >
        <motion.div
          animate={{
            scale: [1.02, 1.10, 1.05, 1.02],
            x: ['0%', '-2.2%', '1.8%', '0%'],
            y: ['0%', '-1.8%', '1.2%', '0%'],
          }}
          transition={{
            duration: 28,
            repeat: Infinity,
            repeatType: 'reverse',
            ease: 'easeInOut',
          }}
          className="relative w-full h-full"
        >
          <Image
            src={imageSrc}
            alt={alt}
            fill
            priority
            quality={95}
            sizes="100vw"
            onLoad={() => setIsLoaded(true)}
            className={`object-cover object-[60%_center] sm:object-center transition-opacity duration-1000 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        </motion.div>
      </motion.div>

      {/* ── Layer 2: Dynamic Atmospheric Glow Orbs ── */}
      {/* Amber Sunset Flare */}
      <motion.div
        animate={{
          scale: [1, 1.28, 1],
          opacity: [0.35, 0.6, 0.35],
          x: [0, 30, 0],
          y: [0, -25, 0],
        }}
        transition={{
          duration: 12,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
        }}
        className="absolute -top-32 right-1/4 h-[560px] w-[560px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(224,134,76,0.42) 0%, rgba(224,134,76,0.12) 50%, transparent 75%)',
        }}
      />

      {/* Turquoise Pool Reflection Flare */}
      <motion.div
        animate={{
          scale: [1, 1.22, 1],
          opacity: [0.28, 0.52, 0.28],
          x: [0, -20, 0],
        }}
        transition={{
          duration: 10,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
          delay: 1.5,
        }}
        className="absolute bottom-10 right-1/3 h-[460px] w-[460px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(56,189,248,0.32) 0%, rgba(45,212,191,0.1) 50%, transparent 75%)',
        }}
      />

      {/* Sage Community Aura */}
      <motion.div
        animate={{
          scale: [1, 1.18, 1],
          opacity: [0.22, 0.42, 0.22],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          repeatType: 'reverse',
          ease: 'easeInOut',
          delay: 3,
        }}
        className="absolute -bottom-24 -left-20 h-[480px] w-[480px] rounded-full blur-3xl"
        style={{
          background:
            'radial-gradient(circle, rgba(142,168,112,0.36) 0%, transparent 70%)',
        }}
      />

      {/* ── Layer 3: Interactive Mouse Spotlight ── */}
      <motion.div
        style={{
          left: spotX,
          top: spotY,
          translateX: '-50%',
          translateY: '-50%',
          background: 'radial-gradient(circle, rgba(224,134,76,0.35) 0%, rgba(245,230,200,0.1) 40%, transparent 70%)',
        }}
        className="pointer-events-none absolute h-[380px] w-[380px] rounded-full opacity-40 blur-3xl"
      />

      {/* ── Layer 4: Floating Dust / Ember Particles Canvas ── */}
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full opacity-85"
      />

      {/* ── Layer 5: Ambient Grid Mesh Texture ── */}
      <div
        className="absolute inset-0 opacity-[0.035]"
        style={{
          backgroundImage: 'radial-gradient(rgba(255,255,255,0.45) 1px, transparent 1px)',
          backgroundSize: '32px 32px',
        }}
      />

      {/* ── Layer 6: Precision Vignette & Gradient Overlays ── */}
      {/* Top and Bottom blend */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, rgba(23,21,18,0.62) 0%, rgba(23,21,18,0.18) 28%, rgba(23,21,18,0.68) 70%, rgba(23,21,18,0.98) 100%)',
        }}
      />

      {/* Left Radial Vignette to focus left-side copy & hero typography */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 20% 60%, rgba(23,21,18,0.85) 0%, rgba(23,21,18,0.45) 50%, transparent 85%)',
        }}
      />
    </div>
  );
}
