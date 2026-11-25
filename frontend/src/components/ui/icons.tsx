import {
  ArrowUpNarrowWide,
  Bell,
  Calendar,
  ChevronLeft,
  ChevronRight,
  Circle,
  CircleCheck,
  CircleX,
  Clock,
  EyeOff,
  FileText,
  Image,
  Menu,
  Plus,
  Rss,
  Star,
  User,
} from "lucide-react";

interface IconProps {
  className?: string;
}

export function ArrowDownAZIcon({ className }: IconProps) {
  return <ArrowUpNarrowWide className={className} />;
}

export function CalendarIcon({ className }: IconProps) {
  return <Calendar className={className} />;
}

export function FileTextIcon({ className }: IconProps) {
  return <FileText className={className} />;
}

export function ImageIcon({ className }: IconProps) {
  return <Image className={className} />;
}

export function BellIcon({ className }: IconProps) {
  return <Bell className={className} />;
}

export function BackIcon({ className }: IconProps) {
  return <ChevronLeft className={className} />;
}

export function CircleOutlineIcon({ className }: IconProps) {
  return <Circle className={className} />;
}

export function CircleFilledIcon({ className }: IconProps) {
  return <Circle className={className} fill="currentColor" />;
}

export function CheckCircleIcon({ className }: IconProps) {
  return <CircleCheck className={className} />;
}

export function MenuIcon({ className }: IconProps) {
  return <Menu className={className} />;
}

export function AddIcon({ className }: IconProps) {
  return <Plus className={className} />;
}

export function RssIcon({ className }: IconProps) {
  return <Rss className={className} />;
}

export function ErrorIcon({ className }: IconProps) {
  return <CircleX className={className} />;
}

export function ChevronIcon({ className }: IconProps) {
  return <ChevronRight className={className} />;
}

export function StarIcon({ className }: IconProps) {
  return <Star className={className} fill="currentColor" />;
}

export function UserIcon({ className }: IconProps) {
  return <User className={className} />;
}

export function ClockIcon({ className }: IconProps) {
  return <Clock className={className} />;
}

export function EyeOffIcon({ className }: IconProps) {
  return <EyeOff className={className} />;
}
