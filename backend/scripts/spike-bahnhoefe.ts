// Stichprobe für den Datenrealitäts-Spike: 40 Bahnhöfe quer durch Deutschland,
// drei Größenkategorien. Koordinaten = Bahnhofsmitte (Radius 400 m der Abfrage
// verzeiht kleine Abweichungen).
export interface SpikeBahnhof {
  name: string;
  slug: string;
  lat: number;
  lon: number;
  kategorie: 'gross' | 'mittel' | 'klein';
}

export const SPIKE_BAHNHOEFE: SpikeBahnhof[] = [
  // --- groß: Fernverkehrsknoten (13) ---
  { name: 'Berlin Hbf', slug: 'berlin-hbf', lat: 52.5251, lon: 13.3694, kategorie: 'gross' },
  { name: 'Hamburg Hbf', slug: 'hamburg-hbf', lat: 53.553, lon: 10.0069, kategorie: 'gross' },
  { name: 'München Hbf', slug: 'muenchen-hbf', lat: 48.1402, lon: 11.5586, kategorie: 'gross' },
  { name: 'Frankfurt (Main) Hbf', slug: 'frankfurt-hbf', lat: 50.107, lon: 8.6632, kategorie: 'gross' },
  { name: 'Köln Hbf', slug: 'koeln-hbf', lat: 50.9432, lon: 6.9586, kategorie: 'gross' },
  { name: 'Stuttgart Hbf', slug: 'stuttgart-hbf', lat: 48.784, lon: 9.1817, kategorie: 'gross' },
  { name: 'Hannover Hbf', slug: 'hannover-hbf', lat: 52.3767, lon: 9.741, kategorie: 'gross' },
  { name: 'Leipzig Hbf', slug: 'leipzig-hbf', lat: 51.3455, lon: 12.3821, kategorie: 'gross' },
  { name: 'Nürnberg Hbf', slug: 'nuernberg-hbf', lat: 49.4456, lon: 11.0829, kategorie: 'gross' },
  { name: 'Dresden Hbf', slug: 'dresden-hbf', lat: 51.04, lon: 13.732, kategorie: 'gross' },
  { name: 'Duisburg Hbf', slug: 'duisburg-hbf', lat: 51.4297, lon: 6.7758, kategorie: 'gross' },
  { name: 'Mannheim Hbf', slug: 'mannheim-hbf', lat: 49.4794, lon: 8.47, kategorie: 'gross' },
  { name: 'Erfurt Hbf', slug: 'erfurt-hbf', lat: 50.9724, lon: 11.0384, kategorie: 'gross' },
  // --- mittel: Regionalknoten / kleinere Fernverkehrshalte (14) ---
  { name: 'Gütersloh Hbf', slug: 'guetersloh', lat: 51.9063, lon: 8.3853, kategorie: 'mittel' },
  { name: 'Gießen', slug: 'giessen', lat: 50.5791, lon: 8.6624, kategorie: 'mittel' },
  { name: 'Fulda', slug: 'fulda', lat: 50.5544, lon: 9.6839, kategorie: 'mittel' },
  { name: 'Marburg (Lahn)', slug: 'marburg', lat: 50.819, lon: 8.7743, kategorie: 'mittel' },
  { name: 'Lüneburg', slug: 'lueneburg', lat: 53.2497, lon: 10.4198, kategorie: 'mittel' },
  { name: 'Rosenheim', slug: 'rosenheim', lat: 47.85, lon: 12.119, kategorie: 'mittel' },
  { name: 'Konstanz', slug: 'konstanz', lat: 47.6591, lon: 9.1697, kategorie: 'mittel' },
  { name: 'Trier Hbf', slug: 'trier-hbf', lat: 49.757, lon: 6.6516, kategorie: 'mittel' },
  { name: 'Cottbus Hbf', slug: 'cottbus-hbf', lat: 51.7505, lon: 14.3244, kategorie: 'mittel' },
  { name: 'Schwerin Hbf', slug: 'schwerin-hbf', lat: 53.6347, lon: 11.4074, kategorie: 'mittel' },
  { name: 'Osnabrück Hbf', slug: 'osnabrueck-hbf', lat: 52.2727, lon: 8.0619, kategorie: 'mittel' },
  { name: 'Heilbronn Hbf', slug: 'heilbronn-hbf', lat: 49.1427, lon: 9.2109, kategorie: 'mittel' },
  { name: 'Bamberg', slug: 'bamberg', lat: 49.9007, lon: 10.8994, kategorie: 'mittel' },
  { name: 'Uelzen', slug: 'uelzen', lat: 52.9698, lon: 10.5545, kategorie: 'mittel' },
  // --- klein: Regionalhalte / Landbahnhöfe (13) ---
  { name: 'Zernitz', slug: 'zernitz', lat: 52.9436, lon: 12.2839, kategorie: 'klein' },
  { name: 'Bad Kleinen', slug: 'bad-kleinen', lat: 53.7583, lon: 11.468, kategorie: 'klein' },
  { name: 'Riedstadt-Goddelau', slug: 'riedstadt-goddelau', lat: 49.8358, lon: 8.4945, kategorie: 'klein' },
  { name: 'Kirchhain (Bz Kassel)', slug: 'kirchhain', lat: 50.8236, lon: 8.907, kategorie: 'klein' },
  { name: 'Treuchtlingen', slug: 'treuchtlingen', lat: 48.9611, lon: 10.908, kategorie: 'klein' },
  { name: 'Neuenmarkt-Wirsberg', slug: 'neuenmarkt-wirsberg', lat: 50.0906, lon: 11.5807, kategorie: 'klein' },
  { name: 'Angermünde', slug: 'angermuende', lat: 53.0148, lon: 13.9989, kategorie: 'klein' },
  { name: 'Büchen', slug: 'buechen', lat: 53.475, lon: 10.622, kategorie: 'klein' },
  { name: 'Plattling', slug: 'plattling', lat: 48.7789, lon: 12.8778, kategorie: 'klein' },
  { name: 'Bebra', slug: 'bebra', lat: 50.9713, lon: 9.7908, kategorie: 'klein' },
  { name: 'Nauen', slug: 'nauen', lat: 52.6039, lon: 12.8735, kategorie: 'klein' },
  { name: 'Neustrelitz Hbf', slug: 'neustrelitz-hbf', lat: 53.3634, lon: 13.0634, kategorie: 'klein' },
  { name: 'Bad Hersfeld', slug: 'bad-hersfeld', lat: 50.8683, lon: 9.71, kategorie: 'klein' },
];
