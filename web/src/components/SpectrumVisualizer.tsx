"use client";

import { useEffect, useRef } from "react";
import { getFrequencyData } from "../lib/audioEngine";

interface SpectrumVisualizerProps {
  isPlaying: boolean;
  width?: number;
  height?: number;
}

/**
 * Barras de frecuencia dibujadas en canvas, alineadas al refresco del
 * monitor con `requestAnimationFrame`. El bucle se detiene cuando no hay
 * reproducción — no tiene sentido gastar frames dibujando silencio.
 */
export function SpectrumVisualizer({ isPlaying, width = 72, height = 32 }: SpectrumVisualizerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !isPlaying) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Escala por densidad de píxeles para que no se vea borroso en pantallas retina.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    const BARS = 16;

    const draw = () => {
      frameRef.current = requestAnimationFrame(draw);
      const data = getFrequencyData();
      ctx.clearRect(0, 0, width, height);
      if (!data) return;

      const barWidth = width / BARS - 1;
      const step = Math.floor(data.length / BARS);

      for (let i = 0; i < BARS; i++) {
        const value = data[i * step] ?? 0;
        const barHeight = Math.max(2, (value / 255) * height);
        ctx.fillStyle = `rgba(29, 185, 84, ${0.35 + (value / 255) * 0.65})`;
        ctx.fillRect(i * (barWidth + 1), height - barHeight, barWidth, barHeight);
      }
    };

    draw();
    return () => {
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    };
  }, [isPlaying, width, height]);

  if (!isPlaying) return null;

  return <canvas ref={canvasRef} style={{ width, height }} aria-hidden className="opacity-90" />;
}
