"""
User Views.

API views for authentication and user management.
"""

from rest_framework import status, viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken
from rest_framework_simplejwt.views import TokenObtainPairView
from rest_framework_simplejwt.serializers import TokenRefreshSerializer
from django_filters.rest_framework import DjangoFilterBackend
from django.contrib.auth import get_user_model
from django.db import transaction

from infrastructure.persistence.models import Role, UserRole
from ..serializers.users import (
    UserListSerializer,
    UserDetailSerializer,
    UserCreateSerializer,
    UserProfileSerializer,
    ChangePasswordSerializer,
    LoginSerializer,
    RoleSerializer,
    UserRoleSerializer,
)
from .base import BaseModelViewSet

User = get_user_model()


class AuthViewSet(viewsets.GenericViewSet):
    """
    ViewSet for authentication.
    
    Endpoints:
    - POST /auth/login/ - login and get JWT tokens
    - POST /auth/logout/ - logout (blacklist refresh token)
    - POST /auth/refresh/ - refresh access token
    - GET /auth/me/ - get current user profile
    - POST /auth/change-password/ - change password
    """
    
    permission_classes = [AllowAny]
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def login(self, request):
        """Login and get JWT tokens."""
        serializer = LoginSerializer(data=request.data, context={'request': request})
        
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        
        user = serializer.validated_data['user']
        
        # Generate tokens
        refresh = RefreshToken.for_user(user)
        
        # Update last login
        from django.utils import timezone
        user.last_login = timezone.now()
        user.save(update_fields=['last_login'])
        
        # Log audit
        from infrastructure.persistence.models import AuditLog
        AuditLog.objects.create(
            user=user,
            action='login',
            user_ip=self._get_client_ip(request),
            user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
            object_repr=str(user),
        )
        
        return Response({
            'access': str(refresh.access_token),
            'refresh': str(refresh),
            'user': UserProfileSerializer(user).data,
        })
    
    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def refresh(self, request):
        """Refresh access token."""
        serializer = TokenRefreshSerializer(data=request.data)
        
        try:
            serializer.is_valid(raise_exception=True)
        except Exception as e:
            return Response(
                {"code": "token_not_valid", "detail": str(e)}, 
                status=status.HTTP_401_UNAUTHORIZED
            )
            
        return Response(serializer.validated_data, status=status.HTTP_200_OK)

    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def logout(self, request):
        """Logout and blacklist refresh token."""
        try:
            refresh_token = request.data.get('refresh')
            if refresh_token:
                token = RefreshToken(refresh_token)
                token.blacklist()
            
            # Log audit
            from infrastructure.persistence.models import AuditLog
            AuditLog.objects.create(
                user=request.user,
                action='logout',
                user_ip=self._get_client_ip(request),
                user_agent=request.META.get('HTTP_USER_AGENT', '')[:500],
                object_repr=str(request.user),
            )
            
            return Response({'message': 'Выход выполнен успешно'})
        except Exception as e:
            return Response(
                {'error': str(e)},
                status=status.HTTP_400_BAD_REQUEST
            )
    
    @action(detail=False, methods=['get'], permission_classes=[IsAuthenticated])
    def me(self, request):
        """Get current user profile."""
        serializer = UserProfileSerializer(request.user)
        return Response(serializer.data)
    
    @action(detail=False, methods=['put'], permission_classes=[IsAuthenticated])
    def update_profile(self, request):
        """Update current user profile."""
        user = request.user
        
        # Only allow updating certain fields
        allowed_fields = ['first_name', 'last_name', 'middle_name', 'phone', 'email']
        update_data = {k: v for k, v in request.data.items() if k in allowed_fields}
        
        serializer = UserDetailSerializer(
            user,
            data=update_data,
            partial=True,
            context={'request': request}
        )
        
        if serializer.is_valid():
            serializer.save()
            return Response(UserProfileSerializer(user).data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    @action(detail=False, methods=['post'], permission_classes=[IsAuthenticated])
    def change_password(self, request):
        """Change current user password."""
        serializer = ChangePasswordSerializer(
            data=request.data,
            context={'request': request}
        )
        
        if serializer.is_valid():
            request.user.set_password(serializer.validated_data['new_password'])
            request.user.save()
            return Response({'message': 'Пароль успешно изменен'})
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def _get_client_ip(self, request):
        """Get client IP address from request."""
        x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
        if x_forwarded_for:
            ip = x_forwarded_for.split(',')[0]
        else:
            ip = request.META.get('REMOTE_ADDR')
        return ip


class UserViewSet(BaseModelViewSet):
    """
    ViewSet for user management.
    
    Endpoints:
    - GET /users/ - list all users
    - POST /users/ - create user
    - GET /users/{id}/ - get user details
    - PUT/PATCH /users/{id}/ - update user
    - DELETE /users/{id}/ - deactivate user
    - POST /users/{id}/activate/ - activate user
    - POST /users/{id}/deactivate/ - deactivate user
    - POST /users/{id}/reset-password/ - reset user password (admin)
    """
    
    queryset = User.objects.prefetch_related('user_roles', 'user_roles__role')
    
    serializer_classes = {
        'list': UserListSerializer,
        'retrieve': UserDetailSerializer,
        'create': UserCreateSerializer,
        'default': UserDetailSerializer,
    }
    
    search_fields = ['username', 'email', 'first_name', 'last_name', 'position']
    filterset_fields = ['is_active', 'department']
    ordering_fields = ['username', 'last_name', 'date_joined', 'last_login']
    ordering = ['last_name', 'first_name']
    
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    
    def get_serializer_class(self):
        return self.serializer_classes.get(
            self.action,
            self.serializer_classes['default']
        )
    
    def perform_create(self, serializer):
        """Override to skip audit fields (User doesn't have created_by/updated_by)."""
        serializer.save()
    
    def perform_update(self, serializer):
        """Override to skip audit fields."""
        serializer.save()
    
    def destroy(self, request, *args, **kwargs):
        """Deactivate user instead of deleting."""
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response(status=status.HTTP_204_NO_CONTENT)
    
    @action(detail=True, methods=['post'])
    def activate(self, request, pk=None):
        """Activate user."""
        user = self.get_object()
        user.is_active = True
        user.save(update_fields=['is_active'])
        return Response({'message': 'Пользователь активирован'})
    
    @action(detail=True, methods=['post'])
    def deactivate(self, request, pk=None):
        """Deactivate user."""
        user = self.get_object()
        user.is_active = False
        user.save(update_fields=['is_active'])
        return Response({'message': 'Пользователь деактивирован'})
    
    @action(detail=True, methods=['post'])
    def reset_password(self, request, pk=None):
        """Reset user password (admin function)."""
        user = self.get_object()
        new_password = request.data.get('new_password')
        
        if not new_password:
            # Generate random password
            import secrets
            new_password = secrets.token_urlsafe(12)
        
        user.set_password(new_password)
        user.save()
        
        return Response({
            'message': 'Пароль успешно сброшен',
            'new_password': new_password,  # Only return if generated
        })
    
    @action(detail=True, methods=['post'])
    def set_roles(self, request, pk=None):
        """Set user roles."""
        user = self.get_object()
        role_ids = request.data.get('role_ids', [])
        
        # Deactivate current global roles
        user.user_roles.filter(project_id__isnull=True).update(is_active=False)
        
        # Assign new roles
        for role_id in role_ids:
            UserRole.objects.update_or_create(
                user=user,
                role_id=role_id,
                project_id=None,
                defaults={
                    'is_active': True,
                    'assigned_by': request.user
                }
            )
        
        serializer = UserDetailSerializer(user, context={'request': request})
        return Response(serializer.data)
    
    @action(detail=False, methods=['get'])
    def by_department(self, request):
        """Get users grouped by department."""
        users = self.get_queryset()
        
        # Group by department field
        departments = set(users.values_list('department', flat=True))
        result = []
        
        for dept in departments:
            dept_users = users.filter(department=dept)
            result.append({
                'department': dept if dept else 'Без отдела',
                'users': UserListSerializer(dept_users, many=True).data,
            })
        
        return Response(result)
    
    @action(detail=False, methods=['get'])
    def responsible_candidates(self, request):
        """
        Get users who can be assigned as responsible.
        
        Returns users whose roles have can_be_responsible=True.
        """
        # Get roles that allow being responsible
        responsible_roles = Role.objects.filter(
            is_active=True,
            can_be_responsible=True
        ).values_list('id', flat=True)
        
        # Get users with these roles
        users = User.objects.filter(
            is_active=True,
            user_roles__role_id__in=responsible_roles,
            user_roles__is_active=True
        ).distinct().select_related().order_by('last_name', 'first_name')
        
        # If no roles are set as responsible, fallback to all active users
        if not users.exists():
            users = User.objects.filter(is_active=True).order_by('last_name', 'first_name')
        
        result = [
            {
                'id': str(u.id),
                'full_name': u.get_full_name() or u.username,
                'username': u.username,
                'position': u.position,
                'department': u.department,
            }
            for u in users
        ]
        
        return Response(result)


class RoleViewSet(BaseModelViewSet):
    """ViewSet for role management."""
    
    queryset = Role.objects.all()
    serializer_class = RoleSerializer
    
    search_fields = ['code', 'name']
    ordering = ['name']
    
    filter_backends = [
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    
    def perform_create(self, serializer):
        """Override to skip audit fields (Role doesn't have created_by/updated_by)."""
        serializer.save()
    
    def perform_update(self, serializer):
        """Override to skip audit fields."""
        serializer.save()
    
    def destroy(self, request, *args, **kwargs):
        """
        Delete role.
        Note: System roles can also be deleted by administrator request.
        """
        return super().destroy(request, *args, **kwargs)
    
    @action(detail=True, methods=['get'])
    def users(self, request, pk=None):
        """Get users with this role."""
        role = self.get_object()
        user_roles = role.user_roles.filter(is_active=True).select_related('user')
        users = [ur.user for ur in user_roles]
        serializer = UserListSerializer(users, many=True)
        return Response(serializer.data)
    
    @action(detail=True, methods=['post'])
    def set_module_access(self, request, pk=None):
        """
        Set module access for this role.
        
        Request body:
        {
            "module_access": [
                {"module_id": "uuid", "access_level": "none|view|edit|full"},
                ...
            ]
        }
        """
        from infrastructure.persistence.models import RoleModuleAccess, SystemModule
        
        role = self.get_object()
        module_access = request.data.get('module_access', [])
        
        with transaction.atomic():
            # Delete existing access
            RoleModuleAccess.objects.filter(role=role).delete()
            
            # Create new access entries
            for item in module_access:
                module_id = item.get('module_id')
                access_level = item.get('access_level', 'none')
                
                if module_id and access_level != 'none':
                    try:
                        module = SystemModule.objects.get(id=module_id)
                        RoleModuleAccess.objects.create(
                            role=role,
                            module=module,
                            access_level=access_level
                        )
                    except SystemModule.DoesNotExist:
                        pass
        
        serializer = self.get_serializer(role)
        return Response(serializer.data)


class UserRoleViewSet(BaseModelViewSet):
    """ViewSet for user role assignments."""
    
    queryset = UserRole.objects.select_related('user', 'role', 'assigned_by')
    serializer_class = UserRoleSerializer
    
    filterset_fields = ['user', 'role', 'project_id', 'is_active']
    ordering = ['-created_at']
    
    filter_backends = [
        DjangoFilterBackend,
        filters.OrderingFilter,
    ]
    
    def perform_create(self, serializer):
        serializer.save(assigned_by=self.request.user)


class SystemModuleViewSet(viewsets.ModelViewSet):
    """ViewSet for system modules management."""
    
    from infrastructure.persistence.models import SystemModule
    
    queryset = SystemModule.objects.filter(is_active=True).select_related('parent')
    permission_classes = [IsAuthenticated]
    
    search_fields = ['code', 'name']
    filterset_fields = ['parent', 'is_active']
    ordering = ['sort_order', 'name']
    
    filter_backends = [
        DjangoFilterBackend,
        filters.SearchFilter,
        filters.OrderingFilter,
    ]
    
    def get_serializer_class(self):
        from ..serializers.users import SystemModuleSerializer
        return SystemModuleSerializer
    
    @action(detail=False, methods=['get'])
    def tree(self, request):
        """Get modules as tree structure."""
        modules = self.queryset.filter(parent__isnull=True)
        
        def build_tree(module):
            children = self.queryset.filter(parent=module)
            return {
                'id': str(module.id),
                'code': module.code,
                'name': module.name,
                'icon': module.icon,
                'children': [build_tree(c) for c in children],
            }
        
        tree = [build_tree(m) for m in modules]
        return Response(tree)


class UserModuleAccessViewSet(viewsets.ModelViewSet):
    """ViewSet for user module access management."""
    
    from infrastructure.persistence.models import UserModuleAccess
    
    queryset = UserModuleAccess.objects.select_related('user', 'module')
    permission_classes = [IsAuthenticated]
    
    filterset_fields = ['user', 'module', 'access_level', 'project_id']
    ordering = ['user', 'module__sort_order']
    
    filter_backends = [
        DjangoFilterBackend,
        filters.OrderingFilter,
    ]
    
    def get_serializer_class(self):
        from ..serializers.users import UserModuleAccessSerializer
        return UserModuleAccessSerializer
    
    @action(detail=False, methods=['get'])
    def my_access(self, request):
        """Get current user's module access."""
        user = request.user
        
        # Get direct user access
        user_access = self.queryset.filter(user=user)
        
        # Get role-based access
        from infrastructure.persistence.models import RoleModuleAccess, UserRole
        user_role_ids = UserRole.objects.filter(
            user=user, 
            is_active=True, 
            project_id__isnull=True
        ).values_list('role_id', flat=True)
        
        role_access = RoleModuleAccess.objects.filter(role_id__in=user_role_ids)
        
        # Merge access (user access overrides role access)
        access_map = {}
        for ra in role_access:
            access_map[str(ra.module_id)] = {
                'module_id': str(ra.module_id),
                'module_code': ra.module.code,
                'module_name': ra.module.name,
                'access_level': ra.access_level,
                'source': 'role'
            }
        
        for ua in user_access:
            access_map[str(ua.module_id)] = {
                'module_id': str(ua.module_id),
                'module_code': ua.module.code,
                'module_name': ua.module.name,
                'access_level': ua.access_level,
                'source': 'user'
            }
        
        return Response(list(access_map.values()))
    
    @action(detail=False, methods=['post'])
    def bulk_update(self, request):
        """Bulk update user module access."""
        user_id = request.data.get('user_id')
        access_list = request.data.get('access', [])
        
        if not user_id:
            return Response(
                {'error': 'user_id is required'},
                status=status.HTTP_400_BAD_REQUEST
            )
        
        from infrastructure.persistence.models import UserModuleAccess
        
        # Update or create access records
        updated = 0
        for item in access_list:
            module_id = item.get('module_id')
            access_level = item.get('access_level', 'none')
            
            if access_level == 'none':
                # Remove access
                UserModuleAccess.objects.filter(
                    user_id=user_id,
                    module_id=module_id,
                    project_id__isnull=True
                ).delete()
            else:
                # Update or create
                UserModuleAccess.objects.update_or_create(
                    user_id=user_id,
                    module_id=module_id,
                    project_id=None,
                    defaults={'access_level': access_level}
                )
            updated += 1
        
        return Response({
            'message': f'Обновлено {updated} записей',
            'updated_count': updated
        })

