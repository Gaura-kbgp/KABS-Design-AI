
export type CabinetColor = 
  | 'Oyster' | 'Shoji' | 'Naval' | 'Espresso' 
  | 'Saddle' | 'Slate Blue' | 'Arctic' | 'Taupe' 
  | 'Pebble' | 'Walnut' | 'Oak' | 'White';

export type DoorStyle = 'Shaker' | 'Flat Panel';

export type WallColor = 
  | 'Pure White' | 'Off White' | 'Light Gray' 
  | 'Beige' | 'Soft Blue';

export type Countertop = 
  | 'White Quartz' | 'Black Granite' 
  | 'Marble Light' | 'Concrete Gray';

export type ViewMode = '3D Realism' | '2D Architectural Plan';

export interface DesignSettings {
  viewMode: ViewMode;
  baseCabinetColor: CabinetColor; // Renamed/Added
  wallCabinetColor: CabinetColor; // Added
  doorStyle: DoorStyle;
  wallColor: WallColor;
  countertop: Countertop;
}

export interface RenderState {
  isLoading: boolean;
  generatedImage: string | null;
  error: string | null;
  seed: number; // Added seed for consistent generation
}

export const DEFAULT_SETTINGS: DesignSettings = {
  viewMode: '3D Realism',
  baseCabinetColor: 'White', // Default
  wallCabinetColor: 'White', // Default
  doorStyle: 'Shaker',
  wallColor: 'Pure White',
  countertop: 'White Quartz',
};

// Mapping for more descriptive prompts
export const COLOR_PROMPT_MAP: Record<CabinetColor, string> = {
  'Oyster': 'Oyster light gray beige',
  'Shoji': 'Shoji warm creamy white',
  'Naval': 'Deep Naval blue',
  'Espresso': 'Dark Espresso wood',
  'Saddle': 'Saddle brown wood',
  'Slate Blue': 'Muted Slate Blue',
  'Arctic': 'Cool Arctic White',
  'Taupe': 'Taupe brownish gray',
  'Pebble': 'Pebble light gray',
  'Walnut': 'Natural Walnut wood grain',
  'Oak': 'Natural Oak wood grain',
  'White': 'Pure White',
};
