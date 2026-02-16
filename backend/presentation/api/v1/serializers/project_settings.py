"""
Project Settings Serializers.

Serializers for configurable status and problem reason references.
"""

from rest_framework import serializers
from infrastructure.persistence.models import (
    ManufacturingStatus,
    PurchaseStatus,
    ManufacturingProblemReason,
    ManufacturingProblemSubreason,
    PurchaseProblemReason,
    PurchaseProblemSubreason,
    ProjectItemProblem,
)
from .base import BaseModelSerializer


class ManufacturingStatusSerializer(BaseModelSerializer):
    """Serializer for manufacturing status reference."""
    
    class Meta:
        model = ManufacturingStatus
        fields = [
            'id', 'code', 'name', 'description',
            'color', 'sort_order',
            'is_default', 'is_completed', 'progress_percent',
            'auto_trigger', 'is_system', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['is_system']
    
    def validate_code(self, value):
        """Check for duplicate codes."""
        queryset = ManufacturingStatus.objects.filter(code=value, is_active=True)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Статус с таким кодом уже существует')
        return value


class PurchaseStatusSerializer(BaseModelSerializer):
    """Serializer for purchase status reference."""
    
    class Meta:
        model = PurchaseStatus
        fields = [
            'id', 'code', 'name', 'description',
            'color', 'sort_order',
            'is_default', 'is_delivered', 'is_not_required', 'progress_percent',
            'auto_trigger', 'is_system', 'is_active',
            'created_at', 'updated_at',
        ]
        read_only_fields = ['is_system']
    
    def validate_code(self, value):
        """Check for duplicate codes."""
        queryset = PurchaseStatus.objects.filter(code=value, is_active=True)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Статус с таким кодом уже существует')
        return value


class ManufacturingProblemReasonSerializer(BaseModelSerializer):
    """Serializer for manufacturing problem reasons."""
    
    severity_display = serializers.SerializerMethodField()
    
    class Meta:
        model = ManufacturingProblemReason
        fields = [
            'id', 'code', 'name', 'description',
            'severity', 'severity_display',
            'sort_order', 'suggested_action', 'is_active',
            'created_at', 'updated_at',
        ]
    
    def get_severity_display(self, obj):
        severity_map = {
            1: 'Низкая',
            2: 'Средняя',
            3: 'Высокая',
            4: 'Критическая',
        }
        return severity_map.get(obj.severity, 'Неизвестно')
    
    def validate_code(self, value):
        queryset = ManufacturingProblemReason.objects.filter(code=value, is_active=True)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Причина с таким кодом уже существует')
        return value


class PurchaseProblemReasonSerializer(BaseModelSerializer):
    """Serializer for purchase problem reasons."""
    
    severity_display = serializers.SerializerMethodField()
    
    class Meta:
        model = PurchaseProblemReason
        fields = [
            'id', 'code', 'name', 'description',
            'severity', 'severity_display',
            'sort_order', 'suggested_action', 'is_active',
            'created_at', 'updated_at',
        ]
    
    def get_severity_display(self, obj):
        severity_map = {
            1: 'Низкая',
            2: 'Средняя',
            3: 'Высокая',
            4: 'Критическая',
        }
        return severity_map.get(obj.severity, 'Неизвестно')
    
    def validate_code(self, value):
        queryset = PurchaseProblemReason.objects.filter(code=value, is_active=True)
        if self.instance:
            queryset = queryset.exclude(pk=self.instance.pk)
        if queryset.exists():
            raise serializers.ValidationError('Причина с таким кодом уже существует')
        return value


class ManufacturingProblemSubreasonSerializer(BaseModelSerializer):
    """Serializer for manufacturing problem subreasons."""

    class Meta:
        model = ManufacturingProblemSubreason
        fields = [
            'id', 'reason', 'name', 'sort_order', 'is_active',
            'created_at', 'updated_at',
        ]


class PurchaseProblemSubreasonSerializer(BaseModelSerializer):
    """Serializer for purchase problem subreasons."""

    class Meta:
        model = PurchaseProblemSubreason
        fields = [
            'id', 'reason', 'name', 'sort_order', 'is_active',
            'created_at', 'updated_at',
        ]


class ProjectItemProblemListSerializer(BaseModelSerializer):
    """List serializer for project item problems."""
    
    problem_type_display = serializers.CharField(
        source='get_problem_type_display',
        read_only=True
    )
    manufacturing_reason_detail = ManufacturingProblemReasonSerializer(
        source='manufacturing_reason',
        read_only=True
    )
    purchase_reason_detail = PurchaseProblemReasonSerializer(
        source='purchase_reason',
        read_only=True
    )
    
    class Meta:
        model = ProjectItemProblem
        fields = [
            'id', 'project_item',
            'problem_type', 'problem_type_display',
            'manufacturing_reason', 'manufacturing_reason_detail',
            'purchase_reason', 'purchase_reason_detail',
            'description', 'impact_description',
            'is_resolved', 'resolution_date', 'resolution_notes',
            'reported_by', 'resolved_by',
            'created_at', 'updated_at',
        ]


class ProjectItemProblemDetailSerializer(BaseModelSerializer):
    """Detail serializer for project item problems."""
    
    problem_type_display = serializers.CharField(
        source='get_problem_type_display',
        read_only=True
    )
    manufacturing_reason_detail = ManufacturingProblemReasonSerializer(
        source='manufacturing_reason',
        read_only=True
    )
    purchase_reason_detail = PurchaseProblemReasonSerializer(
        source='purchase_reason',
        read_only=True
    )
    
    class Meta:
        model = ProjectItemProblem
        fields = [
            'id', 'project_item',
            'problem_type', 'problem_type_display',
            'manufacturing_reason', 'manufacturing_reason_detail',
            'purchase_reason', 'purchase_reason_detail',
            'description', 'impact_description',
            'is_resolved', 'resolution_date', 'resolution_notes',
            'reported_by', 'resolved_by',
            'is_active',
            'created_at', 'updated_at',
        ]
    
    def validate(self, data):
        problem_type = data.get('problem_type')
        manufacturing_reason = data.get('manufacturing_reason')
        purchase_reason = data.get('purchase_reason')
        
        if problem_type == 'manufacturing' and not manufacturing_reason:
            raise serializers.ValidationError({
                'manufacturing_reason': 'Укажите причину проблемы изготовления'
            })
        
        if problem_type == 'purchasing' and not purchase_reason:
            raise serializers.ValidationError({
                'purchase_reason': 'Укажите причину проблемы закупки'
            })
        
        return data
