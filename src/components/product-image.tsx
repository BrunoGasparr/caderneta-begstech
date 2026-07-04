import { ImageIcon, Package2 } from "lucide-react";

interface ProductImageProps {
  src?: string | null;
  alt: string;
  className?: string;
}

export function ProductImage({ src, alt, className = "" }: ProductImageProps) {
  if (src) {
    return (
      <img
        src={src}
        alt={alt}
        className={`h-full w-full rounded-2xl object-cover ${className}`.trim()}
      />
    );
  }

  return (
    <div
      className={`flex h-full w-full items-center justify-center rounded-2xl bg-muted text-muted-foreground ${className}`.trim()}
    >
      <div className="flex flex-col items-center gap-1 text-center">
        <Package2 className="h-7 w-7" />
        <span className="inline-flex items-center gap-1 text-[11px] font-medium uppercase tracking-wide">
          <ImageIcon className="h-3 w-3" />
          sem foto
        </span>
      </div>
    </div>
  );
}
