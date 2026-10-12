import { Link } from 'react-router-dom';
import { ChevronRight, LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface SectionCardProps {
    to: string;
    title: string;
    subtitle: string;
    icon: LucideIcon;
    iconColor?: string;
    iconBgColor?: string;
    className?: string;
}

export function SectionCard({
    to,
    title,
    subtitle,
    icon: Icon,
    iconColor = 'text-white',
    iconBgColor = 'bg-primary',
    className,
}: SectionCardProps) {
    return (
        <Link
            to={to}
            className={cn(
                "group flex items-center gap-4 p-4 rounded-lg border bg-card text-card-foreground shadow-sm transition-all duration-200 hover:shadow-md hover:-translate-y-0.5",
                className
            )}
        >
            <div
                className={cn(
                    "flex items-center justify-center w-12 h-12 rounded-lg shrink-0",
                    iconBgColor
                )}
            >
                <Icon className={cn("w-6 h-6", iconColor)} />
            </div>
            <div className="flex-1 min-w-0">
                <p className="font-semibold text-foreground group-hover:text-primary transition-colors">
                    {title}
                </p>
                <p className="text-sm text-muted-foreground">{subtitle}</p>
            </div>
            <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
        </Link>
    );
}

interface StatCardProps {
    value: string | number;
    label: string;
    className?: string;
}

export function StatCard({ value, label, className }: StatCardProps) {
    return (
        <div
            className={cn(
                "flex flex-col items-center px-4 py-3 rounded-lg bg-secondary text-center",
                className
            )}
        >
            <span className="text-2xl font-bold text-foreground">{value}</span>
            <span className="text-xs text-muted-foreground">{label}</span>
        </div>
    );
}
