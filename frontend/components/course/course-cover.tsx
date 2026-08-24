'use client';

import { useId } from 'react';

import { cn } from '@/lib/utils';

type CourseCoverData = {
  id: string;
  thumbnailUrl?: string | null;
};

export function CourseCover({ course, className }: { course: CourseCoverData; className?: string }) {
  const gradientId = useId();
  const patternId = useId();

  if (course.thumbnailUrl) {
    return (
      <div className={cn('relative aspect-video overflow-hidden rounded-xl bg-muted', className)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={course.thumbnailUrl} alt="" className="h-full w-full object-cover object-center" />
      </div>
    );
  }

  const variant = course.id.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0) % 3;
  const nodes = [
    [
      [72, 220], [132, 142], [214, 194], [184, 286], [312, 116], [386, 206], [506, 150],
    ],
    [
      [80, 154], [154, 92], [244, 126], [214, 250], [360, 84], [468, 174], [548, 260],
    ],
    [
      [96, 248], [168, 170], [262, 236], [346, 118], [438, 208], [520, 120], [562, 250],
    ],
  ][variant];

  return (
    <div className={cn('relative aspect-video overflow-hidden rounded-xl bg-[#092F60]', className)}>
      <svg
        viewBox="0 0 640 360"
        preserveAspectRatio="xMidYMid meet"
        className="h-full w-full"
        role="img"
        aria-label="Ảnh bìa khóa học GazeEdu"
      >
        <defs>
          <radialGradient id={gradientId} cx="76%" cy="18%" r="72%">
            <stop offset="0%" stopColor="#01BCEA" stopOpacity="0.24" />
            <stop offset="42%" stopColor="#01BCEA" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#092F60" stopOpacity="0" />
          </radialGradient>
          <pattern id={patternId} width="34" height="34" patternUnits="userSpaceOnUse">
            <path d="M34 0H0V34" fill="none" stroke="#8BEAFF" strokeOpacity="0.08" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="640" height="360" fill="#092F60" />
        <rect width="640" height="360" fill={`url(#${patternId})`} />
        <rect width="640" height="360" fill={`url(#${gradientId})`} />
        <circle cx="512" cy="64" r="118" fill="#01BCEA" opacity="0.08" />
        <circle cx="96" cy="300" r="92" fill="#01BCEA" opacity="0.06" />

        <g stroke="#01BCEA" strokeWidth="1.6" opacity="0.34">
          {nodes.slice(0, -1).map(([x, y], index) => (
            <line key={`${x}-${y}`} x1={x} y1={y} x2={nodes[index + 1][0]} y2={nodes[index + 1][1]} />
          ))}
          <line x1={nodes[0][0]} y1={nodes[0][1]} x2={nodes[3][0]} y2={nodes[3][1]} />
          <line x1={nodes[2][0]} y1={nodes[2][1]} x2={nodes[5][0]} y2={nodes[5][1]} />
          <line x1={nodes[1][0]} y1={nodes[1][1]} x2={nodes[4][0]} y2={nodes[4][1]} />
        </g>
        <g fill="#01BCEA" opacity="0.78">
          {nodes.map(([x, y]) => (
            <circle key={`${x}-${y}`} cx={x} cy={y} r="4.5" />
          ))}
        </g>

        <g transform="translate(384 112)" opacity="0.9">
          <path d="M18 0h74l34 34v96a10 10 0 0 1-10 10H18A10 10 0 0 1 8 130V10A10 10 0 0 1 18 0Z" fill="#EAFBFF" opacity="0.9" />
          <path d="M92 0v27a7 7 0 0 0 7 7h27" fill="#BDEFFF" />
          <rect x="34" y="48" width="54" height="5" rx="2.5" fill="#7DA4CD" opacity="0.55" />
          <rect x="34" y="70" width="70" height="5" rx="2.5" fill="#7DA4CD" opacity="0.45" />
          <rect x="34" y="92" width="48" height="5" rx="2.5" fill="#7DA4CD" opacity="0.4" />
        </g>

        <g transform="translate(244 152)">
          <circle cx="64" cy="64" r="52" fill="#092F60" stroke="#8BEAFF" strokeWidth="2.5" opacity="0.98" />
          <circle cx="64" cy="64" r="32" fill="none" stroke="#01BCEA" strokeWidth="3" opacity="0.95" />
          <circle cx="64" cy="64" r="10" fill="#01BCEA" />
          <path d="M64 16v20M64 92v20M16 64h20M92 64h20" stroke="#8BEAFF" strokeWidth="2" strokeLinecap="round" opacity="0.75" />
          <circle cx="64" cy="64" r="3" fill="#EAFBFF" />
        </g>

        <path d="M78 82h122l42 42" fill="none" stroke="#8BEAFF" strokeWidth="1.4" strokeOpacity="0.22" />
        <path d="M462 270h72l34-34" fill="none" stroke="#8BEAFF" strokeWidth="1.4" strokeOpacity="0.2" />
      </svg>
    </div>
  );
}
