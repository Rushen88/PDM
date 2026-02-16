"""
Catalog ORM Models.

Архитектура справочников номенклатуры:
1. CatalogCategory - Виды справочников (материалы, детали, сборочные единицы и т.д.)
2. NomenclatureType - Типы номенклатуры (только для закупаемых позиций)
3. NomenclatureItem - Номенклатурные позиции
4. NomenclatureSupplier - Связь номенклатуры с поставщиками
5. ContactPerson - Контактные лица для поставщиков/подрядчиков
6. Supplier - Поставщики
7. Contractor - Подрядчики
8. DelayReason - Причины задержек
"""

from django.db import models
from django.conf import settings
from django.core.exceptions import ValidationError

from .base import BaseModelWithHistory, ActiveManager, AllObjectsManager


class CatalogCategory(BaseModelWithHistory):
    """
    Вид справочника номенклатуры.
    
    Примеры:
    - Материалы (закупаемые)
    - Стандартные изделия (закупаемые)
    - Прочие изделия (закупаемые)
    - Детали (изготавливаемые)
    - Сборочные единицы (изготавливаемые)
    - Подсистемы (изготавливаемые)
    - Системы (изготавливаемые)
    - Стенды (изготавливаемые, конечный продукт)
    """
    
    # Системный код для программной логики
    code = models.CharField(
        max_length=50,
        unique=True,
        db_index=True,
        verbose_name="Системный код"
    )
    
    name = models.CharField(
        max_length=200,
        verbose_name="Наименование"
    )
    
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Признак: закупаемая или изготавливаемая номенклатура
    is_purchased = models.BooleanField(
        default=False,
        verbose_name="Закупаемая позиция"
    )
    
    # Порядок сортировки для отображения
    sort_order = models.PositiveIntegerField(
        default=0,
        verbose_name="Порядок сортировки"
    )
    
    # Какие виды справочников могут входить в состав данного вида
    # (ManyToMany сам на себя)
    allowed_children = models.ManyToManyField(
        'self',
        symmetrical=False,
        related_name='allowed_parents',
        blank=True,
        verbose_name="Допустимые дочерние виды"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'catalog_categories'
        verbose_name = 'Вид справочника'
        verbose_name_plural = 'Виды справочников'
        ordering = ['sort_order', 'name']
    
    def __str__(self):
        return self.name
    
    @property
    def is_manufactured(self):
        """Изготавливаемая позиция (противоположность закупаемой)."""
        return not self.is_purchased


class NomenclatureType(BaseModelWithHistory):
    """
    Тип номенклатуры внутри вида справочника.
    
    Применяется ТОЛЬКО для закупаемых позиций.
    Пример: для вида "Материалы" - типы "Сталь", "Алюминий", "Пластик"
            для вида "Стандартные изделия" - типы "Крепёж", "Подшипники", "Уплотнения"
    """
    
    catalog_category = models.ForeignKey(
        CatalogCategory,
        on_delete=models.CASCADE,
        related_name='nomenclature_types',
        null=True,  # Временно для миграции
        blank=True,
        verbose_name="Вид справочника"
    )
    
    name = models.CharField(
        max_length=200,
        verbose_name="Наименование типа"
    )
    
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    
    # Единица измерения по умолчанию для этого типа
    default_unit = models.CharField(
        max_length=50,
        default='шт',
        verbose_name="Единица измерения"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'nomenclature_types'
        verbose_name = 'Тип номенклатуры'
        verbose_name_plural = 'Типы номенклатуры'
        unique_together = [['catalog_category', 'name']]
        ordering = ['catalog_category__sort_order', 'name']
    
    def __str__(self):
        return f"{self.catalog_category.name}: {self.name}"
    
    def clean(self):
        """Валидация: тип можно создать только для закупаемых видов."""
        if self.catalog_category_id:
            try:
                cat = CatalogCategory.objects.get(pk=self.catalog_category_id)
                if not cat.is_purchased:
                    raise ValidationError({
                        'catalog_category': 'Типы номенклатуры можно создавать только для закупаемых видов справочников.'
                    })
            except CatalogCategory.DoesNotExist:
                pass


class Supplier(BaseModelWithHistory):
    """
    Поставщик - организация, поставляющая материалы и комплектующие.
    """
    
    # Наименование
    name = models.CharField(
        max_length=300,
        verbose_name="Наименование"
    )
    short_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Краткое наименование"
    )
    
    # Реквизиты
    inn = models.CharField(
        max_length=12,
        blank=True,
        db_index=True,
        verbose_name="ИНН"
    )
    kpp = models.CharField(
        max_length=9,
        blank=True,
        verbose_name="КПП"
    )
    ogrn = models.CharField(
        max_length=15,
        blank=True,
        verbose_name="ОГРН"
    )
    
    # Адреса
    legal_address = models.TextField(
        blank=True,
        verbose_name="Юридический адрес"
    )
    actual_address = models.TextField(
        blank=True,
        verbose_name="Фактический адрес"
    )
    
    # Общие контакты организации
    phone = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Телефон организации"
    )
    email = models.EmailField(
        blank=True,
        verbose_name="Email организации"
    )
    website = models.URLField(
        blank=True,
        verbose_name="Сайт"
    )
    
    # Условия работы
    payment_terms = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Условия оплаты"
    )
    default_delivery_days = models.PositiveIntegerField(
        default=7,
        verbose_name="Срок поставки по умолчанию (дней)"
    )
    
    # Оценка
    rating = models.DecimalField(
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        verbose_name="Рейтинг (0-5)"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'suppliers'
        verbose_name = 'Поставщик'
        verbose_name_plural = 'Поставщики'
        ordering = ['name']
    
    def __str__(self):
        return self.short_name or self.name


class Contractor(BaseModelWithHistory):
    """
    Подрядчик - организация, выполняющая работы по изготовлению.
    """
    
    # Наименование
    name = models.CharField(
        max_length=300,
        verbose_name="Наименование"
    )
    short_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Краткое наименование"
    )
    
    # Реквизиты
    inn = models.CharField(
        max_length=12,
        blank=True,
        db_index=True,
        verbose_name="ИНН"
    )
    kpp = models.CharField(
        max_length=9,
        blank=True,
        verbose_name="КПП"
    )
    ogrn = models.CharField(
        max_length=15,
        blank=True,
        verbose_name="ОГРН"
    )
    
    # Адреса
    legal_address = models.TextField(
        blank=True,
        verbose_name="Юридический адрес"
    )
    actual_address = models.TextField(
        blank=True,
        verbose_name="Фактический адрес"
    )
    
    # Общие контакты организации
    phone = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Телефон организации"
    )
    email = models.EmailField(
        blank=True,
        verbose_name="Email организации"
    )
    website = models.URLField(
        blank=True,
        verbose_name="Сайт"
    )
    
    # Специализация
    specialization = models.CharField(
        max_length=300,
        blank=True,
        verbose_name="Специализация"
    )
    certifications = models.JSONField(
        default=list,
        blank=True,
        verbose_name="Сертификаты"
    )
    
    # Договор
    contract_number = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Номер договора"
    )
    contract_date = models.DateField(
        null=True,
        blank=True,
        verbose_name="Дата договора"
    )
    
    # Условия работы
    default_lead_time_days = models.PositiveIntegerField(
        default=14,
        verbose_name="Срок изготовления по умолчанию (дней)"
    )
    
    # Оценка
    rating = models.DecimalField(
        max_digits=3,
        decimal_places=1,
        null=True,
        blank=True,
        verbose_name="Рейтинг (0-5)"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'contractors'
        verbose_name = 'Подрядчик'
        verbose_name_plural = 'Подрядчики'
        ordering = ['name']
    
    def __str__(self):
        return self.short_name or self.name


class ContactPerson(BaseModelWithHistory):
    """
    Контактное лицо организации (поставщика или подрядчика).
    
    Позволяет хранить несколько контактных лиц для каждой организации.
    """
    
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='contact_persons',
        null=True,
        blank=True,
        verbose_name="Поставщик"
    )
    
    contractor = models.ForeignKey(
        Contractor,
        on_delete=models.CASCADE,
        related_name='contact_persons',
        null=True,
        blank=True,
        verbose_name="Подрядчик"
    )
    
    # ФИО
    last_name = models.CharField(
        max_length=100,
        verbose_name="Фамилия"
    )
    first_name = models.CharField(
        max_length=100,
        verbose_name="Имя"
    )
    middle_name = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Отчество"
    )
    
    # Должность
    position = models.CharField(
        max_length=200,
        blank=True,
        verbose_name="Должность"
    )
    
    # Контакты
    phone = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Телефон"
    )
    mobile_phone = models.CharField(
        max_length=50,
        blank=True,
        verbose_name="Мобильный телефон"
    )
    email = models.EmailField(
        blank=True,
        verbose_name="Email"
    )
    
    # Признак основного контактного лица
    is_primary = models.BooleanField(
        default=False,
        verbose_name="Основное контактное лицо"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'contact_persons'
        verbose_name = 'Контактное лицо'
        verbose_name_plural = 'Контактные лица'
        ordering = ['-is_primary', 'last_name', 'first_name']
    
    def __str__(self):
        full_name = f"{self.last_name} {self.first_name}"
        if self.middle_name:
            full_name += f" {self.middle_name}"
        if self.position:
            full_name += f" ({self.position})"
        return full_name
    
    @property
    def full_name(self):
        """Полное ФИО."""
        parts = [self.last_name, self.first_name]
        if self.middle_name:
            parts.append(self.middle_name)
        return ' '.join(parts)
    
    def clean(self):
        """Валидация: должен быть привязан либо к поставщику, либо к подрядчику."""
        if not self.supplier and not self.contractor:
            raise ValidationError(
                'Контактное лицо должно быть привязано к поставщику или подрядчику.'
            )
        if self.supplier and self.contractor:
            raise ValidationError(
                'Контактное лицо не может быть одновременно привязано к поставщику и подрядчику.'
            )


class NomenclatureItem(BaseModelWithHistory):
    """
    Номенклатурная позиция.
    
    Элемент справочника номенклатуры, привязанный к виду справочника.
    """
    
    # Вид справочника (обязательно)
    catalog_category = models.ForeignKey(
        CatalogCategory,
        on_delete=models.PROTECT,
        related_name='nomenclature_items',
        null=True,  # Временно для миграции, потом сделаем NOT NULL
        blank=True,
        verbose_name="Вид справочника"
    )
    
    # Тип номенклатуры (только для закупаемых, опционально)
    nomenclature_type = models.ForeignKey(
        NomenclatureType,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='nomenclature_items',
        verbose_name="Тип номенклатуры"
    )
    
    # Код (уникальный идентификатор)
    code = models.CharField(
        max_length=100,
        unique=True,
        db_index=True,
        verbose_name="Код"
    )
    
    # Наименование
    name = models.CharField(
        max_length=500,
        verbose_name="Наименование"
    )
    
    # Номер чертежа (для изготавливаемых)
    drawing_number = models.CharField(
        max_length=100,
        blank=True,
        db_index=True,
        verbose_name="Номер чертежа"
    )
    
    # Описание и характеристики
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    specifications = models.TextField(
        blank=True,
        verbose_name="Технические характеристики"
    )
    
    # Единица измерения
    unit = models.CharField(
        max_length=50,
        default='шт',
        verbose_name="Единица измерения"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'nomenclature_items'
        verbose_name = 'Номенклатурная позиция'
        verbose_name_plural = 'Номенклатурные позиции'
        ordering = ['catalog_category__sort_order', 'code']
        indexes = [
            models.Index(fields=['catalog_category', 'is_active']),
            models.Index(fields=['name']),
        ]
    
    def __str__(self):
        return f"[{self.code}] {self.name}"
    
    @property
    def is_purchased(self):
        """Закупаемая позиция."""
        return self.catalog_category.is_purchased if self.catalog_category else False
    
    @property
    def is_manufactured(self):
        """Изготавливаемая позиция."""
        return not self.is_purchased
    
    def clean(self):
        """Валидация: тип номенклатуры только для закупаемых позиций."""
        if self.nomenclature_type and self.catalog_category_id:
            try:
                cat = CatalogCategory.objects.get(pk=self.catalog_category_id)
                if not cat.is_purchased:
                    raise ValidationError({
                        'nomenclature_type': 'Тип номенклатуры можно указать только для закупаемых позиций.'
                    })
                if self.nomenclature_type.catalog_category_id != self.catalog_category_id:
                    raise ValidationError({
                        'nomenclature_type': 'Тип номенклатуры должен соответствовать виду справочника.'
                    })
            except CatalogCategory.DoesNotExist:
                pass


class NomenclatureSupplier(BaseModelWithHistory):
    """
    Связь номенклатурной позиции с поставщиком.
    
    Позволяет указать несколько поставщиков для закупаемой номенклатуры
    с указанием сроков поставки и приоритетности.
    """
    
    nomenclature_item = models.ForeignKey(
        NomenclatureItem,
        on_delete=models.CASCADE,
        related_name='item_suppliers',
        verbose_name="Номенклатура"
    )
    
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='nomenclature_links',
        verbose_name="Поставщик"
    )
    
    # Срок поставки (дней)
    delivery_days = models.PositiveIntegerField(
        default=7,
        verbose_name="Срок поставки (дней)"
    )
    
    # Артикул поставщика
    supplier_article = models.CharField(
        max_length=100,
        blank=True,
        verbose_name="Артикул поставщика"
    )
    
    # Цена (справочная)
    price = models.DecimalField(
        max_digits=15,
        decimal_places=2,
        null=True,
        blank=True,
        verbose_name="Цена"
    )
    currency = models.CharField(
        max_length=3,
        default='RUB',
        verbose_name="Валюта"
    )
    
    # Минимальное количество заказа
    min_order_qty = models.DecimalField(
        max_digits=15,
        decimal_places=3,
        null=True,
        blank=True,
        verbose_name="Мин. кол-во заказа"
    )
    
    # Приоритетный поставщик (один на номенклатуру)
    is_primary = models.BooleanField(
        default=False,
        verbose_name="Приоритетный поставщик"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'nomenclature_suppliers'
        verbose_name = 'Поставщик номенклатуры'
        verbose_name_plural = 'Поставщики номенклатуры'
        unique_together = [['nomenclature_item', 'supplier']]
        ordering = ['-is_primary', 'delivery_days']
    
    def __str__(self):
        return f"{self.nomenclature_item} - {self.supplier}"
    
    def clean(self):
        """Валидация: поставщик только для закупаемых позиций."""
        if self.nomenclature_item_id:
            try:
                item = NomenclatureItem.objects.select_related('catalog_category').get(pk=self.nomenclature_item_id)
                if not item.is_purchased:
                    raise ValidationError(
                        'Поставщиков можно указать только для закупаемых номенклатурных позиций.'
                    )
            except NomenclatureItem.DoesNotExist:
                pass


class DelayReason(BaseModelWithHistory):
    """
    Причина задержки - используется для закупок и производства.
    """
    
    PRODUCTION_CONFIG_CHOICES = [
        ('all', 'Все конфигурации'),
        ('internal', 'Своими силами'),
        ('contractor_our_supply', 'Подрядчик (мы снабжаем)'),
        ('contractor_their_supply', 'Подрядчик (сам закупает)'),
    ]
    
    name = models.CharField(
        max_length=200,
        verbose_name="Наименование причины"
    )
    description = models.TextField(
        blank=True,
        verbose_name="Описание"
    )
    applies_to_procurement = models.BooleanField(
        default=True,
        verbose_name="Для закупок"
    )
    applies_to_production = models.BooleanField(
        default=True,
        verbose_name="Для производства"
    )
    production_config = models.CharField(
        max_length=30,
        choices=PRODUCTION_CONFIG_CHOICES,
        default='all',
        verbose_name="Конфигурация производства",
        help_text="Указывает для каких конфигураций производства применима эта причина"
    )
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активна"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'delay_reasons'
        verbose_name = 'Причина задержки'
        verbose_name_plural = 'Причины задержек'
        ordering = ['name']
    
    def __str__(self):
        return self.name


class BankDetails(BaseModelWithHistory):
    """
    Банковские реквизиты организации (поставщика или подрядчика).
    
    Позволяет хранить несколько банковских счетов для каждой организации.
    """
    
    supplier = models.ForeignKey(
        Supplier,
        on_delete=models.CASCADE,
        related_name='bank_details',
        null=True,
        blank=True,
        verbose_name="Поставщик"
    )
    
    contractor = models.ForeignKey(
        Contractor,
        on_delete=models.CASCADE,
        related_name='bank_details',
        null=True,
        blank=True,
        verbose_name="Подрядчик"
    )
    
    # Наименование банка
    bank_name = models.CharField(
        max_length=300,
        verbose_name="Наименование банка"
    )
    
    # БИК
    bik = models.CharField(
        max_length=9,
        verbose_name="БИК"
    )
    
    # Корреспондентский счёт
    correspondent_account = models.CharField(
        max_length=20,
        blank=True,
        verbose_name="Корреспондентский счёт"
    )
    
    # Расчётный счёт
    settlement_account = models.CharField(
        max_length=20,
        verbose_name="Расчётный счёт"
    )
    
    # Валюта счёта
    currency = models.CharField(
        max_length=3,
        default='RUB',
        verbose_name="Валюта"
    )
    
    # Признак основного счёта
    is_primary = models.BooleanField(
        default=False,
        verbose_name="Основной счёт"
    )
    
    # Примечания
    notes = models.TextField(
        blank=True,
        verbose_name="Примечания"
    )
    
    is_active = models.BooleanField(
        default=True,
        verbose_name="Активен"
    )
    
    objects = ActiveManager()
    all_objects = AllObjectsManager()
    
    class Meta:
        db_table = 'bank_details'
        verbose_name = 'Банковские реквизиты'
        verbose_name_plural = 'Банковские реквизиты'
        ordering = ['-is_primary', 'bank_name']
    
    def __str__(self):
        return f"{self.bank_name} - {self.settlement_account}"
    
    def clean(self):
        """Валидация: должен быть привязан либо к поставщику, либо к подрядчику."""
        if not self.supplier and not self.contractor:
            raise ValidationError(
                'Банковские реквизиты должны быть привязаны к поставщику или подрядчику.'
            )
        if self.supplier and self.contractor:
            raise ValidationError(
                'Банковские реквизиты не могут быть одновременно привязаны к поставщику и подрядчику.'
            )


# ============================================================================
# LEGACY SUPPORT: Оставляем NomenclatureCategoryChoices для обратной совместимости
# пока не обновлены все остальные части системы
# ============================================================================

class NomenclatureCategoryChoices(models.TextChoices):
    """
    DEPRECATED: Используется для обратной совместимости.
    Для новых разработок используйте CatalogCategory.
    """
    MATERIAL = 'material', 'Материал'
    STANDARD_PRODUCT = 'standard_product', 'Стандартное изделие'
    OTHER_PRODUCT = 'other_product', 'Прочее изделие'
    PART = 'part', 'Деталь'
    ASSEMBLY_UNIT = 'assembly_unit', 'Сборочная единица'
    SUBSYSTEM = 'subsystem', 'Подсистема'
    SYSTEM = 'system', 'Система'
    STAND = 'stand', 'Стенд'


# Alias для обратной совместимости (SupplierOffer -> NomenclatureSupplier)
SupplierOffer = NomenclatureSupplier
