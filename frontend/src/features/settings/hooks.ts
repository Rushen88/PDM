import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
    ManufacturingProblemReason,
    ManufacturingProblemSubreason,
    ManufacturingStatusRef,
    ProjectItemProblem,
    PurchaseProblemReason,
    PurchaseProblemSubreason,
    PurchaseStatusRef,
} from './api';
import { settingsApi } from './api';

/**
 * Query Keys
 */
export const settingsKeys = {
  manufacturingStatuses: {
    all: ['manufacturing-statuses'] as const,
    list: () => [...settingsKeys.manufacturingStatuses.all, 'list'] as const,
    detail: (id: string) => [...settingsKeys.manufacturingStatuses.all, 'detail', id] as const,
  },
  purchaseStatuses: {
    all: ['purchase-statuses'] as const,
    list: () => [...settingsKeys.purchaseStatuses.all, 'list'] as const,
    detail: (id: string) => [...settingsKeys.purchaseStatuses.all, 'detail', id] as const,
  },
  manufacturingProblemReasons: {
    all: ['manufacturing-problem-reasons'] as const,
    list: () => [...settingsKeys.manufacturingProblemReasons.all, 'list'] as const,
    detail: (id: string) => [...settingsKeys.manufacturingProblemReasons.all, 'detail', id] as const,
  },
  manufacturingProblemSubreasons: {
    all: ['manufacturing-problem-subreasons'] as const,
    list: (reasonId?: string) => [...settingsKeys.manufacturingProblemSubreasons.all, 'list', reasonId] as const,
    detail: (id: string) => [...settingsKeys.manufacturingProblemSubreasons.all, 'detail', id] as const,
  },
  purchaseProblemReasons: {
    all: ['purchase-problem-reasons'] as const,
    list: () => [...settingsKeys.purchaseProblemReasons.all, 'list'] as const,
    detail: (id: string) => [...settingsKeys.purchaseProblemReasons.all, 'detail', id] as const,
  },
  purchaseProblemSubreasons: {
    all: ['purchase-problem-subreasons'] as const,
    list: (reasonId?: string) => [...settingsKeys.purchaseProblemSubreasons.all, 'list', reasonId] as const,
    detail: (id: string) => [...settingsKeys.purchaseProblemSubreasons.all, 'detail', id] as const,
  },
  projectItemProblems: {
    all: ['project-item-problems'] as const,
    list: (params?: { project_item?: string; is_resolved?: boolean }) =>
      [...settingsKeys.projectItemProblems.all, 'list', params] as const,
    detail: (id: string) => [...settingsKeys.projectItemProblems.all, 'detail', id] as const,
  },
};

// ===============================
// Manufacturing Statuses Hooks
// ===============================

export function useManufacturingStatuses() {
  return useQuery({
    queryKey: settingsKeys.manufacturingStatuses.list(),
    queryFn: settingsApi.manufacturingStatuses.list,
  });
}

export function useManufacturingStatus(id: string) {
  return useQuery({
    queryKey: settingsKeys.manufacturingStatuses.detail(id),
    queryFn: () => settingsApi.manufacturingStatuses.get(id),
    enabled: !!id,
  });
}

export function useCreateManufacturingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ManufacturingStatusRef>) =>
      settingsApi.manufacturingStatuses.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingStatuses.all });
    },
  });
}

export function useUpdateManufacturingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ManufacturingStatusRef> }) =>
      settingsApi.manufacturingStatuses.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingStatuses.all });
    },
  });
}

export function useDeleteManufacturingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.manufacturingStatuses.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingStatuses.all });
    },
  });
}

export function useSetDefaultManufacturingStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.manufacturingStatuses.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingStatuses.all });
    },
  });
}

// ===============================
// Purchase Statuses Hooks
// ===============================

export function usePurchaseStatuses() {
  return useQuery({
    queryKey: settingsKeys.purchaseStatuses.list(),
    queryFn: settingsApi.purchaseStatuses.list,
  });
}

export function usePurchaseStatus(id: string) {
  return useQuery({
    queryKey: settingsKeys.purchaseStatuses.detail(id),
    queryFn: () => settingsApi.purchaseStatuses.get(id),
    enabled: !!id,
  });
}

export function useCreatePurchaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PurchaseStatusRef>) =>
      settingsApi.purchaseStatuses.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseStatuses.all });
    },
  });
}

export function useUpdatePurchaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PurchaseStatusRef> }) =>
      settingsApi.purchaseStatuses.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseStatuses.all });
    },
  });
}

export function useDeletePurchaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.purchaseStatuses.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseStatuses.all });
    },
  });
}

export function useSetDefaultPurchaseStatus() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.purchaseStatuses.setDefault(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseStatuses.all });
    },
  });
}

// ===============================
// Manufacturing Problem Reasons Hooks
// ===============================

export function useManufacturingProblemReasons() {
  return useQuery({
    queryKey: settingsKeys.manufacturingProblemReasons.list(),
    queryFn: settingsApi.manufacturingProblemReasons.list,
  });
}

