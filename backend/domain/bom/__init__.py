"""
BOM Domain - Bill of Materials (Структура изделий).

This domain handles the hierarchical structure of products:
- Stand contains Systems
- Systems contain Subsystems, Assembly Units, Parts, and purchased items
- Subsystems can contain other Subsystems, Assembly Units, Parts, and purchased items
- Assembly Units contain Parts and purchased items
- Parts contain only Materials
"""
