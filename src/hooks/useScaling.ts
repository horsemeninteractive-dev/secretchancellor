import { useState, useEffect, RefObject } from 'react';

export function useScaling(containerRef: RefObject<HTMLElement>, targetWidth: number = 1280, targetHeight: number = 720) {
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const updateScale = () => {
      if (!containerRef.current) return;
      
      const containerWidth = containerRef.current.clientWidth;
      const containerHeight = containerRef.current.clientHeight;
      
      const scaleX = containerWidth / targetWidth;
      const scaleY = containerHeight / targetHeight;
      
      // We want to fit the content, so we take the minimum scale
      // But we also don't want to scale UP too much if it's a huge screen
      // and we don't want to scale DOWN so much that it's unreadable
      const newScale = Math.min(scaleX, scaleY, 1.2);
      setScale(Math.max(newScale, 0.5));
    };

    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, [containerRef, targetWidth, targetHeight]);

  return scale;
}
