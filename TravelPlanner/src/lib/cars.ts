/**
 * Common rental-car profiles with typical real-world combined fuel economy,
 * so you can pick your rental instead of hunting for its consumption figure.
 * Economy is stored canonically in litres / 100 km; the Fuel tab converts it to
 * whatever unit you're using. Figures are representative averages for the model
 * family (they vary by exact trim/engine) — tweak after picking if you know
 * your car's real number.
 */
import type { FuelType } from '../types';

export interface CarModel {
  id: string;
  make: string;
  model: string;
  region: 'eu' | 'na';
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
  // ── Europe — most common rental fleet models (diesel variant common) ──
  { id: 'eu-clio',     make: 'Renault',    model: 'Clio',     region: 'eu', l100: 5.2, fuel: 'petrol', dieselL100: 4.3 },
  { id: 'eu-208',      make: 'Peugeot',    model: '208',      region: 'eu', l100: 5.3, fuel: 'petrol', dieselL100: 4.2 },
  { id: 'eu-fiesta',   make: 'Ford',       model: 'Fiesta',   region: 'eu', l100: 5.3, fuel: 'petrol', dieselL100: 4.4 },
  { id: 'eu-corsa',    make: 'Opel',       model: 'Corsa',    region: 'eu', l100: 5.4, fuel: 'petrol', dieselL100: 4.4 },
  { id: 'eu-polo',     make: 'Volkswagen', model: 'Polo',     region: 'eu', l100: 5.4, fuel: 'petrol', dieselL100: 4.5 },
  { id: 'eu-500',      make: 'Fiat',       model: '500',      region: 'eu', l100: 5.1, fuel: 'petrol' },
  { id: 'eu-yaris',    make: 'Toyota',     model: 'Yaris',    region: 'eu', l100: 4.8, fuel: 'petrol' },
  { id: 'eu-golf',     make: 'Volkswagen', model: 'Golf',     region: 'eu', l100: 5.9, fuel: 'petrol', dieselL100: 4.9 },
  { id: 'eu-octavia',  make: 'Škoda',      model: 'Octavia',  region: 'eu', l100: 6.2, fuel: 'diesel', dieselL100: 5.0 },
  { id: 'eu-qashqai',  make: 'Nissan',     model: 'Qashqai',  region: 'eu', l100: 6.4, fuel: 'petrol', dieselL100: 5.3 },

  // ── North America — most common rental fleet models ───────────────
  { id: 'na-corolla',  make: 'Toyota',     model: 'Corolla',        region: 'na', l100: 7.1, fuel: 'petrol' },
  { id: 'na-elantra',  make: 'Hyundai',    model: 'Elantra',        region: 'na', l100: 6.7, fuel: 'petrol' },
  { id: 'na-sentra',   make: 'Nissan',     model: 'Sentra',         region: 'na', l100: 7.1, fuel: 'petrol' },
  { id: 'na-camry',    make: 'Toyota',     model: 'Camry',          region: 'na', l100: 7.6, fuel: 'petrol' },
  { id: 'na-altima',   make: 'Nissan',     model: 'Altima',         region: 'na', l100: 8.1, fuel: 'petrol' },
  { id: 'na-malibu',   make: 'Chevrolet',  model: 'Malibu',         region: 'na', l100: 7.8, fuel: 'petrol' },
  { id: 'na-escape',   make: 'Ford',       model: 'Escape',         region: 'na', l100: 8.1, fuel: 'petrol' },
  { id: 'na-rav4',     make: 'Toyota',     model: 'RAV4',           region: 'na', l100: 8.0, fuel: 'petrol' },
  { id: 'na-equinox',  make: 'Chevrolet',  model: 'Equinox',        region: 'na', l100: 8.7, fuel: 'petrol' },
  { id: 'na-grandchr', make: 'Jeep',       model: 'Grand Cherokee', region: 'na', l100: 11.2, fuel: 'petrol' },
];

export const carById = (id: string) => CAR_MODELS.find(c => c.id === id) ?? null;
