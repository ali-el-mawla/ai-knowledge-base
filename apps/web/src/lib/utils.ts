import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

/** Later Tailwind utilities override earlier ones. */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
