import { clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export const CATEGORY_COLOR_OPTIONS = [
  { value: '#3B82F6', label: 'Azul' },
  { value: '#10B981', label: 'Verde' },
  { value: '#F59E0B', label: 'Âmbar' },
  { value: '#EF4444', label: 'Vermelho' },
  { value: '#8B5CF6', label: 'Violeta' },
  { value: '#EC4899', label: 'Rosa' },
  { value: '#14B8A6', label: 'Turquesa' },
  { value: '#64748B', label: 'Cinza' },
] as const;

export const DEFAULT_CATEGORY_COLOR = CATEGORY_COLOR_OPTIONS[0].value;

const HEX_COLOR = /^#[0-9A-Fa-f]{6}$/;

export interface CategoryBadgeProps {
  name: string;
  color?: string | null;
  className?: string;
}

/**
 * Badge com a cor escolhida pelo usuário para a categoria.
 * A cor vem do backend como #RRGGBB e é aplicada via style (não há classe Tailwind para cores arbitrárias em runtime).
 */
export function CategoryBadge({ name, color, className }: CategoryBadgeProps) {
  const safeColor = color && HEX_COLOR.test(color) ? color : DEFAULT_CATEGORY_COLOR;

  return (
    <span
      className={twMerge(
        clsx(
          'inline-flex items-center gap-1.5 max-w-full px-2.5 py-0.5 rounded-full text-xs font-semibold border',
          'text-slate-700 dark:text-slate-200',
          className,
        ),
      )}
      style={{ borderColor: `${safeColor}66`, backgroundColor: `${safeColor}1A` }}
      title={`Categoria: ${name}`}
    >
      <span
        aria-hidden="true"
        className="h-2 w-2 rounded-full shrink-0"
        style={{ backgroundColor: safeColor }}
      />
      <span className="truncate">{name}</span>
    </span>
  );
}
