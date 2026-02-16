"""Check is_purchased field in API response."""

import os
import sys
import django

sys.path.insert(0, os.path.join(os.path.dirname(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings.dev')
django.setup()

from infrastructure.persistence.models import Project, ProjectItem
from presentation.api.v1.serializers.project import ProjectItemListSerializer


def check_is_purchased():
    project = Project.objects.first()
    if not project:
        print("No project found!")
        return
    
    items = ProjectItem.objects.filter(project=project).select_related(
        'nomenclature_item__catalog_category',
        'parent_item', 'contractor', 'supplier', 'responsible', 'delay_reason'
    )[:10]

    serializer = ProjectItemListSerializer(items, many=True)
    
    print("Checking is_purchased field:")
    print("-" * 70)
    for item in serializer.data:
        name = item['name'][:25]
        category = item['category'][:20]
        is_purchased = item.get('is_purchased', 'N/A')
        print(f'{name:25s} | category={category:20s} | is_purchased={is_purchased}')


if __name__ == '__main__':
    check_is_purchased()
