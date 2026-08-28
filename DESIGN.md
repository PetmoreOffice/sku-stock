<!-- SEED: established with the user before implementation; re-run $impeccable document once there's code to capture the actual tokens and components. -->
---
name: SKU Stock Lookup
description: A handheld-first, read-only stock lookup interface.
---

# Design System: SKU Stock Lookup

## Overview

**Creative North Star: "The Clear Warehouse Label"**

This interface behaves like a legible operational label: the item identity, unit, and availability can be read in seconds while standing in a warehouse aisle. It preserves the user's white, compact mobile reference and separates receiving from transfers with semantic green and blue rather than decorative complexity.

**Key Characteristics:**
- Handheld-first with a thumb-reachable primary scan action.
- High-information cards with strong labels and numeric hierarchy.
- Read-only evidence, not transaction controls.

## Colors

A white operational surface with dark navy text, stock/receiving green, and transfer blue.

**The Meaningful Accent Rule.** Green signifies available stock or receiving; blue signifies transfer or navigational selection. No accent is used merely for decoration.

## Typography

Use a Thai-capable UI sans-serif with a clear weight contrast between labels, product names, and inventory figures.

## Layout

One-column mobile layout sized for handheld use. The scan action occupies the first viewport; product identity and stock immediately follow. Long record sets use tabs and a scrollable table/list with a persistent bottom navigation.

## Elevation & Depth

Depth comes from quiet tonal separation and a light, offset shadow only for the focused product result surface.

## Shapes

Cards and inputs use gently rounded corners. Unit chips are compact pills only because they represent small, selectable labels.

## Components

The first implementation will establish actual component tokens and states.

## Do's and Don'ts

### Do:
- **Do** make the scanned SKU, product name, unit, and stock figure visible without scrolling.
- **Do** keep Thai labels concise and use English only when it disambiguates an operational term.
- **Do** preserve visible loading, empty, error, and no-result states.

### Don't:
- **Don't** expose receive, transfer, quantity-adjustment, or edit controls in this read-only product.
- **Don't** require a camera scanner when a Handheld scanner can submit directly into the search field.
- **Don't** use color as the sole way to distinguish receiving and transfer data.
