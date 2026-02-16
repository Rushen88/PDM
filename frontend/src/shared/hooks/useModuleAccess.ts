import { useQuery } from '@tanstack/react-query';
import { useMemo } from 'react';

import { useAuth } from '../../app/providers/AuthProvider';
import { moduleAccessApi, type ModuleAccessLevel } from '../../features/auth/api';

const ACCESS_RANK: Record<ModuleAccessLevel, number> = {
  none: 0,
  view: 1,
  edit: 2,
  full: 3,
};

const resolveModuleAccess = (moduleCode: string, accessMap: Map<string, ModuleAccessLevel>): ModuleAccessLevel => {
  let current = moduleCode;
  while (current) {
    const level = accessMap.get(current);
    if (level) return level;
    const lastDot = current.lastIndexOf('.');
    if (lastDot === -1) break;
    current = current.slice(0, lastDot);
  }
  return accessMap.get(moduleCode) || 'none';
};

export function useModuleAccess(moduleCode?: string) {
  const { user } = useAuth();
  const isAdmin = user?.is_superuser || user?.user_roles?.some((r) => r.role_detail?.code === 'admin');

  const { data: accessData, isLoading } = useQuery({
    queryKey: ['my-module-access'],
    queryFn: () => moduleAccessApi.getMyAccess(),
    enabled: !!user,
  });

  const accessMap = useMemo(
    () => new Map<string, ModuleAccessLevel>((accessData || []).map((a) => [a.module_code, a.access_level])),
    [accessData]
  );

  const level = useMemo<ModuleAccessLevel>(() => {
    if (!moduleCode) return 'full';
    if (isAdmin) return 'full';
    if (!accessData && isLoading) return 'none';
    return resolveModuleAccess(moduleCode, accessMap);
  }, [accessMap, accessData, isAdmin, isLoading, moduleCode]);

  const canView = ACCESS_RANK[level] >= ACCESS_RANK.view;
  const canEdit = ACCESS_RANK[level] >= ACCESS_RANK.edit;
  const canDelete = ACCESS_RANK[level] >= ACCESS_RANK.full;

  return {
    level,
    canView,
    canEdit,
    canDelete,
    isLoading,
  };
}
