#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Check category codes in the database."""

import os
import sys

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from infrastructure.persistence.models import CatalogCategory, NomenclatureCategoryChoices

print("=" * 60)
print("CatalogCategory codes in database:")
print("=" * 60)

cats = CatalogCategory.objects.all().order_by('sort_order')
for c in cats:
    print(f"  {c.name}")
    print(f"    code: {c.code}")
    print(f"    is_purchased: {c.is_purchased}")
    print(f"    sort_order: {c.sort_order}")
    print()

print("=" * 60)
print("NomenclatureCategoryChoices (legacy):")
print("=" * 60)
for choice in NomenclatureCategoryChoices:
    print(f"  {choice.value} -> {choice.label}")

print("=" * 60)
print("Check: Do all CatalogCategory.code values exist in NomenclatureCategoryChoices?")
print("=" * 60)

valid_codes = {choice.value for choice in NomenclatureCategoryChoices}
for c in cats:
    if c.code in valid_codes:
        print(f"  [OK] {c.name}: code='{c.code}'")
    else:
        print(f"  [MISMATCH] {c.name}: code='{c.code}' NOT in legacy choices!")
