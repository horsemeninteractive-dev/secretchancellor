import React, { useState, useRef, useEffect } from 'react';
import { cn } from '../lib/utils';

interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactElement;
  className?: string;
  position?: 'top' | 'bottom' | 'left' | 'right';
}

export const Tooltip = ({ content, children, className, position = 'bottom' }: TooltipProps) => {
  const [isVisible, setIsVisible] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const show = () => setIsVisible(true);
  const hide = () => {
    setIsVisible(false);
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  // Long press for mobile
  const handleTouchStart = () => {
    timerRef.current = setTimeout(() => {
      show();
    }, 500);
  };

  const handleTouchEnd = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        hide();
      }
    };

    if (isVisible) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isVisible]);

  const positionClasses = {
    top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
    bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
    left: 'right-full top-1/2 -translate-y-1/2 mr-2',
    right: 'left-full top-1/2 -translate-y-1/2 ml-2',
  };

  return (
    <div 
      ref={containerRef}
      className="relative inline-block"
      onMouseEnter={show}
      onMouseLeave={hide}
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {children}
      {isVisible && (
        <div className={cn(
          "absolute z-[100] px-2 py-1 bg-surface border border-default rounded-lg shadow-2xl pointer-events-none transition-opacity duration-200 min-w-[80px] text-center",
          positionClasses[position],
          className
        )}>
          <div className="text-[10px] font-mono text-primary uppercase tracking-wider whitespace-nowrap">
            {content}
          </div>
        </div>
      )}
    </div>
  );
};
