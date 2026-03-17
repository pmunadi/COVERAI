
export type TextStyle = 'title' | 'subtitle' | 'text';

export interface TextField {
  id: string;
  content: string;
  style: TextStyle;
}

export type FontStyle = 'serif' | 'sans_serif';
export type Orientation = 'vertical' | 'horizontal';

export interface LayoutItem {
  id: string;
  x: number; // percentage 0-100
  y: number; // percentage 0-100
  align: 'left' | 'center' | 'right';
  width: number; // percentage 0-100
  color?: string; // hex or color name
  fontSize?: number; // manual font size override
  fontWeight?: string | number;
  italic?: boolean;
  offsetY?: number; // manual vertical offset in %
  offsetX?: number; // manual horizontal offset in %
  scale?: number; // manual scale multiplier (1.0 default)
}

export type LayoutPreset = 'left' | 'center' | 'right';

export interface DesignLayout {
  items: LayoutItem[];
  suggestedTextColor?: 'white' | 'black';
}
