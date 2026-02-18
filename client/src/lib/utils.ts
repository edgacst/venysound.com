import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function resolveStorageUrl(path: string): string {
  if (path.startsWith('http')) return path;
  if (path.startsWith('/objects/')) return path;
  return `/objects/${path}`;
}
