import type { SVGProps } from "react";
import {
  Blocks, Bold, Check, ChevronDown, ChevronRight, CircleAlert, Code, Columns2, Copy, Crosshair, ExternalLink, Eye, FileCode, Funnel, GripVertical, Clock,
  Image, Info, Italic, LayoutTemplate, Lightbulb, Link, List, ListTree, Minus, Moon, PanelRight, Plus, Quote, Redo2, Search, Settings, SlidersVertical,
  Square, SquareChevronDown, Strikethrough, Sun, TriangleAlert, Underline, Undo2, Upload, WandSparkles, X, type LucideIcon,
} from "lucide-react";

const icons = {
  blocks: Blocks, bold: Bold, builder: LayoutTemplate, check: Check, chevronDown: ChevronDown, chevronRight: ChevronRight, close: X, code: Code, columns: Columns2,
  copy: Copy, crosshair: Crosshair, error: CircleAlert, external: ExternalLink, file: FileCode, filter: Funnel, grip: GripVertical, history: Clock, image: Image,
  info: Info, italic: Italic, lightbulb: Lightbulb, link: Link, list: List, maximize: Square, minimize: Minus, moon: Moon, outline: ListTree, panelRight: PanelRight,
  plus: Plus, preview: Eye, quote: Quote, redo: Redo2, search: Search, settings: Settings, sliders: SlidersVertical, spoiler: SquareChevronDown, strike: Strikethrough,
  sun: Sun, underline: Underline, undo: Undo2, upload: Upload, wand: WandSparkles, warning: TriangleAlert,
} satisfies Record<string, LucideIcon>;
export type IconName = keyof typeof icons;

/** Lucide icon at the UI size (16px; the activity bar makes them 18px in CSS). */
export function Icon({ name, className = "ui-icon", ...props }: { name: IconName; className?: string } & Omit<SVGProps<SVGSVGElement>, "ref">) {
  const Glyph = icons[name];
  return <Glyph className={className} size={16} strokeWidth={1.75} absoluteStrokeWidth aria-hidden="true" {...props} />;
}
