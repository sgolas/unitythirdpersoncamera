/**
 * Common rental-car profiles with typical real-world combined fuel economy,
 * so you can pick your rental instead of hunting for its consumption figure.
 * Economy is stored canonically in litres / 100 km; the Fuel tab converts it to
 * whatever unit you're using. Figures are representative averages for the model
 * family (they vary by exact trim/engine) — tweak after picking if you know
 * your car's real number.
 */
import type { FuelType } from '../types';

export type CarClass = 'city' | 'supermini' | 'compact' | 'suv' | 'large' | 'van' | 'pickup' | 'ev';

/** Display order + labels for the vehicle-class option groups. */
export const CAR_CLASSES: { key: CarClass; label: string }[] = [
  { key: 'city',      label: 'City cars' },
  { key: 'supermini', label: 'Superminis' },
  { key: 'compact',   label: 'Compact' },
  { key: 'suv',       label: 'SUV & crossover' },
  { key: 'large',     label: 'Midsize & estate' },
  { key: 'van',       label: 'Vans & minibuses' },
  { key: 'pickup',    label: 'Pickup trucks' },
  { key: 'ev',        label: 'Electric' },
];

/** For electric models, `l100` holds kWh / 100 km (energy per 100 km). */

export interface CarModel {
  id: string;
  make: string;
  model: string;
  region: 'eu' | 'na';
  klass: CarClass;
  l100: number;          // petrol combined litres / 100 km
  fuel: FuelType;        // the variant most commonly rented
  dieselL100?: number;   // diesel variant economy, when one is commonly rented
}

/** A model's economy for a given fuel: its diesel figure if picked & available,
 *  otherwise the (petrol) base figure. */
export function carEconomy(c: CarModel, fuel: FuelType): number {
  return fuel === 'diesel' && c.dieselL100 ? c.dieselL100 : c.l100;
}

