// Aus dem Backend gespiegelte Typen (backend/src/core/typen.ts) –
// bei Änderungen dort hier nachziehen.

export type KantenTyp = 'eben' | 'treppe' | 'rolltreppe' | 'aufzug' | 'rampe';
export type Gehprofil = 'zuegig' | 'normal' | 'langsam';
export type RoutenVariante = 'schnellste' | 'einfachste' | 'barrierefrei';
export type Stufe = 1 | 2 | 3;
export type Ampelfarbe = 'gruen' | 'gelb' | 'rot';

export interface Schritt {
  text: string;
  typ: KantenTyp | 'start' | 'ziel';
  distanzM?: number;
}

export interface RouteErgebnis {
  stufe: Stufe;
  schritte: Schritt[];
  gehzeitSek: number;
  karte?: Record<string, unknown>;
  hinweise: string[];
}

export interface BahnhofTreffer {
  name: string;
  eva: string;
  lat: number;
  lon: number;
}

export interface TafelEintrag {
  zug: string;
  zeitSoll: string;
  zeitIst?: string;
  gleisSoll: string;
  gleisIst?: string;
  ziel: string;
}

export interface RouteParameter {
  eva: string;
  gleisAn: string;
  gleisAb: string;
  zugAn?: string;
  wagen?: string;
  abschnitt?: string;
  profil: Gehprofil;
  variante: RoutenVariante;
}
