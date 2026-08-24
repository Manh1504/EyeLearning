import Image from 'next/image';
import { cn } from '@/lib/utils';

type BrandLogoVariant = 'light' | 'dark' | 'icon';

const BRAND_ASSETS: Record<BrandLogoVariant, { src: string; width: number; height: number }> = {
  light: { src: '/brand/gazeedu-logo.svg', width: 1467, height: 338 },
  dark: { src: '/brand/gazeedu-logo-dark-bg.png', width: 1280, height: 400 },
  icon: { src: '/brand/gazeedu-icon.svg', width: 500, height: 338 },
};

export function BrandLogo({
  variant = 'light',
  className,
  priority = false,
}: {
  variant?: BrandLogoVariant;
  className?: string;
  priority?: boolean;
}) {
  const asset = BRAND_ASSETS[variant];

  return (
    <Image
      src={asset.src}
      width={asset.width}
      height={asset.height}
      alt="GazeEdu"
      priority={priority}
      className={cn('block h-auto w-auto object-contain', className)}
    />
  );
}
