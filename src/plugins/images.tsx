import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

/**
 * Picture previews from plugins (contributes.imagePreview): a resolver gives a data: URL for an
 * image address, or null when no plugin may load it. Until then (and without plugins) the
 * placeholder stays.
 */
export type ImageResolver = (url: string) => Promise<string | null>;
export const ImageResolverContext = createContext<ImageResolver | null>(null);

export function ResolvedImage({ url, fallback, className }: { url: string; fallback: ReactNode; className?: string }) {
  const resolve = useContext(ImageResolverContext);
  const [source, setSource] = useState<string | null>(null);
  useEffect(() => {
    setSource(null);
    if (!resolve || !/^https:\/\//i.test(url.trim())) return;
    let active = true;
    void resolve(url.trim()).then((value) => { if (active) setSource(value); });
    return () => { active = false; };
  }, [resolve, url]);
  return source ? <img className={className ?? "resolved-image"} src={source} alt="" draggable={false} /> : <>{fallback}</>;
}
