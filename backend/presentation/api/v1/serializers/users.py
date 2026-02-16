"""
User Serializers.

Serializers for authentication and user management.
"""

from rest_framework import serializers
from django.contrib.auth import get_user_model, authenticate
from django.contrib.auth.password_validation import validate_password
from infrastructure.persistence.models import (
    Role, 
    UserRole, 
    SystemModule, 
    UserModuleAccess, 
    RoleModuleAccess
)
from .base import BaseModelSerializer

User = get_user_model()


class RoleSerializer(BaseModelSerializer):
    """Serializer for roles."""
    
    users_count = serializers.SerializerMethodField()
    module_access = serializers.SerializerMethodField()
    visibility_type_display = serializers.CharField(source='get_visibility_type_display', read_only=True)
    child_structure_access_display = serializers.CharField(source='get_child_structure_access_display', read_only=True)
    project_access_scope_display = serializers.CharField(source='get_project_access_scope_display', read_only=True)
    
    class Meta:
        model = Role
        fields = [
            'id', 'code', 'name', 'description',
            'parent_role', 'is_system_role', 'is_active',
            'can_be_production_responsible', 'project_access_scope', 'project_access_scope_display',
            'can_be_inventory_responsible',
            # Legacy fields
            'visibility_type', 'visibility_type_display',
            'child_structure_access', 'child_structure_access_display',
            # Legacy fields
            'can_be_responsible', 'see_only_own_items', 'see_child_structures',
            'users_count', 'module_access',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'is_system_role', 'created_at', 'updated_at']
    
    def get_users_count(self, obj):
        return obj.user_roles.filter(is_active=True).count()
    
    def get_module_access(self, obj):
        """Get module access list for this role."""
        access_list = RoleModuleAccess.objects.filter(role=obj).select_related('module')
        return [
            {
                'id': str(a.id),
                'module_id': str(a.module_id),
                'module_code': a.module.code,
                'module_name': a.module.name,
                'access_level': a.access_level,
            }
            for a in access_list
        ]


class RoleMinimalSerializer(serializers.ModelSerializer):
    """Minimal serializer for Role model (for nested representations)."""
    
    class Meta:
        model = Role
        fields = ['id', 'name', 'code']


class UserRoleSerializer(BaseModelSerializer):
    """Serializer for UserRole model."""
    
    role_detail = RoleMinimalSerializer(source='role', read_only=True)
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    
    class Meta:
        model = UserRole
        fields = [
            'id', 'user', 'user_name', 'role', 'role_detail',
            'project_id', 'valid_from', 'valid_until',
            'is_active', 'assigned_by',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'assigned_by', 'created_at', 'updated_at']


class UserListSerializer(BaseModelSerializer):
    """List serializer for users."""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    roles_display = serializers.SerializerMethodField()
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email',
            'first_name', 'last_name', 'full_name',
            'department', 'position', 'is_active',
            'roles_display', 'last_login'
        ]
    
    def get_roles_display(self, obj):
        return list(
            obj.user_roles.filter(is_active=True)
            .values_list('role__name', flat=True)[:3]
        )


class UserDetailSerializer(BaseModelSerializer):
    """Detail serializer for users."""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    user_roles = UserRoleSerializer(many=True, read_only=True)
    role_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False
    )
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email',
            'first_name', 'last_name', 'middle_name', 'full_name',
            'phone', 'position', 'department',
            'timezone', 'language',
            'user_roles', 'role_ids',
            'is_active', 'is_staff', 'is_superuser',
            'date_joined', 'last_login', 'last_activity'
        ]
        read_only_fields = [
            'id', 'date_joined', 'last_login', 'last_activity'
        ]
    
    def update(self, instance, validated_data):
        role_ids = validated_data.pop('role_ids', None)
        instance = super().update(instance, validated_data)
        
        if role_ids is not None:
            # Deactivate current roles
            instance.user_roles.update(is_active=False)
            # Assign new roles
            for role_id in role_ids:
                UserRole.objects.update_or_create(
                    user=instance,
                    role_id=role_id,
                    project_id=None,
                    defaults={
                        'is_active': True,
                        'assigned_by': self.context['request'].user
                    }
                )
        
        return instance


