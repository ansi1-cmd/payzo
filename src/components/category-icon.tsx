"use client";

import {
  Droplets,
  Zap,
  Flame,
  Wifi,
  Smartphone,
  Tv,
  Music,
  Play,
  Repeat,
  CreditCard,
  Landmark,
  Shield,
  Ellipsis,
  Receipt,
  type LucideProps,
} from "lucide-react";

const iconMap: Record<string, React.ComponentType<LucideProps>> = {
  droplets: Droplets,
  zap: Zap,
  flame: Flame,
  wifi: Wifi,
  smartphone: Smartphone,
  tv: Tv,
  music: Music,
  play: Play,
  repeat: Repeat,
  "credit-card": CreditCard,
  landmark: Landmark,
  shield: Shield,
  ellipsis: Ellipsis,
  receipt: Receipt,
};

export function CategoryIcon({
  icon,
  className,
}: {
  icon: string;
  className?: string;
}) {
  const Icon = iconMap[icon] || Receipt;
  return <Icon className={className} />;
}
