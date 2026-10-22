import type { ReactNode, SVGProps } from "react";

type IconName = "code" | "external" | "file" | "list" | "outline" | "preview" | "quote" | "search" | "settings" | "warning";
const paths: Record<IconName, ReactNode> = {
  code: <><path d="m8 9-3 3 3 3"/><path d="m16 9 3 3-3 3"/><path d="m14 5-4 14"/></>,
  external: <><path d="M14 5h5v5"/><path d="m10 14 9-9"/><path d="M19 13v6H5V5h6"/></>,
  file: <><path d="M7 3h7l4 4v14H7z"/><path d="M14 3v5h5"/></>,
  list: <><path d="M9 6h11M9 12h11M9 18h11"/><path d="M4 6h.01M4 12h.01M4 18h.01"/></>,
  outline: <><rect x="4" y="3" width="16" height="18" rx="2"/><path d="M8 8h8M8 12h8M8 16h5"/></>,
  preview: <><path d="M2.5 12s3.5-6 9.5-6 9.5 6 9.5 6-3.5 6-9.5 6-9.5-6-9.5-6Z"/><circle cx="12" cy="12" r="2.5"/></>,
  quote: <><path d="M7 10h4v7H5v-5a5 5 0 0 1 5-5"/><path d="M16 10h4v7h-6v-5a5 5 0 0 1 5-5"/></>,
  search: <><circle cx="11" cy="11" r="6"/><path d="m16 16 4 4"/></>,
  settings: <><circle cx="12" cy="12" r="3"/><path d="M19 15.5a8 8 0 0 0 .5-1.5l2-1v-2l-2-1a8 8 0 0 0-.5-1.5l.8-2.1-1.4-1.4-2.1.8a8 8 0 0 0-1.5-.6l-1-2h-2l-1 2a8 8 0 0 0-1.5.6L7.2 5 5.8 6.4l.8 2.1A8 8 0 0 0 6 10l-2 1v2l2 1a8 8 0 0 0 .6 1.5l-.8 2.1L7.2 19l2.1-.8a8 8 0 0 0 1.5.6l1 2h2l1-2a8 8 0 0 0 1.5-.6l2.1.8 1.4-1.4z"/></>,
  warning: <><path d="M12 3 2.5 20h19Z"/><path d="M12 9v4M12 17h.01"/></>,
};

export function Icon({ name, ...props }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return <svg className="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...props}>{paths[name]}</svg>;
}
