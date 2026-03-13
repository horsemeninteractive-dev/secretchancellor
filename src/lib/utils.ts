import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getProxiedUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:') || url.startsWith('/')) return url;
  
  // If it's already proxied, don't proxy again
  if (url.includes('/proxy?url=')) return url;

  // If it's an external URL, proxy it
  if (url.startsWith('http')) {
    // Use absolute URL for proxy to ensure it works in all environments
    const proxyBase = window.location.origin + '/proxy?url=';
    return `${proxyBase}${encodeURIComponent(url)}`;
  }
  
  return url;
}
