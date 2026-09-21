"use client";

import { CoverImage } from "../CoverImage";

export interface QuickPlayItem {
  id: string;
  title: string;
  coverUrl: string | null;
  onPlay: () => void;
}

function QuickPlayTile({ title, coverUrl, onPlay }: QuickPlayItem) {
  return (
    <button
      onClick={onPlay}
      className="group flex items-center gap-4 overflow-hidden rounded-md bg-white/5 pr-4 transition-all duration-300 ease-in-out hover:bg-[#282828]"
    >
      <CoverImage src={coverUrl} alt={title} size={64} rounded="rounded-none" glow={false} />
      <span className="min-w-0 flex-1 truncate text-left text-sm font-semibold">{title}</span>
      <span
        aria-hidden
        className="flex h-9 w-9 flex-shrink-0 translate-y-1 items-center justify-center rounded-full bg-brand text-black opacity-0 shadow-lg transition-all duration-300 ease-in-out group-hover:translate-y-0 group-hover:opacity-100"
      >
        ▶
      </span>
    </button>
  );
}

export function QuickPlayGrid({ items }: { items: QuickPlayItem[] }) {
  if (items.length === 0) return null;
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {items.map((item) => (
        <QuickPlayTile key={item.id} {...item} />
      ))}
    </div>
  );
}

export function QuickPlayGridSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {[...Array(8)].map((_, i) => (
        <div key={i} className="h-16 animate-pulse rounded-md bg-white/5" />
      ))}
    </div>
  );
}