class UserCreateSerializer(BaseModelSerializer):
    """Serializer for creating users."""
    
    password = serializers.CharField(
        write_only=True,
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    password_confirm = serializers.CharField(
        write_only=True,
        required=True,
        style={'input_type': 'password'}
    )
    role_ids = serializers.ListField(
        child=serializers.UUIDField(),
        write_only=True,
        required=False,
        default=list
    )
    
    class Meta:
        model = User
        fields = [
            'username', 'email', 'password', 'password_confirm',
            'first_name', 'last_name', 'middle_name',
            'phone', 'position', 'department',
            'timezone', 'language',
            'role_ids', 'is_active'
        ]
    
    def validate(self, attrs):
        if attrs['password'] != attrs['password_confirm']:
            raise serializers.ValidationError({
                'password_confirm': 'Пароли не совпадают.'
            })
        return attrs
    
    def create(self, validated_data):
        validated_data.pop('password_confirm')
        role_ids = validated_data.pop('role_ids', [])
        password = validated_data.pop('password')
        
        user = User.objects.create(**validated_data)
        user.set_password(password)
        user.save()
        
        # Assign roles via UserRole
        request_user = self.context.get('request')
        assigned_by = request_user.user if request_user else None
        
        for role_id in role_ids:
            UserRole.objects.create(
                user=user,
                role_id=role_id,
                is_active=True,
                assigned_by=assigned_by
            )
        
        return user


class ChangePasswordSerializer(serializers.Serializer):
    """Serializer for password change."""
    
    old_password = serializers.CharField(
        required=True,
        style={'input_type': 'password'}
    )
    new_password = serializers.CharField(
        required=True,
        validators=[validate_password],
        style={'input_type': 'password'}
    )
    new_password_confirm = serializers.CharField(
        required=True,
        style={'input_type': 'password'}
    )
    
    def validate_old_password(self, value):
        user = self.context['request'].user
        if not user.check_password(value):
            raise serializers.ValidationError('Неверный текущий пароль.')
        return value
    
    def validate(self, attrs):
        if attrs['new_password'] != attrs['new_password_confirm']:
            raise serializers.ValidationError({
                'new_password_confirm': 'Пароли не совпадают.'
            })
        return attrs


class LoginSerializer(serializers.Serializer):
    """Serializer for login."""
    
    username = serializers.CharField(required=True)
    password = serializers.CharField(
        required=True,
        style={'input_type': 'password'}
    )
    
    def validate(self, attrs):
        username = attrs.get('username')
        password = attrs.get('password')
        
        if username and password:
            user = authenticate(
                request=self.context.get('request'),
                username=username,
                password=password
            )
            if not user:
                raise serializers.ValidationError(
                    'Неверный логин или пароль.',
                    code='authorization'
                )
            if not user.is_active:
                raise serializers.ValidationError(
                    'Учетная запись деактивирована.',
                    code='authorization'
                )
            attrs['user'] = user
        return attrs


class UserProfileSerializer(BaseModelSerializer):
    """Serializer for user profile (self)."""
    
    full_name = serializers.CharField(source='get_full_name', read_only=True)
    user_roles = UserRoleSerializer(many=True, read_only=True)
    
    class Meta:
        model = User
        fields = [
            'id', 'username', 'email',
            'first_name', 'last_name', 'middle_name', 'full_name',
            'phone', 'position', 'department',
            'timezone', 'language',
            'user_roles',
            'is_active', 'is_staff', 'is_superuser',
            'date_joined', 'last_login', 'last_activity'
        ]
        read_only_fields = fields


class SystemModuleSerializer(serializers.ModelSerializer):
    """Serializer for SystemModule."""
    
    parent_name = serializers.CharField(source='parent.name', read_only=True, allow_null=True)
    children_count = serializers.SerializerMethodField()
    
    class Meta:
        model = SystemModule
        fields = [
            'id', 'code', 'name', 'description',
            'parent', 'parent_name',
            'sort_order', 'icon', 'is_active',
            'children_count',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_children_count(self, obj):
        return obj.children.filter(is_active=True).count()


class UserModuleAccessSerializer(serializers.ModelSerializer):
    """Serializer for UserModuleAccess."""
    
    user_name = serializers.CharField(source='user.get_full_name', read_only=True)
    module_name = serializers.CharField(source='module.name', read_only=True)
    module_code = serializers.CharField(source='module.code', read_only=True)
    access_level_display = serializers.CharField(source='get_access_level_display', read_only=True)
    
    class Meta:
        model = UserModuleAccess
        fields = [
            'id', 'user', 'user_name',
            'module', 'module_name', 'module_code',
            'access_level', 'access_level_display',
            'project_id',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']


class RoleModuleAccessSerializer(serializers.ModelSerializer):
    """Serializer for RoleModuleAccess."""
    
    role_name = serializers.CharField(source='role.name', read_only=True)
    module_name = serializers.CharField(source='module.name', read_only=True)
    module_code = serializers.CharField(source='module.code', read_only=True)
    access_level_display = serializers.CharField(source='get_access_level_display', read_only=True)
    
    class Meta:
        model = RoleModuleAccess
        fields = [
            'id', 'role', 'role_name',
            'module', 'module_name', 'module_code',
            'access_level', 'access_level_display',
            'created_at', 'updated_at'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at']
