"""
Domain Exceptions.

Custom exceptions for domain-level errors.
These exceptions represent business rule violations.
"""

from typing import Optional, Any, Dict


class DomainException(Exception):
    """Base exception for all domain errors."""
    
    def __init__(
        self,
        message: str,
        code: Optional[str] = None,
        details: Optional[Dict[str, Any]] = None
    ):
        super().__init__(message)
        self.message = message
        self.code = code or "DOMAIN_ERROR"
        self.details = details or {}


class EntityNotFoundException(DomainException):
    """Raised when an entity is not found."""
    
    def __init__(self, entity_type: str, entity_id: Any):
        super().__init__(
            message=f"{entity_type} with id '{entity_id}' not found",
            code="ENTITY_NOT_FOUND",
            details={"entity_type": entity_type, "entity_id": str(entity_id)}
        )


class EntityAlreadyExistsException(DomainException):
    """Raised when trying to create an entity that already exists."""
    
    def __init__(self, entity_type: str, identifier: Any):
        super().__init__(
            message=f"{entity_type} with identifier '{identifier}' already exists",
            code="ENTITY_ALREADY_EXISTS",
            details={"entity_type": entity_type, "identifier": str(identifier)}
        )


class InvalidOperationException(DomainException):
    """Raised when an operation is not valid in the current state."""
    
    def __init__(self, message: str, current_state: Optional[str] = None):
        super().__init__(
            message=message,
            code="INVALID_OPERATION",
            details={"current_state": current_state} if current_state else {}
        )


class ValidationException(DomainException):
    """Raised when validation fails."""
    
    def __init__(self, message: str, field: Optional[str] = None, value: Any = None):
        super().__init__(
            message=message,
            code="VALIDATION_ERROR",
            details={"field": field, "value": str(value) if value is not None else None}
        )


class ConcurrencyException(DomainException):
    """Raised when optimistic locking fails due to concurrent modification."""
    
    def __init__(self, entity_type: str, entity_id: Any, expected_version: int):
        super().__init__(
            message=f"{entity_type} '{entity_id}' was modified by another user",
            code="CONCURRENCY_ERROR",
            details={
                "entity_type": entity_type,
                "entity_id": str(entity_id),
                "expected_version": expected_version
            }
        )


class InsufficientStockException(DomainException):
    """Raised when there is not enough stock for an operation."""
    
    def __init__(
        self,
        item_id: Any,
        requested_quantity: str,
        available_quantity: str
    ):
        super().__init__(
            message=f"Insufficient stock for item '{item_id}'. "
                    f"Requested: {requested_quantity}, Available: {available_quantity}",
            code="INSUFFICIENT_STOCK",
            details={
                "item_id": str(item_id),
                "requested_quantity": requested_quantity,
                "available_quantity": available_quantity
            }
        )


class CircularReferenceException(DomainException):
    """Raised when a circular reference is detected in BOM structure."""
    
    def __init__(self, item_ids: list):
        super().__init__(
            message="Circular reference detected in BOM structure",
            code="CIRCULAR_REFERENCE",
            details={"item_ids": [str(id) for id in item_ids]}
        )


class StatusTransitionException(DomainException):
    """Raised when an invalid status transition is attempted."""
    
    def __init__(
        self,
        entity_type: str,
        current_status: str,
        target_status: str,
        allowed_transitions: Optional[list] = None
    ):
        super().__init__(
            message=f"Cannot transition {entity_type} from '{current_status}' to '{target_status}'",
            code="INVALID_STATUS_TRANSITION",
            details={
                "entity_type": entity_type,
                "current_status": current_status,
                "target_status": target_status,
                "allowed_transitions": allowed_transitions or []
            }
        )


class AuthorizationException(DomainException):
    """Raised when user is not authorized to perform an operation."""
    
    def __init__(self, operation: str, resource: Optional[str] = None):
        super().__init__(
            message=f"Not authorized to perform '{operation}'" +
                    (f" on '{resource}'" if resource else ""),
            code="AUTHORIZATION_ERROR",
            details={"operation": operation, "resource": resource}
        )


class BusinessRuleViolationException(DomainException):
    """Raised when a business rule is violated."""
    
    def __init__(self, rule: str, message: str):
        super().__init__(
            message=message,
            code="BUSINESS_RULE_VIOLATION",
            details={"rule": rule}
        )
