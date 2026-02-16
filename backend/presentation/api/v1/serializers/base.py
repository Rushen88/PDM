"""
Base Serializers.

Common serializer mixins and base classes.
"""

from rest_framework import serializers
from django.contrib.auth import get_user_model

User = get_user_model()


class AuditFieldsMixin(serializers.Serializer):
    """Mixin for audit fields (created_at, updated_at, etc.)"""
    
    created_at = serializers.DateTimeField(read_only=True)
    updated_at = serializers.DateTimeField(read_only=True)
    created_by = serializers.StringRelatedField(read_only=True)
    updated_by = serializers.StringRelatedField(read_only=True)


class SoftDeleteFieldsMixin(serializers.Serializer):
    """Mixin for soft delete fields."""
    
    is_deleted = serializers.BooleanField(read_only=True)
    deleted_at = serializers.DateTimeField(read_only=True)


class VersionedFieldsMixin(serializers.Serializer):
    """Mixin for versioned fields."""
    
    version = serializers.IntegerField(read_only=True)


class BaseModelSerializer(serializers.ModelSerializer):
    """
    Base serializer with common configuration.
    """
    
    class Meta:
        abstract = True
        read_only_fields = ['id', 'created_at', 'updated_at']


class UserMinimalSerializer(serializers.ModelSerializer):
    """Minimal user serializer for nested representations."""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    
    class Meta:
        model = User
        fields = ['id', 'username', 'full_name', 'email']
        read_only_fields = fields


class RecursiveSerializer(serializers.Serializer):
    """Serializer for recursive tree structures."""
    
    def to_representation(self, instance):
        serializer = self.parent.parent.__class__(instance, context=self.context)
        return serializer.data