export const CAR_MODELS: CarModel[] = [
  /* ══ Europe ══════════════════════════════════════════════════════ */
  // City cars
  { id: 'eu-500',      make: 'Fiat',       model: '500',      region: 'eu', klass: 'city', l100: 5.1, fuel: 'petrol' },
  { id: 'eu-panda',    make: 'Fiat',       model: 'Panda',    region: 'eu', klass: 'city', l100: 5.2, fuel: 'petrol' },
  { id: 'eu-aygo',     make: 'Toyota',     model: 'Aygo X',   region: 'eu', klass: 'city', l100: 4.6, fuel: 'petrol' },
  { id: 'eu-i10',      make: 'Hyundai',    model: 'i10',      region: 'eu', klass: 'city', l100: 5.0, fuel: 'petrol' },
  { id: 'eu-picanto',  make: 'Kia',        model: 'Picanto',  region: 'eu', klass: 'city', l100: 5.0, fuel: 'petrol' },
  { id: 'eu-sandero',  make: 'Dacia',      model: 'Sandero',  region: 'eu', klass: 'city', l100: 5.5, fuel: 'petrol' },
  // Superminis
  { id: 'eu-clio',     make: 'Renault',    model: 'Clio',     region: 'eu', klass: 'supermini', l100: 5.2, fuel: 'petrol', dieselL100: 4.3 },
  { id: 'eu-208',      make: 'Peugeot',    model: '208',      region: 'eu', klass: 'supermini', l100: 5.3, fuel: 'petrol', dieselL100: 4.2 },
  { id: 'eu-fiesta',   make: 'Ford',       model: 'Fiesta',   region: 'eu', klass: 'supermini', l100: 5.3, fuel: 'petrol', dieselL100: 4.4 },
  { id: 'eu-corsa',    make: 'Opel',       model: 'Corsa',    region: 'eu', klass: 'supermini', l100: 5.4, fuel: 'petrol', dieselL100: 4.4 },
  { id: 'eu-polo',     make: 'Volkswagen', model: 'Polo',     region: 'eu', klass: 'supermini', l100: 5.4, fuel: 'petrol', dieselL100: 4.5 },
  { id: 'eu-yaris',    make: 'Toyota',     model: 'Yaris',    region: 'eu', klass: 'supermini', l100: 4.8, fuel: 'petrol' },
  { id: 'eu-ibiza',    make: 'SEAT',       model: 'Ibiza',    region: 'eu', klass: 'supermini', l100: 5.4, fuel: 'petrol', dieselL100: 4.4 },
  { id: 'eu-fabia',    make: 'Škoda',      model: 'Fabia',    region: 'eu', klass: 'supermini', l100: 5.3, fuel: 'petrol', dieselL100: 4.4 },
  { id: 'eu-i20',      make: 'Hyundai',    model: 'i20',      region: 'eu', klass: 'supermini', l100: 5.3, fuel: 'petrol' },
  { id: 'eu-c3',       make: 'Citroën',    model: 'C3',       region: 'eu', klass: 'supermini', l100: 5.4, fuel: 'petrol', dieselL100: 4.3 },
  { id: 'eu-micra',    make: 'Nissan',     model: 'Micra',    region: 'eu', klass: 'supermini', l100: 5.3, fuel: 'petrol' },
  { id: 'eu-mini',     make: 'MINI',       model: 'Cooper',   region: 'eu', klass: 'supermini', l100: 5.6, fuel: 'petrol', dieselL100: 4.3 },
  { id: 'eu-a1',       make: 'Audi',       model: 'A1',       region: 'eu', klass: 'supermini', l100: 5.5, fuel: 'petrol' },
  // Compact
  { id: 'eu-golf',     make: 'Volkswagen', model: 'Golf',     region: 'eu', klass: 'compact', l100: 5.9, fuel: 'petrol', dieselL100: 4.9 },
  { id: 'eu-octavia',  make: 'Škoda',      model: 'Octavia',  region: 'eu', klass: 'compact', l100: 6.2, fuel: 'diesel', dieselL100: 5.0 },
  { id: 'eu-focus',    make: 'Ford',       model: 'Focus',    region: 'eu', klass: 'compact', l100: 5.8, fuel: 'petrol', dieselL100: 4.6 },
  { id: 'eu-leon',     make: 'SEAT',       model: 'Leon',     region: 'eu', klass: 'compact', l100: 5.7, fuel: 'petrol', dieselL100: 4.6 },
  { id: 'eu-megane',   make: 'Renault',    model: 'Mégane',   region: 'eu', klass: 'compact', l100: 5.8, fuel: 'petrol', dieselL100: 4.6 },
  { id: 'eu-308',      make: 'Peugeot',    model: '308',      region: 'eu', klass: 'compact', l100: 5.6, fuel: 'petrol', dieselL100: 4.5 },
  { id: 'eu-astra',    make: 'Opel',       model: 'Astra',    region: 'eu', klass: 'compact', l100: 5.7, fuel: 'petrol', dieselL100: 4.6 },
  { id: 'eu-corolla',  make: 'Toyota',     model: 'Corolla',  region: 'eu', klass: 'compact', l100: 5.0, fuel: 'petrol' },
  { id: 'eu-aclass',   make: 'Mercedes',   model: 'A-Class',  region: 'eu', klass: 'compact', l100: 6.0, fuel: 'petrol', dieselL100: 4.7 },
  { id: 'eu-a3',       make: 'Audi',       model: 'A3',       region: 'eu', klass: 'compact', l100: 5.9, fuel: 'petrol', dieselL100: 4.6 },
  // SUV & crossover
  { id: 'eu-qashqai',  make: 'Nissan',     model: 'Qashqai',  region: 'eu', klass: 'suv', l100: 6.4, fuel: 'petrol', dieselL100: 5.3 },
  { id: 'eu-2008',     make: 'Peugeot',    model: '2008',     region: 'eu', klass: 'suv', l100: 5.8, fuel: 'petrol', dieselL100: 4.6 },
  { id: 'eu-captur',   make: 'Renault',    model: 'Captur',   region: 'eu', klass: 'suv', l100: 5.9, fuel: 'petrol', dieselL100: 4.7 },
  { id: 'eu-troc',     make: 'Volkswagen', model: 'T-Roc',    region: 'eu', klass: 'suv', l100: 6.2, fuel: 'petrol', dieselL100: 5.0 },
  { id: 'eu-duster',   make: 'Dacia',      model: 'Duster',   region: 'eu', klass: 'suv', l100: 6.4, fuel: 'petrol', dieselL100: 5.3 },
  { id: 'eu-puma',     make: 'Ford',       model: 'Puma',     region: 'eu', klass: 'suv', l100: 5.8, fuel: 'petrol' },
  { id: 'eu-tucson',   make: 'Hyundai',    model: 'Tucson',   region: 'eu', klass: 'suv', l100: 6.8, fuel: 'petrol', dieselL100: 5.4 },
  { id: 'eu-sportage', make: 'Kia',        model: 'Sportage', region: 'eu', klass: 'suv', l100: 6.8, fuel: 'petrol', dieselL100: 5.4 },
  { id: 'eu-tiguan',   make: 'Volkswagen', model: 'Tiguan',   region: 'eu', klass: 'suv', l100: 7.0, fuel: 'petrol', dieselL100: 5.6 },
  { id: 'eu-3008',     make: 'Peugeot',    model: '3008',     region: 'eu', klass: 'suv', l100: 6.5, fuel: 'petrol', dieselL100: 5.2 },
  { id: 'eu-xc40',     make: 'Volvo',      model: 'XC40',     region: 'eu', klass: 'suv', l100: 7.0, fuel: 'petrol' },
  // Midsize & estate
  { id: 'eu-passat',   make: 'Volkswagen', model: 'Passat',   region: 'eu', klass: 'large', l100: 6.2, fuel: 'diesel', dieselL100: 4.9 },
  { id: 'eu-superb',   make: 'Škoda',      model: 'Superb',   region: 'eu', klass: 'large', l100: 6.3, fuel: 'diesel', dieselL100: 4.9 },
  { id: 'eu-3series',  make: 'BMW',        model: '3 Series', region: 'eu', klass: 'large', l100: 6.2, fuel: 'petrol', dieselL100: 4.7 },
  { id: 'eu-jogger',   make: 'Dacia',      model: 'Jogger',   region: 'eu', klass: 'large', l100: 6.0, fuel: 'petrol' },
  { id: 'eu-touran',   make: 'Volkswagen', model: 'Touran',   region: 'eu', klass: 'large', l100: 6.4, fuel: 'diesel', dieselL100: 5.2 },
  // Vans & minibuses (usually diesel)
  { id: 'eu-trafic',   make: 'Renault',    model: 'Trafic (9-seat)',   region: 'eu', klass: 'van', l100: 8.5, fuel: 'diesel', dieselL100: 7.5 },
  { id: 'eu-vito',     make: 'Mercedes',   model: 'Vito (9-seat)',     region: 'eu', klass: 'van', l100: 8.6, fuel: 'diesel', dieselL100: 7.6 },
  { id: 'eu-transp',   make: 'Volkswagen', model: 'Transporter',       region: 'eu', klass: 'van', l100: 8.8, fuel: 'diesel', dieselL100: 7.8 },
  // Hybrids (petrol, very efficient)
  { id: 'eu-corolla-h',make: 'Toyota',     model: 'Corolla Hybrid',    region: 'eu', klass: 'compact', l100: 4.6, fuel: 'petrol' },
  { id: 'eu-chr',      make: 'Toyota',     model: 'C-HR Hybrid',       region: 'eu', klass: 'suv',     l100: 5.3, fuel: 'petrol' },
  // Electric (l100 field holds kWh / 100 km)
  { id: 'eu-tesla3',   make: 'Tesla',      model: 'Model 3',           region: 'eu', klass: 'ev', l100: 15.0, fuel: 'electric' },
  { id: 'eu-teslay',   make: 'Tesla',      model: 'Model Y',           region: 'eu', klass: 'ev', l100: 16.5, fuel: 'electric' },
  { id: 'eu-id3',      make: 'Volkswagen', model: 'ID.3',              region: 'eu', klass: 'ev', l100: 16.0, fuel: 'electric' },
  { id: 'eu-id4',      make: 'Volkswagen', model: 'ID.4',              region: 'eu', klass: 'ev', l100: 17.5, fuel: 'electric' },
  { id: 'eu-megane-e', make: 'Renault',    model: 'Mégane E-Tech',     region: 'eu', klass: 'ev', l100: 16.0, fuel: 'electric' },
  { id: 'eu-kona-e',   make: 'Hyundai',    model: 'Kona Electric',     region: 'eu', klass: 'ev', l100: 15.5, fuel: 'electric' },
  { id: 'eu-fiat500e', make: 'Fiat',       model: '500e',              region: 'eu', klass: 'ev', l100: 14.5, fuel: 'electric' },
  { id: 'eu-mg4',      make: 'MG',         model: 'MG4',               region: 'eu', klass: 'ev', l100: 16.5, fuel: 'electric' },

  /* ══ North America ═══════════════════════════════════════════════ */
  // City / subcompact
  { id: 'na-versa',    make: 'Nissan',     model: 'Versa',          region: 'na', klass: 'city', l100: 6.5, fuel: 'petrol' },
  { id: 'na-mirage',   make: 'Mitsubishi', model: 'Mirage',         region: 'na', klass: 'city', l100: 5.6, fuel: 'petrol' },
  // Compact
  { id: 'na-corolla',  make: 'Toyota',     model: 'Corolla',        region: 'na', klass: 'compact', l100: 7.1, fuel: 'petrol' },
  { id: 'na-civic',    make: 'Honda',      model: 'Civic',          region: 'na', klass: 'compact', l100: 6.7, fuel: 'petrol' },
  { id: 'na-elantra',  make: 'Hyundai',    model: 'Elantra',        region: 'na', klass: 'compact', l100: 6.7, fuel: 'petrol' },
  { id: 'na-sentra',   make: 'Nissan',     model: 'Sentra',         region: 'na', klass: 'compact', l100: 7.1, fuel: 'petrol' },
  { id: 'na-forte',    make: 'Kia',        model: 'Forte',          region: 'na', klass: 'compact', l100: 6.9, fuel: 'petrol' },
  { id: 'na-jetta',    make: 'Volkswagen', model: 'Jetta',          region: 'na', klass: 'compact', l100: 6.7, fuel: 'petrol' },
  { id: 'na-corolla-h',make: 'Toyota',     model: 'Corolla Hybrid', region: 'na', klass: 'compact', l100: 4.5, fuel: 'petrol' },
  // Midsize
  { id: 'na-camry',    make: 'Toyota',     model: 'Camry',          region: 'na', klass: 'large', l100: 7.6, fuel: 'petrol' },
  { id: 'na-accord',   make: 'Honda',      model: 'Accord',         region: 'na', klass: 'large', l100: 6.9, fuel: 'petrol' },
  { id: 'na-altima',   make: 'Nissan',     model: 'Altima',         region: 'na', klass: 'large', l100: 8.1, fuel: 'petrol' },
  { id: 'na-malibu',   make: 'Chevrolet',  model: 'Malibu',         region: 'na', klass: 'large', l100: 7.8, fuel: 'petrol' },
  { id: 'na-sonata',   make: 'Hyundai',    model: 'Sonata',         region: 'na', klass: 'large', l100: 7.4, fuel: 'petrol' },
  { id: 'na-charger',  make: 'Dodge',      model: 'Charger',        region: 'na', klass: 'large', l100: 10.8, fuel: 'petrol' },
  { id: 'na-camry-h',  make: 'Toyota',     model: 'Camry Hybrid',   region: 'na', klass: 'large', l100: 5.0, fuel: 'petrol' },
  // SUV & crossover
  { id: 'na-escape',   make: 'Ford',       model: 'Escape',         region: 'na', klass: 'suv', l100: 8.1, fuel: 'petrol' },
  { id: 'na-rav4',     make: 'Toyota',     model: 'RAV4',           region: 'na', klass: 'suv', l100: 8.0, fuel: 'petrol' },
  { id: 'na-rav4-h',   make: 'Toyota',     model: 'RAV4 Hybrid',    region: 'na', klass: 'suv', l100: 5.7, fuel: 'petrol' },
  { id: 'na-crv',      make: 'Honda',      model: 'CR-V',           region: 'na', klass: 'suv', l100: 8.0, fuel: 'petrol' },
  { id: 'na-rogue',    make: 'Nissan',     model: 'Rogue',          region: 'na', klass: 'suv', l100: 8.0, fuel: 'petrol' },
  { id: 'na-equinox',  make: 'Chevrolet',  model: 'Equinox',        region: 'na', klass: 'suv', l100: 8.7, fuel: 'petrol' },
  { id: 'na-compass',  make: 'Jeep',       model: 'Compass',        region: 'na', klass: 'suv', l100: 8.6, fuel: 'petrol' },
  { id: 'na-cx5',      make: 'Mazda',      model: 'CX-5',           region: 'na', klass: 'suv', l100: 8.4, fuel: 'petrol' },
  { id: 'na-highlander',make: 'Toyota',    model: 'Highlander',     region: 'na', klass: 'suv', l100: 9.0, fuel: 'petrol' },
  { id: 'na-explorer', make: 'Ford',       model: 'Explorer',       region: 'na', klass: 'suv', l100: 10.2, fuel: 'petrol' },
  { id: 'na-wrangler', make: 'Jeep',       model: 'Wrangler',       region: 'na', klass: 'suv', l100: 11.0, fuel: 'petrol' },
  { id: 'na-grandchr', make: 'Jeep',       model: 'Grand Cherokee', region: 'na', klass: 'suv', l100: 11.2, fuel: 'petrol' },
  // Minivans
  { id: 'na-pacifica', make: 'Chrysler',   model: 'Pacifica',       region: 'na', klass: 'van', l100: 9.8, fuel: 'petrol' },
  { id: 'na-carnival', make: 'Kia',        model: 'Carnival',       region: 'na', klass: 'van', l100: 10.7, fuel: 'petrol' },
  { id: 'na-sienna-h', make: 'Toyota',     model: 'Sienna Hybrid',  region: 'na', klass: 'van', l100: 6.6, fuel: 'petrol' },
  // Pickup trucks
  { id: 'na-tacoma',   make: 'Toyota',     model: 'Tacoma',         region: 'na', klass: 'pickup', l100: 11.2, fuel: 'petrol' },
  { id: 'na-f150',     make: 'Ford',       model: 'F-150',          region: 'na', klass: 'pickup', l100: 11.8, fuel: 'petrol' },
  { id: 'na-silverado',make: 'Chevrolet',  model: 'Silverado',      region: 'na', klass: 'pickup', l100: 12.0, fuel: 'petrol' },
  { id: 'na-ram',      make: 'RAM',        model: '1500',           region: 'na', klass: 'pickup', l100: 12.4, fuel: 'petrol' },
  // Electric (l100 field holds kWh / 100 km)
  { id: 'na-tesla3',   make: 'Tesla',      model: 'Model 3',        region: 'na', klass: 'ev', l100: 15.0, fuel: 'electric' },
  { id: 'na-teslay',   make: 'Tesla',      model: 'Model Y',        region: 'na', klass: 'ev', l100: 16.5, fuel: 'electric' },
  { id: 'na-machE',    make: 'Ford',       model: 'Mustang Mach-E', region: 'na', klass: 'ev', l100: 18.0, fuel: 'electric' },
  { id: 'na-ioniq5',   make: 'Hyundai',    model: 'Ioniq 5',        region: 'na', klass: 'ev', l100: 17.0, fuel: 'electric' },
  { id: 'na-bolt',     make: 'Chevrolet',  model: 'Bolt EUV',       region: 'na', klass: 'ev', l100: 15.0, fuel: 'electric' },
];

export const carById = (id: string) => CAR_MODELS.find(c => c.id === id) ?? null;
