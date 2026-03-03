// favorites-utils.ts — pure utility for scaling a favorite's nutrition to a different qty.
// Extracted from FavoritesDropdown so it can be shared without violating react-refresh rules.

import type { CalorieLogFavorite } from '../../types'

// scaleFavorite scales a favorite's nutrition to a different serving quantity.
// baseQty defaults to 1 when null to avoid division by zero.
export function scaleFavorite(fav: CalorieLogFavorite, qty: number) {
  const baseQty = fav.qty ?? 1
  const ratio = baseQty > 0 ? qty / baseQty : qty
  return {
    qty,
    uom: fav.uom,
    calories:  Math.round(fav.calories * ratio),
    protein_g: fav.protein_g != null ? Math.round(fav.protein_g * ratio * 10) / 10 : null,
    carbs_g:   fav.carbs_g   != null ? Math.round(fav.carbs_g   * ratio * 10) / 10 : null,
    fat_g:     fav.fat_g     != null ? Math.round(fav.fat_g     * ratio * 10) / 10 : null,
  }
}
