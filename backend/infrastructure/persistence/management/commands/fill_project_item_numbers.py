from django.core.management.base import BaseCommand
from django.db import transaction
from django.db.models import Max


class Command(BaseCommand):
    help = (
        "Заполняет отсутствующие ProjectItem.item_number (сквозной ID позиции) "
        "и синхронизирует счётчик ProjectItemSequence. "
        "Безопасно для повторного запуска: существующие item_number не меняет."
    )

    def handle(self, *args, **options):
        from infrastructure.persistence.models.project import ProjectItem, ProjectItemSequence

        missing_qs = ProjectItem.objects.filter(item_number__isnull=True).order_by('created_at', 'id')
        missing_count = missing_qs.count()
        if missing_count == 0:
            self.stdout.write(self.style.SUCCESS('Нет позиций без item_number — ничего делать не нужно.'))
            return

        with transaction.atomic():
            seq, _ = ProjectItemSequence.objects.select_for_update().get_or_create(key='project_item')

            max_existing = ProjectItem.objects.aggregate(m=Max('item_number')).get('m') or 0
            if max_existing > (seq.last_value or 0):
                seq.last_value = max_existing
                seq.save(update_fields=['last_value'])

            updated = 0
            for item in missing_qs.iterator():
                seq.last_value += 1
                ProjectItem.objects.filter(pk=item.pk, item_number__isnull=True).update(item_number=seq.last_value)
                updated += 1

            seq.save(update_fields=['last_value'])

        self.stdout.write(self.style.SUCCESS(f'Готово: проставлено item_number для {updated} позиций.'))
        self.stdout.write(self.style.SUCCESS(f'Текущее значение счётчика: {seq.last_value}.'))
