"""
Custom pagination classes for the API.
"""

from rest_framework.pagination import PageNumberPagination


class StandardResultsSetPagination(PageNumberPagination):
    """
    Standard pagination class that allows page_size to be set via query parameter.
    
    Allows clients to request different page sizes using ?page_size=N parameter.
    Default is 50, max is 1000.
    """
    page_size = 50
    page_size_query_param = 'page_size'  # Allow client to set page size
    max_page_size = 1000  # Maximum allowed page size


class LargeResultsSetPagination(PageNumberPagination):
    """
    Pagination for views that need to return larger datasets.
    Used for MaterialRequirements, ProjectItems, etc.
    """
    page_size = 500
    page_size_query_param = 'page_size'
    max_page_size = 5000


class UnlimitedResultsSetPagination(PageNumberPagination):
    """
    Pagination that allows very large results.
    Use with caution - only for known limited datasets.
    """
    page_size = 1000
    page_size_query_param = 'page_size'
    max_page_size = 10000
