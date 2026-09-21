"use client";

import { useRef, useState } from "react";

interface CoverImageProps {
  src: string | null | undefined;
  alt: string;
  size?: number;
  rounded?: string;
  className?: string;
  /** Apaga el muestreo de color dominante — para grillas grandes donde no vale la pena el costo por celda. */
  glow?: boolean;
}

/**
 * Muestrea el color dominante real de la portada (Canvas, 8x8px reducido)
 * para el degradado detrás de la imagen — nada de un color fijo genérico.
 * Si la imagen es de otro origen sin CORS habilitado, el canvas queda
 * "tainted" y `getImageData` tira una excepción: se degrada en silencio a
 * "sin glow", nunca rompe el render de la portada en sí.
 */
function sampleDominantColor(img: HTMLImageElement): string | null {
  try {
    const SAMPLE = 8;
    const canvas = document.createElement("canvas");
    canvas.width = SAMPLE;
    canvas.height = SAMPLE;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, SAMPLE, SAMPLE);
    const { data } = ctx.getImageData(0, 0, SAMPLE, SAMPLE);
    let r = 0;
    let g = 0;
    let b = 0;
    let count = 0;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i]!;
      g += data[i + 1]!;
      b += data[i + 2]!;
      count++;
    }
    return `rgb(${Math.round(r / count)}, ${Math.round(g / count)}, ${Math.round(b / count)})`;
  } catch {
    return null;
  }
}

function MusicNotePlaceholder({ size }: { size: number }) {
  return (
    <svg width={size * 0.4} height={size * 0.4} viewBox="0 0 24 24" fill="none" className="text-muted">
      <path
        d="M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm12-2a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z"
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CoverImage({ src, alt, size = 64, rounded = "rounded-lg", className = "", glow = true }: CoverImageProps) {
  const [glowColor, setGlowColor] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  if (!src || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className={`flex flex-shrink-0 items-center justify-center bg-surface-raised ${rounded} ${className}`}
      >
        <MusicNotePlaceholder size={size} />
      </div>
    );
  }

  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      {glow && glowColor && (
        <div aria-hidden className={`absolute -inset-2 -z-10 opacity-40 blur-xl ${rounded}`} style={{ background: glowColor }} />
      )}
      {/* eslint-disable-next-line @next/next/no-img-element -- portadas vienen del backend (/uploads), sin dominio fijo para next/image */}
      <img
        ref={imgRef}
        src={src}
        alt={alt}
        crossOrigin={glow ? "anonymous" : undefined}
        onLoad={() => glow && setGlowColor(sampleDominantColor(imgRef.current!))}
        onError={() => setFailed(true)}
        style={{ width: size, height: size }}
        className={`bg-surface-raised object-cover ${rounded} ${className}`}
      />
    </div>
  );
}
