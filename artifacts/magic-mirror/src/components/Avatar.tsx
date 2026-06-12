import React, { useEffect, useState, useRef } from 'react';
import { motion, useAnimation, useSpring, useTransform } from 'framer-motion';
import { AvatarStatus } from '../hooks/useAvatarState';

interface AvatarProps {
  status: AvatarStatus;
  mouthOpenAmount: number;
}

export function Avatar({ status, mouthOpenAmount }: AvatarProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  // Spring animations for smooth head tracking
  const springConfig = { damping: 20, stiffness: 100, mass: 0.5 };
  const mouseX = useSpring(0, springConfig);
  const mouseY = useSpring(0, springConfig);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const centerX = rect.left + rect.width / 2;
      const centerY = rect.top + rect.height / 2;
      
      // Normalize to -1 to 1 range
      const normalizedX = (e.clientX - centerX) / (window.innerWidth / 2);
      const normalizedY = (e.clientY - centerY) / (window.innerHeight / 2);
      
      mouseX.set(normalizedX);
      mouseY.set(normalizedY);
    };

    window.addEventListener('mousemove', handleMouseMove);
    return () => window.removeEventListener('mousemove', handleMouseMove);
  }, [mouseX, mouseY]);

  // Derived transforms for head and eye movement
  const headRotateX = useTransform(mouseY, [-1, 1], [15, -15]);
  const headRotateY = useTransform(mouseX, [-1, 1], [-20, 20]);
  const eyeOffsetX = useTransform(mouseX, [-1, 1], [-10, 10]);
  const eyeOffsetY = useTransform(mouseY, [-1, 1], [-5, 5]);

  // State-based animation variants
  const eyeGlowColors = {
    idle: 'rgba(0, 240, 255, 0.4)',
    listening: 'rgba(0, 240, 255, 0.9)',
    thinking: 'rgba(138, 43, 226, 0.8)',
    speaking: 'rgba(0, 240, 255, 0.8)'
  };

  const outerRingVariants = {
    idle: { rotate: 0, scale: 1, opacity: 0.3, transition: { duration: 20, repeat: Infinity, ease: "linear" } },
    listening: { rotate: 180, scale: 1.05, opacity: 0.6, transition: { duration: 10, repeat: Infinity, ease: "linear" } },
    thinking: { rotate: -360, scale: 0.95, opacity: 0.8, transition: { duration: 5, repeat: Infinity, ease: "linear" } },
    speaking: { rotate: 90, scale: [1, 1.05, 1], opacity: 0.7, transition: { rotate: { duration: 15, repeat: Infinity, ease: "linear" }, scale: { duration: 1.5, repeat: Infinity } } }
  };

  const innerRingVariants = {
    idle: { rotate: 360, opacity: 0.2, transition: { duration: 30, repeat: Infinity, ease: "linear" } },
    listening: { rotate: -360, opacity: 0.5, transition: { duration: 15, repeat: Infinity, ease: "linear" } },
    thinking: { rotate: 360, opacity: 0.7, transition: { duration: 8, repeat: Infinity, ease: "linear" } },
    speaking: { rotate: -180, opacity: 0.6, transition: { duration: 10, repeat: Infinity, ease: "linear" } }
  };

  const eyeVariants = {
    idle: { scaleY: 0.8, filter: `drop-shadow(0 0 10px ${eyeGlowColors.idle})` },
    listening: { scaleY: 1.2, filter: `drop-shadow(0 0 20px ${eyeGlowColors.listening})` },
    thinking: { scaleY: [1, 0.2, 1], filter: `drop-shadow(0 0 15px ${eyeGlowColors.thinking})`, transition: { duration: 2, repeat: Infinity } },
    speaking: { scaleY: 1, filter: `drop-shadow(0 0 25px ${eyeGlowColors.speaking})` }
  };

  return (
    <div ref={containerRef} className="relative w-full h-full flex items-center justify-center overflow-hidden perspective-1000">
      {/* Background Ambience */}
      <motion.div 
        className="absolute inset-0 bg-gradient-to-b from-transparent to-background/80 pointer-events-none z-0"
        animate={{ opacity: status === 'listening' ? 0.8 : 0.4 }}
      />
      
      {/* Hologram Frame & Rings */}
      <div className="relative w-[300px] h-[300px] md:w-[450px] md:h-[450px] lg:w-[600px] lg:h-[600px] flex items-center justify-center">
        
        {/* Outer Particle Ring */}
        <motion.div 
          className="absolute inset-0 rounded-full border border-primary/20 border-dashed"
          variants={outerRingVariants}
          animate={status}
        />
        
        {/* Inner Glow Ring */}
        <motion.div 
          className="absolute inset-8 rounded-full border border-secondary/30"
          variants={innerRingVariants}
          animate={status}
          style={{ boxShadow: `inset 0 0 50px ${status === 'thinking' ? 'rgba(138, 43, 226, 0.2)' : 'rgba(0, 240, 255, 0.1)'}` }}
        />

        {/* 3D Head Container */}
        <motion.div 
          className="relative w-48 h-64 md:w-64 md:h-80 flex flex-col items-center justify-center preserve-3d"
          style={{ 
            rotateX: headRotateX, 
            rotateY: headRotateY,
          }}
          animate={{
            y: status === 'idle' ? [0, -10, 0] : 0,
            transition: { duration: 4, repeat: Infinity, ease: "easeInOut" }
          }}
        >
          {/* Holographic Face Plane */}
          <div className="absolute inset-0 bg-gradient-to-b from-primary/5 to-secondary/10 rounded-t-full rounded-b-[40%] backdrop-blur-sm border border-primary/10" style={{ boxShadow: '0 20px 50px rgba(0,0,0,0.5)' }}></div>

          {/* Eyes */}
          <div className="relative w-full flex justify-center gap-12 md:gap-16 mt-10 md:mt-16 z-10 translate-z-10">
            <motion.div 
              className="w-8 h-12 md:w-10 md:h-16 rounded-full bg-primary/80"
              style={{ x: eyeOffsetX, y: eyeOffsetY }}
              variants={eyeVariants}
              animate={status}
            />
            <motion.div 
              className="w-8 h-12 md:w-10 md:h-16 rounded-full bg-primary/80"
              style={{ x: eyeOffsetX, y: eyeOffsetY }}
              variants={eyeVariants}
              animate={status}
            />
          </div>

          {/* Abstract Nose suggestion */}
          <motion.div 
            className="w-1 h-8 md:h-12 bg-primary/30 mt-6 md:mt-8 rounded-full blur-[1px] translate-z-12"
            animate={{ opacity: status === 'thinking' ? 0.6 : 0.3 }}
          />

          {/* Mouth */}
          <div className="absolute bottom-16 md:bottom-20 w-16 md:w-24 flex items-center justify-center translate-z-14">
            <motion.div 
              className="w-full bg-primary/60 rounded-full"
              style={{ 
                height: status === 'speaking' ? `${2 + mouthOpenAmount * 24}px` : '2px',
                filter: `drop-shadow(0 0 ${status === 'speaking' ? 10 + mouthOpenAmount * 10 : 2}px rgba(0, 240, 255, 0.8))`
              }}
              animate={{
                width: status === 'idle' ? '60%' : status === 'speaking' ? '80%' : '100%',
                opacity: status === 'idle' ? 0.5 : 1
              }}
              transition={{ type: 'spring', bounce: 0, duration: 0.1 }}
            />
          </div>
        </motion.div>

        {/* Floating status text if thinking */}
        {status === 'thinking' && (
          <motion.div 
            className="absolute -bottom-12 text-secondary font-mono text-sm tracking-widest uppercase glow-violet"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            Processing...
          </motion.div>
        )}
      </div>
    </div>
  );
}
