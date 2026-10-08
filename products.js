// =========================
// PRODUCT CATALOGUE
// The single source of truth for product data. The shop grid, the search
// panel and the product page all read from this one list instead of each
// carrying their own copy, so product information only lives in one place.
//
// category        - the primary category label (INTIMATE or WELLNESS)
// categorySlug    - the primary value used by the shop's chips / ?category=
// subcategory     - the product type inside that category (Toys, Gummies, ...)
// subcategorySlug - the value the shop's subcategory filter uses
// image           - the CSS class that paints the product's artwork
//
// There are only two primary categories. Lubricants, Body & Massage and the
// other product types are subcategories of one of them, never primary entries.
// =
// INTIMATE   -> Toys, Lubricants, Accessories, Intimate Care
// WELLNESS   -> Gummies, Body & Massage, Self-Care, Wellness
//
// The product page (?id=) renders category, subcategory, name, rating, price,
// image, description and the accordion copy from this same list, so nothing
// about a single product lives anywhere else.
// =========================

// The two primary categories, in one place, so the chips, the filter drawer and
// the category cards can never disagree about what exists.
const CATEGORIES = [
    { slug: "intimate", label: "Intimate", key: "intimate" },
    { slug: "wellness", label: "Wellness", key: "wellness" }
];

const SUBCATEGORIES = {
    intimate: [
        { slug: "toys", label: "Toys" },
        { slug: "lubricants", label: "Lubricants" },
        { slug: "accessories", label: "Accessories" },
        { slug: "intimate-care", label: "Intimate Care" }
    ],
    wellness: [
        { slug: "gummies", label: "Gummies" },
        { slug: "body-massage", label: "Body & Massage" },
        { slug: "self-care", label: "Self-Care" },
        { slug: "wellness", label: "Wellness" }
    ]
};

const PRODUCTS = [
    {
        id: "silk-touch",
        name: "Silk Touch",
        category: "Intimate",
        categorySlug: "intimate",
        subcategory: "Toys",
        subcategorySlug: "toys",
        price: 7650,
        oldPrice: null,
        badge: "BEST SELLER",
        badgeClass: "",
        rating: 5,
        reviews: 42,
        featured: true,
        newest: false,
        image: "image-a",
        description: "Thoughtfully designed for a more personal kind of self-care.",
        details: "Premium materials, compact design and a smooth easy-to-clean surface. Designed for personal use.",
        care: "Clean according to the included care instructions and allow the product to dry completely before storage.",
        shipping: "Orders are packaged discreetly. Delivery times and return eligibility depend on your location."
    },
    {
        id: "after-dark-oil",
        name: "After Dark Oil",
        category: "Wellness",
        categorySlug: "wellness",
        subcategory: "Body & Massage",
        subcategorySlug: "body-massage",
        price: 3650,
        oldPrice: null,
        badge: null,
        badgeClass: "",
        rating: 5,
        reviews: 28,
        featured: false,
        newest: false,
        image: "image-b",
        description: "A rich, fast-absorbing body oil for after-hours rituals.",
        details: "A lightweight oil that sinks in fast, with a warm cedar and vetiver scent and no greasy finish.",
        care: "Massage a few drops into damp skin. Keep the bottle away from direct sunlight.",
        shipping: "Ships in a plain, unmarked box. Returns are accepted within 30 days if the bottle is unopened."
    },
    {
        id: "midnight-gummies",
        name: "Midnight Gummies",
        category: "Wellness",
        categorySlug: "wellness",
        subcategory: "Gummies",
        subcategorySlug: "gummies",
        price: 3100,
        oldPrice: null,
        badge: "NEW",
        badgeClass: "",
        rating: 5,
        reviews: 19,
        featured: false,
        newest: true,
        image: "image-c",
        description: "A gentle nightly gummy to help you unwind.",
        details: "A soft berry-flavoured gummy taken in the evening, with no aftertaste and no added caffeine.",
        care: "Store somewhere cool and dry, away from children. Do not exceed the suggested daily amount.",
        shipping: "Delivered in discreet packaging with no product names on the outside of the box."
    },
    {
        id: "velvet-mini",
        name: "Velvet Mini",
        category: "Intimate",
        categorySlug: "intimate",
        subcategory: "Toys",
        subcategorySlug: "toys",
        price: 5850,
        oldPrice: null,
        badge: null,
        badgeClass: "",
        rating: 5,
        reviews: 36,
        featured: true,
        newest: false,
        image: "image-d",
        description: "Compact, discreet and quietly powerful.",
        details: "A compact size with a soft-touch finish that is easy to hold, easier to store and fully discreet.",
        care: "Wipe clean with a damp cloth and allow to air dry completely before storing.",
        shipping: "Packed discreetly and dispatched within 1-2 working days."
    },
    {
        id: "slow-down-oil",
        name: "Slow Down Oil",
        category: "Wellness",
        categorySlug: "wellness",
        subcategory: "Body & Massage",
        subcategorySlug: "body-massage",
        price: 2850,
        oldPrice: 3900,
        badge: "SALE",
        badgeClass: "sale",
        rating: 5,
        reviews: 51,
        featured: false,
        newest: false,
        image: "image-e",
        description: "Warm, slow-burning massage oil with a soft finish.",
        details: "A slow-burning massage oil that warms between the palms and leaves a soft, low sheen.",
        care: "Warm between the palms before use. Wipe the bottle clean and keep the cap sealed.",
        shipping: "Arrives in plain packaging. This item is on sale while stocks last."
    },
    {
        id: "luna",
        name: "Luna",
        category: "Intimate",
        categorySlug: "intimate",
        subcategory: "Toys",
        subcategorySlug: "toys",
        price: 8300,
        oldPrice: null,
        badge: null,
        badgeClass: "",
        rating: 5,
        reviews: 17,
        featured: true,
        newest: false,
        image: "image-f",
        description: "Sculpted, smooth and made to be kept on the nightstand.",
        details: "A weighted, sculpted form with a smooth surface, designed to stay where you left it.",
        care: "Clean with warm water and a mild soap, then dry fully before storing.",
        shipping: "Shipped discreetly, with no product details on the outer packaging."
    },
    {
        id: "night-ritual",
        name: "Night Ritual",
        category: "Wellness",
        categorySlug: "wellness",
        subcategory: "Self-Care",
        subcategorySlug: "self-care",
        price: 4400,
        oldPrice: null,
        badge: "NEW",
        badgeClass: "",
        rating: 5,
        reviews: 12,
        featured: false,
        newest: true,
        image: "image-g",
        description: "A pillow mist and body serum pair for winding down.",
        details: "Two complementary steps for the end of the day: a light pillow mist and a smoothing body serum.",
        care: "Mist above the pillow, never directly onto the face. Keep the serum closed when not in use.",
        shipping: "Both items travel together in one discreet box."
    },
    {
        id: "the-duo",
        name: "The Duo",
        category: "Intimate",
        categorySlug: "intimate",
        subcategory: "Accessories",
        subcategorySlug: "accessories",
        price: 9350,
        oldPrice: null,
        badge: null,
        badgeClass: "",
        rating: 5,
        reviews: 31,
        featured: true,
        newest: false,
        image: "image-h",
        description: "Two best sellers, boxed and ready to gift.",
        details: "Two of our most reordered products, chosen together and packed as a single gift set.",
        care: "Care for each item as described on its own product page.",
        shipping: "Gift wrapped in plain paper, with no Elle branding on the outside."
    }
];

window.PRODUCTS = PRODUCTS;
window.CATEGORIES = CATEGORIES;
window.SUBCATEGORIES = SUBCATEGORIES;
