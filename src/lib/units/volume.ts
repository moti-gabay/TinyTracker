/**
 * Volume is ALWAYS stored in millilitres. Units are a display concern only,
 * so a family with two phones set to different units still shares one dataset.
 */
import { StorageKeys, readLocal, writeLocal } from '@/lib/storage'
import { t } from '@/lib/i18n'

export type VolumeUnit = 'ml' | 'oz'

const ML_PER_OZ = 29.5735

export function getUnit(): VolumeUnit {
  return readLocal(StorageKeys.units) === 'oz' ? 'oz' : 'ml'
}

export function setUnit(unit: VolumeUnit): void {
  writeLocal(StorageKeys.units, unit)
}

export function mlToOz(ml: number): number {
  return ml / ML_PER_OZ
}

export function ozToMl(oz: number): number {
  return oz * ML_PER_OZ
}

/** `120 ml` / `4.1 oz`. */
export function formatVolume(ml: number, unit: VolumeUnit = getUnit()): string {
  return unit === 'oz'
    ? t('unit.oz', { n: mlToOz(ml).toFixed(1) })
    : t('unit.ml', { n: Math.round(ml) })
}

/** Step size for the +/- stepper, in ml, chosen per display unit. */
export function stepMl(unit: VolumeUnit = getUnit()): number {
  return unit === 'oz' ? ML_PER_OZ / 2 : 10
}
