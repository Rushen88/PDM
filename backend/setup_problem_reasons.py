import os
import sys
import django

# Setup Django environment
sys.path.append(os.path.dirname(os.path.abspath(__file__)))
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
django.setup()

from infrastructure.persistence.models import ProblemReason

def setup_problem_reasons():
    reasons = [
        {
            'code': 'not_ordered_on_time',
            'name': 'Не заказано вовремя',
            'description': 'Дата заказа просрочена, позиция находится в статусе «Ожидает заказа».',
            'is_system': True,
            'is_active': True
        },
            {
                'code': 'ordered_late',
                'name': 'Заказано с просрочкой',
                'description': 'Заказ создан после даты "Заказать до".',
                'is_system': True,
                'is_active': True
            },
        {
            'code': 'delivery_delay',
            'name': 'Задержка поставки',
            'description': 'Срок поставки истек, позиция находится в статусе «В заказе».',
            'is_system': True,
            'is_active': True
        }
    ]

    print("Checking Problem Reasons...")
    for data in reasons:
        obj, created = ProblemReason.objects.update_or_create(
            code=data['code'],
            defaults=data
        )
        if created:
            print(f"Created: {obj.name} ({obj.code})")
        else:
            print(f"Exists/Updated: {obj.name} ({obj.code})")

if __name__ == '__main__':
    setup_problem_reasons()