export function useManufacturingProblemReason(id: string) {
  return useQuery({
    queryKey: settingsKeys.manufacturingProblemReasons.detail(id),
    queryFn: () => settingsApi.manufacturingProblemReasons.get(id),
    enabled: !!id,
  });
}

export function useCreateManufacturingProblemReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ManufacturingProblemReason>) =>
      settingsApi.manufacturingProblemReasons.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingProblemReasons.all });
    },
  });
}

export function useUpdateManufacturingProblemReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ManufacturingProblemReason> }) =>
      settingsApi.manufacturingProblemReasons.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingProblemReasons.all });
    },
  });
}

export function useDeleteManufacturingProblemReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.manufacturingProblemReasons.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingProblemReasons.all });
    },
  });
}

// ===============================
// Manufacturing Problem Subreasons Hooks
// ===============================

export function useManufacturingProblemSubreasons(reasonId?: string) {
  return useQuery({
    queryKey: settingsKeys.manufacturingProblemSubreasons.list(reasonId),
    queryFn: () => settingsApi.manufacturingProblemSubreasons.list({ reason: reasonId, page_size: 200 }),
    enabled: !!reasonId,
  });
}

export function useCreateManufacturingProblemSubreason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ManufacturingProblemSubreason>) =>
      settingsApi.manufacturingProblemSubreasons.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingProblemSubreasons.all });
      if (variables.reason) {
        queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingProblemSubreasons.list(String(variables.reason)) });
      }
    },
  });
}

export function useUpdateManufacturingProblemSubreason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ManufacturingProblemSubreason> }) =>
      settingsApi.manufacturingProblemSubreasons.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingProblemSubreasons.all });
    },
  });
}

export function useDeleteManufacturingProblemSubreason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.manufacturingProblemSubreasons.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.manufacturingProblemSubreasons.all });
    },
  });
}

// ===============================
// Purchase Problem Reasons Hooks
// ===============================

export function usePurchaseProblemReasons() {
  return useQuery({
    queryKey: settingsKeys.purchaseProblemReasons.list(),
    queryFn: settingsApi.purchaseProblemReasons.list,
  });
}

// ===============================
// Purchase Problem Subreasons Hooks
// ===============================

export function usePurchaseProblemSubreasons(reasonId?: string) {
  return useQuery({
    queryKey: settingsKeys.purchaseProblemSubreasons.list(reasonId),
    queryFn: () => settingsApi.purchaseProblemSubreasons.list({ reason: reasonId, page_size: 200 }),
    enabled: !!reasonId,
  });
}

export function useCreatePurchaseProblemSubreason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PurchaseProblemSubreason>) =>
      settingsApi.purchaseProblemSubreasons.create(data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseProblemSubreasons.all });
      if (variables.reason) {
        queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseProblemSubreasons.list(String(variables.reason)) });
      }
    },
  });
}

export function useUpdatePurchaseProblemSubreason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PurchaseProblemSubreason> }) =>
      settingsApi.purchaseProblemSubreasons.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseProblemSubreasons.all });
    },
  });
}

export function useDeletePurchaseProblemSubreason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.purchaseProblemSubreasons.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseProblemSubreasons.all });
    },
  });
}

export function usePurchaseProblemReason(id: string) {
  return useQuery({
    queryKey: settingsKeys.purchaseProblemReasons.detail(id),
    queryFn: () => settingsApi.purchaseProblemReasons.get(id),
    enabled: !!id,
  });
}

export function useCreatePurchaseProblemReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<PurchaseProblemReason>) =>
      settingsApi.purchaseProblemReasons.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseProblemReasons.all });
    },
  });
}

export function useUpdatePurchaseProblemReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<PurchaseProblemReason> }) =>
      settingsApi.purchaseProblemReasons.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseProblemReasons.all });
    },
  });
}

export function useDeletePurchaseProblemReason() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.purchaseProblemReasons.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.purchaseProblemReasons.all });
    },
  });
}

// ===============================
// Project Item Problems Hooks
// ===============================

export function useProjectItemProblems(params?: { project_item?: string; is_resolved?: boolean }) {
  return useQuery({
    queryKey: settingsKeys.projectItemProblems.list(params),
    queryFn: () => settingsApi.projectItemProblems.list(params),
  });
}

export function useProjectItemProblem(id: string) {
  return useQuery({
    queryKey: settingsKeys.projectItemProblems.detail(id),
    queryFn: () => settingsApi.projectItemProblems.get(id),
    enabled: !!id,
  });
}

export function useCreateProjectItemProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (data: Partial<ProjectItemProblem>) =>
      settingsApi.projectItemProblems.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.projectItemProblems.all });
    },
  });
}

export function useUpdateProjectItemProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<ProjectItemProblem> }) =>
      settingsApi.projectItemProblems.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.projectItemProblems.all });
    },
  });
}

export function useDeleteProjectItemProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => settingsApi.projectItemProblems.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.projectItemProblems.all });
    },
  });
}

export function useResolveProjectItemProblem() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, resolutionNotes }: { id: string; resolutionNotes?: string }) =>
      settingsApi.projectItemProblems.resolve(id, resolutionNotes),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: settingsKeys.projectItemProblems.all });
    },
  });
}
