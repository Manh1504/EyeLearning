'use client';

import { useState } from 'react';

import { resolveMediaUrl } from '@/lib/api/client';
import { cn } from '@/lib/utils';

function getInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function UserAvatar({
  src,
  name,
  alt,
  className,
}: {
  src?: string | null;
  name: string;
  alt?: string;
  className?: string;
}) {
  const resolvedSrc = resolveMediaUrl(src);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  const showImage = Boolean(resolvedSrc) && failedSrc !== resolvedSrc;

  return (
    <span
      className={cn(
        'flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-full bg-accent text-xs font-bold text-primary',
        className,
      )}
    >
      {showImage && resolvedSrc ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={resolvedSrc}
          alt={alt ?? name}
          className="h-full w-full object-cover"
          onError={() => setFailedSrc(resolvedSrc)}
        />
      ) : (
        getInitials(name)
      )}
    </span>
  );
}
