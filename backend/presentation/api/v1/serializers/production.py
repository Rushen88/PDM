"""
Production API Serializers.

Serializers for production orders and manufacturing tracking.
"""

from rest_framework import serializers
from django.db import transaction

from infrastructure.persistence.models import (
    ProductionOrder,
    ProductionTask,
    Project,
    ProjectItem,
    NomenclatureItem,
    Contractor,
)


class ProductionTaskSerializer(serializers.ModelSerializer):
    """Serializer for production tasks."""
    
    nomenclature_detail = serializers.SerializerMethodField()
    project_item_detail = serializers.SerializerMethodField()
    contractor_detail = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductionTask
        fields = [
            'id',
            'order',
            'project_item',
            'project_item_detail',
            'nomenclature_item',
            'nomenclature_detail',
            'quantity',
            'unit',
            'completed_quantity',
            'progress',
            'status',
            'manufacturer_type',
            'contractor',
            'contractor_detail',
            'planned_start',
            'planned_end',
            'actual_start',
            'actual_end',
            'notes',
            'is_active',
            'created_at',
            'updated_at',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'progress']
    
    def get_nomenclature_detail(self, obj):
        if obj.nomenclature_item:
            return {
                'id': str(obj.nomenclature_item.id),
                'code': obj.nomenclature_item.code,
                'name': obj.nomenclature_item.name,
            }
        return None
    
    def get_project_item_detail(self, obj):
        if obj.project_item:
            project = obj.project_item.project
            return {
                'id': str(obj.project_item.id),
                'project_id': str(project.id) if project else None,
            }
        return None
    
    def get_contractor_detail(self, obj):
        if obj.contractor:
            return {
                'id': str(obj.contractor.id),
                'code': obj.contractor.code,
                'name': obj.contractor.name,
            }
        return None
    
    def get_progress(self, obj):
        if obj.quantity and obj.quantity > 0:
            return round((float(obj.completed_quantity) / float(obj.quantity)) * 100, 1)
        return 0


class ProductionOrderListSerializer(serializers.ModelSerializer):
    """Serializer for production order list."""

    project_name = serializers.CharField(source='project.name', read_only=True)
    tasks_count = serializers.SerializerMethodField()
    progress = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductionOrder
        fields = [
            'id',
            'number',
            'project',
            'project_name',
            'status',
            'planned_start',
            'planned_end',
            'actual_start',
            'actual_end',
            'tasks_count',
            'progress',
            'is_active',
            'created_at',
        ]
    
    def get_tasks_count(self, obj):
        return obj.tasks.count()

    def get_progress(self, obj):
        tasks = obj.tasks.all()
        if not tasks:
            return 0
        total = sum(float(t.quantity) for t in tasks)
        completed = sum(float(t.completed_quantity) for t in tasks)
        if total > 0:
            return round((completed / total) * 100, 1)
        return 0


class ProductionOrderDetailSerializer(serializers.ModelSerializer):
    """Serializer for production order detail."""
    
    project_detail = serializers.SerializerMethodField()
    tasks = ProductionTaskSerializer(many=True, read_only=True)
    progress = serializers.SerializerMethodField()
    
    class Meta:
        model = ProductionOrder
        fields = [
            'id',
            'number',
            'project',
            'project_detail',
            'status',
            'planned_start',
            'planned_end',
            'actual_start',
            'actual_end',
            'notes',
            'tasks',
            'progress',
            'is_active',
            'created_at',
            'updated_at',
            'created_by',
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'created_by', 'progress']
    
    def get_project_detail(self, obj):
        if obj.project:
            return {
                'id': str(obj.project.id),
                'name': obj.project.name,
            }
        return None
    
    def get_progress(self, obj):
        tasks = obj.tasks.all()
        if not tasks:
            return 0
        total = sum(float(t.quantity) for t in tasks)
        completed = sum(float(t.completed_quantity) for t in tasks)
        if total > 0:
            return round((completed / total) * 100, 1)
        return 0


class ProductionOrderCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating production orders."""
    
    class Meta:
        model = ProductionOrder
        fields = [
            'number',
            'project',
            'status',
            'planned_start',
            'planned_end',
            'notes',
        ]
    
    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class ProductionTaskCreateSerializer(serializers.ModelSerializer):
    """Serializer for creating production tasks."""
    
    class Meta:
        model = ProductionTask
        fields = [
            'order',
            'project_item',
            'nomenclature_item',
            'quantity',
            'unit',
            'status',
            'manufacturer_type',
            'contractor',
            'planned_start',
            'planned_end',
            'notes',
        ]
    
    def create(self, validated_data):
        validated_data['created_by'] = self.context['request'].user
        return super().create(validated_data)


class ProductionStatsSerializer(serializers.Serializer):
    """Serializer for production statistics."""
    
    total_orders = serializers.IntegerField()
    in_progress = serializers.IntegerField()
    completed = serializers.IntegerField()
    total_tasks = serializers.IntegerField()
    tasks_not_started = serializers.IntegerField()
    tasks_in_progress = serializers.IntegerField()
    tasks_completed = serializers.IntegerField()
    tasks_delayed = serializers.IntegerField()
    overall_progress = serializers.FloatField()
