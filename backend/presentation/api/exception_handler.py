from django.db import IntegrityError
from django.db.models.deletion import ProtectedError
from rest_framework import status
from rest_framework.response import Response
from rest_framework.views import exception_handler

def custom_exception_handler(exc, context):
    """
    Custom exception handler that passes through to default DRF handler for now.
    """
    if isinstance(exc, ProtectedError):
        protected = []
        try:
            protected = [str(o) for o in list(exc.protected_objects)[:5]]
        except Exception:
            protected = []

        return Response(
            {
                'detail': 'Нельзя удалить объект: на него есть ссылки в других документах.',
                'error': 'protected_error',
                'protected_objects_sample': protected,
            },
            status=status.HTTP_409_CONFLICT,
        )

    if isinstance(exc, IntegrityError):
        return Response(
            {
                'detail': 'Нарушение целостности данных (возможны связанные записи).',
                'error': 'integrity_error',
            },
            status=status.HTTP_409_CONFLICT,
        )

    response = exception_handler(exc, context)
    
    if response is not None:
        # Optional: Add custom logic here, e.g. standardized formatting
        # For now, keep it simple to ensure compatibility
        pass
        
    return response
