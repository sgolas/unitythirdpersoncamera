/**
 * Common rental-car profiles with typical real-world combined fuel economy,
 * so you can pick your rental instead of hunting for its consumption figure.
 * Economy is stored canonically in litres / 100 km; the Fuel tab converts it to
 * whatever unit you're using. Figures are representative averages for the model
 * family (they vary by exact trim/engine) — tweak after picking if you know
 * your car's real number.
 */
import type { FuelType } from '../types';

export type CarClass = 'city' | 'supermini' | 'compact' | 'suv' | 'large' | 'van';

/** Display order + labels for the vehicle-class option groups. */
export const CAR_CLASSES: { key: CarClass; label: string }[] = [
  { key: 'city',      label: 'City cars' },
  { key: 'supermini', label: 'Superminis' },
  { key: 'compact',   label: 'Compact' },
  { key: 'suv',       label: 'SUV & crossover' },
  { key: 'large',     label: 'Midsize & estate' },
  { key: 'van',       label: 'Vans & minibuses' },
];

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

  /* ══ North America ═══════════════════════════════════════════════ */
  // Compact
  { id: 'na-corolla',  make: 'Toyota',     model: 'Corolla',        region: 'na', klass: 'compact', l100: 7.1, fuel: 'petrol' },
  { id: 'na-elantra',  make: 'Hyundai',    model: 'Elantra',        region: 'na', klass: 'compact', l100: 6.7, fuel: 'petrol' },
  { id: 'na-sentra',   make: 'Nissan',     model: 'Sentra',         region: 'na', klass: 'compact', l100: 7.1, fuel: 'petrol' },
  // Midsize
  { id: 'na-camry',    make: 'Toyota',     model: 'Camry',          region: 'na', klass: 'large', l100: 7.6, fuel: 'petrol' },
  { id: 'na-altima',   make: 'Nissan',     model: 'Altima',         region: 'na', klass: 'large', l100: 8.1, fuel: 'petrol' },
  { id: 'na-malibu',   make: 'Chevrolet',  model: 'Malibu',         region: 'na', klass: 'large', l100: 7.8, fuel: 'petrol' },
  // SUV & crossover
  { id: 'na-escape',   make: 'Ford',       model: 'Escape',         region: 'na', klass: 'suv', l100: 8.1, fuel: 'petrol' },
  { id: 'na-rav4',     make: 'Toyota',     model: 'RAV4',           region: 'na', klass: 'suv', l100: 8.0, fuel: 'petrol' },
  { id: 'na-equinox',  make: 'Chevrolet',  model: 'Equinox',        region: 'na', klass: 'suv', l100: 8.7, fuel: 'petrol' },
  { id: 'na-grandchr', make: 'Jeep',       model: 'Grand Cherokee', region: 'na', klass: 'suv', l100: 11.2, fuel: 'petrol' },
];

export const carById = (id: string) => CAR_MODELS.find(c => c.id === id) ?? null;
