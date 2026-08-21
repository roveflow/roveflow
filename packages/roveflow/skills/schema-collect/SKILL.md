---
name: schema-collect
description: Collect products, places, accommodations, services, events, and other mobile-app listings into durable, deduplicated Schema.org JSON-LD. Use for scraping, catalog extraction, listing research, comparison datasets, and report evidence; not for UX-only screen mapping.
---

# Schema.org collection

Turn visible mobile listings into `roveflow-out/data.json` while Rove drives the
app. The file is the durable source of truth: update it after every useful screen
or batch, not only when navigation finishes.

## Collection contract

- Use a Schema.org `ItemList` with ordered `ListItem` entries and the most specific useful type for each `item`.
- Read [references/types.md](references/types.md) when selecting fields or creating the initial file.
- Capture only values visible in the app or returned by its accessibility tree. Never infer a price, currency, identifier, address component, rating, or availability.
- Omit unknown properties. Preserve ambiguous visible text in `description` or `additionalProperty`; do not force it into the wrong field.
- Keep numeric values machine-readable: `price` as a JSON number when unambiguous, `priceCurrency` as an ISO 4217 code only when the UI identifies it, ratings as numbers, and coordinates as numbers.
- Use canonical Schema.org URLs/enumerations where applicable, such as `https://schema.org/InStock`.

## Identity and deduplication

Upsert a record instead of adding a duplicate. Prefer identity in this order:

1. Stable listing URL or app-visible identifier.
2. Product `gtin`, `sku`, or `mpn`.
3. Normalized name plus full address or coordinates.
4. Normalized name plus location/category and displayed price.

When a detail screen adds fields to a list-card record, merge them into the same
entity. Keep the earliest `ListItem.position`; never renumber while collection is
in progress. Set `numberOfItems` to the actual deduplicated count.

## Provenance and stopping

Use the `rove:` fields defined in the reference to record source app, capture time,
evidence screen names, and optional per-field confidence. Keep screenshots as
evidence, not as the dataset itself.

When the user steers or says the sample is sufficient, stop navigating immediately,
flush valid JSON, and produce the requested report from `data.json`. Report the
output path, entity count, duplicates merged, and fields that were unavailable.
