"use client";

/**
 * components/workspace/workspace-scroll-restore.tsx
 *
 * Invisible client component that saves and restores scroll position
 * for operational workspace pages via sessionStorage.
 *
 * Save: on component unmount (page navigation)
 * Restore: on mount, via requestAnimationFrame (after layout paint)
 *
 * Key format: ws-scroll:/path/name
 *
 * Usage: <WorkspaceScrollRestore /> anywhere in a page's JSX tree.
 */

import { useEffect, useRef } from "react";
import { usePathname }       from "next/navigation";

export function WorkspaceScrollRestore() {
  const pathname = usePathname();
  const key      = `ws-scroll:${pathname}`;
  const restored = useRef(false);

  useEffect(() => {
    if (restored.current) return;
    restored.current = true;

    const saved = sessionStorage.getItem(key);
    if (saved) {
      const y = parseInt(saved, 10);
      if (!isNaN(y) && y > 0) {
        requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" }));
      }
    }

    return () => {
      const y = Math.round(window.scrollY);
      if (y > 0) {
        sessionStorage.setItem(key, String(y));
      } else {
        sessionStorage.removeItem(key);
      }
    };
  }, [key]);

  return null;
}
