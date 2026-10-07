import type { Garment } from '../dal/entity/garment.entity';
import type { Outfit } from '../dal/entity/outfit.entity';

/** An outfit's garments in slot order, the order the builder saved; garments no slot names come last. */
export function garmentsInSlotOrder(outfit: Outfit): Garment[] {
  const garments = outfit.garments.getItems();
  const byId = new Map(garments.map((garment) => [garment.id, garment]));
  const ordered: Garment[] = [];
  for (const slot of outfit.slots ?? []) {
    const garment = slot.garmentId != null ? byId.get(slot.garmentId) : null;
    if (garment && !ordered.includes(garment)) ordered.push(garment);
  }
  return [...ordered, ...garments.filter((g) => !ordered.includes(g))];
}
