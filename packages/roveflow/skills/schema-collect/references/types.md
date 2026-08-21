# Schema.org collection shapes

Use this envelope for `roveflow-out/data.json`:

```json
{
  "@context": {
    "@vocab": "https://schema.org/",
    "rove": "https://roveflow.dev/ns#"
  },
  "@type": "ItemList",
  "name": "Dubai listings",
  "numberOfItems": 1,
  "rove:sourceApp": "Example app",
  "rove:capturedAt": "2026-08-20T00:00:00+04:00",
  "itemListElement": [
    {
      "@type": "ListItem",
      "position": 1,
      "item": {
        "@type": "Product",
        "name": "Example product",
        "image": "https://example.com/image.jpg",
        "offers": {
          "@type": "Offer",
          "price": 49.95,
          "priceCurrency": "AED",
          "availability": "https://schema.org/InStock"
        },
        "rove:evidenceScreen": ["results-01", "product-detail"],
        "rove:fieldConfidence": {
          "name": "high",
          "offers.price": "high"
        }
      }
    }
  ]
}
```

The `rove:` namespace is for capture provenance; entity facts should use standard
Schema.org properties.

## Type routing

- `Product`: `name`, `description`, `image`, `url`, `brand`, `category`, `sku`, `gtin`, `mpn`, `color`, `size`, `aggregateRating`, `offers`.
- `Offer`: `price`, `priceCurrency`, `availability`, `itemCondition`, `seller`, `url`, `validFrom`, `priceValidUntil`.
- `Place` or a specific subtype (`Restaurant`, `Hotel`, `LodgingBusiness`, `Store`, `LocalBusiness`): `name`, `description`, `image`, `url`, `telephone`, `address`, `geo`, `aggregateRating`, `amenityFeature`.
- `PostalAddress`: `streetAddress`, `addressLocality`, `addressRegion`, `postalCode`, `addressCountry`.
- `GeoCoordinates`: numeric `latitude`, `longitude`.
- `Accommodation` or `VacationRental`: property/listing name, description, images, address/geo, occupancy or amenity details that are actually shown; represent the displayed booking price with an `Offer`.
- `Service`: `name`, `provider`, `areaServed`, `serviceType`, `offers`.
- `Event`: `name`, `startDate`, `endDate`, `location`, `organizer`, `offers`, `eventStatus`.
- `JobPosting`: `title`, `hiringOrganization`, `jobLocation`, `employmentType`, `datePosted`, `validThrough`, `baseSalary`.

Use `additionalProperty` with `PropertyValue` for a visible characteristic that
has no clear standard property:

```json
{
  "@type": "PropertyValue",
  "name": "Bedrooms",
  "value": 2
}
```

## Normalization rules

- Retain the displayed text when numeric parsing is ambiguous.
- Convert currency symbols only when locale/app context makes the ISO code certain.
- Do not treat a crossed-out price as the active `price`; preserve it as a `UnitPriceSpecification` or `additionalProperty` only when clearly labelled.
- Do not convert relative distances into addresses or coordinates.
- Do not fabricate URLs for native-only records. Use an app-visible identifier as `identifier` when available.
- Keep arrays for repeated images, categories, amenities, and evidence screens.
