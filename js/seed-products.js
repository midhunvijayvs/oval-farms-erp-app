// The products that were listed on ovalfarm.in before the shop moved to the shared database.
// The first admin to open the ERP with an empty product list gets them added automatically.
// Fixed ids make it safe if two people do this at the same time.
import { store } from "./store.js";

const IMG = "https://ovalfarm.in/images";

export const WEBSITE_PRODUCTS = [
  {
    id: "white-oyster-mushrooms", sku: "OF-FRESH-WHITE", name: "White Oyster Mushrooms", category: "Fresh Mushroom", webCategory: "Fresh mushrooms",
    shortDescription: "Fresh white oyster mushrooms, delivered straight from our farm to your home.",
    description: "Tender, mild and quick to cook, our white oyster mushrooms are harvested fresh at our hi-tech farm in Kozhikode and packed the same day.\nThey soak up spices beautifully, which makes them perfect for Kerala-style fries, thorans, curries and biryanis.",
    images: [`${IMG}/home/sec-2-1.jpg`], netUnit: "g", featured: true, badge: "Fresh",
    highlights: ["Harvested fresh", "Grown on our own farm", "100% vegan source of protein"],
    howToUse: "Wipe or rinse quickly and pat dry.\nTear or slice into strips.\nCook on medium-high heat until golden, then add your spices.",
    storageInfo: "Keep refrigerated in a paper bag or the box it came in.", shelfLifeText: "Best within 3 days of delivery.", shelfLifeDays: 3, hsn: "0709",
  },
  {
    id: "grey-oyster-mushrooms", sku: "OF-FRESH-GREY", name: "Grey Oyster Mushrooms", category: "Fresh Mushroom", webCategory: "Fresh mushrooms",
    shortDescription: "Our grey variety makes your dishes even more flavourful.",
    description: "Grey oyster mushrooms have a slightly firmer bite and a deeper, earthier taste than the white variety.\nTry them in a dry fry or a pepper roast, where their flavour really comes through.",
    images: [`${IMG}/home/sec-2-2.jpg`], netUnit: "g", featured: true, badge: "Fresh",
    highlights: ["Richer, earthier taste", "Firm, meaty bite", "Harvested fresh"],
    howToUse: "Rinse quickly and pat dry.\nTear into strips along the gills.\nFry, roast or add to curries.",
    storageInfo: "Keep refrigerated in a paper bag or the box it came in.", shelfLifeText: "Best within 3 days of delivery.", shelfLifeDays: 3, hsn: "0709",
  },
  {
    id: "dried-mushrooms", sku: "OF-DRIED", name: "Dried Mushrooms", category: "Value-Added Product", webCategory: "Dried & powders",
    shortDescription: "Shade-dried mushrooms that keep for 6 months, with all the goodness of fresh ones.",
    description: "Tired of buying mushrooms every day? Our mushrooms are gently shade-dried to keep their flavour and nutrients.\nSoak them in warm water and use them just like fresh mushrooms, any time you like.",
    images: [`${IMG}/home/sec-2-7.webp`], netUnit: "g", featured: true,
    highlights: ["6-month shelf life", "Shade-dried", "Handy pantry staple"],
    howToUse: "Soak in warm water for 15–20 minutes.\nSqueeze out the water and cook like fresh mushrooms.\nKeep the soaking water for soups and gravies.",
    storageInfo: "Store in an airtight container in a cool, dry place.", shelfLifeText: "6 months.", shelfLifeDays: 180, hsn: "0712",
  },
  {
    id: "mushroom-powder", sku: "OF-POWDER", name: "Mushroom Powder", category: "Value-Added Product", webCategory: "Dried & powders",
    shortDescription: "Add a pinch to your daily dishes to boost both taste and nutrition.",
    description: "Finely ground from our dried mushrooms, this powder is the easiest way to add mushroom goodness to everyday food.\nStir it into soups, gravies, chapati dough, dosa batter or even smoothies.",
    images: [`${IMG}/home/sec-2-8.jpg`], netUnit: "g", featured: true,
    highlights: ["Easy daily nutrition", "Adds natural umami", "Kid-friendly"],
    howToUse: "Add 1–2 teaspoons to soups, gravies or dough.\nMix well and cook as usual.",
    storageInfo: "Store in an airtight container in a cool, dry place.", hsn: "0712",
  },
  {
    id: "mushroom-soup-premix", sku: "OF-PREMIX-SOUP-25", name: "Mushroom Soup Premix", category: "Value-Added Product", webCategory: "Ready to cook",
    shortDescription: "Rich, creamy mushroom soup, ready in 3 minutes.",
    description: "Our mushroom soup premix is made with mushrooms from our own farm, so you can enjoy a hearty, nourishing soup any time, without the chopping and stirring.\nPerfect for a quick evening snack, a light dinner or a warm cup on a rainy day.",
    images: [`${IMG}/shop/soup-premix.jpg`], salePrice: 60, mrp: 60, netQuantity: 25, netUnit: "g", featured: true, badge: "New",
    highlights: ["Ready in 3 minutes", "No added preservatives", "No artificial flavours", "100% vegetarian"],
    howToUse: "Empty the pack into a pan with water.\nStir well and bring to a boil, stirring often.\nSimmer for about 3 minutes until thick, then serve hot.",
    storageInfo: "Store in a cool, dry place. Close tightly after opening.", hsn: "2104",
  },
  {
    id: "mushroom-spawn", sku: "OF-SPAWN", name: "Mushroom Spawn", category: "Value-Added Product", webCategory: "Grow your own",
    shortDescription: "Planning to cultivate mushrooms? Start with our high-quality spawn.",
    description: "Healthy, high-yield spawn, the same spawn we use on our own farm.\nIdeal for home growers and new mushroom farmers. Ask us for growing tips when you order.",
    images: [`${IMG}/home/sec-2-3.jpg`], netQuantity: 1, netUnit: "pack", badge: "For growers",
    highlights: ["The spawn we use ourselves", "High yield", "Growing support from our team"],
    storageInfo: "Keep in a cool, shaded place and use soon after delivery.",
  },
  {
    id: "ready-to-pluck-beds", sku: "OF-GROW-BED", name: "Ready-to-pluck Beds", category: "Value-Added Product", webCategory: "Grow your own", unit: "pcs",
    shortDescription: "Grow mushrooms at home with no technical know-how. Just water and harvest.",
    description: "A fully grown mushroom bed that starts fruiting at home within days.\nKeep it in a shaded corner, spray a little water every day and watch fresh mushrooms appear. A fun project for kids and a fresh harvest for the kitchen.",
    images: [`${IMG}/home/sec-2-4.jpg`], netQuantity: 1, netUnit: "bed", featured: true, badge: "For growers",
    highlights: ["No experience needed", "Harvest at home", "Great for kids"],
    howToUse: "Keep the bed in a cool, shaded place away from direct sun.\nSpray water lightly 2–3 times a day.\nTwist and pluck mushrooms when the caps open out.",
  },
];

// Adds the website products that aren't there yet. Returns how many were added.
// Stock on the website starts switched off ("trackStock: false") so nothing shows as out of stock
// before opening stock is entered.
export function seedWebsiteProducts() {
  let n = 0;
  WEBSITE_PRODUCTS.forEach((p, i) => {
    if (store.get("products", p.id)) return;
    store.put("products", {
      unit: "pack", gstRate: "0", active: true, published: true, trackStock: false, displayOrder: (i + 1) * 10, ...p,
    });
    n++;
  });
  return n;
}
