#!/usr/bin/env python
# -*- coding: utf-8 -*-
"""Check category codes - simple output."""

import os
import sys

# Ensure we're in the right directory
os.chdir(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, os.getcwd())

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')

import django
django.setup()

from infrastructure.persistence.models import CatalogCategory, NomenclatureCategoryChoices

print("CatalogCategory codes:")
cats = CatalogCategory.objects.all().order_by('sort_order')
for c in cats:
    print(f"{c.name}: {c.code}")

print("")
print("Legacy choices:")
for choice in NomenclatureCategoryChoices:
    print(f"{choice.value}")
