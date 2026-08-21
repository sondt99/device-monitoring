import { useQuery } from '@tanstack/react-query';
import { api } from '../api.js';

export function useMe() {
  const me = useQuery({ queryKey: ['me'], queryFn: api.me, retry: false });
  const user = me.data?.user ?? null;
  return {
    ...me,
    user,
    isAdmin: user?.role === 'admin',
    statusPageEnabled: me.data?.features?.statusPage ?? false
  };
}
