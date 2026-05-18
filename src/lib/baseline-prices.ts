// Baseline (non-deal) typical Swedish supermarket prices for staples in SEK.
// Used by the cook engine to compare against scraped deals.

export type StoreId = "ICA" | "Coop" | "Willys" | "Lidl" | "Hemköp" | "Mathem";

export const STORES: { id: StoreId; label: string }[] = [
  { id: "ICA", label: "ICA" },
  { id: "Coop", label: "Coop" },
  { id: "Willys", label: "Willys" },
  { id: "Lidl", label: "Lidl" },
  { id: "Hemköp", label: "Hemköp" },
  { id: "Mathem", label: "Mathem" },
];

export interface Baseline {
  item: string;       // canonical item name
  unit: string;       // e.g. "500g", "1L", "6st"
  price_sek: number;  // typical price across Swedish chains
  category: "Produce" | "Meat" | "Dairy" | "Frozen" | "Bakery" | "Dry goods" | "Pantry";
}

export const BASELINE_PRICES: Baseline[] = [
  // Proteins
  { item: "Chicken breast", unit: "500g", price_sek: 79, category: "Meat" },
  { item: "Chicken thighs", unit: "500g", price_sek: 65, category: "Meat" },
  { item: "Salmon fillet", unit: "300g", price_sek: 89, category: "Meat" },
  { item: "Ground beef", unit: "500g", price_sek: 75, category: "Meat" },
  { item: "Sausages", unit: "4-pack", price_sek: 45, category: "Meat" },
  { item: "Eggs", unit: "6-pack", price_sek: 32, category: "Dairy" },
  { item: "Tofu firm", unit: "200g", price_sek: 28, category: "Dairy" },
  { item: "Halloumi", unit: "200g", price_sek: 39, category: "Dairy" },
  { item: "Feta", unit: "150g", price_sek: 25, category: "Dairy" },
  { item: "Tuna can", unit: "150g", price_sek: 18, category: "Dry goods" },
  { item: "Red lentils", unit: "500g", price_sek: 22, category: "Dry goods" },
  { item: "Black beans can", unit: "400g", price_sek: 14, category: "Dry goods" },
  { item: "Chickpeas can", unit: "400g", price_sek: 12, category: "Dry goods" },
  // Dairy
  { item: "Milk", unit: "1L", price_sek: 16, category: "Dairy" },
  { item: "Greek yogurt", unit: "500g", price_sek: 28, category: "Dairy" },
  { item: "Butter", unit: "250g", price_sek: 39, category: "Dairy" },
  { item: "Cream", unit: "2dl", price_sek: 18, category: "Dairy" },
  { item: "Cheese block", unit: "400g", price_sek: 65, category: "Dairy" },
  // Carbs
  { item: "Rice", unit: "1kg", price_sek: 28, category: "Dry goods" },
  { item: "Pasta", unit: "500g", price_sek: 14, category: "Dry goods" },
  { item: "Noodles", unit: "250g", price_sek: 18, category: "Dry goods" },
  { item: "Bulgur", unit: "500g", price_sek: 22, category: "Dry goods" },
  { item: "Oats", unit: "500g", price_sek: 16, category: "Dry goods" },
  { item: "Sourdough bread", unit: "loaf", price_sek: 35, category: "Bakery" },
  { item: "Wraps", unit: "8-pack", price_sek: 28, category: "Bakery" },
  { item: "Potatoes", unit: "1kg", price_sek: 18, category: "Produce" },
  { item: "Sweet potato", unit: "500g", price_sek: 22, category: "Produce" },
  // Veg
  { item: "Onion", unit: "1kg", price_sek: 14, category: "Produce" },
  { item: "Garlic", unit: "bulb", price_sek: 8, category: "Produce" },
  { item: "Carrot", unit: "1kg", price_sek: 14, category: "Produce" },
  { item: "Broccoli", unit: "head", price_sek: 22, category: "Produce" },
  { item: "Cauliflower", unit: "head", price_sek: 25, category: "Produce" },
  { item: "Bell pepper", unit: "each", price_sek: 12, category: "Produce" },
  { item: "Cherry tomatoes", unit: "250g", price_sek: 22, category: "Produce" },
  { item: "Tomato", unit: "each", price_sek: 8, category: "Produce" },
  { item: "Cucumber", unit: "each", price_sek: 12, category: "Produce" },
  { item: "Zucchini", unit: "each", price_sek: 14, category: "Produce" },
  { item: "Spinach", unit: "200g", price_sek: 18, category: "Produce" },
  { item: "Lettuce", unit: "head", price_sek: 18, category: "Produce" },
  { item: "Mushrooms", unit: "250g", price_sek: 22, category: "Produce" },
  { item: "Lemon", unit: "each", price_sek: 6, category: "Produce" },
  { item: "Lime", unit: "each", price_sek: 5, category: "Produce" },
  { item: "Avocado", unit: "each", price_sek: 14, category: "Produce" },
  { item: "Banana", unit: "each", price_sek: 4, category: "Produce" },
  { item: "Apple", unit: "each", price_sek: 5, category: "Produce" },
  { item: "Spring onions", unit: "bunch", price_sek: 12, category: "Produce" },
  { item: "Ginger", unit: "100g", price_sek: 12, category: "Produce" },
  { item: "Frozen berries", unit: "400g", price_sek: 35, category: "Frozen" },
  { item: "Frozen peas", unit: "500g", price_sek: 18, category: "Frozen" },
  { item: "Frozen spinach", unit: "450g", price_sek: 22, category: "Frozen" },
  // Pantry
  { item: "Olive oil", unit: "500ml", price_sek: 55, category: "Pantry" },
  { item: "Soy sauce", unit: "150ml", price_sek: 22, category: "Pantry" },
  { item: "Passata", unit: "500g", price_sek: 14, category: "Dry goods" },
  { item: "Coconut milk can", unit: "400ml", price_sek: 22, category: "Dry goods" },
  { item: "Vegetable stock", unit: "cubes", price_sek: 18, category: "Dry goods" },
  { item: "Chia seeds", unit: "200g", price_sek: 28, category: "Dry goods" },
  { item: "Honey", unit: "350g", price_sek: 38, category: "Pantry" },
];

export function findBaseline(itemName: string): Baseline | null {
  const q = itemName.toLowerCase().trim();
  // exact-ish match first
  const exact = BASELINE_PRICES.find((b) => q === b.item.toLowerCase());
  if (exact) return exact;
  // contains
  return (
    BASELINE_PRICES.find(
      (b) => q.includes(b.item.toLowerCase()) || b.item.toLowerCase().includes(q),
    ) ?? null
  );
}
